/**
 * FAV-1: a customer who uploaded a favicon sees exactly one icon in the tab, theirs; a customer who
 * did not keeps the template's (spec `tasks/spec-template-customization-question-readiness.md`, FAV-1).
 *
 * - The release's EXACT row in `template-profiles.json` says `faviconReady: true`.
 * - The template prints its own icon only where the platform's is absent:
 *   - Joomla T4: the framework drops the old `shortcut icon` when `other_faviconFile` is set, so
 *     `index.php` and `html/layouts/**` must not print an icon `<link>` of their own. `error.php` and
 *     `offline.php` printing one is noted, not failed (one page, not the site).
 *   - Joomla T3: the Claude Cowork plugin removes the template's icon from 0.24.1, so an icon in
 *     `index.php` or a layout fails only when this release pins an older plugin (`quickstarts.json`).
 *   - WordPress: core prints the customer's icon from `site_icon`; a theme file printing an icon
 *     must check `has_site_icon()`, and the theme must not unhook `wp_site_icon` or filter
 *     `get_site_icon_url`.
 *   - EmDash: `EmDashHead` prints the customer's icon; the theme's `<link rel="icon">` must sit
 *     behind `templateIconWanted(settings)` (`src/lib/brand.ts`).
 */
import { coworkPinFor } from '../../contracts.js'
import { PROFILE_ROW_FIX, exactBrandProfile } from '../readers/brand-profile.js'
import { joomlaLogoPlaces } from '../readers/joomla-logo-places.js'
import { UnreadableContent } from '../readers/release-content.js'
import { templateSource } from '../readers/template-source.js'

/** A line that prints an icon `<link>` (one line, as a PHP `?>` inside the tag would end a tag match). */
const ICON_LINE = /<link\b.*\brel\s*=\s*["'](?:shortcut icon|icon|apple-touch-icon)["']/i
const printsIcon = (/** @type {string} */ text) => text.split('\n').some((line) => ICON_LINE.test(line))
/** The first plugin that drops a T3 template's own icon (pr-history, cc #143-144). */
const T3_PLUGIN_FLOOR = [0, 24, 1]

const below = (/** @type {string} */ version, /** @type {number[]} */ floor) => {
  const v = String(version).split('.').map(Number)
  for (let i = 0; i < 3; i += 1) if ((v[i] ?? 0) !== floor[i]) return (v[i] ?? 0) < floor[i]
  return false
}

/**
 * The template's own icon prints that fail, and the notes.
 * @param {import('../index.js').RuleContext} context
 */
async function iconPrints(context) {
  const { platform, tag, version } = context.release
  const source = templateSource(context)
  const fails = []
  const notes = []
  if (platform === 'joomla') {
    const code = await source.texts((n) =>
      /^(index|error|offline|component)\.php$|^html\/layouts\/.+\.php$/.test(n)
    )
    const printing = [...code].filter(([, t]) => printsIcon(t)).map(([n]) => n)
    const pages = printing.filter((n) => /^(error|offline)\.php$/.test(n))
    for (const n of pages) notes.push(`${n} prints the template's own icon on that page only`)
    const site = printing.filter((n) => !pages.includes(n))
    if (site.length) {
      const { framework } = await joomlaLogoPlaces(context)
      const pin = coworkPinFor(tag, version)
      if (framework !== 't3')
        fails.push(`${site.join(', ')} print an icon <link> beside the one T4 prints from other_faviconFile`)
      else if (pin?.version && below(pin.version, T3_PLUGIN_FLOOR))
        fails.push(
          `${site.join(', ')} print an icon <link> and this release pins Claude Cowork ${pin.version}, older than the 0.24.1 that removes it`
        )
      else
        notes.push(
          `${site.join(', ')} print an icon <link>; the Claude Cowork plugin (0.24.1 or later) removes it`
        )
    }
  } else if (platform === 'wordpress') {
    const code = await source.texts((n) => /\.(php|html)$/.test(n))
    for (const [n, t] of code) {
      if (printsIcon(t) && !/has_site_icon\s*\(/.test(t))
        fails.push(`${n} prints an icon <link> without checking has_site_icon()`)
      if (/remove_action\s*\(\s*['"]wp_head['"]\s*,\s*['"]wp_site_icon['"]/.test(t))
        fails.push(`${n} unhooks wp_site_icon`)
      if (/add_filter\s*\(\s*['"]get_site_icon_url['"]/.test(t)) fails.push(`${n} filters get_site_icon_url`)
    }
  } else {
    const code = await source.texts((n) => /^src\/.+\.astro$/.test(n))
    for (const [n, t] of code)
      for (const line of t.split('\n'))
        if (ICON_LINE.test(line) && !/templateIconWanted\s*\(/.test(line))
          fails.push(`${n} prints <link rel="icon"> without templateIconWanted(settings)`)
  }
  return { fails, notes }
}

export const fav1OneFavicon = {
  id: 'FAV-1',
  title: 'A customer who uploaded a favicon sees exactly one icon in the tab, theirs',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name } = context.release
    const { row, problem } = exactBrandProfile(context)
    if (!row)
      return {
        status: 'fail',
        message: `${name} fails FAV-1: ${problem}.`,
        fix: PROFILE_ROW_FIX,
        owner: 'tracy'
      }
    let prints
    try {
      prints = await iconPrints(context)
    } catch (e) {
      const status = e instanceof UnreadableContent ? e.status : 'fail'
      return {
        status,
        message: `${name}: the template's files cannot be read: ${e instanceof Error ? e.message : e}.`
      }
    }
    const problems = [...prints.fails]
    if (row.faviconReady !== true)
      problems.unshift('the row says faviconReady is not true: the template does not show a customer favicon')
    if (problems.length)
      return {
        status: 'fail',
        message: `${name} fails FAV-1: ${problems.join('; ')}.`,
        fix: 'Print the template icon only while the site has no icon of its own (or leave it to the platform), cut a new release, then add its row with "faviconReady": true to apps/tracy-web/src/lib/template-profiles.json.',
        details: prints.notes
      }
    return {
      status: 'pass',
      message: `${name}: the row says faviconReady, and the template prints no second icon beside the customer's.`,
      details: prints.notes
    }
  }
}
