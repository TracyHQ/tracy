/**
 * The link gate of this theme (TCH #1013): which page record each top-level path is served by (the same
 * records `src/pages/[...path].astro` routes to and each list view answers 404 on), wired to EmDash.
 * A view calls `await liveLinks(Astro.request, locale, [urls…])` and draws a link only while `live(url)`.
 * The pure half is `page-records.ts`. A child of an unticked page goes with it, whatever page lists it
 * (`listed-children.ts`, Akemi 11/10/2026).
 */
import { getEmDashEntry } from 'emdash'
import { LOCALES } from './i18n'
import { linkChecker, type RecordTable } from './page-records'

/** Top-level path → its page record; `/projects/<slug>` and `/news/category/<c>` go with their list page. */
const RECORDS: RecordTable = {
  about: { collection: 'about', slug: 'about' },
  services: { collection: 'services_page', slug: 'services' },
  projects: { collection: 'projects_page', slug: 'projects' },
  news: { collection: 'news_page', slug: 'news' },
  careers: { collection: 'careers', slug: 'careers' },
  investors: { collection: 'investors', slug: 'investors' },
  contact: { collection: 'contact', slug: 'contact' }
}

/** One checker per request and locale, so each record is read once however many components ask. */
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
      LOCALES
    )
    byLocale.set(locale, check)
  }
  return check(urls)
}

/** Whether a child page (`/news/<slug>`) is reachable: its list page is published. */
export async function childLive(request: Request, locale: string, path: string): Promise<boolean> {
  return (await liveLinks(request, locale, [path]))(path)
}
