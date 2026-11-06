// What the plugin on this site corrects of a released contract (`info.slot_corrections`, its lib/slot-corrections.json): a kept
// icon that takes a transparent drawing, and a gallery alt that may fill its empty sample. A site's plugin decides, per
// contract, so it is read from the site. An older plugin says nothing and answers as it always did, so nothing is sent
// that it would refuse. Read at most once a run, and only when a frame needs the answer.
import { contentMapKey } from '../lib/site-copy/contract-mapping.js'

const NONE = { icons: false, alts: false }

/** @returns {() => Promise<{ icons: boolean, alts: boolean }>} what this site takes for this contract */
export function correctionsReader(door, siteKey, contract) {
  let answer = null
  const ask = async () => {
    try {
      const said = await door.apply({ siteKey, action: 'info', params: {} })
      const entry = said?.ok === false ? null : said?.info?.slot_corrections?.contracts?.[contract]
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

const isOpenableAlt = (slot) =>
  slot.type === 'text' &&
  String(slot.sample ?? '').trim() === '' &&
  Array.isArray(slot.jsonPath) &&
  slot.jsonPath.some((part) => String(part).endsWith('[alt]'))

/** The alt slot beside a frame's picture in its row, or null. Only a gallery row has one a door can fill. */
export function altSlotOf(frame, slots) {
  const picture = slots.find((s) => s.key === contentMapKey(frame))
  if (picture?.type !== 'image' || picture.group?.kind !== 'gallery') return null
  const beside = (s) => s.entity === picture.entity && s.group?.id === picture.group.id
  return slots.find((s) => beside(s) && isOpenableAlt(s)) ?? null
}

/**
 * The alts of the site copy that go through the contract door. A frame the files hide is left, and so is one without a slot:
 * those stay in `left` and keep their skipped line.
 * @param {{ alts: Record<string, string>, contentMap?: { slots?: object[] } | null, hidden: Set<string>, file: string }} input
 * @returns {{ claims: object[], changes: Record<string, string>, left: Record<string, string> }}
 */
export function galleryAlts({ alts, contentMap, hidden, file }) {
  const slots = Array.isArray(contentMap?.slots) ? contentMap.slots : []
  const out = { claims: [], changes: {}, left: {} }
  for (const [frame, text] of Object.entries(alts)) {
    const slot = hidden.has(frame) ? null : altSlotOf(frame, slots)
    if (!slot) {
      out.left[frame] = text
      continue
    }
    out.changes[slot.key] = text
    out.claims.push({
      slot: slot.key.replace(/^module-/, 'block-'),
      owner: 'writer',
      file,
      kind: 'text',
      content: text
    })
  }
  return out
}
