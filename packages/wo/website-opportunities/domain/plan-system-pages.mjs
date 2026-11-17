// The legal and not-found pages of a composed plan (#575), copied from the step chain's site planner: "every site has a
// Privacy Policy page, the template's own or one you plan, resting only on facts; plan what the not-found page says"
// (`apps/tracy-web/src/site-planner/planner-prompt.md`, its reply shape `site.legalPages` and `site.notFound`, and its
// checks R09 and R10d in `site-planner/plan-check/`). The names are the step chain's; what the new model changes:
// - the reply names pages by `pageType` (the composer gives no page ids), so `use`, `id` and `leadsTo` name a page type
//   and the gate turns them into the plan's page ids;
// - no `slug`: the plan carries no address, code makes every address after approval;
// - a created Privacy page cites the facts it rests on in `factIds`, at least one, every one a fact or item of the
//   business the owner does not keep off the site (R09 only notes a created page without facts);
// - when the model plans no entry, code plans them (as code places the facts the model does not): a created Privacy
//   page resting on the business name and the contact channels the pages show, and a not-found page leading to the
//   first page. The form declares no page kind, so code cannot tell a template's own privacy page from its name.
// Pure.
import { CONTACT_CHANNEL_KINDS } from './plan-placement-facts.mjs'

export { systemPagesShapeProblems } from './plan-system-pages-shape.mjs'

/** The kind of the one legal page the plan carries, and the fixed id of a created one (the step chain's). */
export const PRIVACY_KIND = 'privacy'
export const PRIVACY_PAGE_ID = 'legal:privacy'
/** `use` of a legal page the plan creates: the template has no page of its own for it. */
export const CREATE_PAGE = 'create'

/** The writer notes of the pages code plans when the model plans none: not shown on the plan card. */
const PRIVACY_SAYS =
  'Who runs the site and how to reach them; what visitors share through the contact channels the site shows, and why.'
const NOT_FOUND_SAYS = 'The page asked for is not here; lead the visitor back to the first page of the site.'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The id of the first kept page of each page type. */
const pageIdsByType = (pages) => {
  const out = new Map()
  for (const page of pages) if (!out.has(page.pageType)) out.set(page.pageType, page.id)
  return out
}

/** The facts a code planned Privacy page rests on: the business name and every contact channel the pages show. */
function identityFactsOf(pages, data) {
  const shown = new Set(pages.flatMap((p) => p.blocks.flatMap((b) => list(b.data))))
  return list(data?.facts)
    .filter((f) => shown.has(f.id) && (f.kind === 'business.name' || CONTACT_CHANNEL_KINDS.includes(f.kind)))
    .map((f) => f.id)
}

function legalPagesOf(given, { data, ids }, problem) {
  const entries = list(given)
  const privacy = entries.filter((e) => e.kind === PRIVACY_KIND)
  entries.forEach((e, i) => {
    if (e.kind !== PRIVACY_KIND)
      problem(
        'privacy_page',
        `legalPages[${i}].kind`,
        `the only legal page a plan carries is of kind "${PRIVACY_KIND}"`
      )
  })
  if (privacy.length !== 1) {
    problem('privacy_page', 'legalPages', 'the plan carries exactly one legal page of kind "privacy"')
    return []
  }
  const entry = privacy[0]
  const at = `legalPages[${entries.indexOf(entry)}]`
  if (entry.use !== CREATE_PAGE) {
    // The template's own Privacy page: a page type the plan keeps, named the same in `id`.
    if (!ids.has(entry.use))
      problem(
        'privacy_page',
        `${at}.use`,
        `"${entry.use}" is neither "create" nor the page type of a page the plan keeps`
      )
    else if (entry.id !== entry.use)
      problem('privacy_page', `${at}.id`, "the id of the template's own page is its page type")
    return ids.has(entry.use) ? [{ kind: PRIVACY_KIND, use: ids.get(entry.use), id: ids.get(entry.use) }] : []
  }
  if (entry.id !== PRIVACY_PAGE_ID)
    problem('privacy_page', `${at}.id`, `a Privacy page you plan has the fixed id "${PRIVACY_PAGE_ID}"`)
  if (!isText(entry.says)) problem('privacy_page', `${at}.says`, 'a Privacy page you plan has a says line')
  const factIds = list(entry.factIds)
  if (factIds.length === 0)
    problem(
      'privacy_page',
      `${at}.factIds`,
      'a Privacy page you plan rests only on facts: cite them in factIds'
    )
  factIds.forEach((id, j) => {
    if (!data?.byId?.has(id))
      problem(
        'privacy_page',
        `${at}.factIds[${j}]`,
        `${JSON.stringify(id)} is not a fact or item of the business`
      )
    else if (data.withheld?.has(id))
      problem('privacy_page', `${at}.factIds[${j}]`, `${JSON.stringify(id)} is kept off the site`)
  })
  return [
    {
      kind: PRIVACY_KIND,
      use: CREATE_PAGE,
      id: PRIVACY_PAGE_ID,
      says: entry.says,
      factIds: [...new Set(factIds)]
    }
  ]
}

function notFoundOf(given, { ids }, problem) {
  if (!isText(given.says)) problem('not_found_page', 'notFound.says', 'the not-found page has no says line')
  const leadsTo = list(given.leadsTo)
  if (leadsTo.length === 0) problem('not_found_page', 'notFound.leadsTo', 'the not-found page leads nowhere')
  leadsTo.forEach((type, i) => {
    if (!ids.has(type))
      problem(
        'not_found_page',
        `notFound.leadsTo[${i}]`,
        `"${type}" is not the page type of a page the plan keeps`
      )
  })
  return { says: given.says, leadsTo: [...new Set(leadsTo.filter((t) => ids.has(t)).map((t) => ids.get(t)))] }
}

/**
 * The plan's `legalPages` and `notFound` from the composition, on the plan's final pages, every problem through
 * `problem(code, at, message)` (codes `privacy_page`, `not_found_page`). What the model does not plan, code plans.
 * @param {object} composition the gated reply
 * @param {{pages: object[], data: object}} context the plan's final pages (with ids) and the plan data
 */
export function systemPagesOf(composition, { pages, data }, problem) {
  const ids = pageIdsByType(pages)
  const legalPages =
    composition.legalPages === undefined
      ? [
          {
            kind: PRIVACY_KIND,
            use: CREATE_PAGE,
            id: PRIVACY_PAGE_ID,
            says: PRIVACY_SAYS,
            factIds: identityFactsOf(pages, data)
          }
        ]
      : legalPagesOf(composition.legalPages, { data, ids }, problem)
  const notFound =
    composition.notFound === undefined
      ? { says: NOT_FOUND_SAYS, leadsTo: pages.slice(0, 1).map((p) => p.id) }
      : notFoundOf(composition.notFound, { ids }, problem)
  return { legalPages, notFound }
}

/**
 * The plan's legal and not-found pages turned back into the composition a revision gates (`plan-request-attempt.mjs`):
 * page ids become page types, and only what the revised `pages` still keep is carried. A legal page or a not-found
 * page that names nothing kept is not carried, and code plans it again. `data`, when given: the revision's plan data,
 * whose usable facts alone a created page keeps citing.
 */
export function systemPagesCompositionOf(plan, pages, data = null) {
  const typeOf = new Map(list(plan?.pages).map((p) => [p.id, p.pageType]))
  const kept = new Set(list(pages).map((p) => p.pageType))
  // A fact the owner now keeps off the site, or one the business no longer has, is no ground of the page any more.
  const usable = (id) => !data || (data.byId?.has(id) && !data.withheld?.has(id))
  const out = {}
  const legal = list(plan?.legalPages).find((l) => l?.kind === PRIVACY_KIND)
  const factIds = list(legal?.factIds).filter(usable)
  if (legal?.use === CREATE_PAGE && factIds.length)
    out.legalPages = [{ kind: legal.kind, use: legal.use, id: legal.id, says: legal.says, factIds }]
  else if (legal && kept.has(typeOf.get(legal.use)))
    out.legalPages = [{ kind: legal.kind, use: typeOf.get(legal.use), id: typeOf.get(legal.use) }]
  const leadsTo = list(plan?.notFound?.leadsTo)
    .map((id) => typeOf.get(id))
    .filter((t) => kept.has(t))
  if (plan?.notFound && leadsTo.length)
    out.notFound = { says: plan.notFound.says, leadsTo: [...new Set(leadsTo)] }
  return out
}
