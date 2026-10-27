/**
 * The design system picked in the Add site form, put on the new site by the server at the end of its build (
 * 12/10/2026). The pick travels with `POST /api/sites {designSystem}`; nothing waits in the browser tab any more, so a
 * reload or a closed tab during the build no longer leaves the site silently wearing the template's own look.
 *
 *     press ── row `queued` ── host's provision job done ── the site's brief settled ── claim ── apply ── ending
 *
 * - The write is the Design system door's own (`design-system.js` `applyAs`): the same bytes, the same
 *   `site_design_system` row and Site changes row (Source "Design system", by the person who created the site), the
 *   same Undo. It takes the site's write lease like a press.
 * - The brief goes first: its words are written into the template, then the look is put on, so the two writers never
 *   meet over one site.
 * - Every ending is kept on the row and said beside `done` by the poll door: `applied`, `skipped` (the template cannot
 *   wear a system, and why), `failed` (the site did not come up, or the write did not land). Nothing is retried in a
 *   loop: a busy site is asked a few times, a failed write is said and left for the Design system panel.
 * - At most once across replicas (`claim` is one statement). A worker that dies with its process is found by `sweep`:
 *   one still waiting is finished; one that died WHILE writing is never written again — `applied` when the door's own
 *   row proves the write landed, else `failed` with `LOST_APPLY`.
 */
import { OPEN_STATES } from './design-system-at-create-store.js'

/** The line the wizard's console shows while the pick is being put on, in the customer's terms. */
export const DS_STEP = 'applying your design system'

/** The reason a row carries when its worker died while writing and no write is on record. */
export const LOST_APPLY =
  'Tracy restarted while your design system was being applied, so the site may still wear the template’s own look.'

export const DEFAULT_LIMITS = Object.freeze({
  /** How often the host's provision job is asked while the site installs. */
  jobPollMs: 1500,
  /** How often the brief's row is read while its words are written. */
  pollMs: 1000,
  /** The longest the site may take to come up, counted from the start. */
  siteMs: 25 * 60_000,
  /** The longest the brief may hold the site after it is up. */
  briefMs: 25 * 60_000,
  /** Tries of a write the site's lease refused (`SITE_BUSY`), and the wait between two. */
  busyTries: 6,
  busyWaitMs: 10_000,
  /** An open row nobody has touched for this long belongs to a worker that died. */
  staleMs: 4 * 60_000,
  /** How often a waiting worker touches its row. */
  beatMs: 5_000
})

/** The codes that mean "this template cannot wear a system": the pick is skipped, not failed. */
const CANNOT_WEAR = new Set(['DS_TEMPLATE_CANNOT_WEAR', 'PLATFORM_HAS_NO_SLOT'])

/**
 * @param {object} deps
 * @param {ReturnType<typeof import('./design-system-at-create-store.js').buildDesignSystemStore>} deps.store
 * @param {(siteKey: string, ask: {email: string, id: string, at: string}) => Promise<{status: number, body: any}>} deps.apply
 *   the Design system door's write (`applyAs`)
 * @param {(host: string, jobId: string) => Promise<{state?: string} | null>} deps.hostJob - the host's word on a job
 * @param {(siteKey: string) => Promise<boolean>} deps.briefOpen - whether the site's words are still being written
 * @param {() => number} [deps.now]
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 * @param {{info?: Function, warn?: Function}} [deps.log]
 * @param {Partial<typeof DEFAULT_LIMITS>} [deps.limits]
 */
export function createBuildDesignSystems({
  store,
  apply,
  hostJob,
  briefOpen,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console,
  limits = {}
}) {
  const cap = { ...DEFAULT_LIMITS, ...limits }
  /** @type {Map<string, Promise<void>>} the runs this process is doing */
  const running = new Map()
  const stopping = new AbortController()

  /** Wait for the host's provision job: `done`, `failed`, or null when the wait was given up. */
  async function siteUp(row) {
    const until = now() + cap.siteMs
    while (now() < until && !stopping.signal.aborted) {
      const job = row.host && row.job_id ? await hostJob(row.host, row.job_id).catch(() => null) : null
      if (job?.state === 'done' || job?.state === 'ready') return 'done'
      if (job?.state === 'failed') return 'failed'
      await sleep(cap.jobPollMs)
    }
    return null
  }

  /** Wait while the site's brief still writes its words; given up after `briefMs` (its own run is bounded too). */
  async function briefSettled(siteKey) {
    const until = now() + cap.briefMs
    while (now() < until && !stopping.signal.aborted) {
      if (!(await briefOpen(siteKey).catch(() => false))) return
      await sleep(cap.pollMs)
    }
  }

  /** The door's answer as the row keeps it. */
  function endingOf(out) {
    const body = out?.body ?? {}
    if (out?.status === 200 && body.ok === true)
      return { state: /** @type {const} */ ('applied'), applyId: String(body.applyId ?? '') || null }
    const code = typeof body.code === 'string' ? body.code : `HTTP_${out?.status ?? 0}`
    const reason = `${code}${body.reason ? `: ${body.reason}` : ''}`
    return {
      state: CANNOT_WEAR.has(code) ? /** @type {const} */ ('skipped') : /** @type {const} */ ('failed'),
      reason
    }
  }

  /** The write, asked again only while the site's lease is held by someone else. */
  async function write(row) {
    let out = null
    for (let attempt = 1; attempt <= cap.busyTries; attempt++) {
      try {
        out = await apply(row.site_key, { email: row.actor, id: row.system_id, at: 'create' })
      } catch (error) {
        out = {
          status: 0,
          body: { code: 'DS_WRITE_FAILED', reason: error instanceof Error ? error.message : String(error) }
        }
      }
      if (out?.body?.code !== 'SITE_BUSY' || attempt === cap.busyTries || stopping.signal.aborted) break
      await sleep(cap.busyWaitMs)
    }
    return out
  }

  /** @param {string} siteKey */
  async function work(siteKey) {
    const beat = setInterval(() => void store.touch(siteKey).catch(() => {}), cap.beatMs)
    beat.unref?.()
    try {
      const row = await store.get(siteKey)
      if (!row || row.state !== 'queued') return
      const up = await siteUp(row)
      if (up === 'failed' || (up === null && !stopping.signal.aborted)) {
        await store.settle(siteKey, ['queued'], { state: 'failed', reason: 'the site did not come up' })
        return
      }
      if (up === null) return
      await briefSettled(siteKey)
      if (stopping.signal.aborted) return
      const claimed = await store.claim(siteKey)
      if (!claimed) return
      const ending = endingOf(await write(claimed))
      await store.settle(siteKey, ['applying'], ending)
      const said = `${claimed.system_id} on ${siteKey}: ${ending.state}${ending.reason ? ` (${ending.reason})` : ''}`
      if (ending.state === 'applied') log.info?.(`[design-system] ${said}`)
      else log.warn?.(`[design-system] ${said}`)
    } catch (error) {
      log.warn?.(`[design-system] ${siteKey}: ${error instanceof Error ? error.message : error}`)
      await store
        .settle(siteKey, ['queued', 'applying'], {
          state: 'failed',
          reason: error instanceof Error ? error.message : String(error)
        })
        .catch(() => {})
    } finally {
      clearInterval(beat)
    }
  }

  /** Start the work on a site in this process, unless it already runs here. @param {string} siteKey */
  function run(siteKey) {
    if (running.has(siteKey)) return
    const job = work(siteKey).finally(() => running.delete(siteKey))
    running.set(siteKey, job)
  }

  return {
    /**
     * Keep the pick of a press and start working on it in the background. Never waits for the work: the create door
     * answers the moment the host has accepted the install.
     * @param {{siteKey: string, accountId?: string | null, email: string, id: string, name?: string | null,
     *   jobId: string, host: string}} input
     */
    async start(input) {
      const row = await store.put(input)
      if (row?.state === 'queued') run(input.siteKey)
      return row
    },

    /**
     * What the poll door reads: the row with `open` (still queued or applying), or null for a site made with no pick.
     * @param {string} siteKey
     */
    async stateOf(siteKey) {
      const row = await store.get(siteKey)
      if (!row) return null
      return {
        id: row.system_id,
        name: row.system_name ?? null,
        state: row.state,
        reason: row.reason ?? null,
        applyId: row.apply_id ?? null,
        open: OPEN_STATES.includes(row.state),
        handedAt: row.handed_at ?? null
      }
    },

    /** The pick as a door says it to the client: no internal fields, no nulls. @param {any} s */
    said(s) {
      return {
        id: s.id,
        name: s.name,
        state: s.state,
        ...(s.reason ? { reason: s.reason } : {}),
        ...(s.applyId ? { applyId: s.applyId } : {})
      }
    },

    /** The first poll that handed the finished site over. @param {string} siteKey */
    handedOver: (siteKey) => store.handedOver(siteKey),

    /** Finish the picks whose worker died with its process (the cron's tick). */
    async sweep() {
      for (const row of await store.stale(cap.staleMs)) {
        if (running.has(row.site_key)) continue
        if (row.state === 'queued') {
          if (await store.takeOver(row.site_key, cap.staleMs)) run(row.site_key)
          continue
        }
        // Died while writing: the write is never sent again. The door's own row says whether it landed.
        const landed = await store.appliedSince(row.site_key, row.system_id, row.created_at)
        await store.settle(
          row.site_key,
          ['applying'],
          landed ? { state: 'applied', applyId: landed } : { state: 'failed', reason: LOST_APPLY }
        )
      }
    },

    /** Wait for the runs this process started (tests, shutdown). */
    async idle() {
      while (running.size > 0) await Promise.allSettled(running.values())
    },

    /** Stop waiting (shutdown, tests): a run that has not written yet stays queued for the next process's sweep. */
    async stop() {
      stopping.abort()
      await Promise.allSettled(running.values())
    }
  }
}
