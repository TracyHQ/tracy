/**
 * The IMPORT branch as seen from the browser: four doors, three of them belonging to the host half right next door.
 *
 * The road of one import, and who does what:
 *
 *   1. `POST /api/sites {origin:'import'}`   → `cowork-web`  — establish the owner in the seat book
 *   2. `POST /api/tracy-add-site/start`      → HOST HALF     — sign in, install, pull content
 *   3. `POST /api/tracy-add-site/status`     → HOST HALF     — how far it got
 *   4. `POST /api/sites/:key/provision`      → `cowork-web`  — tell the fleet to build from those two keys
 *
 * 🔒 RELATIVE PATHS, all four. dsh is served on the same origin as `cowork-web`, so the session cookie
 * goes with every call — including the one to the host half, which reuses that very cookie to talk
 * to storage. Typing an absolute origin here creates a cross-origin request without the cookie, and
 * it returns a 401 that looks exactly like "not signed in".
 *
 * 🔒 THE ADMIN PASSWORD ONLY PASSES THROUGH THE `start` DOOR, once. It is not written to `localStorage`, not
 * into state living longer than the screen, and never comes back in any answer — the host half's `RunState`
 * deliberately has no field for it.
 */

/** The steps of an import, exactly as the host half narrates them. */
import { asRecord } from './create'
import { type DoorAnswers, doorCode } from './door-code.mjs'
import { dshUrl } from './dsh-url'
import { pollVerdict } from './import-poll.mjs'

export type ImportStep = 'signing_in' | 'installing' | 'reading_content' | 'reading_files' | 'handing_over'

export interface ImportRun {
  id: string
  siteKey: string
  platform: string
  state: 'running' | 'done' | 'error'
  step: ImportStep
  detail: {
    tables?: number
    table?: string
    files?: number
    bytes?: number
    parts?: number
    /** The webroot's size as the site's engine counts it, when it can say (#1567). */
    totalBytes?: number
    /** Bytes a second the run has sent. */
    rate?: number
    /** When the part on its way was first asked for, on the host's clock. */
    partStartedAt?: number
  }
  /** The host's clock when it answered, to measure `partStartedAt` against. */
  now?: number
  /** On `interrupted`: Continue needs nothing typed again (`src/host/run.ts`). */
  resumable?: boolean
  result?: { webrootKey: string; dbKey: string; liveSite: string; fingerprint?: unknown }
  /** The host's own handover of `result` (#1652, `src/host/fleet-handover.ts`); the wizard follows it. */
  handover?: { state: 'pending' } | { state: 'filed'; jobId: string } | { state: 'refused'; code: string }
  error?: string
  /** Values `error`'s sentence names: on `php_too_old`, the site's PHP and the minimum. */
  errorDetail?: ImportErrorDetail
  /** Where the run stopped and what it checked there (`src/host/diagnostic.mjs`). */
  diagnostic?: { at: string; check: string }
}

export interface ImportErrorDetail {
  php?: string
  minimumPhp?: string
  have?: string
  need?: string
  /** On `upload_too_large` over a PHP limit the site named: the package and that limit, in MB. */
  packageMb?: string
  limitMb?: string
  /** On `blocked_by_firewall`: the firewall that answered, one of `FIREWALLS` and nothing else. */
  firewall?: Firewall
  /** The diagnostic check the run failed on, when the sentence depends on it. */
  check?: string
  /** The platform of the run that failed, when the sentence depends on it (`invalid_credential`). */
  platform?: string
}

/** The names `firewallOf` (`src/host/firewall.mjs`) gives a firewall. */
const FIREWALLS = ['cloudflare', 'sucuri', 'wordfence', 'imunify360', 'modsecurity', 'firewall'] as const

export type Firewall = (typeof FIREWALLS)[number]

/** A firewall name from the status door, kept only when it is one `firewallOf` gives. */
export function knownFirewall(value: unknown): Firewall | undefined {
  return FIREWALLS.find((name) => name === value)
}

/**
 * What a failed run hands the refusal sentence: the run's `errorDetail` with its firewall kept
 * only when it is a known name, plus the check it stopped on and its platform.
 */
export function failedRunDetail(run: ImportRun): ImportErrorDetail {
  const { firewall, ...detail } = run.errorDetail ?? {}
  const named = knownFirewall(firewall)
  // An interrupted run whose site code is not on the host needs the sign-in details again (#1565).
  const check =
    run.error === 'interrupted' && run.resumable === false ? 'credentials_needed' : run.diagnostic?.check
  return {
    ...detail,
    ...(named ? { firewall: named } : {}),
    ...(check ? { check } : {}),
    ...(run.platform ? { platform: run.platform } : {})
  }
}

export interface ExtensionInfo {
  version: string
  packageUrl: string
  releaseUrl: string | null
}

/**
 * One answer from a door, with nothing decided yet: the transport's own verdict (`0` = the request
 * never got an answer) and whether a body could be read at all stay apart until the caller
 * classifies them. An unreadable body is `{}` AND `readable: false` — never a guessed code.
 */
interface Answer {
  status: number
  body: Record<string, unknown>
  readable: boolean
}

async function post(path: string, body: unknown): Promise<Answer> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch {
    // A dead network is an answer, not an exception to throw upward: someone is looking at a
    // button, and the button has to be able to say something. It is NOT a refusal: the request may
    // have arrived and only its answer was lost.
    return { status: 0, body: {}, readable: false }
  }
  try {
    const parsed: unknown = await response.json()
    const readable = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    return { status: response.status, body: asRecord(parsed), readable }
  } catch {
    return { status: response.status, body: {}, readable: false }
  }
}

/** The code a door sends with this status, or the bare status (`door-code.ts`). */
const codeOf = (answers: DoorAnswers, answer: Answer): string =>
  doorCode(answers, answer.status, answer.readable ? answer.body.code : undefined)

/** `handleExtension` in `src/host/index.ts`. */
const EXTENSION_ANSWERS: DoorAnswers = {
  400: new Set(['UNSUPPORTED_PLATFORM']),
  502: new Set(['EXTENSION_MANIFEST_UNAVAILABLE'])
}

/**
 * The import branch of `POST /api/sites` (`apps/tracy-web/src/sites/route.js`): `requireViewer`,
 * `resolveBuildRequest`, the address check, `domainTaken`, `keepImportPlatform`.
 */
const CLAIM_REFUSALS: DoorAnswers = {
  400: new Set(['INVALID_REQUEST', 'INVALID_SITE_KEY', 'UNSUPPORTED_PLATFORM']),
  401: new Set(['NOT_SIGNED_IN']),
  409: new Set(['TAKEN', 'PLATFORM_CHANGED', 'IMPORT_REMOVING'])
}

/**
 * `POST /api/sites/:key/provision` (same file), with the host's own "start nothing new" on the
 * 503 it sends it with. `ALREADY_PROVISIONED` was this door's 409 to a second handover before it
 * answered a repeat with the standing job; it stays bound to that status.
 */
const PROVISION_ANSWERS: DoorAnswers = {
  400: new Set(['INVALID_REQUEST', 'UNSUPPORTED_PLATFORM', 'ARCHIVE_REQUIRED']),
  401: new Set(['NOT_SIGNED_IN']),
  403: new Set(['SEAT_NOT_AUTHORIZED', 'KEY_NOT_YOURS']),
  404: new Set(['SITE_UNKNOWN']),
  409: new Set(['TAKEN', 'PLATFORM_CHANGED', 'ALREADY_PROVISIONED', 'IMPORT_REMOVING']),
  503: new Set(['HOST_UPDATING'])
}

/**
 * The current extension release and where to download it — used for BOTH ways of step 2.
 *
 * The same source as the automatic road, so it is impossible for Tracy to install one version while the manual
 * instructions point to another.
 */
export async function fetchExtension(platform: string): Promise<ExtensionInfo | { code: string }> {
  const answer = await post(dshUrl('/api/tracy-add-site/extension'), { platform })
  if (answer.status !== 200 || typeof answer.body.packageUrl !== 'string') {
    const code = codeOf(EXTENSION_ANSWERS, answer)
    return { code: code.startsWith('HTTP_') ? 'EXTENSION_UNAVAILABLE' : code }
  }
  return {
    version: String(answer.body.version ?? ''),
    packageUrl: answer.body.packageUrl,
    releaseUrl: typeof answer.body.releaseUrl === 'string' ? answer.body.releaseUrl : null
  }
}

/**
 * What one press of the claim door established. Three states, and only the first two are knowledge:
 *
 * - `claimed`: the door answered 200/201 AND named the site that was asked for. `created` says the
 *   row was made by THIS press (201); a 200 is a row that already stood (`alreadyMine`) — an earlier
 *   claim, or an import running in another tab.
 * - `refused`: a 4xx — the door said no before it wrote anything.
 * - `unconfirmed`: everything else (no answer, a 5xx whatever its body names, a success that does
 *   not name the site). No read may be opened under a claim on its strength.
 *
 * `created` permits the first start. `retryable` means the book has no build job for this imported
 * row; only a valid failed run for this site permits another wizard to retry it, including after
 * correcting the selected platform. That retry names the failed
 * run, and the host atomically adopts an existing replacement instead of opening a second read.
 *
 * `press`: this press's identity, strictly increasing per claim. Every start sends the press it
 * follows, and the host opens no read for a start whose press is not newer than one a run already
 * carries (`src/host/run.ts` `superseded`) — so a start delayed on its way never opens a second read
 * after another tab's.
 *
 * `idleMs` and `pressBefore` (a 200 only): how long before this press the claim door was last
 * pressed, on tracy-web's clock, and that press. Once `idleMs` reaches `UNANSWERED_START_MS`, with
 * `retryable` and no run on the host, any wizard may take the claim over: its start names
 * `pressBefore` as the press it supersedes, so if a start of that press turns up after all, the
 * host follows that one's read instead of opening another (#1665: a start the host refused, or one
 * a redeploy cut, left a claim that refused every later start).
 *
 * 🔒 NO CLAIM IS EVER RELEASED FROM HERE (#796). `DELETE /api/sites/:key/claim` removes the site
 * row and its grants and looks at build jobs, not at reads; the runs live in another process. A
 * look at the status door before the DELETE proves nothing about the moment the DELETE lands —
 * another tab may open a read in between. Until a door can check and remove in one step, a claim
 * whose read never built anything stays and is reused by a confirmed retry.
 */
export type ClaimOutcome =
  | {
      kind: 'claimed'
      siteKey: string
      created: boolean
      retryable?: boolean
      idleMs?: number
      press?: string
      pressBefore?: string
    }
  | { kind: 'refused'; code: string; joinPath?: string }
  | { kind: 'unconfirmed'; code?: 'NETWORK' }

/** The server supplies the real site label; no external or guessed join destination is followed. */
export function safeImportJoinPath(value: unknown): string | undefined {
  return typeof value === 'string' && /^\/[a-z0-9][a-z0-9-]*\/join$/.test(value) ? value : undefined
}

/**
 * Establish the owner of an existing site.
 *
 * This door STOPS there — it builds nothing. An imported site is only built once its content is in
 * storage, so provisioning is a separate door at the end.
 *
 * A success is a claim only when the door names the site that was asked for — the door answers
 * `siteKey` as its own normal form of the request's (`lib/http.js`), which is `normalizeSiteKey`
 * here. A success status over an empty or malformed body used to be read as "claimed, under the
 * key that was asked for" (#796), and a body naming ANOTHER site would send the admin password of
 * this one under that key. Neither is a claim.
 */
/** A claim press as the door gives it: digits only (`apps/tracy-web/src/sites/import-address.js`). */
const pressOf = (value: unknown): boolean => typeof value === 'string' && /^\d{1,20}$/.test(value)

export async function claimSite(siteKey: string, platform: string): Promise<ClaimOutcome> {
  const asked = normalizeSiteKey(siteKey)
  const answer = await post('/api/sites', { origin: 'import', siteKey, platform })
  if ((answer.status === 200 || answer.status === 201) && asked !== '' && answer.body.siteKey === asked) {
    return {
      kind: 'claimed',
      siteKey: asked,
      created: answer.status === 201,
      ...(answer.body.retryable === true ? { retryable: true } : {}),
      ...(answer.status === 200 && typeof answer.body.idleMs === 'number' && answer.body.idleMs >= 0
        ? { idleMs: answer.body.idleMs }
        : {}),
      ...(pressOf(answer.body.press) ? { press: answer.body.press as string } : {}),
      ...(answer.status === 200 && pressOf(answer.body.pressBefore)
        ? { pressBefore: answer.body.pressBefore as string }
        : {})
    }
  }
  if (answer.status >= 400 && answer.status < 500) {
    const code = codeOf(CLAIM_REFUSALS, answer)
    const joinPath = code === 'TAKEN' ? safeImportJoinPath(answer.body.joinPath) : undefined
    return { kind: 'refused', code, ...(joinPath ? { joinPath } : {}) }
  }
  return { kind: 'unconfirmed', ...(answer.status === 0 ? { code: 'NETWORK' as const } : {}) }
}

export interface StartImportInput {
  siteKey: string
  platform: string
  /** The failed run this retry replaces; concurrent retries adopt its one replacement. */
  retryOf?: string
  /** The claim press this start follows (`ClaimOutcome` `press`); the host opens no read for a superseded one. */
  press?: string
  /** On a take-over of an idle claim: the earlier press it supersedes (`ClaimOutcome` `pressBefore`). */
  after?: string
  /** Road (a): Tracy signs in and installs itself. */
  adminUrl?: string
  username?: string
  password?: string
  basicAuth?: { username: string; password: string }
  /** Road (b): the customer installs it themselves and pastes the token. */
  token?: string
  webRootUrl?: string
}

/**
 * What one press of the start door established.
 *
 * - `started`: 202 with a run to follow.
 * - `refused`: the door said no BEFORE it opened a run — and that is known only for the exact
 *   answers `handleStart` gives ahead of `startRun` at a 4xx (`START_REFUSALS`).
 * - `unconfirmed`: everything else. The request may have opened a run whose answer was lost (no
 *   answer at all, a gateway's 5xx whatever its body names, a success with no run id, a refusal
 *   this door does not give). A read may be going under the claim, so nothing is started again
 *   until `reconcileImport` has found out.
 */
export type StartOutcome =
  | { kind: 'started'; runId: string }
  | { kind: 'refused'; code: string }
  | { kind: 'unconfirmed' }

/**
 * How long a start may go unanswered, with no run of it on the host, before it counts as one that
 * never arrived: the unconfirmed screen offers Start again after it, and a claim no press touched for
 * this long, with no run on the host, may be started under (`ClaimOutcome` `idleMs`, #1665).
 */
export const UNANSWERED_START_MS = 120_000

/** The refusals `handleStart` answers before any run exists (`src/host/index.ts`), by status. */
const START_REFUSALS: Record<number, string> = {
  400: 'INVALID_REQUEST',
  401: 'NOT_SIGNED_IN',
  // A Remove holds the site on the host (`hold.ts`): no read begins under it.
  409: 'IMPORT_REMOVING'
}

/** Open the read of the old site. Returns `runId` immediately — the work runs for tens of minutes. */
export async function startImport(input: StartImportInput): Promise<StartOutcome> {
  const answer = await post(dshUrl('/api/tracy-add-site/start'), input)
  if (answer.status === 202 && typeof answer.body.runId === 'string' && answer.body.runId.trim() !== '') {
    return { kind: 'started', runId: answer.body.runId }
  }
  const refusal = START_REFUSALS[answer.status]
  if (refusal !== undefined && answer.readable && answer.body.code === refusal) {
    return { kind: 'refused', code: refusal }
  }
  return { kind: 'unconfirmed' }
}

const IMPORT_STEPS: readonly string[] = [
  'signing_in',
  'installing',
  'reading_content',
  'reading_files',
  'handing_over'
]

const text = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

/**
 * A body of the status door, read as the run of ONE site on ONE platform — or `null`.
 *
 * Every field the wizard acts on is checked here, because the run found by site key is adopted
 * without this wizard ever having been handed its id: a run of another site or another platform, a
 * state the door does not give, or a finished run without its three keys is not a run to follow.
 */
function runOf(body: Record<string, unknown>, siteKey: string, platform: string): ImportRun | null {
  if (!text(body.id) || body.siteKey !== siteKey || body.platform !== platform) return null
  if (body.state !== 'running' && body.state !== 'done' && body.state !== 'error') return null
  if (typeof body.step !== 'string' || !IMPORT_STEPS.includes(body.step)) return null
  const detail = body.detail
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return null
  if (body.state === 'done') {
    const result = asRecord(body.result)
    if (!text(result.webrootKey) || !text(result.dbKey) || !text(result.liveSite)) return null
  }
  return body as unknown as ImportRun
}

/**
 * What the host knows of a site's runs at one moment, asked by site key (the door answers the
 * LATEST run of the site, `runForSite`).
 *
 * - `none`: the door's own `RUN_UNKNOWN` — no run of this site in its memory.
 * - `ended`: the latest run is over (`done` or `error`); `runId` names it.
 * - `running`: a read is going. `run` is that read when it is one this wizard can follow (this
 *   platform, every field in form), else `null` — still a read that must not be doubled.
 * - `unknown`: no answer, a failed or malformed one, a run of another site.
 */
export type Standing =
  | { kind: 'none' }
  | { kind: 'ended'; runId: string; retryable: boolean }
  | { kind: 'running'; run: ImportRun | null }
  | { kind: 'unknown' }

/**
 * The site's latest run as the status door tells it — asked BEFORE a start is sent.
 *
 * A claim alone says nothing about a read: one that already stood may carry a read from another
 * tab, or from a start whose answer was lost before this wizard was opened again (#796). So the
 * wizard follows a `running` read instead of opening a second one, and keeps the id of an `ended`
 * one so that run is never taken for the one it starts next. A failed run of this site can be
 * retried after correcting the platform, only when the claim door also confirmed no build job.
 * A running read must still match the selected platform to be followed. No run, or a completed one, permits no
 * new start under another wizard's claim: a start still on its way to the host has no run yet.
 */
export async function standingRun(siteKey: string, platform: string): Promise<Standing> {
  const answer = await post(dshUrl('/api/tracy-add-site/status'), { siteKey })
  if (answer.status === 404 && answer.readable && answer.body.code === 'RUN_UNKNOWN') return { kind: 'none' }
  if (answer.status !== 200 || !answer.readable) return { kind: 'unknown' }
  const { id, state, platform: previousPlatform } = answer.body
  if (!text(id) || answer.body.siteKey !== siteKey) return { kind: 'unknown' }
  if (state === 'running') return { kind: 'running', run: runOf(answer.body, siteKey, platform) }
  if (state === 'done' || state === 'error')
    return {
      kind: 'ended',
      runId: id,
      retryable:
        state === 'error' &&
        (previousPlatform === 'joomla' || previousPlatform === 'wordpress') &&
        runOf(answer.body, siteKey, previousPlatform) !== null
    }
  return { kind: 'unknown' }
}

/**
 * What the host knows of a site's import when the recovery page opens (`?import=<siteKey>`).
 *
 * - `run`: the site's latest run, by id and platform — the wizard follows it from there exactly as it
 *   follows a run found after a reload (`found`), so Retry (#1578) and Continue (#1565) are the same
 *   presses they are anywhere else.
 * - `none`: the door's own `RUN_UNKNOWN` — no run of this site on record, so nothing to retry or
 *   continue from here.
 * - `unknown`: no answer, a failed or malformed one, or a run of another site: ask again.
 */
export type Recovered =
  | { kind: 'run'; runId: string; platform: string }
  | { kind: 'none' }
  | { kind: 'unknown' }

/**
 * Rebuild an unfinished import from the host, not from the tab: works after a reload and from another
 * device, because the status door answers by site key from the runs the host keeps (`runs.json`).
 */
export async function recoverImport(siteKey: string): Promise<Recovered> {
  const answer = await post(dshUrl('/api/tracy-add-site/status'), { siteKey })
  if (answer.status === 404 && answer.readable && answer.body.code === 'RUN_UNKNOWN') return { kind: 'none' }
  if (answer.status !== 200 || !answer.readable) return { kind: 'unknown' }
  const { id, platform } = answer.body
  if (!text(id) || answer.body.siteKey !== siteKey) return { kind: 'unknown' }
  if (platform !== 'joomla' && platform !== 'wordpress') return { kind: 'unknown' }
  return { kind: 'run', runId: id, platform }
}

/**
 * Remove an unfinished import (`DELETE /api/sites/:key/import`): tracy-web deletes it only once the
 * host confirmed no read is going. `IMPORT_RUNNING`: a read is going; anything else that is not a
 * removal is "not now", and nothing was removed.
 */
export async function removeImport(
  siteKey: string
): Promise<{ kind: 'removed' } | { kind: 'refused'; code: string }> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/import`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  }).catch(() => null)
  if (!response) return { kind: 'refused', code: 'NETWORK' }
  const body = asRecord(await response.json().catch(() => null))
  if (response.ok && body.removed === true) return { kind: 'removed' }
  return {
    kind: 'refused',
    code: response.status === 409 && body.code === 'IMPORT_RUNNING' ? 'IMPORT_RUNNING' : 'LATER'
  }
}

/**
 * What the status door knows about a start nobody could confirm.
 *
 * - `running` / `done`: a run of exactly this site and platform, in a form the wizard can follow,
 *   that is NOT the run that stood before the start was sent (`prior`): the door answers the
 *   site's latest run, and an earlier finished one is no evidence of this press.
 * - `unresolved`: anything else — no answer, a failed or malformed one, a run of something else, a
 *   run that ended in an error, the earlier run again, and `RUN_UNKNOWN`. None of these says the
 *   start never happened: the door reads dsh's memory, a request still on its way has no run yet.
 *   So `unresolved` permits no other start.
 */
export type Reconciled =
  | { kind: 'running'; run: ImportRun }
  | { kind: 'done'; run: ImportRun }
  | { kind: 'unresolved' }

/**
 * Ask the status door for the run of `siteKey` — the only way to find a run whose id was lost.
 * @param prior The id of the site's latest run before the start was sent (`standingRun`), or `null`.
 */
export async function reconcileImport(
  siteKey: string,
  platform: string,
  prior: string | null
): Promise<Reconciled> {
  const answer = await post(dshUrl('/api/tracy-add-site/status'), { siteKey })
  if (answer.status !== 200 || !answer.readable) return { kind: 'unresolved' }
  const run = runOf(answer.body, siteKey, platform)
  if (!run || run.state === 'error' || run.id === prior) return { kind: 'unresolved' }
  return { kind: run.state, run }
}

/**
 * How far the read has got.
 *
 * `null` means "ask again", not "failed": a missed poll is most likely a busy machine, and
 * changing screens over one missed poll makes people read bad news that may not be true.
 */
export async function pollImport(runId: string): Promise<ImportRun | 'lost' | null> {
  const answer = await post(dshUrl('/api/tracy-add-site/status'), { runId })
  const verdict = pollVerdict(answer.status, answer.body)
  if (verdict === 'lost') return 'lost'
  if (verdict === 'retry') return null
  return answer.body as unknown as ImportRun
}

/**
 * Tell the fleet to build the copy from the two keys just uploaded.
 *
 * This is the import branch's OWN provisioning — it carries the archive, and deliberately does NOT carry `fresh`.
 */
export async function provisionImported(
  siteKey: string,
  platform: string,
  // `fingerprint`: the live site as the import found it, for the first Sync from live to compare with.
  keys: { webrootKey: string; dbKey: string; liveSite: string; fingerprint?: unknown }
): Promise<{ jobId: string } | { code: string }> {
  const answer = await post(`/api/sites/${encodeURIComponent(siteKey)}/provision`, { platform, ...keys })
  if (answer.status === 202 && typeof answer.body.jobId === 'string') return { jobId: answer.body.jobId }
  if (answer.status === 0) return { code: 'NETWORK' }
  // A code is read only on the status this door sends it with; a 5xx naming anything else is a
  // door that failed, and a 4xx naming a code of another status is read by its status alone.
  return { code: codeOf(PROVISION_ANSWERS, answer) }
}

/**
 * The site address people typed, brought to the form the seat book accepts.
 *
 * Drop the scheme, drop `www.`, drop everything after the first `/` — the same normalisation the seat book's
 * `normalizeSiteKey` does, so the name on screen is the name that goes into the book. No shape check here:
 * the seat book is the gate, and a second copy of that rule is a copy to drift.
 */
export function normalizeSiteKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
}

/**
 * Why an address inside Tracy's zone CANNOT be imported.
 *
 * `seat-registry` already guards this and returns `INVALID_SITE_KEY` (`index.js`, the `origin: 'import'` branch):
 * without that guard import would be a detour around all the naming rules — claim `api.tracy.ai` as yours
 * and hold an internal address. The guard here does NOT replace it, and must not: the server is still
 * where the decision is made.
 *
 * 🔒 IT EXISTS BECAUSE REFUSING AT THE WRONG MOMENT IS EXPENSIVE. Without it, the wizard leads people through the
 * platform step, makes them type **their site's admin password**, and only then asks the server and gets a refusal —
 * a password typed out for a run that could never go. Measured 08/09 on
 * `dev-t-wordpress.tracy.ai`.
 *
 * The Fork branch already had exactly this rule on the client (`fork-url.mjs`, reason `tracy`); this is the
 * Import branch's missing copy. Both take `zone` as a parameter (Task 11) — the same fact, read
 * from `tracyConfig().siteDomain` rather than hard-coding `tracy.ai`, and `fork-url.mjs` chose that
 * first.
 * @param siteKey The address normalised through `normalizeSiteKey`.
 * @param zone The current deployment's zone — `tracyConfig().siteDomain`. Defaults to `'tracy.ai'`
 *   (production) when the caller does not have it to hand.
 * @returns `'tracy'` when it must be refused, `null` when accepted.
 */
export function importAddressRefusal(siteKey: string, zone = 'tracy.ai'): 'tracy' | null {
  if (!siteKey) return null
  return siteKey === zone || siteKey.endsWith(`.${zone}`) ? 'tracy' : null
}

/** The default admin page address for a platform — a suggestion the user can edit. */
export function defaultAdminUrl(siteKey: string, platform: string): string {
  if (!siteKey) return ''
  return platform === 'wordpress' ? `https://${siteKey}/wp-login.php` : `https://${siteKey}/administrator`
}

/**
 * What this site looks like it runs — to warn when the step 1 choice disagrees with reality.
 *
 * `null` means "could not tell", and it must NOT show as a warning: a well-hardened site
 * returns `null` perfectly normally.
 */
export async function detectPlatform(siteKey: string): Promise<string | null> {
  const answer = await post(dshUrl('/api/tracy-add-site/detect'), { siteKey })
  return answer.status === 200 && typeof answer.body.platform === 'string' ? answer.body.platform : null
}
