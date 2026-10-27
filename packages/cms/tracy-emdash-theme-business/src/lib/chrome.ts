// Everything the page chrome (topbar, header, mega panel, footer) needs, loaded once per request.
import { getEmDashCollection, getEmDashEntry, getMenu, type MenuItem } from 'emdash'
import { href, type Locale } from './i18n'
import { servedLocales } from './served-locales'

export interface ChromeMenuItem {
  label: string
  url: string
  target?: string
}

export interface Chrome {
  locale: Locale
  site: Record<string, any>
  /** The languages this site actually serves — see `loadChrome`. */
  locales: string[]
  primary: ChromeMenuItem[]
  topbar: ChromeMenuItem[]
  kit: ChromeMenuItem[]
  footerServices: ChromeMenuItem[]
  footerCompany: ChromeMenuItem[]
  footerLegal: ChromeMenuItem[]
  /** `entry`: the ULID and slug a provenance stamp names (`src/lib/stamps.ts`). */
  recentProjects: Array<{ title: string; meta: string; url: string; image: any; entry: ChromeEntry }>
  /** `titleField`: which field `title` was read from (`short_title` when set, else `title`). */
  recentNews: Array<{ title: string; titleField: string; date: string; url: string; entry: ChromeEntry }>
}

/** The identity of one entry, in the shape `ownerMark` reads. */
export interface ChromeEntry {
  id: string
  slug: string
}

const items = (menu: { items: MenuItem[] } | null): ChromeMenuItem[] =>
  (menu?.items ?? []).map((i) => ({ label: i.label, url: i.url, target: i.target }))

export async function loadChrome(locale: Locale): Promise<Chrome> {
  const [siteRes, primary, topbar, kit, fs, fc, fl, projects, news, locales] = await Promise.all([
    getEmDashEntry('site', 'site', { locale }),
    getMenu('primary', { locale }),
    getMenu('topbar', { locale }),
    getMenu('resources_kit', { locale }),
    getMenu('footer_services', { locale }),
    getMenu('footer_company', { locale }),
    getMenu('footer_legal', { locale }),
    getEmDashCollection('projects', { locale, status: 'published', orderBy: { sort: 'asc' }, limit: 4 }),
    getEmDashCollection('posts', { locale, status: 'published', orderBy: { date: 'desc' }, limit: 5 }),
    servedLocales()
  ])
  const site = (siteRes.entry?.data ?? {}) as Record<string, any>
  return {
    locale,
    site,
    locales,
    primary: items(primary),
    topbar: items(topbar),
    kit: items(kit),
    footerServices: items(fs),
    footerCompany: items(fc),
    footerLegal: items(fl),
    recentProjects: projects.entries.map((p: any) => ({
      title: p.data.title,
      meta: p.data.card_tag ?? '',
      url: href(locale, `/projects/${p.slug}`),
      image: p.data.image ?? null,
      entry: { id: p.data.id, slug: p.slug }
    })),
    recentNews: news.entries.map((p: any) => ({
      title: p.data.short_title || p.data.title,
      titleField: p.data.short_title ? 'short_title' : 'title',
      date: p.data.date,
      url: href(locale, `/news/${p.slug}`),
      entry: { id: p.data.id, slug: p.slug }
    }))
  }
}
