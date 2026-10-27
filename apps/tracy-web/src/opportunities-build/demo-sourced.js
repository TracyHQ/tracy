/**
 * `research-sourced`: an email, phone or price a demo build wrote is one the research has (Fern Hollow / ja-fresco,
 * 24/10/2026: an invented reservation email and AED prices passed every check). Judged on the native inventory,
 * before and after the build: a value the template already had is not this check's (`no-demo-words` judges it).
 */

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?!(?:png|jpe?g|gif|webp|svg|avif)\b)[a-z]{2,}/gi
/** An international number as text or a `tel:` link's: local numbers without `+` are too like ids to judge. */
const PHONE = /(?:tel:\s*)?\+\d[\d\s().-]{6,}\d/g
const CURRENCY = 'AED|USD|EUR|GBP|VND|SGD|AUD|THB|[$€£¥₫]'
// A price stands as a word of its own: inside an id ("…4268aed…", a picture's media id) a run of digits before
// letters is no price (local round 23, 25/10/2026: an EmDash hero_image read as 4268 AED).
const PRICE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(?:${CURRENCY})\\s?(\\d[\\d.,]*\\d|\\d)(?![\\p{L}\\p{N}]))|(?<![\\p{L}\\p{N}])(?:(\\d[\\d.,]*\\d|\\d)\\s?(?:${CURRENCY}|\\u0111)(?![\\p{L}\\p{N}]))`,
  'giu'
)
const NUMBER = /\d[\d.,]*\d|\d/g
const DETAIL_MAX = 20

const digits = (s) => String(s).replace(/\D/g, '')
/** "1.200", "1,200" and "1200" are one amount; "12.50" and "12,50" another. */
function amount(text) {
  const s = String(text).replace(/\s/g, '')
  const n = /^\d{1,3}(?:[.,]\d{3})+$/.test(s) ? s.replace(/[.,]/g, '') : s.replace(',', '.')
  const value = Number.parseFloat(n)
  return Number.isFinite(value) ? String(value) : null
}

function* strings(value, field = null) {
  if (typeof value === 'string') yield { field, text: value }
  else if (Array.isArray(value)) for (const item of value) yield* strings(item, field)
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) yield* strings(item, field ?? key)
}

/** Each email, phone and price in one text, by kind, with the key it is compared by. */
function valuesIn(text) {
  const out = []
  for (const m of text.matchAll(EMAIL)) out.push({ what: 'email', value: m[0], key: m[0].toLowerCase() })
  for (const m of text.matchAll(PHONE)) {
    const value = m[0].replace(/^tel:\s*/i, '')
    if (digits(value).length >= 8) out.push({ what: 'phone', value, key: digits(value).slice(-8) })
  }
  for (const m of text.matchAll(PRICE)) {
    const key = amount(m[1] ?? m[2])
    if (key) out.push({ what: 'price', value: m[0].trim(), key })
  }
  return out
}

/** The full amount of each price the research printed in thousands (`priceScale`): "110" stands for 110,000 too. */
function* scaledAmounts(value) {
  if (Array.isArray(value)) for (const item of value) yield* scaledAmounts(item)
  else if (value && typeof value === 'object') {
    const scale = Number(value.priceScale)
    const printed = typeof value.price === 'string' ? amount(value.price.replace(/[^\d.,]/g, '')) : null
    if (Number.isInteger(scale) && scale > 1 && printed !== null) yield String(Number(printed) * scale)
    for (const item of Object.values(value)) yield* scaledAmounts(item)
  }
}

function keysOf(texts) {
  const keys = new Set()
  for (const text of texts) {
    for (const v of valuesIn(text)) keys.add(`${v.what} ${v.key}`)
    // The research's own numbers are its prices whatever currency wording surrounds them.
    for (const m of text.matchAll(NUMBER)) keys.add(`price ${amount(m[0])}`)
    for (const m of text.matchAll(EMAIL)) keys.add(`email ${m[0].toLowerCase()}`)
    const run = digits(text)
    for (let i = 0; i + 8 <= run.length; i++) keys.add(`phone ${run.slice(i, i + 8)}`)
  }
  return keys
}

/**
 * @param {{ complete?: boolean, records?: any[] }} before - the frozen starting inventory.
 * @param {{ complete?: boolean, records?: any[] }} after - the inventory the check just read.
 * @param {unknown} research - the frozen research bundle (and the brief's business), as JSON.
 */
export function checkResearchSourced(before, after, research) {
  const id = 'research-sourced'
  if (!before?.complete || !after?.complete)
    return { id, pass: false, skipped: true, detail: 'The native inventory is incomplete.' }
  const template = new Set()
  for (const r of before.records ?? [])
    for (const { text } of strings(r.data)) for (const v of valuesIn(text)) template.add(`${v.what} ${v.key}`)
  const sourced = keysOf([...strings(research)].map((s) => s.text))
  for (const full of scaledAmounts(research)) sourced.add(`price ${full}`)
  const detail = []
  const seen = new Set()
  for (const r of after.records ?? [])
    for (const { field, text } of strings(r.data))
      for (const v of valuesIn(text)) {
        const key = `${v.what} ${v.key}`
        if (template.has(key) || sourced.has(key) || seen.has(key)) continue
        seen.add(key)
        detail.push({ code: 'RESEARCH_UNSOURCED', what: v.what, value: v.value, record: r.key, field })
      }
  return {
    id,
    pass: detail.length === 0,
    measured: `${detail.length} emails, phones or prices the research does not have`,
    expected: 'every email, phone and price the build wrote is one the research collected',
    ...(detail.length
      ? {
          repair:
            'Each value below is not in the research: replace it with the collected one, or remove the sentence that offers it. Never invent an email, a phone number or a price; a dish with no collected price shows none.',
          detail: detail.slice(0, DETAIL_MAX)
        }
      : {})
  }
}
