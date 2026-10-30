/**
 * The parts of the site plan defaults (`site-plan-defaults.js`) that read one element or one list: the mapped action of a
 * button or link, the writing order in dependency order, and decisions named twice the same way.
 */

const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])
const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '')

/** The page a demo link opens: a Joomla menu item link (`Itemid=<n>`), else a page route. */
function pageOfHref(/** @type {unknown} */ href, /** @type {any[]} */ pages) {
  const link = text(href)
  if (!link || link === '#') return null
  const item = /[?&]Itemid=(\d+)/.exec(link)
  if (item) return pages.find((p) => p.entity === `menuItem-${item[1]}`)?.id ?? null
  const route = link.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+|\/+$/g, '')
  return pages.find((p) => p.route && p.route === route)?.id ?? null
}

/**
 * The mapped action of a button or link, given the pages the plan shows.
 * @returns {{kind: string, target: string} | null}
 */
export function mappedAction(/** @type {any} */ e, /** @type {any} */ ctx) {
  const { site, shownPages, pages, contactPage } = ctx
  const phone = text(site?.phone)
  const email = text(site?.email)
  const reach = () =>
    phone
      ? { kind: 'call', target: phone }
      : email
        ? { kind: 'email', target: email }
        : contactPage
          ? { kind: 'page', target: contactPage }
          : null
  switch (e.action) {
    case 'page-control':
    case 'submit-form':
      return { kind: 'control', target: e.id }
    case 'open-map':
      return text(site?.address) ? { kind: 'map', target: text(site.address) } : null
    case 'go-to-item':
      return e.card ? { kind: 'item', target: e.card.collection } : null
    default: {
      const page = pageOfHref(e.href, pages)
      if (page && shownPages.has(page)) return { kind: 'page', target: page }
      if (e.action === 'primary-cta' || e.action === 'contact') return reach()
      return null
    }
  }
}

/** Pages in dependency order (each after the pages it depends on); the author's order breaks ties; a cycle keeps it. */
export function orderedPages(/** @type {any[]} */ shown, /** @type {string[]} */ authorOrder) {
  const ids = shown.map((p) => p.id)
  const rank = new Map([...authorOrder, ...ids].map((id, i) => [id, i]).reverse())
  const deps = new Map(
    shown.map((p) => [
      p.id,
      list(p.dependsOn)
        .map(String)
        .filter((d) => ids.includes(d))
    ])
  )
  const out = []
  const placed = new Set()
  while (out.length < ids.length) {
    const ready = ids
      .filter((id) => !placed.has(id) && (deps.get(id) ?? []).every((d) => placed.has(d)))
      .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
    if (!ready.length) return authorOrder
    placed.add(ready[0])
    out.push(ready[0])
  }
  return out
}

/** Decisions with a repeat of the same decision (no field differs but its words) taken out; a real conflict stays. */
export function dedupe(/** @type {any[]} */ decisions) {
  const key = (/** @type {any} */ d) => {
    const { element: _, reason: __, note: ___, ...rest } = d
    return JSON.stringify(rest)
  }
  /** @type {Map<string, any[]>} */
  const seen = new Map()
  return decisions.filter((d) => {
    const id = String(d.element)
    const before = seen.get(id) ?? []
    if (before.some((b) => key(b) === key(d))) return false
    seen.set(id, [...before, d])
    return true
  })
}
