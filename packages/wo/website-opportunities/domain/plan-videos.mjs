// The owner's videos a plan has no place for (#575 build chat, a real plan: the needs profile knew 10 videos, and the
// plan neither placed them nor said so). The plan knows the videos only as a count (`plan-data.mjs` `videos`): they
// join the pictures at build time (`step-chain-draft-steps.js`), where each video frame of the plan (a
// `business.video` link field, `picture-frames.mjs`) takes one that fits. So the plan counts a video frame as taking
// one of them, and says the others once, with their count: code `no_place_in_design` (the sentence placement gives a
// fact the design shows nowhere), `params.count` the videos left out and `params.known` the videos the plan knows, so
// known = placed + left out. The step chain handed every video to the build as a link and said nothing of the ones
// with no place (`opportunities-build/handoff.js`); this line is new. Pure.
import { FACT_LEFT_OUT } from './plan-placement-facts.mjs'

const NO_PLACE = FACT_LEFT_OUT.no_place_in_design

/**
 * The video frames the owner's videos are counted to fill, and the left out entry of the videos with no frame.
 * @param {object[]} frames the assigned frames (`assignPictures`)
 * @param {{videos?: {count: number}}} data the plan data
 * @returns {{filled: Set<string>, leftOut: object | null}} `filled`: the ids of the video frames a video is counted
 *   in (no longer an empty spot); `leftOut`: the entry, or null when every video has a frame or there is none
 */
export function videosOfPlan(frames, data) {
  const known = Number.isInteger(data?.videos?.count) ? data.videos.count : 0
  const open = (Array.isArray(frames) ? frames : []).filter(
    (f) => f.place === 'video' && !f.sameAs && f.source === 'none'
  )
  const filled = new Set(open.slice(0, known).map((f) => f.id))
  const count = known - filled.size
  if (count <= 0) return { filled, leftOut: null }
  return {
    filled,
    leftOut: {
      what: `${count} ${count === 1 ? 'video' : 'videos'}`,
      kind: 'feature',
      reason: NO_PLACE.reason,
      code: NO_PLACE.code,
      params: { count, known }
    }
  }
}
