/**
 * A CMS's own stock favicon reads as "no favicon" in the Browser tab title (Tracy, 01/10/2026,
 * Akemi's option a): the tab then draws the platform's coloured mark (`platform-marks.tsx`), and a
 * site keeps its icon only when it set one of its own.
 *
 * Decided by PATH, because every path below sits in a folder the CMS core owns and rewrites on
 * update, so a site that serves an icon from there is serving the CMS's file, not its own:
 *   - Joomla 4/5: when the template declares no icon, the core head emits
 *     `/media/system/images/joomla-favicon.svg` (rel icon), `favicon.ico` (rel alternate icon) and
 *     `joomla-favicon-pinned.svg` (rel mask-icon). Measured on the local Joomla site javoyara.
 *   - WordPress: with no Site Icon set, core declares no icon at all (the tab already falls back);
 *     the only stock files are the W logos in `/wp-includes/images/`, listed in case a theme links them.
 *   - EmDash: no core default; the icon is the site setting or the template's own file.
 *
 * Not caught: a template that ships a byte copy of the stock icon under its own folder
 * (JoomlArt T3 `ja_trip` serves Joomla's `favicon.ico` as `/templates/ja_trip/favicon.ico`).
 * Telling that apart needs the file's bytes, which this page cannot read across origins.
 */
const STOCK_ICON_PATHS = [
  '/media/system/images/joomla-favicon.svg',
  '/media/system/images/joomla-favicon-pinned.svg',
  '/media/system/images/favicon.ico',
  '/wp-includes/images/w-logo-blue-white-bg.png',
  '/wp-includes/images/w-logo-blue.png',
]

/** True when the icon URL points at a CMS's stock favicon (a site in a sub-folder included). */
export function isStockFavicon(url: string): boolean {
  let path: string
  try {
    path = new URL(url).pathname.toLowerCase()
  } catch {
    return false
  }
  return STOCK_ICON_PATHS.some(stock => path.endsWith(stock))
}
