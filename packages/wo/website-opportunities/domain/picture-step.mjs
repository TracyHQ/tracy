// The pictures step of an AI quickstart build (ticket #595, spec #577): label the own pictures, then assign a picture to
// every frame of the approved plan. Labelling comes first, always: no picture is placed without a label. A labelling
// failure throws `PicturePolicyError` (`picture_labelling_failed`) for the step chain's stop and report rule (ADR 0047,
// #591): the step is re-run once from the same inputs, then the build stops and the report names the `pictures` step.
// Generating the pictures themselves is the drawer's work; this step only says which frames get one, and how.
import { ownPicturesOf } from './picture-frames.mjs'
import { labelOwnPictures } from './picture-labelling.mjs'
import { assignPictures } from './picture-policy.mjs'
import { planDataOf } from './plan-data.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** Block id -> description, the template's blocks first, then the Tracy library's (as the plan composer reads them). */
export function blocksOf(blockStore, library = []) {
  const blocks = new Map()
  for (const block of list(blockStore?.blocks)) blocks.set(block.id, block)
  for (const block of list(library))
    if (!blocks.has(block.id)) blocks.set(block.id, { ...block, source: 'library' })
  return blocks
}

/**
 * Run the pictures step over an approved plan.
 * @param {{plan: object, profile: object, blockStore: object, library?: object[], vision: Function,
 *   pictures?: object[]}} input `pictures` adds own picture records the profile does not hold (a video of the
 *   business's own channel); `vision` is the standard build model's vision call
 * @returns {Promise<{frames: object[], reduced: object[], counts: object, labelled: string[],
 *   prompt: {file: string, sha256: string} | null}>}
 */
export async function picturesStep({ plan, profile, blockStore, library = [], vision, pictures = [] }) {
  const data = planDataOf(profile)
  const records = [...ownPicturesOf(data), ...list(pictures)]
  const labelling = await labelOwnPictures({ pictures: records, vision })
  const assignment = assignPictures({
    pages: plan?.pages,
    blocks: blocksOf(blockStore, library),
    data,
    pictures: labelling.pictures,
    approved: plan?.pictures
  })
  return { ...assignment, labelled: labelling.labelled, prompt: labelling.prompt }
}
