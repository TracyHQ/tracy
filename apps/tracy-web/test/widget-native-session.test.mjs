import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INFLIGHT_STALE_MS, nativeSessions } from '../src/widget/native-session.js'

const owner = '00000000-0000-4000-8000-000000000001'
const fresh = () => ({
  id: 'own-visitor',
  ownerId: owner,
  revision: 1,
  expires: Date.now() + 60000,
  history: [{ role: 'user', text: 'A small portfolio.' }],
  brief: { platform: 'wordpress' }
})

test('prepare is durable before native allocation; refresh does not duplicate sessions or prompts', async () => {
  const visitor = fresh(),
    calls = [],
    writes = []
  const sessions = nativeSessions({
    save: async (v) => {
      writes.push(structuredClone(v.nativeHandoff))
      v.revision++
    },
    mintNative: async (request) => {
      assert.equal(writes[0].state, 'preparing')
      calls.push(request)
      return { workspaceId: 'own-workspace', sessionId: request.sessionId }
    }
  })
  const ready = await sessions.open(visitor, 'own@example.test')
  assert.equal(ready.state, 'ready')
  assert.equal(writes.length, 2)
  assert.equal(calls[0].sessionId, writes[0].sessionId)
  assert.equal(calls[0].email, 'own@example.test')
  assert.deepEqual(await sessions.open(visitor, 'own@example.test'), ready)
  assert.equal(calls.length, 1)
  assert.equal(writes.length, 2)
})

test('CAS refusal creates nothing; ambiguous native timeout retries only the persisted session identity', async () => {
  const visitor = fresh()
  let minted = 0
  const refused = nativeSessions({
    save: async () => {
      throw Error('CAS_CONFLICT')
    },
    mintNative: async () => {
      minted++
      return null
    }
  })
  await assert.rejects(refused.open(visitor, 'own@example.test'), /CAS_CONFLICT/)
  assert.equal(minted, 0)
  const v = fresh(),
    ids = []
  let attempt = 0
  const sessions = nativeSessions({
    save: async (v) => {
      v.revision++
    },
    mintNative: async (request) => {
      ids.push(request.sessionId)
      return ++attempt === 1 ? null : { sessionId: request.sessionId, workspaceId: 'own-workspace' }
    }
  })
  await assert.rejects(sessions.open(v, 'own@example.test'), /SESSION_UNAVAILABLE/)
  assert.equal(v.nativeHandoff.state, 'preparing')
  await sessions.open(v, 'own@example.test')
  assert.equal(ids[0], ids[1])
})

test('anonymous or unsettled discovery cannot open native and unavailable seats remain actionable', async () => {
  let calls = 0
  const sessions = nativeSessions({
    save: async (v) => {
      v.revision++
    },
    mintNative: async () => {
      calls++
      return null
    }
  })
  await assert.rejects(sessions.open(fresh(), ''), /SIGN_IN_REQUIRED/)
  await assert.rejects(
    sessions.open({ ...fresh(), inflight: { kind: 'turn', at: Date.now() } }, 'own@example.test'),
    /WAIT_FOR_TURN/
  )
  await assert.rejects(
    sessions.open({ ...fresh(), inflight: { kind: 'create', at: Date.now() } }, 'own@example.test'),
    /WAIT_FOR_TURN/
  )
  await assert.rejects(sessions.open({ ...fresh(), busy: true }, 'own@example.test'), /WAIT_FOR_TURN/)
  assert.equal(calls, 0)
  await assert.rejects(sessions.open(fresh(), 'own@example.test'), /SESSION_UNAVAILABLE/)
})

test('a turn left by a restart mid-run stops blocking once no run could still be going', async () => {
  const minted = []
  const sessions = nativeSessions({
    save: async (v) => {
      v.revision++
    },
    mintNative: async (request) => {
      minted.push(request.sessionId)
      return { sessionId: request.sessionId, workspaceId: 'own-workspace' }
    }
  })
  // Stored before the restart: older than any turn can run, or written before turns had a start time.
  for (const inflight of [
    { kind: 'turn', message: 'Uncertain words', at: Date.now() - INFLIGHT_STALE_MS - 1 },
    { kind: 'turn', message: 'Uncertain words' }
  ]) {
    const visitor = {
      ...fresh(),
      inflight,
      clientPending: { pendingDraft: 'Earlier failed words', voiceDraft: '' }
    }
    const ready = await sessions.open(visitor, 'own@example.test')
    assert.equal(ready.state, 'ready')
    // Handed to the native composer by the page; not offered again by the discovery state.
    assert.equal(visitor.inflight, null)
    assert.deepEqual(visitor.clientPending, { pendingDraft: '', voiceDraft: '' })
  }
  assert.equal(minted.length, 2)
})
