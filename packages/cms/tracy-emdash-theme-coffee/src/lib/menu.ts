// The Menu page's two decisions, pure so node tests can run them: which items sit under which group, and which of the
// "Order online" / "Call us" buttons are drawn. `src/views/Menu.astro` reads EmDash and hands the rows here.

export interface MenuItem {
  slug: string
  data: Record<string, any>
  /** Slugs of the `menu_group` terms the item was put in; empty when the editor chose none. */
  groups: string[]
}

export interface MenuGroup {
  slug: string
  /** The `id` of the group's section and the target of its bar button; never equal for two groups. */
  anchor: string
  label: string
  description?: string
  items: MenuItem[]
}

export interface MenuTerm {
  slug: string
  label: string
  description?: string
}

/** Slug of the group that collects items with no group; the editor never sees it as a term. */
export const MORE_GROUP = 'more'
/** Anchors: a term's is always `menu-group-<slug>`, the "More" group's is the one name no term anchor can take. */
const MORE_ANCHOR = 'menu-ungrouped'

/**
 * Groups in the order of `terms` (the admin's order). An item in several groups is listed in each, an item in none goes
 * to a last group named `moreLabel`, and a group with no item is left out.
 */
export function groupMenu(items: MenuItem[], terms: MenuTerm[], moreLabel: string): MenuGroup[] {
  const groups: MenuGroup[] = terms.map((t) => ({
    slug: t.slug,
    anchor: `menu-group-${t.slug}`,
    label: t.label,
    description: t.description,
    items: items.filter((i) => i.groups.includes(t.slug))
  }))
  const known = new Set(terms.map((t) => t.slug))
  const loose = items.filter((i) => !i.groups.some((g) => known.has(g)))
  if (loose.length > 0)
    groups.push({ slug: MORE_GROUP, anchor: MORE_ANCHOR, label: moreLabel || 'More', items: loose })
  return groups.filter((g) => g.items.length > 0)
}

export interface MenuButton {
  kind: 'order' | 'call'
  label: string
  href: string
}

/** An address a visitor may be sent to from an editor-typed cell: a web link or a path on this site, never a script. */
const safeLink = (url: string) => (/^(https?:\/\/|\/(?!\/))/i.test(url) ? url : '')

/** The buttons under the page title. A button needs both its label and its target; a missing one hides the button. */
export function menuButtons(c: {
  orderLabel?: string
  orderUrl?: string
  callLabel?: string
  phone?: string
}): MenuButton[] {
  const out: MenuButton[] = []
  const order = safeLink((c.orderUrl ?? '').trim())
  if (c.orderLabel?.trim() && order) out.push({ kind: 'order', label: c.orderLabel.trim(), href: order })
  const digits = (c.phone ?? '').replace(/[^\d+]/g, '')
  if (c.callLabel?.trim() && digits)
    out.push({ kind: 'call', label: c.callLabel.trim(), href: `tel:${digits}` })
  return out
}

/**
 * The cards of the home page's section 5, in menu order (`sort`): the items ticked "Featured", at most three, never
 * topped up with others; when none is ticked, the first three items.
 */
export function featuredItems<T extends { data: Record<string, any> }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => (a.data.sort ?? 0) - (b.data.sort ?? 0))
  const featured = sorted.filter((i) => i.data.featured === true)
  return (featured.length > 0 ? featured : sorted).slice(0, 3)
}
