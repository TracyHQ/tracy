/**
 * Template Customization Question Readiness: a machine without the picture library (`sharp`) must
 * stop the check loudly. Before 12/10/2026 `pictureFacts` answered null when `sharp` could not be
 * imported, so LOGO-3 and REL-3 quietly read `live-only` on such a machine while the server, which
 * has the library, reported FAIL.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import { checkRelease } from '../src/lib/template-customization-question-readiness/index.js'
import {
  MissingPictureLibraryError,
  pictureFacts
} from '../src/lib/template-customization-question-readiness/readers/picture-facts.js'
import { releaseCacheSource } from '../src/lib/template-customization-question-readiness/release-source.js'

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'template-customization-question-readiness'
)

/** A 2x1 opaque mid-grey PNG, made by the library itself so the bytes are surely a picture. */
const PNG = await sharp({ create: { width: 2, height: 1, channels: 4, background: '#808080' } })
  .png()
  .toBuffer()

test('pictureFacts throws MissingPictureLibraryError when sharp cannot be loaded', async () => {
  const load = () => Promise.reject(new Error("Cannot find package 'sharp'"))
  await assert.rejects(pictureFacts(PNG, { load }), (e) => {
    assert.ok(e instanceof MissingPictureLibraryError)
    assert.match(e.message, /sharp is not installed: run pnpm install in apps\/tracy-web/)
    return true
  })
})

test('pictureFacts still answers null for bytes that are not a picture', async () => {
  assert.equal(await pictureFacts(Buffer.from('not a picture')), null)
})

test('pictureFacts reads size and brightness when sharp loads', async () => {
  const facts = await pictureFacts(PNG)
  assert.deepEqual([facts?.width, facts?.height], [2, 1])
  assert.ok(facts?.luminance !== null && Math.abs(facts.luminance - 128) < 2)
})

test('checkRelease stops on a missing picture library instead of marking the rule', async () => {
  const pictureRule = {
    id: 'X-PIC',
    title: 'A rule that reads a picture',
    platforms: ['joomla'],
    owner: 'tracy',
    run: async () => {
      await pictureFacts(PNG, { load: () => Promise.reject(new Error('missing')) })
      return { status: 'pass', message: 'unreachable' }
    }
  }
  await assert.rejects(
    checkRelease(releaseCacheSource(FIXTURES, 'quickstart/ja-essence/j6'), { rules: [pictureRule] }),
    MissingPictureLibraryError
  )
})
