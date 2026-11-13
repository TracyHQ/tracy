// The inputs of the write order (ticket #597): the declarations and the written pages by id, the position of a placed
// block, and what is refused before anything is built (more than one home page, a customer answer longer than a field
// it fills). Pure.
import { visibleLength } from './draft-write-length.mjs'
import { MAIN_BUTTON_LABEL, answerLimitOf } from './write-order-buttons.mjs'
import { WriteOrderError } from './write-order-error.mjs'
import { answeredLabelOf } from './write-order-fields.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** Block id -> declaration: the template's block store first, then the Tracy library blocks it lacks. */
export function declarationsOf(aiq) {
  const blocks = new Map()
  for (const block of list(aiq?.blockStore?.blocks)) blocks.set(block.id, block)
  for (const block of list(aiq?.library))
    if (!blocks.has(block.id)) blocks.set(block.id, { ...block, source: 'library' })
  return blocks
}

/** The written pages by id, from `writer:<page>` step values (`{page}`) or one `writePages` result (`{pages}`). */
export function writtenPagesOf(writers) {
  const pages = list(writers).flatMap((w) => (w?.page ? [w.page] : list(w?.pages)))
  return new Map(pages.map((p) => [p.id, p]))
}

export const positionOf = (description, blocks, i, resolved) => ({
  request: list(description.positions)[0] ?? null,
  ...(resolved === undefined ? {} : { resolved }),
  declared: list(description.positions),
  afterBlock: blocks[i - 1]?.id ?? null,
  beforeBlock: blocks[i + 1]?.id ?? null
})

/** Refuse a plan with more than one home page, and a customer answer longer than a field it fills. */
export function refuseInput(plan, aiq, profile) {
  const homes = plan.pages.filter((p) => p.pageType === 'home').map((p) => p.id)
  if (homes.length > 1)
    throw new WriteOrderError('home_repeated', `${homes.length} pages are home pages: ${homes.join(', ')}`, {
      pages: homes
    })
  const answer = answeredLabelOf(profile)
  if (answer === null) return answer
  const limit = answerLimitOf({
    blockStore: aiq?.blockStore,
    plan,
    kind: MAIN_BUTTON_LABEL,
    library: list(aiq?.library)
  })
  if (limit !== null && visibleLength(answer) > limit)
    throw new WriteOrderError(
      'answer_over_limit',
      `the main button answer has ${visibleLength(answer)} characters; the smallest field it fills holds ${limit}`,
      { kind: MAIN_BUTTON_LABEL, limit, length: visibleLength(answer) }
    )
  return answer
}
