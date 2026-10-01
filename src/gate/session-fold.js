/**
 * Derive "has this session loaded a skill?" from the session log.
 *
 * The session log is the only source of truth (DSH plugin practices, principle
 * 1); plugin memory is a derived cache. This module therefore does two things
 * and nothing else:
 *
 *   - `foldSkillLoads` is a pure replay over committed events, so a resumed or
 *     forked session derives its state by replaying its own log rather than by
 *     trusting anything the plugin remembered.
 *   - `SkillLoadCache` is the derived cache, and it is invalidated from
 *     `session/event` rather than being allowed to drift.
 *
 * A skill load is *not* read from prompt text. The catalog reaches the model as a
 * durable message rendered by `dsh-tool-skill`, so the only trustworthy evidence
 * is the `skill` tool call and its outcome.
 *
 * @module @blugart-dev/dsh-superpowers/gate/session-fold
 */

/** The tool that loads a skill. */
const SKILL_TOOL = 'skill';

/**
 * @typedef {object} SkillLoadState
 * @property {boolean} skillsLoaded - true once a skill load has succeeded.
 * @property {string | undefined} loadedSkill - the name of the first skill loaded.
 * @property {string[]} loadedSkills - every successfully loaded skill, once, in order.
 * @property {Record<string, string>} pending - skill names awaiting their result.
 */

/**
 * @returns {SkillLoadState} a fresh, plain-JSON fold state.
 */
export function initSkillLoadState() {
  return { skillsLoaded: false, loadedSkill: undefined, loadedSkills: [], pending: {} };
}

/**
 * Replay one committed session event into the fold state.
 *
 * Pure and synchronous, and returns the *same* state reference when the event is
 * irrelevant, so an unchanged fold costs nothing to compare downstream.
 *
 * The failure check is deliberately `message.isError`, verified against a real
 * log: a denied tool call is committed as a normal `tool/result` with no
 * `data.error` field at all, so keying on `data.error` would make this fold
 * report an *empty* catalog as a successful skill load.
 *
 * @param {SkillLoadState} state - current fold state (not mutated).
 * @param {unknown} event - one committed session event.
 * @returns {SkillLoadState} the next state, or the same reference if unchanged.
 */
export function foldSkillLoads(state, event) {
  if (event === null || typeof event !== 'object') return state;
  const type = /** @type {{ type?: unknown }} */ (event).type;
  const data = /** @type {{ data?: any }} */ (event).data;
  if (data === null || typeof data !== 'object') return state;

  if (type === 'tool/call') {
    if (data.name !== SKILL_TOOL) return state;
    const callId = data.callId;
    if (typeof callId !== 'string') return state;
    const name = skillNameArgument(data.arguments);
    if (name === undefined) return state;
    return { ...state, pending: { ...state.pending, [callId]: name } };
  }

  if (type === 'tool/result') {
    const message = data.message;
    if (message === null || typeof message !== 'object') return state;
    const callId = message.toolCallId;
    if (typeof callId !== 'string') return state;
    const requested = state.pending[callId];
    if (requested === undefined) return state;

    const pending = { ...state.pending };
    delete pending[callId];

    // A failed load must not clear the gate. Verified real shape: a rejected
    // `skill` call commits `message.isError === true` and no `data.error`.
    if (message.isError === true) return { ...state, pending };

    const loadedSkill = state.loadedSkill ?? requested;
    const previous = state.loadedSkills ?? [];
    const loadedSkills = previous.includes(requested) ? previous : [...previous, requested];
    return { ...state, skillsLoaded: true, loadedSkill, loadedSkills, pending };
  }

  return state;
}

/**
 * Replay a whole event batch.
 *
 * @param {SkillLoadState} state - starting state.
 * @param {readonly unknown[]} events - committed events in log order.
 * @returns {SkillLoadState} the folded state.
 */
export function foldEvents(state, events) {
  let next = state;
  for (const event of events) next = foldSkillLoads(next, event);
  return next;
}

/**
 * Read the skill name out of a `skill` call's arguments.
 *
 * `tool/call.data.arguments` is the model's raw JSON string. An unparseable or
 * malformed call yields no name and is therefore ignored rather than crashing
 * the fold.
 *
 * @param {unknown} rawArguments - raw arguments from the event.
 * @returns {string | undefined} the requested skill name.
 */
export function skillNameArgument(rawArguments) {
  let parsed = rawArguments;
  if (typeof rawArguments === 'string') {
    try {
      parsed = JSON.parse(rawArguments);
    } catch {
      return undefined;
    }
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const name = /** @type {{ name?: unknown }} */ (parsed).name;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

/**
 * Whether a folded state means "this session may write".
 *
 * Fails closed: an absent or unreadable state is *not* a pass. The caller is
 * responsible for supplying a state that was actually derived from the log.
 *
 * @param {SkillLoadState | undefined} state - folded state, if any.
 * @returns {boolean} true when a skill load has been observed.
 */
export function isSkillLoaded(state) {
  return state !== undefined && state.skillsLoaded === true;
}

/**
 * Whether a folded state clears the gate under a `requiredSkills` policy.
 *
 * An empty list keeps the original rule: any loaded skill clears it. A non-empty
 * list narrows it to those skills. The escape hatch always clears it, so a
 * configured gate can never leave a session with no way forward.
 *
 * @param {SkillLoadState | undefined} state - folded state, if any.
 * @param {readonly string[]} requiredSkills - skills that clear the gate; empty = any.
 * @param {string} escapeSkillName - the gate's own recovery skill.
 * @returns {boolean} true when this session may write.
 */
export function satisfiesGate(state, requiredSkills, escapeSkillName) {
  if (!isSkillLoaded(state)) return false;
  if (requiredSkills.length === 0) return true;
  const loaded = state.loadedSkills ?? [];
  return loaded.includes(escapeSkillName) || loaded.some((name) => requiredSkills.includes(name));
}

/**
 * A derived cache of the session-log fold, keyed weakly by session so a
 * collected session frees its entry.
 *
 * Correctness rule: the fold for a session is computed exactly once from the
 * events present at first read, and every later read extends it from the exact
 * index it stopped at. Events are only ever appended, so that prefix never
 * changes underneath the cache.
 */
export class SkillLoadCache {
  /** @type {WeakMap<object, { state: SkillLoadState, index: number }>} */
  #entries = new WeakMap();

  /**
   * Return the fold state for a session, extending the cache with any events
   * appended since the last read.
   *
   * @param {object} session - the live Session.
   * @returns {SkillLoadState} the current fold state.
   */
  stateFor(session) {
    const events = readEvents(session);
    let entry = this.#entries.get(session);
    if (entry === undefined || entry.index > events.length) {
      entry = { state: initSkillLoadState(), index: 0 };
    }
    if (entry.index === events.length) return entry.state;
    const state = foldEvents(entry.state, events.slice(entry.index));
    this.#entries.set(session, { state, index: events.length });
    return state;
  }

  /** Drop a session's cached state. */
  forget(session) {
    this.#entries.delete(session);
  }

  /** Drop every cached state (HMR / disposal safety). */
  clear() {
    this.#entries = new WeakMap();
  }
}

/**
 * Read a session's FULL committed log, including any fork-inherited prefix.
 *
 * `snapshotEvents(0)` is the correct call and `ownEvents()` is NOT a substitute.
 * This distinction was measured, not assumed: a forked session was denied a
 * non-exempt write even though its parent had a successful skill load, because
 * an earlier version of this function preferred `ownEvents()`.
 *
 * The Session API distinguishes them deliberately:
 *   - `ownEvents()` returns only the events this session OWNS, excluding the
 *     prefix inherited from its parent.
 *   - `snapshotEvents(fromSeq)` returns the log from `fromSeq`, so starting at 0
 *     includes the inherited prefix.
 *
 * Derived state must come from the full log or fork and resume lose everything
 * the parent established. `ownEvents()` remains the last-resort fallback for a
 * session shape that exposes no `snapshotEvents`, but it is a degraded read and
 * is documented as such.
 *
 * @param {object} session - the live Session.
 * @returns {readonly unknown[]} committed events, or an empty array when the
 *   session does not expose a readable log (fail closed upstream).
 */
function readEvents(session) {
  if (session === null || typeof session !== 'object') return [];
  const candidate = /** @type {{ ownEvents?: unknown, snapshotEvents?: unknown }} */ (session);
  try {
    if (typeof candidate.snapshotEvents === 'function') {
      const events = candidate.snapshotEvents.call(session, 0);
      if (Array.isArray(events)) return events;
    }
    // Degraded fallback: loses a fork's inherited prefix, so a forked session
    // reads as skill-less. Kept only so an unexpected session shape still
    // yields a usable array rather than throwing.
    if (typeof candidate.ownEvents === 'function') {
      const events = candidate.ownEvents();
      if (Array.isArray(events)) return events;
    }
  } catch {
    return [];
  }
  return [];
}
