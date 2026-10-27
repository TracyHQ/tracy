// Files in the creation screen's chat box (`files.ts`): the rules said before sending, the upload, and
// the page global Add site reads.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CHAT_FILES_EVENT,
  CHAT_FILES_KEY,
  MAX_FILE_BYTES,
  problemOf,
  problemOfAnswer,
  publishChatFiles,
  uploadFile
} from '../src/client/files.ts'

test('the chat box refuses a file the door would refuse, before sending it', () => {
  assert.equal(problemOf({ name: 'logo.PNG', size: 10 }), null)
  assert.equal(problemOf({ name: 'menu.pdf', size: 10 }), null)
  assert.equal(problemOf({ name: 'page.html', size: 10 }), 'file.type')
  assert.equal(problemOf({ name: 'logo.svg', size: 10 }), 'file.type')
  assert.equal(problemOf({ name: 'big.pdf', size: MAX_FILE_BYTES + 1 }), 'file.tooLarge')
  assert.equal(problemOf({ name: 'empty.txt', size: 0 }), 'file.failed')
})

test("a refusal from the door reads as the chat box's own line", () => {
  assert.equal(problemOfAnswer(413, 'FILE_TOO_LARGE'), 'file.tooLarge')
  assert.equal(problemOfAnswer(415, 'FILE_TYPE'), 'file.type')
  assert.equal(problemOfAnswer(429, 'RATE_LIMITED'), 'file.limit')
  assert.equal(problemOfAnswer(401, 'NOT_SIGNED_IN'), 'error.signin')
  assert.equal(problemOfAnswer(503, 'FILE_STORE_UNAVAILABLE'), 'file.storeOff')
  assert.equal(problemOfAnswer(502, 'FILE_STORE_FAILED'), 'file.failed')
})

test('an upload sends the file and the session, and hands back the stored file', async () => {
  const sent = []
  const stored = {
    id: 'f-1',
    name: 'logo.png',
    type: 'image/png',
    bytes: 3,
    url: '/api/assistant/attachments/f-1'
  }
  const fetchImpl = async (url, init) => {
    sent.push({ url, form: init.body })
    return new Response(JSON.stringify({ file: stored }), { status: 201 })
  }
  const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })
  const out = await uploadFile(file, 'session-1', fetchImpl)
  assert.deepEqual(out, { ok: true, file: stored })
  assert.equal(sent[0].url, '/api/assistant/attachments')
  assert.equal(sent[0].form.get('session'), 'session-1')
  assert.equal(sent[0].form.get('file').name, 'logo.png')

  const refused = await uploadFile(
    file,
    'session-1',
    async () => new Response(JSON.stringify({ code: 'FILE_TYPE' }), { status: 415 })
  )
  assert.deepEqual(refused, { ok: false, problem: 'file.type' })
  const offline = await uploadFile(file, 'session-1', async () => {
    throw new TypeError('network')
  })
  assert.deepEqual(offline, { ok: false, problem: 'file.failed' })
})

test('the sent files are published on the page once per change, for Add site', () => {
  const page = new EventTarget()
  globalThis.window = page
  try {
    let heard = 0
    page.addEventListener(CHAT_FILES_EVENT, () => heard++)
    publishChatFiles([])
    assert.equal(heard, 0, 'nothing sent, nothing said')
    const logo = { id: 'f-1', name: 'logo.png', type: 'image/png', bytes: 3, url: '/x' }
    publishChatFiles([logo])
    publishChatFiles([logo])
    assert.equal(heard, 1)
    assert.deepEqual(page[CHAT_FILES_KEY], { version: 1, files: [logo] })
  } finally {
    delete globalThis.window
  }
})
