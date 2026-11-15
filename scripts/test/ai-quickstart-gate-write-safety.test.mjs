// Write safety of the release gate (ticket #586) on the invented florist kit and a site in memory: probes packed into
// passes, each pass written on a fresh site, a refusal or an error traced to the one field that caused it, a value a
// page prints as a live element found, and the ledger complete. Product decisions 1 and 2: a live element and a door
// refusal fail; a refusal by the build's own guard is recorded only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { JOOMLA_PROBES } from '../ai-quickstart/gate/adapters/joomla-probes.mjs'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { LIMITS, writeSafety } from '../ai-quickstart/gate/write-safety.mjs'
import { applies } from '../ai-quickstart/gate/write-probes.mjs'
import { PROBE_CATALOGUE } from '../ai-quickstart/gate/write-probes-edge.mjs'
import { floristKit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'
import { memorySiteOf } from './fixtures/ai-quickstart-gate/memory-site.mjs'

const icons = { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] }
const PROBES = [...PROBE_CATALOGUE, ...JOOMLA_PROBES]
// The kit declares how its module settings print, as a real kit's mapping does (`escapes`, #597): printed as stored,
// so the build escapes the quotes itself (`&quot;`) and a template that decodes them prints a live attribute. A kit
// with no declaration gets the strict guard and typographic quotes, which no quote probe gets past.
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
const only = (findings, kind) => findings.filter((f) => f.kind === kind)
const hero = (call) => call.kind === 'module' && call.fields?.title === 'hero-home'

test('a door answering a server error on one marker-like value in one field is named exactly', async () => {
  const { result } = await measure({
    door: (call) =>
      hero(call) && String(call.fields.params).includes('{loadposition') ? 'server_error' : null
  })
  assert.equal(result.status, 'failed')
  const [error, ...more] = only(result.findings, 'server_error')
  assert.equal(more.length, 0)
  assert.deepEqual(
    {
      probe: error.probe,
      page: error.page,
      block: error.block,
      storeBlock: error.storeBlock,
      field: error.field,
      location: error.location,
      code: error.code,
      cause: error.cause
    },
    {
      probe: 'loadposition',
      page: 'home',
      block: 'home-b3',
      storeBlock: 'hero-home',
      field: 'heading',
      location: {
        op: 'copy:site.hero-home',
        entity: 'module-3',
        column: 'params',
        path: null,
        slot: 'module-3.1'
      },
      code: 'redo_failed',
      cause: 'server_error'
    }
  )
  // The finding names the field, never the value written.
  assert.doesNotMatch(JSON.stringify(error), /\{loadposition/)
  // Every other probe at that place and every probe elsewhere was written.
  assert.deepEqual(result.missing, [])
})

test('a page answering a server error is traced through its blocks to the one field', async () => {
  const { result, site } = await measure({
    pageFails: (html) => /data-m="hero-home" data-v="[^"]*\{loadposition/.test(html)
  })
  assert.deepEqual(
    only(result.findings, 'server_error').map((f) => [
      f.probe,
      f.storeBlock,
      f.field,
      f.location.slot,
      f.code
    ]),
    [['loadposition', 'hero-home', 'heading', 'module-3.1', 'page']]
  )
  assert.ok(result.steps > 0, 'bisection took steps')
  assert.ok(site.counts.resets > result.passes.length, 'every pass and trial ran on a fresh site')
  assert.deepEqual(result.missing, [])
})

test('a door refusal is classed apart from a refusal by the build guard, and only the door refusal fails', async () => {
  const footer = (call) => call.kind === 'module' && call.fields?.title === 'footer-main'
  const { result } = await measure({
    door: (call) =>
      footer(call) && String(call.fields.params).includes('&quot;') ? 'SLOT_VALUE_REFUSED' : null
  })
  const refused = only(result.findings, 'door_refused')
  assert.deepEqual(
    refused.map((f) => [f.probe, f.storeBlock, f.field, f.cause]),
    [['double-quote', 'footer-main', 'copyright', 'SLOT_VALUE_REFUSED']]
  )
  const guarded = only(result.findings, 'refused_by_build')
  assert.ok(guarded.some((f) => f.probe === 'tag' && f.code === 'page_copy_check'))
  assert.ok(guarded.every((f) => f.code === 'page_copy_check' && f.problems.length))
  assert.equal(result.status, 'failed')
  // With the same build guards and no door refusal, the guards alone pass.
  const clean = await measure()
  assert.ok(only(clean.result.findings, 'refused_by_build').length > 0)
  assert.equal(clean.result.status, 'passed')
})

test('a value a page prints as a live element is markup_injected', async () => {
  // A template that decodes the stored quotes before it prints the value.
  const { result } = await measure({ decode: true })
  const injected = only(result.findings, 'markup_injected')
  assert.ok(injected.some((f) => f.probe === 'double-quote' && f.element.startsWith('qx')))
  assert.equal(result.status, 'failed')
})

test('the packing ledger shows every applicable probe reached every place', async () => {
  const { result } = await measure()
  assert.equal(result.status, 'passed')
  assert.deepEqual(result.missing, [])
  assert.ok(result.places.probed >= 4)
  assert.equal(result.places.tested, result.places.probed)
  assert.ok(result.passes.length <= LIMITS.passes)
  const rows = new Set(result.ledger.map((r) => r.place + '|' + r.probe))
  const places = [...new Set(result.ledger.map((r) => r.place))]
  for (const place of places)
    for (const probe of PROBES.filter((p) => p.types.includes('text')))
      if (applies({ type: 'text', limit: 30, base: 'QxAAA', code: 'AAA' }, probe))
        assert.ok(rows.has(place + '|' + probe.id), place + ' ' + probe.id)
  // A pass carries several probes at once, one per place.
  assert.ok(result.passes.every((p) => p.probed > 1))
})

test('a spent budget is incomplete, never passed', async () => {
  const short = await measure({}, { limits: { passes: 2, steps: 40, minutes: 30, reruns: 5 } })
  assert.equal(short.result.status, 'incomplete')
  assert.equal(short.result.incomplete, 'passes')
  assert.ok(short.result.missing.length > 0)
  // A page error the bisection has no step left for: the field stays unnamed and the measurement says so. The page
  // broke all the same, so the measurement fails (review 4 X4), with the untraced page as its finding.
  const spent = await measure(
    { pageFails: (html) => /data-m="hero-home" data-v="[^"]*\{loadposition/.test(html) },
    { limits: { ...LIMITS, steps: 0 } }
  )
  assert.equal(spent.result.status, 'failed')
  assert.equal(spent.result.incomplete, 'steps')
  assert.deepEqual(
    spent.result.findings.filter((f) => f.kind === 'page_not_traced').map((f) => [f.culprit, f.why]),
    [['not_traced', 'steps']]
  )
  let t = 0
  const late = await measure({}, { now: () => (t += 20 * 60000) })
  assert.equal(late.result.status, 'incomplete')
  assert.equal(late.result.incomplete, 'time')
})

test('a site with no reset hook is not_run', async () => {
  const { result, site } = await measure({ reset: false })
  assert.deepEqual(result, { status: 'not_run', reason: 'no_reset_hook' })
  assert.equal(site.counts.writes, 0)
})

test('a door refusing a whole value probe (no marker left in it) is still traced to its field', async () => {
  const footer = (call) => call.kind === 'module' && call.fields?.title === 'footer-main'
  const { result } = await measure({
    door: (call) =>
      footer(call) && /(^|[^0-9a-z])NaN([^0-9a-z]|$)/.test(String(call.fields.params))
        ? 'SLOT_VALUE_REFUSED'
        : null
  })
  const refused = only(result.findings, 'door_refused')
  assert.deepEqual(
    refused.map((f) => [f.probe, f.storeBlock, f.cause]),
    [['number-nan', 'footer-main', 'SLOT_VALUE_REFUSED']]
  )
  assert.equal(result.status, 'failed')
})
