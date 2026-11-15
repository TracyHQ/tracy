/**
 * The rebuild doors of a built site (#612), beside the build doors (`build-route.js`), called by the owner's site chat
 * (the plan card carried there, `@tracy/dsh-build-chat`) with their session, or by the build tool as the person who
 * typed:
 *
 *   POST /api/build-draft/build/revise {plan: {id, revision}}  update the site from this living plan revision: a
 *        revision run from the build the site holds (`brief.rebuildFrom`), which rewrites only what the change touched
 *   POST /api/build-draft/build/restore                       put the site back to the build before the last update
 *        (`restoreBuild` of Part 3, through the build store)
 *   POST /api/build-draft/build/abandon                       undo an update that stopped half way (`abandonRun`),
 *        the way out of `previous_run_unfinished`
 *
 * Each answers what `GET /api/build-draft/build` answers, plus `say` and its stable code `sayCode` when there is a
 * sentence for the owner (`rebuild-say.js`). 🔒 NONE OF THEM DELETES THE SITE OR THE CHAT: a revision writes the changed parts, a restore and
 * an abandon write earlier values back, and every earlier build stays in the store.
 */
import { json } from '../lib/http.js'
import { planRefOf } from './build-store.js'
import { readEngineRow } from './engine-store.js'
import { revisionBriefOf } from './rebuild-progress.js'
import { DONE_CODE, UNAVAILABLE_CODE, rebuildCodeOf, sayFieldsOf } from './rebuild-say.js'
import { claimSite, releaseSite, reviseBuild, undoRevision } from './rebuild-store.js'
import { readBuild } from './build-store.js'

const BASE = '/api/build-draft/build'

/** The refusals of these doors, with the sentence that says what to do next. */
export const REBUILD_REFUSALS = {
  NOT_BUILT: [409, 'The site holds no finished build yet: only a built site is updated.'],
  SITE_BUSY: [409, 'The site is being restored or put back: ask again once that ended.'],
  PREVIOUS_RUN_UNFINISHED: [
    409,
    'An earlier update did not finish: POST /api/build-draft/build/abandon undoes it.'
  ],
  NOTHING_TO_RESTORE: [409, 'The site holds no update to go back from.'],
  NOTHING_UNFINISHED: [409, 'No update of this site is unfinished.']
}

/** The stop code of an error a restore or an abandon threw, as the record keeps it. */
const codeOf = (error) =>
  typeof error?.code === 'string' && error.code !== '' ? error.code.slice(0, 80) : 'restore_failed'

/**
 * @param {import('hono').Hono} app the build doors' app
 * @param {object} deps
 * @param {Function} deps.door the build doors' guard: `(run) => handler`, `run(c, accountId, email)`
 * @param {(accountId: string) => Promise<object>} deps.answerOf the build and its run as they stand
 * @param {(c: any, code: string) => Response} deps.refuse
 * @param {import('pg').Pool} deps.pool
 * @param {object} [deps.builds] the build store (`site-builds.js`); without it nothing can be updated
 * @param {(input: object) => Promise<{started: true} | {refusal: {code: string, status: number}}>} [deps.startRevision]
 * @param {(input: object) => Promise<object>} [deps.restoreSite]
 * @param {(input: object) => Promise<object>} [deps.abandonSite]
 */
export function addRebuildDoors(app, deps) {
  const { door, answerOf, refuse, pool, builds, startRevision, restoreSite, abandonSite } = deps
  const now = deps.now ?? Date.now
  const log = deps.log ?? console
  const ctxOf = (build) => ({ siteKey: build.site.siteKey })
  const answer = async (c, accountId, extra = {}, status = 200) =>
    json(c, { ...(await answerOf(accountId)), ...extra }, status)

  app.post(
    `${BASE}/revise`,
    door(async (c, accountId, email) => {
      const body = await c.req.json().catch(() => null)
      const plan = planRefOf(body?.plan)
      if (!plan) return refuse(c, 'INVALID_REQUEST')
      if (!accountId) return refuse(c, 'NO_DRAFT')
      const built = await readBuild(pool, accountId)
      if (!built?.site?.siteKey) return refuse(c, 'NOT_BUILT')
      if (!builds) return answer(c, accountId, sayFieldsOf(UNAVAILABLE_CODE), 503)
      const ctx = ctxOf(built)
      const rebuildFrom = await builds.current(ctx)
      if (!rebuildFrom) return refuse(c, 'NOT_BUILT')
      if (await builds.unfinished(ctx))
        return json(
          c,
          {
            code: 'PREVIOUS_RUN_UNFINISHED',
            next: REBUILD_REFUSALS.PREVIOUS_RUN_UNFINISHED[1],
            ...sayFieldsOf('previous_run_unfinished')
          },
          409
        )
      const held = await builds.read(rebuildFrom, ctx).catch(() => null)
      if (held?.plan?.id === plan.id && held?.plan?.revision === plan.revision)
        return answer(c, accountId, sayFieldsOf(DONE_CODE.unchanged))
      const revised = await reviseBuild(pool, accountId, { plan, rebuildFrom, now })
      if (revised.error) return refuse(c, revised.error)
      const { build } = revised
      const draftId = (await readEngineRow(pool, accountId)).id
      const brief = revisionBriefOf({ workflow: deps.workflow, draftId, build })
      const started = startRevision
        ? await startRevision({ accountId, email, siteKey: build.site.siteKey, draftId, build, brief }).catch(
            (error) => {
              log.error?.('[build-draft] the revision run could not be started:', error)
              return { refusal: { code: 'REVISION_START_FAILED', status: 502 } }
            }
          )
        : { refusal: { code: 'REVISION_RUN_UNAVAILABLE', status: 503 } }
      // A run that could not start changes nothing: the build reads as it did, the owner keeps the plan change.
      if (started?.refusal) {
        await undoRevision(pool, accountId, build.run.id, revised.previous, started.refusal, now)
        return answer(c, accountId, sayFieldsOf(UNAVAILABLE_CODE), 202)
      }
      return answer(c, accountId, {}, 202)
    })
  )

  /** A restore or an abandon: hold the site, run it, keep what it came to, say it. */
  const writeBack = (kind, run) =>
    door(async (c, accountId, email) => {
      if (!accountId) return refuse(c, 'NO_DRAFT')
      const claimed = await claimSite(pool, accountId, kind, { now })
      if (claimed.error) return refuse(c, claimed.error)
      const { build } = claimed
      const id = build.busy.id
      let outcome
      try {
        const done = await run({ build, email, runId: id, ctx: ctxOf(build) })
        if (done?.refusal) outcome = { result: 'refused', code: done.refusal }
        else outcome = { result: 'done', ...(done?.left ? { left: done.left } : {}) }
      } catch (error) {
        log.error?.(`[build-draft] the ${kind} of ${build.site.siteKey} stopped:`, error)
        outcome = { result: 'stopped', code: codeOf(error) }
      }
      await releaseSite(pool, accountId, id, outcome.result === 'refused' ? null : outcome, now)
      if (outcome.result === 'refused') return refuse(c, outcome.code)
      const code =
        outcome.result === 'done' ? DONE_CODE[kind] : (rebuildCodeOf(outcome.code) ?? UNAVAILABLE_CODE)
      return answer(c, accountId, { ...sayFieldsOf(code), [kind]: outcome })
    })

  app.post(
    `${BASE}/restore`,
    writeBack('restore', async ({ build, email, runId, ctx }) => {
      if (!builds || !restoreSite)
        throw Object.assign(new Error('no restore here'), { code: 'previous_build_doors_missing' })
      const ref = await builds.current(ctx)
      const held = ref ? await builds.read(ref, ctx) : null
      if (!held?.previous) return { refusal: 'NOTHING_TO_RESTORE' }
      return restoreSite({ siteKey: ctx.siteKey, email, runId, build: held, builds, ctx, draftBuild: build })
    })
  )

  app.post(
    `${BASE}/abandon`,
    writeBack('abandon', async ({ build, email, runId, ctx }) => {
      if (!builds || !abandonSite)
        throw Object.assign(new Error('no abandon here'), { code: 'previous_build_doors_missing' })
      const unfinished = await builds.unfinished(ctx)
      if (!unfinished) return { refusal: 'NOTHING_UNFINISHED' }
      return abandonSite({
        siteKey: ctx.siteKey,
        email,
        run: unfinished.runId,
        runId,
        builds,
        ctx,
        draftBuild: build
      })
    })
  )
}
