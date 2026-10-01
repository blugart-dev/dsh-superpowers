/**
 * Pure, I/O-free helpers for the Superpowers workflow gate.
 *
 * Everything here is deliberately dependency-free and side-effect-free so it can
 * be unit-tested without a live Harness. The plugin's gate decision must be
 * provably correct before it is allowed to deny a single tool call.
 *
 * @module @blugart-dev/dsh-superpowers/gate/policy
 */

/**
 * Tools whose whole purpose is to mutate a file's contents. These are the only
 * subject of the gate. Shell tools are deliberately excluded: `pwsh` can write
 * files, but it can also run a test, a build, or a read, and classifying an
 * arbitrary command line needs a parser this increment does not have.
 */
export const GATED_TOOLS = ['write', 'edit'];

/**
 * Default path prefixes exempt from the gate.
 *
 * Scope rule from the design: the workflow's own artifacts must stay writable,
 * or the agent cannot write the very plan and spec that precede the code. These
 * are conventions, not requirements, so the list is configurable.
 */
export const DEFAULT_ARTIFACT_PREFIXES = [
  'docs/superpowers/plans/',
  'docs/superpowers/specs/',
  'research/',
  'notes/'
];

/**
 * Normalize a caller-supplied path to a forward-slash, case-folded form on
 * Windows so the allowlist compares on one spelling.
 *
 * @param {unknown} rawPath - the tool argument.
 * @returns {string | undefined} normalized path, or undefined when unusable.
 */
export function normalizePath(rawPath) {
  if (typeof rawPath !== 'string') return undefined;
  const trimmed = rawPath.trim();
  if (trimmed.length === 0) return undefined;
  const unified = trimmed.replace(/\\/g, '/');
  return process.platform === 'win32' ? unified.toLowerCase() : unified;
}

/**
 * Decide whether a path sits under one of the exempt artifact prefixes.
 *
 * Matching is done on normalized path *segments* rather than a raw substring so
 * that a directory merely named like an artifact (for example
 * `src/docs/superpowers/plans/thing.ts`) does not silently escape the gate in a
 * way a reader would not predict. A prefix matches when it appears at the start
 * of the path or immediately after a `/`.
 *
 * @param {unknown} rawPath - the tool's file_path argument.
 * @param {readonly string[]} prefixes - exempt prefixes, already normalized.
 * @returns {boolean} true when the path is exempt from the gate.
 */
export function isArtifactPath(rawPath, prefixes) {
  const path = normalizePath(rawPath);
  if (path === undefined) return false;
  for (const prefix of prefixes) {
    if (path.startsWith(prefix)) return true;
    if (path.includes('/' + prefix)) return true;
  }
  return false;
}

/**
 * Extract the target file path from a tool call's arguments.
 *
 * The arguments arrive as the model's raw JSON string, so parsing is allowed to
 * fail: an unparseable call is treated as having no path, which makes the gate
 * deny it rather than crash the dispatch pipeline.
 *
 * @param {unknown} rawArguments - `tool/call` data.arguments, or an object.
 * @returns {string | undefined} the file_path argument when present.
 */
export function extractFilePath(rawArguments) {
  let parsed = rawArguments;
  if (typeof rawArguments === 'string') {
    try {
      parsed = JSON.parse(rawArguments);
    } catch {
      return undefined;
    }
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;
  const candidate = /** @type {{ file_path?: unknown }} */ (parsed).file_path;
  return typeof candidate === 'string' ? candidate : undefined;
}

/**
 * Build the guard message for a denied call.
 *
 * This is the load-bearing anti-soft-lock artifact: it must name the exact skill
 * to load and the exact way to load it, without requiring the reader to already
 * know anything about the plugin.
 *
 * @param {object} input - denial context.
 * @param {string} input.toolName - the denied tool.
 * @param {string | undefined} input.filePath - its target path.
 * @param {string} input.skillName - the registered skill that clears the gate.
 * @param {boolean} input.selfRegistered - whether that skill comes from this plugin.
 * @returns {string} the denial reason returned from the guard.
 */
export function denialMessage({ toolName, filePath, skillName, selfRegistered }) {
  const target = filePath === undefined ? '(unresolved path)' : filePath;
  const lines = [
    `Superpowers workflow gate: "${toolName}" on ${target} is blocked until this session has loaded a skill.`,
    '',
    `Do this now: call the \`skill\` tool with {"name": "${skillName}"}, then retry the write.`,
    'That call is the only thing that clears the gate for the rest of this session.'
  ];
  if (selfRegistered) {
    lines.push(
      '',
      `Note: "${skillName}" is the gate's own recovery document. It is registered by the`,
      'dsh-superpowers gate itself, not discovered from the methodology skills.',
      'Loading it clears the gate; it does not replace the skill that applies to your task.'
    );
  }
  lines.push(
    '',
    'If you cannot load a skill, stop and tell the user - do not try to work around this gate.',
    'Exempt without a skill: plans, specs, research notes (see the artifactPrefixes config).',
    'A user can also turn the gate off with the plugin config flag `gate: false`.'
  );
  return lines.join('\n');
}

/**
 * Resolve whether the gate may run at all, given what could be verified about
 * the escape hatch.
 *
 * This is the anti-soft-lock interlock, and it fails OPEN on purpose. A gate is
 * only safe to arm when the session can actually clear it. If the configured
 * skill cannot be resolved through `ctx.skills` - the provider is missing, the
 * plugin is misconfigured, or the name is wrong - then arming the gate would
 * wall the session off from its own source files with no documented way out.
 * Refusing to arm is strictly safer than locking the session, so the gate stays
 * off and says why.
 *
 * Note the asymmetry with `decide`, which fails CLOSED on unreadable state. That
 * is not a contradiction: `decide` fails closed on *per-call* uncertainty it can
 * see, while this fails open on *configuration* uncertainty that would disable
 * the session entirely.
 *
 * @param {object} input - interlock inputs.
 * @param {boolean} input.gateRequested - the `gate` config flag.
 * @param {boolean} input.escapeHatchEnabled - the `escapeSkill.enabled` flag.
 * @param {boolean} input.escapeHatchResolved - whether ctx.skills resolved it.
 * @returns {{ armed: boolean, reason: string }} the arming decision.
 */
export function resolveArming({ gateRequested, escapeHatchEnabled, escapeHatchResolved }) {
  if (!gateRequested) {
    return { armed: false, reason: 'gate disabled by config (gate: false)' };
  }
  if (!escapeHatchEnabled) {
    return {
      armed: false,
      reason:
        'gate disabled: escapeSkill.enabled is false, so no documented recovery path would exist'
    };
  }
  if (!escapeHatchResolved) {
    return {
      armed: false,
      reason:
        'gate disabled: the escape-hatch skill did not resolve through ctx.skills, so a blocked ' +
        'session would have no way to recover'
    };
  }
  return { armed: true, reason: 'armed: gate on, escape hatch resolved' };
}

/**
 * The single decision the gate makes. Pure: given the same inputs it always
 * returns the same verdict, so it can be exhaustively tested.
 *
 * @param {object} input - decision inputs.
 * @param {string} input.toolName - the tool being dispatched.
 * @param {unknown} input.rawArguments - its raw arguments.
 * @param {boolean} input.gateEnabled - the `gate` config flag.
 * @param {boolean} input.skillLoaded - whether the session log shows a loaded skill.
 * @param {readonly string[]} input.artifactPrefixes - normalized exempt prefixes.
 * @param {boolean} input.artifactsWritable - whether artifacts are exempt at all.
 * @param {string} input.skillName - the skill the denial message should name.
 * @param {boolean} input.selfRegistered - disclose plugin-registered provenance.
 * @returns {{ allowed: true } | { allowed: false, message: string }} the verdict.
 */
export function decide(input) {
  const { toolName, rawArguments, gateEnabled, skillLoaded, artifactPrefixes, artifactsWritable } = input;

  if (!gateEnabled) return { allowed: true };
  if (!GATED_TOOLS.includes(toolName)) return { allowed: true };

  const filePath = extractFilePath(rawArguments);
  if (artifactsWritable && isArtifactPath(filePath, artifactPrefixes)) return { allowed: true };
  if (skillLoaded) return { allowed: true };

  return {
    allowed: false,
    message: denialMessage({
      toolName,
      filePath,
      skillName: input.skillName,
      selfRegistered: input.selfRegistered
    })
  };
}
