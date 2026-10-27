import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CSS } from '../src/client/styles.ts'
import { COMPOSER_CSS } from '../src/client/composer-styles.ts'

test('Help-only onboarding uses the same card, draft and control geometry rules as a site composer', () => {
  const shared =
    ':is([data-slot="conversation.composer.bar"] [class*="_root"]:not([class*="_hero"]) > [data-composer-card], .tv-onboarding-composer)'
  for (const tail of [
    ' {',
    ':focus-within {',
    ' > [data-input-scroll] {',
    ' > [class*="_row"] > [class*="_trailing"] {',
    ' [class*="_trailing"] [class*="_primary"] {',
    ' [data-input-scroll] [class*="_input"] {'
  ])
    assert.ok(COMPOSER_CSS.includes(shared + tail), tail)
  assert.match(COMPOSER_CSS, /--tc-composer-radius: 12px/)
  assert.match(COMPOSER_CSS, /padding: 10px 12px 12px 8px/)
  assert.match(COMPOSER_CSS, /width: 30px; height: 30px/)
})

test('a Help conversation reuses the full-height dock and reserves the native composer foot', () => {
  const conversation = CSS.slice(CSS.indexOf('/* A Help question switches'))
  assert.match(conversation, /data-tracy-help-conversation/)
  assert.match(conversation, /min-height: 0/)
  assert.match(conversation, /overflow-y: visible/)
  assert.match(conversation, /scrollbar-gutter: stable/)
  assert.match(conversation, /padding-bottom: calc\(var\(--tc-composer-foot, 28px\) \+ 4px\)/)
  assert.match(conversation, /display: none !important/)
})
