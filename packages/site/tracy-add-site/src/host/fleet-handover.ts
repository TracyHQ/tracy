/**
 * The handover to the fleet, made by this host as soon as a read is finished (#1652).
 *
 * Until 23/10/2026 the only caller of `POST /api/sites/:key/provision` was the wizard page
 * (`src/client/import.ts` `provisionImported`): an owner who closed the tab while the files were
 * being packed got a run at `done` / `handing_over` and no copy, until they opened the recovery link
 * (measured on prod that day). So the host now files the build itself, with the owner's own session,
 * the way it already reports the run's result (`operation-signal.ts`).
 *
 * 🔒 ONE BUILD, WHOEVER ASKS FIRST. The wizard may still be open and ask too. tracy-web answers a
 * second request for the same import with the job the first one filed (`reused`), so both callers
 * follow ONE job; the run carries the host's attempt (`RunState.handover`) and a wizard that sees it
 * follows that job instead of filing its own (`import-watch.mjs`).
 *
 * 🔒 IT SURVIVES A RESTART. The request is written to disk before it is sent and deleted only once
 * tracy-web gave an answer that settles it, so a lane restarted between `done` and the handover
 * sends it at boot (`index.ts`). The file holds the owner's session cookie, as the result queue does:
 * private files (0600) in a private folder (0700), each one gone as soon as it is settled, and none
 * kept longer than a finished read is worth handing over (`handover.ts`, two hours).
 */
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'

import { isFresh } from './handover.js'
import { writeAtomic } from './json-book.mjs'

/** What the run says about the host's own handover; the status door shows it to the wizard. */
export type FleetHandoverState =
  | { state: 'pending' }
  | { state: 'filed'; jobId: string }
  | { state: 'refused'; code: string }

export interface FleetHandoverNotice {
  origin: string
  cookie: string
  runId: string
  siteKey: string
  platform: string
  result: { webrootKey: string; dbKey: string; liveSite: string; fingerprint?: unknown }
  /** When the read finished, on this host's clock. */
  finishedAt: number
}

/**
 * How many answers of `TAKEN` count as "another request holds the import's lock". tracy-web refuses
 * a provision while another one for the same site is in flight (`pg_try_advisory_lock`), and that
 * other request is the wizard's — once it is answered, the next attempt is told `reused`. A `TAKEN`
 * that outlasts this many attempts is the site's real answer.
 */
const TAKEN_ATTEMPTS = 3
const TAKEN_PAUSE_MS = 3000

const directory = () => path.join(process.env.DSH_HOME ?? process.cwd(), 'tracy-add-site', 'fleet-handovers')

const SAFE_RUN_ID = /^[a-z0-9]{10,32}$/

/** Kept on disk first, so a restart before the answer still files the build. */
export async function queueFleetHandover(notice: FleetHandoverNotice): Promise<void> {
  if (!SAFE_RUN_ID.test(notice.runId)) throw new Error('unsafe run id')
  const dir = directory()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeAtomic(path.join(dir, `${notice.runId}.json`), JSON.stringify(notice), 0o600)
}

/** One attempt: the outcome, or `retry` when nothing was settled (no answer, a 5xx, the lock). */
export async function fileProvision(
  notice: FleetHandoverNotice,
  fetchImpl: typeof fetch = fetch
): Promise<FleetHandoverState | 'retry' | 'taken'> {
  let response: Response
  try {
    response = await fetchImpl(
      new URL(`/api/sites/${encodeURIComponent(notice.siteKey)}/provision`, notice.origin),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', cookie: notice.cookie },
        body: JSON.stringify({ platform: notice.platform, ...notice.result }),
        // The door signs the store's URLs and asks the host to start: seconds, not minutes.
        signal: AbortSignal.timeout(60_000),
        redirect: 'error'
      }
    )
  } catch {
    return 'retry'
  }
  const body = (await response.json().catch(() => null)) as { jobId?: unknown; code?: unknown } | null
  if (response.status === 202 && typeof body?.jobId === 'string' && body.jobId)
    return { state: 'filed', jobId: body.jobId }
  const code = typeof body?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(body.code) ? body.code : null
  if (response.status === 409 && code === 'TAKEN') return 'taken'
  // A host being updated, a door that failed or a gateway in between: the same request later.
  if (response.status >= 500 || response.status === 429) return 'retry'
  return { state: 'refused', code: code ?? `HTTP_${response.status}` }
}

/** Drop the queued handovers of a site a Remove forgets (`run.ts` `forgetSiteRuns`). */
export async function forgetFleetHandovers(siteKey: string): Promise<void> {
  const dir = directory()
  for (const name of await readdir(dir).catch(() => [])) {
    const file = path.join(dir, name)
    const notice = await readFile(file, 'utf8')
      .then((text) => JSON.parse(text) as FleetHandoverNotice)
      .catch(() => null)
    if (notice?.siteKey === siteKey) await unlink(file).catch(() => undefined)
  }
}

let draining: Promise<void> | null = null
let again = false

/**
 * Send every queued handover; each settled one is reported through `settled` and its file deleted.
 * A call while a pass is going asks for one more pass after it: the file of a run that just finished
 * may have been written after that pass listed the folder. `pauseMs` is the wait between two `TAKEN`
 * answers (a test passes 0).
 */
export function flushFleetHandovers(
  settled: (runId: string, outcome: FleetHandoverState) => void | Promise<void>,
  { fetchImpl = fetch, now = Date.now, pauseMs = TAKEN_PAUSE_MS } = {}
): Promise<void> {
  if (draining) {
    again = true
    return draining
  }
  draining = (async () => {
    do {
      again = false
      await flushOnce(settled, { fetchImpl, now, pauseMs })
    } while (again)
  })().finally(() => {
    draining = null
  })
  return draining
}

async function flushOnce(
  settled: (runId: string, outcome: FleetHandoverState) => void | Promise<void>,
  { fetchImpl, now, pauseMs }: { fetchImpl: typeof fetch; now: () => number; pauseMs: number }
): Promise<void> {
  const dir = directory()
  const files = await readdir(dir).catch(() => [])
  for (const name of files.filter((f) => /^[a-z0-9]{10,32}\.json$/.test(f))) {
    const file = path.join(dir, name)
    try {
      const notice = JSON.parse(await readFile(file, 'utf8')) as FleetHandoverNotice
      if (!isFresh({ result: notice.result, finishedAt: notice.finishedAt }, now())) {
        // Too old to describe the site any more; the owner hands it over again from the wizard.
        await unlink(file)
        await settled(notice.runId, { state: 'refused', code: 'HANDOVER_EXPIRED' })
        continue
      }
      let outcome = await fileProvision(notice, fetchImpl)
      for (let attempt = 1; outcome === 'taken' && attempt < TAKEN_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, pauseMs))
        outcome = await fileProvision(notice, fetchImpl)
      }
      if (outcome === 'retry') continue
      await unlink(file)
      await settled(notice.runId, outcome === 'taken' ? { state: 'refused', code: 'TAKEN' } : outcome)
    } catch {
      console.warn('[tracy-add-site] a handover to the fleet will be retried')
    }
  }
}
