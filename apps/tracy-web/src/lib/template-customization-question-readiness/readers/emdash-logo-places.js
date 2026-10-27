/**
 * Where an EmDash theme shows a logo, read from its `src/` (REL-3, LOGO-1, LOGO-2, LOGO-3):
 *
 * - a spot is a `logoSpots(logos, 'themed' | 'dark')` call (`src/lib/brand.ts`): `themed` follows
 *   the site theme and takes both logos, `dark` is dark in both themes and takes the dark one.
 *   The `imgClass` of the `BrandLogo` it feeds is how tall the picture may be.
 * - a hard-coded logo is an `<img>` with a fixed `src` whose class or alt names a logo or a brand.
 * - the theme has a dark mode when its source sets or reads `data-theme`.
 * - `personalize`: the theme's `seed/personalize.json`, where the dark logo's field is declared.
 */
import { templateSource } from './template-source.js'

/**
 * @typedef {{ file: string, mode: string, imgClass: string }} EmDashLogoSpot
 */

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<{ spots: EmDashLogoSpot[], hardcoded: string[], darkMode: boolean, personalize: any, texts: Map<string, string> }>}
 */
export async function emdashLogoPlaces(context) {
  const texts = await templateSource(context).texts((n) =>
    /^(src\/.+\.(astro|ts|css)|seed\/personalize\.json)$/.test(n)
  )
  /** @type {EmDashLogoSpot[]} */
  const spots = []
  const hardcoded = []
  for (const [file, text] of texts) {
    if (!file.endsWith('.astro')) continue
    for (const m of text.matchAll(/logoSpots\(\s*[\w.]+\s*,\s*["'](\w+)["']\s*\)\s*\}([^>]*)>/g)) {
      const imgClass = /imgClass\s*=\s*["']([^"']*)["']/.exec(m[2])?.[1] ?? ''
      spots.push({ file, mode: m[1], imgClass })
    }
    for (const tag of text.match(/<img\b[^>]*>/gi) ?? []) {
      const src = /\ssrc\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2]
      const words = `${/\sclass\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ?? ''} ${/\salt\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ?? ''}`
      if (src && /logo|brand/i.test(words)) hardcoded.push(`${file}: <img src="${src}">`)
    }
  }
  const darkMode = [...texts.values()].some((t) => /data-theme/.test(t))
  let personalize = null
  try {
    personalize = JSON.parse(texts.get('seed/personalize.json') ?? 'null')
  } catch {
    personalize = null
  }
  return { spots, hardcoded, darkMode, personalize, texts }
}
