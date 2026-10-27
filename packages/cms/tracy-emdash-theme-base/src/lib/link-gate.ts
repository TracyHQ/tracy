/**
 * The link gate of this theme (TCH #1013): which page record each top-level path is served by (the same
 * records `src/pages/[...path].astro` routes to and each view answers 404 on), wired to EmDash. A view
 * or section calls `await liveLinks(Astro.request, locale, [urls…])` and draws a link only while
 * `live(url)`. The pure half is `page-records.ts`. A child of an unticked page stays live while a page the customer
 * kept still lists it (Team's notes under an unticked Blog): `listed-children.ts`.
 */
import { getEmDashEntry, getEntriesByTerm } from 'emdash'
import { LOCALES } from './i18n'
import { linkChecker, type RecordTable } from './page-records'
import { listedChildren, TEAM_NOTES_CATEGORY } from './listed-children'

/** Top-level path → its page record; `/blog/<slug>`, `/services/<slug>`, `/team/<slug>` go with their list page. */
const RECORDS: RecordTable = {
  product: { collection: 'product', slug: 'product' },
  services: { collection: 'services_page', slug: 'services_page' },
  pricing: { collection: 'pricing', slug: 'pricing' },
  blog: { collection: 'blog', slug: 'blog' },
  about: { collection: 'about', slug: 'about' },
  contact: { collection: 'contact', slug: 'contact' },
  careers: { collection: 'careers', slug: 'careers' },
  help: { collection: 'help', slug: 'help' },
  team: { collection: 'team', slug: 'team' },
  onepage: { collection: 'onepage', slug: 'onepage' },
  landing: { collection: 'landing', slug: 'landing' },
  'home-2': { collection: 'home_2', slug: 'home_2' },
  marketing: { collection: 'marketing', slug: 'marketing' },
  'design-system': { collection: 'design_system', slug: 'design_system' }
}

/** The children the kept pages still list, in one locale. */
async function listed(locale: string): Promise<Set<string>> {
  const [{ entry: team }, notes] = await Promise.all([
    getEmDashEntry('team', 'team', { locale }),
    getEntriesByTerm('posts', 'category', TEAM_NOTES_CATEGORY, { locale } as any)
  ])
  // getEntriesByTerm's `id` is the entry slug (measured on 0.37, `src/views/Team.astro`).
  return listedChildren(
    { team: Boolean(team) },
    (notes as any[]).map((e) => String(e.id))
  )
}

/** One checker per request and locale, so each record is read once however many sections ask. */
const perRequest = new WeakMap<Request, Map<string, ReturnType<typeof linkChecker>>>()

/** Read the page records `urls` land on; returns `live(url)`, false only for a URL whose page is off. */
export function liveLinks(request: Request, locale: string, urls: readonly unknown[]) {
  let byLocale = perRequest.get(request)
  if (!byLocale) perRequest.set(request, (byLocale = new Map()))
  let check = byLocale.get(locale)
  if (!check) {
    check = linkChecker(
      async ({ collection, slug }) => Boolean((await getEmDashEntry(collection, slug, { locale })).entry),
      RECORDS,
      LOCALES,
      () => listed(locale)
    )
    byLocale.set(locale, check)
  }
  return check(urls)
}

/** Whether a child page (`/blog/<slug>`) is reachable: its list page is published, or a kept page still lists it. */
export async function childLive(request: Request, locale: string, path: string): Promise<boolean> {
  return (await liveLinks(request, locale, [path]))(path)
}
