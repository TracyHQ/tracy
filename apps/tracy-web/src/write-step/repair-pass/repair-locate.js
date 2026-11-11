// The comment items of one page turn of step 9b (#448), made as the preview's popover makes them: the page's address as
// the site serves it, the element each fault points at read from the served page (repair-served-element.js), and the
// `content.locate` answer for that element through the Apply door (the agent's `locate`), the same call the popover makes
// when a person picks it. An answer that is not one (`unavailable`, a refusal, a late or failing call, or an agent with no
// locate) leaves the fault's own levels, and the item says why. Every call is held to the step clock.
import { withAltSlot } from './repair-alt-slots.js'
import { commentItem } from './repair-items.js'
import { withPictureSlot } from './repair-picture-slots.js'
import { quotedWords, servedElementOf, servedPage } from './repair-served-element.js'

/** How long one served page read and one locate may take, at most (the door's own locate budget is 8 s). */
const PAGE_READ_MS = 20_000
const LOCATE_MS = 20_000

/** The served page (its blocks and body), or null when it cannot be read in its time. */
async function servedOf(pass, page) {
  if (!pass.pageHtml) return null
  const read = await pass.clock
    .within(() => pass.pageHtml(page), Math.min(PAGE_READ_MS, pass.clock.workLeft()))
    .catch(() => ({ late: true }))
  return read.late || typeof read.value !== 'string' ? null : servedPage(read.value)
}

/** The `content.locate` answer for one element, or why there is none. */
async function locateOne(pass, params) {
  if (typeof pass.agent.locate !== 'function')
    return { answer: null, problem: 'the site agent offers no content.locate' }
  // An empty query is refused (LOCATE_BAD_QUERY): the item goes with its slot and record instead.
  if (!params.text && !params.marks.length && !params.image)
    return {
      answer: null,
      problem: 'nothing to look up: the fault names no words, mark or picture the page shows'
    }
  const done = await pass.clock
    .within(() => pass.agent.locate(params), Math.min(LOCATE_MS, pass.clock.workLeft()))
    .catch((error) => ({ value: { ok: false, code: String(error?.message ?? error) } }))
  if (done.late) return { answer: null, problem: 'content.locate did not answer in its time' }
  const answer = done.value
  if (answer?.ok === false || typeof answer?.status !== 'string')
    return { answer: null, problem: `content.locate refused: ${answer?.code ?? 'no answer'}` }
  if (answer.status === 'unavailable')
    return {
      answer: null,
      problem: `content.locate unavailable: ${answer.code ?? answer.message ?? 'no Content API'}`
    }
  return { answer, problem: null }
}

/**
 * The popover's turn builder holds comments with one page address and one selector as comments on ONE element, and acts
 * on the last of them: two faults sharing a selector (two pictures of one block, two faults the page did not show) would
 * lose all but one. Each such item points at its own element's selector instead, or, when it has none, carries its slot
 * as a CSS comment after the selector, which selects the same element and keeps the items apart.
 */
function apart(items, elements, faults) {
  const bySelector = new Map()
  items.forEach((item, i) => {
    if (!item.repairBlocked)
      bySelector.set(item.element.selector, [...(bySelector.get(item.element.selector) ?? []), i])
  })
  const taken = new Set(bySelector.keys())
  for (const [selector, members] of bySelector) {
    if (members.length < 2) continue
    for (const i of members) {
      const path = elements[i]?.path
      const own = path && !taken.has(path) ? path : null
      const name = faults[i].slot ?? faults[i].block ?? `${faults[i].kind} ${i + 1}`
      const next = own ?? `${selector || 'body'} /* ${name} */`
      items[i].element.selector = next
      taken.add(next)
    }
  }
  return items
}

/**
 * @param {object} pass the pass's context (repair-pass.js); `altSlots` the kit's alt slots (repair-alt-slots.js), if any
 * @param {string} page
 * @param {object[]} faults the page's faults to send
 * @returns {Promise<object[]>} one comment item per fault (repair-items.js `commentItem`), each with a selector of its own
 */
export async function pageItems(pass, page, faults) {
  const url = pass.urlOf(page)
  const served = await servedOf(pass, page)
  const items = []
  const elements = []
  for (const fault of faults.map((f) =>
    withPictureSlot(withAltSlot(f, pass.altSlots, pass.contentMap), pass.kit, pass.contentMap)
  )) {
    const element = served ? servedElementOf(served, fault) : null
    if (fault.group === 'words-over-picture' && !element) {
      elements.push(null)
      items.push({
        ...commentItem(fault, { url }),
        repairBlocked: 'the measured text target is missing, ambiguous or changed on the fresh page'
      })
      continue
    }
    const words =
      typeof fault.measured === 'string' && fault.measured ? fault.measured : quotedWords(fault.seen)
    // A control's measure (`a.btn -> /contact`) is not words the page shows: a found control is looked up by its own words.
    const text = element?.text || (element?.image || (element && fault.selector) ? '' : words)
    const marks = element?.marks ?? []
    const params = {
      url,
      ...(text ? { text } : {}),
      marks,
      ...(element?.image ? { image: element.image } : {})
    }
    elements.push(element)
    items.push(commentItem(fault, { url, element, located: await locateOne(pass, params) }))
  }
  return apart(items, elements, faults)
}
