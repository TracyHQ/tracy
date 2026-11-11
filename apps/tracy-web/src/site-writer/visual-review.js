// WO writer input policy: responsive kit block images must reach answered model turns of this run.
import { reviewedImages } from '../lib/kit-image-review.js'

export const WRITER_VISUAL_POLICY = 'writer-kit-images/1'
const list = (value) => (Array.isArray(value) ? value : [])

export function writerVisualRequirements(plan, kit) {
  const blocks = new Map(list(kit?.blocks).map((block) => [block.id, block]))
  const kept = list(plan?.pages).filter((page) => page.decision === 'keep')
  const printed = [...list(plan?.sharedBlocks), ...kept.flatMap((page) => list(page.blocks))]
  const required = new Set()
  const declarations = []
  for (const block of printed) {
    if (block.decision === 'hide') continue
    for (const width of ['1440', '390']) {
      const id = blocks.get(block.block)?.images?.[width]
      if (id) required.add(id)
      else declarations.push(`printed block ${block.block} has no ${width} image`)
    }
  }
  const catalogue = new Map(list(kit?.images).map((image) => [image.id, image.sha256]))
  for (const id of required)
    if (!/^[a-f0-9]{64}$/.test(catalogue.get(id) ?? ''))
      declarations.push(`image ${id} has no hashed catalogue entry`)
  return { required: [...required], declarations }
}

export function writerVisualInstruction(plan, kit) {
  const { required } = writerVisualRequirements(plan, kit)
  return [
    'Before writing, read the actual 1440 and 390 kit images of the printed blocks. Text looks do not satisfy this requirement.',
    `Open these images with open_kit_image, batching tool calls: ${required.join(', ')}.`,
    'Use these images to understand the existing layout. Keep the frozen plan, facts, one writer and copy notebook. Do not write to the site.'
  ].join('\n')
}

export function withWriterVisualReview(result, { plan, kit, kitRef, history, runId }) {
  const { required, declarations } = writerVisualRequirements(plan, kit)
  const local = list(history).filter((turn) => turn.run_id === undefined || turn.run_id === runId)
  const seen = reviewedImages({ kit, kitRef, history: local })
  const missing = required.filter((id) => !seen.has(id))
  const failures = declarations.length
    ? [{ where: 'writer kit images', detail: declarations.join('; '), cause: 'kit' }]
    : missing.slice(0, 32).map((id) => ({
        where: `kit image ${id}`,
        detail: `Open ${id} with open_kit_image and let an answered writing turn read it before returning copy corrections.`,
        cause: 'writer'
      }))
  const status = failures.length ? 'fail' : 'pass'
  return {
    ...result,
    summary: { ...result.summary, [status]: result.summary[status] + 1 },
    rules: [
      ...result.rules,
      {
        id: 'WV01',
        title: 'The writer reads the printed blocks at desktop and mobile widths',
        status,
        cause: failures.length ? (declarations.length ? 'kit' : 'writer') : null,
        causes: failures.length ? { [declarations.length ? 'kit' : 'writer']: failures.length } : {},
        failures,
        notes: [],
        coverage: { policy: WRITER_VISUAL_POLICY, required, reviewed: [...seen], missing }
      }
    ]
  }
}
