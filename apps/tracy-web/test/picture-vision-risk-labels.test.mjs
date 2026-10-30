/**
 * Three photo labels made once at research time by the vision step that already labels photos: sharpness (isBlurry), words
 * or a watermark on the photo (hasTextOrWatermark) and another business shown (showsOtherBusiness). They are held as
 * booleans, stored on the brief's photo record and listed in the fact sheet's photo records. A label absent means unknown,
 * never bad. A vision-model double and fictional photos (a pottery studio).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { held, labelWithVision, pictureLabelSystem } from '../src/lib/picture-vision.js'
import { briefFactSheet } from '../src/sites/brief-engines/brief-fact-sheet.js'
import { assetRelationsOf } from 'website-opportunities/domain/pictures/picture-links.mjs'
import { validateBrief } from 'website-opportunities/domain/brief.mjs'

const challengeFor = async () => ({ expectedCode: 'ABC12345', image: 'data:image/png;base64,eA==' })
const jpeg = () =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: '#996633' } })
    .jpeg()
    .toBuffer()

test('the one existing prompt asks for the three labels, so no extra call is made', () => {
  const prompt = pictureLabelSystem('pottery')
  for (const field of ['isBlurry', 'hasTextOrWatermark', 'showsOtherBusiness'])
    assert.match(prompt, new RegExp(field))
})

test('one call per batch returns the three labels for each photo, held as booleans', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    const pictures = [
      { id: 'a', subject: 'interior', isBlurry: true, hasTextOrWatermark: false, showsOtherBusiness: false },
      { id: 'b', subject: 'interior', isBlurry: false, hasTextOrWatermark: true, showsOtherBusiness: true },
      // Not a boolean: dropped, so it reads as unknown.
      { id: 'c', subject: 'interior', isBlurry: 'yes', showsOtherBusiness: null }
    ]
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ pictures, imageCode: 'ABC12345' }) } }]
      })
    )
  }
  const pictures = await Promise.all(['a', 'b', 'c'].map(async (id) => ({ id, bytes: await jpeg() })))
  const { labels } = await labelWithVision({
    challengeFor,
    door: { url: 'https://v.test/chat', key: 'k', model: 'm' },
    pictures,
    fetchImpl
  })
  assert.equal(calls, 1)
  assert.equal(labels.get('a').isBlurry, true)
  assert.equal(labels.get('b').hasTextOrWatermark, true)
  assert.equal(labels.get('b').showsOtherBusiness, true)
  for (const field of ['isBlurry', 'hasTextOrWatermark', 'showsOtherBusiness'])
    assert.equal(field in labels.get('c'), false, field)
})

test('held keeps an old answer without the labels as it was', () => {
  const one = held({ id: 'x', subject: 'food' })
  for (const field of ['isBlurry', 'hasTextOrWatermark', 'showsOtherBusiness'])
    assert.equal(field in one.labels, false, field)
})

const media = (labels) => ({ id: 'm1', kind: 'image', source: 'website', labels: { vision: { labels } } })

test('the brief photo record stores the labels, null when the photo was labelled before them', () => {
  const seen = assetRelationsOf(
    media({ subject: 'interior', isBlurry: false, hasTextOrWatermark: true, showsOtherBusiness: false })
  )
  assert.equal(seen.isBlurry, false)
  assert.equal(seen.hasTextOrWatermark, true)
  assert.equal(seen.showsOtherBusiness, false)
  const old = assetRelationsOf(media({ subject: 'interior' }))
  assert.equal(old.isBlurry, null)
  assert.equal(old.hasTextOrWatermark, null)
  assert.equal(old.showsOtherBusiness, null)
  const unseen = assetRelationsOf({ id: 'm2', kind: 'image', source: 'website' })
  assert.equal(unseen.isBlurry, null)
})

test('the brief validator takes the labels as boolean or null and refuses anything else', () => {
  const brief = { assets: [{ id: 'a', isBlurry: 'no', hasTextOrWatermark: null, showsOtherBusiness: true }] }
  const errors = validateBrief(brief).errors.filter((e) => e.startsWith('assets[0]'))
  assert.ok(
    errors.some((e) => e.startsWith('assets[0].isBlurry')),
    errors.join('\n')
  )
  assert.ok(!errors.some((e) => e.startsWith('assets[0].hasTextOrWatermark')))
  assert.ok(!errors.some((e) => e.startsWith('assets[0].showsOtherBusiness')))
})

test('the fact sheet photo records list the labels the brief holds and omit the unknown ones', () => {
  const brief = {
    reading: { services: [{ id: 'wheel', label: 'Wheel throwing' }] },
    assets: [
      {
        id: 'a1',
        kind: 'image',
        caption: 'Hands shaping a bowl',
        depicts: { id: 'wheel' },
        isBlurry: true,
        hasTextOrWatermark: false,
        showsOtherBusiness: null
      },
      { id: 'a2', kind: 'image', caption: 'The kiln room', depicts: { id: 'wheel' } }
    ]
  }
  const [first, second] = briefFactSheet(brief).offerings[0].photos
  assert.equal(first.isBlurry, true)
  assert.equal(first.hasTextOrWatermark, false)
  assert.equal('showsOtherBusiness' in first, false)
  for (const field of ['isBlurry', 'hasTextOrWatermark', 'showsOtherBusiness'])
    assert.equal(field in second, false, field)
})
