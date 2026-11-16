import { audioDecisionProblem } from 'website-opportunities/domain/audio-source.mjs'
import { arr, has, obj, str } from './rule-set.js'

// R10d links
export function checkR10d(ctx) {
  const {
    R,
    plan,
    linkIx,
    livePages,
    keptPageIds,
    decisions,
    targetProblem,
    decisionParts,
    W,
    audioLinkProblems
  } = ctx
  const r = R.r10d
  const site = obj(plan.site)
  const pa = obj(site.primaryAction)
  if (has(pa.leadsTo)) {
    const p = targetProblem(pa.leadsTo)
    p ? r.fail('site.primaryAction', p, 'plan') : r.ok()
  } else r.note('cannot check: site.primaryAction.leadsTo missing')
  arr(obj(site.notFound).leadsTo).forEach((t) => {
    const p = targetProblem(t)
    p ? r.fail('site.notFound', p) : r.ok()
  })
  livePages.forEach((pg) => {
    const ea = obj(pg.endAction)
    if (has(ea.leadsTo)) {
      const p = targetProblem(ea.leadsTo)
      p ? r.fail(`pages ${pg.id} / endAction`, p) : r.ok()
    }
  })
  decisions.forEach((x) => {
    if (x.d.decision !== 'keep') return
    decisionParts(x.d).links.forEach((l) => {
      const kitLink = linkIx.get(l.link)
      if (kitLink?.action === 'media-source') {
        const problem =
          audioLinkProblems?.get(l.link) ??
          (has(l.labelSlot)
            ? 'an audio source has no CTA label'
            : audioDecisionProblem(kitLink, l.leadsTo, arr(ctx.brief?.facts)))
        problem ? r.fail(W(x, `link ${l.link}`), problem, 'plan') : r.ok()
        return
      }
      if (!has(l.leadsTo)) {
        if (kitLink && kitLink.action === 'page-control') return
        return r.fail(W(x, `link ${l.link}`), 'link has no leadsTo')
      } // page-control links act inside the page: no target page needed
      const p = targetProblem(l.leadsTo, l.link)
      p ? r.fail(W(x, `link ${l.link}`), p, p.includes('lightbox') ? 'prompt' : 'plan') : r.ok()
    })
  })
  arr(plan.mainMenu).forEach((m, i) => {
    if (m && m.page && !keptPageIds.has(m.page))
      r.fail(`mainMenu[${i}]`, `leads to ${m.page}, which is not a kept page`)
  })
}

// R10e footer
export function checkR10e(ctx) {
  const { R, plan, kitPages, keptPageIds, isLegalRef } = ctx
  const r = R.r10e
  const cols = arr(obj(plan.site).footerMenu)
  if (!cols.length) r.note('cannot check: plan.site.footerMenu missing or empty')
  else {
    const where = new Map()
    const legalInFooter = new Set()
    cols.forEach((c, i) => {
      const co = obj(c)
      if (!has(obj(co.heading).page))
        r.note(
          `footer column ${i}: heading.page missing (heading is plain text only if the kit says the group is not linkable)`
        )
      const set = new Set(
        [...(has(obj(co.heading).page) ? [co.heading.page] : []), ...arr(co.pages)].filter(
          (id) => !isLegalRef(id)
        )
      )
      arr(co.pages)
        .filter(isLegalRef)
        .forEach((id) => legalInFooter.add(id))
      set.forEach((pid) => where.set(pid, [...(where.get(pid) || []), i]))
    })
    for (const pid of keptPageIds) {
      const kp = kitPages.get(pid)
      if (kp && kp.path === '/') continue
      const n = (where.get(pid) || []).length
      if (n !== 1)
        r.fail(
          `site.footerMenu / page ${pid}`,
          `kept page appears in ${n} footer columns, expected exactly one`
        )
      else r.ok()
    }
    arr(obj(plan.site).legalPages).forEach((lp) => {
      if (obj(lp).kind === 'privacy' && obj(lp).use === 'create' && !legalInFooter.has('legal:privacy'))
        r.fail('site.footerMenu', 'a created Privacy Policy page is in no footer column', 'plan')
    })
    for (const pid of where.keys())
      if (!keptPageIds.has(pid))
        r.fail(`site.footerMenu / page ${pid}`, 'footer lists a page that is not kept')
  }
}

// R13 a link never leads to the page it is shown on. A page block is shown on its own page; a shared block on
// every kept page whose kit block order lists it. Hidden links are fine. Header / footer / navigation blocks
// are exempt: the logo and menu entries legitimately point at the current page (current-page state).
export function checkR13(ctx) {
  const {
    R,
    kitPages,
    kitBlocks,
    navGroups,
    livePages,
    keptPageIds,
    keptDecisions,
    pageBlockOrder,
    decisionParts
  } = ctx
  const r = R.r13
  const navBlocks13 = new Set([...navGroups.values()].map((g) => g.block))
  const chromeBlock = (b) =>
    ['header', 'footer'].includes(str(obj(kitBlocks.get(b)).role)) || navBlocks13.has(b)
  const shownOn = (x) => {
    if (x.page) return [x.page]
    return livePages
      .filter((p) => keptPageIds.has(p.id) && pageBlockOrder(obj(kitPages.get(p.id))).includes(x.d.block))
      .map((p) => p.id)
  }
  keptDecisions.forEach((x) => {
    if (chromeBlock(x.d.block)) return
    const parts = decisionParts(x.d)
    const hidden = new Set(parts.hidden.map((h) => h.slot))
    const pages = shownOn(x)
    parts.links.forEach((l) => {
      if (hidden.has(l.link) || !has(l.leadsTo)) return
      const bad = pages.filter((pid) => pid === str(l.leadsTo).trim())
      if (bad.length)
        bad.forEach((pid) =>
          r.fail(
            `page ${pid} / block ${x.d.block} / link ${l.link}`,
            `link leads to ${pid}, the page it is shown on`,
            'plan'
          )
        )
      else r.ok()
    })
  })
}
