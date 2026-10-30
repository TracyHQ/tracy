// One style sheet per site (spec TracyHQ/tracy#189, COO criterion 1.6, 30/10/2026): the whole site speaks one spelling
// (British or American English), one casing of headings and buttons, one way of writing phones, prices and hours. It is
// chosen ONCE, at plan time, from the brief's own words, and given to every writer (page copy, offering lines, record
// pages, card bodies, bands, buttons, menus); every written line then passes `inSiteSpelling`, so a writer that drifts
// ("Personalised" on a site that says "Personalized") is brought back to the site's spelling, never shown mixed.
//
// 🔒 CHOSEN FROM THE BRIEF'S OWN TEXT: the spelling the business itself writes wins; with no telling word, its country
// decides; with neither, British English (the template sources' own en-GB). Names are never respelt (`keep`).
// 🔒 RULES BY WORD FAMILY, never by template, trade or business. CMS-neutral: pure functions, no model, no site.

/** British and American forms of one word, by stem; inflections are the stem plus one of `SUFFIXES`. */
const PAIRS = [
  ['colour', 'color'],
  ['favour', 'favor'],
  ['favourite', 'favorite'],
  ['flavour', 'flavor'],
  ['honour', 'honor'],
  ['humour', 'humor'],
  ['labour', 'labor'],
  ['neighbour', 'neighbor'],
  ['neighbourhood', 'neighborhood'],
  ['behaviour', 'behavior'],
  ['harbour', 'harbor'],
  ['rumour', 'rumor'],
  ['savour', 'savor'],
  ['vigour', 'vigor'],
  ['odour', 'odor'],
  ['armour', 'armor'],
  ['parlour', 'parlor'],
  ['endeavour', 'endeavor'],
  ['centre', 'center'],
  ['theatre', 'theater'],
  ['litre', 'liter'],
  ['fibre', 'fiber'],
  ['calibre', 'caliber'],
  ['sombre', 'somber'],
  ['lustre', 'luster'],
  ['jewellery', 'jewelry'],
  ['grey', 'gray'],
  ['defence', 'defense'],
  ['offence', 'offense'],
  ['catalogue', 'catalog'],
  ['travelled', 'traveled'],
  ['travelling', 'traveling'],
  ['traveller', 'traveler'],
  ['cancelled', 'canceled'],
  ['cancelling', 'canceling'],
  ['modelling', 'modeling'],
  ['modelled', 'modeled'],
  ['labelled', 'labeled'],
  ['labelling', 'labeling'],
  ['counselling', 'counseling'],
  ['counsellor', 'counselor'],
  ['jeweller', 'jeweler'],
  ['enrolment', 'enrollment'],
  ['fulfil', 'fulfill'],
  ['skilful', 'skillful'],
  ['mould', 'mold'],
  ['plough', 'plow'],
  ['aluminium', 'aluminum'],
  ['manoeuvre', 'maneuver'],
  ['paediatric', 'pediatric'],
  ['orthopaedic', 'orthopedic'],
  ['anaesthetic', 'anesthetic'],
  ['analyse', 'analyze'],
  ['paralyse', 'paralyze'],
  ['catalyse', 'catalyze']
]
const SUFFIXES = [
  '',
  's',
  'd',
  'ed',
  'ing',
  'ful',
  'fully',
  'less',
  'able',
  'ably',
  'ist',
  'ists',
  'er',
  'ers',
  'r'
]
const BRITISH = new Map()
const AMERICAN = new Map()
for (const [gb, us] of PAIRS)
  for (const end of SUFFIXES) {
    if (!BRITISH.has(gb + end)) BRITISH.set(gb + end, us + end)
    if (!AMERICAN.has(us + end)) AMERICAN.set(us + end, gb + end)
  }

/** Words spelt -ise in both Englishes: never respelt -ize. */
const BOTH_ISE = new Set(
  (
    'advertise advise apprise arise chastise circumcise comprise compromise concise demise despise devise disguise ' +
    'enterprise excise exercise expertise franchise guise improvise incise merchandise otherwise paradise poise praise ' +
    'precise premise promise raise reprise revise rise supervise surmise surprise televise treatise wise likewise ' +
    'clockwise sunrise uprise practise liaise anise mortise valise denise elise louise cerise'
  ).split(' ')
)
/** Words spelt -ize in both Englishes: never respelt -ise. */
const BOTH_IZE = new Set('size prize seize capsize downsize oversize resize upsize outsize baize'.split(' '))
const ISE = /^(\p{L}{3,}?)(is|iz)(e|es|ed|ing|ation|ations|er|ers|able)$/u

/** The base form (`-ise`) of an -ise/-ize word, its other form, and which it is; null for any other word. */
function izeOf(lower) {
  const m = ISE.exec(lower)
  if (!m) return null
  const [, stem, mid, end] = m
  if (BOTH_ISE.has(`${stem}ise`) || BOTH_IZE.has(`${stem}ize`)) return null
  // A stem ending in a vowel is no -ise/-ize verb ("praise", "noise", "cruise", "mayonnaise"): kept as written.
  if (/[aeiouy]$/u.test(stem)) return null
  return { form: mid === 'is' ? 'ise' : 'ize', other: `${stem}${mid === 'is' ? 'iz' : 'is'}${end}` }
}

const WORD = /\p{L}[\p{L}'’]*/gu

/** The word in another spelling, its capitals kept. */
function cased(word, target) {
  if (word === word.toUpperCase() && word !== word.toLowerCase()) return target.toUpperCase()
  return /^\p{Lu}/u.test(word) ? target[0].toUpperCase() + target.slice(1) : target
}

/** Every string a brief holds that a visitor could read: no address, key or identifier. */
function briefWords(brief) {
  const out = []
  const walk = (value, key) => {
    if (typeof value === 'string') {
      if (
        !/^(?:id|ref|href|url|uri|src|source|kind|type|key|locale|lang|language|email|phone)$/i.test(
          key ?? ''
        )
      )
        if (!/^(?:https?:|mailto:|tel:)/i.test(value)) out.push(value)
    } else if (Array.isArray(value)) for (const v of value) walk(v, key)
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k)
  }
  walk(brief, null)
  return out.join('\n')
}

/** Countries whose businesses write American English; any other country writes British English. */
const AMERICAN_COUNTRIES = new Set(['US', 'PH', 'PR', 'LR', 'GU', 'AS', 'VI', 'MP', 'UM'])

/** How many words of a text are spelt the British way, the American way, and -ise / -ize. */
export function spellingCounts(text) {
  const counts = { british: 0, american: 0, ise: 0, ize: 0 }
  for (const w of String(text ?? '').match(WORD) ?? []) {
    const lower = w.toLowerCase()
    if (BRITISH.has(lower) && !AMERICAN.has(lower)) counts.british += 1
    else if (AMERICAN.has(lower) && !BRITISH.has(lower)) counts.american += 1
    const ize = izeOf(lower)
    if (ize) counts[ize.form] += 1
  }
  return counts
}

/**
 * The site's style sheet, read from the brief: spelling, casing, and how phones, prices and hours are written.
 * @param {any} brief
 * @returns {{locale: 'en-GB' | 'en-US', ize: 'ise' | 'ize', basis: 'brief-text' | 'country' | 'default',
 *   casing: 'sentence', phone: string | null, currency: string | null, clock: '12h' | '24h' | null}}
 */
export function siteStyleSheetOf(brief) {
  const text = briefWords(brief)
  const c = spellingCounts(text)
  const country = String(brief?.business?.country ?? brief?.place?.country ?? '')
    .trim()
    .toUpperCase()
  const gb = c.british + c.ise
  const us = c.american + c.ize
  let locale = 'en-GB'
  let basis = 'default'
  if (gb !== us) {
    locale = gb > us ? 'en-GB' : 'en-US'
    basis = 'brief-text'
  } else if (/^[A-Z]{2}$/.test(country)) {
    locale = AMERICAN_COUNTRIES.has(country) ? 'en-US' : 'en-GB'
    basis = 'country'
  }
  // British writers who use -ize (Oxford spelling) keep it; American English is always -ize.
  const ize = locale === 'en-US' ? 'ize' : c.ize > c.ise && c.british > 0 ? 'ize' : 'ise'
  const phone = typeof brief?.business?.phone === 'string' ? brief.business.phone.trim() || null : null
  const currency = /\b(AED|USD|GBP|EUR|AUD|CAD|SGD|INR|VND)\b|([£$€])/.exec(text)
  const clock = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i.test(text)
    ? '12h'
    : /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(text)
      ? '24h'
      : null
  return {
    locale,
    ize,
    basis,
    casing: 'sentence',
    phone,
    currency: currency ? (currency[1] ?? currency[2]) : null,
    clock
  }
}

/**
 * The rule every writer is given, one paragraph in English: the spelling, the casing and the number formats of the site.
 * @param {ReturnType<typeof siteStyleSheetOf> | null | undefined} sheet
 */
export function styleSheetRule(sheet) {
  if (!sheet?.locale) return ''
  const spelling =
    sheet.locale === 'en-US'
      ? 'American English spelling (en-US: color, center, organize, traveled)'
      : `British English spelling (en-GB: colour, centre, ${sheet.ize === 'ize' ? 'organize' : 'organise'}, travelled)`
  return (
    ` One style for the whole site: write in ${spelling}; headings, buttons and menu labels in sentence case (only the ` +
    'first word and names capitalised), never a slogan in Title Case and never an exclamation mark' +
    (sheet.phone ? `; a phone number exactly as ${sheet.phone}` : '') +
    (sheet.currency ? `; prices with ${sheet.currency}` : '') +
    (sheet.clock
      ? `; times on the ${sheet.clock === '12h' ? '12-hour clock (9am, 5:30pm)' : '24-hour clock (09:00)'}`
      : '') +
    '.'
  )
}

/** One word in the site's spelling, or itself. */
function respelt(word, sheet) {
  const lower = word.toLowerCase()
  const toUs = sheet.locale === 'en-US'
  const table = toUs ? BRITISH : AMERICAN
  if (table.has(lower)) return cased(word, table.get(lower))
  const ize = izeOf(lower)
  const want = toUs ? 'ize' : sheet.ize === 'ize' ? 'ize' : 'ise'
  if (ize && ize.form !== want) return cased(word, ize.other)
  return word
}

/**
 * A written line in the site's spelling: every word of another English spelt the site's way, its capitals kept. Markup,
 * links and the `keep` phrases (the business's and its offerings' names) are left as they are.
 * @param {unknown} value
 * @param {ReturnType<typeof siteStyleSheetOf> | null | undefined} sheet
 * @param {{keep?: Array<string | null | undefined>}} [options]
 */
export function inSiteSpelling(value, sheet, { keep = [] } = {}) {
  if (typeof value !== 'string' || !sheet?.locale || !value.trim()) return value
  if (/^\s*(?:https?:|mailto:|tel:|index\.php|\/|#|images\/)/i.test(value)) return value
  const names = keep
    .filter((k) => typeof k === 'string' && k.trim())
    .map((k) => k.trim())
    .sort((a, b) => b.length - a.length)
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const held = names.length ? new RegExp(names.map(escape).join('|'), 'gi') : null
  // Tags, entities, link targets and [[style marks]] are never prose.
  const spelt = (prose) => {
    const parts = []
    let last = 0
    for (const m of held ? prose.matchAll(held) : []) {
      parts.push([prose.slice(last, m.index), true], [m[0], false])
      last = m.index + m[0].length
    }
    parts.push([prose.slice(last), true])
    return parts.map(([p, free]) => (free ? p.replace(WORD, (w) => respelt(w, sheet)) : p)).join('')
  }
  return value.replace(/(<[^>]*>|&[#\w]+;)|([^<&]+)/g, (all, markup, prose) =>
    markup || !prose
      ? all
      : prose
          .split(/((?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+)/)
          .map((part, i) => (i % 2 ? part : spelt(part)))
          .join('')
  )
}

/**
 * Words of a set of lines spelt in another English than the sheet's, each with the site's form: what a check reports.
 * @param {string[]} texts
 * @param {ReturnType<typeof siteStyleSheetOf>} sheet
 * @returns {Array<{found: string, want: string}>}
 */
export function offSheetWords(texts, sheet) {
  const out = new Map()
  for (const t of texts ?? [])
    for (const w of String(t ?? '').match(WORD) ?? []) {
      const want = respelt(w, sheet)
      if (want !== w) out.set(w.toLowerCase(), { found: w, want })
    }
  return [...out.values()]
}

/**
 * Whether a line passes the site's voice (COO criterion 1.3): no exclamation mark, and not a slogan in Title Case (three
 * or more longer words, every one capitalised, that are not all names given in `names`).
 * @param {unknown} line
 * @param {{names?: Array<string | null | undefined>}} [options]
 */
export function inSiteVoice(line, { names = [] } = {}) {
  if (typeof line !== 'string') return false
  const text = line.replace(/<[^>]*>/g, ' ').trim()
  if (!text || /!/.test(text)) return false
  const own = new Set(
    names.flatMap(
      (n) =>
        String(n ?? '')
          .toLowerCase()
          .match(WORD) ?? []
    )
  )
  const long = (text.match(WORD) ?? []).filter((w) => [...w].length >= 4 && !own.has(w.toLowerCase()))
  return !(long.length >= 3 && long.every((w) => /^\p{Lu}/u.test(w)))
}
