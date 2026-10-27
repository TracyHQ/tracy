// The logo the customer already sent in the creation screen's chat (`chat-logo.mjs`, David 26/10/2026).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CHAT_FILES_KEY,
  fetchChatFile,
  logoCandidates,
  otherPictures,
  readChatFiles
} from '../src/client/chat-logo.mjs'

const file = (id, name, type = 'image/png') => ({
  id,
  name,
  type,
  bytes: 10,
  url: `/api/assistant/attachments/${id}`
})

test('only what the chat published, version 1, from its own door, is read', () => {
  const good = file('a', 'logo.png')
  assert.deepEqual(readChatFiles({ [CHAT_FILES_KEY]: { version: 1, files: [good] } }), [good])
  assert.deepEqual(readChatFiles({ [CHAT_FILES_KEY]: { version: 2, files: [good] } }), [])
  assert.deepEqual(readChatFiles({}), [])
  // An address elsewhere is never fetched, whatever put it there.
  const foreign = { ...good, url: 'https://evil.example/logo.png' }
  assert.deepEqual(readChatFiles({ [CHAT_FILES_KEY]: { version: 1, files: [foreign] } }), [])
})

test('only PNG pictures can be the logo; other pictures are said, other files ignored', () => {
  const files = [
    file('a', 'shop.jpg', 'image/jpeg'),
    file('b', 'logo.png'),
    file('c', 'menu.pdf', 'application/pdf')
  ]
  assert.deepEqual(
    logoCandidates(files).map((f) => f.id),
    ['b']
  )
  assert.deepEqual(
    otherPictures(files).map((f) => f.id),
    ['a']
  )
})

test('a chat file becomes a File the tile upload takes, or nothing when the door refuses', async () => {
  const got = await fetchChatFile(file('a', 'logo.png'), async (url) => {
    assert.equal(url, '/api/assistant/attachments/a')
    return new Response(new Uint8Array([137, 80, 78, 71]))
  })
  assert.equal(got.name, 'logo.png')
  assert.equal(got.type, 'image/png')
  assert.equal(got.size, 4)
  assert.equal(
    await fetchChatFile(file('a', 'logo.png'), async () => new Response('', { status: 404 })),
    null
  )
  assert.equal(
    await fetchChatFile(file('a', 'logo.png'), async () => {
      throw new TypeError('offline')
    }),
    null
  )
})
