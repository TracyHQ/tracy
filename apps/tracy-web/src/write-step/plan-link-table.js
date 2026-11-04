// What the site check holds the printed pages to, kept in the write report (ADR 0044, decisions 21, 23 and 24): every link the plan
// keeps on a kept block and every page's end action, with where it should lead; the business's coordinates; its phone numbers.
// Nothing here calls the site. A page target is named by its id, since the route stage may rename the page after this is made: the
// check reads its address in the report's `keptPages`.

const each = (value) => (Array.isArray(value) ? value : [])
const FACT = /^(phone|whatsapp|email|social|map):(.+)$/
const ADDRESS = /^(https?:|tel:|mailto:|\/)/
/**
 * A link the kit's self-check `deadControls` counts (template-kit reach-checks.mjs, the same rule): words, acting inside the page,
 * with nothing it opens, no address and no menu item. The template, not the plan, is what must change for it to lead anywhere.
 */
export const isDeadControl = (link) =>
  link?.action === 'page-control' &&
  /[\p{L}\p{N}]/u.test(String(link.label ?? '')) &&
  !link.opens &&
  !link.target &&
  !link.menu &&
  !link.menuItem &&
  link.icon?.mechanism !== 'image-file'
const digitsOf = (value) => String(value ?? '').replace(/[^0-9]/g, '')

/** Where a plan target leads, as the check compares it: a kept page by id, an address, or null when it cannot be measured. */
export function targetOf(leadsTo, facts) {
  const target = String(leadsTo ?? '').trim()
  const channel = FACT.exec(target)
  if (channel) {
    const fact = facts.get(channel[2])
    if (!fact || fact.onSite === false) return null
    if (channel[1] === 'phone')
      return digitsOf(fact.value) ? { kind: 'phone', digits: digitsOf(fact.value) } : null
    if (channel[1] === 'email') return { kind: 'address', url: `mailto:${String(fact.value).trim()}` }
    if (channel[1] === 'map') return null
    const url = String(typeof fact.value === 'object' ? fact.value?.url : fact.value).trim()
    return url.startsWith('https://') ? { kind: 'address', url } : null
  }
  if (ADDRESS.test(target)) return { kind: 'address', url: target }
  return target.startsWith('page-') ? { kind: 'page', page: target } : null
}

/** The kept pages each kit block prints on. */
function pagesOfBlocks(plan, kit) {
  const kept = new Set(
    each(plan?.pages)
      .filter((p) => p?.decision === 'keep')
      .map((p) => p.id)
  )
  const out = new Map()
  for (const page of each(kit?.pages)) {
    if (!kept.has(page?.id)) continue
    for (const id of new Set(Object.values(page.blocks ?? {}).flat()))
      out.set(id, [...(out.get(id) ?? []), page.id])
  }
  return out
}

/**
 * @param {{ plan: object, kit: object, brief?: object }} input
 * @returns {{ planLinks: object[], endActions: object[], phones: string[] }}
 */
export function planLinkTable({ plan, kit, brief }) {
  const facts = new Map(each(brief?.facts).map((f) => [f?.id, f]))
  const kitLinks = new Map(each(kit?.blocks).flatMap((b) => each(b?.links).map((l) => [l?.id, l])))
  const shownOn = pagesOfBlocks(plan, kit)
  const planLinks = []
  const decisions = [
    ...each(plan?.sharedBlocks).map((d) => ({ d, page: null })),
    ...each(plan?.pages)
      .filter((p) => p?.decision === 'keep')
      .flatMap((p) => each(p.blocks).map((d) => ({ d, page: p.id })))
  ]
  const seen = new Set()
  for (const { d, page } of decisions) {
    if (d?.decision === 'hide') continue
    for (const link of each(d?.links)) {
      if (!link?.link || !link.leadsTo || seen.has(`${page} ${link.link}`)) continue
      seen.add(`${page} ${link.link}`)
      const target = targetOf(link.leadsTo, facts)
      if (!target) continue
      const kitLink = kitLinks.get(link.link)
      planLinks.push({
        link: link.link,
        block: d.block,
        pages: page ? [page] : (shownOn.get(d.block) ?? []),
        leadsTo: link.leadsTo,
        target,
        labelSlot: link.labelSlot ?? null,
        ...(kitLink && isDeadControl(kitLink) ? { deadControl: true } : {})
      })
    }
  }
  const endActions = each(plan?.pages)
    .filter((p) => p?.decision === 'keep' && p.endAction?.leadsTo)
    .map((p) => ({ page: p.id, leadsTo: p.endAction.leadsTo, target: targetOf(p.endAction.leadsTo, facts) }))
    .filter((e) => e.target && !(e.target.kind === 'page' && e.target.page === e.page))
  const phones = [
    ...new Set(
      each(brief?.facts)
        .filter((f) => f?.field === 'phone' && f.onSite !== false)
        .flatMap((f) => (Array.isArray(f.value) ? f.value : [f.value]))
        .map(digitsOf)
        .filter((d) => d.length >= 6)
    )
  ]
  return { planLinks, endActions, phones }
}
