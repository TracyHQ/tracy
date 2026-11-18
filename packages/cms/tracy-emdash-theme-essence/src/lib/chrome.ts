// Everything the page chrome (header, footer, strips under every page) needs, loaded once per request.
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
export interface GalleryRow {
  entry: ChromeEntry
  title: string
  buttonLabel: string
  buttonLink: string
  columns: number
  items: { gallery_image: any; gallery_alt?: string }[]
}
export interface Chrome {
  locale: Locale
  /** `chrome` entry: brand, header button, footer words and every label the template prints. */
  site: Record<string, any>
  entry: ChromeEntry | null
  primary: ChromeMenuItem[]
  footer: ChromeMenuItem[]
  /** The `social` entries by slug (`social`: header row of the Home, `follow-me`: sidebar). */
  social: Record<string, SocialRow>
  gallery: GalleryRow | null
}

const items = (list: MenuItem[] | undefined): ChromeMenuItem[] =>
  (list ?? []).map((i) => ({ label: i.label, url: i.url, target: i.target, children: items(i.children) }))

/** The network a Font Awesome class of the source names (`fa fa-facebook` → `facebook`). */
export const networkOf = (fontIcon: string | undefined, title?: string): string =>
  String(fontIcon ?? '').split('-').pop()?.trim().toLowerCase() || String(title ?? '').toLowerCase()

export async function loadChrome(locale: Locale): Promise<Chrome> {
  const [chromeRes, primary, footer, socialRes, galleryRes] = await Promise.all([
    getEmDashEntry('chrome', 'chrome', { locale }),
    getMenu('primary', { locale }),
    getMenu('footer', { locale }),
    getEmDashCollection('social', { locale, status: 'published' }),
    getEmDashCollection('gallery', { locale, status: 'published' })
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
  const g = (galleryRes.entries as any[])[0]
  return {
    locale,
    site: { ...data, brand_name: data.brand_name ?? 'JA Essence', lang: uiTag(locale) },
    entry: chromeRes.entry ? { id: data.id, slug: chromeRes.entry.id } : null,
    primary: items(primary?.items),
    footer: items(footer?.items),
    social,
    gallery: g
      ? {
          entry: { id: g.data.id, slug: g.id },
          title: g.data.title ?? '',
          buttonLabel: g.data.gallery_title ?? '',
          buttonLink: g.data.gallery_link ?? '',
          columns: Number(g.data.number_col ?? 5) || 5,
          items: Array.isArray(g.data.items) ? g.data.items : []
        }
      : null
  }
}
