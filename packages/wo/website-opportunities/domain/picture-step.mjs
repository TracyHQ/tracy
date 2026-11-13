// The pictures step of an AI quickstart build (ticket #595, spec #577): label the own pictures, then assign a picture to
// every frame of the approved plan. Labelling comes first, always: no picture is placed without a label. A labelling
// failure throws `PicturePolicyError` (`picture_labelling_failed`) for the step chain's stop and report rule (ADR 0047,
// #591): the step is re-run once from the same inputs, then the build stops and the report names the `pictures` step.
// Generating the pictures themselves is the drawer's work; this step only says which frames get one, and how.
import { ownPicturesOf } from './picture-frames.mjs'
import { iconProblemsOf } from './icon-check.mjs'
import { IconSelectionError } from './icon-ranking.mjs'
import { selectIcons } from './icon-selection.mjs'
import { unfitReason } from './picture-fit.mjs'
import { labelOwnPictures, PicturePolicyError } from './picture-labelling.mjs'
import { approvedCountOf, assignPictures } from './picture-policy.mjs'
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

/** The frames left without a picture that the customer is told about: every empty frame but the brand step's logo. */
const leftOutOf = (frames) =>
  frames
    .filter((f) => f.source === 'none' && f.reason !== 'logo_from_brand_step')
    .map((f) => ({ frame: f.id, reason: f.reason }))

/**
 * How the build differs from what the customer approved: the approved own and generated counts against the placed ones,
 * with every own picture left unplaced and every empty frame, each with its reason. Null when they agree.
 */
export function differenceOf(assignment, approved, pictures) {
  const own = approved?.own?.frames
  const want = { own: Number.isInteger(own) ? own : null, generated: approvedCountOf(approved).count }
  const placed = { own: assignment.counts.own, generated: assignment.counts.generated }
  if (want.own === placed.own && want.generated === placed.generated) return null
  const used = new Set(assignment.frames.filter((f) => f.source === 'own').map((f) => f.picture))
  const dropped = new Set(assignment.reduced.map((r) => r.item))
  const unplaced = list(pictures)
    .filter((p) => !used.has(p.id))
    .map((p) => {
      const frame = assignment.frames.find((f) => f.item && f.item === p.item && f.place !== 'video')
      const reason = p.stock
        ? 'stock'
        : dropped.has(p.item)
          ? 'item_dropped'
          : frame
            ? (unfitReason(p, frame) ?? 'frame_taken')
            : 'no_fitting_frame'
      return { picture: p.id, reason }
    })
  return { approved: want, placed, unplaced, empty: leftOutOf(assignment.frames) }
}

/**
 * Run the pictures step over an approved plan: label the own pictures, assign the picture frames, then select the icon
 * of every icon typed field from the written copy (`icon-selection.mjs`).
 * @param {{plan: object, profile: object, blockStore: object, library?: object[], vision: Function,
 *   pictures?: object[], copy?: {pages: object[]}, iconLibrary?: {set: string, icons: object[]}, model?: Function,
 *   looks?: object}} input `pictures` adds own picture records the profile does not hold (a video of the business's
 *   own channel); `vision` is the standard build model's vision call and `model` its text call (the icon ranking;
 *   `vision` when not given); `copy` is the page writer's output, needed when the plan places an icon field
 * @returns {Promise<{frames: object[], reduced: object[], counts: object, notes: object[], leftOut: object[],
 *   difference: object | null, labelled: string[], prompt: {file: string, sha256: string} | null,
 *   icons: object[], iconCounts: object, iconPrompt: object | null}>} `difference` is set whenever the placed own or
 *   generated count is not the approved one (`differenceOf`)
 */
export async function picturesStep({
  plan,
  profile,
  blockStore,
  library = [],
  vision,
  pictures = [],
  copy,
  iconLibrary,
  model,
  looks
}) {
  if (!Array.isArray(plan?.pages) || plan.pages.length === 0)
    throw new PicturePolicyError('plan_missing', 'the pictures step needs an approved plan with pages')
  const data = planDataOf(profile)
  const records = [...ownPicturesOf(data), ...list(pictures)]
  const labelling = await labelOwnPictures({ pictures: records, vision })
  // A plan with no pictures summary approved nothing: the count is read as zero and reported (`approvedCountOf`).
  const approved = plan.pictures ?? {}
  const blocks = blocksOf(blockStore, library)
  const assignment = assignPictures({
    pages: plan.pages,
    blocks,
    data,
    pictures: labelling.pictures,
    approved
  })
  const icons = await selectIcons({ plan, data, blocks, copy, iconLibrary, model: model ?? vision, looks })
  const crossed = iconProblemsOf(icons, { pictureFrames: assignment.frames })
  if (crossed.length)
    throw new IconSelectionError('icon_policy_broken', 'an icon field was given a picture', {
      problems: crossed
    })
  return {
    ...assignment,
    icons: icons.icons,
    iconCounts: icons.counts,
    iconPrompt: icons.prompt,
    leftOut: leftOutOf(assignment.frames),
    difference: differenceOf(assignment, approved, labelling.pictures),
    labelled: labelling.labelled,
    prompt: labelling.prompt
  }
}
