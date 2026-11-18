// Runs INSIDE the page (Playwright `page.evaluate`) of an EmDash site fetched with `X-Tracy-Preview: pick`: no imports,
// no closures over Node values. The top-level parts of the page, in the order the layout prints them: what comes
// before `<main>` (top bar, header, menu), each direct child of `<main>` (a section), and what comes after it (a
// signup strip, a picture strip, the footer). Each part has a CSS selector that finds it on a page without stamps, and
// the entry fields printed inside it, read from the stamps (`data-tracy-src`, `src/lib/stamps.ts` of the theme), and
// the headings it prints (an element the theme does not stamp, such as a page's own title, is found by its words).

/**
 * @returns {{before: object[], main: object[], after: object[]} | null} null when the page has no `<main>`
 */
export function readEmdashSections() {
  const main = document.querySelector('main')
  const root = main?.parentElement
  if (!main || !root) return null
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META'])
  const STAMP = /^emdash:([a-z0-9_]+):([^:\s]+):(\S+)(?:\s+(field|block):(\S+))?/
  const token = (s) => /^[A-Za-z_][\w-]*$/.test(s)
  const sameLevel = (el, test) => [...el.parentElement.children].filter(test)
  /** A selector that finds `el` again on another page: an id, a class no sibling has, else its place among siblings. */
  const stepOf = (el) => {
    if (el.id && token(el.id)) return `${el.tagName.toLowerCase()}#${el.id}`
    for (const c of el.classList)
      if (token(c) && sameLevel(el, (x) => x.classList.contains(c)).length === 1)
        return `${el.tagName.toLowerCase()}.${c}`
    return `${el.tagName.toLowerCase()}:nth-child(${[...el.parentElement.children].indexOf(el) + 1})`
  }
  const pathOf = (el) => {
    const steps = []
    for (let x = el; x && x !== document.body; x = x.parentElement) steps.unshift(stepOf(x))
    return `body > ${steps.join(' > ')}`
  }
  const stampsOf = (el) => {
    const seen = new Set()
    const out = []
    for (const x of [el, ...el.querySelectorAll('[data-tracy-src]')]) {
      const raw = x.getAttribute?.('data-tracy-src')
      const m = raw ? STAMP.exec(raw) : null
      if (!m) continue
      const [, collection, , slug, kind, field] = m
      const key = `${collection}|${slug}|${kind ?? ''}|${field ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ collection, slug, kind: kind ?? null, field: field ?? null })
    }
    return out
  }
  const classes = (el) => [...el.classList]
  const clean = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  /** The words of the headings a part prints, as the source writes them (a stylesheet may print them in capitals). */
  const headingsOf = (el) => {
    const out = []
    for (const h of [el, ...el.querySelectorAll('h1, h2, h3')]) {
      if (!/^H[1-3]$/.test(h.tagName)) continue
      const r = h.getBoundingClientRect()
      const text = clean(h.textContent)
      if (r.width > 0 && r.height > 0 && text && !out.includes(text)) out.push(text)
    }
    return out
  }
  const part = (el) => {
    const r = el.getBoundingClientRect()
    return {
      selector: pathOf(el),
      tag: el.tagName.toLowerCase(),
      classes: classes(el),
      height: Math.round(r.height),
      hasHeaderTag: el.tagName === 'HEADER' || !!el.querySelector('header'),
      isFooter: el.tagName === 'FOOTER',
      shown: r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none',
      headings: headingsOf(el),
      stamps: stampsOf(el)
    }
  }
  const siblings = [...root.children].filter((c) => !SKIP.has(c.tagName))
  const at = siblings.indexOf(main)
  return {
    before: siblings.slice(0, at).map(part),
    main: [...main.children].filter((c) => !SKIP.has(c.tagName)).map(part),
    after: siblings.slice(at + 1).map(part)
  }
}
