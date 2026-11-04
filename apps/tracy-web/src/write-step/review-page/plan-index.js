// Where things sit in the plan (#357): which kept page a slot or a picture frame belongs to, and what the plan said a
// frame should show. The plan is read as plain JSON; nothing here knows more of its shape than "pages hold objects, some
// of which name a frame and what it shows".

const PREFIXED = /^([A-Za-z]+-\d+)\.[\w.-]+$/

/** The block part of a slot or frame id: `block-166.5` gives `block-166`; null when it has none. */
export const prefixOf = (id) => PREFIXED.exec(String(id))?.[1] ?? null

/** A kept page is one the plan keeps and gives a slug; a dropped page has nothing to show. */
export const keptPages = (plan) =>
  (plan?.pages ?? []).filter((p) => p?.decision === 'keep' && typeof p.slug === 'string')

function walk(value, visit, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  visit(value)
  for (const child of Array.isArray(value) ? value : Object.values(value)) walk(child, visit, seen)
}

/**
 * @param {object} plan `site-plan` json
 * @returns {{ pageOfSlot: (slot: string) => string | null, framePlans: Map<string, object> }}
 */
export function indexPlan(plan) {
  const exact = new Map()
  const byPrefix = new Map()
  const framePlans = new Map()
  for (const page of keptPages(plan)) {
    walk(page, (node) => {
      for (const value of Object.values(node)) {
        if (typeof value !== 'string' || !PREFIXED.test(value)) continue
        if (!exact.has(value)) exact.set(value, page.id)
        const prefix = prefixOf(value)
        if (!byPrefix.has(prefix)) byPrefix.set(prefix, page.id)
      }
      if (typeof node.frame === 'string' && (node.shows || node.kind) && !framePlans.has(node.frame))
        framePlans.set(node.frame, { ...node, pageId: page.id })
    })
  }
  const pageOfSlot = (slot) => {
    const named = /^(page-[\w-]+):/.exec(slot)
    if (named) return named[1]
    return exact.get(slot) ?? byPrefix.get(prefixOf(slot)) ?? null
  }
  return { pageOfSlot, framePlans }
}
