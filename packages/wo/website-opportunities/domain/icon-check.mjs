// The rules every icon of a build keeps (ticket #595, spec #577), checked on the selection itself so a later change to
// the selection cannot break one silently. Pure: the selected icon fields in, the problems out, plus the accounting
// (`iconCountsOf`): icon fields total = filled from the library + social + hidden with a reason, nothing unexplained.
import { SOCIAL_ICON_NAMES } from './icon-social.mjs'

/**
 * The colour roles an icon is painted in (ADR 0043 section 1a, the role vocabulary of the picture step's
 * `lib/picture-paint/paint.js`): resolved from the Design system when the site is written, never a colour value.
 */
export const ICON_PAINT_ROLES = Object.freeze(['accent', 'on-accent', 'text', 'on-dark', 'surface'])
/** Where an icon field's icon comes from: the icon library, or none (hidden, with the reason). */
export const ICON_SOURCES = Object.freeze(['library', 'none'])
const ROLES = new Set(ICON_PAINT_ROLES)
const SOCIAL = new Set(SOCIAL_ICON_NAMES)
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\bcolor-mix\(/i
const PICTURE_VALUE = /\.(png|jpe?g|webp|gif|svg|avif)(\?|#|$)|^(https?:|data:|images\/)/i
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** Every string an icon's own values hold (its icon and variants): where a picture or a demo path would hide. */
function valuesOf(value, out = []) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) valuesOf(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) valuesOf(v, out)
  return out
}

function variantProblems(entry, report) {
  for (const theme of ['light', 'dark']) {
    const v = entry.variants?.[theme]
    if (!v) {
      report('icon_variant_missing', `no ${theme} version`)
      continue
    }
    if (v.icon !== entry.icon?.name)
      report('icon_variant_mismatch', `the ${theme} version draws another icon`)
    for (const role of [v.paint?.glyph, v.paint?.plate?.role].filter((r) => r !== undefined && r !== null))
      if (!ROLES.has(role)) report('icon_paint_role_unknown', `${JSON.stringify(role)} is not a colour role`)
    const frame = entry.frame
    if (frame && (v.width !== frame.width || v.height !== frame.height))
      report(
        'icon_size_unfit',
        `the ${theme} version is not drawn at the declared ${frame.width}x${frame.height}`
      )
  }
}

/**
 * The problems of an icon selection, empty when it keeps every rule: every field records its source; a library icon
 * is a name of the library (a network mark for a social field, never one for a content field) with a light and a dark
 * version in colour roles at the declared frame size; a hidden field says why. No icon field holds a photo, a
 * generated picture, a demo icon reference or a colour literal.
 * @param {{icons: object[]}} selection the result of `selectIcons`
 * @param {{names?: Iterable<string>, demo?: {refs?: string[], names?: string[]}, pictureFrames?: object[]}} [against]
 *   `names`: the icon library; `demo`: the template's demo icon files and the library names that copy them;
 *   `pictureFrames`: the picture policy's frames, none of which may be an icon field
 */
export function iconProblemsOf(selection, { names, demo = {}, pictureFrames = [] } = {}) {
  const library = names ? new Set(names) : null
  const demoRefs = (demo.refs ?? []).filter(isText)
  const demoNames = new Set(demo.names ?? [])
  const frameIds = new Set(pictureFrames.map((f) => f.id))
  const problems = []
  for (const entry of selection?.icons ?? []) {
    const report = (code, message) => problems.push({ code, at: entry.id, message })
    if (frameIds.has(entry.id)) report('icon_holds_picture', 'an icon field is never a picture frame')
    if (!ICON_SOURCES.includes(entry.source)) {
      report(
        entry.source === 'own' || entry.source === 'generated' ? 'icon_holds_picture' : 'icon_source_missing',
        `an icon field holds a library icon or nothing, not ${JSON.stringify(entry.source)}`
      )
      continue
    }
    if ('picture' in entry || 'ref' in entry || 'generate' in entry)
      report('icon_holds_picture', 'an icon field never holds a photo or a generated picture')
    const own = valuesOf({ icon: entry.icon, variants: entry.variants })
    if (own.some((v) => PICTURE_VALUE.test(v)))
      report('icon_holds_picture', 'an icon value is a picture path')
    if (own.some((v) => demoRefs.some((ref) => v.includes(ref))) || demoNames.has(entry.icon?.name))
      report('icon_demo_left', 'the demo icon of the template is never kept')
    if (own.some((v) => COLOUR_LITERAL.test(v)))
      report('icon_colour_literal', 'an icon is painted in roles only')
    if (entry.source === 'none') {
      if (!isText(entry.reason)) report('icon_reason_missing', 'a hidden icon says why')
      if (entry.icon || entry.variants) report('icon_hidden_with_icon', 'a hidden icon holds no icon')
      continue
    }
    const name = entry.icon?.name
    if (!isText(name)) report('icon_name_missing', 'a library icon names its icon')
    else if (library && !library.has(name))
      report('icon_not_in_library', `${name} is not an icon of the library`)
    if (entry.case === 'social' && !SOCIAL.has(name))
      report('icon_social_not_network', 'a social icon is a network mark')
    if (entry.case !== 'social' && SOCIAL.has(name))
      report('icon_network_for_content', 'a network mark is not content')
    variantProblems(entry, report)
  }
  return problems
}

/** The accounting of a selection: every icon field is filled from the library (content or social) or hidden with a reason. */
export function iconCountsOf(selection) {
  const counts = { fields: 0, library: 0, social: 0, hidden: 0, unexplained: 0 }
  for (const entry of selection?.icons ?? []) {
    counts.fields += 1
    if (entry.source === 'library') counts[entry.case === 'social' ? 'social' : 'library'] += 1
    else if (entry.source === 'none' && isText(entry.reason)) counts.hidden += 1
    else counts.unexplained += 1
  }
  return counts
}
