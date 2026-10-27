// Which microphone dictation and Voice listen on (`src/client/voice-mic.mjs`): what the menu lists,
// how the browser is asked, what is kept, and that listing never asks for the microphone itself.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  audioConstraints,
  createMicPicker,
  fellBack,
  MIC_PICK_KEY,
  micChoices,
  readMicPick,
  writeMicPick
} from '../src/client/voice-mic.mjs'

const settle = () => new Promise((resolve) => setImmediate(resolve))

/** A browser's `localStorage`, or one that throws on every touch (blocked site data). */
function storage({ throws = false } = {}) {
  const kept = new Map()
  const guard = () => {
    if (throws) throw new Error('SecurityError')
  }
  return {
    kept,
    getItem: (key) => (guard(), kept.get(key) ?? null),
    setItem: (key, value) => (guard(), void kept.set(key, value)),
    removeItem: (key) => (guard(), void kept.delete(key))
  }
}

const mic = (deviceId, label) => ({ kind: 'audioinput', deviceId, label })

test('the menu lists the microphones the browser names, each once; unnamed ones (no permission yet) and the system’s own entries are left out', () => {
  assert.deepEqual(
    micChoices([
      mic('default', 'Default - MacBook Pro Microphone'),
      mic('communications', 'Communications - Headset'),
      mic('a1', 'MacBook Pro Microphone (Built-in)'),
      { kind: 'audiooutput', deviceId: 'o1', label: 'Speakers' },
      { kind: 'videoinput', deviceId: 'v1', label: 'FaceTime HD Camera' },
      mic('b2', '  AirPods Pro  '),
      mic('a1', 'MacBook Pro Microphone (Built-in)')
    ]),
    [
      { id: 'a1', label: 'MacBook Pro Microphone (Built-in)' },
      { id: 'b2', label: 'AirPods Pro' }
    ]
  )
  // Before the page may use the microphone the browser gives no names (Chrome: no ids either).
  assert.deepEqual(micChoices([mic('', ''), mic('x', '')]), [])
  assert.deepEqual(micChoices(null), [])
})

test('the picked microphone is asked as ideal, so one unplugged since falls back to the default; the default asks for none', () => {
  assert.deepEqual(audioConstraints('a1'), {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    deviceId: { ideal: 'a1' }
  })
  for (const none of ['', null, undefined]) assert.equal('deviceId' in audioConstraints(none), false)
  assert.equal(fellBack('a1', 'default-device'), true, 'another device opened: said')
  assert.equal(fellBack('a1', 'a1'), false)
  assert.equal(fellBack('', 'anything'), false, 'the default asked: nothing to fall back from')
  assert.equal(fellBack('a1', undefined), false, 'a browser that does not say: nothing to tell')
})

test('the pick is kept in this browser, and a browser that keeps nothing uses the default', () => {
  const store = storage()
  assert.equal(readMicPick(store), '')
  writeMicPick(store, 'b2')
  assert.equal(store.kept.get(MIC_PICK_KEY), 'b2')
  assert.equal(readMicPick(store), 'b2')
  writeMicPick(store, '')
  assert.equal(store.kept.has(MIC_PICK_KEY), false, 'the default is no entry')
  const blocked = storage({ throws: true })
  assert.equal(readMicPick(blocked), '')
  assert.doesNotThrow(() => writeMicPick(blocked, 'b2'))
  assert.equal(readMicPick(null), '')
})

test('the picker reads the list when watched and again when devices change; it only lists, never asks for the microphone', async () => {
  let devices = [mic('a1', 'Built-in')]
  const listeners = new Map()
  let enumerations = 0
  const mediaDevices = {
    enumerateDevices: async () => {
      enumerations += 1
      return devices
    },
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    getUserMedia: () => assert.fail('listing never asks for the microphone')
  }
  const store = storage()
  store.setItem(MIC_PICK_KEY, 'b2')
  const picker = createMicPicker({ mediaDevices, storage: store })
  assert.equal(picker.current(), 'b2', 'the kept pick, even while it is not listed')
  let changes = 0
  const stop = picker.subscribe(() => {
    changes += 1
  })
  await settle()
  assert.deepEqual(picker.getSnapshot().choices, [{ id: 'a1', label: 'Built-in' }])
  // A headset plugged in.
  devices = [mic('a1', 'Built-in'), mic('b2', 'Headset')]
  listeners.get('devicechange')()
  await settle()
  assert.deepEqual(
    picker.getSnapshot().choices.map((c) => c.id),
    ['a1', 'b2']
  )
  assert.equal(changes, 2)
  // Read again with nothing new: no change told.
  await picker.refresh()
  assert.equal(changes, 2)
  assert.equal(picker.choose('a1'), true)
  assert.equal(store.getItem(MIC_PICK_KEY), 'a1')
  assert.equal(picker.choose('a1'), false, 'the one picked already: nothing to restart')
  assert.equal(picker.choose(''), true)
  assert.equal(picker.current(), '')
  stop()
  assert.equal(listeners.has('devicechange'), false, 'no one watching: the browser is not listened to')
  assert.ok(enumerations >= 2)
})

test('a browser without device listing: only the system default, and nothing breaks', async () => {
  const picker = createMicPicker({ mediaDevices: null, storage: null })
  const stop = picker.subscribe(() => {})
  await picker.refresh()
  assert.deepEqual(picker.getSnapshot(), { choices: [], pick: '' })
  stop()
})
