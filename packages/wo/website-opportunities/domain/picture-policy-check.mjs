// The rules every picture assignment keeps (ticket #595, spec #577), checked on the assignment itself so a later change
// to the policy cannot break one silently. Pure: an assignment and the pictures it drew on in, the problems out.
import { MAX_GENERATED_FRAMES } from './build-contract-plan.mjs'
import { generationOf } from './picture-roles.mjs'

/** Where a frame's picture comes from: an own picture, a generated one, or none (with the reason). */
export const FRAME_SOURCES = Object.freeze(['own', 'generated', 'none'])
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

/**
 * The problems of an assignment, empty when it keeps every rule: every frame records its source; an own picture is
 * labelled, never stock, a photo in an image frame and a fitting video in a video frame; nothing is generated for a
 * frame of a person, a logo or any kind `picture-roles.mjs` never generates, nor for a video frame; every generated
 * picture is asked without people; the business logo is never filled here (the brand step owns it); at most
 * `MAX_GENERATED_FRAMES` are generated, and never more than the approved count.
 * @param {{frames: object[]}} assignment the result of `assignPictures`
 * @param {object[]} pictures the picture records the assignment drew on
 * @param {{generated?: number}} [approved] the generated count the customer approved (`approvedCountOf`)
 */
export function pictureProblemsOf(assignment, pictures, approved = {}) {
  const byId = new Map((pictures ?? []).map((p) => [p.id, p]))
  const problems = []
  const report = (frame, code, message) => problems.push({ code, at: frame.id, message })
  let generated = 0
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
      // The variant of a pair shows its base's picture: one picture, counted once.
      if (!frame.sameAs) generated += 1
      if (frame.people) report(frame, 'generated_person', 'a picture of a person is never generated')
      if (frame.place === 'video') report(frame, 'generated_video', 'a video is never generated')
      else if (!frame.people && frame.kind && !generationOf(frame.kind).may)
        report(frame, 'generated_never', `a picture of kind ${frame.kind} is never generated`)
      if (frame.generate?.people !== false || frame.generate?.stock !== false)
        report(frame, 'generated_unbounded', 'a generated picture is asked without people and without stock')
    }
    if (frame.source === 'none' && !isText(frame.reason))
      report(frame, 'reason_missing', 'a frame without a picture says why')
  }
  if (generated > MAX_GENERATED_FRAMES)
    problems.push({
      code: 'generated_over_cap',
      at: 'frames',
      message: `at most ${MAX_GENERATED_FRAMES} generated frames, not ${generated}`
    })
  const allowed = approved?.generated
  if (allowed !== undefined && !(Number.isInteger(allowed) && generated <= allowed))
    problems.push({
      code: 'generated_over_approved',
      at: 'frames',
      message: `the plan approved ${allowed} generated frames, the assignment has ${generated}`
    })
  return problems
}
