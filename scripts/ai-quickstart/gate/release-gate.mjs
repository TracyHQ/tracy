// The release gate as one run (tickets #585 and #586): every measurement in its order on one site, then the check
// record, its review page and the kit's verdict file. The order:
//   1 secrets           the files to publish, with the scan's negative control
//   2 human control     the untouched human quickstart: the demo scan's control and the quality baseline
//   3 marker test       the marker build written on the site, every page rendered and read (`run-gate.mjs`)
//   4 structure full    the marker site's pages and links, its blocks at their most items
//   5 quality           the site check's page groups against the control, and the SEO items of the renders
//   6 structure hidden  the marker site's pages hidden in two halves, then published again
//   7 structure minimum the site reset, the build at every block's least items
//   8 write safety      the plain write, then the probe passes, each on a reset site
//   9 crops             the crop of each finding group the page shows
//  10 the record        scanned by the secret rules until what is written is what was read (`release-gate-files.mjs`)
// The site, the renderer, the reset and each scan are injected: `gate.mjs` gives real ones (`site-session.mjs`), the
// unit test the invented florist kit on a memory site. A phase that throws is `incomplete` with its reason and the
// later phases still run where they can. With no reset hook the minimum variant and write safety are `not_run`, so the
// verdict cannot pass. The controls carry their provenance into the binding (`control-file.mjs`). The template is no
// input: nothing here names one.
import { createHash } from 'node:crypto'
import { measuredInRun } from './control-file.mjs'
import { markerBuild } from './marker-plan.mjs'
import { qualityPhase } from './release-gate-quality.mjs'
import { GATE_VERSION, kitFilesSha256 } from './record.mjs'
import { withMeasurements } from './record-measured.mjs'
import { scannedRecord, writeRecordFiles } from './release-gate-files.mjs'
import { emptyRecord } from './release-gate-record.mjs'
import { runGate } from './run-gate.mjs'
import { hiddenVariant, readVariant, structureStatusOf, variant, without } from './structure.mjs'
import { verdictFileOf } from './release-binding.mjs'
import { writeSafety } from './write-safety.mjs'

const failedPhase = (error) => ({
  status: 'incomplete',
  reason: String(error?.code ?? 'phase_failed'),
  message: String(error?.message ?? error).slice(0, 400)
})

/** A timed phase: its result, or `incomplete` with the reason when it throws. */
function phaser(phases, log, now) {
  return async (name, fn) => {
    const began = now()
    let result
    try {
      result = await fn()
    } catch (error) {
      result = failedPhase(error)
    }
    const seconds = Math.round((now() - began) / 100) / 10
    phases.push({ phase: name, status: result?.status ?? 'done', seconds })
    log('phase ' + name + ': ' + (result?.status ?? 'done') + ' in ' + seconds + ' s')
    return result
  }
}

/** The structure measurement as the record keeps it: all three variants decide (ADR 0045 section 3). */
const structureOf = (full, hidden, minimum) => ({
  status: structureStatusOf(full, minimum, hidden),
  linkCheck: without(full),
  minItems: without(minimum),
  hidden
})

/** The key a write safety state is resumed under: what the passes were measured on. */
const stateKeyOf = (input, probes) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        GATE_VERSION,
        input.kit.ref ?? null,
        kitFilesSha256(input.kitHashes),
        input.inputs?.blankSite?.sha256 ?? null,
        input.pin ?? null,
        probes.map((p) => p.id)
      ])
    )
    .digest('hex')

/** The provenance of a control: the file it was read from, or this run. */
const provenanceOf = (c, sha) => (c && c.status !== 'not_run' ? (c.provenance ?? measuredInRun(sha)) : null)

/**
 * @param {object} input the inputs of `runGate` (kit, archive, adapter, iconLibrary, tryWrite, corpus, widths, themes,
 *   refusals, kitHashes, inputs), plus `site` (`{origin, write, pages, fetch, hide?, show?, off?, back?,
 *   siteValues?}`), `render(pages)`, `reset` (null: no reset hook), `secrets()`, `control()` (`{human, quality}`),
 *   `quality(paths)` (the page groups on the marker site), `pageKey(html)` (the adapter's page key), `baseline`,
 *   `probes`, `demoRoutes`, `pageIdentity(html)` (the adapter's: which page a page is), `limits`, `writeSafetyState`, `pin`, `scanRecord(files)` (every secret rule set on the
 *   record's own files), `decorate(record)` (the crops), `out`, `log`, `now`
 * @returns {Promise<{record: object, verdictFile: object, phases: object[]}>}
 */
export async function releaseGate(input) {
  const { kit, site, out, log = () => {}, now = Date.now } = input
  const phases = []
  const phase = phaser(phases, log, now)
  const startedAt = new Date().toISOString()
  const build = (options) =>
    markerBuild(kit, { iconLibrary: input.iconLibrary, tryWrite: input.tryWrite, ...options })
  const reset = input.reset ?? null
  const ctx = {
    site,
    kit,
    base: site.origin + '/',
    demoRoutes: input.demoRoutes ?? [],
    identify: input.pageIdentity ?? null
  }
  const humanSha = input.inputs?.humanQuickstart?.sha256 ?? null

  const secrets = input.secrets ? await phase('secrets', input.secrets) : { status: 'not_run' }
  const control = input.control
    ? await phase('human control', async () => ({ status: 'done', ...(await input.control()) }))
    : {}
  const inputs = {
    ...input.inputs,
    controls: {
      human: provenanceOf(control.human, humanSha),
      quality: provenanceOf(control.quality, humanSha)
    }
  }
  const human = control.human ? { ...control.human, provenance: inputs.controls.human } : null
  const state = {}
  const gate = await phase('marker test', async () => {
    const result = await runGate({
      ...input,
      inputs,
      controls: async () => ({ human: human ?? { status: 'not_run', findings: null }, blank: control.blank }),
      site: async ({ built }) => {
        const real = await site.write(built)
        const pages = await site.pages(built, real.record)
        Object.assign(state, { built, real, pages })
        const siteValues = site.siteValues ? await site.siteValues(real) : new Map()
        return { origin: site.origin, real, pages, siteValues }
      },
      render: input.render
    })
    return { status: result.record?.measurements?.markerTest?.status ?? 'incomplete', result }
  })
  const marker = gate.result ?? null

  const full = await phase('structure full', async () => {
    if (!state.built) return { status: 'incomplete', variant: 'full', reason: 'marker_test_not_written' }
    return readVariant('full', ctx, { built: state.built, written: state.real })
  })
  const quality = await phase('quality', async () =>
    qualityPhase({ input, marker, state, site, control: control.quality })
  )
  const hidden = await phase('structure hidden', async () => hiddenVariant(full, ctx))
  const minimum = await phase('structure minimum', async () => {
    if (!reset) return { status: 'not_run', variant: 'minimum', reason: 'no_reset_hook' }
    await reset()
    return variant('minimum', { ...ctx, build, shape: 'min' })
  })
  const probes = input.probes ?? []
  const safety = await phase('write safety', () =>
    writeSafety({
      build,
      site: { ...site, reset },
      probes,
      limits: input.limits,
      log,
      plain: state.real ? { report: state.real.report } : null,
      state: input.writeSafetyState ?? null,
      stateKey: stateKeyOf(input, probes),
      universeKeys: marker?.record?.places
        ? marker.record.places.filter((p) => p.account === 'written').map((p) => p.key)
        : null
    })
  )

  const measurements = { writeSafety: safety, structure: structureOf(full, hidden, minimum), quality }
  const base = marker?.record ?? emptyRecord({ ...input, inputs, controls: { human }, startedAt })
  const own = marker?.record
    ? {}
    : { markerTest: { status: 'incomplete', reason: gate.reason, message: gate.message } }
  const make = (s) =>
    withMeasurements(
      base,
      { ...measurements, secrets: s },
      { origin: site.origin, ...own, phases, finishedAt }
    )
  // The crops of the finding groups the page shows, named in the record before it is scanned and written.
  let finishedAt = new Date().toISOString()
  if (input.decorate)
    await phase('crops', async () => ({ status: 'done', ...(await input.decorate(make(secrets))) }))
  finishedAt = new Date().toISOString()
  const decorated = make(secrets)
  const crops = decorated.markerTest?.groups
  const remake = (s) => {
    const r = make(s)
    if (crops && r.markerTest) r.markerTest.groups = crops
    return r
  }
  const record = await scannedRecord(remake, secrets, input.scanRecord ?? null)
  const verdictFile = out ? writeRecordFiles(out, record) : verdictFileOf(record)
  log('record: ' + JSON.stringify(record.verdict.measurements) + ' pass ' + record.verdict.pass)
  return { record, verdictFile, phases, marker }
}
