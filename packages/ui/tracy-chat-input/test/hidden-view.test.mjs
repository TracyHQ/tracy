/**
 * A conversation view tab an operator hid (/ops › User Interface › DSH) must not keep a customer on
 * it: dsh remembers the last view per session, so hiding the Trajectory tab while it is selected
 * would leave the customer on a view with no tab to leave by.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { viewToLeaveFor } from '../src/client/hidden-view.mjs'

const shownExcept = (hidden) => (id) => !hidden.includes(id)

test('on a hidden Trajectory, the customer goes back to Chat', () => {
  const tabs = [
    { view: 'chat', selected: false },
    { view: 'trajectory', selected: true }
  ]
  assert.equal(viewToLeaveFor(tabs, shownExcept(['dsh-trajectory-tab'])), 'chat')
})

test('nothing to do while the selected view is shown, or when Trajectory is not selected', () => {
  const onTrajectory = [
    { view: 'chat', selected: false },
    { view: 'trajectory', selected: true }
  ]
  assert.equal(viewToLeaveFor(onTrajectory, shownExcept([])), null)
  const onChat = [
    { view: 'chat', selected: true },
    { view: 'trajectory', selected: false }
  ]
  assert.equal(viewToLeaveFor(onChat, shownExcept(['dsh-trajectory-tab'])), null)
})

test('a view no switch governs is left alone, and with no shown view to go to nothing happens', () => {
  assert.equal(
    viewToLeaveFor([{ view: 'some-plugin', selected: true }], shownExcept(['dsh-trajectory-tab'])),
    null
  )
  assert.equal(
    viewToLeaveFor([{ view: 'trajectory', selected: true }], shownExcept(['dsh-trajectory-tab'])),
    null
  )
})
