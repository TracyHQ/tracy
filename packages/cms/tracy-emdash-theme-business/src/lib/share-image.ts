/**
 * The picture a shared link previews (TCH #1013, D5). Template-owned on purpose: `brand.ts` is a copy of the
 * EmDash kit (gate `emdash-kit-sync`), and this rule belongs to Tracy Business only.
 */

/** The part of core site settings the share picture reads: the share card Tracy writes. */
export interface ShareSettings {
  seo?: { defaultOgImage?: { url?: string } | null } | null
}

/**
 * The picture a link to this page previews with (og:image), or null to leave it to EmDash's head.
 *
 *   `own`  the page's own subject (an article's or a project's picture): always kept.
 *   `hero` the page's decorative top picture (home, about, careers, the projects list): shared only while the customer
 *          has no share card. With one (core `settings.seo.defaultOgImage`, made from their logo, decision D5), the
 *          card is shared instead, as on every page that passes no picture at all.
 */
export function shareImageOf(
  settings: ShareSettings | null | undefined,
  { own = null, hero = null }: { own?: string | null; hero?: string | null }
): string | null {
  if (own) return own
  const card = settings?.seo?.defaultOgImage?.url
  if (typeof card === 'string' && card !== '') return card
  return hero || null
}
