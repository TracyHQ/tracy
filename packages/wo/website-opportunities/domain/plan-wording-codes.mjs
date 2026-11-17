// Stable codes beside the English sentences and names code writes into plan data (the pattern of `leftOut[].code`,
// `plan-left-out-wording.mjs`): a reader that translates the plan card picks the wording by the code and fills it with
// the parameters, and the English text stays as the fallback. Pure; no sentence is written here.
import { SOURCE_NAMES } from './plan-data.mjs'
import { SECTION_LABELS } from './plan-gate-fixes.mjs'

/** `pictures.generated.code`: the estimate of pictures to be created (params `{count}`; one sentence, "picture(s)" by count). */
export const PICTURES_ESTIMATE_CODE = 'pictures_generated_estimate'
/** `look.logo.code`: the source line of an own logo and of a logo Tracy drew (a logo set as the business name has no line). */
export const LOGO_CODES = Object.freeze({
  own: 'logo_source_own',
  drawn: 'logo_source_drawn'
})
/**
 * `assumptions[].code` of the logo assumptions code writes (params: `reason` and `sourceKind` of a drawn logo; `found`
 * of a logo set as the business name in text, `logo_name_as_text`; `found` and `mark` of a temporary logo the brand
 * step made with pictures the write places, `logo_made`, #575).
 */
export const LOGO_ASSUMPTION_CODES = Object.freeze({
  drawn: 'logo_drawn',
  nameAsText: 'logo_name_as_text',
  made: 'logo_made'
})

export const keyOf = (table, name) => Object.entries(table).find(([, value]) => value === name)?.[0] ?? null

/** The source kind of a name the plan data gives a source ("Website" is `website`), or null when it is no known name. */
export const sourceKindOfName = (name) => keyOf(SOURCE_NAMES, name)
/** The kinds of a list of source names, each once, in order; a name no kind belongs to is left out. */
export const sourceKindsOf = (names) => [...new Set(names.map(sourceKindOfName).filter(Boolean))]

/** The code of a block's section label: the block type the label is made from, or `page_header`; null when it has none. */
export function sectionCodeOf(description) {
  if (!description) return null
  const type = description.type
  if (type === 'hero' && (description.positions ?? []).includes('masthead')) return 'page_header'
  return Object.hasOwn(SECTION_LABELS, type) ? type : null
}

/**
 * The pages with `labelCode` on every block whose type has a known section name (`sectionCodeOf`, the key a change
 * line names as `section`): the plan card translates the section by it, `label` (the model's words) is the fallback.
 */
export const withLabelCodes = (pages, blocks) =>
  pages.map((page) => ({
    ...page,
    blocks: page.blocks.map(({ labelCode: _old, ...block }) => {
      const code = sectionCodeOf(blocks.get(block.block))
      return code ? { ...block, labelCode: code } : block
    })
  }))
