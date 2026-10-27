/**
 * The microphone published for the Browser tab's comment boxes (`voice-bridge.mjs`): the global and the
 * event, either load order, a reload's disposer, and the fork's copy of the contract
 * (`vendor/tracy/dsh-better-sidebar/src/client/voice-bridge.ts`) naming the same key, event and version.
 *
 *   node --test packages/ui/tracy-chat-input/test/voice-bridge.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  publishVoiceInput,
  VOICE_BRIDGE_EVENT,
  VOICE_BRIDGE_KEY,
  VOICE_BRIDGE_VERSION
} from '../src/client/voice-bridge.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

/** A window as far as the bridge uses one. */
function page() {
  const target = new EventTarget()
  const said = []
  target.addEventListener(VOICE_BRIDGE_EVENT, () => said.push(target[VOICE_BRIDGE_KEY] ?? null))
  return { target, said }
}

test('published: the global holds version and component, then the event says so; taken back: removed, said again', () => {
  const { target, said } = page()
  const Mic = () => null
  const take = publishVoiceInput(Mic, target)
  assert.deepEqual({ ...target[VOICE_BRIDGE_KEY] }, { version: 1, Component: Mic })
  assert.ok(Object.isFrozen(target[VOICE_BRIDGE_KEY]))
  assert.equal(said.length, 1)
  assert.equal(said[0].Component, Mic, 'the global is set before the event, so a listener reads it')
  take()
  assert.equal(VOICE_BRIDGE_KEY in target, false)
  assert.deepEqual(said.slice(1), [null])
})

test('a box that looks before the plugin loads finds nothing, then hears the event', () => {
  const { target } = page()
  let seen = target[VOICE_BRIDGE_KEY] ?? null
  target.addEventListener(VOICE_BRIDGE_EVENT, () => {
    seen = target[VOICE_BRIDGE_KEY]?.Component ?? null
  })
  assert.equal(seen, null)
  const Mic = () => null
  publishVoiceInput(Mic, target)
  assert.equal(seen, Mic)
})

test('a reload publishes again: the older disposer does not take the newer one back', () => {
  const { target } = page()
  const old = publishVoiceInput(() => 'old', target)
  const Fresh = () => 'fresh'
  publishVoiceInput(Fresh, target)
  old()
  assert.equal(target[VOICE_BRIDGE_KEY].Component, Fresh)
})

test('the fork names the same key, event and version', () => {
  const fork = readFileSync(
    resolve(repo, 'vendor/tracy/dsh-better-sidebar/src/client/voice-bridge.ts'),
    'utf8'
  )
  const value = (name) => fork.match(new RegExp(`export const ${name} = ('[^']*'|\\d+)`))?.[1]
  assert.equal(value('VOICE_BRIDGE_KEY'), `'${VOICE_BRIDGE_KEY}'`)
  assert.equal(value('VOICE_BRIDGE_EVENT'), `'${VOICE_BRIDGE_EVENT}'`)
  assert.equal(value('VOICE_BRIDGE_VERSION'), String(VOICE_BRIDGE_VERSION))
})
