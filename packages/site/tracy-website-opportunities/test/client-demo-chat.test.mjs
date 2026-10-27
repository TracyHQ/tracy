import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptedDemoAction, demoChatHref, followDemoChat } from '../src/client/demo-chat.ts'
import { runAction } from '../src/client/row-actions.ts'
import { createRequestIds } from '../src/client/request-ids.ts'

const action = (over = {}) => ({
  id: 'accepted',
  workflow: 'agent-demo/1',
  state: 'queued',
  chat: null,
  ...over
})
const chat = { siteKey: 'demo.test', sessionId: 'same-session', href: '/demo.test/s/same-session' }
function harness(initial = action()) {
  const opened = [],
    reads = []
  let tick,
    active = true,
    stopped = 0,
    next = initial
  const stop = followDemoChat({
    action: initial,
    read: async (id) => {
      reads.push(id)
      return next
    },
    current: () => active,
    open: (href) => opened.push(href),
    poll: (fn) => {
      tick = fn
      return () => stopped++
    }
  })
  return {
    opened,
    reads,
    stop,
    tick: () => tick(),
    next: (value) => {
      next = value
    },
    leave: () => {
      active = false
    },
    stopped: () => stopped
  }
}

test('accepted action waits for its actual server-created session and opens exactly once', async () => {
  const h = harness()
  await h.tick()
  assert.deepEqual(h.opened, [])
  h.next(action({ chat }))
  await h.tick()
  await h.tick()
  assert.deepEqual(h.opened, ['/demo.test/s/same-session'])
  assert.ok(h.reads.every((id) => id === 'accepted'))
})
test('leaving or disposing while a read is in flight prevents navigation', async () => {
  let resolve,
    tick,
    opened = 0
  const stop = followDemoChat({
    action: action(),
    read: () =>
      new Promise((r) => {
        resolve = r
      }),
    current: () => true,
    open: () => opened++,
    poll: (fn) => {
      tick = fn
      return () => {}
    }
  })
  const pending = tick()
  stop()
  resolve(action({ chat }))
  await pending
  assert.equal(opened, 0)
  const h = harness()
  h.next(action({ chat }))
  h.leave()
  await h.tick()
  assert.deepEqual(h.opened, [])
})
test('foreign action, old workflow, terminal no-chat and unsafe href never navigate', async () => {
  for (const next of [
    action({ id: 'other', chat }),
    action({ workflow: 'quickstart-first', chat }),
    action({ state: 'failed' })
  ]) {
    const h = harness()
    h.next(next)
    await h.tick()
    assert.deepEqual(h.opened, [])
    assert.equal(h.stopped(), 1)
  }
  for (const href of [
    'https://evil.test/demo.test/s/same-session',
    '//evil.test/x',
    '/other/s/same-session',
    'javascript:alert(1)'
  ])
    assert.equal(demoChatHref(action({ chat: { ...chat, href } })), null)
})
test('single/retry preserves accepted action/session and bulk opens only one selected action', async () => {
  const ids = createRequestIds(() => 'press')
  const calls = []
  const api = {
    buildDemo: async (...args) => {
      calls.push(args)
      return { ok: true, body: { actions: [action({ chat })] } }
    }
  }
  const outcome = await runAction(api, ids, 'retry-demo', { id: 'place', demoAction: { id: 'original' } })
  assert.equal(outcome.kind, 'demo-chat')
  assert.equal(calls[0][2], 'original')
  assert.equal(calls[0][3], undefined)
  assert.equal(demoChatHref(outcome.actions[0]), '/demo.test/s/same-session')
  const chosen = acceptedDemoAction([
    { id: 'old', workflow: 'quickstart-first' },
    ...outcome.actions,
    action({ id: 'second', chat: { ...chat, sessionId: 'other', href: '/demo.test/s/other' } })
  ])
  const h = harness(chosen)
  assert.equal(h.opened.length, 1)
  assert.equal(chosen.id, 'accepted')
})
