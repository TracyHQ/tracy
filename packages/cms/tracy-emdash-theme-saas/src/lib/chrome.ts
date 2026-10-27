// Everything the page chrome (header, megamenu, drawer, footer) needs, loaded once per request.
// Words and links come from the CMS: five menus plus three one-entry collections (header buttons,
// footer brand, footer legal). Nothing here is hardcoded copy.
import { getEmDashEntry, getMenu, type MenuItem } from 'emdash'
import type { Locale } from './i18n'
import type { EntryLike } from './stamps'
import { pageChecker } from './link-gate'

export interface ChromeLink {
  label: string
  url: string
  target?: string
  children: ChromeLink[]
}

/** One chrome entry as EmDash handed it over: what its provenance stamps name (`src/lib/stamps.ts`). */
export interface ChromeSource {
  collection: string
  entry: EntryLike
}

export interface Chrome {
  locale: Locale
  primary: ChromeLink[]
  footerProduct: { title: string; items: ChromeLink[] }
  footerDevelopers: { title: string; items: ChromeLink[] }
  footerCompany: { title: string; items: ChromeLink[] }
  legal: ChromeLink[]
  header: Record<string, any>
  brand: Record<string, any>
  footerLegal: Record<string, any>
  newsletter: Record<string, any>
  /** The entry behind each of the four one-entry parts above, for their provenance stamps. */
  sources: Record<'header' | 'brand' | 'footerLegal' | 'newsletter', ChromeSource>
}

const links = (items: MenuItem[] | undefined): ChromeLink[] =>
  (items ?? []).map((i: any) => ({
    label: i.label,
    url: i.url,
    target: i.target,
    children: links(i.children)
  }))

export async function loadChrome(locale: Locale): Promise<Chrome> {
  const [primary, product, dev, company, legal, header, brand, footerLegal, newsletter] = await Promise.all([
    getMenu('mainmenu', { locale }),
    getMenu('footer-product', { locale }),
    getMenu('footer-dev', { locale }),
    getMenu('footer-company', { locale }),
    getMenu('legal', { locale }),
    getEmDashEntry('header_cta', 'global-header-cta', { locale }),
    getEmDashEntry('social', 'footer-brand', { locale }),
    getEmDashEntry('footerlegal', 'footer-copyright', { locale }),
    getEmDashEntry('newsletter' as any, 'footer-newsletter', { locale })
  ])
  // A menu link into a page the customer unticked, or into one of its children (`/product/blog/<post>`),
  // goes; Apply drops only the items that link the page itself. A heading whose every child went goes
  // too (TCH #1013, `src/lib/link-gate.ts`).
  const all = (items: ChromeLink[]): string[] => items.flatMap((i) => [i.url, ...all(i.children)])
  const menus = [primary, product, dev, company, legal].map((m: any) => links(m?.items))
  const live = await pageChecker(locale)(menus.flatMap(all))
  const prune = (items: ChromeLink[]): ChromeLink[] =>
    items.flatMap((i) => {
      if (!live(i.url)) return []
      const children = prune(i.children)
      // a heading (no page of its own, `#`) left with no child goes with them
      if (i.children.length > 0 && children.length === 0 && !String(i.url).startsWith('/')) return []
      return [{ ...i, children }]
    })
  const [primaryLinks, productLinks, devLinks, companyLinks, legalLinks] = menus.map(prune)
  const group = (menu: any, items: ChromeLink[]) => ({ title: menu?.label ?? '', items })
  return {
    locale,
    primary: primaryLinks,
    footerProduct: group(product, productLinks),
    footerDevelopers: group(dev, devLinks),
    footerCompany: group(company, companyLinks),
    legal: legalLinks,
    header: (header.entry?.data ?? {}) as Record<string, any>,
    brand: (brand.entry?.data ?? {}) as Record<string, any>,
    footerLegal: (footerLegal.entry?.data ?? {}) as Record<string, any>,
    newsletter: (newsletter.entry?.data ?? {}) as Record<string, any>,
    sources: {
      header: { collection: 'header_cta', entry: header.entry as EntryLike },
      brand: { collection: 'social', entry: brand.entry as EntryLike },
      footerLegal: { collection: 'footerlegal', entry: footerLegal.entry as EntryLike },
      newsletter: { collection: 'newsletter', entry: newsletter.entry as EntryLike }
    }
  }
}
