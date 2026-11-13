// The pictures step of an AI quickstart build (ticket #595, spec #577): label the own pictures, then assign a picture to
// every frame of the approved plan (`placeBuildPictures`); the icons follow the written copy (`selectBuildIcons`, #597).
// Labelling comes first, always: no picture is placed without a label. A labelling failure throws `PicturePolicyError`
// (`picture_labelling_failed`) for the step chain's stop and report rule (ADR 0047, #591): the step is re-run once
// from the same inputs, then the build stops and the report names the `pictures` step.
// Generating the pictures themselves is the drawer's work; this step only says which frames get one, and how.
import { framesOfPlan, ownPicturesOf } from './picture-frames.mjs'
import { iconProblemsOf } from './icon-check.mjs'
import { IconSelectionError } from './icon-ranking.mjs'
import { selectIcons } from './icon-selection.mjs'
import { unfitReason } from './picture-fit.mjs'
import { labelOwnPictures, PicturePolicyError } from './picture-labelling.mjs'
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

/** The frames left without a picture that the customer is told about: every empty frame but the brand step's logo. */
const leftOutOf = (frames) =>
  frames
    .filter((f) => f.source === 'none' && !f.sameAs && f.reason !== 'logo_from_brand_step')
    .map((f) => ({ frame: f.id, reason: f.reason }))

/**
 * How the build differs from the plan's estimate: the estimated own and generated counts against the placed ones, with
 * every own picture left unplaced and every empty frame, each with its reason. Null when they agree. The counts are a
 * report only: every drawable frame without a fitting own photo is drawn whatever the estimate said (D45).
 */
export function differenceOf(assignment, approved, pictures) {
  const whole = (n) => (Number.isInteger(n) && n >= 0 ? n : null)
  const want = { own: whole(approved?.own?.frames), generated: whole(approved?.generated?.frames) }
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

/** An approved plan has pages; `Failure` is the error class of the calling step. */
const planPages = (plan, Failure) => {
  if (!Array.isArray(plan?.pages) || plan.pages.length === 0)
    throw new Failure('plan_missing', 'the pictures step needs an approved plan with pages')
}

/**
 * Place the pictures of an approved plan: label the own pictures, then assign a picture to every frame. Needs no copy,
 * so the step chain runs it beside the page writers (#597).
 * @param {{plan: object, profile: object, blockStore: object, library?: object[], vision: Function,
 *   pictures?: object[]}} input `pictures` adds own picture records the profile does not hold (a video of the
 *   business's own channel); `vision` is the standard build model's vision call (the labelling); `refuse(picture)`
 *   true keeps a picture off the site, asked before the labelling and again with the label it got (`refused`: their ids)
 * @returns {Promise<{frames: object[], reduced: object[], droppedFrames: object[], counts: object, notes: object[],
 *   leftOut: object[], difference: object | null, labelled: string[], refused?: string[],
 *   prompt: {file: string, sha256: string} | null}>}
 *   `difference` is set whenever the placed own or generated count is not the plan's estimate (`differenceOf`)
 */
export async function placeBuildPictures({
  plan,
  profile,
  blockStore,
  library = [],
  vision,
  pictures = [],
  refuse
}) {
  planPages(plan, PicturePolicyError)
  const data = planDataOf(profile)
  // A refused picture is never shown to the vision call nor placed: its frame has no own photo (the policy decides).
  const allowed = (p) => typeof refuse !== 'function' || !refuse(p)
  const records = [...ownPicturesOf(data), ...list(pictures)].filter(allowed)
  const labelled = await labelOwnPictures({ pictures: records, vision })
  const refused = labelled.pictures.filter((p) => !allowed(p)).map((p) => p.id)
  const labelling = { ...labelled, pictures: labelled.pictures.filter(allowed) }
  // The plan's pictures summary is an estimate: it is compared with what is placed (`difference`), never a cap.
  const approved = plan.pictures ?? {}
  const assignment = assignPictures({
    pages: plan.pages,
    blocks: blocksOf(blockStore, library),
    data,
    pictures: labelling.pictures
  })
  return {
    ...assignment,
    leftOut: leftOutOf(assignment.frames),
    difference: differenceOf(assignment, approved, labelling.pictures),
    labelled: labelling.labelled,
    // Only a step that asks to refuse pictures is told which were.
    ...(typeof refuse === 'function' ? { refused } : {}),
    prompt: labelling.prompt
  }
}

/** Why `given` are not the placed frames of the plan whose frames are `planned`, or null when they are. */
function framesMismatchOf(given, planned) {
  const ids = new Set(planned.map((f) => f.id))
  const foreign = given.filter((f) => !ids.has(f?.id)).map((f) => f?.id)
  if (foreign.length)
    return `${foreign.slice(0, 3).join(', ')} ${foreign.length > 1 ? 'are' : 'is'} not a frame of it`
  if (planned.length > 0 && given.length === 0)
    return `the plan has ${planned.length} frame(s) and none was given`
  return null
}

/**
 * Select the icon of every icon typed field from the written copy (`icon-selection.mjs`), AFTER the page writers, then
 * cross-check it against the placed picture frames: an icon field given a picture is `icon_policy_broken`.
 * @param {{plan: object, profile: object, blockStore: object, library?: object[], copy?: {pages: object[]},
 *   iconLibrary?: {set: string, icons: object[]}, model?: Function, looks?: object, pictureFrames: object[]}} input
 *   `model` is the standard build model's text call (the icon keywords and ranking; required when the plan places a
 *   content icon field, `icon_ranker_missing` otherwise, never the vision call); `copy` is the page writers' output,
 *   needed when the plan places an icon field; `pictureFrames` the `frames` of `placeBuildPictures` for the same plan
 * @returns {Promise<{icons: object[], iconCounts: object, notes: object[], iconPrompt: object | null,
 *   iconKeywordsPrompt: object | null}>} `notes`: the icon selection's (`icon_theme_undeclared`, `icons_all_hidden`)
 */
export async function selectBuildIcons({
  plan,
  profile,
  blockStore,
  library = [],
  copy,
  iconLibrary,
  model,
  looks,
  pictureFrames
}) {
  planPages(plan, IconSelectionError)
  if (!Array.isArray(pictureFrames))
    throw new IconSelectionError(
      'picture_frames_missing',
      'the icons are checked against the placed picture frames: give the frames of placeBuildPictures'
    )
  const data = planDataOf(profile)
  const blocks = blocksOf(blockStore, library)
  const strange = framesMismatchOf(pictureFrames, framesOfPlan(plan.pages, blocks, data))
  if (strange)
    throw new IconSelectionError(
      'picture_frames_mismatch',
      `the picture frames are not the placed frames of this plan: ${strange}`
    )
  // The icon keywords and ranking are TEXT calls: they take `model` only, never the vision door.
  const icons = await selectIcons({ plan, data, blocks, copy, iconLibrary, model, looks })
  const crossed = iconProblemsOf(icons, { pictureFrames })
  if (crossed.length)
    throw new IconSelectionError('icon_policy_broken', 'an icon field was given a picture', {
      problems: crossed
    })
  return {
    icons: icons.icons,
    iconCounts: icons.counts,
    notes: icons.notes,
    iconPrompt: icons.prompt,
    iconKeywordsPrompt: icons.keywordsPrompt
  }
}

/**
 * The whole pictures step in one call, as before the step chain split it (#597): `placeBuildPictures`, then
 * `selectBuildIcons` over its frames. Same inputs and same output as the two run in turn; `notes` holds the
 * assignment's notes, then the icon selection's.
 * @returns {Promise<object>} the fields of both results
 */
export async function picturesStep(input) {
  const placed = await placeBuildPictures(input)
  const icons = await selectBuildIcons({ ...input, pictureFrames: placed.frames })
  return { ...placed, ...icons, notes: [...placed.notes, ...icons.notes] }
}
