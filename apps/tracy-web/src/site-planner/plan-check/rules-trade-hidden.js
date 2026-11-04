import { arr, has, obj, str } from './rule-set.js'

// R21 trade sections hidden for want of facts. Inside a kept block, two or more hidden slots whose reason is that the
// brief holds no fact for them (or that writing them would be invented) mean the planner hid a section that shows how
// the trade works (how a session, a visit or an order runs). The prompt keeps such a section as trade content written
// without numbers; hiding is the last resort and names the brief fact that shows the activity is absent.
// Not counted: a reason that names a brief fact id, demoOwned slots, fixed texts the kit lets hide, CMS notices,
// video ids and name slots. Numbers inside kept trade lines are R10f's.
const MISSING_REASON =
  /\bno (?:brief )?facts?\b|\bholds no\b|\binvent\w*\b|\bnot in the brief\b|\bbrief (?:has|gives|names|states) no\b|\bdemo(?:'s)?\b[^.]{0,40}\b(?:routines?|drills?|exercises?)\b/i
const VIDEO = /video/i

export function checkR21(ctx) {
  const { R, kit, blockIx, facts, slotRole, keptDecisions, decisionParts, W } = ctx
  const r = R.r21
  const nameSlotIds = new Set(
    arr(obj(kit.site).nameSlots)
      .filter((n) => obj(n).kind === 'slot' && has(n.id))
      .map((n) => n.id)
  )
  // A reason names a brief fact when one of its words is a fact id the brief gives (fact_..., or any id it uses).
  const namesAbsence = (why) =>
    str(why)
      .split(/[^A-Za-z0-9_-]+/)
      .some((word) => facts.has(word))
  keptDecisions.forEach((x) => {
    const o = blockIx.get(x.d.block)
    const demo = new Set(arr(o?.demo).map((d) => obj(d).id))
    const fixed = new Set(
      arr(o?.fixed)
        .filter((t) => t.canHide === true)
        .flatMap((t) => [t.id, t.text])
        .filter(has)
    )
    const excused = (slot) =>
      demo.has(slot) ||
      fixed.has(slot) ||
      nameSlotIds.has(slot) ||
      VIDEO.test(slot) ||
      VIDEO.test(str(slotRole.get(slot))) ||
      /joomla|wordpress|powered by|free software/i.test(slot)
    const run = decisionParts(x.d).hidden.filter(
      (h) => has(h.slot) && MISSING_REASON.test(str(h.why)) && !namesAbsence(h.why) && !excused(h.slot)
    )
    if (run.length < 2) return r.ok()
    r.fail(
      W(x),
      `${run.length} slots hidden for want of facts (${run
        .slice(0, 4)
        .map((h) => h.slot)
        .join(
          ', '
        )}${run.length > 4 ? ', ...' : ''}): a section that shows how the trade works is trade content; ` +
        'rewrite it from trade knowledge without any number, duration, count or price, or name in the reason the brief fact id that shows the business does not do this activity',
      'plan'
    )
  })
  r.note(
    'guess: a hidden slot counts when its reason says the brief holds no fact for it or that it would be invented; a reason naming a brief fact id is an absence and passes'
  )
}
