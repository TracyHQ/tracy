// The voice switch as running sessions watch it (`src/lib/speech-switch.js`): one read per
// `freshMs` for every session of a process, and a failed read keeps the last value read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { switchWatch } from '../src/lib/speech-switch.js'

test('every session asking within freshMs shares one read; a later ask reads again', async () => {
  let clock = 1000
  let reads = 0
  const watch = switchWatch(
    async () => {
      reads += 1
      return true
    },
    { freshMs: 3000, now: () => clock }
  )
  assert.deepEqual(await Promise.all([watch(), watch(), watch()]), [true, true, true])
  assert.equal(reads, 1, 'concurrent askers share one read')
  clock += 2999
  assert.equal(await watch(), true)
  assert.equal(reads, 1)
  clock += 1
  assert.equal(await watch(), true)
  assert.equal(reads, 2)
})

test('a failed read keeps the last value read, and is tried again after freshMs', async () => {
  let clock = 0
  let answer = true
  const watch = switchWatch(
    async () => {
      if (answer instanceof Error) throw answer
      return answer
    },
    { freshMs: 100, now: () => clock }
  )
  answer = new Error('database down')
  assert.equal(await watch(), null, 'never read: unknown, not off')
  clock += 100
  answer = true
  assert.equal(await watch(), true)
  clock += 100
  answer = new Error('database down')
  assert.equal(await watch(), true, 'unreadable is not off')
  clock += 100
  answer = false
  assert.equal(await watch(), false, 'off, once it can be read, is off')
})

test('a read that throws before it is a promise is still caught', async () => {
  const watch = switchWatch(
    () => {
      throw new Error('no pool')
    },
    { freshMs: 0 }
  )
  assert.equal(await watch(), null)
  assert.equal(await watch(), null)
})
