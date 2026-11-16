// The build path is chosen from data only (#598): the AI quickstart pins of #588 (`resolvePinnedAiQuickstart`) and the
// kit manifests. A pinned kit that fits the trade is offered and its draft run is admitted; anything else keeps the
// current path. The kits are invented, or a temporary copy of a shipped kit with a fake pin: no real pin is written.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { TRADES, buildPathFor } from 'website-opportunities/domain'
import { AI_QUICKSTARTS_DIR } from '../src/build-draft/ai-quickstarts.js'
import { draftQuickstartCatalogue } from '../src/build-draft-wiring.js'
import { readAiQuickstartPins, shippedAiQuickstartPins } from '../src/lib/ai-quickstart-pins.js'
import { aiQuickstartPathEnabled, stepChainEnabled } from '../src/lib/step-chain-switch.js'
import { fakePinnedKits } from './_fake-ai-quickstart-pin.mjs'

const FIXTURE = fileURLToPath(
  new URL('../../../packages/wo/website-opportunities/test/fixtures/ai-quickstart/', import.meta.url)
)
const on = { STEP_CHAIN_ENABLED: '1' }
const silent = { warn: () => {} }
const invented = (slug, version, trades) => ({
  slug,
  version,
  from: FIXTURE,
  manifest: {
    schema: 'tracy-ai-quickstart-kit/v1',
    released: true,
    template: { slug, name: `Example ${slug}`, version },
    trades,
    picture: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
    reason: 'Built for invented clubs.'
  }
})

const one = fakePinnedKits([invented('example-ring', '2.0.1', ['fitness'])])
after(one.cleanup)
const catalogueOf = (t) =>
  draftQuickstartCatalogue({ root: t.root, kitRefOf: () => 'any', log: silent, aiQuickstartPins: t.read })

test('a pinned AI quickstart that fits is offered and its draft run takes the AI quickstart build', () => {
  assert.deepEqual(
    catalogueOf(one)
      .templatesFor('fitness')
      .map((t) => [t.slug, t.version]),
    [['example-ring', '2.0.1']]
  )
  const pinned = one.read.pinned
  const quickstart = 'quickstart/example-ring/j6'
  assert.equal(aiQuickstartPathEnabled({ quickstart, env: on, aiQuickstarts: pinned }), true)
  // The master switch still rules it.
  assert.equal(aiQuickstartPathEnabled({ quickstart, env: {}, aiQuickstarts: pinned }), false)
})

test('a kit that is not pinned is offered nothing, says why, and its draft run is refused', () => {
  const read = readAiQuickstartPins({ root: one.root, pins: {} })
  assert.deepEqual(read.pinned, [])
  assert.deepEqual(
    read.refused.map((r) => [r.key, r.problems.map((p) => p.code)]),
    [['example-ring/j6', ['not_pinned']]]
  )
  const warned = []
  const served = draftQuickstartCatalogue({
    root: one.root,
    kitRefOf: () => 'any',
    log: { warn: (line) => warned.push(line) },
    aiQuickstartPins: read
  })
  assert.deepEqual(served.templatesFor('fitness'), [])
  assert.deepEqual(served.refused(), read.refused)
  assert.deepEqual(warned, ['[build-draft] AI quickstart example-ring/j6 is not offered: not_pinned'])
  const quickstart = 'quickstart/example-ring/j6'
  assert.equal(aiQuickstartPathEnabled({ quickstart, env: on, aiQuickstarts: read.pinned }), false)
})

test('a trade nothing fits keeps the current path, and a template without a pin runs no step chain', () => {
  for (const trade of ['food', 'other', undefined]) {
    assert.deepEqual(catalogueOf(one).templatesFor(trade), [], String(trade))
    assert.equal(buildPathFor({ trade, quickstarts: one.read.pinned }).path, 'current')
  }
  // No pin, no step chain, for any build (#598): the template list is gone.
  assert.equal(stepChainEnabled({ quickstart: 'quickstart/example-other/j6', env: on }), false)
})

test('a second invented template is offered once it is pinned, with no code change', () => {
  const two = fakePinnedKits([
    invented('example-ring', '2.0.1', ['fitness']),
    invented('example-dojo', '1.4.0', ['fitness', 'education'])
  ])
  try {
    const served = catalogueOf(two)
    // Two fit: code point order of slug and cms, so example-dojo comes first.
    assert.deepEqual(
      served.templatesFor('fitness').map((t) => t.slug),
      ['example-dojo', 'example-ring']
    )
    assert.deepEqual(
      served.templatesFor('education').map((t) => t.slug),
      ['example-dojo']
    )
    const quickstarts = two.read.pinned
    assert.equal(
      aiQuickstartPathEnabled({ quickstart: 'example-dojo/j6', env: on, aiQuickstarts: quickstarts }),
      true
    )
  } finally {
    two.cleanup()
  }
})

test('the shipped files today: the pins file is empty, so no template is offered and every trade keeps the current path', () => {
  const shipped = shippedAiQuickstartPins()
  assert.deepEqual(shipped.pinned, [])
  assert.ok(shipped.refused.length > 0)
  assert.ok(shipped.refused.every((r) => r.problems.some((p) => p.code === 'not_pinned')))
  const served = draftQuickstartCatalogue({ log: silent })
  for (const trade of TRADES) {
    assert.deepEqual(served.templatesFor(trade), [], trade)
    assert.equal(buildPathFor({ trade, quickstarts: shipped.pinned }).path, 'current')
  }
  assert.equal(aiQuickstartPathEnabled({ quickstart: 'quickstart/ja-boxing/j6', env: on }), false)
})

test('the shipped JA Boxing kit, copied with a fake pin, is offered for fitness', () => {
  const boxing = fakePinnedKits([
    { slug: 'ja-boxing', version: '1.0.11', from: path.join(AI_QUICKSTARTS_DIR, 'ja-boxing', 'j6', '1.0.11') }
  ])
  try {
    assert.deepEqual(boxing.read.refused, [])
    const served = catalogueOf(boxing)
    assert.deepEqual(
      served.templatesFor('fitness').map((t) => [t.slug, t.version]),
      [['ja-boxing', '1.0.11']]
    )
    assert.deepEqual(served.templatesFor('food'), [])
    const quickstarts = boxing.read.pinned
    assert.equal(
      aiQuickstartPathEnabled({ quickstart: 'quickstart/ja-boxing/j6', env: on, aiQuickstarts: quickstarts }),
      true
    )
  } finally {
    boxing.cleanup()
  }
})
