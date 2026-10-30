/**
 * REL-3 on Joomla: the logo layout (`pair`, `dark`, `single`) a template's own files show, read the
 * way `brand-joomla-places.js` measured it on 07/10/2026.
 *
 * - T4: a dark-background key (`site_logo_dark`, `site_logo_dark_small`, `site_logo_2`) while a
 *   site profile turns dark mode on (`other_darkmode`), or a dark-mode rule in `css/darkmode.css`
 *   that swaps or hides a logo, is a spot that follows the mode: `pair`. Else every filled logo key
 *   is one spot, and its background is told by its demo picture: a light picture (mean luminance
 *   above 180) is drawn for a dark background.
 * - T3: a `logoimage_dark` parameter, or a style titled "Dark" beside others, is `pair`; only "Dark"
 *   styles is `dark`; else the `logoimage` pictures decide, as above, together with the footer logo a
 *   style shows from its own params (`logofootertype` image, `logofooterimage`: JA Cagox).
 *
 * Returns the layout with the reasons, or `layout: null` with why it cannot be told without a site.
 */
import { T4_DARK_KEYS, filledKeys, joomlaLogoPlaces } from '../readers/joomla-logo-places.js'
import { LIGHT_PICTURE, joomlaImageValue, pictureFacts } from '../readers/picture-facts.js'
import { templateSource } from '../readers/template-source.js'

/**
 * The background tone each demo picture is drawn for, or why one cannot be told.
 * @param {import('../index.js').RuleContext} context
 * @param {{ where: string, value: string, darkKey: boolean }[]} pictures
 */
async function tonesOf(context, pictures) {
  const files = pictures.map((p) => ({ ...p, file: joomlaImageValue(p.value).file }))
  const found = await templateSource(context).webrootFiles(files.map((f) => f.file))
  const tones = new Set()
  const reasons = []
  for (const p of files) {
    if (p.darkKey) {
      tones.add('dark')
      reasons.push(`${p.where} is a dark-background key`)
      continue
    }
    const bytes = found.get(p.file)
    // eslint-disable-next-line no-await-in-loop -- a handful of pictures.
    const facts = bytes ? await pictureFacts(bytes) : null
    if (!facts || facts.luminance === null)
      return { tones: null, reasons: [`the demo picture ${p.file} (${p.where}) cannot be read`] }
    const light = facts.luminance > LIGHT_PICTURE
    tones.add(light ? 'dark' : 'light')
    reasons.push(
      `${p.where} shows ${p.file}, a ${light ? 'light' : 'dark'} picture (luminance ${Math.round(facts.luminance)}), so its background is ${light ? 'dark' : 'light'}`
    )
  }
  return { tones, reasons }
}

const layoutOf = (/** @type {Set<string>} */ tones) =>
  tones.has('dark') && tones.has('light') ? 'pair' : tones.has('dark') ? 'dark' : 'single'

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<{ layout: 'pair' | 'dark' | 'single' | null, reasons: string[] }>}
 */
export async function joomlaLogoLayout(context) {
  const places = await joomlaLogoPlaces(context)
  if (places.framework === 't4') {
    const darkMode = places.t4.filter((p) => p.darkMode).map((p) => p.name)
    const darkKeys = places.t4.flatMap((p) =>
      Object.keys(p.keys)
        .filter((k) => T4_DARK_KEYS.has(k))
        .map((k) => `${p.name}.${k}`)
    )
    const darkCss = places.files.get('css/darkmode.css')?.toString('utf8') ?? ''
    const swaps = darkCss
      .split('}')
      .filter(
        (rule) =>
          /logo/i.test(rule.split('{')[0] ?? '') && /display\s*:\s*none|content\s*:\s*url\(/i.test(rule)
      )
    if ((darkKeys.length && darkMode.length) || swaps.length)
      return {
        layout: 'pair',
        reasons: [
          darkKeys.length && darkMode.length
            ? `dark-background keys ${darkKeys.join(', ')} with dark mode on in ${darkMode.join(', ')}`
            : 'css/darkmode.css swaps or hides a logo in dark mode'
        ]
      }
    const pictures = places.t4.flatMap((p) =>
      filledKeys(p).map(([k, v]) => ({
        where: `etc/site/${p.name}.json ${k}`,
        value: v,
        darkKey: T4_DARK_KEYS.has(k)
      }))
    )
    if (pictures.length === 0)
      return {
        layout: null,
        reasons: ['no site profile holds a demo logo picture, so no background can be measured']
      }
    const { tones, reasons } = await tonesOf(context, pictures)
    if (!tones) return { layout: null, reasons }
    if (darkMode.length) tones.add('dark')
    return {
      layout: layoutOf(tones),
      reasons: darkMode.length ? [...reasons, `dark mode is on in ${darkMode.join(', ')}`] : reasons
    }
  }
  if (places.framework === 't3') {
    const dark = places.t3.filter((s) => /\bdark\b/i.test(s.title))
    if (places.t3.some((s) => 'logoimage_dark' in s.params))
      return { layout: 'pair', reasons: ['the template styles carry a logoimage_dark parameter'] }
    if (dark.length && dark.length < places.t3.length)
      return {
        layout: 'pair',
        reasons: [`style ${dark.map((s) => `"${s.title}"`).join(', ')} is dark, the others are not`]
      }
    if (dark.length) return { layout: 'dark', reasons: ['every template style is a dark one'] }
    const pictures = places.t3
      .filter((s) => String(s.params.logoimage ?? '').trim() !== '')
      .map((s) => ({
        where: `style "${s.title}" logoimage`,
        value: String(s.params.logoimage),
        darkKey: false
      }))
    for (const s of places.t3)
      if (s.params.logofootertype === 'image' && String(s.params.logofooterimage ?? '').trim() !== '')
        pictures.push({
          where: `style "${s.title}" logofooterimage`,
          value: String(s.params.logofooterimage),
          darkKey: false
        })
    if (pictures.length === 0)
      return {
        layout: null,
        reasons: ['the template styles show a text logo, whose background only a site shows']
      }
    const { tones, reasons } = await tonesOf(context, pictures)
    return tones ? { layout: layoutOf(tones), reasons } : { layout: null, reasons }
  }
  return {
    layout: null,
    reasons: ['neither T4 site profiles nor T3 logo parameters were found in the template']
  }
}
