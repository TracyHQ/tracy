// `site.selfLinkButtons` of a kit (Tracy ADR 0044, decision 27, second use; card AF): the containers of the template's "more"
// buttons that may lead to the page they sit on. A template that prints a section's "more" button from module settings no
// contract slot reaches (JA Boxing's section chrome prints `div.bottom-actions` from the module's `link-btn`) can leave a demo
// button that opens its own page; the write step hides, on each kept page, a link in these containers whose address is that
// page's own. A person declares them when packaging, after reading the template's layout (`cli.mjs self-link-buttons`); a
// template with none declares an empty list, which says it was looked at.
//
//   "selfLinkButtons": [{ "container": ".bottom-actions", "why": "<where the template prints it>" }]
//
// `site.hiddenPageLinks` (card AM) is read the same way: the container of list row links that may lead to a page the plan hides
// (apps/tracy-web/src/lib/hidden-page-links.js).
//
// A container is one compound selector (an optional tag, an id or classes), so a rule cannot reach past it and the site check can
// match it on what holds a link. The write step reads it with the same rules (apps/tracy-web/src/lib/self-link-buttons.js).

const CONTAINER = /^([a-z][a-z0-9]*)?(#[A-Za-z_][\w-]*)?((?:\.[A-Za-z_-][\w-]*)*)$/
export const MAX_CONTAINER_CHARS = 100
export const MAX_CONTAINERS = 10

/** Why a container cannot be declared, or null when it can. */
export function containerProblem(container) {
  if (typeof container !== 'string' || !container.trim()) return 'a container is needed'
  if (container.length > MAX_CONTAINER_CHARS)
    return `a container is at most ${MAX_CONTAINER_CHARS} characters`
  const match = CONTAINER.exec(container)
  if (!match || (!match[2] && !match[3]))
    return 'a container is one compound selector with an id or a class (such as div.bottom-actions), no combinator, comma, attribute or pseudo-class'
  return null
}

/**
 * Adds one container to a kit's list under `field` (once), or sets an empty list with `none`. Changes the kit in place.
 * @param {object} kit
 * @param {string} field the kit's `site` field
 * @param {string} label what the containers are for, in an error's words
 * @param {{ container?: string, why?: string, none?: boolean }} order
 * @returns {{ error: string | null, changed: boolean }}
 */
function declareContainer(kit, field, label, { container, why, none = false }) {
  if (!kit?.site || typeof kit.site !== 'object') return { error: 'the kit has no site part', changed: false }
  if (none) {
    const changed = !Array.isArray(kit.site[field]) || kit.site[field].length > 0
    kit.site[field] = []
    return { error: null, changed }
  }
  const problem = containerProblem(container)
  if (problem) return { error: problem, changed: false }
  if (typeof why !== 'string' || !why.trim())
    return { error: 'say where the template prints it (--why)', changed: false }
  const list = Array.isArray(kit.site[field]) ? kit.site[field] : []
  const at = list.findIndex((e) => e?.container === container.trim())
  if (at === -1 && list.length >= MAX_CONTAINERS)
    return { error: `a kit names at most ${MAX_CONTAINERS} ${label} containers`, changed: false }
  const entry = { container: container.trim(), why: why.trim() }
  if (at !== -1 && list[at].why === entry.why) return { error: null, changed: false }
  if (at === -1) list.push(entry)
  else list[at] = entry
  kit.site[field] = list
  return { error: null, changed: true }
}

/** `site.selfLinkButtons`: the container of a "more" button that may lead to the page it sits on (card AF). */
export const declareSelfLinkButtons = (kit, order) =>
  declareContainer(kit, 'selfLinkButtons', 'self link', order)

/**
 * `site.hiddenPageLinks` (card AM): the container of links in a list row that may lead to a page the plan hides, such as a team
 * card whose name and photo link to a profile page. The write step sends such a link to a living page, or makes it plain text.
 */
export const declareHiddenPageLinks = (kit, order) =>
  declareContainer(kit, 'hiddenPageLinks', 'hidden page link', order)
