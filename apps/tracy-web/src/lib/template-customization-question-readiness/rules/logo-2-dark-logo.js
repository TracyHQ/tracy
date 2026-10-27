/**
 * LOGO-2: in dark mode every place with a logo shows the dark logo the customer uploaded, never a
 * recoloured one (spec `tasks/spec-template-customization-question-readiness.md`, LOGO-2).
 *
 * Two readings of the template's own files:
 *
 * - A dark spot for every logo spot that follows the mode. Joomla T4 with dark mode on: each site
 *   profile holding a logo also has the `site_logo_dark` key (its own, or the default profile's),
 *   and a footer image slot (`footerSlot`) is printed by a Custom module layout that pairs it with
 *   `site_logo_dark` (`html/mod_custom/*.php`). T3 `logos: pair`: a style carries `logoimage_dark`.
 *   WordPress with a dark mode (`data-tracy-theme-toggle`): each part with a light logo spot also
 *   has a dark one, and the row says `darkLogo: true`. EmDash with `data-theme`: the dark logo's
 *   field is declared (`seed/personalize.json` `brand.logoDark`).
 * - No recolouring: no dark-mode CSS rule puts `filter`, `invert()`, `brightness()` or
 *   `content: url()` on a selector that catches any logo (`.logo img`, `.navbar-brand img`,
 *   `.wp-block-site-logo img`, `img.logo-img`). A rule keyed to a demo file name (`[src*=…]`) passes:
 *   an uploaded logo always has a new name (`images/tracy-brand/<role>-<sha>-<stamp>.png`).
 *
 * Which rule wins in the browser, a script that swaps `src`, and an inline SVG logo coloured by
 * `fill` are only seen on a built site.
 */
import { exactBrandProfile, PROFILE_ROW_FIX } from '../readers/brand-profile.js'
import { cssRules, inDarkMode } from '../readers/css-rules.js'
import { emdashLogoPlaces } from '../readers/emdash-logo-places.js'
import { filledKeys, joomlaLogoPlaces } from '../readers/joomla-logo-places.js'
import { UnreadableContent } from '../readers/release-content.js'
import { templateSource } from '../readers/template-source.js'
import { wordpressLogoPlaces } from '../readers/wordpress-logo-places.js'

const LOGO_SELECTOR = /logo|navbar-brand|site-brand|brand-mark/i
const RECOLOUR = /(?:^|[;\s{])(?:-webkit-)?filter\s*:(?!\s*none)|invert\(|brightness\(|content\s*:\s*url\(/i
const BY_FILE = /\[src\s*[*$^|~]?=/i
const LIVE_NOTE =
  'Only a built site shows which CSS rule wins, a script that swaps the picture, or an inline SVG logo coloured by fill.'

/** Dark-mode rules that recolour any logo, as "file: selector". */
async function recolouring(/** @type {import('../index.js').RuleContext} */ context) {
  const sheets = await templateSource(context).texts(
    (n) => n.endsWith('.css') && !/(^|\/)(node_modules|vendor)\//.test(n)
  )
  const out = []
  for (const [file, css] of sheets)
    for (const r of cssRules(css))
      for (const selector of r.selector.split(','))
        if (
          inDarkMode({ ...r, selector }) &&
          LOGO_SELECTOR.test(selector) &&
          !BY_FILE.test(selector) &&
          RECOLOUR.test(r.body)
        )
          out.push(`${file}: ${selector.trim()}`)
  return out
}

/** @param {import('../index.js').RuleContext} context @param {Record<string, any>} row */
async function missingDarkSpots(context, row) {
  const { platform } = context.release
  const out = []
  if (platform === 'joomla') {
    const places = await joomlaLogoPlaces(context)
    if (places.framework === 't4' && places.t4.some((p) => p.darkMode)) {
      const fallback = places.t4.find((p) => p.name === 'default')
      for (const p of places.t4)
        if (
          filledKeys(p).some(([k]) => !k.includes('dark')) &&
          !('site_logo_dark' in p.keys) &&
          !(fallback && 'site_logo_dark' in fallback.keys)
        )
          out.push(
            `site profile etc/site/${p.name}.json shows a logo in dark mode with no site_logo_dark key`
          )
      if (typeof row.footerSlot === 'string') {
        const layouts = [...places.files].filter(([n]) => /^html\/mod_custom\/[^/]+\.php$/.test(n))
        if (!layouts.some(([, b]) => b.toString('utf8').includes('site_logo_dark')))
          out.push(
            `the footer logo (${row.footerSlot}) has no Custom module layout pairing it with site_logo_dark`
          )
      }
    }
    if (
      places.framework === 't3' &&
      row.logos === 'pair' &&
      !places.t3.some((s) => 'logoimage_dark' in s.params)
    )
      out.push('no template style carries logoimage_dark')
  } else if (platform === 'wordpress') {
    const { spots, darkMode } = await wordpressLogoPlaces(context)
    if (darkMode) {
      const parts = new Set(spots.filter((s) => s.tone !== 'dark').map((s) => s.where))
      for (const where of parts)
        if (!spots.some((s) => s.where === where && s.tone === 'dark'))
          out.push(`${where} has no dark logo spot`)
      if (spots.some((s) => s.tone === 'dark') && row.darkLogo !== true)
        out.push('the row lacks "darkLogo": true')
    }
  } else {
    const { spots, darkMode, personalize } = await emdashLogoPlaces(context)
    if ((darkMode || spots.some((s) => s.mode === 'dark')) && !personalize?.brand?.logoDark)
      out.push('seed/personalize.json declares no brand.logoDark')
  }
  return out
}

export const logo2DarkLogo = {
  id: 'LOGO-2',
  title: 'In dark mode every logo place shows the dark logo the customer uploaded, never a recoloured one',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name } = context.release
    const { row, problem } = exactBrandProfile(context)
    if (!row)
      return {
        status: 'fail',
        message: `${name} fails LOGO-2: ${problem}.`,
        fix: PROFILE_ROW_FIX,
        owner: 'tracy'
      }
    let missing
    let filters
    try {
      missing = await missingDarkSpots(context, row)
      filters = await recolouring(context)
    } catch (e) {
      const status = e instanceof UnreadableContent ? e.status : 'fail'
      return {
        status,
        message: `${name}: the template's logo places cannot be read: ${e instanceof Error ? e.message : e}.`
      }
    }
    const problems = [...missing, ...filters.map((f) => `${f} recolours every logo in dark mode`)]
    if (problems.length)
      return {
        status: 'fail',
        message: `${name} fails LOGO-2: ${problems.join('; ')}.`,
        fix: `Give every logo place that follows the mode a dark-logo place (${
          context.release.platform === 'joomla'
            ? 'T4 site_logo_dark and a paired footer layout, T3 logoimage_dark'
            : context.release.platform === 'wordpress'
              ? 'a Site Logo block with the *-logo--dark class'
              : 'brand.logoDark in seed/personalize.json'
        }), drop filter/invert/content:url() from selectors that catch any logo (key them to the demo file name instead), and cut a new release.`,
        details: [LIVE_NOTE]
      }
    return {
      status: 'pass',
      message: `${name}: every logo place that follows the mode has a dark-logo place, and no dark-mode rule recolours a logo.`,
      details: [LIVE_NOTE]
    }
  }
}
