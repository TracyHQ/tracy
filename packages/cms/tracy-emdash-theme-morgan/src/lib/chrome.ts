// Everything the page chrome (top bar, navigation, footer) needs, loaded once per request.
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
export interface Chrome {
  locale: Locale
  /** `chrome` entry: top bar, footer columns, the words the template prints itself. */
  site: Record<string, any>
  entry: ChromeEntry | null
  primary: ChromeMenuItem[]
  /** The footer's link columns, in the order of the seed; a link with no address is a plain label. */
  footer: { title: string; links: { id: string; slug: string; label: string; link: string }[] }[]
}

const items = (list: MenuItem[] | undefined): ChromeMenuItem[] =>
  (list ?? []).map((i) => ({ label: i.label, url: i.url, target: i.target, children: items(i.children) }))

export async function loadChrome(locale: Locale): Promise<Chrome> {
  const [chromeRes, primary, footerRes] = await Promise.all([
    getEmDashEntry('chrome', 'chrome', { locale }),
    getMenu('primary', { locale }),
    getEmDashCollection('footer_links', { locale, status: 'published' })
  ])
  const footer: Chrome['footer'] = []
  for (const e of footerRes.entries) {
    const d = e.data as Record<string, any>
    let col = footer.find((c) => c.title === d.column)
    if (!col) footer.push((col = { title: String(d.column ?? ''), links: [] }))
    col.links.push({ id: d.id, slug: e.id, label: String(d.label ?? ''), link: String(d.link ?? '') })
  }
  const data = (chromeRes.entry?.data ?? {}) as Record<string, any>
  return {
    locale,
    site: { ...data, brand_name: data.brand_name ?? 'JA Morgan', lang: uiTag(locale) },
    entry: chromeRes.entry ? { id: data.id, slug: chromeRes.entry.id } : null,
    primary: items(primary?.items),
    footer
  }
}
