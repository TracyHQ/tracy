import { arr, has, obj, str } from './rule-set.js'

// R10a closure
export function checkR10a(ctx) {
  const {
    R,
    plan,
    brief,
    briefRef,
    kitGroups,
    kitPages,
    kitBlocks,
    planGroups,
    planPages,
    keptGroupIds,
    droppedGroupIds,
    livePages,
    decisions,
    pageBlockOrder,
    asDecision,
    W
  } = ctx
  const r = R.r10a
  if (plan.version !== 'site-plan/3') r.note(`plan.version is "${plan.version}", expected "site-plan/3"`)
  const cnt = (list, key) => list.reduce((m, o) => m.set(o[key], (m.get(o[key]) || 0) + 1), new Map())
  const gc = cnt(planGroups, 'id')
  for (const gid of kitGroups.keys()) {
    const n = gc.get(gid) || 0
    if (n !== 1) r.fail(`pageGroups ${gid}`, `appears ${n} times in plan.pageGroups, expected once`)
    else r.ok()
  }
  planGroups.forEach((g) => {
    if (!['keep', 'drop'].includes(g.decision))
      r.fail(`pageGroups ${g.id}`, `decision "${g.decision}" is not keep|drop`)
  })
  const pc = cnt(planPages, 'id')
  for (const [pid, kp] of kitPages) {
    const kept = keptGroupIds.has(kp.group)
    const n = pc.get(pid) || 0
    if (kept && n !== 1)
      r.fail(`pages ${pid}`, `page of kept group ${kp.group} appears ${n} times in plan.pages, expected once`)
    else if (!kept && n > 0)
      r.fail(
        `pages ${pid}`,
        `page of group ${kp.group} (${droppedGroupIds.has(kp.group) ? 'dropped' : 'undecided'}) is in plan.pages`
      )
    else r.ok()
  }
  const sharedDecided = new Set(arr(plan.sharedBlocks).map((d) => asDecision(d).block))
  livePages.forEach((p) => {
    const kp = kitPages.get(p.id)
    if (!kp) return
    const decidedHere = new Set(arr(p.blocks).map((d) => asDecision(d).block))
    const order = pageBlockOrder(kp)
    order.forEach((bid) => {
      if (decidedHere.has(bid) || sharedDecided.has(bid)) r.ok()
      else
        r.fail(
          `pages ${p.id} / block ${bid}`,
          'block of a kept page is decided neither in the page blocks nor in sharedBlocks'
        )
    })
    // story lists kept blocks in page order
    const keptHere = [...arr(p.blocks), ...arr(plan.sharedBlocks)]
      .map(asDecision)
      .filter((d) => d.decision === 'keep' && order.includes(d.block))
      .map((d) => d.block)
    // Spec: the story lists the page's own blocks between header and footer, never header or footer blocks.
    const chrome = (b) => ['header', 'footer'].includes(str(obj(kitBlocks.get(b)).role))
    const expected = order.filter((b) => keptHere.includes(b) && !chrome(b))
    const story = arr(p.story).map((s) => obj(s).block)
    if (!Array.isArray(p.story)) r.note(`cannot check: "story" missing on page ${p.id}`)
    else if (JSON.stringify(story) !== JSON.stringify(expected))
      r.fail(
        `pages ${p.id} / story`,
        `story blocks [${story.join(', ')}] differ from kept blocks in page order [${expected.join(', ')}]`
      )
    else r.ok()
  })
  decisions.forEach((x) => {
    if (!['keep', 'hide'].includes(x.d.decision)) r.fail(W(x), `decision "${x.d.decision}" is not keep|hide`)
    if (!has(x.d.seen)) r.fail(W(x), 'block decision has no "seen" line')
  })
  if (
    has(plan.brief) &&
    has(brief.opportunityId) &&
    !str(plan.brief).includes(brief.opportunityId) &&
    !str(briefRef).includes(plan.brief)
  )
    r.note(
      `plan.brief "${plan.brief}" does not obviously match the brief file (opportunityId ${brief.opportunityId})`
    )
  if (!has(plan.kit)) r.note('cannot check: plan.kit missing')
  if (!planPages.length) r.note('cannot check: plan.pages missing')
}

// R10c twin / fixed / cutout
export function checkR10c(ctx) {
  const { R, frameById, keptDecisions, decisionParts, W } = ctx
  const r = R.r10c
  keptDecisions.forEach((x) => {
    const parts = decisionParts(x.d)
    const ids = [
      ...parts.pics.map((p) => [p.frame, 'picture wish']),
      ...parts.hidden.map((h) => [h.slot, 'hiddenSlots'])
    ]
    ids.forEach(([id, where]) => {
      const f = frameById.get(id)
      if (!f) return
      if (has(f.twinOf))
        r.fail(W(x, `frame ${id}`), `twin of ${f.twinOf}; it must follow the twin and not appear in ${where}`)
      else if (f.fixed) r.fail(W(x, `frame ${id}`), `fixed frame must stay as it is but appears in ${where}`)
      else r.ok()
      if (f.kind === 'cutout' && where === 'hiddenSlots')
        r.fail(W(x, `frame ${id}`), 'cutout frames are never hidden by the planner')
    })
  })
  r.note(
    'this kit marks no frame as fixed (fixed is null/false everywhere), so the fixed check cannot fail on it'
  )
}
