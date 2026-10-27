/**
 * Where a WordPress theme shows a logo, in the markup a visitor is served (`wordpress-theme-parts.js`),
 * for REL-3, LOGO-1, LOGO-2 and LOGO-3:
 *
 * - a spot is a core Site Logo block, or an `<img data-tracy-identity="site.logo|site.logoDark">`
 *   the theme fills from `tracy_site_identity` (Tracy Business). Its tone follows the class
 *   convention of the themes' `inc/brand-logo.php`: `tracy-logo-dark` / `*-logo--dark` is the
 *   dark-background spot, `tracy-logo-fallback` / `*-logo--light` (and `tracy-logo`) the light one.
 * - a hard-coded logo is a core Image block, or an `<img>` with a fixed `src`, whose class names a
 *   logo or a brand: it shows the demo's picture whatever the customer gave.
 * - the theme has a dark mode when its files or markup carry the toggle `data-tracy-theme-toggle`.
 */
import { blocksOf } from '../site-pages/wordpress-blocks.js'
import { templateSource } from './template-source.js'
import { wordpressServedMarkup } from './wordpress-theme-parts.js'

/**
 * @typedef {{ where: string, block: string, className: string, tone: 'light' | 'dark' | 'any', width: number | null }} WordPressLogoSpot
 */

const DARK_CLASS = /(?:^|\s)(?:tracy-logo-dark|[\w-]*logo--dark)(?=\s|$)/
const LIGHT_CLASS = /(?:^|\s)(?:tracy-logo-fallback|tracy-logo|[\w-]*logo--light)(?=\s|$)/
const LOGO_WORD = /logo|brand/i

/** @param {string} className */
export const toneOf = (className) =>
  DARK_CLASS.test(className) ? 'dark' : LIGHT_CLASS.test(className) ? 'light' : 'any'

/** The attributes of one HTML tag, as a plain object (enough for class, src, data-*). */
function attributesOf(/** @type {string} */ tag) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g))
    out[m[1].toLowerCase()] = m[3] ?? m[4] ?? ''
  return out
}

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<{ spots: WordPressLogoSpot[], hardcoded: string[], darkMode: boolean, options: Record<string, string> }>}
 */
export async function wordpressLogoPlaces(context) {
  const { markup, options } = await wordpressServedMarkup(context)
  /** @type {WordPressLogoSpot[]} */
  const spots = []
  const hardcoded = []
  for (const m of markup) {
    const where = `${m.kind} "${m.slug}" (${m.from === 'database' ? 'demo database' : 'theme file'})`
    for (const b of blocksOf(m.content)) {
      if (b.close) continue
      const className = String(b.attrs.className ?? '')
      if (b.name === 'core/site-logo')
        spots.push({
          where,
          block: 'core/site-logo',
          className,
          tone: toneOf(className),
          width: Number(b.attrs.width) > 0 ? Number(b.attrs.width) : null
        })
      else if (b.name === 'core/image' && LOGO_WORD.test(className))
        hardcoded.push(`${where}: an Image block "${className}"`)
    }
    for (const tag of m.content.match(/<img\b[^>]*>/gi) ?? []) {
      const a = attributesOf(tag)
      const identity = a['data-tracy-identity'] ?? ''
      if (/^site\.logo(Dark)?$/.test(identity)) {
        const className = a.class ?? ''
        const tone = identity === 'site.logoDark' ? 'dark' : toneOf(className) === 'dark' ? 'dark' : 'light'
        spots.push({ where, block: `img ${identity}`, className, tone, width: Number(a.width) || null })
      } else if (LOGO_WORD.test(`${a.class ?? ''} ${a.alt ?? ''}`) && (a.src ?? '').trim() !== '')
        hardcoded.push(`${where}: <img src="${a.src}">`)
    }
  }
  let darkMode = markup.some((m) => m.content.includes('data-tracy-theme-toggle'))
  if (!darkMode)
    try {
      const code = await templateSource(context).texts((n) => /\.(php|html|js)$/.test(n))
      darkMode = [...code.values()].some((t) => t.includes('data-tracy-theme-toggle'))
    } catch {
      // The theme's own files cannot be read: the served markup is all that is known.
    }
  return { spots, hardcoded, darkMode, options }
}
