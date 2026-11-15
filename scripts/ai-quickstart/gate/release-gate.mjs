// The release gate as one run (tickets #585 and #586): every measurement in its order on one site, then the check
// record, its review page and the kit's verdict file. The order:
//   1 secrets           the files to publish, with the scan's negative control
//   2 human control     the untouched human quickstart: the demo scan's control and the quality baseline
//   3 marker test       the marker build written on the site, every page rendered and read (`run-gate.mjs`)
//   4 structure full    the marker site's pages and links (the marker build is the full variant)
//   5 quality           the site check's page groups against the control, and the SEO items of the renders
//   6 structure hidden  the marker site's pages hidden in two halves, then published again (recorded only)
//   7 structure minimum the site reset, the build at every block's least items
//   8 write safety      the probe passes, each on a reset site
//   9 the record        `record.json`, `record.html`, `check-record/record.json` and `check-record/verdict.json`
// The site, the renderer, the reset and each scan are injected: `gate.mjs` gives real ones (`site-session.mjs`), the
// unit test the invented florist kit on a memory site. A phase that throws is `incomplete` with its reason and the
// later phases still run where they can. With no reset hook the minimum variant and write safety are `not_run`, so the
// verdict cannot pass. The template is no input: nothing here names one.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { markerBuild } from './marker-plan.mjs'
import { qualityOf } from './quality.mjs'
import { faviconsOf, seoOf } from './quality-seo.mjs'
import { withMeasurements } from './record-measured.mjs'
import { recordHtml } from './record-html.mjs'
import { recordText, verdictFileOf } from './release-binding.mjs'
import { emptyRecord } from './release-gate-record.mjs'
import { runGate } from './run-gate.mjs'
import { hiddenVariant, readVariant, structureStatusOf, variant, without } from './structure.mjs'
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

/** The structure measurement as the record keeps it: the link check is the full variant, the minimum items the least. */
const structureOf = (full, hidden, minimum) => ({
  status: structureStatusOf(full, minimum),
  linkCheck: without(full),
  minItems: without(minimum),
  hidden
})

/**
 * @param {object} input the inputs of `runGate` (kit, archive, adapter, iconLibrary, tryWrite, corpus, widths, themes,
 *   refusals, kitHashes, inputs), plus `site` (`{origin, write, pages, fetch, hide?, show?, off?, back?,
 *   siteValues?}`), `render(pages)`, `reset` (null: no reset hook), `secrets()`, `control()` (`{human, quality}`),
 *   `quality(paths)` (the page groups on the marker site), `baseline` (the demo measures file), `probes`,
 *   `demoRoutes`, `limits`, `scanRecord(files)` (the secret rules on the record's own files), `decorate(record)` (the
 *   last change before the files are written), `out`, `log`, `now`
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
  const ctx = { site, kit, base: site.origin + '/', demoRoutes: input.demoRoutes ?? [] }

  const secrets = input.secrets ? await phase('secrets', input.secrets) : { status: 'not_run' }
  const control = input.control
    ? await phase('human control', async () => ({ status: 'done', ...(await input.control()) }))
    : {}
  const state = {}
  const gate = await phase('marker test', async () => {
    const result = await runGate({
      ...input,
      controls: async () => ({
        human: control.human ?? { status: 'not_run', findings: null },
        blank: control.blank
      }),
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
  const quality = await phase('quality', async () => {
    if (!marker?.renders) return { status: 'incomplete', reason: 'marker_test_not_rendered' }
    const icons = faviconsOf(marker.renders, site.origin)
    const favicons = new Map()
    for (const url of icons) favicons.set(url, (await site.fetch(url)).status)
    const seo = seoOf(marker.renders, { origin: site.origin, favicons })
    if (!input.quality) return { ...qualityOf({ marker: { groups: [] }, seo }), reason: 'no_page_reader' }
    const paths = [...new Set(state.pages.map((p) => '/' + String(p.path ?? '').replace(/^\/+/, '')))]
    const measured = await input.quality(paths)
    return qualityOf({ marker: measured, control: control.quality, baseline: input.baseline ?? null, seo })
  })
  const hidden = await phase('structure hidden', async () =>
    full.state && site.hide && site.show
      ? hiddenVariant(full, ctx)
      : { status: 'not_run', variant: 'hidden', reason: full.state ? 'no_hide_door' : 'full_not_written' }
  )
  const minimum = await phase('structure minimum', async () => {
    if (!reset) return { status: 'not_run', variant: 'minimum', reason: 'no_reset_hook' }
    await reset()
    return variant('minimum', { ...ctx, build, shape: 'min' })
  })
  const safety = await phase('write safety', () =>
    writeSafety({ build, site: { ...site, reset }, probes: input.probes ?? [], limits: input.limits, log })
  )

  const measurements = {
    writeSafety: safety,
    structure: structureOf(full, hidden, minimum),
    quality,
    secrets
  }
  const base = marker?.record ?? emptyRecord({ ...input, controls: { human: control.human }, startedAt })
  const own = marker?.record
    ? {}
    : { markerTest: { status: 'incomplete', reason: gate.reason, message: gate.message } }
  let record = withMeasurements(base, measurements, { origin: site.origin, ...own, phases })
  // The record's own files are published too: the secret rules read them before they are written.
  if (input.scanRecord) {
    const found = input.scanRecord([
      { name: 'check-record/record.json', text: recordText(record) },
      { name: 'check-record/record.html', text: recordHtml(record) }
    ])
    if (found.length) {
      const failed = { ...secrets, status: 'failed', findings: [...(secrets.findings ?? []), ...found] }
      record = withMeasurements(
        base,
        { ...measurements, secrets: failed },
        { origin: site.origin, ...own, phases }
      )
    }
  }
  // The caller's last touch before the files are written (the crops of the finding groups the page shows).
  if (input.decorate) await input.decorate(record)
  const verdictFile = verdictFileOf(record)
  if (out) {
    mkdirSync(path.join(out, 'check-record'), { recursive: true })
    writeFileSync(path.join(out, 'record.json'), recordText(record))
    writeFileSync(path.join(out, 'record.html'), recordHtml(record))
    writeFileSync(path.join(out, 'check-record', 'record.json'), recordText(record))
    writeFileSync(path.join(out, 'check-record', 'verdict.json'), JSON.stringify(verdictFile, null, 1) + '\n')
  }
  log('record: ' + JSON.stringify(record.verdict.measurements) + ' pass ' + record.verdict.pass)
  return { record, verdictFile, phases, marker }
}
