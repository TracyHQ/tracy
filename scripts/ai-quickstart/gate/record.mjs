// The check record of the release gate (tickets #585 and #586): what one run of the gate wrote, rendered and found, as
// one JSON document (`tracy-ai-quickstart-check-record/v2`). It holds paths only (screenshots relative to the record's
// folder), never a token, a secret's value or a site address of the machine that ran it. `measurements` holds the six
// measurements, each with a status (`passed`, `failed`, `incomplete`, `not_run`); a measurement the run did not give
// says `not_run`. `binding` names what the record was measured on, so a release can tell a record is still about the
// kit it ships (`release-binding.mjs`). Pure.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { GROUPS } from './classify.mjs'
import { groupCounts } from './groups.mjs'
import { measurementsOf, verdictOf } from './verdict.mjs'

export const RECORD_SCHEMA = 'tracy-ai-quickstart-check-record/v2'

/**
 * The version of the gate's rules, bumped by hand whenever a change makes an earlier passing record no proof any more
 * (a new measurement, a stricter rule). A release refuses a record of another version. 3: the release guard recomputes
 * the verdict from the record, write safety counts only what reached the site, the hidden pages decide structure. 4: a
 * place is tested only where its probe is found in what was written, a hidden page must be seen missing, quality reads
 * the addresses the host reads as they are, and the guard works every count out again from the record's own lists. 5:
 * every build refusal is found in memory before the write, a link is judged by the page it reaches, a hide may not
 * take shown pages down, a resumed write safety is never released, and the publish step checks the kit's own plan.
 * 6: page numbers kept in the pagination only, the marker look's dark accent, a detail page read at its article, SEO
 * items skip noindex pages. 7 (review 5): a probe counts reached only by its place's own value, a stop names the
 * location it refused and suspects only the places stored there, a list excuses an unseen item only when its own page
 * was not read, noindex on a planned page is a finding, kept literals hold to their layout, a printed row and a drawn
 * picture, a code cut by a list is no run, and the record binds the template kit. 8 (review 6): a whole value probe
 * is placed by its place's own plain code, a failure keeps the slot or column it names, an ellipsis right after the
 * marker is no cut and a probe printed only cut short is `not_judged`, a pagination element inside a module keeps no
 * page number. 9 (review 7): a page finding of a place stored at many locations names none the judging page lacks,
 * the planner's refusal of a blank fact is a build refusal, every probe the build did not write ends in a class
 * (normalized by the build, refused alone, unsafe, or tried again), an ellipsis right after the marker judges nothing,
 * and the record binds the probe catalogue.
 */
export const GATE_VERSION = 9

/** The folder of a kit that holds its check record; never part of what the record is measured on. */
export const CHECK_RECORD_DIR = 'check-record'

/** A site address in a value replaced by `<site>`, so the record names no machine. */
const siteless = (value, origin) => JSON.parse(JSON.stringify(value ?? null).replaceAll(origin, '<site>'))

const countBy = (items, key) => {
  const out = {}
  for (const i of items) out[i[key]] = (out[i[key]] ?? 0) + 1
  return out
}

/** The places skipped or declared, by who left them (`writer`, `marker_plan`, `kit`) and the code given. */
export function splitOf(places) {
  const out = {}
  for (const p of places) {
    if (p.account === 'written' || p.account === 'unexplained') continue
    const at = (out[p.account] ??= {})
    const by = (at[p.by ?? 'none'] ??= {})
    by[p.code ?? 'none'] = (by[p.code ?? 'none'] ?? 0) + 1
  }
  return out
}

/**
 * The sha256 of every file of a kit folder, by path relative to it: what the record was measured on. The check record
 * folder is skipped, since writing the record must not change what it is about.
 */
export function kitHashesOf(folder) {
  const out = {}
  for (const rel of readdirSync(folder, { recursive: true }).sort()) {
    const name = rel.split(path.sep).join('/')
    if (name === CHECK_RECORD_DIR || name.startsWith(CHECK_RECORD_DIR + '/')) continue
    const file = path.join(folder, rel)
    if (statSync(file).isFile()) out[name] = createHash('sha256').update(readFileSync(file)).digest('hex')
  }
  return out
}

/** One sha256 over the per-file hashes of a kit, sorted by path (`path sha256` lines), or null without hashes. */
export function kitFilesSha256(hashes) {
  if (!hashes) return null
  const lines = Object.keys(hashes)
    .sort()
    .map((name) => name + ' ' + hashes[name] + '\n')
  return createHash('sha256').update(lines.join('')).digest('hex')
}

/**
 * What a record was measured on: the gate version, the kit and its files, the two archives, the plugin at both ends,
 * the provenance of the two controls (`control-file.mjs`), the sha256 of the kit's secret allow file and of the
 * template kit the marker build read (null: none).
 */
export function recordBinding({ kit, kitHashes, inputs, plugin }) {
  return {
    gateVersion: GATE_VERSION,
    kitRef: kit?.ref ?? null,
    kitFilesSha256: kitFilesSha256(kitHashes),
    blankSiteSha256: inputs?.blankSite?.sha256 ?? null,
    humanQuickstartSha256: inputs?.humanQuickstart?.sha256 ?? null,
    plugin: { expected: plugin?.expected ?? null, start: plugin?.start ?? null, end: plugin?.end ?? null },
    controls: { human: inputs?.controls?.human ?? null, quality: inputs?.controls?.quality ?? null },
    allowFileSha256: inputs?.secretAllow?.sha256 ?? null,
    // The template kit the marker build read for its dark accent (review 5 Z8), null when it read none.
    templateKitSha256: inputs?.templateKit?.sha256 ?? null,
    // The probe catalogue write safety ran and the code of the gate and of the build's write step (review 7 S7):
    // the guard refuses a catalogue that is not the gate's own; the code hash is recorded, not compared.
    probeCatalogueSha256: inputs?.probeCatalogue?.sha256 ?? null,
    gateCodeSha256: inputs?.gateCode?.sha256 ?? null
  }
}

/**
 * @param {{kit: object, origin: string, built: object, accounting: object, real: object | null,
 *   renders: object[], pages: object[], classified: object, groups?: object[], demo: object, controls?: object,
 *   widths: number[], themes: string[], plugin: object, refusals: object[], startedAt: string,
 *   kitHashes?: Record<string, string>, inputs?: object, measurements?: object}} input `controls`: the demo scan's
 *   negative control (the untouched human quickstart) and its blank control (the blank site before the write);
 *   `inputs`: the hashes of the archives the run read; `measurements`: the four measurements of #586 the run gave
 *   (`writeSafety`, `structure` with `linkCheck` and `minItems`, `quality`, `secrets`)
 */
export function checkRecord(input) {
  const { kit, origin, built, accounting, real, renders, pages, classified, demo, widths, themes, plugin } =
    input
  const groups = input.groups ?? []
  const failed = renders.filter((r) => r.status !== (r.expected ?? 200))
  const controls = input.controls ?? {}
  const measured = measurementsOf(input.measurements)
  const verdict = {
    ...verdictOf({
      real,
      accounting,
      findings: classified.findings,
      notSeen: classified.notSeen,
      demo,
      renders,
      controls,
      orderProblems: built.orderProblems ?? [],
      observationProblems: classified.problems ?? [],
      measurements: measured
    }),
    groups: groups.filter((g) => g.group !== 'outside_request').length
  }
  const record = {
    schema: RECORD_SCHEMA,
    template: kit.mapping?.template ?? null,
    kit: kit.ref ?? null,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    plugin,
    binding: recordBinding({ kit, kitHashes: input.kitHashes, inputs: input.inputs, plugin }),
    kitFiles: input.kitHashes ?? null,
    inputs: input.inputs ?? null,
    // Passed only when nothing is failing AND nothing is left unmeasured (`verdict.mjs`).
    verdict,
    universe: accounting.counts,
    split: splitOf(accounting.places),
    places: accounting.places,
    write: {
      memory: {
        status: built.written?.report?.status ?? null,
        counts: built.written?.report?.counts ?? null
      },
      site: real
        ? {
            status: real.status,
            counts: real.counts ?? null,
            code: real.code ?? null,
            message: real.message ?? null
          }
        : null,
      gaps: built.gaps.map((g) => ({
        code: g.code,
        cause: g.cause ?? null,
        record: g.record,
        blocks: g.blocks,
        message: g.message
      })),
      orderProblems: built.orderProblems ?? [],
      // One stored picture drawn for slots of different aspects: the plugin refuses it at the second slot (recorded).
      pictureShapeConflicts: built.pictureShapeConflicts ?? [],
      measuredRefusals: input.refusals.map(({ code, door, message, why }) => ({ code, door, message, why })),
      unproven: built.writePlan?.unproven ?? [],
      conflicts: built.writePlan?.conflicts ?? []
    },
    render: {
      widths,
      themes,
      // The record each page was read for (`article:<item>`): the guard tells an item's own page by it (review 5 Y3).
      pages: pages.map((p) => ({ pageType: p.pageType, path: p.path, ...(p.from ? { from: p.from } : {}) })),
      renders: renders.length,
      failed: failed.map((r) => ({
        page: r.pageType,
        theme: r.theme,
        width: r.width,
        status: r.status,
        error: r.error ?? null
      })),
      shots: renders
        .filter((r) => r.shot)
        .map((r) => ({ page: r.pageType, theme: r.theme, width: r.width, file: r.shot }))
    },
    markerTest: {
      byGroup: Object.fromEntries(
        GROUPS.map((g) => [g, classified.findings.filter((f) => f.group === g).length])
      ),
      findings: classified.findings,
      groups,
      groupCounts: groupCounts(groups),
      exempt: classified.exempt,
      codesSeen: classified.seen.size,
      notSeen: classified.notSeen,
      notSeenUnexplained: classified.notSeen.filter((n) => !n.declared).length,
      observationProblems: classified.problems ?? [],
      notSeenByReason: countBy(classified.notSeen, 'reason')
    },
    demoScan: { findings: demo.browser, html: demo.html, checks: demo.checks, controls },
    measurements: {
      markerTest: { status: verdict.measurements.markerTest },
      demoScan: { status: verdict.measurements.demoScan },
      ...measured
    }
  }
  return siteless(record, origin)
}
