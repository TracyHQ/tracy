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
