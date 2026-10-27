/**
 * Tracy's corrections to OpenDesign's provisional Brand, applied between `brandFromMaterial` and
 * `buildBrandSystem`. Pure: (brand, material) in, (brand, notes) out — `test/refine.test.mjs` pins
 * every rule on the three sites that showed the need (06/09, spec-brand-engine §7 slice 1):
 *
 *   fijitrips.example  font "Glyphicons Halflings", accent #000000   — a Bootstrap icon font won the
 *                      frequency count, and the primary heuristic settled on black.
 *   lucaswp.tracy.ai   name "One desk for every site you run."       — no og:site_name, so the
 *                      <title> sentence became the brand name.
 *   stripe.com         name "Stripe | Financial Infrastructure to …" — the <title> carried its tagline.
 *
 * Upstream's app fixes the same things with an LLM pass ("AI Optimize"); Tracy's programmatic path
 * has no LLM (spec-huong-thiet-ke §4f decision 6), so the rules live here, and each one writes a
 * note the customer can read in the manifest.
 */

import { luminance, saturation } from '@tracy/od-brand-engine'

/**
 * A name that never belonged to a typeface — two shapes, both found on nodejs.org on 08/09 while
 * answering "does this only fix one site?".
 *
 *   `OPEN_SANS`          a build-time constant no bundler substituted. No family is written in
 *                        SCREAMING_SNAKE_CASE; the underscore is the clean tell.
 *   `Noto Color Emoji")` a stack the harvest's regex tore in the wrong place.
 *
 * So: a family is letters, digits, spaces, dots, plus and hyphens. Punctuation that only appears in
 * code — quotes, brackets, semicolons, slashes — means the string is a fragment of something else.
 * `PT Sans`, `IBM Plex Sans` and `Roboto Slab` pass; `var(--x)` is caught by the bracket.
 */
const NOT_A_FAMILY_AT_ALL = /[_"'()[\]{}<>;:,\\/]|^-{2}/

/** Families that are icon sets or code faces, never a brand's type. Matched case-insensitively. */
const NOT_A_BRAND_FONT =
  /glyphicons|font ?awesome|^fa[srlbd]?$|^fa-|icomoon|^slick$|material (icons|symbols)|dashicons|genericons|eicons|elementor-icons|themify|ionicons|simple-line-icons|linearicons|bootstrap-icons|feather|tabler-icons|line ?awesome|flaticon|\bicons?\b|^menlo$|^monaco$|^consolas$|^sfmono-regular$|^sf mono$|^ui-monospace$|^liberation mono$|^cascadia( code| mono)?$|^dejavu sans mono$|^andale mono$|^lucida console$|^courier|^source code pro$|^fira code$|^jetbrains mono$|^roboto mono$|^inherit$|^initial$|^sans-serif$|^serif$|^monospace$|^system-ui$|^-apple-system$|^blinkmacsystemfont$|^segoe ui$|^arial$|^helvetica( neue)?$|^ui-sans-serif$|^ui-serif$|^ui-monospace$/i

/** Title separators that split a brand name from its tagline: `Stripe | Financial …`, `Acme – Home`. */
const TITLE_SEPARATOR = /\s*(?:\||–|—|·|•|::|:|\s-\s)\s*/

const MAX_NAME_WORDS = 4

/**
 * @param {string} s
 * @returns {number}
 */
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length

/**
 * The hostname without `www.`, lowercased; `null` when the string is not a URL.
 * @param {string} url
 * @returns {string | null}
 */
export function hostOf(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    return h || null
  } catch {
    return null
  }
}

/**
 * A brand name from what the page said about itself, in this order: `og:site_name`, the shortest
 * segment of the `<title>` that reads as a name (≤ 4 words, not a sentence), else the hostname.
 *
 * A sentence ends in `.`/`!`/`?` or runs past four words — "One desk for every site you run." is a
 * headline, not a name, and a design inspiration titled with it is a card nobody recognises.
 *
 * @param {{ siteName?: string, title?: string }} material
 * @param {string} host
 * @returns {{ name: string, from: 'site-name' | 'title' | 'host' }}
 */
export function pickName(material, host) {
  const siteName = (material.siteName ?? '').trim()
  if (siteName && words(siteName) <= MAX_NAME_WORDS + 2 && !/[.!?]$/.test(siteName)) {
    return { name: siteName, from: 'site-name' }
  }
  const title = (material.title ?? '').trim()
  if (title) {
    const segments = title
      .split(TITLE_SEPARATOR)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && words(s) <= MAX_NAME_WORDS && !/[.!?]$/.test(s))
    if (segments.length > 0) {
      segments.sort((a, b) => a.length - b.length)
      return { name: segments[0], from: 'title' }
    }
  }
  return { name: host, from: 'host' }
}

/**
 * The first measured family that is a brand's type, or `null` when the site declared none.
 * `material.fonts` is frequency-ranked by the harvester; `fontFaceFamilies` is the fallback list.
 *
 * @param {{ fonts?: { family: string, count: number }[], fontFaceFamilies?: string[] }} material
 * @returns {string | null}
 */
export function pickFont(material) {
  const ranked = [...(material.fonts ?? []).map((f) => f.family), ...(material.fontFaceFamilies ?? [])]
  for (const raw of ranked) {
    const family = String(raw ?? '')
      .replace(/^["']|["']$/g, '')
      .trim()
    if (family && !NOT_A_FAMILY_AT_ALL.test(family) && !NOT_A_BRAND_FONT.test(family)) return family
  }
  return null
}

/**
 * The Google Fonts stylesheet the page linked for this family, if any — `fonts.googleapis.com/css?family=Poppins…`
 * names the family in its query. Set on the font spec so `selfHostGoogleFonts` can download the faces.
 * @param {string} family
 * @param {string[] | undefined} urls - `material.googleFontsUrls`.
 * @returns {string | null}
 */
export function googleFontsUrlFor(family, urls) {
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (!slug) return null
  return (
    (urls ?? []).find((u) =>
      u
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .includes(slug)
    ) ?? null
  )
}

/**
 * When the page linked no Google Fonts stylesheet for the family — fijitrips imports Poppins through
 * a CSS `@import`, which the harvester does not follow — ask Google Fonts for it by name. A family
 * Google does not carry answers 400 and `selfHostGoogleFonts` then keeps the harvest's own faces, so
 * the guess costs one request and can only add. Generic, icon and hyphenated proprietary names are never guessed.
 * @param {string} family
 * @returns {string | null}
 */
export function guessGoogleFontsUrl(family) {
  const clean = family.replace(/^["']|["']$/g, '').trim()
  if (!clean || NOT_A_BRAND_FONT.test(clean) || !/^[a-z0-9 ]+$/i.test(clean)) return null
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(clean).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`
}

/**
 * The named entities a page actually uses, decoded. Upstream's harvester decodes exactly five
 * (`&amp; &quot; &#39; &#x2F; &#47;`) and stops, so everything else rides into the brand: measured
 * 08/09 across the lane's own output, `baochinhphu.vn` arrived with a tagline that was NOTHING but
 * hex entities, `ethz.ch` carried `&uuml;` and `apache.org` `&para;` and `&reg;`. A Vietnamese page
 * writes most of its alphabet that way, so the damage is total, not cosmetic.
 *
 * Anything not named here is left as it stands — a wrong character is worse than an undecoded one.
 */
const cp = (n) => String.fromCodePoint(n)
const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: cp(0x2014),
  ndash: cp(0x2013),
  hellip: cp(0x2026),
  middot: cp(0xb7),
  bull: cp(0x2022),
  lsquo: cp(0x2018),
  rsquo: cp(0x2019),
  ldquo: cp(0x201c),
  rdquo: cp(0x201d),
  laquo: cp(0xab),
  raquo: cp(0xbb),
  times: cp(0xd7),
  divide: cp(0xf7),
  copy: cp(0xa9),
  reg: cp(0xae),
  trade: cp(0x2122),
  sect: cp(0xa7),
  para: cp(0xb6),
  deg: cp(0xb0),
  euro: cp(0x20ac),
  pound: cp(0xa3),
  yen: cp(0xa5),
  cent: cp(0xa2),
  agrave: cp(0xe0),
  aacute: cp(0xe1),
  acirc: cp(0xe2),
  atilde: cp(0xe3),
  auml: cp(0xe4),
  aring: cp(0xe5),
  egrave: cp(0xe8),
  eacute: cp(0xe9),
  ecirc: cp(0xea),
  euml: cp(0xeb),
  igrave: cp(0xec),
  iacute: cp(0xed),
  icirc: cp(0xee),
  iuml: cp(0xef),
  ograve: cp(0xf2),
  oacute: cp(0xf3),
  ocirc: cp(0xf4),
  otilde: cp(0xf5),
  ouml: cp(0xf6),
  ugrave: cp(0xf9),
  uacute: cp(0xfa),
  ucirc: cp(0xfb),
  uuml: cp(0xfc),
  ntilde: cp(0xf1),
  ccedil: cp(0xe7),
  szlig: cp(0xdf),
  yacute: cp(0xfd),
  Agrave: cp(0xc0),
  Aacute: cp(0xc1),
  Acirc: cp(0xc2),
  Auml: cp(0xc4),
  Aring: cp(0xc5),
  Egrave: cp(0xc8),
  Eacute: cp(0xc9),
  Ecirc: cp(0xca),
  Euml: cp(0xcb),
  Iacute: cp(0xcd),
  Oacute: cp(0xd3),
  Ocirc: cp(0xd4),
  Ouml: cp(0xd6),
  Uacute: cp(0xda),
  Uuml: cp(0xdc),
  Ntilde: cp(0xd1),
  Ccedil: cp(0xc7)
}

/**
 * One line of page text as a reader sees it: entities resolved, whitespace collapsed.
 * @param {string} s
 * @returns {string}
 */
export function decodeText(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z][a-z0-9]{1,9});/gi, (whole, name) => NAMED[name] ?? whole)
    .replace(/\s+/g, ' ')
    .trim()
}

/** A line that is an address, not a sentence — tinhte.vn offered `tinhte.vn/ifa26` as its tagline. */
const LOOKS_LIKE_URL = /^(?:https?:\/\/|www\.)\S+$|^[a-z0-9-]+(?:\.[a-z0-9-]+)+\/\S*$/i

/**
 * Two names are the same name once case, punctuation, spacing and a trailing domain stop counting —
 * `debian.org` is the same name as `Debian`, and `Znews.vn` the same as `Znews`. The strip is for
 * COMPARING only; what gets displayed is never touched.
 */
const sameName = (a, b) => {
  const k = (s) =>
    String(s ?? '')
      .toLowerCase()
      .replace(/\.[a-z]{2,6}(\.[a-z]{2,3})?$/, '')
      .replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/g, '')
  return k(a) !== '' && k(a) === k(b)
}

/**
 * A tagline is a phrase. Across the eighty brands the lane produced on 08/09, EVERY line of two
 * words or fewer was furniture — "News", "POLITICS", "Kinh doanh", "Native ZFS", "Common Links",
 * "Home page", "Nhận Voucher" — and every real line ran to three or more: "Welcome to Cambridge",
 * "What is GNU?", "WordPress Page Builder", "Web development for the rest of us".
 *
 * ⚠ This is a measured rule, not a law: a brand whose tagline really is two words ("Think
 * different") loses it and falls back to its title segment or description. Eighty sites said the
 * trade is worth it; a bigger sample may say otherwise, and this is the line to revisit first.
 */
const MIN_TAGLINE_WORDS = 3

/**
 * Page furniture that a heading scan mistakes for a headline: the title of a sidebar, a menu, a
 * category rail, a related-posts block. Matched against the WHOLE line — a real tagline may well
 * contain one of these words ("Search less, find more"), and only a line that IS one is furniture.
 */
const CHROME_HEADING =
  /^(?:side ?bar|main menu|menu|navigation|nav|search|search form|footer|header|categories|category|tags?|archives?|archive|log ?in|sign ?in|register|subscribe|newsletter|follow us|related|related posts?|popular|latest|recent|recent posts?|share|comments?|breadcrumbs?|skip to content|toggle|filters?|widgets?|about this site|links?|suggested searches?|common links|our priorities|home ?page|latest news|top stories|sections?|topics?|browse|explore|discover|overview|highlights)$/i

/**
 * Is this heading the page's furniture rather than the brand's line?
 *
 * ja-teline-v.demo.joomlart.com carries ZERO `<h1>`, and the harvester lists headings h1-then-h2-
 * then-h3, so `headings[0]` — which upstream takes as the tagline — was the first `<h2>`:
 * **"Sidebar"**, the title of the off-canvas module. Every artifact printed it as its hero.
 *
 * A heading that is one of the site's own nav labels is that nav label, whatever it reads like.
 *
 * @param {string} text
 * @param {string[]} navLabels - `material.navLabels`, the site's own menu.
 * @returns {boolean}
 */
export function isChromeHeading(text, navLabels, name) {
  const line = decodeText(text)
  // A brand's own name is not a line about the brand — twelve of the eighty brands the lane wrote
  // on 08/09 carried it ("Debian", "Harvard University", "Canada.ca", "Al Jazeera").
  if (sameName(line, name)) return true
  if (LOOKS_LIKE_URL.test(line)) return true
  // Nothing is not furniture. A tagline that was never there needs no correcting, and saying it was
  // "cleared" is a note about work that did not happen (drupal.org, 08/09).
  if (line === '') return false
  if (CHROME_HEADING.test(line)) return true
  if (words(line) < MIN_TAGLINE_WORDS) return true
  return (navLabels ?? []).some(
    (l) =>
      String(l ?? '')
        .trim()
        .toLowerCase() === line.toLowerCase()
  )
}

/**
 * A tagline from what the page said about itself, when its headings could not supply one.
 *
 * The `<title>` usually carries both the name and the line — "Best Joomla News template - Teline V"
 * — so the segment that is NOT the name is the tagline, and it is the site's own words in the site's
 * own order. Failing that, the meta description; failing that, nothing, because an invented tagline
 * is worse than none.
 *
 * @param {{ title?: string, description?: string }} material
 * @param {string} name - the brand name already settled by `pickName`.
 * @returns {string | null}
 */
export function taglineFrom(material, name) {
  const title = decodeText(material.title ?? '')
  const lower = String(name ?? '')
    .trim()
    .toLowerCase()
  const other = title
    .split(TITLE_SEPARATOR)
    .map((seg) => seg.trim())
    .filter((seg) => seg !== '' && seg.toLowerCase() !== lower && words(seg) >= 2)
  if (other.length > 0) return other.sort((a, b) => b.length - a.length)[0]
  const description = decodeText(material.description ?? '')
  return description === '' || sameName(description, name) ? null : description
}

/**
 * Is this hex a grey, a near-black or a near-white — a colour with no hue to carry a brand?
 * @param {string} hex
 * @returns {boolean}
 */
export function isAchromatic(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return true
  const l = luminance(hex)
  return saturation(hex) < 0.18 || l > 0.92 || l < 0.02
}

/**
 * A scope that only paints the dark theme. `extractColors` records the rule a colour was found in
 * (`selector:html[data-theme="dark"]`, a `prefers-color-scheme` block, a `--dm-*` token), but
 * nothing upstream reads it back — so a colour that exists ONLY after the visitor flips to dark
 * can be chosen as the light palette's brand colour.
 */
const DARK_SCOPE =
  /data-theme\s*=\s*["']?dark|data-(?:mode|color-mode|bs-theme)\s*=\s*["']?dark|prefers-color-scheme\s*:\s*dark|(?:^|[\s.#[])(?:dark|theme-dark|night)(?:[\s.[\]"']|$)|css-var:--(?:dm|dark)[-_]/i

/**
 * Every recorded source of this colour sits in a dark-theme scope — so the light palette never
 * shows it, whatever its name says.
 *
 * Measured 08/09 on ja-teline-v.demo.joomlart.com: `--dm-link:#e85555` appears ONCE in 508 KB of
 * CSS, inside `html[data-theme="dark"]`, and became the brand's accent ahead of `#cc0000`, which
 * the site declares 121 times on `a`, `.btn-primary` and `.btn-danger`. Upstream's seed scores a
 * `css-var:` name matching `link|accent|brand|primary` at +4.5 and gates every candidate below 3.2
 * — `#cc0000` carries no `css-var:` source at all (its twelve recorded sources are all `prop:`,
 * exactly at the cap in `prefetch.ts`), so it is dropped before frequency is ever looked at.
 *
 * A colour with NO recorded source is not evidence of anything: absence is not a dark scope.
 *
 * @param {{ sources?: string[] }} candidate
 * @returns {boolean}
 */
export function isDarkModeOnly(candidate) {
  const sources = candidate?.sources ?? []
  if (sources.length === 0) return false
  return sources.every((s) => DARK_SCOPE.test(String(s)))
}

/** A selector list that names at least three bare headings — the site's own heading rule. */
function isHeadingRule(selectors) {
  const bare = selectors.split(',').filter((sel) => /^\s*h[1-6]\s*$/i.test(sel)).length
  return bare >= 3
}

/**
 * The family the site sets on its headings, read from the CSS rather than from a frequency count.
 *
 * Same failure shape as the accent, one axis over: `extractFonts` ranks raw `font-family`
 * declarations with no idea which selector is a heading, so on ja-teline-v the body face (Roboto,
 * 94 declarations) took the display slot while the site says
 * `h1..h6{font-family:"Roboto Slab",…}` outright.
 *
 * Only a rule naming three or more BARE headings counts. A theme variant such as
 * `h1,.font-helvetica h2,.font-helvetica h3{…}` leads with a bare `h1` but is scoped to a class
 * the page may never carry, and taking it would swap the real face for an alternate.
 *
 * @param {string} css - the stylesheets the harvest concatenated.
 * @returns {string | null}
 */
export function headingFont(css) {
  /** @type {string[]} */
  const declarations = []
  for (const m of String(css ?? '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!isHeadingRule(m[1] ?? '')) continue
    const declared = /font-family\s*:\s*([^;}]+)/i.exec(m[2] ?? '')?.[1]
    if (declared) declarations.push(declared)
  }
  // 🔒 LAST rule first, because that is what the cascade does: two unscoped `h1..h6` rules and the
  // later one wins on the page, so reading the earlier one gives a face the reader never sees.
  for (const declared of declarations.reverse()) {
    for (const raw of declared.split(',')) {
      const family = raw.replace(/^\s*["']|["']\s*$/g, '').trim()
      // A `var(--x)` is a promise, not a family: nothing here can resolve it, and writing the
      // literal string as the display face gives every artifact a font no renderer knows.
      // Measured 08/09 on ghost.org, whose heading rule is `font-family:var(--font-heading)`.
      if (family === '' || NOT_A_FAMILY_AT_ALL.test(family)) continue
      if (!NOT_A_BRAND_FONT.test(family)) return family
    }
  }
  return null
}

/**
 * The most-used chromatic colour in the material — what the accent should be when the heuristic
 * settled on black or a grey. Requires real saturation and a readable lightness; `null` when the
 * site is genuinely monochrome (then black IS the brand, as on vercel.com).
 *
 * @param {{ colors?: { hex: string, count: number, extreme?: boolean }[] }} material
 * @returns {string | null}
 */
export function topChromatic(material) {
  let best = null
  let bestCount = 0
  for (const c of material.colors ?? []) {
    const hex = String(c.hex ?? '').toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(hex) || c.extreme) continue
    // A colour the light theme never paints cannot stand in for one it does.
    if (isDarkModeOnly(c)) continue
    if (saturation(hex) < 0.25) continue
    const l = luminance(hex)
    if (l < 0.03 || l > 0.8) continue
    if (c.count > bestCount) {
      best = hex
      bestCount = c.count
    }
  }
  return best
}

/**
 * Apply the three rules. The brand is copied, never mutated; every change is one note.
 *
 * @template {{ name: string, colors: { role: string, hex: string }[], typography: { display: { family: string, googleFontsUrl?: string }, body: { family: string, googleFontsUrl?: string } } }} B
 * @param {B} brand - the provisional Brand.
 * @param {{ siteName?: string, title?: string, finalUrl?: string, url?: string, fonts?: { family: string, count: number }[], fontFaceFamilies?: string[], googleFontsUrls?: string[], colors?: { hex: string, count: number, extreme?: boolean }[], navLabels?: string[], description?: string }} material
 * @param {string} url - the URL the customer typed.
 * @param {{ css?: string }} [opts] - the harvest's concatenated stylesheets, when the caller kept
 *   them: the heading rule is read from the CSS, not guessed from a declaration count.
 * @returns {{ brand: B, notes: string[] }}
 */
export function refineBrand(brand, material, url, opts = {}) {
  const notes = []
  const host = hostOf(material.finalUrl || url) ?? hostOf(url) ?? url
  /** @type {B} */
  const out = structuredClone(brand)

  const picked = pickName(material, host)
  if (picked.name !== brand.name) {
    notes.push(
      `name: "${brand.name}" → "${picked.name}" (${picked.from === 'host' ? 'the title is a sentence; using the hostname' : `from the ${picked.from === 'title' ? 'shortest title segment' : 'site name'}`})`
    )
    out.name = picked.name
  }

  // The site's own heading rule outranks the frequency count, and it moves the DISPLAY face only —
  // the body face is measured from the same declarations the heading rule is an exception to.
  const heading = headingFont(opts.css ?? '')
  const displayNow = brand.typography?.display?.family ?? ''
  // Capitals are not a correction. nasa.gov writes `h1..h6{font-family:"inter"}` while the count
  // crowned `Inter`: the same family, and swapping the spelling only puts a line in the manifest
  // claiming work that changed nothing.
  const sameFamily = heading !== null && heading.toLowerCase().trim() === displayNow.toLowerCase().trim()
  if (heading && !sameFamily) {
    notes.push(`font: display "${displayNow}" → "${heading}" (the family the site sets on h1..h6)`)
    out.typography.display = { ...out.typography.display, family: heading }
  }

  const font = pickFont(material)
  const current = out.typography?.display?.family ?? ''
  if (font && (!heading || sameFamily) && font !== current) {
    notes.push(
      NOT_A_BRAND_FONT.test(current)
        ? `font: "${current}" is an icon or code face → "${font}"`
        : `font: "${current}" → "${font}" (first brand face by frequency)`
    )
    out.typography.display = { ...out.typography.display, family: font }
    out.typography.body = { ...out.typography.body, family: font }
  } else if (!font && (!heading || sameFamily) && NOT_A_BRAND_FONT.test(current)) {
    notes.push(`font: "${current}" is an icon or code face and the site declared no other; kept`)
  }

  // The body face is corrected on its own. A heading rule says nothing about body text, so taking
  // it for `display` must not strand an icon set on everything else — measured 08/09 on
  // joomlart.com, where `h1..h6{font-family:Inter}` fixed the display while the body kept
  // "Font Awesome 6 Free", which is the same bug one slot over.
  const bodyNow = out.typography?.body?.family ?? ''
  if (NOT_A_BRAND_FONT.test(bodyNow) && font && font !== bodyNow) {
    notes.push(`font: body "${bodyNow}" is an icon or code face → "${font}"`)
    out.typography.body = { ...out.typography.body, family: font }
  }

  // A Google-hosted face gets its stylesheet URL, so the engine can self-host it (fonts.ts).
  for (const key of /** @type {const} */ (['display', 'body'])) {
    const spec = out.typography?.[key]
    if (!spec || spec.googleFontsUrl) continue
    const gf =
      googleFontsUrlFor(spec.family ?? '', material.googleFontsUrls) ?? guessGoogleFontsUrl(spec.family ?? '')
    if (gf) spec.googleFontsUrl = gf
  }

  // Entities first: what the page wrote is not what upstream decoded, and a line still carrying
  // `&#x1ED5;` cannot be judged — nor read.
  for (const key of /** @type {const} */ (['name', 'tagline', 'description'])) {
    if (typeof out[key] === 'string') out[key] = decodeText(out[key])
  }

  // The tagline: `headings[0]` upstream, which on a page with no h1 is whatever heading came first.
  if (typeof out.tagline === 'string' && isChromeHeading(out.tagline, material.navLabels, out.name)) {
    const replacement = taglineFrom(material, out.name)
    notes.push(
      replacement === null
        ? `tagline: "${out.tagline}" is page furniture and the page offered no other line; cleared`
        : `tagline: "${out.tagline}" is page furniture → "${replacement}" (the site's own words)`
    )
    out.tagline = replacement ?? ''
  }

  const accent = out.colors.find((c) => c.role === 'accent')
  const chosen = (material.colors ?? []).find(
    (c) => String(c.hex ?? '').toLowerCase() === String(accent?.hex ?? '').toLowerCase()
  )
  const darkOnly = accent ? isDarkModeOnly(chosen ?? {}) : false
  if (accent && (isAchromatic(accent.hex) || darkOnly)) {
    const replacement = topChromatic(material)
    if (replacement && replacement !== accent.hex.toLowerCase()) {
      notes.push(
        darkOnly
          ? `accent: ${accent.hex} is only painted in dark mode → ${replacement} (most-used chromatic colour)`
          : `accent: ${accent.hex} has no hue → ${replacement} (most-used chromatic colour)`
      )
      accent.hex = replacement
      // A secondary equal to the new accent says nothing; drop it so the engine derives its own.
      out.colors = out.colors.filter(
        (c) => c.role !== 'accent-secondary' || c.hex.toLowerCase() !== replacement
      )
    } else if (!replacement) {
      notes.push(
        darkOnly
          ? `accent: ${accent.hex} is only painted in dark mode and the site has no other chromatic colour; kept`
          : `accent: ${accent.hex} has no hue and the site has no chromatic colour; kept (monochrome brand)`
      )
    }
  }

  return { brand: out, notes }
}
