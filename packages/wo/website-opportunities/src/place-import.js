/**
 * Receive one place's published research from another deployment (shared places plan §6,
 * §9, slice 1). The bundle is `place-export.js`'s; the picture bytes are already in the shared bucket
 * (`opportunities/place-media-store.js`), so only rows are written here, under this deployment's own ids.
 *
 * 🔒 WHAT IS WRITTEN IS AN ALLOW-LIST, NOT A COPY. `IMPORT_TABLES` names every table this file writes
 * (a test greps the SQL below against it), and `validateBundle` names every field it accepts: an
 * unknown field refuses the whole bundle, so a sender bug that adds account data fails loudly instead
 * of landing here. The trust is light by decision (decided 23/10/2026): the sender is the team, the
 * secret only keeps the public door shut; no per-record signature, no review queue.
 *
 * SLICE 1 IS SEED-ONLY. A place that already has a snapshot here is `skipped_existing`; one with
 * research under way is `retry_later`; identities that name two different places here are a
 * `conflict` (merging is the operator's, `place-merge.js`). A stored picture whose object is not in the
 * shared bucket at the size its row says makes the push `media_missing`: nothing is published.
 * Everything else happens in ONE transaction, the place row locked as `place-backfill.js` does.
 *
 * Every call leaves one `wo_place_import` row. Its `origin` is SELF-DECLARED by the sender. A picture
 * is checked by HEAD size, not re-hashed: anyone holding the shared bucket's token could plant
 * same-size bytes under a content key — accepted with the light trust above.
 */
import { addLink } from './places.js'
import { SHARED_MEDIA_KEY } from './place-media-store.js'

export const BUNDLE_SCHEMA = 'tracy-wo-place-bundle/v1'
/** Every table the importer writes. Nothing else, ever. */
export const IMPORT_TABLES = [
  'wo_place',
  'wo_place_identity',
  'wo_place_link',
  'wo_place_snapshot',
  'wo_place_snapshot_source',
  'wo_place_snapshot_profile',
  'wo_place_media',
  'wo_place_snapshot_media',
  'wo_place_snapshot_import',
  'wo_place_import'
]
export const LIMITS = { identities: 10, links: 50, sources: 40, media: 500, text: 2000, url: 2048 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/
const ORIGIN = /^[a-z0-9][a-z0-9._-]{0,62}$/
const NAMESPACES = ['google', 'osm', 'url', 'tripadvisor']
const LINK_KINDS = ['website', 'facebook', 'instagram', 'tiktok', 'youtube']
// `operator` is a person's decision on the sending deployment: it does not travel.
const LINK_VERIFIERS = ['identity', 'google', 'website', 'osm', 'search']
const BUSY = ['queued', 'running', 'paused', 'blocked']

class InvalidBundle extends Error {
  constructor(field) {
    super(`invalid bundle field: ${field}`)
    this.field = field
  }
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
function only(value, keys, where) {
  if (!isObject(value)) throw new InvalidBundle(where)
  for (const k of Object.keys(value)) if (!keys.includes(k)) throw new InvalidBundle(`${where}.${k}`)
  return value
}
function str(v, where, { max = LIMITS.text, nullable = true, re } = {}) {
  if (v === null || v === undefined) {
    if (nullable) return null
    throw new InvalidBundle(where)
  }
  if (typeof v !== 'string' || v.length > max || (re && !re.test(v))) throw new InvalidBundle(where)
  return v
}
function num(v, where) {
  if (v === null || v === undefined) return null
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new InvalidBundle(where)
  return v
}
function time(v, where, nullable = true) {
  if (v === null || v === undefined) {
    if (nullable) return null
    throw new InvalidBundle(where)
  }
  if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) throw new InvalidBundle(where)
  return new Date(v)
}
const json = (v, where) => {
  if (v === undefined || v === null) return null
  if (typeof v !== 'object') throw new InvalidBundle(where)
  return v
}
const httpUrl = (v, where) => {
  const s = str(v, where, { max: LIMITS.url, nullable: false })
  if (!/^https?:\/\//i.test(s)) throw new InvalidBundle(where)
  return s
}
const list = (v, max, where) => {
  if (!Array.isArray(v) || v.length > max) throw new InvalidBundle(where)
  return v
}

/** The bundle as rows to write, or throws `InvalidBundle` naming the first field refused. */
export function validateBundle(raw) {
  const b = only(raw, ['schema', 'origin', 'place', 'identities', 'links', 'snapshot'], 'bundle')
  if (b.schema !== BUNDLE_SCHEMA) throw new InvalidBundle('schema')
  const origin = str(b.origin, 'origin', { max: 63, nullable: false, re: ORIGIN })
  const place = only(b.place, ['displayName'], 'place')
  const identities = list(b.identities, LIMITS.identities, 'identities').map((i, n) => {
    only(i, ['namespace', 'externalId', 'source', 'confidence'], `identities.${n}`)
    if (!NAMESPACES.includes(i.namespace)) throw new InvalidBundle(`identities.${n}.namespace`)
    return {
      namespace: i.namespace,
      externalId: str(i.externalId, `identities.${n}.externalId`, { max: LIMITS.url, nullable: false }),
      source: str(i.source, `identities.${n}.source`, { max: 64, nullable: false }),
      confidence: num(i.confidence, `identities.${n}.confidence`) ?? 1
    }
  })
  if (identities.length === 0) throw new InvalidBundle('identities')
  const links = list(b.links, LIMITS.links, 'links').map((l, n) => {
    only(l, ['kind', 'url', 'verifiedBy', 'evidence'], `links.${n}`)
    if (!LINK_KINDS.includes(l.kind)) throw new InvalidBundle(`links.${n}.kind`)
    if (!LINK_VERIFIERS.includes(l.verifiedBy)) throw new InvalidBundle(`links.${n}.verifiedBy`)
    const evidence = only(l.evidence ?? {}, ['from'], `links.${n}.evidence`)
    const from = str(evidence.from, `links.${n}.evidence.from`, { max: 64 })
    return {
      kind: l.kind,
      url: httpUrl(l.url, `links.${n}.url`),
      verifiedBy: l.verifiedBy,
      evidence: from ? { from } : {}
    }
  })
  const s = only(
    b.snapshot,
    ['id', 'publishedAt', 'enrichmentScope', 'sources', 'profile', 'media'],
    'snapshot'
  )
  if (typeof s.id !== 'string' || !UUID.test(s.id)) throw new InvalidBundle('snapshot.id')
  if (s.enrichmentScope !== 'full') throw new InvalidBundle('snapshot.enrichmentScope')
  const sources = list(s.sources, LIMITS.sources, 'snapshot.sources').map((r, n) => {
    const w = `snapshot.sources.${n}`
    only(
      r,
      [
        'source',
        'ref',
        'status',
        'reason',
        'coverage',
        'collected',
        'collectedAt',
        'attemptedAt',
        'collectorVersion'
      ],
      w
    )
    return {
      source: str(r.source, `${w}.source`, { max: 64, nullable: false }),
      ref: str(r.ref, `${w}.ref`, { max: LIMITS.url }),
      status: str(r.status, `${w}.status`, { max: 32, nullable: false }),
      reason: str(r.reason, `${w}.reason`),
      coverage: json(r.coverage, `${w}.coverage`),
      collected: json(r.collected, `${w}.collected`) ?? {},
      collectedAt: time(r.collectedAt, `${w}.collectedAt`),
      attemptedAt: time(r.attemptedAt, `${w}.attemptedAt`),
      collectorVersion: str(r.collectorVersion, `${w}.collectorVersion`, { max: 128 })
    }
  })
  const profile = only(s.profile, ['profile', 'brand'], 'snapshot.profile')
  const media = list(s.media, LIMITS.media, 'snapshot.media').map((m, n) =>
    mediaRow(m, `snapshot.media.${n}`)
  )
  return {
    origin,
    displayName: str(place.displayName, 'place.displayName', { max: 200 }),
    identities,
    links,
    snapshot: {
      originId: s.id,
      publishedAt: time(s.publishedAt, 'snapshot.publishedAt', false),
      sources,
      profile: json(profile.profile, 'snapshot.profile.profile') ?? {},
      brand: json(profile.brand, 'snapshot.profile.brand'),
      media
    }
  }
}

const MEDIA_FIELDS = [
  'sha256',
  'objectKey',
  'status',
  'reason',
  'mime',
  'bytes',
  'width',
  'height',
  'durationS',
  'kind',
  'category',
  'palette',
  'caption',
  'alt',
  'dhash',
  'labels',
  'source',
  'sourceUrl',
  'postId',
  'postedAt',
  'provider',
  'credit',
  'collectedAt',
  'revokedAt',
  'revokeReason'
]
function mediaRow(m, w) {
  only(m, MEDIA_FIELDS, w)
  const sha256 = str(m.sha256, `${w}.sha256`, { nullable: false, re: SHA256 })
  if (!['stored', 'reference'].includes(m.status)) throw new InvalidBundle(`${w}.status`)
  if (!['image', 'video'].includes(m.kind)) throw new InvalidBundle(`${w}.kind`)
  let objectKey = null
  if (m.status === 'stored') {
    // A stored picture must name its own bytes in the shared bucket, nowhere else.
    const key = SHARED_MEDIA_KEY.exec(str(m.objectKey, `${w}.objectKey`, { nullable: false, max: 200 }))
    if (!key || key[3] !== sha256 || key[2] !== sha256.slice(0, 2)) throw new InvalidBundle(`${w}.objectKey`)
    if (num(m.bytes, `${w}.bytes`) === null) throw new InvalidBundle(`${w}.bytes`)
    objectKey = key[0]
  } else if (m.objectKey !== null && m.objectKey !== undefined) throw new InvalidBundle(`${w}.objectKey`)
  return {
    sha256,
    objectKey,
    status: m.status,
    reason: str(m.reason, `${w}.reason`, { max: 64 }),
    mime: str(m.mime, `${w}.mime`, { max: 100 }),
    bytes: num(m.bytes, `${w}.bytes`),
    width: num(m.width, `${w}.width`),
    height: num(m.height, `${w}.height`),
    durationS: num(m.durationS, `${w}.durationS`),
    kind: m.kind,
    category: str(m.category, `${w}.category`, { max: 64 }),
    palette: json(m.palette, `${w}.palette`),
    caption: str(m.caption, `${w}.caption`),
    alt: str(m.alt, `${w}.alt`),
    dhash: str(m.dhash, `${w}.dhash`, { max: 64 }),
    labels: json(m.labels, `${w}.labels`),
    source: str(m.source, `${w}.source`, { max: 64, nullable: false }),
    sourceUrl: str(m.sourceUrl, `${w}.sourceUrl`, { max: LIMITS.url, nullable: false }),
    postId: str(m.postId, `${w}.postId`, { max: 200 }),
    postedAt: time(m.postedAt, `${w}.postedAt`),
    provider: str(m.provider, `${w}.provider`, { max: 64 }),
    credit: json(m.credit, `${w}.credit`),
    collectedAt: time(m.collectedAt, `${w}.collectedAt`, false),
    revokedAt: time(m.revokedAt, `${w}.revokedAt`),
    revokeReason: str(m.revokeReason, `${w}.revokeReason`, { max: 200 })
  }
}

async function audit(db, origin, outcome, fields = {}) {
  const { rows } = await db.query(
    `insert into wo_place_import (origin, outcome, place_id, snapshot_id, places, snapshots, sources, media_rows, detail)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) returning id`,
    [
      origin,
      outcome,
      fields.placeId ?? null,
      fields.snapshotId ?? null,
      fields.places ?? 0,
      fields.snapshots ?? 0,
      fields.sources ?? 0,
      fields.mediaRows ?? 0,
      fields.detail ? JSON.stringify(fields.detail) : null
    ]
  )
  return rows[0].id
}

/** Stored pictures whose object is missing or not the size their row says. */
async function missingObjects(objects, media) {
  const stored = media.filter((m) => m.status === 'stored')
  const missing = []
  for (let i = 0; i < stored.length; i += 8) {
    const heads = await Promise.all(
      stored.slice(i, i + 8).map(async (m) => {
        const head = await objects?.head?.(m.objectKey).catch(() => null)
        return head && Number(head.size) === Number(m.bytes) ? null : m.sha256
      })
    )
    missing.push(...heads.filter(Boolean))
  }
  return missing
}

/**
 * Import one bundle. @param {{pool: import('pg').Pool, objects: object|null}} deps
 * @returns {Promise<{outcome: string, placeId?: string, snapshotId?: string, field?: string, missing?: number}>}
 */
export async function importPlaceBundle({ pool, objects }, raw) {
  let b
  try {
    b = validateBundle(raw)
  } catch (error) {
    if (!(error instanceof InvalidBundle)) throw error
    const origin = typeof raw?.origin === 'string' && ORIGIN.test(raw.origin) ? raw.origin : 'unknown'
    await audit(pool, origin, 'invalid', { detail: { field: error.field } })
    return { outcome: 'invalid', field: error.field }
  }
  const missing = await missingObjects(objects, b.snapshot.media)
  if (missing.length) {
    await audit(pool, b.origin, 'media_missing', { detail: { missing: missing.length } })
    return { outcome: 'media_missing', missing: missing.length }
  }

  const client = await pool.connect()
  try {
    await client.query('begin')
    // One lock per identity, in a fixed order: two pushes of one place serialise, and never deadlock.
    const keys = [
      ...b.identities.map((i) => `wo_place:${i.namespace}:${i.externalId}`),
      `wo_place_import:${b.origin}:${b.snapshot.originId}`
    ].sort()
    for (const key of keys) await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [key])
    // This origin's snapshot came here before: whatever happened to the place since, not again.
    const seen = (
      await client.query(
        'select snapshot_id from wo_place_snapshot_import where origin = $1 and origin_snapshot_id = $2',
        [b.origin, b.snapshot.originId]
      )
    ).rows[0]
    if (seen) {
      await client.query('rollback')
      await audit(pool, b.origin, 'skipped_existing', {
        snapshotId: seen.snapshot_id,
        detail: { alreadyImported: true }
      })
      return { outcome: 'skipped_existing', snapshotId: seen.snapshot_id }
    }
    const known = new Set()
    for (const i of b.identities) {
      const row = (
        await client.query(
          'select place_id from wo_place_identity where namespace = $1 and external_id = $2',
          [i.namespace, i.externalId]
        )
      ).rows[0]
      if (row) known.add(await finalPlace(client, row.place_id))
    }
    if (known.size > 1) {
      await client.query('rollback')
      await audit(pool, b.origin, 'conflict', { detail: { places: known.size } })
      return { outcome: 'conflict' }
    }
    let placeId = [...known][0]
    let places = 0
    if (!placeId) {
      placeId = (
        await client.query('insert into wo_place (display_name) values ($1) returning id', [b.displayName])
      ).rows[0].id
      places = 1
    }
    const place = (await client.query('select * from wo_place where id = $1 for update', [placeId])).rows[0]
    if (place.current_snapshot_id) {
      await client.query('rollback')
      await audit(pool, b.origin, 'skipped_existing', { placeId })
      return { outcome: 'skipped_existing', placeId }
    }
    const busy = (
      await client.query('select 1 from wo_place_job where place_id = $1 and state = any($2) limit 1', [
        placeId,
        BUSY
      ])
    ).rows[0]
    if (busy) {
      await client.query('rollback')
      await audit(pool, b.origin, 'retry_later', { placeId })
      return { outcome: 'retry_later', placeId }
    }

    for (const i of b.identities)
      await client.query(
        `insert into wo_place_identity (namespace, external_id, place_id, source, confidence) values ($1, $2, $3, $4, $5)
         on conflict (namespace, external_id) do nothing`,
        [i.namespace, i.externalId, placeId, i.source, i.confidence]
      )
    for (const l of b.links) await addLink(client, placeId, l.kind, l.url, l.verifiedBy, l.evidence)
    const s = b.snapshot
    const snapshotId = (
      await client.query(
        `insert into wo_place_snapshot (place_id, state, published_at, enrichment_scope)
         values ($1, 'published', $2, 'full') returning id`,
        [placeId, s.publishedAt]
      )
    ).rows[0].id
    for (const r of s.sources)
      await client.query(
        `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, reason, coverage, collected,
           collected_at, attempted_at, collector_version)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)`,
        [
          snapshotId,
          r.source,
          r.ref,
          r.status,
          r.reason,
          r.coverage ? JSON.stringify(r.coverage) : null,
          JSON.stringify(r.collected),
          r.collectedAt,
          r.attemptedAt,
          r.collectorVersion
        ]
      )
    await client.query(
      'insert into wo_place_snapshot_profile (snapshot_id, profile, brand) values ($1, $2::jsonb, $3::jsonb)',
      [snapshotId, JSON.stringify(s.profile), s.brand ? JSON.stringify(s.brand) : null]
    )
    for (const m of s.media) {
      const mediaId = await keepImportedMedia(client, placeId, m)
      await client.query(
        'insert into wo_place_snapshot_media (snapshot_id, media_id) values ($1, $2) on conflict do nothing',
        [snapshotId, mediaId]
      )
    }
    await client.query(
      `update wo_place set current_snapshot_id = $2, display_name = coalesce(display_name, $3), updated_at = now()
       where id = $1`,
      [placeId, snapshotId, b.displayName]
    )
    const importId = await audit(client, b.origin, 'imported', {
      placeId,
      snapshotId,
      places,
      snapshots: 1,
      sources: s.sources.length,
      mediaRows: s.media.length
    })
    await client.query(
      `insert into wo_place_snapshot_import (snapshot_id, import_id, origin, origin_snapshot_id) values ($1, $2, $3, $4)`,
      [snapshotId, importId, b.origin, s.originId]
    )
    await client.query('commit')
    return { outcome: 'imported', placeId, snapshotId }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    await audit(pool, b.origin, 'error', { detail: { code: error?.code ?? 'error' } }).catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function finalPlace(db, placeId) {
  let id = placeId
  for (let hop = 0; hop < 5; hop += 1) {
    const next = (await db.query('select merged_into from wo_place where id = $1', [id])).rows[0]
    if (!next?.merged_into) break
    id = next.merged_into
  }
  return id
}

/** The place's row for this picture, inserted once per sha256 (an existing row is kept as it is). */
async function keepImportedMedia(db, placeId, m) {
  const { rows } = await db.query(
    `insert into wo_place_media (place_id, sha256, object_key, status, reason, mime, bytes, width, height, duration_s,
       kind, category, palette, caption, alt, dhash, labels, source, source_url, post_id, posted_at, provider, credit,
       collected_at, revoked_at, revoke_reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23::jsonb,
       $24,$25,$26)
     on conflict (place_id, sha256) do nothing returning id`,
    [
      placeId,
      m.sha256,
      m.objectKey,
      m.status,
      m.reason,
      m.mime,
      m.bytes,
      m.width,
      m.height,
      m.durationS,
      m.kind,
      m.category,
      m.palette ? JSON.stringify(m.palette) : null,
      m.caption,
      m.alt,
      m.dhash,
      m.labels ? JSON.stringify(m.labels) : null,
      m.source,
      m.sourceUrl,
      m.postId,
      m.postedAt,
      m.provider,
      m.credit ? JSON.stringify(m.credit) : null,
      m.collectedAt,
      m.revokedAt,
      m.revokeReason
    ]
  )
  return (
    rows[0]?.id ??
    (await db.query('select id from wo_place_media where place_id = $1 and sha256 = $2', [placeId, m.sha256]))
      .rows[0].id
  )
}
