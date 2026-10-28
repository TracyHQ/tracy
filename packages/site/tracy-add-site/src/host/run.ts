import { reportImportResult } from './operation-signal.js'
/**
 * One import, start to finish — and the console the wizard reads to tell the story.
 *
 * An import runs from a few minutes to several tens of minutes, so it CANNOT be one request. The `start` door opens a
 * run and immediately returns a `runId`; the wizard asks `status` every few seconds. The same shape the create branch
 * already used with the fleet's `jobId` — and for the same reason: a request hanging that long breaks exactly
 * when people need to know how far it got.
 *
 * 🔒 THE SCREEN'S STATE lives in memory; THE WORK'S STATE does not. They are two different
 * things, and separating them is what lets an import survive:
 *
 *   - `RunState` (the table below) lives in memory, and a copy on disk (`runs.json`) exists only so that
 *     a freshly restarted dsh knows which run it had in progress: that run becomes `interrupted`, is not rerun
 *     automatically, and the owner presses Continue (#1565, `restoreRuns`).
 *   - The extension's token is on disk (`tokens.ts`), so the next run does not ask for the password again.
 *   - The webroot upload cursor is on disk after EVERY part (`resume.ts`), so the next run continues
 *     from the last part received instead of uploading several hundred MB again.
 *
 * Meaning: the user presses again, and loses at most one part — even when what just broke was something
 * nobody foresaw. Together with `retry.ts`, most incidents never reach them.
 */

import { rm } from 'node:fs/promises'
import path from 'node:path'

import { ArtifactRefused, artifactsFor } from './artifacts.js'
import { usernameIsEmail } from './diagnostic.mjs'
import { ExportFailed, exportDatabase, exportFiles, takeFingerprint } from './export.js'
import type { LiveFingerprint } from './export.js'
import { flushFleetHandovers, forgetFleetHandovers, queueFleetHandover } from './fleet-handover.js'
import type { FleetHandoverState } from './fleet-handover.js'
import { forgetHandover, rememberHandover, rememberPartial, takeOrSweep } from './handover.js'
import { readBook, updateBook } from './json-book.mjs'
import * as joomla from './joomla.js'
import { isHeld, restoreHolds, SiteHeld } from './hold.js'
import { RUN_TTL_MS as SHARED_RUN_TTL_MS } from './import-ttl.mjs'
import { holdLease } from './lease.js'
import type { CoworkPlatform } from './manifest.js'
import { latestExtension, ManifestUnavailable } from './manifest.js'
import { BlockedByHost, connectionFailure, SiteLink } from './site-link.js'
import { forgetToken, rememberedToken, rememberToken } from './tokens.js'
import { secureRetryWebRoot } from './url-policy.mjs'
import { resolveWebRoot } from './webroot.mjs'
import * as wordpress from './wordpress.js'

/** The steps, in the order they happen. The wizard draws steps REACHED, not a list of work to come. */
export type RunStep = 'signing_in' | 'installing' | 'reading_content' | 'reading_files' | 'handing_over'

export interface RunState {
  id: string
  siteKey: string
  platform: CoworkPlatform
  state: 'running' | 'done' | 'error'
  step: RunStep
  /** The figure the customer recognises: tables copied, files packed. */
  detail: {
    tables?: number
    table?: string
    files?: number
    bytes?: number
    parts?: number
    /** Which retry of the part being uploaded. Absent means running normally. */
    retrying?: number
    /** The webroot's size as the site's engine counts it, when it can say (#1567). */
    totalBytes?: number
    /** Bytes a second this run has sent (#1567). */
    rate?: number
    /** When the part on its way was first asked for, on this host's clock (#1567). */
    partStartedAt?: number
  }
  /** Present when done — what provisioning needs. */
  result?: { webrootKey: string; dbKey: string; liveSite: string; fingerprint?: LiveFingerprint }
  /**
   * The host's own handover of `result` to the fleet (#1652, `fleet-handover.ts`): `pending` from
   * the moment the run is `done`, then the job tracy-web filed, or why it refused. Absent when the
   * host could not queue it — the wizard hands over then, as it always did.
   */
  handover?: FleetHandoverState
  /** Present when failed. A code, not a sentence — the surface owns the words. */
  error?: string
  /**
   * Values the sentence for `error` names, never prose: on `php_too_old`, the PHP the site runs
   * (when it said) and the one Claude Cowork needs; beside `blocked_by_firewall`, the firewall that
   * answered (`cloudflare`, `modsecurity`…), for the operator and the log. Never an address of
   * Tracy's: the import leaves from the origin server, which `tracy.ai` keeps behind Cloudflare.
   * On `upload_too_large` over a PHP limit the site named: the package and that limit, in MB.
   */
  errorDetail?: {
    php?: string
    minimumPhp?: string
    firewall?: string
    packageMb?: string
    limitMb?: string
    have?: string
    need?: string
  }
  /**
   * Where a sign-in or install stopped — step, HTTP status, path, which check failed — sent
   * with the result signal so an `unreachable` can be told apart without the customer. Never a
   * query value, cookie, token or password (`joomla.Diagnostic`).
   */
  diagnostic?: joomla.Diagnostic
  /**
   * On `interrupted` only: whether Continue can go on without asking for anything — the code
   * Claude Cowork minted for this site is on disk (`tokens.ts`). A run that came in with a pasted
   * code saves none, so Continue asks for the code again.
   */
  resumable?: boolean
  /**
   * The press of tracy-web's import claim this run was started under (`StartInput.press`), kept so
   * a start a later press superseded never opens another read — also after a restart, from the book.
   */
  press?: string
  startedAt: number
  updatedAt: number
}

const runs = new Map<string, RunState>()

/** Kept long enough for a person to come back to the tab after closing it, not forever. Stated in `import-ttl.mjs`. */
const RUN_TTL_MS = SHARED_RUN_TTL_MS

function sweep(): void {
  const now = Date.now()
  for (const [id, run] of runs) if (now - run.updatedAt > RUN_TTL_MS) runs.delete(id)
}

/**
 * The runs of this dsh, on disk, so the next dsh knows which ones it was running (#1565).
 *
 * `RunState` carries no password, token or cookie (`startRun`), so the copy holds none either.
 * Written on every change, through the same serialised book as the other state of this plugin;
 * lines older than `RUN_TTL_MS` are dropped on the way.
 */
const dshHome = (): string => process.env.DSH_HOME ?? process.cwd()

function runBookPath(): string {
  return path.join(dshHome(), 'tracy-add-site', 'runs.json')
}

type RunBook = Record<string, RunState>

function persist(run: RunState): void {
  const copy: RunState = { ...run, detail: { ...run.detail } }
  void updateBook<RunBook>(runBookPath(), (book) => {
    const now = Date.now()
    for (const [id, saved] of Object.entries(book))
      if (!saved || now - saved.updatedAt > RUN_TTL_MS) delete book[id]
    book[copy.id] = copy
  }).catch((error: unknown) =>
    console.warn(
      `[tracy-add-site] could not record run ${run.id}: ${error instanceof Error ? error.message : String(error)}`
    )
  )
}

let restored: Promise<void> | undefined

/**
 * What a dsh that just started finds of the runs before it (#1565). Called once, before the first
 * `start` or `status` is answered (`index.ts`).
 *
 * A run the book still calls `running` belonged to a process that is gone — a deploy that ran out
 * of drain time replaced it, or it died — so it is `interrupted`: the wizard and `status` say so
 * instead of `RUN_UNKNOWN`, and the owner presses Continue, which starts a new run that goes on
 * from the upload cursor (`resume.ts`). 🔒 Nothing is started here: a read of someone's site begins
 * only when its owner asks for it. Its lease file goes too: the work it stood for is not running.
 */
export function restoreRuns(): Promise<void> {
  restored ??= (async () => {
    // A Remove's hold outlives a restart too (`hold.ts`): known before the first start is answered.
    await restoreHolds()
    const file = runBookPath()
    const book = await readBook<RunBook>(file)
    const now = Date.now()
    const cut: RunState[] = []
    for (const saved of Object.values(book)) {
      if (!saved?.id || runs.has(saved.id) || now - saved.updatedAt > RUN_TTL_MS) continue
      if (saved.state !== 'running') {
        runs.set(saved.id, saved)
        continue
      }
      const { retrying: _retrying, partStartedAt: _partStartedAt, ...detail } = saved.detail ?? {}
      const interrupted: RunState = {
        ...saved,
        detail,
        state: 'error',
        error: 'interrupted',
        resumable: (await rememberedToken(saved.siteKey)) !== undefined
      }
      runs.set(saved.id, interrupted)
      cut.push(interrupted)
      console.warn(
        `[tracy-add-site] run ${saved.id} (${saved.siteKey}) was cut at ${saved.step} by a restart: interrupted`
      )
      await rm(path.join(dshHome(), 'leases', `${saved.id}.json`), { force: true }).catch(() => undefined)
    }
    if (cut.length)
      await updateBook<RunBook>(file, (written) => {
        for (const run of cut) written[run.id] = run
      })
  })().catch((error: unknown) =>
    console.warn(
      `[tracy-add-site] could not read earlier runs: ${error instanceof Error ? error.message : String(error)}`
    )
  )
  return restored
}

export function runStatus(id: string): RunState | undefined {
  sweep()
  return runs.get(id)
}

/** A site's open run, if any — so a reopened tab finds its own work. */
export function runForSite(siteKey: string): RunState | undefined {
  sweep()
  // The LATEST run for the site, not the first: a site is imported again after a failure, and the
  // wizard resuming by siteKey must land on the run that is actually going, not on the corpse of
  // the one before it (measured 2026-09-04: three runs, status kept answering for the first).
  let latest: RunState | undefined
  for (const run of runs.values()) {
    if (run.siteKey === siteKey && (!latest || run.startedAt >= latest.startedAt)) latest = run
  }
  return latest
}

/** When anything last happened to a run of this site here, or undefined when none is kept. */
export function lastRunActivity(siteKey: string): number | undefined {
  sweep()
  let latest: number | undefined
  for (const run of runs.values())
    if (run.siteKey === siteKey && (latest === undefined || run.updatedAt > latest)) latest = run.updatedAt
  return latest
}

/** The archive keys the finished reads of a site left in the store, as this host keeps its runs. */
export function siteArchiveKeys(siteKey: string): string[] {
  sweep()
  const keys = new Set<string>()
  for (const run of runs.values())
    if (run.siteKey === siteKey && run.result)
      for (const key of [run.result.webrootKey, run.result.dbKey]) if (key) keys.add(key)
  return [...keys]
}

/**
 * Forget every run of a site a Remove holds: memory, `runs.json`, the site's Claude Cowork code
 * (`tokens.ts`), its fleet handovers and its line in `handovers.json`. Answers the archive keys its
 * finished reads left in the store, so the caller can delete them. Only a held site, and never one with a read going: `hold.ts` refused the hold then.
 */
export async function forgetSiteRuns(siteKey: string): Promise<string[]> {
  const keys = new Set<string>()
  for (const [id, run] of runs) {
    if (run.siteKey !== siteKey) continue
    if (run.result) for (const key of [run.result.webrootKey, run.result.dbKey]) if (key) keys.add(key)
    runs.delete(id)
  }
  await updateBook<RunBook>(runBookPath(), (book) => {
    let changed = false
    for (const [id, saved] of Object.entries(book))
      if (saved?.siteKey === siteKey) {
        if (saved.result)
          for (const key of [saved.result.webrootKey, saved.result.dbKey]) if (key) keys.add(key)
        delete book[id]
        changed = true
      }
    if (!changed) return false
  })
  await forgetToken(siteKey)
  await forgetFleetHandovers(siteKey)
  await forgetHandover(siteKey)
  return [...keys]
}

export interface StartInput {
  siteKey: string
  platform: CoworkPlatform
  /** Retry exactly this failed read; a replacement already opened is adopted instead. */
  retryOf?: string
  /**
   * Which press of tracy-web's import claim sent this start: microseconds since the epoch as digits,
   * strictly increasing per claim (`apps/tracy-web/src/sites/route.js`). Absent from a wizard that
   * predates it, which keeps the behaviour from before.
   */
  press?: string
  /** On a take-over of an idle claim (#1665): the earlier press this start supersedes. */
  after?: string
  /** The admin page address, EXACTLY as typed. */
  adminUrl?: string
  username?: string
  password?: string
  basicAuth?: { username: string; password: string }
  /** Road (b): the customer installs it themselves and pastes the token. With it, the sign-in step is skipped entirely. */
  token?: string
  /** The webroot when going by a pasted token — there is no admin session to derive it from. */
  webRootUrl?: string
  /** The `cowork-web` root and the pressing person's cookie, to talk to storage. */
  origin: string
  cookie: string
}

/**
 * Why a run failed — a code, not a sentence.
 *
 * The surface owns the words; here there is only classification. Four groups, and they ask four different actions
 * of the reader: wrong account (retype), two-factor auth (take the self-install road), the site refuses the install (take
 * the self-install road), storage/network failure (retry).
 */
function reasonOf(error: unknown): string {
  if (error instanceof ExportFailed) return error.reason
  if (error instanceof ManifestUnavailable) return `manifest_${error.reason}`
  // The relay refused a store call (`NOT_SIGNED_IN`, `SEAT_NOT_AUTHORIZED`, `HTTP_302`…): the site
  // was read, the copy could not be stored — the wizard already has that sentence.
  if (error instanceof ArtifactRefused) return 'store_refused'
  return 'unexpected'
}

/** A firewall in front of a customer's site is worth one line: the customer only sees "blocked". */
function logFirewall(run: RunState, firewall: string | undefined): void {
  console.warn(
    `[tracy-add-site] run ${run.id} (${run.siteKey}) blocked by ${firewall ?? 'a firewall'} at ${run.step}`
  )
}

/** A failed step, with the firewall it met and the check it failed kept beside the code. */
function failWith(
  run: RunState,
  failure: { reason: string; firewall?: string; detail?: joomla.Diagnostic; have?: string; need?: string }
): void {
  if (failure.reason === 'blocked_by_firewall') logFirewall(run, failure.firewall)
  update(run, {
    state: 'error',
    error: failure.reason,
    ...(failure.firewall || failure.have || failure.need
      ? {
          errorDetail: {
            ...(failure.firewall ? { firewall: failure.firewall } : {}),
            ...(failure.have ? { have: failure.have } : {}),
            ...(failure.need ? { need: failure.need } : {})
          }
        }
      : {}),
    ...(failure.detail ? { diagnostic: failure.detail } : {})
  })
}

/** The refusals that say the site turned down the account typed, not something in front of it. */
const ACCOUNT_REFUSALS = new Set(['invalid_credential', 'no_backend_access'])

/**
 * A refused sign-in's diagnostic, with `username_is_email` beside it when the site turned down the
 * account: Joomla's backend signs in with the username only, and the operator cannot see what was
 * typed. A refusal that carries no detail of its own is named at the login POST. Never the value.
 */
export function signInRefusal(
  reason: string,
  detail: joomla.Diagnostic | undefined,
  username: string | undefined
): joomla.Diagnostic | undefined {
  if (!ACCOUNT_REFUSALS.has(reason)) return detail
  return {
    ...(detail ?? { at: 'login_post', check: reason }),
    username_is_email: usernameIsEmail(username)
  }
}

/** How a run came by Claude Cowork's code, the way `execute` picks it (`DIAGNOSTIC_SIGN_INS`). */
export function signInWay(input: StartInput): 'password' | 'code' | 'saved' {
  if (input.token && input.webRootUrl) return 'code'
  return input.adminUrl && input.username && input.password ? 'password' : 'saved'
}

function update(run: RunState, patch: Partial<RunState>): void {
  Object.assign(run, patch, { updatedAt: Date.now() })
  persist(run)
}

/**
 * Whether a start came too late to open a read (#1665): a run of the site already carries its press
 * or a newer one — the same start arriving twice, or one a later press superseded while it was on
 * its way — or it is a take-over and a run carries a press at or before the one it names: a
 * take-over supersedes EVERY earlier press, not only the last (a start of an older press, held up
 * while a later tab pressed and sent nothing, was not lost, only slow). A Remove forgets the site's
 * runs (`forgetSiteRuns`), so a take-over under the next claim finds none to match. Such a start
 * joins the site's latest run. Presses only grow, so a start delayed past another tab's whole read,
 * in either order, never opens a second one.
 */
function superseded(input: StartInput): boolean {
  if (!input.press) return false
  const own = BigInt(input.press)
  const after = input.after ? BigInt(input.after) : undefined
  for (const run of runs.values()) {
    if (run.siteKey !== input.siteKey || !run.press) continue
    const press = BigInt(run.press)
    if (press >= own || (after !== undefined && press <= after)) return true
  }
  return false
}

/**
 * Open an import and return immediately.
 *
 * 🔒 THE PASSWORD NEVER LEAVES THIS FUNCTION. It sits in `input`, goes into the sign-in, and vanishes
 * with the stack. It is not in `RunState` — what the `status` door returns to the browser.
 */
export function startRun(input: StartInput): RunState {
  // A Remove holds the site (`hold.ts`): no read begins, not a first start, a retry or a Continue.
  // Asked in the same synchronous step as the check below, so a start and a hold never both win.
  if (isHeld(input.siteKey)) throw new SiteHeld(input.siteKey)
  // Check and register synchronously, before execute can await anything. Two tabs cannot both
  // open a read, including a delayed retry arriving after the first replacement already failed.
  const standing = runForSite(input.siteKey)
  if (standing?.state === 'running' || (input.retryOf && standing && standing.id !== input.retryOf))
    return standing
  if (standing && superseded(input)) return standing
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const run: RunState = {
    id,
    siteKey: input.siteKey,
    platform: input.platform,
    state: 'running',
    step: 'signing_in',
    detail: {},
    ...(input.press ? { press: input.press } : {}),
    startedAt: Date.now(),
    updatedAt: Date.now()
  }
  // Read before this run joins the table: the previous run of the site, if it ended in a ban, makes
  // a refused first request the same ban rather than a wrong address (`execute`). Keyed by site, not
  // by user, on purpose — the host banned Tracy's IP, which every user's import shares, so another
  // user's refused sign-in is the same ban, and this run's state carries nothing of the earlier run.
  // Accepted limits (19/10/2026): runs live in memory, so a dsh restart forgets the ban; and only a
  // sign-in is turned into `blocked_by_host` — a remembered token that cannot reach the site still
  // fails as before at the webroot check, while its export counts a refused first call as the ban.
  const bannedBefore = runForSite(input.siteKey)?.error === 'blocked_by_host'
  runs.set(id, run)
  persist(run)
  // Held for the whole run, so a dsh deploy waits for it instead of killing it (`lease.ts`).
  const lease = holdLease(id, { kind: 'import', siteKey: input.siteKey })

  // Background run: the `start` door answered long ago while this is still running.
  void execute(run, input, bannedBefore)
    .catch((error: unknown) => {
      const reason = reasonOf(error)
      if (error instanceof BlockedByHost) {
        failBlocked(run, {
          at: 'api_door',
          check: bannedBefore ? 'connection_refused_after_ban' : 'connection_refused_after_progress',
          error: error.code
        })
        return
      }
      // The run keeps no log of its own, and its state lives only in memory: when a run dies with an
      // unclassified error this line is the only place the cause survives. Measured the hard way on
      // 2026-09-04 — two failed imports, no trace, an hour of guessing.
      if (reason === 'unexpected' || reason === 'store_refused') {
        const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
        console.error(
          `[tracy-add-site] run ${run.id} (${run.siteKey}) failed at ${run.step}: ${reason}\n${detail}`
        )
      }
      // A `call_failed` names the call and what came back (`export.ts`): the head of the body in the
      // operator log, its closed-set kind in the stuck signal.
      if (reason === 'call_failed' && error instanceof ExportFailed && error.detail)
        console.warn(`[tracy-add-site] run ${run.id} (${run.siteKey}) call_failed at ${run.step}: ${error.detail}`)
      const firewall =
        error instanceof ExportFailed && reason === 'blocked_by_firewall' ? error.detail : undefined
      if (reason === 'blocked_by_firewall') logFirewall(run, firewall)
      const diagnostic = error instanceof ExportFailed ? error.diagnostic : undefined
      update(run, {
        state: 'error',
        error: reason,
        ...(firewall ? { errorDetail: { firewall } } : {}),
        ...(diagnostic ? { diagnostic } : {})
      })
    })
    .finally(async () => {
      // Under the run's lease, so a deploy waits for the handover as it waits for the read.
      if (run.handover?.state === 'pending') await settleFleetHandovers()
      await reportImportResult({
        origin: input.origin,
        cookie: input.cookie,
        siteKey: run.siteKey,
        result: {
          run_id: run.id,
          state: run.state,
          step: run.step,
          reason: run.error ?? null,
          seconds: Math.max(0, (Date.now() - run.startedAt) / 1000),
          platform: input.platform,
          // Beside the diagnostic, not in it: a run that fails with none still says how it came in.
          sign_in: signInWay(input),
          ...(run.diagnostic ? { detail: run.diagnostic } : {})
        }
      })
      lease.release()
    })

  return run
}

/** The run stopped because the site's host refused this IP: the operator line, then the state. */
function failBlocked(run: RunState, diagnostic: joomla.Diagnostic): void {
  console.warn(
    `[tracy-add-site] run ${run.id} (${run.siteKey}) blocked by the site's host at ${run.step}: ${diagnostic.check} ${diagnostic.error ?? ''}`
  )
  update(run, {
    state: 'error',
    error: 'blocked_by_host',
    diagnostic
  })
}

/**
 * A sign-in that could not connect, right after the previous run of the site stopped with
 * `blocked_by_host`: the same ban, still in force — not an address to check.
 * @param error The connection error of the first request, as the sign-in recorded it.
 */
function stillBanned(bannedBefore: boolean, reason: string, error: string | undefined): boolean {
  return bannedBefore && reason === 'unreachable' && !!connectionFailure({ code: error })
}

async function execute(run: RunState, input: StartInput, bannedBefore = false): Promise<void> {
  const platform = input.platform
  const link = new SiteLink({ bannedBefore })

  // A read that already finished and never made it to the fleet (`handover.ts`): hand it over
  // now, without signing in or reading anything. The wizard only ever sees `done` + `result`, the
  // same as after a full read — the difference is the twenty-five minutes it does not spend.
  // Also where leftovers of earlier runs get deleted (`takeOrSweep`): the dump of a run that died
  // mid-files, or a read that expired unhanded — automatic, before anything new is written.
  const artifacts = artifactsFor(input.siteKey, {
    origin: input.origin,
    cookie: input.cookie
  })
  // Credentials given on THIS import (a pasted token, or an admin login) mean "read the site now".
  // The cache cannot tell a read the fleet never took from one it already built a copy from: the
  // wizard can hand over through `cowork-web` directly (`provisionImported`), and the host's own
  // handover (`fleet-handover.ts`, #1652) keeps no record past its answer. Handing a cached read to a credentialed import gave a deleted-and-re-imported site its
  // old content, without signing in or installing Claude Cowork (#530). So only a retry that brings
  // no credentials takes the fast path; a credentialed one neither reads nor sweeps the cache — an
  // expired line may name a read the fleet still downloads.
  const given = givenCredentials(input)
  if (given === 'incomplete') {
    update(run, { state: 'error', error: 'credentials_required' })
    return
  }
  const finished = given ? undefined : await takeOrSweep(input.siteKey, (key) => artifacts.remove(key))
  if (finished) {
    // The read finished on an earlier run and was cached before the fleet took it (`handover.ts`),
    // so this fast path never signs in and never reaches `registerComponentCredential`. If that
    // earlier run downgraded the endpoint to http, the seat book refused the credential and the
    // copy was provisioned without one — Apply then answers COMPONENT_NOT_REGISTERED.
    //
    // A retry can carry explicit https intent (an https webRootUrl, or an https adminUrl, with the
    // remembered token); that intent is NOT ignored just because a fresh cached read exists.
    // `recoverCachedHandover` uses it, when it is trustworthy, to register the credential over
    // https and correct the handed-over address — without re-reading the archive, and with no token
    // in `RunState`. When there is no trustworthy secure intent it reports the limitation and hands
    // the cached read over unchanged.
    const result = await recoverCachedHandover(input, platform, finished.result, link)
    update(run, {
      state: 'done',
      step: 'handing_over',
      result,
      ...(await queuedHandover(run, input, result, finished.finishedAt))
    })
    return
  }
  const latest = await latestExtension(platform)
  // Every request to the site carries its HTTP Basic credential when it has one: a site that asks
  // for it on /administrator answers the administrator door 401 without it, and that door is the
  // only one on a site whose front end is gated.
  let siteHeaders = joomla.basicAuthHeader(input.basicAuth)

  // ── 1. Get an extension token, by one of three roads ─────────────────────────────────────
  //
  // (a) the customer pasted it — skip sign-in entirely
  // (b) the token kept from the previous run, if the extension behind it is still current
  // (c) sign in as admin, then install
  let token: string
  let webRootUrl: string
  let dbDumpMany: { max_tables?: number; max_bytes?: number; max_seconds?: number } | undefined
  let wordpressInfoRead = false

  if (input.token && input.webRootUrl) {
    token = input.token
    // The wizard spells the webroot from the site key, which has `www.` stripped. Ask the site
    // where it really answers first: a POST that meets a 301 goes on as a GET with no body, and
    // the engine then refuses a token it never saw (`webroot.mjs`).
    webRootUrl = await resolveWebRoot(input.webRootUrl, fetch, siteHeaders)
    if (platform === 'wordpress') {
      const info = await wordpress.readSiteInfo(webRootUrl, token, { link })
      dbDumpMany = info.dbDumpMany
      wordpressInfoRead = true
    }
  } else {
    const held = await rememberedToken(input.siteKey)
    if (!input.adminUrl || !input.username || !input.password) {
      if (!held) {
        update(run, { state: 'error', error: 'credentials_required' })
        return
      }
      token = held.token
      // A token saved before the downgrade fix may carry an http webRootUrl (the login derived it
      // over a downgraded hop). An explicit https retry intent that names the same source (host +
      // path) upgrades it directly — this covers the site whose http root answers 200 and never
      // redirects to https, where resolving the saved http webroot just returns http again.
      // Otherwise resolve it: an http webroot for a site that is really https redirects up and comes
      // back https, while a genuinely-http site stays http. Re-save only when it actually changed.
      const intent = secureRetryIntent(input, platform)
      const upgraded = intent ? secureRetryWebRoot(intent, held.webRootUrl) : null
      webRootUrl = upgraded ?? (await resolveWebRoot(held.webRootUrl))
      if (webRootUrl !== held.webRootUrl) {
        await rememberToken(input.siteKey, { token, webRootUrl, platform, version: held.version })
      }
    } else {
      update(run, { step: 'signing_in' })
      if (platform === 'joomla') {
        const session = await joomla.loginToAdmin(
          input.adminUrl,
          input.username,
          input.password,
          input.basicAuth
        )
        if (!session.ok) {
          if (
            session.detail?.at === 'login_page' &&
            stillBanned(bannedBefore, session.reason, session.detail.error)
          ) {
            failBlocked(run, { ...session.detail, check: 'connection_refused_after_ban' })
            return
          }
          failWith(run, {
            ...session,
            detail: signInRefusal(session.reason, session.detail, input.username)
          })
          return
        }
        update(run, { step: 'installing' })
        siteHeaders = session.authHeader
        const installed = await joomla.installCowork(
          session,
          latest.packageUrl,
          latest.version,
          held?.token,
          { requiresPhp: latest.requiresPhp, link }
        )
        if (!installed.ok) {
          if (installed.reason === 'blocked_by_firewall') logFirewall(run, installed.firewall)
          update(run, {
            state: 'error',
            error: installed.reason,
            ...(installed.firewall ? { errorDetail: { firewall: installed.firewall } } : {}),
            ...(installed.reason === 'php_too_old' && (installed.php || installed.minimumPhp)
              ? { errorDetail: { php: installed.php, minimumPhp: installed.minimumPhp } }
              : {}),
            ...(installed.uploadMb
              ? {
                  errorDetail: { packageMb: installed.uploadMb.package, limitMb: installed.uploadMb.limit }
                }
              : {}),
            ...(installed.detail ? { diagnostic: installed.detail } : {})
          })
          return
        }
        token = installed.token
        webRootUrl = session.webRootUrl
        await rememberToken(input.siteKey, {
          token,
          webRootUrl,
          platform,
          version: installed.version
        })
      } else {
        const session = await wordpress.loginToAdmin(
          input.adminUrl,
          input.username,
          input.password,
          input.basicAuth
        )
        if (!session.ok) {
          if (stillBanned(bannedBefore, session.reason, session.connection)) {
            failBlocked(run, {
              at: 'login_page',
              check: 'connection_refused_after_ban',
              error: session.connection
            })
            return
          }
          failWith(run, {
            ...session,
            detail: signInRefusal(session.reason, session.detail, input.username)
          })
          return
        }
        update(run, { step: 'installing' })
        const installed = await wordpress.installCowork(
          session,
          latest.packageUrl,
          latest.version,
          held?.token,
          { link }
        )
        if (!installed.ok) {
          failWith(run, installed)
          return
        }
        token = installed.token
        dbDumpMany = installed.dbDumpMany
        wordpressInfoRead = true
        webRootUrl = session.webRootUrl
        await rememberToken(input.siteKey, {
          token,
          webRootUrl,
          platform,
          version: installed.version
        })
      }
    }
  }

  // The minimum PHP the manifest declares, for a parse error that carries no version of its own.
  const needPhp = (): Pick<RunState, 'errorDetail'> => {
    const minimumPhp = joomla.minimumPhp(latest.requiresPhp)
    return minimumPhp ? { errorDetail: { minimumPhp } } : {}
  }

  // Joomla has two doors to one API and the front one may be gated (`doors.mjs`): ask which answers.
  const door =
    platform === 'joomla'
      ? await joomla.resolveDoor(webRootUrl, token, { headers: siteHeaders, link })
      : { endpoint: wordpress.apiEndpoint(webRootUrl), inline: false }
  // No door reached the engine: stop before registering a credential nothing answers on, and name
  // the cause instead of failing later as a read that "stopped answering" (`joomla.resolveDoor`).
  if ('refusal' in door) {
    if (door.refusal === 'blocked_by_firewall') {
      failWith(run, { reason: door.refusal, firewall: door.firewall, detail: door.detail })
      return
    }
    update(run, {
      state: 'error',
      error: door.refusal,
      ...(door.refusal === 'php_too_old' ? needPhp() : {}),
      diagnostic: door.detail
    })
    return
  }
  const endpoint = door.endpoint
  if (platform === 'joomla' && 'endpoint' in door) dbDumpMany = door.dbDumpMany
  if (platform === 'wordpress' && !wordpressInfoRead) {
    const info = await wordpress.readSiteInfo(webRootUrl, token, { link })
    dbDumpMany = info.dbDumpMany
  }
  // WordPress sends no Basic credential to its API today; the header only travels to Joomla.
  // One link for the whole read, so the pause and the ban check span the database and the files.
  const callOptions =
    platform === 'joomla'
      ? { headers: siteHeaders, link, dbDumpMany, platform }
      : { link, dbDumpMany, platform }

  // Custody: hand the component's token to the seat book NOW, while this half still has it, so the
  // agent's `tracy_site` tool can reach the site through the Apply door later (tasks/todo-site-tools.md
  // P1.0). Before 05/09 only the Desk registered this, and imported sites answered
  // COMPONENT_NOT_REGISTERED for good. Best effort: a refusal (a non-admin seat, a seat book down)
  // is logged and the import goes on — it is a registration, not a step the import depends on.
  await registerComponentCredential(input, endpoint, token)

  // ── 2. Content: database first, because it is small and fails sooner ─────────────────────
  //
  // The order is deliberate. The database is a few MB and takes tens of seconds; the webroot is several hundred MB and
  // takes tens of minutes. Putting the cheap one first means a run failing on a wrong token, missing rights or storage refusing
  // shows up after half a minute instead of half an hour.
  update(run, { step: 'reading_content' })
  // A parse error met mid-export carries no version of the site's PHP; the minimum is still worth
  // saying. Set here because the catch in `startRun` no longer knows the manifest.
  // A ban is said here too, for the address in its sentence. The resume checkpoint of the files is
  // left as it is, so the retry after the host lifts the ban goes on from the last part stored; the
  // database is read again from the start, which is why the sentence promises no resume.
  const sayPhp = (error: unknown): never => {
    if (error instanceof ExportFailed && error.reason === 'php_too_old')
      update(run, { ...needPhp(), diagnostic: { at: 'export', check: 'parse_error' } })
    if (error instanceof ExportFailed && error.reason === 'blocked_by_host') {
      failBlocked(run, {
        at: 'export',
        check: bannedBefore ? 'connection_refused_after_ban' : 'connection_refused_after_progress',
        ...(error.detail ? { error: error.detail } : {})
      })
    }
    // Which gateway said the origin is down (`cloudflare 530`), or the connection code: the operator's
    // only way to tell a site switched off from a tunnel that dropped.
    if (error instanceof ExportFailed && error.reason === 'site_offline')
      update(run, {
        diagnostic: { at: 'export', check: 'site_offline', ...(error.detail ? { error: error.detail } : {}) }
      })
    throw error
  }
  // Before the read, so a change made while it runs shows at the first sync instead of hiding. Both
  // CMS Sync from live reads (WordPress since 24/10/2026): without it a WordPress import's first sync
  // read the whole site again, files included (dev, 26/10/2026).
  const fingerprint =
    platform === 'joomla' || platform === 'wordpress'
      ? await takeFingerprint(endpoint, token, callOptions)
      : undefined
  const db = await exportDatabase(
    endpoint,
    token,
    artifacts,
    (progress) => {
      update(run, {
        detail: { ...run.detail, tables: progress.tables, table: progress.table }
      })
    },
    callOptions
  ).catch(sayPhp)
  // The dump is in the store from here on; if the files never make it, the next run deletes it.
  await rememberPartial(input.siteKey, db.key)

  update(run, { step: 'reading_files' })
  const files = await exportFiles(
    endpoint,
    token,
    artifacts,
    input.siteKey,
    (progress) => {
      update(run, {
        detail: {
          ...run.detail,
          files: progress.files,
          bytes: progress.bytes,
          parts: progress.parts,
          // Say so while retrying; never let the screen stand still: a number that does not move for
          // two minutes reads as "hung", and people close the tab right when it was about to go on.
          retrying: progress.retrying,
          totalBytes: progress.total,
          rate: progress.rate,
          partStartedAt: progress.partStartedAt
        }
      })
    },
    { inline: door.inline, ...callOptions }
  ).catch(sayPhp)

  const result = {
    webrootKey: files.key,
    dbKey: db.key,
    liveSite: webRootUrl,
    ...(fingerprint ? { fingerprint } : {})
  }
  // On disk BEFORE the wizard is told: the handover is a separate call, and the lane restarting
  // between the two is exactly the case this exists for.
  await rememberHandover(input.siteKey, result)
  update(run, {
    state: 'done',
    step: 'handing_over',
    result,
    ...(await queuedHandover(run, input, result, Date.now()))
  })
}

/**
 * Queue the host's handover of a finished read (`fleet-handover.ts`), answering the run's
 * `handover` to set in the SAME update as `done`: a wizard polling in between must never see a
 * finished run that nobody is handing over, and file a second build beside this one.
 */
async function queuedHandover(
  run: RunState,
  input: StartInput,
  result: NonNullable<RunState['result']>,
  finishedAt: number
): Promise<Pick<RunState, 'handover'>> {
  if (!input.origin || !input.cookie) return {}
  try {
    await queueFleetHandover({
      origin: input.origin,
      cookie: input.cookie,
      runId: run.id,
      siteKey: input.siteKey,
      platform: input.platform,
      result,
      finishedAt
    })
    return { handover: { state: 'pending' } }
  } catch (error) {
    console.warn(
      `[tracy-add-site] run ${run.id} (${run.siteKey}) could not queue its handover; the wizard hands it over: ${error instanceof Error ? error.message : String(error)}`
    )
    return {}
  }
}

/**
 * Send the queued handovers and write each answer on its run: at the end of a run, and at boot and
 * every half minute for the ones a restart or an unreachable tracy-web left (`index.ts`).
 */
export async function settleFleetHandovers(fetchImpl: typeof fetch = fetch): Promise<void> {
  await restoreRuns()
  await flushFleetHandovers(
    (runId, outcome) => {
      const run = runs.get(runId)
      ;(outcome.state === 'filed' ? console.log : console.warn)(
        `[tracy-add-site] run ${runId}${run ? ` (${run.siteKey})` : ''} handover to the fleet: ${outcome.state === 'filed' ? `job ${outcome.jobId}` : `${outcome.state} ${'code' in outcome ? outcome.code : ''}`}`
      )
      if (run) update(run, { handover: outcome })
    },
    { fetchImpl }
  )
}

interface HandoverResult {
  webrootKey: string
  dbKey: string
  liveSite: string
}

/**
 * Recover the component credential for a cached, already-finished read — the fast path that skips
 * sign-in and installation — WITHOUT re-reading the archive. Returns the result to hand over: the
 * cached one, or a copy whose `liveSite` is the corrected https address when recovery succeeded.
 *
 * Recovery is possible ONLY from explicit https intent the operator supplies on this retry: an
 * https `webRootUrl` or an https `adminUrl` that names the SAME source — same hostname and path —
 * as the earlier run. The token is the remembered one: a retry that brings a token or a login does
 * not come here, it reads the site again (`givenCredentials`). `secureRetryWebRoot` accepts that
 * intent without rewriting the source identity, the token is confirmed to answer over https, and
 * only then is the credential registered and the handed-over address corrected.
 *
 * WHAT THIS CANNOT DO, stated plainly so nothing claims otherwise:
 *   - It cannot recover from the saved http webroot alone. In the verified defect the http root
 *     answers 200 and never redirects to https, so resolving it just returns http again — that is
 *     not a recovery, and this does not pretend it is.
 *   - Without a remembered token (a pasted-token import saves none) there is nothing to register.
 *   - Without trustworthy secure intent it reports the limitation and hands the cached read over
 *     unchanged; the remedy is to retry with an explicit https adminUrl or webRootUrl, or to import
 *     the site again.
 * The report is a single line with no token or cookie in it — never thrown, never in `RunState`.
 */
async function recoverCachedHandover(
  input: StartInput,
  platform: CoworkPlatform,
  cached: HandoverResult,
  link: SiteLink
): Promise<HandoverResult> {
  try {
    const held = await rememberedToken(input.siteKey)
    const token = held?.token
    // The source identity the retry must match is the address this archive was read from
    // (`cached.liveSite`), not the saved token's webroot: the token book may have been replaced by a
    // later run under a different subpath, and matching against that would rewrite the wrong source.
    const source = cached.liveSite
    const intent = secureRetryIntent(input, platform)
    if (!token || !intent) {
      console.warn(
        `[tracy-add-site] cached handover for ${input.siteKey}: no trustworthy https retry intent to recover the component credential — retry with an explicit https adminUrl or webRootUrl, or import the site again`
      )
      return cached
    }
    const secureWebRoot = secureRetryWebRoot(intent, source)
    if (!secureWebRoot) {
      console.warn(
        `[tracy-add-site] cached handover for ${input.siteKey}: the https retry does not name the same source site — not rewriting the source identity; import the site again to recover`
      )
      return cached
    }
    const door = await verifiedHttpsDoor(platform, secureWebRoot, token, input.basicAuth, link)
    if (!door) {
      console.warn(
        `[tracy-add-site] cached handover for ${input.siteKey}: the component did not answer over https at the retry address — the credential was not re-registered`
      )
      return cached
    }
    const registered = await registerComponentCredential(input, door.endpoint, token)
    if (!registered) {
      // The seat book refused the PUT (or it could not be reached). Nothing was recovered, so the
      // handed-over address stays the cached one and the saved webroot is left untouched — a
      // refused registration must never read back as a corrected, secure handover.
      console.warn(
        `[tracy-add-site] cached handover for ${input.siteKey}: the seat book did not accept the component credential — the handover is unchanged; import the site again to recover`
      )
      return cached
    }
    // Persist the corrected https webroot so a later run does not repeat the downgrade, and reflect
    // it in the handed-over result because registration used it.
    if (held && held.webRootUrl !== secureWebRoot) {
      await rememberToken(input.siteKey, {
        token,
        webRootUrl: secureWebRoot,
        platform,
        version: held.version
      })
    }
    return { ...cached, liveSite: secureWebRoot }
  } catch {
    // Best effort by design: a cached handover is handed over whether or not custody could be
    // repaired. The remedy for a persistent failure is re-importing the site.
    return cached
  }
}

/**
 * The credential fields of a start request, AS SENT. A field that was sent stays sent even when it
 * is blank (trimmed to `''`; a non-string becomes `''`): `givenCredentials` must tell "none given",
 * a retry that may take the cached read, from "given but blank", which is `credentials_required`
 * (#530). Only an absent field is `undefined`.
 */
export function credentialsFrom(
  body: Record<string, unknown>
): Pick<StartInput, 'username' | 'password' | 'basicAuth' | 'token'> {
  const sent = (value: unknown): string | undefined =>
    value === undefined ? undefined : typeof value === 'string' ? value.trim() : ''
  const raw = (value: unknown): string => (typeof value === 'string' ? value : '')
  const basic = (body.basicAuth ?? {}) as { username?: unknown; password?: unknown }
  return {
    username: sent(body.username),
    password: sent(body.password),
    basicAuth:
      body.basicAuth === undefined
        ? undefined
        : // Kept verbatim, as before; `givenCredentials` judges blankness itself.
          { username: raw(basic.username), password: raw(basic.password) },
    token: sent(body.token)
  }
}

/**
 * Which credentials this import brings: a pasted token with its webroot, a complete admin login,
 * `'incomplete'` when a credential field was sent but the set is blank or partial, or `undefined`
 * only when no credential field was sent at all. An `adminUrl` or `webRootUrl` alone is an address,
 * not a credential: a retry naming only that still uses the remembered token.
 */
function givenCredentials(input: StartInput): 'token' | 'login' | 'incomplete' | undefined {
  const { token, username, password, basicAuth } = input
  if (token === undefined && username === undefined && password === undefined && basicAuth === undefined) {
    return undefined
  }
  const filled = (value: string | undefined): boolean => value !== undefined && value.trim() !== ''
  if (basicAuth && !(filled(basicAuth.username) && filled(basicAuth.password))) return 'incomplete'
  if (filled(token) && filled(input.webRootUrl)) return 'token'
  if (filled(input.adminUrl) && filled(username) && filled(password)) return 'login'
  return 'incomplete'
}

/**
 * The operator's explicit https intent for a retry, or `undefined`: an https `webRootUrl` if one
 * was supplied, otherwise the https webroot derived from an https `adminUrl`. An unparseable
 * adminUrl is ignored rather than thrown.
 */
function secureRetryIntent(input: StartInput, platform: CoworkPlatform): string | undefined {
  const candidates: string[] = []
  if (input.webRootUrl) candidates.push(input.webRootUrl)
  if (input.adminUrl) {
    try {
      candidates.push(
        platform === 'joomla' ? joomla.webRootFrom(input.adminUrl) : wordpress.webRootFrom(input.adminUrl)
      )
    } catch {
      // An adminUrl that will not parse carries no intent.
    }
  }
  return candidates.find((url) => /^https:/i.test(url))
}

/**
 * The https door the token actually answers on, or `undefined` when it does not answer over https.
 * This is the "verify the endpoint over HTTPS" step: the token is sent only to an https endpoint
 * bound to the confirmed source, never to an unverified or insecure one.
 */
async function verifiedHttpsDoor(
  platform: CoworkPlatform,
  secureWebRoot: string,
  token: string,
  basicAuth: StartInput['basicAuth'],
  link: SiteLink
): Promise<{ endpoint: string } | undefined> {
  if (platform === 'joomla') {
    // `noFollow`: the token is sent only to the https endpoint itself. A redirect off it (to http
    // or to another host) is refused rather than followed, so the token cannot leak to an
    // unverified address while claiming the endpoint answered over https.
    const door = await joomla.findDoor(secureWebRoot, token, {
      noFollow: true,
      headers: joomla.basicAuthHeader(basicAuth),
      link
    })
    return door?.ok ? { endpoint: door.endpoint } : undefined
  }
  const info = await wordpress.readSiteInfo(secureWebRoot, token, { noFollow: true, link })
  return info.ok ? { endpoint: wordpress.apiEndpoint(secureWebRoot) } : undefined
}

/**
 * PUT the component credential into the seat book through `cowork-web`, as the person importing.
 * Never throws: the import must not fail because custody did. Returns whether the seat book actually
 * accepted the credential, so a caller that recovers custody can tell a real registration from a
 * refusal instead of assuming success.
 */
async function registerComponentCredential(
  input: { siteKey: string; origin: string; cookie: string },
  endpoint: string,
  token: string
): Promise<boolean> {
  if (!input.origin || !input.cookie) return false
  try {
    const res = await fetch(
      `${input.origin}/api/sites/${encodeURIComponent(input.siteKey)}/component-credential`,
      {
        method: 'PUT',
        headers: {
          cookie: input.cookie,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({ endpoint, token })
      }
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        code?: string
      } | null
      console.warn(`[tracy-add-site] component credential not registered: ${res.status} ${body?.code ?? ''}`)
      return false
    }
    return true
  } catch (error) {
    console.warn(
      `[tracy-add-site] component credential not registered: ${error instanceof Error ? error.message : String(error)}`
    )
    return false
  }
}
