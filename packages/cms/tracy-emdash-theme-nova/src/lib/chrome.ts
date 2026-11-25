// Everything the page chrome (header, off-canvas, footer, the CTA strip under every page) needs, loaded once per request.
import { getEmDashCollection, getEmDashEntry, getMenu, type MenuItem } from 'emdash'
import type { Locale } from './i18n'
import { uiTag } from './ui'

export interface ChromeMenuItem {
  label: string
  url: string
  target?: string
  children: ChromeMenuItem[]
}
/** The identity of one entry, in the shape `ownerMark` reads. */
export interface ChromeEntry {
  id: string
  slug: string
}
export interface SocialRow {
  slug: string
  entry: ChromeEntry
  title: string
  style: string
  items: { font_icon?: string; title?: string; link?: string }[]
}
export interface Chrome {
  locale: Locale
  /** `chrome` entry: brand, header contact row, footer words and every label the template prints. */
  site: Record<string, any>
  entry: ChromeEntry | null
  primary: ChromeMenuItem[]
  /** The two footer link columns; each has its own title in `site`. */
  footerUsers: ChromeMenuItem[]
  footerPages: ChromeMenuItem[]
  footerContent: ChromeMenuItem[]
  /** The side menu of the service pages. */
  services: ChromeMenuItem[]
  /** The `social` entries by slug (`social`: footer row and contact page). */
  social: Record<string, SocialRow>
}

const items = (list: MenuItem[] | undefined): ChromeMenuItem[] =>
  (list ?? []).map((i) => ({ label: i.label, url: i.url, target: i.target, children: items(i.children) }))

/** The network a Font Awesome class of the source names (`fa-brands fa-facebook` → `facebook`). */
export const networkOf = (fontIcon: string | undefined, title?: string): string =>
  String(fontIcon ?? '')
    .split('-')
    .pop()
    ?.trim()
    .toLowerCase() || String(title ?? '').toLowerCase()

export async function loadChrome(locale: Locale): Promise<Chrome> {
  const [chromeRes, primary, users, pages, content, services, socialRes] = await Promise.all([
    getEmDashEntry('chrome', 'chrome', { locale }),
    getMenu('primary', { locale }),
    getMenu('footer-users', { locale }),
    getMenu('footer-pages', { locale }),
    getMenu('footer-content', { locale }),
    getMenu('services', { locale }),
    getEmDashCollection('social', { locale, status: 'published' })
  ])
  const data = (chromeRes.entry?.data ?? {}) as Record<string, any>
  const social: Record<string, SocialRow> = {}
  for (const e of socialRes.entries as any[])
    social[e.id as string] = {
      slug: e.id as string,
      entry: { id: e.data.id, slug: e.id },
      title: e.data.title ?? '',
      style: e.data.social_style ?? '1',
      items: Array.isArray(e.data.items) ? e.data.items : []
    }
  return {
    locale,
    site: { ...data, brand_name: data.brand_name ?? 'JA Nova', lang: uiTag(locale) },
    entry: chromeRes.entry ? { id: data.id, slug: chromeRes.entry.id } : null,
    primary: items(primary?.items),
    footerUsers: items(users?.items),
    footerPages: items(pages?.items),
    footerContent: items(content?.items),
    services: items(services?.items),
    social
  }
}
