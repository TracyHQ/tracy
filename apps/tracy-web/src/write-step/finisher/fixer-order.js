// The fixer's order for one fault (spec #418), checked by code before anything is written: the fault goes to the fixer with
// its repair menu (repair-menu.js), the order is held to the menu and to its kind's rules (repair-orders.js), and an order
// that names something off the menu is refused and asked for once more with the reason. Past a hard limit (run-limits.js) no
// fixer is asked: the fault is logged as unrepaired, reason `budget`.
import { askFixer } from './finisher-roles.js'
import { causeOf, logRecord } from './repair-log.js'
import { stepsOf, validOrder } from './repair-orders.js'
import { fixerSources } from './repair-facts.js'
import { repairMenu } from './repair-menu.js'
import { BUDGET } from './run-limits.js'

/** A fault left unrepaired: by a hard limit, or by the last round. */
export const unrepaired = (run, fault, reason) =>
  logRecord(fault, { ...causeOf(run.firstCheck, fault), outcome: 'unrepaired', reason })

/** The fault's repair menu: the blocks of its page (of every page when it names none), as the page is served now. */
function menuOf(run, fault, site, html) {
  const blocks = fault.page
    ? run.blocksOn(fault.page)
    : [...new Map(run.blocksOn.all().map((b) => [b.id, b])).values()]
  return repairMenu({
    fault,
    blocks,
    html: fault.page ? html : null,
    wordsOf: (slot) => site.current.get(run.lineOf(slot)?.key) ?? null,
    contentMap: run.contentMap,
    heading: run.blocksOn.kitPageOf(fault.page)?.h1?.slot ?? null
  })
}

/** One fixer call, kept as a reply file; `refused` is the order code refused for this fault, told on the second ask. */
async function askedFixer(run, fault, site, { number, menu, refused = null }) {
  const asked = run.budget.spend(
    await run.budget.timed('fix', () =>
      run.budget.bounded(() =>
        askFixer(
          run.doors.fixer,
          fault,
          site.current.get(run.lineOf(fault.slot)?.key),
          fixerSources(run.orderFacts, fault),
          { menu, refused }
        )
      )
    )
  )
  await run.replies.keep({
    name: `fixer-r${number}${refused ? '-again' : ''}`,
    role: 'fixer',
    page: fault.page,
    repair: number,
    door: run.doors.fixer,
    sent: asked.sent,
    images: [],
    call: asked
  })
  return asked
}

/**
 * The fixer's order for one fault, checked by code: `{ repair }` to write, or `{ record }` that says why not. An order that
 * names something off the fault's menu is refused, and the fixer is asked once more with the order and the reason; a second
 * answer that fails is dropped with the first refusal.
 */
export async function proposed(run, fault, site, html) {
  const stopped = run.budget.stopped()
  if (stopped) return { record: unrepaired(run, fault, `${BUDGET}: ${stopped}`) }
  const number = run.nextNumber()
  const cause = causeOf(run.firstCheck, fault)
  const menu = menuOf(run, fault, site, html)
  const asked = await askedFixer(run, fault, site, { number, menu })
  if (asked.budget) return { record: unrepaired(run, fault, asked.problem) }
  if (asked.problem)
    return {
      record: logRecord(fault, { ...cause, outcome: 'failed', reason: `the fixer: ${asked.problem}` })
    }
  const context = {
    ...run.orderFacts,
    site,
    door: run.door,
    siteKey: run.siteKey,
    fault,
    menu,
    kitSlots: run.kitSlots,
    pageSlots: run.pageSlots,
    keyOf: (slot) => run.lineOf(slot)?.key ?? null,
    currentOf: (key) => site.current.get(key)
  }
  let order = asked.answer
  let valid = await validOrder(order, context)
  if (valid.offMenu && !run.budget.stopped()) {
    const again = await askedFixer(run, fault, site, {
      number,
      menu,
      refused: [{ order, reason: valid.reason }]
    })
    if (!again.problem) {
      order = again.answer
      valid = await validOrder(order, context)
    }
  }
  // A repair is logged on the slot it is about, the one the finder named or the one the order was tied to.
  const onSlot = { ...fault, slot: fault.slot ?? (valid.ok ? valid.slot : null) }
  const known = { ...(fault.slot ? cause : causeOf(run.firstCheck, onSlot)), order }
  if (!valid.ok) return { record: logRecord(onSlot, { ...known, outcome: 'dropped', reason: valid.reason }) }
  if ((fault.tried ?? []).includes(JSON.stringify(order)))
    return {
      record: logRecord(onSlot, {
        ...known,
        outcome: 'dropped',
        reason: 'the same order was written and undone in the round before'
      })
    }
  const steps = stepsOf(order.kind)
  const repair = { run, fault, order, valid, site, number, steps, onSlot, known }
  return { repair: { ...repair, ...steps.judgeBy(repair) } }
}
