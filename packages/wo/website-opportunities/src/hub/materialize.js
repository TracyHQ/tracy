/**
 * Hub snapshot materialization: `materialize(place, evidence_revision, policy_version)` turns the accepted, live
 * observations of one place into an immutable snapshot with per-field provenance, then publishes it in one
 * transaction (revision check, pointer move, change event).
 *
 * Field rules (policy `hub-policy/1`), applied per field:
 *   1. Excluded observations (withdrawn, rejected, mis-linked, revoked) never reach this module.
 *   2. Within one source object (the evidence's `source_group`) the newest hub fetch wins; within one source family the newest object wins, so twenty
 *      accounts resending the same Google data are one family, not twenty votes. The family is the one in the hub's
 *      own evidence, never the contributor's claim.
 *   3. Values are clustered (`same`), and ranked by the field's source tiers, then by how many distinct families
 *      support them.
 *   4. A dissenting value from a listed (strong) family is overruled only when the winner both outranks it and has at
 *      least as many families; otherwise the field is `conflicted`. A conflicted website, contact, identity or
 *      location field has no value and blocks briefs; a low-impact field keeps its value and reports the conflict.
 *   5. Values only unlisted families give are `weak`: shown, but not used in briefs for guarded fields.
 */
import { createHash } from 'node:crypto'
import { scoreOpportunity } from '../../domain/opportunity-score.mjs'
import { canonicalJson } from '../canonical-json.js'
import { appendChange } from './feed.js'
import { assertPublishable } from './revocations.js'

export const POLICY_VERSION = 'hub-policy/1'

/** Collector or provider names that are one origin family with another (hub-decided, never client-declared). */
const FAMILY_ALIASES = Object.freeze({
  google_places: 'google_maps',
  apify_google_maps: 'google_maps',
  serpapi_google_maps: 'google_maps',
  openstreetmap: 'osm',
  website: 'business_website'
})

const urlKey = (v) =>
  typeof v === 'string'
    ? v
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/+$/, '')
    : canonicalJson(v)
const phoneKey = (v) => (typeof v === 'string' ? v.replace(/[^\d+]/g, '') : canonicalJson(v))

const SAME_SPOT_M = 150
function metresApart(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLon = (b.longitude - a.longitude) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}
const sameSpot = (a, b) =>
  Number.isFinite(a?.latitude) && Number.isFinite(b?.latitude)
    ? metresApart(a, b) <= SAME_SPOT_M
    : canonicalJson(a) === canonicalJson(b)

const byKey = (key) => (a, b) => key(a) === key(b)
const sameJson = byKey(canonicalJson)

const TOP = ['google_maps', 'osm']
const SOCIAL = ['facebook', 'instagram', 'tripadvisor']

/**
 * The closed field list (names match the intake's `HUB_FIELDS`; `identity` and `photo_ref` are links and picture
 * references, not snapshot content; `closed`, `description`, `site_check`, `social_activity` wait for adapters). `kind`: single | set | per_source. `guard`: the brief class a conflict blocks (null = low
 * impact). `tiers`: families from most to least trusted for this field; unlisted families are weak.
 */
const POLICIES = Object.freeze({
  [POLICY_VERSION]: Object.freeze({
    name: { kind: 'single', guard: 'identity', tiers: [TOP, ['business_website'], SOCIAL] },
    closed: { kind: 'single', guard: 'identity', tiers: [['google_maps'], ['osm', ...SOCIAL]] },
    website: {
      kind: 'single',
      guard: 'website',
      tiers: [[...TOP, 'business_website'], SOCIAL],
      same: byKey(urlKey)
    },
    phone: {
      kind: 'set',
      guard: 'contact',
      tiers: [
        ['business_website', 'google_maps'],
        ['osm', ...SOCIAL]
      ],
      same: byKey(phoneKey)
    },
    email: { kind: 'set', guard: 'contact', tiers: [['business_website'], ['osm', ...SOCIAL]] },
    social_profile: { kind: 'set', guard: 'contact', tiers: [['business_website', 'google_maps'], SOCIAL] },
    address: { kind: 'single', guard: 'location', tiers: [TOP, ['business_website', ...SOCIAL]] },
    location: { kind: 'single', guard: 'location', tiers: [TOP, SOCIAL], same: sameSpot },
    category: { kind: 'single', guard: null, tiers: [['google_maps'], ['osm', 'tripadvisor']] },
    opening_hours: {
      kind: 'single',
      guard: null,
      tiers: [
        ['google_maps', 'business_website'],
        ['osm', ...SOCIAL]
      ]
    },
    description: { kind: 'single', guard: null, tiers: [['business_website'], ['google_maps', ...SOCIAL]] },
    site_check: { kind: 'single', guard: null, tiers: [['hub_site_check']] },
    rating: { kind: 'per_source' },
    social_activity: { kind: 'per_source' }
  })
})

/** The field rules of a policy version; throws on an unknown one. */
export function policyOf(version) {
  const policy = POLICIES[version]
  if (!policy) throw new Error(`wo hub: unknown policy version ${version}`)
  return policy
}

/** Field names a snapshot can carry under `version`: the public DTO allowlist. */
export const fieldNamesOf = (version) => Object.keys(policyOf(version)).sort()

const time = (iso) => Date.parse(iso) || 0
const newer = (a, b) =>
  (time(a.fetchedAt) - time(b.fetchedAt) || (a.id > b.id ? 1 : a.id < b.id ? -1 : 0)) > 0
const iso = (ms) => (ms ? new Date(ms).toISOString() : null)

/** One claim per family: newest per source object, then newest object of the family. */
function claimsOf(list) {
  const byObject = new Map()
  for (const raw of list) {
    const o = { ...raw, family: FAMILY_ALIASES[raw.family] ?? raw.family }
    // The hub's source group (`<family>:<object id>`) names one source object, whoever sent it.
    const key = o.group ?? `${o.family}:${o.objectId}`
    const prev = byObject.get(key)
    if (!prev || newer(o, prev)) byObject.set(key, o)
  }
  const byFamily = new Map()
  for (const o of byObject.values()) {
    const prev = byFamily.get(o.family)
    if (!prev || newer(o, prev)) byFamily.set(o.family, o)
  }
  return [...byFamily.values()]
}

function clustersOf(claims, rule) {
  const tierOf = (family) => {
    const i = (rule.tiers ?? []).findIndex((t) => t.includes(family))
    return i === -1 ? Infinity : i
  }
  const same = rule.same ?? sameJson
  const sorted = claims
    .map((c) => ({ ...c, tier: tierOf(c.family) }))
    .sort((a, b) => a.tier - b.tier || (a.family < b.family ? -1 : 1))
  const clusters = []
  for (const c of sorted) {
    const hit = clusters.find((k) => same(k.claims[0].value, c.value))
    if (hit) hit.claims.push(c)
    else clusters.push({ claims: [c] })
  }
  return clusters
    .map(({ claims: cs }) => ({
      value: cs[0].value,
      bestTier: Math.min(...cs.map((c) => c.tier)),
      sources: cs.map((c) => c.family).sort(),
      provenance: provenanceOf(cs)
    }))
    .sort(
      (a, b) =>
        a.bestTier - b.bestTier ||
        b.sources.length - a.sources.length ||
        (canonicalJson(a.value) < canonicalJson(b.value) ? -1 : 1)
    )
}

function provenanceOf(claims) {
  const sorted = [...claims].sort((a, b) =>
    a.family < b.family ? -1 : a.family > b.family ? 1 : a.objectId < b.objectId ? -1 : 1
  )
  return {
    sources: [...new Set(sorted.map((c) => c.family))].sort(),
    sourceObjects: sorted.map((c) => ({ family: c.family, objectId: c.objectId })),
    observedAt: iso(Math.max(0, ...sorted.map((c) => time(c.fetchedAt)))),
    observationIds: sorted.map((c) => c.id).sort(),
    evidenceHashes: sorted.map((c) => c.evidenceHash ?? null)
  }
}

const alternativeOf = (k) => ({
  value: k.value,
  sources: k.sources,
  observationIds: k.provenance.observationIds
})

function selectSingle(clusters, rule) {
  const [winner, ...rest] = clusters
  const outranked = (k) => winner.bestTier < k.bestTier && winner.sources.length >= k.sources.length
  const conflict = rest.some((k) => Number.isFinite(k.bestTier) && !outranked(k))
  const guarded = rule.guard !== null
  if (conflict) {
    return {
      status: 'conflicted',
      value: guarded ? null : winner.value,
      blocksBrief: guarded,
      provenance: guarded ? provenanceOf([]) : winner.provenance,
      alternatives: (guarded ? clusters : rest).map(alternativeOf)
    }
  }
  const weak = !Number.isFinite(winner.bestTier)
  return {
    status: weak ? 'weak' : 'chosen',
    value: winner.value,
    blocksBrief: weak && guarded,
    provenance: winner.provenance,
    alternatives: rest.map(alternativeOf)
  }
}

function selectSet(clusters, rule) {
  const strong = clusters.filter((k) => Number.isFinite(k.bestTier))
  const used = strong.length ? strong : clusters
  const ordered = [...used].sort((a, b) => (canonicalJson(a.value) < canonicalJson(b.value) ? -1 : 1))
  const merged = mergeProvenance(used.map((k) => k.provenance))
  return {
    status: strong.length ? 'chosen' : 'weak',
    value: ordered.map((k) => k.value),
    blocksBrief: !strong.length && rule.guard !== null,
    provenance: merged,
    alternatives: strong.length ? clusters.filter((k) => !Number.isFinite(k.bestTier)).map(alternativeOf) : []
  }
}

function mergeProvenance(list) {
  const objects = list.flatMap((p) => p.sourceObjects)
  const seen = new Set()
  const sourceObjects = objects
    .filter((o) => {
      // The hub's source group (`<family>:<object id>`) names one source object, whoever sent it.
      const key = o.group ?? `${o.family}:${o.objectId}`
      return seen.has(key) ? false : (seen.add(key), true)
    })
    .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : a.objectId < b.objectId ? -1 : 1))
  return {
    sources: [...new Set(list.flatMap((p) => p.sources))].sort(),
    sourceObjects,
    observedAt: iso(Math.max(0, ...list.map((p) => time(p.observedAt)))),
    observationIds: [...new Set(list.flatMap((p) => p.observationIds))].sort(),
    evidenceHashes: list.flatMap((p) => p.evidenceHashes)
  }
}

function selectPerSource(claims) {
  const sorted = [...claims].sort((a, b) => (a.family < b.family ? -1 : 1))
  return {
    status: 'chosen',
    value: Object.fromEntries(sorted.map((c) => [c.family, c.value])),
    blocksBrief: false,
    provenance: provenanceOf(sorted),
    alternatives: []
  }
}

/**
 * Pure field selection. `observations`: accepted, live observations of one place, each
 * `{id, field, value, family, objectId, fetchedAt, evidenceHash}` with family/objectId/fetchedAt from the hub's evidence.
 * @returns {Record<string, {status: string, value: any, blocksBrief: boolean, provenance: object, alternatives: object[]}>}
 */
export function selectFields(observations, policyVersion) {
  const policy = policyOf(policyVersion)
  const byField = new Map()
  for (const o of observations) {
    if (!Object.hasOwn(policy, o.field)) continue
    if (!byField.has(o.field)) byField.set(o.field, [])
    byField.get(o.field).push(o)
  }
  const out = {}
  for (const field of [...byField.keys()].sort()) {
    const rule = policy[field]
    const claims = claimsOf(byField.get(field))
    if (rule.kind === 'per_source') {
      out[field] = selectPerSource(claims)
      continue
    }
    const clusters = clustersOf(claims, rule)
    out[field] = rule.kind === 'set' ? selectSet(clusters, rule) : selectSingle(clusters, rule)
  }
  return out
}

// Scoring treats any truthy website as "has a site"; with no site check its rule answers "checking", which holds the
// score instead of awarding "no website" points to a place whose website is only disputed.
const DISPUTED_WEBSITE = 'conflicted'

const usable = (f) => f && f.value !== null && !f.blocksBrief

/**
 * Derived data of a selection: website verdict and opportunity score (content), and the times behind them
 * (provenance). Content holds no timestamps, so a re-check that finds the same data keeps the same content hash.
 */
export function deriveContent(fields, observations) {
  const checkedSources = [...new Set(observations.map((o) => FAMILY_ALIASES[o.family] ?? o.family))].sort()
  const checkedAt = iso(Math.max(0, ...observations.map((o) => time(o.fetchedAt))))
  const website = fields.website
  const websiteVerdict =
    website?.status === 'conflicted'
      ? { state: 'conflicted', sources: website.alternatives.flatMap((a) => a.sources).sort() }
      : website
        ? { state: 'found', url: website.value, sources: website.provenance.sources }
        : { state: 'not_found', checkedSources }
  const rating = fields.rating?.value ?? {}
  const ratingOf = rating.google_maps ?? rating[Object.keys(rating).sort()[0]] ?? {}
  const activity = Object.values(fields.social_activity?.value ?? {})
    .map((a) => a?.lastPostAt)
    .filter((t) => typeof t === 'string')
    .sort()
  const socials = Object.fromEntries(
    (usable(fields.social_profile) ? fields.social_profile.value : [])
      .filter((s) => s && typeof s.network === 'string')
      .map((s) => [s.network, s.url])
  )
  const candidate = {
    website: website?.status === 'conflicted' ? DISPUTED_WEBSITE : (website?.value ?? undefined),
    phone: usable(fields.phone) ? fields.phone.value[0] : undefined,
    emails: usable(fields.email) ? fields.email.value : [],
    socials,
    rating: Number.isFinite(ratingOf.rating) ? ratingOf.rating : undefined,
    reviews: Number.isFinite(ratingOf.reviewCount) ? ratingOf.reviewCount : undefined,
    temporarilyClosed: fields.closed?.value === 'temporarily'
  }
  const siteCheck = website?.status === 'conflicted' ? null : (fields.site_check?.value ?? null)
  const scored = scoreOpportunity({
    candidate,
    siteCheck,
    social: activity.length ? { lastPostAt: activity.at(-1) } : null,
    now: new Date(time(checkedAt))
  })
  const score = {
    score: scored.score,
    grade: scored.grade,
    pending: scored.pending,
    reasons: scored.reasons.map((r) => r[0])
  }
  const content = {
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, f]) => [
        k,
        {
          status: f.status,
          value: f.value,
          blocksBrief: f.blocksBrief,
          alternatives: f.alternatives.map(({ value, sources }) => ({ value, sources }))
        }
      ])
    ),
    websiteVerdict,
    score
  }
  const provenance = {
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, f]) => [
        k,
        { ...f.provenance, alternatives: f.alternatives.map((a) => a.observationIds) }
      ])
    ),
    websiteVerdict: { checkedSources, checkedAt }
  }
  return { content, provenance }
}

/** What a site brief may state about a place: no conflicted or weak website, contact, identity or location. */
export function briefFactsOf(fields) {
  const facts = {}
  const blocked = []
  const conflicts = []
  for (const name of Object.keys(fields).sort()) {
    const f = fields[name]
    if (f.status === 'conflicted') conflicts.push(name)
    if (f.blocksBrief) blocked.push({ field: name, status: f.status })
    else if (f.value !== null) facts[name] = f.value
  }
  return { facts, blocked, conflicts }
}

export const hashOf = (value) => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`

/** The listing cell of a location: whole hundredths of a degree, `"<lat*100>:<lon*100>"` (about 1 km). */
export function cellOf(location) {
  if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) return null
  return `${Math.floor(location.latitude * 100)}:${Math.floor(location.longitude * 100)}`
}

export class StaleEvidenceError extends Error {
  constructor(placeId, expected, actual) {
    super(`wo hub: place ${placeId} evidence moved from revision ${expected} to ${actual}`)
    this.code = 'stale_evidence'
    this.actual = actual
  }
}

/**
 * Accepted, not excluded observations of a place, each with its newest hub evidence. An observation without hub
 * evidence is not usable: the hub verifies before it publishes.
 */
export async function liveObservationsOf(db, placeId) {
  const { rows } = await db.query(
    `select o.id, o.field, o.value, e.source_family, e.source_object_id, e.source_group, e.fetched_at, e.content_hash
       from wo_hub_observation o
       join wo_place_identity i
         on i.namespace = o.subject_namespace and i.external_id = o.subject_external_id and i.place_id = $1
       join lateral (select * from wo_hub_evidence e where e.observation_id = o.id
                      order by e.fetched_at desc, e.id desc limit 1) e on true
      where o.status = 'accepted'
        and not exists (select 1 from wo_hub_observation_exclusion x where x.observation_id = o.id)`,
    [placeId]
  )
  return rows.map((r) => ({
    id: r.id,
    field: r.field,
    value: r.value,
    family: r.source_family,
    objectId: r.source_object_id,
    group: r.source_group,
    fetchedAt: r.fetched_at.toISOString(),
    evidenceHash: r.content_hash
  }))
}

/**
 * Builds and publishes the hub snapshot of `placeId` from its live observations, in ONE transaction: the place row is
 * locked, its evidence revision must still be `evidenceRevision` and it must still be publishable (live, not
 * suppressed, not revoked after `revocationRevision` when given), then the snapshot, its field provenance, the pointer
 * move and the change event are written together. Same content and provenance as the current snapshot → no new
 * revision.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ status: 'published' | 'unchanged', revision: number, snapshotId: string, contentChanged?: boolean }>}
 * @throws {StaleEvidenceError | import('./revocations.js').HubRevokedError}
 */
export async function materialize(
  pool,
  placeId,
  evidenceRevision,
  policyVersion,
  { revocationRevision } = {}
) {
  policyOf(policyVersion)
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('insert into wo_hub_place (place_id) values ($1) on conflict (place_id) do nothing', [
      placeId
    ])
    const place = (await client.query('select * from wo_hub_place where place_id = $1 for update', [placeId]))
      .rows[0]
    await assertPublishable(client, place, revocationRevision)
    if (Number(place.evidence_revision) !== Number(evidenceRevision)) {
      throw new StaleEvidenceError(placeId, evidenceRevision, Number(place.evidence_revision))
    }
    const observations = await liveObservationsOf(client, placeId)
    const fields = selectFields(observations, policyVersion)
    const { content, provenance } = deriveContent(fields, observations)
    const contentHash = hashOf({ policyVersion, content })
    const provenanceHash = hashOf({ policyVersion, provenance })
    const current = place.current_snapshot_id
      ? (
          await client.query('select revoked_at from wo_hub_snapshot where snapshot_id = $1', [
            place.current_snapshot_id
          ])
        ).rows[0]
      : null
    if (
      current &&
      !current.revoked_at &&
      place.content_hash === contentHash &&
      place.provenance_hash === provenanceHash
    ) {
      await client.query('update wo_hub_place set built_evidence_revision = $2 where place_id = $1', [
        placeId,
        evidenceRevision
      ])
      await client.query('commit')
      return { status: 'unchanged', revision: Number(place.revision), snapshotId: place.current_snapshot_id }
    }
    const revision = Number(place.revision) + 1
    const snapshotId = (
      await client.query(
        `insert into wo_place_snapshot (place_id, state, published_at) values ($1, 'published', now()) returning id`,
        [placeId]
      )
    ).rows[0].id
    await client.query(
      'insert into wo_place_snapshot_profile (snapshot_id, profile) values ($1, $2::jsonb)',
      [snapshotId, JSON.stringify({ hub: { policyVersion, revision, ...content } })]
    )
    const observationIds = [
      ...new Set(
        Object.values(fields).flatMap((f) => [
          ...f.provenance.observationIds,
          ...f.alternatives.flatMap((a) => a.observationIds)
        ])
      )
    ].sort()
    await client.query(
      `insert into wo_hub_snapshot (snapshot_id, place_id, revision, evidence_revision, policy_version, content_hash,
         provenance_hash, observation_ids, observed_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::uuid[], $9)`,
      [
        snapshotId,
        placeId,
        revision,
        evidenceRevision,
        policyVersion,
        contentHash,
        provenanceHash,
        observationIds,
        provenance.websiteVerdict.checkedAt
      ]
    )
    for (const [field, f] of Object.entries(fields)) {
      await client.query(
        `insert into wo_hub_snapshot_field (snapshot_id, field, status, value, blocks_brief, provenance, alternatives)
         values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb)`,
        [
          snapshotId,
          field,
          f.status,
          JSON.stringify(f.value),
          f.blocksBrief,
          JSON.stringify(f.provenance),
          JSON.stringify(f.alternatives)
        ]
      )
    }
    if (place.current_snapshot_id) {
      await client.query(
        `update wo_place_snapshot set state = 'superseded' where id = $1 and state = 'published'`,
        [place.current_snapshot_id]
      )
    }
    const location = fields.location
    await client.query(
      `update wo_hub_place set revision = $2, current_snapshot_id = $3, content_hash = $4, provenance_hash = $5,
         cell = $6, built_evidence_revision = $7, updated_at = now() where place_id = $1`,
      [
        placeId,
        revision,
        snapshotId,
        contentHash,
        provenanceHash,
        usable(location) ? cellOf(location.value) : null,
        evidenceRevision
      ]
    )
    const contentChanged = place.content_hash !== contentHash
    await appendChange(client, { kind: 'upsert', placeId, revision, detail: { contentHash, contentChanged } })
    await client.query('commit')
    return { status: 'published', revision, snapshotId, contentChanged }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Rebuilds every live place whose evidence moved since its last build (an observation accepted, withdrawn or
 * excluded). A place that moves again while it is built is left for the next round.
 * @returns {Promise<{ published: number, unchanged: number, skipped: number }>}
 */
export async function materializeDirty(pool, policyVersion, { limit = 100 } = {}) {
  const { rows } = await pool.query(
    `select place_id, evidence_revision from wo_hub_place
      where state = 'live' and evidence_revision <> built_evidence_revision order by updated_at limit $1`,
    [limit]
  )
  const tally = { published: 0, unchanged: 0, skipped: 0 }
  for (const r of rows) {
    try {
      const out = await materialize(pool, r.place_id, Number(r.evidence_revision), policyVersion)
      tally[out.status] += 1
    } catch (error) {
      if (error.code === 'stale_evidence' || error.code === 'revoked') tally.skipped += 1
      else throw error
    }
  }
  return tally
}

/** The fields of a published hub snapshot, as `selectFields` returns them. */
export async function snapshotFieldsOf(db, snapshotId) {
  const { rows } = await db.query(
    'select field, status, value, blocks_brief, provenance, alternatives from wo_hub_snapshot_field where snapshot_id = $1 order by field',
    [snapshotId]
  )
  return Object.fromEntries(
    rows.map((r) => [
      r.field,
      {
        status: r.status,
        value: r.value,
        blocksBrief: r.blocks_brief,
        provenance: r.provenance,
        alternatives: r.alternatives
      }
    ])
  )
}

/**
 * What a brief may use from the hub for a place: its current, unrevoked snapshot's facts with conflicted or weak
 * website, contact, identity and location left out. Null when the place is not servable.
 */
export async function hubBriefFactsOf(db, placeId) {
  const { rows } = await db.query(
    `select p.current_snapshot_id, p.revision from wo_hub_place p
       join wo_hub_snapshot s on s.snapshot_id = p.current_snapshot_id
      where p.place_id = $1 and p.state = 'live' and s.revoked_at is null`,
    [placeId]
  )
  if (!rows[0]) return null
  return {
    revision: Number(rows[0].revision),
    ...briefFactsOf(await snapshotFieldsOf(db, rows[0].current_snapshot_id))
  }
}
