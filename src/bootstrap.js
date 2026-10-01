/**
 * Superpowers session-start bootstrap - a Host plugin for DeepSeek Harness.
 *
 * Upstream Superpowers injects its `using-superpowers` skill into every session
 * with a session-start hook (hooks/session-start). DeepSeek Harness has no hook
 * system. Its durable equivalent is a system-prompt section: it reaches every
 * session of the profile and survives compaction, as the hook's re-injection on
 * compact does.
 *
 * The text is upstream's wrapper around the shipped skill file, with the two DSH
 * naming changes the rest of this package applies: the skill is named without
 * the `superpowers:` prefix, and the tool is `skill`, not `Skill`.
 *
 * Like upstream's hook this is advisory: it tells the agent to check its skills.
 * Enforcement is the separate, opt-in gate row.
 *
 * Every failure degrades to "no bootstrap", never to a failed activation.
 *
 * @module @blugart-dev/dsh-superpowers/bootstrap
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createDiagnostics } from './diagnostics.js';

/** Cordis plugin name used by loader diagnostics. */
export const name = 'superpowers-bootstrap';

/** The prompt section's name; a second registration in one layer is rejected. */
export const SECTION_NAME = 'superpowers-bootstrap';

/**
 * Placement: after the harness's first-party guidance (the persona suffix sits
 * at 10200), so the bootstrap is read late and close to the conversation. Any
 * finite order is accepted for external sections.
 */
const SECTION_ORDER = 9000;

/** The shipped skill, resolved from this module so the bundle has no paths to configure. */
const DEFAULT_SKILL_FILE = fileURLToPath(new URL('../skills/using-superpowers/SKILL.md', import.meta.url));

/**
 * Apply defaults to a row config. `config` is replaced wholesale on override, so
 * every field defaults here and unknown keys are ignored.
 *
 * @param {{ bootstrap?: boolean, subagents?: boolean, skillFile?: string, diagnosticsLog?: string }} [config]
 * @returns {{ bootstrap: boolean, subagents: boolean, skillFile: string, diagnosticsLog: string | undefined }}
 */
export function resolveSettings(config) {
  const raw = config ?? {};
  return {
    bootstrap: raw.bootstrap !== false,
    subagents: raw.subagents === true,
    skillFile: raw.skillFile ?? DEFAULT_SKILL_FILE,
    diagnosticsLog: typeof raw.diagnosticsLog === 'string' ? raw.diagnosticsLog : undefined
  };
}

/**
 * Upstream's session-start wrapper around the skill text.
 *
 * @param {string} skillContent - the full using-superpowers SKILL.md.
 * @returns {string} the section text.
 */
export function bootstrapText(skillContent) {
  return (
    '<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n' +
    "**Below is the full content of your 'using-superpowers' skill - your introduction " +
    "to using skills. For all other skills, use the 'skill' tool:**\n\n" +
    skillContent +
    '\n</EXTREMELY_IMPORTANT>'
  );
}

/**
 * Whether a prompt assembly is for a delegated (subagent) session.
 *
 * Read the way DSH's own `cwd` variable reads its agent:
 * `context.agent.session.header`. An assembly with no agent is treated as
 * top-level, so an unexpected context shape errs toward upstream's behaviour of
 * showing the bootstrap.
 *
 * @param {unknown} context - the assembly context DSH passes to section text.
 * @returns {boolean}
 */
function isSubagentAssembly(context) {
  const header = context?.agent?.session?.header;
  return (header?.delegationDepth ?? 0) > 0 || header?.origin === 'subagent';
}

/**
 * Register the bootstrap section.
 *
 * @param {object} ctx - the plugin context.
 * @param {{ bootstrap?: boolean, skillFile?: string, diagnosticsLog?: string }} [config]
 */
function run(ctx, config) {
  const settings = resolveSettings(config);
  const diag = createDiagnostics(settings.diagnosticsLog, ctx.logger);
  if (!settings.bootstrap) {
    diag('bootstrap disabled by config');
    return;
  }

  // Read once at activation. An unreadable file means no bootstrap at all: an
  // empty or error-text section would tell every session something false.
  let skillContent;
  try {
    skillContent = readFileSync(settings.skillFile, 'utf8');
  } catch (error) {
    diag('not registered: cannot read ' + settings.skillFile + ' (' + describe(error) + ')');
    ctx.logger?.warn?.('dsh-superpowers: bootstrap cannot read ' + settings.skillFile);
    return;
  }

  // Injected (see `apply`), so the service exists by the time this runs. Still
  // read defensively: a missing service must mean "no bootstrap", never a failed
  // activation.
  const systemPrompt = ctx.get('systemPrompt');
  if (typeof systemPrompt?.section !== 'function') {
    diag('not registered: no systemPrompt service on this context');
    return;
  }

  const full = bootstrapText(skillContent);
  try {
    const dispose = systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      // Resolved per assembly. Upstream's SessionStart hook never reaches
      // subagents; a section reaches every agent, so subagents get an empty
      // section (dropped by the renderer) unless `subagents: true`.
      text: (context) => (!settings.subagents && isSubagentAssembly(context) ? '' : full),
      // The renderer throws on unknown {{...}} references, and that throw would
      // fail prompt assembly for every session. Skill text is always literal.
      interpolate: false
    });
    ctx.effect(() => dispose, 'superpowers-bootstrap prompt section');
    diag('registered: ' + skillContent.length + ' chars from ' + settings.skillFile);
  } catch (error) {
    diag('not registered: section() threw (' + describe(error) + ')');
  }
}

/**
 * @param {unknown} error - anything thrown.
 * @returns {string} a short, log-safe description.
 */
function describe(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/**
 * The applier in the shape the installed Host accepts: a function carrying
 * `inject`.
 *
 * `systemPrompt` must be injected, not merely fetched: with `inject: []` the Host
 * activated the plugin before the system-prompt service existed and nothing was
 * registered (observed live on DSH 0.2.0-rc.2). Injecting it makes cordis hold
 * activation until the service is available.
 */
const apply = Object.assign(run, { inject: ['systemPrompt'] });

export default apply;
