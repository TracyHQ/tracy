// The entries of a site-pictures/1 manifest as the code run writes them (#340, ADR 0043 section 1), and the twins:
// a kit frame with twinOf, or a plan frame with sameAs, follows its source frame with the same file. Pure.
import { sitePathOf } from './manifest-shape.js'

/** A placed file's fields: `files/<sha256>.<ext>` beside the manifest, and its site path named by the same hash. */
export function fileFields(made) {
  const file = `files/${made.sha256}.${made.ext}`
  return {
    file,
    width: made.width,
    height: made.height,
    sha256: made.sha256,
    sitePath: sitePathOf(file, made.sha256)
  }
}

/** An entry that places a made file. */
export const placedEntry = (frame, source, made, extra = {}) => ({
  frame,
  source,
  ...fileFields(made),
  crop: made.crop ?? null,
  enlarge: made.enlarge ?? null,
  sharpness: made.sharpness ?? null,
  darkened: false,
  seen: null,
  ...extra
})

/** A hidden frame: no file. */
export const hiddenEntry = (frame, reason) => ({
  frame,
  source: 'hide',
  file: null,
  crop: null,
  enlarge: null,
  sharpness: null,
  darkened: false,
  seen: null,
  reason
})

/** A frame left for a later step: never a demo picture, never placed. */
export const pendingEntry = (wish, frame, waitsFor, reason) => ({
  frame: wish.frame,
  kind: frame?.kind ?? wish.kind ?? null,
  match: wish.match ?? null,
  waitsFor,
  reason
})

// A copy of a painted source (initials, icon) carries its recipe and stays a preview; a copy of an icon holds the
// light file (its \`file\`), unless the source is itself a twin that says which it holds.
function paintOf(src) {
  if (!src.paint) return {}
  const icon = src.source === 'icon' || 'light' in src.paint
  return { paint: icon ? { ...src.paint, holds: src.paint.holds ?? 'light' } : src.paint, preview: true }
}

const copyOf = (twin, sourceFrame, src) => ({
  frame: twin,
  source: 'twin',
  twinOf: sourceFrame,
  file: src.file,
  width: src.width,
  height: src.height,
  sha256: src.sha256,
  sitePath: src.sitePath,
  crop: src.crop,
  enlarge: src.enlarge,
  sharpness: src.sharpness,
  darkened: src.darkened,
  ...(src.overlay ? { overlay: src.overlay } : {}),
  ...paintOf(src),
  seen: null,
  reason: `follows ${sourceFrame}`
})

/**
 * Twins after every source frame is decided. A planned twin follows its source: a copy of a placed picture, hidden
 * (or returned when it cannot hide) when its source is hidden or returned, pending when its source is. A writable kit
 * twin of a placed frame gets its copy even when the plan does not name it.
 * @param {{ idx: object, entries: Map<string, object>, returns: object[], pending: object[] }} state
 */
export function addTwins({ idx, entries, returns, pending }) {
  const returned = new Set(returns.map((r) => r.frame))
  const pendingOf = new Map(pending.map((p) => [p.frame, p]))
  const sourceOf = (frameId, wish) => idx.frames.get(frameId)?.twinOf || wish?.sameAs || null
  for (const [frameId, wish] of idx.wishes) {
    const frame = idx.frames.get(frameId)
    const source = sourceOf(frameId, wish)
    if (!frame || !source || entries.has(frameId) || returned.has(frameId) || pendingOf.has(frameId)) continue
    const src = entries.get(source)
    if (src?.list === 'frames' && src.entry.source !== 'hide' && frame.writable !== false)
      entries.set(frameId, { list: 'frames', entry: copyOf(frameId, source, src.entry) })
    else if (pendingOf.has(source))
      pending.push(
        pendingEntry(wish, frame, pendingOf.get(source).waitsFor, `follows ${source}, still pending`)
      )
    else if ((src?.entry.source === 'hide' || returned.has(source)) && frame.canHide === true)
      entries.set(frameId, {
        list: 'frames',
        entry: hiddenEntry(frameId, `follows ${source}, which is not filled`)
      })
    else
      returns.push({
        frame: frameId,
        reason: src
          ? `follows ${source}, which ${src.list === 'siteSettings' ? 'is a template setting listed in siteSettings' : 'is hidden'}; this frame cannot follow it`
          : `follows ${source}, which the plan does not fill`
      })
  }
  for (const [source, twins] of idx.twinsOf) {
    const src = entries.get(source)
    if (src?.list !== 'frames' || src.entry.source === 'hide') continue
    for (const twin of twins) {
      if (entries.has(twin) || idx.wishes.has(twin) || idx.frames.get(twin)?.writable === false) continue
      entries.set(twin, { list: 'frames', entry: copyOf(twin, source, src.entry) })
    }
  }
}
