// The sharpness gate on worker threads (lib/photo-sharpness-pool.js): every verdict, measurement and corrected byte is
// the one judgePhoto gives on the main thread, several verdicts are worked out at once, and an idle pool does not keep
// the process alive (this file ends on its own).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { judgePhoto } from '../src/lib/photo-sharpness.js'
import { JUDGE_WORKERS, judgePhotoOffThread } from '../src/lib/photo-sharpness-pool.js'
import { kinds } from './_generated-photos.mjs'

const LARGE = { kind: 'large', width: 704 }
const MEDIUM = { kind: 'medium', width: 448 }
const SMALL = { kind: 'small', width: 320 }

test('a verdict from the pool equals the main thread one, corrected bytes included', async () => {
  const { crisp, blurred, compressed, enlarged } = await kinds('bakery', 900, 600)
  const soft = await sharp(crisp).blur(0.8).jpeg({ quality: 88 }).toBuffer()
  let corrected = 0
  for (const bytes of [crisp, blurred, compressed, enlarged, soft])
    for (const slot of [LARGE, MEDIUM, SMALL]) {
      const want = await judgePhoto(bytes, slot, { source: crisp, scale: 1 })
      const got = await judgePhotoOffThread(bytes, slot, { source: crisp, scale: 1 })
      if (want.corrected) {
        corrected += 1
        assert.ok(Buffer.isBuffer(got.corrected), 'the corrected bytes come back as a Buffer')
        assert.ok(want.corrected.equals(got.corrected), `${slot.kind}: the same corrected bytes`)
      }
      assert.deepEqual({ ...got, corrected: undefined }, { ...want, corrected: undefined }, slot.kind)
    }
  assert.ok(corrected >= 1, 'the soft photo is corrected for a large slot, so corrected bytes were compared')
})

test('several verdicts asked at once all come back, each the one asked for', async () => {
  const { crisp, blurred } = await kinds('dental', 900, 600)
  const asks = Array.from({ length: JUDGE_WORKERS * 3 }, (_, i) => [
    i % 2 ? blurred : crisp,
    i % 3 ? LARGE : MEDIUM
  ])
  const want = await Promise.all(asks.map(([b, s]) => judgePhoto(b, s)))
  const got = await Promise.all(asks.map(([b, s]) => judgePhotoOffThread(b, s)))
  assert.deepEqual(
    got.map((j) => [j.verdict, j.reason, j.score]),
    want.map((j) => [j.verdict, j.reason, j.score])
  )
})

test('a picture the gate cannot read fails its own verdict and the pool keeps working', async () => {
  await assert.rejects(judgePhotoOffThread(Buffer.from('not a picture'), LARGE), /sharpness worker/)
  const { crisp } = await kinds('bakery', 900, 600)
  assert.equal((await judgePhotoOffThread(crisp, MEDIUM)).verdict, 'pass')
})
