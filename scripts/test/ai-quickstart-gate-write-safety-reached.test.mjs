// A place counts as tested only when the probe a pass gave it reached the site (ticket #586, review round 2, R5): a
// build that writes the plain marker in place of every probe, or drops the probes, tests nothing, leaves the
// measurement incomplete, and its plain markers are never judged as an injection. A probe that replaces the whole
// value (the empty value, a number) carries no code and has its own check: it is found where the plain build stored
// that place, with exactly its value. The invented florist kit on a memory site.
import assert from 'node:assert/strict'
import test from 'node:test'
import { JOOMLA_PROBES } from '../ai-quickstart/gate/adapters/joomla-probes.mjs'
import { markerBuild, markerText } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { PROBE_CATALOGUE } from '../ai-quickstart/gate/write-probes-edge.mjs'
import { writeSafety } from '../ai-quickstart/gate/write-safety.mjs'
import { floristKit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'
import { memorySiteOf } from './fixtures/ai-quickstart-gate/memory-site.mjs'

const icons = { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] }
const PROBES = [...PROBE_CATALOGUE, ...JOOMLA_PROBES]
/** The options of a build that asks for each probe and then writes what it would write with none. */
const dropped = (options) => ({
  ...options,
  textOf: (f) => {
    options.textOf?.(f)
    return markerText(f)
  },
  factOf: (v) => {
    options.factOf?.(v)
    return v.value
  }
})
const measure = (probes, dropping = false) => {
  const kit = floristKit()
  const site = memorySiteOf(kit, {})
  // A dropping build is asked for the probes and writes its plain markers instead.
  const build = (options) =>
    markerBuild(kit, {
      iconLibrary: icons,
      tryWrite: memoryTryWrite(kit),
      ...(dropping ? dropped(options) : options)
    })
  return writeSafety({ build, site, probes })
}

test('R5: a build that writes the plain marker instead of every probe tests nothing and is incomplete', async () => {
  const result = await measure(PROBES, true)
  assert.equal(result.places.tested, 0)
  assert.ok(result.places.probed > 0)
  assert.equal(result.status, 'incomplete')
  assert.match(String(result.incomplete), /probe_not_written|not_site_tested/)
  assert.equal(
    result.findings.filter((f) => f.kind === 'markup_injected').length,
    0,
    'a plain marker is no injection'
  )
  assert.ok(result.ledger.every((r) => r.reached !== true))
})

test('R5: the same probes written as asked are tested at every place', async () => {
  const result = await measure(PROBES)
  assert.ok(result.places.tested > 0)
  assert.equal(result.places.tested, result.places.probed)
})

test('R5: a whole value probe is tested only where the plain build stored its place, with exactly its value', async () => {
  const whole = PROBES.filter((p) => p.whole)
  assert.ok(whole.length > 0)
  const written = await measure(whole)
  assert.ok(written.places.tested > 0, 'whole probes reach the site')
  const dropped = await measure(whole, true)
  assert.equal(dropped.places.tested, 0, 'a plain marker in place of the whole value is not the probe')
})
