/**
 * The device-code poll on its own (`src/client/device-sign-in.ts` `waitForDevice`): it asks
 * `connect/complete` until the vendor confirms, and a moment where tracy-web does not answer (a
 * deploy restarting the web container, the network) does not end the attempt, which still lives on
 * the server. The clock is injected: `sleep` records each wait and moves `now`.
 *
 *   node --test packages/ui/tracy-model-plan/test/device-sign-in.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-model-plan-device-'))
  const outfile = path.join(outDir, 'device.cjs')
  await require('esbuild').build({
    entryPoints: [path.join(here, '..', 'src', 'client', 'device-sign-in.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const ATTEMPT = {
  provider: 'codex',
  attemptId: 'a1',
  state: 'st',
  userCode: 'WXYZ-9876',
  authorizeUrl: 'https://auth.openai.com/codex/device',
  intervalMs: 5000
}
const STATUS = { connections: [{ connectionId: 'k1', provider: 'codex' }] }

/** A clock that starts at the real time, so a shifted clock (+400 days) changes nothing. */
function clock() {
  let now = Date.now()
  const waits = []
  return {
    waits,
    sleep: async (ms) => {
      waits.push(ms)
      now += ms
    },
    now: () => now
  }
}

/** `connect/complete` answering from a list: an Error is thrown, anything else returned. */
function answers(list) {
  const calls = []
  const complete = async (body) => {
    calls.push(body)
    const next = list.length > 1 ? list.shift() : list[0]
    if (next instanceof Error) throw next
    return next
  }
  return { complete, calls }
}

const transient = () => new lib.TransientError('unavailable')

test('a poll the server did not answer is asked again: pending, transient, transient, then the status', async () => {
  const c = clock()
  const seen = []
  const { complete, calls } = answers([{ pending: true }, transient(), transient(), STATUS])
  const status = await lib.waitForDevice(ATTEMPT, complete, new AbortController().signal, {
    ...c,
    onTransient: (failing) => seen.push(failing)
  })
  assert.deepEqual(status, STATUS)
  assert.equal(calls.length, 4)
  assert.deepEqual(c.waits, [5000, 5000, 5000, 10000])
  assert.deepEqual(seen, [true, true, false], 'told of each failure, then once that answers came back')
})

test('the wait doubles per failure in a row from 5 s, never past 30 s, and falls back once an answer comes', async () => {
  const c = clock()
  const { complete } = answers([
    transient(),
    transient(),
    transient(),
    transient(),
    transient(),
    { pending: true },
    STATUS
  ])
  await lib.waitForDevice({ ...ATTEMPT, intervalMs: 0 }, complete, new AbortController().signal, c)
  assert.deepEqual(c.waits, [2000, 5000, 10000, 20000, 30000, 30000, 2000])
})

test('a network failure of the call itself (fetch rejected) is asked again too', async () => {
  const c = clock()
  const { complete } = answers([new lib.TransientError('network'), STATUS])
  assert.deepEqual(await lib.waitForDevice(ATTEMPT, complete, new AbortController().signal, c), STATUS)
})

test('a refusal that is not transient still ends the attempt with its message', async () => {
  const c = clock()
  const { complete, calls } = answers([transient(), new Error('The sign-in could not be completed.')])
  await assert.rejects(
    lib.waitForDevice(ATTEMPT, complete, new AbortController().signal, c),
    /The sign-in could not be completed\./
  )
  assert.equal(calls.length, 2)
})

test('Cancel during the failures still stops: no more polls, the wait rejects with the reason', async () => {
  const stop = new AbortController()
  const c = clock()
  let polls = 0
  const complete = async () => {
    polls += 1
    if (polls === 2) stop.abort(new Error('cancelled'))
    throw transient()
  }
  await assert.rejects(lib.waitForDevice(ATTEMPT, complete, stop.signal, c), /cancelled/)
  assert.equal(polls, 2)
})

test('failures that last past the ten minutes end the attempt as a timeout', async () => {
  const c = clock()
  let polls = 0
  const complete = async () => {
    polls += 1
    throw transient()
  }
  await assert.rejects(
    lib.waitForDevice(ATTEMPT, complete, new AbortController().signal, c),
    lib.DeviceTimeout
  )
  const waited = c.waits.reduce((a, b) => a + b, 0)
  assert.ok(waited >= lib.DEVICE_LIMIT_MS, `waited ${waited}`)
  assert.ok(waited < lib.DEVICE_LIMIT_MS + 30_000, 'stops at the first wake past the limit')
  assert.ok(polls < 30, `asked ${polls} times`)
})
