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

/** The Privacy page code plans: created, resting on the business name and the contact channels the pages show. */
const plannedPrivacy = (pages, data) => ({
  kind: PRIVACY_KIND,
  use: CREATE_PAGE,
  id: PRIVACY_PAGE_ID,
  says: PRIVACY_SAYS,
  factIds: identityFactsOf(pages, data)
})

/**
 * The plan's Privacy page from the model's `legalPages`, repaired by code and never a gate failure (#575): these are
 * details code derives, not the plan's substance. Only the privacy entry is read (another kind is dropped); the
 * template's own page is kept when the plan keeps its page type, else the page is created; a created page takes its
 * fixed id, a says line, and only the facts that are the business's and shown (none left: the facts code plans).
 */
function legalPagesOf(given, { pages, data, ids }) {
  const entry = list(given).find((e) => e?.kind === PRIVACY_KIND)
  if (!entry) return [plannedPrivacy(pages, data)]
  if (entry.use !== CREATE_PAGE && ids.has(entry.use))
    return [{ kind: PRIVACY_KIND, use: ids.get(entry.use), id: ids.get(entry.use) }]
  const usable = list(entry.factIds).filter((id) => data?.byId?.has(id) && !data.withheld?.has(id))
  const planned = plannedPrivacy(pages, data)
  return [
    {
      ...planned,
      says: isText(entry.says) ? entry.says : PRIVACY_SAYS,
      factIds: usable.length ? [...new Set(usable)] : planned.factIds
    }
  ]
}

/**
 * The not-found page from the model's `notFound`, repaired by code and never a gate failure (#575, the stopped build
 * whose model wrote `leadsTo: ["home"]` for a plan with no page of that type): a link to a page type the plan does not
 * keep is dropped, and with none left the page leads to the first page of the plan (the site's home page, as the step
 * chain's not-found page did). No says line: the line code plans.
 */
function notFoundOf(given, { pages, ids }) {
  const leadsTo = [
    ...new Set(
      list(given?.leadsTo)
        .filter((t) => ids.has(t))
        .map((t) => ids.get(t))
    )
  ]
  return {
    says: isText(given?.says) ? given.says : NOT_FOUND_SAYS,
    leadsTo: leadsTo.length ? leadsTo : pages.slice(0, 1).map((p) => p.id)
  }
}

/**
 * The plan's `legalPages` and `notFound` from the composition, on the plan's final pages. Both are derived and
 * repaired by code, never a gate failure (#575): what the model does not plan, or plans wrong, code plans.
 * @param {object} composition the gated reply
 * @param {{pages: object[], data: object}} context the plan's final pages (with ids) and the plan data
 */
export function systemPagesOf(composition, { pages, data }) {
  const ids = pageIdsByType(pages)
  const legalPages = legalPagesOf(composition.legalPages, { pages, data, ids })
  const notFound = notFoundOf(composition.notFound, { pages, ids })
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
