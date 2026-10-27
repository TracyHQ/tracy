// The customer's logo and favicon, as the theme draws them (TCH #1013, T24/T25a, decision D9).
//
// 🔒 ONE CONVENTION PER CMS. The light-background (or only) logo is core `settings.logo`, the favicon is core
// `settings.favicon`, and the dark-background logo is the image field `logo_dark` of the template's chrome entry
// (`tools/personalize.mjs` writes all three). A site that has none of them looks exactly as the demo did.
//
// 🔒 A SPOT WITH NO PICTURE OF ITS OWN SHOWS THE NAME AS TEXT (decision Q7). A light logo is never shown on a dark
// background, nor the reverse: a dark-mode header with only a light logo prints the text lockup instead.
//
// Pure on purpose, so a plain `node --test` can hold the rules (tests/brand.test.mjs).
import { mediaUrl } from './media.ts'

/** The part of core site settings this module reads (`getSiteSettings()`, media references already resolved). */
export interface BrandSettings {
  title?: string | null
  logo?: { url?: string; alt?: string } | null
  favicon?: { url?: string } | null
}

/** The customer's logos, as URLs the page can load; null where none was given. */
export interface BrandLogos {
  light: string | null
  dark: string | null
  alt: string
}

/** Which theme a spot is shown in: `any` is always shown. */
export type LogoTheme = 'light' | 'dark' | 'any'

/** One thing a logo spot renders: the customer's picture, or the template's text lockup. */
export type LogoSpot = { kind: 'image'; src: string; theme: LogoTheme } | { kind: 'text'; theme: LogoTheme }

/** The class that hides a spot outside its theme (`global.css`); none for `any`. */
export const THEME_CLASS: Record<LogoTheme, string> = {
  light: 'brand-when-light',
  dark: 'brand-when-dark',
  any: ''
}

/**
 * The customer's logos: the light one from core settings, the dark one from the chrome entry's `logo_dark` field
 * (read defensively: a release whose schema has no such field has no dark logo). `alt` is the logo's own alt text,
 * else the site's name.
 */
export function brandLogos(
  settings: BrandSettings | null | undefined,
  darkValue: unknown,
  name: string | null | undefined
): BrandLogos {
  const light = typeof settings?.logo?.url === 'string' && settings.logo.url !== '' ? settings.logo.url : null
  const dark = mediaUrl(darkValue as Parameters<typeof mediaUrl>[0])
  const alt = String(settings?.logo?.alt || name || settings?.title || '').trim()
  return { light, dark, alt }
}

/**
 * What one logo spot renders.
 *
 *   `themed` a spot whose background follows the site theme (a header): the light logo in the light theme, the dark
 *            one in the dark theme, the text lockup in a theme that has no picture.
 *   `dark`   a spot that is dark in both themes (a footer drawn on ink): the dark logo, else the text lockup.
 *
 * With no customer logo at all the answer is the text lockup alone, unclassed: the demo's own markup.
 */
export function logoSpots(logos: BrandLogos, where: 'themed' | 'dark'): LogoSpot[] {
  if (where === 'dark')
    return [logos.dark ? { kind: 'image', src: logos.dark, theme: 'any' } : { kind: 'text', theme: 'any' }]
  if (!logos.light && !logos.dark) return [{ kind: 'text', theme: 'any' }]
  const spot = (src: string | null, theme: 'light' | 'dark'): LogoSpot =>
    src ? { kind: 'image', src, theme } : { kind: 'text', theme }
  return [spot(logos.light, 'light'), spot(logos.dark, 'dark')]
}

/**
 * Whether the template's own `<link rel=icon>` is printed. EmDash's head prints the customer's favicon from
 * `settings.favicon` (`EmDashHead`, `renderSiteIdentity`); printed beside it, the template's icon would be a second
 * candidate the browser may pick. So the template's icon is there only while the customer has none (decision O6).
 */
export function templateIconWanted(settings: BrandSettings | null | undefined): boolean {
  return !(typeof settings?.favicon?.url === 'string' && settings.favicon.url !== '')
}
