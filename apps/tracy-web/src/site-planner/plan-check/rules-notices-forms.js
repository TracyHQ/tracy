import { arr, has, norm, obj, str } from './rule-set.js'

// R08 CMS notices
export function checkR08(ctx) {
  const { R, blockIx, decisions, decisionParts, W } = ctx
  const r = R.r8
  const notice = (t) =>
    /joomla!?\s|wordpress|free software|powered by|gnu general/i.test(str(t.text)) ||
    (t.source &&
      t.source.file &&
      /language\//.test(t.source.file) &&
      /software|powered|joomla|wordpress/i.test(str(t.text)))
  const wanted = []
  for (const [bid, o] of blockIx)
    for (const t of o.fixed) if (t.canHide === true && notice(t)) wanted.push({ bid, t })
  wanted.forEach(({ bid, t }) => {
    const decs = decisions.filter((x) => x.d.block === bid)
    if (!decs.length) return // block not on any kept page; R10a handles undecided blocks
    decs.forEach((x) => {
      if (x.d.decision === 'hide') return r.ok()
      const hit = decisionParts(x.d).hidden.some(
        (h) =>
          t.id === h.slot ||
          norm(t.text).includes(norm(h.slot)) ||
          norm(h.slot).includes(norm(t.text).slice(0, 25)) ||
          h.slot === `${bid}.fixedText`
      )
      if (hit) r.ok()
      else r.fail(W(x), `CMS notice "${str(t.text).slice(0, 60)}" has canHide:true but is not in hiddenSlots`)
    })
  })
  if (!wanted.length) r.note('no hideable CMS notice found in the kit')
  r.note(
    'guess: a fixed text is hidden by a hiddenSlots entry whose "slot" is the notice text (or part of it), the fixed text id when the plan has one, or the block being hidden'
  )
}

// R11 forms (spec: decide each form once in site.forms, named by its kit block id)
export function checkR11(ctx) {
  const { R, plan, kit, kitPages, keptPageIds, pageBlockOrder } = ctx
  const r = R.r11
  const kitForms = arr(obj(kit.site).forms).map(obj)
  const kitFormBlocks = new Set(kitForms.map((f) => f.block))
  const planForms = arr(obj(plan.site).forms).map(obj)
  if (!Array.isArray(obj(plan.site).forms)) r.note('plan has no site.forms')
  const count = new Map()
  planForms.forEach((f, i) => {
    count.set(f.block, (count.get(f.block) || 0) + 1)
    if (!kitFormBlocks.has(f.block))
      r.fail(`site.forms[${i}]`, `"${str(f.block)}" is not a form block in the kit's site.forms`, 'plan')
    else if (f.decision !== 'keep' && f.decision !== 'hide')
      r.fail(`site.forms[${i}]`, `decision "${str(f.decision)}" is not keep or hide`, 'plan')
    else r.ok()
  })
  // A form whose block sits on a kept page (or is a shared block on one) must be decided.
  const onKept = (block) =>
    [...keptPageIds].some((pid) => {
      const kp = kitPages.get(pid)
      return kp && pageBlockOrder(kp).includes(block)
    })
  kitForms.forEach((f) => {
    const n = count.get(f.block) || 0
    if (n > 1) r.fail(`site.forms / ${f.block}`, `form decided ${n} times`, 'plan')
    else if (n === 0 && onKept(f.block))
      r.fail(`site.forms / ${f.block}`, `${f.kind} form on a kept page is not decided in site.forms`, 'plan')
  })
}

// R09 privacy, 404, language
export function checkR09(ctx) {
  const { R, plan, brief } = ctx
  const r = R.r9
  const site = obj(plan.site)
  const lp = arr(site.legalPages).find((l) => obj(l).kind === 'privacy')
  if (!lp) r.fail('site.legalPages', 'no legal page of kind "privacy"')
  else if (!has(lp.use)) r.fail('site.legalPages', 'privacy entry has no "use"')
  else r.ok()
  if (lp && lp.use === 'create' && !arr(lp.factIds).length)
    r.note('privacy page is created from scratch with no factIds; "resting only on facts" is a reviewer item')
  const nf = obj(site.notFound)
  if (!has(nf.says)) r.fail('site.notFound', 'not-found page has no "says"')
  else r.ok()
  if (!arr(nf.leadsTo).length) r.fail('site.notFound', 'not-found page leads nowhere')
  else r.ok()
  if (!has(site.language)) r.fail('site.language', 'language not set')
  else {
    if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(site.language))
      r.fail('site.language', `"${site.language}" is not a BCP 47 tag`)
    else r.ok()
    const bl = brief.language || obj(brief.business).language || obj(brief.site).language
    if (has(bl) && norm(bl) !== norm(site.language))
      r.fail('site.language', `brief says "${bl}", plan says "${site.language}"`)
    else if (!has(bl))
      r.note('cannot check: brief has no top-level language field, so only the tag format is checked')
  }
}
