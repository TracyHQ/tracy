// The data rules of one kept block, for the rules gate (`plan-gate.mjs`, ticket #593; library rule #596): every id
// names a fact or item of the needs profile, every item is of a kind the block's type shows, a Tracy library block
// shows only items its content rules accept (`library.mjs`), and the block holds between its minimum and its maximum
// items. An item of the wrong kind is reported once, as `wrong_item_kind`: the library rule is not added on top.
import { libraryEntryProblem } from './library.mjs'
import { BLOCK_TYPES, GROUP_KINDS_V3 } from './place-content-roles.mjs'

/** How a message that asks for an id to go says what happens to a block left with nothing to show. */
export const TAKE_OUT = 'take it out of this block, and leave the block out when it then shows nothing'

/**
 * Report the data problems of one block of the composition.
 * @param {{data: string[]}} block the composed block
 * @param {object} description the block's description (template store or library)
 * @param {string} at where the block sits, e.g. `pages[0].blocks[2]`
 * @param {object} data the plan data (`plan-data.mjs`)
 * @param {(code: string, at: string, message: string) => void} problem
 */
export function blockItemProblems(block, description, at, data, problem) {
  const itemKind = BLOCK_TYPES[description.type]?.itemKind ?? null
  const allowed = itemKind ? GROUP_KINDS_V3[itemKind].allowedKinds : []
  let items = 0
  block.data.forEach((id, i) => {
    const entry = data.byId.get(id)
    if (!entry)
      return problem(
        'invented_item',
        `${at}.data[${i}]`,
        `${JSON.stringify(id)} is not a fact or item of the needs profile: ${TAKE_OUT}`
      )
    if (entry.what !== 'item') return
    items += 1
    if (!allowed.includes(entry.kind))
      return problem(
        'wrong_item_kind',
        `${at}.data[${i}]`,
        `a ${description.type} block cannot show ${entry.kind} item ${JSON.stringify(id)}: ${TAKE_OUT}`
      )
    const refused = libraryEntryProblem(description, entry)
    if (refused)
      problem(
        'library_rule',
        `${at}.data[${i}]`,
        `${description.id} does not show ${JSON.stringify(id)}: ${refused}; ${TAKE_OUT}`
      )
  })
  if (itemKind && items < description.items.min)
    problem(
      'too_few_items',
      `${at}.data`,
      `block ${description.id} shows at least ${description.items.min} items, not ${items}`
    )
  if (itemKind && items > description.items.max)
    problem(
      'too_many_items',
      `${at}.data`,
      `block ${description.id} shows at most ${description.items.max} items, not ${items}`
    )
}
