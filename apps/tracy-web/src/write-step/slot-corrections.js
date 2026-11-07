// What the plugin on this site corrects of a released contract (`info.slot_corrections`, its lib/slot-corrections.json): a kept
// icon that takes a transparent drawing, and a gallery alt that may fill its empty sample. A site's plugin decides, per
// contract, so it is read from the site. An older plugin says nothing and answers as it always did, so nothing is sent
// that it would refuse. Read at most once a run, and only when a frame needs the answer.
import { galleryAltSlot } from '../lib/gallery-alt-slot.js'
import { PICTURE_OWNER } from './picture-package.js'
import { infoOf, SLOT_CORRECTIONS_DOOR } from './plugin-doors.js'

const NONE = { icons: false, alts: false }

/** @returns {() => Promise<{ icons: boolean, alts: boolean }>} what this site takes for this contract */
export function correctionsReader(door, siteKey, contract) {
  let answer = null
  const ask = async () => {
    try {
      const said = await door.apply({ siteKey, action: 'info', params: {} })
      const entry =
        said?.ok === false ? null : infoOf(SLOT_CORRECTIONS_DOOR, said?.info)?.contracts?.[contract]
      return { icons: Number(entry?.icons) > 0, alts: Number(entry?.alts) > 0 }
    } catch {
      return NONE
    }
  }
  return () => (answer ??= ask())
}

/** The rule the plugin's list is written by: an icon the contract keeps only because it stands on a transparent ground. */
export const isKeptIcon = (slot) =>
  slot?.type === 'image' &&
  slot.fit?.replace === 'keep' &&
  slot.fit.kind === 'icon' &&
  slot.fit.transparent === true

/**
 * The alts that go through the contract door. The alt step 8 wrote from the picture it placed (`pictureAlts`, ADR 0043
 * section 3f) goes over the writer's, who wrote from the wish before any picture was chosen; the writer's stands only on a
 * frame step 8 wrote none for. A frame the files hide is left, and so is one without a slot: those stay in `left` and keep
 * their skipped line.
 * @param {{ alts: Record<string, string>, pictureAlts?: Record<string, string>, contentMap?: { slots?: object[] } | null,
 *   hidden: Set<string>, file: string, picturesFile?: string | null }} input
 * @returns {{ claims: object[], changes: Record<string, string>, left: Record<string, string> }}
 */
export function galleryAlts({ alts, pictureAlts = {}, contentMap, hidden, file, picturesFile = null }) {
  const slots = Array.isArray(contentMap?.slots) ? contentMap.slots : []
  const out = { claims: [], changes: {}, left: {} }
  const fromPictures = new Map(
    Object.entries(pictureAlts ?? {}).filter(([, text]) => typeof text === 'string' && text.trim())
  )
  for (const frame of new Set([...Object.keys(alts), ...fromPictures.keys()])) {
    const byPicture = fromPictures.has(frame)
    const text = byPicture ? fromPictures.get(frame) : alts[frame]
    const slot = hidden.has(frame) ? null : galleryAltSlot(frame, slots)
    if (!slot) {
      out.left[frame] = text
      continue
    }
    out.changes[slot.key] = text
    out.claims.push({
      slot: slot.key.replace(/^module-/, 'block-'),
      owner: byPicture ? PICTURE_OWNER : 'writer',
      file: byPicture ? (picturesFile ?? file) : file,
      kind: 'text',
      content: text
    })
  }
  return out
}

/** The alts a picture package carries (`alts`, by frame), only the non-empty strings; an older package has none. */
export function pictureAltsOf(pictures) {
  const alts = pictures?.alts
  if (!alts || typeof alts !== 'object' || Array.isArray(alts)) return {}
  return Object.fromEntries(Object.entries(alts).filter(([, t]) => typeof t === 'string' && t.trim()))
}
