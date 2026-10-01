/**
 * Superpowers workflow gate - a Host plugin for DeepSeek Harness.
 *
 * Enforces one rule: a session may not `write` or `edit` a workspace source file
 * until it has loaded a skill through the `skill` tool. Everything the workflow
 * needs to think with stays writable; only the code waits.
 *
 * Measured motivation (research/superpowers-behavioural-test-results.md): the 15
 * vendored Superpowers skills route reliably and do not over-trigger, but the
 * bootstrap is plain text in `AGENTS.md`. Text is weighed, not obeyed. This
 * plugin replaces the advisory first step with a guard the harness enforces.
 *
 * Design commitments, each load-bearing:
 *
 * 1. **Disabled by default.** The bundle's patch row carries `disabled: true`
 *    *and* the Config defaults to `gate: false`, so installing the bundle alone
 *    changes no behaviour. Enabling it is a separate, deliberate act.
 * 2. **No soft-lock.** The gate refuses to arm unless its escape-hatch skill
 *    actually resolves through `ctx.skills` (see `resolveArming`). A gate the
 *    session cannot clear is never installed.
 * 3. **State derives from the session log.** "Has this session loaded a skill?"
 *    is folded from committed `tool/call` and `tool/result` events, never from
 *    prompt text and never from plugin memory alone. A fork or resume derives
 *    the answer by replaying its own log.
 * 4. **It is a gate, not a supervisor.** The guard is synchronous and can only
 *    deny; it never rewrites a call or inspects intent.
 *
 * @module @blugart-dev/dsh-superpowers/gate
 */

import { DEFAULT_ARTIFACT_PREFIXES, decide, normalizePath, resolveArming } from './policy.js';
import { SkillLoadCache, isSkillLoaded } from './session-fold.js';
import {
  ESCAPE_SKILL_CONTENT,
  ESCAPE_SKILL_DESCRIPTION,
  ESCAPE_SKILL_NAME
} from './escape-skill.js';
import { createDiagnostics } from '../diagnostics.js';

/** Cordis plugin name used by loader diagnostics. */
export const name = 'superpowers-gate';

/**
 * Placement for the prompt section. The service rejects only non-finite orders
 * and duplicate names within one layer, so this only needs to be a finite number
 * distinct from the harness's own sections; it is not load-bearing.
 *
 * Declared here, above its use, and NOT at the bottom of the file where it
 * started. `run` is invoked as the applier, so it executes before a module-level
 * `const` declared below it is initialized: referencing that constant from
 * inside `run` throws a temporal-dead-zone ReferenceError during activation.
 * That was latent while the section never registered; fixing the ordering below
 * is what makes it reachable.
 */
const PROMPT_SECTION_ORDER = 500;

/**
 * Row config shape, documented rather than schema-validated.
 *
 * This bundle intentionally imports nothing outside its own directory. A Host
 * plugin hosted by a bundle in the profile could use `@deepseek-ai/schemastery`,
 * but this plugin lives in the workspace, and the installed Host resolves
 * `@deepseek-ai/*` from inside `app.asar`, which a workspace module cannot
 * reach - importing it fails activation outright. Every value below is
 * therefore defaulted in `resolveSettings` instead.
 *
 * @typedef {object} GateConfig
 * @property {boolean} [gate] master switch; default false.
 * @property {boolean} [artifactsWritable] exempt the workflow's own artifacts.
 * @property {string[]} [artifactPrefixes] exempt path prefixes.
 * @property {{ enabled?: boolean, name?: string }} [escapeSkill] the recovery skill.
 * @property {boolean} [announceInPrompt] publish a durable prompt section.
 * @property {boolean} [verbose] log the arming decision and every denial.
 * @property {string} [diagnosticsLog] absolute path for an activation log; off by default.
 */

/**
 * Apply defaults to a row config.
 *
 * Unknown keys are ignored rather than rejected: the loader replaces `config`
 * wholesale on an override, and a hard failure on an unexpected key would turn
 * a typo into a failed activation.
 *
 * @param {GateConfig} [config] - raw row config.
 * @returns {object} fully defaulted settings.
 */
function resolveSettings(config) {
  const raw = config ?? {};
  const escapeSkill = raw.escapeSkill ?? {};
  return {
    gate: raw.gate === true,
    artifactsWritable: raw.artifactsWritable !== false,
    artifactPrefixes: (raw.artifactPrefixes ?? DEFAULT_ARTIFACT_PREFIXES)
      .map((prefix) => normalizePath(prefix))
      .filter((prefix) => prefix !== undefined),
    escapeSkill: {
      enabled: escapeSkill.enabled !== false,
      name: escapeSkill.name ?? ESCAPE_SKILL_NAME
    },
    announceInPrompt: raw.announceInPrompt !== false,
    verbose: raw.verbose === true,
    diagnosticsLog: typeof raw.diagnosticsLog === 'string' ? raw.diagnosticsLog : undefined
  };
}

/**
 * Register the gate.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - the plugin context.
 * @param {GateConfig} [config] - row config.
 */
function run(ctx, config) {
  const settings = resolveSettings(config);
  const diag = createDiagnostics(settings.diagnosticsLog, ctx.logger);
  diag('run() entered; gate=' + settings.gate + ' escapeSkill=' + settings.escapeSkill.name);

  const cache = new SkillLoadCache();
  let armed = false;
  let armingReason = 'not yet evaluated';
  /** @type {unknown} */
  let registrationError;

  // The derived cache must not outlive the plugin.
  ctx.effect(() => () => cache.clear(), 'superpowers-gate cache teardown');

  /**
   * Register the escape-hatch skill on the plugin's OWN context, then verify it.
   *
   * Registering inside the `ctx.inject(['skills'], ...)` callback failed with
   * "cannot create effect on inactive context": that callback's context is not
   * active at registration time, and `ctx.skills.register` is itself an effect.
   * The plugin's own context is active for the whole of the applier, so the
   * registration belongs here.
   */
  const skills = ctx.get('skills');
  diag('ctx.get("skills")=' + typeof skills + ' register=' + typeof skills?.register);
  if (skills !== undefined && typeof skills.register === 'function') {
    const definition = {
      name: settings.escapeSkill.name,
      description: ESCAPE_SKILL_DESCRIPTION,
      content: ESCAPE_SKILL_CONTENT,
      // `source` and `provider` must both be strings: the registry's
      // `runtimeCandidate()` carries them onto the candidate and
      // `validateDefinition()` requires them when the skill is resolved.
      source: 'runtime',
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'dsh-superpowers-gate'
    };
    try {
      const disposer = skills.register(definition);
      diag('skills.register OK for ' + settings.escapeSkill.name + ' disposer=' + typeof disposer);
    } catch (error) {
      registrationError = error;
      diag('skills.register THREW: ' + describe(error));
    }
  } else {
    registrationError = new Error('no skill registry is available on this context');
    diag('no skill registry available');
  }

  // Verify the recovery path before arming. This is asynchronous, so the gate
  // stays shut until it answers; a slow answer means a briefly inert gate,
  // never a wedged session. `resolveArming` refuses to arm a gate whose escape
  // hatch did not resolve, which is the anti-soft-lock interlock.
  void resolveEscapeHatch(skills, settings.escapeSkill.name, registrationError)
    .then(({ resolved, failure }) => {
      const decision = resolveArming({
        gateRequested: settings.gate,
        escapeHatchEnabled: settings.escapeSkill.enabled,
        escapeHatchResolved: resolved
      });
      armed = decision.armed;
      armingReason =
        failure === undefined ? decision.reason : `${decision.reason} (${describe(failure)})`;
      note(settings, `superpowers-gate: ${armingReason}`);
      diag('arming: resolved=' + resolved + ' -> ' + armingReason);
      if (settings.gate && !decision.armed) {
        warn(settings, `superpowers-gate: ${armingReason}`);
      }
      // The ONLY correct place to publish the announcement: `armed` is written
      // on the line above, so this is the earliest point at which it is true.
      publishPromptSection();
    })
    .catch((error) => {
      armed = false;
      armingReason = `gate disabled: escape-hatch verification failed (${describe(error)})`;
      warn(settings, armingReason);
      diag('arming failed: ' + describe(error));
    });

  // The guard itself. Synchronous by contract: it returns a reason string to
  // deny, or undefined to allow. No later listener can undo a denial, so this is
  // the monotonic enforcement point the plugin needs.
  ctx.tools.guard((execution) => {
    if (!armed) return undefined;

    // Read the session through the same path the reference fs-observation-policy
    // plugin uses. A call with no derivable session (a direct tool call outside
    // an agent) has no log to consult, so the gate leaves it alone rather than
    // denying on absent state.
    const session = execution.agent?.session;
    if (session === undefined) return undefined;

    const verdict = decide({
      toolName: execution.name,
      rawArguments: execution.arguments,
      gateEnabled: true,
      skillLoaded: isSkillLoaded(cache.stateFor(session)),
      artifactPrefixes: settings.artifactPrefixes,
      artifactsWritable: settings.artifactsWritable,
      skillName: settings.escapeSkill.name,
      selfRegistered: true
    });

    if (verdict.allowed) return undefined;
    note(settings, `superpowers-gate: denied ${execution.name}`);
    return verdict.message;
  });

  // Add prompt text the durable way. `system-prompt/assemble` is an expert
  // waterfall over other plugins' contributions and is explicitly not for
  // adding text; a registered section survives compaction as a surface node.
  //
  // The service is fetched with `ctx.get` rather than read as `ctx.systemPrompt`:
  // only injected services may be read as properties, and `systemPrompt` is
  // optional here so a profile without it still loads the gate.
  //
  // This MUST wait for the arming decision, and that is not a detail: arming is
  // asynchronous while this point in `run` is synchronous, so registering the
  // section here would read `armed` before the verification promise could ever
  // have written it. `announceInPrompt` was a dead config flag for exactly that
  // reason - the section was gated on a flag that was still false, always, and
  // an armed session learned the gate existed only by being denied a write.
  // The section is only added when the gate is armed: a disabled gate must be
  // inert, and adding prompt text is itself a behaviour change.
  const systemPrompt = ctx.get('systemPrompt');

  /**
   * Register the durable prompt section, once arming has actually been decided.
   *
   * A failure here must never break activation, and it is recorded rather than
   * swallowed: the gate still denies correctly without its announcement, so the
   * loss is discoverability, not safety.
   */
  function publishPromptSection() {
    if (!armed || !settings.announceInPrompt) return;
    if (typeof systemPrompt?.section !== 'function') {
      diag('prompt section not registered: no systemPrompt service');
      return;
    }
    try {
      const disposeSection = systemPrompt.section({
        name: 'superpowers-gate',
        order: PROMPT_SECTION_ORDER,
        text: promptText(settings)
      });
      ctx.effect(() => disposeSection, 'superpowers-gate prompt section');
      // The diagnostic that would have caught this bug in the first place: it
      // distinguishes "armed and announcing" from "armed and silent".
      diag('public prompt section registered');
    } catch (error) {
      diag('prompt section registration threw: ' + describe(error));
      warn(settings, 'superpowers-gate: prompt section not registered (' + describe(error) + ')');
    }
  }
}

/**
 * Ask the skill registry to resolve the escape hatch, after reporting whether
 * its registration threw.
 *
 * `registry.get` is the same call the `skill` tool's own `execute` makes, so a
 * success here means the tool would succeed too. That equivalence is the whole
 * point of verifying rather than assuming.
 *
 * The registry is passed in rather than read from `ctx.skills`: `skills` is not
 * in this plugin's `inject` list, and cordis throws on reading an uninjected
 * service property ("cannot get property \"skills\" without inject"). It is
 * obtained once with `ctx.get`, which needs no injection.
 *
 * @param {object | undefined} registry - the skill registry, if reachable.
 * @param {string} skillName - the skill to resolve.
 * @param {unknown} registrationError - a throw from `registry.register`, if any.
 * @returns {Promise<{ resolved: boolean, failure: unknown }>} the verification.
 */
async function resolveEscapeHatch(registry, skillName, registrationError) {
  if (registrationError !== undefined) return { resolved: false, failure: registrationError };
  if (registry === undefined || typeof registry.get !== 'function') {
    return { resolved: false, failure: new Error('the skill registry has no get() method') };
  }
  const found = await registry.get(skillName);
  return { resolved: found !== undefined && found !== null, failure: undefined };
}

/**
 * The durable prompt section.
 *
 * Kept short on purpose: it states the rule and the recovery, and defers the
 * methodology itself to the skills so this plugin does not become a second,
 * competing source of process instructions.
 *
 * @param {object} settings - resolved config.
 * @returns {string} the section text.
 */
function promptText(settings) {
  return [
    '## Superpowers workflow gate',
    '',
    'This session enforces the Superpowers workflow. Until you load a skill with the',
    `\`skill\` tool, \`write\` and \`edit\` calls to workspace source files are denied.`,
    '',
    `To clear it: call the \`skill\` tool with {"name": "${settings.escapeSkill.name}"}, then retry.`,
    'Plans, specs and research notes stay writable while the gate is closed, so you can',
    'always write the plan that precedes the code.',
    '',
    'Do not route around a denial with a shell command. If a denial seems wrong, say so.'
  ].join('\n');
}

/**
 * @param {unknown} error - anything thrown.
 * @returns {string} a short, log-safe description.
 */
function describe(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * @param {object} settings - resolved config.
 * @param {string} message - the line to emit.
 */
function note(settings, message) {
  if (settings.verbose) console.log(message);
}

/**
 * Always worth surfacing: an inert gate is a silent failure of the user's intent.
 *
 * @param {object} settings - resolved config.
 * @param {string} message - the warning.
 */
function warn(settings, message) {
  console.warn(message);
}

/**
 * The plugin, with `inject` attached to the callback itself.
 *
 * This shape is load-bearing and was verified against the installed harness.
 * Cordis documents the contract as
 * `Object.assign((ctx) => {...}, { inject: ['service'] })`, and its Fiber runs
 * the applier as a constructor (`new callback(ctx, config)`). Exporting `inject`
 * as a *sibling* named export - the form `references/host-plugin.md` shows -
 * leaves the service unreachable and the plugin fails to activate with
 * "cannot get property \"tools\" without inject".
 *
 * `tools` is required: it is the service being guarded. `skills` is read through
 * `ctx.get` inside the callback, so a profile with no skill registry still loads
 * this plugin - with the gate off - instead of failing outright.
 */
const apply = Object.assign(run, { inject: ['tools'] });

export default apply;

export { decide, isSkillLoaded, normalizePath, resolveArming, resolveSettings, SkillLoadCache };
