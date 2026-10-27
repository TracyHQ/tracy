/**
 * Send one place's published research to another deployment (shared places plan §6, slice
 * 1): the sending half of `place-import.js`. The bundle is built from named columns of the place tables
 * only — never `select *` — so an account's data cannot ride along by accident: no opportunity, job,
 * brief, private source, ledger or account row is read here, and a link's evidence keeps only `from`
 * (the backfill wrote `opportunityId` into it). Operator links stay home.
 *
 * Only a `published` snapshot of scope `full` travels; its stored pictures must already be in the
 * shared bucket (`media/…`). A place with pictures still under `places/…` is refused with
 * `MEDIA_NOT_SHARED`: run `scripts/copy-place-media-to-shared-bucket.mjs` on the sender first.
 */
import { BUNDLE_SCHEMA } from './place-import.js'
import { isSharedMediaKey } from './place-media-store.js'

export const INGEST_PATH = '/api/internal/wo-places/v1/ingest'

export class PlaceExportError extends Error {
  constructor(code, detail = {}) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

const iso = (v) => (v ? new Date(v).toISOString() : null)
const num = (v) => (v === null || v === undefined ? null : Number(v))

/** The bundle of one place. @param {string} origin this deployment's self-declared name */
export async function exportPlaceBundle(db, placeId, { origin }) {
  const place = (
    await db.query('select display_name, current_snapshot_id, merged_into from wo_place where id = $1', [
      placeId
    ])
  ).rows[0]
  if (!place || place.merged_into) throw new PlaceExportError('PLACE_NOT_FOUND')
  const snapshot = (
    await db.query('select id, state, published_at, enrichment_scope from wo_place_snapshot where id = $1', [
      place.current_snapshot_id
    ])
  ).rows[0]
  if (!snapshot || snapshot.state !== 'published') throw new PlaceExportError('NO_PUBLISHED_SNAPSHOT')
  if (snapshot.enrichment_scope !== 'full') throw new PlaceExportError('NOT_FULL')

  const identities = (
    await db.query(
      `select namespace, external_id, source, confidence from wo_place_identity
       where place_id = $1 and namespace <> 'merge' order by namespace, external_id`,
      [placeId]
    )
  ).rows.map((r) => ({
    namespace: r.namespace,
    externalId: r.external_id,
    source: r.source,
    confidence: Number(r.confidence)
  }))
  const links = (
    await db.query(
      `select kind, url, verified_by, evidence->>'from' as evidence_from from wo_place_link
       where place_id = $1 and verified_by <> 'operator' order by kind, url`,
      [placeId]
    )
  ).rows.map((r) => ({
    kind: r.kind,
    url: r.url,
    verifiedBy: r.verified_by,
    evidence: r.evidence_from ? { from: r.evidence_from } : {}
  }))
  const sources = (
    await db.query(
      `select source, ref, status, reason, coverage, collected, collected_at, attempted_at, collector_version
       from wo_place_snapshot_source where snapshot_id = $1 order by source`,
      [snapshot.id]
    )
  ).rows.map((r) => ({
    source: r.source,
    ref: r.ref,
    status: r.status,
    reason: r.reason,
    coverage: r.coverage,
    collected: r.collected,
    collectedAt: iso(r.collected_at),
    attemptedAt: iso(r.attempted_at),
    collectorVersion: r.collector_version
  }))
  const profile = (
    await db.query('select profile, brand from wo_place_snapshot_profile where snapshot_id = $1', [
      snapshot.id
    ])
  ).rows[0]
  const media = (
    await db.query(
      `select m.sha256, m.object_key, m.status, m.reason, m.mime, m.bytes, m.width, m.height, m.duration_s, m.kind,
         m.category, m.palette, m.caption, m.alt, m.dhash, m.labels, m.source, m.source_url, m.post_id, m.posted_at,
         m.provider, m.credit, m.collected_at, m.revoked_at, m.revoke_reason
       from wo_place_snapshot_media sm join wo_place_media m on m.id = sm.media_id
       where sm.snapshot_id = $1 order by m.collected_at, m.sha256`,
      [snapshot.id]
    )
  ).rows
  const unshared = media.filter((m) => m.status === 'stored' && !isSharedMediaKey(m.object_key)).length
  if (unshared) throw new PlaceExportError('MEDIA_NOT_SHARED', { count: unshared })

  return {
    schema: BUNDLE_SCHEMA,
    origin,
    place: { displayName: place.display_name },
    identities,
    links,
    snapshot: {
      id: snapshot.id,
      publishedAt: iso(snapshot.published_at),
      enrichmentScope: snapshot.enrichment_scope,
      sources,
      profile: { profile: profile?.profile ?? {}, brand: profile?.brand ?? null },
      media: media.map((m) => ({
        sha256: m.sha256,
        objectKey: m.status === 'stored' ? m.object_key : null,
        status: m.status,
        reason: m.reason,
        mime: m.mime,
        bytes: num(m.bytes),
        width: m.width,
        height: m.height,
        durationS: num(m.duration_s),
        kind: m.kind,
        category: m.category,
        palette: m.palette,
        caption: m.caption,
        alt: m.alt,
        dhash: m.dhash,
        labels: m.labels,
        source: m.source,
        sourceUrl: m.source_url,
        postId: m.post_id,
        postedAt: iso(m.posted_at),
        provider: m.provider,
        credit: m.credit,
        collectedAt: iso(m.collected_at),
        revokedAt: iso(m.revoked_at),
        revokeReason: m.revoke_reason
      }))
    }
  }
}

/**
 * Export and POST each place, one request per place. Returns one result per place with its audit
 * `line` (`place=… outcome=… media=…`), printed by the push script. Never throws for one place.
 */
export async function pushPlaces({ pool, placeIds, to, secret, origin, fetchImpl = fetch }) {
  const results = []
  for (const placeId of placeIds) {
    let outcome
    let media = 0
    try {
      const bundle = await exportPlaceBundle(pool, placeId, { origin })
      media = bundle.snapshot.media.length
      const res = await fetchImpl(new URL(INGEST_PATH, to).toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tracy-wo-places-secret': secret },
        body: JSON.stringify(bundle)
      })
      const body = await res.json().catch(() => null)
      outcome = typeof body?.outcome === 'string' ? body.outcome : `http_${res.status}`
    } catch (error) {
      outcome =
        error instanceof PlaceExportError ? `not_exported:${error.code}` : `failed:${error?.code ?? 'error'}`
    }
    results.push({
      placeId,
      outcome,
      media,
      line: `${new Date().toISOString()} origin=${origin} place=${placeId} outcome=${outcome} media=${media}`
    })
  }
  return results
}
