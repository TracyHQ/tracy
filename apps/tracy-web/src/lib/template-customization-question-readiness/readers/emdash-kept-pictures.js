/**
 * Which alt text fields of an EmDash seed describe a demo picture that stays on the customer's site
 * (ABOUT-2). A field `<image>_alt` (`image_alt`, `hero_image_alt`) belongs to the picture slot
 * `<image>` of the same entry. The picture is there when the seed gives that slot a value or the
 * media importer fills it (`seed/media-map.json`, a target with that collection, slug and path). It
 * stays when no `images` rule of `seed/personalize.json` draws a new one for that slot: a
 * `targets` row names (collection, slug, field), an `entries` row names (collection, field).
 *
 * The alt of a kept picture is the template's own description of that picture, so it is right to
 * keep it. The alt of a picture the customer replaces describes the demo picture under a new one,
 * so it still counts. An `_alt` field with no picture behind it counts like any other text.
 */

/**
 * @param {{ files: Map<string, string>, personalize: any, seed: any }} t the packed template (`emdashTemplate`)
 * @returns {(collection: string, slug: string, field: string, data: Record<string, any>) => boolean}
 */
export function keptPictureAlt(t) {
  let mediaMap = null
  try {
    const text = t.files.get('seed/media-map.json')
    mediaMap = text === undefined ? null : JSON.parse(text)
  } catch {
    mediaMap = null
  }
  const filled = new Set()
  for (const item of mediaMap?.items ?? [])
    for (const target of item.targets ?? []) filled.add(`${target.collection}/${target.slug}.${target.path}`)
  // A template that draws no picture writes `images: []` (Tracy Base); one that does, an object.
  const images = t.personalize?.images
  const rows = (/** @type {'targets' | 'entries'} */ key) =>
    images && !Array.isArray(images) && Array.isArray(images[key]) ? images[key] : []
  const redrawn = new Set(rows('targets').map((r) => `${r.collection}/${r.slug}.${r.field}`))
  const redrawnEntries = new Set(rows('entries').map((r) => `${r.collection}.${r.field}`))

  return (collection, slug, field, data) => {
    const m = /^(.*)_alt$/.exec(field)
    if (!m) return false
    const image = m[1]
    const present = Boolean(data[image]) || filled.has(`${collection}/${slug}.${image}`)
    if (!present) return false
    return !redrawn.has(`${collection}/${slug}.${image}`) && !redrawnEntries.has(`${collection}.${image}`)
  }
}
