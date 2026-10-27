/**
 * `tracy:comment-send` v4 (stage 6, `tasks/evidence/comment-people/attachments-contract.md` §A–§B): v3
 * plus `attachments: File[]` at the root. The chat goes dsh's own attachment path — never a hand-built
 * `content`: the limits first (image ≤ 20 MiB, ≤ 20 images, any other file ≤ 20 MiB), then
 * `conversation.createDrafts(sessionId, files)`, then it waits until every non-image draft is `ready`
 * in `conversation.fileUploads`, then `sendSession(session, text, draftIds, mode)`. Over a limit →
 * `attachment-too-large`; an upload that fails → `attachment-failed`; either way nothing is sent.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FAILED_EVENT, listenForComments, SEND_EVENT, SENT_EVENT } from '../src/client/comment-send.mjs'

const SITE = 'northgate.tracy.site'
const SESSION = 'session-4'
const MiB = 1024 * 1024
const ELEMENT = { url: 'https://northgate.tracy.site/', selector: 'h1', label: 'Heading', text: 'Welcome' }
const LEE = { accountId: 'a-lee', email: 'lee@example.com', name: 'Lee', initial: 'L' }

/** A `File` of `size` bytes without allocating them (the checks read `size` and `type` only). */
function fileOf(name, type, size = 10) {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

/** A minimal snapshot store, the shape of dsh's `createSnapshotStore`. */
function store(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    set(next) {
      value = next
      for (const fn of listeners) fn()
    }
  }
}

/**
 * dsh's conversation service as far as the listener calls it. Images become image drafts with no
 * upload; every other file an `uploading` entry that the test settles with `finish(name, status)`.
 */
function fakeConversation() {
  const fileUploads = store({})
  const drafts = []
  const released = []
  const sends = []
  const created = []
  return {
    fileUploads,
    drafts,
    released,
    sends,
    created,
    createDrafts(sessionId, files) {
      created.push({ sessionId, names: files.map((f) => f.name) })
      const batch = created.length
      return files.map((file, i) => {
        const id = `draft-${batch}-${i}`
        const kind = file.type.startsWith('image/') ? 'image' : 'file'
        drafts.push({ id, kind, file })
        if (kind === 'file')
          fileUploads.set({ ...fileUploads.getSnapshot(), [id]: { status: 'uploading', loaded: 0 } })
        return { id, kind, file }
      })
    },
    releaseDraftAttachments(list) {
      for (const a of list) released.push(a.id)
    },
    finish(name, status) {
      const draft = drafts.find((d) => d.file.name === name)
      fileUploads.set({
        ...fileUploads.getSnapshot(),
        [draft.id]:
          status === 'ready' ? { status, receiptId: `r-${name}`, file: {} } : { status, message: 'boom' }
      })
    },
    async sendSession(...args) {
      sends.push(args)
      return { kind: 'success' }
    }
  }
}

function world({ subagent = null } = {}) {
  const target = new EventTarget()
  const replies = []
  for (const type of [SENT_EVENT, FAILED_EVENT])
    target.addEventListener(type, (e) => replies.push({ type, detail: e.detail }))
  const session = { getSnapshot: () => ({ running: false, subagent, removed: false }) }
  const conversation = fakeConversation()
  listenForComments({
    target,
    sessions: { binding: (id) => (id === SESSION ? { session } : undefined) },
    conversation,
    siteKey: () => SITE
  })
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
  const send = async (d) => {
    target.dispatchEvent(new CustomEvent(SEND_EVENT, { detail: d }))
    await tick()
  }
  return { replies, conversation, send, tick }
}

const v4 = (attachments, overrides = {}) => ({
  v: 4,
  sessionId: SESSION,
  requestId: 'req-v4',
  siteKey: SITE,
  items: [{ n: 7, url: ELEMENT.url, element: ELEMENT, text: 'Use this photo in the hero.', author: LEE }],
  attachments,
  ...overrides
})

test('v4 with an image only: drafts are made and sendSession gets their ids at once', async () => {
  const w = world()
  const photo = fileOf('hero.png', 'image/png', 2 * MiB)
  await w.send(v4([photo]))
  assert.deepEqual(w.conversation.created, [{ sessionId: SESSION, names: ['hero.png'] }])
  assert.equal(w.conversation.sends.length, 1)
  const [, text, ids, mode] = w.conversation.sends[0]
  assert.match(text, /^Use this photo in the hero\.\n\n```tracy-element\n<mentioned-element n="7" /)
  assert.deepEqual(ids, ['draft-1-0'])
  assert.equal(mode, 'queue')
  assert.deepEqual(w.replies, [
    { type: SENT_EVENT, detail: { requestId: 'req-v4', sessionId: SESSION, queued: false } }
  ])
})

test('v4 with a file: nothing is sent until its upload is ready, then the ids go in order', async () => {
  const w = world()
  await w.send(v4([fileOf('brief.pdf', 'application/pdf', 3 * MiB), fileOf('logo.webp', 'image/webp')]))
  assert.equal(w.conversation.sends.length, 0, 'the PDF is still uploading')
  assert.deepEqual(w.replies, [])
  w.conversation.finish('brief.pdf', 'ready')
  await w.tick()
  assert.equal(w.conversation.sends.length, 1)
  assert.deepEqual(w.conversation.sends[0][2], ['draft-1-0', 'draft-1-1'])
  assert.equal(w.replies[0].type, SENT_EVENT)
})

test('v4: an upload that fails answers attachment-failed, sends nothing, and releases the drafts', async () => {
  const w = world()
  await w.send(
    v4([fileOf('brief.pdf', 'application/pdf'), fileOf('a.png', 'image/png')], { requestId: 'req-fail' })
  )
  w.conversation.finish('brief.pdf', 'error')
  await w.tick()
  assert.equal(w.conversation.sends.length, 0)
  assert.deepEqual(w.replies, [
    { type: FAILED_EVENT, detail: { requestId: 'req-fail', code: 'attachment-failed' } }
  ])
  assert.deepEqual(w.conversation.released.sort(), ['draft-1-0', 'draft-1-1'])
})

test('v4: over a limit answers attachment-too-large before any draft is made', async () => {
  const cases = [
    ['big-image', [fileOf('huge.jpg', 'image/jpeg', 20 * MiB + 1)]],
    ['big-file', [fileOf('huge.zip', 'application/zip', 20 * MiB + 1)]],
    ['many-images', Array.from({ length: 21 }, (_, i) => fileOf(`p${i}.png`, 'image/png'))]
  ]
  for (const [requestId, files] of cases) {
    const w = world()
    await w.send(v4(files, { requestId }))
    assert.deepEqual(w.conversation.created, [], requestId)
    assert.equal(w.conversation.sends.length, 0, requestId)
    assert.deepEqual(
      w.replies,
      [{ type: FAILED_EVENT, detail: { requestId, code: 'attachment-too-large' } }],
      requestId
    )
  }
  // At the ceiling is fine: twenty small images and a file of exactly 20 MiB go through.
  const w = world()
  await w.send(
    v4(
      [
        ...Array.from({ length: 20 }, (_, i) => fileOf(`p${i}.png`, 'image/png')),
        fileOf('b.pdf', 'application/pdf', 20 * MiB)
      ],
      { requestId: 'edge' }
    )
  )
  assert.equal(w.conversation.created.length, 1)
})

test('v4: images over 200 MiB in all are refused (dsh composer ceiling per message)', async () => {
  const w = world()
  await w.send(
    v4(
      Array.from({ length: 11 }, (_, i) => fileOf(`p${i}.png`, 'image/png', 19 * MiB)),
      { requestId: 'sum' }
    )
  )
  assert.deepEqual(w.replies, [
    { type: FAILED_EVENT, detail: { requestId: 'sum', code: 'attachment-too-large' } }
  ])
})

test('v4: attachments that are not a list of files, or an empty list, are rejected', async () => {
  for (const [requestId, attachments] of [
    ['not-list', 'hero.png'],
    ['not-file', [{ name: 'hero.png' }]],
    ['empty', []]
  ]) {
    const w = world()
    await w.send(v4(attachments, { requestId }))
    assert.deepEqual(w.replies, [{ type: FAILED_EVENT, detail: { requestId, code: 'rejected' } }], requestId)
    assert.deepEqual(w.conversation.created, [])
  }
})

test('v4 to a subagent session answers subagent-readonly and makes no draft', async () => {
  const w = world({ subagent: { parent: 'x' } })
  await w.send(v4([fileOf('a.png', 'image/png')], { requestId: 'sub' }))
  assert.deepEqual(w.replies, [
    { type: FAILED_EVENT, detail: { requestId: 'sub', code: 'subagent-readonly' } }
  ])
  assert.deepEqual(w.conversation.created, [])
})

test('v3 is unchanged: no drafts, sendSession gets []; attachments on a v3 are ignored', async () => {
  const w = world()
  const { attachments: _drop, ...rest } = v4([fileOf('a.png', 'image/png')], { v: 3, requestId: 'v3' })
  await w.send({ ...rest, attachments: [fileOf('a.png', 'image/png')] })
  assert.deepEqual(w.conversation.created, [])
  assert.deepEqual(w.conversation.sends[0][2], [])
  assert.equal(w.replies[0].type, SENT_EVENT)
})
