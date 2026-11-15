/**
 * Helpers of `door-measures-escapes.mjs`: the probe value written at a place, every place a page prints it, and the
 * form it prints in there (as stored, escaped, or otherwise changed). Pure.
 *
 * A probe is `zqs<id>0` + PAYLOAD + `zqe<id>0`, where `<id>` is letters only and the `0` ends the mark (so no mark is
 * the start of another), and the marks survive every escaping and every filter that keeps words. The payload holds a straight double and single quote, `<`, `>`, `&`, a decimal
 * character reference, a JA ACM marker and a legacy named reference without its semicolon.
 */

export const PAYLOAD = `"'<>&|&#169;|((x))|&copy 2026|`
/** The payloads tried in turn at a place whose door refuses some characters (the contract): full, then fewer. */
export const FALLBACK_PAYLOADS = [
  ['full', PAYLOAD],
  ['no double quote', `'<>&|&#169;|((x))|&copy 2026|`],
  ['no double quote, no angle brackets', `'&|&#169;|((x))|&copy 2026|`],
  ['single quote and ampersand', `'&|&copy 2026|`],
  ['words only', ` a b `]
]

const letters = (n) => {
  let s = ''
  let k = n
  do {
    s = String.fromCharCode(97 + (k % 26)) + s
    k = Math.floor(k / 26) - 1
  } while (k >= 0)
  return s
}

/** A source of probe ids, one per place: `next('article.title')` gives `{id, value}`. */
export function probes(payload = PAYLOAD) {
  let n = 0
  const made = new Map()
  const next = (place, body = payload) => {
    const id = letters(n++)
    const value = `zqs${id}0${body}zqe${id}0`
    made.set(id, { place, value })
    return { id, value }
  }
  return { next, made }
}

/** `htmlspecialchars($text, $flags)`: ENT_QUOTES (both quotes) or ENT_COMPAT (double only); double encode or not. */
export function hsc(text, { quotes = true, doubleEncode = true } = {}) {
  let out = String(text)
  out = doubleEncode
    ? out.replace(/&/g, '&amp;')
    : out.replace(/&(?!(#\d+|#x[\da-f]+|[a-z][a-z\d]*);)/gi, '&amp;')
  out = out.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return quotes ? out.replace(/'/g, '&#039;') : out
}

/** The forms a stored segment may print in, by name; the first equal one names the print. */
export function formsOf(stored) {
  const s = String(stored)
  const json = JSON.stringify(s).slice(1, -1)
  return [
    ['raw', s],
    ['escaped', hsc(s)],
    ['escaped-double-quote-only', hsc(s, { quotes: false })],
    ['escaped-references-kept', hsc(s, { doubleEncode: false })],
    ['escaped-double-quote-only-references-kept', hsc(s, { quotes: false, doubleEncode: false })],
    ['escaped-twice', hsc(hsc(s))],
    ['escaped-twice-double-quote-only', hsc(hsc(s, { quotes: false }), { quotes: false })],
    ['json', json],
    ['json-slashes', json.replace(/\//g, '\\/')]
  ]
}

/** The name of the form `printed` is of `stored`, or `other`. */
export function formOf(printed, stored) {
  if (printed === null) return 'cut'
  for (const [name, value] of formsOf(stored)) if (value === printed) return name
  return 'other'
}

const lastIndex = (html, re, before) => {
  let at = -1
  for (const m of html.slice(0, before).matchAll(re)) at = m.index
  return at
}

/** Where in the page an offset sits: the raw text element, the tag and attribute, the T4 section. */
export function contextAt(html, at) {
  const section = [...html.slice(0, at).matchAll(/id="t4-([a-z0-9-]+)"/g)].at(-1)?.[1] ?? null
  const modules = [...html.slice(0, at).matchAll(/id="Mod(\d+)"/g)].at(-1)?.[1] ?? null
  for (const element of ['title', 'script', 'textarea', 'style']) {
    const open = lastIndex(html, new RegExp(`<${element}\\b`, 'gi'), at)
    const close = lastIndex(html, new RegExp(`</${element}\\s*>`, 'gi'), at)
    if (open > close) {
      const tag = html.slice(open, html.indexOf('>', open) + 1)
      return { context: element, tag: tag.slice(0, 120), section, module: modules }
    }
  }
  const lt = html.lastIndexOf('<', at)
  const gt = html.lastIndexOf('>', at)
  if (lt > gt) {
    const head = html.slice(lt, at)
    const tag = head.match(/^<([a-zA-Z][\w-]*)/)?.[1] ?? '?'
    const attribute = head.match(/([\w:.-]+)\s*=\s*["']?[^"'=]*$/)?.[1] ?? '?'
    const named = html
      .slice(lt, lt + 400)
      .match(/\b(name|property|itemprop)="([^"]*)"/)
      ?.slice(1)
      .join('=')
    return { context: 'attribute', tag, attribute, ...(named ? { named } : {}), section, module: modules }
  }
  const open = [...html.slice(0, at).matchAll(/<([a-zA-Z][\w-]*)([^<>]*)>/g)].at(-1)
  const cls = open?.[2]?.match(/class="([^"]*)"/)?.[1]
  return {
    context: 'text',
    tag: open ? `${open[1]}${cls ? `.${cls.trim().split(/\s+/).join('.')}` : ''}` : '?',
    section,
    module: modules
  }
}

/**
 * Every place `html` prints probe `id`: its context, the segment between the marks, and its form against `stored`
 * (the value the record holds, read back; the part between the marks is compared).
 */
export function printsOf(html, id, stored) {
  const text = String(html ?? '')
  const start = `zqs${id}0`
  const end = `zqe${id}0`
  const storedText = String(stored ?? '')
  const s0 = storedText.indexOf(start)
  const s1 = storedText.indexOf(end)
  const storedSegment = s0 >= 0 && s1 > s0 ? storedText.slice(s0 + start.length, s1) : null
  const out = []
  let at = text.indexOf(start)
  while (at >= 0) {
    const from = at + start.length
    const stop = text.indexOf(end, from)
    const segment = stop >= 0 && stop - from < 400 ? text.slice(from, stop) : null
    out.push({
      ...contextAt(text, at),
      segment,
      form: storedSegment === null ? 'stored-changed' : formOf(segment, storedSegment)
    })
    at = text.indexOf(start, from)
  }
  return out
}

/** The prints of a probe summed up per context and form: `{"text:raw": 2, "attribute alt:escaped": 1}`. */
export function summary(prints) {
  const out = {}
  for (const p of prints) {
    const where =
      p.context === 'attribute'
        ? `attribute ${p.attribute}${p.named ? ` (${p.named})` : ''}`
        : p.context === 'text'
          ? `text ${p.tag}`
          : p.context
    const key = `${where} [${p.section ?? 'no section'}]: ${p.form}`
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}
