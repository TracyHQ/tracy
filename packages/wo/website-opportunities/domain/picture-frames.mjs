// The picture frames of a build plan and the business's own pictures (ticket #595, spec #577). Pure: the plan's pages,
// the block descriptions (block store and Tracy library) and the plan data in, every frame a picture may fill out; a
// needs profile in, every own picture record out. The picture policy (`picture-policy.mjs`) fills the frames.
//
// 🔒 A VIDEO FRAME IS ITS OWN FRAME. An image field is a picture frame. A video frame is what Contract A declares as one:
// a `link` field of kind `business.video` (JA Boxing stores its trainer and class videos so). An image frame never takes
// a video, so a video is never the default hero background.
//
// 🔒 TRACY NEVER ADDS A STOCK PHOTO. A picture the business itself published (on its website, its listing, its social
// profiles) is treated as its own. A source that knows a picture is stock marks it (`stock: true` or `origin: 'stock'`)
// and the flag is honoured: the picture is never placed. Nothing in research or the needs profile sets that flag yet, and
// no detector guesses it.
import { placesOfBlock, repeatedNames } from './picture-block-places.mjs'
import { frameOfField } from './picture-frame-size.mjs'
import { PicturePolicyError } from './picture-labelling.mjs'
import { personOfFrame } from './picture-people.mjs'
import { GALLERY_ONLY_OWN, generationOf, PEOPLE_ROLES } from './picture-roles.mjs'
import { orientationOf } from './pictures/asset-labels.mjs'

/** Field kinds whose frame shows a person: a picture of a person is never generated for one. */
export const PEOPLE_FRAME_KINDS = PEOPLE_ROLES
const PEOPLE = new Set(PEOPLE_FRAME_KINDS)
/** File endings that mark a picture as a video when its record does not say. */
const VIDEO_FILE = /\.(mp4|m4v|mov|webm|ogv)(\?.*)?$/i
/** The data kind of a video, and the field type Contract A declares a video frame with. */
export const VIDEO_KIND = 'business.video'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** Whether a field is a video frame of Contract A: a link field of kind `business.video`. */
export const isVideoFrame = (field) => field?.type === 'link' && field.kind === VIDEO_KIND
/** Whether a field is a frame the picture policy fills: an image field or a video frame. */
const isFrame = (field) => field?.type === 'image' || isVideoFrame(field)

/**
 * Where a frame sits: `hero` (a picture field of a hero block), `block` (another block level picture field), `item`
 * (a picture field of one item a block shows), `row` (a picture field of a child list row) or `video` (a video frame,
 * a `business.video` link field, at any depth).
 */
function placeOf(block, field, level) {
  if (isVideoFrame(field)) return 'video'
  if (level === 'item' || level === 'row') return level
  return block.type === 'hero' ? 'hero' : 'block'
}

/** Why a frame is never generated, or null: its kind's reason, or a frame of a gallery (block or item), never drawn. */
function neverOf(block, field, at, place) {
  if (place === 'video') return null
  const generation = generationOf(field.kind)
  if (!generation.may) return generation.reason
  return block.type === 'gallery' || at.itemKind === 'gallery' ? GALLERY_ONLY_OWN : null
}

/**
 * Every picture frame of the plan, in page order, at every depth (`picture-block-places.mjs`): block level frames,
 * the rows of the block's child lists, then each shown item's frames and its child list rows.
 * @param {object[]} pages placed pages of the plan (`plan.pages`)
 * @param {Map<string, object>} blocks block id -> its description (block store or library)
 * @param {{byId: Map<string, {what: string, kind: string}>}} data the plan data (`plan-data.mjs`)
 * @returns {Array<{id: string, page: string, block: string, blockId: string, blockType: string, field: string,
 *   kind: string | null, place: 'hero' | 'block' | 'item' | 'row' | 'video', item?: string, itemKind?: string,
 *   row?: string, theme?: 'light' | 'dark', variantOf?: string, shape: 'landscape' | 'portrait' | 'square' | 'unknown',
 *   size?: {width: number, height: number}, people: boolean, person?: string, never?: string}>} `person`: the named
 *   person item a people frame shows (`picture-people.mjs`); `shape` and `size`
 *   are the frame's own, from its declared `frame` size (Contract A); `never` is set when the frame's kind is never
 *   generated (`picture-roles.mjs`), with the reason it records when no own picture fills it. A frame declared in
 *   another shape than Contract A's, or two fields of one name in one place, throw a `PicturePolicyError`.
 */
export function framesOfPlan(pages, blocks, data) {
  const frames = []
  for (const page of list(pages)) {
    for (const block of list(page?.blocks)) {
      const description = blocks.get(block.block) ?? {}
      for (const at of placesOfBlock(page, block, description, data)) {
        const fields = at.fields.filter(isFrame)
        const repeated = repeatedNames(fields)
        if (repeated.length)
          throw new PicturePolicyError(
            'picture_field_repeated',
            `${at.prefix} declares ${repeated.join(', ')} twice: two frames would share one id`,
            { at: at.prefix, fields: repeated }
          )
        for (const field of fields) {
          const place = placeOf(block, field, at.level)
          const { frame, problem } = frameOfField(field)
          if (problem)
            throw new PicturePolicyError('picture_frame_invalid', `${at.prefix}.${field.name}: ${problem}`, {
              at: `${at.prefix}.${field.name}`
            })
          const never = neverOf(block, field, at, place)
          const people = PEOPLE.has(field.kind) || (at.itemKind === 'person' && place === 'item')
          const person = personOfFrame({ people, place, item: at.item, itemKind: at.itemKind }, block, data)
          frames.push({
            id: `${at.prefix}.${field.name}`,
            page: page.id,
            block: block.id,
            blockId: block.block,
            blockType: block.type,
            field: field.name,
            kind: field.kind ?? null,
            place,
            ...(at.item ? { item: at.item, itemKind: at.itemKind } : {}),
            ...(at.row ? { row: at.row } : {}),
            // A light and dark pair (Contract A): the variant names its base field; the policy gives both one picture.
            ...(field.theme ? { theme: field.theme } : {}),
            ...(field.variantOf ? { variantOf: field.variantOf } : {}),
            shape: orientationOf(frame?.width, frame?.height),
            ...(frame ? { size: frame } : {}),
            people,
            ...(person ? { person } : {}),
            ...(never ? { never } : {})
          })
        }
      }
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
    media: role === VIDEO_KIND || VIDEO_FILE.test(ref) ? 'video' : 'photo',
    item: item.id,
    itemKind: item.kind,
    role,
    label: isText(item.label) && role === 'business.gallery_image' ? item.label : null,
    ...(item.content ? { content: item.content } : {}),
    ...(typeof item.burnedInText === 'boolean' ? { burnedInText: item.burnedInText } : {}),
    ...(item.width ? { width: item.width } : {}),
    ...(item.height ? { height: item.height } : {}),
    // Honoured when a source sets it; a picture the business published itself is its own (see the head of the file).
    stock: item.stock === true || item.origin === 'stock',
    from: fromOf(data, item.id)
  }
}

/**
 * Every own picture the plan data holds: each gallery photo, and each picture value of an item (a coach's photo, a
 * dish photo, an award's logo, a video). A gallery photo keeps the label research gave it; every other picture starts unlabelled. A record the
 * profile marks as stock (`stock: true` or `origin: 'stock'`) is kept so the policy can refuse it by name.
 * @param {{byId: Map<string, {what: string, source: object}>}} data the plan data of a needs profile (`plan-data.mjs`)
 */
export function ownPicturesOf(data) {
  const out = []
  for (const { what, source: item } of data.byId.values())
    if (what === 'item')
      for (const [role, field] of Object.entries(item?.fields ?? {}))
        if (
          (role.endsWith('.image') ||
            role.endsWith('_image') ||
            role.endsWith('_logo') ||
            role === VIDEO_KIND) &&
          isText(field?.value)
        )
          out.push(recordOf(item, role, field, data))
  return out
}
