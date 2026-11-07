// The alt slot beside a picture in its gallery row, shared by the picture step (which writes the alt of the picture it
// placed within that slot's limit) and the write step (which sends the alt through that slot). Only a gallery row has an
// alt slot a door can fill: a text slot of the same entity and row whose sample is empty and whose path ends in `[alt]`.
import { contentMapKey } from './content-map-key.js'

const isOpenableAlt = (slot) =>
  slot?.type === 'text' &&
  String(slot.sample ?? '').trim() === '' &&
  Array.isArray(slot.jsonPath) &&
  slot.jsonPath.some((part) => String(part).endsWith('[alt]'))

/**
 * The alt slot beside a frame's picture in its row, or null.
 * @param {string} frame a kit frame id
 * @param {object[]} slots the content map's slots
 */
export function galleryAltSlot(frame, slots) {
  const list = Array.isArray(slots) ? slots : []
  const picture = list.find((s) => s?.key === contentMapKey(frame))
  if (picture?.type !== 'image' || picture.group?.kind !== 'gallery') return null
  const beside = (s) => s.entity === picture.entity && s.group?.id === picture.group.id
  return list.find((s) => beside(s) && isOpenableAlt(s)) ?? null
}
