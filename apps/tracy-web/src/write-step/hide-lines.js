// What the hide stage did, as the report says it (ADR 0044, decision 3): per hide claim a result that goes onto its line, and a
// line of its own for each dropped block and dropped page. Reasons are the plugin's words when it refused. The read of a thing
// taken away with its block or menu item is that row's `published`: the slot itself still holds words no page prints.
import { refusalWords } from './contract-write.js'
import { unpublishedRead } from './hide-writes.js'

const PLAN_HIDES = 'the plan hides this slot'
const moduleId = (key) => Number(key.slice(key.lastIndexOf('-') + 1))
const skippedBlock = { status: 'skipped', reason: 'the run ended before this block was unpublished' }

function blockResult(blocks, module) {
  const done = blocks.get(module)
  if (done === true) return { status: 'hidden', ...unpublishedRead('module', moduleId(module)) }
  return typeof done === 'string' ? { status: 'failed', reason: done } : null
}

function fixedResult(order, words) {
  const fixedLine = { key: null, part: 'fixed-text' }
  const left = order.constants.filter((c) => words.refused.has(c))
  if (words.refusedAll || left.length)
    return {
      ...fixedLine,
      status: 'failed',
      reason: words.refusedAll ?? left.map((c) => `${c}: ${words.refused.get(c)}`).join('; ')
    }
  return {
    ...fixedLine,
    status: 'hidden',
    reason: `${PLAN_HIDES}: ${order.constants.join(', ')} emptied in the source language, off every page that prints it`
  }
}

/** How a slot taken out of the stored field is read back: on the list of what the plugin removed. */
const removedRead = (key) => ({
  ordered: 'removed',
  readFrom: { action: 'content.contract', params: { operation: 'inspect' }, path: ['removedSlots', key] }
})

function removedResult({ key, already }, removed) {
  const done = already ? true : removed.get(key)
  if (done === true)
    return {
      status: 'hidden',
      key,
      reason: `${PLAN_HIDES}: it left the stored field with its row or element, and comes back only on a new site`,
      ...removedRead(key)
    }
  return typeof done === 'string' ? { status: 'failed', key, reason: done } : null
}

/** What became of one hide claim, or null while nothing did, which the report reads as the run having ended first. */
function claimResult(order, { blocks, words, gone, refused, settled, removed }) {
  const { via, key } = order
  if (via === 'failed')
    return { status: 'failed', reason: order.reason, key, ...(order.part ? { part: order.part } : {}) }
  if (via === 'fixed') return fixedResult(order, words)
  if (via === 'removed') return removedResult(order, removed)
  if (via === 'empty')
    return { status: 'hidden', key, reason: `${PLAN_HIDES}: it is already empty on the site` }
  if (via === 'block') {
    const done = blockResult(blocks, order.module)
    if (!done) return null
    const reason =
      done.status === 'hidden'
        ? `${PLAN_HIDES}: it left with its unpublished block ${order.module}`
        : done.reason
    return { key, ...done, reason }
  }
  if (via === 'menu') {
    const done = settled.get(order.item)
    if (done?.status === 'failed') return { status: 'failed', reason: done.reason }
    if (done?.status !== 'written') return null
    return {
      status: 'hidden',
      reason: `${PLAN_HIDES}: it left with its unpublished menu item ${order.item}`,
      ordered: done.ordered,
      readFrom: done.readFrom
    }
  }
  if (refused.has(key)) {
    const entry = refused.get(key)
    return { status: 'failed', key, reason: refusalWords(entry), refusal: entry }
  }
  return gone.has(key) ? { status: 'hidden', key, reason: PLAN_HIDES } : null
}

/**
 * @param {{ order: object, words: object, blocks: Map<string, true | string>, pages: Map<string, object>,
 *   cannotHide: string | null, emptied: Iterable<string>, refused: Map<string, object>, settled: Map<string, object>,
 *   removed?: Map<string, true | string> }} input
 * @returns {{ hides: Map<string, object>, lines: object[] }}
 */
export function hideLines({
  order,
  words,
  blocks,
  pages,
  cannotHide,
  emptied,
  refused,
  settled,
  removed = new Map()
}) {
  const seen = { blocks, words, gone: new Set(emptied), refused, settled, removed }
  const hides = new Map()
  for (const [slot, claim] of order.orders) {
    const result = claimResult(claim, seen)
    if (result) hides.set(slot, result)
  }
  const frameLine = (slot, part, result) => ({
    slot,
    key: null,
    owner: 'plan',
    readBack: null,
    part,
    ...result
  })
  const lines = [...pages].map(([page, result]) => frameLine(page, 'page-drop', result))
  for (const [block, module] of order.blocks) {
    const done = cannotHide ? { status: 'failed', reason: cannotHide } : blockResult(blocks, module)
    const hidden = { reason: `the plan drops this block: ${module} is unpublished` }
    lines.push(
      frameLine(
        block,
        'block',
        done ? { ...done, ...(done.status === 'hidden' ? hidden : {}) } : skippedBlock
      )
    )
  }
  return { hides, lines }
}
