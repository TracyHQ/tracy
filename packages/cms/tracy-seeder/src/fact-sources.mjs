/**
 * 🔒 A BUSINESS FACT A COPY WRITER STATES MUST BE IN THE BRIEF (COO rule, 30/10/2026, spec TracyHQ/tracy#189).
 *   1. The SYSTEM checks every fact against the whole brief fact sheet (`brief-fact-sheet.js` of tracy-web, the business
 *      fields and the statistics), not the writer's citations: a fact the brief states anywhere passes, even when the writer
 *      cited no sourceId or a wrong one. The writer is still asked for `sources`, which are kept for the receipt.
 *   2. Only these are business facts: prices and money; a phone; an email; a web address; a street address; dates, years
 *      and opening hours; the names of people or partners; counts about this business (members, courts, years in
 *      business, coaches...); awards, certifications, rankings and guarantees.
 *   3. Trade knowledge with numbers is NOT a fact about the business ("padel is played 2 vs 2", "24/7", "1-on-1", "a
 *      60-minute session" as a generic format) unless it is phrased as this business's own offer with a price or a schedule.
 * A line with a business fact the brief does not state is sent back once, naming that fact, then refused. Explanatory copy
 * written from what the trade generally involves needs no source. CMS-neutral: every planner and writer uses it.
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
  ' BUSINESS FACTS: a price or amount of money, a phone, an email, a web address, a street address, a date, a year, ' +
  'opening hours, the name of a person or partner, a count about this business (its members, courts, coaches, years in ' +
  'business...), or an award, certification, ranking or guarantee, is written only when the brief states it (the business ' +
  'fields, "statistics" and the fact digest "brief.factSheet" or "facts.factSheet"). Never invent one: write the line ' +
  'without it. Trade knowledge with numbers ("played 2 vs 2", "open 24/7 in many cities", "1-on-1 coaching", "a ' +
  '60-minute session" as a format) and explanatory copy about what the trade generally involves are no business facts ' +
  'and are welcome. List in "sources" {"<key>": ["sourceId", ...]} at the top level of your JSON answer the sourceIds ' +
  '(each digest record\'s "sourceId"; a brief field by its name; the n-th of "statistics" is "statistic-n") of the ' +
  'business facts a line states.'

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
  /\b(?:award(?:s|ed|-winning)?|certified|certification|accredited|licen[cs]ed|insured|guarantee[ds]?|champions?|championship|olympic|top-rated|five-star|5-star|voted|ranked|number one|no\. ?1)\b|#1\b/giu
const EMAIL = /[\p{L}0-9._%+-]+@[\p{L}0-9-]+(?:\.[\p{L}0-9-]+)+/gu
const WEB = /\b(?:https?:\/\/|www\.)[^\s"')]+/giu
const NUMBER = /\d(?:[\d.,:/]*\d)?/gu
/** A phone: seven digits or more, with the spaces, dots, dashes and brackets phones are written with. */
const PHONE = /\+?\(?\d[\d\s().-]{5,}\d/gu
const CURRENCY =
  /(?:[$€£¥₹]|\b(?:AED|USD|EUR|GBP|SAR|QAR|CHF|CAD|AUD|INR|VND|dhs?|dirhams?|dollars?|euros?|pounds?)\b)/iu
const MONTH =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/iu
/** A unit after a number that makes it a format of the trade, not a count of the business ("60-minute", "2 vs 2"). */
const FORMAT_UNIT =
  /^[\s-]*(?:of\b|by\b|more\b|another\b|vs\.?|v\b|on\b|x\b|times?\b|minutes?|mins?\b|hours?|hrs?\b|seconds?|secs?\b|rounds?|sets?\b|reps?\b|repetitions|laps?\b|km\b|kms?\b|kilomet(?:er|re)s?|met(?:er|re)s?|m\b|cm\b|kg\b|kgs?\b|lbs?\b|pounds?\b|percent|%|degrees?|°|weeks?|days?|months?|steps?|levels?|stages?|players?|people|persons?|per\b|a\b|an\b|\/\s?7)/iu
/** Words that tie a count to this business ("we have", "our", "the club has"). */
const OWN =
  /\b(?:we|we've|we're|our|ours|us)\b|\b(?:has|have|had|counts?|employs?|operates?|runs?|owns?|boasts?|served|serves|trained|trains|coached|welcomed|hosted|opened|founded|established|since)\b/iu
const HOURS = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b\d{1,2}:\d{2}\b/giu

/** Numbers written as words, read as digits so one rule judges "eight courts" and "8 courts" alike. */
const NUMBER_WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  hundred: 100
})
const NUMBER_WORD = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'giu')
/** Words before "one" that make it a pronoun ("no one", "the one"), never a count. */
const PRONOUN_BEFORE = /\b(?:no|every|any|each|the|this|that|which|someone|anyone)\s+$/iu
/** A text with its number words as digits ("one-on-one" reads "1-on-1"). */
const numerals = (/** @type {string} */ text) =>
  String(text ?? '').replace(NUMBER_WORD, (word, _w, at, all) =>
    word.toLowerCase() === 'one' && PRONOUN_BEFORE.test(all.slice(Math.max(0, at - 12), at))
      ? word
      : String(NUMBER_WORDS[/** @type {keyof typeof NUMBER_WORDS} */ (word.toLowerCase())])
  )

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
 * Whether the number at `at` in `line` is a format of the trade (COO rule 3): a unit after it ("60-minute", "2 vs 2",
 * "1-on-1", "24/7", "per week") or a range ("3 to 8"). The one test both checks use: this module's and the planner's
 * count check.
 */
function isTradeFormat(/** @type {string} */ line, /** @type {string} */ m, /** @type {number} */ at) {
  const before = line.slice(Math.max(0, at - 12), at)
  const after = line.slice(at + m.length, at + m.length + 14)
  return (
    FORMAT_UNIT.test(after) ||
    // A frequency ("one session a week", "2 classes per day").
    /^\s*\p{L}+\s+(?:a|per|each|every)\s+(?:day|week|month|year)\b/iu.test(
      line.slice(at + m.length, at + m.length + 30)
    ) ||
    /^\s*(?:to|-|–|or|and)\s*\d/.test(after) ||
    // The second number of a pairing ("1-on-1", "2 vs 2", "1 to 1").
    /\d\s*(?:-\s*on\s*-|\s+on\s+|\s*vs\.?\s*|\s+v\s+)\s*$/iu.test(before) ||
    /\d\s*(?:to|-|–|or|and)\s*$/.test(before)
  )
}

/** Whether the number at `at` in `line` is a business fact (COO rule 2), or trade knowledge (rule 3). */
function isBusinessNumber(/** @type {string} */ line, /** @type {string} */ m, /** @type {number} */ at) {
  const before = line.slice(Math.max(0, at - 12), at)
  const after = line.slice(at + m.length, at + m.length + 14)
  // Money: a currency beside it, or an amount with cents ("90.00").
  if (CURRENCY.test(before.slice(-6)) || CURRENCY.test(after.slice(0, 9)) || /^\d+[.,]\d{2}$/.test(m))
    return true
  // A year, a date, a time of day.
  if (/^(?:19|20)\d{2}$/.test(m)) return true
  if (/[/.-]/.test(m) && /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(m)) return true
  if (MONTH.test(before.slice(-10)) || MONTH.test(after.slice(0, 11))) return true
  // Years in business or of experience ("for 25 years", "12+ years of coaching"), never an age ("6 years old").
  if (/^\+?\s+(?:years?|yrs?)\b(?!\s+old)/iu.test(after)) return true
  // A line that is only a figure (a counter: "32", "100k+", "95%") is a figure of this business.
  if (/^[\s+~]*\d[\d.,]*\s*(?:k|m|\+|%)*\s*\+?\s*$/iu.test(line)) return true
  // A format of the trade ("2 vs 2", "24/7", "1-on-1", "60-minute", "3 to 8"): no fact about the business.
  if (isTradeFormat(line, m, at)) return false
  // A web error code ("its 404 page") is no figure of the business.
  if (/^[45]0\d$/.test(m) && /^\s*(?:page|error|not found)/iu.test(after)) return false
  // A count of the business: tied to it in the same clause ("the club has 6 courts", "we coached 300 members").
  const clause = line.slice(Math.max(0, line.lastIndexOf('.', at) + 1), at)
  return OWN.test(clause)
}

/**
 * The business facts one line states (COO rule, header), or none for explanatory copy and trade knowledge.
 * @param {string} value @param {{site?: any, slot?: any}} [context]
 * @returns {Array<{kind: 'number' | 'phone' | 'email' | 'web' | 'name' | 'claim' | 'time', text: string}>}
 */
export function specificFacts(value, { site = null, slot = null } = {}) {
  const line = numerals(plain(value))
  const own = String(site?.name ?? '')
  /** @type {Array<{kind: any, text: string}>} */
  const out = []
  const keep = (/** @type {any} */ kind) => (/** @type {string} */ m) => (
    out.push({ kind, text: m.trim() }), ' '
  )
  let rest = line.replace(EMAIL, keep('email')).replace(WEB, keep('web'))
  rest = rest.replace(PHONE, (m) => ((m.match(/\d/g) ?? []).length >= 7 ? keep('phone')(m) : m))
  rest = rest.replace(HOURS, keep('time'))
  for (const match of rest.matchAll(NUMBER)) {
    const m = match[0]
    // A card's own ordinal ("2" on the second of three steps) and a number in the business's own name are no claims.
    if (Number(m) === Number(slot?.item?.n)) continue
    if (own && own.includes(m)) continue
    if (isBusinessNumber(rest, m, match.index ?? 0)) out.push({ kind: 'number', text: m })
  }
  for (const name of peopleOf(site))
    if (new RegExp(`(?<![\\p{L}])${escape(name.trim())}(?![\\p{L}])`, 'iu').test(rest))
      out.push({ kind: 'name', text: name.trim() })
  for (const m of rest.match(CLAIM) ?? []) out.push({ kind: 'claim', text: m })
  return out
}

/**
 * Whether a count the planner's count check found ("one coach", "8 courts", before a word the brief uses for its people,
 * places or offerings) is a count of the business under the rule: yes unless every place it is said is a format of the
 * trade (`isTradeFormat`: "one-on-one", "two vs two", "one session per week").
 * @param {string} value @param {number} n
 */
export function isBusinessCount(value, n) {
  const line = numerals(plain(value))
  return [...line.matchAll(NUMBER)].some(
    (match) => amountOf(match[0]) === n && !isTradeFormat(line, match[0], match.index ?? 0)
  )
}

const digitsOf = (/** @type {string} */ s) => s.replace(/\D+/g, '')
/** A number as a value: "1,200" and "1200" are one, "90.00" and "90" are one. */
const amountOf = (/** @type {string} */ s) => {
  const n = Number(s.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const webOf = (/** @type {string} */ s) =>
  s
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/.]+$/, '')

/** Does a source text state this fact? */
function states(/** @type {string} */ text, /** @type {{kind: string, text: string}} */ fact) {
  const lower = text.toLowerCase()
  if (fact.kind === 'number') {
    const want = amountOf(fact.text)
    return (numerals(text).match(NUMBER) ?? []).some(
      (n) => n === fact.text || (want !== null && amountOf(n) === want)
    )
  }
  if (fact.kind === 'phone') {
    const want = digitsOf(fact.text)
    return (text.match(PHONE) ?? []).some((p) => {
      const have = digitsOf(p)
      return have.length >= 7 && (have.endsWith(want) || want.endsWith(have))
    })
  }
  if (fact.kind === 'web') {
    const want = webOf(fact.text)
    return (text.match(WEB) ?? []).some((w) => webOf(w) === want) || lower.includes(want)
  }
  if (fact.kind === 'time')
    return lower.replace(/\s+/g, '').includes(fact.text.toLowerCase().replace(/\s+/g, ''))
  if (fact.kind === 'claim') return lower.includes(fact.text.toLowerCase().slice(0, 5))
  return lower.includes(fact.text.toLowerCase())
}

/**
 * The lines with a business fact the brief does not state, each with those facts (COO rule 1: checked against the whole
 * brief, the writer's citations aside).
 * @param {{slots: Array<{key: string, item?: any}>, values: Record<string, unknown>, sources?: Record<string, unknown>, site: any, texts?: Map<string, string>}} input
 * @returns {Array<{key: string, facts: string[]}>}
 */
export function unsourcedLines({ slots, values, site, texts = sourceTexts(site) }) {
  const brief = [...texts.values()].join(' \n ')
  const out = []
  for (const slot of slots) {
    const value = values?.[slot.key]
    if (typeof value !== 'string' || !value.trim()) continue
    const facts = specificFacts(value, { site, slot })
    if (facts.length === 0) continue
    const left = facts.filter((f) => !states(brief, f)).map((f) => f.text)
    if (left.length) out.push({ key: slot.key, facts: [...new Set(left)] })
  }
  return out
}

/**
 * The business facts a line states that a source text does not (COO rule, header): the one check every later copy writer
 * of the copy step uses (record pages, sibling lists, offering descriptions), given the business's own words as text.
 * @param {unknown} value @param {unknown} sourceText @param {any} [site]
 * @returns {string[]}
 */
export function factsNotIn(value, sourceText, site = null) {
  const text = String(sourceText ?? '')
  return [
    ...new Set(
      specificFacts(String(value ?? ''), { site })
        .filter((f) => !states(text, f))
        .map((f) => f.text)
    )
  ]
}

/**
 * The sourceIds of the brief that state the business facts of a line: what the receipt keeps, whatever the writer cited.
 * @param {string} value @param {any} site @param {Map<string, string>} [texts]
 */
export function factSourceIds(value, site, texts = sourceTexts(site)) {
  const facts = specificFacts(value, { site })
  return [...texts.entries()].filter(([, text]) => facts.some((f) => states(text, f))).map(([id]) => id)
}

/**
 * The sentence a writer is sent back with for its unsourced lines.
 * @param {Array<{key: string, facts: string[]}>} lines
 */
export function sourceComplaint(lines) {
  return (
    `These values state a business fact the brief does not state: ${lines
      .slice(0, 12)
      .map((l) => `${l.key} (${l.facts.slice(0, 3).join(', ')})`)
      .join(
        '; '
      )}. Rewrite each one without that fact: keep the line's job and length, and write about what the trade ` +
    'generally involves instead. Never put another number, name or claim in its place unless the brief states it. ' +
    'Answer every key again in the same JSON shape.'
  )
}

/**
 * The valid sourceIds of a list: the ones the brief has.
 * @param {unknown} ids @param {Map<string, string>} texts
 */
export function knownSources(ids, texts) {
  return [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id).replace(/^(?:brief|facts)\.(?:factSheet\.)?/, ''))
        .filter((id) => texts.has(id))
    )
  ]
}
