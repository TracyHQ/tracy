// SITE OPERATIONS — who pressed Undo/Restore, and what the host verifiably did (Site changes V2,
// contract §2 migration 049, D2, D3, §5; plan §3.3, §4.2, §4.3).
//
// One `site_operation` row per press. The row is created `pending` BEFORE the host job starts,
// carries the tracy `job` id, and is completed only from a VERIFIED answer:
//
//   succeeded       the job's `head` is a real restore commit (contract D2: author fleet@ AND the
//                   RAW subject has the restore shape naming this target) → `resulting_sha`.
//   succeeded_noop  the host ran but made no restore commit (`files: 0`, or `head` is an older
//                   commit / the seal it made first). No `resulting_sha`: the old HEAD is never
//                   claimed as this operation's commit, and nothing is marked undone.
//   failed          the host refused cleanly (CONFLICT, NOT_UNDOABLE, the job failed).
//   unknown         contact lost, or the answer could not be verified (an older host whose commit
//                   reader names no author/subject). Reconciled later through the job row — never
//                   read as "nothing changed".
//
// Git and Postgres share no transaction, so the same commit can be seen in Git before its row is
// complete; the unique index on (site_key, resulting_sha) keeps ONE identity per commit.
//
// Nothing here reads a commit TITLE through the reader's `title_of`: the subject compared below is
// the raw one the host's `--op commit` returns, and it is only matched against a shape, never shown.
import { jobById, updateJob } from './store.js'

/** The statuses a row may hold (`049-site-operation.sql`). */
export const OPERATION_STATUSES = ['pending', 'succeeded', 'succeeded_noop', 'failed', 'unknown']

/** The machine identity every restore commit is made under: one contract, one constant. */
import { RESTORE_AUTHOR } from './activity-source.js'
export { RESTORE_AUTHOR }

const SHA = /^[0-9a-f]{7,64}$/
const FULL_SHA = /^[0-9a-f]{40,64}$/
const IDEM_KEY = /^[A-Za-z0-9._:-]{8,128}$/
// `restore_undo`: "restore: undo <short> (<moment subject>)"; `restore_reset`: "restore: back to <short>".
const UNDO_SUBJECT = /^restore: undo ([0-9a-f]{7,64})(?: \(|$)/
const RESET_SUBJECT = /^restore: back to ([0-9a-f]{7,64})$/

// An `unknown` that no later look can settle: reconcile stops retrying it.
const FINAL_UNKNOWN = ['RESULT_CLAIMED', 'NO_JOB', 'HEAD_MISSING', 'DATABASE_UNVERIFIED']

// The live door polls its job for up to 120 s; a `pending` row younger than this is still being
// settled by that door, and a reconcile must not race it.
const DOOR_WINDOW_MS = 130_000
// One reconcile attempt per row per minute per process, so a tab polling the list does not start
// a host read for the same unverifiable row on every look.
const RETRY_EVERY_MS = 60_000
const lastTry = new Map()

/**
 * The client's idempotency key: `undefined` when absent (an older client — the door runs as it
 * always did), `null` when present but malformed (the door refuses it), else the key.
 * @param {unknown} value
 */
export function parseIdemKey(value) {
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' && IDEM_KEY.test(value) ? value : null
}

/** The last stdout line of a webroot job, parsed — the job's answer. `output` may already be one. */
export function jobAnswer(output) {
  if (output && typeof output === 'object') return output
  const lines = String(output ?? '')
    .trim()
    .split('\n')
  try {
    return JSON.parse(lines[lines.length - 1] ?? '')
  } catch {
    return null
  }
}

/**
 * What an undo of ONE commit will revert, from the host's `--op commit` answer — the same file list
 * `restore_undo` walks (`git show --name-only`), cache and excluded files included, past the 500
 * listed. An older host gives no `total`: then a truncated list is a lower bound, `complete: false`.
 * @param {any} data
 * @returns {{files: number, complete: boolean, truncatedList: boolean}}
 */
export function scopeOfCommit(data) {
  const listed = Array.isArray(data?.files) ? data.files.length : 0
  const truncatedList = data?.truncated === true
  if (Number.isInteger(data?.total) && data.total >= listed) {
    return { files: data.total, complete: true, truncatedList }
  }
  return { files: listed, complete: !truncatedList, truncatedList }
}

/**
 * The facts of one commit from the host's `--op commit` answer. `author`/`subject` are null on an
 * older host that does not name them — the caller then cannot verify, and must not guess.
 * @param {any} data
 */
export function commitFacts(data) {
  if (!data || data.ok !== true || typeof data.sha !== 'string' || !FULL_SHA.test(data.sha)) return null
  return {
    sha: data.sha,
    authorEmail: typeof data.author === 'string' ? data.author.trim().toLowerCase() : null,
    subject: typeof data.subject === 'string' ? data.subject : null,
    parent: typeof data.parent === 'string' && FULL_SHA.test(data.parent) ? data.parent : null,
    scope: scopeOfCommit(data)
  }
}

/** Two sha spellings name the same commit when one is a prefix of the other (P0 #4: short shas). */
export function sameCommit(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !SHA.test(a) || !SHA.test(b)) return false
  return a.length <= b.length ? b.startsWith(a) : a.startsWith(b)
}

/**
 * Contract D2: is this commit the restore commit of `action` on `targetSha`? Author first (only the
 * fleet identity makes restore commits), then the RAW subject's shape and the target it names.
 * `null` when the facts cannot tell (older host: no author/subject).
 * @param {ReturnType<typeof commitFacts>} facts
 * @param {{action: string, targetSha: string | null}} op
 * @returns {boolean | null}
 */
export function isRestoreCommit(facts, { action, targetSha }) {
  if (!facts) return null
  if (facts.authorEmail === null || facts.subject === null) return null
  if (facts.authorEmail !== RESTORE_AUTHOR) return false
  // `restore-everything` (ADR 0024) brings the files back with `restore_reset`: the same commit.
  const shape =
    action === 'undo'
      ? UNDO_SUBJECT
      : action === 'reset' || action === 'restore-everything'
        ? RESET_SUBJECT
        : null
  const named = shape?.exec(facts.subject)?.[1]
  if (!named) return false
  return targetSha ? sameCommit(named, targetSha) : false
}

/**
 * Read one commit through the host's existing commit reader (`webroot-commit` job).
 * @param {(site: any, input: object, deadlineMs: number) => Promise<{ok: boolean, output?: string, reason?: string}>} runJob
 * @returns {Promise<{state: 'found', facts: NonNullable<ReturnType<typeof commitFacts>>} | {state: 'missing'} | {state: 'unreadable', reason: string}>}
 */
export async function inspectCommit(runJob, site, sha) {
  const job = await runJob(site, { kind: 'webroot-commit', sha }, 45_000)
  if (!job.ok) {
    if (/no such commit/.test(job.reason ?? '')) return { state: 'missing' }
    return { state: 'unreadable', reason: job.reason ?? 'failed' }
  }
  const facts = commitFacts(jobAnswer(job.output))
  return facts ? { state: 'found', facts } : { state: 'unreadable', reason: 'unreadable answer' }
}

// ── DAO ────────────────────────────────────────────────────────────────────────────────────

/**
 * A new `pending` operation, or the one this site already holds under the same idempotency key.
 * @returns {Promise<{operation: any, created: boolean}>}
 */
export async function createOperation(
  pool,
  { siteKey, action, targetSha, scope = null, actorEmail, idemKey }
) {
  const { rows } = await pool.query(
    `insert into site_operation (site_key, action, target_sha, scope, actor_email, idem_key)
     values ($1, $2, $3, $4::jsonb, $5, $6)
     on conflict (site_key, idem_key) where idem_key is not null do nothing
     returning *`,
    [siteKey, action, targetSha, scope === null ? null : JSON.stringify(scope), actorEmail, idemKey ?? null]
  )
  if (rows[0]) return { operation: rows[0], created: true }
  return { operation: await operationByIdem(pool, siteKey, idemKey), created: false }
}

export async function operationByIdem(pool, siteKey, idemKey) {
  const { rows } = await pool.query('select * from site_operation where site_key = $1 and idem_key = $2', [
    siteKey,
    idemKey
  ])
  return rows[0] ?? null
}

export async function operationById(pool, id) {
  const { rows } = await pool.query('select * from site_operation where id = $1', [id])
  return rows[0] ?? null
}

export async function attachJob(pool, id, jobId) {
  await pool.query('update site_operation set job_id = $2 where id = $1 and job_id is null', [id, jobId])
}

/**
 * Settle a row that is still `pending`/`unknown`. A row already settled is left as it is (the door
 * and a reconcile may race; both read the same job, so the first write stands). A `resulting_sha`
 * another operation already holds is never taken twice: this row becomes `unknown`/RESULT_CLAIMED,
 * not a second success.
 * @returns {Promise<any>} the row as it now stands.
 */
export async function finishOperation(
  pool,
  id,
  { status, resultingSha = null, error = null, beforeRestore = null }
) {
  const finished = status === 'unknown' ? null : 'now()'
  try {
    // `beforeRestore` (Restore everything): the host's Before-restore backup — the restore's return
    // point — kept in `scope` beside what the press was told, so Site changes links the two by the
    // host's own answer, never by time.
    const { rows } = await pool.query(
      `update site_operation set status = $2, resulting_sha = $3, error = $4,
         finished_at = ${finished ?? 'finished_at'},
         scope = case when $5::int is null then scope
                      else coalesce(scope, '{}'::jsonb) || jsonb_build_object('beforeRestore', $5::int) end
       where id = $1 and status in ('pending', 'unknown')
       returning *`,
      [id, status, resultingSha, error, beforeRestore]
    )
    return rows[0] ?? (await operationById(pool, id))
  } catch (err) {
    if (/** @type {any} */ (err)?.code !== '23505') throw err
    const { rows } = await pool.query(
      `update site_operation set status = 'unknown', error = 'RESULT_CLAIMED'
       where id = $1 and status in ('pending', 'unknown') returning *`,
      [id]
    )
    return rows[0] ?? (await operationById(pool, id))
  }
}

/**
 * What a finished restore job's answer means for its operation (contract D3). `inspect(sha)` reads
 * the head commit through the host. Returns the settlement, not yet written.
 * @param {any} op - the operation row (`action`, `target_sha`).
 * @param {any} data - the job's parsed answer.
 * @param {(sha: string) => ReturnType<typeof inspectCommit>} inspect
 * @returns {Promise<{status: string, resultingSha?: string | null, error?: string | null, beforeRestore?: number}>}
 */
export async function settlementOf(op, data, inspect) {
  if (op.action === 'restore-everything') {
    // The return point is the host's answer whatever the outcome: a failed restore made it too.
    const settled = await everythingSettlement(op, data, inspect)
    const before = data && typeof data === 'object' ? data.beforeRestore?.version : null
    return Number.isSafeInteger(before) && before > 0 ? { ...settled, beforeRestore: before } : settled
  }
  if (!data || typeof data !== 'object') return { status: 'unknown', error: 'UNREADABLE_ANSWER' }
  if (data.ok === false) return { status: 'failed', error: String(data.code ?? 'REFUSED').slice(0, 64) }
  if (data.ok !== true) return { status: 'unknown', error: 'UNREADABLE_ANSWER' }
  // `restore_undo`/`restore_reset` with nothing to revert answer files:0 and the OLD head.
  if (data.files === 0) return { status: 'succeeded_noop', error: null }
  const head = typeof data.head === 'string' ? data.head.trim() : ''
  if (!FULL_SHA.test(head)) return { status: 'unknown', error: 'NO_HEAD' }
  const read = await inspect(head)
  if (read.state === 'missing') return { status: 'unknown', error: 'HEAD_MISSING' }
  if (read.state !== 'found') return { status: 'unknown', error: 'UNVERIFIED' }
  if (read.facts.sha !== head) return { status: 'unknown', error: 'UNVERIFIED' }
  const verdict = isRestoreCommit(read.facts, { action: op.action, targetSha: op.target_sha })
  if (verdict === null) return { status: 'unknown', error: 'UNVERIFIABLE_HOST' }
  // The head is not this operation's restore commit: the commit step made nothing (its `|| true`),
  // so HEAD is the seal the undo made first (P0 #6) or an older commit (P0 #5). Not claimed.
  if (verdict === false) return { status: 'succeeded_noop', error: 'HEAD_NOT_RESTORE' }
  return { status: 'succeeded', resultingSha: head, error: null }
}

/**
 * "Restore everything" (ADR 0024 sub-decision 2): files AND database back to one backup. The host's
 * answer must prove BOTH halves before the row says `succeeded`:
 *   - the database: `database.restored === true` and the sha256 it loaded is the one the point
 *     declared when the press was accepted (`scope.database.sha256`) — else `unknown`;
 *   - the files: with files changed, `head` must be the restore commit of this target (D2, the
 *     `restore: back to <short>` shape); with none (the files were already the point's), there is
 *     no commit to claim and the row succeeds without `resulting_sha` — the database still moved,
 *     so this is NOT a no-op.
 * @returns {Promise<{status: string, resultingSha?: string | null, error?: string | null, beforeRestore?: number}>}
 */
async function everythingSettlement(op, data, inspect) {
  if (!data || typeof data !== 'object') return { status: 'unknown', error: 'UNREADABLE_ANSWER' }
  if (data.ok === false) return { status: 'failed', error: String(data.code ?? 'REFUSED').slice(0, 64) }
  if (data.ok !== true) return { status: 'unknown', error: 'UNREADABLE_ANSWER' }
  const declared = op.scope?.database?.sha256
  const restored = data.database
  if (!restored || restored.restored !== true || typeof declared !== 'string' || restored.sha256 !== declared)
    return { status: 'unknown', error: 'DATABASE_UNVERIFIED' }
  if (data.files === 0) return { status: 'succeeded', resultingSha: null, error: null }
  const head = typeof data.head === 'string' ? data.head.trim() : ''
  if (!FULL_SHA.test(head)) return { status: 'unknown', error: 'NO_HEAD' }
  const read = await inspect(head)
  if (read.state === 'missing') return { status: 'unknown', error: 'HEAD_MISSING' }
  if (read.state !== 'found' || read.facts.sha !== head) return { status: 'unknown', error: 'UNVERIFIED' }
  const verdict = isRestoreCommit(read.facts, { action: op.action, targetSha: op.target_sha })
  if (verdict === null) return { status: 'unknown', error: 'UNVERIFIABLE_HOST' }
  if (verdict === false) return { status: 'unknown', error: 'HEAD_NOT_RESTORE' }
  return { status: 'succeeded', resultingSha: head, error: null }
}

/**
 * Settle this site's operations still `pending`/`unknown` through their `job` rows (contract D3).
 * Never starts a restore; reads the job (polling the host once when the row is not finished and
 * `pollJob` is given) and the head commit. Bounded (`limit` rows, oldest first, via the
 * (site_key, created_at) index), idempotent, and throttled per row, so a projection may call it on
 * every look. Signature is stable for the activity projection (P2).
 *
 * @param {import('pg').Pool} pool
 * @param {{site_key: string, host?: string, label?: string}} site - the `site` row.
 * @param {object} deps
 * @param {Function} deps.runJob - `runSiteJob(site, input, deadlineMs)`; reads the head commit.
 * @param {(site: any, jobId: string) => Promise<{ok: boolean, body?: any}>} [deps.pollJob]
 * @param {number} [deps.limit]
 * @param {() => number} [deps.now]
 * @returns {Promise<{checked: number, settled: {id: string, status: string}[]}>}
 */
export async function reconcilePending(pool, site, { runJob, pollJob, limit = 5, now = Date.now } = {}) {
  const at = now()
  const { rows } = await pool.query(
    `select * from site_operation
     where site_key = $1 and provenance = 'live' and status in ('pending', 'unknown')
       and coalesce(error, '') <> all($2::text[])
       and (status = 'unknown' or created_at < to_timestamp($3::double precision / 1000))
     order by created_at asc
     limit $4`,
    [site.site_key, FINAL_UNKNOWN, at - DOOR_WINDOW_MS, limit]
  )
  const settled = []
  let checked = 0
  for (const op of rows) {
    if (at - (lastTry.get(op.id) ?? -Infinity) < RETRY_EVERY_MS) continue
    lastTry.set(op.id, at)
    checked++
    const after = await reconcileOne(pool, site, op, { runJob, pollJob })
    if (after && after.status !== op.status) settled.push({ id: after.id, status: after.status })
  }
  return { checked, settled }
}

/** Forget the per-row throttle (tests; a process restart does the same). */
export function resetReconcileThrottle() {
  lastTry.clear()
}

/** Settle ONE row now (no throttle) — the restore door's retry path. Same rules as above. */
export async function reconcileOperation(pool, site, op, deps) {
  if (op.status !== 'pending' && op.status !== 'unknown') return op
  return reconcileOne(pool, site, op, deps)
}

async function reconcileOne(pool, site, op, { runJob, pollJob }) {
  if (!op.job_id) {
    // The host never named a job for it (the call died before an answer): nothing to read back.
    return finishOperation(pool, op.id, { status: 'unknown', error: 'NO_JOB' })
  }
  let job = await jobById(pool, op.job_id)
  if (job && job.state !== 'done' && job.state !== 'failed' && pollJob) {
    const polled = await pollJob(site, op.job_id).catch(() => null)
    if (polled?.ok && polled.body) {
      job = await updateJob(pool, op.job_id, {
        state: polled.body.state,
        step: polled.body.step,
        detail: polled.body
      })
    }
  }
  if (!job || (job.state !== 'done' && job.state !== 'failed')) {
    if (op.status === 'pending')
      return finishOperation(pool, op.id, { status: 'unknown', error: 'LOST_CONTACT' })
    return op
  }
  if (job.state === 'failed') return finishOperation(pool, op.id, { status: 'failed', error: 'JOB_FAILED' })
  const settlement = await settlementOf(op, jobAnswer(job.detail?.output), (sha) =>
    inspectCommit(runJob, site, sha)
  )
  return finishOperation(pool, op.id, settlement)
}

// ── Backfill from `audit` (contract §5, plan §4.3) ───────────────────────────────────────────

/**
 * One-off: give old restores (audit `site.restore`, before `site_operation` existed) their presser,
 * ONLY where the evidence is complete: site + full `detail.head` that is a real restore commit (D2)
 * of the audit's mode and target (prefix — `detail.sha` may be short), one candidate per
 * (site, head), one actor. Everything else stays Unknown. Never matches by time, never uses
 * `ops_signal`, never trusts a commit title. Writes `provenance = 'backfill-audit'`,
 * `source_ref = audit id` (unique), and `on conflict do nothing` on every unique index, so a second
 * run or a restart mid-batch adds no row.
 *
 * Audit rows the V2 door wrote carry `detail.operationId`: that press already has its live row and
 * is skipped.
 *
 * @param {import('pg').Pool} pool
 * @param {object} deps
 * @param {(siteKey: string, sha: string) => ReturnType<typeof inspectCommit>} deps.inspect
 * @param {number} [deps.batch] - audit rows per scan query (keyset on audit.id).
 * @param {number} [deps.after] - resume: skip groups whose audit ids are all ≤ this id.
 * @param {boolean} [deps.dryRun]
 * @param {number} [deps.retries] - extra attempts for an unreadable host read.
 * @param {(line: string) => void} [deps.log]
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 */
export async function backfillFromAudit(
  pool,
  { inspect, batch = 200, after = 0, dryRun = false, retries = 2, log = () => {}, sleep } = {}
) {
  const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const report = { scanned: 0, written: 0, already: 0, skipped: {}, lastId: 0, dryRun }
  const skip = (why, n = 1) => {
    report.skipped[why] = (report.skipped[why] ?? 0) + n
  }
  // Phase 1 — read every restore audit row, batch by batch on the primary key (no audit index).
  /** @type {Map<string, any[]>} */
  const groups = new Map()
  let cursor = 0
  for (;;) {
    const { rows } = await pool.query(
      `select id, at, actor, site_key, detail from audit
       where id > $1 and action = 'site.restore'
       order by id limit $2`,
      [cursor, batch]
    )
    if (!rows.length) break
    cursor = Number(rows[rows.length - 1].id)
    report.scanned += rows.length
    for (const row of rows) {
      const d = row.detail ?? {}
      if (d.operationId) skip('live-door')
      else if (!row.site_key || typeof row.actor !== 'string' || !row.actor) skip('no-actor-or-site')
      else if (d.mode !== 'undo' && d.mode !== 'reset') skip('no-mode')
      else if (typeof d.sha !== 'string' || !SHA.test(d.sha)) skip('no-target')
      else if (typeof d.head !== 'string' || !FULL_SHA.test(d.head)) skip('no-head')
      else {
        const key = `${row.site_key}\u0000${d.head}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)?.push(row)
      }
    }
    if (rows.length < batch) break
  }
  report.lastId = cursor
  const siteKeys = [...new Set([...groups.values()].map((g) => g[0].site_key))]
  const known = new Set(
    siteKeys.length
      ? (await pool.query('select site_key from site where site_key = any($1::text[])', [siteKeys])).rows.map(
          (r) => r.site_key
        )
      : []
  )
  // Phase 2 — one host read per (site, head), then the strict match.
  for (const candidates of groups.values()) {
    if (candidates.every((r) => Number(r.id) <= after)) continue
    const { site_key: siteKey } = candidates[0]
    const head = candidates[0].detail.head
    if (!known.has(siteKey)) {
      skip('site-gone', candidates.length)
      continue
    }
    const taken = await pool.query(
      `select 1 from site_operation
       where (site_key = $1 and resulting_sha = $2) or source_ref = any($3::text[]) limit 1`,
      [siteKey, head, candidates.map((r) => String(r.id))]
    )
    if (taken.rows.length) {
      report.already += candidates.length
      continue
    }
    let read
    for (let attempt = 0; attempt <= retries; attempt++) {
      read = await inspect(siteKey, head)
      if (read.state !== 'unreadable') break
      if (attempt < retries) await wait(500 * 2 ** attempt)
    }
    if (!read || read.state === 'missing') {
      skip('head-missing', candidates.length)
      continue
    }
    if (read.state !== 'found' || read.facts.sha !== head) {
      skip('unverified', candidates.length)
      continue
    }
    // Each candidate must be the press that made THIS commit: same mode, same target. An audit row
    // whose restore made nothing carries the OLD head (P0 #5) and a different target: it drops here.
    const matching = []
    let unverifiable = false
    for (const row of candidates) {
      const verdict = isRestoreCommit(read.facts, { action: row.detail.mode, targetSha: row.detail.sha })
      if (verdict === null) unverifiable = true
      else if (verdict) matching.push(row)
    }
    if (unverifiable) {
      skip('unverifiable-host', candidates.length)
      continue
    }
    if (matching.length === 0) {
      skip('not-a-restore-commit', candidates.length)
      continue
    }
    if (matching.length > 1) {
      // Several presses claim one commit: the presser is not proven, whoever they are.
      const actors = new Set(matching.map((r) => r.actor.toLowerCase()))
      skip(actors.size > 1 ? 'conflicting-actors' : 'several-candidates', candidates.length)
      continue
    }
    if (candidates.length > 1) skip('not-this-commit', candidates.length - 1)
    const row = matching[0]
    // The full target sha, when the audit kept only a prefix.
    let target = row.detail.sha
    if (!FULL_SHA.test(target)) {
      const t = await inspect(siteKey, target)
      if (t.state === 'found' && sameCommit(target, t.facts.sha)) target = t.facts.sha
    }
    if (dryRun) {
      log(`would write ${siteKey} ${row.detail.mode} ${head.slice(0, 12)} by ${row.actor} (audit ${row.id})`)
      report.written++
      continue
    }
    const inserted = await pool.query(
      `insert into site_operation
         (site_key, action, target_sha, actor_email, status, resulting_sha, provenance, source_ref,
          created_at, finished_at)
       values ($1, $2, $3, $4, 'succeeded', $5, 'backfill-audit', $6, $7, $7)
       on conflict do nothing
       returning id`,
      [siteKey, row.detail.mode, target, row.actor, head, String(row.id), row.at]
    )
    if (inserted.rows.length) {
      report.written++
      log(`wrote ${siteKey} ${row.detail.mode} ${head.slice(0, 12)} (audit ${row.id})`)
    } else report.already++
  }
  return report
}
