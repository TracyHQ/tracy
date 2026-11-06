// Card AS, step 11: demo words a page still shows are the writer's (step 6) unless the write report says the write step was given
// words for that slot and did not put them there; then they are the write step's (step 9). Kit, report and words are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoLeftByWrite } from '../src/site-check/demo-left-by-write.js'

const KIT = {
  blocks: [
    {
      id: 'block-4',
      slots: [
        { id: 'block-4.1', type: 'text', sample: 'Morning ((br/))((span))routine((/span))' },
        { id: 'block-4.2', type: 'text', sample: 'Meet the team' }
      ]
    }
  ]
}
const report = (slots) => ({ slots })
const finding = (measured) => ({
  page: '/',
  slot: null,
  measured,
  level: 'block',
  reason: 'no-demo-words: no text of the template'
})

test('demo words of a slot the write step was told to write and could not are blamed on step 9', () => {
  const r = report([
    {
      slot: 'block-4.1',
      key: 'module-4.1',
      status: 'failed',
      ordered: 'How a first((br/))((span))lesson((/span)) runs',
      textFallback: 'demo-remains'
    }
  ])
  const blamed = demoLeftByWrite(finding('morning routine'), { report: r, kit: KIT })
  assert.equal(blamed.causingStep, 9)
  assert.equal(blamed.slot, 'block-4.1')
  assert.match(blamed.reason, /write step/)
})

test('demo words of a slot nobody ordered stay with the writer', () => {
  const r = report([{ slot: 'block-4.1', key: 'module-4.1', status: 'written', ordered: 'Own words' }])
  assert.equal(demoLeftByWrite(finding('meet the team'), { report: r, kit: KIT }), null)
  assert.equal(demoLeftByWrite(finding('morning routine'), { report: r, kit: KIT }), null)
  assert.equal(demoLeftByWrite(finding(null), { report: r, kit: KIT }), null)
})
