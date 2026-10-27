/**
 * Research done before places existed, moved into the shared store (migration 137,
 * shared research plan P3). Run in small batches by the place maintenance sweep
 * (`place-maintenance.js`), never in a migration: it copies objects in the artifact store, which SQL cannot
 * do, and a batch at a time keeps a large deployment's boot and transactions short.
 *
 * 1. Every saved opportunity gets the place its provider id names (`resolvePlace`, the create path's own).
 * 2. A place with no snapshot whose opportunities hold a completed per-account research gets ONE published
 *    snapshot, made from the NEWEST such research; `wo_place_backfill` records which opportunity and account.
 *
 * 🔒 ONLY WHAT THE PLACE MAY SHARE GOES IN. A source becomes the place's when its ref is a link the server
 * vouches for (`places.js`): the place's identity, the website Google's own record of the place names, or a
 * social page that website links to. Every other page the account named stays its own `wo_source` row,
 * read as its private overlay (`place-view.js`). The profile is rebuilt from the shared sources alone, so
 * nothing from the account's candidate lands in the place.
 * 🔒 OBJECTS ARE COPIED, NEVER MOVED. A stored picture's bytes are read at the old key, checked against its
 * sha256 and size, and put at `places/<place>/<sha>.<ext>` before its `wo_place_media` row exists (the row is
 * immutable). Old keys stay: revisions made before keep reading `wo_media`. A failed copy leaves the place
 * for a later pass (`retry`); after `BACKFILL_MAX_ATTEMPTS` the place is published without that picture.
 * Re-running is a no-op: a done or skipped place is not looked at again, and every write is idempotent.
 *
 * 🔒 THE WEBSITE PASS (migration 138). Research from before P1 kept Google facts without `websiteUri`, so
 * nothing it collected was vouched for. A Google place whose facts name no website asks Google ONCE
 * (`websiteUri` only, charged through the research ledger, `requestKey` per place and try so a re-run never
 * pays twice); the answer is kept in `wo_place_backfill`. The Google website becomes the place's link only
 * when it is the website the account collected (`sameWebsite`); the socials that website's own crawl links
 * to follow, as P1 does live. A done (or nothing-shared skipped) place then gets a NEW snapshot with them and
 * their pictures; the old snapshot is untouched, so a brief pinned to it stays pinned. A place its own
 * research published is never touched. Over the cap, or after a Google error, the place waits for a later
 * pass. No Google key: nothing is asked.
 */
import { createHash } from 'node:crypto'
import { BUDGET_EXCEEDED, createChargeable } from './cost-ledger.js'
import { ceilingCents } from './cost-prices.js'
import { mergeProfile } from './executor.js'
import { GOOGLE_FACTS_SOURCE, addLink, linksOf, resolvePlace } from './places.js'
import { SOCIAL_SOURCES, SOURCES, refsOfUrls, sameWebsite, sourceOfUrl } from './sources.js'

export const BACKFILL_MAX_ATTEMPTS = 3
const PROVIDERS = ['google-places', 'google-maps', 'osm', 'url']
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }

// Opportunities whose provider id names no place, per pool: not offered again in this process.
const unresolvable = new WeakMap()

/**
 * One pass over at most `batch` opportunities, `batch` new places and `batch` places for the website pass.
 * @param {import('pg').Pool} pool
 * @param {{ objects: { get: (key: string) => Promise<Response | null>, put: Function } | null, batch?: number,
 *   retryAfterMs?: number, afterPlace?: (placeId: string) => Promise<void>, log?: Console,
 *   googleWebsite?: { available: () => Promise<boolean>, website: (googleId: string) => Promise<string | null> } | null,
 *   chargeable?: ReturnType<typeof createChargeable> }} deps
 *   `afterPlace` runs once a place got its snapshot (the URL ↔ Google merge, `place-merge.js`).
 *   `googleWebsite` asks Google for a place's `websiteUri` (`place-maintenance.js`); `chargeable` reserves it.
 * @returns {Promise<{linked: number, published: number, upgraded: number, skipped: number, retried: number,
 *   waiting: number, more: boolean}>} `more`: a batch was full, call again
 */
export async function runBackfill(
  pool,
  {
    objects,
    batch = 50,
    retryAfterMs = 10 * 60_000,
    afterPlace = null,
    log = console,
    googleWebsite = null,
    chargeable = createChargeable(null)
  }
) {
  const linked = await linkOpportunities(pool, batch)
  const google = googleWebsite && (await googleWebsite.available().catch(() => false)) ? googleWebsite : null
  const ctx = { objects, log, google, chargeable }
  const places = (
    await pool.query(
      `select p.id from wo_place p
       left join wo_place_backfill b on b.place_id = p.id
       where p.current_snapshot_id is null and p.merged_into is null
         and (b.place_id is null or (b.state = 'retry' and b.updated_at < now() - ($2::int * interval '1 millisecond')))
         and exists (select 1 from wo_opportunity o join wo_job j on j.opportunity_id = o.id
                     where o.place_id = p.id and j.kind = 'research' and j.state = 'completed' and j.place_job_id is null)
       order by p.id limit $1`,
      [batch, retryAfterMs]
    )
  ).rows
  const counts = { linked: linked.count, published: 0, upgraded: 0, skipped: 0, retried: 0, waiting: 0 }
  const tally = async (id, outcome) => {
    if (outcome in counts) counts[outcome] += 1
    if ((outcome === 'published' || outcome === 'upgraded') && afterPlace)
      await afterPlace(id).catch((error) =>
        log.warn(`[opportunities] place ${id}: after backfill: ${error?.message ?? error}`)
      )
  }
  for (const { id } of places) await tally(id, await backfillPlace(pool, id, ctx))
  // The website pass: places backfilled before Google was asked for their website.
  const upgrades = (
    await pool.query(
      `select b.place_id as id from wo_place_backfill b join wo_place p on p.id = b.place_id
       where b.state in ('done', 'skipped') and p.merged_into is null
         and (b.website_pass is null
              or (b.website_pass = 'waiting' and b.website_pass_at < now() - ($2::int * interval '1 millisecond')))
         and ($3::boolean or b.google_website_at is not null)
         and exists (select 1 from wo_place_identity i where i.place_id = p.id and i.namespace = 'google')
         and ((b.state = 'done' and p.current_snapshot_id = b.snapshot_id)
              or (b.state = 'skipped' and b.detail->>'reason' = 'nothing_shared' and p.current_snapshot_id is null))
       order by b.place_id limit $1`,
      [batch, retryAfterMs, Boolean(google)]
    )
  ).rows
  for (const { id } of upgrades) await tally(id, await backfillPlace(pool, id, ctx))
  return { ...counts, more: linked.full || places.length === batch || upgrades.length === batch }
}

async function linkOpportunities(pool, batch) {
  const skip = unresolvable.get(pool) ?? new Set()
  unresolvable.set(pool, skip)
  const { rows } = await pool.query(
    `select id, provider, provider_id, name from wo_opportunity
     where place_id is null and provider = any($1) and not (id = any($2::uuid[])) order by id limit $3`,
    [PROVIDERS, [...skip], batch]
  )
  let count = 0
  for (const opp of rows) {
    const placeId = await resolvePlace(pool, {
      provider: opp.provider,
      providerId: opp.provider_id,
      name: opp.name
    })
    if (!placeId) {
      skip.add(opp.id)
      continue
    }
    await pool.query('update wo_opportunity set place_id = coalesce(place_id, $2) where id = $1', [
      opp.id,
      placeId
    ])
    count += 1
  }
  return { count, full: rows.length === batch }
}

/**
 * The first backfill of a place (no row, or `retry`) or its website pass (a `done` or `skipped` row).
 * @returns {Promise<'published' | 'upgraded' | 'unchanged' | 'skipped' | 'retried' | 'waiting' | 'deferred'>}
 */
async function backfillPlace(pool, placeId, ctx) {
  const { objects, log } = ctx
  const prior = (await pool.query('select * from wo_place_backfill where place_id = $1', [placeId])).rows[0]
  const upgrade = Boolean(prior && prior.state !== 'retry')
  const donor = (
    await pool.query(
      `select o.*, j.id as job_id, j.updated_at as done_at from wo_opportunity o
       join lateral (select id, updated_at from wo_job where opportunity_id = o.id and kind = 'research'
                     and state = 'completed' and place_job_id is null order by updated_at desc limit 1) j on true
       where o.place_id = $1 order by j.updated_at desc, o.id limit 1`,
      [placeId]
    )
  ).rows[0]
  if (!donor) {
    if (upgrade) await markWebsite(pool, placeId, { pass: 'done', detail: { reason: 'no_research' } })
    return 'deferred'
  }
  const identity = (
    await pool.query(
      `select namespace, external_id, source from wo_place_identity where place_id = $1 and namespace <> 'merge'
       order by (namespace = 'google') desc, created_at limit 1`,
      [placeId]
    )
  ).rows[0]
  const rows = (await pool.query('select * from wo_source where opportunity_id = $1', [donor.id])).rows
  const held = (await pool.query('select * from wo_profile where opportunity_id = $1', [donor.id])).rows[0]
  const stored =
    identity?.namespace === 'google' && held?.profile?.googlePlace?.placeId === identity.external_id
      ? held.profile.googlePlace
      : null

  const ask = await googleWebsiteOf(pool, placeId, identity, stored, prior, ctx)
  if (upgrade && ask.pass !== 'done') {
    if (ask.pass === 'waiting') await markWebsite(pool, placeId, ask)
    return ask.pass === 'waiting' ? 'waiting' : 'deferred'
  }
  // The facts with the website Google named since: the place's snapshot keeps them.
  const googlePlace = stored && !stored.website && ask.website ? { ...stored, website: ask.website } : stored

  // The links the server vouches for: what the place has, Google's website, the socials that website names.
  const links = (await linksOf(pool, placeId)).map((l) => ({ kind: l.kind, url: l.url, verifiedBy: null }))
  const has = (kind, u) => links.some((l) => l.kind === kind && l.url === u)
  if (stored?.website)
    for (const [kind, u] of Object.entries(refsOfUrls([stored.website])))
      if (!has(kind, u)) links.push({ kind, url: u, verifiedBy: 'google' })
  if (!stored?.website && ask.website) {
    // Asked afterwards: it vouches only for the page the account collected as that same website.
    const kind = sourceOfUrl(ask.website)
    const mine = rows.find((r) => r.source === kind && r.ref && sameWebsite(r.ref, ask.website))
    if (mine && !has(kind, mine.ref))
      links.push({
        kind,
        url: mine.ref,
        verifiedBy: 'google',
        evidence: { from: 'backfill', websiteUri: ask.website, placeId: identity.external_id }
      })
  }
  const site = rows.find((r) => r.source === 'website' && r.ref && has('website', r.ref))
  if (site)
    for (const [kind, u] of Object.entries(refsOfUrls(site.collected?.profile?.links ?? [])))
      if (SOCIAL_SOURCES.includes(kind) && !has(kind, u)) links.push({ kind, url: u, verifiedBy: 'website' })
  if (upgrade && !links.some((l) => l.verifiedBy)) {
    await markWebsite(pool, placeId, { ...ask, detail: { ...ask.detail, changed: false } })
    return 'unchanged'
  }
  const shared = rows.filter((r) => SOURCES.includes(r.source) && r.ref && has(r.source, r.ref))
  if (shared.length === 0 && !googlePlace) {
    await mark(pool, placeId, 'skipped', donor, { reason: 'nothing_shared' })
    if (ask.pass) await markWebsite(pool, placeId, ask)
    return 'skipped'
  }
  const sharedKinds = new Set(shared.map((r) => r.source))
  const ownCollected = rows.some(
    (r) => !sharedKinds.has(r.source) && ['complete', 'partial'].includes(r.status)
  )

  const media = (
    await pool.query('select * from wo_media where opportunity_id = $1 order by collected_at, id', [donor.id])
  ).rows.filter((m) => sharedKinds.has(m.source) || m.source === GOOGLE_FACTS_SOURCE)
  const known = new Set(
    (await pool.query('select sha256 from wo_place_media where place_id = $1', [placeId])).rows.map(
      (r) => r.sha256
    )
  )
  const copied = []
  const failed = []
  for (const m of media) {
    // A reference keeps no bytes; a sha the place already has is shown, not copied again.
    if (m.status !== 'stored' || known.has(m.sha256)) {
      copied.push({ m, key: null })
      continue
    }
    const key = await copyObject(objects, m, placeId)
    if (key) copied.push({ m, key })
    else failed.push(m.id)
  }
  const attempts = prior?.attempts ?? 0
  if (failed.length && upgrade && ask.attempts + 1 < BACKFILL_MAX_ATTEMPTS) {
    await markWebsite(pool, placeId, {
      ...ask,
      pass: 'waiting',
      attempts: ask.attempts + 1,
      detail: { ...ask.detail, failedMedia: failed }
    })
    return 'waiting'
  }
  if (failed.length && !upgrade && attempts + 1 < BACKFILL_MAX_ATTEMPTS) {
    await mark(pool, placeId, 'retry', donor, { failedMedia: failed }, attempts + 1)
    if (ask.pass) await markWebsite(pool, placeId, { ...ask, pass: ask.pass === 'done' ? null : ask.pass })
    return 'retried'
  }
  if (failed.length)
    log.warn(`[opportunities] place ${placeId}: backfill left out ${failed.length} picture(s)`)

  const profile = mergeProfile(
    {
      id: placeId,
      provider: identity?.source ?? 'place',
      provider_id: identity?.external_id ?? null,
      candidate: {},
      name: typeof googlePlace?.name === 'string' ? googlePlace.name : null,
      branch: null
    },
    shared
  )
  if (googlePlace) profile.googlePlace = googlePlace
  if (held?.profile?.pageSpeed && site && held.profile.website === site.ref)
    profile.pageSpeed = held.profile.pageSpeed
  // The account's brand observation read its private sources too: then the next refresh makes the place's own.
  const brand = ownCollected ? null : (held?.brand ?? null)

  const client = await pool.connect()
  try {
    await client.query('begin')
    const place = (await client.query('select * from wo_place where id = $1 for update', [placeId])).rows[0]
    const busy = (
      await client.query(
        `select 1 from wo_place_job where place_id = $1 and state in ('queued', 'running', 'paused', 'blocked') limit 1`,
        [placeId]
      )
    ).rows[0]
    // The snapshot the place must still show: none, or the one this backfill published before.
    const expected = upgrade && prior.state === 'done' ? prior.snapshot_id : null
    if ((place.current_snapshot_id ?? null) !== expected || place.merged_into || busy) {
      // Research of its own got there first (or is under way): that snapshot is the place's.
      await client.query('rollback')
      if (busy && !place.merged_into && (place.current_snapshot_id ?? null) === expected) return 'deferred'
      const reason = place.merged_into ? 'merged' : 'researched'
      if (upgrade) await markWebsite(pool, placeId, { ...ask, detail: { ...ask.detail, reason } })
      else await mark(pool, placeId, 'skipped', donor, { reason })
      return 'skipped'
    }
    const evidence = { from: 'backfill', opportunityId: donor.id }
    for (const l of links)
      if (l.verifiedBy)
        await addLink(client, placeId, l.kind, l.url, l.verifiedBy, { ...evidence, ...l.evidence })
    const snapshotId = (
      await client.query(
        `insert into wo_place_snapshot (place_id, state, published_at) values ($1, 'published', $2) returning id`,
        [placeId, upgrade ? new Date() : donor.done_at]
      )
    ).rows[0].id
    for (const r of shared)
      await client.query(
        `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, reason, cursor, coverage, collected,
           collected_at, attempted_at, collector_version)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $9, 'wo-backfill-1')`,
        [
          snapshotId,
          r.source,
          r.ref,
          r.status,
          r.reason,
          r.cursor ? JSON.stringify(r.cursor) : null,
          r.coverage ? JSON.stringify(r.coverage) : null,
          JSON.stringify(r.collected ?? {}),
          r.updated_at
        ]
      )
    if (googlePlace) {
      const at = Date.parse(googlePlace.fetchedAt) ? new Date(googlePlace.fetchedAt) : donor.done_at
      await client.query(
        `insert into wo_place_snapshot_source (snapshot_id, source, ref, status, collected, collected_at,
           attempted_at, collector_version)
         values ($1, $2, $3, 'complete', $4::jsonb, $5, $5, 'wo-backfill-1')`,
        [snapshotId, GOOGLE_FACTS_SOURCE, identity.external_id, JSON.stringify(googlePlace), at]
      )
    }
    await client.query(
      'insert into wo_place_snapshot_profile (snapshot_id, profile, brand) values ($1, $2::jsonb, $3::jsonb)',
      [snapshotId, JSON.stringify(profile), brand ? JSON.stringify(brand) : null]
    )
    for (const { m, key } of copied) {
      const mediaId = await keepLegacyMedia(client, placeId, m, key)
      await client.query(
        'insert into wo_place_snapshot_media (snapshot_id, media_id) values ($1, $2) on conflict do nothing',
        [snapshotId, mediaId]
      )
      await client.query(
        `insert into wo_place_media_legacy (wo_media_id, place_media_id, old_object_key) values ($1, $2, $3)
         on conflict (wo_media_id) do nothing`,
        [m.id, mediaId, m.object_key]
      )
    }
    await client.query(
      `update wo_place set current_snapshot_id = $2, display_name = coalesce(display_name, $3), updated_at = now()
       where id = $1`,
      [placeId, snapshotId, typeof profile.name === 'string' ? profile.name.slice(0, 200) : null]
    )
    const detail = {
      ...(upgrade ? (prior.detail ?? {}) : {}),
      ...(upgrade ? { upgradedFrom: prior.snapshot_id } : {}),
      ...(failed.length ? { leftOutMedia: failed } : {})
    }
    await mark(client, placeId, 'done', donor, detail, attempts, snapshotId)
    if (ask.pass) await markWebsite(client, placeId, ask)
    await client.query('commit')
    return upgrade ? 'upgraded' : 'published'
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * The website Google's record of the place names: from its stored facts, an earlier answer, or ONE Place
 * Details call now (`websiteUri` only, reserved before it goes out). An answer is kept at once when the
 * place has a backfill row, so a crash before publishing never asks again.
 * @returns {Promise<{website: string | null, pass: 'done' | 'waiting' | null, attempts: number,
 *   detail: object, answered?: boolean}>} `pass` null: nothing could be asked (no Google key)
 */
async function googleWebsiteOf(pool, placeId, identity, stored, prior, ctx) {
  const attempts = prior?.website_attempts ?? 0
  const done = (website, detail, answered = false) => ({ website, pass: 'done', attempts, detail, answered })
  if (identity?.namespace !== 'google') return done(null, { reason: 'not_google' })
  if (stored?.website) return done(stored.website, { from: 'facts' })
  if (prior?.google_website_at) return done(prior.google_website, { from: 'google' })
  if (!ctx.google) return { website: null, pass: null, attempts, detail: {} }
  let answer
  try {
    const website = await ctx.chargeable(
      {
        provider: 'google',
        operation: 'place-details',
        maxCents: ceilingCents('google', 'place-details'),
        placeId,
        requestKey: `backfill-website:${placeId}:${attempts}`
      },
      () => ctx.google.website(identity.external_id)
    )
    answer = done(website, { from: 'google' }, true)
  } catch (error) {
    if (error?.code === BUDGET_EXCEEDED)
      return { website: null, pass: 'waiting', attempts, detail: { reason: 'budget' } }
    // That try was paid but its answer was lost: never pay for it again.
    if (error?.code === 'CHARGE_SPENT') answer = done(null, { reason: 'charge_spent' }, true)
    else if (error?.status === 404) answer = done(null, { reason: 'not_found' }, true)
    else {
      const code = error?.code ?? 'error'
      ctx.log.warn(`[opportunities] place ${placeId}: Google website not read (${code})`)
      const failed = { website: null, attempts: attempts + 1, detail: { reason: 'error', code } }
      return { ...failed, pass: attempts + 1 < BACKFILL_MAX_ATTEMPTS ? 'waiting' : 'done' }
    }
  }
  if (prior)
    await pool.query(
      `update wo_place_backfill set google_website = $2, google_website_at = now() where place_id = $1`,
      [placeId, answer.website]
    )
  return answer
}

async function markWebsite(db, placeId, ask) {
  await db.query(
    `update wo_place_backfill set website_pass = $2, website_pass_at = now(), website_attempts = $3,
       website_detail = $4::jsonb,
       google_website = case when $5 then $6 else google_website end,
       google_website_at = case when $5 then coalesce(google_website_at, now()) else google_website_at end
     where place_id = $1`,
    [
      placeId,
      ask.pass ?? null,
      ask.attempts ?? 0,
      JSON.stringify(ask.detail ?? {}),
      Boolean(ask.answered),
      ask.website ?? null
    ]
  )
}

/** Who served a legacy picture, as `wo_place_media.provider` names it. */
const legacyProvider = (m) =>
  m.source === GOOGLE_FACTS_SOURCE ? 'google' : SOCIAL_SOURCES.includes(m.source) ? 'apify' : 'website'

/** The place media row of a legacy picture (once per sha256 of the place). @returns {Promise<string>} its id */
async function keepLegacyMedia(db, placeId, m, objectKey) {
  const provider = legacyProvider(m)
  const { rows } = await db.query(
    `insert into wo_place_media (place_id, sha256, object_key, status, reason, mime, bytes, width, height, duration_s,
       kind, category, palette, caption, alt, dhash, labels, source, source_url, post_id, posted_at, provider, credit,
       collected_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17::jsonb,$18,$19,$20,$21,$22,$23::jsonb,$24)
     on conflict (place_id, sha256) do nothing returning id`,
    [
      placeId,
      m.sha256,
      m.status === 'stored' ? objectKey : null,
      m.status === 'stored' && !objectKey ? 'reference' : m.status,
      m.reason,
      m.mime,
      m.bytes,
      m.width,
      m.height,
      m.duration_s,
      m.kind,
      m.category,
      m.palette ? JSON.stringify(m.palette) : null,
      m.caption,
      m.alt,
      m.dhash,
      // Vision labels stay with the old row; the shared ones are claimed by sha (`wo_media_analysis`).
      m.labels?.features ? JSON.stringify({ features: m.labels.features }) : null,
      m.source,
      m.source_url,
      m.post_id,
      m.posted_at,
      provider,
      m.labels?.credit ? JSON.stringify(m.labels.credit) : null,
      m.collected_at
    ]
  )
  return (
    rows[0]?.id ??
    (await db.query('select id from wo_place_media where place_id = $1 and sha256 = $2', [placeId, m.sha256]))
      .rows[0].id
  )
}

/** Copy a stored picture to the place's key, checked by sha256 and size. @returns {Promise<string | null>} */
async function copyObject(objects, m, placeId) {
  if (!objects?.get || !m.object_key) return null
  const ext = /\.([a-z0-9]{2,5})$/i.exec(m.object_key)?.[1] ?? EXT[m.mime] ?? 'bin'
  const key =
    // A legacy row keeps its Google credit in labels; the shared key's origin prefix reads it.
    objects.sharedKey?.({ ...m, provider: legacyProvider(m), credit: m.labels?.credit }, ext.toLowerCase()) ??
    `places/${placeId}/${m.sha256}.${ext}`
  try {
    const res = await objects.get(m.object_key)
    if (!res?.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== m.sha256) return null
    if (m.bytes !== null && m.bytes !== undefined && Number(m.bytes) !== bytes.length) return null
    return (await objects.put(key, bytes, m.mime ?? 'application/octet-stream')) ? key : null
  } catch {
    return null
  }
}

async function mark(db, placeId, state, donor, detail, attempts = 0, snapshotId = null) {
  await db.query(
    `insert into wo_place_backfill (place_id, state, snapshot_id, from_opportunity_id, from_account_id, from_job_id,
       attempts, detail)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     on conflict (place_id) do update set state = excluded.state, snapshot_id = excluded.snapshot_id,
       from_opportunity_id = excluded.from_opportunity_id, from_account_id = excluded.from_account_id,
       from_job_id = excluded.from_job_id, attempts = excluded.attempts, detail = excluded.detail, updated_at = now()`,
    [placeId, state, snapshotId, donor.id, donor.account_id, donor.job_id, attempts, JSON.stringify(detail)]
  )
}
