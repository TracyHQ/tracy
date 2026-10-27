// A collected video's width and height read from its own MP4 header (the track header box), so a brief's video asset has a
// size, an orientation and a grade like a photograph; no network, no model.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { videoSize } from '../domain/video-size.mjs'

const box = (type, ...parts) => {
  const body = Buffer.concat(parts)
  const head = Buffer.alloc(8)
  head.writeUInt32BE(8 + body.length, 0)
  head.write(type, 4, 'latin1')
  return Buffer.concat([head, body])
}
/** A version-0 track header: 76 bytes of fields, then the matrix and the 16.16 size. */
const tkhd = (width, height, matrix = [1, 0, 0, 1]) => {
  const b = Buffer.alloc(84)
  const m = 4 + 20 + 8 + 8
  b.writeInt32BE(matrix[0] * 65536, m)
  b.writeInt32BE(matrix[1] * 65536, m + 4)
  b.writeInt32BE(matrix[2] * 65536, m + 12)
  b.writeInt32BE(matrix[3] * 65536, m + 16)
  b.writeUInt32BE(width * 65536, m + 36)
  b.writeUInt32BE(height * 65536, m + 40)
  return box('tkhd', b)
}
const mp4 = (...tracks) =>
  Buffer.concat([
    box('ftyp', Buffer.from('isom\0\0\0\0isom', 'latin1')),
    box('mdat', Buffer.alloc(32)),
    box('moov', box('mvhd', Buffer.alloc(100)), ...tracks.map((t) => box('trak', t)))
  ])

test('the size of the first track with a picture, the sound track skipped', () => {
  assert.deepEqual(videoSize(mp4(tkhd(0, 0), tkhd(720, 1280))), { width: 720, height: 1280 })
})

test('a track turned a quarter is measured as it plays', () => {
  assert.deepEqual(videoSize(mp4(tkhd(1920, 1080, [0, 1, -1, 0]))), { width: 1080, height: 1920 })
})

test('anything else is no size, never a guess', () => {
  assert.equal(videoSize(Buffer.from('not a video at all')), null)
  assert.equal(videoSize(mp4(tkhd(0, 0))), null)
  assert.equal(videoSize(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])), null)
  const cut = mp4(tkhd(720, 1280))
  assert.equal(videoSize(cut.subarray(0, cut.length - 30)), null)
})
