/**
 * A backup point downloaded by its Owner (plan `tasks/todo-backup-export.md`; ADR 0024, amendment 3):
 * the site's files and database as ONE zip, made by the host that holds them and
 * handed to the browser by the artifact store — never through this process.
 *
 *   requestExport   files a `backup_export` row and the host's `webroot-export` job, and answers at
 *                   once; the job goes on in the background (packing waits on the host's locks,
 *                   uploading on its network). Caps: one in flight per site (the table's index),
 *                   {@link BACKUP_EXPORTS_IN_FLIGHT_PER_ACCOUNT} per account,
 *                   {@link BACKUP_EXPORTS_PER_ACCOUNT_PER_HOUR} per account per hour.
 *   exportStatus    what one export is now — read back from the host while it is in flight, so a
 *                   row whose waiter died with its process still ends. It never issues a link.
 *   sweepExpired    deletes the objects of exports past their day, ends in-flight rows the host
 *                   has finished, fails the ones it never will, and deletes the objects of failed
 *                   exports the store would not delete when they failed.
 *   forgetSite      deletes every object of a site that is being deleted, then its rows.
 *
 * The bytes go host → store → browser: the host PUTs to an address signed here
 * ({@link UPLOAD_URL_TTL_S}), the browser GETs from one signed on each ask of the status door. A row
 * is `ready` only once the store answers HEAD with the size the host reported. The upload address
 * is a bearer secret: it is handed to the host in the job's input and kept nowhere — not in this
 * row, not in the `job` row, not in a log.
 *
 * Who may: the doors in `route.js` let only a seat holding the `lifecycle` toolset (an Owner, ADR
 * 0028) reach this module; this module trusts that and checks nothing about roles itself.
 *
 * THE INSTALL CODE (19/10/2026). A WordPress or Joomla package installs itself with `installer.php`,
 * which asks for six digits before it sends the site to a database on another server — the one way
 * a stranger who finds the installer could take the data away. The code is made here, per export:
 * it reaches the host in the job's input like the upload address (environment only, never argv, a
 * job record or a log), and the package carries only its hash. The row keeps it sealed
 * (`lib/secret-box.js`), so the Owner reads it back in the Export dialog, through the same doors as
 * the download, and once in an email after the first download link is issued.
 */
import { createHash, randomInt, randomUUID } from 'node:crypto'
import {
  BACKUP_EXPORT_LINK_TTL_S,
  BACKUP_EXPORT_MAX_BYTES,
  BACKUP_EXPORT_TTL_HOURS,
  BACKUP_EXPORTS_IN_FLIGHT_PER_ACCOUNT,
  BACKUP_EXPORTS_PER_ACCOUNT_PER_HOUR,
  CODE_TTL_MS,
  MAX_ATTEMPTS
} from '../lib/policy.js'
import { generateCode, hashCode } from '../lib/otp.js'
import { openSecret, sealSecret } from '../lib/secret-box.js'
import { presign, signedCall, storeForSource } from './artifacts.js'
import { audit, updateJob } from './store.js'

/** The namespace of every export object. The generic artifact doors sign only under `sites/`. */
export const EXPORT_NAMESPACE = 'backup-exports/'

/**
 * How long the host's PUT address lives. Signed when the job is filed, because the host holds no
 * store credentials: it must cover the wait for the machine's heavy lock (up to 30 minutes,
 * `webroot-backup.sh` `run_heavy`) and the packing before the upload starts. The store checks expiry
 * when the PUT begins, so a long upload is not cut by it.
 */
export const UPLOAD_URL_TTL_S = 2 * 60 * 60

/**
 * How long a process waits for its own job before leaving it to the status door and the sweep:
 * the heavy lock (30 min), the packing, and curl's own 30-minute ceiling, with room.
 */
const WAIT_MS = 75 * 60_000
/** Past this, an export still in flight is failed by the sweep: the host is not going to say. */
const STUCK_MS = 3 * 60 * 60_000
/** The first wait of a job, as the door's own `runSiteJob` polls it. */
const FIRST_WAIT_MS = 15_000
/** Between two looks at a job the door stopped waiting for. */
const POLL_MS = 5_000

const IN_FLIGHT = ['queued', 'packing', 'uploading']
/** The platforms whose package carries `installer.php`, and so an install code. */
const WITH_INSTALLER = ['wordpress', 'joomla']
/**
 * What a `tracy-host` from before the install code answers a job that carries one: its validator
 * refuses any key it does not know (`BAD_REQUEST`, `refused installCode`), and `runSiteJob` hands
 * that on as this exact reason. Only this refusal is retried without the code; any other one,
 * even a `refused` of another key, fails the export as before.
 */
export const OLD_HOST_REFUSAL = 'BAD_REQUEST: refused installCode'
const ACTION = 'site.backup.export'
const ACTOR_SWEEP = 'cron:backup-export'

/**
 * The store key of one export: `backup-exports/<site label>/<export id>.zip`.
 * @param {string} label the site's fleet label (`site.label`)
 * @param {string} exportId
 */
export function exportKey(label, exportId) {
  return `${EXPORT_NAMESPACE}${label}/${exportId}.zip`
}

/**
 * The name a package downloads under: `<label>-backup-vN-<16 hex>.zip`. The README lets a customer
 * upload the ZIP itself into the new web folder, where it stays until `installer.php` is first
 * opened; with only the label and a small version number in it, anyone could guess its address and
 * download the whole site. The 16 hex (64 bits) come from the export's id — a random UUID, 122 bits —
 * through SHA-256, so the name is the same on every download of one export, unguessable, and does
 * not give the id itself away.
 * @param {string} label
 * @param {{ id: string, version: number }} row
 */
export function downloadName(label, row) {
  const random = createHash('sha256').update(`tracy-export-name:${row.id}`).digest('hex').slice(0, 16)
  return `${label}-backup-v${row.version}-${random}.zip`
}

/**
 * A download link for `row`, or null when the row may give none (not `ready`, or past
 * `expires_at`). Signed for the store's public address when it has one — a browser fetches it —
 * for {@link BACKUP_EXPORT_LINK_TTL_S}, named by {@link downloadName}, never cached.
 * @param {{endpoint: string, bucket: string, accessKey: string, secretKey: string, publicEndpoint?: string}} store
 * @param {{id: string, state: string, version: number, key: string, expires_at: Date | string | null}} row
 * @param {string} label
 * @param {number} now
 * @returns {Promise<string | null>}
 */
export async function issueLink(store, row, label, now) {
  if (row.state !== 'ready' || !row.expires_at || new Date(row.expires_at).getTime() <= now) return null
  return presign(storeForSource(store), {
    method: 'GET',
    key: row.key,
    expiresIn: BACKUP_EXPORT_LINK_TTL_S,
    now,
    query: {
      'response-content-disposition': `attachment; filename="${downloadName(label, row)}"`,
      'response-cache-control': 'no-store'
    }
  })
}

/** The last line of a job's output as JSON, or null. */
function lastLine(output) {
  const line = String(output ?? '')
    .trim()
    .split('\n')
    .at(-1)
  try {
    return JSON.parse(line ?? '')
  } catch {
    return null
  }
}

/**
 * @param {{
 *   pool: import('pg').Pool,
 *   config: any,
 *   host: { hostCall: Function, hostJob: Function },
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   log?: { warn: Function }
 * }} deps
 */
export function createBackupExports({
  pool,
  config,
  host,
  fetchImpl = fetch,
  now = () => Date.now(),
  log = console
}) {
  const store = () => config.artifactStore ?? null

  /** Write the host's word on a row still in flight. Returns the row as it now stands. */
  async function settle(row, polled) {
    const state = polled?.state
    if (state === 'running' || state === 'queued') {
      const next = polled.step === 'webroot-export:uploading' ? 'uploading' : 'packing'
      if (next !== row.state) {
        const { rows } = await pool.query(
          `update backup_export set state = $2 where id = $1 and state = any($3::text[]) returning *`,
          [row.id, next, IN_FLIGHT]
        )
        return rows[0] ?? row
      }
      return row
    }
    if (state === 'failed') return finish(row, { error: 'HOST_JOB_FAILED' })
    if (state !== 'done') return row
    const answer = lastLine(polled.output)
    if (!answer || answer.ok !== true)
      return finish(row, { error: String(answer?.code ?? 'HOST_ANSWERED_UNREADABLY') })
    // Ready only once the store holds exactly what the host says it sent.
    const s = store()
    const head = s ? await signedCall(s, { method: 'HEAD', key: row.key }, fetchImpl).catch(() => null) : null
    const size = Number(head?.headers?.get('content-length'))
    if (!head?.ok || size !== answer.bytes) return finish(row, { error: 'UPLOAD_NOT_FOUND' })
    return finish(row, { answer })
  }

  /** End a row in flight: `ready` with the host's answer, or `failed` with `error`. Once only. */
  async function finish(row, { answer = null, error = null }) {
    const at = new Date(now())
    const { rows } = answer
      ? await pool.query(
          `update backup_export set state = 'ready', bytes = $2, sha256 = $3, commit_sha = $4,
                  ready_at = $5, expires_at = $6, error = null
            where id = $1 and state = any($7::text[]) returning *`,
          [
            row.id,
            answer.bytes,
            String(answer.sha256 ?? ''),
            typeof answer.commit === 'string' ? answer.commit : null,
            at,
            new Date(at.getTime() + BACKUP_EXPORT_TTL_HOURS * 3600_000),
            IN_FLIGHT
          ]
        )
      : await pool.query(
          `update backup_export set state = 'failed', error = $2
            where id = $1 and state = any($3::text[]) returning *`,
          [row.id, String(error).slice(0, 200), IN_FLIGHT]
        )
    const ended = rows[0]
    if (!ended) return (await byId(row.id)) ?? row
    await audit(pool, {
      actor: ended.requested_email,
      action: ACTION,
      siteKey: ended.site_key,
      detail: {
        event: answer ? 'ready' : 'failed',
        exportId: ended.id,
        version: ended.version,
        ...(answer ? { bytes: Number(ended.bytes), sha256: ended.sha256 } : { error: ended.error })
      }
    })
    if (!answer) await cleanFailed(ended)
    return ended
  }

  /**
   * Delete the object a failed export may have left: the host can upload and then fail, or upload a
   * size other than the one it reported. Tried when the row fails and again by every sweep until the
   * store answers (404 counts: nothing was there). No PUT can land after this: a row fails only once
   * the host's job has ended, or past {@link STUCK_MS}, later than any upload can run (an address
   * lives {@link UPLOAD_URL_TTL_S} and curl stops each attempt after 30 minutes).
   * @returns {Promise<boolean>} true when this call recorded the object as deleted
   */
  async function cleanFailed(row) {
    if (row.state !== 'failed' || row.object_deleted_at) return false
    if (!(await deleteObject(row.key))) {
      // Sent to the back of the sweep's queue, behind every failed row not yet tried.
      await pool.query(
        `update backup_export set object_delete_tried_at = $2 where id = $1 and object_deleted_at is null`,
        [row.id, new Date(now())]
      )
      return false
    }
    return markDeleted(row, 'failed', `and state = 'failed'`)
  }

  /**
   * Record that `row`'s object is gone and audit it — only when this caller is the one that set the
   * mark, so the failure, the sweep and a site delete racing on one object audit it once.
   * @param {string} reason
   * @param {string} [also] a further SQL condition on the row, e.g. its state
   * @returns {Promise<boolean>} true when this call set the mark
   */
  async function markDeleted(row, reason, also = '') {
    const { rows } = await pool.query(
      `update backup_export set object_deleted_at = $2
        where id = $1 and object_deleted_at is null ${also} returning id`,
      [row.id, new Date(now())]
    )
    if (!rows[0]) return false
    await audit(pool, {
      actor: ACTOR_SWEEP,
      action: ACTION,
      siteKey: row.site_key,
      detail: { event: 'deleted', exportId: row.id, version: row.version, reason }
    })
    return true
  }

  async function byId(id) {
    const { rows } = await pool.query(`select * from backup_export where id = $1`, [id])
    return rows[0] ?? null
  }

  /** Ask the host once about a row in flight, and write what it says. */
  async function refresh(row, site) {
    if (!IN_FLIGHT.includes(row.state) || !row.job_id || !site) return row
    const polled = await host
      .hostJob(config, site.host, row.job_id, { fetchImpl, timeoutMs: 10_000 })
      .catch(() => null)
    if (!polled?.ok || !polled.body) return row
    await updateJob(pool, row.job_id, {
      state: polled.body.state,
      step: polled.body.step,
      detail: polled.body
    }).catch(() => {})
    return settle(row, polled.body)
  }

  /** Follow a job the door's first wait did not see end, in the background, until it does. */
  async function follow(row, site) {
    const until = now() + WAIT_MS
    let current = row
    while (current && IN_FLIGHT.includes(current.state) && now() < until) {
      // Unref'd: a process shutting down does not wait for a look it would not act on anyway.
      await new Promise((resolve) => setTimeout(resolve, POLL_MS).unref?.())
      // Read back each round: another replica's status door may have ended it, or a delete removed it.
      const fresh = await byId(current.id)
      current = fresh ? await refresh(fresh, site) : null
    }
  }

  /**
   * File one export of backup `version` of `site` for `actor`, and start the host's job.
   * @param {{
   *   site: { site_key: string, label: string, host: string, platform: string | null },
   *   actor: { email: string, accountId: string | null },
   *   version: number,
   *   runJob: (site: any, input: any, deadlineMs: number, onJob?: (jobId: string) => Promise<void> | void) =>
   *     Promise<{ ok: boolean, output?: string, reason?: string, pending?: boolean }>
   * }} input `runJob`: the door's `runSiteJob` — files the job, records its `job` row, waits a little.
   * @returns {Promise<{ ok: true, exportId: string, state: 'queued' } | { refused: { code: string, status: number } }>}
   */
  async function requestExport({ site, actor, version, runJob, includeLarge = false }) {
    if (!['wordpress', 'joomla', 'emdash'].includes(site.platform))
      return { refused: { code: 'EXPORT_UNSUPPORTED_PLATFORM', status: 409 } }
    const s = store()
    if (!s) return { refused: { code: 'ARTIFACT_STORE_UNAVAILABLE', status: 503 } }
    const id = randomUUID()
    const key = exportKey(site.label, id)
    // Six digits, uniform; sealed before it touches the database.
    const installCode = WITH_INSTALLER.includes(site.platform)
      ? String(randomInt(0, 1_000_000)).padStart(6, '0')
      : null
    const sealed = installCode ? await sealSecret(installCode, config.sessionSecret) : null
    // The caps and the row in one statement; the partial unique index answers "one per site".
    const { rows } = await pool.query(
      `insert into backup_export (id, site_key, version, requested_by, requested_email, key, install_code_sealed)
       select $1::uuid, $2, $3, $4::uuid, $5, $6, $10::text
        where (select count(*) from backup_export
                where requested_by = $4::uuid and state = any($9::text[])) < $7
          and (select count(*) from backup_export
                where requested_by = $4::uuid and created_at > now() - interval '1 hour') < $8
       on conflict (site_key) where state in ('queued', 'packing', 'uploading') do nothing
       returning *`,
      [
        id,
        site.site_key,
        version,
        actor.accountId,
        actor.email,
        key,
        BACKUP_EXPORTS_IN_FLIGHT_PER_ACCOUNT,
        BACKUP_EXPORTS_PER_ACCOUNT_PER_HOUR,
        IN_FLIGHT,
        sealed
      ]
    )
    if (rows.length === 0) {
      const busy = await pool.query(
        `select 1 from backup_export where site_key = $1 and state = any($2::text[]) limit 1`,
        [site.site_key, IN_FLIGHT]
      )
      if (busy.rows.length) return { refused: { code: 'EXPORT_IN_PROGRESS', status: 409 } }
      const flying = await pool.query(
        `select count(*)::int as n from backup_export where requested_by = $1::uuid and state = any($2::text[])`,
        [actor.accountId, IN_FLIGHT]
      )
      if (flying.rows[0].n >= BACKUP_EXPORTS_IN_FLIGHT_PER_ACCOUNT)
        return { refused: { code: 'EXPORT_LIMIT_IN_FLIGHT', status: 429 } }
      return { refused: { code: 'EXPORT_RATE_LIMITED', status: 429 } }
    }
    const row = rows[0]
    await audit(pool, {
      actor: actor.email,
      action: ACTION,
      siteKey: site.site_key,
      detail: { event: 'requested', exportId: id, version }
    })
    const uploadUrl = await presign(s, { method: 'PUT', key, expiresIn: UPLOAD_URL_TTL_S, now: now() })
    // Not awaited: the door answers 202 now, and this ends the row whenever the host does.
    void (async () => {
      let current = row
      const input = {
        kind: 'webroot-export',
        version,
        uploadUrl,
        maxBytes: BACKUP_EXPORT_MAX_BYTES,
        includeLarge
      }
      const filed = async (jobId) => {
        const { rows: taken } = await pool.query(
          `update backup_export set job_id = $2, state = 'packing'
            where id = $1 and state = 'queued' returning *`,
          [id, jobId]
        )
        current = taken[0] ?? current
      }
      let job = await runJob(site, installCode ? { ...input, installCode } : input, FIRST_WAIT_MS, filed)
      if (installCode && !job.ok && !job.pending && !current.job_id && job.reason === OLD_HOST_REFUSAL) {
        // A host still on the old `tracy-host` refused the code before taking the job. The export
        // goes on without one: the row forgets it, so the dialog shows none and no mail names it,
        // and the package installs with a database on its own server only.
        const { rows: plain } = await pool.query(
          `update backup_export set install_code_sealed = null where id = $1 returning *`,
          [id]
        )
        current = plain[0] ?? current
        log.warn(
          `[backup-export] ${site.site_key} ${id}: the host takes no install code yet; exported without one`
        )
        job = await runJob(site, input, FIRST_WAIT_MS, filed)
      }
      if (job.ok) await settle(current, { state: 'done', output: job.output })
      else if (job.pending) await follow(current, site)
      else if (!current.job_id) await finish(current, { error: String(job.reason ?? 'FLEET_REFUSED') })
      else await settle(current, { state: 'failed' })
    })().catch((error) => log.warn(`[backup-export] ${site.site_key} ${id}: ${error?.message ?? error}`))
    return { ok: true, exportId: id, state: 'queued' }
  }

  /**
   * What the Owner sees of one row. `installCode` once the package is ready, and after it expired
   * when it was downloaded — the customer may install days later; never while it is in flight or
   * after it failed. A code that no longer opens (SESSION_SECRET rotated) is left out, not guessed.
   */
  async function view(row) {
    const t = now()
    const expired =
      row.state === 'expired' || (row.state === 'ready' && new Date(row.expires_at).getTime() <= t)
    const state = expired ? 'expired' : row.state
    const shows = row.install_code_sealed && (state === 'ready' || (state === 'expired' && row.downloaded_at))
    const installCode = shows ? await openSecret(row.install_code_sealed, config.sessionSecret) : null
    return {
      exportId: row.id,
      version: row.version,
      state,
      bytes: row.bytes === null ? null : Number(row.bytes),
      sha256: row.sha256 ?? null,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      downloaded: Boolean(row.downloaded_at),
      ...(installCode ? { installCode } : {}),
      ...(row.state === 'failed' ? { error: row.error } : {})
    }
  }

  /**
   * The export the Export dialog opens on, so a customer who comes back finds the package and its
   * install code where they left them: the newest of `site` that is ready, or that was downloaded.
   * Null when there is none.
   * @param {{ site: { site_key: string, label: string, host: string } }} input
   */
  async function latestExport({ site }) {
    const { rows } = await pool.query(
      `select * from backup_export where site_key = $1 and (state = 'ready' or downloaded_at is not null)
        order by created_at desc limit 1`,
      [site.site_key]
    )
    return rows[0] ? view(rows[0]) : null
  }

  /**
   * One export of `site`, as its Owner may see it: `{state, version, bytes, sha256, expiresAt,
   * downloaded, installCode?, error?}`, or null when the site has no such export. Download URLs are
   * issued only by `downloadWithCode`, after a fresh email code is consumed.
   * @param {{ site: { site_key: string, label: string, host: string }, exportId: string, actor: { email: string } }} input
   */
  async function exportStatus({ site, exportId }) {
    const { rows } = await pool.query(`select * from backup_export where id = $1 and site_key = $2`, [
      exportId,
      site.site_key
    ])
    if (!rows[0]) return null
    return view(await refresh(rows[0], site))
  }

  /** Send a fresh sign-in-style email code for one ready package. */
  async function sendDownloadCode({ site, exportId, actor, mail, language = 'en' }) {
    if (!actor.accountId) return { refused: { code: 'NOT_SIGNED_IN', status: 401 } }
    const { rows } = await pool.query(
      `select id from backup_export where id = $1 and site_key = $2 and requested_email = $3
         and state = 'ready' and expires_at > $4 and object_deleted_at is null`,
      [exportId, site.site_key, actor.email, new Date(now())]
    )
    if (!rows[0]) return { refused: { code: 'EXPORT_NOT_READY', status: 409 } }
    const challengeId = randomUUID()
    const code = generateCode()
    const expiresAt = new Date(now() + CODE_TTL_MS)
    await pool.query(
      `update backup_export_code set consumed_at = $3
        where export_id = $1 and requested_by = $2::uuid and consumed_at is null`,
      [exportId, actor.accountId, new Date(now())]
    )
    await pool.query(
      `insert into backup_export_code (id, site_key, export_id, requested_by, email, code_hash, expires_at)
       values ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7)`,
      [
        challengeId,
        site.site_key,
        exportId,
        actor.accountId,
        actor.email,
        await hashCode(code, actor.email, config.sessionSecret),
        expiresAt
      ]
    )
    try {
      await mail.send({ to: actor.email, ...mail.signInCodeMail(code, language) })
    } catch (error) {
      await pool.query(`update backup_export_code set consumed_at = now() where id = $1`, [challengeId])
      throw error
    }
    return { challengeId, expiresAt: expiresAt.toISOString() }
  }

  /**
   * Consume a matching code once, then issue a short-lived URL for that ready export. The first
   * link issued marks the export downloaded and mails its install code, once (`mail`, `language`:
   * the door's; `mail.installCodeMail` is handed in from `app.js`, as this domain may not import
   * `mail/`). A mail that fails does not fail the download: the dialog shows the code anyway,
   * and the next link issued tries the mail again.
   */
  async function downloadWithCode({
    site,
    exportId,
    actor,
    challengeId,
    code,
    mail = null,
    language = 'en'
  }) {
    const { rows } = await pool.query(
      `update backup_export_code set attempts = attempts + 1
        where id = $1::uuid and site_key = $2 and export_id = $3::uuid
          and requested_by = $4::uuid and email = $5 and consumed_at is null
        returning code_hash, attempts, expires_at`,
      [challengeId, site.site_key, exportId, actor.accountId, actor.email]
    )
    const challenge = rows[0]
    if (!challenge) return { refused: { code: 'DOWNLOAD_CODE_INVALID', status: 401 } }
    if (new Date(challenge.expires_at).getTime() <= now())
      return { refused: { code: 'DOWNLOAD_CODE_EXPIRED', status: 401 } }
    if (challenge.attempts > MAX_ATTEMPTS)
      return { refused: { code: 'DOWNLOAD_CODE_TOO_MANY_ATTEMPTS', status: 401 } }
    if (challenge.code_hash !== (await hashCode(code, actor.email, config.sessionSecret)))
      return { refused: { code: 'DOWNLOAD_CODE_INVALID', status: 401 } }
    const consumed = await pool.query(
      `update backup_export_code set consumed_at = $2 where id = $1::uuid and consumed_at is null returning id`,
      [challengeId, new Date(now())]
    )
    if (!consumed.rows[0]) return { refused: { code: 'DOWNLOAD_CODE_INVALID', status: 401 } }
    const { rows: exports } = await pool.query(
      `select * from backup_export where id = $1::uuid and site_key = $2 and requested_email = $3
         and state = 'ready' and expires_at > $4 and object_deleted_at is null`,
      [exportId, site.site_key, actor.email, new Date(now())]
    )
    const row = exports[0]
    const s = store()
    const url = row && s ? await issueLink(s, row, site.label, now()) : null
    if (!url) return { refused: { code: 'EXPORT_NOT_READY', status: 409 } }
    await audit(pool, {
      actor: actor.email,
      action: ACTION,
      siteKey: site.site_key,
      detail: { event: 'link-issued', exportId: row.id, version: row.version }
    })
    await pool.query(`update backup_export set downloaded_at = coalesce(downloaded_at, $2) where id = $1`, [
      row.id,
      new Date(now())
    ])
    if (row.install_code_sealed && mail?.send && mail.installCodeMail)
      await mailInstallCode(row, site, actor, mail, language)
    return { url }
  }

  /** The install code's email, once per export: the row is claimed first, released if the send fails. */
  async function mailInstallCode(row, site, actor, mail, language) {
    const { rows: claimed } = await pool.query(
      `update backup_export set install_code_mailed_at = $2
        where id = $1 and install_code_mailed_at is null returning id`,
      [row.id, new Date(now())]
    )
    if (!claimed[0]) return
    const installCode = await openSecret(row.install_code_sealed, config.sessionSecret)
    try {
      if (!installCode) throw new Error('the install code no longer opens')
      await mail.send({
        to: actor.email,
        ...mail.installCodeMail({ code: installCode, site: site.label, version: row.version, lang: language })
      })
    } catch (error) {
      await pool.query(`update backup_export set install_code_mailed_at = null where id = $1`, [row.id])
      log.warn(
        `[backup-export] ${site.site_key} ${row.id}: the install code mail failed: ${error?.message ?? error}`
      )
    }
  }

  /** Delete one export's object; true when the store no longer holds it. */
  async function deleteObject(key) {
    const s = store()
    if (!s) return false
    const res = await signedCall(s, { method: 'DELETE', key }, fetchImpl).catch(() => null)
    return Boolean(res && (res.ok || res.status === 404))
  }

  /**
   * The periodic sweep: objects past their day deleted (the row kept, `expired`); rows in flight
   * read back from the host; rows in flight past {@link STUCK_MS} failed; objects of failed rows the
   * store would not delete before deleted now. Safe on every replica at once: each write is
   * conditional on the state it read.
   * @returns {Promise<{ deleted: number, ended: number }>}
   */
  async function sweepExpired() {
    let deleted = 0
    let ended = 0
    // A ready row whose object is already deleted and audited (a site delete that stopped before
    // removing its rows) only needs its state settled: no second DELETE, no second audit line.
    await pool.query(
      `update backup_export set state = 'expired'
        where state = 'ready' and expires_at <= $1 and object_deleted_at is not null`,
      [new Date(now())]
    )
    // Never tried first, then the longest-untried, as for failed rows below: objects the store keeps
    // refusing cannot hold the batch.
    const due = await pool.query(
      `select * from backup_export where state = 'ready' and expires_at <= $1 and object_deleted_at is null
        order by object_delete_tried_at nulls first, expires_at limit 200`,
      [new Date(now())]
    )
    for (const row of due.rows) {
      if (!(await deleteObject(row.key))) {
        await pool.query(
          `update backup_export set object_delete_tried_at = $2 where id = $1 and object_deleted_at is null`,
          [row.id, new Date(now())]
        )
        continue
      }
      const { rows } = await pool.query(
        `update backup_export set state = 'expired', object_deleted_at = $2
          where id = $1 and state = 'ready' and object_deleted_at is null returning id`,
        [row.id, new Date(now())]
      )
      if (!rows[0]) continue
      deleted++
      await audit(pool, {
        actor: ACTOR_SWEEP,
        action: ACTION,
        siteKey: row.site_key,
        detail: { event: 'deleted', exportId: row.id, version: row.version, reason: 'expired' }
      })
    }
    const flying = await pool.query(
      `select e.*, s.host from backup_export e left join site s on s.site_key = e.site_key
        where e.state = any($1::text[]) order by e.created_at limit 200`,
      [IN_FLIGHT]
    )
    for (const row of flying.rows) {
      const after = await refresh(row, row.host ? { host: row.host } : null)
      if (!IN_FLIGHT.includes(after.state)) {
        ended++
        continue
      }
      if (now() - new Date(row.created_at).getTime() > STUCK_MS) {
        // `finish` deletes the object too; a store error leaves it to the loop below, next sweep.
        await finish(after, { error: 'TIMED_OUT' })
        ended++
      }
    }
    const failed = await pool.query(
      `select * from backup_export where state = 'failed' and object_deleted_at is null
        order by object_delete_tried_at nulls first, created_at limit 200`
    )
    for (const row of failed.rows) if (await cleanFailed(row)) deleted++
    return { deleted, ended }
  }

  /**
   * A site being deleted: every object it has in the export namespace, then its rows. Best-effort,
   * like `forgetSiteAttachments`: a key the store would not delete is logged, and its row kept so
   * the sweep can try again.
   * @param {string} siteKey
   * @returns {Promise<{ removed: number, kept: string[] }>}
   */
  async function forgetSite(siteKey) {
    const { rows } = await pool.query(
      `select id, site_key, key, version, state, object_deleted_at from backup_export where site_key = $1`,
      [siteKey]
    )
    // Only a row whose object the store has not answered for may still have one: an expired row's
    // and a cleaned failed row's are gone.
    const mayExist = (r) => r.state !== 'expired' && !r.object_deleted_at
    const gone = []
    const kept = []
    let removed = 0
    for (const row of rows) {
      if (!mayExist(row)) gone.push(row)
      else if (await deleteObject(row.key)) {
        gone.push(row)
        // Audited here only if no sweep or failure marked the same object first.
        if (await markDeleted(row, 'site-deleted')) removed++
      } else kept.push(row.key)
    }
    if (gone.length)
      await pool.query(`delete from backup_export where id = any($1::uuid[])`, [gone.map((r) => r.id)])
    if (kept.length)
      log.warn(`[backup-export] ${siteKey}: deleted without ${kept.length} export(s): ${kept.join(', ')}`)
    return { removed, kept }
  }

  return {
    requestExport,
    exportStatus,
    latestExport,
    sendDownloadCode,
    downloadWithCode,
    sweepExpired,
    forgetSite
  }
}
