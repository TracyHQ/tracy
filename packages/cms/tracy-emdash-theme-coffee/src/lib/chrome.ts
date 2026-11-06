// Everything the page chrome (header, mega panels, footer) needs, loaded once per request.
import { getEmDashCollection, getEmDashEntry, getMenu, type MenuItem } from 'emdash'
import { href, type Locale } from './i18n'
import { localizeLabels } from './chrome-labels'
import { uiTag } from './ui'

export interface ChromeMenuItem {
  label: string
  url: string
  target?: string
}
export interface Chrome {
  locale: Locale
  site: Record<string, any>
  primary: ChromeMenuItem[]
  resourcesRead: ChromeMenuItem[]
  resourcesHelp: ChromeMenuItem[]
  footerResources: ChromeMenuItem[]
  footerCompany: ChromeMenuItem[]
  /** `entry`: the ULID and slug a provenance stamp names (`src/lib/stamps.ts`). */
  recentPosts: Array<{ title: string; date: string; url: string; entry: ChromeEntry }>
}

/** The identity of one entry, in the shape `ownerMark` reads. */
export interface ChromeEntry {
  id: string
  slug: string
}

const items = (menu: { items: MenuItem[] } | null): ChromeMenuItem[] =>
  (menu?.items ?? []).map((i) => ({ label: i.label, url: i.url, target: i.target }))

export async function loadChrome(locale: Locale): Promise<Chrome> {
  const [siteRes, primary, rRead, rHelp, fr, fc, posts] = await Promise.all([
    getEmDashEntry('site', 'site', { locale }),
    getMenu('primary', { locale }),
    getMenu('resources_read', { locale }),
    getMenu('resources_help', { locale }),
    getMenu('footer_resources', { locale }),
    getMenu('footer_company', { locale }),
    getEmDashCollection('posts', { locale, status: 'published', orderBy: { date: 'desc' }, limit: 3 })
  ])
  // The template's interface labels follow the site's language (`src/lib/chrome-labels.ts`).
  const site = localizeLabels((siteRes.entry?.data ?? {}) as Record<string, any>, uiTag(locale))
  return {
    locale,
    site,
    primary: items(primary),
    resourcesRead: items(rRead),
    resourcesHelp: items(rHelp),
    footerResources: items(fr),
    footerCompany: items(fc),
    recentPosts: posts.entries.map((p: any) => ({
      title: p.data.title,
      date: p.data.date,
      url: href(locale, `/blog/${p.slug}`),
      entry: { id: p.data.id, slug: p.slug }
    }))
  }
}
