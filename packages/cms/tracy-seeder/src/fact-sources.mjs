/**
 * 🔒 EVERY SPECIFIC FACT A COPY WRITER STATES NAMES ITS SOURCE IN THE BRIEF (COO, 30/10/2026, spec TracyHQ/tracy#189). The
 * writer is given the brief's fact digest (`brief-fact-sheet.js` of tracy-web: every record with a `sourceId`) and answers,
 * beside its words, the sourceIds each line rests on. A line that states a specific fact (a price, a person's name, a
 * number, a date, an address, a phone, an email, a web address, a claim such as an award or a certification) is kept only
 * when a source it cites states that fact; otherwise it is sent back once, then refused. Explanatory copy written from what
 * the trade generally involves states no specific fact and needs no source. CMS-neutral: every planner and writer uses it.
 */

/** The fields of the brief itself that are a source by their own name. */
export const BRIEF_FIELDS = [
  'name',
  'about',
  'phone',
  'email',
  'address',
  'hours',
  'contact',
  'details',
  'social'
]

/** Said to every writer whose input carries a fact digest. */
export const SOURCE_RULE =
  ' SOURCES: every record of the fact digest ("brief.factSheet", or "facts.factSheet") carries a "sourceId"; a field of ' +
  "the brief itself (name, about, phone, email, address, hours, contact, details, social, and the digest's own fields " +
  'such as logoReads or serviceAreas) is a source by its field name, and the n-th of "statistics" is "statistic-n". A ' +
  'value that states a specific fact (a price, the name of a person, a number, a date or year, an address, a phone, an ' +
  'email, a web address, or a claim such as an award, a certification, a licence or a guarantee) must rest on the brief: ' +
  'list the sourceIds that state it in "sources" {"<key>": ["sourceId", ...]} at the top level of your JSON answer. A ' +
  'specific fact no source states is never written: write the line without it. Explanatory copy about what the trade ' +
  'generally involves states no specific fact and needs no source.'

/** Said to every writer whose brief carries the site direction. */
export const DIRECTION_RULE =
  ' DIRECTION: "brief.direction" (or "direction") is the direction written once for this whole site from its brief: write ' +
  'in its "voice"; on each page lead with what that page\'s entry says ("pageDirection" holds the entries of the pages ' +
  'this call writes), and state a fact on the page the direction gives it to.'

const strings = (/** @type {unknown} */ value) =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(strings)
        : typeof value === 'number'
          ? [String(value)]
          : []

/**
 * Every source of a site's brief, by sourceId, as the text it states.
 * @param {any} site - the brief the writers are given (`siteBlock` with `factSheet` and `statistics`)
 * @returns {Map<string, string>}
 */
export function sourceTexts(site) {
  /** @type {Map<string, string>} */
  const out = new Map()
  const add = (/** @type {string} */ id, /** @type {unknown} */ value) => {
    const text = strings(value).join(' \n ')
    if (text.trim()) out.set(id, [out.get(id), text].filter(Boolean).join(' \n '))
  }
  for (const field of BRIEF_FIELDS) if (site?.[field] !== undefined) add(field, site[field])
  ;(Array.isArray(site?.statistics) ? site.statistics : []).forEach((s, i) => add(`statistic-${i + 1}`, s))
  const walk = (/** @type {any} */ record) => {
    if (Array.isArray(record)) return record.forEach(walk)
    if (!record || typeof record !== 'object') return
    if (typeof record.sourceId === 'string') add(record.sourceId, { ...record, sourceId: undefined })
    for (const value of Object.values(record)) if (value && typeof value === 'object') walk(value)
  }
  const sheet = site?.factSheet
  if (sheet && typeof sheet === 'object')
    for (const [field, value] of Object.entries(sheet)) {
      if (field === 'otherOfferings') continue
      if (typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string')))
        add(field, value)
      else walk(value)
    }
  return out
}

const CLAIM =
  /\b(?:award(?:s|ed|-winning)?|certified|certification|accredited|licen[cs]ed|insured|guarantee[ds]?|champions?|championship|olympic|top-rated|five-star|5-star)\b/giu
const EMAIL = /[\p{L}0-9._%+-]+@[\p{L}0-9-]+(?:\.[\p{L}0-9-]+)+/gu
const WEB = /\b(?:https?:\/\/|www\.)[^\s"')]+/giu
const NUMBER = /\d(?:[\d.,:/]*\d)?/gu

/** A line as a visitor reads it: no markup (`<h2>`, `((h2))`), no style marks (`[[`, `]]`, `[[br]]`). */
const plain = (/** @type {string} */ value) =>
  String(value ?? '')
    .replace(/\(\([^)]*\)\)/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[\[br\]\]/g, ' ')
    .replace(/\[\[|\]\]/g, '')

/** The names of people the brief carries: its team and its reviewers. */
const peopleOf = (/** @type {any} */ site) =>
  [
    ...(site?.factSheet?.people ?? []).map((/** @type {any} */ p) => p?.name),
    ...(site?.factSheet?.reviews ?? []).map((/** @type {any} */ r) => r?.author)
  ].filter((n) => typeof n === 'string' && n.trim().length >= 2)

const escape = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The specific facts one line states, or none for explanatory copy.
 * @param {string} value @param {{site?: any, slot?: any}} [context]
 * @returns {Array<{kind: 'number' | 'email' | 'web' | 'name' | 'claim', text: string}>}
 */
export function specificFacts(value, { site = null, slot = null } = {}) {
  const line = plain(value)
  const own = String(site?.name ?? '')
  /** @type {Array<{kind: any, text: string}>} */
  const out = []
  const rest = line
    .replace(EMAIL, (m) => (out.push({ kind: 'email', text: m }), ' '))
    .replace(WEB, (m) => {
      out.push({ kind: 'web', text: m })
      return ' '
    })
  for (const m of rest.match(NUMBER) ?? []) {
    // A card's own ordinal ("2" on the second of three steps) and a number in the business's own name are no claims.
    if (Number(m) === Number(slot?.item?.n)) continue
    if (own && own.includes(m)) continue
    out.push({ kind: 'number', text: m })
  }
  for (const name of peopleOf(site))
    if (new RegExp(`(?<![\\p{L}])${escape(name.trim())}(?![\\p{L}])`, 'iu').test(rest))
      out.push({ kind: 'name', text: name.trim() })
  for (const m of rest.match(CLAIM) ?? []) out.push({ kind: 'claim', text: m })
  return out
}

/** Does a cited source text state this fact? */
function states(/** @type {string} */ text, /** @type {{kind: string, text: string}} */ fact) {
  const lower = text.toLowerCase()
  if (fact.kind === 'number') {
    const digits = fact.text.replace(/\D+/g, '')
    return (
      lower.includes(fact.text.toLowerCase()) ||
      (text.match(NUMBER) ?? []).some((n) => n.replace(/\D+/g, '').includes(digits))
    )
  }
  if (fact.kind === 'claim') return lower.includes(fact.text.toLowerCase().slice(0, 5))
  return lower.includes(fact.text.toLowerCase())
}

/**
 * The lines whose specific facts no source they cite states: each with the facts left without one.
 * @param {{slots: Array<{key: string, item?: any}>, values: Record<string, unknown>, sources?: Record<string, unknown>, site: any, texts?: Map<string, string>}} input
 * @returns {Array<{key: string, facts: string[]}>}
 */
export function unsourcedLines({ slots, values, sources = {}, site, texts = sourceTexts(site) }) {
  const out = []
  for (const slot of slots) {
    const value = values?.[slot.key]
    if (typeof value !== 'string' || !value.trim()) continue
    const facts = specificFacts(value, { site, slot })
    if (facts.length === 0) continue
    const cited = (Array.isArray(sources?.[slot.key]) ? /** @type {unknown[]} */ (sources[slot.key]) : [])
      .map((id) => texts.get(String(id)))
      .filter((t) => typeof t === 'string')
      .join(' \n ')
    const left = facts.filter((f) => !states(cited, f)).map((f) => f.text)
    if (left.length) out.push({ key: slot.key, facts: [...new Set(left)] })
  }
  return out
}

/**
 * The sentence a writer is sent back with for its unsourced lines.
 * @param {Array<{key: string, facts: string[]}>} lines
 */
export function sourceComplaint(lines) {
  return (
    `These values state a specific fact that no source you cited states: ${lines
      .slice(0, 12)
      .map((l) => `${l.key} (${l.facts.slice(0, 3).join(', ')})`)
      .join(
        '; '
      )}. Rewrite each one: list in "sources" the sourceIds of the brief records that state the fact, or write ` +
    'the line without it. Answer every key again in the same JSON shape.'
  )
}

/**
 * The valid sourceIds of a list: the ones the brief has.
 * @param {unknown} ids @param {Map<string, string>} texts
 */
export function knownSources(ids, texts) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(String).filter((id) => texts.has(id)))]
}
