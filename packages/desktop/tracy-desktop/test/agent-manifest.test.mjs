/**
 * Which command names stand for each agent id (`src/agent-manifest.js`). The table lives in the app,
 * not on the server (council 10/10/2026): the page names ids, never commands, so a script on the
 * page cannot probe the machine for arbitrary software.
 *
 *   node --test packages/desktop/tracy-desktop/test/agent-manifest.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { AGENT_MANIFEST, commandsFor } = require('../src/agent-manifest.js')

test('each id maps to the commands its CLI installs, the same on every platform', () => {
  assert.deepEqual(commandsFor('claude', 'darwin'), ['claude'])
  assert.deepEqual(commandsFor('codex', 'linux'), ['codex'])
  assert.deepEqual(commandsFor('cursor', 'win32'), ['cursor-agent'])
  assert.deepEqual(commandsFor('kiro', 'darwin'), ['kiro-cli'])
  assert.deepEqual(commandsFor('antigravity', 'darwin'), ['agy', 'gemini'])
  assert.deepEqual(commandsFor('glm', 'darwin'), [])
  for (const id of ['copilot', 'grok', 'kimi', 'qwen']) assert.deepEqual(commandsFor(id, 'linux'), [id])
})

test('an id the app does not know, or a platform it does not know, has no commands', () => {
  assert.equal(commandsFor('no-such-id', 'darwin'), null)
  assert.equal(commandsFor('toString', 'darwin'), null)
  assert.equal(commandsFor('__proto__', 'darwin'), null)
  assert.equal(commandsFor('claude', 'aix'), null)
})

test('every command is a bare lower-case name: no path, no argument, no shell syntax', () => {
  for (const [id, byPlatform] of Object.entries(AGENT_MANIFEST)) {
    assert.match(id, /^[a-z][a-z0-9-]*$/)
    for (const platform of ['darwin', 'linux', 'win32'])
      for (const name of byPlatform[platform]) assert.match(name, /^[a-z][a-z0-9-]*$/, `${id} ${name}`)
  }
})

test('the table cannot be changed at run time', () => {
  assert.ok(Object.isFrozen(AGENT_MANIFEST))
  assert.ok(Object.isFrozen(AGENT_MANIFEST.claude))
  assert.ok(Object.isFrozen(AGENT_MANIFEST.claude.darwin))
  // A caller mutating what it got back changes nothing for the next caller.
  const got = commandsFor('claude', 'darwin')
  got.push('evil')
  assert.deepEqual(commandsFor('claude', 'darwin'), ['claude'])
})
