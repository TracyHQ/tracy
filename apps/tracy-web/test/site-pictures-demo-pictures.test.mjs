// The demo pictures of a kit's cut-out frames (demo-pictures.js): read once from an invented release webroot tar.gz,
// cached, matched by path and by the hash the kit records. No network, no database.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { zipSync } from 'fflate'
import { demoCutoutPaths, demoPictureReader } from '../src/site-pictures/demo-pictures.js'
import { storeDir } from './_site-pictures-bench.mjs'

const store = storeDir()
after(store.done)

/** A tar.gz of `files` (path -> bytes) under a webroot/ folder, as a release ships its site. */
function tarGz(files) {
  const blocks = []
  for (const [name, bytes] of files) {
    const header = Buffer.alloc(512)
    header.write(`webroot/${name}`, 0, 100, 'utf8')
    header.write('0000644\0', 100)
    header.write('0000000\0', 108)
    header.write('0000000\0', 116)
    header.write(`${bytes.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('00000000000\0', 136)
    header.write('        ', 148)
    header.write('0', 156)
    header.write('ustar\0', 257)
    header.write('00', 263)
    let sum = 0
    for (const b of header) sum += b
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}

const FIGURE = Buffer.from('an invented cut-out figure')
const sha = (b) => createHash('sha256').update(b).digest('hex')
const doc = {
  blocks: [
    {
      id: 'block-a',
      frames: [
        { id: 'block-a.1', kind: 'cutout', picture: '/images/demo/figure-a.png' },
        {
          id: 'block-a.2',
          kind: 'cutout',
          picture: 'images/demo/figure-b.png',
          pictureSha256: 'f'.repeat(64)
        },
        { id: 'block-a.3', kind: 'image', picture: 'images/demo/photo.jpg' },
        { id: 'block-a.4', kind: 'cutout', picture: 'images/demo/missing.png' }
      ]
    }
  ]
}

test('only cut-out frames are read, once, and a file whose hash the kit disagrees with is not used', async () => {
  assert.deepEqual(demoCutoutPaths(doc), [
    'images/demo/figure-a.png',
    'images/demo/figure-b.png',
    'images/demo/missing.png'
  ])
  let downloads = 0
  const webroot = async () => {
    downloads++
    return {
      ok: true,
      bytes: tarGz([
        ['images/demo/figure-a.png', FIGURE],
        ['images/demo/figure-b.png', Buffer.from('another figure')],
        ['images/demo/photo.jpg', Buffer.from('a photo')]
      ])
    }
  }
  const kit = { ref: 'demo-bikes/j6/1.0.0', release: 'demo-bikes-1.0.0', doc }
  const frames = doc.blocks[0].frames
  const first = await demoPictureReader({ dir: store.dir, webroot }).forKit(kit)
  assert.equal(first.note, null)
  assert.equal(sha(await first.readDemo(frames[0])), sha(FIGURE))
  assert.equal(await first.readDemo(frames[1]), null, 'the recorded hash does not match')
  assert.equal(await first.readDemo(frames[2]), null, 'not a cut-out frame')
  assert.equal(await first.readDemo(frames[3]), null, 'not in the webroot')
  const again = await demoPictureReader({ dir: store.dir, webroot }).forKit(kit)
  assert.equal(sha(await again.readDemo(frames[0])), sha(FIGURE))
  assert.equal(downloads, 1, 'the webroot is downloaded once')
})

test('a webroot that cannot be read leaves every frame without a demo picture, with a note', async () => {
  const kit = { ref: 'demo-bikes/j6/1.0.1', release: 'demo-bikes-1.0.1', doc }
  const reader = await demoPictureReader({
    dir: store.dir,
    webroot: async () => ({ ok: false, reason: 'no webroot asset' })
  }).forKit(kit)
  assert.match(reader.note, /could not be read: no webroot asset/)
  assert.equal(await reader.readDemo(doc.blocks[0].frames[0]), null)
})

test('the installer zip the contract names is read first, and one whose hash does not match falls back to the webroot', async () => {
  const zip = Buffer.from(
    zipSync({
      'images/demo/figure-a.png': new Uint8Array(FIGURE),
      'images/demo/photo.jpg': new Uint8Array(Buffer.from('a photo'))
    })
  )
  const asked = []
  const quickstart = async (a) => {
    asked.push(a)
    return { ok: true, bytes: zip }
  }
  const frame = doc.blocks[0].frames[0]
  const good = {
    ref: 'demo-bikes/j6/1.0.2',
    release: 'demo-bikes',
    doc,
    installer: { file: 'qs.zip', sha256: sha(zip) }
  }
  const fromZip = await demoPictureReader({
    dir: store.dir,
    quickstart,
    webroot: async () => assert.fail('the webroot is not needed')
  }).forKit(good)
  assert.deepEqual(asked, [{ release: 'demo-bikes', name: 'qs.zip' }])
  assert.equal(sha(await fromZip.readDemo(frame)), sha(FIGURE))
  const other = Buffer.from('another invented figure')
  const bad = { ...good, ref: 'demo-bikes/j6/1.0.3', installer: { file: 'qs.zip', sha256: 'e'.repeat(64) } }
  const fromWebroot = await demoPictureReader({
    dir: store.dir,
    quickstart,
    webroot: async () => ({ ok: true, bytes: tarGz([['images/demo/figure-a.png', other]]) })
  }).forKit(bad)
  assert.equal(sha(await fromWebroot.readDemo(frame)), sha(other))
  const neither = await demoPictureReader({ dir: store.dir, quickstart, webroot: null }).forKit({
    ...bad,
    ref: 'demo-bikes/j6/1.0.4'
  })
  assert.match(neither.note, /does not match the sha256 its contract records/)
})
