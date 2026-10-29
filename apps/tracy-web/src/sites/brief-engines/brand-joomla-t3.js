/**
 * The T3 half of the Joomla brand writer (plan T19): a T3 template keeps its logo in the params of EVERY template style
 * (`#__template_styles.params`: `logotype` text|image, `logoimage`, `sitename`), written through `content.update` kind
 * `templateStyle` (plugin `JoomlaSiteWriter`, column `params`, whole value).
 *
 *   a logo for the spot   `logotype=image`, `logoimage=<upload>`, `sitename` emptied (the global site name, set by
 *                         `site.identity`, is then the alt text), the small-screen logo switched off
 *   a logo, none for this spot (a dark style, only the light logo given)  `logotype=text`, `sitename=<name>` (Q7)
 *   a dark-mode logo      a style carrying `logoimage_dark` (JA Morgan 1.0.2+) takes the dark-background logo, or ''
 *   no logo at all        the logo is left as the template has it; a style that shows a name as text (or carries the
 *                         demo name) takes the customer's name (Q8: JA Morgan keeps its text logo)
 *
 * 🔒 EVERY OTHER PARAM IS KEPT: the row is read, the few keys changed, and the whole params written back.
 */
import { darkSpotsOf, roleOf, variantFor } from './brand-joomla-places.js'

/** Template folders of Joomla itself, never the site's design. */
const CORE = new Set(['atum', 'cassiopeia', 'cassiopeia_extended', 'system'])

/** The style rows of the site template: the expected folder when present, else the one non-core template. */
function stylesOf(items, folder) {
  const rows = Array.isArray(items) ? items : []
  const own = rows.filter((r) => r?.template === folder)
  if (own.length) return own
  const others = [...new Set(rows.map((r) => r?.template).filter((t) => t && !CORE.has(t)))]
  return others.length === 1 ? rows.filter((r) => r.template === others[0]) : []
}

/** Parse a style's params, or null. */
function paramsOf(item) {
  if (item?.params && typeof item.params === 'object') return { ...item.params }
  try {
    const parsed = JSON.parse(String(item?.params ?? ''))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Write the logo (or the name as text) into every style of a T3 template.
 * @param {object} input
 * @param {string} input.folder - the template folder
 * @param {any} input.profile
 * @param {string} [input.name]
 * @param {{light?: Uint8Array, dark?: Uint8Array, single?: Uint8Array}} input.logos
 * @param {(role: string, where: string) => Promise<string | null>} input.upload
 * @param {Function} input.read @param {Function} input.write
 * @param {(where: string) => void} input.wrote @param {(where: string, reason: string) => void} input.skip
 * @returns {Promise<Set<string>>} the variants a style took
 */
export async function writeT3Styles({
  folder,
  profile,
  name,
  logos,
  textLogo = false,
  nameFallback = false,
  upload,
  read,
  write,
  wrote,
  skip
}) {
  const used = new Set()
  const anyLogo = Object.keys(logos).length > 0
  if (!anyLogo && !name) return used
  let styles
  try {
    const list = await read('content.list', { kind: 'templateStyle', limit: 200 })
    if (list?.ok === false) throw new Error(String(list.message ?? list.error))
    styles = stylesOf(list?.items, folder)
  } catch (error) {
    skip('logo', `the template styles could not be read (${error instanceof Error ? error.message : error})`)
    return used
  }
  if (!styles.length) {
    if (anyLogo) skip('logo', 'the site has no template style of this design')
    return used
  }
  const dark = darkSpotsOf(profile)
  let wroteLogo = false
  let wroteName = false
  let wroteText = false
  for (const style of styles) {
    const got = await read('content.get', { kind: 'templateStyle', id: style.id }).catch(() => null)
    const params = got?.ok === false ? null : paramsOf(got?.item)
    if (!params) {
      skip('logo', `template style ${style.id} could not be read`)
      continue
    }
    const next = { ...params }
    const variant = anyLogo ? variantFor(logos, dark.t3(style.title)) : null
    const path = variant ? await upload(roleOf(variant), 'logo') : null
    if (path) {
      Object.assign(next, { logotype: 'image', logoimage: path, sitename: '', enable_logoimage_sm: '0' })
      // A style that reads a dark-mode logo (JA Morgan 1.0.2+, `logoimage_dark`) takes the dark-background one,
      // or nothing, so dark mode shows the name rather than a logo drawn for a light page (Q7).
      if (Object.hasOwn(params, 'logoimage_dark')) {
        const darkVariant = variantFor(logos, true)
        const darkPath = darkVariant ? await upload(roleOf(darkVariant), 'logo-dark') : null
        next.logoimage_dark = darkPath ?? ''
        if (darkPath) used.add(darkVariant)
      }
    } else if (anyLogo && (variant === null || nameFallback) && name) {
      // No logo for this style, or (a brief build) one the site would not take: the name, never the template's logo.
      Object.assign(next, { logotype: 'text', sitename: name })
    } else if (textLogo && !anyLogo && name) {
      Object.assign(next, { logotype: 'text', sitename: name })
      if (Object.hasOwn(params, 'logoimage_dark')) next.logoimage_dark = ''
    } else if (!anyLogo && name && (params.logotype === 'text' || String(params.sitename ?? '') !== '')) {
      next.sitename = name
    }
    if (JSON.stringify(next) === JSON.stringify(params)) continue
    try {
      await write('content.update', {
        kind: 'templateStyle',
        id: style.id,
        fields: { params: JSON.stringify(next) }
      })
      if (path) {
        wroteLogo = true
        used.add(variant)
      } else if (next.logotype === 'text' && params.logotype !== 'text') wroteText = true
      else wroteName = true
    } catch (error) {
      skip(
        'logo',
        `the site refused template style ${style.id} (${error instanceof Error ? error.message : error})`
      )
      // A brief build whose logo the style refused shows the name instead of the template's logo.
      if (path && nameFallback && name) {
        const text = { ...params, logotype: 'text', sitename: name }
        if (Object.hasOwn(params, 'logoimage_dark')) text.logoimage_dark = ''
        await write('content.update', {
          kind: 'templateStyle',
          id: style.id,
          fields: { params: JSON.stringify(text) }
        })
          .then(() => {
            wroteText = true
          })
          .catch(() => {})
      }
    }
  }
  if (wroteLogo) wrote('logo')
  if (wroteText) wrote('logo-text')
  if (wroteName) wrote('site_name')
  return used
}
