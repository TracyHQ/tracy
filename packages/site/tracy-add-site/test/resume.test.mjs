#!/usr/bin/env node
/**
 * A pointer so an unfinished site creation survives closing the tab.
 *
 * 🔒 STORE A POINTER, NOT CONTENT. What is written is `{siteKey, jobId, platform}` — three facts
 * enough to ask the server again. Writing progress here too would build a second copy of a changing
 * truth, and that copy would show up after reopening the tab as a screen frozen at the minute
 * it was closed. ADR 0088 §3 calls the reopenable console where the import branch is more mature than
 * create; what it reopens is the **question**, not the old answer.
 *
 * The work keeps running on the fleet even with nobody watching. Closing the tab only stops watching.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readPending, writePending, clearPending, PENDING_KEY } from '../src/client/resume.mjs'

/** A fake localStorage, right enough for the three operations the module uses. */
function fakeStore(seed = {}) {
  const data = { ...seed }
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value)
    },
    removeItem: (key) => {
      delete data[key]
    },
    /** For tests to inspect, not part of the localStorage contract. */
    raw: () => data
  }
}

test('writes then reads back', () => {
  const store = fakeStore()
  writePending(store, { siteKey: 'tiem-banh.tracy.ai', jobId: 'abc123', platform: 'joomla' })
  assert.deepEqual(readPending(store), {
    siteKey: 'tiem-banh.tracy.ai',
    jobId: 'abc123',
    platform: 'joomla'
  })
})

test('nothing stored returns null, not an empty object', () => {
  assert.equal(readPending(fakeStore()), null)
})

test('broken JSON reads as null rather than throwing', () => {
  // A localStorage key is data others can write. Throwing here blocks the whole tab.
  assert.equal(readPending(fakeStore({ [PENDING_KEY]: '{ broken' })), null)
})

test('a missing field counts as nothing — half a pointer cannot ask anything', () => {
  assert.equal(readPending(fakeStore({ [PENDING_KEY]: '{"siteKey":"a.tracy.ai"}' })), null)
  assert.equal(readPending(fakeStore({ [PENDING_KEY]: '{"jobId":"abc123"}' })), null)
})

test('a wrongly typed field is refused, not coerced to a string', () => {
  const bad = JSON.stringify({ siteKey: 'a.tracy.ai', jobId: 12345, platform: 'joomla' })
  assert.equal(readPending(fakeStore({ [PENDING_KEY]: bad })), null)
})

test('after clearing nothing is left', () => {
  const store = fakeStore()
  writePending(store, { siteKey: 'a.tracy.ai', jobId: 'abc123', platform: 'joomla' })
  clearPending(store)
  assert.equal(readPending(store), null)
})

test('no localStorage is borne silently, without bringing the tab down', () => {
  // dsh runs in an iframe on some surfaces, and a browser blocking third-party storage makes
  // `localStorage` throw the moment it is READ. Losing the ability to reopen the console is an inconvenience; losing the whole tab is not.
  assert.equal(readPending(null), null)
  assert.doesNotThrow(() => writePending(null, { siteKey: 'a', jobId: 'b', platform: 'joomla' }))
  assert.doesNotThrow(() => clearPending(null))
})

test('a store that throws does not bring the tab down either', () => {
  const hostile = {
    getItem() {
      throw new Error('blocked')
    },
    setItem() {
      throw new Error('blocked')
    },
    removeItem() {
      throw new Error('blocked')
    }
  }
  assert.equal(readPending(hostile), null)
  assert.doesNotThrow(() => writePending(hostile, { siteKey: 'a', jobId: 'b', platform: 'joomla' }))
  assert.doesNotThrow(() => clearPending(hostile))
})

// ── forkUrl extension ────────────────────────────────────────────────────────

test('fork branch: forkUrl round-trips through storage', () => {
  const store = fakeStore()
  writePending(store, {
    siteKey: 'new-site.tracy.ai',
    jobId: 'xyz789',
    platform: 'wordpress',
    forkUrl: 'https://www.joomlart.com/'
  })
  const result = readPending(store)
  assert.deepEqual(result, {
    siteKey: 'new-site.tracy.ai',
    jobId: 'xyz789',
    platform: 'wordpress',
    forkUrl: 'https://www.joomlart.com/'
  })
})

test('create branch: pointer without forkUrl reads back without the key', () => {
  const store = fakeStore()
  writePending(store, { siteKey: 'a.tracy.ai', jobId: 'abc123', platform: 'joomla' })
  const result = readPending(store)
  assert.ok(result !== null)
  assert.ok(!('forkUrl' in result))
})

test('a pointer with a non-string forkUrl drops the field silently', () => {
  // Treat stale or externally-written data gracefully.
  const bad = JSON.stringify({ siteKey: 'a.tracy.ai', jobId: 'abc', platform: 'wordpress', forkUrl: 42 })
  const result = readPending(fakeStore({ [PENDING_KEY]: bad }))
  assert.ok(result !== null)
  assert.ok(!('forkUrl' in result))
})

// 15/09: a new conversation's Add site tab reopened the build another conversation had started.
test('one pending build per conversation: a new session starts from an empty form', () => {
  const store = fakeStore()
  writePending(store, { siteKey: 'a.tracy.ai', jobId: 'job-a', platform: 'joomla' }, 'session-a')
  assert.equal(readPending(store, 'session-b'), null)
  assert.equal(readPending(store, 'session-a')?.jobId, 'job-a')
  clearPending(store, 'session-b')
  assert.equal(readPending(store, 'session-a')?.jobId, 'job-a', "clearing one session keeps another's")
})

// 15/09: a build whose conversation was not on screen stood still; the background poll reads them all.
test('allPending lists every conversation’s build, and the pre-session pointer too', async () => {
  const { allPending } = await import('../src/client/resume.mjs')
  const data = {}
  const store = {
    get length() {
      return Object.keys(data).length
    },
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v)
    },
    removeItem: (k) => {
      delete data[k]
    }
  }
  writePending(store, { siteKey: 'a.tracy.ai', jobId: 'job-a', platform: 'joomla' }, 'session-a')
  writePending(store, { siteKey: 'b.tracy.ai', jobId: 'job-b', platform: 'joomla' }, 'session-b')
  writePending(store, { siteKey: 'old.tracy.ai', jobId: 'job-old', platform: 'joomla' })
  data['something-else'] = 'x'
  assert.deepEqual(
    allPending(store)
      .map((p) => p.jobId)
      .sort(),
    ['job-a', 'job-b', 'job-old']
  )
  assert.deepEqual(allPending(null), [])
})

test('"Add another site" moves a build to its background slot: the conversation is free, the poll still sees it', async () => {
  const { allPending, backgroundKey } = await import('../src/client/resume.mjs')
  const data = {}
  const store = {
    get length() {
      return Object.keys(data).length
    },
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v)
    },
    removeItem: (k) => {
      delete data[k]
    }
  }
  const first = { siteKey: 'a.tracy.ai', jobId: 'job-a', platform: 'wordpress' }
  writePending(store, first, 'session-1')
  // What the wizard's button does.
  writePending(store, first, backgroundKey(first.jobId))
  clearPending(store, 'session-1')
  assert.equal(readPending(store, 'session-1'), null)
  writePending(store, { siteKey: 'b.tracy.ai', jobId: 'job-b', platform: 'wordpress' }, 'session-1')
  assert.deepEqual(
    allPending(store)
      .map((p) => p.jobId)
      .sort(),
    ['job-a', 'job-b']
  )
  // What the background poll does once job-a settles.
  clearPending(store, backgroundKey('job-a'))
  assert.deepEqual(
    allPending(store).map((p) => p.jobId),
    ['job-b']
  )
})

test('a site workspace finds its build under any key, and a settled build is forgotten under every key', async () => {
  const { pendingForSite, clearJob, backgroundKey } = await import('../src/client/resume.mjs')
  const data = {}
  const store = {
    get length() {
      return Object.keys(data).length
    },
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v)
    },
    removeItem: (k) => {
      delete data[k]
    }
  }
  const a = { siteKey: 'a.tracy.test', jobId: 'job-a', platform: 'wordpress' }
  const b = { siteKey: 'b.tracy.test', jobId: 'job-b', platform: 'joomla' }
  writePending(store, a, 'session-new')
  writePending(store, a, backgroundKey(a.jobId))
  writePending(store, b, backgroundKey(b.jobId))
  assert.equal(pendingForSite(store, 'a.tracy.test')?.jobId, 'job-a')
  assert.equal(pendingForSite(store, 'b.tracy.test')?.jobId, 'job-b')
  assert.equal(pendingForSite(store, 'c.tracy.test'), null)
  assert.equal(pendingForSite(store, null), null)
  clearJob(store, 'job-a')
  assert.equal(pendingForSite(store, 'a.tracy.test'), null)
  assert.deepEqual(Object.keys(data), [`tracy:add-site:pending:${backgroundKey('job-b')}`])
  clearJob(null, 'job-b')
})

test('a refresh keeps the milestones a build has passed, under every key that points at it', async () => {
  const { rememberSeen, pendingForSite, backgroundKey } = await import('../src/client/resume.mjs')
  const data = {}
  const store = {
    get length() {
      return Object.keys(data).length
    },
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v)
    },
    removeItem: (k) => {
      delete data[k]
    }
  }
  const a = { siteKey: 'a.tracy.test', jobId: 'job-a', platform: 'joomla' }
  const b = { siteKey: 'b.tracy.test', jobId: 'job-b', platform: 'joomla' }
  writePending(store, a, 'session-new')
  writePending(store, a, backgroundKey(a.jobId))
  writePending(store, b, 'session-other')
  rememberSeen(store, 'job-a', '\n> starting database\n> waiting for the joomla auto-install')
  assert.equal(
    readPending(store, 'session-new')?.seen,
    '\n> starting database\n> waiting for the joomla auto-install'
  )
  assert.equal(
    pendingForSite(store, 'a.tracy.test')?.seen,
    '\n> starting database\n> waiting for the joomla auto-install'
  )
  assert.equal(readPending(store, 'session-other')?.seen, undefined)
  rememberSeen(null, 'job-a', 'x')
})
