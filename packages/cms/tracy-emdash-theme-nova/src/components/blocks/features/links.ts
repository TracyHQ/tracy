/**
 * The href of a button or card link of a section entry. The source's paths (`/about-us-2/contact`) are renamed to this site's,
 * the link goes through the same gate as the menu (a page that is off is not linked) and an empty link prints no anchor.
 */
import { liveLinks } from '@/lib/link-gate'
import { dataHref } from '@/lib/data-links'
import { href, type Locale } from '@/lib/i18n'

const RENAME: Record<string, string> = {
  '/about-us-2': '/about',
  '/about-us-2/contact': '/contact',
  '/about-us-2/career': '/career',
  '/category-blog': '/blog'
}

const renamed = (url: unknown): unknown => (typeof url === 'string' ? (RENAME[url.trim()] ?? url) : url)

/** `(url) => href | null` for the links of one entry; null when the link is empty, a script URL or points at a page that is off. */
export async function blockLinks(
  request: Request,
  locale: Locale,
  urls: readonly unknown[]
): Promise<(url: unknown) => string | null> {
  const live = await liveLinks(request, locale, urls.map(renamed))
  return (url) => {
    const u = renamed(url)
    if (!u || !live(u)) return null
    return dataHref(u, (p) => href(locale, p))
  }
}

/** The number of columns of a `columns` field (1 to 4). */
export const columnsOf = (v: unknown, fallback = 1): number => {
  const n = Number.parseInt(String(v ?? ''), 10)
  return n >= 1 && n <= 4 ? n : fallback
}

/** The width and height of a media value, or the given fallback (what the file is drawn at). */
export const sizeOf = (v: any, w: number, h: number): { width: number; height: number } => ({
  width: Number(v?.width) || w,
  height: Number(v?.height) || h
})
