/**
 * MODE-3: a template that supports both a light and a dark scheme gets the Light | Dark choice in the
 * Add site design-system popup.
 *
 * The popup shows that choice only when the template's slot contract wears both sides of its
 * light/dark switch (`modes: true`, read by `lib/ds-slot.js` `modesOf`; the preview door then sends
 * `x-tracy-ds-modes: both` and the running site's design-system read says `modes`). A template that
 * has two schemes while its contract keeps one look shows the customer only one of them, and the
 * preview never lets them see what their dark (or light) visitors will get.
 *
 * "Supports both" is read from what the release and this server carry, never guessed:
 *   - the contract carries a dark palette of the template (`darkTokens`);
 *   - the measurement of this version found a light/dark switch (`themeToggle`) or ran a second mode
 *     (`modes` lists `derived`);
 *   - the template's own stylesheets paint a dark scheme (a `darkmode.css` / `dark-mode.css` file, or a
 *     `[data-theme=dark]` selector; Bootstrap's `data-bs-theme` is not the template's), unless the
 *     release leaves that scheme dormant: a JA Joomla template whose every site profile
 *     (`etc/site/*.json`) says `other_darkmode` off AND `other_default_theme` light never loads its
 *     dark stylesheet and shows no switch (JA Resort 2.3.2+, "ship light only"; dot 3, 19/10/2026).
 *     A profile that leaves either key out is the JA default (switch on, scheme auto): not dormant.
 * None of these: one look, not applicable. No slot contract: SLOT-1 says so, not applicable here.
 */
import { modesOf } from '../../ds-slot.js'
import { measurementOf } from '../readers/measurement.js'
import { releaseFiles, stylesheetsOf } from '../readers/release-files.js'
import { slotOf } from '../readers/slot.js'

const DARK_FILE = /(^|\/)dark-?mode\.css$/i
const DARK_SELECTOR = /\[data-theme\s*=\s*["']?dark["']?\s*\]/i

const SITE_PROFILE = /^etc\/site\/[^/]+\.json$/i
const OFF = new Set(['0', '', 'false', 'off', 'no'])

/**
 * Whether the release ships its dark scheme switched off: every site profile of the template
 * (`etc/site/*.json`, the T4 "site" settings its index.php reads) sets `other_darkmode` off and
 * `other_default_theme` light, so the page never loads the dark stylesheet nor offers a switch.
 * No profile, or one that leaves either key out (the JA default is switch on, scheme auto): not dormant.
 * @param {Map<string, string>} files template files keyed by their path inside the template
 */
export function darkSchemeDormant(files) {
  const profiles = [...files].filter(([name]) => SITE_PROFILE.test(name))
  if (!profiles.length) return false
  return profiles.every(([, text]) => {
    let doc
    try {
      doc = JSON.parse(text)
    } catch {
      return false
    }
    if (!doc || typeof doc !== 'object' || !('other_darkmode' in doc) || !('other_default_theme' in doc))
      return false
    return (
      OFF.has(String(doc.other_darkmode).trim().toLowerCase()) &&
      String(doc.other_default_theme).trim() === 'light'
    )
  })
}

/**
 * What says the template has a dark scheme in its own stylesheets, or null. A release whose files
 * cannot be read here (an Akeeba bundle, no archive) says nothing, so it falls to the other signals.
 * @param {import('../index.js').RuleContext} context
 */
async function darkStylesheetOf(context) {
  try {
    const files = await releaseFiles(context)
    if (darkSchemeDormant(files.files)) return null
    const sheets = stylesheetsOf(files)
    const named = sheets.find(([name]) => DARK_FILE.test(name))
    if (named) return named[0]
    return sheets.find(([, text]) => DARK_SELECTOR.test(text))?.[0] ?? null
  } catch {
    return null
  }
}

/**
 * The contract's dark palette as a reason for both schemes, or null when it carries none.
 * @param {Pick<import('../readers/slot.js').Slot, 'name' | 'contract'>} slot
 */
export function darkPaletteWhy(slot) {
  return Object.keys(slot.contract?.darkTokens ?? {}).length
    ? `its contract ${slot.name} carries a dark palette (darkTokens)`
    : null
}

/**
 * Why the template supports both schemes, one line each; empty: one look.
 * @param {import('../index.js').RuleContext} context
 * @param {import('../readers/slot.js').Slot} slot
 */
async function bothSchemesWhy(context, slot) {
  const why = []
  const palette = darkPaletteWhy(slot)
  if (palette) why.push(palette)
  const { measured } = await measurementOf(context)
  if (measured?.doc.themeToggle === true)
    why.push(`the measurement of ${measured.doc.version} found a light/dark switch`)
  else if (Array.isArray(measured?.doc.modes) && measured.doc.modes.includes('derived'))
    why.push(`the measurement of ${measured.doc.version} ran its second mode`)
  const sheet = await darkStylesheetOf(context)
  if (sheet) why.push(`its stylesheet ${sheet} paints a dark scheme`)
  return why
}

/** @type {import('../index.js').Rule} */
export const mode3PopupOffersBoth = {
  id: 'MODE-3',
  title: 'The Add site popup offers Light | Dark for a template with both schemes',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: 'contract',
  async run(context) {
    const slot = await slotOf(context)
    const name = context.release.name
    if (!slot.name)
      return {
        status: 'not-applicable',
        message: `${name} has no slot contract, so the popup offers no design system to preview (SLOT-1).`
      }
    const offers = modesOf(slot.name)
    const why = await bothSchemesWhy(context, slot)
    if (offers)
      return {
        status: 'pass',
        message: `The popup offers Light | Dark for ${name}: contract ${slot.name} wears both sides of its light/dark switch (modes: true).`
      }
    if (!why.length)
      return {
        status: 'not-applicable',
        message: `${name} has one look (no dark palette, no light/dark switch measured, no dark stylesheet), so the popup needs no Light | Dark choice.`
      }
    return {
      status: 'fail',
      message: `${name} supports both a light and a dark scheme (${why.join('; ')}), but the Add site popup shows no Light | Dark choice: contract ${slot.name} keeps one look (no modes: true).`,
      fix: `In packages/design/tracy-ds-slot/templates/${slot.name}.json, set modes: true and make the emitter write the system's own side under the template's matching scheme and the other side derived from it (as joomla-tracy-business and wordpress-tracy-base do), keep the template's light/dark switch shown (MODE-2), then measure both modes again with the tdsr skill.`,
      details: why
    }
  }
}
