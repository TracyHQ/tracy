import { siteNameOf } from 'website-opportunities/domain/held-name.mjs'
import { isAgentDemo } from './agent-demo.js'
import { demoSelectionMatchesRevision } from '../lib/quickstart-selection.js'
/** Durable one-click demo orchestration, using the existing revision, build and hand-off services. */
import { mintSession } from '../lib/session.js'
import { isStepChainBuild, settleBuild, startBuild } from './builds.js'
import { resumeDemoQa } from './demo-qa.js'
import { startDemoClock } from './demo-retention.js'
import { createDurableQueue } from 'website-opportunities/src/durable-queue.js'
import { handOffToAgent } from './handoff-service.js'
import { revisionForAction } from './revisions.js'
import { createPictureLabelRuns } from './picture-label-runs.js'
import { briefOf, CURRENT_BRIEF } from '../lib/site-brief-row.js'
import { STEP_CHAIN_WORKFLOW } from '../lib/step-chain-switch.js'
import { chainRunOpen, chainStepOf } from '../lib/wo-chain-builds.js'
import { withHandoffLock } from './handoff.js'

const POLL_MS = 10_000
const LEASE_MS = 6 * 60_000
const ACTION_TIMEOUT_MS = 2 * 60 * 60_000
/** A chat turn with a write, a check beat or its start this recent is alive (#247). */
const CHAT_ALIVE_MS = 30 * 60_000
/** Past this, an action ends whatever its chat does: a turn row left open by a dsh that died never holds it. */
const CHAT_ACTION_MAX_MS = 2 * ACTION_TIMEOUT_MS

/**
 * 🔒 A STEP CHAIN STILL RUNNING IS NOT TIMED OUT EITHER (#516): the action waits for the chain to end, and the chain
 * has its own outer deadline and hand-over window (`sites/brief-engines/step-chain.js`, 2 h plus 15 min from its start)
 * and lost-run settling, so a chain at its deadline still hands the site over instead of the action failing a few
 * minutes before. A chain that ended within the alive window is still alive, so the next poll settles it as built
 * rather than timed out. Bounded by `CHAT_ACTION_MAX_MS` like a chat. SQL over `wo_demo_action a`; `alive` names the
 * parameter holding the alive window's start.
 */
const chainAliveSql = (
  alive
) => `exists (select 1 from wo_build w join site_brief b on b.site_key = w.site_key
    left join site s on s.site_key = w.site_key
    where w.account_id = a.account_id and w.request_id = a.build_request_id
      and w.receipt->>'workflow' = '${STEP_CHAIN_WORKFLOW}' and ${CURRENT_BRIEF}
      and (b.state in ('queued', 'preparing', 'ready', 'applying') or b.updated_at > ${alive}))`

/**
 * 🔒 A BUILD WHOSE CHAT IS STILL WORKING IS NOT TIMED OUT (#247, dev 30/10/2026). A client-send action stays queued for
 * its whole chat, and a build of six checks of 9–28 min each crossed the 2 h deadline while its agent was still
 * repairing: the action failed `DEMO_STEP_TIMEOUT`, Build from my business said failed, and eight minutes later the
 * chat told the customer the site was built. The deadline now waits while the action's chat turn is open and alive (a
 * write of that turn, a beat of its running check, or the turn opened within `CHAT_ALIVE_MS`), up to
 * `CHAT_ACTION_MAX_MS`. SQL over `wo_demo_action a`: `alive` names the parameter holding the alive window's start.
 */
const chatAliveSql = (alive) => `((a.selection->>'chatMode' = 'client-send/1' and exists (
    select 1 from wo_build b join site_turn t on t.site_key = b.site_key and t.session_id = a.session_id
    where b.account_id = a.account_id and b.request_id = a.build_request_id and t.state = 'open'
      and (t.opened_at > ${alive}
        or exists (select 1 from site_write w where w.turn_id = t.turn_id and w.at > ${alive})
        or case when b.qa->'clientCheck'->>'beatAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
          then (b.qa->'clientCheck'->>'beatAt')::timestamptz end > ${alive})))
  or ${chainAliveSql(alive)})`

/** Whether this action's chat turn is alive (`chatAliveSql`), so its deadline waits. */
export async function chatTurnAlive(db, action, at = Date.now()) {
  if (at - new Date(action.accepted_at).getTime() > CHAT_ACTION_MAX_MS) return false
  const { rows } = await db.query(
    `select ${chatAliveSql('$2')} as alive from wo_demo_action a where a.id = $1`,
    [action.id, new Date(at - CHAT_ALIVE_MS)]
  )
  return rows[0]?.alive === true
}

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
    `update wo_demo_action a set status = 'failed', error = 'DEMO_STEP_TIMEOUT', lease_until = null,
      lease_token = a.lease_token + 1, checked_at = $1, updated_at = $1
    where a.status = 'queued' and a.accepted_at < $2
      and (a.accepted_at < $3 or not ${chatAliveSql('$4')})`,
    [
      new Date(at),
      new Date(at - ACTION_TIMEOUT_MS),
      new Date(at - CHAT_ACTION_MAX_MS),
      new Date(at - CHAT_ALIVE_MS)
    ]
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
  // Server-owned builds and client-send builds freeze the same labelled research. Reuse the run warmed by the
  // own-site state door; a queued action must not freeze an unlabelled brief while that run is still working.
  const pictureRuns =
    deps.clientDemo?.pictureRuns ??
    (deps.pictureLabels ? createPictureLabelRuns({ label: deps.pictureLabels, now, log }) : null)
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
      const wait = (retryAt = now() + POLL_MS) =>
        lease.finish({
          status: 'queued',
          error: null,
          next_at: new Date(Math.max(now() + 1_000, retryAt)),
          attempts: 0,
          updated_at: new Date(now())
        })
      try {
        if (
          now() - new Date(action.accepted_at).getTime() > ACTION_TIMEOUT_MS &&
          !(await chatTurnAlive(pool, action, now()))
        )
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
          ...(pictureRuns && action.selection?.workflow === 'agent-demo/1'
            ? { pictureLabelRuns: pictureRuns }
            : {})
        })
        if (made.pending) return wait(made.retryAt)
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
            demoActionId: action.id
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
        // 🔒 A CHAIN BUILD'S STEP IS THE CHAIN'S OWN STEP (#516): the run frame keeps the chain's measurement on the
        // site's brief row as each step starts (`timings.chain`), and each poll marks the furthest step it has reached
        // (`chainStepOf`: kit, brand, plan, copy, pictures, write), so the progress card and /ops/wo agree on where a
        // build is. Other builds keep brief, build, fill and check.
        const chainRun = isStepChainBuild(build) && build.site_key ? await briefOf(db, build.site_key) : null
        const chainStep = chainStepOf(chainRun?.timings?.chain)
        if (chainStep && chainStep !== step) await mark(chainStep)
        if (build.state !== 'done') {
          if (!isStepChainBuild(build)) await mark('build')
          return wait()
        }
        // 🔒 A STEP CHAIN BUILD HAS NO CHAT TO HAND OVER TO (#479): the chain writes the site, so there is no agent
        // brief to send, no QA baseline to take and no fill to wait for. The action ends with the chain: the host
        // makes the base site long before the chain has written it (#516), so a brief row still running holds the
        // action open, and a finished one ends it.
        // Step 9 records `done` only after its final Site check and repair verification pass. Earlier model failures
        // may still hand over a verified fallback, but a terminal frame alone never proves that the site passed.
        if (isStepChainBuild(build)) {
          if (chainRun && chainRunOpen(chainRun.state)) return wait()
          const measured = chainRun?.timings?.chain
          const write = Array.isArray(measured?.steps)
            ? measured.steps.findLast((entry) => entry?.step === 'write')
            : null
          const passed =
            chainRun?.state === 'applied' &&
            ['complete', 'soft-failure'].includes(measured?.ending) &&
            !(Array.isArray(measured?.running) && measured.running.length) &&
            write?.outcome === 'done'
          // Only bounded status fields cross into QA. Detailed findings remain on the original chain measurement.
          const statusOf = (value, known) =>
            value == null ? null : known.includes(value) ? value : 'unknown'
          const qa = {
            state: passed ? 'passed' : 'failed',
            workflow: 'step-chain/1',
            humanAccepted: false,
            chain: {
              briefState: statusOf(chainRun?.state, ['applied', 'failed', 'cancelled']),
              ending: statusOf(measured?.ending, ['complete', 'soft-failure', 'running']),
              writeOutcome: statusOf(write?.outcome, ['done', 'failed', 'stopped', 'skipped'])
            }
          }
          await db.query(
            `update wo_build set qa = coalesce(qa,'{}'::jsonb) || $2::jsonb, updated_at = $3 where id = $1 and account_id = $4`,
            [build.id, JSON.stringify(qa), new Date(now()), action.account_id]
          )
          await startDemoClock(db, build.id, { now: now(), settings: (await runtime()).settings })
          return finish(passed ? 'completed' : 'failed', passed ? null : 'QA_NEEDS_REVIEW')
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
