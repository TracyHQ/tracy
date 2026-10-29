/**
 * The site plan's repeated showcase blocks written on a Joomla site (spec TracyHQ/tracy#189, COO decision 30/10/2026,
 * `website-opportunities/domain/repeated-blocks.mjs`): a block the plan keeps on one page loses the pages it is taken off
 * from its page assignment (`#__modules_menu`). It is never unpublished, so the page it stays on keeps it and no page
 * loses anything but that block; the assignment changes only on a module that is shown on chosen pages and on the page
 * it stays on, so a site that no longer looks like the content map is left as it is and the note says why.
 *
 * Only the pages the plan names go: a menu entry the plan does not know (a translation of the home page, a page added
 * later) keeps the block. Framework-wide (every Joomla template), never per template.
 */

const idOf = (/** @type {string} */ entity) => Number(String(entity ?? '').split('-')[1])

/**
 * The assignment writes for the plan's once-only blocks. Pure.
 * @param {object} input
 * @param {any[]} input.blocks - the site plan's `repeatedBlocks`
 * @param {Map<number, number[] | null>} input.assignments - module id → the menu ids it shows on (null: unreadable)
 * @returns {{ steps: Array<{kind: 'moduleAssignment', id: number, fields: {menuids: string}}>,
 *   skipped: Array<{entity: string, why: string}> }}
 */
export function repeatedBlockSteps({ blocks, assignments }) {
  const steps = []
  const skipped = []
  for (const block of blocks ?? []) {
    if (block?.repeat !== 'once') continue
    const entity = String(block.entity ?? '')
    if (!/^module-\d+$/.test(entity)) {
      skipped.push({ entity, why: 'only a module has a page assignment on Joomla' })
      continue
    }
    const id = idOf(entity)
    const keep = idOf(block.keepOn?.entity)
    const off = new Set((block.takenOffFrom ?? []).map((p) => idOf(p?.entity)).filter((n) => n > 0))
    const current = assignments.get(id)
    if (!Array.isArray(current)) {
      skipped.push({ entity, why: 'its page assignment could not be read' })
      continue
    }
    if (current.some((n) => n <= 0)) {
      skipped.push({ entity, why: 'it is shown on every page (or all but some), not on chosen pages' })
      continue
    }
    if (!current.includes(keep)) {
      skipped.push({ entity, why: 'it is not shown on the page the plan keeps it on' })
      continue
    }
    const narrowed = current.filter((n) => !off.has(n))
    if (narrowed.length === current.length) continue
    steps.push({ kind: 'moduleAssignment', id, fields: { menuids: JSON.stringify(narrowed) } })
  }
  return { steps, skipped }
}

/**
 * Read the once-only blocks' assignments and narrow them.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {any} input.sitePlan
 * @param {string} input.applyId
 * @param {(line: string) => void} [input.note]
 * @param {(name: string, value: number) => void} [input.time]
 * @returns {Promise<{narrowed: number, skipped: Array<{entity: string, why: string}>}>}
 */
export async function narrowRepeatedBlocks({ apply, siteKey, sitePlan, applyId, note, time }) {
  const blocks = (sitePlan?.repeatedBlocks ?? []).filter((b) => b?.repeat === 'once')
  if (!blocks.length) return { narrowed: 0, skipped: [] }
  /** @type {Map<number, number[] | null>} */
  const assignments = new Map()
  for (const block of blocks) {
    if (!/^module-\d+$/.test(String(block.entity))) continue
    const id = idOf(block.entity)
    try {
      const got = await apply({ siteKey, action: 'content.get', params: { kind: 'moduleAssignment', id } })
      const ids = got?.ok === false ? null : JSON.parse(String(got?.item?.menuids ?? 'null'))
      assignments.set(id, Array.isArray(ids) ? ids.map(Number) : null)
    } catch {
      assignments.set(id, null)
    }
  }
  const { steps, skipped } = repeatedBlockSteps({ blocks, assignments })
  let narrowed = 0
  for (const step of steps) {
    const block = blocks.find((b) => idOf(b.entity) === step.id)
    try {
      const answer = await apply({
        siteKey,
        action: 'content.update',
        params: { kind: step.kind, id: step.id, apply_id: applyId, fields: step.fields }
      })
      if (answer?.ok === false)
        throw new Error(String(answer.message ?? answer.error ?? answer.code ?? 'refused'))
      narrowed += 1
      note?.(
        `a showcase block repeated on several pages now shows on ${block?.keepOn?.id ?? 'one page'} only; taken off ${(block?.takenOffFrom ?? []).map((p) => p.id).join(', ')}`
      )
    } catch (error) {
      skipped.push({
        entity: `module-${step.id}`,
        why: `its page assignment could not be written: ${error instanceof Error ? error.message : error}`
      })
    }
  }
  for (const s of skipped)
    note?.(`a repeated showcase block (${s.entity}) stays where the template shows it: ${s.why}`)
  time?.('repeatedBlocksNarrowed', narrowed)
  return { narrowed, skipped }
}
