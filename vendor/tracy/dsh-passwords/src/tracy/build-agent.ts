/**
 * The creation workspace's build chat (TracyHQ/tracy#602): which sessions it is, and the tools it
 * may call. Pure: the seat door (`native-session.ts`) mints the only IDs that carry the prefix,
 * and the seat tool guard (`seat-tool-guard.ts`) applies the refusal at every tool dispatch.
 *
 * WHY A FENCE AND NOT ONLY A PRESET. A preset lists the tools it brings, but Tracy's own bundle
 * registers tools for EVERY session (`tracy_site`, `tracy_guide`, the build tools); in the
 * creation workspace there is no site behind them. And a blank session's preset can be switched
 * from the browser. So the grant is tied to the session the door minted: whatever preset it runs,
 * a build session dispatches only the tools named below.
 */

/** The preset the door allows for a build session (`buildAgent` in Tracy's `config/mode-matrix.json`). */
export const BUILD_AGENT_PRESET = 'site-builder';

/** The ID prefix only the signed door mints for the build chat; the browser cannot choose an ID. */
const BUILD_SESSION = /^session-build-/i;

/**
 * The tools a build session may call. Research (`web_search`, `web_fetch`) and questions with
 * buttons (`ask_user_question`), from the preset's own rows. EXTENSION POINT: the template
 * choice, plan and build tools join this list in the tickets that add them (TracyHQ/tracy#603 to
 * #610 and Part 3); a tool missing here is refused, never silently granted.
 */
export const BUILD_AGENT_TOOLS: ReadonlySet<string> = new Set(['web_search', 'web_fetch', 'ask_user_question']);

interface AgentLike {
  id?: unknown;
  session?: { header?: { agentPreset?: unknown; parentSession?: unknown } };
}

/** Whether this agent belongs to a build session: its own ID, its parent's, or the build preset. */
export function isBuildAgent(agent: AgentLike | undefined): boolean {
  if (agent === undefined) return false;
  const header = agent.session?.header;
  return (typeof agent.id === 'string' && BUILD_SESSION.test(agent.id)) ||
    (typeof header?.parentSession === 'string' && BUILD_SESSION.test(header.parentSession)) ||
    header?.agentPreset === BUILD_AGENT_PRESET;
}

/** The text the model reads when it calls a tool the build chat does not grant. */
const REFUSAL = 'This tool is not available while building a site in the chat.';

/** A refusal for a tool outside the build grant, or undefined when the call may go on to the next check. */
export function buildToolRefusal(agent: AgentLike | undefined, name: string): string | undefined {
  if (!isBuildAgent(agent)) return undefined;
  return BUILD_AGENT_TOOLS.has(name) ? undefined : REFUSAL;
}

interface MaskableAgent extends AgentLike {
  ctx?: { tools?: { restrict?(filter: { deny: string[] }): () => void } };
}

/**
 * A courtesy on top of the guard: a build agent is not shown the tools it may not call, so the
 * model does not spend steps on them. dsh refuses a mask that names a tool registered in the
 * agent's own scope (the preset's), so a refused mask is retried tool by tool; a tool that still
 * cannot be masked stays visible, and the guard refuses its call.
 * @param schemas - the tools this agent sees now (`ctx.tools.schemas(agent)` in dsh)
 */
export function hideNonBuildTools(agent: MaskableAgent, schemas: (agent: MaskableAgent) => readonly { name: string }[]): void {
  const restrict = agent.ctx?.tools?.restrict;
  if (!isBuildAgent(agent) || typeof restrict !== 'function') return;
  const deny = schemas(agent).map((tool) => tool.name).filter((name) => !BUILD_AGENT_TOOLS.has(name));
  if (deny.length === 0) return;
  const mask = (names: string[]) => restrict.call(agent.ctx!.tools, { deny: names });
  try {
    mask(deny);
  } catch {
    for (const name of deny) {
      try { mask([name]); } catch { /* registered in the agent's own scope: the guard still refuses it */ }
    }
  }
}
