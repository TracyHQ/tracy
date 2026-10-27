/**
 * The task list opens itself once per attempt, and never again for the same attempt — plan
 * first-site-build-onboarding §5.4. A fake document stands in for dsh's `TodoPanel`: its header
 * is a `<button aria-expanded>` under `[data-testid="todo-panel"]`, which is the contract the
 * plugin reads (`packages/site/tracy-site-build-core/src/client/task-panel.ts`).
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  resetTaskPanelMemory,
  revealTaskPanel
} from '../../packages/site/tracy-site-build-core/src/client/task-panel.ts'

function fakeDoc(initial: 'absent' | 'collapsed' | 'open') {
  let present = initial !== 'absent'
  let expanded = initial === 'open'
  let clicks = 0
  const header = {
    getAttribute: (name: string) => (name === 'aria-expanded' ? String(expanded) : null),
    click: () => {
      clicks++
      expanded = !expanded
    }
  }
  return {
    doc: { querySelector: () => (present ? header : null) } as unknown as Document,
    appear: () => {
      present = true
    },
    collapse: () => {
      expanded = false
    },
    get expanded() {
      return expanded
    },
    get clicks() {
      return clicks
    }
  }
}

test('an attempt opens the panel once; later polls of the same attempt leave a folded panel folded', async () => {
  resetTaskPanelMemory()
  const page = fakeDoc('collapsed')
  assert.equal(await revealTaskPanel('b1:1', page.doc), true)
  assert.equal(page.expanded, true)
  assert.equal(page.clicks, 1)
  // The person folds it. A poll (same attempt) must not fight them.
  page.collapse()
  assert.equal(await revealTaskPanel('b1:1', page.doc), false)
  assert.equal(page.expanded, false)
  assert.equal(page.clicks, 1)
  // A retry is a new attempt: opened once more.
  assert.equal(await revealTaskPanel('b1:2', page.doc), true)
  assert.equal(page.expanded, true)
  assert.equal(page.clicks, 2)
})

test('a panel that is already open is not toggled shut', async () => {
  resetTaskPanelMemory()
  const page = fakeDoc('open')
  assert.equal(await revealTaskPanel('b2:1', page.doc), true)
  assert.equal(page.expanded, true)
  assert.equal(page.clicks, 0)
})

test('the panel appears after the first line lands: the open waits for it', async () => {
  resetTaskPanelMemory()
  const page = fakeDoc('absent')
  const pending = revealTaskPanel('b3:1', page.doc)
  setTimeout(() => page.appear(), 350)
  assert.equal(await pending, true)
  assert.equal(page.expanded, true)
})
