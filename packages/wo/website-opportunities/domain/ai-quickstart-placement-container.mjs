// The container rules of a placement (ticket #584), split from `ai-quickstart-placement.mjs`. Pure.
//
// A block placed `inside:<id>` (a plans tab) is drawn by its container copy, which draws every module of the position
// it names that is assigned to the page. The held block names its container (`inside`), the container names the
// blocks it holds and the location of that position (`holds`), and the held copy takes the position from its
// container copy (a reset `from: "container"` on its `position` column). Nothing else takes a `container` reset.
import { locationProblem } from './ai-quickstart-mapping-entry.mjs'

const isName = (value) => typeof value === 'string' && value.trim() !== ''
const each = (value) => (Array.isArray(value) ? value : [])

/** The id of the block a block is placed inside (`inside:<id>`), or undefined. */
export const insideOf = (block) =>
  each(block?.positions)
    .find((p) => typeof p === 'string' && p.startsWith('inside:'))
    ?.slice('inside:'.length)

/** The `inside`, `holds` and `container` reset problems of one placement entry. */
export function containerProblems(block, entry, at, { entries, byId, report }) {
  const container = insideOf(block)
  const containerResets = each(entry.resets).filter((r) => r?.from === 'container')
  if (container !== undefined) {
    if (entry.inside?.block !== container || !isName(entry.inside?.why))
      report(
        `${at}.inside`,
        `the block is placed inside ${container}: inside is {block: "${container}", why}`
      )
    if (!each(entries[container]?.holds?.blocks).includes(block.id))
      report(`${at}.inside`, `the placement of ${container} does not hold ${block.id}`)
    if (!containerResets.some((r) => r.location?.column === 'position'))
      report(`${at}.resets`, 'a held copy takes the position of its container copy: a reset from container')
  } else {
    if (entry.inside !== undefined) report(`${at}.inside`, 'the block is placed inside no other block')
    if (containerResets.length)
      report(
        `${at}.resets`,
        'only a block placed inside a container takes a reset from container (the position its container draws)'
      )
  }
  if (entry.holds === undefined) return
  const holds = entry.holds
  if (!Array.isArray(holds?.blocks) || !isName(holds.why) || locationProblem(holds.position))
    return report(`${at}.holds`, 'holds is {blocks, position: <location>, why}')
  if (holds.position.entity !== entry.entity)
    report(`${at}.holds.position`, `the position the container draws is a setting of ${entry.entity}`)
  for (const held of holds.blocks)
    if (insideOf(byId.get(held)) !== block.id)
      report(`${at}.holds`, `${held} is not placed inside:${block.id}, so ${block.id} does not hold it`)
}
