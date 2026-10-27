// The standalone server's object store: files under one folder at the open layer's keys.
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createDiskObjects } from '../src/standalone/disk-objects.js'

let dir
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wo-objects-'))
})
after(async () => {
  await rm(dir, { recursive: true, force: true })
})

const SHA = 'ab'.repeat(32)

test('put, head, get and delete one object at its key', async () => {
  const objects = createDiskObjects({ dir: join(dir, 'store') })
  const key = `media/google/ab/${SHA}.jpg`
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
  assert.equal(await objects.head(key), null)
  assert.equal(await objects.get(key), null)
  assert.equal(await objects.put(key, bytes, 'image/jpeg'), true)
  assert.deepEqual(await objects.head(key), { size: bytes.length })
  const res = await objects.get(key)
  assert.equal(res.status, 200)
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes)
  // The same key again writes the same bytes; no temporary file is left behind.
  assert.equal(await objects.put(key, bytes, 'image/jpeg'), true)
  assert.deepEqual(await readdir(join(dir, 'store/media/google/ab')), [`${SHA}.jpg`])
  await objects.delete(key)
  assert.equal(await objects.head(key), null)
  assert.equal(await objects.publicUrl(key), null)
})

test('a key that could leave the folder is refused, never written or read', async () => {
  const objects = createDiskObjects({ dir: join(dir, 'fenced') })
  for (const key of [
    '../escape.jpg',
    'places/../../escape.jpg',
    '/etc/passwd',
    'a//b.jpg',
    '',
    'a/./b',
    '.hidden'
  ]) {
    assert.equal(await objects.put(key, Buffer.from('x'), 'text/plain'), false, key)
    assert.equal(await objects.get(key), null, key)
    assert.equal(await objects.head(key), null, key)
  }
  assert.deepEqual(await readdir(dir).then((names) => names.filter((n) => n === 'escape.jpg')), [])
})

test('a folder is required', () => {
  assert.throws(() => createDiskObjects({ dir: '' }), /dir is required/)
})
