// The built site check run on the invented florist, with any input replaced (ticket #601 tests).
import { checkBuiltSite } from '../../../built-site-check/check-built-site.mjs'
import { approvalOf, writeResultOf } from '../../../built-site-check/inputs.mjs'
import { pagesOfFolder } from '../../../built-site-check/site-pages.mjs'
import { approval, folderOf, kit, pages, writeResult } from './florist.mjs'

/**
 * @param {{files?: object, approval?: object | null, write?: object | null, kit?: object | null, stored?: object,
 *   demoScan?: Function, linkCheck?: Function}} [over] `null` leaves an input out
 */
export async function reportOf(over = {}) {
  const a = over.approval === null ? { plan: null, held: [] } : approvalOf(over.approval ?? approval())
  return checkBuiltSite({
    pages: pagesOfFolder(folderOf(over.files ?? pages())),
    base: new URL('http://pages.invalid/'),
    source: { kind: 'pages' },
    plan: a.plan,
    held: a.held,
    write: over.write === null ? null : writeResultOf(over.write ?? writeResult()),
    kit: over.kit === null ? null : (over.kit ?? kit()),
    stored: over.stored ?? null,
    demoScan: over.demoScan ?? null,
    linkCheck: over.linkCheck ?? null
  })
}

/** The findings of one kind in a check. */
export const kindsOf = (report, check) => report.checks[check].findings.map((f) => f.kind)
