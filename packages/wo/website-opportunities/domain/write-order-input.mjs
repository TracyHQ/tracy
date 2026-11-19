// The inputs of the write order (ticket #597): the declarations and the written pages by id, the position of a placed
// block, and what is refused before anything is built (more than one home page, a customer answer longer than a field
// it fills). Pure.
import { visibleLength } from './draft-write-length.mjs'
import { MAIN_BUTTON_LABEL, answerLimitOf } from './write-order-buttons.mjs'
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

/**
 * The customer's answer to write, or null (#575: one item never stops the build): a plan with more than one home page
 * keeps the first (`homePagesOf`); an answer longer than a field it fills is not written there, the writer's own words
 * are, and it is listed in `left` (`answer_over_limit`).
 */
export function refuseInput(plan, aiq, profile, left = []) {
  const answer = answeredLabelOf(profile)
  if (answer === null) return answer
  const limit = answerLimitOf({
    blockStore: aiq?.blockStore,
    plan,
    kind: MAIN_BUTTON_LABEL,
    library: list(aiq?.library)
  })
  if (limit !== null && visibleLength(answer) > limit) {
    left.push({
      code: 'answer_over_limit',
      op: null,
      place: MAIN_BUTTON_LABEL,
      reason: String(limit),
      at: 'order'
    })
    return null
  }
  return answer
}

/** The plan without the home pages after its first one, each listed in `left` (`home_repeated`). */
export function homePagesOf(plan, left) {
  const homes = plan.pages.filter((p) => p.pageType === 'home')
  if (homes.length < 2) return plan
  for (const p of homes.slice(1))
    left.push({ code: 'home_repeated', op: `page:${p.id}`, place: 'home', reason: null, at: 'order' })
  return { ...plan, pages: plan.pages.filter((p) => !homes.slice(1).includes(p)) }
}
