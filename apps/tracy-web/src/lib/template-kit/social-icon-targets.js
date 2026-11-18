// The social rows a plan keeps, by icon field: the network the planned profile is on (`target`), the network the
// row's icon draws (`network`), its demo class (`value`) and the class of the template's icon family that draws the
// target (`expected`, null when the kit declares or evidences none). Shared by the plan check (R26) and the copy check
// (W03), so the planner is told before the writer is.
import { iconClassOf, iconsOf } from './icon-classes.js'

// Compare explicit row metadata and the authoritative planned social fact. A class may be valid in the
// template and still draw the wrong network for its link; a citation alone does not establish the link.
export function socialIconTargets({ plan, kit, brief }) {
  const arr = (value) => (Array.isArray(value) ? value : [])
  const icons = iconsOf(kit)
  const blocks = new Map(arr(kit?.blocks).map((b) => [b?.id, b]))
  const facts = new Map(arr(brief?.facts).map((f) => [f?.id, f]))
  const out = new Map()
  // The research brief calls Twitter "x"; the released kit names the same network "twitter".
  const networkOf = (value) => {
    const name = value.trim().toLowerCase()
    return name === 'x' ? 'twitter' : name
  }
  const decisions = [...arr(plan?.sharedBlocks), ...arr(plan?.pages).flatMap((p) => arr(p?.blocks))]
  for (const decision of decisions) {
    if (decision?.decision !== 'keep') continue
    const block = blocks.get(decision.block)
    const hidden = new Set(arr(decision.hiddenSlots).map((s) => s?.slot))
    for (const list of arr(block?.lists))
      for (const row of arr(list?.rows)) {
        const urls = arr(row?.slots).filter((s) => s?.type === 'url' && s.role === 'contact.social_url')
        if (urls.length !== 1) continue
        const url = urls[0]
        const link = arr(decision.links).find((l) => l?.link === url.id)
        const label = arr(block?.links).find((l) => l?.id === url.id)?.labelId
        if (hidden.has(url.id) || (label && hidden.has(label))) continue
        const match = /^social:(.+)$/.exec(String(link?.leadsTo ?? ''))
        const fact = match && facts.get(match[1])
        if (fact?.field !== 'socials' || typeof fact.value?.kind !== 'string') continue
        const target = networkOf(fact.value.kind)
        if (!target) continue
        for (const icon of arr(row?.slots)) {
          if (
            icon?.type !== 'icon' ||
            typeof icon.field !== 'string' ||
            typeof icon.fieldValue !== 'string' ||
            typeof icon.network !== 'string'
          )
            continue
          const classes = icons.get(icon.id)?.classes
          out.set(icon.field, {
            target,
            network: networkOf(icon.network),
            value: icon.fieldValue,
            expected: classes ? iconClassOf(classes, target) : null
          })
        }
      }
  }
  return out
}
