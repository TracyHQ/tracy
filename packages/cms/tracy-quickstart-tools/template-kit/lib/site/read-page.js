// Runs INSIDE the page (Playwright `page.evaluate`) after `findBlocks` tagged every block with `data-kit-block`:
// no imports, no closures over Node values.

/**
 * The site-wide facts one page shows: its head (title, sharing tags, structured data, favicon links), its main
 * headings, its forms, every place it prints the site name, the link columns of its footer and the lines of every
 * block that holds contact details.
 * @param {{siteName: string|null, contactPattern: string}} o
 */
export function readPage({ siteName, contactPattern }) {
  const OFF =
    '.t4-offcanvas, .t4-off-canvas, .t3-off-canvas, .js-offcanvas, .offcanvas, .off-canvas, [id^="off-canvas"]'
  const FOOTER = 'footer, [class*="footer"], [class*="footnav"]'
  const HEADER =
    'header, #t4-header, .t4-header, #t3-header, .t3-header, .site-header, #masthead, [role="banner"]'
  const clean = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  const blockOf = (el) => el.closest('[data-kit-block]')?.getAttribute('data-kit-block') ?? null
  const regionOf = (el) =>
    el.closest(OFF) ? 'offcanvas' : el.closest(HEADER) ? 'header' : el.closest(FOOTER) ? 'footer' : 'body'
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width >= 1 && r.height >= 1 && cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const meta = {}
  for (const m of document.querySelectorAll('meta[property], meta[name]')) {
    const k = m.getAttribute('property') ?? m.getAttribute('name')
    if (/^(og:|twitter:|description$|generator$)/i.test(k)) meta[k] = m.getAttribute('content')
  }
  const schemaTypes = []
  for (const s of document.querySelectorAll('script[type="application/ld+json"]'))
    try {
      const j = JSON.parse(s.textContent)
      for (const x of [j, ...(j['@graph'] ?? [])].flat())
        if (x?.['@type']) schemaTypes.push(String(x['@type']))
    } catch {
      schemaTypes.push('unreadable')
    }
  const head = {
    title: document.title,
    meta,
    schemaTypes,
    icons: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => ({
      rel: l.getAttribute('rel'),
      href: l.getAttribute('href')
    }))
  }
  const h1s = [...document.querySelectorAll('h1')].map((h) => ({
    text: clean(h.innerText || h.textContent),
    shown: shown(h),
    block: blockOf(h),
    region: regionOf(h),
    inPageHeader: !!h.closest('.page-header, .page-heading, .entry-header'),
    classes: clean(`${h.className} ${h.parentElement?.className ?? ''}`)
  }))
  // When no h1 shows, the heading a visitor reads as the page's title: the first shown h2 of the page's own area.
  const titleEl = [...document.querySelectorAll('h2')].find(
    (h) => shown(h) && !h.closest(`${OFF}, ${HEADER}, ${FOOTER}`)
  )
  const titleShownAs = titleEl ? { tag: 'h2', text: clean(titleEl.innerText), block: blockOf(titleEl) } : null
  const forms = [...document.querySelectorAll('form')].map((f) => ({
    block: blockOf(f),
    region: regionOf(f),
    shown: shown(f),
    id: f.id || null,
    fields: [...f.querySelectorAll('input, textarea, select')]
      .filter((i) => i.type !== 'hidden')
      .map((i) => ({ tag: i.tagName.toLowerCase(), type: i.type || null, name: i.name || null })),
    action: f.getAttribute('action'),
    role: f.getAttribute('role'),
    classes: clean(f.className)
  }))
  const names = []
  if (siteName) {
    const lower = siteName.toLowerCase()
    if (document.title.toLowerCase().includes(lower))
      names.push({ where: 'document-title', sample: document.title })
    for (const [k, v] of Object.entries(meta))
      if (String(v).toLowerCase().includes(lower)) names.push({ where: `meta ${k}`, sample: v })
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = clean(n.textContent)
      if (!t.toLowerCase().includes(lower) || n.parentElement?.closest('script, style, noscript')) continue
      const el = n.parentElement
      names.push({
        where: 'text',
        block: blockOf(el),
        region: regionOf(el),
        shown: shown(el),
        sample: t.slice(0, 80)
      })
    }
    for (const el of document.body.querySelectorAll('[alt], [title]'))
      for (const attr of ['alt', 'title']) {
        const v = el.getAttribute(attr)
        if (v?.toLowerCase().includes(lower))
          names.push({
            where: `${attr}-attribute`,
            block: blockOf(el),
            region: regionOf(el),
            sample: v.slice(0, 80)
          })
      }
  }
  // Footer link columns: a list of two or more links under a heading of its own block.
  const navGroups = []
  for (const list of document.querySelectorAll('ul, ol, nav')) {
    if (!list.closest(FOOTER) || list.closest(OFF) || list.parentElement?.closest('ul, ol')) continue
    const links = [...list.querySelectorAll('a')].map((a) => ({
      label: clean(a.innerText),
      href: a.getAttribute('href')
    }))
    if (links.length < 2 || navGroups.some((g) => g.el.contains(list))) continue
    const box = list.closest('[data-kit-block]') ?? list.parentElement
    const heading = box?.querySelector('h2, h3, h4, h5, h6, .module-title, .widget-title')
    navGroups.push({
      el: list,
      block: blockOf(list),
      heading: heading ? clean(heading.innerText) : null,
      links
    })
  }
  // Blocks holding contact details: each line (a leaf element with words) of the block, with its link.
  const pattern = new RegExp(contactPattern, 'i')
  const contacts = []
  for (const root of document.querySelectorAll('[data-kit-block]')) {
    if (root.parentElement?.closest('[data-kit-block]') || !pattern.test(root.innerText ?? '')) continue
    const lines = []
    for (const el of root.querySelectorAll('p, a, li, span, div, address, dd, td')) {
      if (el.querySelector('p, a, li, div, address, dd, td') || !shown(el)) continue
      const text = clean(el.innerText)
      if (text && text.length <= 200)
        lines.push({ text, href: el.closest('a')?.getAttribute('href') ?? null })
    }
    contacts.push({ block: blockOf(root), region: regionOf(root), lines })
  }
  // Text lines of every block: each shown element that owns words directly (a text node child), for telling the
  // sentences the CMS prints from its language files.
  const textLines = []
  for (const el of document.querySelectorAll('[data-kit-block] *')) {
    if (textLines.length >= 3000 || el.closest('script, style, noscript') || !shown(el)) continue
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    const text = clean(el.innerText)
    if (text.length >= 2 && text.length <= 400) textLines.push({ block: blockOf(el), text })
  }
  // The words and links of the page's own area (outside header, footer and menus), for pages such as not-found.
  const own = document.querySelector('#t4-main-body, #t3-mainbody, main, [role="main"]') ?? document.body
  const ownTexts = []
  const ownLinks = []
  for (const el of own.querySelectorAll('h2, h3, p, li, div, span, a')) {
    if (el.closest(`${OFF}, ${FOOTER}, ${HEADER}, nav`) || !shown(el)) continue
    if (el.tagName === 'A') ownLinks.push({ label: clean(el.innerText), href: el.getAttribute('href') })
    else if (!el.querySelector('p, li, div, h2, h3') && clean(el.innerText))
      ownTexts.push(clean(el.innerText))
  }
  return {
    head,
    h1s,
    titleShownAs,
    forms,
    names,
    navGroups: navGroups.map(({ el: _el, ...g }) => g),
    contacts,
    textLines,
    bodyClass: document.body.className,
    // One article as the page's own content, for a template that marks no view on the body: Joomla's article
    // view wraps it in `.item-page` (every version), one per page.
    articleView: document.querySelectorAll('.item-page').length === 1,
    hasHeader: !!document.querySelector('header, #t4-header, .t4-header, #t3-header, .t3-header'),
    texts: [...new Set(ownTexts)].slice(0, 12),
    links: ownLinks.slice(0, 12)
  }
}
