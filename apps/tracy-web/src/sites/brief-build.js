/**
 * "Apply" in the Add site popup: the customer's text and pictures, made WHILE the site installs and
 * written into it the moment it is up — so a site born with a brief is ready about when a site born
 * without one is.
 *
 * THE SHAPE, AND WHY IT IS THIS SHAPE (03/10/2026, the request that started it: a site born with the
 * customer's words must take about as long to init as one born without). Installing a CMS is
 * ~60-190 s of waiting on a container and a download. Writing the words is waiting on a model. The two
 * have nothing to say to each other until the very end, so they run side by side:
 *
 *     press ──┬─ the host installs the site ─────────────────────────┐
 *             └─ `normalize` → `engine.prepare` (model + pictures) ───┤ both done?
 *                                                                     └─ `engine.apply` (seconds)
 *
 * Only `apply` needs the site, and `apply` is a handful of writes. What the customer waits for beyond
 * the plain road is therefore `max(0, prepare − install) + apply`, and `prepare` is made short by
 * running its model calls concurrently (the engines' job), not by doing less.
 *
 * 🔒 THE PLAIN ROAD IS UNTOUCHED. "I will do it later" sends no brief, writes no row, and the poll door
 * asks nothing of this module for a site that has none (`gate` answers `open: false` on no row at all).
 *
 * 🔒 FAILURE IS SOFT AND SAID. A model that is down, a picture that did not come, a write the site
 * refused: the site is still handed over, wearing the template's own words, and the row carries what
 * did not happen (`error`). Nobody is asked anything — the customer pressed Apply to NOT be asked.
 *
 * 🔒 THE WRITES ARE THE CREATOR'S, THROUGH THE SAME DOOR THE AGENT'S TOOLS USE. `engine.apply` calls the
 * Apply door (`POST /api/sites/:key/apply`) with a short-lived session of the person who pressed Apply
 * and owns the site, so the seat book, the toolsets, the write lease and the audit trail all see an
 * ordinary person making ordinary writes. This module never touches a database or a webroot itself.
 *
 * The state lives in `site_brief`, not in a variable: the replica that does the work and the replica
 * that answers the wizard's poll need not be the same one, and a deploy can interrupt either.
 */
import { randomUUID } from 'node:crypto'

import {
  advanceBrief,
  briefOf,
  claimWork,
  isOpen,
  markProvisioned,
  putBrief,
  restartBrief,
  updateBrief
} from './brief-store.js'

/**
 * The host's step once the CMS is fully up and only the site's folder on the host is left to build (measured 03/10/2026:
 * Joomla spends ~17 s there, WordPress ~1 s, EmDash ~0). The runner does not wait for `done`: the content door answers
 * from the moment this step starts, and the words are written during the folder's last seconds instead of after them. A
 * host that words it otherwise (or cannot say) costs nothing — the poll door's `done` still starts the writing.
 */
const SITE_IS_UP = /building the site folder/i

/** What the wizard's console says while a site's words are being made and written, in the customer's terms. */
export const STAGE = Object.freeze({
  writing: 'writing your text and pictures',
  placing: 'placing your text and pictures on the site'
})

/** The longest any phase may take before the work gives up on it and hands the site over as it is. */
export const DEFAULT_LIMITS = Object.freeze({
  /** `normalize` + `prepare`, counted from the press. */
  prepareMs: 5 * 60_000,
  /**
   * Once the site is up: how long `prepare` may still run before it is told to hand back what is ready (its signal fires).
   * Also the backstop past `prepareMs` for a `prepare` that does not honour its own deadline.
   */
  prepareGraceMs: 90_000,
  /** Told to hand back what is ready, how long `prepare` has to do it before the site is handed over with the template's words. */
  prepareStopMs: 10_000,
  /** `apply`, counted from the moment the site is up. */
  applyMs: 3 * 60_000,
  /** The brand step (name, logo, favicon) after `apply`, on its own clock: a slow upload never holds the words. */
  brandMs: 90_000,
  /** Each of the two webroot steps of a run (`holdWebroot`): the host's seal or moment job, polled to its end. */
  webrootMs: 60_000,
  /** The whole run, whatever happens: a worker that is still going after this is stuck. */
  runMs: 25 * 60_000,
  /** An open row nobody has touched for this long belongs to a worker that died (a deploy). */
  staleMs: 4 * 60_000,
  /**
   * At a process's start: an open row whose heartbeat (every 5 s) has been silent this long has no live worker anywhere,
   * so it is settled then and there instead of after `staleMs` (run 1–3 on wo2, L3).
   */
  lostAfterMs: 30_000
})

/** The code a row settled at a process's start carries (`timings.lost`): its worker died with the process before. */
export const LOST_ON_RESTART = 'LOST_ON_RESTART'

/** The sentence a failed row carries when its worker died with the process before it began writing into the site. */
export const LOST_WORK =
  'Tracy restarted before your text and pictures were written, so the site has the template’s own words.'

/** The note an applied row carries when its worker died while writing, after some writes were kept on the row (TCH #887). */
export const LOST_PART =
  'Tracy restarted while your text and pictures were being placed, so only part of them reached the site; the rest keeps the template’s words.'

/** The sentence a failed row carries when its worker died just as writing began, before any write was kept on the row. */
export const LOST_PLACING =
  'Tracy restarted just as your text and pictures were being placed, so the site may still have the template’s own words.'

/**
 * How an open row whose worker died with its process ends (TCH #887: a deploy in the middle of `apply` used to read as "the
 * site has the template's own words" whatever had been written). The row itself is the evidence: every apply id a write
 * named is saved on it the moment it is named (`timings.applyIds`, or `timings.reusedApplyIds` for one it did not mint), so
 *   - not yet `applying` → nothing was written into the site: `failed`, and the template's words are what it has;
 *   - `applying` with apply ids → part of the words are in: `applied`, with a note saying the rest did not come. Not `failed`,
 *     because a failed row is one a second press puts back to work (`restartBrief`) — over the words already written;
 *   - `applying` with none kept → a write may have landed in the instant before its id was saved: `failed`, said as "may".
 * The run is not resumed: what `prepare` made lived in the dead process's memory, and making it again means new words from
 * the model over the ones already placed. The apply ids stay on the row, so what was written can still be undone.
 * @param {{state: string, timings?: {applyIds?: string[], reusedApplyIds?: string[]} | null}} row
 * @returns {{state: 'applied' | 'failed', error: string}}
 */
export function lostEnding(row) {
  if (row.state !== 'applying') return { state: 'failed', error: LOST_WORK }
  // A write that reused an apply id (a design trim's `dtrim-seed`) reached the site as surely as one that minted its own.
  const kept = (row.timings?.applyIds?.length ?? 0) + (row.timings?.reusedApplyIds?.length ?? 0)
  if (kept > 0) return { state: 'applied', error: LOST_PART }
  return { state: 'failed', error: LOST_PLACING }
}

/**
 * `promise`, or a rejection after `ms` of REAL time (the injected `sleep` is for polling only: a test
 * that makes it instant must not make every time limit instant too). The timer is always cleared.
 * @template T
 * @param {Promise<T>} promise @param {number} ms @param {string} message
 * @returns {Promise<T>}
 */
/**
 * Whether the brief asks for words on the site: a description to write from, or a language other than English to write in.
 * A name alone is the brand step's, never a line of the template's words.
 * @param {{ brief?: { about?: unknown } | null, normalized?: { languages?: unknown } | null }} ctx
 */
export function wordsAsked(ctx) {
  if (String(ctx.brief?.about ?? '').trim() !== '') return true
  const languages = Array.isArray(ctx.normalized?.languages) ? ctx.normalized.languages : []
  return languages.some((tag) => typeof tag === 'string' && !/^en(?:[-_]|$)/i.test(tag))
}

function withTimeout(promise, ms, message) {
  let timer
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), Math.max(1, ms))
  })
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}

/**
 * @typedef {object} BriefInput
 * @property {string} siteKey
 * @property {string | null} accountId
 * @property {string} email - the person who pressed Apply and owns the site
 * @property {string} label
 * @property {string} platform
 * @property {string | null} quickstart - the release tag the site installs from
 * @property {{id: string, dir: string} | null} [contract] - the profile sealing that release (`contractFor`); not stored on the row, a run holds it in memory
 * @property {string} [jobId] - the host's provision job; with `host`, what lets the work notice the site is up before the wizard does
 * @property {string} [host] - the host that job runs on
 * @property {string} [retryActionId] - the server-held WO action resuming an existing failed brief
 * @property {{about: string, goal: string | null, style: string | null}} brief
 */

/**
 * @typedef {object} BriefContext what an engine is told; everything it needs and nothing it should not hold.
 * @property {string} siteKey
 * @property {string} label
 * @property {string} platform
 * @property {string | null} quickstart
 * @property {{id: string, dir: string} | null} contract - null for a release nothing seals: its words stay as released
 * @property {string} email
 * @property {string} runId - this run's id: the Apply door records every write of the run under it ("Tracy setup")
 * @property {{about: string, goal: string | null, style: string | null}} brief
 * @property {any} normalized - what `normalize` read out of the brief (name, languages, tone, ...)
 * @property {AbortSignal} signal
 * @property {(phase: string, ms: number) => void} time - record how long a phase of the engine took
 * @property {(note: string) => void} note - say something the report should carry
 * @property {(applyId: string, how?: {reused: boolean}) => void} applied - an apply id a write named (`recordedDoor`): kept on
 *   the row so the whole Apply can be undone; a `reused` one (not minted by this Apply) is kept apart
 * @property {number} deadlineAt - epoch ms by which `prepare` should hand back what it has
 */

/**
 * @typedef {object} BriefEngine
 * @property {(ctx: BriefContext) => Promise<unknown>} prepare - no live site is needed or available
 * @property {(ctx: BriefContext, prepared: unknown) => Promise<{wrote?: number, kept?: number}>} apply
 * @property {(prepared: unknown) => Promise<void>} [dispose] - whatever `prepare` left behind (files), whatever became of the run
 */

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {Record<string, BriefEngine>} deps.engines - by platform
 * @param {(input: BriefInput) => Promise<any>} deps.normalize - brief → what the engines read
 * @param {() => number} [deps.now]
 * @param {{info?: Function, warn?: Function}} [deps.log]
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 * @param {number} [deps.pollMs]
 * @param {number} [deps.jobPollMs] - how often the host's job is asked while waiting for the site
 * @param {(host: string, jobId: string) => Promise<{state?: string, step?: string | null} | null>} [deps.hostJob] - the host's own
 *   word on a provision job; absent, only the poll door can say the site is up
 * @param {(siteKey: string, email: string) => Promise<unknown>} [deps.pairSite] - connect the site's content door
 *   before the host says `done` (the poll door's handover does it, later, as a no-op)
 * @param {(ctx: BriefContext, step: {applyId: string}) => Promise<{written: string[], skipped: Array<{where: string, reason: string}>}>} [deps.brand]
 *   - the "set the site's brand" step (`brief-engines/brand.js` `createSiteBrand`): run after `apply`, whatever became of it
 * @param {Partial<typeof DEFAULT_LIMITS>} [deps.limits]
 */
export function createBriefBuilds({
  pool,
  engines,
  normalize,
  now = Date.now,
  log = console,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollMs = 400,
  jobPollMs = 1500,
  hostJob = null,
  pairSite = null,
  brand = null,
  webroot = null,
  limits = {},
  recoverOnStart = true
}) {
  const cap = { ...DEFAULT_LIMITS, ...limits }
  /** @type {Map<string, Promise<void>>} the runs this process is doing */
  const running = new Map()

  /**
   * Settle the open rows no live worker holds, the moment this process starts (it is built once, at boot). A row silent
   * for `lostAfterMs` is settled at once; a fresher one is looked at again after that wait and settled only if its
   * `updated_at` has not moved — a live worker in another replica beats every 5 s, so its row is never taken.
   *
   * Settled, not run again: before `applying` nothing reached the site, but the run's inputs (the owner's email, the
   * sealing profile, the host job) live only in the request that started it, not on the row. The ending is `lostEnding`'s.
   * One statement per row, pinned on the `updated_at` seen (this module's only own query: `advanceBrief` has no pin).
   */
  async function recoverLost() {
    const { rows } = await pool.query(
      `select b.site_key, b.state, b.timings, b.updated_at::text as seen,
              extract(epoch from now() - b.updated_at) * 1000 as idle_ms
         from site_brief b left join site s on s.site_key = b.site_key
        where b.state = any($1::text[]) and (s.created_at is null or b.created_at >= s.created_at)`,
      [['queued', 'preparing', 'ready', 'applying']]
    )
    const settle = async (/** @type {any} */ row) => {
      if (running.has(row.site_key)) return
      const ending = lostEnding(row)
      const { rowCount } = await pool.query(
        `update site_brief set state = $3, stage = null, error = $4,
           timings = timings || jsonb_build_object('lost', $5::text, 'lostFrom', $2::text), updated_at = now()
         where site_key = $1 and state = $2 and updated_at = $6::timestamptz`,
        [row.site_key, row.state, ending.state, ending.error, LOST_ON_RESTART, row.seen]
      )
      if (rowCount === 1)
        log.warn?.(`[brief] ${row.site_key}: its worker died with a process; ${ending.state}`)
    }
    const fresh = []
    for (const row of rows) {
      if (Number(row.idle_ms) > cap.lostAfterMs) await settle(row)
      else fresh.push(row)
    }
    if (fresh.length === 0) return
    await new Promise((resolve) => setTimeout(resolve, cap.lostAfterMs).unref?.())
    for (const row of fresh) await settle(row)
  }
  const recovered =
    pool && recoverOnStart
      ? recoverLost().catch((error) =>
          log.warn?.(
            `[brief] could not settle the rows of a dead process: ${error instanceof Error ? error.message : error}`
          )
        )
      : Promise.resolve()

  /** Record a failure on the row, softly: the site is handed over as it is. */
  async function fail(siteKey, error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn?.(`[brief] ${siteKey}: ${message}`)
    await advanceBrief(pool, siteKey, ['queued', 'preparing', 'ready', 'applying'], {
      state: 'failed',
      stage: null,
      error: message.slice(0, 500)
    }).catch(() => {})
  }

  /**
   * Wait until the site's content door can be used: the poll door has said `done`, or the host's own job says the CMS is
   * up and only the site folder is left (`SITE_IS_UP`). Returns false when the wait was given up or the build failed.
   * @param {BriefInput} input
   * @param {number} until
   * @param {AbortSignal} [signal] - the run no longer needs to know
   */
  async function waitProvisioned(input, until, signal) {
    const { siteKey } = input
    let nextHostLook = 0
    while (now() < until && !signal?.aborted) {
      const row = await briefOf(pool, siteKey)
      if (!row) return false
      if (row.state === 'failed') return false
      if (row.timings?.provisionedAt) return true
      if (hostJob && input.jobId && input.host && now() >= nextHostLook) {
        nextHostLook = now() + jobPollMs
        const job = await hostJob(input.host, input.jobId).catch(() => null)
        if (job?.state === 'failed') return false
        if (job && (job.state === 'done' || SITE_IS_UP.test(String(job.step ?? '')))) {
          // The door is up. Connect it ourselves — the wizard's handover does it too, and finds it done — and go.
          try {
            await pairSite?.(siteKey, input.email)
          } catch (error) {
            log.warn?.(
              `[brief] ${siteKey}: pairing before done failed (${error instanceof Error ? error.message : error}); waiting for the handover`
            )
            await sleep(pollMs)
            continue
          }
          await updateBrief(pool, siteKey, { timings: { readyAt: now() } }).catch(() => {})
          return true
        }
      }
      await sleep(pollMs)
    }
    return false
  }

  /**
   * What `prepare` made, held to two clocks, whichever ends first (REAL time, as in `withTimeout`): the backstop counted from
   * the press (`prepareMs` + `prepareGraceMs`, for a `prepare` that ignores its own deadline), and, once the site is up, the
   * grace counted from THEN (ledger L07: it used to be the press alone, so a site up after a minute could wait five more). When
   * the grace is over `stop` fires — the signal `prepare` was given — and the engines hand back what is ready (a model call
   * still waiting leaves its slots with the template's words); one that does not within `prepareStopMs` is given up on.
   * @param {Promise<unknown>} preparing
   * @param {Promise<boolean>} siteUp
   * @param {AbortController} stop
   * @param {number} startedAt
   * @returns {Promise<{value: unknown} | {down: true}>} `down`: the site will not come up, so nothing will be written
   */
  async function preparedInTime(preparing, siteUp, stop, startedAt) {
    let settled = false
    /** @type {Array<ReturnType<typeof setTimeout>>} */
    const timers = []
    const after = (/** @type {number} */ ms) =>
      new Promise((resolve) => {
        if (!settled) timers.push(setTimeout(resolve, Math.max(1, ms)))
      })
    const tooLong = () => new Error('writing the text took too long')
    const backstop = after(startedAt + cap.prepareMs + cap.prepareGraceMs - now()).then(() => {
      throw tooLong()
    })
    const graced = siteUp.then(async (up) => {
      if (!up) return /** @type {const} */ ({ down: true })
      await after(cap.prepareGraceMs)
      stop.abort(new Error('the site is up and the words had their time'))
      await after(cap.prepareStopMs)
      throw tooLong()
    })
    try {
      return await Promise.race([preparing.then((value) => ({ value })), backstop, graced])
    } finally {
      settled = true
      for (const timer of timers) clearTimeout(timer)
    }
  }

  /**
   * The customer's name, logo and favicon, written after the words (plan D2). Its own apply id (`brand-<ts>`, kept on the row
   * through `ctx.applied` like every other), its own clock, and its own failure: whatever happens here is a note on the row,
   * never a failed build. It runs whether `apply` wrote the words or threw: the brand does not depend on them.
   * @param {BriefContext} ctx
   */
  async function setBrand(ctx, required = false) {
    if (!brand) {
      if (required) throw new Error('QUICKSTART_BRAND_UNAVAILABLE')
      return
    }
    const t = now()
    try {
      const result = await withTimeout(
        brand({ ...ctx, requireCompleteBrand: required }, { applyId: `brand-${now()}` }),
        cap.brandMs,
        'setting the name, logo and favicon took too long'
      )
      if (required && result?.skipped?.length) throw new Error('QUICKSTART_BRAND_INCOMPLETE')
      if (result?.written?.length)
        log.info?.(`[brief] ${ctx.siteKey}: brand wrote ${result.written.join(', ')}`)
    } catch (error) {
      if (required) throw error
      ctx.note(
        `the name, logo and favicon could not be set: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    ctx.time('brandMs', now() - t)
  }

  /**
   * SC-3: hold the site's webroot for the run, the way a chat turn holds it (`setup-moment.js`): `open` before the first
   * write seals what is already dirty as outside and marks the run's turn open; `close` once the writes are over commits
   * what they left as Tracy's own moment. Each is bounded and soft: a webroot that cannot be held leaves its files to the
   * next look, as before, and never fails the site.
   * @param {'open' | 'close'} step
   * @param {BriefContext} ctx
   * @returns {Promise<boolean>} whether the step was done
   */
  async function holdWebroot(step, ctx) {
    if (!webroot) return false
    try {
      await withTimeout(webroot[step](ctx), cap.webrootMs, `the webroot ${step} took too long`)
      return true
    } catch (error) {
      log.warn?.(
        `[brief] ${ctx.siteKey}: webroot ${step}: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  /** @param {BriefInput} input */
  async function work(input) {
    const { siteKey } = input
    const engine = engines[input.platform]
    if (!engine) return fail(siteKey, `no engine writes content for ${input.platform}`)
    if (!(await claimWork(pool, siteKey))) return
    const startedAt = now()
    // This run's id: every write it makes is recorded under it (`site_write.origin_ref`), so Site changes
    // shows one "Tracy setup" row for the run instead of one Unknown row per write (sweep #4).
    const runId = randomUUID()
    const controller = new AbortController()
    const killer = setTimeout(() => controller.abort(new Error('the run took too long')), cap.runMs)
    // The row's own clock: a worker that is alive keeps touching it, and `gate` reads silence as death.
    const beat = setInterval(() => void updateBrief(pool, siteKey, {}).catch(() => {}), 5_000)
    const phase = {}
    const notes = []
    /**
     * 🔒 EVERY APPLY ID AN APPLY WRITES UNDER IS KEPT ON THE ROW (`timings.applyIds`, first named first; ledger L08). One Apply
     * writes under several — the contract's, the demo trim's, the cleanup's or tidy-up's, the languages', each picture's — and
     * "undo the Apply" is one `apply.revert` per id, newest first. Saved as each new one is named, one save after the other, so a
     * run that dies half-way still says what it wrote; the door is not changed.
     *
     * Every write of the row's end goes through the same chain, and once the run is over (`closed`) an id named late — by an
     * engine still writing after its run gave up on it — is not saved: pressed again, the row is the new run's.
     * @type {string[]}
     */
    const applyIds = []
    /** @type {string[]} the receipts this Apply wrote under without minting them: never part of its undo */
    const reusedApplyIds = []
    let saving = Promise.resolve()
    let closed = false
    /**
     * Run a write of the row after every save already asked for.
     * @template T @param {() => Promise<T>} write @returns {Promise<T>}
     */
    const inTurn = (write) => {
      const done = saving.then(write)
      saving = done.then(
        () => {},
        () => {}
      )
      return done
    }
    /** The apply ids as the row keeps them: this Apply's own, and the ones it reused, each list once there is one. */
    const idsNow = () => ({
      ...(applyIds.length > 0 ? { applyIds: [...applyIds] } : {}),
      ...(reusedApplyIds.length > 0 ? { reusedApplyIds: [...reusedApplyIds] } : {})
    })
    const applied = (/** @type {string} */ id, /** @type {{reused?: boolean}} */ how = {}) => {
      if (closed || applyIds.includes(id) || reusedApplyIds.includes(id)) return
      ;(how.reused ? reusedApplyIds : applyIds).push(id)
      const ids = idsNow()
      void inTurn(() => updateBrief(pool, siteKey, { timings: ids })).catch(() => {})
    }
    /** The timings a row is left with: the phases, and the apply ids once there are any. */
    const timingsNow = (/** @type {Record<string, unknown>} */ more = {}) => ({
      ...phase,
      ...more,
      ...idsNow()
    })
    const time = (name, ms) => {
      phase[name] = Math.round(ms)
    }
    /** What `prepare` handed back, so the engine can clear what it left whatever happens next. */
    let made
    /** @type {Promise<unknown> | undefined} */
    let preparing
    // `prepare` alone is told to hand back what it has once the site is up and the grace is over; `apply` runs on the run's signal.
    const prepareStop = new AbortController()
    const waitStop = new AbortController()
    try {
      await updateBrief(pool, siteKey, { stage: STAGE.writing })
      const t1 = now()
      const workflow = await engine.normalize?.(input)
      const normalized = await normalize({ ...input, workflow: workflow?.workflow ?? null })
      time('normalizeMs', now() - t1)
      if (!(await advanceBrief(pool, siteKey, ['preparing'], { normalized }))) return
      /** @type {BriefContext} */
      const ctx = {
        siteKey,
        label: input.label,
        platform: input.platform,
        quickstart: input.quickstart,
        contract: input.contract ?? null,
        email: input.email,
        runId,
        retryActionId: input.retryActionId ?? null,
        brief: input.brief,
        normalized,
        signal: controller.signal,
        time,
        note: (n) => notes.push(String(n).slice(0, 200)),
        applied,
        deadlineAt: startedAt + cap.prepareMs
      }
      // The words are made while the site is waited for, side by side: the site may come up first, and then the words
      // get `prepareGraceMs` from that moment (`preparedInTime`). `prepare` itself honours `ctx.deadlineAt` too.
      const t2 = now()
      preparing = engine.prepare({ ...ctx, signal: AbortSignal.any([controller.signal, prepareStop.signal]) })
      preparing.catch(() => {})
      /** When the site came up, if it did. */
      let siteUpAt = 0
      const siteUp = waitProvisioned(input, startedAt + cap.runMs, waitStop.signal).then((up) => {
        if (up) siteUpAt = now()
        return up
      })
      siteUp.catch(() => {})
      const outcome = await preparedInTime(preparing, siteUp, prepareStop, startedAt)
      const notUp = async () => {
        prepareStop.abort()
        const row = await briefOf(pool, siteKey)
        if (row && isOpen(row)) await fail(siteKey, 'the site did not come up in time')
      }
      if ('down' in outcome) return await notUp()
      const prepared = (made = outcome.value)
      const preparedAt = now()
      time('prepareMs', preparedAt - t2)
      // How long the site waited for its words: what the grace bounds.
      if (siteUpAt > 0) time('wordsAfterUpMs', Math.max(0, preparedAt - siteUpAt))
      // Only from `preparing`: a row the host's failure abandoned is not put back to work.
      if (!(await advanceBrief(pool, siteKey, ['preparing'], { state: 'ready', timings: phase }))) return

      // The site: wait for it, if it is not up yet. Nothing here costs anything while the host installs.
      if (!(await siteUp)) return await notUp()
      const upAt = now()

      if (!(await advanceBrief(pool, siteKey, ['ready'], { state: 'applying', stage: STAGE.placing }))) return
      const held = await holdWebroot('open', ctx)
      const t3 = now()
      let report = null
      let applyError = null
      // 🔒 THE APPLY STOPS WHERE ITS ROW SAYS IT STOPPED (TCH #1367): the deadline fires its own signal, and the engines' door
      // (`recordedDoor`) refuses every write after it, so nothing lands on the site once the row says `failed`.
      const applyStop = new AbortController()
      try {
        report = await withTimeout(
          engine.apply({ ...ctx, signal: AbortSignal.any([controller.signal, applyStop.signal]) }, prepared),
          made?.workflow === 'quickstart-first/1' ? cap.runMs - 120_000 : cap.applyMs,
          'writing into the site took too long'
        )
      } catch (error) {
        applyError = error
        applyStop.abort(error)
      }
      time('applyMs', now() - t3)
      // Still `applying`: the brand is written before the row says the site is done (plan D2).
      if (made?.workflow !== 'quickstart-first/1' || !applyError) {
        try {
          const assertBrandAllowed = async () => engine.beforeBrand?.(ctx, prepared)
          await assertBrandAllowed()
          await setBrand({ ...ctx, assertBrandAllowed }, made?.workflow === 'quickstart-first/1')
        } catch (error) {
          applyError ??= error
        }
      }
      if (!applyError && engine.verify) {
        try {
          await engine.verify(ctx, prepared, report)
        } catch (error) {
          applyError = error
        }
      }
      // The writes are over, failed or not: what they left on the webroot is the run's (SC-3).
      if (held) await holdWebroot('close', ctx)
      if (applyError) throw applyError
      // 🔒 AN APPLY THAT WROTE NOTHING IS NOT A PLAIN FINISH (TCH #1013, tamq-7q-tbwp3/4 on 08/10/2026): it is said on the row
      // like every other part that did not happen, so the poll door and the assistant can tell the customer.
      if (report && report.wrote === 0)
        notes.unshift('none of your text was written into the site, so it keeps the template’s words')
      // 🔒 …AND WHEN THE CUSTOMER GAVE WORDS TO WRITE, IT IS A FAILURE (TCH #1367, 15/10/2026). Production site jurgens: the text
      // model refused every call ("Missing Authentication header"), not one line of the description reached the site, and the
      // row said `applied`. A brief with no description and the template's own language has nothing to write, and stays a finish.
      if (report && report.wrote === 0 && wordsAsked(ctx)) {
        time('afterUpMs', now() - upAt)
        await inTurn(() =>
          updateBrief(pool, siteKey, { timings: timingsNow({ wrote: 0, kept: report?.kept ?? 0 }) })
        )
        await fail(siteKey, notes.join(' · '))
        return
      }
      time('afterUpMs', now() - upAt)
      await inTurn(() =>
        advanceBrief(pool, siteKey, ['applying'], {
          state: 'applied',
          stage: null,
          error: notes.length ? notes.join(' · ') : null,
          timings: timingsNow({ wrote: report?.wrote ?? 0, kept: report?.kept ?? 0 })
        })
      )
    } catch (error) {
      await inTurn(() => updateBrief(pool, siteKey, { timings: timingsNow() })).catch(() => {})
      await fail(siteKey, error)
    } finally {
      // The run is over: what it started stops, and nothing it names from now on reaches the row.
      closed = true
      controller.abort(new Error('the run is over'))
      prepareStop.abort()
      await saving
      clearTimeout(killer)
      clearInterval(beat)
      waitStop.abort()
      if (made !== undefined) {
        try {
          await engine.dispose?.(made)
        } catch {
          // A file that would not go is not worth failing a finished site over.
        }
      } else if (preparing && engine.dispose) {
        // Given up on before it handed anything back: whatever it hands back later is cleared then.
        const dispose = engine.dispose
        preparing.then((late) => dispose(late)).catch(() => {})
      }
    }
  }

  /** @param {string} siteKey @returns {Promise<{open: boolean, step: string | null, state?: string, error?: string | null}>} */
  async function gate(siteKey) {
    const row = await markProvisioned(pool, siteKey, now())
    if (!row) return { open: false, step: null }
    // A settled row hands back its reason (`error`: what did not happen), so the poll door can say it beside `done`.
    if (!isOpen(row)) return { open: false, step: null, state: row.state, error: row.error ?? null }
    // An open row whose worker died (a deploy) is nobody's: hand the site over, say why. Its age is
    // read on the database clock that stamped `updated_at`, not compared with this process's clock.
    if (!running.has(siteKey) && Number(row.idle_ms) > cap.staleMs) {
      const ending = lostEnding(row)
      const taken = await advanceBrief(pool, siteKey, [row.state], {
        ...ending,
        stage: null,
        timings: { lostFrom: row.state }
      })
      // Another process settled the row between the read and the write: say what it settled.
      if (!taken) return gate(siteKey)
      return { open: false, step: null, state: ending.state, error: ending.error }
    }
    return { open: true, step: row.state === 'applying' ? STAGE.placing : STAGE.writing, state: row.state }
  }

  return {
    /**
     * Write the row and start working on it in the background. Never throws and never waits for the
     * work: the create door answers 202 the moment the host has accepted the install.
     * @param {BriefInput} input
     */
    async start(input) {
      try {
        // A WO retry may restart only an existing failed brief, never create one for a replaced site.
        const { inserted } = input.retryActionId ? { inserted: false } : await putBrief(pool, input)
        // A second press of a build that is going is the same build; one whose install FAILED is provisioned again by
        // this very press, and its words are made again with it (unless the old run is still unwinding here).
        if (
          !inserted &&
          (running.has(input.siteKey) ||
            !(await restartBrief(pool, input.siteKey, input.brief, input.retryActionId)))
        )
          return { started: false }
        const run = work(input)
          .catch((error) => fail(input.siteKey, error))
          .finally(() => running.delete(input.siteKey))
        running.set(input.siteKey, run)
        return { started: true }
      } catch (error) {
        log.warn?.(
          `[brief] could not start ${input.siteKey}: ${error instanceof Error ? error.message : error}`
        )
        return { started: false }
      }
    },

    /**
     * What the poll door asks every time the host says `done`: tell the work the site is up, and say
     * whether the customer must still be told "working". A site made without a brief has no row, so
     * the answer for it is `open: false` and nothing else happens.
     * @param {string} siteKey
     * @returns {Promise<{open: boolean, step: string | null, state?: string, error?: string | null}>}
     */
    gate,

    /**
     * A poll that comes after the site was already handed over: is its text still being written? Answers
     * the same as `gate` for a row the first `gate` has marked up, and `null` for everything else — a site
     * with no brief, a row that is not open any more, or one whose site has not been handed over yet (then
     * the poll does the handover first, and `gate` runs after it).
     * @param {string} siteKey
     * @returns {Promise<{step: string | null, state?: string} | null>}
     */
    async waiting(siteKey) {
      const row = await briefOf(pool, siteKey)
      if (!row || !isOpen(row) || !row.timings?.provisionedAt) return null
      const held = await gate(siteKey)
      return held.open ? held : null
    },

    /**
     * The step to show while the words are placed on a site the host has not finished with: Apply starts the
     * moment the site answers, while the host still records its starting point (#1403 item 7, measured on the stand
     * 16/10/2026: three minutes of "Recording a starting point" while the words went in). Reads only — nothing is
     * marked provisioned. Null when the words are not being placed.
     */
    async placing(siteKey) {
      const row = await briefOf(pool, siteKey)
      return row && isOpen(row) && row.state === 'applying' ? STAGE.placing : null
    },

    /** The host could not install the site: the words have nowhere to go. */
    async abandon(siteKey, reason = 'the site did not come up') {
      await advanceBrief(pool, siteKey, ['queued', 'preparing', 'ready', 'applying'], {
        state: 'failed',
        stage: null,
        error: reason
      })
    },

    /** The start-up settle of the rows a dead process left (`recoverLost`); resolved when it is over. */
    recovered,

    /** Wait for the runs this process started (tests, shutdown). */
    async idle() {
      await Promise.allSettled(running.values())
    }
  }
}
