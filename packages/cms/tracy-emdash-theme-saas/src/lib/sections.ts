// Composed pages: a `pages` entry names its URL path, its colour direction and an ordered list of
// sections ({collection, entry}); each section is an entry of its own collection. Order and choice of
// sections are therefore editable in the admin (DECISIONS D7); layout stays in the components.
import { getEmDashCollection, getEmDashEntry } from 'emdash'
import type { Locale } from './i18n'

export type Style = 'terminal' | 'blueprint' | 'signal'

export interface ComposedPage {
  id: string
  slug: string
  title: string
  path: string
  style: Style
  view: string
  /** Heading shown instead of the title when the source sets one ("Search Helix"); empty = use `title`. */
  heading: string
  /** Line under the heading (list pages) or standfirst (single-article pages); empty = none. */
  sub: string
  /** List pages: what the list shows — `category:<term>` or `author:<username>`; empty otherwise. */
  filter: string
  /** Pages that show one article (legal pages, the HelixQL deep-dive): Portable Text blocks. */
  body: any[]
  sections: Array<{ collection: string; entry: string; data: Record<string, any> }>
}

const STYLES: Style[] = ['terminal', 'blueprint', 'signal']

/** Every published page, keyed by its path. 26 entries at most — loaded whole, filtered here. */
export async function loadPageByPath(locale: Locale, path: string): Promise<ComposedPage | null> {
  const { entries } = await getEmDashCollection('pages', { locale, status: 'published', limit: 200 } as any)
  const hit = entries.find((e: any) => (e.data.path ?? '') === path)
  if (!hit) return null
  const data = hit.data as Record<string, any>
  const refs: Array<{ collection?: string; entry?: string }> = Array.isArray(data.sections)
    ? data.sections
    : []
  const loaded = await Promise.all(
    refs.map(async (ref) => {
      if (!ref.collection || !ref.entry) return null
      const { entry } = await getEmDashEntry(ref.collection as any, ref.entry, { locale })
      return entry
        ? { collection: ref.collection, entry: ref.entry, data: entry.data as Record<string, any> }
        : null
    })
  )
  return {
    id: data.id,
    // A live-collection entry's `id` IS its slug; the row id is `data.id` (skill invariant #4).
    slug: hit.id ?? '',
    title: data.title ?? '',
    path: data.path,
    style: STYLES.includes(data.style) ? data.style : 'terminal',
    view: data.view ?? '',
    heading: data.heading ?? '',
    sub: data.sub ?? '',
    filter: data.filter ?? '',
    body: Array.isArray(data.body) ? data.body : [],
    sections: loaded.filter((s): s is NonNullable<typeof s> => s !== null)
  }
}

/** A single section entry by collection + slug (used by views that place one section themselves). */
export async function loadSection(locale: Locale, collection: string, slug: string) {
  const { entry } = await getEmDashEntry(collection as any, slug, { locale })
  return (entry?.data ?? null) as Record<string, any> | null
}
