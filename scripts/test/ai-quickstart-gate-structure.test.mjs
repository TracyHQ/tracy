// The structure measurement of the release gate (ticket #586) on the invented florist kit and a site in memory: the
// full marker build, the minimum variant on a fresh site, and the pages hidden after the build in two halves, with the
// links each hidden page breaks named by its page type (ADR 0045 section 3: a broken link fails).
import assert from 'node:assert/strict'
import test from 'node:test'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { structure } from '../ai-quickstart/gate/structure.mjs'
import { floristKit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'
import { memorySiteOf, ORIGIN } from './fixtures/ai-quickstart-gate/memory-site.mjs'

const icons = { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] }
const measure = (faults = {}) => {
  const kit = floristKit()
  const site = memorySiteOf(kit, faults)
  const build = (options) =>
    markerBuild(kit, { iconLibrary: icons, tryWrite: memoryTryWrite(kit), ...options })
  return structure({ build, site, kit, base: ORIGIN + '/' }).then((result) => ({ result, site, kit }))
}

test('the minimum variant composes each block at its minimum items, the full one at its maximum', async () => {
  const { result } = await measure()
  assert.equal(result.full.status, 'passed')
  assert.equal(result.minimum.status, 'passed')
  assert.ok(result.minimum.blocks.length > 0)
  for (const b of result.minimum.blocks) assert.equal(b.items, b.min, b.page + ' ' + b.block)
  for (const b of result.full.blocks) assert.ok(b.items >= b.min, b.page + ' ' + b.block)
  assert.ok(
    result.full.blocks.some((b) => b.items > b.min),
    'the full variant shows more than the minimum somewhere'
  )
  assert.equal(result.status, 'passed')
})

test('a link to a hidden page is missing_page with its page type, and fails the measurement', async () => {
  const { result } = await measure({ staleLinks: true })
  const hidden = result.hidden
  assert.equal(hidden.status, 'failed')
  assert.ok(hidden.hidden >= 2)
  const missing = hidden.broken.filter((f) => f.kind === 'missing_page')
  assert.ok(missing.length > 0)
  for (const f of missing) {
    assert.ok(f.target, f.href)
    assert.ok(f.hidden.includes(f.target), f.target + ' was hidden when its link broke')
  }
  // Every hidden page answers again once published.
  assert.deepEqual(hidden.notBack, [])
  assert.equal(result.status, 'failed')
  // A template whose menu follows the hidden pages keeps every link whole.
  const clean = await measure()
  assert.equal(clean.result.hidden.status, 'passed')
  assert.deepEqual(clean.result.hidden.broken, [])
})

test('a page that answers an error fails the full variant', async () => {
  const { result } = await measure({ pageFails: (html) => html.includes('data-m="hero-home"') })
  assert.equal(result.full.status, 'failed')
  assert.ok(result.full.errors.length > 0)
  assert.equal(result.status, 'failed')
})

test('no reset hook: the minimum variant is not_run and the measurement incomplete', async () => {
  const { result, site } = await measure({ reset: false })
  assert.equal(result.full.status, 'passed')
  assert.deepEqual(result.minimum, { status: 'not_run', variant: 'minimum', reason: 'no_reset_hook' })
  assert.equal(result.status, 'incomplete')
  assert.equal(site.counts.writes, 1)
})
