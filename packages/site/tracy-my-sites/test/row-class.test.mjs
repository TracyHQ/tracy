/**
 * The class list of a My Sites row (bug 29/09 on cowork.tracy.site: the row read
 * "…py-2.5is-openable", so the hover fill and the "Chat" hint never showed).
 *
 * The class was built in a template literal with a leading space inside a conditional string,
 * and `biome lint --write` (useSortedClasses) trimmed that space. The list is now joined in one
 * function, and this test pins that each optional class arrives as its own class.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { rowClassName } from '../src/client/row-class.ts'

test('an openable row carries is-openable as a separate class', () => {
  const classes = rowClassName(true, false).split(/\s+/)
  assert.ok(classes.includes('is-openable'), classes.join(' '))
  assert.ok(classes.includes('tracy-mysites-row'))
})

test('a row that cannot open has no is-openable class', () => {
  assert.ok(!rowClassName(false, false).split(/\s+/).includes('is-openable'))
})

// The site being managed is tinted at rest, like the viewer's own row in the Team tab (Akemi, 29/09).
test('the row of the site being managed carries the resting tint', () => {
  assert.ok(rowClassName(false, true).split(/\s+/).includes('bg-foreground/5'))
  assert.ok(!rowClassName(true, false).split(/\s+/).includes('bg-foreground/5'))
})
