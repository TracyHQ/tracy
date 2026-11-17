// The legal and not-found pages of a Contract B build plan (#575, the step chain's `site.legalPages` and
// `site.notFound`): one Privacy Policy page, the template's own page of the plan or one the build creates with the fixed
// id `legal:privacy` and a `says` line resting on facts of the plan, and what the not-found page says and the pages it
// leads to. Both are optional, so a plan stored before them still reads. Neither is shown on the plan card. Pure.
import { closedShapeProblems, textProblems } from './build-contract-shapes.mjs'
import { idListProblems, isName, isObject } from './build-contract-shared.mjs'

/** Report every problem of `plan.legalPages` and `plan.notFound` through `report(at, message)`. */
export function systemPagesProblems(plan, known, report) {
  const pageIds = new Set((Array.isArray(plan.pages) ? plan.pages : []).map((p) => p?.id).filter(isName))
  if (plan.legalPages !== undefined) {
    if (!Array.isArray(plan.legalPages)) report('legalPages', 'legalPages must be a list')
    else {
      if (plan.legalPages.length !== 1 || plan.legalPages[0]?.kind !== 'privacy')
        report('legalPages', 'legalPages holds one page, of kind "privacy"')
      plan.legalPages.forEach((page, i) =>
        legalPageProblems(page, `legalPages[${i}]`, { known, pageIds }, report)
      )
    }
  }
  if (plan.notFound === undefined) return
  if (!isObject(plan.notFound)) return report('notFound', 'notFound must be an object {says, leadsTo}')
  closedShapeProblems(plan.notFound, 'not found page', 'notFound', report)
  textProblems(plan.notFound.says, 'notFound.says', report, 'says', 'the not-found page needs a says line')
  idListProblems(plan.notFound.leadsTo, 'notFound.leadsTo', report, { allowEmpty: false })
  for (const [i, id] of (Array.isArray(plan.notFound.leadsTo) ? plan.notFound.leadsTo : []).entries())
    if (isName(id) && !pageIds.has(id))
      report(`notFound.leadsTo[${i}]`, `${JSON.stringify(id)} is not a page of the plan`)
}

function legalPageProblems(page, at, { known, pageIds }, report) {
  if (!isObject(page)) return report(at, 'a legal page must be an object {kind, use, id, says?, factIds?}')
  closedShapeProblems(page, 'legal page', at, report)
  if (page.use !== 'create') {
    if (!pageIds.has(page.use)) report(`${at}.use`, 'use is "create" or the id of a page of the plan')
    if (page.id !== page.use) report(`${at}.id`, "the id of the template's own page is its page id")
    if (page.says !== undefined || page.factIds !== undefined)
      report(at, 'only a created legal page has a says line and factIds')
    return
  }
  if (page.id !== `legal:${page.kind}`)
    report(`${at}.id`, `a created legal page has the id "legal:${page.kind}"`)
  textProblems(page.says, `${at}.says`, report, 'says', 'a created legal page needs a says line')
  idListProblems(page.factIds, `${at}.factIds`, report, { allowEmpty: false })
  for (const [i, id] of (Array.isArray(page.factIds) ? page.factIds : []).entries()) {
    const entry = known.get(id)
    if (isName(id) && (!entry || entry.what === 'row'))
      report(`${at}.factIds[${i}]`, `${JSON.stringify(id)} is not a fact or item of the plan`)
  }
}
