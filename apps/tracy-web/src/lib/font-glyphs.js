/**
 * Whether the web fonts a page loads can draw the language it is written in, and the faces that make them able to.
 *
 * 🔒 A SITE WRITTEN IN VIETNAMESE IS DRAWN IN VIETNAMESE LETTERS (LANG-2, TCH #1013). Measured 10/10/2026 on dev g60-ess-wp-full
 * and g60-ess-j-full (JA Essence): the heading font Jost has no Vietnamese glyphs anywhere (Google serves it in cyrillic, latin,
 * latin-ext; its TTF has "ê", "đ" and a combining grave but no "ề"), so the shaper built "ề" out of "ê" and a loose grave, and
 * "đề" read "đê" with a stray accent; JA Essence WordPress also ships its body font Noto Serif cut to latin only. Loading
 * another subset cannot help a family that has none, and a fallback family in the stack is never asked (the shaper is happy
 * with the decomposed letters). What works for any template: a `@font-face` of the SAME family name whose `unicode-range` is
 * the language's own letters, declared after the template's faces, pointing at a family that has them (the same family on
 * Google Fonts when it has that subset, a look-alike otherwise). The browser then takes only those letters from it; every
 * other letter stays the template's. This is how Google itself cuts a family.
 *
 *   const gaps = await glyphGaps({ html, base, lang: 'vi', fetchText, fetchBytes })
 *   // [{ family: 'Jost', key: 'jost', missing: ['ề', 'ạ'], subset: 'vietnamese', generic: 'sans-serif' }]
 *   const faces = await fallbackFaces({ gaps, fetchText })
 *   // [{ family: 'Jost', weight: '400', style: 'normal', src: 'https://fonts.gstatic.com/s/…woff2', subset: 'vietnamese', from: 'Be Vietnam Pro' }]
 *   fallbackCss(faces)   // the @font-face rules, `unicode-range` from the subset
 *
 * DOM-free (HTML read with patterns), so the Template Customization Question Readiness built-site check and the Apply share it.
 */
import { brotliDecompressSync, inflateSync } from 'node:zlib'

/** The code points a language needs that the Latin subsets leave out, by its primary tag. */
export const LANGUAGE_RANGES =
  /** @type {Record<string, { subset: string, ranges: Array<[number, number]> }>} */ ({
    vi: {
      subset: 'vietnamese',
      ranges: [
        [0x0102, 0x0103],
        [0x0110, 0x0111],
        [0x0128, 0x0129],
        [0x0168, 0x0169],
        [0x01a0, 0x01a1],
        [0x01af, 0x01b0],
        [0x1ea0, 0x1ef9]
      ]
    }
  })

/** The `unicode-range` a fallback face of a subset covers: the language's own letters, nothing the template draws itself. */
export const SUBSET_UNICODE_RANGE = /** @type {Record<string, string>} */ ({
  vietnamese: 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+1EA0-1EF9'
})

/**
 * The family a fallback face draws from when the template's own has no face of the subset on Google Fonts, by the generic
 * family its stack ends in: close in build to the template's text, and drawn for that language.
 */
export const LOOK_ALIKES = /** @type {Record<string, Record<string, string>>} */ ({
  vietnamese: { 'sans-serif': 'Be Vietnam Pro', serif: 'Noto Serif', monospace: 'Roboto Mono' }
})

/** A browser's user agent, so Google Fonts answers WOFF2 faces cut by `unicode-range`. */
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** The weights a fallback face is made in: the ones a template's text is set in. */
const WEIGHTS = ['300', '400', '500', '600', '700', '800']

const inRanges = (/** @type {number} */ cp, /** @type {Array<[number, number]>} */ ranges) =>
  ranges.some(([a, b]) => cp >= a && cp <= b)

/** A family name as CSS compares it: no quotes, one case, one spacing. */
export const familyKey = (/** @type {string} */ name) =>
  String(name ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()

/** A family name as it is written, quotes taken off. */
const familyName = (/** @type {string} */ name) =>
  String(name ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, ' ')

/** `U+0000-00FF, U+0131, U+1E??` as code point ranges. */
export function unicodeRanges(/** @type {string} */ text) {
  /** @type {Array<[number, number]>} */
  const out = []
  for (const part of String(text ?? '').split(',')) {
    const t = part.trim().replace(/^u\+/i, '')
    if (!t) continue
    if (t.includes('?')) {
      out.push([Number.parseInt(t.replace(/\?/g, '0'), 16), Number.parseInt(t.replace(/\?/g, 'F'), 16)])
      continue
    }
    const [a, b] = t.split('-')
    const from = Number.parseInt(a, 16)
    const to = b ? Number.parseInt(b, 16) : from
    if (Number.isFinite(from) && Number.isFinite(to)) out.push([from, to])
  }
  return out
}

/**
 * The `@font-face` rules of a stylesheet: family, the first `url()` of `src` (resolved against `base`), `unicode-range`
 * (null when the rule has none, which is every code point), weight and style.
 * @param {string} css
 * @param {string} base
 * @returns {Array<{ family: string, name: string, src: string | null, ranges: Array<[number, number]> | null, weight: string, style: string, subset: string | null }>}
 */
export function fontFaces(css, base) {
  const out = []
  const text = String(css ?? '')
  for (const m of text.matchAll(/(?:\/\*\s*([a-z-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/gi)) {
    const body = m[2]
    const family = /font-family\s*:\s*([^;]+)/i.exec(body)?.[1]
    if (!family) continue
    const url = /src\s*:[^;]*?url\(\s*(['"]?)([^'")]+)\1\s*\)/i.exec(body)?.[2] ?? null
    let src = null
    try {
      src = url ? new URL(url, base).href : null
    } catch {
      src = null
    }
    const range = /unicode-range\s*:\s*([^;]+)/i.exec(body)?.[1]
    out.push({
      family: familyKey(family),
      name: familyName(family),
      src,
      ranges: range ? unicodeRanges(range) : null,
      weight: (/font-weight\s*:\s*([^;]+)/i.exec(body)?.[1] ?? '400').trim(),
      style: (/font-style\s*:\s*([^;]+)/i.exec(body)?.[1] ?? 'normal').trim(),
      subset: m[1] ? m[1].toLowerCase() : null
    })
  }
  return out
}

/** Read a UIntBase128 of WOFF2 at `at`; answers the value and the next offset. */
function base128(/** @type {Uint8Array} */ b, /** @type {number} */ at) {
  let value = 0
  for (let i = 0; i < 5; i += 1) {
    const byte = b[at + i]
    value = value * 128 + (byte & 0x7f)
    if ((byte & 0x80) === 0) return { value, next: at + i + 1 }
  }
  throw new Error('bad UIntBase128')
}

/** The bytes of a font's `cmap` table, from TrueType/OpenType, WOFF or WOFF2; null when there is none. */
function cmapTable(/** @type {Uint8Array} */ bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (/** @type {number} */ at) => String.fromCharCode(...bytes.subarray(at, at + 4))
  const sig = tag(0)
  if (sig === 'wOF2') {
    if (tag(4) === 'ttcf') return null
    let at = 48
    const tables = []
    for (let i = 0; i < v.getUint16(12); i += 1) {
      const flags = bytes[at]
      at += 1
      const index = flags & 0x3f
      let name = ''
      if (index === 0x3f) {
        name = tag(at)
        at += 4
      } else name = index === 0 ? 'cmap' : index === 10 ? 'glyf' : index === 11 ? 'loca' : `#${index}`
      const orig = base128(bytes, at)
      at = orig.next
      const version = (flags >> 6) & 3
      let length = orig.value
      // glyf and loca are transformed at version 0; every other table at any version but 0.
      if (name === 'glyf' || name === 'loca' ? version === 0 : version !== 0) {
        const t = base128(bytes, at)
        at = t.next
        length = t.value
      }
      tables.push({ name, length })
    }
    const data = brotliDecompressSync(bytes.subarray(at, at + v.getUint32(20)))
    let offset = 0
    for (const t of tables) {
      if (t.name === 'cmap') return new Uint8Array(data.buffer, data.byteOffset + offset, t.length)
      offset += t.length
    }
    return null
  }
  if (sig === 'wOFF') {
    for (let i = 0; i < v.getUint16(12); i += 1) {
      const at = 44 + i * 20
      if (tag(at) !== 'cmap') continue
      const [offset, comp, orig] = [v.getUint32(at + 4), v.getUint32(at + 8), v.getUint32(at + 12)]
      const raw = bytes.subarray(offset, offset + comp)
      return comp < orig ? new Uint8Array(inflateSync(raw)) : raw
    }
    return null
  }
  for (let i = 0; i < v.getUint16(4); i += 1) {
    const at = 12 + i * 16
    if (tag(at) === 'cmap')
      return bytes.subarray(v.getUint32(at + 8), v.getUint32(at + 8) + v.getUint32(at + 12))
  }
  return null
}

/**
 * Which of `codepoints` a font file maps to a glyph (its Unicode subtable, format 12 or 4); null when it cannot be read.
 * @param {Uint8Array} bytes
 * @param {number[]} codepoints
 * @returns {Set<number> | null}
 */
export function fontCovers(bytes, codepoints) {
  let cmap
  try {
    cmap = cmapTable(bytes)
  } catch {
    return null
  }
  if (!cmap) return null
  try {
    const v = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength)
    const records = []
    for (let i = 0; i < v.getUint16(2); i += 1) {
      const at = 4 + i * 8
      const [platform, encoding, offset] = [v.getUint16(at), v.getUint16(at + 2), v.getUint32(at + 4)]
      const format = v.getUint16(offset)
      const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))
      if (unicode && (format === 12 || format === 4)) records.push({ format, offset })
    }
    const best = records.find((r) => r.format === 12) ?? records.find((r) => r.format === 4)
    if (!best) return null
    const out = new Set()
    if (best.format === 12) {
      for (let g = 0; g < v.getUint32(best.offset + 12); g += 1) {
        const at = best.offset + 16 + g * 12
        const [from, to] = [v.getUint32(at), v.getUint32(at + 4)]
        for (const cp of codepoints) if (cp >= from && cp <= to) out.add(cp)
      }
      return out
    }
    const segX2 = v.getUint16(best.offset + 6)
    const ends = best.offset + 14
    const starts = ends + segX2 + 2
    const deltas = starts + segX2
    const rangeOffsets = deltas + segX2
    for (const cp of codepoints)
      for (let s = 0; s < segX2 / 2; s += 1) {
        if (v.getUint16(ends + s * 2) < cp) continue
        const start = v.getUint16(starts + s * 2)
        if (start > cp) break
        const delta = v.getInt16(deltas + s * 2)
        const ro = v.getUint16(rangeOffsets + s * 2)
        let glyph = 0
        if (ro === 0) glyph = (cp + delta) & 0xffff
        else {
          const at = rangeOffsets + s * 2 + ro + (cp - start) * 2
          const raw = at + 2 <= cmap.byteLength ? v.getUint16(at) : 0
          glyph = raw === 0 ? 0 : (raw + delta) & 0xffff
        }
        if (glyph !== 0) out.add(cp)
        break
      }
    return out
  } catch {
    return null
  }
}

/** The text a visitor reads in a page: tags, scripts and styles taken off, numeric entities decoded. */
function visibleText(/** @type {string} */ html) {
  return String(html ?? '')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
}

/** The generic family a declaration that names `key` ends its stack with (`serif`, `monospace`), else `sans-serif`. */
function genericOf(/** @type {string} */ css, /** @type {string} */ key) {
  for (const m of css.matchAll(/(?:font-family|--[\w-]*font[\w-]*)\s*:\s*([^;}]+)/gi)) {
    const stack = m[1].split(',').map(familyKey)
    if (!stack.includes(key)) continue
    if (stack.includes('serif')) return 'serif'
    if (stack.includes('monospace')) return 'monospace'
    return 'sans-serif'
  }
  return 'sans-serif'
}

const LATIN = Array.from({ length: 26 }, (_, i) => 0x61 + i)
/** The Private Use Area, where an icon font keeps its pictures. */
const PRIVATE_USE = Array.from({ length: 0xf8ff - 0xe000 + 1 }, (_, i) => 0xe000 + i)
/**
 * An icon font (Font Awesome, Ionicons): one that maps fewer than half the Latin letters, or icons in the Private Use Area
 * (Font Awesome holds 1,435 there, ionicons 696, every text font of this repo none). A face whose `unicode-range` leaves the
 * Latin letters out is one language's cut of a text family, never an icon font.
 * @param {{ bytes: Uint8Array | Buffer | null, ranges: Array<[number, number]> | null }} face
 */
export function iconFont(face) {
  if (!face.bytes) return false
  const bytes = new Uint8Array(face.bytes)
  const latin = fontCovers(bytes, LATIN)
  const latinCut = !face.ranges || LATIN.some((cp) => inRanges(cp, face.ranges ?? []))
  if (latinCut && latin !== null && latin.size < LATIN.length / 2) return true
  const icons = fontCovers(bytes, PRIVATE_USE)
  return icons !== null && icons.size >= 20
}
/**
 * An icon family by its name, for the ones that draw their arrows by ligature on Latin letters (swiper-icons): one
 * named "icon(s)" (Material Icons, glyphicons, ionicons, simple-line-icons, linearicons), one starting with "icon",
 * "awesome" (Font Awesome 4 to 6, Line Awesome), the word "symbol(s)" (Material Symbols), or a set named neither way
 * (icomoon, icofont, fontello, themify, flaticon). One list for Apply's gaps and the readiness check (LANG-2).
 */
export const ICON_NAME =
  /awesome|\bicons?\b|-icons?\b|\bicon|\bsymbols?\b|icomoon|icofont|fontello|glyphicons|ionicons|\beicons\b|themify|linearicons|flaticon/i

/**
 * The families a page loads that cannot draw the letters of its language that it prints. Read: its own `<style>`, its
 * same-origin stylesheets and its Google Fonts sheets (asked as a browser, which gets the faces cut by range); a face with a
 * `unicode-range` covers what that says, one without is judged by its font file's character map. A family is judged only
 * when the page uses it (named outside its `@font-face`); a file that cannot be read judges nothing.
 * 🔒 AN ICON FONT SETS NO TEXT (TCH #1013, 14/10/2026): a family whose file holds pictures in the Private Use Area
 * (`iconFont`), or that goes by an icon family's name (`ICON_NAME`), is never a gap. The built-site check said Font
 * Awesome and swiper-icons cannot draw Vietnamese on four Joomla templates (run j2), and Apply would have given them faces.
 * @param {{
 *   html: string, base: string, lang: string,
 *   fetchText: (url: string, headers?: Record<string, string>) => Promise<string>,
 *   fetchBytes: (url: string) => Promise<Uint8Array | null>
 * }} input
 * @returns {Promise<Array<{ family: string, key: string, missing: string[], subset: string, generic: string }>>}
 */
export async function glyphGaps({ html, base, lang, fetchText, fetchBytes }) {
  const need =
    LANGUAGE_RANGES[
      String(lang ?? '')
        .toLowerCase()
        .split(/[-_]/)[0]
    ]
  if (!need) return []
  const present = [...new Set([...visibleText(html)].map((c) => c.codePointAt(0) ?? 0))].filter((cp) =>
    inRanges(cp, need.ranges)
  )
  if (present.length === 0) return []
  const origin = new URL(base).origin
  /** @type {Array<{ href: string, text: string }>} */
  const css = [...String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => ({
    href: base,
    text: m[1]
  }))
  for (const m of String(html).matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(m[0])) continue
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1]?.replace(/&amp;/g, '&')
    if (!href) continue
    let url
    try {
      url = new URL(href, base)
    } catch {
      continue
    }
    const google = /(^|\.)fonts\.googleapis\.com$/i.test(url.hostname)
    if (url.origin !== origin && !google) continue
    try {
      css.push({
        href: url.href,
        text: await fetchText(url.href, google ? { 'user-agent': BROWSER_UA } : {})
      })
    } catch {
      // A sheet that cannot be read judges nothing.
    }
  }
  const all = css.map((s) => s.text).join('\n')
  const used = all.replace(/@font-face\s*\{[^}]*\}/gi, ' ').toLowerCase()
  /** @type {Map<string, ReturnType<typeof fontFaces>>} */
  const families = new Map()
  for (const sheet of css)
    for (const face of fontFaces(sheet.text, sheet.href))
      families.set(face.family, [...(families.get(face.family) ?? []), face])
  // The families a page of this language reaches, read as the static LANG-2 rule reads them: a `:lang()` rule that
  // re-points a font property, or a selector's own stack, replaces the family on that page. A family named only
  // where the release swaps it out for this language draws nothing here (JA Nova's Golos Text, JA Donate's
  // Glegoo, 15/10/2026: flagged on every Vietnamese page while the page drew Be Vietnam Pro). Imported here:
  // the reader imports this module.
  const { effectiveFamilies, fontDeclarations } = await import(
    './template-customization-question-readiness/readers/font-declarations.js'
  )
  const tag = String(lang).toLowerCase().split(/[-_]/)[0]
  const declarations = css.flatMap((s) => fontDeclarations(s.href, s.text))
  const loaded = (/** @type {string} */ k) => families.has(k)
  const reached = new Set()
  for (const d of declarations.filter((x) => x.prop === 'font-family' && !x.pictogram)) {
    if (d.lang !== null && d.lang !== tag) continue
    const own =
      d.lang === null
        ? declarations.filter((x) => x.prop === 'font-family' && x.lang === tag && x.selector === d.selector)
        : []
    for (const x of own.length ? own : [d])
      for (const k of effectiveFamilies(x.stack, tag, declarations, loaded)) reached.add(k)
  }
  /** @type {Map<string, Set<number> | null>} */
  const files = new Map()
  /** The files that are icon fonts (`iconFont`). */
  const icons = new Set()
  const out = []
  for (const [key, faces] of families) {
    if (!used.includes(key) || !reached.has(key)) continue
    if (ICON_NAME.test(key) || ICON_NAME.test(faces[0].name)) continue
    const covered = new Set()
    let unknown = false
    let icon = false
    for (const face of faces) {
      if (face.ranges) {
        for (const cp of present) if (inRanges(cp, face.ranges)) covered.add(cp)
        continue
      }
      if (!face.src) {
        unknown = true
        continue
      }
      if (!files.has(face.src)) {
        const bytes = await fetchBytes(face.src).catch(() => null)
        files.set(face.src, bytes ? fontCovers(bytes, present) : null)
        if (bytes && iconFont({ bytes, ranges: face.ranges ?? null })) icons.add(face.src)
      }
      if (icons.has(face.src)) icon = true
      const got = files.get(face.src)
      if (!got) unknown = true
      else for (const cp of got) covered.add(cp)
    }
    if (icon) continue
    const missing = present.filter((cp) => !covered.has(cp))
    if (missing.length > 0 && !unknown)
      out.push({
        family: faces[0].name,
        key,
        missing: missing.slice(0, 8).map((cp) => String.fromCodePoint(cp)),
        subset: need.subset,
        generic: genericOf(all, key)
      })
  }
  return out
}

/**
 * The faces that let each family of `gaps` draw its language: the same family's faces of that subset on Google Fonts when
 * it has them, else the look-alike's (`LOOK_ALIKES`), one per weight Google serves. A family neither has is left out.
 * @param {{ gaps: Awaited<ReturnType<typeof glyphGaps>>, fetchText: (url: string, headers?: Record<string, string>) => Promise<string> }} input
 * @returns {Promise<Array<{ family: string, weight: string, style: string, src: string, subset: string, from: string }>>}
 */
export async function fallbackFaces({ gaps, fetchText }) {
  const out = []
  for (const gap of gaps) {
    const candidates = [
      gap.family,
      LOOK_ALIKES[gap.subset]?.[gap.generic] ?? LOOK_ALIKES[gap.subset]?.['sans-serif']
    ]
    for (const from of candidates.filter(Boolean)) {
      const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(from).replace(/%20/g, '+')}:wght@${WEIGHTS.join(';')}&display=swap`
      let css = ''
      try {
        css = await fetchText(url, { 'user-agent': BROWSER_UA })
      } catch {
        css = ''
      }
      // A family Google does not have in every weight asked answers an error; ask it at its regular weight alone.
      if (!/@font-face/i.test(css))
        try {
          css = await fetchText(
            `https://fonts.googleapis.com/css2?family=${encodeURIComponent(from).replace(/%20/g, '+')}&display=swap`,
            { 'user-agent': BROWSER_UA }
          )
        } catch {
          css = ''
        }
      const faces = fontFaces(css, url).filter((f) => f.subset === gap.subset && f.src)
      if (faces.length === 0) continue
      for (const f of faces)
        out.push({
          family: gap.family,
          weight: f.weight,
          style: f.style,
          src: /** @type {string} */ (f.src),
          subset: gap.subset,
          from: f.name
        })
      break
    }
  }
  return out
}

/**
 * The CSS of fallback faces: one `@font-face` each, the template's family name, the subset's `unicode-range`.
 * @param {Array<{ family: string, weight: string, style: string, src: string, subset: string }>} faces
 */
export function fallbackCss(faces) {
  return faces
    .map(
      (f) =>
        `@font-face{font-family:${JSON.stringify(f.family)};font-style:${f.style};font-weight:${f.weight};font-display:swap;` +
        `src:url(${JSON.stringify(f.src)}) format("woff2");unicode-range:${SUBSET_UNICODE_RANGE[f.subset]}}`
    )
    .join('\n')
}
