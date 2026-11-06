import { arr, has, obj, str } from './rule-set.js'

// R10f trade lines
export function checkR10f(ctx) {
  const { R, plan, isLabelSlot, keptDecisions, decisionParts, W } = ctx
  const r = R.r10f
  let trade = 0
  // Point markers: a slot with several items may list its points numbered ("1 sees..., 2 talks...", "1) a; 2) b",
  // "1. a 2. b"). Such a marker is not a term. A run counts only when it is an ascending sequence that starts at 1
  // and has at least two members; the first marker may follow any space, later ones must follow "," ";" ":" "."
  // or "and"/"then"/"or". Numbers inside sentences ("100 students", "45 minutes") are not in such a run.
  const stripPointMarkers = (text) => {
    const found = []
    let from = 0
    for (let k = 1; k <= 20; k++) {
      // bare form ("2 talks"): first marker after any space, later ones after punctuation or and/then/or
      const bareLead = k === 1 ? '(^|[\\s:;,(])' : '(^|[,;:.]\\s*|\\b(?:and|then|or)\\s+)'
      const res = [
        new RegExp(`${bareLead}(${k})(?:\\s+(?=[A-Za-z]))`, 'g'),
        // punctuated form ("2) pads", "2. pads"): after any whitespace or the text start
        new RegExp(`(^|[\\s:;,(])(${k})(?:\\)\\s*(?=[A-Za-z])|\\.\\s+(?=[A-Za-z]))`, 'g')
      ]
      let best = null
      for (const re of res) {
        re.lastIndex = from
        const m = re.exec(text)
        if (m && (!best || m.index < best.index)) best = m
      }
      if (!best) break
      found.push([best.index + best[1].length, best.index + best[0].length])
      from = best.index + best[0].length
    }
    if (found.length < 2) return text
    let out = text
    for (const [a, b] of found.reverse()) out = out.slice(0, a) + ' ' + out.slice(b)
    return out
  }
  // "free" counts only when it means no charge: not "free weights", "free-standing", "freestyle", "free kick" etc.
  const FREE_NAME =
    /^(?:[\s-]+(?:weights?|standing|kicks?|style|throws?|flow|play|form|hand|range)\b|-standing\b)/i
  const hasFreeOfCharge = (text) => {
    const re = /\bfree\b/gi
    let m
    while ((m = re.exec(text))) if (!FREE_NAME.test(text.slice(m.index + 4))) return true
    return false
  }
  // Says text with point markers removed, for the terms tests.
  const termsText = (text) => stripPointMarkers(str(text))
  // Schedule words: a trade line may not state when things happen without a brief fact.
  const SCHEDULE =
    /\b(daily|weekly|monthly|weekends?|weekdays?|mornings?|evenings?|afternoons?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|every (day|week|month)|hours?|minutes?|o'clock|[ap]\.?m\.?)\b/i
  const PROMISE =
    /\b(discounts?|complimentary|certificat\w*|certified|guarantee\w*|promise\w*|results?|proven|refunds?|prices?|cost|cheap\w*|weather|rain|indoors?|outdoors?|air.?con\w*)\b/i
  const PLACE =
    /\b(in|at|near|across|around|from|inside)\s+(the\s+)?(dubai|uae|emirates|abu dhabi|sharjah|jumeirah|marina|downtown|palm|[A-Z][a-z]{2,})/
  const tradeHome = new Map() // page id or shared block id -> one example location
  keptDecisions.forEach((x) =>
    decisionParts(x.d).copy.forEach((c) => {
      if (c.basis !== 'trade') return
      trade++
      // Label slots (kit role ends in "_label": menu item, button, tab) print navigation words, not a claim:
      // no fact needed. Any other trade line without a fact is fine too unless what it says states a number,
      // a schedule word, a place or a concrete promise (those need a brief fact).
      const says = str(c.says)
      const saysT = termsText(says)
      const concrete =
        /\d/.test(saysT) ||
        hasFreeOfCharge(saysT) ||
        SCHEDULE.test(says) ||
        PROMISE.test(says) ||
        PLACE.test(says)
      if (!arr(c.factIds).length && (isLabelSlot(c.slot) || !concrete)) r.ok()
      else if (!arr(c.factIds).length)
        r.fail(
          W(x, `slot ${c.slot}`),
          `trade line must cite the activity fact (it states a number, schedule, place or promise): "${says.slice(0, 80)}"`
        )
      else if (
        hasFreeOfCharge(termsText(c.says)) ||
        /discount|complimentary|\d|%|\bcertificat/i.test(termsText(c.says))
      )
        r.fail(
          W(x, `slot ${c.slot}`),
          `trade line states terms (number, free, discount or certificate): "${str(c.says).slice(0, 80)}"`
        )
      else if (SCHEDULE.test(str(c.says)))
        r.fail(
          W(x, `slot ${c.slot}`),
          `trade line states a schedule without a brief fact: "${str(c.says).slice(0, 80)}"`
        )
      else r.ok()
      // Trade content (a trade line citing a fact, not a label slot) needs one owner task about its page or shared block.
      if (arr(c.factIds).length && !isLabelSlot(c.slot))
        tradeHome.set(x.page ?? x.d.block, W(x, `slot ${c.slot}`))
    })
  )
  const abouts = new Set(
    arr(plan.ownerTasks)
      .map((t) => str(obj(t).about))
      .filter(has)
  )
  for (const [key, where] of tradeHome) {
    if (abouts.has(key)) r.ok()
    else
      r.fail(
        `ownerTasks (about ${key})`,
        `${key} carries trade content (e.g. ${where}) but no owner task has "about": "${key}"`,
        'plan'
      )
  }
  if (trade && !arr(plan.ownerTasks).length) r.fail('ownerTasks', `${trade} trade lines but no owner task`)
  else if (trade) r.ok()
  if (!trade) r.note('no basis:"trade" lines in the plan')
  r.note(
    'places and concrete promises (results, guarantees, weather) in trade lines need judgement; see R10h. Inferred lines labelled "brief" cannot be seen by the script; see R10h'
  )
}
