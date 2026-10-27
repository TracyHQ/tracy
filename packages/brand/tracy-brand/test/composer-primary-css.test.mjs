/**
 * The chat box's one round button stays in Tracy's terracotta family in every state (David, 11/10/2026).
 * dsh's InputBar.module.css paints `.primary:hover` with its blue info hover; tracy-brand recolours the resting
 * state, so it also owns hover, press and focus — for dsh's button (Send, and dsh's stop) and for Help's stop
 * (`.tv-help-stop`, drawn by @tracy/dsh-assistant in the same seat). Focus is one 1px stroke, never a halo.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const styles = readFileSync(path.join(here, '..', 'src', 'client', 'styles.ts'), 'utf8')
const dshCss = readFileSync(
  path.resolve(
    here,
    '../../../../vendor/tracy/deepseek-harness/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css'
  ),
  'utf8'
)
const BAR = '[data-slot="conversation.composer.bar"]'

/** The declaration block of the first rule whose selector list contains `selector`. */
function block(selector) {
  const at = styles.indexOf(selector)
  assert.notEqual(at, -1, `${selector} has a rule`)
  const open = styles.indexOf('{', at)
  return styles.slice(open + 1, styles.indexOf('}', open))
}

test('dsh still paints its primary hover blue, so the override is needed and its class tail still matches', () => {
  assert.match(dshCss, /\.primary:hover:not\(:disabled\)\s*\{[^}]*--dsw-alias-button-info-hover/)
})

test('hover and press of the round button use the darker terracotta of tracy-brand, for dsh and for Help', () => {
  for (const sel of [
    `${BAR} [class*="_primary"]:hover:not(:disabled)`,
    `${BAR} [class*="_primary"]:active:not(:disabled)`,
    `${BAR} .tv-help-stop:hover`,
    `${BAR} .tv-help-stop:active`
  ]) {
    assert.match(
      block(sel),
      /background: var\(--dsw-alias-button-primary-hover, color-mix\(in oklab, var\(--dsw-alias-brand-primary, #bf5b3d\) 88%, black\)\)/,
      sel
    )
  }
  assert.doesNotMatch(styles, /button-info-hover/)
})

test('focus of the round button is one 1px terracotta stroke, never a halo', () => {
  for (const sel of [`${BAR} [class*="_primary"]:focus-visible`, `${BAR} .tv-help-stop:focus-visible`]) {
    const b = block(sel)
    assert.match(b, /outline: 1px solid var\(--ring, #bf5b3d\)/, sel)
    assert.match(b, /box-shadow: none/, sel)
  }
})

test('the action row under an answer takes focus as one 1px stroke, never the browser ring or a halo', () => {
  // Every answer row (agent turn tail, Help answer, slash-command result) carries data-actions-reveal (fork tracy.42).
  const rule = block('[data-actions-reveal] button:focus-visible')
  assert.match(rule, /outline: 1px solid var\(--ring, #bf5b3d\)/)
  assert.match(rule, /box-shadow: none/)
  const messageCss = readFileSync(
    path.resolve(
      here,
      '../../../../vendor/tracy/deepseek-harness/packages/client/ui-chat/src/client/chat/MessageIconActions.module.css'
    ),
    'utf8'
  )
  // dsh still draws no focus of its own for these buttons (else this rule would fight it).
  assert.doesNotMatch(messageCss, /\.action:focus/)
})
