/**
 * Places shared across accounts (migration 134): how an opportunity is
 * recognised as a place, what the place's current snapshot holds, and when a source of it is due again.
 *
 * 🔒 ONLY THE SERVER NAMES A PLACE'S SOURCES. A link (`wo_place_link`) comes from the identity itself, from
 * Google Place Details, or from the place's own website. A website or social page in a candidate the client
 * sent is that opportunity's PRIVATE source (`privateRefs`): it is researched for that opportunity alone,
 * never for the place, so one account cannot plant a page in every other account's research.
 */
import { SHOWN_SOURCES, SOURCES, normalizeUrl, refsOfCandidate, sourceOfUrl } from './sources.js'

/** A source collected less than this long ago is fresh. */
export const SOURCE_MAX_AGE_MS = 30 * 24 * 3600 * 1000
/** A source whose last try failed is not tried again sooner than this. */
export const SOURCE_RETRY_MS = 24 * 3600 * 1000
/** Reasons that describe the PLACE, settled 30 days; any other (key, quota, provider, timeout) is our setup, retried after a day. */
export const PLACE_SETTLED_REASONS = Object.freeze(['not_found', 'private_or_empty', 'ambiguous'])
/** The snapshot source that holds Google Place Details facts. */
export const GOOGLE_FACTS_SOURCE = 'google-places'

const GOOGLE_PROVIDERS = new Set(['google-places', 'google-maps'])
const GOOGLE_ID = /^[A-Za-z0-9_-]{1,200}$/

/** `{namespace, externalId}` of a provider's id, or null when it names no place this server recognises. */
export function identityOf(provider, providerId) {
  if (typeof providerId !== 'string' || !providerId) return null
  if (GOOGLE_PROVIDERS.has(provider))
    return GOOGLE_ID.test(providerId) ? { namespace: 'google', externalId: providerId } : null
  if (provider === 'osm') return { namespace: 'osm', externalId: providerId }
  if (provider === 'url') {
    try {
      return sourceOfUrl(providerId) ? { namespace: 'url', externalId: normalizeUrl(providerId) } : null
    } catch {
      return null
    }
  }
  return null
}

/**
 * The place a provider id names, made on first sight (one transaction, serialised per identity so two
 * accounts saving the same place at once get one place). A pasted URL is its own place's link. Follows
 * `merged_into`. @returns {Promise<string | null>} the place id, null when the id names no place
 */
export async function resolvePlace(pool, { provider, providerId, name }) {
  const identity = identityOf(provider, providerId)
  if (!identity) return null
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `wo_place:${identity.namespace}:${identity.externalId}`
    ])
    let placeId = (
      await client.query('select place_id from wo_place_identity where namespace = $1 and external_id = $2', [
        identity.namespace,
        identity.externalId
      ])
    ).rows[0]?.place_id
    if (!placeId) {
      placeId = (
        await client.query('insert into wo_place (display_name) values ($1) returning id', [
          typeof name === 'string' ? name.slice(0, 200) : null
        ])
      ).rows[0].id
      await client.query(
        'insert into wo_place_identity (namespace, external_id, place_id, source) values ($1, $2, $3, $4)',
        [identity.namespace, identity.externalId, placeId, provider]
      )
      if (identity.namespace === 'url')
        await addLink(client, placeId, sourceOfUrl(identity.externalId), identity.externalId, 'identity', {
          from: 'identity'
        })
    }
    for (let hop = 0; hop < 5; hop += 1) {
      const next = (await client.query('select merged_into from wo_place where id = $1', [placeId])).rows[0]
      if (!next?.merged_into) break
      placeId = next.merged_into
    }
    await client.query('commit')
    return placeId
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Record that `url` is the place's `kind` source, with the evidence for it. Idempotent. */
export async function addLink(db, placeId, kind, url, verifiedBy, evidence) {
  if (!SOURCES.includes(kind)) return
  await db.query(
    `insert into wo_place_link (place_id, kind, url, verified_by, evidence) values ($1, $2, $3, $4, $5::jsonb)
     on conflict (place_id, kind, url) do nothing`,
    [placeId, kind, url, verifiedBy, JSON.stringify(evidence ?? {})]
  )
}

export async function linksOf(db, placeId) {
  const { rows } = await db.query(
    'select kind, url, verified_by, evidence, created_at from wo_place_link where place_id = $1 order by created_at, kind, url',
    [placeId]
  )
  return rows
}

/** The place's current (published) snapshot with its sources, or null. */
export async function currentSnapshotOf(db, placeId) {
  if (!placeId) return null
  const snapshot = (
    await db.query(
      `select s.* from wo_place p join wo_place_snapshot s on s.id = p.current_snapshot_id where p.id = $1`,
      [placeId]
    )
  ).rows[0]
  if (!snapshot) return null
  return { ...snapshot, sources: await snapshotSourcesOf(db, snapshot.id) }
}

export async function snapshotSourcesOf(db, snapshotId) {
  const { rows } = await db.query(
    'select * from wo_place_snapshot_source where snapshot_id = $1 order by source',
    [snapshotId]
  )
  return rows
}

export async function snapshotProfileOf(db, snapshotId) {
  const { rows } = await db.query(
    'select profile, brand from wo_place_snapshot_profile where snapshot_id = $1',
    [snapshotId]
  )
  return rows[0] ?? null
}

/** The place media a snapshot shows, revoked ones included (each reader decides), oldest first. */
export async function snapshotMediaOf(db, snapshotId) {
  const { rows } = await db.query(
    `select m.* from wo_place_snapshot_media sm join wo_place_media m on m.id = sm.media_id
     where sm.snapshot_id = $1 order by m.collected_at, m.id`,
    [snapshotId]
  )
  return rows
}

const time = (v) => (v ? new Date(v).getTime() : Number.NaN)

/**
 * Whether a snapshot source should be collected again (`manual`: a pressed Research again): never tried, or its last SUCCESS is older than
 * `SOURCE_MAX_AGE_MS` and its last try older than `SOURCE_RETRY_MS` (a source that keeps failing is not
 * hammered on every request) — or older than `SOURCE_MAX_AGE_MS` when that try said the place has nothing there.
 */
export function sourceDue(row, now, version = null, { manual = false } = {}) {
  // A pressed Research again looks again at once at what our setup failed on; what the place has not waits.
  const wait = placeSettled(row) ? SOURCE_MAX_AGE_MS : manual ? 0 : SOURCE_RETRY_MS
  if (version && row?.collector_version !== version) {
    const attemptedVersion = row?.coverage?.version === version || row?.last_error?.version === version
    return !attemptedVersion || !row?.attempted_at || now - time(row.attempted_at) > wait
  }
  if (!row?.attempted_at) return true
  const collected = time(row.collected_at)
  const stale = !Number.isFinite(collected) || now - collected > SOURCE_MAX_AGE_MS
  return stale && now - time(row.attempted_at) > wait
}

/** The last try of a snapshot source ended on a reason that describes the place (`PLACE_SETTLED_REASONS`). */
export function placeSettled(row) {
  const reason = row?.last_error?.reason ?? (row?.collected_at ? null : row?.reason)
  return PLACE_SETTLED_REASONS.includes(reason)
}

/**
 * How old a snapshot source's DATA is, apart from when it may be tried again: fresh when its last success is younger
 * than `SOURCE_MAX_AGE_MS`, or when its last try settled that the place has nothing there within that age. A failed
 * retry (`sourceDue`'s cooldown) never makes old data fresh. With `version`, only a collection by that rule counts.
 */
export function sourceFresh(row, now, version = null) {
  if (!row) return false
  const young = (v) => {
    const t = time(v)
    return Number.isFinite(t) && now - t <= SOURCE_MAX_AGE_MS
  }
  if (version && row.collector_version !== version) {
    const triedVersion = row.coverage?.version === version || row.last_error?.version === version
    return triedVersion && placeSettled(row) && young(row.attempted_at)
  }
  return young(row.collected_at) || (placeSettled(row) && young(row.attempted_at))
}

/** The snapshot sources freshness and scheduling look at: TripAdvisor and Google Maps only when required. */
const judgedSources = (snapshot, requiredSources) =>
  snapshot.sources.filter(
    (s) =>
      (s.source !== 'tripadvisor' || requiredSources.tripadvisor) &&
      (s.source !== 'google-maps' || requiredSources['google-maps'])
  )

const usable = (snapshot) =>
  Boolean(snapshot) && snapshot.enrichment_scope !== 'prefetch' && snapshot.state === 'published'

/**
 * A published snapshot's data is current (`sourceFresh` for every source it holds and every required one; an empty
 * one: published < 30 days ago). This is what is reported; whether a run is due now is `snapshotDue`.
 */
export function snapshotFresh(snapshot, now, requiredSources = {}) {
  if (!usable(snapshot)) return false
  const find = (source) => snapshot.sources.find((s) => s.source === source)
  if (!Object.entries(requiredSources).every(([source, version]) => sourceFresh(find(source), now, version)))
    return false
  if (snapshot.sources.length === 0) return now - time(snapshot.published_at) <= SOURCE_MAX_AGE_MS
  return judgedSources(snapshot, requiredSources).every((s) => sourceFresh(s, now))
}

/**
 * A run of the place would collect something now: no usable snapshot, or a source (required or held) is `sourceDue`.
 * A source in its retry cooldown is not due, so a place whose data is old but whose last try just failed is not run
 * again on every request.
 */
export function snapshotDue(snapshot, now, requiredSources = {}) {
  if (!usable(snapshot)) return true
  if (
    Object.entries(requiredSources).some(([source, version]) =>
      sourceDue(
        snapshot.sources.find((s) => s.source === source),
        now,
        version
      )
    )
  )
    return true
  if (snapshot.sources.length === 0) return now - time(snapshot.published_at) > SOURCE_MAX_AGE_MS
  return judgedSources(snapshot, requiredSources).some((s) => sourceDue(s, now))
}

/**
 * The candidate's refs that are not links of the place: `[{source, ref}]`, the opportunity's own to research.
 * A listing page is never one: it is read once when the opportunity is saved (`link-fields.js`), never collected.
 */
export function privateRefs(candidate, links) {
  const shared = new Set(links.map((l) => l.url))
  return Object.entries(refsOfCandidate(candidate))
    .filter(([source, ref]) => SOURCES.includes(source) && !shared.has(ref))
    .map(([source, ref]) => ({ source, ref }))
}

/**
 * The private refs of an opportunity still to collect: not yet a `wo_source` row of it, or one neither
 * collected nor found missing at the place (`PLACE_SETTLED_REASONS`) in the last 30 days.
 */
export async function privateRefsDue(db, opportunity, placeId, now) {
  const refs = privateRefs(opportunity.candidate, await linksOf(db, placeId))
  if (refs.length === 0) return []
  const { rows } = await db.query(
    'select source, status, reason, updated_at from wo_source where opportunity_id = $1',
    [opportunity.id]
  )
  const held = new Map(rows.map((r) => [r.source, r]))
  return refs.filter(({ source }) => {
    const row = held.get(source)
    if (!row) return true
    const settled = row.status === 'complete' || PLACE_SETTLED_REASONS.includes(row.reason)
    return !(settled && now - time(row.updated_at) <= SOURCE_MAX_AGE_MS)
  })
}

/** A snapshot source as a `wo_source` row. */
const asSourceRow = (s) => ({
  source: s.source,
  ref: s.ref,
  status: s.status,
  reason: s.reason,
  cursor: s.cursor,
  coverage: s.coverage,
  collected: s.collected,
  updated_at: s.collected_at ?? s.attempted_at
})

/** Snapshot sources in the shape `mergeProfile` reads (`wo_source` rows); Google facts are not one. */
export function sourceRowsOf(snapshotSources) {
  return snapshotSources.filter((s) => SOURCES.includes(s.source)).map(asSourceRow)
}

/** What the research card lists (`SHOWN_SOURCES`, in order); display only, never `mergeProfile`'s input. */
export function shownSourceRowsOf(snapshotSources) {
  const rank = (s) => SHOWN_SOURCES.indexOf(s.source)
  return snapshotSources
    .filter((s) => rank(s) >= 0)
    .sort((a, b) => rank(a) - rank(b))
    .map(asSourceRow)
}
