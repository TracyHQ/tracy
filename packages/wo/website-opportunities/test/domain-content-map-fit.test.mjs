// Slot fit declared on the slots of a content map (ADR 0039): the picture kinds and what each lets a build put in its
// place, the rule that tells a kind from what capture measured, and the contract check a map with Slot fit must pass.
// Every slot, file and business below is invented.
import assert from 'node:assert/strict'
import test from 'node:test'
import * as domain from '../domain/index.mjs'

const box = (width, height) => ({ width, height })

/** A fit as capture writes it for a picture of `kind`. */
function pictureFit(kind, extra = {}) {
  return {
    measured: true,
    kind,
    replace: domain.pictureReplaceOf(kind),
    transparent: false,
    source: { width: 1200, height: 600, format: 'jpg' },
    boxes: { desktop: box(704, 302), phone: box(358, 154) },
    aspect: 2.3311,
    tolerance: domain.SLOT_FIT_TOLERANCE,
    minWidth: 1056,
    crop: 'cover',
    ...extra
  }
}

function mapWithFit() {
  return {
    slotFitVersion: domain.SLOT_FIT_VERSION,
    fitGroups: { 'module-9.person': { items: 2, uniform: true, whenFewer: 'neutral' } },
    slots: [
      { key: 'module-9.0', type: 'image', sample: 'images/demo/class-a.jpg', fit: pictureFit('photo') },
      {
        key: 'module-9.1',
        type: 'image',
        sample: 'images/demo/icons/gloves.png',
        customize: 'keep',
        fit: pictureFit('icon', { transparent: true, crop: 'none' })
      },
      {
        key: 'module-9.2',
        type: 'text',
        sample: 'Morning sparring',
        fit: {
          measured: true,
          boxes: { desktop: box(320, 40), phone: box(300, 80) },
          lines: { desktop: 1, phone: 2 },
          maxChars: { desktop: 22, phone: 36 },
          maxCharacters: 22,
          casing: 'upper',
          overflow: 'rewrite'
        }
      },
      { key: 'module-9.3', type: 'url', sample: '/classes' }
    ]
  }
}

test('every picture kind says what a build may put in its place: a photo, the business logo, or nothing', () => {
  assert.equal(domain.pictureReplaceOf('photo'), 'photo')
  assert.equal(domain.pictureReplaceOf('video-poster'), 'photo')
  assert.equal(domain.pictureReplaceOf('logo'), 'logo')
  for (const kind of ['icon', 'avatar', 'avatar-group', 'signature', 'cutout', 'decoration', 'map'])
    assert.equal(domain.pictureReplaceOf(kind), 'keep', kind)
  assert.deepEqual(Object.keys(domain.PICTURE_KINDS).sort(), [
    'avatar',
    'avatar-group',
    'cutout',
    'decoration',
    'icon',
    'logo',
    'map',
    'photo',
    'signature',
    'video-poster'
  ])
})

test('a kind is told from what capture measured, not from the file extension alone', () => {
  const kindOf = (evidence) => domain.pictureKindOf(evidence).kind
  const wide = { desktop: box(704, 302), phone: box(358, 154) }
  // An opaque PNG class photo is a photo: wave 1 guessed every unmeasured PNG to be a cut-out.
  assert.equal(
    kindOf({
      words: 'Classes / feature_img',
      file: 'images/demo/class.png',
      source: { width: 1400, height: 600, alpha: false },
      boxes: wide
    }),
    'photo'
  )
  // A transparent PNG shown large is a cut-out, even when its field is named like decoration.
  assert.equal(
    kindOf({
      words: 'Hero / image-decor',
      file: 'images/demo/hero/item-1.png',
      source: { width: 1175, height: 960, alpha: true },
      boxes: { desktop: box(587, 480) }
    }),
    'cutout'
  )
  // A transparent picture shown small is an icon.
  assert.equal(
    kindOf({
      words: 'Workout / feature',
      file: 'images/demo/w1.png',
      source: { width: 150, height: 150, alpha: true },
      boxes: { desktop: box(100, 100) }
    }),
    'icon'
  )
  assert.equal(
    kindOf({
      words: 'Workout / img-icon',
      file: 'images/demo/w1.jpg',
      source: { width: 200, height: 200, alpha: false },
      boxes: { desktop: box(160, 160) }
    }),
    'icon'
  )
  // A field named like an icon that the demo draws as a large opaque picture holds a photo.
  assert.equal(
    kindOf({
      words: 'Coaches / img-icon',
      file: 'images/demo/coach-1.jpg',
      source: { width: 491, height: 655, alpha: false },
      boxes: { desktop: box(448, 598) }
    }),
    'photo'
  )
  // Not shown anywhere, named icon, a transparent 150px file: an icon, not a cut-out.
  assert.equal(
    kindOf({
      words: 'Workout / img-light-icon',
      file: 'images/demo/icon-light-1.png',
      source: { width: 150, height: 150, alpha: true }
    }),
    'icon'
  )
  assert.equal(
    kindOf({ words: 'Brand / logo', file: 'images/demo/logo.png', boxes: { desktop: box(195, 56) } }),
    'logo'
  )
  assert.equal(
    kindOf({ words: 'Hero / sign', file: 'images/demo/sign.png', boxes: { desktop: box(120, 89) } }),
    'signature'
  )
  assert.equal(
    kindOf({ words: 'Join us / avatars', file: 'images/demo/avatars.png', boxes: { desktop: box(216, 56) } }),
    'avatar-group'
  )
  assert.equal(
    kindOf({ words: 'Author / user_avatar', file: 'images/demo/a1.jpg', boxes: { desktop: box(64, 64) } }),
    'avatar'
  )
  assert.equal(
    kindOf({ words: 'Find us / map', file: 'images/demo/map.jpg', boxes: { desktop: box(600, 400) } }),
    'map'
  )
  assert.equal(
    kindOf({
      words: 'Class / classes-video-thumb',
      file: 'images/demo/v.jpg',
      boxes: { desktop: box(1078, 607) }
    }),
    'video-poster'
  )
  assert.equal(
    kindOf({
      words: 'Footer / shape',
      file: 'images/demo/shape.jpg',
      source: { width: 900, height: 300, alpha: false },
      boxes: { desktop: box(900, 300) }
    }),
    'decoration'
  )
  assert.equal(kindOf({ words: 'Home / pattern', file: 'images/demo/dots.svg' }), 'icon')
  // A photo measured nowhere (no page shows it) is still a photo, by what its file is.
  assert.equal(
    kindOf({
      words: 'Blog / image_intro',
      file: 'images/demo/post.jpg',
      source: { width: 1200, height: 800, alpha: false }
    }),
    'photo'
  )
  assert.match(
    domain.pictureKindOf({
      words: 'x',
      file: 'images/demo/w1.png',
      source: { width: 150, height: 150, alpha: true },
      boxes: { desktop: box(100, 100) }
    }).why,
    /transparent/
  )
})

test('a map with Slot fit passes the check when every text and image slot carries a well-formed fit', () => {
  const res = domain.checkContentMapFit(mapWithFit())
  assert.deepEqual(res.errors, [])
  assert.equal(res.declared, true)
  assert.equal(res.ok, true)
  assert.deepEqual(res.missing, { image: 0, text: 0 })
  assert.deepEqual(res.slots, { image: 2, text: 1 })
})

test('a released map without Slot fit is not checked, and says how many slots lack it', () => {
  const map = mapWithFit()
  delete map.slotFitVersion
  delete map.fitGroups
  for (const slot of map.slots) delete slot.fit
  const res = domain.checkContentMapFit(map)
  assert.equal(res.declared, false)
  assert.equal(res.ok, true)
  assert.deepEqual(res.missing, { image: 2, text: 1 })
})

test('the check names a missing fit, a wrong version, an unknown kind and a broken box', () => {
  const map = mapWithFit()
  map.slotFitVersion = 'slot-fit/0'
  delete map.slots[2].fit
  map.slots[0].fit.kind = 'poster'
  map.slots[1].fit.boxes.desktop = box(0, 10)
  const res = domain.checkContentMapFit(map)
  assert.equal(res.ok, false)
  assert.deepEqual(res.missing, { image: 0, text: 1 })
  assert.ok(res.errors.some((e) => /slotFitVersion/.test(e)))
  assert.ok(res.errors.some((e) => /module-9\.2.*no fit/.test(e)))
  assert.ok(res.errors.some((e) => /module-9\.0.*unknown kind "poster"/.test(e)))
  assert.ok(res.errors.some((e) => /module-9\.1.*box desktop/.test(e)))
})

test('the keep flag of a picture follows its kind: a kept photo and a replaceable icon are both errors', () => {
  const map = mapWithFit()
  map.slots[0].customize = 'keep'
  delete map.slots[1].customize
  const res = domain.checkContentMapFit(map)
  assert.ok(
    res.errors.some((e) => /module-9\.0.*photo.*customize "keep"/.test(e)),
    res.errors.join('\n')
  )
  assert.ok(
    res.errors.some((e) => /module-9\.1.*icon.*customize "keep"/.test(e)),
    res.errors.join('\n')
  )
})

test('a slot no page shows carries a fit that says so, and passes', () => {
  const map = mapWithFit()
  map.slots[2].fit = { measured: false }
  map.slots[0].fit = { measured: false, kind: 'photo', replace: 'photo', transparent: null, source: null }
  assert.deepEqual(domain.checkContentMapFit(map).errors, [])
})

test('slotFitOf reads a slot fit, and null when it is missing or malformed', () => {
  const map = mapWithFit()
  assert.equal(domain.slotFitOf(map.slots[0]).kind, 'photo')
  assert.equal(domain.slotFitOf(map.slots[3]), null)
  assert.equal(domain.slotFitOf({ type: 'image', fit: { kind: 'poster' } }), null)
})
