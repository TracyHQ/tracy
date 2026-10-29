/**
 * `/ops` — Tracy's own operations surface (ADR 0008), ported from `workers/harness`. Everything
 * reachable here changes what EVERY customer's agents carry; the door is Tracy's own sign-in plus
 * the seat book (`./admit.js`), same as the Worker's — one door for the whole system (ADR 0003),
 * one list of who is staff (the `tracy_admin` workspace).
 *
 * WHAT IS DIFFERENT FROM THE WORKER, AND WHY:
 *   - No staff-cookie cache (`workers/harness/src/staff-cookie.js`). That cookie existed to save a
 *     rate-limited CROSS-WORKER `whoami` call (measured: dozens of calls per page-load ran the
 *     seat book's hourly budget out). `admit()` here is one query against a pool this same
 *     process already holds — there is no remote budget to protect, so there is nothing the
 *     cache would be trading away rate-limit risk for.
 *   - No `unverified` status. The Worker's admit could say "the seat book is rate-limited or
 *     briefly down" because it was a second service reachable over the network. A local query
 *     either answers or throws; there is no third state to carry.
 *   - `/api/ops/team*` RELAYS onto the already-built `/tracy-admin/members*` cluster
 *     (`workspaces/route.js`, mounted by `deps.workspaces.app`) rather than re-implementing the
 *     roster/removal-code logic a second time — the same "relay, not a second source of truth"
 *     discipline `workers/harness/src/team.js`'s own docstring names, just in-process instead of
 *     over a service binding. Session cookies forward unchanged, so that door's own `requireViewer`
 *     re-checks the same person `admit()` already checked — belt and suspenders, not a second
 *     opinion that could disagree.
 *
 * MODULE-GRAPH BOUNDARY (test/module-graph.test.mjs): this domain imports only `lib/`, `db/`, and
 * itself (`./admit.js`). Everything from `workspaces/store.js` this file needs — the tracy_admin
 * workspace row, accepting a pending grant, and the mounted `/tracy-admin/*` sub-app for the relay
 * above — arrives through `deps.workspaces`, wired by the composition root (`app.js`), same
 * pattern every other cross-domain need in this app already follows.
 */

import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { escapeHtml } from '../lib/html.js'
import { viewer } from '../lib/http.js'
import { requestLanguage, translator } from '../lib/i18n/index.js'
import { pageShell } from '../lib/page-shell.js'
import { renderedPage } from '../lib/security-headers.js'
import { admit, denied } from './admit.js'
import { appStatisticRoutes } from './app-statistic.js'
import { attentionRoutes } from './attention.js'
import { betaRoutes } from './beta.js'
import { buildBaseRoutes } from './build-base.js'
import { buildQuestionsRoutes } from './build-questions.js'
import { ciRoutes } from './ci.js'
import { cmsRoutes } from './cms.js'
import { demoRoutes } from './demos.js'
import { desktopRoutes } from './desktop.js'
import { generalRoutes } from './general.js'
import { hostAgents } from './hosts.js'
import { inventoryRoutes } from './inventory.js'
import { llmRoutes } from './llm.js'
import { quickstartSettingRoutes } from './quickstart-setting.js'
import { quickstartRoutes } from './quickstarts.js'
import { releaseChecklistRoutes } from './release-checklist.js'
import { speechOpsRoutes } from './speech.js'
import { uiRoutes } from './ui.js'
import { usageRoutes } from './usage.js'
import { viewAsRoutes } from './view-as.js'
import { widgetRoutes } from './widget.js'
import { woOpsRoutes } from './wo.js'
import { woPlacesOpsRoutes } from './wo-places.js'
import { woBriefLabelsRoutes } from './wo-brief-labels.js'

/**
 * `/opt/tracy-web/static/ops` in the image (`apps/tracy-web/Dockerfile` COPYs
 * `packages/web/tracy-harness/dist` there) — resolved relative to THIS file rather than the
 * process's cwd, the same trick `db/index.js` uses for its migrations directory, so it lands in
 * the right place whether this process is started from the repo root (`node
 * apps/tracy-web/src/server.js`) or from `/opt/tracy-web` (the image's own `WORKDIR`): this file
 * sits at `<root>/src/ops/route.js` either way, and the built SPA sits two levels up from `src/`.
 */
const DEFAULT_STATIC_DIR = fileURLToPath(new URL('../../static/ops/', import.meta.url))

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2'
}

/** `/ops`, `/ops/widget`, `/ops/cms/catalog` — every page address means the SPA's own `index.html`:
 * the shell reads the address in the browser (`App.tsx`), so a deep link reloaded directly must be
 * the page it names, not a 404. Only real files under `assets/` are served as themselves. */
function relPathFor(pathname) {
  const stripped = pathname.replace(/^\/ops\/?/, '')
  if (stripped === '') return 'index.html'
  // Guard against `..` escaping `staticDir` — normalize, then strip any leading `../` segments
  // that survive (a request path can never legitimately need to climb out of this directory).
  const safe = normalize(decodeURIComponent(stripped)).replace(/^(\.\.[/\\])+/, '')
  return safe === '.' || safe === '' ? 'index.html' : safe
}

async function readStatic(staticDir, relPath) {
  try {
    const body = await readFile(join(staticDir, relPath))
    return { body, contentType: MIME_TYPES[extname(relPath)] ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

/** Forward the request onto the already-mounted `/tracy-admin/*` cluster, unchanged — method,
 * headers (the session cookie included, so its own door re-checks the same viewer), and body. */
async function relay(c, workspacesApp, path) {
  const search = new URL(c.req.url).search
  const method = c.req.method
  const init = { method, headers: c.req.raw.headers }
  if (method !== 'GET' && method !== 'HEAD') init.body = await c.req.raw.clone().text()
  return workspacesApp.request(`${path}${search}`, init)
}

/**
 * @param {object} deps
 * @param {import('pg').Pool | null} deps.pool
 * @param {object} deps.config
 * @param {{ app: import('hono').Hono, tracyAdminWorkspace: Function, acceptWorkspaceGrant: Function,
 *   accountByEmail: Function }} deps.workspaces - the workspaces domain's router (for the
 *   `/api/ops/team*` relay) plus the three store functions the invite door calls directly.
 * @param {string} [deps.staticDir] - override for tests; production uses `DEFAULT_STATIC_DIR`.
 */
export function opsRoutes(deps) {
  const { pool, config, workspaces, host, fetchImpl, inventory = null, staticDir = DEFAULT_STATIC_DIR } = deps
  const app = new Hono()

  // Unauthenticated on purpose, same as the Worker's own `/healthz`: an uptime probe is not a
  // reason to publish who is allowed in. Registered ahead of the door below on purpose too.
  app.get('/ops/healthz', (c) =>
    c.body('ok\n', 200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  )

  // The invitation link, answered BEFORE the door — ported from `workers/harness/src/invite.js`.
  // An invitee is denied by `admit()` precisely because they have not accepted yet, so a page
  // behind the door cannot help them; a path in front of it can.
  //
  // `:token` IS NOT VERIFIED. In the Worker it was an HMAC over `{ email, role, workspaceId }`,
  // checked against the signed-in person. This app's own `mail/emails.js` already ruled on the
  // equivalent case for a Tracy-staff invite: "acceptance here always goes through the generic
  // `/me/workspaces/:id/accept` door while signed in — the token was convenience, not the
  // security boundary". The security property is unchanged: `acceptWorkspaceGrant` only turns a
  // PENDING row for the caller's OWN account into an accepted one — there is nothing for a forged
  // or guessed token value to unlock that a normal sign-in did not already gate.
  //
  // WHO PRODUCES THE LINK (#794): the staff invitation mail, through `staffInviteUrl` in
  // `lib/team-invite.js`. It puts the `tracy_admin` workspace's id in the `:token` place, as a
  // marker only. Until then the mail carried no link and nothing pointed here.
  app.get('/ops/invite/:token', async (c) => {
    const email = await viewer(c, config)
    if (!email) {
      const next = encodeURIComponent(new URL(c.req.url).pathname)
      return c.redirect(`/login?next=${next}`, 302)
    }
    const path = new URL(c.req.url).pathname
    // No database is not a closed invitation (#796): nothing was looked up, so nothing is claimed
    // about the invitation, and the same link is worth pressing again.
    if (!pool) return inviteUnavailablePage(c, path)
    let accepted
    try {
      const workspace = await workspaces.tracyAdminWorkspace(pool)
      const account = workspace ? await workspaces.accountByEmail(pool, email) : null
      accepted =
        workspace && account ? await workspaces.acceptWorkspaceGrant(pool, workspace.id, account.id) : null
    } catch (error) {
      console.error('[ops] the invitation could not be checked:', error?.message ?? error)
      return inviteUnavailablePage(c, path)
    }
    if (accepted) return c.redirect('/ops', 302)
    return notOpenPage(c, email, path)
  })

  // `/api/ops/team*` — relayed onto `/tracy-admin/members*`. Gated the SAME way as every page
  // below: a fetch from a signed-out browser gets the same 302 a page navigation would (the
  // Worker applied one door to its whole origin, API included — `workers/harness/src/index.js`
  // never special-cased `/api/team`), not a bespoke 401 this surface never had before.
  app.on(['GET', 'POST'], '/api/ops/team', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    return relay(c, workspaces.app, '/tracy-admin/members')
  })
  app.post('/api/ops/team/:id/code', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    return relay(c, workspaces.app, `/tracy-admin/members/${c.req.param('id')}/code`)
  })
  app.delete('/api/ops/team/:id', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    return relay(c, workspaces.app, `/tracy-admin/members/${c.req.param('id')}`)
  })

  /**
   * `GET /api/ops/me` — the one question the rail asks: who is reading this, and may they write?
   *
   * 🔒 IT EXISTS SO THE SHELL DOES NOT READ THE ROSTER TO LEARN ONE PERSON. `/api/ops/team` already
   * answers `viewer: {email, role}`, but it is a RELAY onto `/tracy-admin/members` — the whole staff
   * list, every acceptance state, on every screen the rail is drawn on, which is all of them. One
   * `admit()` call answers the same question without reading anybody else's row.
   *
   * `writable` is computed HERE rather than left to the shell, because it is the same predicate
   * every write door on this surface already applies to itself (`['owner','admin'].includes(role)`,
   * see `widget.js`/`demos.js`'s `guard`). A screen that decides on its own which roles may write
   * is a screen that can disagree with the door — and the visible failure is the worse direction:
   * an enabled button whose press comes back 403 with no explanation.
   */
  app.get('/api/ops/me', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    c.header('cache-control', 'no-store')
    return c.json({
      email: who.email,
      role: who.role,
      writable: ['owner', 'admin'].includes(who.role)
    })
  })

  app.get('/api/host-agents', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    c.header('cache-control', 'no-store')
    return c.json(await hostAgents({ config, host, fetchImpl }))
  })

  /**
   * `/api/ops/cms/*` — the read-only configuration surface, mounted BEFORE the page wildcard for
   * the same reason every other API above sits there: `/ops/*` would otherwise swallow it.
   *
   * Its own module, its own door call, no shared state with the screens above — so the promise
   * that `/ops` behaves exactly as it did is checkable by reading this file: nothing above this
   * line changed when it arrived.
   */
  app.route('/', ciRoutes({ pool, config, fetchImpl }))
  app.route('/', buildBaseRoutes({ pool, config }))
  app.route('/', buildQuestionsRoutes({ pool, config, fetchImpl }))
  app.route('/', cmsRoutes({ pool, config, host, fetchImpl, snapshotDir: deps.snapshotDir }))
  app.route(
    '/',
    quickstartRoutes({
      pool,
      config,
      host,
      fetchImpl,
      doorHealth: deps.doorHealth ?? null,
      ...(deps.rolesOf ? { rolesOf: deps.rolesOf } : {}),
      ...(deps.fitOf ? { fitOf: deps.fitOf } : {})
    })
  )
  // Admin attention (04/10/2026): read-only.
  app.route('/', attentionRoutes({ pool, config }))
  // The Beta group (spec 4.7 §5.3, §5.4): first sign-ins by source, and customers stuck on a system
  // error, both read from `ops_signal`. `now` only so a test can pin the Vietnam day.
  app.route('/', betaRoutes({ pool, config, ...(deps.now ? { now: deps.now } : {}) }))
  app.route('/', appStatisticRoutes({ pool, config, ...(deps.now ? { now: deps.now } : {}) }))
  // Beta › Usage (plan `tasks/todo-do-dung-that.md`): what customers' chat requests and the Add site form did.
  app.route('/', usageRoutes({ pool, config, ...(deps.now ? { now: deps.now } : {}) }))
  app.route('/', quickstartSettingRoutes({ pool, config, fetchImpl }))
  app.route('/', demoRoutes({ pool, config, host, fetchImpl }))
  // Absent unless the composition root wires the stock modules in — a deployment with no warm
  // inventory simply has no screen for it, rather than a screen that answers 500.
  if (inventory) app.route('/', inventoryRoutes({ pool, config, inventory, host, fetchImpl }))
  app.route('/', widgetRoutes({ pool, config }))
  app.route('/', uiRoutes({ pool, config }))
  app.route('/', viewAsRoutes({ pool, config, ...(deps.now ? { now: deps.now } : {}) }))
  // /ops › Agents › Voice: the voice switch, the speech key, limits and today's use (`speech.js`).
  app.route('/', speechOpsRoutes({ pool, config, ...(deps.now ? { now: deps.now } : {}) }))
  // /ops/wo: Website Opportunities Live Queue across all accounts + provider keys & settings (`wo.js`).
  app.route('/', woOpsRoutes({ pool, config, fetchImpl, prefetch: deps.prefetch ?? null }))
  // /ops/wo › Places: the shared place store across accounts (`wo-places.js`).
  app.route('/', woPlacesOpsRoutes({ pool, config, ...(deps.now ? { now: deps.now } : {}) }))
  // /ops/wo › Briefs: the photos, labels, links and readiness of a brief revision (`wo-brief-labels.js`).
  app.route('/', woBriefLabelsRoutes({ pool, config, objects: deps.objects ?? null }))
  app.route('/', desktopRoutes({ pool, config }))
  app.route(
    '/',
    llmRoutes({ pool, config, fetchImpl, deps: { pushKeys: deps.pushKeys, visionTests: deps.visionTests } })
  )
  app.route(
    '/',
    generalRoutes({
      pool,
      config,
      reservedLabels: deps.reservedLabels ?? new Set(),
      ...(deps.env ? { env: deps.env } : {})
    })
  )
  app.route('/', releaseChecklistRoutes({ pool, config, ...(deps.env ? { env: deps.env } : {}) }))

  // The page shell and its static assets — registered last, and a wildcard, so it never shadows
  // the more specific routes above.
  const servePage = async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    const pathname = new URL(c.req.url).pathname
    const file =
      (await readStatic(staticDir, relPathFor(pathname))) ?? (await readStatic(staticDir, 'index.html'))
    // `index.html` failing too means there is no built bundle to fall back to at all — the only
    // way that happens in a checkout where `admit()` already let a real staff member through.
    // A bare 404 here would read as "you are not allowed", the opposite of the truth (this
    // person IS staff), and CLAUDE.md RULE #3 makes clear which is worse than saying so plainly.
    // Measured (chrome-acceptance.md, task brief): `apps/tracy-web/static/ops/` does not exist
    // in a local checkout — the SPA is built by a separate step and only copied in by
    // `apps/tracy-web/Dockerfile`'s own `COPY packages/web/tracy-harness/dist …` — so this is
    // routine outside the image, not a bug to chase.
    if (!file) return renderedPage(c, opsBundleMissingPage(), 503)
    return c.body(file.body, 200, { 'content-type': file.contentType, 'cache-control': 'no-store' })
  }
  app.get('/ops', servePage)
  app.get('/ops/*', servePage)

  return app
}

/** Shown to a real staff member when there is nothing built to serve them — never a bare 404,
 * which would read as a permissions problem rather than a missing build artifact. */
function opsBundleMissingPage() {
  return pageShell(
    'Ops bundle not built',
    `<h1>Ops bundle not built</h1>
<p class="card-description">This checkout has no <code>static/ops</code> to serve. The harness
SPA (<code>packages/web/tracy-harness</code>) is built by a separate step and only copied in by
<code>apps/tracy-web/Dockerfile</code>'s own <code>COPY … dist</code> — a local checkout never
runs that step. Nothing is broken; there is simply no bundle here yet.</p>`
  )
}

/**
 * The invitation link opened by somebody it is not (or no longer) open for. A page in the shared
 * shell, in the reader's language, answered 410 (#796: it was unstyled, English only, and 200).
 *
 * The door cannot tell "withdrawn or used" from "sent to another address": both are simply no
 * pending row for THIS account. So the page claims neither, names the signed-in address — the
 * usual cause is the wrong account — and its action signs out and comes back to the same link
 * (`/auth/signout` runs `next` through `safePath`), the form `noSitesPage` already uses.
 */
function notOpenPage(c, email, path) {
  const t = translator(requestLanguage(c))
  const signIn = `/login?next=${encodeURIComponent(path)}`
  return renderedPage(
    c,
    pageShell(
      t('ops.inviteNotOpenTitle'),
      `<h1>${t.html('ops.inviteNotOpenHeading')}</h1>
<p class="card-description">${t.html('bar.signedInAs', { email: `<strong>${escapeHtml(email)}</strong>` })}</p>
<p class="note">${t.html('ops.inviteNotOpenBody')}</p>
<form method="post" action="/auth/signout">
  <input type="hidden" name="next" value="${escapeHtml(signIn)}">
  <button type="submit">${t.html('bar.signInAsSomeoneElse')}</button>
</form>
<p class="note"><a class="back" href="/">${t.html('bar.goToTracy')} &rarr;</a></p>`,
      '',
      { lang: t.htmlLang }
    ),
    410
  )
}

/**
 * The invitation could not be looked up at all (no database, or it did not answer). Not 410: the
 * invitation may be perfectly open, so the page says only that it could not be checked and offers
 * the same link again.
 */
function inviteUnavailablePage(c, path) {
  const t = translator(requestLanguage(c))
  c.header('retry-after', '5')
  return renderedPage(
    c,
    pageShell(
      t('ops.inviteUnavailableTitle'),
      `<h1>${t.html('ops.inviteUnavailableHeading')}</h1>
<p class="card-description">${t.html('ops.inviteUnavailableBody')}</p>
<p class="note"><a class="back" href="${escapeHtml(path)}">${t.html('bar.tryAgain')} &rarr;</a></p>`,
      '',
      { lang: t.htmlLang }
    ),
    503
  )
}
