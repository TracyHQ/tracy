// The facts a site brief states, each in one envelope (#1791, ADR 0037 amended 27/10/2026):
// `{id, field, value, evidence, confidence, onSite, decidedBy, reasons}`. The id is the place profile fact's id, so an
// owner's on/off choice (keyed by that id) survives Research again; the decision comes from the fact assessment
// (`fact-assessment.mjs factDecisions`), never from a flag beside one field. The brief's `missing` list is a view over
// the facts kept off the site (`withheldMissing`), plus what was not collected.
// 🔒 ONE DECISION PER FACT. A brief field a fact backs (the hours, a team member, the WhatsApp button, Google's rating)
// shows only when its fact is on the site; nothing else turns it on or off.
import { factDecisions } from './fact-assessment.mjs'
import { ratingShownForms } from './google-rating.mjs'
import { comparable, labelQuoted } from './business-reading.mjs'
import { cleanSocialUrl } from './social-links.mjs'

// The brief names a source by its platform: Google's two collectors are one Google.
const SOURCE_NAME = { 'google-places': 'google', 'google-maps': 'google' }
const sourceName = (kind) => SOURCE_NAME[kind] ?? kind ?? 'unknown'

export const CONFIDENCE = Object.freeze(['corroborated', 'single-source', 'inferred'])
// What the brief states of the business block: Google's raw duplicates (national number, components) are not repeated.
const STATED_BUSINESS = new Set(['name', 'branch', 'address', 'phone', 'email', 'hours', 'serviceAreas'])
const SOCIAL_COUNTS = new Set(['followers', 'likes', 'subscribers', 'posts'])
const MAX_QUOTE = 300

/** The brief's name for a profile fact (`field`), or null for one the brief does not state (media, brand, reviews). */
function fieldOf(path, fact, sourceKind, food) {
  const [group, key] = path
  if (group === 'business') return STATED_BUSINESS.has(key) ? key : null
  if (group === 'offerings') return food ? 'menu' : 'services'
  if (group === 'people') return 'team'
  if (group === 'quotes') {
    const reason = String(fact.derivation?.reason ?? '')
    if (reason.startsWith('audience:')) return 'audience'
    // A summary another platform wrote of its reviews ("Guests praise…", `attribution`) is not the business's story.
    if (fact.value?.attribution) return null
    if (reason.startsWith('story:') || fact.value?.kind === 'story') return 'story'
    return null
  }
  if (group === 'claims' && key === 'statistics') {
    const label = fact.value?.label
    if (label === 'rating' || label === 'reviewCount')
      return sourceKind === 'google-places' ? 'googleRating' : 'rating'
    return SOCIAL_COUNTS.has(label) ? 'socialFigures' : null
  }
  if (group === 'links') {
    const kind = fact.value?.kind
    if (kind === 'whatsapp' || kind === 'website' || kind === 'menu' || kind === 'booking') return kind
    // A channel the business invites messages on in its own words (`own-channels.mjs`): "DM us" on Instagram.
    if (/^(?:instagram|facebook|tiktok|x)-dm$/.test(kind ?? '')) return 'contactChannels'
    return ['facebook', 'instagram', 'tiktok', 'youtube', 'x'].includes(kind) ? 'socials' : null
  }
  if (group === 'extensions' && key === 'research:otherPhones') return 'otherPhones'
  return null
}

/** Every fact of a profile with its path, in the order the profile holds them. */
function factsWithPaths(profile) {
  const out = []
  const walk = (value, path) => {
    if (!value || typeof value !== 'object') return
    if (Object.hasOwn(value, 'value') && Array.isArray(value.evidenceRefs)) {
      out.push({ fact: value, path })
      return
    }
    for (const [key, child] of Object.entries(value)) walk(child, [...path, key])
  }
  for (const key of ['business', 'offerings', 'people', 'claims', 'quotes', 'links', 'extensions'])
    walk(profile?.[key], [key])
  return out
}

/** The decision of every fact (`Map factId -> {confidence, onSite, decidedBy, reasons}`): the assessment's. */
export const decisionsOf = (profile, { overrides = null } = {}) => factDecisions(profile, { overrides })

/** The same decisions read from a frozen assessment (`[{factId, confidence, onSite, decidedBy, reasons}]`). */
export const decisionsOfAssessment = (rows) =>
  new Map(
    (Array.isArray(rows) ? rows : [])
      .filter((r) => typeof r?.factId === 'string')
      .map((r) => [
        r.factId,
        { confidence: r.confidence, onSite: r.onSite, decidedBy: r.decidedBy, reasons: r.reasons ?? [] }
      ])
  )

/**
 * The brief's facts (pure): every fact of the place profile the brief states, in one envelope, with its decision.
 * @param {any} profile a place profile (`placeProfileFromResearch`)
 * @param {{food?: boolean, decisions: Map<string, any>}} options
 */
export function briefFactsOf(profile, { food = false, decisions }) {
  const evidence = new Map((profile?.evidence ?? []).map((e) => [e.id, e]))
  const sources = new Map((profile?.sources ?? []).map((s) => [s.id, s]))
  const out = []
  for (const { fact, path } of factsWithPaths(profile)) {
    const refs = fact.evidenceRefs.map((r) => evidence.get(r)).filter(Boolean)
    const first = sources.get(refs[0]?.sourceId)
    const field = fieldOf(path, fact, first?.kind, food)
    if (!field) continue
    const d = decisions.get(fact.id) ?? {
      confidence: 'single-source',
      onSite: false,
      decidedBy: 'rule',
      reasons: ['unassessed']
    }
    out.push({
      id: fact.id,
      field,
      value: fact.value,
      evidence: refs.map((e) => {
        const s = sources.get(e.sourceId)
        // A link reads as Tracy shows it, without share tracking (#1780 item 10), like every link of the brief.
        const ref = typeof s?.ref === 'string' ? (cleanSocialUrl(s.ref) ?? s.ref) : null
        return {
          source: sourceName(s?.kind),
          ...(ref ? { ref } : {}),
          ...(typeof e.excerpt === 'string' && e.excerpt.length <= MAX_QUOTE ? { quote: e.excerpt } : {})
        }
      }),
      confidence: d.confidence,
      onSite: d.onSite,
      decidedBy: d.decidedBy,
      reasons: d.reasons ?? []
    })
  }
  return out
}

/**
 * The other names the business gives itself on its own marks (pure, #1791): the values of the place profile's
 * `name-differs-from-own-marks` conflict that are not the held name, each with its marks as evidence (the logo's text,
 * the social page's display name or handle). The builder and the owner read "it also calls itself X"; no copy prints it.
 * @returns {{name: string, evidence: {source: string, ref?: string, quote?: string}[]}[]}
 */
export function otherNamesOf(profile) {
  const held = profile?.business?.name?.value
  const evidence = new Map((profile?.evidence ?? []).map((e) => [e.id, e]))
  const sources = new Map((profile?.sources ?? []).map((s) => [s.id, s]))
  const out = []
  for (const c of Array.isArray(profile?.conflicts) ? profile.conflicts : []) {
    if (c?.target !== 'business.name' || !String(c.reason ?? '').startsWith('name-differs-from-own-marks'))
      continue
    for (const v of Array.isArray(c.values) ? c.values : []) {
      if (typeof v?.value !== 'string' || v.value === held || out.some((o) => o.name === v.value)) continue
      out.push({
        name: v.value,
        evidence: (v.evidenceRefs ?? [])
          .map((r) => evidence.get(r))
          .filter(Boolean)
          .map((e) => {
            const s = sources.get(e.sourceId)
            // A logo's source is its picture's address: its words are the evidence, not where the file was served.
            const ref =
              typeof s?.ref === 'string' && s.kind !== 'logo' ? (cleanSocialUrl(s.ref) ?? s.ref) : null
            return {
              source: sourceName(s?.kind),
              ...(ref ? { ref } : {}),
              ...(typeof e.excerpt === 'string' ? { quote: e.excerpt } : {})
            }
          })
      })
    }
  }
  return out
}

/** "Harbour Sport Club" (its logo: "HARBOUR SPORT CLUB EST. 2023"; instagram: "harbour.sportclub"). */
const otherNameWords = (n) => {
  const marks = n.evidence.filter((e) => e.quote).map((e) => `${e.source}: ${JSON.stringify(e.quote)}`)
  return `${JSON.stringify(n.name)}${marks.length ? ` (${marks.join('; ')})` : ''}`
}

/** The fact of a field (the first, or the one whose value `match` accepts), or null. */
export const factOf = (facts, field, match = () => true) =>
  (Array.isArray(facts) ? facts : []).find((f) => f.field === field && match(f.value)) ?? null

/** Whether a brief field backed by `fact` shows: a fact kept off the site keeps it off; no fact decides nothing. */
export const shown = (fact) => fact === null || fact.onSite === true

const WHY = {
  'implausible-all-week-hours': (field) =>
    field === 'hours'
      ? 'Only one source says the business is open 24 hours every day, which a business of this kind rarely is: show no hours, not even sample hours, until the owner confirms them.'
      : null,
  'few-reviews': (_, facts) => {
    const count = factOf(facts, 'googleRating', (v) => v?.label === 'reviewCount')?.value?.amount
    return `Google's rating counts only ${Number.isInteger(count) ? count : 'a few'} reviews, so it is left off the site until the owner shows it: show no star rating or review count of Google's, not even a sample.`
  },
  'review-only-person': () =>
    'These people are named only in guest reviews: name nobody of them on the site until the owner shows them.',
  'name-differs-from-own-marks': (field, facts, otherNames = []) => {
    const held = factOf(facts, 'name')?.value
    const other = otherNames.length
      ? `the business also calls itself ${otherNames.map(otherNameWords).join(' or ')} on its own logo or social page`
      : 'its own logo or social page calls it by another'
    return field === 'name'
      ? `Sources call the business ${typeof held === 'string' ? held : 'by one name'}, but ${other}: write no business name in the copy, neither of them, until the owner confirms which it is; the logo may show.`
      : null
  },
  'inferred-not-allowed': (field) =>
    `Tracy inferred this ${field} without a source stating it: leave it off the site until the owner confirms it.`
}

const NAMES = { hours: 'the opening hours', googleRating: "Google's rating", team: 'these people' }

/** Why a withheld field is off the site, in the words the builder reads. */
function whyOf(field, group, facts, otherNames = []) {
  if (group.some((f) => f.decidedBy === 'owner'))
    return field === 'googleRating'
      ? "The owner chose to leave Google's rating off the site: show no star rating or review count of Google's, not even a sample."
      : field === 'hours'
        ? 'The owner chose to leave the opening hours off the site: show no hours, not even sample hours.'
        : `The owner chose to leave ${NAMES[field] ?? `this ${field}`} off the site: show none of it, not even a sample.`
  for (const code of group.flatMap((f) => f.reasons)) {
    if (code === 'owner-left-off')
      return whyOf(
        field,
        group.map((f) => ({ ...f, decidedBy: 'owner' })),
        facts
      )
    const why = WHY[code]?.(field, facts, otherNames)
    if (why) return why
  }
  return `Tracy keeps this ${field} off the site (${[...new Set(group.flatMap((f) => f.reasons))].join(', ') || 'no reason recorded'}) until the owner shows it.`
}

const textsOf = (value) =>
  (Array.isArray(value) ? value : [value]).flatMap((v) =>
    typeof v === 'string'
      ? [v]
      : typeof v?.name === 'string'
        ? [v.name]
        : typeof v?.url === 'string'
          ? [v.url]
          : typeof v?.text === 'string'
            ? [v.text]
            : []
  )

/**
 * The `missing` entries of what the brief withholds (pure): one per field whose facts are kept off the site, with every
 * value a page could write, the way the agent prompt names them and the site check looks for them.
 * `otherNames` (`otherNamesOf`) are the names the business's own marks give: the held name's entry names them, with
 * their marks, as `otherNames`.
 * @returns {{field: string, why: string, withheld: object[], otherNames?: object[]}[]}
 */
export function withheldMissing(facts, { otherNames = [] } = {}) {
  const off = (Array.isArray(facts) ? facts : []).filter((f) => f.onSite === false)
  const fields = [...new Set(off.map((f) => f.field))]
  return fields.map((field) => {
    const group = off.filter((f) => f.field === field)
    const source = group[0].evidence[0]?.source ?? 'research'
    let withheld
    if (field === 'hours')
      withheld = group.map((f) => ({ source: f.evidence[0]?.source ?? source, hours: f.value }))
    else if (field === 'googleRating') {
      const score = factOf(group, 'googleRating', (v) => v?.label === 'rating')?.value?.amount
      const reviews = factOf(group, 'googleRating', (v) => v?.label === 'reviewCount')?.value?.amount
      withheld = [
        {
          source: 'google',
          values: ratingShownForms({
            state: 'left',
            score,
            reviews: Number.isInteger(reviews) ? reviews : null
          })
        }
      ]
    } else
      withheld = [
        {
          source:
            field === 'team' && group.every((f) => f.reasons.includes('review-only-person'))
              ? 'reviews'
              : source,
          values: [...new Set(group.flatMap((f) => textsOf(f.value)))]
        }
      ]
    const others = field === 'name' && group.some((f) => f.reasons.includes('name-differs-from-own-marks'))
    // 🔒 The other names are held from the site's text too (copy, titles, meta): the site check reads them as withheld
    // values. Only its text: the logo picture may still show the name it carries.
    if (others && otherNames.length)
      withheld.push({ source: 'own-marks', values: [...new Set(otherNames.map((n) => n.name))] })
    return {
      field,
      why: whyOf(field, group, facts, others ? otherNames : []),
      withheld,
      ...(others && otherNames.length ? { otherNames } : {})
    }
  })
}

// The reading items a message may rest on, by the brief field their facts carry.
const READING_FIELDS = [
  ['services', 'services'],
  ['audience', 'audience'],
  ['story', 'story'],
  ['team', 'team'],
  ['serviceAreas', 'serviceAreas']
]
const plain = (t) => comparable(t).toLowerCase()
const contains = (whole, part) => {
  const p = plain(part)
  return p.length >= 3 && plain(whole).includes(p)
}

/**
 * The facts a message quote rests on (pure): the reading items quoted from the SAME source text (`source.ref`) whose
 * quote holds the message's quote or is held by it, then the facts made of those items (same field, the item's quote as
 * their evidence). A word shared with an address or a review elsewhere ties nothing.
 */
function factsOfQuote(quote, reading, facts) {
  const out = []
  for (const [group, field] of READING_FIELDS)
    for (const item of reading?.[group] ?? []) {
      if (item?.source?.ref !== quote.source?.ref || typeof item.quote !== 'string') continue
      if (!contains(item.quote, quote.quote) && !contains(quote.quote, item.quote)) continue
      for (const f of facts ?? [])
        if (
          (f.field === field || (field === 'services' && f.field === 'menu')) &&
          f.evidence.some((e) => e.quote === item.quote)
        )
          out.push(f)
    }
  return out
}

// Words that name a kind of offering, not which one: a praise that says "lessons" names no service of its own.
const OFFERING_WORDS = new Set(
  'session sessions lesson lessons class classes coaching course courses programme programmes program programs training workshop workshops membership memberships treatment treatments and the for with all of'.split(
    ' '
  )
)

/**
 * The facts a praise theme rests on (pure): customers praise something the business offers, so a theme ties to each
 * service or audience of the reading whose own words (its kind of offering aside) its review quotes name ("our kids
 * take tennis lessons" names the service "Tennis"). A theme that names none rests on nothing and is dropped.
 */
function factsOfPraise(quotes, reading, facts) {
  const out = []
  const said = quotes.map((x) => x.quote).join(' ')
  for (const [group, field] of READING_FIELDS.filter(([g]) => g === 'services' || g === 'audience'))
    for (const item of reading?.[group] ?? []) {
      const words = (comparable(item?.label).match(/[\p{L}\p{N}]+/gu) ?? []).filter(
        (w) => w.length >= 3 && !OFFERING_WORDS.has(w)
      )
      if (!words.length || !words.every((w) => labelQuoted(w, said))) continue
      for (const f of facts ?? [])
        if (f.field === field && f.evidence.some((e) => e.quote === item.quote)) out.push(f)
    }
  return out
}

/** Every value the brief keeps off the site, as text (`withheldMissing`): a key message may quote none of them. */
const withheldTexts = (facts) =>
  withheldMissing(facts).flatMap((m) =>
    (m.withheld ?? [])
      .flatMap((w) => [...(w.values ?? []), ...(w.hours ?? [])])
      .filter((v) => typeof v === 'string')
  )

/**
 * The key messages the brief keeps (pure): each reading message tied to the facts of the reading items it quotes from
 * the same source (`factRefs`, the ones on the site). A quote that holds a value kept off the site never reaches the
 * builder; a message left with no quote, no fact on the site, or a label holding a withheld value is dropped, so a
 * message never rests on what is withheld.
 * @param {{id: string, label: string, edited?: boolean, quotes: {quote: string, source: any}[]}[]} messages
 * @param {any[]} facts the brief's fact envelopes
 * @param {any} [reading] the business reading the messages came with (its items and their sources)
 * @param {{otherNames?: string[]}} [options] names a message may not quote either (`otherNamesOf`)
 * @returns {{id: string, label: string, factRefs: string[], quotes: {text: string, sourceRef: string}[], decidedBy: 'rule' | 'owner'}[]}
 */
export function keyMessagesOf(messages, facts, reading = null, { otherNames = [] } = {}) {
  // The other names the business's own marks give are held like the name itself (`otherNamesOf`).
  const held = [...withheldTexts(facts), ...otherNames.filter((n) => typeof n === 'string')]
  const holdsWithheld = (t) => held.some((v) => contains(t, v))
  const out = []
  for (const m of Array.isArray(messages) ? messages : []) {
    if (holdsWithheld(m.label)) continue
    const quotes = (m.quotes ?? []).filter((x) => typeof x?.quote === 'string' && !holdsWithheld(x.quote))
    const refs = (
      m.basis === 'praise'
        ? factsOfPraise(quotes, reading, facts)
        : quotes.flatMap((x) => factsOfQuote(x, reading, facts))
    ).filter((f) => f.onSite)
    if (!quotes.length || !refs.length) continue
    out.push({
      id: m.id,
      label: m.label,
      factRefs: [...new Set(refs.map((f) => f.id))],
      quotes: quotes.map((x) => ({
        text: x.quote,
        sourceRef: x.source?.ref ?? 'unknown',
        ...(x.source?.url ? { url: x.source.url } : {})
      })),
      // A theme customers praise, on their reviews' words (#1791): the build says it as praise, never as the business.
      ...(m.basis === 'praise' ? { basis: 'praise' } : {}),
      decidedBy: m.edited ? 'owner' : 'rule'
    })
  }
  return out
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v) => typeof v === 'string' && v.trim() !== ''

/** The shape errors of a brief's `facts` and `keyMessages` (schema 2): `[{path, message}]`, none for schema 1. */
export function briefFactErrors(brief) {
  const out = []
  if (brief?.schemaVersion !== 2) {
    if (brief && ('facts' in brief || 'keyMessages' in brief))
      out.push({ path: 'facts', message: 'facts and keyMessages exist from schemaVersion 2 on' })
    return out
  }
  if (!Array.isArray(brief.facts)) return [{ path: 'facts', message: 'must be a list of fact envelopes' }]
  const ids = new Set()
  brief.facts.forEach((f, i) => {
    const ok =
      isObj(f) &&
      text(f.id) &&
      !ids.has(f.id) &&
      text(f.field) &&
      'value' in f &&
      Array.isArray(f.evidence) &&
      CONFIDENCE.includes(f.confidence) &&
      typeof f.onSite === 'boolean' &&
      (f.decidedBy === 'rule' || f.decidedBy === 'owner') &&
      Array.isArray(f.reasons)
    if (!ok)
      out.push({
        path: `facts[${i}]`,
        message: 'must be {id (unique), field, value, evidence[], confidence, onSite, decidedBy, reasons[]}'
      })
    if (isObj(f)) ids.add(f.id)
  })
  if ('keyMessages' in brief) {
    const list = brief.keyMessages
    if (!Array.isArray(list) || list.length > 3)
      out.push({ path: 'keyMessages', message: 'must be a list of at most 3 messages when present' })
    else
      list.forEach((m, i) => {
        const ok =
          isObj(m) &&
          text(m.id) &&
          text(m.label) &&
          Array.isArray(m.factRefs) &&
          m.factRefs.length > 0 &&
          m.factRefs.every((r) => ids.has(r)) &&
          Array.isArray(m.quotes) &&
          m.quotes.length > 0 &&
          m.quotes.every((x) => isObj(x) && text(x.text) && text(x.sourceRef))
        if (!ok)
          out.push({
            path: `keyMessages[${i}]`,
            message: 'must be {id, label, factRefs (facts of this brief), quotes: [{text, sourceRef}]}'
          })
      })
  }
  return out
}

const CONFIDENCE_WORDS = {
  corroborated: 'corroborated',
  'single-source': 'single source',
  inferred: 'inferred'
}
const MAX_LISTED = 3

/** A fact's value in one short line: its text, its name, its link, or its count. */
function valueLine(value, q) {
  if (Array.isArray(value)) {
    const shownValues = value.slice(0, MAX_LISTED).map((v) => valueLine(v, q))
    return `${shownValues.join('; ')}${value.length > MAX_LISTED ? `; and ${value.length - MAX_LISTED} more` : ''}`
  }
  if (typeof value === 'string') return q(value)
  if (typeof value === 'number') return String(value)
  if (typeof value?.amount === 'number') return `${value.amount} (${value.label ?? 'count'})`
  for (const key of ['name', 'text', 'url', 'phone'])
    if (typeof value?.[key] === 'string') return q(value[key])
  return q(JSON.stringify(value))
}

/** Whether a fact of the brief shows, by id; null for a brief without facts (schema 1) or an unknown id. */
export function factOnSite(brief, factId) {
  const f = (Array.isArray(brief?.facts) ? brief.facts : []).find((x) => x.id === factId)
  return f ? f.onSite : null
}

/**
 * The brief's key messages and its facts, as the markdown states them (schema 2; nothing for schema 1): every fact in
 * the same line shape, with how sure Tracy is and whether it shows on the site.
 */
export function renderBriefFacts(brief, line, q) {
  const messages = Array.isArray(brief?.keyMessages) ? brief.keyMessages : []
  if (messages.length) {
    line('## Key messages (lead with these, in this order)')
    line(
      "Each is a point the business's own texts make, never copy: write it in the site's words from its quotes and facts, adding no claim."
    )
    messages.forEach((m, n) => {
      line(
        `${n + 1}. ${q(m.label)}${m.basis === 'praise' ? ' (what customers praise)' : ''}${m.decidedBy === 'owner' ? ' (worded by the owner)' : ''}`
      )
      for (const x of m.quotes) line(`   - ${x.sourceRef}: ${q(x.text)}`)
    })
    line()
  }
  const facts = Array.isArray(brief?.facts) ? brief.facts : []
  if (!facts.length) return
  line('## Facts and where they show')
  line(
    'One line per fact: its value, how sure Tracy is (corroborated, single source, inferred) and whether it goes on the site. A fact off the site appears nowhere on it.'
  )
  for (const f of facts) {
    const from = [...new Set(f.evidence.map((e) => e.source))].join(', ')
    const where = f.onSite
      ? 'on the site'
      : `off the site${f.reasons.length ? `: ${f.reasons.filter((r) => r !== 'owner-override').join(', ')}` : ''}`
    line(
      `- ${f.field}: ${valueLine(f.value, q)} · ${CONFIDENCE_WORDS[f.confidence] ?? f.confidence}${from ? ` (${from})` : ''} · ${where}${f.decidedBy === 'owner' ? ', by the owner' : ''}`
    )
  }
  line()
}
