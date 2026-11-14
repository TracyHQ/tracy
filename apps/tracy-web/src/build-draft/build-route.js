/**
 * The build doors of the build chat (#610): approving the plan creates the site and starts the build; the build's
 * progress and outcome are read back in Contract B. Called by the dsh tool `tracy_build` as the person who typed
 * (`x-tracy-actor` in their build session), or by a signed-in browser (the task list card reads `GET`).
 *
 * `POST /api/build-draft/build {plan: {id, revision}}` approves that plan revision (`build-store.js approveBuild`:
 * the snapshot is taken in the same write) and asks the existing create door for the site (`startSite`, injected by
 * `app.js`: `build-draft-build-wiring.js`). The create door is idempotent on the build's id, so pressing twice, a lost
 * answer or a retry never makes a second site: a build that already has its site is answered as it is.
 *
 * `GET /api/build-draft/build` answers `{build, run}`: the build in small (`plan`, `state`, `siteKey?`) and its Contract
 * B run (`build-progress.js`). The first read that finds the run ended marks the build ended, and the pictures of a
 * research the build no longer needs go (`prunePictures`).
 *
 * 🔒 A FAULT IS A STATEMENT. A refusal the owner can do nothing about (the create door refused, the server builds no
 * site from this template) is kept on the build for the team and reaches the chat as a stopped outcome, never as a
 * question.
 */
import { Hono } from 'hono'
import { json } from '../lib/http.js'
import { principalOf } from '../lib/wo-principal.js'
import { buildRunOf } from './build-progress.js'
import { approveBuild, buildOpen, endBuild, planRefOf, readBuild, saveBuildSite } from './build-store.js'
import { callerOf } from './caller.js'
import { readEngineRow } from './engine-store.js'

const BASE = '/api/build-draft/build'

const REFUSALS = {
  NOT_SIGNED_IN: [401, 'Call as the person who typed (x-tracy-actor) or with a session.'],
  NOT_BUILD_SESSION: [403, 'x-tracy-session must be the caller’s own build session.'],
  BUILD_CHAT_OFF: [403, 'The build chat is switched off on this server.'],
  INVALID_REQUEST: [400, 'Send {plan: {id, revision}}, the plan the owner approved.'],
  NO_DRAFT: [409, 'Research the business first: POST /api/build-draft/research.'],
  NO_PLAN: [409, 'The draft has no plan yet: POST /api/build-draft/compose.'],
  STALE_PLAN: [409, 'The plan changed since it was shown: show the current plan and ask for approval again.'],
  ENGINE_BUSY: [409, 'A step is still working on the plan: wait for GET /api/build-draft/engine to end it.'],
  BUILT_FROM_OTHER_PLAN: [
    409,
    'This draft is built from another plan revision: GET /api/build-draft/build reads it.'
  ]
}
const refuse = (c, code) => {
  const [status, next] = REFUSALS[code]
  return json(c, { code, next }, status)
}

/** The build in small, as the chat reads it. */
export function buildSummaryOf(build, run) {
  if (!build) return null
  const outcome = run?.outcome?.result ?? null
  const state = outcome ?? (build.site ? 'building' : build.refusal ? 'stopped' : 'creating')
  return {
    id: build.id,
    plan: build.plan,
    state,
    ...(build.site?.siteKey ? { siteKey: build.site.siteKey } : {}),
    ...(build.site?.workspacePath ? { workspacePath: build.site.workspacePath } : {})
  }
}

/**
 * @param {object} deps
 * @param {{sessionSecret: string, actorSecret?: string}} deps.config
 * @param {import('pg').Pool} deps.pool
 * @param {(email: string) => Promise<string>} deps.buildSessionIdOf
 * @param {() => Promise<boolean>} deps.buildChatOn
 * @param {(input: {accountId: string, email: string, draftId: string, build: object}) =>
 *   Promise<{site: object} | {pending: true} | {refusal: {code: string, status: number}}>} deps.startSite asks the
 *   create door for the build's site (idempotent on `build.id`)
 * @param {(siteKey: string) => Promise<{brief: object | null, job: object | null}>} deps.readRun the site's brief row
 *   and provision job
 * @param {(accountId: string, keepRun: string) => Promise<unknown>} [deps.prunePictures]
 * @param {() => number} [deps.now]
 * @param {{error: Function}} [deps.log]
 */
export function buildRunRoutes({
  config,
  pool,
  buildSessionIdOf,
  buildChatOn,
  startSite,
  readRun,
  prunePictures,
  now = Date.now,
  log = console
}) {
  const app = new Hono()
  const door = (run) => async (c) => {
    const caller = await callerOf(c, { config, buildSessionIdOf })
    if (caller.refusal) return refuse(c, caller.refusal)
    if (!(await buildChatOn())) return refuse(c, 'BUILD_CHAT_OFF')
    const accountId = await principalOf(pool, caller.email)
    c.header('cache-control', 'no-store')
    return run(c, accountId, caller.email)
  }

  /** The build and its run as they stand; an ended run marks the build ended once. */
  async function answerOf(accountId) {
    let build = await readBuild(pool, accountId)
    if (!build) return { build: null, run: null }
    const read = build.site?.siteKey ? await readRun(build.site.siteKey) : { brief: null, job: null }
    let made = buildRunOf({ build, ...read, now: now() })
    if (made.problems.length)
      log.error?.('[build-draft] the build run is not valid Contract B:', JSON.stringify(made.problems))
    if (made.final && buildOpen(build)) {
      await endBuild(pool, accountId, build.id, made.run?.outcome?.result ?? 'stopped', now)
      build = await readBuild(pool, accountId)
      made = buildRunOf({ build, ...read, now: now() })
      // The research the draft holds now is kept; the approved one's pictures go once nothing needs them.
      const row = await readEngineRow(pool, accountId)
      const keep = row?.research?.pictureRun
      if (keep && prunePictures) await prunePictures(accountId, keep).catch(() => null)
    }
    return { build: buildSummaryOf(build, made.run), run: made.run }
  }

  app.post(
    BASE,
    door(async (c, accountId, email) => {
      const body = await c.req.json().catch(() => null)
      const plan = planRefOf(body?.plan)
      if (!plan) return refuse(c, 'INVALID_REQUEST')
      if (!accountId) return refuse(c, 'NO_DRAFT')
      const approved = await approveBuild(pool, accountId, { plan, now })
      if (approved.error) return refuse(c, approved.error)
      const { build } = approved
      // A build with its site is answered as it is; any other is asked of the create door again, by the same id.
      if (!build.site) {
        const draftId = (await readEngineRow(pool, accountId)).id
        const started = await startSite({ accountId, email, draftId, build }).catch((error) => {
          log.error?.('[build-draft] the site could not be asked for:', error)
          return { refusal: { code: 'SITE_CREATE_FAILED', status: 502 } }
        })
        if (started.site || started.refusal)
          await saveBuildSite(pool, accountId, build.id, {
            site: started.site ?? null,
            refusal: started.refusal ?? null
          })
      }
      return json(c, await answerOf(accountId), approved.created ? 201 : 200)
    })
  )

  app.get(
    BASE,
    door(async (c, accountId) => json(c, accountId ? await answerOf(accountId) : { build: null, run: null }))
  )

  return app
}
