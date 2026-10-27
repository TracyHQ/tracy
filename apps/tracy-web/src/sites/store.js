import { opsFor } from '../lib/ops-signal.js'
import { DELETE_BRIEF_OF_GONE } from '../lib/site-brief-row.js'
import { parseTurnId } from './turns.js'
/**
 * The site book (`site` table, `002-book.sql`), plus the job queue that tracks one running
 * instruction on `tracy-host` (`job`) and the plain append-only trail (`audit`).
 *
 * Column names and meanings follow `workers/seat-registry/schema.sql`'s `site` shape — see
 * `002-book.sql`'s own inline comments for which KV key each column replaces. This file is the
 * one place that writes `site`/`job`/`audit`; a caller elsewhere that only needs a narrow read
 * (`seats/route.js`'s `siteMetaFor`) is allowed to query `site` directly, the same way this file
 * never reaches into `seat`.
 */

/** A site by its key, or null. */
export async function siteByKey(pool, siteKey) {
  const { rows } = await pool.query('select * from site where site_key = $1', [siteKey])
  return rows[0] ?? null
}

/** A site by its fleet label — the reverse of `label`, used wherever only the label is known
 * (a lane's own hostname, a webhook path). */
export async function siteByLabel(pool, label) {
  const { rows } = await pool.query('select * from site where label = $1', [label])
  return rows[0] ?? null
}

/**
 * Claim a fresh row. `on conflict (site_key) do nothing` rather than an upsert: a second insert
 * of the same key is a race (two requests claiming the same name at once), and the loser must
 * come back empty-handed so its caller re-reads the row a concurrent winner just wrote — silently
 * overwriting `host`/`platform`/`created_by` on a race would hand a site whoever asked last,
 * not whoever asked first.
 * @returns {Promise<object|null>} the new row, or null if `siteKey` was already taken.
 */
export async function createSite(
  pool,
  {
    siteKey,
    label,
    host,
    platform = null,
    origin = null,
    createdBy = null,
    // The design the customer picked and the one the fleet will actually build, written together
    // with the claim so the two never exist apart (`006-site-design.sql` says why they are two).
    requestedDesign = null,
    effectiveDesign = null,
    designProfile = null,
    // What this site was built FROM, as the release declared it — the tag, the version, and the
    // checksum of the part the version is read off. Three columns rather than one: "which
    // quickstart" stops being answerable the moment a tag points at a new version, and the version
    // and the checksum are what a person needs when one site behaves unlike its siblings.
    quickstartTag = null,
    quickstartVersion = null,
    quickstartSha256 = null
  }
) {
  const { rows } = await pool
    .query(
      `insert into site (site_key, label, host, platform, origin, created_by,
                       requested_design, effective_design, design_profile,
                       quickstart_tag, quickstart_version, quickstart_sha256)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (site_key) do nothing
     returning *`,
      [
        siteKey,
        label,
        host,
        platform,
        origin,
        createdBy,
        requestedDesign,
        effectiveDesign,
        designProfile,
        quickstartTag,
        quickstartVersion,
        quickstartSha256
      ]
    )
    .catch((error) => {
      if (error.code === '23505' && ['site_name_pkey', 'site_label_key'].includes(error.constraint))
        return { rows: [] }
      throw error
    })
  return rows[0] ?? null
}

/**
 * Fill in what a site was built FROM, for a row that was claimed before anyone knew.
 *
 * 🔒 THE CLAIM AND THE ANSWER ARRIVE AT DIFFERENT TIMES ON THE ROAD CUSTOMERS ACTUALLY TAKE.
 * `createSite` takes all three columns because the note above says they are "written together with
 * the claim". That holds for a create that names its quickstart in the same call. It does not hold
 * for claim-then-workspace (`/api/sites/claim`, 15/09): the press claims a draft address before
 * a questionnaire has been answered, so the claim has a design and no quickstart, and by the time
 * `/api/sites` resolves one the row already exists — `claimOwnership` returns it untouched and the
 * three columns stay null for ever. Measured 22/09/2026 on three sites built through Design
 * inspiration: `quickstart_tag` null on all three while their provision logs read
 * `tracy-business/wp7`, `tracy-business/j6` and `tracy-business/emdash-0.x`.
 *
 * 🔒 IT ONLY EVER FILLS A BLANK. The `is null` guard is the whole safety of this call: a second
 * attempt under a different tag, or a later door with a worse answer, must not rewrite what a site
 * was really built from. Provenance that can be overwritten is provenance nobody can trust, and
 * this column is read exactly when a site behaves unlike its siblings.
 *
 * @returns {Promise<object|null>} the updated row, or null when it was already recorded.
 */
export async function setQuickstart(pool, siteKey, { tag, version = null, sha256 = null }) {
  if (typeof tag !== 'string' || tag === '') return null
  const { rows } = await pool.query(
    `update site set quickstart_tag = $2, quickstart_version = $3, quickstart_sha256 = $4
      where site_key = $1 and quickstart_tag is null
      returning *`,
    [siteKey, tag, version, sha256]
  )
  return rows[0] ?? null
}

/**
 * Re-state an IMPORTED site's platform, but only while no host was ever asked to build it: the row
 * is `migrated`, not attached, and no job exists. That is the window in which a platform is still
 * a choice the person is making (the import wizard opens on Joomla, and a second press under
 * WordPress is the person correcting it); after it, the copy on the host IS the platform the job
 * was filed as, and rewriting the row would only move the mismatch. The guard is in the statement,
 * so a provision filed in between cannot be overtaken.
 *
 * @returns {Promise<object|null>} the updated row, or null when the row is outside that window.
 */
export async function setImportPlatform(pool, siteKey, platform) {
  const { rows } = await pool.query(
    `update site set platform = $2
      where site_key = $1 and origin = 'migrated' and not attached
        and not exists (select 1 from job where job.site_key = site.site_key and job.created_at >= site.created_at)
      returning *`,
    [siteKey, platform]
  )
  return rows[0] ?? null
}

/** Which host's `tracy-host` now runs this site's copy — decided once, at provision, and read by
 * every later door (`fleetHostOfRecord`'s job, ADR 0005 §6). */
export async function setHost(pool, siteKey, host) {
  await pool.query('update site set host = $2 where site_key = $1', [siteKey, host])
}

/** The host loopback port a provision job reported — set once, read by the local-address branch
 * of `sites/route.js`'s job-poll handler. */
export async function setPort(pool, siteKey, port) {
  await pool.query('update site set port = $2 where site_key = $1', [siteKey, port])
}

/**
 * Flip a site between `draft` and `published`, and/or move it between plans — the write behind
 * `POST /api/sites/:key/state` and the flag `bar/route.js` reads on every request to a customer
 * hostname. Ported from `setPublishState` (`workers/seat-registry/src/fleetCloudflare.js`), where
 * the same two fields live in a KV row; here they are two columns that already exist.
 *
 * 🔒 `origin` IS NOT WRITABLE HERE, and that is the Worker's rule kept deliberately: it records
 * how a site came into being (`fleet_born` / `migrated`) and survives from the address publish, so
 * a site must not be able to rewrite its own history by flipping its state.
 *
 * Either field alone is a legal write — the Publish dialog changes the flag without touching the
 * plan far more often than both together — so an undefined field leaves the column alone rather
 * than nulling it.
 */
export async function setPublishState(pool, siteKey, { publish, plan }) {
  const { rows } = await pool.query(
    `update site set publish = coalesce($2, publish), plan = coalesce($3, plan)
     where site_key = $1
     returning publish, plan`,
    [siteKey, publish ?? null, plan ?? null]
  )
  return rows[0] ?? null
}

/**
 * The public address a site answers at, and — when the caller names one — whether it is `draft` or
 * `published`. A caller that names no `publish` leaves the flag exactly as it stands, in the same
 * statement: after a site is born the flag moves only through a go-live (`publish.js`).
 */
export async function setAddress(pool, siteKey, { address, publish }) {
  await pool.query('update site set address = $2, publish = coalesce($3, publish) where site_key = $1', [
    siteKey,
    address,
    publish ?? null
  ])
}

/** Whether the site's folder is mounted into its host's dsh — the one flag `agent: '/'` in
 * `GET /api/sites` (`seats/route.js`) reads. */
export async function setAttached(pool, siteKey, attached) {
  await pool.query('update site set attached = $2 where site_key = $1', [siteKey, attached])
}

/** Whether a visitor with no seat may open this site's guest lane. */
export async function setGuestOpen(pool, siteKey, guestOpen) {
  await pool.query('update site set guest_open = $2 where site_key = $1', [siteKey, guestOpen])
}

/** Erase the row — the book half of a teardown. The machine half (`hostCall('/teardown')`) and
 * the seat half (`revokeAllGrants`) are the caller's job; this removes the one row and its brief. */
export async function deleteSite(pool, siteKey) {
  await pool.query(
    `with gone as (delete from site where site_key = $1 returning site_key) ${DELETE_BRIEF_OF_GONE}`,
    [siteKey]
  )
}

/** Whether any job was ever filed for this site — i.e. a host was asked to build something for it.
 * Only the site standing under the name now: a deleted one's jobs are not its (`provisionedInPlace`). */
export async function hasJob(pool, siteKey) {
  const { rows } = await pool.query(
    `select 1 from job j join site s on s.site_key = j.site_key
      where j.site_key = $1 and j.created_at >= s.created_at limit 1`,
    [siteKey]
  )
  return rows.length > 0
}

/**
 * Whether a host was asked to provision the site that stands under `siteKey` NOW — a provision job
 * filed since its row was written. False when no row stands under the name.
 *
 * 🔒 JOBS OUTLIVE THEIR SITE, ROWS DO NOT. `job` has no foreign key to `site` and a delete keeps its
 * history, but a site row goes only after the host said the site is off it (`deleteTornDownSite`;
 * the claim sweep and the import-claim door only drop rows no job was ever filed for). So a job
 * older than the row in place — or with no row at all — belongs to a site that is gone, and must
 * not keep its name from being built again. Measured 09/10/2026 on dev: `e2e-em`, deleted, was
 * refused TAKEN for good because its old provision job was still on record.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} siteKey
 * @returns {Promise<boolean>}
 */
export async function provisionedInPlace(db, siteKey) {
  const { rows } = await db.query(
    `select 1 from job j join site s on s.site_key = j.site_key
      where j.site_key = $1 and j.kind = 'provision' and j.created_at >= s.created_at
      limit 1`,
    [siteKey]
  )
  return rows.length > 0
}

/** File a new job — `id` is `tracy-host`'s own id for the run it just accepted, not one minted
 * here, so a poll and the row it reads always agree on the name. */
export async function putJob(pool, { id, siteKey, host, kind }) {
  await pool.query(
    `insert into job (id, site_key, host, kind) values ($1, $2, $3, $4)
     on conflict (id) do nothing`,
    [id, siteKey, host, kind]
  )
}

/** Carry a poll's answer onto the row — `state`/`step`/`detail` only, and only the ones given
 * (`coalesce` keeps the rest as they were). `detail` is stored whole, the host's own answer body,
 * so a later read of the row is never missing something this file's callers did not think to
 * carry through as a named column.
 *
 * `ifUpdatedAt` (the `seen` a `quietJobs` row carries) pins the write to that reading: it lands only
 * on a row still open and not written since, so an answer fetched while someone else wrote a newer
 * one never goes over it, and an ended row is never moved back. Null then means nothing was written.
 * `opsSignal: false` writes the row without announcing a provision's ending (`site.result`/
 * `site.stuck`) — for an ending found long after it happened. */
export async function updateJob(pool, id, { state, step, detail, ifUpdatedAt, opsSignal = true } = {}) {
  const { rows } = await pool.query(
    `update job set
       state = coalesce($2, state),
       step = coalesce($3, step),
       detail = coalesce($4::jsonb, detail),
       updated_at = now()
     where id = $1
       and ($5::timestamptz is null or (updated_at = $5::timestamptz and state not in ('done', 'failed')))
     returning *`,
    [
      id,
      state ?? null,
      step ?? null,
      detail !== undefined ? JSON.stringify(detail) : null,
      ifUpdatedAt ?? null
    ]
  )
  const job = rows[0]
  if (opsSignal && job?.kind === 'provision' && ['done', 'failed'].includes(state)) {
    try {
      const site = (
        await pool.query(
          'select s.platform, s.created_by, a.email from site s join account a on a.id = s.created_by where s.site_key = $1',
          [job.site_key]
        )
      ).rows[0]
      if (site)
        await opsFor(pool).record(state === 'done' ? 'site.result' : 'site.stuck', {
          email: site.email,
          accountId: site.created_by,
          siteKey: job.site_key,
          data: {
            outcome: 'done',
            step: 'build',
            reason: 'SITE_BUILD_FAILED',
            platform: site.platform,
            attempt: id,
            seconds: Math.max(0, (Date.now() - job.created_at.getTime()) / 1000)
          },
          dedupeKey: `provision-result:${id}`
        })
    } catch {
      console.warn('[ops-signal] could not read provision result metadata')
    }
  }
  return job ?? null
}

/** A job by its id, or null — the "unknown job" case a poll door answers `JOB_UNKNOWN` for. */
export async function jobById(pool, id) {
  const { rows } = await pool.query('select * from job where id = $1', [id])
  return rows[0] ?? null
}

/**
 * How long ago a job was filed, in milliseconds, or null when there is no such job. Measured on the
 * database clock, the one that wrote `created_at`: this process's clock may be minutes off it.
 */
export async function jobAgeMs(pool, id) {
  const { rows } = await pool.query(
    'select (extract(epoch from now() - created_at) * 1000)::bigint as age_ms from job where id = $1',
    [id]
  )
  return rows[0] ? Number(rows[0].age_ms) : null
}

/**
 * The newest `kind` job of a site filed in the last `withinMs` that its row does not show ended, or
 * null. The row is only as fresh as the last poll: a door that stopped waiting left it running, so
 * the caller asks the host before trusting it. Measured on the database clock, as the row was filed.
 */
export async function openJobOfKind(pool, siteKey, kind, withinMs) {
  const { rows } = await pool.query(
    `select * from job
      where site_key = $1 and kind = $2 and state not in ('done', 'failed')
        and created_at > now() - ($3::bigint * interval '1 millisecond')
      order by created_at desc
      limit 1`,
    [siteKey, kind, withinMs]
  )
  return rows[0] ?? null
}

/** The newest provision job of a site, or null — what `pairComponent` asks before minting. Only the
 * site standing under the name now: a deleted one's finished job must not pair a site still building. */
export async function latestProvisionJob(pool, siteKey) {
  const { rows } = await pool.query(
    `select j.id, j.host, j.state from job j join site s on s.site_key = j.site_key
      where j.site_key = $1 and j.kind = 'provision' and j.created_at >= s.created_at
     order by j.created_at desc limit 1`,
    [siteKey]
  )
  return rows[0] ?? null
}

/**
 * The `site_write` row a content write leaves beside its audit line (`046-site-turn.sql`), as SQL
 * that runs INSIDE the audit statement: one statement, so the Site changes tab never shows a write
 * the trail lacks, nor misses one the trail has. `null` → no write row (a read, or no site).
 * Parameters start at `$5`; the caller's first four are the audit row's. `action` defaults to the
 * audit line's (the Apply action); `/changed` names the tool instead.
 * `origin`: where the write came from when no turn or session says so (`094-site-write-origin.sql`):
 * `{kind: 'setup', ref: <run>}` or `{kind: 'api', ref: <key id>}` — set by the door, never by a caller.
 * @param {{ turnId?: string | null, sessionId?: string | null, outcome: 'ok' | 'refused' | 'unknown',
 *   target?: unknown, via: string, action?: string, origin?: { kind: 'setup' | 'api', ref: string } | null } | null} write
 */
function siteWriteClause(write) {
  if (write === null) return { sql: '', params: [] }
  return {
    sql: `, w as (insert into site_write (site_key, turn_id, session_id, actor, action, outcome, target, via,
                                          origin, origin_ref)
                  values ($3, $5, $6, $1, coalesce($10, $2), $7, $8::jsonb, $9, $11, $12))`,
    params: [
      write.turnId ?? null,
      write.sessionId ?? null,
      write.outcome,
      write.target === undefined || write.target === null ? null : JSON.stringify(write.target),
      write.via,
      write.action ?? null,
      write.origin?.kind ?? null,
      write.origin?.ref ?? null
    ]
  }
}

/** One line in the plain trail — evidence a write happened, not a log a person tails. `write`: see
 * {@link siteWriteClause}. */
export async function audit(pool, { actor = null, action, siteKey = null, detail = null, write = null }) {
  const extra = siteWriteClause(siteKey === null ? null : write)
  await pool.query(
    `with a as (insert into audit (actor, action, site_key, detail) values ($1, $2, $3, $4::jsonb))${extra.sql}
     select 1`,
    [actor, action, siteKey, detail !== null ? JSON.stringify(detail) : null, ...extra.params]
  )
}

/**
 * `audit` for a write that CHANGED the site, and the site's `last_write_at` (`040-site-last-write.sql`)
 * stamped with that row's own `at`, in one statement — so the stamp and the row can never disagree,
 * and neither exists without the other. Read back as `siteChangedAt` (`comments.js`). The row's
 * `detail.sessionId` goes to `last_write_session` (`043-site-last-write-session.sql`) in the same
 * statement: which conversation that write was (null when it named none).
 * @param {import('pg').Pool} pool
 * @param {{ actor?: string | null, action: string, siteKey: string, detail?: unknown }} row
 * @returns {Promise<Date | null>} the stamp, or null when no site has that key.
 */
export async function auditSiteWrite(pool, { actor = null, action, siteKey, detail = null, write = null }) {
  const extra = siteWriteClause(write)
  const { rows } = await pool.query(
    `with row as (
       insert into audit (actor, action, site_key, detail) values ($1, $2, $3, $4::jsonb) returning at)${extra.sql}
     update site set last_write_at = (select at from row), last_write_session = $4::jsonb->>'sessionId'
      where site_key = $3
     returning last_write_at`,
    [actor, action, siteKey, detail !== null ? JSON.stringify(detail) : null, ...extra.params]
  )
  return rows[0]?.last_write_at ?? null
}

/**
 * The Apply calls one chat session made on one site, oldest first, as the audit trail recorded
 * them (`detail.sessionId`, written by the Apply door). What a chat turn cut off by a deploy had
 * already changed (#295), including a write that landed after the dsh process that asked for it
 * was gone: this app makes the write and records it, so the row exists either way.
 *
 * `actor`, when given, keeps the rows to that person's own calls. `since` is an inclusive lower
 * bound. Capped at 500 rows: one customer request is at most a few hundred writes.
 *
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, sessionId: string, since?: Date | null, actor?: string | null }} q
 */
export async function appliesOfSession(pool, { siteKey, sessionId, since = null, actor = null }) {
  const { rows } = await pool.query(
    `select at, actor, action, detail from audit
      where site_key = $1 and detail->>'sessionId' = $2
        and ($3::timestamptz is null or at >= $3)
        and ($4::text is null or actor = $4)
      order by at, id
      limit 500`,
    [siteKey, sessionId, since, actor]
  )
  return rows.map((row) => ({
    at: row.at,
    actor: row.actor,
    action: row.action,
    ok: row.detail?.ok === true,
    applyId: typeof row.detail?.apply_id === 'string' ? row.detail.apply_id : null
  }))
}

/**
 * Register a fresh component custody row (`003-component.sql`, ADR 0051). Ported from
 * `writeSiteComponent` (`workers/seat-registry/src/seats.js:1517`) — always an INSERT, never an
 * update: re-registering (a rotated token) is a NEW row, and the previous one is left in the
 * table as history rather than overwritten. `config` is `{endpoint, token}` — the only shape this
 * app ever writes; see `003-component.sql`'s note on the `door`-tagged rows it never writes.
 */
export async function writeComponent(pool, siteKey, config, createdBy) {
  const { rows } = await pool.query(
    'insert into site_component (site_key, config, created_by) values ($1, $2::jsonb, $3) returning *',
    [siteKey, JSON.stringify(config), createdBy]
  )
  return rows[0]
}

/**
 * The current component custody row for a site, or null when none was ever registered — the
 * normal state of every site that has not been through the handoff yet. "Current" is the newest
 * row with no `config.door` (`config->>'door' is null`), matching `siteComponent`'s own predicate
 * (`workers/seat-registry/src/seats.js:1457`, `!config?.door`) — this app never writes a
 * `door`-tagged row, but the filter is kept so a future one cannot silently become "the" row Apply
 * reads.
 */
export async function currentComponent(pool, siteKey) {
  const { rows } = await pool.query(
    `select * from site_component
     where site_key = $1 and config->>'door' is null
     order by created_at desc
     limit 1`,
    [siteKey]
  )
  return rows[0] ?? null
}

/**
 * The newest `door: 'content-api'` custody row of a site, or null: an EmDash site's read-only
 * Content API relay PAT (`pair-component.js`'s `emdashContentDoor`). A tagged row, so
 * `currentComponent` never mistakes it for a component that takes writes.
 */
export async function currentContentDoor(pool, siteKey) {
  const { rows } = await pool.query(
    `select * from site_component
     where site_key = $1 and config->>'door' = 'content-api'
     order by created_at desc
     limit 1`,
    [siteKey]
  )
  return rows[0] ?? null
}

/** The ring's cap — ported verbatim from `PREVIEW_ERRORS_MAX` (`workers/fleet-bar/src/index.js`). */
export const PREVIEW_ERRORS_MAX = 200

/**
 * Append fresh preview-error events for a site, then prune back to the newest
 * `PREVIEW_ERRORS_MAX` — ported from the Worker's KV ring (`sanitizePreviewErrors` plus a
 * `.slice(-PREVIEW_ERRORS_MAX)` on every write), but the trim happens in Postgres itself here
 * rather than in application code re-reading, re-slicing and re-writing a whole JSON blob.
 */
export async function appendPreviewErrors(pool, siteKey, events) {
  for (const e of events) {
    await pool.query(
      `insert into preview_error (site_key, tier, source, message, level, at)
       values ($1, $2, $3, $4, $5, $6)`,
      [siteKey, e.tier, e.source, e.message, e.level, new Date(e.at)]
    )
  }
  await pool.query(
    `delete from preview_error
     where site_key = $1
       and id not in (
         select id from preview_error where site_key = $1 order by created_at desc limit $2
       )`,
    [siteKey, PREVIEW_ERRORS_MAX]
  )
}

/** A site's held preview-error events, oldest first — the shape `GET /__tracy/errors` answers
 * (`{events: [...]}`). Ported from the Worker's plain KV read (`env.FLEET_SITES.get(key, 'json')`),
 * with no TTL filter needed here: the ring is capped by count (`appendPreviewErrors`' prune), not
 * by the KV row's `expirationTtl` — a site that stops reporting simply stops growing its ring. */
export async function previewErrorsFor(pool, siteKey) {
  const { rows } = await pool.query(
    'select tier, source, message, level, at from preview_error where site_key = $1 order by created_at asc',
    [siteKey]
  )
  return rows.map((r) => ({
    tier: r.tier,
    source: r.source,
    message: r.message,
    level: r.level,
    at: r.at.toISOString()
  }))
}

// ── One logical build per press (`009-site-creation.sql`) ─────────────────────────────────────

/**
 * Claim a logical build for an account. `on conflict do nothing`, and the row is read back either
 * way — so two requests with the same id racing each other both learn which of them holds the
 * claim, and the loser sees exactly what the winner has written so far.
 * @param {import('pg').Pool} pool
 * @param {{accountId: string, buildId: string, payloadHash: string}} input
 * @returns {Promise<{inserted: boolean, row: object}>}
 */
export async function claimCreation(pool, { accountId, buildId, payloadHash }) {
  const { rows: inserted } = await pool.query(
    `insert into site_creation (account_id, build_id, payload_hash) values ($1, $2, $3)
     on conflict (account_id, build_id) do nothing
     returning *`,
    [accountId, buildId, payloadHash]
  )
  if (inserted[0]) return { inserted: true, row: inserted[0] }
  const { rows } = await pool.query('select * from site_creation where account_id = $1 and build_id = $2', [
    accountId,
    buildId
  ])
  return { inserted: false, row: rows[0] }
}

/**
 * Carry what a claim has reached onto its row — only the fields given; `updated_at` moves every
 * time, which is what tells a stale claim (a request that died mid-way) from a live one.
 * @param {import('pg').Pool} pool
 * @param {{accountId: string, buildId: string}} key
 * @param {{state?: string, siteKey?: string|null, jobId?: string|null, attempt?: number}} fields
 * @returns {Promise<object|null>}
 */
export async function updateCreation(
  pool,
  { accountId, buildId },
  { state, siteKey, jobId, attempt, press, sessionId } = {}
) {
  const { rows } = await pool.query(
    `update site_creation set
       state = coalesce($3, state),
       site_key = coalesce($4, site_key),
       job_id = coalesce($5, job_id),
       attempt = coalesce($6, attempt),
       press = coalesce($7::jsonb, press),
       session_id = coalesce($8, session_id),
       updated_at = now()
     where account_id = $1 and build_id = $2
     returning *`,
    [
      accountId,
      buildId,
      state ?? null,
      siteKey ?? null,
      jobId ?? null,
      attempt ?? null,
      press === undefined || press === null ? null : JSON.stringify(press),
      sessionId ?? null
    ]
  )
  return rows[0] ?? null
}

/**
 * Creation rows whose site is built and whose build nobody has started — the sweep's own list.
 *
 * 🔒 THE THREE CONDITIONS ARE THE WHOLE SAFETY OF STARTING A BUILD FROM A SWEEP. `state = 'done'`
 * means the fleet finished the site, so there is something to dress. `press is not null` means a
 * customer actually pressed Build and these are their answers — a claimed site whose questions
 * were never answered has none, and must keep waiting for its owner rather than be built out of
 * nothing. `build_started_at is null` means nobody has started it yet, browser or sweep.
 *
 * @param {import('pg').Pool} pool
 * @param {number} [limit] a bounded batch, like every other sweep here.
 * @returns {Promise<object[]>}
 */
export async function unstartedBuilds(pool, limit = 20) {
  const { rows } = await pool.query(
    `select * from site_creation
      where state = 'done' and press is not null and build_started_at is null and site_key is not null
      order by updated_at asc
      limit $1`,
    [limit]
  )
  return rows
}

/**
 * Claim the right to start one build, and answer whether this caller got it.
 *
 * 🔒 IT IS A CLAIM, NOT A STAMP, AND THAT IS WHY IT IS ONE STATEMENT. `where build_started_at is
 * null` inside the update is what makes two replicas sweeping the same tick produce exactly one
 * build: the second update matches no row and answers false. Reading first and writing after would
 * be two builds on one site, which is worse than none — the stages are not written to meet
 * themselves.
 *
 * @returns {Promise<boolean>} true for the caller that may start it.
 */
/**
 * The newest press this account made for this site whose build has not started, or null — what a
 * Build form reads back when the tab that pressed is gone (`GET /api/sites/:key/press`).
 * @param {import('pg').Pool} pool
 * @param {{ accountId: string, siteKey: string }} who
 * @returns {Promise<{ press: object, job_id: string | null, state: string | null } | null>}
 */
export async function pendingPressFor(pool, { accountId, siteKey }) {
  const { rows } = await pool.query(
    `select press, job_id, state from site_creation
      where account_id = $1 and site_key = $2 and press is not null and build_started_at is null
      order by updated_at desc
      limit 1`,
    [accountId, siteKey]
  )
  return rows[0] ?? null
}

export async function claimBuildStart(pool, { accountId, buildId }) {
  const { rowCount } = await pool.query(
    `update site_creation set build_started_at = now(), updated_at = now()
      where account_id = $1 and build_id = $2 and build_started_at is null`,
    [accountId, buildId]
  )
  return rowCount === 1
}

/** Let the next sweep try again — a start that could not be delivered was not a start. */
export async function releaseBuildStart(pool, { accountId, buildId }) {
  await pool.query(
    `update site_creation set build_started_at = null, updated_at = now()
      where account_id = $1 and build_id = $2`,
    [accountId, buildId]
  )
}

/**
 * Record how a provision ENDED, found by the job it was running — the poll door and the sweep both
 * know the job id and neither knows whose build it was.
 *
 * Only a row still saying `provisioning` is moved: a build whose next attempt has already been
 * claimed must not be dragged back to the ending of the attempt before it.
 * @param {import('pg').Pool} pool
 * @param {string} jobId
 * @param {'done'|'failed'} state
 * @returns {Promise<object|null>} the row, or null when no row was waiting on that job.
 */
export async function settleCreationByJob(pool, jobId, state) {
  const { rows } = await pool.query(
    `update site_creation set state = $2, updated_at = now()
     where job_id = $1 and state = 'provisioning'
     returning *`,
    [jobId, state]
  )
  return rows[0] ?? null
}

/**
 * Every build still saying `provisioning` whose row has not moved for `staleMs` — the ones no tab
 * is polling any more. Newest first, and capped: a sweep asks the fleet once per row, and a host
 * that is down must not turn one tick into a thousand calls.
 * @param {import('pg').Pool} pool
 * @param {number} staleMs
 * @param {number} [limit]
 * @returns {Promise<Array<{account_id: string, build_id: string, job_id: string, site_key: string|null}>>}
 */
export async function stuckProvisions(pool, staleMs, limit = 20) {
  const { rows } = await pool.query(
    `select account_id, build_id, job_id, site_key from site_creation
     where state = 'provisioning' and job_id is not null
       and updated_at < now() - ($1::int * interval '1 millisecond')
     order by updated_at asc
     limit $2`,
    [staleMs, limit]
  )
  return rows
}

/**
 * Every job still `queued`/`running` on its row that nobody has written for `staleMs` — the ones
 * whose caller stopped asking the host: a door past its own deadline, a process restarted mid-poll,
 * a wizard closed. Only on `hosts` (the ones this process can still sign a call to): a row on any
 * other host can never be answered, so it is not listed at all.
 *
 * Oldest first, and capped at `limit`, since a sweep asks the host once per row. Oldest first is
 * what keeps a row nobody can answer from holding the window: the sweep touches it (`touchJob`),
 * which sends it to the back, and the rows behind it come up on the next pass.
 *
 * `seen` is the row's `updated_at` as Postgres prints it, to the microsecond — a JS `Date` would
 * keep milliseconds and never match it again — for `updateJob`'s and `touchJob`'s pin.
 *
 * A demo's jobs are not listed: the demo sweep owns them, and it ACTS on their endings (a removal
 * takes the demo away, a teardown asks for the new copy) — finding them by the very `queued`/
 * `running` a settle here would have overwritten (`unsettledDemoJobs`, `lib/demo-sites.js`).
 *
 * No index serves this (`job_site` is on `site_key`), so it reads the table once a minute. An index
 * on open rows would take a migration (`db/migrations/`); left out until the table is big enough to
 * show it.
 * @param {import('pg').Pool} pool
 * @param {number} staleMs
 * @param {string[]} hosts
 * @param {number} [limit]
 * @returns {Promise<Array<{id: string, host: string, seen: string}>>}
 */
export async function quietJobs(pool, staleMs, hosts, limit = 20) {
  if (hosts.length === 0) return []
  const { rows } = await pool.query(
    `select j.id, j.host, j.updated_at::text as seen from job j
     where j.state not in ('done', 'failed')
       and j.updated_at < now() - ($1::int * interval '1 millisecond')
       and j.host = any($2::text[])
       and not exists (select 1 from site s where s.site_key = j.site_key and s.demo)
     order by j.updated_at
     limit $3`,
    [staleMs, hosts, limit]
  )
  return rows
}

/**
 * Send a job row to the back of `quietJobs` without changing anything it says — for a row its host
 * gave no answer for (a 404, or no reply at all). Pinned like `updateJob`'s `ifUpdatedAt`: a row
 * written since `seen`, or ended, is left alone.
 * @param {import('pg').Pool} pool
 * @param {string} id
 * @param {string} seen
 */
export async function touchJob(pool, id, seen) {
  await pool.query(
    `update job set updated_at = now()
     where id = $1 and updated_at = $2::timestamptz and state not in ('done', 'failed')`,
    [id, seen]
  )
}

/**
 * Start a build again whose site was DELETED: its row kept the job it ran, and lost its site
 * (`site_key` is `on delete set null`). Without this, a press reusing the build id — every legacy
 * press for the same account and name shares one (`legacy:<siteKey>`) — was handed the deleted
 * site's job back as "reused", with no site key, and nothing was built. `attempt` is kept, so the
 * next attempt's `jobKey` is one the host has never seen. Atomic: of two requests, one gets the row.
 * @param {import('pg').Pool} pool
 * @param {{accountId: string, buildId: string}} key
 * @param {string} payloadHash - what THIS press asks for
 * @returns {Promise<object|null>} the row, now `claiming` with no job, or null when another took it.
 */
export async function restartDeletedCreation(pool, { accountId, buildId }, payloadHash) {
  const { rows } = await pool.query(
    `update site_creation set state = 'claiming', payload_hash = $3, job_id = null, press = null,
       session_id = null, build_started_at = null, updated_at = now()
     where account_id = $1 and build_id = $2 and job_id is not null and site_key is null
     returning *`,
    [accountId, buildId, payloadHash]
  )
  return rows[0] ?? null
}

/**
 * Take over a claim another request left behind: `claiming` for longer than `staleMs` with no
 * job, or `refused`. Atomic — the `where` is the guard — so of two requests finding the same
 * stale row, exactly one gets the row back and continues; the other keeps waiting.
 * @param {import('pg').Pool} pool
 * @param {{accountId: string, buildId: string}} key
 * @param {number} staleMs
 * @returns {Promise<object|null>} the row, now `claiming` again and freshly stamped, or null.
 */
export async function takeOverCreation(pool, { accountId, buildId }, staleMs) {
  const { rows } = await pool.query(
    `update site_creation set state = 'claiming', updated_at = now()
     where account_id = $1 and build_id = $2 and job_id is null
       and (state = 'refused' or updated_at < now() - ($3::int * interval '1 millisecond'))
     returning *`,
    [accountId, buildId, staleMs]
  )
  return rows[0] ?? null
}

/**
 * WHO IS WRITING THIS SITE — the lease, and the queue of whoever asked while it was held.
 *
 * Two chats on one site both reach the Apply door and both write. This turns the second one into an
 * answer. The rule the product owner set is "whoever arrived first goes first", and the honest shape
 * of that here is: the lease admits one writer at a time, and among those WAITING the earliest
 * arrival is admitted next.
 *
 * 🔒 ARRIVAL IS NOT THE SAME AS FIRST WRITE, and pretending otherwise was the first design's
 * mistake. A chat that spends two minutes reading before it writes arrived first and writes second.
 * `site_presence.first_at` is stamped on the session's FIRST apply of any class — reads included —
 * so the ticket exists before the write does. It is still not perfect: a session whose opening moves
 * are `page.text` and `content.find` never reaches the door at all (those are lane-local), so its
 * arrival is invisible until its first door call. That limit is stated in the refusal text rather
 * than hidden, because a queue that lies about its order is worse than one that explains itself.
 */

/** How long a holder may be silent before another session may take the lease from it. */
export const WRITE_LEASE_STALE_MS = 90_000
/** …and the ceiling on a holder that never goes silent, so a loop cannot hold a site for ever. */
export const WRITE_LEASE_CEILING_MS = 10 * 60_000
/** A presence row older than this is a past visit, not a place in today's queue. */
export const PRESENCE_EPISODE_MS = 15 * 60_000

/**
 * Note that this session touched this site, and return who else is here.
 *
 * Called on EVERY apply, read or write: arrival has to be recorded before the first write or the
 * queue orders by write time, which is the property this exists to replace.
 *
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, sessionId: string, actor: string|null }} who
 * @returns {Promise<Array<{session_id: string, actor: string|null, first_at: Date}>>} other live sessions.
 */
export async function notePresence(pool, { siteKey, sessionId, actor, preset = null }) {
  await pool.query(
    `insert into site_presence (site_key, session_id, actor, agent_preset)
     values ($1, $2, $3, $5)
     on conflict (site_key, session_id) do update
       set seen_at = now(),
           actor = coalesce(excluded.actor, site_presence.actor),
           -- coalesce, not a plain assignment: a lane on an older dsh image sends no preset, and
           -- forgetting what an earlier call knew would make the column flicker between a value
           -- and null depending on which image answered last.
           agent_preset = coalesce(excluded.agent_preset, site_presence.agent_preset),
           -- A session that has been away longer than one episode is arriving again, not still
           -- queued. Without this, a chat that touched the site last week outranks one that asked
           -- five minutes ago, and the FCFS rule reads as nonsense to the person waiting.
           first_at = case
             when site_presence.seen_at < now() - ($4::int * interval '1 millisecond') then now()
             else site_presence.first_at
           end`,
    [siteKey, sessionId, actor, PRESENCE_EPISODE_MS, preset]
  )
  const { rows } = await pool.query(
    `select session_id, actor, first_at from site_presence
      where site_key = $1 and session_id <> $2
        and seen_at > now() - ($3::int * interval '1 millisecond')
      order by first_at`,
    [siteKey, sessionId, PRESENCE_EPISODE_MS]
  )
  return rows
}

/**
 * Take the write lease, or learn who has it.
 *
 * 🔒 ONE STATEMENT, ONE ROW, AND POSTGRES DECIDES. `insert … on conflict (site_key) do update …
 * where <free or mine or stale or past the ceiling>` contends on a single row, so two racers in the
 * same millisecond are serialised by the row lock: exactly one gets a row back and the other gets
 * none. That is a decision, not a race. A draft keyed on (site_key, session_id) could not have this
 * property — each racer updated its own row and both believed they had won.
 *
 * 🔒 AND IT SAYS WHETHER IT OPENED THE HOLD OR RENEWED ONE. `fresh` is false when the caller
 * already held the lease, and the Apply door needs that distinction to know whether it may give the
 * lease back after a refusal: a session mid-request has more writes coming, and releasing under it
 * lets the other chat into the middle of a half-applied change. `returning` cannot say this on its
 * own — the row comes back identical either way — so the pre-image is read in the same statement.
 *
 * 🔒 A NEWER CONVERSATION OF THE SAME ACCOUNT TAKES THE LEASE OVER. The lease keeps two DIFFERENT
 * people (or their agents) from interleaving writes; keyed on the conversation alone, it also
 * refused the same customer's fresh chat for 90 s after their previous chat's last write — measured
 * on the stand 29/09, every new conversation got `SITE_BUSY` from its own owner. So a live holder is
 * replaced when BOTH hold: the holder's actor is the caller's, and the caller ARRIVED later
 * (`site_presence.first_at`) — the newer conversation is the one the person is typing in. The older
 * one coming back is refused, because two chats of one person writing at once interleave exactly
 * as two people do. A seat key (`key:<id>`) is a script, not a conversation: it neither takes over
 * a chat nor is taken over by one. `takenOverFrom` names the replaced session so the door can audit
 * it; it is null for a first take, a renewal, and a take of a stale or ceilinged lease.
 *
 * 🔒 AND IT REMEMBERS THE LATEST CHAT TURN THAT WROTE UNDER IT (`turnId`, the `x-tracy-turn` value
 * `<root session>:<n>`, review Q3 20/10/2026), so {@link releaseWriteLease} can tell a late
 * turn-end release of turn N from the hold turn N+1 of the same conversation has just renewed. dsh
 * numbers a session's turns upward and restores the count on resume, so within one root session
 * `n` orders them; across root sessions nothing is compared. A new holder starts from its own turn;
 * a renewal keeps the highest `n` of the same root (writes may land out of order), takes the new root
 * when it differs, and keeps what it had when the call names no turn.
 *
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, sessionId: string, actor: string|null, turnId?: string|null }} who
 * @returns {Promise<{ ok: true, fresh: boolean, takenOverFrom: string|null } | { ok: false, holder: object, aheadOfYou: number, freeInMs: number|null }>}
 */
export async function takeWriteLease(pool, { siteKey, sessionId, actor, turnId = null }) {
  const turn = parseTurnId(turnId)
  const { rows } = await pool.query(
    // `prior` is read before the upsert writes, so it holds who had the lease as this call arrived —
    // the one fact `returning` cannot give back, since the row it returns is the new one either way.
    `with prior as (select holder_session, holder_actor, wrote_at, taken_at
                     from site_write_lease where site_key = $1)
     insert into site_write_lease (site_key, holder_session, holder_actor, taken_at, wrote_at, updated_at,
                                   holder_turn_root, holder_turn)
     values ($1, $2, $3, now(), now(), now(), $6, $7)
     on conflict (site_key) do update
       set holder_session = $2, holder_actor = $3,
           -- Keep the original taken_at when the holder is renewing, so the ceiling measures one
           -- continuous hold rather than restarting on every write.
           taken_at = case when site_write_lease.holder_session = $2 then site_write_lease.taken_at else now() end,
           -- The turn fence (see above). Both columns from one decision, so the pair never mixes a
           -- root with another root's number.
           holder_turn_root = case
             when site_write_lease.holder_session is distinct from $2 then $6
             when $6::text is null then site_write_lease.holder_turn_root
             else $6 end,
           holder_turn = case
             when site_write_lease.holder_session is distinct from $2 then $7
             when $6::text is null then site_write_lease.holder_turn
             when site_write_lease.holder_turn_root = $6 then greatest(site_write_lease.holder_turn, $7)
             else $7 end,
           wrote_at = now(), updated_at = now(),
           wanted_session = null, wanted_actor = null, wanted_at = null
       where site_write_lease.holder_session is null
          or site_write_lease.holder_session = $2
          -- Silent for a while: the holder's session is gone or stuck, and the site is not its
          -- property for ever. wrote_at, never seen_at — a holder that is only reading is not
          -- working, and letting reads renew a WRITE lease is how a chat holds a site by talking.
          or site_write_lease.wrote_at < now() - ($4::int * interval '1 millisecond')
          -- Never silent, but holding far too long: a retry loop renews for ever and the TTL never
          -- fires. Without a ceiling there is no bound at all on one customer blocking another.
          or (site_write_lease.taken_at < now() - ($5::int * interval '1 millisecond')
              -- A sync's first read can outlast the ceiling; it has its own bound (live-sync.js
              -- STUCK_MS) and renews every half minute while it runs. So does a Sync to live, whose
              -- preview runs a Sync from live first (live-push.js).
              and site_write_lease.holder_session !~ '^(sync|push):')
          -- The same account's NEWER conversation (see above). An unknown actor is nobody's, so it
          -- is excluded by name rather than by leaning on how SQL compares two nulls.
          or ($3::text is not null
              and site_write_lease.holder_actor = $3
              and $2 not like 'key:%'
              and site_write_lease.holder_session not like 'key:%'
              -- A Sync from live holds the site for the whole read, merge and restore: the account
              -- that pressed it opening a chat is not a newer conversation of the same work, and its
              -- write would land on a copy about to be replaced (simulator S5, 21/10/2026). A Sync to
              -- live the same: its changes are read off the copy while it runs.
              and site_write_lease.holder_session !~ '^(sync|push):'
              and (select first_at from site_presence where site_key = $1 and session_id = $2)
                > coalesce((select first_at from site_presence
                             where site_key = $1 and session_id = site_write_lease.holder_session),
                           '-infinity'::timestamptz))
     returning site_key,
       (select holder_session from prior) as was,
       -- A takeover is the one path that replaces a LIVE holder: another session, still inside both
       -- the stale window and the ceiling. Everything else is a first take, a renewal, or an expiry.
       (select holder_session from prior
         where holder_session is not null and holder_session <> $2
           and wrote_at >= now() - ($4::int * interval '1 millisecond')
           and taken_at >= now() - ($5::int * interval '1 millisecond')) as taken_from`,
    [
      siteKey,
      sessionId,
      actor,
      WRITE_LEASE_STALE_MS,
      WRITE_LEASE_CEILING_MS,
      turn?.sessionId ?? null,
      turn?.turn ?? null
    ]
  )
  if (rows.length > 0)
    return { ok: true, fresh: rows[0].was !== sessionId, takenOverFrom: rows[0].taken_from ?? null }

  // Refused. Record that this session wants it — but only if nobody earlier is already waiting, so
  // the ticket in the row is always the OLDEST waiter's — and say whether somebody IS waiting ahead.
  //
  // 🔒 A WAITER, NOT A VISITOR (acceptance v4, 30/09, `e2e-v4/send.md` SEND-v4-new-11). This used to
  // count every conversation seen on the site in the last fifteen minutes that arrived earlier —
  // readers, finished chats, even the holder itself — and the agent told a customer "4 requests
  // queued ahead of mine" when nobody was waiting at all. Only a refused write is a place in the
  // queue, and the row keeps exactly one: the oldest waiter's ticket, still fresh and earlier than
  // this session. So the answer is 0 or 1, and it is true.
  const { rows: ahead } = await pool.query(
    `select count(*)::int as n from site_write_lease l
      where l.site_key = $1 and l.wanted_session is not null and l.wanted_session <> $2
        and l.wanted_at > now() - ($3::int * interval '1 millisecond')
        and coalesce((select first_at from site_presence
                       where site_key = $1 and session_id = l.wanted_session), '-infinity'::timestamptz)
          < coalesce((select first_at from site_presence
                       where site_key = $1 and session_id = $2), now())`,
    [siteKey, sessionId, WRITE_LEASE_STALE_MS]
  )
  await pool.query(
    `update site_write_lease
        set wanted_session = $2, wanted_actor = $3, wanted_at = now(), updated_at = now()
      where site_key = $1
        and (wanted_at is null
             or wanted_session = $2
             or wanted_at < now() - ($4::int * interval '1 millisecond')
             or (select first_at from site_presence where site_key = $1 and session_id = $2)
                < (select first_at from site_presence where site_key = $1 and session_id = wanted_session))`,
    [siteKey, sessionId, actor, WRITE_LEASE_STALE_MS]
  )
  const { rows: held } = await pool.query(
    // The floor on the wait, straight from the holder's own clock: the lease frees one stale window
    // after its last WRITE. Computed in the database so it is the same clock the `where` above tested
    // against — a wait worked out from the app's clock can be negative on a machine a second behind,
    // and a negative wait read out to a customer is worse than no number at all.
    `select *, greatest(0, 1000 * extract(epoch from
        (wrote_at + ($2::int * interval '1 millisecond')) - now()))::int as free_in_ms
       from site_write_lease where site_key = $1`,
    [siteKey, WRITE_LEASE_STALE_MS]
  )
  return {
    ok: false,
    holder: held[0] ?? null,
    aheadOfYou: ahead[0]?.n ?? 0,
    freeInMs: held[0]?.free_in_ms ?? null
  }
}

/**
 * Give the lease back. Only the holder can, so a late release from a session that already lost it
 * cannot free the site under the person who took it. With `actor`, only when the holder is also that
 * person — the turn-end release door (`POST /api/sites/:key/lease/release`) names the session from a
 * header, and a seat must not free another person's hold by quoting its session id.
 *
 * 🔒 WITH `turnId`, ONLY A TURN NO OLDER THAN THE LATEST ONE THAT WROTE (review Q3, 20/10/2026). The
 * turn-end release of turn N is sent after N ends and may be retried for seconds; by then turn N+1
 * of the same conversation can have renewed the lease, and freeing it by session alone let another
 * chat into the middle of N+1's request. The condition sits in the same `update`, so a renewal and
 * a release cannot interleave between a check and a write. A release that names no turn, a lease
 * that recorded none, or a turn of another root session is judged as before: by session and actor.
 * @param {import('pg').Pool} pool @param {{ siteKey: string, sessionId: string, actor?: string|null, turnId?: string|null }} who
 * @returns {Promise<boolean>} whether a hold was given back.
 */
/**
 * The site's write lease passed from one holder to the next in one statement (a Sync to live's
 * `push:<id>` to the Sync from live after it, `sync:<id>`): no moment in which an Apply could take the
 * site between them. False when `from` no longer holds it.
 */
export async function handOverWriteLease(pool, { siteKey, from, to, actor }) {
  const { rowCount } = await pool.query(
    `update site_write_lease
        set holder_session = $3, holder_actor = $4, taken_at = now(), wrote_at = now(), updated_at = now(),
            holder_turn_root = null, holder_turn = null
      where site_key = $1 and holder_session = $2`,
    [siteKey, from, to, actor]
  )
  return (rowCount ?? 0) > 0
}

export async function releaseWriteLease(pool, { siteKey, sessionId, actor = null, turnId = null }) {
  const turn = parseTurnId(turnId)
  const { rowCount } = await pool.query(
    `update site_write_lease
        set holder_session = null, holder_actor = null, taken_at = null, updated_at = now(),
            holder_turn_root = null, holder_turn = null
      where site_key = $1 and holder_session = $2
        and ($3::text is null or holder_actor = $3)
        and ($4::text is null or holder_turn_root is null or holder_turn_root <> $4
             or holder_turn <= $5::int)`,
    [siteKey, sessionId, actor, turn?.sessionId ?? null, turn?.turn ?? null]
  )
  return (rowCount ?? 0) > 0
}
