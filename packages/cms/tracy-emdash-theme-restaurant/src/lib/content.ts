// Reads of the section collections (slideshow, hero, features_intro, menu, tabs, testimonials, masthead…).
// Page composition is the view's job; these helpers only fetch published entries by slug.
import { getEmDashCollection, getEmDashEntry } from 'emdash'
import type { Locale } from './i18n'

export type Row = Record<string, any>

/** One published entry's data (with its id and slug), or null. */
export async function section(collection: string, slug: string, locale: Locale): Promise<Row | null> {
  const { entry } = await getEmDashEntry(collection, slug, { locale })
  if (!entry || (entry.data as Row).status === 'draft') return null
  return { ...(entry.data as Row), slug }
}

/** Published entries of a collection, in the order the seed gave them. */
export async function sections(collection: string, locale: Locale, slugs?: string[]): Promise<Row[]> {
  const { entries } = await getEmDashCollection(collection, { locale, status: 'published' })
  const all = entries.map((e: any) => ({ ...(e.data as Row), slug: e.id as string }))
  if (!slugs) return all
  return slugs.map((s) => all.find((r) => r.slug === s)).filter(Boolean) as Row[]
}
