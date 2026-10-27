import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const cell = readFileSync(new URL('../src/client/site-cell.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/client/styles.ts', import.meta.url), 'utf8')

test('the current site label gives way like every state label instead of running over the menu (24/10/2026)', () => {
  // German "Wird verwaltet" overlapped the row's "..." button at 390px: its badge never shrank.
  const current = cell.slice(
    cell.indexOf('if (isCurrent)'),
    cell.indexOf('</Badge>', cell.indexOf('if (isCurrent)'))
  )
  assert.match(current, /className="tracy-mysites-state-text gap-1\.5" title=\{t\('badge\.current'\)\}/)
  assert.match(current, /<span className="truncate">\{t\('badge\.current'\)\}<\/span>/)
  assert.match(css, /\.tracy-mysites-state-text > \.truncate \{\s*min-width: 0;\s*\}/)
  assert.match(css, /\.tracy-mysites \.tracy-mysites-dot \{\s*flex-shrink: 0;/)
})
