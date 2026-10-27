/**
 * A demo install does not start while the host is short of memory (12/10/2026, fleet01).
 *
 * At 19:26:40Z, with 54 MB available, the kernel OOM-killed mariadbd and live demos answered 500:
 * every demo added pushed another over. A demo provision that holds its slot now also waits until
 * MemAvailable is at least `demoInstallMinFreeMb`, and says so; a customer's provision never waits.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { installSlots, memAvailableMbOf, memoryStep } from '../src/install-slots.js'

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))

test('MemAvailable is read off /proc/meminfo text, in MB; text without it is null', () => {
  const meminfo = 'MemTotal:        4015936 kB\nMemFree:          120000 kB\nMemAvailable:      55296 kB\n'
  assert.equal(memAvailableMbOf(meminfo), 54)
  assert.equal(memAvailableMbOf('MemTotal: 1 kB\n'), null)
  assert.equal(memAvailableMbOf(''), null)
})

test('a demo install waits in its slot while memory is short, says how much there is, and starts when there is enough', async () => {
  let free = 54
  const steps = []
  const slots = installSlots(2, { minFreeMb: 600, memAvailableMb: async () => free, pollMs: 5 })
  let ran = false
  const done = slots.run(
    (ahead) => steps.push(`slot ${ahead}`),
    async () => {
      ran = true
    },
    { onMemory: (mb) => steps.push(memoryStep(mb, 600)) }
  )
  await tick(30)
  assert.equal(ran, false, 'nothing starts at 54 MB')
  assert.equal(steps.at(-1), 'waiting for free memory (54 MB available, 600 MB needed)')
  // While it waits for memory it keeps its slot: a second demo cannot start either.
  let second = false
  const other = slots.run(
    () => {},
    async () => {
      second = true
    },
    { onMemory: () => {} }
  )
  await tick(30)
  assert.equal(second, false)
  free = 900
  await done
  await other
  assert.equal(ran, true)
  assert.equal(second, true)
})

test('no reading of memory (no /proc on this machine) never holds an install back', async () => {
  const slots = installSlots(1, { minFreeMb: 600, memAvailableMb: async () => null, pollMs: 5 })
  let ran = false
  await slots.run(
    () => {},
    async () => {
      ran = true
    },
    { onMemory: () => assert.fail('no memory step without a reading') }
  )
  assert.equal(ran, true)
})

test('a floor of 0 turns the gate off', async () => {
  const slots = installSlots(1, { minFreeMb: 0, memAvailableMb: async () => 1, pollMs: 5 })
  let ran = false
  await slots.run(
    () => {},
    async () => {
      ran = true
    }
  )
  assert.equal(ran, true)
})
