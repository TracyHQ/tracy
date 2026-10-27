/**
 * What the public export leaves out (`scripts/opensource/public-tree.json`), as the gates see it.
 *
 *   node --test scripts/test/public-tree.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { absentExclusion, publicTreeExcludes } from '../lib/public-tree.mjs'

test('the exclude list is the one the exporter reads, and it leaves tasks/ out', () => {
  assert.ok(publicTreeExcludes().includes('tasks/'))
})

test('a path under an excluded folder that is absent from the tree names that folder', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'public-tree-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const excludes = ['tasks/', 'docs/references/may-staging.md']
  assert.equal(absentExclusion('tasks/todo-x.md', { root, excludes }), 'tasks/')
  assert.equal(absentExclusion('tasks', { root, excludes }), 'tasks/')
  assert.equal(
    absentExclusion('docs/references/may-staging.md', { root, excludes }),
    'docs/references/may-staging.md'
  )
  assert.equal(
    absentExclusion('tasksmith/a.md', { root, excludes }),
    null,
    'a prefix match is a folder match'
  )
  assert.equal(absentExclusion('docs/x.md', { root, excludes }), null)
})

test('an excluded folder that is present is checked like any other path', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'public-tree-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'tasks'))
  assert.equal(absentExclusion('tasks/gone.md', { root, excludes: ['tasks/'] }), null)
})
