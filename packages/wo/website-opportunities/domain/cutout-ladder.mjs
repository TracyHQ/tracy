// What a cut-out slot becomes in a brief build (spec TracyHQ/tracy#189): a transparent figure the template stands over
// a ground (a hero, a call-to-action band, a feature, an about block). The demo's figure carries another business, so it
// goes; what takes its place climbs a ladder, first step that applies wins:
//
//   1 own       the owner has a clean transparent picture (a product shot, an object, a person already cut) of the slot's
//               subject: it stands where the demo figure stood, never larger than the figure's own place
//   2 off       DEFAULT. The slot is taken off (a clear picture, hidden by the head block), so the section's own ground,
//               the owner's background photo where there is one, carries it
//   3 framed    only where taking it off leaves a large visibly empty area: the figure stood in its own column beside the
//               text (measured box at most `BESIDE_TEXT_SHARE` of the desktop width, at least `LARGE` in both sides) and
//               no backdrop picture of the same section shows through. An ordinary photo the fill plan already chose for
//               the slot is shown in a frame (rounded corners, soft shadow, clear ground) inside the figure's box
//
// 🔒 NEVER DRAWN: a cut-out is never drawn by the picture model and no ground is ever removed from a drawing: a drawn
// object cut free showed a jagged fringe and, scaled to the demo figure's box, covered the headline and the buttons.
// 🔒 BY MEASURE, NEVER BY NAME: the zone is read from the slot's measured boxes (ADR 0039) and the image slots of its own
// entity; no template, trade or file is named. A slot with no measured box is never framed (its zone is unknown).
/** The desktop viewport the Slot fit boxes are measured at (content coverage capture, ADR 0039). */
export const DESKTOP_VIEWPORT = 1440
/** A figure box no wider than this share of the desktop width leaves room for a text column beside it. */
export const BESIDE_TEXT_SHARE = 0.62
/** A picture at least this wide (share of the desktop width) behind the section is its backdrop. */
const BACKDROP_SHARE = 0.9
/** Below this box (CSS px) a cleared figure leaves a gap, not a visibly empty area. */
export const LARGE = Object.freeze({ width: 360, height: 240 })
/** An owner's transparent picture is used when its longest side reaches this share of the figure box's longest side. */
const OWN_MIN_SHARE = 0.6
const BACKDROP_WORDS = /(^|[^a-z])(bg|background|backdrop|parallax)([^a-z]|$)/i

export const CUT_OUT_STEPS = Object.freeze({
  own: 1,
  off: 2,
  framed: 3
})

/** Every reason code a cut-out decision carries, with the sentence a report shows for it. */
export const CUT_OUT_REASONS = Object.freeze({
  'cut-out-own':
    "the owner's own transparent picture of this subject stands where the template's figure stood",
  'cut-out-off': "the template's figure is taken off, so the section's own ground carries it",
  'cut-out-framed':
    "the template's figure stood in its own column beside the text, so an owner photo is shown there in a frame"
})

const box = (slot, viewport) => {
  const b = slot?.fit?.boxes?.[viewport]
  return b && Number(b.width) > 0 && Number(b.height) > 0
    ? { width: Number(b.width), height: Number(b.height) }
    : null
}

/**
 * Where a cut-out stands and what taking it off would leave, from its measured boxes and the slots of its own entity.
 * @param {any} slot - the cut-out slot
 * @param {any[]} slots - the content map's slots
 * @returns {{measured: boolean, share: number | null, large: boolean, backdrop: boolean, text: boolean,
 *   phone: boolean, emptyWhenOff: boolean}}
 */
export function cutOutZoneOf(slot, slots) {
  const desktop = box(slot, 'desktop')
  const mates = (slots ?? []).filter((s) => s !== slot && s.key !== slot?.key && s.entity === slot?.entity)
  const backdrop = mates.some(
    (s) =>
      s.type === 'image' &&
      s.fit?.kind !== 'cutout' &&
      s.fit?.kind !== 'icon' &&
      s.fit?.kind !== 'decoration' &&
      ((box(s, 'desktop')?.width ?? 0) >= BACKDROP_SHARE * DESKTOP_VIEWPORT ||
        BACKDROP_WORDS.test(`${s.label ?? ''} ${(s.jsonPath ?? []).join(' ')}`))
  )
  const text = mates.some((s) => s.type === 'text')
  const share = desktop ? desktop.width / DESKTOP_VIEWPORT : null
  const large = Boolean(desktop && desktop.width >= LARGE.width && desktop.height >= LARGE.height)
  return {
    measured: Boolean(desktop),
    share: share === null ? null : Number(share.toFixed(3)),
    large,
    backdrop,
    text,
    phone: Boolean(box(slot, 'phone')),
    emptyWhenOff: large && share !== null && share <= BESIDE_TEXT_SHARE && !backdrop && text
  }
}

/**
 * The owner's clean transparent picture for a cut-out of `subject`, or null. A picture is transparent when the engine
 * measured it so (`hasAlpha`, clear corners); a logo, a picture with words on it or one too small for the box never is.
 * @param {any[]} assets - the brief's pictures
 * @param {{kind: string, id?: string}} subject
 * @param {any} slot
 */
export function ownCutOutOf(assets, subject, slot) {
  const desktop = box(slot, 'desktop') ?? slot?.fit?.source ?? null
  const need = desktop ? OWN_MIN_SHARE * Math.max(desktop.width, desktop.height) : 0
  const depicts = (a) => (typeof a?.depicts === 'string' ? a.depicts : a?.depicts?.id)
  const fits = (a) =>
    a?.kind === 'image' &&
    a.hasAlpha === true &&
    a.isLogo !== true &&
    a.hasTextOverlay !== true &&
    Math.max(Number(a.width) || 0, Number(a.height) || 0) >= need
  const ofSubject = (a) => (subject?.kind === 'offering' && subject.id && depicts(a) === subject.id ? 0 : 1)
  return (
    (assets ?? [])
      .filter(fits)
      .filter((a) => ofSubject(a) === 0 || depicts(a) === 'general' || !depicts(a))
      .sort(
        (a, b) =>
          ofSubject(a) - ofSubject(b) ||
          (Number(b.width) || 0) * (Number(b.height) || 0) -
            (Number(a.width) || 0) * (Number(a.height) || 0) ||
          String(a.id).localeCompare(String(b.id))
      )[0] ?? null
  )
}

/**
 * The ladder for one cut-out slot.
 * @param {object} input
 * @param {any} input.slot
 * @param {any[]} input.slots - the content map's slots
 * @param {any[]} [input.assets] - the brief's pictures
 * @param {{kind: string, id?: string, label?: string}} input.subject - what the slot's section is about
 * @param {{mediaId?: string, crop?: any} | null} [input.photo] - the photo the fill plan chose for this slot, if any
 * @returns {{mode: 'own' | 'off' | 'framed', step: number, reason: string, zone: ReturnType<typeof cutOutZoneOf>,
 *   mediaId?: string, crop?: any}}
 */
export function cutOutStepOf({ slot, slots, assets = [], subject, photo = null }) {
  const zone = cutOutZoneOf(slot, slots)
  const own = ownCutOutOf(assets, subject, slot)
  if (own) return { mode: 'own', step: CUT_OUT_STEPS.own, reason: 'cut-out-own', zone, mediaId: own.id }
  if (zone.emptyWhenOff && photo?.mediaId)
    return {
      mode: 'framed',
      step: CUT_OUT_STEPS.framed,
      reason: 'cut-out-framed',
      zone,
      mediaId: photo.mediaId,
      ...(photo.crop ? { crop: photo.crop } : {})
    }
  return { mode: 'off', step: CUT_OUT_STEPS.off, reason: 'cut-out-off', zone }
}
