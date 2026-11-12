// A frozen, opt-in WO policy. Evidence comes from answered turns carrying server-resolved kit images,
// not a model claiming to have looked or merely requesting the image tool.
import { reviewedImages } from '../lib/kit-image-review.js'
export { reviewedImages } from '../lib/kit-image-review.js'

export const VISUAL_REVIEW_POLICY = 'kit-images/1'
export const VISUAL_REVIEW_RULE = 'V01'
const list = (value) => (Array.isArray(value) ? value : [])
const LIMIT = 32
const title = 'The planner reviews representative pages and kept responsive content through actual kit images'

export function representativeImages(kit) {
  const pages = new Map(list(kit?.pages).map((page) => [page.id, page]))
  return [
    ...new Set(
      list(kit?.pageGroups)
        .map((group) => pages.get(group.representative ?? group.root)?.images?.['1440'])
        .filter(Boolean)
    )
  ]
}

// The images V01 may require, by what requires them, so the first message can name each exact id before the plan
// exists: per page group its representative's desktop image and the phone images of its pages (in every kit so far
// one, the representative's: a kept page's 390 image is its group's), and per block its desktop image (blocks often
// share one, so a block's image id cannot be guessed from the block id). Whatever the plan keeps, V01's required set
// is a subset of these ids.
export function visualReviewImages(kit) {
  const pages = new Map(list(kit?.pages).map((page) => [page.id, page]))
  const groups = []
  for (const group of list(kit?.pageGroups)) {
    const desktop = pages.get(group.representative ?? group.root)?.images?.['1440']
    const phone = [
      ...new Set(
        list(kit?.pages)
          .filter((page) => page.group === group.id)
          .map((page) => page.images?.['390'])
          .filter(Boolean)
      )
    ]
    const ids = [...new Set([desktop, ...phone].filter(Boolean))]
    if (ids.length) groups.push({ group: group.id, ids })
  }
  const blocks = {}
  for (const block of list(kit?.blocks)) {
    const image = block?.images?.['1440']
    if (typeof block?.id === 'string' && image) blocks[block.id] = image
  }
  return { groups, blocks }
}

// The policy's part of the planner's first message. Asking for the images of "every block your plan prints" failed
// in practice: the plan only exists in the final answer, so a planner wrote it without opening them and paid a fix
// round (Central Padel 12/11/2026: 29 of 41 required images missing after round 0, all of them blocks the planner had
// read and phone images of kept pages). So the message names each exact id and ties every open to a step the planner
// takes anyway: each page group's desktop and phone images together first, and each block's image in the same call
// that reads the block. V01 itself is unchanged: only an image the planner opened, delivered to an answered turn,
// counts.
export function visualReviewInstruction(kit) {
  const { groups, blocks } = visualReviewImages(kit)
  return [
    'This run requires visual review before the plan can pass. Text looks do not satisfy this requirement, and the check counts only images you opened with open_kit_image.',
    `First open these representative page images, the desktop (1440) and phone (390) images of each page group together, batching the tool calls: ${groups.flatMap((g) => g.ids).join(', ')}. They hold the phone image of every page, so they cover every page you keep.`,
    `Then open each block's 1440 image in the same call that reads the block with read_kit_part: every block your plan prints (every decision except hide) needs its image opened, a block you hide needs none. Blocks often share an image, so take each id from this list, by block id: ${JSON.stringify(blocks)}.`,
    'Before you write the plan, open in one batch the image of any printed block not opened yet. Reuse images already delivered in this conversation.',
    'Read needed kit parts in batches alongside these images. Every image is opened individually; never invent image ids or claim a review without opening it.'
  ].join('\n')
}

export function checkVisualReview({ plan, kit, kitRef, history }) {
  const seen = reviewedImages({ kit, kitRef, history })
  const representatives = representativeImages(kit)
  const required = new Set(representatives)
  const declarations = []
  const pages = new Map(list(kit?.pages).map((page) => [page.id, page]))
  const blocks = new Map(list(kit?.blocks).map((block) => [block.id, block]))
  for (const group of list(kit?.pageGroups)) {
    if (!pages.get(group.representative ?? group.root)?.images?.['1440'])
      declarations.push(`page group ${group.id} has no representative 1440 image`)
  }
  const kept = list(plan?.pages).filter((page) => page.decision === 'keep')
  for (const page of kept) {
    const image = pages.get(page.id)?.images?.['390']
    if (image) required.add(image)
    else declarations.push(`kept page ${page.id} has no 390 image`)
  }
  for (const block of [...list(plan?.sharedBlocks), ...kept.flatMap((page) => list(page.blocks))]) {
    if (block.decision === 'hide') continue
    const image = blocks.get(block.block)?.images?.['1440']
    if (image) required.add(image)
    else declarations.push(`kept block ${block.block} has no 1440 image`)
  }
  const missing = [...required].filter((id) => !seen.has(id))
  const first = representatives.filter((id) => !seen.has(id))
  const pending = first.length ? first : missing
  // An incomplete catalogue cannot silently turn a mandatory review into a pass.
  const catalogue = new Map(list(kit?.images).map((image) => [image.id, image.sha256]))
  for (const id of required)
    if (!/^[a-f0-9]{64}$/.test(catalogue.get(id) ?? ''))
      declarations.push(`required image ${id} has no hashed catalogue entry`)
  const empty = representatives.length === 0 || declarations.length > 0
  const failures = empty
    ? [
        {
          where: 'kit page groups',
          detail: `Visual review cannot be verified: ${declarations.slice(0, LIMIT).join('; ') || 'no representative page images are declared'}.`,
          cause: 'kit'
        }
      ]
    : pending.slice(0, LIMIT).map((id) => ({
        where: `kit image ${id}`,
        detail: `Open ${id} with open_kit_image and let the next model turn read it before submitting edits.`,
        cause: 'planner'
      }))
  return {
    id: VISUAL_REVIEW_RULE,
    title,
    status: failures.length ? 'fail' : 'pass',
    cause: failures.length ? (empty ? 'kit' : 'planner') : null,
    causes: failures.length ? { [empty ? 'kit' : 'planner']: failures.length } : {},
    failures,
    notes: [
      `${seen.size} images delivered; ${required.size} required; ${missing.length} missing. At most ${LIMIT} missing ids are sent back at once.`
    ],
    coverage: { policy: VISUAL_REVIEW_POLICY, reviewed: [...seen], required: [...required], missing }
  }
}

export function withVisualReview(result, input) {
  const rule = checkVisualReview(input)
  return {
    ...result,
    rules: [...result.rules, rule],
    summary: { ...result.summary, [rule.status]: result.summary[rule.status] + 1 }
  }
}
