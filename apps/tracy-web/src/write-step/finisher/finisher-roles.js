// The finisher's three model roles (spec #418), kept apart so no role grades its own work. Each is one call through its own
// door (finisher-doors.js), in a fresh conversation, answered as one JSON object; none of them writes to the site.
//   - finder: page screenshots in, faults from the closed list (fault-kinds.js) out. It never reads the site check report.
//   - fixer: one fault and the slot's words in, one typed repair order (repair-orders.js) out. Code checks the order.
//   - checker: the before and after crops of the repaired block at every width in, "better" or "not better" out.
// A call that fails or an answer with no JSON object is returned as `{ problem }`; the caller logs it and moves on. Every
// call also returns what it was sent (`sent`) and the reply as the model gave it (`text`), which the finisher keeps.
import { jsonObjectIn } from '../../lib/json-object-in.js'
import { faultListText } from './fault-kinds.js'
import { orderListText } from './repair-orders.js'

const FINDER_SYSTEM = `You look at screenshots of one page of a website a customer is about to receive. Each picture is a viewport tile of the page at desktop width (1440 px) or phone width (390 px), labelled with its viewport and tile number. Name only faults a site owner would see, and only of these kinds:
{FAULTS}
Never judge taste, colours, fonts or the template's design. Name a fault once, on the tile where it shows. Answer with one JSON object: { "faults": [ { "page": "<path>", "viewport": "desktop" | "phone", "tile": <number>, "kind": "<kind>", "slot": "<slot id when the page names it, else null>", "seen": "<one sentence>" } ] }. No fault: { "faults": [] }.`

const FIXER_SYSTEM = `You turn one fault found on a website into one repair order. You never write to the site: code checks your order and writes it. Never invent a fact and never change the meaning of the words; only broken text is fixed. The orders you may give:
{ORDERS}
Answer with one JSON object: the order.`

const CHECKER_SYSTEM = `You compare screenshots of the same block of a web page, before and after a repair, in pairs at the same width. Answer whether the after picture is better for a site owner: the fault is gone and nothing else broke. Answer with one JSON object: { "verdict": "better" | "not better", "reason": "<one sentence>" }.`

/** One call of a role through its door, its answer held to one JSON object, or the problem that stopped it. */
const askRole = async (door, system, content) => {
  try {
    const { text, costUsd = null } = await door.ask({ system, content })
    const answer = jsonObjectIn(text)
    if (!answer || typeof answer !== 'object')
      return { problem: 'the answer holds no JSON object', costUsd, text, sent: content }
    return { answer, costUsd, text, sent: content }
  } catch (error) {
    return {
      problem: `the call failed: ${String(error?.message ?? error).slice(0, 200)}`,
      costUsd: null,
      text: null,
      sent: content
    }
  }
}

/** One finder call for one page's shots. */
export function askFinder(door, page, shots) {
  const content = [
    { type: 'text', text: `Page ${page}.` },
    ...shots.flatMap((s) => [
      { type: 'text', text: `Page ${s.page}, ${s.viewport}, tile ${s.index}, from ${s.y} px` },
      { type: 'image_url', image_url: { url: s.image } }
    ])
  ]
  return askRole(door, FINDER_SYSTEM.replace('{FAULTS}', faultListText()), content)
}

/** One fixer call for one fault, with the words the site holds in the slot the finder named. */
export function askFixer(door, fault, slotWords) {
  const content = [
    {
      type: 'text',
      text: JSON.stringify({
        fault,
        slotNow: fault.slot ? { slot: fault.slot, words: slotWords ?? null } : null
      })
    }
  ]
  return askRole(door, FIXER_SYSTEM.replace('{ORDERS}', orderListText()), content)
}

/** One checker call: the before and after crops of the repaired block, paired by width. */
export function askChecker(door, fault, before, after) {
  const picture = (shot) => ({ type: 'image_url', image_url: { url: shot.image } })
  const content = [
    { type: 'text', text: `The fault that was repaired: ${fault.seen ?? fault.kind}.` },
    ...before.flatMap((shot, i) => [
      { type: 'text', text: `${shot.viewport}, before:` },
      picture(shot),
      { type: 'text', text: `${shot.viewport}, after:` },
      ...(after[i] ? [picture(after[i])] : [])
    ])
  ]
  return askRole(door, CHECKER_SYSTEM, content)
}

/** The checker's answer held to its form: better only when it says so. */
export function verdictOf(answer) {
  const verdict = answer?.verdict === 'better' ? 'better' : 'not better'
  const reason = typeof answer?.reason === 'string' ? answer.reason.trim().slice(0, 400) : ''
  return { verdict, reason }
}
