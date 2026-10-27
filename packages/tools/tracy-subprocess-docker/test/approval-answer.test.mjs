/**
 * An approval question on this host is answered at once, never left waiting for a browser.
 *
 * Measured 29/09/2026 on the bench (EmDash V6-des-L5-02): a session pinned `approval/policy: ask`
 * asked for `bash` with `sandbox_permissions: danger-full-access`, dsh forwarded the question to the
 * browsers on its `$events` stream, dsh-passwords showed it to none of them, and the turn waited
 * 643 s. This suite runs dsh's OWN approval service (the vendored build, `pnpm dsh:build`; CI builds
 * it before the gates) with a forwarder that never answers standing in for that stream, so "it no
 * longer waits" is measured on the real waterfall, not assumed from a fake.
 *
 *   node --test packages/tools/tracy-subprocess-docker/test/approval-answer.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { DockerSubprocessRuntime } from '../index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(here, '..', '..', '..', '..')
const HARNESS = path.join(REPO, 'vendor/tracy/deepseek-harness/packages')
const fromApproval = createRequire(path.join(HARNESS, 'interaction/user-approval/package.json'))
const load = (/** @type {string} */ name) => import(pathToFileURL(fromApproval.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { default: ApprovalService } = await load('@deepseek-ai/dsh-user-approval')
const { approveEscalation } = await import(
  pathToFileURL(path.join(HARNESS, 'sandbox/sandbox/lib/index.js')).href
)

/**
 * How long an answer may take: far longer than the microtasks it needs (a loaded CI runner must not
 * turn a stall into a red test), far shorter than a turn a customer would wait out.
 */
const PATIENCE_MS = 5000
/** How long the reproduction watches a question sit unanswered before it cancels it. */
const WATCH_MS = 300

/**
 * A session the way the bench's was: pinned `ask` at creation, now inside an open turn (the
 * service's precondition for asking at all).
 * @returns {{ agent: object, appended: Array<{ type: string, data: Record<string, unknown> }> }}
 */
function askingAgent() {
  /** @type {Array<{ type: string, data?: Record<string, unknown> }>} */
  const events = [
    { type: 'permission/preset', data: { preset: 'workspace-write' } },
    { type: 'sandbox/mode', data: { mode: 'workspace-write' } },
    { type: 'approval/policy', data: { policy: 'ask' } },
    { type: 'turn/start' },
    { type: 'user/message' }
  ]
  /** @type {Array<{ type: string, data: Record<string, unknown> }>} */
  const appended = []
  const agent = {
    session: {
      get seq() {
        return events.length
      },
      eventAt: (/** @type {number} */ seq) => events[seq],
      append: (/** @type {string} */ type, /** @type {Record<string, unknown>} */ data) => {
        const event = { type, data }
        events.push(event)
        appended.push(event)
        return event
      }
    }
  }
  return { agent, appended }
}

/**
 * dsh's approval service, with the browser forwarder already listening — registered FIRST, the way
 * dsh's gateway can be up before this plugin loads — and never answering, the way no seat does.
 * @returns {Promise<{ ctx: any, forwarded: () => number }>}
 */
async function hostWithSilentBrowsers() {
  const ctx = new Context()
  await ctx.plugin(ApprovalService)
  let forwarded = 0
  ctx.on('approval/request', () => {
    forwarded += 1
    return new Promise(() => {})
  })
  return { ctx, forwarded: () => forwarded }
}

/**
 * Settle within a window, or report that it did not.
 * @template T
 * @param {Promise<T>} pending
 * @param {number} [ms] - the window; the patience window by default.
 * @returns {Promise<T | 'still waiting'>}
 */
function within(pending, ms = PATIENCE_MS) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve('still waiting'), ms)
  })
  return Promise.race([pending, timeout]).finally(() => clearTimeout(timer))
}

test('the hang, reproduced: without the answer an `ask` session waits on a browser that never replies', async () => {
  const { ctx, forwarded } = await hostWithSilentBrowsers()
  const { agent } = askingAgent()
  const abort = new AbortController()
  const pending = ctx.approval.request({ agent, toolName: 'bash', signal: abort.signal })
  assert.equal(await within(pending, WATCH_MS), 'still waiting')
  assert.equal(forwarded(), 1)
  // Only a cancellation ends it — the runner's 12-minute stop on the bench.
  abort.abort()
  assert.equal(await pending, 'cancelled')
})

test('the answer: an `ask` session is rejected at once, and the question never reaches a browser', async () => {
  const { ctx, forwarded } = await hostWithSilentBrowsers()
  DockerSubprocessRuntime.prototype.registerApprovalAnswer.call(Object.create(null), ctx)
  const { agent, appended } = askingAgent()
  assert.equal(await within(ctx.approval.request({ agent, toolName: 'bash' })), 'rejected')
  assert.equal(forwarded(), 0, 'the forwarder to the browsers must not be reached')
  // dsh still audits the pair, so the session log says what happened and why the call failed.
  assert.deepEqual(
    appended.map((event) => [event.type, event.data.outcome]),
    [
      ['approval/asked', undefined],
      ['approval/decided', 'rejected']
    ]
  )
})

test('what the agent reads: the escalation from the bench fails at once with dsh’s refusal', async () => {
  const { ctx } = await hostWithSilentBrowsers()
  DockerSubprocessRuntime.prototype.registerApprovalAnswer.call(Object.create(null), ctx)
  const { agent } = askingAgent()
  const escalation = approveEscalation(
    {
      requestedMode: 'danger-full-access',
      justification: 'The header file lives outside this session’s default area.',
      effectiveMode: 'workspace-write',
      subject: 'command'
    },
    { approver: ctx.approval, agent, callId: 'call-1', toolName: 'bash' }
  )
  const outcome = await within(
    escalation.then(
      () => 'granted',
      (/** @type {Error} */ error) => error.message
    )
  )
  assert.match(
    String(outcome),
    /^the user rejected escalating this command to "danger-full-access"; it stays denied, so stop and explain instead of working around it$/
  )
})

test('a session pinned `never` (what the native bundle pins on a new session) is decided before any answerer', async () => {
  const { ctx, forwarded } = await hostWithSilentBrowsers()
  let answered = 0
  ctx.on(
    'approval/request',
    () => {
      answered += 1
      return Promise.resolve('rejected')
    },
    { prepend: true }
  )
  const { agent } = askingAgent()
  agent.session.append('approval/policy', { policy: 'never' })
  assert.equal(await within(ctx.approval.request({ agent, toolName: 'bash' })), 'rejected')
  assert.equal(answered, 0)
  assert.equal(forwarded(), 0)
})

test('registerApprovalAnswer: one listener, on the approval waterfall, prepended', () => {
  /** @type {Array<{ event: string, listener: Function, options: unknown }>} */
  const listeners = []
  const ctx = {
    on(/** @type {string} */ event, /** @type {Function} */ listener, /** @type {unknown} */ options) {
      listeners.push({ event, listener, options })
      return () => true
    }
  }
  DockerSubprocessRuntime.prototype.registerApprovalAnswer.call(Object.create(null), ctx)
  assert.equal(listeners.length, 1)
  assert.equal(listeners[0].event, 'approval/request')
  assert.deepEqual(listeners[0].options, { prepend: true })
})
