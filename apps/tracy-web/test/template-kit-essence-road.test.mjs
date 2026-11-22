// The Template kit road step judges the committed JA Essence kit as approved: its self-checks are 0 or explained by a
// reason, every packed 1440 shot has a current look, the content map beside it gives the flow what it reads, and the
// approval still covers the image set.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { kitMapOf } from '../src/lib/template-kit/flow-reads.js'
import { templateKitStep } from '../src/lib/template-kit/road-step.js'

const dir = new URL('../../../packages/cms/tracy-emdash-theme-essence/contracts/0.1.0/', import.meta.url)
const read = (name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'))

test('the JA Essence kit passes the Template kit road step as approved', () => {
  const doc = read('template-kit.json')
  let seen = null
  const put = (_step, state, code, params) => {
    seen = { state, code, reason: params?.reason }
  }
  templateKitStep(put, () => undefined, {
    release: {
      platform: 'emdash',
      tag: 'tracy-essence/emdash-0.x',
      assets: [{ name: 'template-kit-tracy-essence-0.1.0.zip' }]
    },
    version: doc.quickstart.version,
    contractId: doc.contract,
    kit: { state: 'ok', doc },
    map: kitMapOf(read('content-map.json'))
  })
  assert.deepEqual(seen, { state: 'done', code: 'kit-approved', reason: undefined })
})

test('the JA Essence kit explains each self-check failure it keeps with a reason', () => {
  const doc = read('template-kit.json')
  for (const [check, n] of Object.entries(doc.checks).filter(([, v]) => typeof v === 'number' && v > 0)) {
    const reasons = (doc.checkAccepts?.[check] ?? []).filter((a) => String(a.reason ?? '').trim())
    assert.ok(reasons.length >= n, `${check}: ${n} failures, ${reasons.length} reasons`)
  }
})
