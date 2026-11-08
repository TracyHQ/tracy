// What the looker needs to write the alt of the picture it looks at (ADR 0043 section 3f): the site's language and the
// business's name from the plan, and each frame's limit, the smaller of the writer's alt limit and the maxCharacters of
// the alt slot beside the picture. The alt then comes from the picture placed, not from the wish the writer wrote from
// before any picture was chosen (steps 6 and 8 run in parallel). Pure code.
import { galleryAltSlot } from '../lib/gallery-alt-slot.js'
import { ALT_MAX } from '../lib/site-copy/slot-shape.js'

export { ALT_MAX }

const LONG_DASH = /\s*[–—]\s*/g

/**
 * An alt the looker wrote, made safe for its slot: trimmed, no double quote (the plugin refuses one in a picture alt), no
 * long dash, cut at the last whole word within `limit`. Null when nothing is left.
 * @param {unknown} text
 * @param {number} limit
 * @returns {string | null}
 */
export function cleanAlt(text, limit) {
  if (typeof text !== 'string') return null
  let alt = text.replace(/["“”]/g, '').replace(LONG_DASH, ', ').replace(/\s+/g, ' ').trim()
  if (alt.length > limit) {
    const cut = alt.slice(0, limit + 1)
    const space = cut.lastIndexOf(' ')
    alt = (space > 0 ? cut.slice(0, space) : alt.slice(0, limit)).replace(/[\s,;:]+$/, '')
  }
  return alt || null
}

/**
 * The looker's alt ask for one run, or null when the plan names no site language (then no alt is asked and the
 * writer's alts stand).
 * @param {{ plan?: object, kit?: object }} input `kit` the kit doc with its content map
 * @returns {{ language: string, business: string | null, limit: (frame: string) => number } | null}
 */
export function altAskFor({ plan, kit }) {
  const language = plan?.site?.language
  if (typeof language !== 'string' || !language.trim()) return null
  const name = plan?.site?.name
  const slots = kit?.contentMap?.slots
  return {
    language: language.trim(),
    business: typeof name === 'string' && name.trim() ? name.trim() : null,
    limit: (frame) => {
      const max = galleryAltSlot(frame, slots)?.maxCharacters
      return Number.isInteger(max) && max > 0 ? Math.min(max, ALT_MAX) : ALT_MAX
    }
  }
}
