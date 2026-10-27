/**
 * The seat pill runs on a CUSTOMER'S page, so what is pinned is what would be dangerous or
 * dishonest there: it holds no door of its own (no fetch, no session cookie, no storage), the one
 * cookie it touches is its own dismissal, the document it embeds cannot break out of the script,
 * and what the screen edits is what the script honours.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import vm from 'node:vm'

import { DEFAULT_SETTING } from '../src/lib/badge-setting.js'
import { SEAT_BADGE_OFF, seatBadgeScript } from '../src/lib/seat-badge.js'

/** The pill as staff would switch it on at `/ops/widget`; the default is off. */
const SHOWN = Object.freeze({ ...DEFAULT_SETTING.seat, on: true })
const script = seatBadgeScript(SHOWN)

test('off — the default — serves a script that draws, reads and listens to nothing', () => {
  for (const setting of [DEFAULT_SETTING.seat, { ...SHOWN, on: false }]) {
    const out = seatBadgeScript(setting)
    assert.equal(out, SEAT_BADGE_OFF)
    for (const word of ['document', 'window', 'createElement', 'cookie', 'Managed with Tracy'])
      assert.ok(!out.includes(word), `the off script must not mention ${word}`)
  }
  // It parses and runs on a page with nothing at all: no script error in a customer's console.
  assert.doesNotThrow(() => vm.runInNewContext(SEAT_BADGE_OFF, {}))
})

test('the script carries no door of its own', () => {
  for (const forbidden of [
    'fetch(',
    'XMLHttpRequest',
    'localStorage',
    'sessionStorage',
    'tracy_sess',
    '/__tracy/',
    'password'
  ])
    assert.ok(!script.includes(forbidden), `seat badge must not mention ${forbidden}`)
})

test('the only cookie it touches is its own dismissal, for a day', () => {
  // Every `tracy_…` name the script spells is a cookie or storage key it could touch.
  const names = [...script.matchAll(/'(tracy_[a-z_]+)'/g)].map((m) => m[1])
  assert.deepEqual([...new Set(names)], ['tracy_badge_off'])
  assert.equal(script.split('document.cookie').length - 1, 2, 'one read, one write')
  assert.ok(script.includes('Max-Age=86400'))
})

test('the embedded document cannot close the script tag or break a line', () => {
  const hostile = structuredClone(SHOWN)
  hostile.pillLabel = 'x</script><script>alert(1)</script>\u2028y'
  const out = seatBadgeScript(hostile)
  assert.ok(!out.includes('</script'), 'a closing tag must be escaped')
  assert.ok(!out.includes('\u2028'), 'a line separator must be escaped')
  assert.ok(out.includes('\\u003c/script'), 'escaped as \\u003c')
})

test('the corner, the colours and the mark follow the setting', () => {
  const left = structuredClone(SHOWN)
  left.style = { bg: '#102030', fg: '#fafafa', accent: '#00ff00', position: 'left', mark: false }
  const out = seatBadgeScript(left)
  for (const value of [
    '"bg":"#102030"',
    '"fg":"#fafafa"',
    '"accent":"#00ff00"',
    '"position":"left"',
    '"mark":false'
  ])
    assert.ok(out.includes(value), value)
  // The script decides the corner and the mark from the document at run time — so the rule that
  // maps them must be present, not a default baked in at render time.
  assert.ok(out.includes("=== 'left'"), 'left is a run-time choice')
  assert.ok(out.includes('S.style.mark'), 'the mark is a run-time choice')
})

test('labels reach the page as text, never as markup', () => {
  // The validator refuses `<` and `>`; the script must not rely on that. Every label is written
  // with textContent, and the one innerHTML in the file holds no label.
  assert.ok(script.includes('.textContent = '), 'labels go through textContent')
  assert.ok(!/innerHTML\s*=.*S\./.test(script), 'no label is ever concatenated into innerHTML')
})

test('the doors it reads are the ones the tag carries, and the chat door is named but unread', () => {
  for (const attr of ['variant', 'viewer', 'teamHref', 'homeHref'])
    assert.ok(script.includes(`d.${attr}`), `reads data-${attr}`)
  // The seam for the next task: the row builder is an array, and the attribute is spelled out in
  // the header so the person adding Chat finds the one place to add it.
  assert.ok(script.includes('data-chat-href'))
  assert.ok(!script.includes('d.chatHref'), 'nothing reads it yet')
})

test('an unknown variant renders nothing, and `create` is no longer one of them', () => {
  // The `create` pill was removed 20/09/2026 — the server had already stopped emitting
  // `data-variant="create"`, so the branch here could not be reached by any page Tracy serves.
  assert.ok(script.includes("['managed', 'draft', 'copy']"))
  assert.ok(!script.includes("'create'"), 'a variant nothing emits is still offered')
})
