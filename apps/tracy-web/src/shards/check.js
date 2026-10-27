/**
 * `POST /api/shards/:name/check` (docs/sre/2026-10-15-shard-beta-design.md §4.1, §5; review
 * amendment 8; docs/sre/hop-dong-cua-shard.md §7): a shard's heartbeat every minute, and the answer
 * its updater acts on. The heartbeat is read field by field — unknown fields are dropped, a value of
 * the wrong shape is null, nothing is ever a 400 — and kept on the shard's row; counts the shard
 * could not read mark it degraded; it closes the shard to new people at 90 % of its limit or after
 * three low-memory beats; a stale or failed backup and an update without its web images are told.
 * The answer names the tags the shard should run (its pin, the per-shard target set in /ops, or this
 * master's own), whether to hold — pinned, its schema ahead of this master's, a tag this master
 * cannot name, or no turn now (two others updating, or the shard backing off after a failure) — and,
 * when a turn is given, until when.
 */
import { IMAGE_TAG } from '../lib/shard-shapes.js'
import { MIN_MEMORY_MB, SILENT_AFTER_MS } from './pick.js'
import { closeShard, recordHeartbeat } from './store.js'

export const UPDATING_AT_ONCE = 2
export const GRANT_MS = 15 * 60_000
export const FULL_SHARE = 0.9
export const LOW_MEMORY_BEATS = 3
/** A backup older than this, or a failed one, is told (contract §7). */
export const BACKUP_STALE_MS = 36 * 60 * 60_000
/** How long a shard backs off after a failed update (contract §7): no turn is given meanwhile. */
export const BACKOFF_MS = 60 * 60_000
/** `pg_advisory_xact_lock` of the update turn (7_243_018 and 019 are the shard sweeps, `reconcile.js`). */
const GRANT_LOCK_ID = 7_243_020
const COMMIT = /^[0-9a-f]{7,40}$/
const MIGRATION = /^[0-9]{3}-[a-z0-9-]{1,120}\.sql$/

const text = (value, max) => (typeof value === 'string' && value !== '' ? value.slice(0, max) : null)
const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null)
const amount = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null)
const shaped = (value, shape) => (typeof value === 'string' && shape.test(value) ? value : null)
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null)

/**
 * The repositories the dsh image is pulled from (`build-dsh-image.yml` pushes to both): GHCR, and
 * the AWS ECR mirror `<account>.dkr.ecr.<region>.amazonaws.com/lab3-image/tracy-ai/tracy-dsh`. Both
 * stay accepted while hosts move between them (one environment at a time), so a master whose own
 * dsh runs from either still knows its tag. Group 1 is the tag.
 */
const DSH_IMAGE_REF =
  /^(?:ghcr\.io\/tracyhq|[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/lab3-image\/tracy-ai)\/tracy-dsh:([^:/@]+)$/

/**
 * The dsh tag in a `/_host/dsh-versions` answer: `image.tag` (what `/etc/tracy/host-dsh.env` claims)
 * when the host could read that file, else the tag of `container.image` (what docker runs). The
 * tracy-host container does not mount that env file (it holds secrets), so on a real master
 * `image.tag` is null and only the container names the tag; without this every shard was held at
 * `TAG_UNKNOWN` (tracy-dev, 19/10/2026). Another repository or a digest reference is no tag.
 */
export function dshTagOf(body) {
  const claimed = shaped(body?.image?.tag, IMAGE_TAG)
  if (claimed) return claimed
  const running = typeof body?.container?.image === 'string' ? body.container.image : ''
  const match = DSH_IMAGE_REF.exec(running)
  return match ? shaped(match[1], IMAGE_TAG) : null
}

/**
 * The heartbeat as kept: the fields of contract §7 and nothing else. Always a heartbeat — `sites` and
 * `mem_available_mb` may be null (the shard could not read its status), and so may anything sent in
 * the wrong shape.
 */
export function readHeartbeat(body) {
  const last = object(body.last_update)
  const backup = object(body.last_backup)
  return {
    app_tag: shaped(body.app_tag, IMAGE_TAG),
    dsh_tag: shaped(body.dsh_tag, IMAGE_TAG),
    source_commit: shaped(body.source_commit, COMMIT),
    migration_head: shaped(body.migration_head, MIGRATION),
    updater_version: text(body.updater_version, 40),
    sites: count(body.sites),
    mem_available_mb: amount(body.mem_available_mb),
    disk_free_mb: amount(body.disk_free_mb),
    load1: amount(body.load1),
    releases_read_at: text(body.releases_read_at, 40),
    accepting: typeof body.accepting === 'boolean' ? body.accepting : null,
    updating: body.updating === true,
    last_update: last
      ? {
          app_tag: shaped(last.app_tag, IMAGE_TAG),
          dsh_tag: shaped(last.dsh_tag, IMAGE_TAG),
          ok: last.ok === true,
          finished_at: text(last.finished_at, 40),
          log_tail: text(last.log_tail, 2000),
          web_images_missing: last.web_images_missing === true
        }
      : null,
    last_backup: backup ? { at: text(backup.at, 40), ok: backup.ok === true } : null
  }
}

/**
 * The tags this master runs, as the check door answers them (spec §5): the app's content tag and
 * the source commit from this process's env (`APP_IMAGE_TAG`, `TRACY_SOURCE_COMMIT`, as
 * `ops/release-checklist.js` reads them), the dsh tag from this master's OWN tracy-host
 * (`/_host/dsh-versions`, `dshTagOf`). The host is asked at most once per `ttlMs`; when it does not
 * answer, the last good tag stands and it is asked again after `retryMs`.
 */
export function masterTags({
  config,
  hostCall,
  env,
  fetchImpl = fetch,
  ttlMs = 10 * 60_000,
  retryMs = 60_000,
  now = Date.now
}) {
  const hostName = config?.hostName ?? config?.defaultHost ?? null
  let dsh = null
  let until = 0
  let pending = null
  async function dshTag() {
    if (!hostName || !hostCall || now() < until) return dsh
    pending ??= (async () => {
      let fresh = null
      try {
        const answer = await hostCall(config, hostName, '/dsh-versions', {}, { fetchImpl, timeoutMs: 20_000 })
        fresh = answer.ok ? dshTagOf(answer.body) : null
      } catch {
        fresh = null
      }
      if (fresh) dsh = fresh
      until = now() + (fresh ? ttlMs : retryMs)
    })().finally(() => {
      pending = null
    })
    await pending
    return dsh
  }
  return {
    async read() {
      return {
        appTag: shaped(env?.APP_IMAGE_TAG, IMAGE_TAG),
        dshTag: await dshTag(),
        sourceCommit: shaped(env?.TRACY_SOURCE_COMMIT, COMMIT)
      }
    }
  }
}

/** The last migration this master applied, in the order `migrate` applies them; read once (boot only). */
export function migrationHeadOf(pool) {
  let head
  return async () => {
    if (head === undefined)
      head =
        (await pool.query('select name from schema_migration')).rows
          .map((row) => row.name)
          .sort()
          .at(-1) ?? null
    return head
  }
}

export function shardCheck({ pool, signal = null, tags, masterHead, now = Date.now }) {
  /**
   * The update turn of `name` (contract §7: K = 2, a turn lapses fifteen minutes after it was given
   * unless the shard says it is updating). On its target: the turn is handed back. Already holding a
   * live turn, or updating now: kept (an `updating` beat renews it). Else a turn is given when fewer
   * than K others hold or use one. Answers when the turn ends, or null when there is none.
   * @returns {Promise<Date | null>}
   */
  async function turn(name, { onTarget, updating, at }) {
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock($1)', [GRANT_LOCK_ID])
      let grantedAt = null
      if (onTarget) await client.query('update shard set update_granted_at = null where name = $1', [name])
      else {
        const mine = (
          await client.query(
            `select update_granted_at > $3::timestamptz - $2::int * interval '1 millisecond' as live, update_granted_at
               from shard where name = $1`,
            [name, GRANT_MS, at]
          )
        ).rows[0]
        if (updating)
          grantedAt = (
            await client.query(
              'update shard set update_granted_at = $2 where name = $1 returning update_granted_at',
              [name, at]
            )
          ).rows[0].update_granted_at
        else if (mine?.live) grantedAt = mine.update_granted_at
        else {
          const { rows } = await client.query(
            `select count(*)::int as n from shard
              where name <> $1
                and ((last_heartbeat->>'updating' = 'true' and last_seen_at > $4::timestamptz - $2::int * interval '1 millisecond')
                  or update_granted_at > $4::timestamptz - $3::int * interval '1 millisecond')`,
            [name, SILENT_AFTER_MS, GRANT_MS, at]
          )
          if (rows[0].n < UPDATING_AT_ONCE)
            grantedAt = (
              await client.query(
                'update shard set update_granted_at = $2 where name = $1 returning update_granted_at',
                [name, at]
              )
            ).rows[0].update_granted_at
        }
      }
      await client.query('commit')
      return grantedAt ? new Date(new Date(grantedAt).getTime() + GRANT_MS) : null
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  /** The alerts a heartbeat can carry, each told once per its own key. */
  async function tell(shard, beat, row) {
    const last = beat.last_update
    const lastTag = last?.app_tag ?? last?.dsh_tag ?? null
    if (last && !last.ok && last.finished_at)
      await signal?.record('shard.update_failed', {
        data: { shard: shard.name, tag: lastTag, finished_at: last.finished_at },
        dedupeKey: `update:${shard.name}:${last.finished_at}`
      })
    if (last?.web_images_missing)
      await signal?.record('shard.web_images_missing', {
        data: { shard: shard.name, tag: lastTag },
        dedupeKey: `webimg:${shard.name}:${last.finished_at ?? 'unknown'}`
      })
    const backup = beat.last_backup
    const backupAt = backup?.at ? Date.parse(backup.at) : Number.NaN
    const stale = backup
      ? !backup.ok || !(now() - backupAt <= BACKUP_STALE_MS)
      : now() - new Date(row.created_at).getTime() > BACKUP_STALE_MS
    if (stale)
      await signal?.record('shard.backup_stale', {
        data: {
          shard: shard.name,
          at: backup?.at ?? 'never',
          result: backup && !backup.ok ? 'failed' : 'stale'
        },
        dedupeKey: `backup:${shard.name}:${backup?.at ?? 'never'}`
      })
  }

  async function handle(shard, body) {
    const beat = readHeartbeat(body)
    const unreadable = beat.sites === null || beat.mem_available_mb === null
    const row = await recordHeartbeat(pool, shard.name, beat, {
      lowMemoryMb: MIN_MEMORY_MB,
      degraded: unreadable,
      degradedMs: SILENT_AFTER_MS,
      now: now()
    })
    if (!row) return { status: 404, body: { code: 'SHARD_UNKNOWN' } }
    const closing =
      beat.sites !== null && beat.sites >= Math.ceil(row.max_sites * FULL_SHARE)
        ? 'FULL'
        : row.low_mem_beats >= LOW_MEMORY_BEATS
          ? 'LOW_MEMORY'
          : null
    if (closing && (await closeShard(pool, shard.name)))
      await signal?.record('shard.closed', {
        data: { shard: shard.name, reason: closing },
        dedupeKey: `closed:${shard.name}:${closing}:${row.last_seen_at.toISOString().slice(0, 13)}`
      })
    await tell(shard, beat, row)
    const pinned = Boolean(row.pinned_app_tag || row.pinned_dsh_tag)
    const master = await tags.read()
    const wanted = pinned
      ? {
          app_tag: row.pinned_app_tag ?? beat.app_tag,
          dsh_tag: row.pinned_dsh_tag ?? beat.dsh_tag,
          source_commit: null
        }
      : {
          app_tag: row.target_app_tag ?? master.appTag,
          dsh_tag: row.target_dsh_tag ?? master.dshTag,
          source_commit: row.target_app_tag ? null : master.sourceCommit
        }
    const answer = (hold, reason, until = null) => ({
      status: 200,
      body: { ...wanted, hold, reason, granted_until: until ? until.toISOString() : null }
    })
    if (pinned) return answer(true, 'PINNED')
    const head = await masterHead()
    if (beat.migration_head && head && beat.migration_head > head) return answer(true, 'MIGRATION_AHEAD')
    if (!wanted.app_tag || !wanted.dsh_tag) return answer(true, 'TAG_UNKNOWN')
    const onTarget = beat.app_tag === wanted.app_tag && beat.dsh_tag === wanted.dsh_tag
    const last = beat.last_update
    const backingOff =
      !onTarget && last && !last.ok && last.finished_at && now() - Date.parse(last.finished_at) < BACKOFF_MS
    if (backingOff) return answer(true, 'BUSY')
    const until = await turn(shard.name, { onTarget, updating: beat.updating, at: new Date(now()) })
    if (onTarget) return answer(false, null)
    return until ? answer(false, null, until) : answer(true, 'BUSY')
  }

  return { handle }
}
