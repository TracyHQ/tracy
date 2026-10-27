/**
 * LOGO-1: a customer who uploaded a logo sees it at the top of the site, and no page keeps the demo
 * logo (spec `tasks/spec-template-customization-question-readiness.md`, LOGO-1).
 *
 * - The release's EXACT row in `template-profiles.json` says `brandReady: true`.
 * - Every place the template shows a logo reads it from settings the writer fills:
 *   - Joomla T4: every site profile holding a logo picture is listed in the row's `profiles`; a
 *     module whose content shows a demo logo picture (a file of a logo key, or another file of the
 *     same logo folder) is the row's `footerSlot`; a logo layout (`html/layouts/**` named logo)
 *     prints no `<img>` with a fixed `src`. T3: the `logoimage` pictures, and the modules, the same way.
 *   - WordPress: logo spots are Site Logo blocks (or the identity `<img>` the theme fills); an Image
 *     block or a fixed `<img>` named logo or brand is the demo's picture; no spot at all is a fail.
 *   - EmDash: logo spots go through `logoSpots`; a fixed `<img>` named logo or brand fails.
 *
 * A logo drawn by CSS (`background-image`) or by script, and pages few people open (error,
 * offline, mail), are not seen by this reading: only a built site shows them.
 */
import { readTables, tableEndingWith } from '../readers/sql-dump.js'
import { PROFILE_ROW_FIX, exactBrandProfile } from '../readers/brand-profile.js'
import { emdashLogoPlaces } from '../readers/emdash-logo-places.js'
import { filledKeys, joomlaLogoPlaces } from '../readers/joomla-logo-places.js'
import { joomlaImageValue } from '../readers/picture-facts.js'
import { UnreadableContent } from '../readers/release-content.js'
import { wordpressLogoPlaces } from '../readers/wordpress-logo-places.js'

const LIVE_NOTE =
  'Only a built site shows a logo drawn by CSS or script, or one left on the error, offline or mail pages.'

/**
 * @param {import('../index.js').RuleContext} context
 * @param {Record<string, any>} row
 */
async function joomlaProblems(context, row) {
  const places = await joomlaLogoPlaces(context)
  const problems = []
  const pictures = []
  if (places.framework === 't4') {
    const declared = new Set(Array.isArray(row.profiles) ? row.profiles : [])
    for (const p of places.t4) {
      const filled = filledKeys(p)
      pictures.push(...filled.map(([, v]) => joomlaImageValue(v).file))
      if (filled.length && !declared.has(p.name))
        problems.push(
          `site profile etc/site/${p.name}.json holds a logo (${filled.map(([k]) => k).join(', ')}) but is not in the row's profiles`
        )
    }
  } else
    for (const s of places.t3)
      if (String(s.params.logoimage ?? '').trim()) pictures.push(joomlaImageValue(s.params.logoimage).file)
  for (const [path, bytes] of places.files) {
    if (!/^html\/layouts\/.*logo[^/]*\.php$/i.test(path)) continue
    for (const tag of bytes.toString('utf8').match(/<img\b[^>]*>/gi) ?? [])
      if (/\ssrc\s*=\s*["'](?!\s*<\?)[^"']+["']/i.test(tag))
        problems.push(`${path} prints a fixed <img> in the logo place`)
  }
  // The demo logo pictures, and the other files of a folder that holds only logos.
  const files = new Set(pictures)
  const folders = new Set(
    pictures.map((f) => f.slice(0, f.lastIndexOf('/') + 1)).filter((d) => /\/logos?\/$/i.test(d))
  )
  const isDemoLogo = (/** @type {string} */ src) => {
    const file = decodeURIComponent(src.split(/[?#]/)[0]).replace(/^\/+/, '')
    return files.has(file) || [...folders].some((d) => file.startsWith(d))
  }
  const footer = typeof row.footerSlot === 'string' ? row.footerSlot.split('.')[0] : null
  const tables = readTables(await context.content.sql(), (n) => n.endsWith('_modules'))
  for (const m of tableEndingWith(tables, 'modules')?.rows ?? []) {
    if (Number(m.client_id) !== 0 || Number(m.published) !== 1) continue
    const srcs = [...String(m.content ?? '').matchAll(/<img\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)].map(
      (x) => x[1]
    )
    const demo = srcs.filter(isDemoLogo)
    if (demo.length && `module-${m.id}` !== footer)
      problems.push(
        `module ${m.id} "${m.title}" (${m.position}) shows the demo logo ${demo[0]} but is not the row's footerSlot`
      )
  }
  return problems
}

export const logo1CustomerLogo = {
  id: 'LOGO-1',
  title: 'A customer who uploaded a logo sees it at the top of the site, and no page keeps the demo logo',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform } = context.release
    const { row, problem } = exactBrandProfile(context)
    if (!row)
      return {
        status: 'fail',
        message: `${name} fails LOGO-1: ${problem}.`,
        fix: PROFILE_ROW_FIX,
        owner: 'tracy'
      }
    const problems = []
    if (row.brandReady !== true)
      problems.push('the row says brandReady is not true: the template does not show a customer logo')
    try {
      if (platform === 'joomla') problems.push(...(await joomlaProblems(context, row)))
      else if (platform === 'wordpress') {
        const { spots, hardcoded } = await wordpressLogoPlaces(context)
        problems.push(...hardcoded.map((h) => `${h} draws the demo logo`))
        if (!spots.length) problems.push('no Site Logo block (or identity logo) is served anywhere')
      } else {
        const { spots, hardcoded } = await emdashLogoPlaces(context)
        problems.push(...hardcoded.map((h) => `${h} draws the demo logo`))
        if (!spots.length) problems.push('no component shows the logo through logoSpots()')
      }
    } catch (e) {
      const status = e instanceof UnreadableContent ? e.status : 'fail'
      return {
        status,
        message: `${name}: the template's logo places cannot be read: ${e instanceof Error ? e.message : e}.`
      }
    }
    if (problems.length)
      return {
        status: 'fail',
        message: `${name} fails LOGO-1: ${problems.join('; ')}.`,
        fix: `Show every logo from the settings the writer fills (${
          platform === 'joomla'
            ? 'T4 site profiles and the footer image slot'
            : platform === 'wordpress'
              ? 'a Site Logo block in every header and footer part'
              : 'logoSpots() in every component that shows the logo'
        }), cut a new release, then add its row with "brandReady": true and every logo profile to apps/tracy-web/src/lib/template-profiles.json.`,
        details: [LIVE_NOTE]
      }
    return {
      status: 'pass',
      message: `${name}: the row says brandReady, and every logo place found reads the customer's logo.`,
      details: [LIVE_NOTE]
    }
  }
}
