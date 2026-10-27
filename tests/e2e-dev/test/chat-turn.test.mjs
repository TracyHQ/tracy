// The run's chat budget (plan §2 D4): six prompts, retries included, and 24 minutes, kept in a file
// of the run folder so journeys in separate processes share it.

import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  CHAT_BUDGET,
  chatTimeLeftMs,
  readChatLedger,
  reservePrompt,
  settlePrompt
} from '../lib/chat-turn.mjs'
import { Blocked } from '../lib/journey.mjs'

const dir = () => mkdtempSync(join(tmpdir(), 'e2e-chat-'))

test('a fresh run has the whole budget', () => {
  const d = dir()
  assert.deepEqual(readChatLedger(d), { prompts: [] })
  assert.equal(chatTimeLeftMs(d), CHAT_BUDGET.ms)
})

test('the seventh prompt is BLOCKED, not sent', () => {
  const d = dir()
  for (let i = 0; i < CHAT_BUDGET.prompts; i++) settlePrompt(d, reservePrompt(d, 'J4a', `p${i}`), 1_000)
  assert.equal(readChatLedger(d).prompts.length, 6)
  assert.throws(
    () => reservePrompt(d, 'J5', 'one too many'),
    (e) => e instanceof Blocked && e.kind === 'chat-budget'
  )
  assert.equal(readChatLedger(d).prompts.length, 6)
})

test('spent chat time blocks the next prompt even with prompts left', () => {
  const d = dir()
  settlePrompt(d, reservePrompt(d, 'J4a', 'slow'), CHAT_BUDGET.ms)
  assert.equal(chatTimeLeftMs(d), 0)
  assert.throws(
    () => reservePrompt(d, 'J4b', 'next'),
    (e) => e instanceof Blocked && e.kind === 'chat-budget'
  )
})

test('an open prompt counts its time until now', () => {
  const d = dir()
  const at = new Date(Date.now() - 60_000).toISOString()
  writeFileSync(
    join(d, 'chat-budget.json'),
    JSON.stringify({ prompts: [{ journey: 'J5', text: 'x', at, ms: null }] })
  )
  const left = chatTimeLeftMs(d)
  assert.ok(left <= CHAT_BUDGET.ms - 60_000 && left > CHAT_BUDGET.ms - 70_000, `left ${left}`)
})
