// The data a build plan may show, taken from a needs profile (ticket #593, ADR 0046 decision 3). Every fact and item of
// the profile gets a plan id; the plan composer's model names data only by these ids, and the rules gate
// (`plan-gate.mjs`) holds every id of a composed plan to this list, so a plan never shows what the business does not
// have. Pure: a profile in, the plan's facts and items out, in the Contract B shape (`build-contract-plan.mjs`).
import { GROUP_KINDS_V3 } from './place-content-roles.mjs'
import { rowDataOf } from './plan-row-data.mjs'
import { withHoursDisplay } from './plan-hours-display.mjs'
import { ownerFactsOfProfile, ownerTaglineOfProfile } from './owner-facts-flow.mjs'
import { withheldIdsOf } from './plan-withheld.mjs'

/** How the customer reads where a fact came from, per source origin of the needs profile. */
export const SOURCE_NAMES = Object.freeze({
  website: 'Website',
  google: 'Google Maps listing',
  listing: 'Directory listing',
  social: 'Social profile',
  answer: 'Your answer'
})
/** How the customer reads each business fact of the needs profile. */
export const FACT_LABELS = Object.freeze({
  'business.name': 'Business name',
  'business.founded_year': 'Founded',
  'contact.phone': 'Phone',
  'contact.email': 'Email',
  'contact.address': 'Address',
  'contact.hours': 'Opening hours',
  'contact.cta_url': 'Booking link',
  'contact.cta_label': 'Main button',
  'contact.social_url': 'Social link',
  'business.tagline': 'Tagline',
  'business.summary': 'About'
})
/** The plan id of the owner's own tagline and of the reading's About line (each a fact, kind of the same name). */
export const OWNER_TAGLINE_ID = 'business-tagline'
export const ABOUT_ID = 'business-summary'
/** How the customer reads a group of items of one kind, plural (`plan-placement.mjs` reasons, left out entries). */
export const ITEM_NOUNS = Object.freeze({
  service: 'services',
  menu_item: 'dishes',
  package: 'packages',
  person: 'team members',
  quote: 'reviews',
  gallery: 'photos',
  stat_item: 'statistics',
  step: 'process steps',
  claim: 'awards and certificates',
  faq: 'questions and answers',
  event: 'events',
  post: 'posts'
})

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** A plan id from a data kind: `contact.cta_url` gives `contact-cta-url` (a plan field path splits on dots). */
export const idOf = (kind) => kind.replace(/[._]+/g, '-')
export const short = (value, max = 60) => {
  const text = String(value).trim().replace(/\s+/g, ' ')
  return text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`
}

export function sourcesOf(ids, origins) {
  const seen = new Set()
  const out = []
  for (const id of list(ids)) {
    const origin = origins.get(id)
    if (!origin || seen.has(origin)) continue
    seen.add(origin)
    out.push({ kind: origin, name: SOURCE_NAMES[origin] })
  }
  return out
}

/** The label an item shows on the plan: its name, a review's author, a photo's label. */
function itemLabel(item) {
  const field = (role) => item.fields?.[role]?.value
  if (item.kind === 'gallery') return short(item.label ?? 'Photo')
  if (item.kind === 'quote') {
    const author = field('quote.author_name')
    return short(isText(author) ? `Review by ${author}` : `Review: ${field('quote.text') ?? ''}`)
  }
  const primary = field(GROUP_KINDS_V3[item.kind]?.requiredRoles?.[0])
  return short(isText(primary) ? primary : item.id)
}

/**
 * The plan's facts and items from a needs profile, each with a plan id, a label and its sources in Contract B form,
 * plus `byId` (plan id -> `{what: 'fact' | 'item', kind, entry, source}` where `source` is the profile record), and
 * the profile's rows (`rows`, `rowsById`, `rowsOf`: `plan-row-data.mjs`), in their own map, and `withheld`: the ids the
 * owner keeps off the site (`plan-withheld.mjs`).
 * @param {object} profile a needs profile (`needs-profile.mjs`)
 */
export function planDataOf(profile) {
  const origins = new Map(list(profile?.sources).map((s) => [s.id, s.origin]))
  const facts = []
  const items = []
  const byId = new Map()
  for (const [kind, values] of Object.entries(profile?.facts ?? {})) {
    list(values).forEach((fact, i) => {
      if (!isText(fact?.value)) return
      const id = i === 0 ? idOf(kind) : `${idOf(kind)}-${i + 1}`
      const sources = sourcesOf(fact.sources, origins)
      if (sources.length === 0) return
      // Opening hours carry a display form code writes from their structure (`plan-hours-display.mjs`).
      const entry = withHoursDisplay({
        id,
        kind,
        label: FACT_LABELS[kind] ?? kind,
        value: fact.value,
        sources
      })
      facts.push(entry)
      byId.set(id, { what: 'fact', kind, entry, source: fact })
    })
  }
  // The reading's About line and the owner's own tagline (`needs-profile-typed.mjs`): facts in code, shown as the
  // profile holds them; the tagline is shown word for word (`page-writer-fields.mjs`).
  const extra = (id, kind, value, ids) => {
    const sources = sourcesOf(ids, origins)
    if (!isText(value) || sources.length === 0 || byId.has(id)) return
    const entry = { id, kind, label: FACT_LABELS[kind], value, sources }
    facts.push(entry)
    byId.set(id, { what: 'fact', kind, entry, source: { value, sources: ids } })
  }
  extra(ABOUT_ID, 'business.summary', profile?.about?.value, list(profile?.about?.sources))
  const tagline = ownerTaglineOfProfile(profile)
  if (tagline) extra(OWNER_TAGLINE_ID, 'business.tagline', tagline.value, [tagline.source])
  for (const [kind, values] of Object.entries(profile?.items ?? {})) {
    for (const item of list(values)) {
      const sources = sourcesOf(item?.sources, origins)
      if (!isText(item?.id) || byId.has(item.id) || sources.length === 0) continue
      const entry = { id: item.id, kind, label: itemLabel(item), sources }
      items.push(entry)
      byId.set(item.id, { what: 'item', kind, entry, source: item })
    }
  }
  const { rows, rowsById, rowsOf } = rowDataOf(profile, { byId }, { sourcesOf, short, origins })
  const withheld = withheldIdsOf({ byId }, profile?.withheld)
  // The owner's facts to say in other words (D46): never a plan fact or item, so the plan composer never reads them.
  const ownerFacts = ownerFactsOfProfile(profile)
  return {
    facts,
    items,
    byId,
    rows,
    rowsById,
    rowsOf,
    withheld,
    ...(ownerFacts.length ? { ownerFacts } : {}),
    ...videosOfProfile(profile, origins)
  }
}

/**
 * The owner's own videos as the plan reads them (#575, P10): how many, and how many from each kind of source, never a
 * video's address. Only when the profile holds some (`needs-profile-research-extras.mjs`).
 */
function videosOfProfile(profile, origins) {
  const count = profile?.videos?.count
  if (!Number.isInteger(count) || count < 1) return {}
  const bySource = new Map()
  for (const s of list(profile.videos.sources)) {
    const origin = origins.get(s?.id) ?? s?.origin
    if (!SOURCE_NAMES[origin] || !Number.isInteger(s?.count)) continue
    bySource.set(origin, (bySource.get(origin) ?? 0) + s.count)
  }
  return {
    videos: {
      count,
      sources: [...bySource].map(([kind, n]) => ({ kind, name: SOURCE_NAMES[kind], count: n }))
    }
  }
}

/**
 * What the model reads of the business: every fact and item by plan id, with its values; never a source's text. A fact
 * that stands for a field of an item (`plan-conflicts.mjs`) is not listed: the model reads it among the item's fields.
 * What the owner keeps off the site (`data.withheld`) is not listed either. A person customers named carries
 * `namedBy`, and the owner's videos are counted (`videos`), each only when present.
 */
export function modelViewOf(data) {
  const shown = ({ id }) => !data.withheld?.has(id)
  return {
    facts: data.facts
      .filter(({ id }) => !data.byId.get(id).itemField)
      .filter(shown)
      .map(({ id, kind, label, value }) => ({ id, kind, label, value })),
    items: data.items.filter(shown).map(({ id, kind, label }) => {
      const fields = data.byId.get(id).source.fields ?? {}
      const namedBy = data.byId.get(id).source.namedBy
      return {
        id,
        kind,
        label,
        fields: Object.fromEntries(Object.entries(fields).map(([role, f]) => [role, f?.value])),
        // A person only customers named in reviews (`needs-research-people.mjs`): name and role, nothing more.
        ...(typeof namedBy === 'string' ? { namedBy } : {})
      }
    }),
    // The owner's own videos, counted (P10): a block with a video place may use one.
    ...(data.videos ? { videos: data.videos } : {})
  }
}
