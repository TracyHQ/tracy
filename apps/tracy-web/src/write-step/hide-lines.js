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

/** A link among words the write step replaces with words that hold no link: it leaves with the old words. */
function rewrittenResult({ key }, refused) {
  if (refused.has(key))
    return {
      status: 'failed',
      key,
      reason: `this link is inside the words of ${key}, whose new words were refused (${refusalWords(refused.get(key))}), so it stays`
    }
  return {
    status: 'hidden',
    key,
    reason: `${PLAN_HIDES}: it was printed inside the words of ${key}, which the write step replaced with words that hold no link`
  }
}

/** A link that follows the slots holding it: hidden when they all left, relinked or failed as they were. */
function carriedResult({ key, keys, holder }, { gone, removed, relinked, refused }) {
  const left = (k) => removed.get(k) === true || gone.has(k)
  const relink = keys.find((k) => relinked?.has(k))
  if (relink) {
    const { address } = relinked.get(relink)
    return {
      status: 'written',
      key: relink,
      ordered: address,
      part: 'relink',
      reason: `${PLAN_HIDES}; the slot ${relink} that holds its address stays with its row, so it leads to the living page ${address}`
    }
  }
  const failed = keys.find((k) => typeof removed.get(k) === 'string' || refused.has(k))
  if (failed)
    return {
      status: 'failed',
      key: failed,
      reason: `this link stays with ${failed}, which could not leave: ${
        typeof removed.get(failed) === 'string' ? removed.get(failed) : refusalWords(refused.get(failed))
      }`
    }
  if (!keys.every(left)) return null
  const what = {
    row: 'its row',
    slot: 'the slot of words',
    address: 'the slots holding its address',
    picture: 'the picture it is drawn around'
  }[holder]
  return {
    status: 'hidden',
    key,
    reason: `${PLAN_HIDES}: it was printed by ${keys.join(', ')} and left with ${what ?? 'them'}`
  }
}

/** A label written with a file's words, since hiding it would leave its control with none (hide-control-labels.js). */
function restoredResult({ key, value, reason }, { refused, written }) {
  const base = { key, part: 'control-label' }
  if (refused.has(key))
    return {
      ...base,
      status: 'failed',
      reason: `${reason}; the words were refused: ${refusalWords(refused.get(key))}`
    }
  return written.has(key) ? { ...base, status: 'written', ordered: value, reason } : null
}

/** What became of one hide claim, or null while nothing did, which the report reads as the run having ended first. */
function claimResult(order, { blocks, words, gone, refused, settled, removed, relinked, written }) {
  const { via, key } = order
  if (via === 'kept') {
    const { status, reason, key: heldKey, ordered, readFrom, part } = order.line
    return { status, reason, key: heldKey, ordered, readFrom, part }
  }
  if (via === 'failed')
    return { status: 'failed', reason: order.reason, key, ...(order.part ? { part: order.part } : {}) }
  if (via === 'fixed') return fixedResult(order, words)
  if (via === 'restored') return restoredResult(order, { refused, written })
  if (via === 'removed') return removedResult(order, removed)
  if (via === 'empty')
    return { status: 'hidden', key, reason: `${PLAN_HIDES}: it is already empty on the site` }
  if (via === 'rewritten') return rewrittenResult(order, refused)
  if (via === 'carried') return carriedResult(order, { gone, removed, relinked, refused })
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
  // A link the plugin keeps with its row leads to a living page of the plan instead (ADR 0044, decision 29, card AM).
  if (relinked?.has(key)) {
    const { address, refusal } = relinked.get(key)
    return {
      status: 'written',
      key,
      ordered: address,
      part: 'relink',
      reason: `${PLAN_HIDES}, and the plugin keeps it with its row (${refusalWords(refusal)}); it leads to the living page ${address} instead of the hidden one`
    }
  }
  if (refused.has(key)) {
    const entry = refused.get(key)
    const reason = entry?.relink
      ? `${PLAN_HIDES}; the plugin keeps it with its row (${refusalWords(entry.relink.refusal)}) and refused the living page ${entry.relink.address} too: ${refusalWords(entry)}`
      : refusalWords(entry)
    return { status: 'failed', key, reason, refusal: entry }
  }
  return gone.has(key) ? { status: 'hidden', key, reason: PLAN_HIDES } : null
}

/**
 * @param {{ order: object, words: object, blocks: Map<string, true | string>, pages: Map<string, object>,
 *   cannotHide: string | null, emptied: Iterable<string>, refused: Map<string, object>, settled: Map<string, object>,
 *   removed?: Map<string, true | string>, relinked?: Map<string, { address: string, refusal: object }>,
 *   written?: Iterable<string> }} input `written`: the keys the contract call wrote
 * @returns {{ hides: Map<string, object>, lines: object[], removed: Map<string, true | string>, rows: object[],
 *   rowKeys: Set<string> }} `rows`: rows kept against the plan per list; `rowKeys`: the unclaimed slots of given-up rows
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
  removed = new Map(),
  relinked = new Map(),
  written = []
}) {
  const seen = {
    blocks,
    words,
    gone: new Set(emptied),
    refused,
    settled,
    removed,
    relinked,
    written: new Set(written)
  }
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
  lines.push(...rowRestLines(order, removed))
  // A control taken with its only label, which no plan line names (hide-control-labels.js).
  for (const [link, taking] of order.controls ?? []) {
    const result = claimResult(taking, seen)
    const said = result?.status === 'hidden' ? { reason: taking.reason } : {}
    lines.push(
      frameLine(
        link,
        'control',
        result
          ? { ...result, ...said }
          : { status: 'skipped', reason: 'the run ended before this control was hidden' }
      )
    )
  }
  for (const [block, module] of order.blocks) {
    const done =
      cannotHide && blocks.get(module) !== true
        ? { status: 'failed', reason: cannotHide }
        : blockResult(blocks, module)
    const hidden = { reason: `the plan drops this block: ${module} is unpublished` }
    lines.push(
      frameLine(
        block,
        'block',
        done ? { ...done, ...(done.status === 'hidden' ? hidden : {}) } : skippedBlock
      )
    )
  }
  return {
    hides,
    lines,
    removed,
    rows: rowsKept(order, removed),
    rowKeys: new Set(order.rowLined ?? order.rowRest ?? [])
  }
}

/** The slots of a given-up row no hide claim names: each leaves with its row, and its line says so. */
function rowRestLines(order, removed) {
  return (order.rowLined ?? order.rowRest ?? []).map((key) => {
    const done = removed.get(key)
    const base = { slot: key, key, owner: 'plan', readBack: null, part: 'row' }
    if (done === true)
      return {
        ...base,
        status: 'hidden',
        reason: 'the plan keeps fewer rows of this list: this slot left the stored field with its row',
        ...removedRead(key)
      }
    if (typeof done === 'string') return { ...base, status: 'failed', reason: done }
    return { ...base, status: 'skipped', reason: 'the run ended before this row was removed' }
  })
}

/**
 * Rows kept against the plan, per list (ADR 0044, decision 22): the demo's rows less the given-up rows the door took. A row counts
 * as gone when any of its slots left the stored field, in this run or an earlier one.
 */
function rowsKept(order, removed) {
  const already = new Set(
    [...(order.orders?.values() ?? [])].filter((o) => o?.via === 'removed' && o.already).map((o) => o.key)
  )
  const left = (key) => removed.get(key) === true || already.has(key)
  return (order.rowLists ?? []).map(({ block, list, plan, demo, gone, keptKeys = [] }) => {
    const taken = gone.filter((row) => row.some(left)).length
    return { block, list, plan, demo, kept: demo - taken, keptKeys }
  })
}
