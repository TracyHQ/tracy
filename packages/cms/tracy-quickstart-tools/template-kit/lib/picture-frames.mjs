// Every picture a block shows is a frame of the kit: an <img> and a CSS background alike, whether it is painted
// inside the block or behind it (a page background the template draws from its own settings and that shows through
// a transparent block). The read pass lists them (`details.pictures`); a picture no frame or declared image slot of
// the block holds becomes a frame here, read like the others (id, shape, size, kind, canHide, twinOf), and says
// whether a planner can replace it: a picture no content map slot holds cannot be written through the contract.
import { pictureOf } from './block-slots.mjs'
import { neutralKey } from './ids.mjs'
import { shapeOfBox } from './kit-frames.mjs'
import { declaredIn } from './page-coverage.mjs'

/** Why a picture painted behind a block is not writable, until a setting slot (background-slot.mjs) holds it. */
export const PAINTED_BEHIND_REASON =
  "the picture is painted behind the block by the template's own page settings, which no content map slot holds; a planner cannot replace it through the contract"

const norm = (f) =>
  String(f ?? '')
    .replace(/^\/+/, '')
    .toLowerCase()

/**
 * Per block, the picture files its frames and declared image slots hold, and the image slots of every entity the
 * block declares a slot of (a listing's card picture is its item's own image slot, listed with the item).
 */
function heldPictures(kit, map) {
  const entityOf = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s.entity]))
  const imagesOf = new Map()
  for (const s of map.slots ?? [])
    if (s.type === 'image') imagesOf.set(s.entity, [...(imagesOf.get(s.entity) ?? []), norm(pictureOf(s))])
  const declared = declaredIn(kit)
  const out = new Map()
  for (const b of kit.blocks) {
    const held = new Set((b.frames ?? []).map((f) => norm(f.picture)).filter(Boolean))
    const entities = new Set([...(declared.get(b.id) ?? [])].map((id) => entityOf.get(id)).filter(Boolean))
    for (const e of entities) for (const f of imagesOf.get(e) ?? []) held.add(f)
    out.set(b.id, held)
  }
  return out
}

/** The pictures a block's reading shows that nothing of the block holds. */
function unheld(b, readings, held) {
  return (readings.get(b.id)?.pictures ?? []).filter((p) => p.file && !held.get(b.id)?.has(norm(p.file)))
}

/**
 * Adds a frame for every picture a block shows that no frame or declared image slot of the block holds. The same
 * painter showing the same file in several blocks is one picture: the first block's frame is the one, the others are
 * its twins. Whether strangers' faces are in it is copied from any frame of the kit showing the same file.
 * Returns how many frames were added.
 * @param {object} kit
 * @param {object} map the content map
 * @param {Map<string, object>} readings block id -> the read pass's reading at the widest width
 */
export function pictureFrames(kit, map, readings) {
  const held = heldPictures(kit, map)
  const byFile = new Map()
  for (const b of kit.blocks)
    for (const f of b.frames ?? [])
      if (f.picture && !byFile.has(norm(f.picture))) byFile.set(norm(f.picture), f)
  const slotFiles = new Set(
    (map.slots ?? []).filter((s) => s.type === 'image').map((s) => norm(pictureOf(s)))
  )
  const firstOf = new Map()
  let added = 0
  for (const b of kit.blocks) {
    b.frames ??= []
    for (const p of unheld(b, readings, held)) {
      const id = `${b.id}.picture-${p.position + 1}`
      const key = `${p.painter}|${norm(p.file)}`
      const main = firstOf.get(key)
      const same = byFile.get(norm(p.file))
      const background = p.via === 'background'
      const frame = {
        id,
        shape: main?.shape ?? shapeOfBox(p.box?.width, p.box?.height),
        width: main?.width ?? p.box?.width ?? null,
        height: main?.height ?? p.box?.height ?? null,
        kind: 'photo',
        // A CSS background takes no room in the layout: emptying it moves nothing.
        canHide: background ? true : null,
        twinOf: main?.id ?? null,
        fixed: false,
        hideEvidence: background
          ? {
              measured: null,
              checks: { all: 'a CSS background takes no room in the layout, so emptying it moves nothing' },
              measuredAs: 'single',
              invalid: false,
              judgedBy: 'automatic check'
            }
          : null,
        kindEvidence: { clearShare: null, overPicture: false, paintedBy: p.painter, box: p.box ?? null },
        picture: p.file,
        role: null,
        shownAs: background ? 'background' : 'img',
        painter: p.painter,
        paintedBehind: !!p.behind,
        writable: false,
        writableReason: p.behind
          ? PAINTED_BEHIND_REASON
          : 'no content map slot holds this picture; a planner cannot replace it through the contract',
        ...(slotFiles.has(norm(p.file))
          ? {
              sameFileAs:
                'a content map slot shows the same file elsewhere; replacing that slot does not change this one'
            }
          : {}),
        ...(same && typeof same.faces === 'boolean'
          ? { faces: same.faces, classReason: same.classReason ?? `same file as ${same.id}` }
          : { faces: null })
      }
      if (!main) firstOf.set(key, frame)
      b.frames.push(frame)
      added++
    }
  }
  return added
}

/**
 * Gate part: pictures a block shows that no frame or declared image slot of the block holds. Each one is a failure,
 * named by block and file.
 * @param {{kit: object, map: object, readings: Map<string, object>, fail: Function}} o
 * @returns {number}
 */
export function imagesWithoutFrame({ kit, map, readings, fail }) {
  const held = heldPictures(kit, map)
  let missing = 0
  for (const b of kit.blocks)
    for (const p of unheld(b, readings, held)) {
      missing++
      fail(
        'imagesWithoutFrame',
        `blocks[${b.id}] ${p.file}`,
        `the block shows ${p.file} (${p.via === 'background' ? `a CSS background of ${p.painter}${p.behind ? ', painted behind the block' : ''}` : 'an <img>'}) but no frame holds it`
      )
    }
  return missing
}
