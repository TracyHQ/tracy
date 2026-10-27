/**
 * Which presses inside a My Sites row cell stay in that cell, and which open the row's site
 * (bug 29/09 on cowork.tracy.site: a press on the EMPTY part of the Team cell did nothing, while the
 * whole row was lit as one button — a person pressing the middle of a row reads that as broken).
 *
 * The cells holding their own controls (Team, Agent, "…") used to stop EVERY press. Now only a press
 * that lands on one of their controls stays; the rest reaches the row. Menu items and dialogs render
 * in portals, outside the cell in the DOM, and React still bubbles their events through the cell,
 * so a press from outside the cell's DOM is theirs and stays too.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { keepsPress } from '../src/client/keeps-press.ts'

/**
 * A tiny DOM: each node names its parent, a tag and an optional role; `closest` walks up and
 * matches the same selector list the cell uses, `contains` walks up from the other node.
 */
function node(tag, parent = null, role = null) {
  const n = {
    tag,
    role,
    parent,
    closest(selector) {
      const wanted = selector.split(',').map((s) => s.trim())
      for (let at = n; at; at = at.parent) {
        const hit = wanted.some((w) =>
          w.startsWith('[role=') ? at.role !== null && w === `[role="${at.role}"]` : w === at.tag
        )
        if (hit) return at
      }
      return null
    },
    contains(other) {
      for (let at = other; at; at = at.parent) if (at === n) return true
      return false
    }
  }
  return n
}

// row (role=link) > team cell > avatar button > avatar image; plus empty space in the cell.
const row = node('div', node('div', null, 'dialog'), 'link')
const cell = node('div', row)
const avatar = node('button', cell)
const avatarImg = node('img', avatar)
const spacer = node('span', cell)

test('a press on the empty part of the cell reaches the row', () => {
  assert.equal(keepsPress(cell, cell), false)
  assert.equal(keepsPress(spacer, cell), false)
})

test('a press on the avatar (or inside it) stays in the cell', () => {
  assert.equal(keepsPress(avatar, cell), true)
  assert.equal(keepsPress(avatarImg, cell), true)
})

test('a press in a portalled menu or dialog, outside the cell in the DOM, stays in the cell', () => {
  const portal = node('div', null)
  assert.equal(keepsPress(node('div', portal, 'menuitem'), cell), true)
  assert.equal(keepsPress(node('div', node('div', portal, 'dialog')), cell), true)
})

test('a control ABOVE the cell does not count: a dialog wrapping the whole tab must not swallow presses', () => {
  // The row sits inside a role=dialog here on purpose; `closest` from the spacer would find it.
  assert.equal(keepsPress(spacer, cell), false)
})

test('a target that is not an element (a text node, null) reaches the row', () => {
  assert.equal(keepsPress(null, cell), false)
  assert.equal(keepsPress({}, cell), false)
})
