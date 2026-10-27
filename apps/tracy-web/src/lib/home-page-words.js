/**
 * The words a home page reads as (`wordsOf`): name, nav, headline, sub, calls to action and the
 * hero image, read with regex over the HTML, no DOM. Shared by the public Design page
 * (`public/design-page.js`) and the site's Design system panel (`sites/design-system.js`), which is
 * why it lives in `lib/`: a domain imports only `lib/` and `db/` (`test/module-graph.test.mjs`).
 * Moved here unchanged from `public/design-page.js` on 11/10/2026.
 */

/**
 * The named entities a marketing page actually uses. Six of them used to be the whole table, and a
 * raw `&times;` rode that gap all the way onto a button label in a customer's artifact (measured
 * 08/09 on a Joomla home page, where the off-canvas close button is `&times;`). Anything not named
 * here is left alone rather than mangled — a wrong character is worse than an undecoded one.
 */
const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  times: '×',
  divide: '÷',
  minus: '−',
  plusmn: '±',
  ne: '≠',
  le: '≤',
  ge: '≥',
  deg: '°',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  middot: '·',
  bull: '•',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  lsaquo: '‹',
  rsaquo: '›',
  copy: '©',
  reg: '®',
  trade: '™',
  sect: '§',
  para: '¶',
  dagger: '†',
  Dagger: '‡',
  permil: '‰',
  prime: '′',
  Prime: '″',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  curren: '¤',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  hearts: '♥',
  star: '☆',
  check: '✓',
  cross: '✗',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  shy: '',
  zwj: '',
  zwnj: ''
}

const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z][a-z0-9]{1,9});/gi, (whole, name) => NAMED_ENTITIES[name] ?? whole)

/** Tag soup to one line of text. */
const textOf = (html) =>
  decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

export const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** The value of one attribute on one tag, unescaped. */
function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null
}

function meta(html, key) {
  const re = new RegExp(`<meta\\s[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, 'i')
  const m = re.exec(html)
  return m ? attr(m[0], 'content') : null
}

/** Chrome that wears a button's clothes: dismissals, carousel arrows, menu and search toggles. */
const NOT_A_CTA =
  /^(?:close|dismiss|cancel|back|previous|prev|next|menu|toggle|search|skip|share|print|grid|list|view|sort|filter|columns|expand|collapse|×|x)$/i
const CHROME_ROLE =
  /\b(?:close|dismiss|carousel|slider|offcanvas|off-canvas|navbar-toggle|hamburger|modal|drawer|search-toggle)\b/i
/**
 * A control that changes the page in place — a language picker, a light/dark switch, a submenu
 * opener — says so in its own attributes. Measured 11/10/2026 on three Tracy Business home pages:
 * the first two "calls to action" read were `English EN ▼` (`aria-haspopup`), `Dark` (a theme
 * toggle) and `Company` (a WordPress submenu's `data-wp-bind--aria-expanded`), while the hero's own
 * "Request a quote" came third.
 */
const CONTROL_ATTR =
  /\baria-(?:haspopup|expanded|pressed|controls)\b|\brole\s*=\s*["']?(?:switch|tab|menuitem)\b|\bdata-state\s*=|toggle/i

/**
 * Is this button label an invitation, or is it chrome?
 *
 * A home page's markup is full of elements with `btn` in the class that ask nothing of the reader.
 * Measured 08/09 on a Joomla home page: the first two were the off-canvas close button (`×`) and a
 * carousel's "Previous", and both were shown to the customer as their site's calls to action. A
 * real CTA is a phrase; a single character never is.
 *
 * @param {string} label - the element's text, already decoded.
 * @param {string} tag - its attributes, for the role its class or aria-label admits to.
 */
function isCallToAction(label, tag) {
  if (label === '' || label.length > 40) return false
  // One character is a glyph — an arrow, a cross, a chevron — not a sentence anybody reads.
  if ([...label].length < 2) return false
  if (NOT_A_CTA.test(label)) return false
  if (CHROME_ROLE.test(tag)) return false
  if (CONTROL_ATTR.test(tag)) return false
  if (/aria-hidden\s*=\s*["']?true/i.test(tag)) return false
  // Nothing a reader can pronounce: punctuation, arrows, dingbats.
  return /[\p{L}\p{N}]/u.test(label)
}

/**
 * The `site` block a home page reads as — the shape `design-preview.json` carries and `planFill`
 * wears (name · url · nav · eyebrow · headline · sub · cta · cta2 · image). No DOM here: regex over
 * text, in both the browser page and the tests. It is honest about its reach: server-rendered
 * pages (WordPress, Joomla, static sites) read well; a page that draws itself in JavaScript comes
 * back with the title and little else, and the page says so.
 * @param {string} html
 * @param {string} url - the page's own address, for resolving the image
 */
export function wordsOf(html, url) {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  const title = textOf(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(clean)?.[1] ?? '')
  const siteName = meta(clean, 'og:site_name')
  const ogTitle = meta(clean, 'og:title')
  const description = meta(clean, 'description') ?? meta(clean, 'og:description')

  const h1 = textOf(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(clean)?.[1] ?? '')
  const h1At = clean.search(/<h1[\s>]/i)
  const afterH1 = clean.slice(h1At === -1 ? 0 : h1At)
  // The sub is the first real paragraph AFTER the h1 — the h1 is what makes "after" mean anything.
  //
  // 🔒 With no h1 there is no anchor, and scanning from byte 0 does not degrade gracefully: it
  // returns whatever markup the theme happens to put first. Measured 08/09 on a Joomla home page
  // with no h1 at all — the winner was a 651-character run of the off-canvas search and menu
  // ("Search Sidebar × Magazine Events Videos Gallery Blog Magazine menu Home World…"), while the
  // page's own <meta name="description"> said exactly what the site was. The description is the
  // site speaking about itself; an unanchored paragraph is a guess. Prefer the former.
  let sub = ''
  if (h1At !== -1 || !description) {
    for (const m of afterH1.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const t = textOf(m[1] ?? '')
      if (t.length >= 40) {
        sub = t
        break
      }
    }
  }
  if (sub === '' && description) sub = description.trim()

  // The eyebrow: a short line just before the h1 (a label, a kicker), if there is one.
  const beforeH1 = clean.slice(0, clean.search(/<h1[\s>]/i) === -1 ? 0 : clean.search(/<h1[\s>]/i))
  const eyebrowMatch = [...beforeH1.matchAll(/<(?:p|span|div)[^>]*>([\s\S]{1,200}?)<\/(?:p|span|div)>/gi)].at(
    -1
  )
  const eyebrow = eyebrowMatch ? textOf(eyebrowMatch[1] ?? '') : ''

  // Nav: the first <nav> (or <header>) with links; the first six short link texts.
  const navBlock =
    /<nav[^>]*>([\s\S]*?)<\/nav>/i.exec(clean)?.[1] ??
    /<header[^>]*>([\s\S]*?)<\/header>/i.exec(clean)?.[1] ??
    ''
  const nav = []
  for (const m of navBlock.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const t = textOf(m[1] ?? '')
    if (t !== '' && t.length <= 28 && !nav.includes(t)) nav.push(t)
    if (nav.length === 6) break
  }

  // Buttons: links or buttons that look like calls to action (a class with `btn`/`button`/`cta`, or a
  // form's submit <button>), the first two distinct texts. A bare `<button type="button">` is a script's
  // control — a drill-down menu's "back", a carousel arrow — not an invitation (11/10/2026: a WordPress
  // menu's `tracy-nav__drill-back` "Company" was read as the site's call to action).
  const ctas = []
  for (const m of clean.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const tag = m[2] ?? ''
    const t = textOf(m[3] ?? '')
    const looks =
      /class\s*=\s*["'][^"']*\b(btn|button|cta)\b/i.test(tag) ||
      (m[1]?.toLowerCase() === 'button' && /\btype\s*=\s*["']?submit\b/i.test(tag))
    if (looks && isCallToAction(t, tag) && !ctas.includes(t) && !nav.includes(t)) ctas.push(t)
    if (ctas.length === 2) break
  }

  // The picture: og:image, else the first sizeable <img> after the h1 that is not an icon.
  let image = meta(clean, 'og:image')
  if (!image) {
    for (const m of afterH1.matchAll(/<img\b[^>]*>/gi)) {
      const src = attr(m[0], 'src')
      if (!src || /\.svg(\?|$)/i.test(src) || /logo|icon|sprite|pixel|tracking/i.test(m[0])) continue
      image = src
      break
    }
  }
  if (image) {
    try {
      image = new URL(image, url).href
    } catch {
      image = null
    }
  }

  // The link back to the home page carries the site's name as the site writes it — `rel="home"`
  // (WordPress's site title and logo), else a link whose class says logo or brand (Joomla and EmDash
  // templates): its text, its logo's alt, or its label ("Kinetic home" → "Kinetic"). Before the
  // title, whose order of site and page differs per CMS ("Northgate – Industrial infrastructure" is
  // WordPress's "name – tagline"; "Home — Northgate Industrial" is EmDash's "page — name").
  const linkName = (/** @type {RegExp} */ re) => {
    for (const m of clean.matchAll(re)) {
      const tag = m[1] ?? ''
      const text = textOf(m[2] ?? '')
      const img = /<img\b[^>]*>/i.exec(m[2] ?? '')?.[0]
      const named = (
        text !== ''
          ? text
          : ((img ? attr(img, 'alt') : null) ?? attr(tag, 'aria-label') ?? '').replace(/\s+home$/i, '')
      ).trim()
      if (named !== '' && named.length <= 60) return named
    }
    return null
  }
  const homeName =
    linkName(/<a\b([^>]*\brel\s*=\s*["']?home\b[^>]*)>([\s\S]*?)<\/a>/gi) ??
    linkName(/<a\b([^>]*\bclass\s*=\s*["'][^"']*\b[\w-]*(?:logo|brand)[\w-]*\b[^>]*)>([\s\S]*?)<\/a>/gi)
  const name =
    (
      siteName ??
      homeName ??
      (title.includes(' | ')
        ? title.split(' | ').at(-1)
        : title.includes(' – ')
          ? title.split(' – ').at(-1)
          : title.includes(' - ')
            ? title.split(' - ').at(-1)
            : title)
    )?.trim() || null
  const headline = h1 || ogTitle || title || null
  const thin = !h1 && !description && nav.length === 0
  return {
    name: name ? cut(name, 60) : null,
    url,
    nav,
    eyebrow: eyebrow && eyebrow.length <= 60 && eyebrow !== headline ? eyebrow : null,
    headline: headline ? cut(headline, 120) : null,
    sub: sub ? cut(sub, 280) : null,
    cta: ctas[0] ?? null,
    cta2: ctas[1] ?? null,
    image: image ?? null,
    thin
  }
}
