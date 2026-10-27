// Slot fit, wave 1: which demo pictures no build path replaces, and whether a picture can take a frame's shape at all.
// Every name and size here is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { protectedPicture, slotMap } from '../domain/pictures/slot-map.mjs'
import { fitCrop, fitOf, shapeFit } from '../domain/pictures/placement.mjs'

const slot = (label, extra = {}) => ({ type: 'image', label, ...extra })

test('a kept slot, an icon, an avatar strip, a signature, a cut-out and a drawing are protected, each with its kind', () => {
  const kind = (s, file, demo) => protectedPicture(s, file, demo)?.kind ?? null
  assert.equal(kind(slot('Classes / img', { customize: 'keep' }), 'images/demo/classes/one.jpg'), 'keep')
  assert.equal(kind(slot('The workout / img-icon'), 'images/demo/icons/icon-dark-1.png'), 'icon')
  assert.equal(kind(slot('Our Classes / top-desc'), 'images/demo/others/avatar-1.png'), 'avatar')
  assert.equal(kind(slot('Quote / sign'), 'images/demo/about/signature.png'), 'signature')
  assert.equal(kind(slot('Hero / image-main'), 'images/demo/hero/fighter.png', { alpha: true }), 'cutout')
  // A PNG whose transparency nobody measured counts as a cut-out until it is.
  assert.equal(kind(slot('Hero / image-main'), 'images/demo/hero/fighter.png'), 'cutout')
  assert.equal(kind(slot('Steps / img'), 'images/demo/steps/arrow.svg'), 'icon')
  assert.equal(kind(slot('Steps / img'), 'images/demo/steps/small.jpg', { width: 90, height: 90 }), 'icon')
  // A photograph is not protected.
  assert.equal(
    kind(slot('Our Classes / intro'), 'images/demo/classes/intro-1.jpg', { width: 1128, height: 484 }),
    null
  )
  assert.equal(
    kind(slot('Hero / image-main'), 'images/demo/hero/opaque.png', {
      width: 1200,
      height: 900,
      alpha: false
    }),
    null
  )
})

test('the planner never offers a kept slot', () => {
  const map = slotMap({
    slots: [
      {
        key: 'm-1.0',
        entity: 'm-1',
        ...slot('Gallery / img', { customize: 'keep' }),
        sample: 'images/demo/g/one.jpg'
      },
      { key: 'm-1.1', entity: 'm-1', ...slot('Gallery / img'), sample: 'images/demo/g/two.jpg' }
    ],
    pages: [{ route: 'home', entity: 'm-1' }]
  })
  assert.deepEqual(
    map.groups.map((g) => g.file),
    ['images/demo/g/two.jpg']
  )
  assert.equal(map.never[0].file, 'images/demo/g/one.jpg')
})

test('shapeFit: a phone portrait never fills a wide card; a wide photo fills it within the planner limits', () => {
  const card = { width: 1128, height: 484 }
  assert.equal(shapeFit({ width: 360, height: 640 }, card), null)
  assert.equal(shapeFit({ width: 1320, height: 2325 }, card), null)
  const wide = shapeFit({ width: 1600, height: 800 }, card)
  assert.ok(wide)
  assert.ok(Math.abs(wide.output.width / wide.output.height - card.width / card.height) <= 0.005)
  // A square frame takes a portrait's middle when little is lost, never enlarged past the planner's limit.
  assert.ok(shapeFit({ width: 1080, height: 1350 }, { width: 573, height: 574 }))
  assert.equal(shapeFit({ width: 300, height: 300 }, { width: 1400, height: 1400 }, { min: 1400 }), null)
})

test('fitCrop is the recipe the planner itself writes: the same crop as fitOf for the same picture and frame', () => {
  const demo = { width: 900, height: 600 }
  const label = {
    id: 'p1',
    width: 1800,
    height: 1350,
    aspect: 1800 / 1350,
    subject: 'interior',
    subjectFrom: 'vision',
    quality: 'good',
    words: [],
    textPresence: 'absent',
    centreLuminance: null
  }
  const planned = fitOf(label, { role: 'gallery', demo, topic: [] })
  const recipe = fitCrop(label, demo, { min: 600, label })
  assert.deepEqual(recipe, planned.crop)
  // Without a label the subject is kept by attention.
  assert.equal(fitCrop({ width: 1800, height: 1350 }, demo).strategy, 'attention')
})

// Wave 2 (ADR 0039): a slot whose content map declares its Slot fit is judged by that, not by its name or file type.
const fitted = (label, kind, extra = {}) =>
  slot(label, {
    ...(kind === 'photo' || kind === 'video-poster' ? {} : { customize: 'keep' }),
    fit: {
      measured: false,
      kind,
      replace: kind === 'logo' ? 'logo' : ['photo', 'video-poster'].includes(kind) ? 'photo' : 'keep',
      transparent: extra.transparent ?? null,
      source: null
    }
  })

test('a declared photo is replaceable even as a PNG nobody measured, and a declared icon is kept whatever its name', () => {
  assert.equal(
    protectedPicture(fitted('Classes / feature_img', 'photo'), 'images/demo/classes/one.png'),
    null
  )
  assert.equal(
    protectedPicture(fitted('Classes / feature_img', 'icon'), 'images/demo/classes/one.jpg')?.kind,
    'icon'
  )
  const icon = fitted('Classes / feature_img', 'icon')
  delete icon.customize
  // A fit whose keep flag disagrees with its kind is malformed: the guesses decide, as before.
  assert.equal(protectedPicture(icon, 'images/demo/classes/one.jpg'), null)
})

test('a declared cut-out is kept as a cut-out, and a declared logo is the business logo to take', () => {
  const cut = protectedPicture(
    fitted('Hero / image-main', 'cutout', { transparent: true }),
    'images/demo/hero/a.png'
  )
  assert.equal(cut?.kind, 'cutout')
  assert.match(cut.reason, /transparent/)
  const logo = fitted('Header / brand-img', 'logo')
  logo.customize = 'keep'
  assert.equal(protectedPicture(logo, 'images/demo/header/a.jpg')?.kind, 'logo')
})

test('the planner takes a declared photo the guesses would have kept, sized by its declared source', () => {
  const map = slotMap({
    slots: [
      {
        key: 'a-1.0',
        entity: 'article-1',
        type: 'image',
        label: 'Classes / feature_img',
        sample: 'images/demo/classes/one.png',
        fit: {
          measured: false,
          kind: 'photo',
          replace: 'photo',
          transparent: false,
          source: { width: 1400, height: 600, format: 'png' }
        }
      }
    ],
    pages: [{ entity: 'article-1', route: 'classes', assignedModules: [] }]
  })
  assert.equal(map.never.length, 0)
  assert.deepEqual(map.groups[0].demo, { width: 1400, height: 600 })
})
