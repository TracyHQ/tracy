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
