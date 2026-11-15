// Build refusals are found in memory in one go (ticket #586, run 3): a build whose write order names many refused
// places at once has every one of them recorded and dropped before the site is written, and finding them spends no
// rerun, no site step and no build step. A refusal that names no place is still traced by bisection in memory, its
// builds counted but never limited. The invented florist kit on a memory site.
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
// The invented build refuses every probe it is given, but at the copyright line: there the probes reach the site.
const KEPT_ENTRY = 'home.home-b7.copyright'
const where = (v) => v.entry + '|' + (v.loc?.slot ?? '')

/** The values of the plain build, by entry, to tell a probed value from a plain one. */
async function plainValues(build) {
  const out = new Map()
  for (const op of (await build({})).writePlan?.ops ?? [])
    for (const v of op.values ?? []) if (v.entry) out.set(where(v), String(v.value))
  return out
}

/** A plain marker value: a code and filler words (a field the copy check sent back gets a new code, never a probe). */
const PLAIN_MARKER = /^Qx[A-Z0-9]+(?: q+)*$/

/** The values of a build that carry a probe outside the kept entry. */
const refusedValues = (built, plain) =>
  (built.writePlan?.ops ?? []).flatMap((op) =>
    (op.values ?? []).filter(
      (v) =>
        v.entry &&
        v.entry !== KEPT_ENTRY &&
        plain.has(where(v)) &&
        plain.get(where(v)) !== String(v.value) &&
        !PLAIN_MARKER.test(String(v.value))
    )
  )

/** A build whose write order check lists every refused value at once, as `checkWriteOrder` does. */
const listingAll = (build) => {
  let plain = null
  return async (options) => {
    plain ??= await plainValues(build)
    const built = await build(options)
    const problems = refusedValues(built, plain).map((v) => ({
      code: 'markup_forbidden',
      at: v.entry,
      message: 'invented refusal'
    }))
    return problems.length ? { ...built, orderProblems: problems } : built
  }
}

/** A build that throws on any refused value and names no place. */
const namingNone = (build) => {
  let plain = null
  return async (options) => {
    plain ??= await plainValues(build)
    const built = await build(options)
    if (refusedValues(built, plain).length)
      throw Object.assign(new Error('invented refusal'), { code: 'markup_forbidden' })
    return built
  }
}

const run = async (wrap, limits) => {
  const kit = floristKit()
  kit.mapping.escapes = ESCAPES
  const site = memorySiteOf(kit)
  const build = wrap((options) =>
    markerBuild(kit, { iconLibrary: icons, tryWrite: memoryTryWrite(kit), ...options })
  )
  const result = await writeSafety({ build, site, probes: PROBES, limits: { ...LIMITS, ...limits } })
  return { result, site }
}

const guarded = (result) =>
  result.findings.filter((f) => f.kind === 'refused_by_build' && f.code === 'markup_forbidden')

test('every place a build refuses in memory is recorded and dropped before one write, spending no limit', async () => {
  const { result, site } = await run(listingAll, { reruns: 0, steps: 0, buildSteps: 0 })
  const firstPass = guarded(result).filter((f) => f.pass === 1)
  assert.ok(firstPass.length >= 2, 'one pass records every refusal at once: ' + firstPass.length)
  assert.ok(
    guarded(result).every((f) => f.field !== 'copyright'),
    'the kept place is never blamed'
  )
  assert.notEqual(result.incomplete, 'reruns', 'finding the refusals spends no rerun')
  assert.notEqual(result.incomplete, 'build_steps', 'a refusal that names its place spends no build step')
  assert.equal(result.steps, 0, 'no site step')
  // One write for the plain build and one per pass: no write is spent on a refusal found in memory.
  assert.equal(
    site.counts.writes,
    1 + result.passes.length,
    JSON.stringify([result.status, result.incomplete, result.passes, site.counts])
  )
  assert.ok(
    result.passes.every((p) => p.runs === 1),
    'one site run per pass'
  )
  assert.ok(result.places.tested >= 1, 'the probes left reach the site')
})

test('a refusal that names no place is traced in memory without a limit on its builds', async () => {
  const { result, site } = await run(namingNone, { reruns: 0, steps: 0, buildSteps: 0 })
  assert.ok(guarded(result).length >= 2)
  assert.ok(guarded(result).every((f) => f.field !== 'copyright'))
  assert.notEqual(result.incomplete, 'build_steps')
  assert.notEqual(result.incomplete, 'reruns')
  assert.ok(result.buildSteps > 0, 'the builds are counted')
  assert.equal(
    site.counts.writes,
    1 + result.passes.length,
    JSON.stringify([result.status, result.incomplete, result.passes, site.counts])
  )
  assert.ok(result.places.tested >= 1)
})
