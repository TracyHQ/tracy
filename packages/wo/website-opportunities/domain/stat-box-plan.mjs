// The stat and fact boxes of a template (a big number over a short label, "100K+ / HAPPY CUSTOMERS") in a brief build
// (spec TracyHQ/tracy#189, COO rule of 29/10/2026). Pure and deterministic: brief and content map in, decisions out.
//
// 🔒 NEVER AN EMPTY BOX, NEVER AN INVENTED NUMBER. Each box, by where it sits:
//   1. a fact   the brief holds a sourced number that fits a box: the founding year (as the years running, or the year),
//               Google's rating and review count (only when they are on the site), how many offerings or people the brief
//               names (two or more). One fact per box, never the same fact twice in one section; a box whose demo label
//               speaks of the fact's subject ("years", "rating", "coaches") takes it first.
//   2. a photo  no fact is left for a box that stands among the photos of a grid: its words are emptied and it is kept, so
//               the head block shows an owner photo in its frame (`empty-frames.js` tiles), and the grid stays whole.
//   3. hidden   no fact is left for a box of a band of boxes (two or more boxes and no photo beside them): the box is taken
//               off, and a band with no box left goes whole as a section (`hidesOf`).
// A number inside a sentence ("Join over 100k fighters", text nodes of one element) is no box: it is only emptied, as
// before, and `numberless-sentence.mjs` owns it.
// 🔒 RULES BY ROLE AND GROUP KIND, never by template, business or trade.

/** The roles of a box's words. */
const VALUE = 'stat.value'
const LABEL = 'stat.label'
const CONTEXT = 'stat.context'
const UNIT = 'stat.unit'

/** Words of a demo label that say what the box counts, by fact kind. */
const SUBJECT = Object.freeze({
  years: /\b(?:years?|since|founded|established|experience|history|decades?)\b/i,
  rating: /\b(?:ratings?|stars?|rated|score)\b/i,
  reviews: /\b(?:reviews?|testimonials?)\b/i,
  offerings:
    /\b(?:services?|classes|class|courses?|programs?|programmes?|treatments?|lessons?|sports?|products?|menu|dishes)\b/i,
  people:
    /\b(?:coach(?:es)?|trainers?|team|staff|experts?|doctors?|dentists?|teachers?|instructors?|people|specialists?)\b/i
})
/** The order facts are offered to boxes whose label names no subject: the most telling first. */
const ORDER = ['rating', 'years', 'reviews', 'offerings', 'people']

const YEAR = /\b(?:est(?:\.|ablished)?|founded(?:\s+in)?|since)\s*\.?\s*((?:18|19|20)\d\d)\b/i

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '')
const fits = (slot, value) =>
  !Number.isInteger(slot?.maxCharacters) || [...value].length <= slot.maxCharacters

/** Whether an item may show on the site: its own flag and the fact behind it (as `site-plan-honesty.mjs` reads it). */
function shownItem(brief, item) {
  if (item?.onSite === false || item?.reviewsOnly === true) return false
  if (!item?.factId) return true
  return (brief?.facts ?? []).find((f) => f?.id === item.factId)?.onSite !== false
}

/** The founding year the brief states in the business's own words (its story facts or a fact labelled so), or null. */
function foundingYearOf(brief, now) {
  const said = []
  for (const page of brief?.sitemap ?? [])
    for (const section of page?.sections ?? [])
      for (const f of section?.facts ?? []) said.push(f?.text, f?.quote)
  for (const f of brief?.facts ?? [])
    if (f?.onSite === true && /^(?:founded|foundingYear|founded_year)$/i.test(String(f?.value?.label ?? '')))
      said.push(`founded ${f.value.amount}`)
  for (const s of said) {
    const m = YEAR.exec(String(s ?? ''))
    if (m && Number(m[1]) <= now) return Number(m[1])
  }
  return null
}

/** Google's rating and review count, when the brief holds them on the site. */
function googleOf(brief) {
  const on = (label) =>
    (brief?.facts ?? []).find(
      (f) =>
        (f?.field === 'googleRating' || f?.field === 'rating') &&
        f?.onSite === true &&
        f?.value?.label === label &&
        Number.isFinite(f?.value?.amount)
    )?.value?.amount ?? null
  return { score: on('rating'), reviews: on('reviewCount') }
}

/**
 * The sourced facts a box may show, each as a value, a label and an optional line, by kind.
 * @param {object} brief
 * @param {{now?: number}} [options]
 * @returns {Array<{kind: string, value: string, label: string, line: string | null, short?: {value: string, label: string}}>}
 */
export function statFactsOf(brief, { now = new Date().getUTCFullYear() } = {}) {
  const out = []
  const { score, reviews } = googleOf(brief)
  if (score !== null)
    out.push({
      kind: 'rating',
      value: `${Number(score).toFixed(1)}/5`,
      label: 'Google rating',
      line: Number.isInteger(reviews) && reviews > 0 ? `From ${reviews} Google reviews` : null,
      short: { value: Number(score).toFixed(1), label: 'Google rating' }
    })
  if (Number.isInteger(reviews) && reviews > 0)
    out.push({ kind: 'reviews', value: String(reviews), label: 'Google reviews', line: null })
  const year = foundingYearOf(brief, now)
  if (year !== null) {
    const running = now - year
    out.push(
      running >= 2
        ? {
            kind: 'years',
            value: `${running}`,
            label: 'Years running',
            line: `Since ${year}`,
            short: { value: String(year), label: 'Founded' }
          }
        : { kind: 'years', value: `${year}`, label: 'Founded', line: null }
    )
  }
  const offerings = (brief?.reading?.services ?? []).filter((s) => text(s?.label) && shownItem(brief, s))
  if (offerings.length >= 2)
    out.push({
      kind: 'offerings',
      value: String(offerings.length),
      label: 'Offerings',
      line: offerings
        .map((s) => text(s.label))
        .slice(0, 4)
        .join(', ')
    })
  const people = (brief?.reading?.team ?? []).filter((p) => text(p?.label) && shownItem(brief, p))
  if (people.length >= 2)
    out.push({ kind: 'people', value: String(people.length), label: 'Team members', line: null })
  return out
}

/** Whether a stat group is a box: its number stands in a field of its own, not inside a sentence of text nodes. */
const isBox = (group) =>
  group.slots.some((s) => s.role === VALUE) &&
  !group.slots.some((s) => s.role?.startsWith('stat.') && /text\(\)/.test(String(s.xpath ?? '')))

/** The section a group sits in: its entity, and the list it is an item of. */
const sectionOf = (group) => group.slots[0]?.entity ?? group.id.split('.')[0]

/**
 * The words a fact writes into a box, or null when the box cannot hold it (its value or label is too long).
 * @returns {Record<string, string> | null}
 */
function wordsFor(group, fact) {
  const slot = (role) => group.slots.find((s) => s.role === role && s.type === 'text')
  const value = slot(VALUE)
  if (!value) return null
  for (const form of [fact, fact.short].filter(Boolean)) {
    if (!fits(value, form.value)) continue
    const label = slot(LABEL)
    if (label && !fits(label, form.label)) continue
    const out = { [value.key]: form.value }
    if (label) out[label.key] = form.label
    const context = slot(CONTEXT)
    if (context && form === fact && fact.line && fits(context, fact.line)) out[context.key] = fact.line
    else if (
      context &&
      form !== fact &&
      fact.value !== form.value &&
      fits(context, `${fact.value} ${fact.label}`)
    )
      out[context.key] = `${fact.value} ${fact.label.toLowerCase()}`
    return out
  }
  return null
}

/**
 * What each stat box of a map shows.
 * @param {object} brief
 * @param {Array<{id: string, kind: string, item?: number, slots: any[]}>} groups - the map's role groups (`groupsOf`)
 * @param {{slots?: any[]}} contentMap
 * @param {{now?: number}} [options]
 * @returns {Array<{group: string, section: string, decision: 'fact' | 'photo' | 'hide' | 'blank', reason: string,
 *   fact?: string, values?: Record<string, string>}>}
 */
export function planStatBoxes(brief, groups, contentMap, options = {}) {
  const facts = statFactsOf(brief, options)
  const boxes = groups.filter((g) => g.kind === 'stat_item')
  const bySection = new Map()
  for (const g of boxes) bySection.set(sectionOf(g), [...(bySection.get(sectionOf(g)) ?? []), g])
  const out = []
  for (const [section, list] of bySection) {
    const statKeys = new Set(list.flatMap((g) => g.slots.map((s) => s.key)))
    // A photo grid: two or more pictures of the section stand beside its boxes.
    const photos = (contentMap?.slots ?? []).filter(
      (s) =>
        s?.entity === section && s.type === 'image' && !statKeys.has(s.key) && !s.role?.startsWith('stat.')
    ).length
    const realBoxes = list.filter(isBox)
    const band = realBoxes.length >= 2 && photos < 2
    const used = new Set()
    const take = (group) => {
      const label = String(group.slots.find((s) => s.role === LABEL)?.sample ?? '')
      const subject = ORDER.filter((k) => SUBJECT[k].test(label))
      const ranked = [...subject, ...ORDER.filter((k) => !subject.includes(k))]
      for (const kind of ranked) {
        const fact = facts.find((f) => f.kind === kind)
        // Rating and review count are one Google fact: a section shows it once.
        const family = kind === 'reviews' ? 'rating' : kind
        if (!fact || used.has(kind) || used.has(family)) continue
        const values = wordsFor(group, fact)
        if (!values) continue
        used.add(kind)
        used.add(family)
        return { fact, values }
      }
      return null
    }
    for (const group of [...list].sort((a, b) => (Number(a.item) || 0) - (Number(b.item) || 0))) {
      if (!isBox(group)) {
        out.push({ group: group.id, section, decision: 'blank', reason: 'no-brief-statistic' })
        continue
      }
      const got = take(group)
      if (got) {
        out.push({
          group: group.id,
          section,
          decision: 'fact',
          reason: 'brief-statistic',
          fact: got.fact.kind,
          values: got.values
        })
        continue
      }
      out.push({
        group: group.id,
        section,
        decision: photos >= 2 ? 'photo' : band ? 'hide' : 'blank',
        reason: photos >= 2 ? 'no-brief-statistic-photo' : 'no-brief-statistic'
      })
    }
  }
  return out
}

/** The roles of a box whose words are emptied when it shows no fact. */
export const STAT_WORD_ROLES = Object.freeze([VALUE, LABEL, CONTEXT, UNIT])
