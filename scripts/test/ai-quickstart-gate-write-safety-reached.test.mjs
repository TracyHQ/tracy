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

// Review 5 Y1: a probe whose text carries no code (letters of other scripts, a content plugin code, a limit pad) has the
// same text at every place. A page that shows one place's copy must not count another place, whose probe the build
// dropped, as reached: on a page a place is found by its own value (its marker together with the probe), never by the
// probe text alone.
test('Y1: on a page a code-less probe counts only for the place whose own marker carries it', async () => {
  const { reachedOnPage } = await import('../ai-quickstart/gate/write-safety-reached.mjs')
  const codeLess = PROBES.filter((p) => !p.whole && !p.signature && p.types.includes('text'))
  const ids = codeLess.map((p) => p.id).sort()
  for (const id of ['other-scripts', 'emailcloak', 'control-characters', 'format-tokens', 'emoji-joiner'])
    assert.ok(ids.includes(id), id + ' is a code-less probe')
  for (const probe of codeLess) {
    const limit = probe.limit ? 40 : null
    const valueOf = (code) => {
      const base = 'Qx' + code
      const text = probe.text(code, { base, limit })
      return { code, probe, base, value: base + ' ' + text }
    }
    const used = new Map([
      ['A', valueOf('AAA')],
      ['B', valueOf('BBB')]
    ])
    // The page shows A's probed value and only B's plain marker: B's probe was dropped.
    const html = '<h1>' + used.get('A').value + '</h1><p>QxBBB</p>'
    assert.deepEqual([...reachedOnPage(html, used, new Set())], ['A'], probe.id)
  }
  // The two limit probes pad with the same letter: a longer pad must not stand for a shorter one of another place.
  const at = PROBES.find((p) => p.id === 'at-limit')
  const used = new Map([
    ['A', { code: 'AAA', probe: at, base: 'QxAAA', value: 'QxAAA ' + 'x'.repeat(30) }],
    ['B', { code: 'BBB', probe: at, base: 'QxBBB', value: 'QxBBB ' + 'x'.repeat(10) }]
  ])
  assert.deepEqual(
    [...reachedOnPage('<p>QxAAA ' + 'x'.repeat(30) + '</p><p>QxBBB</p>', used, new Set())],
    ['A']
  )
})

// Y1 in the plan: one stored column (an article's text) holds several places. The column stored for B holds A's probed
// value and B's plain marker: B is not reached.
test("Y1: in the plan a code-less probe counts only where the place's own value is stored", async () => {
  const { reachedInPlan } = await import('../ai-quickstart/gate/write-safety-reached.mjs')
  const { storedIndex } = await import('../ai-quickstart/gate/write-safety-places.mjs')
  const probe = PROBES.find((p) => p.id === 'other-scripts')
  const valueOf = (code) => ({ code, probe, base: 'Qx' + code, value: 'Qx' + code + ' ' + probe.text(code) })
  const used = new Map([
    ['A', valueOf('AAA')],
    ['B', valueOf('BBB')]
  ])
  const plan = {
    ops: [
      {
        key: 'article:1',
        record: 'article-1',
        fields: { introtext: '<h2>' + used.get('A').value + '</h2><p>QxBBB</p>' }
      }
    ]
  }
  const index = storedIndex(plan)
  assert.deepEqual([...reachedInPlan(used, plan, index, index)], ['A'])
})
