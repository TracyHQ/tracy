/**
 * Talk to `cowork-web`: place a site creation, then follow it.
 *
 * 🔒 NO SECRET HERE, and that is the whole design. The plugin runs in the customer's container;
 * `FLEET_ACTOR_SECRET` stays in the Worker, and the Worker signs the assertion on the viewer's behalf. The same road
 * `/api/sites/:key/changes` already takes.
 *
 * Paths are RELATIVE. dsh is served under `/agent` on the same origin as `cowork-web`, so
 * `fetch('/api/sites')` reaches the right Worker with the session cookie. Typing an absolute origin here creates
 * a cross-origin request without the cookie — and it returns a 401 that looks exactly like "not signed in".
 */

import { tracyWebFetch as fetch } from '@tracy/core/web-path'
import { briefOutcomeOf } from './brief-outcome.mjs'
import { type JobPick, jobPickOf } from './design-system-pick.mjs'
import { type DoorAnswers, doorCode } from './door-code.mjs'

/**
 * The refusal the door returns, including the three local refusals and `taken`, which only the server knows.
 *
 * `signed_out` and `pending` (#796) used to be `other`, which printed the bare machine code. A
 * session that ended while the wizard stood open is the likeliest refusal of all, and its next
 * step (sign in) is not the next step of anything else.
 *
 * `unsupported` and `conflict` are refusals that pressing again can never change, so they must not
 * share the sentence of `other`, which is the outcome nobody can vouch for: no answer, an answer
 * that cannot be read, or a failure after the door may already have made the site.
 */
export type CreateRefusal =
  | 'shape'
  | 'reserved'
  | 'looks_imported'
  | 'taken'
  | 'host_updating'
  | 'signed_out'
  | 'pending'
  | 'unsupported'
  | 'conflict'
  /** The person's sites are kept on another Tracy server (shard beta); `url` says where to add this one. */
  | 'elsewhere'
  | 'other'

/** The door cannot build what was chosen (`sites/route.js`, `resolveBuildRequest`). */
const UNSUPPORTED_CODES: ReadonlySet<string> = new Set([
  'UNSUPPORTED_PLATFORM',
  'UNSUPPORTED_QUICKSTART',
  'UNSUPPORTED_DESIGN',
  'UNKNOWN_DESIGN',
  'DESIGN_SYSTEMS_OFF',
  // The design system the form sends is not one the library offers (`designSystem`, Akemi 12/10/2026).
  'DS_UNKNOWN'
])

export interface CreateStarted {
  siteKey: string
  jobId: string
}

export interface CreateRefused {
  refusal: CreateRefusal
  /** The machine-readable code, kept for the caller's logic; never shown on screen (#796). */
  code: string
  /** Only with `elsewhere`: the absolute https URL the door sent, where the wizard goes next. */
  url?: string
  /** Navigation did not complete while the creation page remained open. */
  redirectFailed?: boolean
}

export type CreateOutcome = CreateStarted | CreateRefused

/** A creation that started, or was refused. */
export function started(outcome: CreateOutcome): outcome is CreateStarted {
  return 'jobId' in outcome
}

/** What the customer said in the "Tell Tracy about your site" popup; see `site-brief.mjs`. */
export interface CreateBrief {
  /** By question id: what the customer typed or picked in each question of the site's questionnaire. */
  answers: Record<string, string | string[] | Record<string, string>>
  /** The content hash of the questionnaire that was shown, so the server judges the answers against it. */
  questionnaire?: string
}

/**
 * What `POST /api/sites` answers when it does not start a build
 * (`apps/tracy-web/src/sites/route.js`: `requireViewer`, `resolveBuildRequest`, `domainTaken`, and
 * the host's refusal relayed with its status).
 */
const CREATE_ANSWERS: DoorAnswers = {
  400: new Set([
    'INVALID_LABEL',
    'INVALID_REQUEST',
    'INVALID_BUILD_ID',
    'DEMO_WORKFLOW_INVALID',
    ...UNSUPPORTED_CODES
  ]),
  403: new Set(['CSRF_ORIGIN', 'DS_TEMPLATE_LOCKED', 'ACCOUNT_NOT_ON_SHARD']),
  415: new Set(['UNSUPPORTED_MEDIA_TYPE']),
  401: new Set(['NOT_SIGNED_IN']),
  // Shard beta (docs/sre/hop-dong-cua-shard.md §6, §12): the master names the server that keeps
  // the person's sites (`USE_SHARD`), a full shard names the master's fresh-start door (`SHARD_FULL`).
  409: new Set([
    'TAKEN',
    'IDEMPOTENCY_CONFLICT',
    'USE_SHARD',
    'TEMPLATE_VERSION_CHANGED',
    'DESIGN_PLAN_CHANGED',
    'AGENT_DEMO_CREATE_REFUSED'
  ]),
  503: new Set(['HOST_UPDATING', 'SHARD_FULL'])
}

/**
 * A reply read as an object whatever arrived. `null`, a list or a bare string are valid JSON and
 * not an answer of this door; read as "nothing was said", they take the same path as a body that
 * is not JSON at all instead of throwing on the first property (#796).
 */
export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * The address another server told this wizard to continue at, or null. Only an ABSOLUTE https URL
 * is followed: the door answers on the same origin as the wizard, so the value is the server's own,
 * but a relative path, another scheme or a string that is not a URL is not something to send a
 * browser to (shard beta: `USE_SHARD` `redirect`, `SHARD_FULL` `createAt`).
 */
export function elsewhereUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  try {
    return new URL(value).protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

async function postSite(payload: {
  label: string
  buildId?: string
  platform: string
  design?: string
  brief?: CreateBrief
  designSystem?: string
  wizardId?: string
}): Promise<CreateOutcome & { template?: string }> {
  let response: Response
  try {
    response = await fetch('/api/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
  } catch {
    // A dropped network is an answer, not an exception to throw upward: the user is looking at
    // a button, and the button must be able to say something.
    // The request may have reached the door before the answer was lost, so `other` never says
    // that nothing was created.
    return { refusal: 'other', code: 'NETWORK' }
  }

  let body: Record<string, unknown> = {}
  try {
    body = asRecord(await response.json())
  } catch {
    body = {}
  }

  if (response.ok) {
    // An earlier press with the same build id is still being answered (202, no job yet): nothing
    // failed, and the same press works in a moment.
    if (response.status === 202 && body.code === 'CREATE_PENDING') {
      return { refusal: 'pending', code: 'CREATE_PENDING' }
    }
    const siteKey = typeof body.siteKey === 'string' ? body.siteKey : ''
    const jobId = typeof body.jobId === 'string' ? body.jobId : ''
    if (siteKey && jobId) return { siteKey, jobId }
    return { refusal: 'other', code: 'FLEET_ANSWERED_UNREADABLY' }
  }

  // From here on `code` is the door's own name for this answer, or the bare status: a code on a
  // status the door does not send it with decides nothing (`doorCode`).
  const code = doorCode(CREATE_ANSWERS, response.status, body.code)
  // The exact answer the host gives when a deploy asked it to start nothing new — 503
  // `HOST_UPDATING` (`tracy-host` `app.js`, relayed with its status).
  if (code === 'HOST_UPDATING') return { refusal: 'host_updating', code }
  // The person's sites are kept on another Tracy server (shard beta): the master answers 409
  // USE_SHARD with `redirect`, a full shard 503 SHARD_FULL with `createAt`. Read before the 5xx
  // rule below: this 503 is a refusal with a next step, not a door that failed.
  const elsewhere =
    code === 'USE_SHARD'
      ? elsewhereUrl(body.redirect)
      : code === 'SHARD_FULL'
        ? elsewhereUrl(body.createAt)
        : null
  if (elsewhere !== null) return { refusal: 'elsewhere', code, url: elsewhere }
  // Everything else on a 5xx is a door that failed, not one that refused: the site may have been
  // made. That is the unknown outcome, which sends the reader to My Sites first.
  if (response.status >= 500) return { refusal: 'other', code }
  if (code === 'TAKEN') return { refusal: 'taken', code }
  // The session ended: a 401, whether the body is the door's own JSON or a gateway's page.
  if (response.status === 401) return { refusal: 'signed_out', code }
  // The seat book returns `INVALID_LABEL` with a `reason` — mapped straight to exactly one of the wizard's three sentences.
  if (code === 'INVALID_LABEL') {
    const reason = typeof body.reason === 'string' ? body.reason : ''
    if (reason === 'shape' || reason === 'reserved' || reason === 'looks_imported') {
      return { refusal: reason, code }
    }
  }
  // The same press was already recorded with different details; the same press again is refused
  // the same way.
  if (code === 'IDEMPOTENCY_CONFLICT') return { refusal: 'conflict', code }
  if (UNSUPPORTED_CODES.has(code)) {
    // `template` belongs to this refusal alone (`resolveBuildRequest`); beside any other answer
    // it names nothing.
    const template = typeof body.template === 'string' ? body.template : undefined
    return { refusal: 'unsupported', code, ...(template ? { template } : {}) }
  }
  return { refusal: 'other', code }
}

/**
 * Place a site creation.
 *
 * The Worker makes two calls (establish the owner, then provision) and only returns once both are done — so this
 * function needs just one `fetch`.
 * @param label The normalised name.
 * @param platform The chosen platform.
 * @param design Template to start from (start-template.mjs); omitted means the site is made as before.
 * @param buildId The press's idempotency key.
 * @param brief The popup's answers (Apply). Absent for "I will do it later": that body is byte for byte
 *   what it was before the popup existed, so the plain road cannot be slowed down by the brief road.
 * @param designSystem The library id of the design system picked in the form: the server keeps it on the site and
 *   puts it on at the end of the build. Absent for the template's own look (the body is then as it always was).
 * @param wizardId The id this opening of the wizard drew (`wizardOpened`), for usage: which opening reached Create.
 * @returns The job placed, or the reason it was refused.
 */
export async function createSite(
  label: string,
  platform: string,
  design?: string,
  buildId?: string,
  brief?: CreateBrief,
  designSystem?: string,
  wizardId?: string
): Promise<CreateOutcome> {
  const first = await postSite({
    label,
    platform,
    design,
    buildId,
    ...(brief ? { brief } : {}),
    ...(designSystem ? { designSystem } : {}),
    ...(wizardId ? { wizardId } : {})
  })
  // The card and the create door can disagree for a moment (a release stops being choosable
  // between reading the card and pressing Create). The server answers 400 with `template`; the
  // customer still gets a site, the way the wizard made one before it named a template.
  // A template that left the catalogue altogether is read as a design system and refused without
  // `template` (UNSUPPORTED_DESIGN / UNKNOWN_DESIGN, route.js) — the same moment, the same answer.
  const stale =
    'refusal' in first &&
    (first.template !== undefined || first.code === 'UNSUPPORTED_DESIGN' || first.code === 'UNKNOWN_DESIGN')
  // The pick was for that template: a site that does not start from it does not carry it.
  if (design !== undefined && stale)
    return postSite({
      label,
      platform,
      buildId,
      ...(brief ? { brief } : {}),
      ...(wizardId ? { wizardId } : {})
    })
  return first
}

/** Where a tab keeps the id of the wizard opening it is in (`openingId`). */
const OPENING_KEY = 'tracy:add-site-opening'
/** A form mounted again within this of the last opening in the same tab is the same opening. */
export const OPENING_MS = 30 * 60_000

/**
 * The id of this tab's current opening of the wizard, drawn when there is none. Measured on the local stand
 * (17/10/2026): one opening mounted the form twice, 12 ms apart, and two ids made one customer look like an
 * opening left before Create. So a mount within {@link OPENING_MS} of the last, in the same tab, keeps its id;
 * a Create that started ends the opening (`openingUsed`). A tab whose storage refuses draws one per mount.
 * @param store The tab's `sessionStorage`, or null.
 * @param now Epoch milliseconds.
 */
export function openingId(store: Storage | null, now = Date.now()): string {
  try {
    const held = JSON.parse(store?.getItem(OPENING_KEY) ?? 'null') as { id?: unknown; at?: unknown } | null
    if (held && typeof held.id === 'string' && typeof held.at === 'number' && now - held.at < OPENING_MS)
      return held.id
  } catch {}
  const id = crypto.randomUUID()
  try {
    store?.setItem(OPENING_KEY, JSON.stringify({ id, at: now }))
  } catch {}
  return id
}

/** A Create started from this opening: the next form the tab shows is a new opening. */
export function openingUsed(store: Storage | null): void {
  try {
    store?.removeItem(OPENING_KEY)
  } catch {}
}

/**
 * Tell tracy-web this opening of the wizard happened (`POST /api/sites/wizard`, usage): the same id goes
 * again with Create, so an opening that never reached Create can be counted. Never awaited by the form and
 * never surfaced: a refusal or a lost answer only means one opening is not counted.
 * @param wizardId The id this opening drew.
 * @param where `new` on the creation workspace, `site` inside a site's workspace.
 */
export function wizardOpened(wizardId: string, where: 'new' | 'site'): void {
  void fetch('/api/sites/wizard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wizardId, where })
  }).catch(() => {})
}

/**
 * Tell tracy-web this opening reached a page of the form (`POST /api/sites/wizard` with `step`, usage), so the
 * pages between opening and Create show where the form was left. tracy-web keeps one per opening and page; like
 * `wizardOpened`, never awaited and never surfaced.
 * @param wizardId The id this opening drew.
 * @param step `<origin>:<page>`, one of tracy-web's `WIZARD_STEPS` (`sites/route.js`).
 */
export function wizardStep(wizardId: string, step: string): void {
  void fetch('/api/sites/wizard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wizardId, step })
  }).catch(() => {})
}

/**
 * One fleet job, the part the console needs to read.
 *
 * ⚠ THIS SHAPE IS MEASURED FROM A REAL JOB (31/08), not derived from the ADR. The fleet's job row carries
 * `{id, createdAt, updatedAt, state, step, label, port}`, and **no** `liveUrl`/`adminUrl`.
 *
 * 🔒 `output` IS there, and the sentence above said it was not until 17/09. Re-measured on a real failed job
 * (`demoemdash`, 16/09): the door returns `body` unchanged (`sites/route.js`: `return json(c, body)`), and
 * `body` carries `output` — the very sentence saying why the build died:
 *
 *     !! no tracy/emdash image on this host yet.
 *        build the latest upstream:  bash …/provision/emdash/build-image.sh
 *
 * That sentence sits in the same object as `step`, and the screen only showed `The build stopped.` The first version of
 * the file read `output` **instead of** `step`, so the console showed no steps — the right fix is to
 * read BOTH, not drop one.
 */
export interface JobState {
  /**
   * `gone`: the door answered 403/404 for this job — the site was deleted, or this viewer no longer
   * holds it. Nothing will ever change that answer by asking again, so it ends the watch like `done`
   * and `failed` do (#362: a deleted site's build was polled for ~70 min, every answer a 403).
   */
  state: 'queued' | 'running' | 'done' | 'failed' | 'gone' | 'unknown'
  /** A session refusal cannot recover by repeating the same signed-out request. */
  pollIssue?: 'signed_out'
  /** The current milestone, e.g. `"> starting database"`. One line, not the whole log. */
  step: string
  /**
   * The site address — returned by the **Worker** after the address is published, and the Worker takes it from
   * `publishAddress`, which builds the hostname from the very label it just registered with Cloudflare. Not a
   * string assembled on the client (ADR 0088 §5.1, §7.4).
   */
  liveUrl: string | null
  /**
   * The way into the admin page. The fleet does **not** return it yet, so it is always `null` today and the admin
   * button does not show. That is a choice: a hard-coded `/administrator/` is Joomla's path handed to a
   * WordPress site — ADR 0088 §7.4 names that trap. Better a missing button than a button
   * leading to a 404.
   */
  adminUrl: string | null
  /** The job is done but the address could not be opened yet — entirely different from "not done". */
  addressError: string | null
  /**
   * The host's one-line reason a build stopped (`detail` on the job row, e.g. `tracy-host restarted
   * before this job finished`). Empty unless the job failed with one.
   */
  detail: string
  /**
   * The fleet says why it stopped. Only present on failure, and the ONLY fact that can say why — `step` is just
   * a step name, `The build stopped.` is the client's wording. Empty while the job has not failed.
   */
  output: string
  /**
   * The design system picked in the form, as the server reports it while it puts it on and once it ended
   * (`design-system-pick.mjs` `jobPickOf`); null for a site made with the template's own look.
   */
  designSystem: JobPick | null
  /**
   * How the Customize answers ended (`brief-outcome.mjs`): `failed` keeps the ready screen up to say so;
   * null for a site made without answers, or before the job is done.
   */
  brief: 'applied' | 'failed' | null
}

/**
 * A job state after which asking again changes nothing: the build finished, failed, or can no
 * longer be read at all. Every watch of a job stops on one of these (#362).
 * @param state The state `pollJob` read.
 * @returns Whether the watch is over.
 */
export function jobSettled(state: JobState['state']): boolean {
  return state === 'done' || state === 'failed' || state === 'gone'
}

/**
 * Ask how far a job has got.
 *
 * A failed poll is NOT a failed job — the machine is very likely busy. Return `unknown` so the watch loop
 * asks again, the same semantics as `runFleetJob` in `cowork-web` and in `tracy-desk`.
 *
 * 403 and 404 normally say this viewer will never read this job
 * again (`JOB_UNKNOWN`, `JOB_NOT_YOURS`, `SEAT_NOT_AUTHORIZED` once the site is deleted — the body
 * may not even be JSON). They answer `gone`, except for the signed-request refusal below. A network error, a 5xx, or a
 * body that cannot be read stays `unknown`: one bad answer is not proof the site is gone. A 403
 * BAD_SIGNATURE is also unknown: the build exists, but the job service refused its signed request.
 * A 401 preserves the ended session separately so the watcher can stop and offer sign-in.
 * @param siteKey The site.
 * @param jobId The job.
 * @returns The state that could be read.
 */
export async function pollJob(siteKey: string, jobId: string): Promise<JobState> {
  const unknown: JobState = {
    state: 'unknown',
    step: '',
    liveUrl: null,
    adminUrl: null,
    addressError: null,
    detail: '',
    output: '',
    designSystem: null,
    brief: null
  }
  let response: Response
  try {
    response = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/jobs/${encodeURIComponent(jobId)}`)
  } catch {
    return unknown
  }
  if (response.status === 401) return { ...unknown, pollIssue: 'signed_out' }
  if (response.status === 403) {
    try {
      const refusal = asRecord(await response.json())
      if (refusal.error === 'BAD_SIGNATURE' || refusal.code === 'BAD_SIGNATURE') return unknown
    } catch {
      // An unreadable access refusal still says this viewer cannot read this build.
    }
    return { ...unknown, state: 'gone' }
  }
  if (response.status === 404) return { ...unknown, state: 'gone' }
  if (!response.ok) return unknown

  let body: Record<string, unknown> = {}
  try {
    body = asRecord(await response.json())
  } catch {
    return unknown
  }
  const state = body.state
  return {
    // `ready` is read as `done`: it is the host's name for the last step of a finished build, and a
    // row that says it has nothing left to wait for.
    state:
      state === 'ready'
        ? 'done'
        : state === 'queued' || state === 'running' || state === 'done' || state === 'failed'
          ? state
          : 'unknown',
    step: typeof body.step === 'string' ? body.step : '',
    // 🔒 TAKEN FROM THE JOB ROW, NOT BUILT ON THE CLIENT. ADR 0088 §5.1 says so plainly, and §7.4 names the trap:
    // a URL assembled on the client looks right until the fleet puts the site somewhere else — then the "open site" button
    // leads to a 404 and nothing in the code says it was guessing.
    liveUrl: typeof body.liveUrl === 'string' ? body.liveUrl : null,
    // The admin path from the platform profile the fleet knows. Do NOT hardcode `/administrator/`: that is
    // Joomla's path, and a WordPress site would get a door that does not exist.
    adminUrl: typeof body.adminUrl === 'string' ? body.adminUrl : null,
    addressError: typeof body.addressError === 'string' ? body.addressError : null,
    detail: typeof body.detail === 'string' ? body.detail : '',
    // The fleet's sentence, verbatim. No interpretation here: whoever reads it is whoever will have to run
    // the command it gives.
    output: typeof body.output === 'string' ? body.output : '',
    designSystem: jobPickOf(body.designSystem),
    brief: briefOutcomeOf(body.briefState)
  }
}
