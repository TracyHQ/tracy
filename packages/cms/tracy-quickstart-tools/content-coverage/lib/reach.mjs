// Which audited pages a visitor of a customer site reaches from the front page, read from every link occurrence the
// pages render. The audit's own link items are merged by address (one per href per page, the first element wins), so a
// footer or hero link and a menu entry with the same address were one item: a page reached through the footer looked
// unreached when its menu entry was hidden, and an accept that a hole is "hidden" rested on that (JA Voyara 1.0.12:
// 245 pages reached, not 203). Here every anchor counts on its own.
//
// A link is not shown when it sits in a menu entry the showcase map hides (`li.item-<id>` of the menu module, or the
// T4 mega menu's `li[data-id="<id>"]`, with everything it holds: a hidden parent hides its children). A link inside a
// container the template kit's hidden-page-links name is made inert only when it leads to a page every plan drops (the
// kit's stock screens), as the write step does; any other link there stays shown. Anything else counts as shown, the
// safe direction for an accept.

/** The CSS selector of the menu entries whose links are not shown. */
export function hiddenSelectorOf({ menuIds = [] } = {}) {
  const ids = [...new Set(menuIds.map(String))].filter((id) => /^\d+$/.test(id))
  return ids.flatMap((id) => [`li.item-${id}`, `li[data-id="${id}"]`]).join(', ')
}

/** A test on a page key for the kit's stock-screen paths: exact, or `/*` for every page beneath. */
export function droppedTestOf(paths = []) {
  const exact = new Set()
  const under = []
  for (const p of paths) {
    const x = String(p).toLowerCase().replace(/\/+$/, '')
    if (x.endsWith('/*')) under.push(`${x.slice(0, -2)}/`)
    else exact.add(x || '/')
  }
  return (key) => {
    const base = String(key).split('?')[0]
    return exact.has(base) || under.some((u) => base.startsWith(u))
  }
}

/**
 * Runs INSIDE the page: every anchor with an address, whether a hidden menu entry holds it, and whether a kit
 * hidden-page-links container holds it.
 * @param {{ hidden: string, containers: string }} o `hiddenSelectorOf` and the containers joined by commas
 */
export function anchorsInPage({ hidden, containers }) {
  const out = []
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href').trim()
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) continue
    out.push({
      href: new URL(href, location.href).href,
      hidden: !!(hidden && a.closest(hidden)),
      inContainer: !!(containers && a.closest(containers))
    })
  }
  return out
}

/**
 * One spelling for a page of the site: no `/index.php`, lower case, no trailing slash, `?Itemid=N` read as its menu
 * item's route, the list position and layout kept.
 * @param {string} href
 * @param {string} siteUrl
 * @param {Map<string, string>} routeOfItem menu item id -> route (`home` for the front page)
 */
export function pageKeyOf(href, siteUrl, routeOfItem = new Map()) {
  const x = new URL(href, siteUrl)
  let p = x.pathname.replace(/^(\/index\.php)+(?=\/|$)/, '') || '/'
  const id = x.searchParams.get('Itemid')
  if (id && (p === '/' || p === '')) {
    const route = routeOfItem.get(id)
    p = route === 'home' ? '/' : `/${route ?? `Itemid=${id}`}`
  }
  const start = x.searchParams.get('start')
  const layout = x.searchParams.get('layout')
  const q = [start ? `start=${start}` : null, layout ? `layout=${layout}` : null].filter(Boolean).join('&')
  return (p.toLowerCase().replace(/\/$/, '') || '/') + (q ? `?${q}` : '')
}

/**
 * The pages a visitor reaches from `home` over shown links, each with a page that links to it.
 * @param {{ home: string, links: Map<string, { target: string, hidden: boolean, inContainer?: boolean }[]>, dropped?: (key: string) => boolean }} o
 *   page key -> its link occurrences; `dropped` tells a stock screen, whose links in a container are inert
 * @returns {{ reached: Map<string, string | null>, unreached: string[] }} reached page -> the page it was reached from
 */
export function reachOf({ home, links, dropped = () => false }) {
  const reached = new Map([[home, null]])
  const queue = [home]
  while (queue.length) {
    const from = queue.shift()
    for (const l of links.get(from) ?? []) {
      if (l.hidden || (l.inContainer && dropped(l.target)) || reached.has(l.target) || !links.has(l.target))
        continue
      reached.set(l.target, from)
      queue.push(l.target)
    }
  }
  return { reached, unreached: [...links.keys()].filter((k) => !reached.has(k)).sort() }
}
