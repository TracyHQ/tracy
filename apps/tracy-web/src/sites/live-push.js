/**
 * "Sync to live" (plan tasks/ke-hoach-sync-to-live.md): the Owner of an imported site sends the changes
 * the site agent made on Tracy's copy back to their live site, through the actions the live site's
 * Claude Cowork engine already has: content (`content.get/update/batch/delete`), files (`media.upload`,
 * `media.delete`, each checked by its bytes; a PHP file only with its own OK) and settings
 * (`site.identity`, `template.siteSettings`, options and theme mods). No raw row, no file outside the
 * engine's file doors; what cannot go is named in the preview.
 *
 *   preview  files a `site_push` row and the host's preview job: a Sync from live first (the base is
 *            the live site as it is now), then the changes copy − base, grouped. Answers at once.
 *   apply    the Owner confirms a preview (removals each ticked on their own): the host writes each
 *            change only where the live site still holds what the base held (CAS through
 *            `content.get`), skips the rest as a conflict, keeps what it overwrote, and syncs again.
 *   undo     puts back what the push overwrote, only where the live site still holds what the push
 *            wrote; a place the customer changed since is said, not overwritten.
 *   read     the newest row as it is now, read back from the host while a phase runs.
 *
 * 🔒 OWNER ONLY, AND A PERSON ONLY. The doors are the `lifecycle` toolset's (`route.js` pushDoor) and
 * take a browser session, never the agent's actor assertion or a seat key: no agent tool reaches them.
 * 🔒 THE LIVE TOKEN LEAVES THIS PROCESS ONLY FOR THE HOST'S JOB, in its body (`live-push-contract.js`
 * jobBody). It is never in a row, an answer, an audit line or a prompt.
 * 🔒 THE SITE'S WRITE LEASE IS THE PUSH'S WHILE A PHASE RUNS (`push:<id>`), the lease a Sync from live
 * and every chat write take: one excludes the others. Renewed on every read while the job runs,
 * released when it ends. A preview holds no lease while it waits for the Owner; the host's apply
 * refuses a copy that moved since its preview.
 */
import { randomUUID } from 'node:crypto'
import { audit, auditSiteWrite, releaseWriteLease, siteByKey, takeWriteLease } from './store.js'
import { SYNC_PLATFORMS, lastJson } from './live-sync.js'
import {
  PREVIEW_TTL_MS,
  PUSH_MAX_ITEMS,
  jobBody,
  previewOf,
  pushStageOf,
  resultOf,
  settledState,
  undoOf
} from './live-push-contract.js'

/** The platforms Sync to live writes to: those whose engine has the content actions, and Sync from live. */
export const PUSH_PLATFORMS = SYNC_PLATFORMS
/** A phase whose host job has said nothing for this long is failed by the next read. */
const STUCK_MS = 3 * 60 * 60_000

/** The session name of a push's write lease. */
const leaseOf = (id) => `push:${id}`

/**
 * @param {{ pool: import('pg').Pool, config: any, host: any, fetchImpl?: typeof fetch,
 *   sync: ReturnType<typeof import('./live-sync.js').liveSync>, now?: () => number,
 *   watchEveryMs?: number }} deps
 */
export function livePush({
  pool,
  config,
  host,
  fetchImpl = fetch,
  sync,
  now = Date.now,
  watchEveryMs = 30_000,
  resumeOnStart = false
}) {
  async function latest(siteKey) {
    const { rows } = await pool.query(
      'select * from site_push where site_key = $1 order by created_at desc limit 1',
      [siteKey]
    )
    return rows[0] ?? null
  }

  /** The newest push that reached the live site (its apply ran), or null. */
  async function lastPushed(siteKey) {
    const { rows } = await pool.query(
      `select * from site_push where site_key = $1 and phase in ('apply', 'undo')
        order by created_at desc limit 1`,
      [siteKey]
    )
    return rows[0] ?? null
  }

  async function update(id, patch) {
    const keys = Object.keys(patch)
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
    const { rows } = await pool.query(
      `update site_push set ${sets}, updated_at = now() where id = $1 returning *`,
      [id, ...keys.map((k) => (['preview', 'result', 'undo'].includes(k) ? json(patch[k]) : patch[k]))]
    )
    return rows[0]
  }

  async function hostJob(site, body) {
    const answer = await host.hostCall(
      config,
      site.host,
      '/site',
      { ...body, label: site.label },
      { fetchImpl }
    )
    if (!answer.ok || typeof answer.body?.jobId !== 'string') {
      return {
        error: `${answer.body?.code ?? 'FLEET_REFUSED'}${answer.body?.why ? `: ${answer.body.why}` : ''}`
      }
    }
    return { jobId: answer.body.jobId }
  }

  /** Why this site cannot push, in the dialog's words, or null. */
  async function unavailable(site) {
    if (site.origin !== 'migrated') return 'not-imported'
    if (!PUSH_PLATFORMS.has(site.platform)) return 'platform'
    if (!(await sync.connected(site))) return 'not-connected'
    return null
  }

  /** How long ago a row's `updated_at` was, on the database clock that wrote it (not this
   *  process's: a clock that differs would read every running row as stuck or none). */
  async function ageMs(at) {
    const { rows } = await pool.query(
      `select (extract(epoch from (now() - $1::timestamptz)) * 1000)::float8 as ms`,
      [at]
    )
    return Number(rows[0]?.ms ?? 0)
  }

  /** The refusal every phase shares: the site, a phase or a sync under way, the live door. */
  async function refusal(site) {
    if (site.origin !== 'migrated') return { refused: { code: 'PUSH_NOT_IMPORTED' }, status: 409 }
    if (!PUSH_PLATFORMS.has(site.platform))
      return { refused: { code: 'PUSH_UNSUPPORTED_PLATFORM', platform: site.platform }, status: 409 }
    // Any row of the site: the undo of an older push runs on that row, not the newest.
    const { rows: under } = await pool.query(
      `select * from site_push where site_key = $1 and state = 'running' order by updated_at desc limit 1`,
      [site.site_key]
    )
    const running = under[0]
    if (running && (await ageMs(running.updated_at)) < STUCK_MS)
      return { refused: { code: 'PUSH_RUNNING', pushId: running.id }, status: 409 }
    const syncing = await sync.latest(site.site_key)
    if (syncing?.state === 'running' && (await ageMs(syncing.updated_at)) < sync.stuckMs)
      return { refused: { code: 'PUSH_SYNC_RUNNING', syncId: syncing.id }, status: 409 }
    return null
  }

  /** The live door, the copy's own token first (a copy still holding the live one gets its own). */
  async function liveDoor(site, email) {
    const live = await sync.liveCredential(site)
    if (live.why) return { refused: { code: 'PUSH_NO_LIVE_DOOR', why: live.why }, status: 409 }
    const own = await sync.ensureCopyToken(site, live.cred, email)
    if (!own.ok) return { refused: { code: 'PUSH_COPY_TOKEN', why: own.why }, status: 502 }
    const again = await sync.liveCredential(site)
    return {
      endpoint: again.endpoint,
      token: again.token,
      // The live site as the import found it: the first sync the preview runs compares with it, as a
      // Sync from live does (`live-sync.js` start).
      baseFingerprint: again.cred?.config?.importFingerprint ?? null
    }
  }

  async function lease(site, id, email) {
    const taken = await takeWriteLease(pool, {
      siteKey: site.site_key,
      sessionId: leaseOf(id),
      actor: email ?? 'push'
    })
    return taken.ok
      ? null
      : { refused: { code: 'PUSH_SITE_BUSY', holder: taken.holder?.holder_actor ?? null }, status: 409 }
  }
  const release = (site, id) => releaseWriteLease(pool, { siteKey: site.site_key, sessionId: leaseOf(id) })

  /** Start a preview: the host syncs from live, then lists the copy's changes against it. */
  async function preview(site, { email, name }) {
    const no = await refusal(site)
    if (no) return no
    const id = randomUUID()
    const busy = await lease(site, id, email)
    if (busy) return busy
    const door = await liveDoor(site, email)
    if (door.refused) {
      await release(site, id)
      return door
    }
    const started = await hostJob(site, jobBody('preview', { id, ...door, byEmail: email, byName: name }))
    if (started.error) {
      await release(site, id)
      return { refused: { code: 'PUSH_HOST_REFUSED', why: started.error }, status: 502 }
    }
    await audit(pool, {
      actor: email ?? null,
      action: 'site.push.preview',
      siteKey: site.site_key,
      detail: { pushId: id }
    })
    const { rows } = await pool.query(
      `insert into site_push (id, site_key, state, phase, step, host_job, created_by)
       values ($1, $2, 'running', 'preview', 'starting', $3, $4) returning *`,
      [id, site.site_key, started.jobId, email ?? null]
    )
    watch(site, id)
    return { row: view(rows[0], { now: now() }) }
  }

  /**
   * Push a preview. `deletes`: the Owner ticked the preview's removals; without it none is pushed
   * (the host answers them `skipped: deletes-not-confirmed`). `php`: the same for its PHP files
   * (`skipped: php-not-confirmed`), each linted for the live site's PHP before it was offered.
   */
  async function apply(site, { previewId, deletes = false, php = false, email, name }) {
    const no = await refusal(site)
    if (no) return no
    const newest = await latest(site.site_key)
    if (!newest || newest.id !== previewId) {
      const { rows } = await pool.query('select id from site_push where id = $1 and site_key = $2', [
        previewId,
        site.site_key
      ])
      return rows.length
        ? { refused: { code: 'PREVIEW_SUPERSEDED' }, status: 409 }
        : { refused: { code: 'PREVIEW_UNKNOWN' }, status: 404 }
    }
    if (newest.state !== 'previewed')
      return { refused: { code: 'PREVIEW_NOT_READY', state: newest.state }, status: 409 }
    if (expired(newest, now())) return { refused: { code: 'PREVIEW_EXPIRED' }, status: 409 }
    // Counted over the whole changeset (`pushable`), not the items the answer lists. Over the host's
    // limit is not refused: it writes the first ones and leaves the rest for the next push.
    const { pushable } = previewOf(newest.preview)
    const count =
      pushable.add +
      pushable.change +
      pushable.files +
      pushable.settings +
      (deletes ? pushable.remove : 0) +
      (php ? pushable.php : 0)
    if (count === 0) return { refused: { code: 'PUSH_NOTHING' }, status: 409 }
    const busy = await lease(site, previewId, email)
    if (busy) return busy
    const door = await liveDoor(site, email)
    if (door.refused) {
      await release(site, previewId)
      return door
    }
    // Claimed before the job, so a second press (another tab) finds it running, not previewed.
    const { rows: claimed } = await pool.query(
      `update site_push set state = 'running', phase = 'apply', step = 'starting', deletes = $2,
              pushed_by = $3, error = null, updated_at = now()
        where id = $1 and state = 'previewed' returning *`,
      [previewId, deletes === true, email ?? null]
    )
    if (!claimed.length) {
      await release(site, previewId)
      return { refused: { code: 'PUSH_RUNNING', pushId: previewId }, status: 409 }
    }
    const started = await hostJob(
      site,
      jobBody('apply', { id: previewId, ...door, deletes, php, byEmail: email, byName: name })
    )
    if (started.error) {
      await release(site, previewId)
      await update(previewId, { state: 'previewed', phase: 'preview', step: null })
      return { refused: { code: 'PUSH_HOST_REFUSED', why: started.error }, status: 502 }
    }
    await audit(pool, {
      actor: email ?? null,
      action: 'site.push',
      siteKey: site.site_key,
      detail: { pushId: previewId, changes: count, deletes: deletes === true, php: php === true }
    })
    watch(site, previewId)
    return {
      row: view(await update(previewId, { host_job: started.jobId }), { now: now(), undoable: false })
    }
  }

  /** Undo the newest push: what it overwrote goes back, where the live site still holds its writes. */
  async function undo(site, { pushId, email, name }) {
    const no = await refusal(site)
    if (no) return no
    const row = await lastPushed(site.site_key)
    if (!row || row.id !== pushId) {
      const { rows } = await pool.query('select id from site_push where id = $1 and site_key = $2', [
        pushId,
        site.site_key
      ])
      return rows.length
        ? { refused: { code: 'PUSH_NOT_UNDOABLE', why: 'not-newest' }, status: 409 }
        : { refused: { code: 'PUSH_UNKNOWN' }, status: 404 }
    }
    if (!undoableRow(row)) return { refused: { code: 'PUSH_NOT_UNDOABLE', why: row.state }, status: 409 }
    const busy = await lease(site, pushId, email)
    if (busy) return busy
    const door = await liveDoor(site, email)
    if (door.refused) {
      await release(site, pushId)
      return door
    }
    const prior = row.state
    const { rows: claimed } = await pool.query(
      `update site_push set state = 'running', phase = 'undo', step = 'starting', undone_by = $3,
              undo_error = null, updated_at = now()
        where id = $1 and state = $2 returning *`,
      [pushId, prior, email ?? null]
    )
    if (!claimed.length) {
      await release(site, pushId)
      return { refused: { code: 'PUSH_RUNNING', pushId }, status: 409 }
    }
    const started = await hostJob(
      site,
      jobBody('undo', { id: pushId, ...door, byEmail: email, byName: name })
    )
    if (started.error) {
      await release(site, pushId)
      await update(pushId, { state: prior, step: null })
      return { refused: { code: 'PUSH_HOST_REFUSED', why: started.error }, status: 502 }
    }
    await audit(pool, {
      actor: email ?? null,
      action: 'site.push.undo',
      siteKey: site.site_key,
      detail: { pushId }
    })
    watch(site, pushId)
    return { row: view(await update(pushId, { host_job: started.jobId }), { now: now(), undoable: false }) }
  }

  /** Read every half minute until the phase ends, whether or not the dialog is open (as live-sync.js). */
  function watch(site, id) {
    if (!watchEveryMs) return
    const tick = async () => {
      let again = watchEveryMs
      try {
        const v = await read(site)
        const mine = [v.latest, v.lastPush].find((r) => r?.id === id)
        if (!mine || mine.state !== 'running') return
      } catch {
        again = watchEveryMs * 2
      }
      setTimeout(tick, again).unref?.()
    }
    setTimeout(tick, watchEveryMs).unref?.()
  }

  /** A running row read back from the host: its step while it runs, its answer once it ended. */
  async function settle(site, row) {
    if (row.state !== 'running') return row
    const polled = await host.hostJob(config, site.host, row.host_job, { fetchImpl })
    const job = polled.ok ? polled.body : null
    if (!job) {
      if ((await ageMs(row.updated_at)) > STUCK_MS) {
        await release(site, row.id)
        return ended(site, row, { state: 'failed', error: 'PUSH_LOST' })
      }
      return row
    }
    if (job.state === 'running' || job.state === 'queued') {
      await takeWriteLease(pool, {
        siteKey: site.site_key,
        sessionId: leaseOf(row.id),
        actor: row.created_by ?? 'push'
      })
      const lines = Array.isArray(job.progress) ? job.progress : String(job.output ?? '').split('\n')
      const step = lines
        .map((l) => /^==> \[\d+s\] (.+)$/.exec(String(l))?.[1])
        .filter(Boolean)
        .findLast((s) => pushStageOf(s))
      const stage = step ? pushStageOf(step) : null
      return stage && stage !== row.step ? update(row.id, { step: stage }) : row
    }
    // A job that ended with no answer of its own still said why in its progress
    // (`==> [Ns] <phase> stopped: CODE: why`, webroot-live-push.sh `said_stop`): kept as its answer.
    const said = lastJson(job.output) ?? stoppedAnswer(job)
    // Writes done and their Sync from live left to tracy-web (`sync: {state: 'later'}`): the lease goes
    // on to that sync (`recordSync`), never back to the agent in between.
    if (!(job.state === 'done' && said?.ok === true && said?.sync?.state === 'later'))
      await release(site, row.id)
    if (job.state === 'failed' && job.orphanedAt != null)
      return ended(site, row, { state: 'failed', error: 'PUSH_INTERRUPTED', said })
    if (job.state !== 'done' || !said)
      return ended(site, row, { state: 'failed', error: said?.code ?? 'PUSH_JOB_FAILED', said })
    // A preview whose Sync from live held records is `held`, not failed (contract §5 SYNC_NEEDS_ATTENTION).
    const settled = settledState(row.phase, said)
    if (!settled) return ended(site, row, { state: 'failed', error: said.code ?? 'PUSH_FAILED', said })
    return ended(site, row, { state: settled, said })
  }

  /** Record the end of a row's phase, its audit line and, for a push or its undo, its Site changes row. */
  async function ended(site, row, { state, error = null, said = null }) {
    const actor =
      row.phase === 'undo' ? row.undone_by : row.phase === 'apply' ? row.pushed_by : row.created_by
    await recordSync(site, row, said, actor)
    if (row.phase === 'preview') {
      const settled = ['previewed', 'held'].includes(state) ? state : 'failed'
      await audit(pool, {
        actor,
        action: `site.push.preview.${settled}`,
        siteKey: site.site_key,
        detail: {
          pushId: row.id,
          ...(settled === 'failed'
            ? {
                error: error ?? 'PUSH_PREVIEW_FAILED',
                ...(failureDetailOf(said) ? { why: failureDetailOf(said) } : {})
              }
            : counts(previewOf(said)))
        }
      })
      return update(row.id, {
        state: settled,
        step: null,
        preview: said,
        error: settled === 'failed' ? (error ?? said?.code ?? 'PUSH_PREVIEW_FAILED') : null,
        expires_at: settled === 'previewed' ? new Date(now() + PREVIEW_TTL_MS) : null
      })
    }
    if (row.phase === 'apply') {
      const result = resultOf(said)
      // Failed after some writes reached the live site: those are recorded, and the push can be undone.
      const settled = state === 'pushed' ? 'pushed' : 'failed'
      const detail = {
        pushId: row.id,
        pushed: result.pushed.length,
        conflicts: result.conflicts.length,
        failed: result.failed.length,
        skipped: result.skipped.length,
        ...(settled === 'failed'
          ? {
              error: error ?? 'PUSH_NOT_APPLIED',
              ...(failureDetailOf(said) ? { why: failureDetailOf(said) } : {})
            }
          : {})
      }
      await audit(pool, { actor, action: `site.push.${settled}`, siteKey: site.site_key, detail })
      if (result.pushed.length > 0) await operation(site, row, 'sync-to-live', actor, detail)
      return update(row.id, {
        state: settled,
        step: null,
        result: said,
        pushed_at: new Date(now()),
        error: settled === 'failed' ? (error ?? said?.code ?? 'PUSH_NOT_APPLIED') : null
      })
    }
    // Undo: an undo that did not finish leaves the push as it was, and says why.
    const back = undoOf(said)
    if (state !== 'undone') {
      await audit(pool, {
        actor,
        action: 'site.push.undo.failed',
        siteKey: site.site_key,
        detail: {
          pushId: row.id,
          error: error ?? 'UNDO_FAILED',
          ...(failureDetailOf(said) ? { why: failureDetailOf(said) } : {})
        }
      })
      // An apply that failed part way keeps its error; the undo's claim did not clear it.
      const prior = row.error ? 'failed' : 'pushed'
      return update(row.id, {
        state: prior,
        step: null,
        undo: said,
        undo_error: error ?? said?.code ?? 'UNDO_FAILED'
      })
    }
    const detail = {
      pushId: row.id,
      restored: back.restored.length,
      conflicts: back.conflicts.length,
      failed: back.failed.length
    }
    await audit(pool, { actor, action: 'site.push.undone', siteKey: site.site_key, detail })
    if (back.restored.length > 0) await operation(site, row, 'sync-to-live-undo', actor, detail)
    return update(row.id, { state: 'undone', step: null, undo: said, undone_at: new Date(now()) })
  }

  /**
   * The Sync from live the host ran inside a phase (before a preview, after an apply or an undo), as
   * an ordinary `site_sync` row with `origin = 'push'`: the Sync from live dialog then says when the
   * live site was last read and what is held, as it would after its own press. An applied sync that
   * changed the copy stamps the site's last write, as `live-sync.js` does.
   */
  async function recordSync(site, row, said, actor) {
    const s = said?.sync
    if (!s || typeof s !== 'object' || Array.isArray(s)) return
    // A push that wrote nothing ran no sync (contract §3 `{"ok":true,"state":"skipped"}`): no row. Filed
    // as a failed sync, it became the site's newest one and Sync from live read "failed" (dev, 26/10/2026).
    if (s.ok !== false && s.state === 'skipped') return
    // The writes are in and the Owner has the answer; the Sync from live that takes them in as the base
    // runs now as an ordinary sync, the push's lease handed to it. Refused (the copy's token could not
    // be set): the lease goes back, and the next sync or preview takes the pushed places in the same way
    // (`sync/pushed.json`).
    if (s.ok !== false && s.state === 'later') {
      const started = await sync.start(site, {
        email: actor ?? undefined,
        name: actor ?? undefined,
        handOver: leaseOf(row.id)
      })
      if (!started?.row) await release(site, row.id)
      return
    }
    const state =
      s.ok === false
        ? 'failed'
        : s.state === 'applied'
          ? 'applied'
          : ['needs_resolution', 'needs_attention'].includes(s.state)
            ? 'needs_resolution'
            : 'failed'
    const answer = syncAnswerOf(s, row.id)
    // The host's own sync id when it gives one: a held sync's Sync anyway can then resume from its run.
    const id = typeof s.syncId === 'string' && SYNC_ROW_ID.test(s.syncId) ? s.syncId : randomUUID()
    const liveReadAt = s.liveReadAt ?? said.liveReadAt ?? null
    const { rows } = await pool.query(
      `insert into site_sync (id, site_key, state, step, host_job, answer, error, live_read_at, created_by, origin)
       values ($1, $2, $3, null, $4, $5::jsonb, $6, $7, $8, 'push')
       on conflict (id) do nothing returning id`,
      [
        id,
        site.site_key,
        state,
        row.host_job ?? null,
        json(answer),
        state === 'failed' ? String(s.code ?? 'SYNC_FAILED').slice(0, 80) : null,
        liveReadAt,
        actor ?? null
      ]
    )
    if (!rows.length) return
    const detail = { syncId: id, pushId: row.id, phase: row.phase, origin: 'push', state }
    if (state === 'applied' && !s.unchanged)
      await auditSiteWrite(pool, { actor, action: 'site.sync.applied', siteKey: site.site_key, detail })
    else
      await audit(pool, {
        actor,
        action: s.unchanged && state === 'applied' ? 'site.sync.unchanged' : `site.sync.${state}`,
        siteKey: site.site_key,
        detail
      })
  }

  /**
   * The Site changes row of a push or its undo: a succeeded `site_operation` (`activity-source.js`
   * reads these two actions as `site-changes`). It names counts, never a value of the site.
   */
  async function operation(site, row, action, actor, detail) {
    await pool.query(
      `insert into site_operation (site_key, action, scope, actor_email, status, job_id, finished_at)
       values ($1, $2, $3::jsonb, $4, 'succeeded', $5, now())`,
      [site.site_key, action, JSON.stringify(detail), actor ?? null, row.host_job ?? null]
    )
  }

  /** What `GET /push` answers: the newest row, and the newest push when that is an older row. */
  async function read(site) {
    let row = await latest(site.site_key)
    if (row) row = await settle(site, row)
    let pushed = await lastPushed(site.site_key)
    if (pushed && row && pushed.id === row.id) pushed = row
    else if (pushed) pushed = await settle(site, pushed)
    const newestPush = pushed?.id ?? null
    const at = now()
    return {
      latest: row ? view(row, { now: at, undoable: row.id === newestPush && undoableRow(row) }) : null,
      lastPush:
        pushed && (!row || pushed.id !== row.id)
          ? view(pushed, { now: at, undoable: undoableRow(pushed) })
          : null
    }
  }

  /**
   * After a restart, every push still running is read back from its host job at once, then watched
   * again: the read renews the site's write lease while the job runs (stale after 90 s with nobody
   * renewing it, the chat could write while the job still did, #123) and releases it, or settles the
   * row, once the job has ended or is lost. Only the process that serves the doors does this
   * (`resumeOnStart`); the cron's instance does not.
   */
  async function resume() {
    const { rows } = await pool.query(`select id, site_key from site_push where state = 'running'`)
    for (const row of rows) {
      const site = await siteByKey(pool, row.site_key)
      if (!site) continue
      try {
        await read(site)
      } catch {
        // the host does not answer yet: the watch below asks again
      }
      watch(site, row.id)
    }
    return rows.length
  }

  if (resumeOnStart) setTimeout(() => void resume().catch(() => {}), 0).unref?.()
  return { preview, apply, undo, read, latest, unavailable, resume }
}

/**
 * The answer a job that printed none still gave in its progress: its last `<phase> stopped: CODE: why`
 * step, as `{ok: false, code, detail}` — or null.
 */
export function stoppedAnswer(job) {
  const lines = Array.isArray(job?.progress) ? job.progress : String(job?.output ?? '').split('\n')
  const line = lines
    .map((l) => /^==> \[\d+s\] (?:preview|apply|undo) stopped: ([A-Z0-9_]+)(?::\s*(.+))?$/.exec(String(l)))
    .filter(Boolean)
    .at(-1)
  if (!line) return null
  return { ok: false, code: line[1], ...(line[2] ? { detail: line[2].slice(0, 400) } : {}) }
}

/**
 * Why a failed phase stopped, in one line with no value of the site: the answer's `detail`
 * (lib/live_sync.py `failure_line`, live-write.mjs), or the inner Sync from live's code and detail when
 * that is what stopped it. Null when the answer said nothing more than its code.
 */
export function failureDetailOf(said) {
  if (!said || typeof said !== 'object' || said.ok !== false) return null
  const sync = said.sync && typeof said.sync === 'object' && said.sync.ok === false ? said.sync : null
  const why =
    typeof said.detail === 'string' && said.detail
      ? said.detail
      : sync
        ? [sync.code, sync.detail].filter((x) => typeof x === 'string' && x).join(': ')
        : ''
  return why ? why.slice(0, 400) : null
}

/** A `site_sync` row id (uuid). */
const SYNC_ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * A push's inner sync as a `site_sync` answer `live-sync.js` view() reads: its summary's files,
 * database and backup at the top, and `kept`/`held`/`renumbered` only as lists (the host may send
 * them as counts, which view() cannot walk; the counts stay under `counts`).
 */
export function syncAnswerOf(s, pushId) {
  const summary = s.summary && typeof s.summary === 'object' ? s.summary : {}
  const out = { ...s, ...summary, pushId }
  delete out.summary
  const counts = {}
  for (const k of ['kept', 'held', 'renumbered', 'conflicts']) {
    if (out[k] !== undefined && !Array.isArray(out[k])) {
      if (typeof out[k] === 'number') counts[k] = out[k]
      delete out[k]
    }
  }
  if (Object.keys(counts).length) out.counts = counts
  if (out.version === undefined && Number.isSafeInteger(summary.backup)) out.version = summary.backup
  if (out.timing && (typeof out.timing !== 'object' || !Array.isArray(out.timing.steps))) delete out.timing
  return out
}

/** jsonb refuses a NUL in a string (as `live-sync.js` update). */
const json = (value) =>
  JSON.stringify(value ?? null, (_k, v) => (typeof v === 'string' ? v.replaceAll('\0', '�') : v))

// Totals over the whole changeset, not the capped lists the answer carries.
const counts = (p) => ({
  ...p.pushable,
  unsupported: p.unsupportedTotal,
  liveChanged: p.liveChangedTotal
})

/** A preview past its time. */
function expired(row, at) {
  return row.state === 'previewed' && row.expires_at != null && new Date(row.expires_at).getTime() <= at
}

/** A push whose writes reached the live site and have not been undone. */
function undoableRow(row) {
  if (!['pushed', 'failed'].includes(row.state) || row.phase === 'preview') return false
  return resultOf(row.result).pushed.length > 0
}

/** A push row as a client sees it: no token, no address, no value of the site but titles. */
export function view(row, { now = Date.now(), undoable = false } = {}) {
  const preview = row.preview ? previewOf(row.preview) : null
  return {
    id: row.id,
    state: row.state === 'previewed' && expired(row, now) ? 'expired' : row.state,
    phase: row.phase,
    step: row.step ?? null,
    error: row.error ?? null,
    // Why it stopped (the host's answer, kept on the row: `preview`, `result` or `undo`).
    errorDetail: row.error
      ? failureDetailOf(row.phase === 'preview' ? row.preview : row.phase === 'apply' ? row.result : null)
      : null,
    undoError: row.undo_error ?? null,
    undoErrorDetail: row.undo_error ? failureDetailOf(row.undo) : null,
    startedAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    startedBy: row.created_by ?? null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    pushedAt: row.pushed_at ? new Date(row.pushed_at).toISOString() : null,
    undoneAt: row.undone_at ? new Date(row.undone_at).toISOString() : null,
    preview,
    deletes: row.deletes === true,
    result: row.result ? resultOf(row.result) : null,
    undo: row.undo ? undoOf(row.undo) : null,
    undoable,
    maxItems: preview?.limit ?? PUSH_MAX_ITEMS
  }
}
