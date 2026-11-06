// The finisher's three model roles (spec #418), kept apart so no role grades its own work. Each is one call through its own
// door (finisher-doors.js), in a fresh conversation, answered as one JSON object; none of them writes to the site.
//   - finder: page screenshots in, faults from the closed list (fault-kinds.js) out. It never reads the site check report.
//   - fixer: one fault, the order kinds its kind lists and the slot's words in, one typed repair order (repair-orders.js) out.
//     Code checks the order.
//   - checker: the before and after crops of every repaired block of one page in, one verdict per repair out: "better" or
//     "not better". All of a page's repairs are judged in one call (#424); each is still kept or undone on its own.
// A call that fails or an answer with no JSON object is returned as `{ problem }`; the caller logs it and moves on. Every
// call also returns what it was sent (`sent`), the reply as the model gave it (`text`), and the model's reasoning and token
// counts when its door reports them, which the finisher keeps.
import { jsonObjectIn } from '../../lib/json-object-in.js'
import { FAULT_KINDS, faultListText } from './fault-kinds.js'
import { orderListText } from './repair-orders.js'

const FINDER_SYSTEM = `You look at screenshots of one page of a website a customer is about to receive. Each picture is a viewport tile of the page at desktop width (1440 px) or phone width (390 px), labelled with its viewport and tile number. Name only faults a site owner would see, and only of these kinds:
{FAULTS}
Pictures labelled "template demo" show the template's own demo of a block this page shows; they are not the site. Use them only for "lost-design": a design trait the demo block shows that the site's block lost. Never name a fault on a template demo picture. A fault a site owner would see that fits none of these kinds: name it with kind "other", so it is logged. Never judge taste, colours or fonts. Name a fault once, on the tile where it shows. Answer with one JSON object: { "faults": [ { "page": "<path>", "viewport": "desktop" | "phone", "tile": <number>, "kind": "<kind>", "slot": "<slot id when the page names it, else null>", "block": "<block id when the page names it, else null>", "seen": "<one sentence; quote the words you see in double quotes>" } ] }. No fault: { "faults": [] }.`

const FIXER_SYSTEM = `You turn one fault found on a website into one repair order. You never write to the site: code checks your order and writes it, and drops an order that breaks a rule. Every order changes one thing: the words of one slot, one link, one demo item, one picture's alt, one page's title or meta description, the accent words of one heading, or the style of one block. Never invent a fact: new words, phone numbers, e-mail addresses and links come only from the sources given with the fault ("sources": the brief's facts, the pages the site keeps, the descriptions and alts of the pictures, the page's title and description in the site copy), and when there is nothing to put in place of a demo item, remove that one item. Never change the meaning of the words, never add words to a heading, never hide content. The fault names the order kinds that may repair it ("orders"); use one of them. A fault may carry "tried": orders written for it before and undone because they did not help; never give one of them again. The orders you may give:
{ORDERS}
Answer with one JSON object: the order.`

const CHECKER_SYSTEM = `You judge repairs made to one page of a website. Each repair is numbered; for each you get screenshots of the repaired block before and after the repair, in pairs at the same width. For each repair, answer whether the after picture is better for a site owner: the fault is gone and nothing else broke. Judge every repair on its own pictures. Answer with one JSON object: { "verdicts": [ { "repair": <number>, "verdict": "better" | "not better", "reason": "<one sentence>" } ] }, one entry per repair.`

/** One call of a role through its door, its answer held to one JSON object, or the problem that stopped it. */
const askRole = async (door, system, content) => {
  try {
    const { text, costUsd = null, reasoning = null, usage = null } = await door.ask({ system, content })
    const said = { costUsd, text, reasoning, usage, sent: content }
    const answer = jsonObjectIn(text)
    if (!answer || typeof answer !== 'object') return { problem: 'the answer holds no JSON object', ...said }
    return { answer, ...said }
  } catch (error) {
    return {
      problem: `the call failed: ${String(error?.message ?? error).slice(0, 200)}`,
      costUsd: null,
      text: null,
      sent: content
    }
  }
}

/**
 * One finder call for one page's shots, and the template demo's shot of each block the page shows (demo-block-shots.js),
 * each labelled with its block and slots.
 */
export function askFinder(door, page, shots, demoShots = []) {
  const content = [
    { type: 'text', text: `Page ${page}.` },
    ...shots.flatMap((s) => [
      { type: 'text', text: `Page ${s.page}, ${s.viewport}, tile ${s.index}, from ${s.y} px` },
      { type: 'image_url', image_url: { url: s.image } }
    ]),
    ...demoShots.flatMap((d) => [
      {
        type: 'text',
        text: `Template demo, block ${d.block} (slots ${d.slots.join(', ') || 'none'}), ${d.viewport}`
      },
      { type: 'image_url', image_url: { url: d.image } }
    ])
  ]
  return askRole(door, FINDER_SYSTEM.replace('{FAULTS}', faultListText()), content)
}

/**
 * One fixer call for one fault, with the order kinds its kind lists, the words the site holds in the slot the finder named,
 * and the sources a repair may take new words from (repair-facts.js).
 */
export function askFixer(door, fault, slotWords, sources = null) {
  const content = [
    {
      type: 'text',
      text: JSON.stringify({
        fault,
        orders: FAULT_KINDS[fault.kind]?.orders ?? [],
        slotNow: fault.slot ? { slot: fault.slot, words: slotWords ?? null } : null,
        sources
      })
    }
  ]
  return askRole(door, FIXER_SYSTEM.replace('{ORDERS}', orderListText()), content)
}

/**
 * One checker call for every repair of a page: each repair numbered, with its fault and its before and after crops paired by
 * width.
 * @param {{ repair: number, fault: object, before: object[], after: object[] }[]} repairs
 */
export function askChecker(door, repairs) {
  const picture = (shot) => ({ type: 'image_url', image_url: { url: shot.image } })
  const content = repairs.flatMap(({ repair, fault, before, after }) => [
    { type: 'text', text: `Repair ${repair}. The fault that was repaired: ${fault.seen ?? fault.kind}.` },
    ...before.flatMap((shot, i) => [
      { type: 'text', text: `Repair ${repair}, ${shot.viewport}, before:` },
      picture(shot),
      { type: 'text', text: `Repair ${repair}, ${shot.viewport}, after:` },
      ...(after[i] ? [picture(after[i])] : [])
    ])
  ])
  return askRole(door, CHECKER_SYSTEM, content)
}

/**
 * The checker's answer held to its form, per repair: better only when it says so for that repair's number; a repair it gave
 * no verdict for is not better.
 * @returns {(repair: number) => { verdict: 'better' | 'not better', reason: string }}
 */
export function verdictsOf(answer) {
  const listed = Array.isArray(answer?.verdicts) ? answer.verdicts : []
  return (repair) => {
    const said = listed.find((v) => Number(v?.repair) === repair)
    if (!said) return { verdict: 'not better', reason: 'the checker gave no verdict for this repair' }
    const verdict = said.verdict === 'better' ? 'better' : 'not better'
    const reason = typeof said.reason === 'string' ? said.reason.trim().slice(0, 400) : ''
    return { verdict, reason }
  }
}
