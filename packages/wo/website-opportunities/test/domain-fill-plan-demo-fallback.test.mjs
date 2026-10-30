// The fill plan on a real-sized demo (TracyHQ/tracy#141): a dry run on a full template map and a real brief filled
// almost nothing, because a general slot refused every photo the brief linked to an offering, a photo could serve one
// slot in the whole site, and a slot with no fitting photo fell to a grey substitute. These pin the rules that replace
// that: a general slot takes any of the business's own photographs (general ones first), a logo or a drawing never fills
// a photo slot, a photo serves once per page, and only a fact picture (a person, a quote's author, a proof, a signature)
// takes a substitute; every other slot with no fitting photo keeps the template's demo picture.
// Fixtures are fictional: a racket club brief and a trimmed map.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFill } from '../domain/fill-plan.mjs'

const fit = (width, height, extra = {}) => ({
  measured: true,
  kind: 'photo',
  replace: 'photo',
  source: { width, height, format: 'jpg' },
  boxes: { desktop: { width, height } },
  ...extra
})
const image = (key, role, file, group = null, size = [800, 600], extra = {}) => ({
  key,
  entity: key.split('.')[0],
  type: 'image',
  sample: `images/demo/${file}`,
  label: key,
  role,
  ...(group ? { group } : {}),
  fit: fit(...size),
  ...extra
})
const card = (entity, n) => ({ id: `${entity}.item.${n}`, item: n, kind: 'service' })
const photo = (id, extra = {}) => ({
  id,
  kind: 'image',
  width: 1600,
  height: 1200,
  depicts: { id: 'general', evidence: { via: 'vision' } },
  portraitOf: null,
  isGraphic: false,
  faceBoxes: [],
  source: 'website',
  uploaderRole: 'owner',
  ...extra
})
const shows = (offering) => ({ depicts: { id: offering, evidence: { via: 'alt' } } })
const READING = {
  services: [
    { id: 'svc-tennis', label: 'Tennis Lessons' },
    { id: 'svc-padel', label: 'Padel Lessons' }
  ],
  team: [{ id: 'person-wren', label: 'Wren Example' }]
}
const entities = (...keys) => keys.map((key) => ({ key, kind: key.split('-')[0] }))
const at = (plan) => new Map(plan.slots.map((d) => [d.key, d]))

test('a general slot takes an offering photo when the brief has no general one, general photos first', () => {
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: entities('module-1', 'module-2'),
    slots: [
      image('module-1.0', 'business.hero_image', 'hero.jpg', null, [1200, 600]),
      image('module-2.0', 'business.gallery_image', 'g-1.jpg'),
      image('module-2.1', 'business.gallery_image', 'g-2.jpg')
    ]
  }
  const brief = {
    reading: READING,
    assets: [photo('padel-1', shows('svc-padel')), photo('hall'), photo('tennis-1', shows('svc-tennis'))]
  }
  const got = at(planFill({ contentMap, brief }))
  // The hero chooses first and meets the general photo; the gallery takes the offering photos after it.
  assert.deepEqual(
    ['module-1.0', 'module-2.0', 'module-2.1'].map((k) => [got.get(k).action, got.get(k).mediaId]),
    [
      ['photo', 'hall'],
      ['photo', 'padel-1'],
      ['photo', 'tennis-1']
    ]
  )
})

test('an unsure photo still never fills an offering card', () => {
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: entities('module-3'),
    slots: [image('module-3.0', 'offering.image', 'c-1.jpg', card('module-3', 0))]
  }
  const plan = planFill({
    contentMap,
    brief: { reading: READING, assets: [photo('unsure-1')] },
    cardNames: { 'module-3.item.0': 'Tennis Lessons' }
  })
  const d = at(plan).get('module-3.0')
  assert.equal(d.mediaId, undefined)
  assert.equal(d.refused.unsure, 1)
})

test('a logo or any picture that is not a photograph never fills a photo slot', () => {
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: entities('module-1'),
    slots: [image('module-1.0', 'business.hero_image', 'hero.jpg', null, [1000, 1000])]
  }
  const assets = [
    photo('profile-logo', { content: 'unlabelled', unlabelledReason: 'not_a_photograph', isGraphic: null }),
    photo('flag-logo', { isLogo: true }),
    photo('drawing', { content: 'not_a_photograph' })
  ]
  const d = at(planFill({ contentMap, brief: { reading: READING, assets } })).get('module-1.0')
  assert.equal(d.mediaId, undefined)
  assert.equal(d.refused['not-a-photograph'], 3)
})

test('a photo serves once per page: two pages may show the same photo, one page never twice', () => {
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: entities('module-1', 'module-2', 'module-3'),
    pages: [
      {
        entity: 'menuItem-1',
        route: 'home',
        assignedModules: [{ entity: 'module-1' }, { entity: 'module-2' }]
      },
      { entity: 'menuItem-2', route: 'about', assignedModules: [{ entity: 'module-3' }] }
    ],
    slots: [
      image('module-1.0', 'business.hero_image', 'hero.jpg', null, [1200, 600]),
      image('module-2.0', 'editorial.illustration', 'story.jpg'),
      image('module-3.0', 'editorial.illustration', 'team.jpg')
    ]
  }
  const got = at(planFill({ contentMap, brief: { reading: READING, assets: [photo('hall')] } }))
  assert.equal(got.get('module-1.0').mediaId, 'hall')
  // The home page already shows it in the hero: its second picture keeps the demo's.
  assert.deepEqual([got.get('module-2.0').action, got.get('module-2.0').reason], ['keep', 'no-general-photo'])
  assert.equal(got.get('module-3.0').mediaId, 'hall')
})

test('a non-fact picture with no fitting photo keeps the demo picture; a fact picture takes its substitute', () => {
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: entities('module-1', 'module-2', 'module-3', 'module-4', 'article-5'),
    slots: [
      image('module-1.0', 'business.hero_image', 'hero.jpg', null, [1200, 600]),
      image('module-2.0', 'business.gallery_image', 'g-1.jpg'),
      image('article-5.0', 'article.image', 'post-1.jpg'),
      image(
        'module-3.0',
        'person.image',
        'coach.jpg',
        { id: 'module-3.person.0', item: 0, kind: 'person' },
        [300, 300]
      ),
      image('module-4.0', 'quote.author_image', 'sign.png', null, [200, 60], {
        fit: fit(200, 60, { kind: 'signature' })
      })
    ]
  }
  const got = at(
    planFill({
      contentMap,
      brief: { reading: READING, assets: [] },
      cardNames: { 'module-3.person.0': 'Wren Example' }
    })
  )
  for (const key of ['module-1.0', 'module-2.0', 'article-5.0'])
    assert.deepEqual(
      [got.get(key).action, got.get(key).reason, got.get(key).substitute],
      ['keep', 'no-general-photo', undefined],
      key
    )
  assert.equal(got.get('module-3.0').action, 'substitute')
  assert.equal(got.get('module-3.0').substitute.kind, 'initials-avatar')
  assert.equal(got.get('module-4.0').action, 'substitute')
})

test("a demo picture cards of two offerings share never holds one offering's photo: a general photo, else the demo", () => {
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: entities('module-6'),
    slots: [
      image('module-6.0', 'offering.image', 'shared.jpg', card('module-6', 0)),
      image('module-6.1', 'offering.image', 'shared.jpg', card('module-6', 1)),
      image('module-6.2', 'offering.image', 'own.jpg', card('module-6', 1))
    ]
  }
  const plan = (assets) =>
    at(
      planFill({
        contentMap,
        brief: { reading: READING, assets },
        cardNames: { 'module-6.item.0': 'Tennis Lessons', 'module-6.item.1': 'Padel Lessons' }
      })
    )
  const offeringPhotos = [photo('tennis-1', shows('svc-tennis')), photo('padel-1', shows('svc-padel'))]
  const withHall = plan([...offeringPhotos, photo('hall')])
  assert.deepEqual(
    ['module-6.0', 'module-6.1', 'module-6.2'].map((k) => [withHall.get(k).action, withHall.get(k).mediaId]),
    [
      ['photo', 'hall'],
      ['photo', 'hall'],
      ['photo', 'padel-1']
    ]
  )
  const noGeneral = plan(offeringPhotos)
  assert.deepEqual(
    [
      noGeneral.get('module-6.0').action,
      noGeneral.get('module-6.0').reason,
      noGeneral.get('module-6.0').mediaId
    ],
    ['keep', 'conflicting-offerings', undefined]
  )
  // Cards of the same offering may share that offering's photo.
  const same = at(
    planFill({
      contentMap,
      brief: { reading: READING, assets: offeringPhotos },
      cardNames: { 'module-6.item.0': 'Tennis Lessons', 'module-6.item.1': 'Tennis Lessons' }
    })
  )
  assert.equal(same.get('module-6.0').mediaId, 'tennis-1')
})

test('a low-quality photo ranks below the others, and still fills a slot when nothing better fits', () => {
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: entities('module-2', 'module-3'),
    pages: [
      { entity: 'menuItem-1', route: 'home', assignedModules: [{ entity: 'module-2' }] },
      { entity: 'menuItem-2', route: 'about', assignedModules: [{ entity: 'module-3' }] }
    ],
    slots: [
      image('module-2.0', 'business.gallery_image', 'g-1.jpg'),
      image('module-3.0', 'editorial.illustration', 'story.jpg')
    ]
  }
  const ranked = at(
    planFill({
      contentMap,
      brief: {
        reading: READING,
        assets: [photo('a-blurry', { quality: 'low' }), photo('b-sharp', { quality: 'high' })]
      }
    })
  )
  assert.equal(ranked.get('module-2.0').mediaId, 'b-sharp')
  const only = at(
    planFill({ contentMap, brief: { reading: READING, assets: [photo('a-blurry', { quality: 'low' })] } })
  )
  assert.equal(only.get('module-3.0').mediaId, 'a-blurry')
})

test('a wide general slot may cut up to 70% of a photo when its subject and faces stay whole, and says so', () => {
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: entities('module-1', 'module-2'),
    slots: [
      image('module-1.0', 'business.hero_image', 'hero.jpg', null, [1200, 400]),
      image('module-2.0', 'editorial.illustration', 'story.jpg', null, [1200, 400])
    ]
  }
  // A square 1600 px photo cut to 3:1 keeps 1600 x 533: it loses 67%, past the usual half.
  const square = (id, extra) => photo(id, { width: 1600, height: 1600, ...extra })
  const got = at(
    planFill({
      contentMap,
      brief: {
        reading: READING,
        assets: [
          square('court', { subjectBox: [0.2, 0.4, 0.6, 0.2], faceBoxes: [[0.4, 0.45, 0.05, 0.05]] }),
          square('crowd', { subjectBox: [0.1, 0.1, 0.8, 0.8] })
        ]
      }
    })
  )
  const hero = got.get('module-1.0')
  assert.deepEqual([hero.action, hero.reason, hero.mediaId], ['photo', 'general-photo-wide-crop', 'court'])
  // The subject does not fit a 3:1 band: the other wide slot keeps the demo picture rather than cut it.
  assert.deepEqual([got.get('module-2.0').action, got.get('module-2.0').refused['crop-loss']], ['keep', 1])
  // A photo with no subject box is never cut past the usual half.
  const blind = at(planFill({ contentMap, brief: { reading: READING, assets: [square('plain')] } }))
  assert.equal(blind.get('module-1.0').action, 'keep')
})

test('more offering cards than brief offerings: the extra cards keep their demo picture and say why', () => {
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: entities('module-7'),
    slots: [0, 1, 2].map((n) => image(`module-7.${n}`, 'offering.image', `c-${n}.jpg`, card('module-7', n)))
  }
  const got = at(
    planFill({
      contentMap,
      brief: {
        reading: READING,
        assets: [photo('tennis-1', shows('svc-tennis')), photo('padel-1', shows('svc-padel'))]
      },
      cardNames: { 'module-7.item.0': 'Tennis Lessons', 'module-7.item.1': 'Padel Lessons' }
    })
  )
  assert.deepEqual([got.get('module-7.0').mediaId, got.get('module-7.1').mediaId], ['tennis-1', 'padel-1'])
  assert.deepEqual(
    [got.get('module-7.2').action, got.get('module-7.2').reason, got.get('module-7.2').substitute],
    ['keep', 'no-offering-for-group', undefined]
  )
})
