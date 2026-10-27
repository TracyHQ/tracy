/**
 * WHAT A CRAWLER READS ON ONE PAGE OF THIS SITE — `page.text {head:true}` (suite v6, item #3,
 * 28/09/2026): the title, description, robots, canonical, Open Graph and Twitter tags, hreflang,
 * JSON-LD, the heading outline and the pictures without alt text, read from the HTML the page read
 * already fetched. No second request. Pure — no I/O.
 *
 * 🔒 WHY THIS EXISTS. The Writer and SEO/GEO roles carry no bash (`config/mode-matrix.json`), and
 * `page.text` answered `{url, lang, title, text}` only: an agent asked to write or check a meta
 * description, a canonical, JSON-LD, hreflang or picture alts could not SEE any of them, so it
 * guessed, or read templates to find out what a page might print. The v6 oracles judge exactly
 * these tags on the served page (`bench v6 SPEC.md` §4), so the agent now reads what they read.
 *
 * 🔒 ONLY WHAT THE PAGE CARRIES (CLAUDE.md principle 3): a tag the page does not print is `null` or
 * empty — never a default, never what a crawler might infer. Two tags for one field are both
 * shown: that is a finding, not noise.
 *
 * 🔒 ONE LINEAR PASS OVER THE RAW MARKUP. JSON-LD lives in `<script>` bodies, which `tameMarkup`
 * empties, so this reads the page before taming — through the same tokenizer (`markupAt`) and the
 * same raw-text rule (`rawTextEnd`) the outline stands on, each `<` visited once. A crafted page
 * must not make this scan quadratically any more than it may the outline (`html-units.mjs`).
 */
import { decodeEntities, markupAt, rawTextEnd } from './html-units.mjs'

/** How much one head answer carries by default: the same measured 2,000 as the page's words. */
export const HEAD_DEFAULT_CHARS = 2000

/** The keys a head answer adds to a page's answer (and a several-page answer keeps per page). */
export const HEAD_KEYS = Object.freeze([
  'description',
  'robots',
  'canonical',
  'og',
  'twitter',
  'meta',
  'hreflang',
  'jsonLd',
  'headings',
  'images',
  'lengths',
  'found'
])

/** Elements whose body is not markup: skipped whole (a picture in `<noscript>` is not shown). */
const RAW_BODY = new Set(['script', 'style', 'noscript', 'template', 'svg', 'textarea', 'title', 'iframe'])
/** Elements that may stand in `<head>`; any other start tag ends it, as a browser's parser does. */
const HEAD_TAGS = new Set([
  'html',
  'head',
  'title',
  'meta',
  'link',
  'script',
  'style',
  'noscript',
  'base',
  'template'
])
/** The landmarks a heading is filed under — the element names, not the outline's regions. */
const LANDMARKS = new Set(['header', 'nav', 'main', 'aside', 'footer'])
const HEADING = /^h[1-6]$/
const LD_JSON = /(^|[\s;])application\/ld\+json\b/i
const HIDE_CLASS = /(^|\s)(screen-reader-text|sr-only|visually-hidden)(\s|$)/i

/** Bounds on what one page may make this reader keep, whatever it prints. */
const MAX_TAGS = 300
const MAX_HEADINGS = 400
const MAX_LD_BLOCKS = 20
const MAX_LD_CHARS = 256 * 1024
const MAX_HEADING_RAW = 600
const MAX_LANDMARK_DEPTH = 64
const MAX_PICTURE_NAMES = 60

/**
 * @typedef {{ level: number, region: string, text: string, hidden: boolean }} HeadHeading
 * @typedef {{ region: string, name: string }} HeadPicture
 * @typedef {{ titles: { text: string, inHead: boolean }[], metas: { key: string, value: string, inHead: boolean }[],
 *   canonical: { href: string, inHead: boolean }[], hreflang: { lang: string, href: string }[],
 *   ld: { text: string, cut: boolean }[], ldCount: number, headings: HeadHeading[],
 *   images: { total: number, missingAlt: HeadPicture[], emptyAlt: HeadPicture[], missingCount: number, emptyCount: number },
 *   headEnd: number }} HeadFacts
 */

/** @param {string | undefined} v */
const clean = (v) =>
  decodeEntities(String(v ?? ''))
    .replace(/\s+/g, ' ')
    .trim()

/**
 * A picture as an answer names it: its file name (what the media library shows), never its whole
 * address; a `data:` picture by its type.
 * @param {Record<string, string>} a
 */
function pictureName(a) {
  const first = (/** @type {string | undefined} */ set) =>
    String(set ?? '')
      .trim()
      .split(/\s+/)[0] ?? ''
  const raw = clean(a.src || a['data-src'] || first(a.srcset) || first(a['data-srcset']))
  if (raw === '') return '(no src)'
  if (/^data:/i.test(raw)) return `${raw.slice(0, 24)}…`
  let path = raw
  try {
    path = new URL(raw, 'http://page.invalid/').pathname
  } catch {
    path = raw
  }
  const last = path.split('/').filter(Boolean).pop() ?? path
  let name = last
  try {
    name = decodeURIComponent(last)
  } catch {
    name = last
  }
  return name.slice(0, 80)
}

/**
 * Every fact `page.text {head:true}` answers from, in ONE pass over the page as the server (or the
 * browser) gave it.
 * - `<title>`, `<meta name|property>`, `<link rel=canonical>` are kept with whether they stood in
 *   `<head>` (the head ends at `</head>`, `<body>`, or the first tag a head cannot hold);
 * - `<link rel=alternate hreflang>` wherever it stands; JSON-LD blocks wherever they stand;
 * - headings h1–h6 in document order, with their innermost landmark (`header nav main aside
 *   footer`, else `body`) and whether the heading itself is hidden (`hidden`, `aria-hidden`, a
 *   screen-reader-only class) — a crawler reads a hidden heading too, so it is kept and marked;
 * - `<img>` not `aria-hidden`, outside `<noscript>`/`<template>`/`<svg>`: counted, and those
 *   without an `alt` attribute or with an empty one named.
 * @param {unknown} html
 * @returns {HeadFacts}
 */
export function readHead(html) {
  const src = typeof html === 'string' ? html : ''
  const n = src.length
  /** @type {HeadFacts} */
  const facts = {
    titles: [],
    metas: [],
    canonical: [],
    hreflang: [],
    ld: [],
    ldCount: 0,
    headings: [],
    images: { total: 0, missingAlt: [], emptyAlt: [], missingCount: 0, emptyCount: 0 },
    headEnd: n
  }
  let inHead = true
  /** @param {number} at */
  const endHead = (at) => {
    if (!inHead) return
    inHead = false
    facts.headEnd = at
  }
  /** @type {string[]} */
  const landmarks = []
  /** @type {{ level: number, region: string, raw: string, hidden: boolean } | null} */
  let heading = null
  /** @param {string} s */
  const addText = (s) => {
    if (heading !== null && heading.raw.length < MAX_HEADING_RAW) heading.raw += s.slice(0, MAX_HEADING_RAW)
  }
  const closeHeading = () => {
    if (heading === null) return
    if (facts.headings.length < MAX_HEADINGS)
      facts.headings.push({
        level: heading.level,
        region: heading.region,
        text: clean(heading.raw),
        hidden: heading.hidden
      })
    heading = null
  }
  let i = 0
  while (i < n) {
    const lt = src.indexOf('<', i)
    if (lt === -1) {
      addText(src.slice(i))
      break
    }
    if (lt > i) addText(src.slice(i, lt))
    const t = markupAt(src, lt)
    if (t.kind === 'text') {
      addText('<')
      i = lt + 1
      continue
    }
    if (t.kind === 'skip') {
      i = t.end
      continue
    }
    i = t.end
    const name = t.name
    const a = t.attrs
    // A tag inside a heading parts its words ("Line one<br>line two" is two words, not one).
    addText(' ')
    if (t.close) {
      if (name === 'head') endHead(lt)
      else if (HEADING.test(name) || name === 'body' || name === 'html') closeHeading()
      else if (LANDMARKS.has(name)) {
        const k = landmarks.lastIndexOf(name)
        if (k !== -1) landmarks.length = k
      }
      continue
    }
    if (inHead && !HEAD_TAGS.has(name)) endHead(lt)
    if (HEADING.test(name)) {
      closeHeading()
      heading = {
        level: Number(name[1]),
        region: landmarks.at(-1) ?? 'body',
        raw: '',
        hidden:
          'hidden' in a ||
          String(a['aria-hidden'] ?? '').toLowerCase() === 'true' ||
          HIDE_CLASS.test(a.class ?? '')
      }
      continue
    }
    if (LANDMARKS.has(name)) {
      if (!t.selfClosed && landmarks.length < MAX_LANDMARK_DEPTH) landmarks.push(name)
      continue
    }
    if (name === 'meta') {
      const key = String(a.name || a.property || '')
        .trim()
        .toLowerCase()
      if (key !== '' && facts.metas.length < MAX_TAGS)
        facts.metas.push({ key, value: clean(a.content), inHead })
      continue
    }
    if (name === 'link') {
      const rel = String(a.rel ?? '')
        .toLowerCase()
        .split(/\s+/)
      if (rel.includes('canonical') && facts.canonical.length < MAX_TAGS)
        facts.canonical.push({ href: clean(a.href), inHead })
      if (rel.includes('alternate') && a.hreflang !== undefined && facts.hreflang.length < MAX_TAGS)
        facts.hreflang.push({ lang: clean(a.hreflang).toLowerCase(), href: clean(a.href) })
      continue
    }
    if (name === 'img') {
      if (String(a['aria-hidden'] ?? '').toLowerCase() === 'true') continue
      const img = facts.images
      img.total += 1
      const region = landmarks.at(-1) ?? 'body'
      if (!('alt' in a)) {
        img.missingCount += 1
        if (img.missingAlt.length < MAX_PICTURE_NAMES) img.missingAlt.push({ region, name: pictureName(a) })
      } else if (clean(a.alt) === '') {
        img.emptyCount += 1
        if (img.emptyAlt.length < MAX_PICTURE_NAMES) img.emptyAlt.push({ region, name: pictureName(a) })
      }
      continue
    }
    if (RAW_BODY.has(name) && !t.selfClosed) {
      const end = rawTextEnd(src, i, name)
      const stop = end === -1 ? n : end
      if (name === 'title' && facts.titles.length < MAX_TAGS)
        facts.titles.push({ text: clean(src.slice(i, stop)), inHead })
      else if (name === 'script' && LD_JSON.test(a.type ?? '')) {
        facts.ldCount += 1
        if (facts.ld.length < MAX_LD_BLOCKS)
          facts.ld.push({
            text: src.slice(i, Math.min(stop, i + MAX_LD_CHARS)),
            cut: stop - i > MAX_LD_CHARS
          })
      }
      if (end === -1) i = n
      else {
        const c = markupAt(src, end)
        i = c.kind === 'text' ? end + 1 : c.end
      }
    }
  }
  closeHeading()
  return facts
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The top nodes of the page's JSON-LD — each block's object, each member of an array or an
 * `@graph` — with how many blocks did not parse. Nested nodes stay inside their parent, where the
 * answer shows them (an Organization's `address` is read as `address.addressLocality`).
 * @param {HeadFacts} facts
 * @returns {{ nodes: Record<string, unknown>[], bad: number, cut: number }}
 */
export function jsonLdNodes(facts) {
  /** @type {Record<string, unknown>[]} */
  const nodes = []
  let bad = 0
  let cut = 0
  for (const block of facts.ld) {
    if (block.cut) {
      cut += 1
      continue
    }
    const text = block.text
      .trim()
      .replace(/^(?:\/\*\s*)?<!\[CDATA\[(?:\s*\*\/)?/, '')
      .replace(/(?:\/\*\s*)?\]\]>(?:\s*\*\/)?$/, '')
      .replace(/^<!--/, '')
      .replace(/-->$/, '')
      .trim()
    let value
    try {
      value = JSON.parse(text)
    } catch {
      bad += 1
      continue
    }
    /** @param {unknown} v */
    const take = (v) => {
      if (v === null || typeof v !== 'object') return
      if (Array.isArray(v)) {
        for (const x of v) take(x)
        return
      }
      const o = /** @type {Record<string, unknown>} */ (v)
      if (Array.isArray(o['@graph'])) {
        if (o['@type'] !== undefined) nodes.push(o)
        for (const x of o['@graph']) take(x)
        return
      }
      nodes.push(o)
    }
    take(value)
  }
  return { nodes, bad, cut }
}

/** A node's `@type`, without the schema.org prefix, as one string. */
const typeOf = (/** @type {unknown} */ o) => {
  const t =
    o && typeof o === 'object' && !Array.isArray(o)
      ? /** @type {Record<string, unknown>} */ (o)['@type']
      : undefined
  return [t ?? []]
    .flat()
    .map((x) => String(x).split(/[/#]/).pop())
    .join('/')
}

/**
 * @param {string} s
 * @param {number} max
 * @param {{ cut: boolean }} flag
 */
function cutText(s, max, flag) {
  if (s.length <= max) return s
  flag.cut = true
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

/**
 * One JSON-LD value as the answer shows it, `depth` levels of objects deep: scalars as they are
 * (strings cut at `max`), a list of scalars joined, a deeper object as `{Type}` or its key names, a
 * list of objects as its first three items (at the list's own depth: an FAQ's questions are its
 * `mainEntity` items) and `+N more`.
 * @param {unknown} v
 * @param {number} depth
 * @param {number} max
 * @param {{ cut: boolean }} flag
 * @returns {unknown}
 */
function ldValue(v, depth, max, flag) {
  if (v === null || typeof v !== 'object') return typeof v === 'string' ? cutText(v, max, flag) : v
  if (Array.isArray(v)) {
    if (v.every((x) => x === null || typeof x !== 'object')) return cutText(v.join(', '), max, flag)
    if (depth <= 0) {
      flag.cut = true
      const types = [...new Set(v.map(typeOf).filter(Boolean))].join('/')
      return `[${v.length}${types ? ` ${types}` : ''}]`
    }
    const shown = v.slice(0, 3).map((x) => ldValue(x, depth, max, flag))
    if (v.length > 3) {
      flag.cut = true
      shown.push(`+${v.length - 3} more`)
    }
    return shown
  }
  const o = /** @type {Record<string, unknown>} */ (v)
  if (depth <= 0) {
    flag.cut = true
    const t = typeOf(o)
    return t ? `{${t}}` : `{${Object.keys(o).slice(0, 6).join(', ')}}`
  }
  /** @type {Record<string, unknown>} */
  const out = {}
  let k = 0
  for (const [key, x] of Object.entries(o)) {
    if (key === '@context') continue
    if ((k += 1) > 16) {
      flag.cut = true
      break
    }
    out[key] = ldValue(x, depth - 1, max, flag)
  }
  return out
}

/**
 * The page's JSON-LD as one level of the answer shows it: a number is how many levels of objects
 * are shown with their values (1: the node's own values, every object under it as `{Type}`; 2: and
 * one level of objects under it, an address's locality; 3: a breadcrumb item's name too), `keys`
 * the node's key names, `types` its type alone.
 * @param {{ nodes: Record<string, unknown>[], bad: number, cut: number }} ld
 * @param {number | 'keys' | 'types'} how
 * @param {number} maxNodes
 * @param {{ cut: boolean }} flag
 * @returns {unknown[]}
 */
function renderLd(ld, how, maxNodes, flag) {
  /** @type {unknown[]} */
  const out = []
  for (const node of ld.nodes.slice(0, maxNodes)) {
    if (typeof how === 'number') out.push(ldValue(node, how, how > 1 ? 80 : 60, flag))
    else if (how === 'keys') {
      flag.cut = true
      out.push({
        '@type': typeOf(node) || null,
        keys: Object.keys(node).filter((k) => !k.startsWith('@'))
      })
    } else {
      flag.cut = true
      out.push(typeOf(node) || '(no @type)')
    }
  }
  if (ld.nodes.length > maxNodes) {
    flag.cut = true
    out.push(`+${ld.nodes.length - maxNodes} more`)
  }
  if (ld.bad > 0) out.push(`${ld.bad} block${ld.bad === 1 ? '' : 's'} not valid JSON`)
  if (ld.cut > 0) out.push(`${ld.cut} block${ld.cut === 1 ? '' : 's'} over 256 KB, not read`)
  return out
}

// ── The answer ───────────────────────────────────────────────────────────────────────────────────

/**
 * How tightly one answer is packed, loosest first: the first level whose answer fits the budget is
 * the one sent. The description, robots and canonical are never cut — they are what an SEO request
 * is about; the long lists (headings, pictures, JSON-LD values, hreflang pairs) give way first.
 */
/** @type {readonly { headings: number, htext: number, ld: number | 'keys' | 'types', ldNodes: number, pics: number, meta: number, other: boolean, hreflang: 'pairs' | 'langs' | 'count' }[]} */
const LEVELS = Object.freeze([
  { headings: 30, htext: 80, ld: 3, ldNodes: 8, pics: 10, meta: 200, other: true, hreflang: 'pairs' },
  { headings: 24, htext: 64, ld: 2, ldNodes: 6, pics: 8, meta: 160, other: true, hreflang: 'pairs' },
  { headings: 16, htext: 48, ld: 1, ldNodes: 6, pics: 5, meta: 120, other: false, hreflang: 'langs' },
  { headings: 10, htext: 40, ld: 'keys', ldNodes: 4, pics: 3, meta: 80, other: false, hreflang: 'langs' },
  { headings: 5, htext: 32, ld: 'types', ldNodes: 4, pics: 2, meta: 60, other: false, hreflang: 'count' },
  { headings: 0, htext: 0, ld: 'types', ldNodes: 2, pics: 0, meta: 40, other: false, hreflang: 'count' }
])

/** Meta names answered as fields of their own, so never repeated in `meta`. */
const OWN_FIELD = /^(description|robots|og:.*|twitter:.*)$/

/**
 * A link as the answer shows it: this site's own addresses as path+query, another site's in full.
 * @param {string} href
 * @param {ReadonlySet<string>} own
 */
function shortLink(href, own) {
  try {
    const u = new URL(href, 'http://page.invalid/')
    if (own.has(u.origin) || u.origin === 'http://page.invalid') return u.pathname + u.search
    return u.href
  } catch {
    return href
  }
}

/**
 * The values one field carries: those in `<head>` when it has any, else those in the page — the
 * rule the v6 oracle judges by (`lib/html.mjs` `metaValues`). One value is a string, several a list.
 * @template {{ inHead: boolean }} T
 * @param {readonly T[]} all
 * @param {(t: T) => string} value
 * @returns {string | string[] | null}
 */
function fieldValue(all, value) {
  const inHead = all.filter((t) => t.inHead)
  const list = (inHead.length > 0 ? inHead : all).map(value)
  if (list.length === 0) return null
  return list.length === 1 ? list[0] : list
}

/**
 * The tags one prefix (`og:`, `twitter:`) carries, in `<head>` when it has any, else in the page.
 * @param {HeadFacts} facts
 * @param {string} prefix
 */
function tagsOf(facts, prefix) {
  const inHead = facts.metas.filter((m) => m.inHead && m.key.startsWith(prefix))
  return inHead.length > 0 ? inHead : facts.metas.filter((m) => m.key.startsWith(prefix))
}

/**
 * The tags one prefix carries, as an object keyed without it; a key the page prints twice is a
 * list. A value that repeats one already in the answer is said as `(= <field>)` — the same fact in
 * a tenth of the characters (EmDash prints its description three times: `description`,
 * `og:description`, `twitter:description`).
 * @param {HeadFacts} facts
 * @param {string} prefix
 * @param {number} max
 * @param {{ cut: boolean }} flag
 * @param {(key: string, value: string) => string | null} sameAs
 */
function prefixed(facts, prefix, max, flag, sameAs) {
  const tags = tagsOf(facts, prefix)
  if (tags.length === 0) return null
  /** @type {Record<string, string | string[]>} */
  const out = {}
  for (const m of tags) {
    const key = m.key.slice(prefix.length)
    const v = sameAs(key, m.value) ?? cutText(m.value, max, flag)
    const had = out[key]
    out[key] = had === undefined ? v : [...(Array.isArray(had) ? had : [had]), v]
  }
  return out
}

/** Which pictures are named first: the page's own content before its chrome. */
const PICTURE_ORDER = Object.freeze(['main', 'body', 'aside', 'header', 'nav', 'footer'])

/**
 * Pictures as the answer names them — `<landmark> <file>`, the page's content first (a header's 40
 * language flags must not hide the one content picture without alt), a file repeated in one
 * landmark folded to `×N` — cut to `max` entries, the rest said as `+N more`.
 * @param {readonly HeadPicture[]} pictures
 * @param {number} count - how many there are (the kept list may already be shorter).
 * @param {number} max
 * @param {{ cut: boolean }} flag
 * @returns {string[]}
 */
function picturesUpTo(pictures, count, max, flag) {
  /** @type {Map<string, number>} */
  const seen = new Map()
  const rank = (/** @type {string} */ r) => {
    const k = PICTURE_ORDER.indexOf(r)
    return k === -1 ? PICTURE_ORDER.length : k
  }
  for (const p of [...pictures].sort((x, y) => rank(x.region) - rank(y.region))) {
    const key = `${p.region} ${p.name}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  /** @type {string[]} */
  const shown = []
  let named = 0
  for (const [key, times] of seen) {
    if (shown.length >= max) break
    shown.push(times > 1 ? `${key} ×${times}` : key)
    named += times
  }
  if (count > named) {
    flag.cut = true
    shown.push(`+${count - named} more`)
  }
  return shown
}

/**
 * The page's head at one packing level.
 * @param {HeadFacts} facts
 * @param {{ nodes: Record<string, unknown>[], bad: number, cut: number }} ld
 * @param {(typeof LEVELS)[number]} L
 * @param {ReadonlySet<string>} own
 * @returns {{ fields: Record<string, unknown>, cut: boolean }}
 */
function headFields(facts, ld, L, own) {
  const flag = { cut: false }
  const first = (/** @type {string | string[] | null} */ v) => (Array.isArray(v) ? v[0] : v)
  const guard = (/** @type {string | string[] | null} */ v) =>
    v === null ? null : Array.isArray(v) ? v.map((s) => cutText(s, 400, flag)) : cutText(v, 400, flag)
  const pick = (/** @type {string} */ key) =>
    fieldValue(
      facts.metas.filter((m) => m.key === key),
      (m) => m.value
    )
  const title = fieldValue(facts.titles, (t) => t.text)
  const description = pick('description')
  const t0 = first(title)
  const d0 = first(description)
  /** @type {Record<string, string>} the first value of each og: key, to say a twitter: repeat of it */
  const og0 = {}
  for (const m of tagsOf(facts, 'og:')) og0[m.key.slice(3)] ??= m.value
  const sameAs = (/** @type {string} */ _key, /** @type {string} */ value) =>
    value === '' ? null : value === d0 ? '(= description)' : value === t0 ? '(= title)' : null
  /** @type {Record<string, unknown>} */
  const fields = {
    description: guard(description),
    robots: guard(pick('robots')),
    canonical: guard(fieldValue(facts.canonical, (c) => c.href)),
    og: prefixed(facts, 'og:', L.meta, flag, sameAs),
    twitter: prefixed(
      facts,
      'twitter:',
      Math.min(L.meta, 100),
      flag,
      (key, value) => sameAs(key, value) ?? (value !== '' && og0[key] === value ? `(= og:${key})` : null)
    )
  }
  if (L.other) {
    /** @type {Record<string, string>} */
    const meta = {}
    let k = 0
    for (const m of facts.metas) {
      if (OWN_FIELD.test(m.key) || m.key in meta) continue
      if ((k += 1) > 12) {
        flag.cut = true
        break
      }
      meta[m.key] = cutText(m.value, 80, flag)
    }
    if (Object.keys(meta).length > 0) fields.meta = meta
  } else if (facts.metas.some((m) => !OWN_FIELD.test(m.key))) flag.cut = true
  // hreflang: "lang path" pairs while they fit, else the languages alone, else how many
  const hl = facts.hreflang
  if (hl.length === 0) fields.hreflang = null
  else {
    const pairs = hl.map((h) => `${h.lang} ${shortLink(h.href, own)}`).join(' · ')
    const langs = hl.map((h) => h.lang).join(' ')
    if (L.hreflang === 'pairs' && pairs.length <= 400) fields.hreflang = pairs
    else if (L.hreflang !== 'count' && langs.length <= 300) {
      if (pairs.length > langs.length) flag.cut = true
      fields.hreflang = `${hl.length}: ${langs}`
    } else {
      flag.cut = true
      fields.hreflang = `${hl.length}: ${cutText(langs, 60, flag)}`
    }
  }
  fields.jsonLd = renderLd(ld, L.ld, L.ldNodes, flag)
  // headings: "<landmark> h<n>[ (hidden)]: words", then what was left out, by level
  const hs = facts.headings
  const shownHeadings = hs
    .slice(0, L.headings)
    .map((h) => `${h.region} h${h.level}${h.hidden ? ' (hidden)' : ''}: ${cutText(h.text, L.htext, flag)}`)
  if (hs.length > L.headings) {
    flag.cut = true
    /** @type {Record<string, number>} */
    const left = {}
    for (const h of hs.slice(L.headings)) left[`h${h.level}`] = (left[`h${h.level}`] ?? 0) + 1
    shownHeadings.push(
      `+${hs.length - L.headings} more: ${Object.entries(left)
        .sort()
        .map(([k, v]) => `${k} ×${v}`)
        .join(', ')}`
    )
  }
  fields.headings = shownHeadings
  const img = facts.images
  fields.images = {
    total: img.total,
    missingAlt: picturesUpTo(img.missingAlt, img.missingCount, L.pics, flag),
    emptyAlt: picturesUpTo(img.emptyAlt, img.emptyCount, L.pics, flag)
  }
  /** @type {Record<string, number>} */
  const lengths = {}
  if (t0 !== null) lengths.title = [...t0].length
  if (d0 !== null) lengths.description = [...d0].length
  fields.lengths = lengths
  return { fields, cut: flag.cut }
}

/**
 * Where the words `match` asks for stand in the page's MARKUP — a verification tag, an analytics
 * id, a schema property: the tag that carries them, or the words around them in a script or a
 * style, each marked `head:` or `body:`. At most five, 160 characters each. Case-insensitive.
 * @param {string} src - the raw page.
 * @param {string} match
 * @param {number} headEnd
 * @returns {string[]}
 */
export function headHits(src, match, headEnd) {
  const needle = match.toLowerCase()
  if (needle === '') return []
  const hay = src.toLowerCase()
  // `toLowerCase` can change a string's length (`İ`); only then are offsets unsafe to share.
  if (hay.length !== src.length) return []
  /** @type {string[]} */
  const out = []
  let from = 0
  while (out.length < 5) {
    const at = hay.indexOf(needle, from)
    if (at === -1) break
    const lt = src.lastIndexOf('<', at)
    const gt = src.lastIndexOf('>', at - 1)
    let text
    let end
    if (lt !== -1 && lt > gt && at - lt <= 400) {
      // inside a tag: the tag itself, up to its `>`
      const close = src.indexOf('>', at)
      end = close === -1 ? Math.min(src.length, at + needle.length + 120) : close + 1
      text = src.slice(lt, Math.min(end, lt + 400))
    } else {
      end = Math.min(src.length, at + needle.length + 60)
      text = `…${src.slice(Math.max(0, at - 60), end)}…`
    }
    const one = text.replace(/\s+/g, ' ').trim()
    out.push(`${at < headEnd ? 'head' : 'body'}: ${one.length > 160 ? `${one.slice(0, 159)}…` : one}`)
    from = Math.max(end, at + needle.length)
  }
  return out
}

/**
 * The head fields of one page, packed into `cap` characters together with the rest of the answer
 * (`base`: url, path, lang, title…): the loosest level that fits, or the tightest. `cut` says
 * whether anything was left out or shortened.
 * @param {unknown} raw - the page as the server (or the browser) gave it, before taming.
 * @param {{ cap: number, base: Record<string, unknown>, pageUrl?: string,
 *   origins?: readonly (string | null | undefined)[], match?: string | null }} options
 * @returns {{ fields: Record<string, unknown>, cut: boolean, found: string[] | null }}
 */
export function headAnswer(raw, options) {
  const src = typeof raw === 'string' ? raw : ''
  const facts = readHead(src)
  const ld = jsonLdNodes(facts)
  /** @type {Set<string>} */
  const own = new Set()
  for (const o of [options.pageUrl, ...(options.origins ?? [])]) {
    try {
      if (typeof o === 'string' && o !== '') own.add(new URL(o).origin)
    } catch {
      // not an origin
    }
  }
  const found =
    typeof options.match === 'string' && options.match !== ''
      ? headHits(src, options.match, facts.headEnd)
      : null
  /** @type {{ fields: Record<string, unknown>, cut: boolean }} */
  let best = { fields: {}, cut: true }
  for (const L of LEVELS) {
    best = headFields(facts, ld, L, own)
    if (found !== null) best.fields.found = found
    if (JSON.stringify({ ...options.base, ...best.fields }).length <= options.cap) break
  }
  return { fields: best.fields, cut: best.cut, found }
}
