/**
 * The Joomla writer behind `setSiteBrand` (`brand.js`; plan T11, T19, T20).
 *
 *   name     Global Configuration `sitename` through the plugin's `site.identity` (Claude Cowork for Joomla 0.22.0+): the
 *            name a page's <title> falls back to, the T3/T4 text logo's fallback, and the name in Joomla's own mail. A name
 *            the customer gave also turns the site name on in every page title (0.24.5+, `joomla-page-titles.js`, D1).
 *   logo     T3: every template style's params (`brand-joomla-t3.js`). T4: the site profile files through
 *            `template.siteSettings` (0.23.0+, `brand-joomla-t4.js`). Both: the footer image slot of the contract,
 *            when the template profile names one (`footerSlot`), with the logo padded to that slot's `frame`.
 *   favicon  `other_faviconFile` through `template.siteSettings`: a T4 profile key, or the plugin's own favicon file for a
 *            T3 template (0.23.0+).
 *
 * No logo given: every logo spot is left as the template has it (LOGO-4 dropped, 09/10/2026).
 *
 * An older plugin does not know an action, so its write is skipped as "plugin too old", never tried blind; what the
 * plugin it has can do still runs (a T3 logo needs nothing new).
 * 🔒 THE UNDO IS THE PLUGIN'S: every write is recorded under the brand apply id (the footer slot under its own
 * `contract-` id, which the Apply door records too), so `apply.revert` takes the brand back.
 */
import {
  darkSpotsOf,
  placeFooterLogo,
  roleOf,
  templateFolderOf,
  uploader,
  variantFor
} from './brand-joomla-places.js'
import { writeDemoAuthorName } from './brand-joomla-author.js'
import { logoForSlot, nameForDemoLogos } from './brand-joomla-logo-fallback.js'
import { writeT3Styles } from './brand-joomla-t3.js'
import { writeT4Profiles } from './brand-joomla-t4.js'
import { PAGE_TITLES_SINCE, writePageTitles } from './joomla-page-titles.js'

/** The first plugin release that has `site.identity`. */
export const SITE_IDENTITY_SINCE = '0.22.0'
/** The first plugin release that has `template.siteSettings`. */
export const TEMPLATE_SETTINGS_SINCE = '0.23.0'

const TOO_OLD = 'plugin too old'
/** What the customer reads when the design will not show what was written (the row's `brandReady`/`faviconReady`). */
const NOT_SHOWN = Object.freeze({
  logo: 'this design does not show a logo yet',
  favicon: 'this design does not show a favicon yet'
})
/** `x.y.z` (a leading `v` and a suffix allowed) as three numbers, or null. */
function semverOf(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? ''))
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** True when `version` is `since` or later; null when `version` cannot be read. */
export function atLeast(version, since = SITE_IDENTITY_SINCE) {
  const have = semverOf(version)
  const want = semverOf(since)
  if (have === null || want === null) return null
  for (let i = 0; i < 3; i += 1) if (have[i] !== want[i]) return have[i] > want[i]
  return true
}

/** True when a refusal says the plugin does not know the action. */
const unknownAction = (/** @type {any} */ answer) =>
  answer?.error === 'bad_action' || /unknown action/i.test(String(answer?.message ?? ''))

/**
 * The site's name, logo and favicon, then the demo Super User's display name, which takes the name the site ends up with
 * (`brand-joomla-author.js`).
 * @param {import('./brand.js').BrandWriterInput} input
 */
export async function writeJoomlaBrand(input) {
  await writeSiteBrand(input)
  const { prepared, read, write, wrote, skip } = input
  await writeDemoAuthorName({ name: prepared.name, read, write, wrote, skip })
}

/** @param {import('./brand.js').BrandWriterInput} input */
async function writeSiteBrand({ prepared, profile, stamp, write, read, wrote: told, skip }) {
  /** @type {Set<string>} */
  const written = new Set()
  const wrote = (/** @type {string} */ where) => {
    written.add(where)
    told(where)
  }
  const logos = prepared.logo ?? {}
  const anyLogo = Object.keys(logos).length > 0
  // A brief build with no logo shows the name as text on every logo spot (site plan, #193).
  const textLogo = prepared.textLogo === true && !anyLogo
  const name = typeof prepared.name === 'string' ? prepared.name.trim() : ''
  // A brief build: a logo spot its logo does not reach shows the name as text, never the template's logo (#193).
  const nameFallback = prepared.nameFallback === true && name !== ''
  const folder = templateFolderOf(profile?.release)
  if (!profile?.framework || !folder) {
    if (anyLogo) skip('logo', 'Tracy does not know where this design shows a logo yet')
    if (prepared.favicon) skip('favicon', 'Tracy does not know where this design shows a favicon yet')
  }
  if (!name && !(profile?.framework && folder && (anyLogo || textLogo || prepared.favicon))) return

  // The plugin's own version, read first: a plugin that answers nothing readable is tried, and its refusal decides.
  const info = await read('info', {}).catch(() => null)
  const component = info?.ok === false ? null : info?.info?.component
  const named = name ? await writeSitename({ name, component, write, wrote, skip }) : false
  // A name the site address stands in for (`nameGiven: false`) is no answer: the template's page titles stay. So do they on a
  // plugin older than the key, without a word to the customer: it is the template's own setting, nothing they can act on.
  if (named && prepared.nameGiven !== false && atLeast(component, PAGE_TITLES_SINCE) === true)
    await writePageTitles({ name, write, read, wrote, skip })
  if (!profile?.framework || !folder || (!anyLogo && !prepared.favicon && !name)) return

  const upload = uploader(
    { write, stamp, skip },
    { 'logo-light': logos.light, 'logo-dark': logos.dark, logo: logos.single, favicon: prepared.favicon }
  )
  const settingsKnown = atLeast(component, TEMPLATE_SETTINGS_SINCE) !== false
  /** The `template.siteSettings` read, or null after the skips it calls for. */
  const readSettings = async () => {
    const answer = settingsKnown
      ? await read('template.siteSettings', { template: folder }).catch((error) => ({
          ok: false,
          message: String(error)
        }))
      : { ok: false, error: 'bad_action' }
    if (answer?.ok !== false) return answer
    const why = unknownAction(answer)
      ? TOO_OLD
      : `the site's template settings could not be read (${answer.message ?? answer.error})`
    if (profile.framework === 't4' && anyLogo) skip('logo', why)
    if (prepared.favicon) skip('favicon', why)
    return null
  }

  let used = new Set()
  let header = false
  if (profile.framework === 't3') {
    used = await writeT3Styles({
      folder,
      profile,
      name,
      logos,
      textLogo,
      nameFallback,
      upload,
      read,
      write,
      wrote,
      skip
    })
    header = used.size > 0
    if (prepared.favicon && (await readSettings()))
      await writeT3Favicon({ folder, upload, write, wrote, skip })
  } else if (anyLogo || textLogo || prepared.favicon || name) {
    const settings = await readSettings()
    if (settings) {
      const favicon = prepared.favicon ? await upload('favicon', 'favicon') : null
      let result = await writeT4Profiles({
        folder,
        profile,
        name,
        logos,
        textLogo,
        nameFallback,
        favicon,
        settings,
        upload,
        write,
        wrote,
        skip
      })
      // The site refused the logo: the header shows the name instead of the template's logo.
      if (!result.ok && anyLogo && nameFallback)
        result = await writeT4Profiles({
          folder,
          profile,
          name,
          logos: {},
          textLogo: true,
          favicon,
          settings,
          upload,
          write,
          wrote,
          skip
        })
      used = result.used
      header = used.size > 0
    }
  }
  if (anyLogo && profile.footerSlot) {
    const dark = darkSpotsOf(profile).footer
    const variant = variantFor(logos, dark) ?? (logos.dark ? 'dark' : logos.light ? 'light' : null)
    // A logo narrower than the slot's floor goes on a canvas that wide, or the footer shows the name (`logoForSlot`).
    const pathFor = async (/** @type {any} */ fit) => {
      if (!variant) return null
      const fitted = await logoForSlot(logos[variant], fit).catch((error) => ({
        text: /** @type {const} */ (true),
        reason: String(error)
      }))
      if ('text' in fitted) {
        skip('footer-logo', fitted.reason)
        return null
      }
      return fitted.padded
        ? uploader({ write, stamp, skip }, { 'logo-footer': fitted.bytes })('logo-footer', 'footer-logo')
        : upload(roleOf(variant), 'footer-logo')
    }
    if (await placeFooterLogo({ slot: profile.footerSlot, pathFor, read, write, stamp, skip })) {
      used.add(variant)
      wrote('footer-logo')
    }
  }
  // Every module still showing one of the template's logo files (the footer the logo did not reach, a logo the content
  // map has no door for) shows the name as text.
  if (nameFallback && profile.framework)
    await nameForDemoLogos({ name, demoFiles: prepared.demoLogoFiles ?? [], read, write, wrote, skip })
  if (logos.dark && !logos.single && !used.has('dark'))
    skip('logo-dark', 'this design does not show a dark-background logo yet')
  if (header && profile.brandReady === false) skip('logo', NOT_SHOWN.logo)
  if (written.has('favicon') && profile.faviconReady === false) skip('favicon', NOT_SHOWN.favicon)
}

/** Global Configuration `sitename`, or a skip saying why not. @returns {Promise<boolean>} whether it was written */
async function writeSitename({ name, component, write, wrote, skip }) {
  if (atLeast(component) === false) {
    skip('sitename', TOO_OLD)
    return false
  }
  try {
    await write('site.identity', { operation: 'set', fields: { sitename: name } })
    wrote('sitename')
    return true
  } catch (error) {
    if (unknownAction(/** @type {any} */ (error)?.answer)) {
      skip('sitename', TOO_OLD)
      return false
    }
    skip('sitename', `the site refused its name (${error instanceof Error ? error.message : error})`)
    return false
  }
}

/** A T3 template's favicon: the plugin keeps it beside the template and prints it on every page. */
async function writeT3Favicon({ folder, upload, write, wrote, skip }) {
  const path = await upload('favicon', 'favicon')
  if (!path) return
  try {
    await write('template.siteSettings', {
      operation: 'set',
      template: folder,
      fields: { other_faviconFile: path }
    })
    wrote('favicon')
  } catch (error) {
    skip('favicon', `the site refused the favicon (${error instanceof Error ? error.message : error})`)
  }
}
