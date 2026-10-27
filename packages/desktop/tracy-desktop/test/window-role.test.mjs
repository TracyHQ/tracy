/**
 * Each app window knows from its first line of preload whether it is the main window or a second
 * one: the main process puts it on the renderer's command line (`additionalArguments`).
 *
 *   node --test packages/desktop/tracy-desktop/test/window-role.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { windowRoleArgument, windowRoleOf } = require('../src/window-role.js')

test('the role the main process passes is the role the preload reads', () => {
  for (const role of ['primary', 'secondary'])
    assert.equal(windowRoleOf(['/x/Electron Helper', '--type=renderer', windowRoleArgument(role)]), role)
})

test('no role, or one the app does not know, is the main window: an older main process changes nothing', () => {
  assert.equal(windowRoleOf(['--type=renderer']), 'primary')
  assert.equal(windowRoleOf(['--tracy-window=floating']), 'primary')
  assert.equal(windowRoleOf(undefined), 'primary')
})

test('a role the main process is not written for is refused', () => {
  assert.throws(() => windowRoleArgument('floating'))
})
