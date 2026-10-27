// What a demo page shows, read in the page itself (no wrapping of page APIs): visible text with navigation toggles
// taken out, CTAs, image frames, statistic figures, the neutral-fill marks (`data-wo-fill`), horizontal overflow,
// and the layout as sections with their card counts.
//
// Sections are named the way the baseline names them (`baseline.mjs`): Joomla by module (`#Mod183` → `module-183`),
// WordPress by the `tracy-sec-<name>` mark the WO fill writes, EmDash by `data-section`/`id` of top-level sections.
// A section's cards are its largest run of same-shaped siblings — a heuristic: it can only over-count (a card's own
// list), so a section that lost cards still reads fewer than the baseline.

/** The function evaluated in the page; returns a plain object. */
function probe() {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return (
      r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'
    )
  }
  const toggles = [
    ...document.querySelectorAll(
      '[aria-label*="menu" i], [aria-controls], .navbar-toggler, [class*="toggle"], [class*="hamburger"], [class*="offcanvas"]'
    )
  ]
  let text = document.body.innerText
  for (const el of toggles) {
    const t = (el.innerText || '').trim()
    if (t && t.length < 30) text = text.replace(t, ' ')
  }
  const ctaSel =
    'a.btn, a[class*="button"], a[class*="cta"], a[role="button"], button, a[href^="tel:"], a[href^="mailto:"]'
  const ctas = [...document.querySelectorAll(ctaSel)]
    .filter((el) => visible(el) && !toggles.includes(el) && !el.closest('form'))
    .map((el) => ({
      text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 80),
      href: el.getAttribute('href')
    }))
    .filter((c) => c.text || c.href)
  const images = [...document.images]
    .filter((img) => visible(img))
    .map((img) => {
      const r = img.getBoundingClientRect()
      return {
        src: img.currentSrc || img.getAttribute('src') || '',
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        width: Math.round(r.width),
        height: Math.round(r.height)
      }
    })
  const stats = [
    ...document.querySelectorAll(
      '[class*="counter"], [class*="stat"] strong, [class*="stat"] .number, [class*="count"], [data-count], [data-to]'
    )
  ]
    .filter((el) => visible(el) && el.children.length === 0)
    .map((el) => el.innerText.trim())
    .filter((t) => t && t.length <= 12)
  const fills = {}
  for (const el of document.querySelectorAll('[data-wo-fill]')) {
    const k = el.getAttribute('data-wo-fill') || 'unknown'
    fills[k] = (fills[k] ?? 0) + 1
  }
  const signature = (el) =>
    `${el.tagName}.${[...el.classList]
      .filter((c) => !/active|current|show|open|is-|swiper-slide-(next|prev)/.test(c))
      .sort()
      .join('.')}`
  const cardsOf = (root) => {
    let best = 0
    const walk = (el, depth) => {
      if (depth > 7) return
      const groups = new Map()
      for (const child of el.children) groups.set(signature(child), (groups.get(signature(child)) ?? 0) + 1)
      for (const n of groups.values()) if (n >= 2 && n > best) best = n
      for (const child of el.children) walk(child, depth + 1)
    }
    walk(root, 0)
    return best
  }
  const sections = []
  const seen = new Set()
  const push = (id, el) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    sections.push({ id, cards: cardsOf(el) })
  }
  for (const el of document.querySelectorAll('[id^="Mod"]')) {
    const m = /^Mod(\d+)$/.exec(el.id)
    if (m) push(`module-${m[1]}`, el)
  }
  for (const el of document.querySelectorAll('[class*="tracy-sec-"]')) {
    const m = /\btracy-sec-([a-z0-9_-]+)/i.exec(el.className)
    if (m) push(m[1], el)
  }
  for (const el of document.querySelectorAll('main > section, [data-section]'))
    push(el.getAttribute('data-section') || el.id, el)
  return {
    url: location.href,
    title: document.title,
    text,
    ctas,
    images,
    stats,
    fills,
    sections,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    links: [
      ...new Set(
        [...document.querySelectorAll('a[href]')]
          .map((a) => a.href)
          .filter((h) => h.startsWith(location.origin))
      )
    ]
  }
}

export const PROBE_EXPRESSION = `(${probe.toString()})()`

/**
 * Open `url` in the role's watched page at a viewport and read it.
 * @param {Awaited<ReturnType<typeof import('../watched-browser.mjs').watchedRole>>} role
 * @param {string} url
 * @param {'desktop' | 'mobile'} vp
 */
export async function observe(role, url, vp) {
  await role.viewport(vp)
  await role.goto(url)
  return { viewport: vp, ...(await role.evaluate(PROBE_EXPRESSION)) }
}

/** In the page: for each name, the prices printed in the smallest element holding that name and a price. */
export const PAIRS_EXPRESSION = (names) => `(() => {
  const names = ${JSON.stringify(names)}
  const PRICE = /[$€£]\\s?\\d[\\d.,]*|\\d[\\d.,]*\\s?(?:USD|EUR|€|\\$)/g
  const out = {}
  for (const name of names) {
    out[name] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      if (!walker.currentNode.nodeValue.includes(name)) continue
      let el = walker.currentNode.parentElement
      for (let i = 0; el && i < 6; i++, el = el.parentElement) {
        const prices = el.innerText.match(PRICE)
        if (prices) { out[name].push(prices.join(' ')); break }
      }
    }
  }
  return out
})()`
