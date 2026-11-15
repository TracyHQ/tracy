// Every stop write safety meets on the site ends in a finding (ticket #586, review 4 X4), on the invented florist kit
// and a site in memory: a stop the site step limit leaves untraced is recorded with its operation and code, its suspects
// are set aside as untested with that reason, and the pass goes on so a second stop is met and recorded too; a stop
// that names the slot it refused narrows the search to the one place stored there, with no site step.
import assert from 'node:assert/strict'
import test from 'node:test'
import { JOOMLA_PROBES } from '../ai-quickstart/gate/adapters/joomla-probes.mjs'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { LIMITS, writeSafety } from '../ai-quickstart/gate/write-safety.mjs'
import { PROBE_CATALOGUE } from '../ai-quickstart/gate/write-probes-edge.mjs'
import { floristKit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'
import { memorySiteOf } from './fixtures/ai-quickstart-gate/memory-site.mjs'

const icons = { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] }
const PROBES = [...PROBE_CATALOGUE, ...JOOMLA_PROBES]
const ESCAPES = {
  why: 'module settings print as stored',
  places: [
    {
      match: { kind: 'module', column: 'params' },
      escaped: false,
      source: 'decision',
      why: 'the invented template prints its module settings as stored'
    }
  ]
}
const measure = (faults = {}, extra = {}) => {
  const kit = floristKit()
  kit.mapping.escapes = ESCAPES
  const site = memorySiteOf(kit, faults)
  const build = (options) =>
    markerBuild(kit, { iconLibrary: icons, tryWrite: memoryTryWrite(kit), ...options })
  return writeSafety({ build, site, probes: PROBES, ...extra }).then((result) => ({ result, site }))
}
const block = (title) => (call) => call.kind === 'module' && call.fields?.title === title
const hero = block('hero-home')
const footer = block('footer-main')

test('X4: two stops in one pass are both findings, each named by the one place its operation stores', async () => {
  const { result } = await measure(
    {
      door: (call) =>
        hero(call) && String(call.fields.params).includes('{loadposition')
          ? 'server_error'
          : footer(call) && String(call.fields.params).includes('&quot;')
            ? 'SLOT_VALUE_REFUSED'
            : null
    },
    { limits: { ...LIMITS, steps: 0 } }
  )
  // The invented kit stores one probed place per operation: a stop names it with no site step.
  assert.deepEqual(
    result.findings
      .filter((f) => ['server_error', 'door_refused'].includes(f.kind))
      .map((f) => [f.kind, f.location.op, f.field, f.evidence])
      .sort(),
    [
      ['door_refused', 'copy:site.footer-main', 'copyright', 'named_alone'],
      ['server_error', 'copy:site.hero-home', 'heading', 'named_alone']
    ]
  )
  assert.equal(result.steps, 0)
  assert.equal(result.status, 'failed')
  // Every place ends one way: tested on the site, refused with evidence, or untested with a reason.
  assert.equal(result.ends.tested + result.ends.refused + result.ends.untested.length, result.places.probed)
  assert.ok(result.ends.untested.every((u) => typeof u.why === 'string' && u.why))
  assert.ok(result.ends.tested > 0)
})

test('X4: a stop that names the slot it refused blames the one place stored there, with no site step', async () => {
  const { result } = await measure(
    {
      door: (call) =>
        hero(call) && String(call.fields.params).includes('{loadposition')
          ? { code: 'server_error', details: { slot: 'module-3.1' } }
          : null
    },
    { limits: { ...LIMITS, steps: 0 } }
  )
  const errors = result.findings.filter((f) => f.kind === 'server_error')
  assert.deepEqual(
    errors.map((f) => [f.probe, f.storeBlock, f.field, f.evidence]),
    [['loadposition', 'hero-home', 'heading', 'named_alone']]
  )
  assert.equal(result.steps, 0)
  assert.equal(result.findings.filter((f) => f.kind === 'stop_not_traced').length, 0)
})

// One pass on an invented site whose write stops at two operations that each store two probed places (the first
// article and the second), with no site step left: both stops are recorded, the four suspects set aside, and the rerun
// without them writes the fifth place.
test('X4: a pass meets and records every stop, tracing what its steps allow and setting aside the rest', async () => {
  const { onePass } = await import('../ai-quickstart/gate/write-safety-pass.mjs')
  const { stepBudget } = await import('../ai-quickstart/gate/bisect.mjs')
  const PLACES = { a1: 'article:a', a2: 'article:a', b1: 'article:b', b2: 'article:b', c1: 'article:c' }
  const { codeOf, textMarker } = await import('../ai-quickstart/gate/marker-codec.mjs')
  const codeOfPlace = (k) => codeOf(10 + Object.keys(PLACES).indexOf(k))
  const code = (k) => textMarker(codeOfPlace(k))
  const assignment = new Map(Object.keys(PLACES).map((k) => [k, { id: 'probe-x' }]))
  const planOf = (active) => ({
    ops: Object.entries(PLACES).map(([k, op]) => ({
      key: op + ':' + k,
      values: [{ entry: k, value: code(k) + (active.has(k) ? ' probe' : ''), loc: { column: 'title' } }]
    }))
  })
  const plainIndex = new Map()
  const opOf = (k) => PLACES[k]
  for (const k of Object.keys(PLACES))
    plainIndex.set(codeOfPlace(k).toUpperCase(), [{ op: opOf(k), entry: k, loc: { column: 'title' } }])
  const attempt = async (active) => {
    const used = new Map(
      [...active].map(([k, p]) => [
        k,
        { code: codeOfPlace(k), probe: p, value: code(k) + ' probe', base: code(k) }
      ])
    )
    const plan = planOf(active)
    // The stored index names the op of each code as the test's operation names (`article:a`).
    for (const op of plan.ops) op.key = op.key.replace(/:[a-z0-9]+$/, '')
    return { opts: { used, refused: new Map() }, built: { writePlan: plan } }
  }
  const writes = []
  const writeOn = async (a) => {
    const keys = [...a.opts.used.keys()]
    writes.push(keys)
    const stopAt = ['article:a', 'article:b'].find((op) => keys.some((k) => PLACES[k] === op))
    return stopAt
      ? { report: { status: 'stopped', code: 'read_back_mismatch', details: { op: stopAt } } }
      : { report: { status: 'done' }, record: {} }
  }
  const findings = []
  const parked = new Map()
  const ledger = { set: (place, probe, e) => findings.push({ ledger: place, ...e }) }
  const out = await onePass(
    1,
    assignment,
    {
      attempt,
      writeOn,
      record: (key, probe, failure) => findings.push({ culprit: key, ...failure }),
      budget: stepBudget(0),
      buildBudget: stepBudget(100),
      plainGaps: new Set(),
      plainIndex,
      late: () => false,
      site: { pages: async () => [], fetch: async () => ({ status: 200, html: '' }) },
      ledger,
      park: (k, why) => parked.set(k, why),
      untraced: (stop) => findings.push({ untraced: stop.op, suspects: stop.suspects, kind: stop.kind })
    },
    { reruns: 5 }
  )
  assert.deepEqual(
    findings.filter((f) => f.untraced).map((f) => [f.kind, f.untraced, f.suspects]),
    [
      ['stop_not_traced', 'article:a', ['a1', 'a2']],
      ['stop_not_traced', 'article:b', ['b1', 'b2']]
    ]
  )
  assert.deepEqual([...parked.keys()].sort(), ['a1', 'a2', 'b1', 'b2'])
  assert.equal(parked.get('a1').why, 'suspect_of_untraced_stop')
  // Three writes: the pass, the rerun without the first suspects, the rerun without the second; the last is written.
  assert.deepEqual(writes.at(-1), ['c1'])
  assert.equal(out.incomplete, 'steps')
  assert.deepEqual(
    findings.filter((f) => f.ledger).map((f) => f.ledger),
    ['c1']
  )
})
