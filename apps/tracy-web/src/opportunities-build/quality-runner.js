import { demoSelectionMatchesRevision } from '../lib/quickstart-selection.js'
/** Normal WO action queue for finite quality work. It never invokes a legacy normalizer or agent. */
import { mintSession } from '../lib/session.js'
import { startBuild, settleBuild } from './builds.js'
import { demoLeasePool } from './demo-runner.js'
import { startDemoClock } from './demo-retention.js'
import { createDurableQueue } from 'website-opportunities/src/durable-queue.js'
import { revisionForAction } from './revisions.js'
import { QUALITY_QUEUED, QUALITY_FAILED, QUALITY_COMPLETED, qualityModeOf } from './quality-protocol.js'

export function createQualityDemoRunner(deps) {
  const { pool, config, request, loadDomain, runtime, switchOn, quality, accountIds } = deps
  if (!quality?.editorialFor || !quality?.fill || !quality?.review || !accountIds?.length)
    throw new Error('QUALITY_RUNNER_DEPENDENCIES')
  const now = deps.now ?? Date.now,
    origin = String(config.origin).replace(/\/+$/, '')
  return createDurableQueue({
    pool,
    table: 'wo_demo_action',
    keyColumn: 'id',
    name: 'wo-demo',
    notBeforeColumn: 'next_at',
    queuedStatus: QUALITY_QUEUED,
    failedStatus: QUALITY_FAILED,
    accountIds,
    concurrency: 4,
    leaseMs: 6 * 60000,
    maxAttempts: 3,
    enabled: switchOn,
    now,
    log: deps.log ?? console,
    run: async (action, lease) => {
      const db = demoLeasePool(pool, lease, now)
      let step = action.step
      const mark = async (next) => {
        step = next
        await db.query('update wo_demo_action set step=$2,updated_at=$3 where id=$1', [
          action.id,
          next,
          new Date(now())
        ])
      }
      const finish = async (status, error = null) => {
        if (status === QUALITY_FAILED)
          await db.query(
            `update wo_quality_run r set
          state=case when exists(select 1 from wo_quality_attempt p where p.intent_id=r.intent_id and p.state='uncertain') then 'uncertain' else 'needs-attention' end,
          error=$3,updated_at=$4 from wo_quality_action_link l
          where l.action_id=$1 and l.run_id=r.id and r.account_id=$2 and r.state not in ('cancelled','failed')`,
            [action.id, action.account_id, error, new Date(now())]
          )
        return lease.finish({ status, error, step, checked_at: new Date(now()), updated_at: new Date(now()) })
      }
      const wait = () =>
        lease.finish({
          status: QUALITY_QUEUED,
          error: null,
          next_at: new Date(now() + 10000),
          attempts: 0,
          updated_at: new Date(now())
        })
      const checkAllowed = async () => {
        if (!(await switchOn()))
          throw Object.assign(new Error('QUALITY_SWITCH_OFF'), { code: 'QUALITY_SWITCH_OFF' })
        await db.query('select 1')
        const mode = await qualityModeOf(pool, action.account_id, { available: quality.available })
        if (mode === 'off') throw Object.assign(new Error('QUALITY_MODE_OFF'), { code: 'QUALITY_MODE_OFF' })
        await quality.checkAllowed({ action, lease, mode })
        return mode
      }
      try {
        const mode = await checkAllowed()
        const account = (await db.query('select email from account where id=$1', [action.account_id])).rows[0]
        if (!account) return finish(QUALITY_FAILED, 'ACCOUNT_NOT_FOUND')
        const cookie = `tracy_sess=${await mintSession(account.email, config.sessionSecret, now())}`
        const domain = await loadDomain()
        const made = await revisionForAction(db, {
          action,
          domain,
          templates: async () => {
            await mark('brief')
            const response = await request('/api/templates', { headers: { origin } }),
              templates = response.ok ? await response.json() : null
            if (!Array.isArray(templates?.templates))
              throw Object.assign(new Error('TEMPLATES_UNREADABLE'), { code: 'TEMPLATES_UNREADABLE' })
            return templates.templates
          },
          ops: (await runtime()).settings,
          now,
          editorial: quality.editorialFor({ action, lease, cookie, origin, checkAllowed, mode }),
          pictureLabels: deps.pictureLabels ?? null
        }).catch((error) =>
          error?.code === 'TEMPLATES_UNREADABLE' ? { error: 'TEMPLATES_UNREADABLE' } : Promise.reject(error)
        )
        if (made.error) return finish(QUALITY_FAILED, made.error)
        const revision = made.revision
        if (!demoSelectionMatchesRevision(action.selection, revision))
          return finish(QUALITY_FAILED, 'DEMO_SELECTION_CHANGED')
        await quality.adopt({ action, lease, revision, checkAllowed })
        if (revision.brief?.editorial?.mode === 'shadow') return finish(QUALITY_COMPLETED)
        if (mode !== 'apply') return finish(QUALITY_FAILED, 'QUALITY_APPLY_DISABLED')
        let build = (
          await db.query('select * from wo_build where account_id=$1 and request_id=$2', [
            action.account_id,
            action.build_request_id
          ])
        ).rows[0]
        if (
          !build ||
          build.state === 'requesting' ||
          (['failed', 'refused'].includes(build.state) && build.receipt?.demoActionId !== action.id)
        ) {
          await checkAllowed()
          await mark('build')
          const answer = await startBuild({
            pool: db,
            request,
            origin,
            cookie,
            domain,
            config,
            accountId: action.account_id,
            revision,
            requestId: action.build_request_id,
            label: action.label,
            demoActionId: action.id,
            qualityLease: lease
          })
          if (answer.status >= 300) return finish(QUALITY_FAILED, answer.body.code ?? 'BUILD_FAILED')
          build = answer.body.build
        }
        build = await settleBuild({ pool: db, request, origin, cookie, build })
        if (['failed', 'refused', 'deleted'].includes(build.state))
          return finish(QUALITY_FAILED, build.receipt?.failure?.code ?? 'BUILD_FAILED')
        if (build.state !== 'done') {
          await mark('build')
          return wait()
        }
        await startDemoClock(db, build.id, { now: now(), settings: (await runtime()).settings })
        await checkAllowed()
        await mark('fill')
        const filled = await quality.fill({ action, lease, revision, build, cookie, origin, checkAllowed })
        if (filled.state === 'pending') return wait()
        if (filled.state !== 'succeeded')
          return finish(QUALITY_FAILED, filled.error ?? 'QUALITY_FILL_NEEDS_ATTENTION')
        await checkAllowed()
        await mark('check')
        const reviewed = await quality.review({
          action,
          lease,
          revision,
          build,
          cookie,
          origin,
          checkAllowed
        })
        if (reviewed.state === 'pending') return wait()
        return finish(
          reviewed.state === 'succeeded' ? QUALITY_COMPLETED : QUALITY_FAILED,
          reviewed.error ?? null
        )
      } catch (error) {
        if (error?.code === 'DEMO_LEASE_LOST') return
        return finish(QUALITY_FAILED, error?.code ?? 'QUALITY_STEP_FAILED')
      }
    }
  })
}
