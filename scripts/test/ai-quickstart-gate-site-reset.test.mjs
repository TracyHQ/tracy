// The site reset hook of the release gate (ticket #586): no command means no reset (the measurements that need a fresh
// site are not_run); with one, the command runs and a site that is not fresh after it is refused: the plugin moved off
// its pin, the blank site contract is not bound, a contract slot still holds a written value, or a build record is
// left. Invented site, no network.
import assert from 'node:assert/strict'
import test from 'node:test'
import { freshProblems, siteReset } from '../ai-quickstart/gate/site-reset.mjs'

const contentMap = {
  slots: [
    { key: 'module-1.1', sample: '' },
    { key: 'module-2.1', sample: '' }
  ]
}
const sendOf =
  ({ version = '1.0.0', contract = 'example-petal-blank/j6/1.0.0', current = '' } = {}) =>
  async (operation, payload) => {
    if (operation === 'info') return { info: { component: version } }
    if (payload.operation === 'bind') return { contract }
    return {
      slots: [
        { key: 'module-1.1', current },
        { key: 'module-2.1', current: '' }
      ]
    }
  }
const fresh = (send, find = async () => null) =>
  freshProblems({
    send,
    pin: '1.0.0',
    contract: 'example-petal-blank/j6/1.0.0',
    contentMap,
    find,
    marks: ['qxabd']
  })

test('no command: no reset hook', () => {
  assert.equal(siteReset({ command: null, check: async () => [] }), null)
  assert.equal(siteReset({ command: '', check: async () => [] }), null)
})

test('a reset runs its command, then checks the site is fresh', async () => {
  const ran = []
  const reset = siteReset({
    command: 'restore the snapshot',
    exec: async (c) => ran.push(c),
    check: () => fresh(sendOf())
  })
  await reset()
  assert.deepEqual(ran, ['restore the snapshot'])
})

test('a site that is not fresh after its reset is refused, each problem named', async () => {
  assert.deepEqual(await fresh(sendOf()), [])
  assert.deepEqual(
    (await fresh(sendOf({ version: '1.0.1' }))).map((p) => p.code),
    ['plugin_not_pinned']
  )
  assert.deepEqual(
    (await fresh(sendOf({ contract: 'example-petal/j6/1.0.0' }))).map((p) => p.code),
    ['contract_not_bound']
  )
  assert.deepEqual(await fresh(sendOf({ current: 'QxABG' })), [
    { code: 'slot_not_blank', count: 1, first: ['module-1.1'] }
  ])
  assert.deepEqual(
    (await fresh(sendOf(), async (mark) => (mark === 'qxabd' ? 2001 : null))).map((p) => p.code),
    ['record_left']
  )
  const reset = siteReset({
    command: 'restore',
    exec: async () => {},
    check: () => fresh(sendOf({ current: 'QxABG' }))
  })
  await assert.rejects(
    reset(),
    (e) => e.code === 'reset_not_fresh' && e.problems[0].code === 'slot_not_blank'
  )
})

test('K1: after the command the reset waits while the site does not answer yet, bounded, then checks it', async () => {
  const down = (code) => Object.assign(new Error('info: ' + code), { code })
  let calls = 0
  let clock = 0
  const slept = []
  const reset = siteReset({
    command: 'restore',
    exec: async () => {},
    sleep: async (ms) => {
      slept.push(ms)
      clock += ms
    },
    now: () => clock,
    check: async () => {
      calls += 1
      if (calls === 1) throw down('not_json')
      if (calls === 2) throw down('no_answer')
      return []
    }
  })
  await reset()
  assert.equal(calls, 3)
  assert.equal(slept.length, 2)
  // A site that never comes back stops the reset with its own code once the wait is over.
  clock = 0
  const never = siteReset({
    command: 'restore',
    exec: async () => {},
    waitSeconds: 10,
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
    check: async () => {
      throw down('not_json')
    }
  })
  await assert.rejects(never(), (e) => e.code === 'reset_site_unreachable' && e.cause === 'not_json')
  // A refusal of another kind is no wait: it is the check's own answer.
  const refused = siteReset({
    command: 'restore',
    exec: async () => {},
    sleep: async () => assert.fail('no wait on a refusal'),
    check: async () => {
      throw down('unauthorized')
    }
  })
  await assert.rejects(refused(), (e) => e.code === 'unauthorized')
})

test('a blank slot the site keeps as white space only is blank; any written text is not', async () => {
  // A real blank site keeps some emptied module texts as a line break or a space where the contract samples nothing.
  for (const current of ['\r\n\r\n', ' ', '\n'])
    assert.deepEqual(await fresh(sendOf({ current })), [], JSON.stringify(current))
  assert.equal((await fresh(sendOf({ current: ' QxABG ' })))[0].code, 'slot_not_blank')
})
