/**
 * Which command names stand for each agent id, per platform: what src/agent-detect.js looks for on
 * the machine when the first-run screen asks which agent CLIs are installed.
 *
 * WHY THE TABLE IS IN THE APP (council 10/10/2026, tasks/todo-desktop-onboard-agent.md §Council):
 * the page names ids, never commands. A bridge that took command names would let any script on the
 * page (an XSS) fingerprint the software on this machine. Adding a CLI here means shipping the app;
 * that is accepted, new providers are rare. Names are bare: no path, no argument, no shell syntax.
 */

/** What an agent id looks like: the page sends ids, so this is also the bridges' input rule. */
const AGENT_ID = /^[a-z][a-z0-9-]*$/

/** @param {string[]} names - the same command names on every platform. */
const everywhere = (...names) =>
  Object.freeze({
    darwin: Object.freeze([...names]),
    linux: Object.freeze([...names]),
    win32: Object.freeze([...names])
  })

const AGENT_MANIFEST = Object.freeze({
  claude: everywhere('claude'),
  codex: everywhere('codex'),
  copilot: everywhere('copilot'),
  grok: everywhere('grok'),
  cursor: everywhere('cursor-agent'),
  kiro: everywhere('kiro-cli'),
  kimi: everywhere('kimi'),
  antigravity: everywhere('agy', 'gemini'),
  qwen: everywhere('qwen'),
  // GLM has no CLI of its own: it is reached through an account only.
  glm: everywhere()
})

/**
 * The command names of `id` on `platform`, as a fresh array; null for an id or platform the table
 * does not know (an empty array is a known id with no CLI).
 * @param {string} id
 * @param {string} platform - `process.platform`.
 * @returns {string[] | null}
 */
function commandsFor(id, platform) {
  if (!Object.hasOwn(AGENT_MANIFEST, id)) return null
  const entry = AGENT_MANIFEST[id]
  if (!Object.hasOwn(entry, platform)) return null
  return [...entry[platform]]
}

module.exports = { AGENT_MANIFEST, AGENT_ID, commandsFor }
