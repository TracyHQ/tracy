import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { CHECKER_VERSION } from '../src/site-planner/plan-check/check-plan.js'
import { PLANNER_PROMPT_FILE, plannerPrompt } from '../src/site-planner/planner-prompt.js'

// The owner (Akemi, COO) approved this prompt on 2026-11-05 (a list row printed in the same card as text slots follows
// that card: kit rows[].pairedSlots); its bytes change only with a new approval, recorded in an ADR 0041 amendment
// (#301, #370).
const APPROVED_SHA256 = '5db969c53e4c3d3b083f42466a808d6dccf92d383b336f97cd90de6628d14a50'

test('the shipped planner prompt is the approved one, byte for byte', () => {
  const bytes = readFileSync(PLANNER_PROMPT_FILE)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), APPROVED_SHA256)
})

test('the loader exposes the text and the sha256 of the bytes it read', () => {
  const p = plannerPrompt()
  assert.equal(p.sha256, APPROVED_SHA256)
  assert.equal(p.text, readFileSync(PLANNER_PROMPT_FILE, 'utf8'))
  assert.match(p.text, /^# Site planner\n/)
})

test('the loader reads the file once and hands back the same object', () => {
  assert.equal(plannerPrompt(), plannerPrompt())
  assert.ok(Object.isFrozen(plannerPrompt()))
})

test('the plan checker names its version', () => {
  assert.equal(typeof CHECKER_VERSION, 'string')
  assert.match(CHECKER_VERSION, /^site-plan-check\/\d+$/)
})

test('the prompt plans from looks and opens an image only when a look cannot settle a decision', () => {
  const { text } = plannerPrompt()
  assert.match(text, /`blocks\[\]`: `\{ id, role, shared, images, look,/)
  assert.match(text, /`pages\[\]`: `\{ id, group, path, inMainMenu, blocks\[\], images, look \}`/)
  assert.match(
    text,
    /Plan from the looks\. Open a desktop image only when a decision you must make cannot be settled/
  )
  assert.match(text, /Never open an image just to confirm what a look already says\./)
  assert.match(
    text,
    /`seen`: one line on what the block's image shows, in your own words, taken from its `look`/
  )
  assert.doesNotMatch(text, /open the desktop image of each block as you decide it/)
  assert.doesNotMatch(text, /Did you open the 1440 image of every kept block/)
})

test('the prompt keeps a section that shows how the trade works and hides only as the last resort', () => {
  const { text } = plannerPrompt()
  assert.match(text, /A block that shows how a session, a visit, an order or a first contact typically runs/)
  assert.match(
    text,
    /without any number, duration, count, price or other term; the brief need not\nhold the routine/
  )
  assert.match(text, /Its cards keep their picture frames, each showing a stage of the activity/)
  assert.match(text, /only as the last resort/)
  assert.ok(!text.includes('Prefer hiding a row, a block or a page to filling it with something untrue'))
})

test('the prompt keeps a list row exactly while its paired text slots are kept', () => {
  const { text } = plannerPrompt()
  assert.match(text, /`rows\[\]\.pairedSlots` names the block's text slots printed in the same card as/)
  assert.match(
    text,
    /keep any of those text slots and you keep the row and its\n {2}picture; hide them all and you drop the row/
  )
  assert.match(text, /The count follows the cards kept, never the pictures on hand/)
})
