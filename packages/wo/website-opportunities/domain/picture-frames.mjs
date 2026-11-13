// The picture frames of a build plan and the business's own pictures (ticket #595, spec #577). Pure: the plan's pages,
// the block descriptions (block store and Tracy library) and the plan data in, every frame a picture may fill out; a
// needs profile in, every own picture record out. The picture policy (`picture-policy.mjs`) fills the frames.
//
// 🔒 A VIDEO FRAME IS ITS OWN FRAME. An image field is a picture frame. Only a field the template marks as a video frame
// (`media: 'video'` on an image field of the block description) may take a video; an image frame never takes one, so
// a video is never the default hero background.
import { orientationOf } from './pictures/asset-labels.mjs'

/** Field kinds whose frame shows a person: a picture of a person is never generated for one. */
export const PEOPLE_FRAME_KINDS = Object.freeze(['person.image', 'quote.author_image', 'stat.proof_image'])
const PEOPLE = new Set(PEOPLE_FRAME_KINDS)
/** File endings that mark a picture as a video when its record does not say. */
const VIDEO_FILE = /\.(mp4|m4v|mov|webm|ogv)(\?.*)?$/i

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isImage = (field) => field?.type === 'image'
const isVideoFrame = (field) => isImage(field) && field.media === 'video'

/**
 * Where a frame sits: `hero` (a picture field of a hero block), `block` (another block level picture field), `item`
 * (a picture field of one item a block shows) or `video` (a field the template marks as a video frame).
 */
function placeOf(block, field, isItem) {
  if (isVideoFrame(field)) return 'video'
  if (isItem) return 'item'
  return block.type === 'hero' ? 'hero' : 'block'
}

/**
 * Every picture frame of the plan, in page order: block level frames first, then each shown item's frames.
 * @param {object[]} pages placed pages of the plan (`plan.pages`)
 * @param {Map<string, object>} blocks block id -> its description (block store or library)
 * @param {{byId: Map<string, {what: string, kind: string}>}} data the plan data (`plan-data.mjs`)
 * @returns {Array<{id: string, page: string, block: string, blockId: string, blockType: string, field: string,
 *   kind: string | null, place: 'hero' | 'block' | 'item' | 'video', item?: string, itemKind?: string,
 *   shape: 'landscape' | 'portrait' | 'square' | 'unknown', people: boolean}>} `shape` is the frame's own, from
 *   its declared `frame` size (contract A)
 */
export function framesOfPlan(pages, blocks, data) {
  const frames = []
  for (const page of list(pages)) {
    for (const block of list(page?.blocks)) {
      const description = blocks.get(block.block) ?? {}
      const frame = (field, item) => {
        const place = placeOf(block, field, Boolean(item))
        const base = `${page.id}.${block.id}`
        frames.push({
          id: item ? `${base}.${item.id}.${field.name}` : `${base}.${field.name}`,
          page: page.id,
          block: block.id,
          blockId: block.block,
          blockType: block.type,
          field: field.name,
          kind: field.kind ?? null,
          place,
          ...(item ? { item: item.id, itemKind: item.kind } : {}),
          shape: orientationOf(field.frame?.width, field.frame?.height),
          people: PEOPLE.has(field.kind) || (item?.kind === 'person' && place === 'item')
        })
      }
      for (const field of list(description.fields).filter(isImage)) frame(field, null)
      const items = list(block.data)
        .map((id) => ({ id, entry: data.byId.get(id) }))
        .filter((d) => d.entry?.what === 'item')
        .map((d) => ({ id: d.id, kind: d.entry.kind }))
      for (const item of items)
        for (const field of list(description.itemFields).filter(isImage)) frame(field, item)
    }
  }
  return frames
}

/** How the customer reads where an own picture came from, by its item's plan sources. */
const fromOf = (data, itemId) => list(data.byId.get(itemId)?.entry?.sources).map((s) => s.name)

/** A picture record of one image value of a profile item. */
function recordOf(item, role, field, data) {
  const ref = field?.value
  return {
    id: role === 'business.gallery_image' ? item.id : `${item.id}:${role}`,
    ref,
    media: item.media === 'video' || VIDEO_FILE.test(ref) ? 'video' : 'photo',
    item: item.id,
    itemKind: item.kind,
    role,
    label: isText(item.label) && role === 'business.gallery_image' ? item.label : null,
    ...(item.content ? { content: item.content } : {}),
    ...(typeof item.burnedInText === 'boolean' ? { burnedInText: item.burnedInText } : {}),
    ...(item.width ? { width: item.width } : {}),
    ...(item.height ? { height: item.height } : {}),
    stock: item.stock === true || item.origin === 'stock',
    from: fromOf(data, item.id)
  }
}

/**
 * Every own picture the plan data holds: each gallery photo, and each picture value of an item (a coach's photo, a
 * dish photo). A gallery photo keeps the label research gave it; every other picture starts unlabelled. A record the
 * profile marks as stock (`stock: true` or `origin: 'stock'`) is kept so the policy can refuse it by name.
 * @param {{byId: Map<string, {what: string, source: object}>}} data the plan data of a needs profile (`plan-data.mjs`)
 */
export function ownPicturesOf(data) {
  const out = []
  for (const { what, source: item } of data.byId.values())
    if (what === 'item')
      for (const [role, field] of Object.entries(item?.fields ?? {}))
        if ((role.endsWith('.image') || role.endsWith('_image')) && isText(field?.value))
          out.push(recordOf(item, role, field, data))
  return out
}
