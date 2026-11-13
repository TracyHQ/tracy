// The data a build plan may show, taken from a needs profile (ticket #593, ADR 0046 decision 3). Every fact and item of
// the profile gets a plan id; the plan composer's model names data only by these ids, and the rules gate
// (`plan-gate.mjs`) holds every id of a composed plan to this list, so a plan never shows what the business does not
// have. Pure: a profile in, the plan's facts and items out, in the Contract B shape (`build-contract-plan.mjs`).
import { GROUP_KINDS_V3 } from './place-content-roles.mjs'

/** How the customer reads where a fact came from, per source origin of the needs profile. */
export const SOURCE_NAMES = Object.freeze({
  website: 'Website',
  google: 'Google listing',
  social: 'Social profile'
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
  'contact.social_url': 'Social link'
})
/** How the customer reads a group of items of one kind, plural (`plan-placement.mjs` reasons, left out entries). */
export const ITEM_NOUNS = Object.freeze({
  service: 'services',
  menu_item: 'dishes',
  package: 'packages',
  person: 'team members',
  quote: 'reviews',
  gallery: 'photos',
  stat_item: 'figures',
  step: 'steps',
  claim: 'awards',
  faq: 'questions and answers',
  event: 'events',
  post: 'posts'
})

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** A plan id from a data kind: `contact.cta_url` gives `contact-cta-url` (a plan field path splits on dots). */
const idOf = (kind) => kind.replace(/[._]+/g, '-')
const short = (value, max = 60) => {
  const text = String(value).trim().replace(/\s+/g, ' ')
  return text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`
}

function sourcesOf(ids, origins) {
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
 * plus `byId` (plan id -> `{what: 'fact' | 'item', kind, entry, source}` where `source` is the profile record).
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
      const entry = { id, kind, label: FACT_LABELS[kind] ?? kind, value: fact.value, sources }
      facts.push(entry)
      byId.set(id, { what: 'fact', kind, entry, source: fact })
    })
  }
  for (const [kind, values] of Object.entries(profile?.items ?? {})) {
    for (const item of list(values)) {
      const sources = sourcesOf(item?.sources, origins)
      if (!isText(item?.id) || byId.has(item.id) || sources.length === 0) continue
      const entry = { id: item.id, kind, label: itemLabel(item), sources }
      items.push(entry)
      byId.set(item.id, { what: 'item', kind, entry, source: item })
    }
  }
  return { facts, items, byId }
}

/** What the model reads of the business: every fact and item by plan id, with its values; never a source's text. */
export function modelViewOf(data) {
  return {
    facts: data.facts.map(({ id, kind, label, value }) => ({ id, kind, label, value })),
    items: data.items.map(({ id, kind, label }) => {
      const fields = data.byId.get(id).source.fields ?? {}
      return {
        id,
        kind,
        label,
        fields: Object.fromEntries(Object.entries(fields).map(([role, f]) => [role, f?.value]))
      }
    })
  }
}

/** The assumptions a profile brings: each fact whose sources disagree shows the default it took, to correct. */
export function conflictAssumptionsOf(profile, data) {
  const out = []
  for (const conflict of list(profile?.conflicts)) {
    const fact = data.facts.find((f) => data.byId.get(f.id).source.conflict === conflict.id)
    if (!fact) continue
    const others = list(conflict.values).filter((v) => v.value !== fact.value).length
    out.push({
      id: conflict.id,
      field: `facts[${fact.id}].value`,
      said: `Your sources disagree on the ${fact.label.toLowerCase()} (${others + 1} values). The one from the most trusted source is used.`
    })
  }
  return out
}
