// What each slot of a template's `slot-roles.json` sidecar holds for one place profile (ADR 0037): every group of slots
// (one card, one person, one tier, one step) is locked to exactly one entity of the profile, so a name never meets
// another entity's price or photo. A group with no entity left, or a role its entity lacks, takes the group's neutral
// policy (`neutral-copy.mjs`): the template keeps every card. Only facts the assessment accepted are read. Pure.

import { readFileSync } from 'node:fs'
import { DEFAULT_NEUTRAL_BY_ROLE } from './place-content-roles.mjs'
import { hoursLine, shownPrice } from './pinned-copy.mjs'
import { numberIn } from './number-in-locale.mjs'
import { assessProfile } from './fact-assessment.mjs'
import { defaultOfferingKind, statedTradeOf } from './trades.mjs'

export const SLOT_FILL_VERSION = 'slot-fill/1'

const OFFERING_KINDS = Object.freeze({
  menu_item: ['dish', 'drink'],
  service: ['service', 'class', 'experience'],
  package: ['package', 'membership'],
  product: ['product'],
  room: ['room']
})
const NEUTRAL_KIND = Object.freeze({
  dish: 'dish',
  drink: 'drink',
  product: 'product',
  service: 'service',
  class: 'service',
  experience: 'service',
  package: 'service',
  membership: 'service',
  room: 'service'
})
const SOCIAL = new Set(['website', 'menu', 'booking', 'other'])
const SOCIAL_NAMES = Object.freeze({
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  twitter: 'X',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  zalo: 'Zalo',
  whatsapp: 'WhatsApp',
  tripadvisor: 'Tripadvisor'
})
/** The platform a source kind is, for naming a figure and telling two reads of one figure apart. */
const PLATFORM_OF_SOURCE = Object.freeze({
  'google-maps': 'Google',
  'google-places': 'Google',
  tripadvisor: 'Tripadvisor',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube'
})
const REVIEW_PLATFORMS = new Set(['Google', 'Tripadvisor'])
const STAT_LABELS = JSON.parse(readFileSync(new URL('./stat-labels.json', import.meta.url), 'utf8'))
const languageOf = (locale) => {
  const l = typeof locale === 'string' ? locale.trim().toLowerCase().split('-')[0] : ''
  return Object.hasOwn(STAT_LABELS, l) ? l : 'en'
}
/** Prose about the business is written by the model from the facts named, never copied into every heading. */
const PROSE = new Set([
  'business.tagline',
  'business.summary',
  'business.long_description',
  'business.category_label',
  'contact.map_label'
])

const list = (value) => (Array.isArray(value) ? value : [])
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '')
const unique = (ids) => [...new Set(ids.filter(Boolean))]

/**
 * The assessment of a revision frozen before its place profile was (ADR 0037): the host's demo-evidence policy
 * (`assessProfile`) with research origin, aged against the profile's own `madeAt` so no clock enters; `overrides` are
 * the owner's on-site choices (`candidate.factOverrides`, #1791).
 * @returns {Array<{factId: string, status: string, reasonCodes: string[], policyVersion: string, onSite: boolean}>}
 */
export function provisionalAssessment(profile, { overrides = null } = {}) {
  return profile ? assessProfile(profile, { origin: 'research', at: profile.madeAt ?? null, overrides }) : []
}

/**
 * `[{factId, status, onSite?}]` or `{facts: [...]}` as the set of fact ids the site may show: the on-site decision
 * (#1791, owner overrides included), or `accepted` for an assessment frozen before it had one.
 */
function acceptedIds(assessment) {
  const rows = Array.isArray(assessment) ? assessment : list(assessment?.facts)
  return new Set(
    rows
      .filter((r) => (typeof r?.onSite === 'boolean' ? r.onSite : r?.status === 'accepted'))
      .map((r) => r.factId)
  )
}

const onDemo = (f) => !list(f.value?.restrictions).includes('not-on-demo')

/** The accepted entities a profile offers each group kind, in the profile's order; none restricted to its platform. */
function entitiesOf(profile, ok) {
  const keep = (facts) => list(facts).filter((f) => f && ok(f.id) && onDemo(f))
  const offerings = keep(profile.offerings)
  const media = keep(profile.media)
  const links = keep(profile.links)
  const quotes = keep(profile.quotes)
  // One figure per (scope, label): a rating read twice from one page is one statistic.
  const statistics = statisticsOf(keep(profile.claims?.statistics), platformsOf(profile))
  return {
    offerings,
    media,
    links,
    trade: statedTradeOf(profile),
    people: keep(profile.people),
    faqs: keep(profile.faqs),
    // A testimonial card holds what a customer said, published for a site: the newest first, undated last.
    quotes: newestFirst(quotes.filter((q) => ['testimonial', 'review'].includes(q.value?.kind))),
    stories: quotes.filter((q) => q.value?.kind === 'story'),
    statistics,
    claims: [...keep(profile.claims?.recognitions), ...keep(profile.claims?.relationships)],
    events: keep(profile.events),
    socials: links.filter((l) => !SOCIAL.has(l.value?.kind))
  }
}

const dateOf = (f) => {
  const t = Date.parse(f.value?.publishedAt ?? '')
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY
}
const newestFirst = (facts) =>
  facts.toSorted((a, b) => (dateOf(b) > dateOf(a) ? 1 : dateOf(b) < dateOf(a) ? -1 : 0))

/** The platform each fact's evidence names, when it names exactly one (Google, Instagram…), or ''. */
function platformsOf(profile) {
  const sources = new Map(list(profile?.sources).map((x) => [x.id, x]))
  const evidence = new Map(list(profile?.evidence).map((x) => [x.id, x]))
  const sourcesOf = (fact) =>
    list(fact?.evidenceRefs)
      .map((ref) => sources.get(evidence.get(ref)?.sourceId))
      .filter(Boolean)
  const platformOf = (fact) => {
    const names = unique(sourcesOf(fact).map((x) => PLATFORM_OF_SOURCE[x.kind] ?? ''))
    return names.length === 1 ? names[0] : ''
  }
  return { sourcesOf, platformOf }
}

/**
 * The figures a demo may print, best first: Google and Tripadvisor ratings and review counts, then followers (most
 * first), then the rest, post counts last. A zero, or a figure no source backs, is no figure; one (platform, metric) is
 * printed once.
 */
function statisticsOf(facts, { sourcesOf, platformOf }) {
  const seen = new Set()
  const kept = facts.filter((f) => {
    if (!(Number.isFinite(f.value?.amount) && f.value.amount > 0) || !sourcesOf(f).length) return false
    const key = JSON.stringify([platformOf(f) || f.value?.scope || null, f.value?.label ?? null])
    return !seen.has(key) && seen.add(key)
  })
  const tier = (f) =>
    REVIEW_PLATFORMS.has(platformOf(f)) && ['rating', 'reviewCount'].includes(f.value.label)
      ? 0
      : f.value.label === 'followers'
        ? 1
        : f.value.label === 'posts'
          ? 3
          : 2
  return kept
    .map((f, index) => ({ f, index }))
    .sort(
      (a, b) =>
        tier(a.f) - tier(b.f) ||
        (tier(a.f) === 1 ? b.f.value.amount - a.f.value.amount : 0) ||
        a.index - b.index
    )
    .map((x) => x.f)
}

/** The ordered entities a group may take: its own kind first, then each allowed kind; one entity once. */
function listFor(group, found, cache) {
  const kinds = unique([group.entityKind, ...list(group.allowedKinds)])
  const key = kinds.join(',')
  if (cache.has(key)) return cache.get(key)
  let out = []
  if (kinds.some((k) => OFFERING_KINDS[k])) {
    // One group kind's offerings keep the profile's order: a menu's coffees and dishes as the menu lists them.
    out = kinds.flatMap((k) =>
      found.offerings.filter((o) => (OFFERING_KINDS[k] ?? []).includes(o.value?.kind))
    )
    // An offering of no known kind is still one the business offers: after every typed one.
    out.push(...found.offerings.filter((o) => !o.value?.kind || o.value.kind === 'unknown'))
  } else
    for (const k of kinds)
      out.push(
        ...({
          person: found.people,
          faq: found.faqs,
          quote: found.quotes,
          stat_item: found.statistics,
          claim: found.claims,
          event: found.events,
          contact: found.socials
        }[k] ?? [])
      )
  out = [...new Map(out.map((f) => [f.id, f])).values()]
  cache.set(key, out)
  return out
}

/** The kind a neutral offering name speaks of: the list's own entities, else the business's trade. */
function neutralKind(entities, found) {
  const first = entities[0] ?? found.offerings[0]
  if (first) return NEUTRAL_KIND[first.value?.kind] ?? 'service'
  return defaultOfferingKind(found.trade)
}

/** The price of an offering as its menu prints it: each size's, a shortened one at its full amount. */
function priceOf(offering, locale) {
  return list(offering.value?.variants)
    .filter((v) => text(v?.price?.raw))
    .map((v) => {
      const shown = shownPrice(v.price.raw.trim(), v.price.priceScale, locale)
      return text(v.size) ? `${v.size.trim()} ${shown}` : shown
    })
    .join(' · ')
}

const durationOf = (offering) => {
  const v = list(offering.value?.variants).find((x) => x?.duration || text(x?.price?.unit))
  if (!v) return ''
  return v.duration ? `${v.duration.amount} ${v.duration.unit}` : text(v.price.unit)
}

const initials = (name) =>
  text(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0]?.toUpperCase() ?? '')
    .join('')

/** A phone as a link a door takes: its digits, or nothing. */
function telOf(phone) {
  const digits = text(phone).replace(/[^+\d]/g, '')
  return /^\+?\d{4,}$/.test(digits) ? `tel:${digits}` : ''
}

/**
 * @param {object} input
 * @param {{groups: any[], bindings: any[]}} input.slotRoles - a `ready` `slot-roles.json`
 * @param {object} input.profile - a place profile 1.0.0
 * @param {Array<{factId: string, status: string}> | {facts: Array<{factId: string, status: string}>}} input.assessment
 * @param {string} [input.locale] - the site's language
 * @param {(args: {role: string, policy: object, kind?: string, index?: number, locale: string, business: object})
 *   => {state: 'neutral'|'empty', text: string, neutralKey?: string}} input.neutralFor - `neutral-copy.mjs`
 * @returns {{version: string, locale: string, writes: Array<{slotKey: string, groupId: string, role: string,
 *   mode: string, value: any, state: 'sourced'|'composed'|'neutral'|'empty', entityId?: string, factRefs: string[],
 *   neutralKey?: string}>, manifest: object[], offerings: Array<{entityId: string, kind: string, name: string,
 *   description: string, price: string}>}}
 *   `value`: text for a text or link slot, `{mediaId, url}` for a picture, null for a composed slot, '' when empty
 */
export function planSlotFill({ slotRoles, profile, assessment, locale = 'en', neutralFor }) {
  if (typeof neutralFor !== 'function') throw new TypeError('planSlotFill needs neutralFor')
  const accepted = acceptedIds(assessment)
  const ok = (id) => accepted.has(id)
  const found = entitiesOf(profile ?? {}, ok)
  const b = profile?.business ?? {}
  const fact = (f) => (f && ok(f.id) ? f : null)
  // The brand's name only stands in for a business name the profile does not have: a business name held off the
  // site is never replaced by the brand's record of the same name.
  const name = b.name ? fact(b.name) : fact(profile?.brand?.name)
  const phone = fact(b.phone) ?? fact(b.internationalPhoneNumber) ?? fact(b.nationalPhoneNumber)
  const email = fact(b.email)
  const booking = found.links.find((l) => l.value?.kind === 'booking' && /^https:\/\//i.test(l.value.url))
  // Only accepted facts may make a call to action real (`requires: contact-target`).
  const contact = {
    ...(phone ? { phone: phone.value } : {}),
    ...(email ? { email: email.value } : {}),
    ...(booking ? { contactPage: booking.value.url } : {})
  }
  const target = booking
    ? { href: booking.value.url, ref: booking.id }
    : phone && telOf(phone.value)
      ? { href: telOf(phone.value), ref: phone.id }
      : email && /^[^\s@]+@[^\s@]+$/.test(email.value)
        ? { href: `mailto:${email.value}`, ref: email.id }
        : null
  const pictureOf = (entityId) =>
    found.media.find((m) =>
      list(m.value?.relations).some(
        (r) => r.entityId === entityId && ['depicts', 'portrait-of', 'logo-of'].includes(r.relation)
      )
    )
  const { platformOf } = platformsOf(profile)
  /** A figure's printed label in the site language: "Instagram followers"; none for a metric with no words. */
  const statLabelOf = (entity) => {
    const platform = platformOf(entity)
    const words = STAT_LABELS[languageOf(locale)][entity?.value?.label]
    return platform && words ? words.replace('{platform}', platform) : ''
  }
  const asset = (m) => (m ? { mediaId: m.id, ...(m.value.url ? { url: m.value.url } : {}) } : null)
  /** Facts a composed slot may lean on when its entity is the business. */
  const businessRefs = (role) =>
    unique(
      [
        name?.id,
        ...(role === 'business.tagline' ? [fact(profile?.brand?.tagline)?.id] : []),
        ...(role === 'business.summary' || role === 'business.long_description'
          ? found.stories.map((s) => s.id)
          : []),
        ...(role === 'business.category_label'
          ? list(profile?.classification?.derivedCategories)
              .filter((f) => ok(f.id))
              .map((f) => f.id)
          : []),
        ...(role === 'contact.map_label' ? [fact(b.address)?.id] : [])
      ].filter(Boolean)
    )

  /** What one role of an entity holds: `{value, refs}`, or null when the entity has no such field. */
  function valueOf(role, entity) {
    const v = entity?.value ?? {}
    const one = (value, refs = [entity.id]) => (text(value) ? { value: text(value), refs } : null)
    const field = role.split('.')[1]
    switch (role.split('.')[0]) {
      case 'offering':
      case 'package': {
        if (!entity) return null
        if (field === 'name') return one(v.name)
        if (field === 'description' || field === 'summary') return one(v.description)
        if (field === 'category') return one(v.section)
        if (field === 'price') return one(priceOf(entity, locale))
        if (field === 'price_note')
          return one(list(v.variants).find((x) => x?.price?.conditions)?.price.conditions)
        if (field === 'period')
          return one(list(v.variants).find((x) => x?.price?.billingPeriod)?.price.billingPeriod)
        if (field === 'duration_or_unit') return one(durationOf(entity))
        if (field === 'variant_meta')
          return one(
            list(v.variants)
              .map((x) => text(x?.size))
              .filter(Boolean)
              .join(' · ')
          )
        if (field === 'image') {
          const m = pictureOf(entity.id)
          return m ? { value: asset(m), refs: [entity.id, m.id] } : null
        }
        return null
      }
      case 'person':
        if (!entity) return null
        if (field === 'name' || field === 'role' || field === 'bio') return one(v[field])
        if (field === 'initials') return one(initials(v.name))
        if (field === 'social_url') return one(v.url)
        if (field === 'image') {
          const m = pictureOf(entity.id)
          return m ? { value: asset(m), refs: [entity.id, m.id] } : null
        }
        return null
      case 'quote': {
        if (!entity) return null
        const by = v.attribution && typeof v.attribution === 'object' ? v.attribution : {}
        if (field === 'text') return one(v.text)
        if (field === 'author_name') return one(v.author)
        // A review's line under its author names the platform it was left on.
        if (field === 'author_context')
          return one(
            typeof v.attribution === 'string' ? v.attribution : v.kind === 'review' ? platformOf(entity) : ''
          )
        // The reviewer's own avatar, from the same review: never another entity's picture.
        if (field === 'author_image')
          return /^https:\/\//i.test(text(by.authorAvatarUrl))
            ? { value: { url: by.authorAvatarUrl.trim() }, refs: [entity.id] }
            : null
        if (field === 'rating_or_source') {
          const stars = Number.isFinite(by.rating) ? `${by.rating}/5` : ''
          return one([stars, platformOf(entity)].filter(Boolean).join(' · '))
        }
        return null
      }
      case 'faq':
        return entity ? one(v[field]) : null
      case 'stat':
        if (!entity) return null
        if (field === 'value') return one(Number.isFinite(v.amount) ? numberIn(v.amount, locale) : '')
        if (field === 'label') return one(statLabelOf(entity))
        if (field === 'unit') return one(v.unit)
        if (field === 'context') return one(platformOf(entity))
        return null
      case 'claim':
        if (!entity) return null
        if (field === 'entity_name' || field === 'award_or_cert') return one(v.name)
        if (field === 'entity_url') return one(v.url)
        if (field === 'year_or_issuer') return one(v.date ?? v.issuer)
        if (field === 'entity_logo') {
          const m = pictureOf(entity.id)
          return m ? { value: asset(m), refs: [entity.id, m.id] } : null
        }
        return null
      case 'event':
        if (!entity) return null
        if (field === 'title') return one(v.name)
        if (field === 'description') return one(v.description)
        if (field === 'date_or_year') return one(v.startsAt)
        if (field === 'image') {
          const m = pictureOf(entity.id)
          return m ? { value: asset(m), refs: [entity.id, m.id] } : null
        }
        return null
      case 'business':
        if (field === 'name') return name ? { value: name.value, refs: [name.id] } : null
        if (field === 'logo') {
          const logo = fact(profile?.brand?.logo)
          const m = logo && found.media.find((x) => x.id === logo.value?.mediaId)
          return m ? { value: asset(m), refs: [logo.id, m.id] } : null
        }
        return null
      case 'contact': {
        if (field === 'phone') return phone ? { value: phone.value, refs: [phone.id] } : null
        if (field === 'email') return email ? { value: email.value, refs: [email.id] } : null
        if (field === 'address') {
          const a = fact(b.address)
          return a ? { value: a.value, refs: [a.id] } : null
        }
        if (field === 'hours') {
          const h = fact(b.hours)
          const lines = list(h?.value)
            .map((x) => hoursLine(text(x)))
            .filter(Boolean)
          return h && lines.length ? { value: lines.join('; '), refs: [h.id] } : null
        }
        // A contact group's nth entity is the nth social profile the business keeps.
        if (field === 'social_url') return entity ? one(entity.value.url) : null
        if (field === 'social_label')
          return entity
            ? one(SOCIAL_NAMES[entity.value.kind] ?? entity.value.label ?? entity.value.kind)
            : null
        return null
      }
      default:
        return null
    }
  }

  const groups = new Map(list(slotRoles?.groups).map((g) => [g.groupId ?? g.id, g]))
  const cache = new Map()
  const picked = new Map()
  for (const [id, group] of groups) {
    const entities =
      group.entityKind === 'business' || group.entityKind === 'step' ? [] : listFor(group, found, cache)
    const index = Number.isInteger(group.itemIndex) ? group.itemIndex : 0
    picked.set(id, { entity: entities[index] ?? null, kind: neutralKind(entities, found), index })
  }

  const writes = []
  for (const binding of list(slotRoles?.bindings)) {
    const group = groups.get(binding.groupId)
    if (!group) continue
    const { entity, kind, index } = picked.get(binding.groupId)
    const { role, mode = 'copy', slotKey } = binding
    const base = { slotKey, groupId: binding.groupId, role, mode, ...(entity ? { entityId: entity.id } : {}) }
    const neutral = () => {
      const policy = group.neutral?.[role] ?? DEFAULT_NEUTRAL_BY_ROLE[role] ?? { policy: 'empty' }
      const got = neutralFor({ role, policy, kind, index, locale, business: contact })
      return got?.state === 'neutral' && text(got.text)
        ? {
            ...base,
            value: got.text,
            state: 'neutral',
            factRefs: [],
            ...(got.neutralKey ? { neutralKey: got.neutralKey } : {})
          }
        : { ...base, value: '', state: 'empty', factRefs: [] }
    }
    const isCta = /\.cta_(label|url)$/.test(role)
    if (isCta) {
      // A label and its link come from one target: a label with no target is empty, so is its link.
      const label = neutral()
      if (role.endsWith('_label') || !target) {
        writes.push(
          role.endsWith('_label') && target ? label : { ...base, value: '', state: 'empty', factRefs: [] }
        )
        continue
      }
      writes.push({ ...base, value: target.href, state: 'sourced', factRefs: [target.ref] })
      continue
    }
    const businessGroup = group.entityKind === 'business' || group.entityKind === 'contact'
    const sourcedLabel = role === 'stat.label' ? valueOf(role, entity) : null
    if (sourcedLabel) {
      writes.push({
        ...base,
        value: sourcedLabel.value,
        state: 'sourced',
        factRefs: unique(sourcedLabel.refs)
      })
      continue
    }
    if (mode === 'compose' || PROSE.has(role) || role === 'stat.label') {
      const refs =
        role === 'stat.label'
          ? entity
            ? [entity.id]
            : []
          : entity && !businessGroup
            ? [entity.id]
            : businessRefs(role)
      writes.push(
        refs.length ? { ...base, value: null, state: 'composed', factRefs: unique(refs) } : neutral()
      )
      continue
    }
    if (role === 'business.hero_image') {
      const refs = found.media.map((m) => m.id)
      writes.push(refs.length ? { ...base, value: null, state: 'composed', factRefs: refs } : neutral())
      continue
    }
    const got = valueOf(role, entity)
    writes.push(got ? { ...base, value: got.value, state: 'sourced', factRefs: unique(got.refs) } : neutral())
  }

  const manifest = writes.map((w) => ({
    slotKey: w.slotKey,
    state: w.state,
    ...(w.neutralKey ? { neutralKey: w.neutralKey } : {}),
    locale,
    ...(w.entityId ? { entityId: w.entityId } : {}),
    factRefs: w.factRefs
  }))
  const offerings = found.offerings.map((o) => ({
    entityId: o.id,
    kind: o.value?.kind ?? 'unknown',
    name: text(o.value?.name),
    description: text(o.value?.description),
    price: priceOf(o, locale)
  }))
  return { version: SLOT_FILL_VERSION, locale, writes, manifest, offerings }
}
