// The legal and not-found pages of the approved plan in the draft write (#575): what the write does NOT build, each with
// its reason, so a plan that carries them is written safely and the run report says so. Pure; part of `writePlanOf`.
//
// What is missing to build them, measured on the only AI quickstart kit (JA Boxing 1.0.11):
// - a created Privacy page needs its body written (the step chain's writer writes it as a text page,
//   `apps/tracy-web/src/site-writer/writer-prompt.md`, checked by copy rule W14 `copy-check/rules-privacy.js`), and the
//   page writer of the build chat writes only the fields of kit blocks;
// - it needs an article, a menu item and a footer link made outside the kit's page types, with the article layout the
//   kit names for legal pages and the share bar of the article layout hidden (the step chain's
//   `write-step/page-create-stage.js`, `content-page-route.js`, `created-page-hide-stage.js`, `link-targets.js`); the
//   AI quickstart mapping declares no layout for a legal page and no such page;
// - the not-found page of JA Boxing prints the platform's own words (`JERROR_PAGE_NOT_FOUND`, kept by
//   `mapping.keptLiterals`), and no door writes them; the step chain skips it the same way
//   (`write-step/page-settings-stage.js`).
// A Privacy page that is the template's own page type is a page of the plan, written as every other page.

/** The reasons of a legal or not-found page the write does not build. */
export const LEGAL_PAGE_NOT_BUILT = 'legal_page_not_built'
export const NOT_FOUND_PAGE_NOT_WRITTEN = 'not_found_page_not_written'

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * The pages of the approved plan the write does not build: every legal page the plan creates and the not-found page,
 * each `{page, reason}` (`page`: the plan's id of the created page, or `notFound`). None for a plan without them.
 * @param {object | null | undefined} approved the approved build plan
 * @returns {{page: string, kind?: string, reason: string}[]}
 */
export function systemPagesNotBuiltOf(approved) {
  const out = list(approved?.legalPages)
    .filter((l) => l?.use === 'create')
    .map((l) => ({ page: l.id, kind: l.kind, reason: LEGAL_PAGE_NOT_BUILT }))
  if (approved?.notFound) out.push({ page: 'notFound', reason: NOT_FOUND_PAGE_NOT_WRITTEN })
  return out
}
