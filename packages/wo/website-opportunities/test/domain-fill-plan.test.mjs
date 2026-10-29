// The fill plan (TracyHQ/tracy#133): a brief revision and a version 3 content map in, one decision per slot out, each
// with a reason code. Fixtures are fictional: a racket club brief and a trimmed template map.
import { test } from 'node:test'
import assert from 'node:assert/strict'
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

test('padel photos only reach the padel group; unsure photos only reach general slots', () => {
  const plan = planFill({ contentMap: CONTENT_MAP, brief: BRIEF })
  const at = decisionsOf(plan)
  // The cards are locked to the brief's offerings in order: the first card is tennis, the second padel.
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
  const at = decisionsOf(planFill({ contentMap: CONTENT_MAP, brief: BRIEF }))
  assert.deepEqual([at.get('module-2.2').action, at.get('module-2.2').reason], ['keep', 'role-keeps'])
  for (const key of ['article-9.0', 'article-9.1'])
    assert.deepEqual([at.get(key).action, at.get(key).reason], ['skip', 'demo-only-entity'], key)
  for (const key of ['module-2.2', 'article-9.0', 'article-9.1']) assert.equal(at.get(key).mediaId, undefined)
})

test('every slot gets one decision, and every decision carries a reason code a report can name', () => {
  const plan = planFill({ contentMap: CONTENT_MAP, brief: BRIEF })
  assert.deepEqual(
    plan.slots.map((d) => d.key),
    CONTENT_MAP.slots.map((s) => s.key)
  )
  for (const d of plan.slots) assert.ok(Object.hasOwn(FILL_REASONS, d.reason), `${d.key}: ${d.reason}`)
  // A coach slot never takes a stranger's face or a general photo while person matching is not there.
  const coach = plan.slots.find((d) => d.key === 'module-4.0')
  assert.deepEqual([coach.action, coach.reason], ['substitute', 'no-portrait'])
})

test('a padel card with no padel photo takes the substitute, never the tennis or an unsure photo, and says why', () => {
  const brief = { ...BRIEF, assets: BRIEF.assets.filter((a) => !a.id.startsWith('padel')) }
  const padel = decisionsOf(planFill({ contentMap: CONTENT_MAP, brief })).get('module-2.4')
  assert.equal(padel.action, 'substitute')
  assert.equal(padel.reason, 'no-photo-of-offering')
  assert.equal(padel.mediaId, undefined)
  // Refused: the tennis photo (another offering) and the general ones (unsure); the portrait is general but unsure too.
  assert.equal(padel.refused['wrong-offering'], 1)
  assert.equal(padel.refused.unsure, 4)
})

test('a card the brief has no offering for takes the substitute: offerings are never repeated across cards', () => {
  const brief = { ...BRIEF, reading: { services: BRIEF.reading.services.slice(0, 1) } }
  const at = decisionsOf(planFill({ contentMap: CONTENT_MAP, brief }))
  assert.equal(at.get('module-2.1').mediaId, 'tennis-1')
  assert.deepEqual(
    [at.get('module-2.4').action, at.get('module-2.4').reason],
    ['substitute', 'no-offering-for-group']
  )
})

test('offerings lock to the cards that show an offering photo first; a membership card takes no offering', () => {
  const tier = { id: 'module-5.item.0', item: 0, kind: 'package' }
  const priceOnly = { id: 'module-6.item.0', item: 0, kind: 'service' }
  const contentMap = {
    ...CONTENT_MAP,
    slots: [
      text('module-5.0', 'module-5', 'package.name', 'Demo Tier', tier),
      text('module-6.0', 'module-6', 'offering.name', 'Demo Gift Card', priceOnly),
      ...CONTENT_MAP.slots
    ]
  }
  const plan = planFill({ contentMap, brief: BRIEF })
  assert.deepEqual(
    plan.offerings.map((o) => o.groupId),
    ['module-2.item.0', 'module-2.item.1']
  )
  assert.equal(decisionsOf(plan).get('module-2.4').mediaId, 'padel-1')
})
