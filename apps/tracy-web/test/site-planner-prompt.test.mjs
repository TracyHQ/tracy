import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { CHECKER_VERSION } from '../src/site-planner/plan-check/check-plan.js'
import { PLANNER_PROMPT_FILE, plannerPrompt } from '../src/site-planner/planner-prompt.js'

// The owner approved this prompt on 2026-11-03 (looks instead of opening every kit image); its bytes change only with
// a new approval, recorded in the ADR 0041 amendment (#301).
const APPROVED_SHA256 = 'b48800fb2f25e678c356bc5f6fa5548c2ca1a58da7ed550754c1f36379ebbdb8'

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
