// What the picker sees (#342, ADR 0043 section 3): the frames it answers, each with the plan's words and the code
// shortlist of photo codes, and the owner photos once, as small labelled thumbnails. Never a demo picture of the kit:
// the only images made here are thumbnails of brief photos.
//
// The picker answers every frame code left pending for it (fill-frames.js: a `specific` photo frame that is no twin).
// Its shortlist is every usable owner photo (photo-shortlist.js: no lettering, no other business, no portrait of a
// person, a low quality photo only for a small frame) that is not already shown on a page of the frame and that cuts
// well for it (cut-photo.js: subject kept, at most 1.5 times enlarged, through the sharpness gate). Each photo is cut
// here, before the call, so applying an answer is a lookup: the cut files are the shortlist. A frame with an empty
// shortlist never goes to the picker; it waits for the drawer. Photos are named P1, P2, ... in the brief's order, and
// only the photos of some shortlist are shown.
import sharp from 'sharp'
import { cutPhoto } from './cut-photo.js'
import { WAITS_FOR } from './fill-frames.js'
import { OWNER_SOURCES } from './manifest-shape.js'
import { rankForFrame, sameService } from './photo-shortlist.js'

/** The longest side of a thumbnail the picker sees. */
export const THUMBNAIL_MAX = 512
const THUMBNAIL_JPEG = { quality: 80, mozjpeg: false }

/** What a picker frame that waits for the drawer says when no owner photo could be cut for it. */
export const NO_FIT_REASON = 'no owner photo can be cut for this frame; it waits for the drawer'

const isTwin = (idx, frameId) =>
  Boolean(idx.frames.get(frameId)?.twinOf) || Boolean(idx.wishes.get(frameId)?.sameAs)

/**
 * Whether a plan has a frame the picker would answer: a `specific` photo frame the kit can take (writable, or a
 * picture painted behind blocks) that is no twin. Decides at run start whether the run needs the picker door.
 * @param {object} idx the picture check's index of plan and kit (picture-check/inputs-index.js)
 */
export function needsPicker(idx) {
  for (const [frameId, wish] of idx.wishes) {
    const frame = idx.frames.get(frameId)
    if (!frame || (frame.writable === false && frame.paintedBehind !== true) || isTwin(idx, frameId)) continue
    if (['logo', 'icon', 'cutout'].includes(frame.kind)) continue
    if (wish.match !== 'any-real' && wish.match !== 'person') return true
  }
  return false
}

// The plan's words for one frame, as the picker reads them.
const wordsOf = (wish, frame) => ({
  shows: wish.shows ?? null,
  mustInclude: Array.isArray(wish.mustInclude) ? wish.mustInclude : [],
  avoid: Array.isArray(wish.avoid) ? wish.avoid : [],
  mood: wish.mood ?? null,
  size: wish.size ?? null,
  shape: `${frame.width} x ${frame.height}`
})

/**
 * Everything the picker needs, made before its call.
 * @param {{ idx: object, manifest: { frames: object[], siteSettings: object[], pending: object[] },
 *   usable: object[], photoBytes: Map<string, Buffer> }} input `manifest` the code half's parts; `usable` the brief
 *   photos code may use (photo-shortlist.js usablePhotos)
 * @returns {Promise<{ frames: object[], noFit: string[], codes: Map<string, object>, files: Map<string, object>,
 *   thumbnails: Map<string, { base64: string, mediaType: string, width: number, height: number }> }>} `frames` the
 *   frames the picker answers, each `{ frame, list, wish, words, candidates: Map<code, cut> }`; `noFit` the picker
 *   frames no photo fits; `codes` the brief asset of each code; `thumbnails` by code
 */
export async function pickerInput({ idx, manifest, usable, photoBytes }) {
  const placed = [...manifest.frames, ...manifest.siteSettings].filter((e) => OWNER_SOURCES.has(e.source))
  const onPage = new Set()
  for (const e of placed) for (const p of idx.wishes.get(e.frame)?.pages ?? []) onPage.add(`${p} ${e.asset}`)
  const usage = new Map(usable.map((a) => [a.id, 0]))
  for (const e of placed) usage.set(e.asset, (usage.get(e.asset) ?? 0) + 1)
  const order = new Map(usable.map((a, i) => [a.id, i]))

  const wanted = manifest.pending.filter((p) => p.waitsFor === WAITS_FOR.picker && !isTwin(idx, p.frame))
  const shortlisted = []
  for (const p of wanted) {
    const wish = idx.wishes.get(p.frame)
    const frame = idx.frames.get(p.frame)
    const free = rankForFrame(usable, wish, frame, usage)
      .map((r) => r.a)
      .filter((a) => ![...wish.pages].some((pg) => onPage.has(`${pg} ${a.id}`)))
    const cuts = new Map()
    for (const a of free) {
      const cut = await cutPhoto(photoBytes.get(a.id), a, frame, idx.demoSize(p.frame), {
        matches: sameService(a, wish)
      })
      if (cut.ok) cuts.set(a.id, cut)
    }
    shortlisted.push({
      frame: p.frame,
      list: idx.listOf(frame),
      wish,
      words: wordsOf(wish, frame),
      cuts
    })
  }

  // Codes in the brief's order, for the photos some shortlist holds.
  const shown = new Set(shortlisted.flatMap((f) => [...f.cuts.keys()]))
  const assets = usable.filter((a) => shown.has(a.id)).sort((x, y) => order.get(x.id) - order.get(y.id))
  const codes = new Map(assets.map((a, i) => [`P${i + 1}`, a]))
  const codeOf = new Map([...codes].map(([code, a]) => [a.id, code]))
  const thumbnails = new Map()
  for (const [code, a] of codes) thumbnails.set(code, await thumbnailOf(photoBytes.get(a.id)))

  const files = new Map()
  const frames = []
  const noFit = []
  for (const f of shortlisted) {
    if (!f.cuts.size) {
      noFit.push(f.frame)
      continue
    }
    const candidates = new Map()
    for (const [assetId, cut] of f.cuts) {
      candidates.set(codeOf.get(assetId), { ...cut, asset: assetId })
      files.set(`files/${cut.sha256}.${cut.ext}`, cut)
    }
    frames.push({ frame: f.frame, list: f.list, wish: f.wish, words: f.words, candidates })
  }
  return { frames, noFit, codes, files, thumbnails }
}

async function thumbnailOf(bytes) {
  const { data, info } = await sharp(Buffer.from(bytes), { failOn: 'none' })
    .rotate()
    .resize(THUMBNAIL_MAX, THUMBNAIL_MAX, { fit: 'inside', withoutEnlargement: true })
    .jpeg(THUMBNAIL_JPEG)
    .toBuffer({ resolveWithObject: true })
  return { base64: data.toString('base64'), mediaType: 'image/jpeg', width: info.width, height: info.height }
}

/** The answer form the first message asks for. */
export const ANSWER_FORM =
  '{ "picks": [ { "frame": "<frame id>", "photo": "<a code from the frame\'s list, or none>", "reason": "<one sentence>" } ] }'

/**
 * The picker's only user message: the frames with their words and shortlists, then every shortlisted photo once, its
 * code as a text part right before its thumbnail. A thumbnail is a reference the run resolves to bytes before each
 * call (resolveImage), so the saved turn never holds the bytes.
 */
export function pickerFirstMessage(input) {
  const frames = input.frames.map((f) => ({
    frame: f.frame,
    pages: [...f.wish.pages],
    ...f.words,
    photos: [...f.candidates.keys()]
  }))
  const text = [
    `The site plan asks for a specific picture in these ${frames.length} frames. For each one, choose one photo from its "photos" list, or "none".`,
    '',
    JSON.stringify(frames, null, 2),
    '',
    `The owner's photos follow, each after its code. Answer for every frame above, as one JSON object with nothing before or after it:`,
    ANSWER_FORM
  ].join('\n')
  const parts = [{ type: 'text', text }]
  for (const [code, thumb] of input.thumbnails)
    parts.push(
      { type: 'text', text: `Photo ${code} (${thumb.width} x ${thumb.height}):` },
      { type: 'image_ref', ref: { picturePhoto: code }, media_type: thumb.mediaType }
    )
  return parts
}

/** The bytes behind a thumbnail reference of the first message; null for any other reference. */
export const thumbnailResolver = (input) => (ref) => {
  const thumb = input.thumbnails.get(ref?.picturePhoto)
  return thumb ? { base64: thumb.base64, mediaType: thumb.mediaType } : null
}
