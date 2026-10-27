/**
 * Creating the site a build dresses (tasks/todo-build-new-site.md §A).
 *
 * WHY HERE AND NOT IN THE HOST. `POST /api/sites` is answered by `cowork-web` as the SIGNED-IN
 * VIEWER: it needs their session cookie, which only the browser has. The lane's host half holds no
 * credential of theirs by design, so the press has to make this call from the page — the same door,
 * with the same cookie, that the Add site wizard uses.
 *
 * The fleet answers 202 with a job, then builds for a while. Everything here is about not lying
 * during that while: a job that is not `done` is never reported as a site, `done` without a live
 * address is not a place to send anyone, and a fleet that never finishes ends the wait with words
 * instead of leaving a spinner forever.
 */

/**
 * How long between polls, and how many before we stop waiting (30 minutes at 2s).
 *
 * 🔒 THE BUDGET HAS TO COVER THE LONGEST SINGLE STEP A PROVISION HAS, NOT AN AVERAGE ONE. It was
 * ≈4 minutes (120 tries) until 22/09/2026, which is shorter than one cold EmDash provision: a host
 * that does not already carry `tracy/<template>-emdash:<version>` builds it from the release's
 * source zip, and that build is ONE step — measured 542s on the local stand (site-6ym32b, quickstart
 * tracy-business/emdash-0.x 1.1.0), 583s for the whole provision. The wait gave up at 240s, so
 * `startBuild` was never called: the site stood up fine minutes later wearing the template's demo
 * brand, `docs/agents/build/job.json` was never written, and not one of `check`, `personalize` or
 * `shot` ran. The customer read "The site … is still building", which is true and says nothing
 * about the build that will now never start. Progress-aware polling does not help here — the image
 * build is a single step that reports nothing for nine minutes — so the budget is simply large
 * enough to contain it. A fleet that really is stuck still ends in words, just later.
 */
const POLL_MS = 2000
const TRIES = 900
/**
 * How many times the create call itself is asked again while the fleet answers `CREATE_PENDING`
 * — another request with the same `buildId` (a double press, a second tab) is still claiming the
 * name and talking to the host. A bounded wait, then the same words a stalled fleet gets.
 */
const PENDING_TRIES = 30
/**
 * How many polls in a row may come back unreadable before this stops calling it progress.
 *
 * Generous on purpose — 15 x 2s = 30 seconds — because the ordinary causes are momentary (a
 * `tracy-web` restart, a laptop waking, one dropped request) and ending a real provision early is
 * worse than waiting a little. What it refuses is the SUSTAINED case, where waiting the full
 * budget tells the customer nothing at all.
 */
const UNREADABLE_TRIES = 15

/**
 * Is somebody signed in? `/auth/me` answers `{ email }` — an email or null.
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>} false on any failure: a reading we could not make is not a session.
 */
export async function signedIn(fetchImpl = fetch) {
  try {
    const res = await fetchImpl('/auth/me', { headers: { accept: 'application/json' } })
    if (!res.ok) return false
    const body = await res.json()
    return typeof body?.email === 'string' && body.email !== ''
  } catch {
    return false
  }
}

/**
 * What a press should do about the session, decided BEFORE anything is opened.
 *
 * Three states, not two, and that is the whole point. The form holds `me` as `undefined` until
 * `/auth/me` answers and `null` when nobody is signed in, and the press used to treat both the
 * same: open the sign-in window, then ask. Measured 19/09 on the Design inspiration flow:
 * *"why does every new site I create make the current user sign in again"*. A press landing before
 * that first answer, or after a read that failed (`whoAmI` turns every failure into `null`, and
 * the form never asks again), flashed a sign-in window at somebody who was already signed in.
 *
 * 🔒 AND "ASK FIRST, OPEN LATER" IS NOT THE FIX FOR ALL THREE. A window opened after an `await`
 * is no longer inside the click, so a popup blocker eats it — which is exactly why the window was
 * opened first. `open` keeps that behaviour for the case where the answer is already known to be
 * "nobody"; `ask` is the case where nothing should be opened until the door has been asked.
 *
 * @param {string | null | undefined} me - the email `/auth/me` gave, null for nobody, undefined
 *   while the form has not heard back.
 * @returns {'go' | 'open' | 'ask'}
 */
export function signInPlan(me) {
  if (typeof me === 'string' && me !== '') return 'go'
  if (me === undefined) return 'ask'
  return 'open'
}

/**
 * Who is signed in, as `/auth/me` answers — the email, or null when nobody is.
 *
 * The Build form no longer asks for a contact address (Lee, 08/09: Contact is a page, not a
 * question), but the contact form on the seeded site still needs somewhere to send mail. This is
 * that somewhere: the account of the person who pressed Build, which costs no question because the
 * press already knocks on this door to check the session.
 *
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string | null>} null on any failure: a reading we could not make is not an address.
 */
export async function whoAmI(fetchImpl = fetch) {
  try {
    const res = await fetchImpl('/auth/me', { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    const body = await res.json()
    return typeof body?.email === 'string' && body.email !== '' ? body.email : null
  } catch {
    return null
  }
}

/**
 * One reading of a fleet job row. Shaped like `tracy-add-site`'s `pollJob` and for the same reason:
 * the live address comes FROM THE ROW, never assembled here — a URL guessed from a label looks right
 * until the fleet puts the site somewhere else.
 * @param {unknown} body
 * @returns {{ state: 'queued'|'running'|'done'|'failed'|'unknown', step: string, liveUrl: string | null, adminUrl: string | null, attached: boolean, laneError: string | null, custody: string | null }}
 */
export function siteFromJob(body) {
  const row = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : {}
  const state = row.state
  return {
    state:
      state === 'queued' || state === 'running' || state === 'done' || state === 'failed' ? state : 'unknown',
    step: typeof row.step === 'string' ? row.step : '',
    liveUrl: typeof row.liveUrl === 'string' ? row.liveUrl : null,
    adminUrl: typeof row.adminUrl === 'string' ? row.adminUrl : null,
    // The three things the job-poll door does AFTER the fleet says done, and that a handoff into
    // the new site's own workspace stands on: the site folder registered with dsh (`lane: '/'`),
    // or the reason it is not; and whether the Joomla Claude Cowork plugin verified its token (`custody`).
    // Provisioned is not the same as ready.
    attached: row.lane === '/',
    laneError: typeof row.laneError === 'string' ? row.laneError : null,
    custody: typeof row.custody === 'string' ? row.custody : null
  }
}

/**
 * A refusal the customer can act on: the door's own sentence when it has one, else its code, else
 * the status. Shared by the claim and the create call so one door's refusal never reads worse
 * than the other's.
 * @param {number} status
 * @param {any} body
 * @param {string} what
 */
function refusalMessage(status, body, what) {
  if (typeof body?.message === 'string') return body.message
  if (typeof body?.code === 'string') return body.code
  return `${what} (${String(status)}).`
}

/**
 * Claim a site by its name, before anything is built (`POST /api/sites/claim`).
 *
 * The business name is the first question and it IS the site's address, so the site can exist the
 * moment it is typed: its row, its owner seat, its folder on the host. What comes back is the
 * address of that site's OWN workspace, which is where the rest of the form, the build and the
 * agent belong — a seat is a site's page, and a session opened in `/site/<label>` from the
 * creation workspace is refused by the very fence that keeps two customers apart
 * (tasks/todo-claim-then-workspace.md, Lee 15/09).
 *
 * Idempotent on `buildId` like the create door: asked again it hands back the same site; asked
 * with a different request under the same id it refuses.
 *
 * @param {{ label?: string, platform: string, buildId: string, design?: string, designRevision?: string, quickstart?: string }} want — no label: the door makes a draft address
 * @param {{ fetch?: typeof fetch }} [deps]
 * @returns {Promise<{ ok: true, siteKey: string, label: string, workspacePath: string, next: string } | { ok: false, code?: string, message: string, siteKey?: string }>}
 */
export async function claimNewSite(want, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch
  let res
  try {
    res = await fetchImpl('/api/sites/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        ...(want.label ? { label: want.label } : {}),
        platform: want.platform,
        buildId: want.buildId,
        ...(want.design ? { design: want.design } : {}),
        ...(want.designRevision ? { designRevision: want.designRevision } : {}),
        ...(want.quickstart ? { quickstart: want.quickstart } : {})
      })
    })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok || typeof body?.siteKey !== 'string')
    return {
      ok: false,
      ...(typeof body?.code === 'string' ? { code: body.code } : {}),
      ...(typeof body?.siteKey === 'string' ? { siteKey: body.siteKey } : {}),
      message: refusalMessage(res.status, body, 'The site could not be claimed')
    }
  return {
    ok: true,
    siteKey: body.siteKey,
    label: String(body.label ?? ''),
    workspacePath: String(body.workspacePath ?? ''),
    next: String(body.next ?? '')
  }
}

/**
 * Create a site and wait for the fleet to finish it.
 *
 * `want.buildId` is the press's own identity, and it is what makes a retry safe: the door keeps
 * one logical build per (account, buildId), answers a second request for it with the FIRST one's
 * site and job, refuses one whose payload changed (`IDEMPOTENCY_CONFLICT`), and while a first
 * request is still mid-claim answers `CREATE_PENDING` — asked again here after a beat, with the
 * same id, until it has a job to hand back.
 *
 * @param {{ label: string, platform: string, buildId?: string, quickstart?: string, design?: string, designRevision?: string, brandFrom?: string, press?: {id: string, answers?: Record<string, unknown>, designPlan?: unknown} }} want
 * @param {{ fetch?: typeof fetch, wait?: (ms: number) => Promise<void>, onStep?: (step: string) => void, onJob?: (job: { siteKey: string, jobId: string }) => void, tries?: number }} [deps] - `onJob` hears the provision job the moment the door answers with one, before the first poll
 * @returns {Promise<{ ok: true, siteKey: string, liveUrl: string | null, adminUrl: string | null, attached: boolean, laneError: string | null, custody: string | null, workspacePath?: string, design?: object } | { ok: false, message: string, messageKey?: string, siteKey?: string, code?: string, plan?: object }>}
 */
export async function createNewSite(want, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch
  const wait = deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const tries = deps.tries ?? TRIES
  const step = deps.onStep ?? (() => undefined)

  step('creating')
  let res
  let body
  for (let pending = 0; ; pending++) {
    try {
      res = await fetchImpl('/api/sites', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          label: want.label,
          platform: want.platform,
          ...(want.buildId ? { buildId: want.buildId } : {}),
          ...(want.quickstart ? { quickstart: want.quickstart } : {}),
          // The inspiration the customer picked, and the revision of the registry the form resolved
          // it against. The fleet decides what that becomes; sending the revision is what makes a
          // registry that moved while the form was open answer with a new plan instead of quietly
          // building something the customer was never shown.
          ...(want.design ? { design: want.design } : {}),
          ...(want.designRevision ? { designRevision: want.designRevision } : {}),
          // A brand press: the site the brand was extracted in. The door checks the viewer's seat
          // on it, and the host copies its `Brand/<host>/` into the new site's folder.
          ...(want.brandFrom ? { brandFrom: want.brandFrom } : {}),
          // What the press asked for, so the build can be finished by something other than this
          // page — see the note where `BuildForm` fills it in.
          ...(want.press ? { press: want.press } : {})
        })
      })
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    body = await res.json().catch(() => ({}))
    if (!(res.status === 202 && body?.code === 'CREATE_PENDING')) break
    if (pending >= PENDING_TRIES) {
      return {
        ok: false,
        code: 'CREATE_PENDING',
        ...(typeof body?.siteKey === 'string' ? { siteKey: body.siteKey } : {}),
        message:
          'The site is still being claimed. Press again in a moment; the same request is continued, not repeated.',
        // The reader's language: `message` stays English for logs and `reportProvision`.
        messageKey: 'form.stillClaiming'
      }
    }
    await wait(1000)
  }
  if (res.status !== 200 && res.status !== 202) {
    // The Worker's own sentence when it has one: a refusal the customer can act on ("as many sites
    // as your plan allows") beats a status code every time.
    const message = refusalMessage(res.status, body, 'The site could not be created')
    // A registry that moved while the form was open comes back as the NEW plan, not as an error the
    // customer can only read. The caller shows it and lets them press again — silently building
    // from a plan nobody displayed is the one outcome this whole path exists to prevent.
    return {
      ok: false,
      message,
      ...(typeof body?.code === 'string' ? { code: body.code } : {}),
      ...(body?.plan && typeof body.plan === 'object' ? { plan: body.plan } : {})
    }
  }
  const siteKey = typeof body?.siteKey === 'string' ? body.siteKey : ''
  const jobId = typeof body?.jobId === 'string' ? body.jobId : ''
  if (siteKey === '')
    return { ok: false, message: 'The fleet answered without a site.', messageKey: 'form.noSite' }
  // 🔒 SAY THAT A SITE EXISTS NOW — the sidebar is listening, and only Add site was ever talking.
  //
  // `tracy-sidebar`'s workspace list re-reads on `tracy:sites-changed`, and its comment says "Add
  // site announces every site it starts: a new site is a new workspace, listed at once". True of
  // the wizard, which fires it twice; the Build form's own create — the road most sites are made
  // by now — never did. So a site made from the questionnaire did not appear in the sidebar until
  // the page was reloaded by hand. Measured 20/09/2026: `ban-xe-noi-that` was created at 09:55 and
  // the customer went on working in the workspace of the site before it.
  //
  // Fired HERE rather than in the form, because every caller of this function has just made a site,
  // and a listener that has to be told by each caller separately is one caller away from silence
  // again. Guarded for a non-browser caller (the tests import this module under node).
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tracy:sites-changed'))
  // No job to follow: the site is already there (an answer the door gives for a site that exists).
  if (jobId === '')
    return {
      ok: true,
      siteKey,
      liveUrl: null,
      adminUrl: null,
      attached: false,
      laneError: null,
      custody: null,
      ...(body?.design ? { design: body.design } : {}),
      ...(typeof body?.workspacePath === 'string' ? { workspacePath: body.workspacePath } : {})
    }

  // The job is known from here on, and a page that reloads mid-provision needs it to wait for the
  // handover instead of asking for a build too early (`waitForProvision`) — so say it now, before the
  // first poll, not when the poll ends.
  deps.onJob?.({ siteKey, jobId })
  const handed = await waitForProvision(siteKey, jobId, { fetch: fetchImpl, wait, onStep: step, tries })
  if (!handed.ok) return handed
  return {
    ...handed,
    // Only when the fleet actually answered one: an absent design is absent, not null, so a
    // caller that never asked for one sees exactly the shape it always saw.
    ...(body?.design ? { design: body.design } : {}),
    ...(typeof body?.workspacePath === 'string' ? { workspacePath: body.workspacePath } : {})
  }
}

/**
 * Wait for a provision job to be handed over — the job-poll door says `done` — and answer what the
 * handover left: the address, the pairing, the lane.
 *
 * 🔒 THE POLL IS THE HANDOVER, NOT A WINDOW ONTO IT. `GET /api/sites/:key/jobs/:id` is where a `done`
 * job gets its content door paired (`pairComponent`), its lane attached and its creation row settled
 * (`apps/tracy-web/src/sites/route.js`). A build asked for before that answers `done` reaches a site
 * whose component is not in the seat book yet, and the Apply door refuses it
 * `COMPONENT_NOT_REGISTERED`: measured 23/09/2026 on `wp-oyib7i`, a page reloaded mid-provision
 * resumed its press 107 s after the claim and the build died at `check`. Since the sweep no longer
 * builds Joomla/WordPress sites nobody is watching (#249), nothing ran it again.
 * @param {string} siteKey
 * @param {string} jobId
 * @param {{ fetch?: typeof fetch, wait?: (ms: number) => Promise<void>, onStep?: (step: string) => void, tries?: number }} [deps]
 * @returns {Promise<{ ok: true, siteKey: string, liveUrl: string | null, adminUrl: string | null, attached: boolean, laneError: string | null, custody: string | null } | { ok: false, message: string, siteKey: string }>}
 */
export async function waitForProvision(siteKey, jobId, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch
  const wait = deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const tries = deps.tries ?? TRIES
  const step = deps.onStep ?? (() => undefined)
  let last = /** @type {ReturnType<typeof siteFromJob>} */ (siteFromJob(null))
  let unreadable = 0
  for (let i = 0; i < tries; i++) {
    let row
    try {
      const poll = await fetchImpl(
        `/api/sites/${encodeURIComponent(siteKey)}/jobs/${encodeURIComponent(jobId)}`,
        { headers: { accept: 'application/json' } }
      )
      row = poll.ok ? await poll.json().catch(() => null) : null
    } catch {
      row = null
    }
    last = siteFromJob(row)
    // 🔒 AN UNREADABLE POLL IS NOT "STILL WORKING", AND TREATING IT AS ONE IS INVISIBLE.
    // `siteFromJob(null)` answers `state: 'unknown'` with an empty step, which falls through both
    // endings below and simply waits again — while the empty step means the to-do list is not
    // repainted either. So a door that has started refusing (a session that expired, a seat that
    // was revoked, a host that went away) looks EXACTLY like a provision in progress: a frozen
    // list, no error, for the full 30-minute budget. Measured 22/09/2026 alongside the lost-press
    // bug, on lists still reading `fetching webroot` for sites that had finished minutes earlier.
    //
    // A run of them is the signal. One is ordinary — a reload, a restart, a dropped packet — so
    // the counter resets on every reading that comes back.
    if (last.state === 'unknown') {
      unreadable += 1
      if (unreadable >= UNREADABLE_TRIES)
        return {
          ok: false,
          siteKey,
          message: `The site is building, but this page could not read its progress${last.step === '' ? '' : ` (${last.step})`}. Reload to pick it up again.`
        }
    } else unreadable = 0
    if (last.step !== '') step(last.step)
    if (last.state === 'done')
      return {
        ok: true,
        siteKey,
        liveUrl: last.liveUrl,
        adminUrl: last.adminUrl,
        attached: last.attached,
        laneError: last.laneError,
        custody: last.custody
      }
    if (last.state === 'failed')
      return {
        ok: false,
        siteKey,
        message: `The fleet could not finish the site${last.step === '' ? '' : ` (${last.step})`}.`
      }
    await wait(POLL_MS)
  }
  // Not a failure — the fleet may still land it. Say that, and name the site so nobody creates a
  // second one for the same customer.
  return {
    ok: false,
    siteKey,
    message: `The site ${siteKey} is still building. It will show up in My Sites when the fleet finishes.`
  }
}

/**
 * The press this account made for `siteKey` and never saw built, as `GET /api/sites/:key/press`
 * hands it back — or null. What a Build form resumes when the tab that pressed is gone and its
 * carry went with it (`sessionStorage` dies with the tab).
 * @param {string} siteKey
 * @param {{ fetch?: typeof fetch }} [deps]
 * @returns {Promise<{ id: string, answers: Record<string, unknown>, designPlan?: object, questionnaire?: object, jobId: string | null } | null>}
 */
export async function savedPress(siteKey, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch
  let body
  try {
    const res = await fetchImpl(`/api/sites/${encodeURIComponent(siteKey)}/press`, {
      headers: { accept: 'application/json' }
    })
    if (!res.ok) return null
    body = await res.json()
  } catch {
    return null
  }
  const press = body?.press
  if (!press || typeof press !== 'object' || typeof press.id !== 'string' || press.id === '') return null
  const answers = press.answers
  if (!answers || typeof answers !== 'object' || Array.isArray(answers) || Object.keys(answers).length === 0)
    return null
  return {
    id: press.id,
    answers,
    ...(press.designPlan && typeof press.designPlan === 'object' ? { designPlan: press.designPlan } : {}),
    ...(press.questionnaire && typeof press.questionnaire === 'object'
      ? { questionnaire: press.questionnaire }
      : {}),
    jobId: typeof body.jobId === 'string' && body.jobId !== '' ? body.jobId : null
  }
}

/** How long to wait for somebody to finish signing in, and how often to ask. */
const SIGNIN_TRIES = 150
const SIGNIN_POLL_MS = 2000

/**
 * Wait until `/auth/me` says somebody is signed in.
 *
 * There is no event to listen for: the sign-in happens in another window, on pages this one does not
 * control (Google's, GitHub's), and it ends by setting a cookie. Asking the same door the rest of
 * the page asks is the only reading that cannot be faked by a window that merely closed.
 *
 * ⚠ A DOOR THAT IS NOT THERE IS NOT A DOOR SOMEBODY HAS YET TO WALK THROUGH. `/auth/me` is served
 * by the Worker at the host's root, and on a lane with nothing in front of it that address answers
 * 404. Read as "not signed in yet", the 404 bought five minutes of a spinning button against a
 * sign-in window that had opened on a page which does not exist — 150 tries, two seconds apart,
 * and not one line saying why (measured 09/09; `CLAUDE.md` §5 records the same shape from 08/09).
 *
 * So 404 and 501 end the wait immediately: they answer the question, and the answer is that this
 * surface has no sign-in to finish. 401 and 403 are the opposite — the door is there and the
 * person is not through it — and an unreachable door keeps its wait too, since a lane that is
 * still starting looks exactly like that for a second.
 *
 * @param {{ fetch?: typeof fetch, wait?: (ms: number) => Promise<void>, tries?: number }} [deps]
 * @returns {Promise<boolean>} false when the budget ran out, or when there is no door to wait on.
 */
export async function waitForSignIn(deps = {}) {
  const fetchImpl = deps.fetch ?? fetch
  const wait = deps.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const tries = deps.tries ?? SIGNIN_TRIES
  for (let i = 0; i < tries; i++) {
    // One read per turn answers both questions. Asking twice would double the traffic and, on a
    // door that comes up between the two calls, disagree with itself.
    const said = await askWhoAmI(fetchImpl)
    if (said === 'in') return true
    if (said === 'no-door') return false
    await wait(SIGNIN_POLL_MS)
  }
  return false
}

/** Statuses that say the sign-in door itself is absent, rather than un-walked. */
const NO_DOOR = new Set([404, 501])

/**
 * What `/auth/me` says right now: somebody is in, nobody is yet, or there is no such door.
 * A network error reads as `out` — a lane still coming up looks exactly like that for a second.
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<'in' | 'out' | 'no-door'>}
 */
async function askWhoAmI(fetchImpl) {
  try {
    const res = await fetchImpl('/auth/me', { headers: { accept: 'application/json' } })
    if (NO_DOOR.has(res.status)) return 'no-door'
    if (!res.ok) return 'out'
    const body = await res.json()
    return typeof body?.email === 'string' && body.email !== '' ? 'in' : 'out'
  } catch {
    return 'out'
  }
}
