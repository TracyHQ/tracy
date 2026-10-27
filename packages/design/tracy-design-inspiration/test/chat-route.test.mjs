/**
 * The preview dialog's "Use this inspiration" is the chat route to a design system: it follows the
 * operator's switch `chat-design-system` (off by default since 11/10/2026, David), never a hard-coded
 * condition. "Create with <CMS>" is not governed by it: it makes a new site.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { UI_SWITCHES } from '@tracy/core/ui-switches'

import { CHAT_DS_SWITCH, offersUseThis, recordsPickOnCreate } from '../src/client/chat-route.mjs'

test('the switch is the catalogue one, off by default', () => {
  const row = UI_SWITCHES.find((s) => s.id === CHAT_DS_SWITCH)
  assert.ok(row)
  assert.equal(row.defaultOn, false)
})

test('"Use this inspiration" is offered only with the chat route on, on a seat, for a design system', () => {
  assert.equal(offersUseThis({ publicMode: false, template: false, chatRoute: true }), true)
  assert.equal(offersUseThis({ publicMode: false, template: false, chatRoute: false }), false)
  assert.equal(offersUseThis({ publicMode: true, template: false, chatRoute: true }), false)
  assert.equal(offersUseThis({ publicMode: false, template: true, chatRoute: true }), false)
})

test('the dialog reads the switch through @tracy/core/ui-switches, and Create with stays unconditional', () => {
  const source = readFileSync(new URL('../src/client/PreviewDialog.tsx', import.meta.url), 'utf8')
  assert.match(source, /ui\.isShown\(CHAT_DS_SWITCH\)/)
  assert.match(source, /offersUseThis\(/)
  // The Create with buttons are drawn from `createWith`, with no chat-route condition around them.
  assert.ok(!/chatRoute[^\n]*createWith|createWith[^\n]*chatRoute/.test(source))
})

test('Create with records the pick only while the chat route is on — the door it calls is closed otherwise (DI-1)', () => {
  // `POST …/choose` answers 403 CHAT_DESIGN_SYSTEM_OFF with the switch off; the pick it records is
  // read only by the chat redesign of the running site. A new site gets its design from Build.
  assert.equal(recordsPickOnCreate({ chatRoute: true }), true)
  assert.equal(recordsPickOnCreate({ chatRoute: false }), false)
  const source = readFileSync(new URL('../src/client/PreviewDialog.tsx', import.meta.url), 'utf8')
  // The Create with handler's call is the bare statement; "Use this" chains `.then` inside its own
  // `offersUseThis` block.
  const calls = source.match(/[^\n]*void choose\(inspiration\.id\)\s*\n/g) ?? []
  assert.equal(calls.length, 1)
  assert.match(calls[0], /recordsPickOnCreate\(\{ chatRoute \}\)/)
})
