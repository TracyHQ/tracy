// Everything the page chrome (top bar, navigation, footer) needs, loaded once per request.
import { getEmDashEntry, getMenu, type MenuItem } from 'emdash'
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
export interface Chrome {
  locale: Locale
  /** `chrome` entry: top bar, footer columns, the words the template prints itself. */
  site: Record<string, any>
  entry: ChromeEntry | null
  primary: ChromeMenuItem[]
}

const items = (list: MenuItem[] | undefined): ChromeMenuItem[] =>
  (list ?? []).map((i) => ({ label: i.label, url: i.url, target: i.target, children: items(i.children) }))

export async function loadChrome(locale: Locale): Promise<Chrome> {
  const [chromeRes, primary] = await Promise.all([
    getEmDashEntry('chrome', 'chrome', { locale }),
    getMenu('primary', { locale })
  ])
  const data = (chromeRes.entry?.data ?? {}) as Record<string, any>
  return {
    locale,
    site: { ...data, brand_name: data.brand_name ?? 'JA Diner', lang: uiTag(locale) },
    entry: chromeRes.entry ? { id: data.id, slug: chromeRes.entry.id } : null,
    primary: items(primary?.items)
  }
}
