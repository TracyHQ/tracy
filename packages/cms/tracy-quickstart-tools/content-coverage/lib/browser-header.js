// Runs INSIDE the page (Playwright page.evaluate). Self-contained: no imports, no closures. Read-only.
// The header a visitor sees at the top of the page: the logo, the main menu entries (menu groups and `#` links
// included, dropdown entries hidden until hover included, the off-canvas copy left out), the buttons and the
// other text. `site-map.mjs` decides what each entry is (which slot, which page it opens).
export function extractHeader() {
  const ROOTS =
    'header, [role=banner], #t4-header, #t4-mainnav, #t4-topbar, .t4-header, .t4-mainnav, #header, .site-header, #masthead'
  const OUTSIDE =
    'footer, main, article, [role=main], [role=contentinfo], #t4-main-body, .t4-main-body, #t4-footer'
  const OFFCANVAS = '.t4-offcanvas, .offcanvas, [class*=offcanvas], [id*=offcanvas]'
  const NAV = 'nav, [role=navigation], .t4-megamenu, .navbar-nav, ul.menu, ul.nav'
  const BUTTON = 'a.btn, .btn, button, a.button, .button, input[type=submit], input[type=button]'
  const LOGO = '.logo, .navbar-brand, .site-logo, .custom-logo-link, [class*=logo], [id*=logo]'
  const INLINE = /^(A|SPAN|STRONG|EM|B|I|SMALL|SUP|SUB|ABBR|MARK|LABEL|TIME|U|BR|FONT)$/
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|SELECT|OPTION|TEXTAREA|IFRAME)$/
  const sy = window.scrollY
  const clean = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  const visible = (el) => {
    if (!el.checkVisibility || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      return false
    const r = el.getBoundingClientRect()
    return r.width >= 2 && r.height >= 2
  }
  const outermost = (els) => els.filter((el) => !els.some((o) => o !== el && o.contains(el)))
  const roots = outermost(
    [...document.querySelectorAll(ROOTS)].filter(
      (el) => !el.closest(OUTSIDE) && !el.closest(OFFCANVAS) && el.getBoundingClientRect().top + sy < 600
    )
  )
  if (!roots.length) return { found: false, logo: null, menu: [], buttons: [], texts: [] }
  const within = (sel) =>
    roots
      .flatMap((r) => [...(r.matches(sel) ? [r] : []), ...r.querySelectorAll(sel)])
      .filter((el) => !el.closest(OFFCANVAS))

  const logoEl = within(LOGO)[0] ?? null
  let logo = null
  if (logoEl) {
    const img = logoEl.tagName === 'IMG' ? logoEl : logoEl.querySelector('img')
    const a = logoEl.closest('a') ?? logoEl.querySelector('a')
    logo = {
      image: img ? img.getAttribute('src') || img.currentSrc || null : null,
      alt: img ? clean(img.getAttribute('alt')) || null : null,
      text: clean(logoEl.textContent) || null,
      href: a ? a.getAttribute('href') : null
    }
  }
  const inLogo = (el) => Boolean(logoEl && logoEl.contains(el))

  const navs = outermost(within(NAV).filter((n) => !inLogo(n)))
  const inMenu = (el) => navs.some((n) => n.contains(el))
  const menu = []
  const seen = new Set()
  const push = (el, depth) => {
    const text = clean(el.textContent)
    if (!text) return
    const href = el.tagName === 'A' ? el.getAttribute('href') : null
    const key = `${depth}|${text}|${href}`
    if (seen.has(key)) return
    seen.add(key)
    menu.push({ text, href, depth, visible: visible(el) })
  }
  for (const nav of navs) {
    const items = nav.querySelectorAll('li')
    if (!items.length) {
      for (const a of nav.querySelectorAll('a')) push(a, 0)
      continue
    }
    for (const li of items) {
      if (li.closest(OFFCANVAS)) continue
      const kids = [...li.children]
      const own =
        kids.find((c) => c.matches('a, span, button')) ??
        kids
          .filter((c) => !c.matches('ul, ol, .dropdown-menu, .sub-menu, .mega-dropdown'))
          .map((c) => c.querySelector('a, span'))
          .find(Boolean)
      if (!own) continue
      let depth = 0
      for (let p = li.parentElement; p && p !== nav; p = p.parentElement) if (p.tagName === 'LI') depth++
      push(own, depth)
    }
  }

  const buttons = []
  for (const el of within(BUTTON)) {
    if (inMenu(el) || inLogo(el) || el.parentElement?.closest('.btn, button, a.button')) continue
    const text = clean(el.tagName === 'INPUT' ? el.value : el.textContent)
    const label = text || clean(el.getAttribute('aria-label') || el.getAttribute('title'))
    if (!label) continue
    const a = el.tagName === 'A' ? el : el.closest('a')
    buttons.push({
      text: label,
      href: a ? a.getAttribute('href') : null,
      iconOnly: !text,
      visible: visible(el)
    })
  }
  const inButton = (el) => Boolean(el.closest(BUTTON))

  const texts = []
  const seenText = new Set()
  const own = (el) =>
    [...el.childNodes]
      .map((c) =>
        c.nodeType === 3
          ? c.nodeValue
          : c.nodeType === 1 && INLINE.test(c.tagName) && getComputedStyle(c).display.startsWith('inline')
            ? c.textContent
            : ' '
      )
      .join('')
  for (const el of roots.flatMap((r) => [r, ...r.querySelectorAll('*')])) {
    if (
      SKIP.test(el.tagName) ||
      el.closest('svg, script, style, noscript, template') ||
      el.closest(OFFCANVAS)
    )
      continue
    if (INLINE.test(el.tagName) && el.parentElement && getComputedStyle(el).display.startsWith('inline'))
      continue
    if (inMenu(el) || inLogo(el) || inButton(el)) continue
    const value = clean(own(el))
    if (!value || seenText.has(value)) continue
    seenText.add(value)
    texts.push({ value, visible: visible(el) })
  }
  return { found: true, logo, menu, buttons, texts }
}
