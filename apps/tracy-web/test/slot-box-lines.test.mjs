/**
 * A line is written within the lines its measured box holds (spec TracyHQ/tracy#189, ADR 0039 `fit.lines`): the plugin
 * refuses more line breaks than the box holds (SLOT_TOO_LONG), and a refused line kept the template's words.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { writeContract } from '../src/sites/brief-engines/joomla.js'
import {
  lineLimitOf,
  lineLimits,
  withBoxLimits,
  withinLines
} from '../src/sites/brief-engines/slot-box-limits.js'

const fit = (lines) => ({ measured: true, lines, maxChars: { desktop: 200, mobile: 180 } })

test('#189 the box limit is the smallest measured line count; an unmeasured box has none', () => {
  assert.equal(lineLimitOf({ type: 'text', fit: fit({ desktop: 2, mobile: 1 }) }), 1)
  assert.equal(lineLimitOf({ type: 'text', fit: { measured: false, lines: { desktop: 1 } } }), null)
  assert.equal(lineLimitOf({ type: 'text' }), null)
  const [step] = withBoxLimits([
    { key: 'module-9.6', type: 'text', maxCharacters: 400, fit: fit({ desktop: 1 }) }
  ])
  assert.equal(step.maxLines, 1)
  assert.equal(step.maxCharacters, 180)
  assert.deepEqual(lineLimits([step, { key: 'module-9.7', type: 'text' }]), { 'module-9.6': 1 })
})

test('#189 lines past the box join its last line; nothing is cut and the length does not grow', () => {
  // A bakery's step and a law firm's step, each written on two lines for a one-line box.
  const bakery = 'Order by noon.\nCollect your loaves the next morning.'
  const law = 'Book a first call.\n\n  We read your file within two days.'
  assert.equal(withinLines(bakery, 1), 'Order by noon. Collect your loaves the next morning.')
  assert.equal(withinLines(law, 1), 'Book a first call. We read your file within two days.')
  assert.ok(withinLines(law, 1).length <= law.length)
  assert.equal(withinLines('One\nTwo\nThree', 2), 'One\nTwo Three')
  assert.equal(withinLines(bakery, 2), bakery)
  assert.equal(withinLines(bakery, null), bakery)
})

/** A contract door that refuses, as the plugin does, a line with more breaks than its box holds. */
function door(boxes) {
  const writes = []
  const tries = []
  const applyJoomlaContract = async ({ mapping }) => {
    tries.push(mapping.changes)
    for (const [key, value] of Object.entries(mapping.changes)) {
      const limit = boxes[key]
      if (limit && value.split('\n').length > limit)
        throw new Error(
          `SLOT_TOO_LONG: Content has more lines than its box holds: rewrite it in at most ${limit} line(s): ${key}`
        )
    }
    writes.push({ ...mapping.changes })
  }
  return { applyJoomlaContract, writes, tries }
}

const reading = { contract: 'c', revision: 'r1' }
const base = { apply: async () => reading, siteKey: 's', reading, evidence: {}, timed: (job) => job() }

test('#189 the write folds each line to the lines its box holds, so the site takes it', async () => {
  const { applyJoomlaContract, writes, tries } = door({ 'module-9.6': 1, 'module-9.7': 1 })
  const refused = await writeContract({
    ...base,
    applyJoomlaContract,
    lines: { 'module-9.6': 1, 'module-9.7': 1 },
    changes: {
      'module-9.6': 'Order by noon.\nCollect tomorrow.',
      'module-9.7': 'Book a call.\nWe reply in two days.'
    }
  })
  assert.deepEqual(refused, [])
  assert.equal(tries.length, 1, 'written once, never refused')
  assert.deepEqual(writes, [
    { 'module-9.6': 'Order by noon. Collect tomorrow.', 'module-9.7': 'Book a call. We reply in two days.' }
  ])
})

test('#189 a line refused for its line count, with no measured box, is written again within the lines the site names', async () => {
  const { applyJoomlaContract, writes } = door({ 'module-4.2': 1 })
  const refused = await writeContract({
    ...base,
    applyJoomlaContract,
    changes: { 'module-4.2': 'Fresh every day.\nBaked before dawn.', 'module-4.3': 'Visit us' }
  })
  assert.deepEqual(refused, [])
  assert.deepEqual(writes, [
    { 'module-4.2': 'Fresh every day. Baked before dawn.', 'module-4.3': 'Visit us' }
  ])
})

test('#189 a markup line laid out on lines is joined at the write, and its demo layout keeps the writer free of a line limit', () => {
  const sample =
    '((p))Book a lesson.((/p))\n\n((ul))\n\t((li))Warm up((/li))\n\t((li))Cool down((/li))\n((/ul))'
  const [slot] = withBoxLimits([
    { key: 'module-3.6', type: 'text', sample, maxCharacters: 600, fit: fit({ desktop: 1 }) }
  ])
  assert.equal(slot.maxLines, undefined)
  assert.deepEqual(lineLimits([slot]), { 'module-3.6': 1 })
  assert.equal(
    withinLines(sample, 1),
    '((p))Book a lesson.((/p)) ((ul)) ((li))Warm up((/li)) ((li))Cool down((/li)) ((/ul))'
  )
})
