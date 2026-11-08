// Shared: the site agent's icon door (sites/icon-door.js) picks and draws with it, through the picture step's own code.
// A customer who asks for another icon gets one from the same library the build's icon step chose from, drawn the way the
// write step draws a replaced icon (`iconInLook`): the template icon's size, weight, glyph place and backing, with the
// colours the slot shows now. Nothing here invents a colour or a look: what cannot be read is refused, in words.
import { iconLookOf, looksDiffer } from './template-icon-look.js'
import { iconColourOf } from './icon-ink.js'
import { iconInLook } from './icon-render.js'
import { iconShortlist, usableCatalog } from './icon-shortlist.js'
import { hasPhosphorIcon, phosphorCatalog, PHOSPHOR_SET } from './phosphor-set.js'
import { contentMapKey } from '../../content-map-key.js'

/** The most names one search answers. */
export const SEARCH_MAX = 12

/**
 * The library icons whose names or tags say the words, best first; brand logos are never offered.
 * @param {string} query what the icon should show, in words
 * @param {{ catalog?: Array<{name: string, tags?: string[], categories?: string[]}>, max?: number }} [options]
 * @returns {{ name: string, tags: string[] }[]}
 */
export function searchIcons(query, { catalog = phosphorCatalog(), max = SEARCH_MAX } = {}) {
  const usable = usableCatalog(catalog)
  const byName = new Map(usable.map((i) => [i.name, i]))
  return iconShortlist({ shows: String(query ?? '') }, usable)
    .slice(0, max)
    .map((name) => ({ name, tags: [...(byName.get(name)?.tags ?? [])].slice(0, 5) }))
}

/**
 * The icon slot a key names and the twins that show it in the other theme, from the template kit (`twinOf`): the light and
 * dark copies of one icon are written together, or a page shows one icon by day and another by night.
 * @param {any} kit the kit document (`template-kit.json`)
 * @param {string} slot a content map slot key
 * @returns {{ ok: true, slots: string[] } | { ok: false, code: 'SLOT_UNKNOWN' | 'NOT_AN_ICON_SLOT', kind?: string }}
 */
export function iconPairOf(kit, slot) {
  const frames = (Array.isArray(kit?.blocks) ? kit.blocks : []).flatMap((b) =>
    Array.isArray(b?.frames) ? b.frames : []
  )
  const keyOf = (f) => contentMapKey(f?.id)
  const asked = frames.find((f) => keyOf(f) === slot)
  if (!asked) return { ok: false, code: 'SLOT_UNKNOWN' }
  const mainId = typeof asked.twinOf === 'string' && asked.twinOf !== '' ? asked.twinOf : asked.id
  const main = frames.find((f) => f.id === mainId) ?? asked
  if (main.kind !== 'icon' && asked.kind !== 'icon')
    return { ok: false, code: 'NOT_AN_ICON_SLOT', kind: String(asked.kind ?? 'unknown') }
  const slots = [keyOf(main), ...frames.filter((f) => f.twinOf === main.id).map(keyOf)]
  return { ok: true, slots: [...new Set(slots)] }
}

/**
 * One slot's icon drawn again with another glyph: the look from the template's own icon (`template`, the slot's demo file)
 * as the write step takes it, else from what the slot shows now; the glyph's colour and the backing's from what the slot
 * shows now (`current`: the brand's colours once the build wrote it), else the template's. The drawing is then held to the
 * look it was drawn in, as the write step's look guard holds it.
 * @param {{ glyph: string, template?: Buffer | null, current?: Buffer | null }} input
 * @returns {Promise<{ ok: true, bytes: Buffer, ext: 'png', width: number, height: number, sha256: string, colour: string }
 *   | { ok: false, code: string, error: string }>}
 */
export async function redrawIcon({ glyph, template = null, current = null }) {
  if (!hasPhosphorIcon(glyph))
    return { ok: false, code: 'ICON_UNKNOWN', error: `the icon set has no icon named ${glyph}` }
  const templateLook = template ? await iconLookOf(template) : null
  const currentLook = current ? await iconLookOf(current) : null
  const look = templateLook ?? currentLook
  if (!look)
    return {
      ok: false,
      code: 'ICON_UNREADABLE',
      error: 'the icon this slot shows could not be read, so its look is not known; nothing was drawn'
    }
  const colour =
    (current ? await iconColourOf(current) : null) ?? (template ? await iconColourOf(template) : null)
  if (!colour)
    return {
      ok: false,
      code: 'ICON_UNREADABLE',
      error: 'the colour of the icon this slot shows could not be read'
    }
  const plateColour = currentLook?.plate?.colour ?? look.plate?.colour ?? null
  const made = await iconInLook({ glyph, look, colour, plateColour })
  const drawn = await iconLookOf(made.bytes)
  const moved = drawn ? looksDiffer(look, drawn) : ['the drawing could not be read back']
  if (moved.length > 0)
    return { ok: false, code: 'LOOK_CHANGED', error: `drawn as ${glyph}, ${moved.join('; ')}` }
  return { ok: true, ...made, colour }
}

export { PHOSPHOR_SET }
