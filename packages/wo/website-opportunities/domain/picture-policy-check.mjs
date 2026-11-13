// The rules every picture assignment keeps (ticket #595, spec #577), checked on the assignment itself so a later change
// to the policy cannot break one silently. Pure: an assignment and the pictures it drew on in, the problems out.
import { GALLERY_ONLY_OWN, generationOf } from './picture-roles.mjs'

/**
 * Where a frame's picture comes from: an own picture, a generated one, the initials of the named person it shows, or
 * none (with the reason).
 */
export const FRAME_SOURCES = Object.freeze(['own', 'generated', 'initials', 'none'])
const SOURCES = new Set(FRAME_SOURCES)
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** Whether an own video may fill a video frame: landscape or near square, with no text printed over it. */
export function videoFits(picture) {
  return (
    picture?.media === 'video' &&
    isText(picture.label) &&
    picture.burnedInText === false &&
    (picture.orientation === 'landscape' || picture.orientation === 'square')
  )
}

const isGallery = (frame) =>
  frame.never === GALLERY_ONLY_OWN || frame.itemKind === 'gallery' || frame.blockType === 'gallery'

/** The problem of an initials frame: it shows a named person item, with the initials avatar of that person. */
function initialsProblemOf(frame) {
  if (!frame.people || !frame.person)
    return ['initials_not_a_person', 'initials are shown only in the frame of a named person']
  const s = frame.substitute
  if (s?.kind !== 'initials-avatar' || !isText(s.initials) || s.personId !== frame.person)
    return ['initials_missing', 'an initials frame carries the initials avatar of its person']
  return null
}

/**
 * The problems of an assignment, empty when it keeps every rule: every frame records its source; the frame of a named
 * person is never empty, and an initials frame carries that person's initials avatar; a reused drawing names a drawn
 * frame; nothing is generated for a gallery; an own picture is
 * labelled, never stock, a photo in an image frame and a fitting video in a video frame; nothing is generated for a
 * frame of a person, a logo or any kind `picture-roles.mjs` never generates, nor for a video frame; every generated
 * picture is asked without people; the business logo is never filled here (the brand step owns it). There is no cap
 * on generated pictures (D45): the plan's generated count is an estimate, never checked here.
 * @param {{frames: object[]}} assignment the result of `assignPictures`
 * @param {object[]} pictures the picture records the assignment drew on
 */
export function pictureProblemsOf(assignment, pictures) {
  const byId = new Map((pictures ?? []).map((p) => [p.id, p]))
  const problems = []
  const report = (frame, code, message) => problems.push({ code, at: frame.id, message })
  const drawn = new Set(
    (assignment?.frames ?? []).filter((f) => f.source === 'generated' && !f.reuses).map((f) => f.id)
  )
  for (const frame of assignment?.frames ?? []) {
    if (!SOURCES.has(frame.source)) {
      report(frame, 'source_missing', 'the frame records no source')
      continue
    }
    if (frame.source === 'own') {
      const picture = byId.get(frame.picture)
      if (frame.kind === 'business.logo')
        report(frame, 'logo_not_brand_step', 'the business logo is placed by the brand step only')
      else if (!picture) report(frame, 'picture_unknown', `no own picture ${frame.picture}`)
      else if (picture.stock) report(frame, 'stock_used', 'a stock picture is never used')
      else if (!isText(picture.label) || !isText(frame.label))
        report(frame, 'picture_unlabelled', 'a picture is placed only with a label')
      else if (frame.place === 'video' && !videoFits(picture))
        report(frame, 'video_unfit', 'a video must be landscape or near square with no text printed over it')
      else if (frame.place !== 'video' && picture.media !== 'photo')
        report(frame, 'video_in_image_frame', 'an image frame never takes a video')
    }
    if (frame.source === 'generated') {
      if (frame.reuses && !drawn.has(frame.reuses))
        report(frame, 'reuse_unknown', `${frame.reuses} is no drawn frame of the assignment`)
      if (frame.people) report(frame, 'generated_person', 'a picture of a person is never generated')
      if (frame.place === 'video') report(frame, 'generated_video', 'a video is never generated')
      else if (!frame.people && frame.kind && !generationOf(frame.kind).may)
        report(frame, 'generated_never', `a picture of kind ${frame.kind} is never generated`)
      if (isGallery(frame))
        report(frame, 'generated_gallery', 'a gallery shows only own photos, never a drawn one')
      if (frame.generate?.people !== false || frame.generate?.stock !== false)
        report(frame, 'generated_unbounded', 'a generated picture is asked without people and without stock')
    }
    if (frame.source === 'initials') {
      const problem = initialsProblemOf(frame)
      if (problem) report(frame, ...problem)
    }
    if (frame.source === 'none' && frame.person)
      report(frame, 'person_frame_empty', 'the frame of a named person shows their photo or their initials')
    if (frame.source === 'none' && !isText(frame.reason))
      report(frame, 'reason_missing', 'a frame without a picture says why')
  }
  return problems
}
