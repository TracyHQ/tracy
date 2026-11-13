// The built site check (ticket #601): every check on the rendered pages of a site built from an AI quickstart, for
// local trial runs. It reports; it decides nothing. A build is done when its write step completed (ADR 0047), and no
// part of the build calls this tool. Each check says `ran` with its findings, or `not_run` with the reason.
import { maskHeld } from '../../packages/wo/website-opportunities/domain/held-text-match.mjs'
import { checkDesign } from './check-design.mjs'
import { checkLimits } from './check-limits.mjs'
import { checkPages } from './check-pages.mjs'
import { linksOf, treeOf } from './html-read.mjs'
import { entriesOf, expectedPagesOf, otherMenuItemsOf } from './inputs.mjs'
import { checkDemo, checkLinks } from './part-one.mjs'

export const REPORT_SCHEMA = 'tracy-built-site-check/v1'
export const HELD = '[held]'
export const CHECKS = ['demo', 'links', 'design', 'limits', 'pages']

/** Every string of a value with every held name, in any form, replaced by `[held]`. */
export function redacted(value, held) {
  if (!held.length) return value
  if (typeof value === 'string') return maskHeld(value, held, HELD)
  if (Array.isArray(value)) return value.map((v) => redacted(v, held))
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redacted(v, held)]))
  return value
}

/** A check that threw: `not_run` with its code, never its message (which may quote the site). */
const failed = (error) => ({
  status: 'not_run',
  reason: `check_failed: ${error?.code ?? error?.name ?? 'error'}`,
  findings: []
})
async function safely(run) {
  try {
    return await run()
  } catch (error) {
    return failed(error)
  }
}

/**
 * Check a built site.
 * @param {{pages: object[], base: URL, source: object, plan?: object, held?: string[], write?: object, kit?: object,
 *   stored?: object, demoScan?: Function | null, linkCheck?: Function | null, capped?: boolean}} input
 */
export async function checkBuiltSite(input) {
  const { base, plan, write, kit, stored, demoScan = null, linkCheck = null } = input
  const held = (input.held ?? []).filter(Boolean)
  const pages = input.pages.map((p) => {
    const tree = p.status === 200 && p.html ? treeOf(p.html) : null
    const abs = new URL(String(p.url ?? '').replace(/^\//, ''), base).href
    return { ...p, abs, tree, links: tree ? linksOf(tree) : [] }
  })
  const plain = input.pages.map(({ path, url, status, html }) => ({ path, url, status, html }))
  const expected = plan ? expectedPagesOf(plan, write) : null
  const pathOf = new Map((expected ?? []).map((e) => [e.page, e.path]))
  const entries = write?.plan?.order ? entriesOf(write.plan.order) : null
  const checks = {
    demo: await safely(() => checkDemo({ demoScan, pages: plain, kit })),
    links: await safely(() => checkLinks({ linkCheck, pages: plain, base, expected })),
    design: await safely(() => checkDesign({ kit, write, stored, entries })),
    limits: await safely(() => checkLimits({ write, entries, kit, pages, pathOf, stored })),
    pages: await safely(() =>
      checkPages({ expected, others: otherMenuItemsOf(write, expected ?? []), pages, base })
    )
  }
  const report = {
    schema: REPORT_SCHEMA,
    decides: 'nothing: a build is done when its write step completed (ADR 0047)',
    source: {
      kind: input.source?.kind ?? null,
      pages: pages.length,
      errorPages: pages.filter((p) => p.status !== 200).map((p) => ({ path: p.path, status: p.status })),
      capped: Boolean(input.capped)
    },
    counts: Object.fromEntries(
      CHECKS.map((c) => [c, checks[c].status === 'ran' ? checks[c].findings.length : null])
    ),
    checks
  }
  return redacted(report, held)
}

/** The short readable summary of a report. */
export function summaryOf(report) {
  const lines = [
    `Built site check (${report.source.kind}, ${report.source.pages} page(s)). It decides nothing.`
  ]
  for (const p of report.source.errorPages) lines.push(`  page ${p.path} answered ${p.status}`)
  for (const name of CHECKS) {
    const c = report.checks[name]
    lines.push(
      c.status === 'ran' ? `${name}: ${c.findings.length} finding(s)` : `${name}: NOT RUN (${c.reason})`
    )
    for (const note of c.notes ?? []) lines.push(`  note: ${note}`)
    for (const f of c.findings) {
      const place = f.place ? Object.entries(f.place).filter(([, v]) => v !== null && v !== undefined) : []
      const at = place.map(([k, v]) => `${k}=${v}`).join(' ')
      const extra = f.length !== undefined ? ` length ${f.length} over ${f.limit}` : ''
      const text = f.excerpt ? ` "${f.excerpt}"` : f.href ? ` ${f.href}` : ''
      lines.push(`  ${f.kind} page=${f.page ?? '?'} ${at}${extra}${text}`)
    }
  }
  return `${lines.join('\n')}\n`
}
