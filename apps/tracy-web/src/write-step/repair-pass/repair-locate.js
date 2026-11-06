// The comment items of one page turn of step 9b (#448), made as the preview's popover makes them: the page's address as
// the site serves it, the element each fault points at read from the served page (repair-served-element.js), and the
// `content.locate` answer for that element through the Apply door (the agent's `locate`), the same call the popover makes
// when a person picks it. An answer that is not one (`unavailable`, a refusal, a late or failing call, or an agent with no
// locate) leaves the fault's own levels, and the item says why. Every call is held to the step clock.
import { commentItem } from './repair-items.js'
import { servedBlocks, servedElementOf } from './repair-served-element.js'

/** How long one served page read and one locate may take, at most (the door's own locate budget is 8 s). */
const PAGE_READ_MS = 20_000
const LOCATE_MS = 20_000

/** The served page's blocks, or null when it cannot be read in its time. */
async function blocksOf(pass, page) {
  if (!pass.pageHtml) return null
  const read = await pass.clock
    .within(() => pass.pageHtml(page), Math.min(PAGE_READ_MS, pass.clock.workLeft()))
    .catch(() => ({ late: true }))
  return read.late || typeof read.value !== 'string' ? null : servedBlocks(read.value)
}

/** The `content.locate` answer for one element, or why there is none. */
async function locateOne(pass, params) {
  if (typeof pass.agent.locate !== 'function')
    return { answer: null, problem: 'the site agent offers no content.locate' }
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
 * @param {object} pass the pass's context (repair-pass.js)
 * @param {string} page
 * @param {object[]} faults the page's faults to send
 * @returns {Promise<object[]>} one comment item per fault (repair-items.js `commentItem`)
 */
export async function pageItems(pass, page, faults) {
  const url = pass.urlOf(page)
  const blocks = await blocksOf(pass, page)
  const items = []
  for (const fault of faults) {
    const element = blocks ? servedElementOf(blocks, fault) : null
    const text = element ? element.text : typeof fault.measured === 'string' ? fault.measured : ''
    const params = {
      url,
      ...(text ? { text } : {}),
      marks: element?.marks ?? [],
      ...(element?.image ? { image: element.image } : {})
    }
    items.push(commentItem(fault, { url, element, located: await locateOne(pass, params) }))
  }
  return items
}
