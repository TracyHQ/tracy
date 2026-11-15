// The marker test of the release gate as one function (ticket #585): the marker build and its accounting, the write
// on a site, the renders, the reading of every render, the groups, the demo scan and its controls, and the check
// record. The site, the renderer and the demo scan's controls are injected, so the same function runs on a real site
// with a browser (`gate.mjs`) and on an invented kit with a memory site and no browser (its unit test). The template
// is the only input: nothing here names one.
import { accountFor } from './accounting.mjs'
import { classify } from './classify.mjs'
import { demoChecks } from './demo-checks.mjs'
import { keptKeysOf, keptPlacesOf } from './exemptions.mjs'
import { groupsOf } from './groups.mjs'
import { markerBuild } from './marker-plan.mjs'
import { declareNotSeen } from './not-seen.mjs'
import { checkRecord, splitOf } from './record.mjs'
import { sourceResolver } from './sources.mjs'

/**
 * @param {{kit: object, archive: {files: Map<string, string>, names: string[]}, adapter: {exemptions: Function[],
 *   declaredHosts?: string[]},
 *   iconLibrary: object, tryWrite?: Function, site?: (input: {built: object, log: Function}) => Promise<object>,
 *   render?: (pages: object[]) => Promise<object[]>, controls?: () => Promise<object>, corpus: object,
 *   widths: number[], themes: string[], refusals?: object[], kitHashes?: object, inputs?: object,
 *   measurements?: Record<string, {status: string}>,
 *   log?: (line: string) => void}} input `site` writes the marker plan and answers `{origin, real: {report, record,
 *   plugin}, pages, siteValues}`; `render` renders those pages; `controls` measures the demo scan on the untouched
 *   human quickstart (`human`) and records the blank site before the write (`blank`, not applicable:
 *   `blankControlOf`), and runs before the write
 * @returns {Promise<{built: object, accounting: object, record?: object, renders?: object[], groups?: object[]}>}
 */
export async function runGate(input) {
  const { kit, archive, adapter, corpus, log = () => {} } = input
  const startedAt = new Date().toISOString()
  // 1. The marker build, written first on a memory site: the write step gaps are learnt there.
  const built = await markerBuild(kit, { iconLibrary: input.iconLibrary, tryWrite: input.tryWrite })
  const accounting = accountFor(kit, built)
  log(
    `memory write ${built.written?.report?.status ?? 'none'}: ${built.writePlan?.ops.length ?? 0} operations`
  )
  log(`universe ${JSON.stringify(accounting.counts)}`)
  log(`split ${JSON.stringify(splitOf(accounting.places))}`)
  if (!input.site) return { built, accounting }
  // 2. The demo scan's controls, before anything is written on the site; then the write.
  const controls = input.controls ? await input.controls() : {}
  for (const [name, c] of Object.entries(controls))
    log(`control ${name}: ${c.status}${c.findings == null ? '' : `, ${c.findings} finding(s)`}`)
  const site = await input.site({ built, log })
  // 3. Every page rendered, every render read.
  const renders = await input.render(site.pages)
  // The name a page prints as its author is the account the write made the record as: a value of the site's own
  // records, read where the page itself names it.
  const siteValues = new Map(site.siteValues ?? [])
  for (const r of renders)
    for (const o of r.observations ?? [])
      if (o.place?.element === 'meta[author]' && o.value && !siteValues.has(o.value))
        siteValues.set(o.value, {
          table: 'users',
          column: 'name',
          why: 'the account the records were written as (the page names it as its author)'
        })
  const classified = classify({
    renders,
    origin: site.origin,
    registry: built.registry.entries,
    writePlan: built.writePlan,
    uploaded: site.real.record?.paths ?? {},
    ids: site.real.record?.ids ?? {},
    resolve: sourceResolver(archive, {
      site: site.origin,
      contentMap: kit.blankContract,
      mapping: kit.mapping,
      writes: siteValues
    }),
    kept: keptKeysOf(kit.mapping),
    keep: keptPlacesOf(kit.mapping, kit.draftReport ?? null),
    rules: adapter.exemptions,
    siteValues,
    declaredHosts: new Set(adapter.declaredHosts ?? [])
  })
  // A written value no page shows is explained only by a reason the write or the kit declares.
  classified.notSeen = declareNotSeen(classified.notSeen, {
    conflicts: site.real.report?.counts?.conflicts ?? [],
    unproven: built.writePlan?.unproven ?? [],
    mapping: kit.mapping
  })
  const written = new Set(
    Object.entries(site.real.record?.ids ?? {})
      .filter(([k]) => k.startsWith('copy:'))
      .map(([, id]) => Number(id))
  )
  const groups = groupsOf(classified.findings, { written })
  const demo = await demoChecks({
    renders,
    corpus,
    leaks: classified.findings.filter((f) => f.group === 'unmarked_text')
  })
  const record = checkRecord({
    kit,
    origin: site.origin,
    built,
    accounting,
    real: site.real.report ?? null,
    renders,
    pages: site.pages,
    classified,
    groups,
    demo,
    controls,
    widths: input.widths,
    themes: input.themes,
    plugin: site.real.plugin ?? null,
    refusals: input.refusals ?? [],
    kitHashes: input.kitHashes,
    measurements: input.measurements,
    inputs: input.inputs,
    startedAt
  })
  return { built, accounting, record, renders, groups, classified }
}
