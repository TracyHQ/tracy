/**
 * When the rebuilding lock is taken (#189, COO rule: a visitor never sees the template demo): the moment the site is up
 * and its door exists, while the words are still being made, not after them before the first write (R12, 30/10/2026: the
 * raw demo was served for the three minutes of provisioning and planning). A lock the early try cannot take is tried once
 * more before the first write. Fictional businesses of two trades; the engine and the lock are doubles.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createBriefBuilds } from '../src/sites/brief-build.js'
import { briefOf } from '../src/sites/brief-store.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const TRADES = [
  { trade: 'bike repair shop', siteKey: 'harbour-bikes.tracy.test', label: 'harbour-bikes' },
  { trade: 'pottery studio', siteKey: 'juniper-pottery.tracy.test', label: 'juniper-pottery' }
]

const until = async (ok, tries = 400) => {
  for (let i = 0; i < tries; i += 1) {
    if (ok()) return true
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return false
}

/** An engine whose words are ready only when the test says so, and a lock double that records each try. */
function world({ holdsFirst = true } = {}) {
  let release
  const wordsReady = new Promise((resolve) => {
    release = resolve
  })
  const events = []
  const engine = {
    prepare: async () => {
      await wordsReady
      events.push('prepared')
      return { values: 2 }
    },
    apply: async () => {
      events.push('applied')
      return { wrote: 2, kept: 0 }
    }
  }
  let tries = 0
  const siteLock = {
    lock: async () => {
      tries += 1
      if (!holdsFirst && tries === 1) {
        events.push('lock-not-held')
        return null
      }
      events.push('locked')
      return { version: 1, state: 'locked' }
    }
  }
  return { engine, siteLock, events, release: () => release() }
}

const builds = (engine, siteLock) =>
  createBriefBuilds({
    pool: db.pool,
    engines: { joomla: engine },
    normalize: async () => ({ name: 'Studio', languages: ['en'] }),
    log: { info() {}, warn() {} },
    sleep: () => new Promise((resolve) => setTimeout(resolve, 1)),
    pollMs: 1,
    recoverOnStart: false,
    siteLock
  })

const input = (siteKey, label, trade) => ({
  siteKey,
  accountId: null,
  email: 'owner@example.test',
  label,
  platform: 'joomla',
  quickstart: 'fixture/j6',
  brief: { about: `A fictional ${trade}.` }
})

for (const { trade, siteKey, label } of TRADES) {
  test(
    `${trade}: the site is locked as soon as it is up, while its words are still being made`,
    opts,
    async () => {
      const w = world()
      const b = builds(w.engine, w.siteLock)
      await b.start(input(siteKey, label, trade))
      await b.gate(siteKey) // the host says the site is up
      assert.equal(await until(() => w.events.includes('locked')), true, 'locked before the words were ready')
      assert.equal(w.events.includes('prepared'), false)
      w.release()
      await b.idle()
      assert.deepEqual(
        w.events,
        ['locked', 'prepared', 'applied'],
        'locked once, before the words and the writes'
      )
      const row = await briefOf(db.pool, siteKey)
      assert.equal(row.timings.siteLock.state, 'locked')
    }
  )

  test(`${trade}: a lock the early try could not take is taken before the first write`, opts, async () => {
    const w = world({ holdsFirst: false })
    const b = builds(w.engine, w.siteLock)
    await b.start(input(siteKey, label, trade))
    await b.gate(siteKey)
    await until(() => w.events.includes('lock-not-held'))
    w.release()
    await b.idle()
    assert.deepEqual(w.events, ['lock-not-held', 'prepared', 'locked', 'applied'])
  })
}
