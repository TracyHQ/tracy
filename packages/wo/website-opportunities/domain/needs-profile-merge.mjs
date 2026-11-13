// The merge half of the needs profile (ticket #592, ADR 0046): observations read source by source (by the model, or
// taken as they are from a listing's structured fields) become one record per data kind. Pure: no clock, no model.
//
// - A fact or an item field stated the same way by two distinct sources is `corroborated`; by one, `single-source`
//   (the levels of `fact-confidence.mjs`).
// - Values that disagree are never settled here: they are kept as a conflict for the customer to choose, and the
//   default shown until then follows the trust order (`TRUST_ORDER`).
import { CONFIDENCE_LEVELS } from './fact-confidence.mjs'
import { samePhone } from './needs-profile-phone.mjs'
import { GROUP_KINDS_V3 } from './place-content-roles.mjs'
import { mergeRows } from './needs-profile-rows.mjs'

/**
 * Source origins, most trusted first: the business's own website, then what the owner told us in the build chat
 * (`answer`, the source `owner-statement`, decision D46), then its Google listing, then social profiles.
 * 🔒 `answer` sits below `website` and above `google`: both are the owner's own words, but the website is the owner's
 * published, edited record while the chat statement is free prose a model read facts out of, so a disagreement keeps
 * the website's value as its default; a third party's listing or a social page never outranks the owner. An answer the
 * customer gives to a plan question is not ranked here at all: `settleAnswers` (`plan-answers.mjs`) writes it over the
 * merged fact after this merge (source `customer-answer`), so it always wins, and a disagreement between the chat
 * statement and another source is a conflict the customer settles by such an answer.
 */
export const TRUST_ORDER = Object.freeze(['website', 'answer', 'google', 'social'])
const [CORROBORATED, SINGLE_SOURCE] = CONFIDENCE_LEVELS

/** Business facts the profile holds once (a disagreement is a conflict). */
export const SINGLE_FACT_KINDS = Object.freeze([
  'business.name',
  'business.founded_year',
  'contact.phone',
  'contact.email',
  'contact.address',
  'contact.hours',
  'contact.cta_url'
])
/** Business facts the profile may hold several of (every value is kept, none conflicts). */
export const LIST_FACT_KINDS = Object.freeze(['contact.social_url'])
/** Item kinds (group kinds of `place-content-roles/3`) and the role prefix their fields must carry. */
export const ITEM_KINDS = Object.freeze({
  service: 'offering.',
  package: 'package.',
  person: 'person.',
  quote: 'quote.',
  gallery: 'business.gallery_image'
})
/** The field that names an item: two observations with the same one are the same item. */
export const primaryRoleOf = (kind) => GROUP_KINDS_V3[kind].requiredRoles[0]

const trustRank = (origin) => {
  const rank = TRUST_ORDER.indexOf(origin)
  return rank === -1 ? TRUST_ORDER.length : rank
}
const text = (value) =>
  String(value)
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const url = (value) =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
/** The comparison keys the observations reuse to ground a value in its quote (`needs-profile-grounding.mjs`). */
export { text as textKey, url as urlKey }

/**
 * Whether two values of data kind `kind` say the same thing. Phones compare as numbers (`samePhone`: trunk 0,
 * country code and extension aside); the value shown stays the one written by the most trusted source.
 */
export function sameValue(kind, a, b) {
  if (kind === 'contact.phone') return samePhone(a, b)
  if (kind.endsWith('_url') || kind === 'business.gallery_image') return url(a) === url(b)
  return text(a) === text(b)
}

/**
 * Observations of one data kind, grouped by value: each group lists its sources, most trusted first, and the groups are
 * ordered by their most trusted source (then by how many sources state them).
 * @param {string} kind
 * @param {{value: string, source: {id: string, origin: string}}[]} observations
 */
function clustersOf(kind, observations) {
  const clusters = []
  for (const obs of observations) {
    const found = clusters.find((c) => sameValue(kind, c.observations[0].value, obs.value))
    if (found) found.observations.push(obs)
    else clusters.push({ observations: [obs] })
  }
  for (const c of clusters) {
    c.observations.sort((a, b) => trustRank(a.source.origin) - trustRank(b.source.origin))
    c.rank = trustRank(c.observations[0].source.origin)
    c.sources = [...new Set(c.observations.map((o) => o.source.id))]
  }
  return clusters.sort((a, b) => a.rank - b.rank || b.sources.length - a.sources.length)
}

/**
 * One fact (or item field) from its observations. When they disagree a conflict is pushed to `conflicts` and the fact
 * keeps the trust order's default, marked with the conflict's id.
 */
export function settle(kind, at, observations, conflicts) {
  const clusters = clustersOf(kind, observations)
  const [first] = clusters
  const fact = { value: first.observations[0].value, sources: first.sources }
  if (clusters.length === 1) {
    return { ...fact, confidence: fact.sources.length > 1 ? CORROBORATED : SINGLE_SOURCE }
  }
  const id = `conflict-${conflicts.length + 1}`
  conflicts.push({
    id,
    kind,
    at,
    values: clusters.map((c) => ({
      value: c.observations[0].value,
      sources: c.sources,
      origins: [...new Set(c.observations.map((o) => o.source.origin))]
    })),
    default: fact.value,
    defaultBy: 'trust-order',
    chosen: null
  })
  return { ...fact, confidence: SINGLE_SOURCE, conflict: id }
}

/** Business facts per data kind, every entry with its sources and confidence. */
export function mergeFacts(observations, conflicts) {
  const facts = {}
  for (const kind of [...SINGLE_FACT_KINDS, ...LIST_FACT_KINDS]) {
    const mine = observations.filter((o) => o.kind === kind)
    if (mine.length === 0) continue
    if (SINGLE_FACT_KINDS.includes(kind)) {
      facts[kind] = [settle(kind, `facts.${kind}`, mine, conflicts)]
      continue
    }
    facts[kind] = clustersOf(kind, mine).map((c) => ({
      value: c.observations[0].value,
      sources: c.sources,
      confidence: c.sources.length > 1 ? CORROBORATED : SINGLE_SOURCE
    }))
  }
  return facts
}

const slug = (value) => text(value).replace(/ /g, '-').slice(0, 48) || 'item'

/**
 * Items per item kind. Observations naming the same item (`primaryRoleOf`) join; each field is settled like a fact.
 * @param {{kind: string, fields: Record<string, string>, label?: string, source: {id: string, origin: string}}[]} observations
 */
export function mergeItems(observations, conflicts) {
  const items = {}
  const ordered = [...observations].sort((a, b) => trustRank(a.source.origin) - trustRank(b.source.origin))
  for (const kind of Object.keys(ITEM_KINDS)) {
    const primary = primaryRoleOf(kind)
    const groups = []
    for (const obs of ordered.filter((o) => o.kind === kind)) {
      const found = groups.find((g) => sameValue(primary, g[0].fields[primary], obs.fields[primary]))
      if (found) found.push(obs)
      else groups.push([obs])
    }
    if (groups.length === 0) continue
    const used = new Set()
    items[kind] = groups.map((group) => {
      let id = `${kind}-${slug(group[0].fields[primary])}`
      for (let n = 2; used.has(id); n++) id = `${kind}-${slug(group[0].fields[primary])}-${n}`
      used.add(id)
      const roles = [...new Set(group.flatMap((o) => Object.keys(o.fields)))]
      const fields = {}
      for (const role of roles) {
        const said = group
          .filter((o) => o.fields[role] !== undefined)
          .map((o) => ({ value: o.fields[role], source: o.source }))
        fields[role] = settle(role, `items.${kind}.${id}.${role}`, said, conflicts)
      }
      const sources = [...new Set(group.map((o) => o.source.id))]
      const label = group.find((o) => o.label)?.label ?? null
      // The rows its sources state (`needs-profile-rows.mjs`), kept only when there are some.
      const rows = mergeRows(
        group.flatMap((o) => (o.rows ?? []).map((r) => ({ ...r, source: o.source }))),
        id
      )
      return {
        id,
        kind,
        fields,
        sources,
        confidence: sources.length > 1 ? CORROBORATED : SINGLE_SOURCE,
        ...(kind === 'gallery' ? { label } : {}),
        ...(rows.length ? { rows } : {})
      }
    })
  }
  return items
}
