// WHAT A DOOR STILL OWES A HOST JOB IT STOPPED WAITING FOR (`063-site-job-follow-up.sql`, ledger L31).
//
// `POST /moment` and `POST /turn` (`route.js`) each run one webroot job on the host and wait for it as
// long as the dsh that called them waits. The host may need far longer — one site's webroot jobs wait
// for each other — and a door that answered and forgot the job left its own work undone: the turn was
// never closed with the commit the host made (it read `stale`), and the outside commits a seal made
// were never kept. So the work travels with the job:
//
//   fileFollowUp   writes the job's `job` row and what its door owes in ONE statement, before the
//                  door's first poll: neither a restart mid-wait nor a crash between two writes leaves
//                  a job with nothing owed.
//   followThrough  once the job has ended (`done`/`failed`), or will no longer be asked about
//                  (`expired`): deletes the row and does the door's work in ONE transaction. Whoever
//                  gets there first — the door within its wait, or the sweep afterwards, on any
//                  replica — does it, and nobody else; a failure part-way rolls the delete back too.
//   handOver       the door's wait ran out with the job still running: the sweep may take it now. For a
//                  seal, the same statement marks the turn as started unsealed, so the sweep can never
//                  judge the seal before the mark it may take off is there.
//   (`POST /go-live` files its own row beside its operation — `publish-store.js` `adoptJob` — and
//   never waits: its work is the publish flag, done by a read of the state or by the sweep.)
//   waitForMoment / releaseHold  option A (10/10/2026): the dsh holds a turn's first write while
//                  an earlier turn of its conversation still has its moment owed, asking `POST /moment/wait`,
//                  which asks the host and follows the moment through the moment it ends; at the dsh's
//                  bound the hold is let go and recorded, so the turns that moment may mix get marked.
//   settleFollowUps  the sweep (`cron.js` `settleDoorFollowUps`): takes the due rows (pushing their next
//                  look out, so another replica leaves them), reads each job row, asks the host when the
//                  row has not ended, follows through once it has, backs off while it has not.
//
// The work is the door's own, done from the host's own answer and nothing else: a job the host failed,
// or whose answer cannot be read, closes no turn — that turn goes stale, as a turn nobody closed
// always did. One exception, because the dsh will not send the close again once the door answered
// 202: a moment that failed only because the site was busy is asked for again, at most
// {@link MOMENT_RETRIES} times, under the same follow-up.
import { jobAnswer } from './operations.js'
import { endGoLive, scriptOutcome } from './publish-store.js'
import { audit, updateJob } from './store.js'
import { clearUnsealedStart, closeTurn, markUnsealedStart, recordOutside } from './turns.js'

/**
 * How long the sweep keeps asking about a job its door stopped waiting for. The host itself gives a
 * job up to 120 s for the site's lock and up to 30 minutes for the machine's heavy lock before the
 * work starts (`webroot-git.sh` `locked`, `run_heavy`), and a host that restarts marks its unfinished
 * jobs failed (`tracy-host` `orphanJobs`), which ends them here too. The local stand's slowest moment
 * took 9.4 hours (05/10/2026, no `flock` on that machine). Past a day the host is not going to say.
 */
export const FOLLOW_UP_MAX_MS = 24 * 60 * 60_000
/**
 * How many more moment jobs the sweep asks for after one that failed because the site was busy. The
 * host's own lock wait is 120 s, so two more cover a site busy for some minutes; past that the turn
 * goes stale like any turn whose moment failed.
 */
export const MOMENT_RETRIES = 2
/**
 * A failure that says the site was busy, not that the moment cannot be made: `webroot-git.sh` giving up
 * on the site's or the machine's lock ("another webroot job holds this site; try again shortly",
 * "another heavy webroot job is running"), git finding another writer's `index.lock`, or the host
 * restarting under the job (`orphanJobs`). Anything else — no repo yet, a refused title — fails the
 * same way again, and is not asked for again.
 */
const BUSY =
  /another (?:heavy )?webroot job|try again shortly|index\.lock|restarted before this job finished/i
/** A job still running is asked about again after a tenth of its age, within these bounds. */
const ASK_AGAIN_MIN_MS = 15_000
const ASK_AGAIN_MAX_MS = 10 * 60_000
/** Past the door's own wait, how long the sweep leaves a row the door never handed over (its process
 * died mid-wait) before taking it. The door's poll loop may overrun its wait by one poll. */
const DOOR_GRACE_MS = 30_000
/** How far a sweep pushes out the next look of the rows it took, so another replica leaves them. Far
 * longer than a run takes (a host that does not answer is asked once per run, 10 s at most); a sweep
 * that dies mid-run hands its rows back when it runs out. */
const HOLD_MS = 5 * 60_000

const ENDED = new Set(['done', 'failed'])
/**
 * The doors whose follow-up is given up after {@link FOLLOW_UP_MAX_MS}. A `go-live` is not one of
 * them: what it owes is the end of a publish operation that holds its site until the host says how
 * it went, and a row dropped after a day left that operation with nobody asking for it unless a
 * person happened to open the site. Its row is asked about for as long as the job has no ending
 * (at the longest back-off), and the operation itself is swept as well (`publish.js` `sweepHeld`).
 */
const GIVEN_UP_AFTER_A_DAY = new Set(['moment', 'seal'])

/**
 * File a job's `job` row and what its door will owe it once the host ends it, in one statement —
 * from `runSiteJob`'s `file`, as soon as the host named the job and before any poll.
 * @param {import('pg').Pool} pool
 * @param {{ jobId: string, siteKey: string, host: string, kind: string, door: 'moment' | 'seal',
 *   turnId?: string | null, payload?: Record<string, unknown>, waitMs: number }} owed - `payload`: what
 *   the door holds that the host does not return (a moment's title, who typed, Tracy's answer, how the
 *   turn ended; a seal's `lead`, {@link SEAL_LEAD_MAX_MS}).
 */
export async function fileFollowUp(
  pool,
  { jobId, siteKey, host, kind, door, turnId = null, payload = {}, waitMs }
) {
  await pool.query(
    `with job_row as (
       insert into job (id, site_key, host, kind) values ($1, $2, $7, $8) on conflict (id) do nothing)
     insert into site_job_follow_up (job_id, site_key, door, turn_id, payload, next_at)
     values ($1, $2, $3, $4, $5::jsonb, now() + make_interval(secs => $6::double precision / 1000))
     on conflict (job_id) do nothing`,
    [jobId, siteKey, door, turnId, JSON.stringify(payload), waitMs + DOOR_GRACE_MS, host, kind]
  )
}

/**
 * The door's wait ran out with the job still running: the sweep may take it at once. A seal's turn is
 * marked as started unsealed in the same statement — the dsh lets the agent write once the door
 * answers — and before the sweep can take the row: a sweep that judged the seal first and found the
 * start proven would otherwise have its verdict overwritten by the door's mark a moment later. A row
 * the sweep already followed through is not there to hand over, and then its verdict stands.
 */
export async function handOver(pool, jobId) {
  await pool.query(
    `with handed as (
       update site_job_follow_up set next_at = created_at where job_id = $1 returning door, turn_id)
     update site_turn t set unsealed_start = true
       from handed
      where handed.door = 'seal' and t.turn_id = handed.turn_id`,
    [jobId]
  )
}

/**
 * The longest a turn's door may take from the dsh's call to asking the host for the seal (its checks,
 * the turn row) for a late seal to prove the turn's start ({@link sealProvesStart}). The dsh lets the
 * agent write once the door answers or 15 s after it called (`tracy-site-tabs` `turn-record.mjs`
 * `timeoutMs`); the door's own wait is 12 s with the host's POST inside it (`route.js`
 * `SEAL_WAIT_MS`). Asked within 2 s, the host made the seal's record before the dsh could let any
 * write go, with a second to spare for the call between them. Asked later, a write may come before
 * the seal's record — a window no job's times can speak for.
 */
export const SEAL_LEAD_MAX_MS = 2_000

/**
 * Job kinds that never commit in a site's webroot Git: `webroot-git.sh`'s read-only ops, the CMS log,
 * a WordPress look's own undo store (the database's Additional CSS, `tracy-host` `look-css.js`), the
 * site's settings read, the webroot's pack. Every other kind may commit — an unknown one included.
 */
const NEVER_COMMITS = Object.freeze([
  'cms-log-pull',
  'site-look-css',
  'site-settings',
  'webroot-commit',
  'webroot-file-diff',
  'webroot-file-show',
  'webroot-pack',
  'webroot-turn-moments',
  'webroot-undo-check'
])

/**
 * Whether a seal that ended after its door stopped waiting still proves where its turn began, so the
 * `unsealed_start` its door marked can come off (09/10/2026, dskeepjo: a Joomla seal ran 15.3 s on the
 * host with nothing else on the site, found nothing to seal, and the turn's Undo was refused as "mixed
 * with another request" — as is every turn whose seal outlives the door's 12 s and that left files).
 *
 * The mark stands for two risks: what was dirty before the turn sits in its moment, and what its
 * agent wrote before the seal looked was committed somewhere else. Both are ruled out when:
 *   - the door asked the host within {@link SEAL_LEAD_MAX_MS}: no write of the agent comes before the
 *     seal's record (`createdAt`, the host's clock);
 *   - the seal answered, sealed nothing and skipped nothing (`webroot-git.sh` `seal_outside_op`):
 *     nothing was dirty when it looked, so nothing from before the turn is left for its moment, and
 *     nothing the agent had written yet was waiting either;
 *   - and no other job of the site that may commit ran while the seal waited and looked
 *     (`createdAt`..`updatedAt` of each, the same host's clock): every webroot job that commits takes
 *     the site's lock, so a commit in that window — the previous turn's late moment, a look at
 *     Changes, a restore — is the only way a file changed before the turn, or written by the agent
 *     before the seal looked, could have left the worktree unseen. A moment that committed nothing
 *     and a seal that sealed nothing count as not having committed; a job whose times are not known
 *     yet counts as having run in the window. So does the moment of an earlier turn of the same
 *     conversation still running when the turn opened — unless the dsh held this turn's first write
 *     until that moment had ended (`heldBehind`, option A of 10/10/2026: `POST /moment/wait`) and did
 *     not let it go at its bound: then that moment cannot hold any write of this turn, and what it
 *     committed from before the turn is the earlier turn's.
 * Anything not proven keeps the mark: it only ever blocks an undo.
 *
 * @param {{ answer: any, createdAt: unknown, updatedAt: unknown, lead: unknown, heldBehind?: unknown }} seal -
 *   the seal's answer (read), the host's record times (epoch ms), the door's lead (ms), and the moment
 *   jobs the dsh held this turn's first write behind (none once the hold was let go at its bound)
 * @param {Array<{ id?: string, kind: string, state: string, detail: any }>} others - the site's other
 *   jobs that may have run in the seal's window (`job` rows)
 * @param {(output: unknown) => any} read - `jobAnswer`
 * @returns {boolean}
 */
export function sealProvesStart(seal, others, read) {
  const { answer, createdAt: from, updatedAt: to, lead } = seal
  if (typeof lead !== 'number' || !Number.isFinite(lead) || lead < 0 || lead > SEAL_LEAD_MAX_MS) return false
  if (answer?.ok !== true || answer.sealed !== null || (answer.skipped ?? null) !== null) return false
  if (typeof from !== 'number' || typeof to !== 'number' || !(from <= to)) return false
  const heldBehind = Array.isArray(seal.heldBehind) ? seal.heldBehind : []
  return others.every((job) => {
    if (NEVER_COMMITS.includes(job.kind)) return true
    if (job.kind === 'webroot-moment' && typeof job.id === 'string' && heldBehind.includes(job.id))
      return true
    const d = job.detail
    const start = typeof d?.createdAt === 'number' ? d.createdAt : null
    // Asked for after the seal had ended: it cannot have run before the seal looked.
    if (start !== null && start > to) return true
    const end = ENDED.has(job.state) && typeof d?.updatedAt === 'number' ? d.updatedAt : null
    if (start === null || end === null) return false
    // Ended before the seal was asked for: before any write of the agent.
    if (end < from) return true
    if (job.state !== 'done') return false
    const said = read(d.output)
    if (said?.ok !== true) return false
    if (job.kind === 'webroot-moment') return said.committed === false
    if (job.kind === 'webroot-seal-outside') return said.sealed === null
    return false
  })
}

/**
 * {@link sealProvesStart} for a seal followed through with `answer` (read), on a turn still marked: the
 * door's lead from the follow-up, the seal's host times from its `job` row, and the site's other jobs
 * that may have run in its window. A day back is the follow-up's own bound.
 * @param {import('pg').PoolClient} db
 * @param {any} owed - the follow-up row
 * @param {any} answer
 */
async function lateSealProvesStart(db, owed, answer) {
  const { rows: turn } = await db.query('select unsealed_start from site_turn where turn_id = $1', [
    owed.turn_id
  ])
  if (turn[0]?.unsealed_start !== true) return false
  const { rows: sealRows } = await db.query('select detail, created_at from job where id = $1', [owed.job_id])
  const sealJob = sealRows[0]
  if (!sealJob) return false
  const seal = {
    answer,
    createdAt: sealJob.detail?.createdAt,
    updatedAt: sealJob.detail?.updatedAt,
    lead: owed.payload?.lead,
    // A hold let go at its bound (`releaseHold`) vouches for nothing.
    heldBehind: owed.payload?.released === true ? [] : owed.payload?.heldBehind
  }
  if (typeof seal.createdAt !== 'number') return false
  const { rows: others } = await db.query(
    `select id, kind, state, detail from job
      where site_key = $1 and id <> $2 and kind <> all($3::text[])
        and created_at > $4::timestamptz - make_interval(secs => $5::double precision / 1000)
        and (state not in ('done', 'failed')
             or jsonb_typeof(detail -> 'updatedAt') is distinct from 'number'
             or (detail ->> 'updatedAt')::double precision >= $6)`,
    [owed.site_key, owed.job_id, NEVER_COMMITS, sealJob.created_at, FOLLOW_UP_MAX_MS, seal.createdAt]
  )
  return sealProvesStart(seal, others, jobAnswer)
}

/**
 * A moment that ran on after the dsh let the next turn of its conversation write (`releaseHold`) and
 * committed: its commit may hold that turn's first edits. The moment's turn is marked `concurrent`
 * (its moments may hold another request's files — the next turn's) and each turn the hold was let go
 * for `unsealed_start` (its first edits may sit in the earlier moment), so an undo that would split
 * them is refused rather than silently taking the wrong files.
 * @param {import('pg').PoolClient} db
 * @param {any} owed - the moment's follow-up row
 */
async function markHeldTooLong(db, owed) {
  if (!owed.turn_id) return
  const later = Array.isArray(owed.payload?.releasedFor)
    ? owed.payload.releasedFor.filter((id) => typeof id === 'string')
    : []
  await db.query('update site_turn set concurrent = true where turn_id = $1 and site_key = $2', [
    owed.turn_id,
    owed.site_key
  ])
  if (later.length > 0)
    await db.query(
      'update site_turn set unsealed_start = true where turn_id = any($1::text[]) and site_key = $2',
      [later, owed.site_key]
    )
}

/**
 * The moments still owed (their job not followed through) for the earlier turns of conversation
 * `sessionId` on `siteKey`: what a new turn's first write must wait for (option A, 10/10/2026).
 * @param {import('pg').Pool | import('pg').PoolClient} pool
 * @param {string} siteKey
 * @param {string} sessionId
 * @param {number} beforeTurn
 * @returns {Promise<Array<{ job_id: string, turn_id: string }>>}
 */
export async function owedMomentsOf(pool, siteKey, sessionId, beforeTurn) {
  const { rows } = await pool.query(
    `select f.job_id, f.turn_id from site_job_follow_up f
       join site_turn t on t.turn_id = f.turn_id
      where f.site_key = $1 and f.door = 'moment' and t.session_id = $2 and t.turn < $3
      order by f.created_at`,
    [siteKey, sessionId, beforeTurn]
  )
  return rows
}

/** How often `waitForMoment` asks the host while a moment runs: the door's own poll steps, then this. */
const MOMENT_POLLS_MS = [120, 180, 250, 350, 500]
const MOMENT_POLL_MS = 700

/**
 * Whether the moment of turn `turnId` has ended — asked by the dsh holding the next turn's first write
 * (`POST /moment/wait`), for up to `waitMs`. Ended means no moment of that turn is owed any more: none
 * was handed over, or its job ended and was followed through here (the same once-only work the sweep
 * does, so the turn is closed with its commit before the dsh lets the next turn write). A job asked
 * about when its row has not ended yet; one that failed only because the site was busy, with tries
 * left, is not ended: the sweep asks for it again, and that moment will commit what is dirty then.
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, turnId: string }} which
 * @param {{ pollJob: (job: { host: string, jobId: string }) => Promise<HostAnswer>, waitMs: number,
 *   now?: () => number }} deps
 * @returns {Promise<boolean>}
 */
export async function waitForMoment(pool, { siteKey, turnId }, { pollJob, waitMs, now = Date.now }) {
  const started = now()
  for (let attempt = 0; ; attempt++) {
    const { rows } = await pool.query(
      `select f.job_id, f.door, f.turn_id, f.payload, f.attempts, f.created_at, f.site_key,
              j.host, j.state, j.detail, s.label
         from site_job_follow_up f
         left join job j on j.id = f.job_id
         left join site s on s.site_key = f.site_key
        where f.site_key = $1 and f.door = 'moment' and f.turn_id = $2
        order by f.created_at`,
      [siteKey, turnId]
    )
    if (rows.length === 0) return true
    let open = 0
    for (const row of rows) {
      let state = row.state
      let detail = row.detail
      if (!ENDED.has(state) && row.host) {
        const polled = await pollJob({ host: row.host, jobId: row.job_id }).catch(() => null)
        if (polled?.ok && typeof polled.body?.state === 'string') {
          await updateJob(pool, row.job_id, {
            state: polled.body.state,
            step: polled.body.step,
            detail: polled.body
          })
          state = polled.body.state
          detail = polled.body
        }
      }
      const age = now() - new Date(row.created_at).getTime()
      if (!ENDED.has(state) || (state === 'failed' && busyMoment(row, detail, age))) {
        open++
        continue
      }
      const endedAt = Number.isFinite(detail?.updatedAt) ? new Date(detail.updatedAt) : null
      await followThrough(pool, row.job_id, 'moment', {
        state,
        output: detail?.output,
        endedAt,
        outcome: scriptOutcome(detail)
      })
    }
    if (open === 0) return true
    const pause = MOMENT_POLLS_MS[attempt] ?? MOMENT_POLL_MS
    if (now() - started + pause >= waitMs) return false
    await new Promise((resolve) => setTimeout(resolve, pause))
  }
}

/**
 * The dsh held the next turn's first write behind the moment of `turnId` for as long as it holds one
 * (its bound) and is letting it go now. Recorded on that moment's follow-up — `released`, and the
 * turns of the conversation opened since (`releasedFor`) — so its follow-through marks the turns the
 * moment may mix if it commits (`markHeldTooLong`); and on those turns' own seals, so a late seal no
 * longer takes the moment as harmless (`sealProvesStart` `heldBehind`). Nothing owed any more: the
 * moment has ended, nothing is marked.
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, turnId: string }} which
 * @returns {Promise<boolean>} whether a moment was still owed (and the hold is now let go)
 */
export async function releaseHold(pool, { siteKey, turnId }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    // The moment's row first, as `followThrough` takes it: one of the two waits for the other.
    const { rows } = await client.query(
      `update site_job_follow_up f
          set payload = f.payload || jsonb_build_object('released', true, 'releasedFor', coalesce((
                select jsonb_agg(t.turn_id order by t.turn) from site_turn t join site_turn p on p.turn_id = $2
                 where t.site_key = $1 and t.session_id = p.session_id and t.turn > p.turn), '[]'::jsonb))
        where f.site_key = $1 and f.door = 'moment' and f.turn_id = $2
        returning f.payload -> 'releasedFor' as later`,
      [siteKey, turnId]
    )
    const later = [...new Set(rows.flatMap((row) => (Array.isArray(row.later) ? row.later : [])))]
    if (later.length > 0)
      await client.query(
        `update site_job_follow_up set payload = payload || '{"released": true}'::jsonb
          where site_key = $1 and door = 'seal' and turn_id = any($2::text[])`,
        [siteKey, later]
      )
    await client.query('commit')
    return rows.length > 0
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * The door's work with a job's answer, per door — exactly what the door did inline before L31.
 * `answer.state`: `done` (with `output`), `failed`, or `expired` (the host never said); `endedAt`: when
 * the host ended the job (its record's `updatedAt`), when the sweep heard of it late.
 * @type {Record<string, (db: import('pg').PoolClient, owed: any, answer: { state: string, output?: unknown, endedAt?: Date | null }, pool: import('pg').Pool) => Promise<void>>}
 */
const WORK = {
  // `POST /moment`: the audit line, then the turn closed with the commit the host made. A moment the
  // dsh stopped holding the next turn's first write for (`releaseHold`) that committed — or of which the
  // host never said anything — may hold that write: the turns it may mix are marked.
  // 🔒 THE TURN CLOSES HOWEVER THE JOB ENDED: its agent has stopped either way, and how it ended
  // (`endReason`) is what tells a demo build its agent failed. A job that failed (a site with no webroot
  // yet), expired or answered unreadably committed nothing the door can name: no sha, no files, no
  // audit line — before, the follow-up was dropped and the turn read `open` until the reaper.
  async moment(db, owed, answer) {
    const data = answer.state === 'done' ? jobAnswer(answer.output) : null
    const recorded = data?.ok === true
    const committed = recorded && data.committed === true
    if (owed.payload?.released === true && (answer.state === 'expired' || committed))
      await markHeldTooLong(db, owed)
    const {
      title = null,
      actor = null,
      reply = null,
      endReason = null,
      work = null,
      usage = null
    } = owed.payload ?? {}
    if (recorded)
      await audit(db, {
        actor,
        action: 'site.moment',
        siteKey: owed.site_key,
        detail: {
          title,
          committed,
          head: data.head ?? null,
          ...(owed.turn_id ? { turnId: owed.turn_id } : {})
        }
      })
    if (!owed.turn_id) return
    await closeTurn(db, {
      turnId: owed.turn_id,
      siteKey: owed.site_key,
      sha: committed && typeof data.sha === 'string' ? data.sha : null,
      files: recorded && Number.isInteger(data.files) ? data.files : 0,
      reply,
      endReason,
      work,
      usage,
      filedAt: owed.created_at,
      closedAt: answer.endedAt ?? null
    })
  },
  // `POST /turn`'s seal: the outside commits it reports (its own seal, a deploy's, housekeeping), or,
  // when it did not seal, the turn marked as started unsealed. A seal that ended after the door
  // stopped waiting (the door marked the turn when it handed the seal over) takes the mark off again
  // when it proves the turn's start all the same (`sealProvesStart`).
  async seal(db, owed, answer) {
    const data = answer.state === 'done' ? jobAnswer(answer.output) : null
    if (data?.ok === true) {
      await recordOutside(db, owed.site_key, [
        ...(Array.isArray(data.outside) ? data.outside : []),
        ...(data.sealed ? [{ ...data.sealed, cause: 'seal' }] : [])
      ])
      if (owed.turn_id && (await lateSealProvesStart(db, owed, data)))
        await clearUnsealedStart(db, owed.turn_id)
    } else if (owed.turn_id) {
      await markUnsealedStart(db, owed.turn_id)
    }
  },
  // `POST /go-live`: the publish flag and the site's operation, once the host's job has ended.
  'go-live': endGoLive
}

/**
 * Do what `door` owes the job `jobId`, if it is still owed: the row's delete and the work commit
 * together, so the work is done once whoever calls this, and never half.
 * @param {import('pg').Pool} pool
 * @param {string} jobId
 * @param {'moment' | 'seal' | 'go-live'} door
 * @param {{ state: 'done' | 'failed' | 'expired', output?: unknown, endedAt?: Date | null }} answer
 * @returns {Promise<Record<string, unknown> | null>} the follow-up done here, or null when nothing was owed
 */
export async function followThrough(pool, jobId, door, answer) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows } = await client.query(
      'delete from site_job_follow_up where job_id = $1 and door = $2 returning *',
      [jobId, door]
    )
    const owed = rows[0] ?? null
    if (owed && Object.hasOwn(WORK, door)) await WORK[door](client, owed, answer, pool)
    await client.query('commit')
    if (owed && door === 'moment' && owed.turn_id) turnClosed(owed.site_key, owed.turn_id)
    return owed
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * Close the turn of a moment the host never took (it refused the job, or did not answer the POST): no
 * job, so no follow-up and no commit, but the agent has stopped and how it ended is kept. A host that
 * took the job after all, or a close sent again, commits its own close later (`closeTurn` merges them).
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, turnId: string, payload?: Record<string, any> | null }} moment
 */
export async function closeUnfiledMoment(pool, { siteKey, turnId, payload = null }) {
  const { reply = null, endReason = null, work = null, usage = null } = payload ?? {}
  const closed = await closeTurn(pool, {
    turnId,
    siteKey,
    sha: null,
    files: 0,
    reply,
    endReason,
    work,
    usage,
    filedAt: new Date()
  })
  if (closed) turnClosed(siteKey, turnId)
  return closed
}

/** @type {Set<(turn: {siteKey: string, turnId: string}) => unknown>} */
const turnClosedListeners = new Set()

/**
 * Be told, after it is committed, that a chat turn on a site was closed with its moment — however it got
 * there (the door waiting, the sweep). Another domain's work (the demo QA gate) starts from it; it runs
 * detached and its failure is its own. Returns the unsubscribe.
 * @param {(turn: {siteKey: string, turnId: string}) => unknown} listener
 */
export function onTurnClosed(listener) {
  turnClosedListeners.add(listener)
  return () => turnClosedListeners.delete(listener)
}

function turnClosed(siteKey, turnId) {
  for (const listener of turnClosedListeners)
    Promise.resolve()
      .then(() => listener({ siteKey, turnId }))
      .catch(() => {})
}

/** Whether a `settleFollowUps` run is going in this process: the next tick skips rather than ask the
 * same hosts about the same rows while the first still waits. Replicas are kept apart by the rows'
 * hold (`HOLD_MS`), and the work itself by the transaction in `followThrough`. */
let settling = false

/**
 * @typedef {{ ok: boolean, status?: number, body?: any }} HostAnswer
 * @typedef {{ pollJob: (job: { host: string, jobId: string }) => Promise<HostAnswer>,
 *   startJob?: (job: { host: string, input: Record<string, unknown> }) => Promise<HostAnswer>,
 *   now?: () => number, limit?: number, log?: Pick<Console, 'info' | 'warn'> }} SweepDeps
 *   `startJob`: file a webroot job on a host (`POST /_host/site`) — how a busy site's moment is asked
 *   for again; without it, it is not.
 */

/**
 * The sweep: takes every owed job that is due, reads it from its `job` row — asked of the host when
 * the row has not ended (and the answer written as a poll writes it) — and follows it through once it
 * has. A job still running is asked about again later; one older than {@link FOLLOW_UP_MAX_MS} is given
 * up. A host that gives no answer is asked once per run: the rest of its rows wait for the next.
 * @param {import('pg').Pool} pool
 * @param {SweepDeps} deps
 * @returns {Promise<{ ran: boolean, settled: number, expired: number, retried: number }>}
 */
export async function settleFollowUps(
  pool,
  { pollJob, startJob, now = Date.now, limit = 50, log = console }
) {
  if (settling) return { ran: false, settled: 0, expired: 0, retried: 0 }
  settling = true
  try {
    const at = now()
    const { rows: taken } = await pool.query(
      `with due as (
         select job_id from site_job_follow_up
          where next_at <= $1
          order by next_at
          limit $2
          for update skip locked)
       update site_job_follow_up f set next_at = $3
         from due where f.job_id = due.job_id
       returning f.job_id`,
      [new Date(at), limit, new Date(at + HOLD_MS)]
    )
    if (taken.length === 0) return { ran: true, settled: 0, expired: 0, retried: 0 }
    const { rows } = await pool.query(
      `select f.job_id, f.door, f.turn_id, f.payload, f.attempts, f.created_at, f.site_key,
              j.host, j.state, j.detail, s.label
         from site_job_follow_up f
         left join job j on j.id = f.job_id
         left join site s on s.site_key = f.site_key
        where f.job_id = any($1::text[])
        order by f.created_at`,
      [taken.map((row) => row.job_id)]
    )
    const unreachable = new Set()
    let settled = 0
    let expired = 0
    let retried = 0
    for (const row of rows) {
      const age = at - new Date(row.created_at).getTime()
      const later = Math.min(ASK_AGAIN_MAX_MS, Math.max(ASK_AGAIN_MIN_MS, Math.round(age / 10)))
      const askAgain = () =>
        pool.query('update site_job_follow_up set next_at = $2 where job_id = $1', [
          row.job_id,
          new Date(at + later)
        ])
      try {
        let state = row.state
        let detail = row.detail
        if (!ENDED.has(state) && row.host && !unreachable.has(row.host)) {
          const polled = await pollJob({ host: row.host, jobId: row.job_id }).catch(() => null)
          if (polled?.ok && typeof polled.body?.state === 'string') {
            await updateJob(pool, row.job_id, {
              state: polled.body.state,
              step: polled.body.step,
              detail: polled.body
            })
            state = polled.body.state
            detail = polled.body
          } else if (!polled || polled.status === 0) {
            unreachable.add(row.host)
          }
        }
        if (ENDED.has(state)) {
          if (state === 'failed' && busyMoment(row, detail, age)) {
            if (await askForMomentAgain(pool, row, startJob, at, log)) retried++
            else await askAgain()
            continue
          }
          const endedAt = Number.isFinite(detail?.updatedAt) ? new Date(detail.updatedAt) : null
          // `outcome`: what the record says its script did. A record that ended without the script's
          // exit code (the host restarted, the site was held, the ending could not be written) names
          // none — for a go-live, not an ending (`publish-store.js` `settleGoLive`).
          if (
            await followThrough(pool, row.job_id, row.door, {
              state,
              output: detail?.output,
              endedAt,
              outcome: scriptOutcome(detail)
            })
          )
            settled++
        } else if (age >= FOLLOW_UP_MAX_MS && GIVEN_UP_AFTER_A_DAY.has(row.door)) {
          if (await followThrough(pool, row.job_id, row.door, { state: 'expired' })) {
            expired++
            log.warn?.(
              `[follow-up] ${row.door} job ${row.job_id}: no ending from the host in a day, given up`
            )
          }
        } else {
          await askAgain()
        }
      } catch (error) {
        const why = error?.message ?? String(error)
        if (age >= FOLLOW_UP_MAX_MS && GIVEN_UP_AFTER_A_DAY.has(row.door)) {
          // Its work has failed for a day: dropped without it, and said once.
          const dropped = await pool
            .query('delete from site_job_follow_up where job_id = $1', [row.job_id])
            .catch(() => ({ rowCount: 0 }))
          if (dropped.rowCount) {
            expired++
            log.warn?.(`[follow-up] ${row.door} job ${row.job_id}: its work kept failing (${why}), given up`)
          }
        } else {
          // One row that cannot be done now (its work threw and rolled back) waits its turn again; it
          // never holds the rows behind it.
          log.warn?.(`[follow-up] ${row.door} job ${row.job_id}: ${why}`)
          await askAgain().catch(() => {})
        }
      }
    }
    if (settled > 0)
      log.info?.(`[follow-up] followed through ${settled} job(s) their door stopped waiting for`)
    return { ran: true, settled, expired, retried }
  } finally {
    settling = false
  }
}

/**
 * Whether a failed job is a moment that failed only because its site was busy, and may still be asked
 * for again: fewer than {@link MOMENT_RETRIES} asked already, within the bound, on a site still known.
 */
function busyMoment(row, detail, age) {
  if (row.door !== 'moment' || row.attempts >= MOMENT_RETRIES || age >= FOLLOW_UP_MAX_MS) return false
  if (!row.host || !row.label || typeof row.payload?.title !== 'string') return false
  const said = [detail?.output, detail?.detail].filter((part) => typeof part === 'string').join('\n')
  return BUSY.test(said)
}

/**
 * Ask the host for the moment once more — the same job the door asked for — and point the follow-up at
 * the new job, its `job` row written in the same statement. A host that does not take it leaves the
 * follow-up on the failed job, to be asked for again next run.
 * @returns {Promise<boolean>} whether the host took it
 */
async function askForMomentAgain(pool, row, startJob, at, log) {
  if (!startJob) return false
  const input = {
    kind: 'webroot-moment',
    title: row.payload.title,
    ...(row.turn_id ? { turn: row.turn_id } : {}),
    label: row.label
  }
  const answer = await startJob({ host: row.host, input }).catch(() => null)
  if (!answer?.ok || typeof answer.body?.jobId !== 'string') return false
  const jobId = answer.body.jobId
  await pool.query(
    `with job_row as (
       insert into job (id, site_key, host, kind) values ($2, $3, $4, 'webroot-moment') on conflict (id) do nothing)
     update site_job_follow_up set job_id = $2, attempts = attempts + 1, next_at = $5 where job_id = $1`,
    [row.job_id, jobId, row.site_key, row.host, new Date(at + ASK_AGAIN_MIN_MS)]
  )
  log.info?.(
    `[follow-up] moment job ${row.job_id} failed while the site was busy; asked again as ${jobId} (${row.attempts + 1}/${MOMENT_RETRIES})`
  )
  return true
}
