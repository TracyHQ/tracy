import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('current pagination page uses foreground fill and background text for contrast', () => {
  const css = readFileSync(new URL('../src/beta/signals.css', import.meta.url), 'utf8')
  const currentPageRule = css.match(
    /\.signals-pagination button\[aria-current="page"\],\s*\.signals-pagination button\[aria-current="page"\]:hover\s*\{([^}]+)\}/
  )
  assert.ok(currentPageRule, 'current and hovered page share a contrast rule')
  assert.match(currentPageRule[1], /background:\s*var\(--foreground\)\s*;/)
  assert.match(currentPageRule[1], /color:\s*var\(--background\)\s*;/)
})
