// `site.emptyVideoButtons` of a kit (Tracy ADR 0044, decision 29): the selectors of the template's play buttons with an empty
// video address. A template that prints a video's play button whatever the video field holds (JA Boxing's session cards print
// `https://www.youtube.com/embed/` plus the id) leaves a button that opens an empty player once the plan hides the id; the write
// step hides exactly these selectors with one CSS rule. A person declares them when packaging, after reading the template's
// layout (`cli.mjs video-buttons`); a template with none declares an empty list, which says it was looked at.
//
//   "emptyVideoButtons": [{ "selector": ".video-btn[data-src$=\"/embed/\"]", "why": "<where the template prints it>" }]
//
// The selector must test the address (an attribute value test), so a button whose video is filled is never hidden, and holds only
// plain selector characters, so it cannot close the rule. The write step reads it with the same rules
// (apps/tracy-web/src/lib/empty-video-buttons.js), and leaves out an entry that breaks them.

const SAFE = /^[\w\s.#[\]="'$^*~|:(),+/-]+$/
const ADDRESS_TEST = /\[\s*[\w-]+\s*[$^*]?=\s*(?:"[^"]*"|'[^']*')\s*\]/
export const MAX_SELECTOR_CHARS = 200
export const MAX_SELECTORS = 20

/** Why a selector cannot be declared, or null when it can. */
export function selectorProblem(selector) {
  if (typeof selector !== 'string' || !selector.trim()) return 'a selector is needed'
  if (selector.length > MAX_SELECTOR_CHARS) return `a selector is at most ${MAX_SELECTOR_CHARS} characters`
  if (!SAFE.test(selector))
    return 'a selector holds only plain selector characters (no braces, semicolons, angle brackets, at-rules or escapes)'
  if (!ADDRESS_TEST.test(selector))
    return 'a selector tests the video address with an attribute value, such as [data-src$="/embed/"], so a button with a video is never hidden'
  return null
}

/**
 * Adds one selector to the kit's list (once), or sets an empty list with `none`. Changes the kit in place.
 * @param {object} kit
 * @param {{ selector?: string, why?: string, none?: boolean }} order
 * @returns {{ error: string | null, changed: boolean }}
 */
export function declareVideoButtons(kit, { selector, why, none = false }) {
  if (!kit?.site || typeof kit.site !== 'object') return { error: 'the kit has no site part', changed: false }
  if (none) {
    const changed = !Array.isArray(kit.site.emptyVideoButtons) || kit.site.emptyVideoButtons.length > 0
    kit.site.emptyVideoButtons = []
    return { error: null, changed }
  }
  const problem = selectorProblem(selector)
  if (problem) return { error: problem, changed: false }
  if (typeof why !== 'string' || !why.trim())
    return { error: 'say where the template prints the button (--why)', changed: false }
  const list = Array.isArray(kit.site.emptyVideoButtons) ? kit.site.emptyVideoButtons : []
  const at = list.findIndex((e) => e?.selector === selector.trim())
  if (at === -1 && list.length >= MAX_SELECTORS)
    return { error: `a kit names at most ${MAX_SELECTORS} empty video buttons`, changed: false }
  const entry = { selector: selector.trim(), why: why.trim() }
  if (at !== -1 && list[at].why === entry.why) return { error: null, changed: false }
  if (at === -1) list.push(entry)
  else list[at] = entry
  kit.site.emptyVideoButtons = list
  return { error: null, changed: true }
}
