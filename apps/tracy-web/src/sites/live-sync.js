/**
 * "Sync from live" for an imported site (plan tasks/ke-hoach-dong-bo-tu-live.md): what the customer
 * changed on their live site comes into the copy Tracy edits, and what Tracy changed stays — so the
 * ZIP the customer downloads at handover holds both.
 *
 *   start      files a `site_sync` row and the host's `webroot-sync` job, which reads the live site
 *              through its Claude Cowork door, merges it with the copy and puts the result in place
 *              through Restore everything (a "Before restore" point is the way back). Answers at
 *              once; the job goes on.
 *   read       the row as it is now, read back from the host while the job runs.
 *
 * Where both sites changed one place differently, the copy — Tracy's work — wins (20/10/2026:
 * "on a conflict, Tracy's site wins"). Nobody is asked: the host lists each such place as
 * `kept`, and the row shows them, so what the live site changed there is said, not lost.
 *
 * 🔒 THE LIVE TOKEN LEAVES THIS PROCESS ONLY FOR THE HOST'S JOB, in its body, and the host passes it
 * to the script in the environment (`webroot.js`). It is never in a row, an answer or a prompt.
 * 🔒 THE SITE'S WRITE LEASE IS THE SYNC'S WHILE IT RUNS (`sync:<id>`, the lease every Apply takes): an
 * agent's write through the Apply door meanwhile is told someone is writing, rather than landing on
 * a copy about to be replaced. Taken again on every read while the job runs (a lease is stale after
 * a minute and a half without a write), released when it ends. Writes that bypass the door (the
 * agent's shell) are what the host's COPY_CHANGED check is for.
 * 🔒 A COPY THAT STILL HOLDS THE LIVE TOKEN gets its own before its first sync (`ensureCopyToken`):
 * the agent on the copy can read its database.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import {
  audit,
  auditSiteWrite,
  handOverWriteLease,
  releaseWriteLease,
  siteByKey,
  takeWriteLease
} from './store.js'

/**
 * The platforms whose adapter passed the merge's cases (plan §4): Joomla, and WordPress with its address
 * rewrite and table rules (fleet `lib/live_sync_wordpress.py`). EmDash has no import.
 */
export const SYNC_PLATFORMS = new Set(['joomla', 'wordpress'])
/**
 * How long the host keeps the live site's last read (its whole database: users, orders) after the
 * site's last sync. Past it the sweep has the host delete it (`forget`); a later sync reads afresh.
 */
export const FORGET_AFTER_DAYS = 30
/** A sync whose host job has said nothing for this long is failed by the next read. */
const STUCK_MS = 3 * 60 * 60_000

/**
 * @param {{ pool: import('pg').Pool, config: any, host: any, fetchImpl?: typeof fetch,
 *   currentComponent: Function, writeComponent: Function, now?: () => number }} deps
 */
export function liveSync({
  pool,
  config,
  host,
  fetchImpl = fetch,
  currentComponent,
  writeComponent,
  now = Date.now,
  watchEveryMs = 30_000,
  resumeOnStart = false
}) {
  /** The live door and token of an imported, paired site, or why there is none. */
  async function liveCredential(site) {
    const cred = await currentComponent(pool, site.site_key)
    const c = cred?.config
    if (!c?.liveEndpoint) return { why: 'NOT_PAIRED' }
    return { cred, endpoint: c.liveEndpoint, token: c.liveToken ?? c.token }
  }

  async function latest(siteKey) {
    const { rows } = await pool.query(
      'select * from site_sync where site_key = $1 order by created_at desc limit 1',
      [siteKey]
    )
    return rows[0] ?? null
  }

  // Postgres jsonb refuses a NUL in a string ("unsupported Unicode escape sequence"): a host answer
  // quoting a PHP-serialized value carried one, and the sync's row could not be written (23/10/2026).
  const noNul = (_key, value) => (typeof value === 'string' ? value.replaceAll('\0', '\uFFFD') : value)
  async function update(id, patch) {
    const keys = Object.keys(patch)
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
    const { rows } = await pool.query(
      `update site_sync set ${sets}, updated_at = now() where id = $1 returning *`,
      [
        id,
        ...keys.map((k) => (k === 'answer' || k === 'decisions' ? JSON.stringify(patch[k], noNul) : patch[k]))
      ]
    )
    return rows[0]
  }

  async function hostJob(site, input) {
    const answer = await host.hostCall(
      config,
      site.host,
      '/site',
      { ...input, label: site.label },
      { fetchImpl }
    )
    if (!answer.ok || typeof answer.body?.jobId !== 'string') {
      return {
        error: `${answer.body?.code ?? 'FLEET_REFUSED'}${answer.body?.why ? `: ${answer.body.why}` : ''}`
      }
    }
    return { jobId: answer.body.jobId }
  }

  /** A copy whose token is the live one gets its own, written by the host, before anything else. */
  async function ensureCopyToken(site, cred, email) {
    const c = cred.config
    if (c.liveToken && c.liveToken !== c.token) return { ok: true }
    const copyToken = randomBytes(24).toString('hex')
    const started = await hostJob(site, { kind: 'webroot-sync-copy-token', syncId: randomUUID(), copyToken })
    if (started.error) return { ok: false, why: started.error }
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500))
      const polled = await host.hostJob(config, site.host, started.jobId, { fetchImpl })
      const state = polled.body?.state
      if (state === 'failed') return { ok: false, why: 'COPY_TOKEN_FAILED' }
      if (state !== 'done') continue
      const said = lastJson(polled.body.output)
      if (!said?.ok) return { ok: false, why: said?.code ?? 'COPY_TOKEN_FAILED' }
      await writeComponent(
        pool,
        site.site_key,
        { ...c, token: copyToken, liveToken: c.liveToken ?? c.token },
        email
      )
      return { ok: true }
    }
    return { ok: false, why: 'COPY_TOKEN_TIMEOUT' }
  }

  /**
   * Start a sync of `site`. `allowHeld`: a person saw the live records the last sync held (new on
   * both sites in a table the merge cannot number again) and said to go on keeping the copy's.
   * `handOver`: the write lease this sync takes from its holder (a Sync to live that just wrote,
   * `push:<id>`), so nothing writes the copy between the two.
   */
  async function start(site, { email, name, allowHeld = false, handOver = null }) {
    if (site.origin !== 'migrated') return { refused: { code: 'SYNC_NOT_IMPORTED' }, status: 409 }
    if (!SYNC_PLATFORMS.has(site.platform))
      return { refused: { code: 'SYNC_UNSUPPORTED_PLATFORM', platform: site.platform }, status: 409 }
    const running = await latest(site.site_key)
    if (running?.state === 'running' && now() - new Date(running.updated_at).getTime() < STUCK_MS) {
      return { refused: { code: 'SYNC_RUNNING', syncId: running.id }, status: 409 }
    }
    const live = await liveCredential(site)
    if (live.why) return { refused: { code: 'SYNC_NO_LIVE_DOOR', why: live.why }, status: 409 }
    const id = randomUUID()
    const handed =
      handOver &&
      (await handOverWriteLease(pool, {
        siteKey: site.site_key,
        from: handOver,
        to: `sync:${id}`,
        actor: email ?? 'sync'
      }))
    const lease = handed
      ? { ok: true }
      : await takeWriteLease(pool, {
          siteKey: site.site_key,
          sessionId: `sync:${id}`,
          actor: email ?? 'sync'
        })
    if (!lease.ok)
      return { refused: { code: 'SYNC_SITE_BUSY', holder: lease.holder?.holder_actor ?? null }, status: 409 }
    const own = await ensureCopyToken(site, live.cred, email)
    if (!own.ok) {
      await releaseWriteLease(pool, { siteKey: site.site_key, sessionId: `sync:${id}` })
      return { refused: { code: 'SYNC_COPY_TOKEN', why: own.why }, status: 502 }
    }

    const started = await hostJob(site, {
      kind: 'webroot-sync',
      syncId: id,
      endpoint: live.endpoint,
      token: live.token,
      // The live site as the import found it: a first sync with nothing changed since answers at once.
      ...(live.cred.config.importFingerprint ? { baseFingerprint: live.cred.config.importFingerprint } : {}),
      ...(allowHeld ? { allowHeld: true } : {}),
      // The held sync this Sync anyway goes on from: the host takes its read and merge when the live
      // site and the copy did not move since, instead of doing both again (#1649).
      // Not a held sync a Sync to live ran, unless the host named it by its own run (`live-push.js`
      // recordSync): its run folder is the push's, not one this id names.
      ...(allowHeld &&
      running?.state === 'needs_resolution' &&
      (running.answer?.held ?? []).length &&
      (running.origin !== 'push' || running.answer?.syncId === running.id)
        ? { resumeSyncId: running.id }
        : {}),
      ...(email ? { byEmail: email, byName: name || email } : {})
    })
    if (started.error) {
      await releaseWriteLease(pool, { siteKey: site.site_key, sessionId: `sync:${id}` })
      return { refused: { code: 'SYNC_HOST_REFUSED', why: started.error }, status: 502 }
    }
    // Who pressed, on which site, when: the audit line of the sync (no value of the site in it).
    await audit(pool, {
      actor: email ?? null,
      action: 'site.sync',
      siteKey: site.site_key,
      detail: { syncId: id, allowHeld }
    })
    const { rows } = await pool.query(
      `insert into site_sync (id, site_key, state, step, host_job, created_by)
       values ($1, $2, 'running', 'webroot-sync', $3, $4) returning *`,
      [id, site.site_key, started.jobId, email ?? null]
    )
    watch(site, id)
    return { row: view(rows[0]) }
  }

  /**
   * Read the sync back every half minute until it ends, whether or not anyone has the dialog open:
   * each read renews the site's write lease (stale after 90 s without one) and the last one
   * releases it and records the result. A restart loses this loop; the lease then goes stale and
   * the next read finishes the row.
   */
  function watch(site, id) {
    if (!watchEveryMs) return
    const tick = async () => {
      let again = watchEveryMs
      try {
        const v = await read(site)
        if (!v || v.id !== id || v.state !== 'running') return
      } catch {
        again = watchEveryMs * 2
      }
      setTimeout(tick, again).unref?.()
    }
    setTimeout(tick, watchEveryMs).unref?.()
  }

  /**
   * The lease of a running sync, renewed on every read of it, whether the host answered or not: read
   * back by a tracy-web that restarted while the host was unreachable, it went stale at 90 s and a
   * chat's write was accepted mid-sync (#224). Another holder that took it in such a window is named in
   * the audit log; the next read asks again.
   */
  async function keepLease(site, row) {
    const kept = await takeWriteLease(pool, {
      siteKey: site.site_key,
      sessionId: `sync:${row.id}`,
      actor: row.created_by ?? 'sync'
    })
    if (!kept.ok)
      await audit(pool, {
        actor: null,
        action: 'site.sync.lease_held_by_other',
        siteKey: site.site_key,
        detail: { syncId: row.id, holder: kept.holder?.holder_session ?? null }
      })
    return kept.ok
  }

  async function dbAgeMs(at) {
    const { rows } = await pool.query(
      `select (extract(epoch from (now() - $1::timestamptz)) * 1000)::float8 as ms`,
      [at]
    )
    return Number(rows[0]?.ms ?? 0)
  }

  /** The newest sync of a site, read back from the host while it runs. */
  async function read(site) {
    const row = await latest(site.site_key)
    if (!row) return null
    if (row.state !== 'running') return view(row)
    const polled = await host.hostJob(config, site.host, row.host_job, { fetchImpl })
    const job = polled.ok ? polled.body : null
    if (!job) {
      // The row's age by the database's clock, the clock that stamped it (live-push.js `ageMs`).
      if ((await dbAgeMs(row.updated_at)) > STUCK_MS)
        return view(await update(row.id, { state: 'failed', error: 'SYNC_LOST' }))
      // The host did not answer: the sync may still be restoring there, so the site stays the sync's (#224).
      await keepLease(site, row)
      return view(row)
    }
    if (job.state === 'running' || job.state === 'queued') {
      await keepLease(site, row)
      // The step and the time so far, from the lines the host keeps while the job runs (#1649): the
      // row said `starting` with no timing for a whole 26-minute sync.
      const timing = Array.isArray(job.progress) ? timingOf(job.progress.join('\n')) : null
      const stage = timing?.steps.findLast((s) => s.stage)?.stage
      const step = stage ? `webroot-sync:${stage}` : (job.step ?? row.step)
      const patch = {}
      if (step && step !== row.step) patch.step = step
      if (timing && JSON.stringify(timing) !== JSON.stringify(row.answer?.timing ?? null))
        patch.answer = { ...row.answer, timing }
      return Object.keys(patch).length ? view(await update(row.id, patch)) : view(row)
    }
    await releaseWriteLease(pool, { siteKey: site.site_key, sessionId: `sync:${row.id}` })
    const found = lastJson(job.output)
    // Where its time went, kept with the answer: a slow sync is read back from the row, not the host.
    // From the progress the host kept as it came when there is some: the output's last 200 lines
    // may have lost the first steps of a long run.
    const progress = Array.isArray(job.progress) && job.progress.length ? job.progress.join('\n') : null
    const said = found ? { ...found, timing: timingOf(progress ?? job.output) } : found
    // The host restarted under the job — a deploy replaced it (`orphanJobs`): the sync was cut off,
    // not refused, and the next press puts right what an apply left half done (`webroot-sync.sh`
    // `recover_apply`). Said as that, not as a failure nobody can explain (#1563).
    if (job.state === 'failed' && job.orphanedAt != null) {
      return view(await update(row.id, { state: 'failed', error: 'SYNC_INTERRUPTED', answer: said ?? null }))
    }
    if (job.state !== 'done' || !said) {
      return view(
        await update(row.id, {
          state: 'failed',
          error: failedCode(said, 'SYNC_JOB_FAILED'),
          answer: said ?? null
        })
      )
    }
    if (said.ok === false)
      return view(
        await update(row.id, { state: 'failed', error: failedCode(said, 'SYNC_FAILED'), answer: said })
      )
    // `needs_attention` (records held) is stored as `needs_resolution`: nothing was applied, and the
    // row's `held` says what for.
    // Applied, but a tree the merge took rows into was not rebuilt (or the cache not cleared): the
    // copy holds the records with the wrong lft/rgt, so the sync is failed, not applied — the
    // "Before restore" point is the way back (a menu rebuild that threw unseen, 20/10/2026).
    const after = said.apply?.after ?? {}
    const afterFailed = /:failed|^failed$/.test(String(after.rebuild ?? '')) || after.cache === 'failed'
    const state = afterFailed
      ? 'failed'
      : said.state === 'applied'
        ? 'applied'
        : ['needs_resolution', 'needs_attention'].includes(said.state)
          ? 'needs_resolution'
          : 'failed'
    const result = {
      syncId: row.id,
      state,
      backup: said.apply?.version ?? null,
      kept: (said.kept ?? []).length,
      held: (said.held ?? []).length,
      renumbered: (said.renumbered ?? []).length
    }
    // Applied: the site changed — the audit line also stamps its last write (`auditSiteWrite`). An
    // unchanged live site (`webroot-sync.sh` answer_unchanged) wrote nothing on the copy: audited only.
    if (state === 'applied' && !said.unchanged)
      await auditSiteWrite(pool, {
        actor: row.created_by,
        action: 'site.sync.applied',
        siteKey: site.site_key,
        detail: result
      })
    else
      await audit(pool, {
        actor: row.created_by,
        action: said.unchanged && state === 'applied' ? 'site.sync.unchanged' : `site.sync.${state}`,
        siteKey: site.site_key,
        detail: result
      })
    return view(
      await update(row.id, {
        state,
        step: null,
        answer: said,
        live_read_at: said.liveReadAt ?? null,
        error:
          state === 'failed'
            ? afterFailed
              ? 'SYNC_AFTER_FAILED'
              : (said.apply?.code ?? 'SYNC_NOT_APPLIED')
            : null
      })
    )
  }

  /**
   * The hourly sweep: every site whose newest sync is older than FORGET_AFTER_DAYS, and not yet
   * forgotten, has the host delete the live site's data it keeps. Answers how many it asked.
   */
  async function forgetStale() {
    const { rows } = await pool.query(
      // The age is measured on the database clock that wrote `updated_at`, not on this process's.
      `select distinct on (y.site_key) y.id, y.site_key, y.forgotten_at, s.host, s.label,
              y.updated_at < now() - make_interval(days => $1) as stale
         from site_sync y join site s on s.site_key = y.site_key
        order by y.site_key, y.created_at desc`,
      [FORGET_AFTER_DAYS]
    )
    let asked = 0
    for (const row of rows) {
      if (row.forgotten_at || !row.stale) continue
      const started = await hostJob(row, { kind: 'webroot-sync-forget', syncId: randomUUID() })
      if (started.error) continue
      await pool.query('update site_sync set forgotten_at = now() where id = $1', [row.id])
      await audit(pool, {
        actor: null,
        action: 'site.sync.forgotten',
        siteKey: row.site_key,
        detail: { syncId: row.id }
      })
      asked++
    }
    return asked
  }

  /** Whether this site holds a door and token to its live original (imports before 20/10 may not). */
  async function connected(site) {
    return !(await liveCredential(site)).why
  }

  // Sync to live (`live-push.js`) runs a Sync from live first, so it gives the copy its own token
  // the same way and reads the live door from the same place.
  /**
   * After a restart, every sync still running is read back from its host job at once, then watched
   * again: the read renews the site's write lease while the job runs (stale after 90 s with nobody
   * renewing it, the chat could write while the job still did, #123) and releases it, or settles the
   * row, once the job has ended or is lost. Only the process that serves the doors does this
   * (`resumeOnStart`); the cron's instance does not.
   */
  async function resume() {
    const { rows } = await pool.query(`select id, site_key from site_sync where state = 'running'`)
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
  return {
    start,
    read,
    latest,
    forgetStale,
    connected,
    ensureCopyToken,
    liveCredential,
    resume,
    stuckMs: STUCK_MS
  }
}

/**
 * The stage of the dialog a step of webroot-sync.sh belongs to (`tracy-my-sites` live-sync-panel
 * STAGES), or null for a step outside them (settling a sync a restart cut off).
 */
const STAGE_OF = [
  [/^(reading the live site|the live site (read|moved)|the held sync's read)/, 'reading'],
  [/^(\d+ table\(s\) differ|putting the result in place|restored;)/, 'applying'],
  [
    /^(waiting for another site|the copy|the live read|base:|files merged|merging the databases|making the backup point|the held sync's merge|keeping the read|db merge:|the live site's address moved|the merge leaves the copy as it is)/,
    'merging'
  ]
]
/** @param {string} step */
export function stageOf(step) {
  return STAGE_OF.find(([re]) => re.test(step))?.[1] ?? null
}

/**
 * Where a sync's time went, from its host job's output: the `==> [Ns] step` lines webroot-sync.sh
 * prints, each with its stage (`stageOf`), and the live read's own timing (live-pull's answer line).
 * At most 40 steps.
 * @param {unknown} output
 * @returns {{ steps: { at: number, step: string, stage: string | null }[], read: { mode: string | null, seconds: number | null, parts: object | null } | null }}
 */
export function timingOf(output) {
  const lines = String(output ?? '').split('\n')
  const steps = []
  for (const line of lines) {
    const m = /^==> \[(\d+)s\] (.+)$/.exec(line)
    if (m && steps.length < 40) {
      const step = m[2].slice(0, 120)
      steps.push({ at: Number(m[1]), step, stage: stageOf(step) })
    }
  }
  let read = null
  for (const line of lines) {
    // Parsed, never matched by its first bytes: the script prints Python's `json.dumps` form
    // (`{"ok": true, …}`), and a prefix match kept every row's `read` null.
    if (!line.startsWith('{') || !line.includes('"liveReadAt"')) continue
    try {
      const r = JSON.parse(line)
      // The read's own line (live-pull): its timing, and no sync state of its own.
      if (r?.ok !== true || !r.timing || typeof r.timing !== 'object' || r.state !== undefined) continue
      read = {
        mode: typeof r.mode === 'string' ? r.mode : r.unchanged ? 'unchanged' : null,
        seconds: typeof r.seconds === 'number' ? r.seconds : null,
        parts: r.timing && typeof r.timing === 'object' ? r.timing : null
      }
    } catch {
      // Not the read's line after all.
    }
  }
  return { steps, read }
}

/**
 * The code a refused or failed sync is filed under. A read that found the live site still changing
 * is `LIVE_BUSY` even from a host whose script still wraps every failed read as `LIVE_READ_FAILED`
 * (#1564): the owner is told to try again when the site is quiet, not that it could not be read.
 */
function failedCode(said, fallback) {
  if (
    said?.code === 'LIVE_READ_FAILED' &&
    [
      'LIVE_BUSY',
      'LIVE_BLOCKED',
      'LIVE_PASSWORD_PROTECTED',
      'LIVE_PHP_TOO_OLD',
      'LIVE_RATE_LIMITED',
      'TOKEN_REFUSED'
    ].includes(said.read?.code)
  )
    return said.read.code
  return said?.code ?? fallback
}

/**
 * The last JSON line of a host job's output — the live read's own timing line aside (webroot-sync.sh
 * prints it as progress): a script that stopped after the read answered nothing, not that.
 */
export function lastJson(output) {
  const lines = String(output ?? '')
    .trim()
    .split('\n')
    .reverse()
  for (const line of lines) {
    if (!line.startsWith('{')) continue
    try {
      const said = JSON.parse(line)
      if (said?.liveReadAt !== undefined && said.timing !== undefined && said.state === undefined) continue
      return said
    } catch {
      /* not this one */
    }
  }
  return null
}

/** Every conflict of a sync's answer that its decisions have not closed, one per decidable id. */
export function openConflicts(row) {
  const decided = row?.decisions ?? {}
  const out = []
  for (const c of row?.answer?.conflicts ?? []) {
    if (c.kind === 'settings') {
      for (const s of c.settings ?? []) if (!decided[s.id]) out.push({ ...s, kind: 'setting', path: c.path })
    } else if (!decided[c.id]) out.push(c)
  }
  return out
}

/** What the browser is shown of one conflict or kept place: no draft blobs, values cut short. */
function brief(c) {
  const out = { id: c.id, kind: c.kind, reason: c.reason ?? null }
  for (const k of ['path', 'setting', 'table', 'column', 'key']) if (c[k] !== undefined) out[k] = c[k]
  // A JSON column merged key by key: the keys both sites changed, where Tracy's stayed (`live_sync.py`).
  if (Array.isArray(c.fields)) out.fields = c.fields.slice(0, 20).map(String)
  // … and each of them with both values, cut short by the host (#1648).
  if (Array.isArray(c.fieldValues))
    out.fieldValues = c.fieldValues.slice(0, 20).map((f) => ({
      path: String(f?.path ?? ''),
      ours: f?.ours == null ? null : String(f.ours).slice(0, 200),
      theirs: f?.theirs == null ? null : String(f.theirs).slice(0, 200)
    }))
  if (c.kind === 'setting') Object.assign(out, { base: c.base, ours: c.ours, theirs: c.theirs })
  // A list of siblings both sites reordered (a menu): each side's order, by the items' names.
  if (c.kind === 'order')
    for (const side of ['base', 'ours', 'theirs'])
      out[side] = Array.isArray(c[side]) ? c[side].slice(0, 30).map(String) : null
  if (c.values) out.values = c.values
  // A held live record's own rows the merge left out with it (its category, images…), named by
  // table and key (`live_sync.py` `name_held_rows`): what the dialog says went with it.
  if (Array.isArray(c.belonging)) {
    out.belonging = c.belonging.slice(0, 50).map((b) => ({
      table: String(b?.table ?? ''),
      key: b?.key ?? null,
      // A row the copy had that the live site pointed at the held record: the copy's version stayed.
      ...(b?.changed === true ? { changed: true } : {})
    }))
    out.belongingCount = typeof c.belongingCount === 'number' ? c.belongingCount : out.belonging.length
  }
  return out
}

/**
 * The kept places of an answer, one per thing a person can read: configuration.php's clashes come
 * one per setting (a host before #1648 listed them as the file, which read "deleted" on both sides).
 */
function keptPlaces(answer) {
  const out = []
  for (const c of answer?.kept ?? []) {
    if (c.kind === 'settings')
      for (const s of c.settings ?? []) out.push({ ...s, kind: 'setting', path: s.path ?? c.path })
    else out.push(c)
  }
  return out
}

/**
 * The live site's content records an applied sync did not bring into the copy, each with why: the
 * held ones a person said to go on without ("Sync anyway", #1648). Log rows the merge skipped are
 * not content: they stay in the answer (`skipped`), not in this list.
 */
function droppedRecords(row) {
  if (row.state !== 'applied') return []
  const answer = row.answer ?? {}
  return (answer.held ?? []).map((h) => ({
    ...brief(h),
    points_at: h.points_at ?? null,
    live: h.live ?? null,
    rows: h.rows ?? null
  }))
}

/**
 * The part of a site a table holds, by its name without the site's prefix (WordPress and Joomla
 * alike): what the dialog names when the live site kept changing while it was read.
 */
const PART_OF_TABLE = {
  content: [
    'posts',
    'postmeta',
    'terms',
    'termmeta',
    'term_taxonomy',
    'term_relationships',
    'links',
    'content',
    'categories',
    'menu',
    'menu_types',
    'modules',
    'modules_menu',
    'tags',
    'contentitem_tag_map',
    'fields',
    'fields_values',
    'fields_groups',
    'content_frontpage',
    'workflow_associations',
    'ucm_content'
  ],
  settings: ['options', 'extensions', 'template_styles', 'assets', 'languages'],
  users: ['users', 'usermeta', 'user_usergroup_map', 'usergroups', 'user_profiles', 'user_notes'],
  comments: ['comments', 'commentmeta']
}
/** @param {string} table */
export function partOfTable(table) {
  for (const [part, names] of Object.entries(PART_OF_TABLE))
    if (names.some((n) => table === n || table.endsWith(`_${n}`))) return part
  return 'other'
}

/**
 * What kept changing on the live site when a read stopped on LIVE_BUSY (live-pull's `moved`, under
 * the host's `read`): the parts of the site (`partOfTable`, and `files`), the tables with how many of
 * their rows moved and the names of those rows (an option's or a meta row's name), a few file paths
 * — cut short, never a value of the site — or null when the host said nothing of it.
 * @returns {{ parts: string[], tables: { table: string, rows: number | null, names: string[] }[], files: string[], detail: string | null } | null}
 */
export function busyOf(answer) {
  const said = [answer?.read, answer].find((a) => a?.code === 'LIVE_BUSY') ?? null
  if (!said) return null
  const moved = said.moved && typeof said.moved === 'object' ? said.moved : {}
  const tables = (Array.isArray(moved.tables) ? moved.tables : [])
    .filter((t) => typeof t?.table === 'string')
    .slice(0, 10)
    .map((t) => ({
      table: t.table.slice(0, 64),
      rows: Number.isInteger(t.rows) ? t.rows : null,
      names: (Array.isArray(t.names) ? t.names : []).slice(0, 8).map((n) => String(n).slice(0, 80))
    }))
  const files = (Array.isArray(moved.files) ? moved.files : [])
    .slice(0, 5)
    .map((f) => String(f).slice(0, 200))
  const parts = [...new Set([...tables.map((t) => partOfTable(t.table)), ...(files.length ? ['files'] : [])])]
  return {
    parts,
    tables,
    files,
    detail: typeof said.detail === 'string' ? said.detail.slice(0, 300) : null
  }
}

/**
 * The versions a LIVE_PHP_TOO_OLD names (claude-cowork 0.24.73 refusing to run below its minimum,
 * live-pull/live-write `phpTooOld`): the PHP the live site runs and the one the engine needs, each a
 * bare version or null — from the answer itself, its read, or a push's inner sync. Null when no
 * part of the answer is that refusal.
 * @returns {{ php: string | null, min: string | null } | null}
 */
export function phpTooOldOf(answer) {
  const said = [answer, answer?.read, answer?.sync, answer?.sync?.read].find(
    (a) => a && typeof a === 'object' && a.code === 'LIVE_PHP_TOO_OLD' && ('php' in a || 'min' in a)
  )
  if (!said) return null
  const version = (v) => (typeof v === 'string' && /^\d+(\.\d+){0,3}$/.test(v) ? v : null)
  return { php: version(said.php), min: version(said.min) }
}

/** `notCarried` of a sync's answer, names only and bounded; null when there is none. */
function notCarriedOf(answer) {
  const seen = answer?.notCarried
  if (!seen || typeof seen !== 'object') return null
  const name = (v) => (typeof v === 'string' && v ? v.slice(0, 64) : null)
  const triggers = (Array.isArray(seen.triggers) ? seen.triggers : [])
    .map((t) => ({ name: name(t?.name), table: name(t?.table) }))
    .filter((t) => t.name)
    .slice(0, 50)
  const tables = (Array.isArray(seen.tables) ? seen.tables : []).map(name).filter(Boolean).slice(0, 50)
  return triggers.length || tables.length ? { triggers, tables } : null
}

/** A sync row as a client sees it. */
export function view(row) {
  const answer = row.answer ?? {}
  const conflicts = openConflicts(row)
  return {
    id: row.id,
    state: row.state,
    step: row.step ? String(row.step).replace(/^webroot-sync(?:-merge|-apply)?:?/, '') || 'starting' : null,
    error: row.error ?? null,
    liveReadAt: row.live_read_at ? new Date(row.live_read_at).toISOString() : null,
    startedAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    startedBy: row.created_by ?? null,
    conflicts: conflicts.map(brief),
    // New live records the merge could not keep beside the copy's: nothing was applied; a person
    // decides (POST /sync {allowHeld: true}).
    held: (answer.held ?? []).map((h) => ({
      ...brief(h),
      points_at: h.points_at ?? null,
      live: h.live ?? null,
      rows: h.rows ?? null
    })),
    // The places both sites changed, where Tracy's version stayed (what the live site had there too).
    kept: keptPlaces(answer).map(brief),
    // What an applied sync left out of the live site's content, named with the reason.
    dropped: droppedRecords(row),
    // Log rows both sites wrote under one number: the copy's stayed. Named for support, not shown.
    skipped: (answer.skipped ?? []).map(brief),
    // What the live site has that a sync does not bring, named (#120): its triggers the copy lacks,
    // and the tables left out by the shape of their name (`…_log`) that it changed.
    notCarried: notCarriedOf(answer),
    summary:
      answer.files || answer.database || answer.apply || row.state === 'applied'
        ? {
            files: answer.files ?? null,
            database: answer.database ?? null,
            backup: answer.apply?.version ?? answer.version ?? null,
            // Records both sites created under one number: the live site's came over under these.
            renumbered: answer.renumbered ?? [],
            after: answer.apply?.after ?? null
          }
        : null,
    // Where the time went: each step's second, and the live read's parts (a sync read back as slow).
    timing: answer.timing ?? null,
    // A read that found the live site still changing: which part of it kept changing.
    busy: row.error === 'LIVE_BUSY' ? busyOf(answer) : null,
    // The live site's PHP is below what Claude Cowork needs: both versions, for the owner's sentence.
    php: row.error === 'LIVE_PHP_TOO_OLD' ? phpTooOldOf(answer) : null
  }
}
