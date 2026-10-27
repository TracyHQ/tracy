import test from 'node:test'
import assert from 'node:assert/strict'
import {
  prepareNativeHandoff,
  finishNativeHandoff,
  nativeImportedContext
} from '../src/widget/native-handoff.js'

const owner = '11111111-1111-4111-8111-111111111111'
function fixture() {
  const visitor = {
    id: 'visitor-a',
    ownerId: owner,
    expires: 2000,
    revision: 4,
    history: [
      { role: 'user', text: 'Build a bakery website' },
      { role: 'assistant', text: 'Which city?' }
    ],
    brief: { name: 'Bakery', about: 'Bread', goal: 'sell', platform: 'wordpress' },
    selectedTemplate: 'bakery',
    selectedSystem: 'warm',
    visibleTemplates: ['bakery'],
    authCookie: 'private-cookie',
    authEmail: 'private@example.test',
    otp: '654321',
    clientPending: { voiceDraft: 'uncertain command' },
    inflight: { kind: 'create' },
    build: { siteKey: 'private.test', jobId: 'job' }
  }
  return {
    visitor,
    identity: { visitorId: visitor.id, ownerAccountId: owner, expectedRevision: 4, now: 1000 }
  }
}

test('import preserves admitted history and choices, without transient commands or credentials', () => {
  const { visitor } = fixture()
  const value = nativeImportedContext(visitor)
  assert.deepEqual(value.history, visitor.history)
  assert.equal(value.brief.name, 'Bakery')
  assert.equal(value.selection.template, 'bakery')
  assert.equal(value.source, 'widget-discovery')
  for (const forbidden of [
    'private-cookie',
    'private@example.test',
    '654321',
    'uncertain command',
    'private.test'
  ])
    assert.equal(JSON.stringify(value).includes(forbidden), false)
  value.history[0].text = 'changed'
  assert.equal(visitor.history[0].text, 'Build a bakery website')
})

test('anonymous, different account/visitor, expired and locked contexts cannot be adopted', () => {
  for (const patch of [
    { ownerId: null },
    { ownerId: '22222222-2222-4222-8222-222222222222' },
    { id: 'visitor-b' },
    { expires: 1000 },
    { locked: true }
  ]) {
    const { visitor, identity } = fixture()
    assert.throws(() => prepareNativeHandoff({ ...visitor, ...patch }, identity), /IDENTITY_INVALID/)
  }
})

test('stale revision refuses before allocating a session', () => {
  const { visitor, identity } = fixture()
  assert.throws(
    () => prepareNativeHandoff(visitor, { ...identity, expectedRevision: 3 }),
    /REVISION_CONFLICT/
  )
})

test('persisted preparing mapping survives retries and becomes ready only for its exact session', () => {
  const { visitor, identity } = fixture()
  visitor.sessionId = 'session-client-controlled'
  visitor.nativeHandoff = prepareNativeHandoff(visitor, identity)
  assert.notEqual(visitor.nativeHandoff.sessionId, visitor.sessionId)
  visitor.revision++
  identity.expectedRevision++
  assert.deepEqual(prepareNativeHandoff(visitor, identity), visitor.nativeHandoff)
  assert.throws(
    () => finishNativeHandoff(visitor, identity, { sessionId: 'another', workspaceId: 'ws' }),
    /RESULT_INVALID/
  )
  const native = { sessionId: visitor.nativeHandoff.sessionId, workspaceId: 'ws-verified' }
  visitor.nativeHandoff = finishNativeHandoff(visitor, identity, native)
  assert.equal(visitor.nativeHandoff.state, 'ready')
  assert.deepEqual(finishNativeHandoff(visitor, identity, native), visitor.nativeHandoff)
  assert.throws(
    () => finishNativeHandoff(visitor, identity, { ...native, workspaceId: 'another' }),
    /RESULT_INVALID/
  )
})

test('changed context or transplanted mapping cannot silently replace imported history', () => {
  const { visitor, identity } = fixture()
  visitor.nativeHandoff = prepareNativeHandoff(visitor, identity)
  const original = structuredClone(visitor.nativeHandoff)
  visitor.history.push({ role: 'user', text: 'A different brief' })
  assert.throws(() => prepareNativeHandoff(visitor, identity), /CONTEXT_CHANGED/)
  visitor.history.pop()
  visitor.nativeHandoff.ownerAccountId = '22222222-2222-4222-8222-222222222222'
  assert.throws(() => prepareNativeHandoff(visitor, identity), /MAPPING_INVALID/)
  visitor.nativeHandoff = original
  visitor.nativeHandoff.context.authCookie = 'smuggled'
  assert.throws(() => prepareNativeHandoff(visitor, identity), /MAPPING_INVALID/)
})
