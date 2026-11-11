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

export function visualReviewInstruction(kit) {
  return [
    'This run requires visual review before the plan can pass. Text looks do not satisfy this requirement.',
    `First open these representative page images with open_kit_image, batching the tool calls: ${representativeImages(kit).join(', ')}.`,
    'Then open the 1440 images of every block your plan prints (every decision except hide) and the 390 images of its kept pages. Reuse images already delivered in this conversation.',
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
