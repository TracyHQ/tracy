// What a page shows in a real browser (ticket #585): run inside the page by `render.mjs` (`page.evaluate`), so it
// uses no import and reads only the page. It returns the observations of `rendered-scan/observations.mjs` (`{kind,
// value, place}`) with what only a browser knows: whether an element is seen (`visible`), the picture a browser
// actually loaded (`currentSrc`), computed background pictures and the words and pictures of `::before` / `::after`.
// Hidden words are kept, with `visible: false` (a leak all the same, product decision 5). What the word reader skips is
// read too: what `noscript` and `template` hold (inert, `visible: false`), SVG words, the address of a frame, a video
// or audio and its sources; a structured data block that does not parse is an observation of kind `problem`. The
// document is a parameter so the reader also runs on a page parsed with no browser (its unit test): what only a browser
// knows (computed styles, boxes, visibility) is then left out.

/**
 * @param {Document} [doc] the page (the browser's own document by default)
 * @returns {{observations: object[], innerText: string}}
 */
export function observeInPage(doc = document) {
  const win = doc.defaultView ?? globalThis
  const styleOf = typeof win.getComputedStyle === 'function' ? (el, p) => win.getComputedStyle(el, p) : null
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'SVG'])
  const BLOCK = new Set(
    'ADDRESS ARTICLE ASIDE BLOCKQUOTE BODY BUTTON DD DETAILS DIALOG DIV DL DT FIELDSET FIGCAPTION FIGURE FOOTER FORM H1 H2 H3 H4 H5 H6 HEADER HR LABEL LEGEND LI MAIN NAV OL OPTION P PRE SECTION SELECT SUMMARY TABLE TBODY TD TEXTAREA TFOOT TH THEAD TR UL A SPAN'.split(
      ' '
    )
  )
  const MENU = /(^|[-_])(nav|navbar|navigation|menu|mainmenu|megamenu)($|[-_])/i
  const out = []
  const squash = (t) =>
    String(t ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  const inMenu = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.tagName === 'NAV' || n.getAttribute('role') === 'navigation') return true
      const tokens = `${n.getAttribute('class') ?? ''} ${n.id ?? ''}`.split(/\s+/)
      if (tokens.some((t) => MENU.test(t))) return true
    }
    return false
  }
  const seen = (el) => {
    if (!el?.isConnected || typeof el.getBoundingClientRect !== 'function') return false
    if (
      typeof el.checkVisibility === 'function' &&
      !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    )
      return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  // The module a block of the page prints in: its wrapper carries `id="Mod<id>"` (the copy the write made, or the
  // blank site's own).
  const moduleOf = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const m = /^Mod(\d+)$/.exec(n.id ?? '')
      if (m) return Number(m[1])
    }
    return null
  }
  const place = (el, element) => {
    const module = el ? moduleOf(el) : null
    return {
      element: String(element).slice(0, 40),
      ...(el && inMenu(el) ? { menu: true } : {}),
      ...(module ? { module } : {})
    }
  }
  // Where the element sits on the full page (CSS pixels from the top left), for a cropped screenshot of a finding.
  const boxOf = (el) => {
    const r = el?.getBoundingClientRect?.()
    if (!r || !(r.width > 0 && r.height > 0)) return null
    return {
      x: Math.round(r.left + (win.scrollX ?? 0)),
      y: Math.round(r.top + (win.scrollY ?? 0)),
      w: Math.round(r.width),
      h: Math.round(r.height)
    }
  }
  const add = (kind, value, el, element, extra = {}) => {
    const v = squash(value)
    if (!v) return
    const box = el ? boxOf(el) : null
    out.push({
      kind,
      value: v,
      place: place(el, element),
      visible: el ? seen(el) : true,
      ...(box ? { box } : {}),
      ...extra
    })
  }
  // The words of each element with words of its own, nested blocks apart.
  const walk = (el) => {
    let text = ''
    for (const c of el.childNodes) {
      if (c.nodeType === 3) text += c.data
      else if (c.nodeType !== 1 || SKIP.has(c.tagName.toUpperCase())) continue
      else if (c.tagName === 'BR') text += '\n'
      else if (BLOCK.has(c.tagName)) {
        text += '\n'
        walk(c)
      } else text += c.textContent
    }
    for (const line of text.split('\n')) add('text', line, el, el.tagName.toLowerCase())
  }
  if (doc.body) walk(doc.body)
  // The blocks of words the host hashes for its demo baseline, as the browser reads them (innerText): the same
  // elements as the HTML reader of `rendered-scan/observations.mjs`, so the two reads can be compared.
  const HOST = 'p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption,blockquote,dt,dd,address,summary'
  for (const el of doc.body?.querySelectorAll(`${HOST},div`) ?? []) {
    if (el.querySelector(HOST)) continue
    if (el.tagName === 'DIV' && ![...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim())) continue
    const words = squash(el.innerText ?? el.textContent)
    if (words)
      out.push({
        kind: 'block',
        value: words.slice(0, 500),
        place: place(el, el.tagName.toLowerCase()),
        visible: seen(el)
      })
  }
  add('title', doc.title, null, 'title')
  for (const meta of doc.querySelectorAll('meta[content]')) {
    const name = String(meta.getAttribute('name') ?? meta.getAttribute('property') ?? '').toLowerCase()
    if (!['description', 'author', 'keywords'].includes(name) && !/^(og|twitter):/.test(name)) continue
    add(
      /:image(?::url|:secure_url)?$/.test(name) ? 'image' : 'meta',
      meta.getAttribute('content'),
      null,
      `meta[${name}]`
    )
  }
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    // Each string with the key it is under (`@type`, `name`, `url`): a type is told by its key, never by its looks.
    const visit = (v, key = null) =>
      typeof v === 'string'
        ? add('jsonld', v, null, 'script[ld+json]', { key })
        : Array.isArray(v)
          ? v.forEach((x) => visit(x, key))
          : v && typeof v === 'object' && Object.entries(v).forEach(([k, x]) => visit(x, k))
    let data = null
    try {
      data = JSON.parse(s.textContent ?? '')
    } catch (error) {
      // Words in a block no reader parses are words the scan cannot vouch for: recorded, never dropped.
      add('problem', `structured data that does not parse: ${error.message}`, null, 'script[ld+json]')
    }
    if (data !== null) visit(data)
  }
  for (const name of ['alt', 'title', 'aria-label', 'placeholder'])
    for (const el of doc.body?.querySelectorAll(`[${name}]`) ?? [])
      add('attr', el.getAttribute(name), el, `${el.tagName.toLowerCase()}[${name}]`)
  for (const el of doc.querySelectorAll(
    'input[type=submit][value], input[type=button][value], button[value]'
  ))
    add('attr', el.getAttribute('value'), el, `${el.tagName.toLowerCase()}[value]`)
  for (const el of doc.querySelectorAll('a[href], area[href]'))
    add('href', el.getAttribute('href'), el, `${el.tagName.toLowerCase()}[href]`)
  for (const el of doc.querySelectorAll('link[rel~="icon"][href]')) add('image', el.href, null, 'link[icon]')
  for (const img of doc.images ?? doc.querySelectorAll('img')) {
    add('image', img.currentSrc || img.src, img, 'img[src]')
    if (img.getAttribute('src') && img.currentSrc && img.currentSrc !== img.src)
      add('image', img.src, img, 'img[src]')
  }
  for (const v of doc.querySelectorAll('video[poster]'))
    add('image', v.poster || v.getAttribute('poster'), v, 'video[poster]')
  // The address of each frame, video and audio, and of their sources.
  for (const el of doc.querySelectorAll(
    'iframe[src], video[src], audio[src], source[src], embed[src], object[data]'
  )) {
    const tag = el.tagName.toLowerCase()
    const attr = tag === 'object' ? 'data' : 'src'
    add(
      tag === 'iframe' || tag === 'embed' || tag === 'object' ? 'embed' : 'media',
      el.getAttribute(attr),
      el,
      `${tag}[${attr}]`
    )
  }
  // SVG words: a chart label, a year drawn as text.
  for (const el of doc.querySelectorAll('svg text, svg title, svg desc'))
    add('text', el.textContent, el, `svg ${el.tagName.toLowerCase()}`)
  // What noscript and template hold: never shown with scripts on, but in the page all the same.
  for (const holder of doc.querySelectorAll('noscript, template')) {
    const tag = holder.tagName.toLowerCase()
    const shell = doc.createElement('div')
    // A browser with scripts on keeps a noscript's content as raw text (no element child); a parser without scripts
    // reads it as elements.
    shell.innerHTML = tag === 'template' || holder.children?.length ? holder.innerHTML : holder.textContent
    const hidden = { visible: false }
    for (const line of String(shell.textContent ?? '').split(/\n/)) {
      const words = squash(line)
      if (words) out.push({ kind: 'text', value: words, place: { element: `${tag} text` }, ...hidden })
    }
    for (const img of shell.querySelectorAll('img')) {
      for (const a of ['src', 'data-src'])
        if (img.getAttribute(a))
          out.push({
            kind: 'image',
            value: squash(img.getAttribute(a)),
            place: { element: `${tag} img[${a}]` },
            ...hidden
          })
      if (img.getAttribute('alt'))
        out.push({
          kind: 'attr',
          value: squash(img.getAttribute('alt')),
          place: { element: `${tag} img[alt]` },
          ...hidden
        })
    }
  }
  // Computed pictures and generated words: every element, and its ::before and ::after.
  const URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g
  for (const el of styleOf ? (doc.body?.querySelectorAll('*') ?? []) : []) {
    if (SKIP.has(el.tagName.toUpperCase())) continue
    for (const pseudo of [null, '::before', '::after']) {
      const css = styleOf(el, pseudo)
      const tag = `${el.tagName.toLowerCase()}${pseudo ?? ''}`
      for (const m of css.backgroundImage.matchAll(URL_RE)) add('image', m[2], el, `${tag}[background]`)
      if (pseudo && css.content && css.content !== 'none' && css.content !== 'normal') {
        const words = css.content.replace(/^["']|["']$/g, '')
        if (/[A-Za-z]{2}/.test(words) && !words.startsWith('url(')) add('text', words, el, `${tag}[content]`)
        for (const m of css.content.matchAll(URL_RE)) add('image', m[2], el, `${tag}[content]`)
      }
    }
  }
  return { observations: out, innerText: doc.body?.innerText ?? doc.body?.textContent ?? '' }
}
