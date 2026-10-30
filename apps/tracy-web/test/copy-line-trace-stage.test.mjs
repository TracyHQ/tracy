/**
 * Every line a brief build leaves refused, complaint-unmet or unwritten is traced in the build record (spec TracyHQ/tracy#189,
 * R14: 25 complaint-unmet and 44 unwritten lines were only counted): its page, its slot, the writer that held it, the
 * reason, the check that failed and the model's last text (cut to 200 characters), in a bounded list. Fictional businesses:
 * a dental clinic, a bicycle repair shop.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { copyLineTrace, TRACE_MAX, TRACE_TEXT_MAX } from '../src/sites/brief-engines/copy-line-trace.js'
import { shapeSiblingCopy } from '../src/sites/brief-engines/sibling-copy-writer.js'

const DEMO =
  'A calm first visit where the whole mouth is checked with care. You leave with a clear plan for the months ahead.'
const TREATMENTS = ['Check-up', 'Cleaning', 'Whitening', 'Braces']
const slots = TREATMENTS.flatMap((name, i) => [
  {
    key: `post-${i + 1}.0`,
    entity: `post-${i + 1}`,
    type: 'text',
    role: 'offering.summary',
    group: { id: `post-${i + 1}.offering`, kind: 'service' },
    sample: DEMO
  },
  {
    key: `post-${i + 1}.1`,
    entity: `post-${i + 1}`,
    type: 'text',
    role: 'offering.name',
    group: { id: `post-${i + 1}.offering`, kind: 'service' },
    sample: name
  }
])
const written = {
  'post-1.0':
    'A calm first visit where every tooth is checked with care. You leave knowing what your smile needs next.',
  'post-2.0':
    'A thorough cleaning that keeps gums healthy between visits. It is done gently and at an easy pace.',
  'post-3.0': 'Book your whitening today!',
  'post-4.0':
    'Braces that straighten teeth gently, step by step. Each stage is explained to you before it begins.',
  'post-1.1': 'Check-up',
  'post-2.1': 'Cleaning',
  'post-3.1': 'Whitening',
  'post-4.1': 'Braces'
}

test('a sibling-list line that fails its shape check is in the receipt with its page, slot, writer, reason and check', async () => {
  const long = `Whitening ${'brightens every tooth gently and slowly, '.repeat(12)}`
  const out = await shapeSiblingCopy({
    slots,
    written,
    about: { business: 'Riverton Smile Studio', sourceText: 'Riverton Smile Studio' },
    model: { chat: async () => JSON.stringify({ lines: { 'post-3.0': long } }) }
  })
  assert.deepEqual(out.unreached, ['post-3.0'])
  assert.equal(out.tried['post-3.0'].check, 'out-of-band')
  const trace = copyLineTrace({
    lines: [{ key: 'post-3.0', writer: 'sibling-list', reason: 'unwritten', ...out.tried['post-3.0'] }],
    pageOf: (key) => (key.startsWith('post-3') ? ['menuItem-104'] : [])
  })
  assert.equal(trace.length, 1)
  assert.deepEqual(
    { ...trace[0], text: undefined },
    {
      page: 'menuItem-104',
      key: 'post-3.0',
      writer: 'sibling-list',
      reason: 'unwritten',
      check: 'out-of-band',
      text: undefined
    }
  )
  assert.equal(trace[0].text.length, TRACE_TEXT_MAX, 'the model text is cut to 200 characters')
})

test('the trace is bounded, and a line the model never answered says so', () => {
  const lines = Array.from({ length: TRACE_MAX + 50 }, (_, i) => ({
    key: `article-7.${i}`,
    writer: 'page-writer',
    reason: 'refused',
    check: 'unsourced-fact',
    text: 'Bike tune-ups from 40 dollars.'
  }))
  lines.push({ key: 'module-12.3', writer: 'record-page', reason: 'unwritten' })
  const trace = copyLineTrace({ lines, pageOf: () => ['menuItem-110'] })
  assert.equal(trace.length, TRACE_MAX)
  const empty = copyLineTrace({ lines: lines.slice(-1), pageOf: () => [] })[0]
  assert.deepEqual(empty, {
    page: null,
    key: 'module-12.3',
    writer: 'record-page',
    reason: 'unwritten',
    check: 'no-answer',
    text: null
  })
})
