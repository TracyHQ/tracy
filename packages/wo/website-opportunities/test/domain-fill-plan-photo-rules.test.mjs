// The fill plan's photo rules (TracyHQ/tracy#134, #135, #136): a person slot takes the named person's portrait or an
// initials avatar, the owner's photos rank first and a map photo posted by someone else never fills an identity slot, and
// a crop centres on the subject and never cuts a face. Fixtures are fictional: a boxing studio brief and a trimmed map.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placementOfFill } from '../domain/fill-placement.mjs'
import { FILL_REASONS, planFill } from '../domain/fill-plan.mjs'

const fit = (width, height, extra = {}) => ({
  measured: true,
  kind: 'photo',
  replace: 'photo',
  transparent: false,
  source: { width, height, format: 'jpg' },
  aspect: Number((width / height).toFixed(4)),
  tolerance: 0.02,
  crop: 'cover',
  ...extra
})
const image = (key, entity, role, file, group, size, extra = {}) => ({
  key,
  entity,
  type: 'image',
  sample: `images/demo/${file}`,
  label: key,
  role,
  ...(group ? { group } : {}),
  fit: fit(...size),
  ...extra
})
const text = (key, entity, role, sample, group) => ({
  key,
  entity,
  type: 'text',
  sample,
  label: key,
  role,
  ...(group ? { group } : {})
})
const person = (n) => ({ id: `module-5.person.${n}`, item: n, kind: 'person' })
const gallery = (n) => ({ id: `module-3.gallery.${n}`, item: n, kind: 'gallery' })

/** A fictional template: a hero, an about picture, a two-picture gallery and two coach cards. */
const CONTENT_MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: ['module-1', 'module-2', 'module-3', 'module-5'].map((key) => ({ key, kind: 'module' })),
  slots: [
    image('module-1.0', 'module-1', 'business.hero_image', 'hero/slide-1.jpg', null, [1600, 800]),
    image('module-2.0', 'module-2', 'editorial.illustration', 'about/story.jpg', null, [800, 600]),
    image('module-3.0', 'module-3', 'business.gallery_image', 'gallery/g-1.jpg', gallery(0), [800, 600]),
    image('module-3.1', 'module-3', 'business.gallery_image', 'gallery/g-2.jpg', gallery(1), [800, 600]),
    text('module-5.0', 'module-5', 'person.name', 'Demo Coach One', person(0)),
    image('module-5.1', 'module-5', 'person.image', 'team/coach-1.jpg', person(0), [600, 600]),
    text('module-5.2', 'module-5', 'person.name', 'Demo Coach Two', person(1)),
    image('module-5.3', 'module-5', 'person.image', 'team/coach-2.jpg', person(1), [600, 600])
  ]
}

const photo = (id, width, height, extra = {}) => ({
  id,
  kind: 'image',
  width,
  height,
  depicts: { id: 'general', evidence: { via: 'vision' } },
  portraitOf: null,
  isGraphic: false,
  faceBoxes: [],
  source: 'website',
  uploaderRole: 'owner',
  ...extra
})
const portrait = (who) => ({ portraitOf: { id: who, evidence: { via: 'alt' } } })

const fromMap = { source: 'google-places', uploaderRole: 'customer', isOwnPhoto: false }

const READING = {
  team: [
    { id: 'person-wren', label: 'Wren Example' },
    { id: 'person-juno', label: 'Juno Sample' }
  ]
}
const NAMES = { 'module-5.person.0': 'Wren Example', 'module-5.person.1': 'Juno Sample' }
const at = (plan) => new Map(plan.slots.map((d) => [d.key, d]))
const plan = (assets, cardNames = NAMES) =>
  at(planFill({ contentMap: CONTENT_MAP, brief: { reading: READING, assets }, cardNames }))

test('#134 a brief with a portrait of a named coach puts that portrait in the coach slot', () => {
  const got = plan([photo('wren-portrait', 900, 900, portrait('person-wren'))])
  assert.deepEqual(
    [got.get('module-5.1').action, got.get('module-5.1').reason, got.get('module-5.1').mediaId],
    ['photo', 'person-portrait', 'wren-portrait']
  )
  // The other coach has no portrait: the first coach's portrait never stands in for her.
  assert.equal(got.get('module-5.3').mediaId, undefined)
})

test('#134 a named person with no portrait gets an initials avatar in the frame of the slot', () => {
  const got = plan([photo('wren-portrait', 900, 900, portrait('person-wren'))])
  const juno = got.get('module-5.3')
  assert.deepEqual([juno.action, juno.reason], ['substitute', 'no-portrait'])
  assert.deepEqual(juno.substitute, {
    kind: 'initials-avatar',
    initials: 'JS',
    personId: 'person-juno',
    frame: { width: 600, height: 600 }
  })
  // A card that names nobody the brief lists gets a neutral avatar: no initials, never a guessed name.
  const nobody = plan([], { 'module-5.person.0': 'Wren Example' }).get('module-5.3')
  assert.deepEqual(nobody.substitute, {
    kind: 'initials-avatar',
    initials: '',
    frame: { width: 600, height: 600 }
  })
})

test('#134 a photo whose face is not linked to the named person is refused with its reason', () => {
  const got = plan([
    photo('stranger', 900, 900, { faceBoxes: [[0.4, 0.2, 0.2, 0.3]], peopleCount: 1 }),
    photo('juno-portrait', 900, 900, portrait('person-juno'))
  ])
  const wren = got.get('module-5.1')
  assert.deepEqual([wren.action, wren.reason], ['substitute', 'no-portrait'])
  assert.equal(wren.refused['face-not-linked'], 1)
  assert.equal(wren.refused['portrait-of-another'], 1)
  // A stranger's face reaches no slot of a person, not even as a general photo: it is not in the coach cards.
  assert.equal(got.get('module-5.3').mediaId, 'juno-portrait')
})

test('#134 the initials avatar reaches the picture writer in place of the plain placeholder', () => {
  const contentMap = CONTENT_MAP
  const fill = planFill({ contentMap, brief: { reading: READING, assets: [] }, cardNames: NAMES })
  const groups = ['team/coach-1.jpg', 'team/coach-2.jpg'].map((file, n) => ({
    id: `g${n}`,
    file: `images/demo/${file}`,
    occurrences: [{ key: `module-5.${n * 2 + 1}` }],
    routes: ['/'],
    demo: { width: 600, height: 600 }
  }))
  const { plan: placed } = placementOfFill({ fill, groups })
  assert.deepEqual(
    placed.unfilled.map((u) => [u.groupId, u.action, u.avatar?.initials]),
    [
      ['g0', 'placeholder', 'WE'],
      ['g1', 'placeholder', 'JS']
    ]
  )
})

test('every new decision carries a reason code a report can name', () => {
  const got = plan([photo('stranger', 900, 900, { faceBoxes: [[0.4, 0.2, 0.2, 0.3]] })])
  for (const d of got.values()) assert.ok(Object.hasOwn(FILL_REASONS, d.reason), `${d.key}: ${d.reason}`)
})

test('#134 initials fold an accented name to its base letters', () => {
  const got = at(
    planFill({
      contentMap: CONTENT_MAP,
      brief: { reading: { team: [{ id: 'person-elo', label: '\u00c9lo\u00efse van Example' }] }, assets: [] },
      cardNames: { 'module-5.person.0': '\u00c9lo\u00efse van Example' }
    })
  )
  assert.equal(got.get('module-5.1').substitute.initials, 'EE')
})

test('#135 with an owner photo and a map photo both qualifying, the owner photo wins', () => {
  // One general slot that is not an identity slot: a map photo may fill it, but the owner's ranks first even when the
  // map photo fits the frame better.
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'article-4', kind: 'article' }],
    slots: [image('article-4.0', 'article-4', 'article.image', 'blog/post-1.jpg', null, [800, 600])]
  }
  const assets = [
    photo('a-map-court', 1200, 900, fromMap),
    photo('b-owner-court', 1200, 1000),
    photo('c-own-by-look', 1200, 1000, { source: 'unknown', uploaderRole: 'unknown', isOwnPhoto: true })
  ]
  const got = at(planFill({ contentMap, brief: { reading: READING, assets } }))
  assert.equal(got.get('article-4.0').mediaId, 'b-owner-court')
  // Without the owner's upload, a photo the vision model read as the business's own still beats the map photo.
  const second = at(planFill({ contentMap, brief: { reading: READING, assets: [assets[0], assets[2]] } }))
  assert.equal(second.get('article-4.0').mediaId, 'c-own-by-look')
})

test('#135 a map photo posted by someone else is refused for the hero and about slots with its reason', () => {
  const got = plan([
    photo('map-wide', 2400, 1200, fromMap),
    photo('map-room', 1200, 900, fromMap),
    photo('owner-room', 1000, 750)
  ])
  const hero = got.get('module-1.0')
  // No photo of its own fits: the hero keeps the template's picture (a non-fact slot, #141).
  assert.deepEqual([hero.action, hero.reason], ['keep', 'no-general-photo'])
  assert.equal(hero.refused['map-photo-by-others'], 2)
  const about = got.get('module-2.0')
  assert.deepEqual([about.action, about.mediaId], ['photo', 'owner-room'])
})

test('#135 a brief with only map photos leaves every identity slot to the neutral rule, never the map photo', () => {
  const got = plan([
    photo('map-1', 2400, 1200, fromMap),
    photo('map-2', 1200, 900, fromMap),
    photo('map-3', 1200, 900, { source: 'tripadvisor', uploaderRole: 'unknown' })
  ])
  // Hero, about and the gallery's lead picture keep the template's, each saying it refused the map photos (#141).
  for (const key of ['module-1.0', 'module-2.0', 'module-3.0']) {
    const d = got.get(key)
    assert.deepEqual([d.action, d.reason, d.mediaId], ['keep', 'no-general-photo', undefined], key)
    assert.ok(d.refused['map-photo-by-others'] >= 2, key)
  }
  // A gallery picture after the lead is not an identity slot: a map photo may show the place there.
  assert.equal(got.get('module-3.1').action, 'photo')
})

/** Where a crop sits in the photo, in pixels: the box of its `source` size placed at its `at` share of the free room. */
const rectOf = (crop, size) => {
  assert.equal(crop.strategy, 'subject')
  const free = { x: size.width - crop.source.width, y: size.height - crop.source.height }
  return {
    left: Math.round(free.x * crop.at.x),
    top: Math.round(free.y * crop.at.y),
    width: crop.source.width,
    height: crop.source.height
  }
}
const inside = (rect, [x, y, w, h], size) =>
  rect.left <= x * size.width &&
  rect.top <= y * size.height &&
  rect.left + rect.width >= (x + w) * size.width &&
  rect.top + rect.height >= (y + h) * size.height

test('#136 a crop keeps every face box whole, and a photo whose faces no crop can keep whole is refused', () => {
  const size = { width: 1200, height: 900 }
  const face = [0.02, 0.1, 0.2, 0.3]
  const got = plan([
    photo('wren', 1200, 900, {
      ...portrait('person-wren'),
      faceBoxes: [face],
      subjectBox: [0.3, 0.1, 0.4, 0.8]
    })
  ])
  const wren = got.get('module-5.1')
  assert.equal(wren.mediaId, 'wren')
  assert.ok(inside(rectOf(wren.crop, size), face, size), JSON.stringify(wren.crop))
  // Two faces at both edges of a wide photo: a square crop would cut one of them, so the photo is refused.
  const wide = plan([
    photo('pair', 1200, 900, {
      ...portrait('person-wren'),
      faceBoxes: [
        [0.02, 0.1, 0.12, 0.2],
        [0.85, 0.1, 0.12, 0.2]
      ]
    })
  ]).get('module-5.1')
  assert.deepEqual([wide.action, wide.refused['cuts-a-face']], ['substitute', 1])
})

test('#136 a crop centres on the subject box, as far as the photo allows', () => {
  const size = { width: 1200, height: 900 }
  const got = plan([
    photo('wren', 1200, 900, { ...portrait('person-wren'), subjectBox: [0.35, 0.2, 0.2, 0.6] })
  ])
  // The subject's centre is at 540 px: a 900 px square centred on it would start at 90.
  assert.equal(rectOf(got.get('module-5.1').crop, size).left, 90)
  const right = plan([
    photo('wren', 1200, 900, { ...portrait('person-wren'), subjectBox: [0.6, 0.2, 0.3, 0.6] })
  ])
  // Centred on 900 px it would leave the photo: it stops at the right edge.
  assert.equal(rectOf(right.get('module-5.1').crop, size).left, 300)
})

/** A class card and a gallery picture of the same 4:3 frame. */
const CARD_MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [{ key: 'module-6', kind: 'module' }],
  slots: [
    text('module-6.0', 'module-6', 'offering.name', 'Demo Class', {
      id: 'module-6.item.0',
      item: 0,
      kind: 'service'
    }),
    image(
      'module-6.1',
      'module-6',
      'offering.image',
      'classes/c-1.jpg',
      { id: 'module-6.item.0', item: 0, kind: 'service' },
      [800, 600]
    ),
    image('module-6.2', 'module-6', 'business.gallery_image', 'gallery/g-9.jpg', null, [800, 600])
  ]
}
const CLASSES = { services: [{ id: 'svc-padel', label: 'Padel Lessons' }] }
const cardPlan = (assets) =>
  at(
    planFill({
      contentMap: CARD_MAP,
      brief: { reading: CLASSES, assets },
      cardNames: { 'module-6.item.0': 'Padel Lessons' }
    })
  )

test("#136 a matching photo that today's crop limit refuses is accepted; a photo that does not match is still refused", () => {
  // 2000 x 600 cut to 4:3 keeps 800 x 600: it loses 60% of the photo, past today's limit of half.
  const got = cardPlan([
    photo('padel-wide', 2000, 600, { depicts: { id: 'svc-padel', evidence: { via: 'alt' } } }),
    photo('room-wide', 2000, 600)
  ])
  assert.deepEqual([got.get('module-6.1').action, got.get('module-6.1').mediaId], ['photo', 'padel-wide'])
  const gallery = got.get('module-6.2')
  assert.deepEqual([gallery.action, gallery.refused['crop-loss']], ['keep', 1])
  // Even a match is refused when the crop would keep too little of it.
  const panorama = cardPlan([
    photo('padel-pano', 4000, 600, { depicts: { id: 'svc-padel', evidence: { via: 'alt' } } })
  ])
  assert.deepEqual(
    [panorama.get('module-6.1').action, panorama.get('module-6.1').refused['crop-loss']],
    ['keep', 1]
  )
})

test('#136 a photo below the slot minimum after its crop is refused with the reason too-small-after-crop', () => {
  const minWidth = 534
  const contentMap = {
    ...CONTENT_MAP,
    slots: CONTENT_MAP.slots.map((s) => (s.key === 'module-5.1' ? { ...s, fit: { ...s.fit, minWidth } } : s))
  }
  const brief = (side) => ({ reading: READING, assets: [photo('wren', side, side, portrait('person-wren'))] })
  // 400 px enlarged to the slot's 534 px minimum is more than a quarter: refused. 440 px is enough.
  const small = at(planFill({ contentMap, brief: brief(400), cardNames: NAMES })).get('module-5.1')
  assert.deepEqual(
    [small.action, small.reason, small.refused['too-small-after-crop']],
    ['substitute', 'no-portrait', 1]
  )
  assert.equal(small.substitute.initials, 'WE')
  const enough = at(planFill({ contentMap, brief: brief(440), cardNames: NAMES })).get('module-5.1')
  assert.equal(enough.mediaId, 'wren')
})

test('#136 no frame changes shape: every photo is cut and written at the aspect of its slot', () => {
  const frames = new Map(
    [...CONTENT_MAP.slots, ...CARD_MAP.slots].filter((s) => s.fit).map((s) => [s.key, s.fit.source])
  )
  const decisions = [
    ...plan([
      photo('wide', 2400, 1300),
      photo('room', 1300, 1000),
      photo('tall', 900, 1400),
      photo('wren', 1000, 1250, { ...portrait('person-wren'), faceBoxes: [[0.3, 0.05, 0.3, 0.25]] })
    ]).values(),
    ...cardPlan([
      photo('padel', 1900, 700, { depicts: { id: 'svc-padel', evidence: { via: 'alt' } } })
    ]).values()
  ].filter((d) => d.action === 'photo')
  assert.ok(decisions.length >= 4)
  for (const d of decisions) {
    const frame = frames.get(d.key)
    const aspect = frame.width / frame.height
    assert.ok(Math.abs(d.crop.output.width / d.crop.output.height - aspect) <= 0.005, d.key)
    assert.ok(Math.abs(d.crop.source.width / d.crop.source.height - aspect) <= 0.01, d.key)
  }
})

test('#134 a demo picture shared by a coach card and a class card takes neither the portrait nor the class photo', () => {
  const coach = { id: 'module-7.person.0', item: 0, kind: 'person' }
  const card = { id: 'module-7.item.0', item: 0, kind: 'service' }
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'module-7', kind: 'module' }],
    slots: [
      text('module-7.0', 'module-7', 'person.name', 'Demo Coach', coach),
      image('module-7.1', 'module-7', 'person.image', 'shared/one.jpg', coach, [600, 600]),
      text('module-7.2', 'module-7', 'offering.name', 'Demo Class', card),
      image('module-7.3', 'module-7', 'offering.image', 'shared/one.jpg', card, [600, 600])
    ]
  }
  const got = at(
    planFill({
      contentMap,
      brief: {
        reading: { ...READING, services: [{ id: 'svc-padel', label: 'Padel Lessons' }] },
        assets: [photo('wren', 900, 900, portrait('person-wren'))]
      },
      cardNames: { 'module-7.person.0': 'Wren Example', 'module-7.item.0': 'Padel Lessons' }
    })
  )
  for (const key of ['module-7.1', 'module-7.3'])
    assert.deepEqual([got.get(key).action, got.get(key).reason], ['substitute', 'conflicting-needs'], key)
})

test('the size minimum is the box the slot is drawn in at the desktop viewport, not the demo file or its minWidth', () => {
  // A hero drawn 1440 px wide on a desktop, measured with minWidth 2160 (1.5 x the box) and a 1920 px demo file: a
  // 1500 px brief photo fills it (the 1920 px file would need 1.28x, the 1440 px box none), a 1100 px one would be enlarged past 1.25.
  const heroFit = fit(1920, 960, {
    minWidth: 2160,
    boxes: { desktop: { width: 1440, height: 720 }, phone: { width: 390, height: 195 } }
  })
  const contentMap = {
    ...CONTENT_MAP,
    slots: CONTENT_MAP.slots.map((s) => (s.key === 'module-1.0' ? { ...s, fit: heroFit } : s))
  }
  const heroOf = (width) =>
    at(
      planFill({
        contentMap,
        brief: { reading: READING, assets: [photo('club-hall', width, Math.round(width / 1.5))] },
        cardNames: NAMES
      })
    ).get('module-1.0')
  const wide = heroOf(1500)
  assert.deepEqual([wide.action, wide.mediaId], ['photo', 'club-hall'])
  const narrow = heroOf(1100)
  assert.deepEqual([narrow.action, narrow.refused['too-small-after-crop']], ['keep', 1])
})

test('a signature picture with no brief signature takes the owner name in a script font; with no signer it is blank', () => {
  const signatureFit = {
    measured: true,
    kind: 'signature',
    replace: 'photo',
    source: { width: 120, height: 90, format: 'png' },
    boxes: { desktop: { width: 120, height: 90 } }
  }
  const contentMap = {
    ...CONTENT_MAP,
    entities: [...CONTENT_MAP.entities, { key: 'module-8', kind: 'module' }],
    slots: [
      ...CONTENT_MAP.slots,
      {
        ...image('module-8.0', 'module-8', 'quote.author_image', 'others/sign.png', null, [120, 90]),
        fit: signatureFit
      }
    ]
  }
  const reading = { team: [...READING.team, { id: 'person-ivo', label: 'Ivo Founder', role: 'Founder' }] }
  const signed = at(planFill({ contentMap, brief: { reading, assets: [] }, cardNames: NAMES })).get(
    'module-8.0'
  )
  assert.equal(signed.action, 'substitute')
  assert.equal(signed.substitute.kind, 'script-signature')
  assert.equal(signed.substitute.text, 'Ivo Founder')
  assert.match(signed.substitute.svg, /^<svg [^>]*width="120" height="90"/)
  const blank = at(planFill({ contentMap, brief: { reading: READING, assets: [] }, cardNames: NAMES })).get(
    'module-8.0'
  )
  assert.deepEqual(blank.substitute, { kind: 'blank', reason: 'no-signer-name' })
})

test('the plan names the person each person card holds, beside the offering of each offering card', () => {
  const got = planFill({ contentMap: CONTENT_MAP, brief: { reading: READING, assets: [] }, cardNames: NAMES })
  assert.deepEqual(got.people, [
    { groupId: 'module-5.person.0', personId: 'person-wren', label: 'Wren Example' },
    { groupId: 'module-5.person.1', personId: 'person-juno', label: 'Juno Sample' }
  ])
})
