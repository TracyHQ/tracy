/**
 * Tools a site conversation is sent only once the road that uses them starts.
 *
 * WHY. dsh sends every tool's schema on every step, and the tools array is ~60% of a step's prompt.
 * Across 341 bench turns on the local stand (cp4k + cp5k + flow D, 30/09–05/10/2026) the model never
 * called `tracy_brand`, the three design tools or the WordPress/Joomla build tools while editing a
 * site; they are the tools of one road — a redesign or a new build from a design inspiration — which
 * the `tracy-design-inspiration` skill leads. Sent from the first step they cost ~7.8k characters on a
 * WordPress step (~2k tokens), re-read on every step of every conversation.
 *
 * HOW, WITH dsh's OWN MECHANISM. The `agent/created` listener (`index.ts`) adds one per-agent
 * restriction per deferred tool, like the platform mask; lifting it (the restriction's own disposer)
 * puts the tool back in the agent's view, and dsh's agent loop reads the view at the NEXT step's
 * assembly: the header gains the tool and a `tool-addition` developer message records where
 * (`agent-loop/src/agent.ts`). On a route that declares `toolUpdate: addition-only` (the DeepSeek
 * route, `llm-deepseek` model row) the adapter sends the new tool `defer_loading` with a
 * `tool_addition` block at that point, so the prefix already cached stays byte-identical; on a route
 * without it the tool is still sent from that step on, only that one step starts a new cache series.
 *
 * 🔒 THE TRIGGERS ARE DETERMINISTIC AND FIRE BEFORE THE STEP THAT NEEDS THE TOOL:
 * - the `tracy-design-inspiration` skill loaded (`tools/result` of `skill`), or named by `/name` —
 *   every deferred tool;
 * - a tool answer that names a deferred tool (a refusal's `next`, the skill's own body) — that tool;
 * - a message put into the agent's inbox (`agent/inbox/inserted`, before the turn's first step is
 *   assembled) that names a deferred tool — that tool — or carries the Design inspiration / Build
 *   tab's own words (`composerAsksDesign`) — every deferred tool. `test/deferred-tools.test.mjs`
 *   renders those words in every interface language and fails when one stops matching.
 * A lifted tool stays for the conversation: a resumed agent reads the session's last request header
 * and keeps every tool it was already sent (no removal, which would change the cached history).
 *
 * 🔒 NEVER HIDE A TOOL THE AGENT IS TOLD TO CALL. A deferred tool named in the description of a tool
 * the agent can see (the sealed Joomla `tracy_site` names `tracy_site_build_joomla request
 * language.add`) is sent from the first step. The site context names none of them
 * (`test/deferred-tools.test.mjs` holds that).
 *
 * 🔒 NEVER HIDE THE BUILD TOOL FROM A SITE WHOSE BUILD IS STILL OPEN. The build's state reaches the
 * model as the pre-step's site-state notice ("Build: waiting at …", "failed at …"), which is neither an
 * inbox message nor a tool answer, so it lifts nothing — and "please try the build again", in the
 * customer's own words, names no tool either. A site whose build is running, waiting, paused or failed
 * (`siteBuildOpen`, site-context.mjs) keeps its build tool from the first step (`keepRoads: ['build']`).
 *
 * Nothing here grants or refuses anything: each door keeps its own fence, and a failure to defer
 * leaves the tool where it was.
 */

/** The deferred tools, each with the road it belongs to. */
export const DEFERRED_TOOLS = Object.freeze({
  tracy_brand: 'design',
  tracy_design_library: 'design',
  tracy_design_copy: 'design',
  tracy_design_propose: 'design',
  // The chat route to a whole design system (`chat-design-route.mjs`), led by the same skill.
  tracy_design_system: 'design',
  tracy_site_build_wordpress: 'build',
  tracy_site_build_joomla: 'build'
})

/** Every deferred tool's name. */
export const DEFERRED_NAMES = Object.freeze(Object.keys(DEFERRED_TOOLS))

/** The skill that leads the road these tools serve. */
export const DESIGN_SKILL = 'tracy-design-inspiration'

/** One deferred tool's name as a whole word (`tracy_design_inspiration.json` names none of them). */
const NAMED = DEFERRED_NAMES.map((name) => ({ name, pattern: new RegExp(`\\b${name}\\b`) }))

/**
 * The deferred tools a text names.
 * @param {unknown} text
 * @returns {string[]}
 */
export function namedDeferredTools(text) {
  if (typeof text !== 'string' || text === '') return []
  return NAMED.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name)
}

/** A name in quotes, as the tabs write one in every interface language. */
const QUOTED =
  /(?:"[^"\n]{1,160}"|“[^”\n]{1,160}”|„[^“”\n]{1,160}[“”]|«[^»\n]{1,160}»|「[^」\n]{1,160}」|『[^』\n]{1,160}』)/
/** A quoted name with its inspiration id after it: `"Apple" (apple)`, `“Apple”（apple）`. */
const QUOTED_WITH_ID = new RegExp(`${QUOTED.source}\\s*[(（][A-Za-z0-9][\\w.:/-]{0,80}[)）]`)
/** The platform names, which no interface language translates. */
const PLATFORM = /wordpress|joomla|emdash/i
/** The `Label: value.` pairs of a brief the Build tab sends back (`msg.answered`, `msg.revised`). */
const LABELS = /[:：]/g

/**
 * Whether a message carries the words of the Design inspiration or Build tab: a chosen inspiration
 * (`msg.use`, `msg.createWith`, `msg.buildWith`), the Build form's answers (`msg.answered*`), or a
 * changed brief (`msg.revised`) — in any interface language. Generous on purpose: a false match costs
 * a few tools from that step on; a miss costs the customer's build one failed call.
 * @param {unknown} text
 * @returns {boolean}
 */
export function composerAsksDesign(text) {
  if (typeof text !== 'string' || text === '') return false
  if (!QUOTED.test(text)) return false
  if (QUOTED_WITH_ID.test(text) || PLATFORM.test(text)) return true
  return (text.match(LABELS) ?? []).length >= 4
}

/**
 * The deferred tools a message put into the agent's inbox asks for.
 * @param {unknown} text the message's text
 * @returns {string[]}
 */
export function messageLifts(text) {
  if (typeof text !== 'string' || text === '') return []
  if (text.includes(DESIGN_SKILL) || composerAsksDesign(text)) return [...DEFERRED_NAMES]
  return namedDeferredTools(text)
}

/**
 * The deferred tools one finished tool call asks for: every one when it loaded the design skill,
 * else the ones its answer names.
 * @param {{ name?: unknown, arguments?: unknown }} call
 * @param {string} answer the call's answer, as text
 * @returns {string[]}
 */
export function resultLifts(call, answer) {
  const args = /** @type {{ name?: unknown } | null | undefined} */ (call?.arguments)
  if (call?.name === 'skill' && args?.name === DESIGN_SKILL) return [...DEFERRED_NAMES]
  return namedDeferredTools(answer)
}

/**
 * The deferred tools to hide from one agent when it is made.
 * @param {readonly string[]} visible the names the agent can see after the platform mask
 * @param {readonly string[]} described the descriptions of the tools it keeps (every visible tool
 *   that is not itself deferred), as the agent gets them
 * @param {readonly string[] | null} sent the tool names of the session's last request header, if any
 * @param {readonly string[]} [keepRoads] roads whose tools this conversation may need from its first
 *   step (`'build'` while the site's build is still open)
 * @returns {string[]}
 */
export function toolsToDefer(visible, described, sent, keepRoads = []) {
  const already = new Set(sent ?? [])
  const told = new Set(described.flatMap((text) => namedDeferredTools(text)))
  const kept = new Set(keepRoads)
  return DEFERRED_NAMES.filter(
    (name) =>
      visible.includes(name) &&
      !already.has(name) &&
      !told.has(name) &&
      !kept.has(DEFERRED_TOOLS[/** @type {keyof typeof DEFERRED_TOOLS} */ (name)])
  )
}

/**
 * A call's answer as one text: its content's text blocks, else its value.
 * @param {{ content?: readonly { text?: unknown }[], value?: unknown } | null | undefined} result
 * @returns {string}
 */
export function answerText(result) {
  const blocks = Array.isArray(result?.content)
    ? result.content.map((block) => (typeof block?.text === 'string' ? block.text : '')).join('\n')
    : ''
  if (blocks !== '') return blocks
  const value = result?.value
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

/**
 * The per-session ledger of deferred tools: what is held back from each agent, and the lift.
 * @param {{ warn: (line: string) => void }} options
 */
export function createToolDeferral({ warn }) {
  /** @type {Map<string, Map<string, () => void>>} session id → deferred tool → its restriction's disposer */
  const held = new Map()
  /** @type {Map<string, Map<string, readonly string[]>>} session id → deferred tool → the ones its text names */
  const linked = new Map()
  return {
    /**
     * Hide `names` from one agent, one restriction per tool so each can come back alone.
     * @param {string} sessionId
     * @param {(filter: { deny: string[] }) => () => void} restrict the agent's own `tools.restrict`
     * @param {readonly string[]} names
     * @param {Readonly<Record<string, readonly string[]>>} [links] the deferred tools each one's own
     *   description names (`tracy_design_propose` says to read `tracy_design_library` and
     *   `tracy_brand` first): lifting it lifts them too, so a lifted tool never points at a hidden one
     * @returns {string[]} the names now held back
     */
    defer(sessionId, restrict, names, links = {}) {
      const mine = held.get(sessionId) ?? new Map()
      for (const name of names) {
        if (mine.has(name)) continue
        try {
          mine.set(name, restrict({ deny: [name] }))
        } catch (error) {
          warn(
            `[site-tools] could not defer ${name}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
      if (mine.size > 0) {
        held.set(sessionId, mine)
        const companions = linked.get(sessionId) ?? new Map()
        for (const [name, named] of Object.entries(links)) companions.set(name, named)
        linked.set(sessionId, companions)
      }
      return [...mine.keys()]
    },
    /**
     * Give `names` back to the session's agent; its next step is sent them.
     * @param {string} sessionId
     * @param {readonly string[]} names
     * @returns {string[]} the names given back by this call
     */
    lift(sessionId, names) {
      const mine = held.get(sessionId)
      if (mine === undefined) return []
      const lifted = []
      const wanted = [...names]
      for (let at = 0; at < wanted.length; at += 1)
        for (const named of linked.get(sessionId)?.get(wanted[at]) ?? [])
          if (!wanted.includes(named)) wanted.push(named)
      for (const name of wanted) {
        const dispose = mine.get(name)
        if (dispose === undefined) continue
        mine.delete(name)
        try {
          dispose()
          lifted.push(name)
        } catch (error) {
          warn(
            `[site-tools] could not give ${name} back: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
      if (mine.size === 0) {
        held.delete(sessionId)
        linked.delete(sessionId)
      }
      return lifted
    },
    /**
     * The tools still held back from a session's agent.
     * @param {string} sessionId
     * @returns {string[]}
     */
    held(sessionId) {
      return [...(held.get(sessionId)?.keys() ?? [])]
    },
    /**
     * Drop a session's ledger when its agent goes (its restrictions go with its scope).
     * @param {string} sessionId
     */
    forget(sessionId) {
      held.delete(sessionId)
      linked.delete(sessionId)
    }
  }
}
