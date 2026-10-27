/**
 * REL-3: the Logo question asks for the kind of logo the template uses: both a light and a dark one
 * (`pair`), only the dark-background one (`dark`), or only a light-background one (`single`)
 * (spec `tasks/spec-template-customization-question-readiness.md`, REL-3).
 *
 * The question is drawn from the `logos` of the release's EXACT row in `template-profiles.json`.
 * The rule reads the layout off the template's own files and compares:
 *
 * - Joomla: `rel-3-joomla-logo-layout.js` (T4 site profiles, T3 template styles, demo pictures).
 * - WordPress: the Site Logo spots of the served markup, by the `*-logo--dark` / `*-logo--light`
 *   class convention; a dark spot also needs `darkLogo: true` on the row, or the writer never puts
 *   the dark logo there.
 * - EmDash: `logoSpots(logos, 'themed')` takes both logos, `logoSpots(logos, 'dark')` only the dark
 *   one; a dark spot needs `seed/personalize.json` `brand.logoDark`.
 *
 * Fails when: there is no exact row (or only a borrowed lower one); the row's `logos` is not one of
 * the three; the layout read differs from it; WordPress has a dark spot without `darkLogo`; EmDash
 * has a dark spot without `brand.logoDark`. A row that lists `logos` as unverified is a warning
 * (`live-only`), not a failure (the spec's JA Mood and JA Donate), unless the files show another
 * layout (JA Resort's old `pair` row was unverified too). A layout the files cannot tell (a text
 * logo, a picture that cannot be read) is `live-only` as well. Whether the logo asked for really
 * shows somewhere is only seen on a built site.
 */
import { LOGO_LAYOUTS } from '../../template-profiles.js'
import { PROFILE_ROW_FIX, exactBrandProfile } from '../readers/brand-profile.js'
import { emdashLogoPlaces } from '../readers/emdash-logo-places.js'
import { MissingPictureLibraryError } from '../readers/picture-facts.js'
import { UnreadableContent } from '../readers/release-content.js'
import { wordpressLogoPlaces } from '../readers/wordpress-logo-places.js'
import { joomlaLogoLayout } from './rel-3-joomla-logo-layout.js'

const ROW_FIX = (/** @type {string} */ layout) =>
  `Set "logos": "${layout}" on this release's row in apps/tracy-web/src/lib/template-profiles.json (repo tch).`

/**
 * @param {import('../index.js').RuleContext} context
 * @param {Record<string, any>} row
 * @returns {Promise<{ layout: string | null, reasons: string[], problems: { message: string, fix: string, owner: string }[] }>}
 */
async function readLayout(context, row) {
  const { platform } = context.release
  if (platform === 'joomla') return { ...(await joomlaLogoLayout(context)), problems: [] }
  const problems = []
  if (platform === 'wordpress') {
    const { spots, darkMode } = await wordpressLogoPlaces(context)
    const tones = new Set(spots.map((s) => s.tone))
    const reasons = spots.map((s) => `${s.where}: ${s.block} "${s.className}" (${s.tone})`)
    if (tones.has('dark') && row.darkLogo !== true)
      problems.push({
        message:
          'the theme has a dark-background logo spot but the row lacks "darkLogo": true, so the dark logo is never written there',
        fix: 'Add "darkLogo": true to the row in apps/tracy-web/src/lib/template-profiles.json (repo tch).',
        owner: 'tracy'
      })
    if (tones.has('dark') && tones.has('light')) return { layout: 'pair', reasons, problems }
    if (tones.has('dark')) return { layout: 'dark', reasons, problems }
    if (spots.length && darkMode)
      return { layout: 'pair', reasons: [...reasons, 'the theme has a dark mode'], problems }
    return {
      layout: null,
      reasons: spots.length
        ? [...reasons, 'no class tells the background of these spots']
        : ['no Site Logo spot was found'],
      problems
    }
  }
  const { spots, personalize } = await emdashLogoPlaces(context)
  const modes = new Set(spots.map((s) => s.mode))
  const reasons = spots.map((s) => `${s.file}: logoSpots(…, "${s.mode}")`)
  if (spots.length && !personalize?.brand?.logoDark)
    problems.push({
      message: 'seed/personalize.json declares no brand.logoDark, so the dark logo has no field to land in',
      fix: 'Declare brand.logoDark in seed/personalize.json of the theme and cut a new release.',
      owner: 'template'
    })
  if (modes.has('themed')) return { layout: 'pair', reasons, problems }
  if (modes.has('dark')) return { layout: 'dark', reasons, problems }
  return { layout: null, reasons: ['no logoSpots() call was found in src/'], problems }
}

export const rel3LogoLayout = {
  id: 'REL-3',
  title: 'The Logo question asks for the kind of logo the template uses',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('tracy'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name } = context.release
    const { row, problem } = exactBrandProfile(context)
    if (!row) return { status: 'fail', message: `${name} fails REL-3: ${problem}.`, fix: PROFILE_ROW_FIX }
    if (!LOGO_LAYOUTS.includes(row.logos))
      return {
        status: 'fail',
        message: `${name} fails REL-3: the row's logos is ${JSON.stringify(row.logos)}, not one of ${LOGO_LAYOUTS.join(', ')}.`,
        fix: PROFILE_ROW_FIX
      }
    let read
    try {
      read = await readLayout(context, row)
    } catch (e) {
      // A missing picture library stops the whole check (index.js), never this rule alone.
      if (e instanceof MissingPictureLibraryError) throw e
      const status = e instanceof UnreadableContent ? e.status : 'fail'
      return {
        status,
        message: `${name}: the template's logo spots cannot be read: ${e instanceof Error ? e.message : e}.`
      }
    }
    const details = read.reasons
    if (read.layout !== null && read.layout !== row.logos)
      return {
        status: 'fail',
        message: `${name} fails REL-3: the row says logos "${row.logos}" but the template shows "${read.layout}" (${read.reasons.join('; ')}).`,
        fix: ROW_FIX(read.layout),
        details
      }
    if (read.problems.length)
      return {
        status: 'fail',
        message: `${name} fails REL-3: ${read.problems.map((p) => p.message).join('; ')}.`,
        fix: read.problems.map((p) => p.fix).join(' '),
        owner: /** @type {any} */ (read.problems[0].owner),
        details
      }
    if (Array.isArray(row.unverified) && row.unverified.includes('logos'))
      return {
        status: 'live-only',
        message: `${name}: the row's logos "${row.logos}" is marked unverified (the files read ${read.layout ? `"${read.layout}"` : 'no layout'}); check it on a built site, then drop "logos" from unverified.`,
        details
      }
    if (read.layout === null)
      return {
        status: 'live-only',
        message: `${name}: the template's files do not tell its logo layout (${read.reasons.join('; ')}); the row says "${row.logos}", check it on a built site.`,
        details
      }
    return {
      status: 'pass',
      message: `${name}: the Logo question asks for "${row.logos}", the layout the template shows.`,
      details: [...details, 'Only a built site shows that the logo asked for really appears.']
    }
  }
}
