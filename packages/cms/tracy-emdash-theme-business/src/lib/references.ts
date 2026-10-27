import { getEmDashEntry } from 'emdash'

/**
 * The entry a single-entry reference field points at, in the page's locale, or null when empty.
 *
 * Since EmDash 0.41 a reference field that names its target collection is bound to a relation: its
 * value is not in `entry.data` but in `entry.references[slug].entries`, returned only when the field
 * is named in `getEmDashEntry(…, { references: { slug: true } })`. Those entries are complete and
 * already in the requested locale (their `id` is the route id, `ru/<slug>`, not the database id), so
 * they are used as they are. A field with no relation still keeps the database id in `data`, as a
 * string or an object with an `id`; that one is loaded.
 */
export async function referencedEntry(
  entry: { data: Record<string, unknown>; references?: Record<string, { entries: any[] }> },
  slug: string,
  collection: string,
  locale: string
): Promise<any | null> {
  const linked = entry.references?.[slug]?.entries?.[0]
  if (linked) return linked
  const v = entry.data[slug] as string | { id?: string } | null | undefined
  const id = typeof v === 'string' ? v : v?.id
  return id ? (await getEmDashEntry(collection, id, { locale })).entry : null
}
