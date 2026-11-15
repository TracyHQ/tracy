// The check record of the release gate (ticket #585): what one run of the gate wrote, rendered and found, as one JSON
// document (`tracy-ai-quickstart-check-record/v1`). It holds paths only (screenshots relative to the record's folder),
// never a token or a site address of the machine that ran it. The slots of #586 (minimum items, the link check) are
// present and say `not_run` until that ticket fills them. Pure.
import { GROUPS } from './classify.mjs'

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

/**
 * @param {{kit: object, origin: string, built: object, accounting: object, real: object | null,
 *   renders: object[], pages: object[], classified: object, demo: object, widths: number[], themes: string[],
 *   plugin: object, refusals: object[], startedAt: string}} input
 */
export function checkRecord(input) {
  const { kit, origin, built, accounting, real, renders, pages, classified, demo, widths, themes, plugin } =
    input
  const leaks = classified.findings.filter((f) => f.group !== 'outside_request')
  const record = {
    schema: RECORD_SCHEMA,
    template: kit.mapping?.template ?? null,
    kit: kit.ref ?? null,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    plugin,
    verdict: {
      leaks: leaks.length,
      unexplained: accounting.counts.unexplained,
      demoFindings: demo.browser.length,
      pass: leaks.length === 0 && accounting.counts.unexplained === 0 && demo.browser.length === 0
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
      failed: renders
        .filter((r) => r.status !== (r.expected ?? 200))
        .map((r) => ({
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
      exempt: classified.exempt,
      codesSeen: classified.seen.size,
      notSeen: classified.notSeen,
      notSeenByReason: countBy(classified.notSeen, 'reason')
    },
    demoScan: { findings: demo.browser, html: demo.html, checks: demo.checks },
    pending: {
      minItems: { ticket: 586, status: 'not_run' },
      linkCheck: { ticket: 586, status: 'not_run' }
    }
  }
  return siteless(record, origin)
}
