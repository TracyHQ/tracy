// A build that throws a code no guard names stops the measurement from passing (ticket #586, review 4 X9). The
// invented florist kit's build throws an unknown code whenever one probe is in the pass: the measurement records the
// place as `unclassified` and ends `incomplete: unclassified_stop`, never `passed`. A site stop with a code the gate
// does not know is classed `server_error` (it fails), so `unclassified_stop` is a build refusal only, by design.
import assert from 'node:assert/strict'
import test from 'node:test'
import { JOOMLA_PROBES } from '../ai-quickstart/gate/adapters/joomla-probes.mjs'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { stopClassOf } from '../ai-quickstart/gate/write-safety-judge.mjs'
import { writeSafety } from '../ai-quickstart/gate/write-safety.mjs'
import { PROBE_CATALOGUE } from '../ai-quickstart/gate/write-probes-edge.mjs'
import { floristKit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'
import { memorySiteOf } from './fixtures/ai-quickstart-gate/memory-site.mjs'

const icons = { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] }

test('X9: a build throwing a code no guard names ends the measurement unclassified_stop, with the place named', async () => {
  const kit = floristKit()
  const site = memorySiteOf(kit, {})
  // The build throws as soon as it writes a value the `tag` probe made (`<i ...>`).
  const guard = (write) => (f) => {
    const value = write(f)
    if (String(value).includes('<i '))
      throw Object.assign(new Error('an invented guard'), { code: 'invented_guard' })
    return value
  }
  const build = (options) =>
    markerBuild(kit, {
      iconLibrary: icons,
      tryWrite: memoryTryWrite(kit),
      ...options,
      ...(options?.textOf ? { textOf: guard(options.textOf), factOf: guard(options.factOf) } : {})
    })
  const result = await writeSafety({ build, site, probes: [...PROBE_CATALOGUE, ...JOOMLA_PROBES] })
  const odd = result.findings.filter((f) => f.kind === 'unclassified')
  assert.ok(odd.length > 0, 'the unknown throw is a finding')
  // The build wraps the writer's throw as `writer_call_failed`, a code no guard names; the finding names its place.
  assert.ok(odd.every((f) => f.code === 'writer_call_failed' && f.place && f.probe === 'tag'))
  assert.equal(result.status, 'incomplete')
  assert.equal(result.incomplete, 'unclassified_stop')
})

test('X9: a site stop with a code the gate does not know fails as a server error', () => {
  assert.equal(stopClassOf({ code: 'invented_stop', details: { op: 'module:1' } }).kind, 'server_error')
})
