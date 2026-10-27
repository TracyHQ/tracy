/**
 * The WordPress writer behind `setSiteBrand` (`brand.js`; plan T10).
 *
 *   logo     `media.upload` → option `site_logo` = the new attachment (the Site Logo block every Tracy and JA theme with
 *            a logo spot reads)
 *   favicon  `media.upload` → option `site_icon` = the new attachment; not touched when no favicon was given
 *   Tracy Business  its theme reads option `tracy_site_identity`, not `site_logo`: the logo's path, the legal name and
 *            the monogram are merged into it (read, merge, write), every other key kept as stored
 *
 * 🔒 A NEW FILE NAME EVERY TIME (`<role>-<sha256 16>-<stamp>.png`): an upload over a path that already holds a file
 * replaces the bytes under the old attachment and answers no new one, and a cached old logo could outlive the new one.
 * 🔒 THE UNDO IS THE PLUGIN'S. `content.update {kind: "option"}` records the option's previous value (or its absence)
 * under the apply id and `media.upload` records the file it created (plugin 0.18.0 `Engine.php` `contentUpdate`,
 * `mediaUpload`), so `apply.revert` of the brand apply id puts the site back as it was.
 *   dark logo  `media.upload` → option `tracy_logo_dark` = the new attachment (plan D9, T27), ONLY when the template
 *            profile says the theme reads it (`darkLogo: true`); the theme shows it where the background is dark
 *            (`[data-theme="dark"]`). Any other theme: a skip with its reason, nothing uploaded. No dark logo given: the
 *            option is set to 0 where it holds the demo's picture, and the theme shows the site name as text in its
 *            dark spots (Q7).
 * A design whose every logo spot is dark (`logos: "dark"`) takes the dark logo as its one logo, `site_logo`.
 *   no logo  nothing of the logo is touched: the site keeps the template's logo exactly as released (LOGO-4 dropped).
 */
import { createHash } from 'node:crypto'

/** Where the brand pictures land in the media library: not the contract's picture folder, whose names are bare hashes. */
const FOLDER = 'wp-content/uploads/tracy-brand'
/** Releases whose theme draws the identity from `tracy_site_identity`. */
const IDENTITY_THEME = /(^|\/)tracy-business\/wp\d+$/
/** What the customer reads when the design will not show what was written. */
const NOT_SHOWN = Object.freeze({
  logo: 'this design does not show a logo yet',
  dark: 'this design does not show a dark-background logo yet',
  favicon: 'this design does not show a favicon yet'
})

/**
 * The monogram a name stands for: the first letter of each of its first two words that start with a letter,
 * upper-cased ("Tamq Bakery Test" → "TB").
 * @param {unknown} name
 */
export function monogramOf(name) {
  const words = String(name ?? '')
    .split(/\s+/)
    .map((w) => w.match(/\p{L}/u)?.[0] ?? '')
    .filter(Boolean)
  return words.slice(0, 2).join('').toLocaleUpperCase()
}

/** A plain JSON object, as PHP's associative array arrives (an empty one arrives as `[]`, which is none). */
const isRecord = (/** @type {unknown} */ v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The identity option with `fields` merged in where the theme reads them first: inside a stored `site` group, else
 * under a stored flat `site.<key>`, else at the top level (`wp_tracy_business_identity_vars_of` reads `site.<key>`, then
 * `<key>`). Every other key is kept.
 * @param {unknown} stored @param {Record<string, string>} fields
 */
export function identityWithBrand(stored, fields) {
  const out = isRecord(stored) ? { .../** @type {Record<string, any>} */ (stored) } : {}
  const group = isRecord(out.site) ? { ...out.site } : null
  for (const [key, value] of Object.entries(fields)) {
    if (group) group[key] = value
    else if (Object.hasOwn(out, `site.${key}`)) out[`site.${key}`] = value
    else out[key] = value
  }
  if (group) out.site = group
  return out
}

/** @param {import('./brand.js').BrandWriterInput} input */
export async function writeWordpressBrand({ prepared, profile, tag, stamp, write, read, wrote, skip }) {
  const logos = prepared.logo ?? {}
  const logo = logos.single ?? logos.light ?? (profile?.logos === 'dark' ? logos.dark : undefined)

  /** Upload one picture under a new name; its path and attachment, or null after a skip. */
  const upload = async (/** @type {string} */ role, /** @type {Uint8Array} */ bytes) => {
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const path = `${FOLDER}/${role}-${sha256.slice(0, 16)}-${stamp}.png`
    try {
      const answer = await write('media.upload', {
        path,
        content_b64: Buffer.from(bytes).toString('base64'),
        sha256
      })
      const attachment = Number(answer?.attachment)
      if (!Number.isInteger(attachment) || attachment <= 0) {
        skip(role, 'the site did not make a new picture of it')
        return null
      }
      return { path, attachment }
    } catch (error) {
      skip(role, `the site refused the picture (${error instanceof Error ? error.message : error})`)
      return null
    }
  }
  /** Write one option; true when it was written. */
  const option = async (
    /** @type {string} */ where,
    /** @type {string} */ key,
    /** @type {unknown} */ value
  ) => {
    try {
      await write('content.update', { kind: 'option', id: 0, key, fields: { value } })
      if (prepared.requireComplete) {
        const after = await read('content.get', { kind: 'option', key })
        if (after?.ok === false || JSON.stringify(after.item?.value) !== JSON.stringify(value))
          throw new Error('brand option readback failed')
      }
      wrote(key)
      return true
    } catch (error) {
      skip(where, `the site refused ${key} (${error instanceof Error ? error.message : error})`)
      return false
    }
  }

  /** Whether an option holds a picture (an attachment id other than 0); a read that fails counts as yes. */
  const holdsPicture = async (/** @type {string} */ key) => {
    const answer = await read('content.get', { kind: 'option', key }).catch(() => null)
    if (answer?.ok === false && answer.error === 'not_found') return false
    const value = answer?.ok === false ? 1 : answer?.item?.value
    return value !== undefined && value !== null && value !== '' && Number(value) !== 0
  }
  let logoPath = null
  if (logo) {
    const placed = await upload('logo', logo)
    if (placed && (await option('logo', 'site_logo', placed.attachment))) {
      logoPath = placed.path
      if (profile && profile.brandReady === false) skip('logo', NOT_SHOWN.logo)
    }
  }
  // A logo given with no dark one, on a theme that reads `tracy_logo_dark`: the demo's dark logo is taken off, so the
  // dark spots show the name as text (Q7) rather than the demo's white logo beside the customer's.
  if (logo && !logos.dark && profile?.darkLogo === true && (await holdsPicture('tracy_logo_dark')))
    await option('logo-dark', 'tracy_logo_dark', 0)
  if (logos.dark && logo !== logos.dark) {
    if (profile?.darkLogo !== true) skip('logo-dark', NOT_SHOWN.dark)
    else {
      const placed = await upload('logo-dark', logos.dark)
      if (placed) await option('logo-dark', 'tracy_logo_dark', placed.attachment)
    }
  }
  if (prepared.favicon) {
    const placed = await upload('favicon', prepared.favicon)
    if (
      placed &&
      (await option('favicon', 'site_icon', placed.attachment)) &&
      profile?.faviconReady === false
    )
      skip('favicon', NOT_SHOWN.favicon)
  }

  if (!tag || !IDENTITY_THEME.test(tag)) return
  /** @type {Record<string, string>} */
  const fields = {}
  if (logoPath) fields.logo = logoPath
  if (prepared.name) {
    fields.legalName = prepared.name
    const monogram = monogramOf(prepared.name)
    if (monogram) fields.monogram = monogram
  }
  if (Object.keys(fields).length === 0) return
  let stored
  try {
    const answer = await read('content.get', { kind: 'option', key: 'tracy_site_identity' })
    if (answer?.ok === false && answer.error !== 'not_found')
      throw new Error(String(answer.message ?? answer.error))
    stored = answer?.ok === false ? undefined : answer?.item?.value
  } catch (error) {
    skip(
      'identity',
      `the site's identity could not be read (${error instanceof Error ? error.message : error})`
    )
    return
  }
  await option('identity', 'tracy_site_identity', identityWithBrand(stored, fields))
}
