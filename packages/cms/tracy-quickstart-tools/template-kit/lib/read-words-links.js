// Runs INSIDE the page (Playwright `page.evaluate`) after `findBlocks` tagged every block with `data-kit-block`:
// no imports, no closures over Node values.

/**
 * The icon every shown link of a block draws, and how it is drawn: a font icon (a class picks the glyph), an
 * inline SVG, an image file, or a CSS background. For font icons, a probe: one link's class set to another link's
 * class, the glyph read again and the class put back; a glyph that follows the class proves the class picks it.
 * Every shown link is listed by its position in the block, the way readDetails reads them (repeats included).
 */
export function readLinkIcons({ block }) {
  const root = document.querySelector(`[data-kit-block="${block}"]`)
  if (!root) return null
  const FONT =
    /(?:^|\s)(?:fa[bsrl]?|fa-[\w-]+|icon-[\w-]+|bi|bi-[\w-]+|ti-[\w-]+|la[bs]?|la-[\w-]+|dashicons[\w-]*|material-icons|font-icon)(?:\s|$)/
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  const glyph = (el) => {
    const c = getComputedStyle(el, '::before').content
    return c && c !== 'none' && c !== 'normal' && c !== '""' ? c : null
  }
  const fileOf = (u) =>
    String(u ?? '')
      .replace(/^url\(["']?|["']?\)$/g, '')
      .split(/[?#]/)[0]
      .split('/')
      .pop() || null
  const iconOf = (a) => {
    const title = a.getAttribute('title') || a.getAttribute('aria-label') || null
    for (const el of [a, ...a.querySelectorAll('*')]) {
      const cls = typeof el.className === 'string' ? el.className.trim() : (el.getAttribute('class') ?? '')
      if (el.tagName === 'IMG')
        return { mechanism: 'image-file', file: fileOf(el.currentSrc || el.src), classes: cls || null, title }
      if (el.tagName.toLowerCase() === 'svg') {
        const use =
          el.querySelector('use')?.getAttribute('href') ?? el.querySelector('use')?.getAttribute('xlink:href')
        return { mechanism: 'inline-svg', classes: [cls, use].filter(Boolean).join(' ') || null, title }
      }
      if ((FONT.test(` ${cls} `) || (el !== a && !el.textContent.trim())) && glyph(el))
        return { mechanism: 'font-icon', classes: cls, title, el }
      const bg = getComputedStyle(el).backgroundImage
      if (bg && bg !== 'none' && /url\(/.test(bg) && !el.textContent.trim())
        return { mechanism: 'css-background', file: fileOf(bg), classes: cls || null, title }
    }
    return null
  }
  const links = []
  const fonts = []
  for (const a of root.querySelectorAll('a[href]')) {
    if (!shown(a)) continue
    const label = (a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || '')
      .replace(/\s+/g, ' ')
      .trim()
    const icon = iconOf(a)
    if (icon?.el) fonts.push(icon)
    const { el: _el, ...rest } = icon ?? {}
    links.push({ position: links.length, label, href: a.getAttribute('href'), icon: icon ? rest : null })
  }
  // The probe: does setting the class change the glyph?
  let probe = null
  const a = fonts[0]
  const b = fonts.find((f) => f.classes !== a?.classes && glyph(f.el) !== glyph(a.el))
  if (a && b) {
    const was = a.el.getAttribute('class')
    const before = glyph(a.el)
    a.el.setAttribute('class', b.classes)
    const after = glyph(a.el)
    a.el.setAttribute('class', was)
    probe = { from: a.classes, to: b.classes, glyphChanged: before !== after && after === glyph(b.el) }
  }
  return { links, probe }
}

/**
 * Take a piece of words off a block (the own text of every element showing exactly those words, and an input's
 * placeholder or value), keeping what was there on the element to put back. Returns how many places were emptied
 * and whether a link or a button is left with no words at all.
 */
export function blankWords({ block, text }) {
  const root = document.querySelector(`[data-kit-block="${block}"]`)
  if (!root) return { emptied: 0, bareControl: false }
  const norm = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  const want = norm(text)
  let emptied = 0
  const touched = []
  for (const el of root.querySelectorAll('*')) {
    if (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim())
    if (nodes.length && norm(nodes.map((n) => n.textContent).join(' ')) === want) {
      for (const n of nodes) {
        n.__kitWas = n.textContent
        n.textContent = ''
      }
      window.__kitBlank = [...(window.__kitBlank ?? []), ...nodes]
      touched.push(el)
      emptied++
    }
    for (const attr of ['placeholder', 'value']) {
      if (!/^(INPUT|BUTTON|TEXTAREA)$/.test(el.tagName) || norm(el.getAttribute(attr)) !== want) continue
      el.setAttribute(`data-kit-was-${attr}`, el.getAttribute(attr))
      el.setAttribute(attr, '')
      if (attr === 'value' && 'value' in el) el.value = ''
      touched.push(el)
      emptied++
    }
  }
  const bareControl = touched.some((el) => {
    const c = el.closest('a, button, input[type="submit"], input[type="button"]')
    return c && !norm(c.innerText || c.value || c.getAttribute('aria-label'))
  })
  return { emptied, bareControl }
}

/** Put back what `blankWords` took off. */
export function restoreWords() {
  for (const n of window.__kitBlank ?? []) n.textContent = n.__kitWas
  window.__kitBlank = []
  for (const attr of ['placeholder', 'value'])
    for (const el of document.querySelectorAll(`[data-kit-was-${attr}]`)) {
      el.setAttribute(attr, el.getAttribute(`data-kit-was-${attr}`))
      if (attr === 'value' && 'value' in el) el.value = el.getAttribute('value')
      el.removeAttribute(`data-kit-was-${attr}`)
    }
}
