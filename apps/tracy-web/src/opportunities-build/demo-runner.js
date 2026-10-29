import { siteNameOf } from 'website-opportunities/domain/held-name.mjs'
import { isAgentDemo } from './agent-demo.js'
import { demoSelectionMatchesRevision } from '../lib/quickstart-selection.js'
/** Durable one-click demo orchestration, using the existing revision, build and hand-off services. */
import { mintSession } from '../lib/session.js'
import { settleBuild, startBuild } from './builds.js'
import { resumeDemoQa } from './demo-qa.js'
import { startDemoClock } from './demo-retention.js'
import { createDurableQueue } from 'website-opportunities/src/durable-queue.js'
import { handOffToAgent } from './handoff-service.js'
import { revisionForAction } from './revisions.js'
import { briefOf } from '../lib/site-brief-row.js'
import { withHandoffLock } from './handoff.js'
import { isBriefBuild } from './brief-build-path.js'
import { checkBuildLeftovers } from './demo-leftover-check.js'
import { cleanBuildLeftovers, cleanupTurnPort } from './demo-leftover-cleanup.js'

const POLL_MS = 10_000
const LEASE_MS = 6 * 60_000
const ACTION_TIMEOUT_MS = 2 * 60 * 60_000

/**
 * Every database operation of a runner is fenced by the queue row. A write holds that row for
 * share for its short transaction, so reclaim cannot race the write. External effects use stable
 * ids (revision/build/session/prompt/upload); an effect whose receipt was lost is safely adopted.
 */
export function demoLeasePool(pool, lease, now = Date.now) {
  async function assertHeld(client) {
    const { rows } = await client.query(
      `select id from wo_demo_action where id = $1 and lease_token = $2 and status = $4
       and lease_until > $3 for share`,
      [lease.key, lease.token, new Date(now()), lease.queuedStatus ?? 'queued']
    )
    if (!rows.length) throw Object.assign(new Error('Demo action lease lost'), { code: 'DEMO_LEASE_LOST' })
  }
  return {
    async query(...args) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await assertHeld(client)
        const result = await client.query(...args)
        await client.query('commit')
        return result
      } catch (error) {
        await client.query('rollback').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async connect() {
      const client = await pool.connect()
      return {
        async query(sql, ...args) {
          const result = await client.query(sql, ...args)
          if (typeof sql === 'string' && sql.toLowerCase().trim() === 'begin') await assertHeld(client)
          return result
        },
        release: () => client.release()
      }
    }
  }
}

/**
 * 🔒 THE 2 H DEADLINE DOES NOT WAIT FOR A CLAIM (27/10/2026): `run` checked `ACTION_TIMEOUT_MS` only when it claimed a
 * row, so a run that hung with its heartbeat alive, or a queue whose switch was off, kept a demo on "Building…" for
 * ever. Every tick first fails each queued action past its deadline; bumping `lease_token` fences the worker that
 * may still hold it, so its late `finish` and fenced writes land nowhere.
 */
export async function expireOverdueDemoActions(pool, at = Date.now()) {
  const { rowCount } = await pool.query(
    `update wo_demo_action set status = 'failed', error = 'DEMO_STEP_TIMEOUT', lease_until = null,
      lease_token = lease_token + 1, checked_at = $1, updated_at = $1
    where status = 'queued' and accepted_at < $2`,
    [new Date(at), new Date(at - ACTION_TIMEOUT_MS)]
  )
  return rowCount
}

export function createDemoRunner(deps) {
  const {
    pool,
    config,
    request,
    loadDomain,
    runtime,
    switchOn,
    revisionForAction: forAction = revisionForAction
  } = deps
  const now = deps.now ?? Date.now
  const origin = String(config.origin).replace(/\/+$/, '')
  const log = deps.log ?? console
  const expire = () =>
    expireOverdueDemoActions(pool, now()).catch((error) => {
      log.error?.(`[wo-demo] deadline sweep failed: ${error?.code ?? error?.message ?? 'error'}`)
      return 0
    })
  const queue = createDurableQueue({
    pool,
    table: 'wo_demo_action',
    keyColumn: 'id',
    name: 'wo-demo',
    notBeforeColumn: 'next_at',
    enabled: switchOn,
    now,
    concurrency: 4,
    leaseMs: LEASE_MS,
    maxAttempts: 3,
    log,
    run: async (action, lease) => {
      const db = demoLeasePool(pool, lease, now)
      let step = action.step
      const mark = async (next) => {
        step = next
        await db.query('update wo_demo_action set step = $2, updated_at = $3 where id = $1', [
          action.id,
          step,
          new Date(now())
        ])
      }
      const finish = (state, error = null) =>
        lease.finish({ status: state, error, step, checked_at: new Date(now()), updated_at: new Date(now()) })
      const wait = () =>
        lease.finish({
          status: 'queued',
          error: null,
          next_at: new Date(now() + POLL_MS),
          attempts: 0,
          updated_at: new Date(now())
        })
      try {
        if (now() - new Date(action.accepted_at).getTime() > ACTION_TIMEOUT_MS)
          return finish('failed', 'DEMO_STEP_TIMEOUT')
        if (action.selection?.chatMode === 'client-send/1') {
          if (!deps.clientDemo) return finish('failed', 'DEMO_CHAT_UNAVAILABLE')
          const result = await deps.clientDemo.reconcile(action)
          if (result?.step && result.step !== step) await mark(result.step)
          return result?.terminal ? finish(result.state, result.error ?? null) : wait()
        }
        const account = (await db.query('select email from account where id = $1', [action.account_id]))
          .rows[0]
        if (!account) return finish('failed', 'ACCOUNT_NOT_FOUND')
        // Fresh identity for this server-owned job, never a saved browser cookie. All called doors
        // still read the account/seat book, including after the initiating sign-in expires.
        const cookie = `tracy_sess=${await mintSession(account.email, config.sessionSecret, now())}`
        const domain = await loadDomain()
        const made = await forAction(db, {
          action,
          domain,
          templates: async () => {
            await mark('brief')
            const res = await request('/api/templates', { headers: { origin } })
            const data = res.ok ? await res.json() : null
            if (!Array.isArray(data?.templates))
              throw Object.assign(new Error('Templates unavailable'), { code: 'TEMPLATES_UNREADABLE' })
            return data.templates
          },
          ops: (await runtime()).settings,
          now,
          // The brief reads the photo labels made beside the research, and waits while they are still being made
          // (`photo-labelling.js`, item 27): the action stays queued and shows "Looking at photos n/m" meanwhile.
          pictureLabels: deps.pictureLabels ?? null,
          photoLabelling: deps.photoLabelling ?? null
        })
        if (made.pending) {
          await mark('brief')
          return wait()
        }
        if (made.error) return finish('failed', made.error)
        const revision = made.revision
        if (action.selection?.workflow && action.selection.workflow !== revision.brief?.quickstartWorkflow)
          return finish('failed', 'DEMO_WORKFLOW_CHANGED')
        if (!demoSelectionMatchesRevision(action.selection, revision))
          return finish('failed', 'DEMO_SELECTION_CHANGED')
        let build = (
          await db.query('select * from wo_build where account_id = $1 and request_id = $2', [
            action.account_id,
            action.build_request_id
          ])
        ).rows[0]
        if (
          !build ||
          build.state === 'requesting' ||
          (build.state === 'refused' && (build.receipt?.status ?? 0) >= 500) ||
          (['failed', 'refused'].includes(build.state) && build.receipt?.demoActionId !== action.id)
        ) {
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
            ...(deps.contentMapOf ? { contentMapOf: deps.contentMapOf } : {})
          })
          if (answer.status >= 500 && action.attempts < 3)
            return lease.finish({
              error: answer.body.code ?? 'BUILD_UNREACHABLE',
              next_at: new Date(now() + POLL_MS)
            })
          if (answer.status >= 300) return finish('failed', answer.body.code ?? 'BUILD_FAILED')
          build = answer.body.build
        }
        build = await settleBuild({ pool: db, request, origin, cookie, build })
        if (['failed', 'refused', 'deleted'].includes(build.state))
          return finish('failed', build.receipt?.failure?.code ?? 'BUILD_FAILED')
        if (build.state !== 'done') {
          await mark('build')
          return wait()
        }
        await startDemoClock(db, build.id, { now: now(), settings: (await runtime()).settings })
        // A manual quickstart-first build still owns its site's fill: the fill writes only while this
        // action is queued (`quickstartActionOpen`), so the action waits for the fill and stops there,
        // before the runner's own QA and hand-off.
        const waitsForFill = revision.brief?.quickstartWorkflow === 'quickstart-first/1'
        if (!action.automatic && !waitsForFill) return finish('completed')
        // Reuse the existing job door's creator/seat checks; a deleted site answers 404 there.
        const accessLost = async () => {
          const access = await request(
            `/api/sites/${encodeURIComponent(build.site_key)}/jobs/${encodeURIComponent(build.site_job_id)}?inspect=1`,
            { headers: { cookie, origin } }
          )
          if (access.status === 401 || access.status === 403 || access.status === 404) return true
          if (!access.ok)
            throw Object.assign(new Error('Site access could not be checked'), {
              code: 'SITE_ACCESS_UNREADABLE'
            })
          return false
        }
        // A later explicit retry must still hold the site's edit right before resuming fill or
        // minting an agent seat.
        if (action.retry_of && (await accessLost())) return finish('failed', 'SITE_ACCESS_DENIED')
        if (isAgentDemo(revision)) {
          const ended = (
            await db.query(
              `select end_reason from site_turn where site_key=$1 and session_id=$2
            and opened_at >= $3 and state in ('closed','stale') and $4::jsonb ? rpc_id order by opened_at desc limit 1`,
              [
                build.site_key,
                action.session_id,
                action.accepted_at,
                JSON.stringify(build.qa?.expectedRequestIds ?? [])
              ]
            )
          ).rows[0]
          if (['aborted', 'blocked', 'error', 'interrupted', 'max-tokens'].includes(ended?.end_reason)) {
            await db.query(
              `update wo_build set qa=coalesce(qa,'{}'::jsonb)||$2::jsonb,
              handoff=coalesce(handoff,'{}'::jsonb)||'{"state":"needs-review"}'::jsonb where id=$1`,
              [
                build.id,
                JSON.stringify({
                  state: 'failed',
                  reason: 'AGENT_DEMO_TURN_STOPPED',
                  endReason: ended.end_reason
                })
              ]
            )
            return finish('failed', 'AGENT_DEMO_TURN_STOPPED')
          }
        }
        if (
          action.automatic &&
          (build.qa?.state === 'passed' ||
            (isAgentDemo(revision) && build.qa?.machinePassed === true && build.qa?.state === 'needs-review'))
        ) {
          await mark('check')
          return finish('completed')
        }
        if (
          action.automatic &&
          (build.qa?.state === 'failed' ||
            (build.qa?.retryActionId === action.id &&
              build.qa.retryMode !== 'initial-baseline' &&
              !build.qa.retryPromptSent))
        ) {
          await mark('check')
          // A Retry owns one finite QA attempt. Polling its own terminal failure must not
          // reopen it or keep the action queued until the overall timeout.
          if (!action.retry_of || (build.qa?.state === 'failed' && build.qa.retryActionId === action.id))
            return finish('failed', 'QA_NEEDS_REVIEW')
          if (build.qa?.acceptedRetry?.acceptedActionId !== action.id)
            return finish('failed', 'QA_NEEDS_REVIEW')
          if (!(await resumeDemoQa(db, deps, build, action.id))) {
            if (action.attempts >= 3) return finish('failed', 'QA_RETRY_FAILED')
            return lease.finish({ error: 'QA_RETRY_FAILED', next_at: new Date(now() + POLL_MS) })
          }
          return wait()
        }
        // Only this site's own brief: a deleted site leaves its row under the same address (`briefOf`).
        const brief = await briefOf(db, build.site_key)
        await mark('fill')
        if (isAgentDemo(revision) && brief) return finish('failed', 'AGENT_DEMO_OTHER_WRITER')
        if (!action.automatic) {
          // The create door writes the site's brief before it answers, so a built site without one
          // started no fill: there is nothing to hold open.
          if (!brief) return finish('completed')
          // A manual action holding its fill open must still hold the site's edit right.
          if (
            !action.retry_of &&
            ['queued', 'preparing', 'ready', 'applying'].includes(brief.state) &&
            (await accessLost())
          )
            return finish('failed', 'SITE_ACCESS_DENIED')
        }
        if (
          !isAgentDemo(revision) &&
          (!brief || ['queued', 'preparing', 'ready', 'applying'].includes(brief.state))
        )
          return wait()
        if (!isAgentDemo(revision) && brief.state !== 'applied') {
          if (
            action.retry_of &&
            brief.timings?.woRetryActionId !== action.id &&
            deps.resumeFill &&
            (await deps.resumeFill(build, account.email, action.id))
          )
            return wait()
          return finish('failed', 'SITE_FILL_FAILED')
        }
        if (!action.automatic) return finish('completed')
        if (revision.brief?.quickstartWorkflow === 'quickstart-first/1') {
          const current = (
            await db.query('select content from wo_build where id=$1 and account_id=$2', [
              build.id,
              action.account_id
            ])
          ).rows[0]
          const fill = current?.content?.writes?.['quickstart:fill']
          const qa = current?.content?.writes?.['quickstart:qa']
          // A placeholder is never a finished picture: a fill holding one is accepted only for review.
          const placeholderReceipts = (fill?.photos?.receipts ?? []).filter(
            (receipt) => receipt?.kind === 'placeholder'
          )
          const holdsPlaceholders =
            fill?.photos?.placeholders > 0 ||
            placeholderReceipts.length > 0 ||
            (fill?.photos?.gaps?.length ?? 0) > 0
          const placeholdersProved =
            placeholderReceipts.length > 0 &&
            (fill?.photos?.gaps ?? []).every((gap) =>
              placeholderReceipts.some((receipt) => receipt.key === gap?.groupId)
            )
          if (
            fill?.workflow !== 'quickstart-first/1' ||
            fill.state !== 'filled' ||
            qa?.workflow !== 'quickstart-first/1' ||
            qa.machineChecks?.version !== 1 ||
            qa.machineChecks?.identity?.state !== 'verified' ||
            !siteNameOf(revision.brief) ||
            qa.machineChecks.identity.actual !== siteNameOf(revision.brief) ||
            ['structure', 'coverage', 'pictures', 'links', 'demoResidue'].some(
              (key) =>
                qa.machineChecks[key] !== true &&
                // A manual review measured no links and no residue: a person looks at them (`quickstart-first.js`).
                !(
                  ['links', 'demoResidue'].includes(key) &&
                  qa.machineChecks[key] === 'not-measured' &&
                  revision.brief.reviewMode === 'manual' &&
                  qa.reviewMode === 'manual'
                )
            ) ||
            !(
              (qa.state === 'passed' && !holdsPlaceholders) ||
              (revision.brief.reviewMode === 'manual' &&
                qa.state === 'needs-review' &&
                qa.reviewMode === 'manual' &&
                (!holdsPlaceholders || placeholdersProved)) ||
              (qa.state === 'needs-review' &&
                !holdsPlaceholders &&
                qa.humanAccepted === false &&
                qa.reviewReason === 'quickstart-source-variants/1' &&
                fill.photos?.variantPolicy === qa.reviewReason &&
                fill.photos.requiresReview === true) ||
              // Slots no business photo fits hold a neutral placeholder; a person reviews them.
              (qa.state === 'needs-review' &&
                qa.humanAccepted === false &&
                qa.reviewReason === 'quickstart-picture-placeholders/1' &&
                fill.photos?.placeholderPolicy === qa.reviewReason &&
                fill.photos.requiresReview === true &&
                fill.photos.placeholders > 0 &&
                placeholdersProved)
            )
          )
            return finish('failed', 'QUICKSTART_QA_INCOMPLETE')
          await mark('check')
          await db.query('update wo_build set qa=$3::jsonb,updated_at=$4 where id=$1 and account_id=$2', [
            build.id,
            action.account_id,
            {
              state: 'needs-review',
              workflow: 'quickstart-first/1',
              humanAccepted: false,
              reviewMode: qa.reviewMode ?? 'automatic',
              machineChecks: qa.machineChecks,
              reportHash: qa.reportHash ?? null
            },
            new Date(now())
          ])
          return finish('completed')
        }
        // 🔒 A brief build is judged by the demo-leftover check once its fill is applied, before the hand-off (#191): the
        // findings go into the hand-off report and the ops view. Without a page reader (a test's world) it is not run.
        if (isBriefBuild(revision) && !build.receipt?.leftovers && deps.readSitePage) {
          await mark('check')
          build = await checkBuildLeftovers(db, {
            build,
            revision,
            domain,
            readSitePage: deps.readSitePage,
            ...(deps.contentMapOf ? { contentMapOf: deps.contentMapOf } : {}),
            now
          })
        }
        // 🔒 Findings left: ONE bounded cleanup turn gets only those (#197). It never fails the build; no findings, no turn.
        // Apart from the check so a worker that comes back after a lost lease still reaches it (it starts no second turn).
        if (isBriefBuild(revision) && build.receipt?.leftovers && deps.readSitePage) {
          await mark('check')
          build = await cleanBuildLeftovers(db, {
            build,
            revision,
            domain,
            readSitePage: deps.readSitePage,
            turn: deps.cleanupTurn ?? cleanupTurnPort(db, { ...deps, now }, { build, email: account.email }),
            ...(deps.contentMapOf ? { contentMapOf: deps.contentMapOf } : {}),
            now
          })
        }
        // A baseline the site check could not read yet is the QA sweep's to read again (`takeDueBaselines`),
        // and it sends the prompt once one holds: the worker waits instead of spending the reads.
        if (!build.handoff?.promptSent && build.qa?.state !== 'baseline') {
          await mark('check')
          // 🔒 The door's press and this worker hand one build over one at a time (`withHandoffLock`).
          const held = await withHandoffLock(db, build.id, () =>
            handOffToAgent({
              ...deps,
              pool: db,
              origin,
              cookie,
              domain,
              build,
              revision,
              email: account.email,
              sessionId: action.session_id,
              now
            })
          )
          if (!held.locked) return wait()
          const handed = held.value
          if (
            handed.status >= 300 &&
            handed.body.code === 'HANDOFF_BASELINE_FAILED' &&
            handed.body.qa?.state === 'baseline'
          )
            return wait()
          if (handed.status >= 300) {
            if (action.attempts >= 3) return finish('failed', handed.body.code)
            return lease.finish({
              error: handed.body.code,
              next_at: new Date(now() + POLL_MS),
              updated_at: new Date(now())
            })
          }
          // A brief build's hand-off is its report: nothing is sent, so nothing is waited on (#191).
          if (isBriefBuild(revision)) return finish('completed')
        }
        await mark('check')
        return wait()
      } catch (error) {
        if (error?.code === 'DEMO_LEASE_LOST') return
        if (action.attempts >= 3) return finish('failed', error?.code ?? 'DEMO_STEP_FAILED')
        return lease.finish({
          error: error?.code ?? 'DEMO_STEP_FAILED',
          next_at: new Date(now() + POLL_MS),
          updated_at: new Date(now())
        })
      }
    }
  })
  return {
    ...queue,
    tick: async () => {
      await expire()
      return queue.tick()
    },
    drain: async () => {
      await expire()
      return queue.drain()
    }
  }
}
