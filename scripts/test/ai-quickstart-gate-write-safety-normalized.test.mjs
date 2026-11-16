// A probe the build does not write gets a final class (ticket #586, review 7 D2), on a hand-made build of an invented
// bicycle repair shop and a site in memory. The build has four rules of its own: an empty intro is replaced by the
// block's name, a zero price is wrapped in paragraph markers, a format token in the price closes the repair list (the
// repair paragraph is dropped), and a note holding a brace loses its marker. Built alone, each probe is classed: the
// build normalizes it (`normalized_by_build`, with what it wrote, a result that does not block a pass), it still holds
// the probe's code without the marker (`normalized_unsafe`, a failure), it refuses it (a finding, `built_alone`), or it
// writes it (another place's probe dropped it: tried again in a later pass). No pair stays `not_written`.
import assert from 'node:assert/strict'
import test from 'node:test'
import { JOOMLA_PROBES } from '../ai-quickstart/gate/adapters/joomla-probes.mjs'
import { LIMITS, writeSafety } from '../ai-quickstart/gate/write-safety.mjs'
import { PROBE_CATALOGUE } from '../ai-quickstart/gate/write-probes-edge.mjs'

const ALL = [...PROBE_CATALOGUE, ...JOOMLA_PROBES]
const pick = (...ids) => ALL.filter((p) => ids.includes(p.id))
const order = {
  pages: [{ id: 'home', blocks: ['b1', 'b2', 'b3', 'b4'].map((b) => ({ id: 'home-' + b, block: b })) }]
}
const at = (op, value, field, slot) => ({
  key: op,
  values: [
    {
      value,
      entry: 'home.home-' + slot + '.' + field,
      loc: { entity: op, column: 'content', slot: op + '.0' }
    }
  ]
})

/** The repair shop's build. `strip`: the note loses its marker when it holds a brace. */
const buildOf =
  ({ strip = false, fragile = false } = {}) =>
  (options) => {
    const text = (key, code) => options.textOf({ page: 'home', key, code, kind: 'paragraph', limit: 200 })
    // Asked in this order, so the first pass gives the repair paragraph and the price the probes that meet.
    const repair = text('home-b2/repair', 'AAC')
    const price = text('home-b4/price', 'AAE')
    const note = text('home-b3/note', 'AAD')
    const intro = text('home-b1/intro', 'AAB')
    const ops = [at('module-1', intro.trim() ? intro : 'home-b1', 'intro', 'b1')]
    // `fragile`: any probe in the price closes the repair list.
    if (!price.includes('%') && !(fragile && price !== 'QxAAE')) {
      if (repair.includes('<i '))
        throw Object.assign(new Error('markup in a repair paragraph'), { code: 'markup_forbidden' })
      ops.push(at('module-2', repair, 'repair', 'b2'))
    }
    ops.push(at('module-3', strip && note.includes('{') ? note.replace(/^Qx\w+\s*/, '') : note, 'note', 'b3'))
    ops.push(at('module-4', price === '0' ? '((p))0((/p))' : price, 'price', 'b4'))
    return Promise.resolve({ writePlan: { ops }, order, gaps: [] })
  }

/** A site that keeps every write; its pages are not read. */
const siteOf = () => ({
  writes: 0,
  reset: async () => {},
  async write() {
    this.writes += 1
    return { report: { status: 'done' }, record: {} }
  },
  pages: async () => [],
  fetch: async () => ({ status: 200, html: '' })
})

const rowsOf = (result, status) => result.ledger.filter((r) => r.status === status)

test('D2: a normalized probe is a result with what the build wrote, a dropped one is tried again, and it passes', async () => {
  const site = siteOf()
  const result = await writeSafety({
    build: buildOf(),
    site,
    probes: pick('empty', 'format-tokens', 'number-zero', 'emailcloak'),
    limits: { ...LIMITS, steps: 0 }
  })
  assert.equal(rowsOf(result, 'not_written').length, 0, 'no pair stays not written')
  const normalized = rowsOf(result, 'normalized_by_build')
  const intro = normalized.find((r) => r.place === 'writer:home/home-b1/intro' && r.probe === 'empty')
  assert.deepEqual(intro.wrote, [{ op: 'module-1', value: 'home-b1' }], 'the value the build wrote')
  const price = normalized.find((r) => r.place === 'writer:home/home-b4/price' && r.probe === 'number-zero')
  assert.deepEqual(price.wrote, [{ op: 'module-4', value: '((p))0((/p))' }])
  // The empty repair paragraph was dropped by the price's format tokens in the first pass, then written in a later one.
  const repair = result.ledger.find((r) => r.place === 'writer:home/home-b2/repair' && r.probe === 'empty')
  assert.equal(repair.status, 'written')
  assert.ok(repair.pass > 1)
  assert.deepEqual(result.deferred, [{ place: 'writer:home/home-b2/repair', probe: 'empty', times: 1 }])
  assert.equal(result.missing.length, 0)
  assert.equal(result.status, 'passed', JSON.stringify({ why: result.incomplete, f: result.findings }))
})

test('D2: a normalized value that still holds the code fails, and a probe refused alone is a finding', async () => {
  const result = await writeSafety({
    build: buildOf({ strip: true }),
    site: siteOf(),
    probes: pick('format-tokens', 'tag', 'emailcloak'),
    limits: { ...LIMITS, steps: 0 }
  })
  const unsafe = result.findings.filter((f) => f.kind === 'normalized_unsafe')
  assert.deepEqual(
    unsafe.map((f) => [f.place, f.probe, f.evidence]),
    [['writer:home/home-b3/note', 'emailcloak', 'built_alone']]
  )
  assert.deepEqual(unsafe[0].wrote, [{ op: 'module-3', value: '{emailcloak=off}' }])
  // The repair paragraph's tag was dropped with its item in the pass, and refused when built alone.
  const refused = result.findings.find(
    (f) => f.place === 'writer:home/home-b2/repair' && f.probe === 'tag' && f.evidence === 'built_alone'
  )
  assert.ok(refused, JSON.stringify(result.findings))
  assert.equal(refused.kind, 'refused_by_build')
  assert.equal(refused.code, 'markup_forbidden')
  assert.equal(rowsOf(result, 'not_written').length, 0)
  assert.equal(result.status, 'failed')
})

test('D2: a pair dropped again finds the probe that drops it in memory and keeps its own in that pass', async () => {
  const result = await writeSafety({
    build: buildOf({ fragile: true }),
    site: siteOf(),
    probes: pick('format-tokens', 'emailcloak'),
    limits: { ...LIMITS, steps: 0 }
  })
  const repair = result.ledger.filter((r) => r.place === 'writer:home/home-b2/repair')
  assert.deepEqual(repair.map((r) => [r.probe, r.status]).sort(), [
    ['emailcloak', 'written'],
    ['format-tokens', 'written']
  ])
  // The second time the format tokens were dropped, the price's probe was found by builds in memory and waited.
  const price = result.deferred.find((d) => d.place === 'writer:home/home-b4/price')
  assert.ok(price && price.times >= 1, JSON.stringify(result.deferred))
  assert.equal(result.missing.length, 0)
  assert.equal(result.status, 'passed', JSON.stringify({ why: result.incomplete, f: result.findings }))
})
