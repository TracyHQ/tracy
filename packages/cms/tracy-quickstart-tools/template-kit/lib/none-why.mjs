// `site.noneWhy` of a kit (Tracy ticket #435): the reason a person gives when a template has none of what a `site` list field
// names (`--none --why '<words>'`), keyed by that field. An empty list alone cannot tell "looked, the template has none" from
// "emptied by accident"; the template readiness verdict counts an empty list as declared only when its reason is here
// (apps/tracy-web/src/lib/template-readiness/hidden-kit-fields.js). Declaring an entry later takes the field's reason back.
//
//   "emptyVideoButtons": [],
//   "noneWhy": { "emptyVideoButtons": "<what was read, and why the template has none>" }

/**
 * Sets `field` to an empty list with its reason. Changes the kit in place; the caller checked the kit has a site part.
 * @returns {{ error: string | null, changed: boolean }}
 */
export function declareNone(kit, field, why) {
  if (typeof why !== 'string' || !why.trim())
    return { error: 'say what was read and why the template has none (--why)', changed: false }
  const reason = why.trim()
  const held = kit.site.noneWhy?.[field]
  const changed = !Array.isArray(kit.site[field]) || kit.site[field].length > 0 || held !== reason
  kit.site[field] = []
  kit.site.noneWhy = { ...kit.site.noneWhy, [field]: reason }
  return { error: null, changed }
}

/** Takes the reason of `field` back once it names an entry; drops `noneWhy` when nothing is left in it. */
export function clearNone(kit, field) {
  const held = kit.site.noneWhy
  if (!held || typeof held !== 'object' || !Object.hasOwn(held, field)) return
  const { [field]: _gone, ...rest } = held
  if (Object.keys(rest).length) kit.site.noneWhy = rest
  else delete kit.site.noneWhy
}
