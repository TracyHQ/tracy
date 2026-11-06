// Runs INSIDE the page (Playwright `page.evaluate`) after `findBlocks` tagged every block with `data-kit-block`:
// no imports, no closures over Node values.

/**
 * Every logo the page prints, the side the page opens on, and where the brand colours sit inside pictures.
 * A logo is a picture whose file is a known logo file, or a picture inside a logo container (`.navbar-brand`, a class
 * holding "logo" in the header, footer or off-canvas menu), or a picture whose text alternative is the site name. Hidden logos (the other theme's twin, the
 * off-canvas menu) are read too, with `shown: false`.
 * @param {{logoFiles: string[], siteName: string|null, brand: string[]}} o
 */
export function readLogos({ logoFiles, siteName, brand }) {
  const OFF =
    '.t4-offcanvas, .t4-off-canvas, .t3-off-canvas, .js-offcanvas, .offcanvas, .off-canvas, [id^="off-canvas"]'
  const HEADER =
    'header, #t4-header, .t4-header, #t3-header, .t3-header, .site-header, #masthead, [role="banner"]'
  const FOOTER = 'footer, [class*="footer"], [class*="footnav"]'
  const BRAND_BOX = '.navbar-brand, .site-logo, .custom-logo-link'
  const LOGO_BOX = `${BRAND_BOX}, [class*="logo"]`
  const MODE = /^(?:dark|light)-(?:active|mode|theme)$|^theme-(?:dark|light)$/
  const pathOf = (src) => {
    try {
      return decodeURIComponent(new URL(src, location.href).pathname).replace(/^\/+/, '')
    } catch {
      return null
    }
  }
  const hex = (v) => {
    const m = /rgba?\(([^)]+)\)/.exec(v ?? '')
    if (!m) return null
    const [r, g, b, a = 1] = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    if (a < 0.9) return null
    return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`
  }
  const shown = (el) => {
    for (let x = el; x && x !== document.documentElement; x = x.parentElement) {
      const cs = getComputedStyle(x)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false
    }
    const r = el.getBoundingClientRect()
    return r.width >= 2 && r.height >= 2
  }
  /** The first opaque colour behind an element, or the picture it sits on. */
  const groundOf = (el) => {
    for (let x = el.parentElement; x; x = x.parentElement) {
      const cs = getComputedStyle(x)
      if (cs.backgroundImage && /url\(/.test(cs.backgroundImage)) return { colour: null, picture: true }
      const c = hex(cs.backgroundColor)
      if (c) return { colour: c, picture: false }
    }
    return { colour: null, picture: false }
  }
  const regionOf = (el) =>
    el.closest(OFF) ? 'offcanvas' : el.closest(HEADER) ? 'header' : el.closest(FOOTER) ? 'footer' : 'other'
  const known = new Set(logoFiles)
  // The off-canvas menu is opened in this browser only, so the logo it shows when a visitor opens it is measured.
  const PROPS = { display: 'block', visibility: 'visible', transform: 'none', opacity: '1' }
  const opened = [...document.querySelectorAll(OFF)].map((el) => ({
    el,
    was: Object.keys(PROPS).map((p) => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)])
  }))
  for (const o of opened)
    for (const [p, v] of Object.entries(PROPS)) o.el.style.setProperty(p, v, 'important')
  const logos = []
  for (const img of document.querySelectorAll('img, svg')) {
    const isImg = img.tagName === 'IMG'
    const file = isImg ? pathOf(img.getAttribute('src')) : null
    const region = regionOf(img)
    // In the page body a class holding "logo" frames a client strip or a feature icon, not the site's own logo.
    const inBox = img.closest(BRAND_BOX) ?? (region === 'other' ? null : img.closest(LOGO_BOX))
    const byName = isImg && siteName && img.getAttribute('alt')?.trim() === siteName
    if (!(file && known.has(file)) && !inBox && !byName) continue
    if (!isImg && !inBox) continue
    if (!isImg && img.closest('img, a.btn, button')) continue
    const blockEl = img.closest('[data-kit-block]')
    const r = img.getBoundingClientRect()
    const twin = img.closest('.d-light, .d-dark, [class*="logo-light"], [class*="logo-dark"]')
    const blockText = blockEl ? blockEl.innerText.replace(/\s+/g, ' ').trim() : null
    logos.push({
      file: file ?? (isImg ? null : 'inline-svg'),
      found: file && known.has(file) ? 'logo-file' : inBox ? 'logo-container' : 'site-name-alt',
      block: blockEl?.getAttribute('data-kit-block') ?? null,
      region,
      shown: shown(img),
      width: Math.round(r.width),
      height: Math.round(r.height),
      natural: isImg ? { width: img.naturalWidth, height: img.naturalHeight } : null,
      ground: groundOf(img),
      themeClass: twin ? [...twin.classList].find((c) => /light|dark/.test(c)) : null,
      blockTextOnly: blockText !== null && blockText.length === 0
    })
  }
  for (const o of opened) for (const [p, v, how] of o.was) o.el.style.setProperty(p, v, how)
  const marks = [...document.body.classList, ...document.documentElement.classList].filter((c) =>
    MODE.test(c)
  )
  const theme = document.documentElement.getAttribute('data-bs-theme')
  const opensOn = {
    markers: [...marks, ...(theme ? [`[data-bs-theme=${theme}]`] : [])],
    ground:
      hex(getComputedStyle(document.body).backgroundColor) ??
      hex(getComputedStyle(document.documentElement).backgroundColor)
  }
  // Inline SVG icons and their paints; picture files with the share of their pixels near a brand colour.
  const inlineIcons = []
  for (const svg of document.querySelectorAll('svg')) {
    const r = svg.getBoundingClientRect()
    if (!shown(svg) || r.width > 128 || r.height > 128 || svg.closest(LOGO_BOX)) continue
    const paints = new Set()
    for (const s of [svg, ...svg.querySelectorAll('path, circle, rect, polygon, line, polyline, ellipse')]) {
      const cs = getComputedStyle(s)
      for (const v of [cs.fill, cs.stroke]) if (hex(v)) paints.add(hex(v))
    }
    inlineIcons.push({
      block: svg.closest('[data-kit-block]')?.getAttribute('data-kit-block') ?? null,
      paints: [...paints]
    })
  }
  const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
  const targets = (brand ?? []).filter(Boolean).map((h) => ({ h, c: rgb(h) }))
  const pictures = []
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 48
  const c2d = canvas.getContext('2d', { willReadFrequently: true })
  for (const img of document.querySelectorAll('img')) {
    if (!targets.length || !img.complete || !img.naturalWidth || !shown(img)) continue
    try {
      c2d.clearRect(0, 0, 48, 48)
      c2d.drawImage(img, 0, 0, 48, 48)
      const d = c2d.getImageData(0, 0, 48, 48).data
      for (const t of targets) {
        let near = 0
        let seen = 0
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue
          seen++
          if (Math.hypot(d[i] - t.c[0], d[i + 1] - t.c[1], d[i + 2] - t.c[2]) < 60) near++
        }
        if (seen && near / seen >= 0.02)
          pictures.push({
            file: pathOf(img.getAttribute('src')),
            block: img.closest('[data-kit-block]')?.getAttribute('data-kit-block') ?? null,
            colour: t.h,
            share: Math.round((near / seen) * 100) / 100
          })
      }
    } catch {}
  }
  return { logos, opensOn, inlineIcons, pictures }
}

/** Switch the page to its other theme in this browser only (the site is not touched); the marker set, or null. */
export function switchTheme() {
  const body = document.body
  for (const [a, b] of [
    ['dark-active', 'light-active'],
    ['dark-mode', 'light-mode']
  ]) {
    if (body.classList.contains(a)) return body.classList.replace(a, b) && b
    if (body.classList.contains(b)) return body.classList.replace(b, a) && a
  }
  const html = document.documentElement
  const t = html.getAttribute('data-bs-theme')
  if (t) {
    html.setAttribute('data-bs-theme', t === 'dark' ? 'light' : 'dark')
    return `[data-bs-theme=${t === 'dark' ? 'light' : 'dark'}]`
  }
  return null
}
