import { readFileSync } from 'node:fs'

const schema = JSON.parse(readFileSync(new URL('./place-profile-schema.json', import.meta.url), 'utf8'))
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const field = (path, key) => (path ? `${path}.${key}` : key)
const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v)
const SCHEME = /^([a-z][a-z0-9+.-]*):/i
const schemeOf = (v) => SCHEME.exec(v)?.[1].toLowerCase()
const web = (v) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol)
  } catch {
    return false
  }
}
/** The address when it is http(s), for adapters to drop any other scheme before it reaches a profile. */
export const webAddress = (v) => (typeof v === 'string' && web(v) ? v : undefined)
/** A source ref when a profile may carry it: an opaque id, an http(s) address or an internal `stored:` ref. */
export const sourceRef = (v) => (typeof v === 'string' && FORMATS['source-ref'](v) ? v : undefined)
// Contact schemes are allowed only on a link that says it is a contact; internal refs never navigate.
const CONTACT = { tel: 'phone', mailto: 'email' }
const FORMATS = {
  'http-url': web,
  'link-url': (v) => web(v) || Object.hasOwn(CONTACT, schemeOf(v) ?? ''),
  'source-ref': (v) => !schemeOf(v) || web(v) || ['stored', 'content'].includes(schemeOf(v))
}
// Addresses inside open-ended values (an attribution, an extension) are held to the same rule.
const URL_KEY = /^(url|uri|href)$|(Url|Uri|Href)$/

export function emptyPlaceProfile(businessId) {
  return {
    schema: 'website-opportunities/place-profile',
    schemaVersion: '1.0.0',
    business: { id: businessId },
    classification: { providerCategories: [], derivedCategories: [] },
    offerings: [],
    people: [],
    claims: { statistics: [], recognitions: [], relationships: [] },
    faqs: [],
    quotes: [],
    events: [],
    media: [],
    brand: {},
    links: [],
    sources: [],
    evidence: [],
    coverage: [],
    conflicts: [],
    extensions: {}
  }
}

/** Validate the keywords used by this schema, then check its graph of provenance and entity references. */
export function validatePlaceProfile(doc) {
  const errors = []
  const err = (path, code) => errors.push({ path, code })
  function check(value, rule, path) {
    if (rule.$ref) return check(value, schema.$defs[rule.$ref.split('/').at(-1)], path)
    if (rule.type && ![].concat(rule.type).includes(typeOf(value))) return err(path, 'TYPE')
    if (typeof value === 'number' && !Number.isFinite(value)) return err(path, 'TYPE')
    if ('const' in rule && value !== rule.const) err(path, 'CONST')
    if (rule.enum && !rule.enum.includes(value)) err(path, 'ENUM')
    if (typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) err(path, 'MIN_LENGTH')
      if (rule.maxLength !== undefined && value.length > rule.maxLength) err(path, 'MAX_LENGTH')
      if (rule.format && FORMATS[rule.format] && !FORMATS[rule.format](value)) err(path, 'URL_SCHEME')
    }
    if (typeof value === 'number') {
      if (rule.minimum !== undefined && value < rule.minimum) err(path, 'MINIMUM')
      if (rule.exclusiveMinimum !== undefined && value <= rule.exclusiveMinimum) err(path, 'MINIMUM')
    }
    if (Array.isArray(value)) {
      if (rule.minItems && value.length < rule.minItems) err(path, 'MIN_ITEMS')
      if (rule.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length)
        err(path, 'UNIQUE_ITEMS')
      if (rule.items) value.forEach((v, i) => check(v, rule.items, `${path}[${i}]`))
    }
    if (object(value)) {
      for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) err(field(path, key), 'REQUIRED')
      for (const [key, child] of Object.entries(value)) {
        const sub =
          (Object.hasOwn(rule.properties ?? {}, key) ? rule.properties[key] : undefined) ??
          Object.entries(rule.patternProperties ?? {}).find(([pattern]) => new RegExp(pattern).test(key))?.[1]
        if (sub) check(child, sub, field(path, key))
        else if (rule.additionalProperties === false) err(field(path, key), 'ADDITIONAL_PROPERTY')
        else if (object(rule.additionalProperties)) check(child, rule.additionalProperties, field(path, key))
      }
    }
  }
  check(doc, schema, '')
  if (errors.length) return { ok: false, errors }

  const ids = new Set()
  const sources = new Set(doc.sources.map((s) => s.id))
  const evidence = new Set(doc.evidence.map((e) => e.id))
  const entities = new Set([doc.business.id])
  const refs = []
  const register = (id, path) => {
    if (ids.has(id)) err(path, 'DUPLICATE_ID')
    ids.add(id)
  }
  register(doc.business.id, 'business.id')
  function addresses(value, path) {
    if (Array.isArray(value)) return value.forEach((v, i) => addresses(v, `${path}[${i}]`))
    if (!object(value)) return
    for (const [key, child] of Object.entries(value)) {
      const at = field(path, key)
      if (
        typeof child === 'string' &&
        URL_KEY.test(key) &&
        !web(child) &&
        !(at.startsWith('links[') && key === 'url')
      )
        err(at, 'URL_SCHEME')
      else addresses(child, at)
    }
  }
  function walk(value, path) {
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${path}[${i}]`))
    if (!object(value)) return
    if (Object.hasOwn(value, 'value') && Object.hasOwn(value, 'evidenceRefs')) {
      register(value.id, `${path}.id`)
      entities.add(value.id)
      refs.push([value.evidenceRefs, `${path}.evidenceRefs`, evidence, 'EVIDENCE_NOT_FOUND'])
      if (value.derivation?.inputRefs)
        refs.push([value.derivation.inputRefs, `${path}.derivation.inputRefs`, entities, 'FACT_NOT_FOUND'])
      const attribution = value.value?.attribution
      if (typeof attribution === 'string' && schemeOf(attribution) && !web(attribution))
        err(`${path}.value.attribution`, 'URL_SCHEME')
      // The value is source data: a provider's own `id` or `evidenceRefs` is not our graph.
      return addresses(value.value, `${path}.value`)
    }
    for (const [key, child] of Object.entries(value)) walk(child, field(path, key))
  }
  for (const key of [
    'business',
    'classification',
    'offerings',
    'people',
    'claims',
    'faqs',
    'quotes',
    'events',
    'media',
    'brand',
    'links',
    'conflicts',
    'extensions'
  ])
    walk(doc[key], key)
  doc.sources.forEach((s, i) => register(s.id, `sources[${i}].id`))
  doc.evidence.forEach((e, i) => {
    register(e.id, `evidence[${i}].id`)
    if (!sources.has(e.sourceId)) err(`evidence[${i}].sourceId`, 'SOURCE_NOT_FOUND')
    const at = e.locator.value
    if (
      typeof at === 'string' &&
      (e.locator.kind === 'url' ? !web(at) : schemeOf(at) && !web(at) && schemeOf(at) !== 'content')
    )
      err(`evidence[${i}].locator.value`, 'URL_SCHEME')
    if (object(at)) addresses(at, `evidence[${i}].locator.value`)
  })
  doc.conflicts.forEach((c, i) => register(c.id, `conflicts[${i}].id`))
  doc.links.forEach((l, i) => {
    const contact = CONTACT[schemeOf(l.value.url) ?? '']
    if (contact && l.value.kind !== contact) err(`links[${i}].value.url`, 'URL_SCHEME')
  })
  doc.coverage.forEach((c, i) =>
    refs.push([c.sourceRefs, `coverage[${i}].sourceRefs`, sources, 'SOURCE_NOT_FOUND'])
  )
  doc.media.forEach((m, i) =>
    m.value.relations.forEach((r, j) => {
      const path = `media[${i}].value.relations[${j}]`
      if (!entities.has(r.entityId)) err(`${path}.entityId`, 'ENTITY_NOT_FOUND')
      refs.push([r.evidenceRefs, `${path}.evidenceRefs`, evidence, 'EVIDENCE_NOT_FOUND'])
    })
  )
  for (const [list, path, known, code] of refs)
    list.forEach((id, i) => {
      if (!known.has(id)) err(`${path}[${i}]`, code)
    })
  return { ok: errors.length === 0, errors }
}
