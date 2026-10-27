/**
 * The three envelopes a brief-driven seed passes through, and a plain validator for each.
 *
 * WHY THREE AND NOT ONE. Each envelope is the boundary of a different authority, and the whole
 * point of naming them separately is that a later stage can never quietly assume the authority of
 * an earlier one:
 *
 *   Site brief   — what the CUSTOMER said, with provenance. Written by code (`normalize.js`),
 *                  never by a model. Facts nobody supplied are `missing`, not invented.
 *   Content plan — what the MODEL wrote, addressed by semantic key only. It holds no slot key, no
 *                  entity, no path, no SQL and no CMS id, because a model that can name one of
 *                  those can choose where a write lands.
 *   Seed map     — what the COMPILER decided: physical slots, batches, deterministic apply ids.
 *                  This is the only envelope the Claude Cowork plugin ever sees.
 *
 * The validators are pure JavaScript on purpose — no dependency is added for them, and they run in
 * the same process as the compiler so a refusal costs a function call rather than a stage.
 *
 * ⚠ SCHEMA HOUSE, PER ADR 0016. These are transport envelopes for one build, NOT a second copy of
 * the neutral `site-model.json` source contract that ADR 0016 puts in the skill repos. Nothing here
 * carries CMS vocabulary: `acm`, `positions`, `com_content`, `wp_block`, `wp_navigation`,
 * `collection` and `entry.data` do not appear, and `assertNoCmsVocabulary` below enforces that on
 * the content plan at runtime rather than by eye.
 *
 * ⚠ MERGE POINT (session A). `canonicalJson` here is byte-identical in behaviour to the one session
 * A is adding to `lib/questions-schema.mjs`. That file is NOT on this branch yet (checked 22/09), so
 * importing it would be importing something that does not exist. When A's commit lands, this copy
 * collapses into that import — one function, one house.
 */
import { createHash } from 'node:crypto'

export const BRIEF_SCHEMA = 'tracy-site-brief/v1'
export const CONTENT_PLAN_SCHEMA = 'tracy-content-plan/v1'
export const SEED_MAP_SCHEMA = 'tracy-seed-map/v1'

/** Source kinds a customer fact may come from. A release's own demo content is NOT among them. */
export const CUSTOMER_SOURCE_KINDS = Object.freeze(['answer', 'chat', 'asset'])
/** Source kinds that describe the archive, never the customer. Facts from these stay demo facts. */
export const DEMO_SOURCE_KINDS = Object.freeze(['release-demo', 'release-setting', 'capability'])

/**
 * Keys a content plan group may not carry, whatever their value. Each one is a way for a model's
 * output to name a destination instead of describing content, which is the authority the compiler
 * keeps. Checked as a key name, not as a value, because a value can be anything.
 */
export const FORBIDDEN_PLAN_KEYS = Object.freeze([
  'slot',
  'slotKey',
  'slotKeys',
  'entity',
  'entityId',
  'sql',
  'query',
  'table',
  'path',
  'filePath',
  'file',
  'cmsId',
  'id_cms',
  'siteKey',
  'acm',
  'positions',
  'com_content',
  'wp_block',
  'wp_navigation',
  'collection'
])

/**
 * JSON with object keys sorted and `undefined` dropped, so two structurally equal values print the
 * same bytes and a hash of those bytes is the identity of the CONTENT rather than of the typing.
 * @param {any} value
 * @returns {string}
 */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

/** sha256 of the canonical form of `value`. The identity of an envelope's content. */
export function hashOf(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

/**
 * The hash an envelope carries: computed over the envelope WITHOUT its own `hash` and without the
 * fields that move on every read. Excluding `hash` is what makes the hash stable under re-hashing;
 * excluding the clock is what makes two compiles of the same input produce the same identity.
 * @param {any} envelope
 * @param {string[]} [alsoExclude]
 */
export function envelopeHash(envelope, alsoExclude = []) {
  const excluded = new Set(['hash', 'createdAt', 'readAt', ...alsoExclude])
  const body = {}
  for (const [k, v] of Object.entries(envelope)) if (!excluded.has(k)) body[k] = v
  return hashOf(body)
}

const err = (errors, path, code, message) => errors.push({ path, code, message })
const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0

/**
 * Walk every key of a value and refuse the forbidden ones. Recursive because the destination a
 * model is not allowed to name is just as forbidden three levels down.
 * @returns {string[]} the offending key paths
 */
export function assertNoCmsVocabulary(value, at = '') {
  const found = []
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${path}[${i}]`))
    if (!isPlainObject(node)) return
    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_PLAN_KEYS.includes(key)) found.push(`${path}.${key}`)
      walk(child, `${path}.${key}`)
    }
  }
  walk(value, at)
  return found
}

/**
 * A site brief: what the customer said, with provenance, plus what they did NOT say.
 * @param {any} brief
 * @returns {{ ok: boolean, errors: {path: string, code: string, message: string}[] }}
 */
export function validateSiteBrief(brief) {
  /** @type {{path: string, code: string, message: string}[]} */
  const errors = []
  if (!isPlainObject(brief)) {
    err(errors, '', 'not-an-object', 'A site brief must be an object')
    return { ok: false, errors }
  }
  if (brief.schema !== BRIEF_SCHEMA)
    err(errors, 'schema', 'wrong-schema', `A site brief declares ${BRIEF_SCHEMA}`)
  if (!Number.isInteger(brief.revision) || brief.revision < 1)
    err(errors, 'revision', 'bad-revision', 'A brief revision is a positive integer')
  if (!isNonEmptyString(brief.hash)) err(errors, 'hash', 'missing-hash', 'A brief carries its content hash')

  if (!isPlainObject(brief.site)) err(errors, 'site', 'missing-site', 'A brief names the build it belongs to')
  else
    for (const key of ['buildId', 'siteKey', 'tenantId'])
      if (!isNonEmptyString(brief.site[key]))
        err(errors, `site.${key}`, 'missing-identity', `A brief names its ${key}`)

  if (!isPlainObject(brief.release)) err(errors, 'release', 'missing-release', 'A brief pins its release')
  else {
    if (!isNonEmptyString(brief.release.tag))
      err(errors, 'release.tag', 'missing-release-tag', 'A brief pins a release tag')
    if (!isNonEmptyString(brief.release.capabilitiesHash))
      err(
        errors,
        'release.capabilitiesHash',
        'missing-capabilities-hash',
        'A brief pins the capability snapshot it was read against'
      )
  }

  const sourceIds = new Set()
  if (!Array.isArray(brief.sources)) err(errors, 'sources', 'missing-sources', 'A brief lists its sources')
  else
    brief.sources.forEach((source, i) => {
      if (!isPlainObject(source)) return err(errors, `sources[${i}]`, 'bad-source', 'A source is an object')
      if (!isNonEmptyString(source.id)) err(errors, `sources[${i}].id`, 'bad-source', 'A source has an id')
      else if (sourceIds.has(source.id))
        err(errors, `sources[${i}].id`, 'duplicate-source', `Source id ${source.id} is used twice`)
      else sourceIds.add(source.id)
      if (![...CUSTOMER_SOURCE_KINDS, ...DEMO_SOURCE_KINDS].includes(source.kind))
        err(
          errors,
          `sources[${i}].kind`,
          'unknown-source-kind',
          `Unknown source kind: ${String(source.kind)}`
        )
    })

  if (!Array.isArray(brief.facts)) err(errors, 'facts', 'missing-facts', 'A brief lists its known facts')
  else
    brief.facts.forEach((fact, i) => {
      if (!isPlainObject(fact)) return err(errors, `facts[${i}]`, 'bad-fact', 'A fact is an object')
      if (!isNonEmptyString(fact.key)) err(errors, `facts[${i}].key`, 'bad-fact', 'A fact has a key')
      if (fact.value === undefined || fact.value === null || fact.value === '')
        err(errors, `facts[${i}].value`, 'empty-fact', `Fact ${fact.key} has no value; it belongs in missing`)
      if (!Array.isArray(fact.factRefs) || fact.factRefs.length === 0)
        err(errors, `facts[${i}].factRefs`, 'no-provenance', `Fact ${fact.key} names no source`)
      else
        for (const ref of fact.factRefs)
          if (!sourceIds.has(ref))
            err(
              errors,
              `facts[${i}].factRefs`,
              'dangling-provenance',
              `Fact ${fact.key} cites unknown source ${ref}`
            )
    })

  for (const field of ['missing', 'conflicts', 'pages', 'assets'])
    if (!Array.isArray(brief[field])) err(errors, field, 'missing-field', `A brief carries a ${field} array`)

  if (!isPlainObject(brief.locales) || !isNonEmptyString(brief.locales.primary))
    err(errors, 'locales.primary', 'missing-locale', 'A brief names the locale its copy is written in')
  else if (!Array.isArray(brief.locales.secondary))
    err(errors, 'locales.secondary', 'missing-locale', 'A brief lists its secondary locales, even when empty')

  if (!['ready', 'needs_input'].includes(brief.status))
    err(errors, 'status', 'bad-status', 'A brief is either ready or needs_input')
  if (
    brief.status === 'ready' &&
    ((Array.isArray(brief.missing) && brief.missing.length > 0) ||
      (Array.isArray(brief.conflicts) && brief.conflicts.length > 0))
  )
    err(
      errors,
      'status',
      'ready-with-gaps',
      'A brief with missing or conflicting facts is needs_input, never ready'
    )

  return { ok: errors.length === 0, errors }
}

/**
 * A content plan: semantic groups only. The check that matters most here is the negative one —
 * nothing in this envelope may name a destination.
 * @param {any} plan
 */
export function validateContentPlan(plan) {
  /** @type {{path: string, code: string, message: string}[]} */
  const errors = []
  if (!isPlainObject(plan)) {
    err(errors, '', 'not-an-object', 'A content plan must be an object')
    return { ok: false, errors }
  }
  if (plan.schema !== CONTENT_PLAN_SCHEMA)
    err(errors, 'schema', 'wrong-schema', `A content plan declares ${CONTENT_PLAN_SCHEMA}`)
  if (!Number.isInteger(plan.briefRevision) || plan.briefRevision < 1)
    err(errors, 'briefRevision', 'bad-revision', 'A content plan names the brief revision it was written for')
  if (!isNonEmptyString(plan.briefHash))
    err(errors, 'briefHash', 'missing-brief-hash', 'A content plan pins the brief hash it was written for')

  const seen = new Set()
  if (!Array.isArray(plan.groups)) err(errors, 'groups', 'missing-groups', 'A content plan carries groups')
  else
    plan.groups.forEach((group, i) => {
      if (!isPlainObject(group)) return err(errors, `groups[${i}]`, 'bad-group', 'A group is an object')
      if (!isNonEmptyString(group.id)) err(errors, `groups[${i}].id`, 'bad-group', 'A group has an id')
      if (!isNonEmptyString(group.semanticKey))
        err(errors, `groups[${i}].semanticKey`, 'bad-group', 'A group names the semantic key it writes')
      if (!isNonEmptyString(group.locale))
        err(errors, `groups[${i}].locale`, 'bad-group', 'A group names the locale it is written in')
      const fingerprint = `${group.semanticKey}@${group.locale}`
      if (seen.has(fingerprint))
        err(errors, `groups[${i}]`, 'duplicate-group', `Two groups write ${fingerprint}`)
      else seen.add(fingerprint)
      if (group.text !== undefined && typeof group.text !== 'string')
        err(errors, `groups[${i}].text`, 'bad-type', 'Group text is a string')
      if (!Array.isArray(group.factRefs))
        err(errors, `groups[${i}].factRefs`, 'no-provenance', `Group ${group.id} carries no factRefs array`)
    })

  const forbidden = assertNoCmsVocabulary(plan.groups ?? [], 'groups')
  for (const path of forbidden)
    err(errors, path, 'names-a-destination', `A content plan may not carry ${path.split('.').pop()}`)

  return { ok: errors.length === 0, errors }
}

/**
 * A seed map: the compiler's output, and the only envelope a Claude Cowork plugin sees.
 * @param {any} map
 */
export function validateSeedMap(map) {
  /** @type {{path: string, code: string, message: string}[]} */
  const errors = []
  if (!isPlainObject(map)) {
    err(errors, '', 'not-an-object', 'A seed map must be an object')
    return { ok: false, errors }
  }
  if (map.schema !== SEED_MAP_SCHEMA)
    err(errors, 'schema', 'wrong-schema', `A seed map declares ${SEED_MAP_SCHEMA}`)
  for (const key of ['siteKey', 'buildId', 'tenantId', 'contract', 'revision'])
    if (!isNonEmptyString(map[key])) err(errors, key, 'missing-identity', `A seed map names its ${key}`)
  if (!isPlainObject(map.hashes))
    err(errors, 'hashes', 'missing-hashes', 'A seed map carries its input hashes')
  else
    for (const key of ['brief', 'plan', 'bindings'])
      if (!isNonEmptyString(map.hashes[key]))
        err(errors, `hashes.${key}`, 'missing-hashes', `A seed map pins the ${key} hash it compiled from`)
  if (!isPlainObject(map.changes))
    err(errors, 'changes', 'missing-changes', 'A seed map carries scalar changes as an object')
  else
    for (const [key, value] of Object.entries(map.changes))
      if (typeof value !== 'string')
        err(errors, `changes.${key}`, 'non-scalar', `A content slot takes a string: ${key}`)
  if (!isPlainObject(map.evidence))
    err(errors, 'evidence', 'missing-evidence', 'A seed map carries an evidence map')
  for (const field of ['batches', 'pending', 'assets', 'dependencies'])
    if (!Array.isArray(map[field])) err(errors, field, 'missing-field', `A seed map carries a ${field} array`)
  if (Array.isArray(map.batches))
    map.batches.forEach((batch, i) => {
      if (!isPlainObject(batch)) return err(errors, `batches[${i}]`, 'bad-batch', 'A batch is an object')
      if (!isNonEmptyString(batch.applyId))
        err(errors, `batches[${i}].applyId`, 'bad-batch', 'A batch carries a deterministic apply id')
      if (!Array.isArray(batch.keys) || batch.keys.length === 0)
        err(errors, `batches[${i}].keys`, 'bad-batch', 'A batch names the slots it writes')
    })
  return { ok: errors.length === 0, errors }
}

/** The artifact name the seed map is stored and read under, for one site. */
export function seedMapName(siteKey) {
  if (!isNonEmptyString(siteKey)) throw new Error('A seed map is named after a siteKey')
  return `${siteKey}_content_seed_map`
}
