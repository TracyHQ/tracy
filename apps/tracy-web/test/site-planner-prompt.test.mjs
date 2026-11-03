import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { CHECKER_VERSION } from '../src/site-planner/plan-check/check-plan.js'
import { PLANNER_PROMPT_FILE, plannerPrompt } from '../src/site-planner/planner-prompt.js'

// The owner locked the approved prompt on 2026-11-03; its bytes must never change (ADR 0041, #301).
const APPROVED_SHA256 = '1492da553a39de6c670da08f9378834ae522f4eabfeae5a97d32067e189436e7'

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
