// The fill plan (TracyHQ/tracy#133): a brief revision and a version 3 content map in, one decision per slot out, each
// with a reason code. Fixtures are fictional: a racket club brief and a trimmed template map.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FILL_REASONS, cardNamesOf, planFill } from '../domain/fill-plan.mjs'

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
const card = (n) => ({ id: `module-2.item.${n}`, item: n, kind: 'service' })

/** A fictional template: a hero, two class cards (each with a name, a photo and a kept icon), a gallery, a coach. */
const CONTENT_MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [
    { key: 'module-1', kind: 'module' },
    { key: 'module-2', kind: 'module' },
    { key: 'module-3', kind: 'module' },
    { key: 'module-4', kind: 'module' },
    { key: 'article-9', kind: 'article', demoOnly: true }
  ],
  slots: [
    image('module-1.0', 'module-1', 'business.hero_image', 'hero/slide-1.jpg', null, [1920, 960]),
    text('module-2.0', 'module-2', 'offering.name', 'Demo Class One', card(0)),
    image('module-2.1', 'module-2', 'offering.image', 'classes/item-1.jpg', card(0), [800, 600]),
    image('module-2.2', 'module-2', 'editorial.item_icon', 'icons/icon-1.png', card(0), [64, 64], {
      customize: 'keep',
      fit: fit(64, 64, { kind: 'icon', replace: 'keep', transparent: true })
    }),
    text('module-2.3', 'module-2', 'offering.name', 'Demo Class Two', card(1)),
    image('module-2.4', 'module-2', 'offering.image', 'classes/item-2.jpg', card(1), [800, 600]),
    image('module-3.0', 'module-3', 'business.gallery_image', 'gallery/g-1.jpg', null, [800, 600]),
    image('module-3.1', 'module-3', 'business.gallery_image', 'gallery/g-2.jpg', null, [800, 600]),
    image('module-4.0', 'module-4', 'person.image', 'team/coach-1.jpg', null, [600, 800]),
    text('article-9.0', 'article-9', 'editorial.heading', 'Heading samples'),
    image('article-9.1', 'article-9', 'editorial.illustration', 'style/sample.jpg', null, [800, 600])
  ]
}

const photo = (id, width, height, relations = {}) => ({
  id,
  kind: 'image',
  width,
  height,
  depicts: { id: 'general', evidence: { via: 'vision' } },
  portraitOf: null,
  isGraphic: false,
  ...relations
})
const shows = (offering) => ({ depicts: { id: offering, evidence: { via: 'alt' } } })

const BRIEF = {
  reading: {
    services: [
      { id: 'svc-tennis', label: 'Tennis Lessons' },
      { id: 'svc-padel', label: 'Padel Lessons' }
    ]
  },
  assets: [
    photo('court-wide', 2400, 1200),
    photo('padel-1', 1200, 900, shows('svc-padel')),
    photo('padel-2', 1200, 900, shows('svc-padel')),
    photo('tennis-1', 1200, 900, shows('svc-tennis')),
    photo('unsure-1', 1200, 900),
    photo('unsure-2', 1200, 900),
    photo('coach-face', 900, 1200, { portraitOf: { id: 'person-1', evidence: { via: 'alt' } } })
  ]
}

const decisionsOf = (plan) => new Map(plan.slots.map((d) => [d.key, d]))
/** The names the text path writes on the two class cards: the photo of a card must show the offering its name says. */
const CARDS = { 'module-2.item.0': 'Tennis Lessons', 'module-2.item.1': 'Padel Lessons' }

test('padel photos only reach the padel group; unsure photos only reach general slots', () => {
  const plan = planFill({ contentMap: CONTENT_MAP, brief: BRIEF, cardNames: CARDS })
  const at = decisionsOf(plan)
  // Each card is locked to the offering its name says: the first card is tennis, the second padel.
  assert.deepEqual(
    plan.offerings.map((o) => [o.groupId, o.offeringId]),
    [
      ['module-2.item.0', 'svc-tennis'],
      ['module-2.item.1', 'svc-padel']
    ]
  )
  assert.equal(at.get('module-2.1').mediaId, 'tennis-1')
  assert.equal(at.get('module-2.4').mediaId, 'padel-1')
  const general = ['module-1.0', 'module-3.0', 'module-3.1'].map((k) => at.get(k).mediaId)
  assert.deepEqual(general, ['court-wide', 'unsure-1', 'unsure-2'])
  // No offering photo and no portrait lands in a general slot: the second padel photo stays unused.
  assert.ok(plan.unused.includes('padel-2'))
  assert.ok(plan.unused.includes('coach-face'))
  for (const [key, d] of at)
    if (d.mediaId?.startsWith('padel')) assert.equal(key, 'module-2.4', `${d.mediaId} reached ${key}`)
})

test('a keep slot and every slot of a demo-only entity are never filled', () => {
  const at = decisionsOf(planFill({ contentMap: CONTENT_MAP, brief: BRIEF, cardNames: CARDS }))
  assert.deepEqual([at.get('module-2.2').action, at.get('module-2.2').reason], ['keep', 'role-keeps'])
  for (const key of ['article-9.0', 'article-9.1'])
    assert.deepEqual([at.get(key).action, at.get(key).reason], ['skip', 'demo-only-entity'], key)
  for (const key of ['module-2.2', 'article-9.0', 'article-9.1']) assert.equal(at.get(key).mediaId, undefined)
})

test('every slot gets one decision, and every decision carries a reason code a report can name', () => {
  const plan = planFill({ contentMap: CONTENT_MAP, brief: BRIEF, cardNames: CARDS })
  assert.deepEqual(
    plan.slots.map((d) => d.key),
    CONTENT_MAP.slots.map((s) => s.key)
  )
  for (const d of plan.slots) assert.ok(Object.hasOwn(FILL_REASONS, d.reason), `${d.key}: ${d.reason}`)
  // A coach slot never takes a stranger's face or a general photo while person matching is not there.
  const coach = plan.slots.find((d) => d.key === 'module-4.0')
  assert.deepEqual([coach.action, coach.reason], ['substitute', 'no-portrait'])
})

test('a padel card with no padel photo keeps the demo picture, never the tennis or an unsure photo, and says why', () => {
  const brief = { ...BRIEF, assets: BRIEF.assets.filter((a) => !a.id.startsWith('padel')) }
  const padel = decisionsOf(planFill({ contentMap: CONTENT_MAP, brief, cardNames: CARDS })).get('module-2.4')
  assert.equal(padel.action, 'keep')
  assert.equal(padel.reason, 'no-photo-of-offering')
  assert.equal(padel.mediaId, undefined)
  // Refused: the tennis photo (another offering) and the general ones (unsure); the portrait is general but unsure too.
  assert.equal(padel.refused['wrong-offering'], 1)
  assert.equal(padel.refused.unsure, 4)
})

test("a card's name and its photo name the same offering, whatever order the brief lists them in", () => {
  // The brief lists tennis first; the template's first card is named for padel by the text path.
  const cardNames = { 'module-2.item.0': 'PADEL LESSONS', 'module-2.item.1': 'Tennis Lessons for all ages' }
  const plan = planFill({ contentMap: CONTENT_MAP, brief: BRIEF, cardNames })
  assert.deepEqual(
    plan.offerings.map((o) => [o.groupId, o.offeringId]),
    [
      ['module-2.item.0', 'svc-padel'],
      ['module-2.item.1', 'svc-tennis']
    ]
  )
  const at = decisionsOf(plan)
  assert.equal(at.get('module-2.1').mediaId, 'padel-1')
  assert.equal(at.get('module-2.4').mediaId, 'tennis-1')
})

test('a card whose name is unknown, or names no offering of the brief, keeps the demo picture', () => {
  const named = decisionsOf(
    planFill({
      contentMap: CONTENT_MAP,
      brief: BRIEF,
      cardNames: { 'module-2.item.0': 'Tennis Lessons', 'module-2.item.1': 'Squash Clinic' }
    })
  )
  assert.equal(named.get('module-2.1').mediaId, 'tennis-1')
  assert.deepEqual(
    [named.get('module-2.4').action, named.get('module-2.4').reason],
    ['keep', 'no-offering-for-group']
  )
  // No names from the text path at all: no card is guessed by position.
  const blind = decisionsOf(planFill({ contentMap: CONTENT_MAP, brief: BRIEF }))
  for (const key of ['module-2.1', 'module-2.4'])
    assert.deepEqual([blind.get(key).action, blind.get(key).reason], ['keep', 'no-offering-for-group'])
})

test("the card names are the text path's sourced offering names; a neutral placeholder names nothing", () => {
  const names = cardNamesOf(CONTENT_MAP, {
    pins: { 'module-2.0': 'Padel Lessons', 'module-2.3': 'Service' },
    sources: { 'module-2.0': 'off-7', 'module-2.3': 'placeholder' }
  })
  assert.deepEqual(names, { 'module-2.item.0': 'Padel Lessons' })
})
