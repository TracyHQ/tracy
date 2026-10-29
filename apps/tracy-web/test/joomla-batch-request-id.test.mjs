// A records transaction's request id is the component's idempotency key: the same id answers the stored result again.
// Several passes of one build share one apply id (one undo): the tidy-up, the outside-map pass and the dead-link sweep.
// Their transactions must not share a request id, or the later pass is answered the earlier pass's result and writes
// nothing. A retry of the very same transaction keeps its id, so a lost answer is never applied twice.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeSteps } from '../src/sites/brief-engines/joomla-tidy.js'

const recorder = () => {
  const calls = []
  const apply = async (call) => (calls.push(call), { ok: true })
  return { calls, apply }
}

test('two passes under one apply id send their transactions under different request ids', async () => {
  const { calls, apply } = recorder()
  const hide = (id) => ({ kind: 'module', id, fields: { published: 0 } })
  await writeSteps({ apply, siteKey: 'bakery', steps: [hide(1), hide(2)], applyId: 'brief-abc' })
  await writeSteps({ apply, siteKey: 'bakery', steps: [hide(7)], applyId: 'brief-abc' })
  await writeSteps({
    apply,
    siteKey: 'bakery',
    steps: [{ kind: 'menuItem', id: 9, fields: { link: '/menu' } }],
    applyId: 'brief-abc'
  })
  const ids = calls.map((c) => c.params.request_id)
  assert.equal(ids.length, 3)
  assert.equal(new Set(ids).size, 3, `every transaction its own request: ${ids.join(', ')}`)
  assert.ok(
    calls.every((c) => c.params.apply_id === 'brief-abc'),
    'one apply id: one undo'
  )
  for (const id of ids) assert.match(id, /^[a-zA-Z0-9._:-]{1,100}$/)
})

test('the same transaction sent again keeps its request id, so a retry is answered, not applied twice', async () => {
  const { calls, apply } = recorder()
  const steps = [{ kind: 'article', id: 4, fields: { title: 'Sourdough classes' } }]
  await writeSteps({ apply, siteKey: 'bakery', steps, applyId: 'brief-abc' })
  await writeSteps({ apply, siteKey: 'bakery', steps, applyId: 'brief-abc' })
  assert.equal(calls[0].params.request_id, calls[1].params.request_id)
})

test('a long apply id still gives a request id the component accepts', async () => {
  const { calls, apply } = recorder()
  const applyId = `brief-${'x'.repeat(95)}`
  await writeSteps({ apply, siteKey: 'garage', steps: [{ kind: 'module', id: 3, fields: {} }], applyId })
  assert.match(calls[0].params.request_id, /^[a-zA-Z0-9._:-]{1,100}$/)
})
