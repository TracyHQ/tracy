// The check record of the release gate (ticket #585): what one run of the gate wrote, rendered and found, as one JSON
// document (`tracy-ai-quickstart-check-record/v1`). It holds paths only (screenshots relative to the record's folder),
// never a token or a site address of the machine that ran it. The slots of #586 (minimum items, the link check) are
// present and say `not_run` until that ticket fills them. Pure.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { GROUPS } from './classify.mjs'
import { groupCounts } from './groups.mjs'

export const RECORD_SCHEMA = 'tracy-ai-quickstart-check-record/v1'

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

/** The sha256 of every file of a kit folder, by path relative to it: what the record was measured on. */
export function kitHashesOf(folder) {
  const out = {}
  for (const rel of readdirSync(folder, { recursive: true }).sort()) {
    const file = path.join(folder, rel)
    if (statSync(file).isFile())
      out[rel.split(path.sep).join('/')] = createHash('sha256').update(readFileSync(file)).digest('hex')
  }
  return out
}

/** The measurements of #586 the record holds a slot for: `not_run` until that ticket fills them. */
export const PENDING = Object.freeze({
  minItems: { ticket: 586, status: 'not_run' },
  linkCheck: { ticket: 586, status: 'not_run' }
})

/**
 * @param {{kit: object, origin: string, built: object, accounting: object, real: object | null,
 *   renders: object[], pages: object[], classified: object, groups?: object[], demo: object, controls?: object,
 *   widths: number[], themes: string[], plugin: object, refusals: object[], startedAt: string,
 *   kitHashes?: Record<string, string>, inputs?: object}} input `controls`: the demo scan's negative control (the
 *   untouched human quickstart) and its blank control (the blank site before the write); `inputs`: the hashes of the
 *   archives the run read
 */
export function checkRecord(input) {
  const { kit, origin, built, accounting, real, renders, pages, classified, demo, widths, themes, plugin } =
    input
  const groups = input.groups ?? []
  const leaks = classified.findings.filter((f) => f.group !== 'outside_request')
  const pending = Object.entries(PENDING)
    .filter(([, p]) => p.status !== 'passed')
    .map(([k]) => k)
  const failed = renders.filter((r) => r.status !== (r.expected ?? 200))
  const controls = input.controls ?? {}
  // A control is measured only on pages that answered as they should: no demo found on error pages proves nothing.
  const measured = (c) => c?.status === 'run' && !c.failed
  const controlsOk =
    measured(controls.human) &&
    controls.human.findings > 0 &&
    measured(controls.blank) &&
    controls.blank.findings === 0
  const record = {
    schema: RECORD_SCHEMA,
    template: kit.mapping?.template ?? null,
    kit: kit.ref ?? null,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    plugin,
    kitFiles: input.kitHashes ?? null,
    inputs: input.inputs ?? null,
    // Passed only when nothing is failing AND nothing is left unmeasured: the #586 slots, a page that did not render,
    // a demo scan control not run or not right.
    verdict: {
      leaks: leaks.length,
      groups: groups.filter((g) => g.group !== 'outside_request').length,
      unexplained: accounting.counts.unexplained,
      demoFindings: demo.browser.length,
      failedRenders: failed.length,
      controls: controlsOk ? 'right' : 'not_right_or_not_run',
      notRun: pending,
      pass:
        leaks.length === 0 &&
        accounting.counts.unexplained === 0 &&
        demo.browser.length === 0 &&
        failed.length === 0 &&
        controlsOk &&
        pending.length === 0
    },
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
      measuredRefusals: input.refusals.map(({ code, door, message, why }) => ({ code, door, message, why })),
      unproven: built.writePlan?.unproven ?? [],
      conflicts: built.writePlan?.conflicts ?? []
    },
    render: {
      widths,
      themes,
      pages: pages.map((p) => ({ pageType: p.pageType, path: p.path })),
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
      notSeenByReason: countBy(classified.notSeen, 'reason')
    },
    demoScan: { findings: demo.browser, html: demo.html, checks: demo.checks, controls },
    pending: structuredClone(PENDING)
  }
  return siteless(record, origin)
}
