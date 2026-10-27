/**
 * Slot fit at capture (ADR 0039): the content coverage audit's findings (each demo picture and text matched to its slot,
 * with the box it is drawn in per viewport and what its file is) become a `fit` on every text and image slot of the
 * content map, and the keep flag of each picture follows the kind measured. Every slot, file and business is invented.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { measureSlotFit } from '../content-coverage/lib/slot-fit.mjs'
import { checkContentMapFit } from '../../../wo/website-opportunities/domain/content-map-fit.mjs'

const rect = (w, h) => ({ x: 0, y: 0, w, h })
const vp = (w, h, look = {}) => ({ visible: true, count: 1, rect: rect(w, h), look })

function image(value, slots, viewports, file) {
  return { kind: 'image', source: 'img', value, status: 'matched', slots, viewports, file }
}
function text(value, slots, viewports) {
  return { kind: 'text', value, status: 'matched', matchBy: 'exact', slots, viewports }
}

const textLook = (width, lines, charWidth, extra = {}) => ({
  width,
  lines,
  charWidth,
  textTransform: 'none',
  ...extra
})

function fixture() {
  const map = {
    roleVocabularyVersion: 'place-content-roles/2',
    slots: [
      // A class card photo the old capture rule kept (customize "keep") although it is a photograph.
      {
        key: 'article-7.0',
        entity: 'article-7',
        type: 'image',
        sample:
          'images/demo/classes/morning.jpg#joomlaImage://local-images/demo/classes/morning.jpg?width=1408&height=604',
        label: 'Morning class / feature_img',
        customize: 'keep',
        group: { id: 'module-4.item.0', item: 0, kind: 'offering' }
      },
      {
        key: 'article-8.0',
        entity: 'article-8',
        type: 'image',
        sample: 'images/demo/classes/evening.jpg',
        label: 'Evening class / feature_img',
        customize: 'keep',
        group: { id: 'module-4.item.1', item: 1, kind: 'offering' }
      },
      // A feature icon: an opaque PNG drawn at 100px.
      {
        key: 'module-5.3',
        entity: 'module-5',
        type: 'image',
        sample: 'images/demo/icons/w1.png',
        label: 'Workout / img-icon',
        customize: 'keep',
        jsonPath: ['features-intro', 'features-intro[img-icon]', 0]
      },
      // The hero cut-out: a transparent PNG, declared replaceable by the old rule.
      {
        key: 'module-1.2',
        entity: 'module-1',
        type: 'image',
        sample: 'images/demo/hero/item-1.png',
        label: 'Hero / image-decor'
      },
      // A faces strip.
      {
        key: 'module-1.4',
        entity: 'module-1',
        type: 'image',
        sample: 'images/demo/hero/join.png',
        label: 'Hero / avatars'
      },
      // A logo stays as it was declared: the business logo replaces it through its own door.
      {
        key: 'siteSetting-3.0',
        entity: 'siteSetting-3',
        type: 'image',
        sample: 'images/demo/logo/logo.png',
        label: 'logo (site settings)',
        customize: 'keep'
      },
      // A blog picture no page shows.
      {
        key: 'article-9.0',
        entity: 'article-9',
        type: 'image',
        sample: 'images/demo/blog/old.jpg',
        label: 'Old post / image_intro',
        customize: 'keep'
      },
      {
        key: 'module-1.0',
        entity: 'module-1',
        type: 'text',
        sample: 'Train like a champion',
        label: 'Hero / title'
      },
      { key: 'module-1.1', entity: 'module-1', type: 'text', sample: 'Our trainers', label: 'Hero / button' },
      { key: 'module-1.9', entity: 'module-1', type: 'url', sample: '/classes' }
    ]
  }
  const findings = {
    pages: [
      {
        items: [
          image(
            'http://site.test/images/demo/classes/morning.jpg',
            ['article-7.0'],
            {
              desktop: vp(704, 302, { objectFit: 'cover', objectPosition: '50% 0%' }),
              phone: vp(358, 154, { objectFit: 'cover' })
            },
            { width: 1408, height: 604, alpha: false }
          ),
          image(
            'http://site.test/images/demo/classes/evening.jpg',
            ['article-8.0'],
            { desktop: vp(704, 302), phone: vp(358, 154) },
            { width: 1408, height: 604, alpha: false }
          ),
          image(
            'http://site.test/images/demo/icons/w1.png',
            ['module-5.3'],
            { desktop: vp(100, 100), phone: vp(80, 80) },
            { width: 150, height: 150, alpha: false }
          ),
          image(
            'http://site.test/images/demo/hero/item-1.png',
            ['module-1.2'],
            { desktop: vp(587, 480), phone: vp(358, 293) },
            { width: 1175, height: 960, alpha: true }
          ),
          image(
            'http://site.test/images/demo/hero/join.png',
            ['module-1.4'],
            { desktop: vp(216, 56) },
            { width: 432, height: 112, alpha: true }
          ),
          image(
            'http://site.test/images/demo/logo/logo.png',
            ['siteSetting-3.0'],
            { desktop: vp(195, 56), phone: vp(150, 43) },
            { width: 390, height: 112, alpha: true }
          ),
          text('TRAIN LIKE A CHAMPION', ['module-1.0'], {
            desktop: vp(600, 160, textLook(600, 2, 30, { textTransform: 'uppercase' })),
            phone: vp(358, 240, textLook(358, 3, 20, { textTransform: 'uppercase' }))
          }),
          // A text matched with another slot's words is not measured from this box.
          {
            ...text('Our trainers', ['module-1.1'], { desktop: vp(160, 48, textLook(160, 1, 10)) }),
            matchBy: 'contains'
          }
        ]
      },
      {
        items: [
          // The same photo shown larger on a second page: the widest box wins.
          image(
            'http://site.test/images/demo/classes/morning.jpg',
            ['article-7.0'],
            { desktop: vp(1078, 462) },
            { width: 1408, height: 604, alpha: false }
          )
        ]
      }
    ]
  }
  return { map, findings }
}

const slotOf = (map, key) => map.slots.find((s) => s.key === key)

test('a class photo the old rule kept becomes replaceable, with the box of each viewport and its shape', () => {
  const { map, findings } = fixture()
  const out = measureSlotFit({ map, findings }).map
  const photo = slotOf(out, 'article-7.0')
  assert.equal(photo.customize, undefined)
  assert.equal(photo.fit.kind, 'photo')
  assert.equal(photo.fit.replace, 'photo')
  assert.deepEqual(photo.fit.boxes, {
    desktop: { width: 1078, height: 462 },
    phone: { width: 358, height: 154 }
  })
  assert.equal(photo.fit.aspect, 2.3333)
  assert.equal(photo.fit.minWidth, 1617)
  assert.equal(photo.fit.crop, 'cover')
  assert.equal(photo.fit.focus, 'top')
  assert.equal(photo.fit.transparent, false)
  assert.deepEqual(photo.fit.source, { width: 1408, height: 604, format: 'jpg' })
})

test('icons, faces and cut-outs are kept, and the hero cut-out says it needs a transparent picture', () => {
  const { map, findings } = fixture()
  const out = measureSlotFit({ map, findings }).map
  const icon = slotOf(out, 'module-5.3')
  assert.equal(icon.fit.kind, 'icon')
  assert.equal(icon.customize, 'keep')
  assert.equal(icon.fit.crop, 'none')
  const hero = slotOf(out, 'module-1.2')
  assert.equal(hero.fit.kind, 'cutout')
  assert.equal(hero.fit.transparent, true)
  assert.equal(hero.customize, 'keep')
  const strip = slotOf(out, 'module-1.4')
  assert.equal(strip.fit.kind, 'avatar-group')
  assert.equal(strip.customize, 'keep')
  const logo = slotOf(out, 'siteSetting-3.0')
  assert.equal(logo.fit.kind, 'logo')
  assert.equal(logo.fit.crop, 'contain')
  assert.equal(logo.customize, 'keep')
})

test('a picture no page shows carries what its file name says, and is not measured', () => {
  const { map, findings } = fixture()
  const old = slotOf(measureSlotFit({ map, findings }).map, 'article-9.0')
  assert.deepEqual(old.fit, {
    measured: false,
    kind: 'photo',
    replace: 'photo',
    transparent: null,
    source: null
  })
  assert.equal(old.customize, undefined)
})

test('text gets the characters and lines its box holds per viewport, the smallest as its limit', () => {
  const { map, findings } = fixture()
  const out = measureSlotFit({ map, findings }).map
  const title = slotOf(out, 'module-1.0').fit
  assert.deepEqual(title.lines, { desktop: 2, phone: 3 })
  assert.deepEqual(title.maxChars, { desktop: 40, phone: 51 })
  assert.equal(title.maxCharacters, 40)
  assert.equal(title.casing, 'upper')
  assert.equal(title.overflow, 'rewrite')
  assert.deepEqual(slotOf(out, 'module-1.1').fit, { measured: false })
  assert.equal(slotOf(out, 'module-1.9').fit, undefined)
})

test('groups say how many items the demo shows and whether their pictures share one shape', () => {
  const { map, findings } = fixture()
  const out = measureSlotFit({ map, findings }).map
  assert.deepEqual(out.fitGroups, { 'module-4.item': { items: 2, uniform: true, whenFewer: 'neutral' } })
})

test('the measured map passes the Slot fit check, and the summary counts kinds and kept pictures', () => {
  const { map, findings } = fixture()
  const { map: out, summary } = measureSlotFit({ map, findings })
  assert.equal(out.slotFitVersion, 'slot-fit/1')
  assert.deepEqual(checkContentMapFit(out).errors, [])
  assert.deepEqual(summary.pictures.byKind, { photo: 3, icon: 1, cutout: 1, 'avatar-group': 1, logo: 1 })
  assert.equal(summary.pictures.kept, 4)
  assert.equal(summary.pictures.keepBefore, 5)
  assert.deepEqual(summary.pictures.cutouts, ['module-1.2'])
  assert.deepEqual(summary.text, { total: 2, measured: 1 })
  // The input map is left as it was.
  assert.equal(slotOf(map, 'article-7.0').customize, 'keep')
})

test('words two slots share measure both, and the tighter of two boxes is the limit', () => {
  const map = {
    slots: [
      { key: 'module-2.0', type: 'text', sample: 'Book a class' },
      { key: 'module-3.0', type: 'text', sample: 'Book a class' }
    ]
  }
  const findings = {
    pages: [
      {
        items: [
          text('Book a class', ['module-2.0', 'module-3.0'], { desktop: vp(400, 40, textLook(400, 1, 10)) })
        ]
      },
      {
        items: [
          text('Book a class', ['module-2.0', 'module-3.0'], { desktop: vp(200, 40, textLook(200, 1, 10)) })
        ]
      }
    ]
  }
  const out = measureSlotFit({ map, findings }).map
  for (const key of ['module-2.0', 'module-3.0'])
    assert.deepEqual(out.slots.find((s) => s.key === key).fit.maxChars, { desktop: 20 })
})
