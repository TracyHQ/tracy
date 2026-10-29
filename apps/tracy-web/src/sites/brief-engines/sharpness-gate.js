/**
 * The sharpness gate of a brief build's owner photos (spec TracyHQ/tracy#189): every picture slot the fill plan gives an
 * owner photo is checked on the photo as it will be shown, cut to the slot and rendered at its shown size at 1x and 2x
 * (`lib/photo-sharpness.js`). The order, decided 29/10/2026, for every slot alike:
 *
 *   1. sharp as cut                       keep the owner photo
 *   2. soft or blocky, light correction   measure again; sharp now, keep the photo with the correction
 *   3. still failing                      the photo is refused for that slot (`unsharp`) and the fill plan runs again, so
 *                                         the next owner photo of its ranking that fits the slot's subject is met
 *   4. no owner photo passes              the slot is left to the drawing step (same model and recipe, the owner's photos
 *                                         as references, never extended from a photo the gate refused there)
 *   5. every step                         recorded per slot: score, threshold, the step taken and the photos refused
 *
 * Owner photos stay preferred over drawings: only a photo that is not sharp in that slot loses its place. Only photo
 * slots are judged; a cut-out, an icon, an avatar or a logo has its own path.
 */
import { createHash } from 'node:crypto'
import { cutForPlace } from '../../lib/picture-cut.js'
import {
  correctPhoto,
  judgePhoto,
  MAX_BLOCKINESS,
  SHARPNESS_VERSION,
  slotClassOf
} from '../../lib/photo-sharpness.js'

/** The Slot fit kinds the gate judges: pictures shown as photographs. */
const PHOTO_KINDS = new Set(['photo', 'video-poster'])
/** Rounds of re-planning at most: each adds at least one refusal, so this only stops a runaway. */
const MAX_ROUNDS = 24

const judgedSlot = (slot) =>
  slot && slot.type === 'image' && (!slot.fit?.kind || PHOTO_KINDS.has(slot.fit.kind))

/** A gate record without the measured bytes, as the plan and the receipt keep it. */
const recordOf = (mediaId, j) => ({
  mediaId,
  verdict: j.verdict,
  step: j.step,
  score: j.score,
  threshold: j.threshold,
  bar: j.bar,
  width: j.width,
  reason: j.reason,
  measured: j.measured,
  ...(j.before ? { before: j.before } : {})
})

/**
 * Plan the fill, judge each photo it places, refuse the unsharp ones per slot and plan again until every placed photo
 * passes.
 * @param {object} input
 * @param {(unsharp: Map<string, Set<string>>) => any} input.plan - the fill plan with these refusals (`planFill`)
 * @param {{slots: any[]}} input.contentMap
 * @param {{bytes: (id: string) => Promise<Uint8Array | null>}} input.real
 * @param {(slot: any) => number} input.shownWidthOf - the fill plan's shown width of a slot
 * @param {(note: string) => void} [input.note]
 * @param {typeof judgePhoto} [input.judge]
 * @returns {Promise<{fill: any, unsharp: Map<string, Set<string>>, sharpness: {version: string,
 *   slots: Record<string, any>}}>}
 */
export async function sharpFill({
  plan,
  contentMap,
  real,
  shownWidthOf,
  note = () => {},
  judge = judgePhoto
}) {
  const slotOf = new Map((contentMap?.slots ?? []).map((s) => [s.key, s]))
  const unsharp = new Map()
  const refusedFor = new Map()
  const judged = new Map()
  const bytesOf = new Map()
  let fill = plan(unsharp)
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    // One judgement per unit and photo: the slots one cut serves share it (the widest shown width decides).
    const units = new Map()
    for (const d of fill.slots ?? []) {
      if (d.action !== 'photo' || !d.mediaId || !d.crop) continue
      const id = `${d.unit ?? d.file}|${d.mediaId}`
      const unit = units.get(id) ?? { mediaId: d.mediaId, crop: d.crop, keys: [] }
      unit.keys.push(d.key)
      units.set(id, unit)
    }
    let refusedNow = 0
    for (const unit of units.values()) {
      const slots = unit.keys.map((k) => slotOf.get(k))
      if (!slots.every(judgedSlot)) continue
      const cls = slotClassOf(slots, shownWidthOf)
      if (!cls) continue
      const memo = `${unit.mediaId}|${JSON.stringify(unit.crop)}|${cls.kind}|${cls.width}`
      if (!judged.has(memo)) {
        let verdict = null
        try {
          if (!bytesOf.has(unit.mediaId))
            bytesOf.set(unit.mediaId, await Promise.resolve(real.bytes(unit.mediaId)).catch(() => null))
          const bytes = bytesOf.get(unit.mediaId)
          // An unreadable photo is the cut step's to report; the gate does not refuse what it could not see.
          if (bytes) {
            const cut = await cutForPlace(bytes, unit.crop)
            const scale = unit.crop.output.width / unit.crop.source.width
            verdict = recordOf(unit.mediaId, await judge(cut.bytes, cls, { source: bytes, scale }))
          }
        } catch {
          verdict = null
        }
        judged.set(memo, verdict)
      }
      const verdict = judged.get(memo)
      if (!verdict || verdict.verdict !== 'fail') continue
      for (const key of unit.keys) {
        unsharp.set(key, (unsharp.get(key) ?? new Set()).add(unit.mediaId))
        refusedFor.set(key, [...(refusedFor.get(key) ?? []), verdict])
      }
      refusedNow += 1
    }
    if (refusedNow === 0) break
    fill = plan(unsharp)
  }
  // What each slot ended with: the verdict of its photo, and every photo refused for it on the way.
  const slots = {}
  for (const d of fill.slots ?? []) {
    const refused = refusedFor.get(d.key) ?? []
    let kept = null
    if (d.action === 'photo' && d.mediaId)
      for (const [memo, v] of judged)
        if (v && memo.startsWith(`${d.mediaId}|${JSON.stringify(d.crop)}|`) && v.verdict !== 'fail') kept = v
    if (!kept && refused.length === 0) continue
    slots[d.key] = {
      ...(kept ?? { step: d.action === 'photo' ? 'kept' : 'no-sharp-photo' }),
      ...(refused.length ? { refused: refused.map(({ measured: _m, before: _b, ...r }) => r) } : {})
    }
  }
  const lost = Object.values(slots).filter((s) => s.step === 'no-sharp-photo').length
  if (lost)
    note(`${lost} picture slot(s) had no owner photo sharp enough once cut and shown, so they are drawn`)
  return { fill, unsharp, sharpness: { version: SHARPNESS_VERSION, slots } }
}

/**
 * The bytes to write for a photo the gate kept: the light correction again (deterministic) when its verdict was
 * `corrected`, else the cut as it is.
 * @param {{bytes: Buffer, ext: string, sha256: string}} cut
 * @param {any} record - the slot's gate record
 */
export async function correctedCut(cut, record) {
  if (record?.verdict !== 'corrected') return cut
  const blocky = (record.before?.blockiness ?? 0) > MAX_BLOCKINESS
  const bytes = await correctPhoto(cut.bytes, { blocky })
  return { ...cut, bytes, ext: 'jpg', sha256: createHash('sha256').update(bytes).digest('hex') }
}
