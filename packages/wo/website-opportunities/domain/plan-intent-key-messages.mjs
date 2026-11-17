// Every key message has a place on the home page (#575, plan stage restore of the step chain's `keyMessage` and block
// `message`, planner-prompt.md lines 340 and 357, with the check the step chain never had). A block names the key
// messages it gets across in `carries`, by the ids the brief gives (`plan-composer-intent.mjs`):
// - an id the plan does not list is taken off, recorded (`key_message_unknown`): no fault of the site;
// - a key message no block of the home page carries, while a block of it can carry words (a heading or a paragraph to
//   write), sends the plan back (`key_message_unplaced`) on every attempt but the last; on the last, and on a change
//   request, code gives it to the home page's main block (or its first block that can carry words), recorded, so a
//   plan never stops on it. A home page with no block that writes words leaves it unplaced: true of the template.
// Pure: pages in, new pages out.

const list = (value) => (Array.isArray(value) ? value : [])

/** Whether a block has words of its own to write: a heading, a paragraph or a claim line. */
export const canCarry = (description) =>
  [...list(description?.fields), ...list(description?.itemFields)].some(
    (f) => f?.type === 'text' && /^(editorial|claim)\./.test(f?.kind ?? '')
  )

/** The home page of the plan: the page of type `home`, else the first page. */
export const homeOf = (pages) => pages.find((p) => p.pageType === 'home') ?? pages[0]

/**
 * Hold `carries` to the plan's key messages and give every key message a place on the home page.
 * @param {object[]} pages
 * @param {{keyMessages: Array<{id: string, label: string}>, blocks: Map<string, object>, recipes: Map<string, object>,
 *   sendBack?: boolean}} context `sendBack`: an unplaced key message is a problem (not the last attempt)
 * @param {{fix: Function, problem: Function, index: Map<string, number>}} report
 */
export function withKeyMessages(pages, { keyMessages, blocks, recipes, sendBack }, { fix, problem, index }) {
  const known = new Set(list(keyMessages).map((m) => m.id))
  const out = structuredClone(pages)
  const pageAt = (page) => `pages[${index?.get(page.id) ?? page.id}]`
  for (const page of out)
    for (const block of page.blocks) {
      if (block.carries === undefined) continue
      const kept = block.carries.filter((id) => known.has(id))
      for (const id of block.carries.filter((c) => !known.has(c)))
        fix({
          code: 'key_message_unknown',
          at: `${pageAt(page)}.blocks[${block.id}].carries`,
          rule: 'a block carries only key messages the brief gives',
          was: id,
          now: null
        })
      if (kept.length) block.carries = kept
      else delete block.carries
    }
  const home = homeOf(out)
  if (!home || known.size === 0) return out
  const carrying = home.blocks.filter((b) => canCarry(blocks.get(b.block)))
  if (carrying.length === 0) return out
  const placed = new Set(home.blocks.flatMap((b) => list(b.carries)))
  const main = recipes.get(home.pageType)?.mainBlock
  const target = carrying.find((b) => b.block === main) ?? carrying[0]
  for (const message of list(keyMessages)) {
    if (placed.has(message.id)) continue
    if (sendBack) {
      problem(
        'key_message_unplaced',
        pageAt(home),
        `key message ${JSON.stringify(message.id)} (${message.label}) has no block on the home page: name its id in the carries of the home block that gets it across`
      )
      continue
    }
    target.carries = [...list(target.carries), message.id]
    fix({
      code: 'key_message_unplaced',
      at: `${pageAt(home)}.blocks[${target.id}].carries`,
      rule: 'every key message has a place on the home page: the main block carries one no block names',
      was: null,
      now: message.id
    })
  }
  return out
}
