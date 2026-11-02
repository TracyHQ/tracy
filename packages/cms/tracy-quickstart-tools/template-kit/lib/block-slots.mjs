// Which content map slots a block holds: its own entity's, those of the blocks it contains (a tabs block shows
// one block per tab), and for the header the business logo and name. The capture side and the kit agree on it.
import { ownerOfPath } from './map-index.mjs'

/** The map entity behind a block: the page's owner for a page body, none for the header, else its source. */
export function entityOfBlock(rec, idx, pathOfSlug) {
  if (rec.id === 'header') return null
  if (rec.id.startsWith('body-')) {
    const slug = rec.id.slice('body-'.length)
    const path = pathOfSlug.get(slug)
    return path ? ownerOfPath(idx, path).owner : null
  }
  return rec.source
}

/** The slots of a block, and the entities they come from (its own first). */
export function slotsOfBlock({ rec, entity, idx }) {
  const entities = [entity, ...(rec.contains ?? [])].filter(Boolean)
  const slots = entities.length
    ? entities.flatMap((e) => idx.slotsBy.get(e) ?? [])
    : rec.id === 'header'
      ? (idx.map.slots ?? []).filter((s) => /^business\.(logo|name)$/.test(s.role ?? ''))
      : []
  return { entities, slots }
}

/** The picture file a slot names (the content map keeps an editor suffix after `#`). */
export const pictureOf = (slot) =>
  String(slot.sample ?? '')
    .split('#')[0]
    .split('?')[0]
