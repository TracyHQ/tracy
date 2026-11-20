// Wiring: the site an approved build of the build chat asks for (#610, `build-draft/build-route.js`), through the
// EXISTING create door `POST /api/sites`, as the person who approved. It sits beside app.js because it composes the
// sites door, the Website Opportunities label rules and the step chain switch, and a domain directory imports only
// `lib/` and `db/`.
//
// THE CREATE DOOR DOES THE WORK. The body names the step chain workflow, the draft and the approved plan
// (`{workflow, draftId, plan}`) instead of a research revision: the create door checks the draft is the caller's and
// holds that approved build, claims the site, asks the host for it and starts the chain run with
// `brief: {workflow, draftId, plan}` and the account, which reads the build's snapshot (`step-chain-draft-source.js`).
// `buildId` is the build's own id, so the door answers a second ask with the site it made.
//
// WHAT SITE IS INSTALLED. The AI quickstart kit names it (`kit.site`: `{platform, quickstart, release?}`, read from its
// `kit-manifest.json`): the AI quickstart's own release (`ai-quickstart/<slug>/<cms>`, ADR 0045), whose installer is the
// blank site and whose contract is the blank site contract. Never the human quickstart's release, which installs the
// demo. The published release when this server has read it, else a dev stand's local pack of it
// (`local/ai-quickstart/...`, `TRACY_LOCAL_RELEASES_DIR`). Each way it cannot be built stops the build, a fault for the
// team and never a stand in site: `SITE_SOURCE_MISSING` (the kit names no site), `SITE_SOURCE_NOT_AI_QUICKSTART` (it
// names another release, the demo's included) and `AI_QUICKSTART_RELEASE_MISSING` (no release of that name is here).
import { nextSiteLabel, siteLabelFor } from 'website-opportunities/domain'
import { freeLabelFor } from './opportunities-build/builds.js'
import { saveBuildLabel } from './build-draft/build-store.js'
import { shownBuildNameOf } from './lib/draft-build.js'
import { CURRENT_BRIEF } from './lib/site-brief-row.js'
import { mintSession } from './lib/session.js'
import { promptSiteSession, siteSessionAhead } from './lib/site-session-ahead.js'
import { siteRowOf } from './opportunities-build/build-store.js'
import { accountByEmail, grantFor } from './seats/store.js'
import { STEP_CHAIN_WORKFLOW } from './lib/step-chain-switch.js'
import { isAiQuickstartRelease } from './lib/ai-quickstart-pins.js'
import { isLocalTag, LOCAL_TAG_NAMESPACE } from './lib/local-releases.js'
import { readReleases } from './lib/quickstart-releases.js'

// The name the label is made from: what the site may show, else a neutral name (never a name the owner keeps off).
const NEUTRAL_NAME = 'my-site'

/**
 * The release a build installs for a kit's site, or the refusal that says why there is none: the AI quickstart's own
 * release as published when this server read it, else the dev stand's local pack of it. Never the demo's release.
 * @param {{platform: string, quickstart: string} | null} source the kit's `site`
 * @param {Array<{tag: string, platform?: string | null}>} readable the choosable releases this server read
 * @returns {{quickstart: string, published: boolean} | {refusal: {code: string, status: number}}}
 */
export function aiQuickstartToInstall(source, readable) {
  if (!source) return { refusal: { code: 'SITE_SOURCE_MISSING', status: 409 } }
  if (!isAiQuickstartRelease(source.quickstart) || isLocalTag(source.quickstart))
    return { refusal: { code: 'SITE_SOURCE_NOT_AI_QUICKSTART', status: 409 } }
  const here = (tag) => readable.some((r) => r.tag === tag && r.platform === source.platform)
  if (here(source.quickstart)) return { quickstart: source.quickstart, published: true }
  const local = LOCAL_TAG_NAMESPACE + source.quickstart
  if (here(local)) return { quickstart: local, published: false }
  return { refusal: { code: 'AI_QUICKSTART_RELEASE_MISSING', status: 409 } }
}

/**
 * The route's `startSite`: asks the create door for the build's site.
 * @param {{pool: import('pg').Pool, config: {origin: string, sessionSecret: string}, kits: {loadKit: Function},
 *   request: (path: string, init: RequestInit) => Promise<Response>, now?: () => number,
 *   releases?: () => Promise<Array<{tag: string, platform?: string | null}>>}} deps `releases`: the choosable releases
 *   (`readReleases`), injected by a test
 */
export function draftSiteStarter({
  pool,
  config,
  kits,
  request,
  now = Date.now,
  releases = () => readReleases(pool, { choosable: true })
}) {
  return async ({ accountId, email, draftId, build }) => {
    const plan = build.snapshot?.plan
    const kit = kits.loadKit(plan?.look?.template?.slug)
    const source = kit?.site ?? null
    const install = aiQuickstartToInstall(source, source ? await releases() : [])
    if ('refusal' in install) return install
    const label =
      build.label ??
      (await saveBuildLabel(
        pool,
        accountId,
        build.id,
        await freeLabelFor({
          pool,
          config,
          domain: { siteLabelFor, nextSiteLabel },
          name: shownBuildNameOf(build.snapshot) ?? NEUTRAL_NAME
        })
      ))
    // A fresh identity for this server-owned ask, as the demo runner mints one: never a saved browser cookie.
    const cookie = `tracy_sess=${await mintSession(email, config.sessionSecret, now())}`
    const res = await request('/api/sites', {
      method: 'POST',
      headers: { cookie, origin: config.origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        platform: source.platform,
        quickstart: install.quickstart,
        // The release the kit was checked against, held only to the published release: a local pack is a candidate.
        ...(source.release && install.published ? { expectedQuickstartRelease: source.release } : {}),
        label,
        buildId: build.id,
        workflow: STEP_CHAIN_WORKFLOW,
        draftId,
        plan: build.plan
      })
    })
    const body = await res.json().catch(() => null)
    if (res.ok && typeof body?.siteKey === 'string' && typeof body?.jobId === 'string')
      return {
        site: {
          siteKey: body.siteKey,
          label,
          jobId: body.jobId,
          ...(typeof body.workspacePath === 'string' ? { workspacePath: body.workspacePath } : {})
        }
      }
    // Another ask of the same build is still talking to the host: the next ask reads its site.
    if (res.status === 202) return { pending: true }
    return { refusal: { code: String(body?.code ?? 'SITE_CREATE_REFUSED').slice(0, 80), status: res.status } }
  }
}

/**
 * The route's `readRun`: the site's own brief row (its chain measurement) and its provision job.
 * @param {{pool: import('pg').Pool}} deps
 */
export function draftRunReader({ pool }) {
  return async (siteKey) => {
    const { rows } = await pool.query(
      `select b.state, b.created_at, b.timings, b.brief ->> 'buildRun' as run
         from site_brief b left join site s on s.site_key = b.site_key
        where b.site_key = $1 and ${CURRENT_BRIEF} order by b.created_at desc limit 1`,
      [siteKey]
    )
    const jobs = await pool.query(
      `select state from job where site_key = $1 and kind = 'provision' order by created_at desc limit 1`,
      [siteKey]
    )
    const b = rows[0]
    return {
      // `run`: the rebuild this row is the run of (#612, `brief.buildRun`), none for a first build.
      brief: b
        ? {
            state: b.state,
            createdAt: b.created_at?.toISOString?.() ?? null,
            timings: b.timings,
            ...(b.run ? { run: b.run } : {})
          }
        : null,
      job: jobs.rows[0] ? { state: jobs.rows[0].state } : null
    }
  }
}

/**
 * The route's `openSiteChat` and `promptSiteChat` (#611): the done build's chat moves to its site through the EXISTING
 * way of opening a chat on a site ahead of time, the one the Website Opportunities hand off uses
 * (`lib/site-session-ahead.js`): a session made in the site's own workspace on a seat minted for the owner, then the
 * first message queued in it as that owner. Only the site's owner: anyone else gets no chat.
 * @param {{pool: import('pg').Pool, config: object, seatDoor?: object, fetchImpl?: typeof fetch}} deps
 */
export function draftSiteChat({ pool, config, seatDoor = {}, fetchImpl = fetch }) {
  const ownedSite = async (siteKey, email) => {
    const account = await accountByEmail(pool, email)
    const grant = account ? await grantFor(pool, account.id, siteKey) : null
    return grant?.role === 'owner' ? siteRowOf(pool, siteKey) : null
  }
  return {
    openSiteChat: async ({ siteKey, email }) => {
      const site = await ownedSite(siteKey, email)
      return site ? siteSessionAhead({ config, seatDoor, fetchImpl, site, email }) : null
    },
    promptSiteChat: async ({ siteKey, email, sessionId, requestId, text }) => {
      const site = await ownedSite(siteKey, email)
      return site
        ? promptSiteSession({ config, seatDoor, fetchImpl, site, email, sessionId, requestId, text })
        : false
    }
  }
}
