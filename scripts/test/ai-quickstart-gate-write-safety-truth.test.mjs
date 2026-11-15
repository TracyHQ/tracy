// Write safety says only what it measured (ticket #586, review round 1): a place counts as tested only when a probe
// reached the real site there; a stop is the build's own only when its code is one of the build's named guards; a page
// that does not answer as planned while it holds a probe is a failure; build refusals never spend the site's bisection
// steps; a write the plain build cannot finish names no culprit; a measurement can resume where it stopped; and the
// places the build writes are reconciled with the places write safety probes. The invented florist kit on a memory site.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DraftWriteError } from '../../packages/wo/website-opportunities/domain/draft-write-error.mjs'
import { JOOMLA_PROBES } from '../ai-quickstart/gate/adapters/joomla-probes.mjs'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { LIMITS, writeSafety } from '../ai-quickstart/gate/write-safety.mjs'
import { BUILD_GUARD_CODES, stopClassOf } from '../ai-quickstart/gate/write-safety-judge.mjs'
import { memoryState } from '../ai-quickstart/gate/write-safety-state.mjs'
import { PROBE_CATALOGUE } from '../ai-quickstart/gate/write-probes-edge.mjs'
import { coverageProblems } from '../ai-quickstart/gate/write-safety-coverage.mjs'
import { floristKit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'
import { memorySiteOf } from './fixtures/ai-quickstart-gate/memory-site.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
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
const setup = (faults = {}, wrap = (b) => b) => {
  const kit = floristKit()
  kit.mapping.escapes = ESCAPES
  const site = memorySiteOf(kit, faults)
  const build = wrap((options) =>
    markerBuild(kit, { iconLibrary: icons, tryWrite: memoryTryWrite(kit), ...options })
  )
  return { kit, site, build }
}
const measure = (faults = {}, extra = {}, wrap) => {
  const { site, build } = setup(faults, wrap)
  return writeSafety({ build, site, probes: PROBES, ...extra }).then((result) => ({ result, site }))
}
const hero = (call) => call.kind === 'module' && call.fields?.title === 'hero-home'
const only = (findings, kind) => findings.filter((f) => f.kind === kind)

test('a stop is the build own only when its code is one of the build named guards', () => {
  const of = (code, cause) => stopClassOf({ code, details: { op: 'copy:site.hero', cause } }).kind
  assert.equal(of('no_answer', null), 'site_unreachable')
  assert.equal(of(null, null), 'server_error')
  assert.equal(of('write_failed', null), 'server_error')
  assert.equal(of('some_code_nobody_knows', null), 'server_error')
  assert.equal(of('redo_failed', 'no_answer'), 'site_unreachable')
  assert.equal(of('redo_failed', null), 'server_error')
  assert.equal(of('markup_forbidden', null), 'refused_by_build')
  assert.equal(of('record_kind_unsupported', null), 'refused_by_build')
  assert.ok(!BUILD_GUARD_CODES.has('redo_failed') && !BUILD_GUARD_CODES.has('read_back_mismatch'))
})

test('every code the build team draft write throws or reports is a known build guard', () => {
  const dir = path.join(ROOT, 'packages/wo/website-opportunities/domain')
  const codes = new Set()
  for (const name of readdirSync(dir).filter((n) => /^draft-write-.*\.mjs$/.test(n))) {
    const text = readFileSync(path.join(dir, name), 'utf8')
    for (const m of text.matchAll(/new DraftWriteError\(\s*'([a-z_]+)'/g)) codes.add(m[1])
    for (const m of text.matchAll(/report\('([a-z_]+)'/g)) codes.add(m[1])
  }
  assert.ok(codes.size > 10, 'the scan found the codes')
  const unknown = [...codes].filter((c) => !BUILD_GUARD_CODES.has(c))
  assert.deepEqual(unknown, [], 'add the new guard code to the list, or class it as a site failure')
})

test('no probe at all is incomplete, never passed', async () => {
  const { site, build } = setup()
  const result = await writeSafety({ build, site, probes: [] })
  assert.equal(result.status, 'incomplete')
  assert.equal(result.incomplete, 'no_probes')
})

test('a place where every probe was refused by the build is not tested on the site', async () => {
  // The tag probe is refused by the page writer copy check everywhere: no probe reaches the site.
  const { site, build } = setup()
  const tag = PROBES.filter((p) => p.id === 'tag')
  const result = await writeSafety({ build, site, probes: tag })
  assert.equal(result.places.tested, 0)
  assert.ok(result.places.probed > 0)
  assert.equal(result.status, 'incomplete')
  assert.equal(result.incomplete, 'not_site_tested')
  assert.ok(result.notSiteTested.length > 0)
})

test('a page answering 404 or no answer while it holds a probe fails and names the field', async () => {
  const holds = (html) => /data-m="hero-home" data-v="[^"]*\{loadposition/.test(html)
  for (const [status, kind] of [
    [404, 'server_error'],
    [0, 'site_unreachable']
  ]) {
    const { result } = await measure({ pageStatus: (html) => (holds(html) ? status : null) })
    assert.equal(result.status, 'failed', 'status ' + status)
    const [f, ...more] = only(result.findings, kind)
    assert.equal(more.length, 0)
    assert.deepEqual([f.probe, f.storeBlock, f.field], ['loadposition', 'hero-home', 'heading'])
  }
})

test('a door that drops the connection on one value fails and names the field', async () => {
  const { result } = await measure({
    door: (call) => (hero(call) && String(call.fields.params).includes('{loadposition') ? 'no_answer' : null)
  })
  assert.equal(result.status, 'failed')
  const found = only(result.findings, 'site_unreachable')
  assert.deepEqual(
    found.map((f) => [f.probe, f.storeBlock, f.field]),
    [['loadposition', 'hero-home', 'heading']]
  )
})

test('a plain build the site cannot write names no culprit: the measurement is incomplete', async () => {
  const { result } = await measure({ door: (call) => (hero(call) ? 'SLOT_VALUE_REFUSED' : null) })
  assert.equal(result.status, 'incomplete')
  assert.equal(result.incomplete, 'plain_write_stopped')
  assert.deepEqual(result.findings, [])
  assert.equal(result.steps, 0)
})

test('a build refusal that names its place costs no site step', async () => {
  // A build guard that refuses the email cloak code at the hero heading, naming the place as the build team guards do.
  const wrap = (build) => async (options) => {
    const built = await build(options)
    for (const op of built.writePlan?.ops ?? [])
      for (const v of op.values ?? [])
        if (String(v.value).includes('{emailcloak') && String(v.entry).includes('home-b3'))
          throw new DraftWriteError('markup_forbidden', '1 problem(s) before any door call', {
            problems: [
              {
                code: 'markup_forbidden',
                op: op.key,
                entity: v.loc?.entity,
                slot: v.loc?.slot,
                entry: v.entry
              }
            ]
          })
    return built
  }
  const { result } = await measure({}, { limits: { ...LIMITS, steps: 0 } }, wrap)
  const guarded = only(result.findings, 'refused_by_build').filter((f) => f.code === 'markup_forbidden')
  assert.deepEqual(
    guarded.map((f) => [f.probe, f.storeBlock, f.field]),
    [['emailcloak', 'hero-home', 'heading']]
  )
  assert.equal(result.steps, 0, 'no site step')
  assert.ok(result.buildSteps >= 1, 'the build trial is counted apart')
  assert.equal(result.status, 'passed')
})

test('a measurement stopped by its limits resumes where it stopped', async () => {
  const state = memoryState()
  const first = await measure({}, { limits: { ...LIMITS, passes: 2 }, state, stateKey: 'k1' })
  assert.equal(first.result.status, 'incomplete')
  assert.equal(first.result.incomplete, 'passes')
  const second = await measure({}, { state, stateKey: 'k1' })
  assert.equal(second.result.status, 'passed')
  assert.equal(second.result.passes[0].pass, 1, 'the earlier passes are kept')
  assert.ok(second.result.resumedFrom === 2)
  // A state of another key (another kit, plugin or gate version) is never resumed.
  const other = await measure({}, { limits: { ...LIMITS, passes: 2 }, state, stateKey: 'k2' })
  assert.equal(other.result.resumedFrom, undefined)
})

test('the places the build writes are reconciled with the places probed, each one with its reason', async () => {
  const universeKeys = Array.from({ length: 7 }, (_, i) => 'example:place:' + i)
  const { result } = await measure({}, { universeKeys })
  const c = result.coverage
  assert.equal(typeof c.locations, 'number')
  const notProbed = Object.values(c.notProbed).reduce((a, b) => a + b, 0)
  assert.equal(c.probed + notProbed, c.locations)
  assert.equal(c.universeWritten, 7)
  assert.equal(c.inBoth + c.onlyInUniverse, 7)
  assert.ok(c.probed > 0)
  assert.deepEqual(coverageProblems(c), [])
})
