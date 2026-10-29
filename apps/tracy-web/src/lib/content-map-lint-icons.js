/**
 * The packing check rule that needs the demo pictures (spec TracyHQ/tracy#189): an item icon drawn on a ground of its
 * own (a disc or tile behind the glyph) must say so in its Slot fit, because a new icon is set on that same ground.
 *
 * The ground is measured by the engine's own reader (`iconStyleOf`, `icon-style.js`), so the check and the engine agree.
 * Slot fit has no ground field yet (ADR 0039): until the `--fit` audit writes one (`fit.ground`), every icon with a
 * ground is reported, and the engine measures the demo picture at build time instead. Run only where the pack's webroot
 * is at hand (`check.mjs --webroot`); the gate without pictures does not run it.
 */
import { iconStyleOf } from './icon-style.js'

export const ICON_GROUND_RULE = Object.freeze({
  id: 'item-icon-ground-undeclared',
  severity: 'warning',
  checks: 'an item icon drawn on its own disc or tile declares that ground in its Slot fit',
  fix: 'No map edit can say it yet: Slot fit (ADR 0039) has no ground field. Once the --fit audit writes fit.ground, measure again with --fit --write; until then the engine measures the demo icon itself.'
})

/** The site file a picture slot shows: its sample without the Joomla image suffix. */
export const pictureFileOf = (sample) =>
  String(sample ?? '')
    .split('#')[0]
    .split('?')[0]
    .replace(/^\/+/, '')

/**
 * @param {any} contentMap
 * @param {(file: string) => Promise<Uint8Array | null> | Uint8Array | null} readPicture - a site file's bytes, or null
 * @returns {Promise<Array<{ rule: string, severity: string, key: string, note: string, fix: string }>>}
 */
export async function lintItemIconGrounds(contentMap, readPicture) {
  const slots = (Array.isArray(contentMap?.slots) ? contentMap.slots : []).filter(
    (s) => s?.type === 'image' && s.role === 'editorial.item_icon' && !s.fit?.ground
  )
  /** @type {Map<string, any>} */
  const measured = new Map()
  const out = []
  for (const slot of slots) {
    const file = pictureFileOf(slot.sample)
    if (!file) continue
    if (!measured.has(file)) measured.set(file, await iconStyleOf(await readPicture(file)))
    const shape = measured.get(file)?.groundShape
    if (!shape) continue
    out.push({
      rule: ICON_GROUND_RULE.id,
      severity: ICON_GROUND_RULE.severity,
      key: String(slot.key),
      note: `${file} is drawn on a ${shape.radius >= 0.45 ? 'disc' : 'tile'} (${shape.colour})`,
      fix: ICON_GROUND_RULE.fix
    })
  }
  return out
}
