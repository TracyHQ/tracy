// Slot fit, wave 1: after the agent's turn every template picture's box keeps the demo's shape, and the pictures the
// template keeps (icons, avatar strips, cut-outs, kept slots) are still the template's. Files and sizes are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  baselineOf,
  CHECK_IDS,
  checkNoDemoPictures,
  checkPictureFramesKept,
  demoQaBody
} from '../src/demo-qa.js'

const img = (src, width, height, selector) => ({
  src: `https://site.test/${src}`,
  width,
  height,
  kind: 'img',
  selector
})
const page = (path, images) => ({ path, status: 200, images })

const before = [
  page('/', [
    img('images/demo/classes/intro-1.jpg', 704, 302, 'div.card > img'),
    img('images/demo/classes/intro-2.jpg', 704, 302, 'div.card > img'),
    img('images/demo/icons/icon-dark-1.png', 100, 100, 'div.icon > img'),
    img('images/demo/others/avatar-1.png', 216, 56, 'div.top-desc > img'),
    img('images/demo/team/coach-1.jpg', 350, 351, 'div.coach > img')
  ])
]
const baseline = baselineOf(before, [], { frames: true })
const KEPT = [
  { file: 'images/demo/icons/icon-dark-1.png', kind: 'keep', reason: 'a slot the template only declares' },
  { file: 'images/demo/others/avatar-1.png', kind: 'keep', reason: 'a slot the template only declares' }
]

test('picture-frames-kept is one of the checks, and the request carries the kept pictures', () => {
  assert.ok(CHECK_IDS.includes('picture-frames-kept'))
  const asked = demoQaBody({
    label: 'site',
    platform: 'joomla',
    kept: [...KEPT, { file: 42 }, 'not a picture']
  })
  assert.deepEqual(
    asked.kept.map((k) => k.file),
    KEPT.map((k) => k.file)
  )
})

test('photos cut to each frame pass: every box keeps its shape, the kept pictures are still there', () => {
  const after = [
    page('/', [
      img('images/tracy-content/aaa.jpg', 704, 302, 'div.card > img'),
      img('images/tracy-content/bbb.jpg', 704, 303, 'div.card > img'),
      img('images/demo/icons/icon-dark-1.png', 100, 100, 'div.icon > img'),
      img('images/demo/others/avatar-1.png', 216, 56, 'div.top-desc > img'),
      img('images/tracy-content/ccc.jpg', 350, 350, 'div.coach > img')
    ])
  ]
  const result = checkPictureFramesKept(after, { baseline, kept: KEPT })
  assert.equal(result.pass, true, JSON.stringify(result.detail))
})

test('a portrait placed whole into a wide card and a photo over an icon or the avatar strip fail, each named', () => {
  const after = [
    page('/', [
      img('images/tracy-content/portrait.jpg', 704, 1240, 'div.card > img'),
      img('images/tracy-content/bbb.jpg', 704, 302, 'div.card > img'),
      img('images/tracy-content/portrait-2.jpg', 100, 176, 'div.icon > img'),
      img('images/tracy-content/square.jpg', 216, 216, 'div.top-desc > img'),
      img('images/tracy-content/ccc.jpg', 350, 616, 'div.coach > img')
    ])
  ]
  const result = checkPictureFramesKept(after, { baseline, kept: KEPT })
  assert.equal(result.pass, false)
  const named = result.detail.map((d) => `${d.was} ${d.why}`)
  assert.equal(result.detail.length, 4, JSON.stringify(result.detail))
  assert.ok(named.some((n) => /intro-1\.jpg .*704×302.*704×1240/.test(n)))
  assert.ok(named.some((n) => /coach-1\.jpg .*350×351.*350×616/.test(n)))
  assert.ok(named.some((n) => /icon-dark-1\.png .*kept/.test(n)))
  assert.ok(named.some((n) => /avatar-1\.png .*kept/.test(n)))
})

test('without measured frames the check is skipped, never a pass it did not earn', () => {
  const result = checkPictureFramesKept(before, { baseline: baselineOf(before, []), kept: KEPT })
  assert.equal(result.pass, true)
  assert.equal(result.skipped, 'no measured frames')
})

test('no-demo-pictures lets a kept picture and an avatar strip stay, and names them as kept', () => {
  const after = [
    page('/', [
      img('images/tracy-content/aaa.jpg', 704, 302, 'div.card > img'),
      img('images/tracy-content/bbb.jpg', 704, 302, 'div.card > img'),
      img('images/demo/icons/icon-dark-1.png', 100, 100, 'div.icon > img'),
      img('images/demo/others/avatar-1.png', 216, 56, 'div.top-desc > img'),
      img('images/demo/team/coach-1.jpg', 350, 351, 'div.coach > img')
    ])
  ]
  const result = checkNoDemoPictures(after, { baseline, kept: KEPT })
  // The coach photo is still the template's and is still asked for; the icon and the avatar strip are not.
  assert.deepEqual(
    result.pictures.map((p) => p.file),
    ['images/demo/team/coach-1.jpg']
  )
  assert.ok(result.unresolved.some((u) => u.file === 'images/demo/others/avatar-1.png' && /kept/.test(u.why)))
  // With no kept list (a build path that sends none), an avatar strip by its name still stays.
  const bare = checkNoDemoPictures(after, { baseline })
  assert.ok(!bare.pictures.some((p) => /avatar-1\.png/.test(p.file)))
})
