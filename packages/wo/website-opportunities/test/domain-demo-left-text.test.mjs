// Spec TracyHQ/tracy#189 (leftover kinds C03, C09): a text slot the site plan gives the copy writer never keeps the demo's
// words on a brief build. Whatever the writer left (pended, unanswered, refused, or only renamed inside the demo's sentence)
// takes the plan's fallback, the role's neutral words, the business's own description, or nothing. Templates and businesses
// are made up; the same rules judge two trades.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDemoLeft, leftDemoText } from '../domain/demo-left-text.mjs'

const slot = (key, role, sample, extra = {}) => ({
  key,
  entity: key.split('.')[0],
  type: 'text',
  role,
  sample,
  maxCharacters: 300,
  ...extra
})

/** A fitness template's demo, shown on its home page. */
const fitness = [
  slot(
    'article-14.0',
    'editorial.paragraph',
    'Nulla pretium viverra augue, in tincidunt nibh suscipit vitae.'
  ),
  slot(
    'article-14.3',
    'offering.description',
    'We opened Studio Ironfist in 2008, with a method that celebrates all the benefits of kickboxing in a motivating room.'
  ),
  slot('article-14.4', 'offering.name', 'Beginner Kickboxing', {
    group: { id: 'article-14.offering', item: 0, kind: 'service' }
  }),
  slot(
    'module-165.6',
    'step.description',
    '((p))Begin each training session with a dynamic warm-up and skipping rope drills.((/p))'
  ),
  slot('module-165.2', 'step.title', 'Sparring', {
    group: { id: 'module-165.step.0', item: 0, kind: 'step' }
  }),
  slot('module-165.3', 'step.title', 'Basic', { group: { id: 'module-165.step.1', item: 1, kind: 'step' } }),
  slot('module-170.0', 'editorial.heading', 'Prep for your first punch session'),
  slot(
    'module-170.1',
    'editorial.paragraph',
    'Gloves, wraps and a towel are all you need to start sparring with us.'
  ),
  slot('module-171.0', 'editorial.paragraph', 'Welcome {site.name}'),
  slot('module-172.0', 'editorial.paragraph', 'Rest thirty seconds between rounds of heavy bag drills.')
]
const fitnessPages = [
  {
    entity: 'menuItem-101',
    link: 'index.php?option=com_content&view=featured',
    assignedModules: [{ entity: 'module-165' }, { entity: 'module-170' }, { entity: 'module-171' }]
  },
  { entity: 'menuItem-102', link: 'index.php?option=com_content&view=article&id=14' }
]
const asked = fitness.map((s) => s.key)
const pool = {
  ownText: 'Harbourline Swim School. Swimming lessons for children and adults in Port Arden.',
  description: 'Harbourline Swim School teaches swimming to children and adults in Port Arden.',
  business: { phone: '+44 20 7946 0000' }
}

test('isDemoLeft: an unanswered sample, lorem ipsum and a renamed demo sentence are the demo; new words are not', () => {
  const own = new Set(['harbourline', 'swim', 'school'])
  const s = fitness[1]
  assert.equal(isDemoLeft(s, undefined, own, new Set([s.key])), true)
  assert.equal(isDemoLeft(fitness[0], 'Lorem ipsum dolor sit amet', own, new Set()), true)
  assert.equal(
    isDemoLeft(s, s.sample.replace('Studio Ironfist', 'Harbourline Swim School'), own, new Set()),
    true,
    'the demo company swapped for the owner inside the demo sentence'
  )
  assert.equal(isDemoLeft(s, 'Lessons for confident swimmers, in small groups.', own, new Set()), false)
  // A short label the writer echoed is trusted; a token line is the page's own.
  assert.equal(isDemoLeft(fitness[5], undefined, own, new Set()), false)
  assert.equal(isDemoLeft(fitness[8], undefined, own, new Set([fitness[8].key])), false)
})

test('a swim school on a fitness template: every demo line the writer left takes the plan, a neutral word, the owner, or nothing', () => {
  const written = {
    // the rename of the demo company left the demo's sentence
    'article-14.3': fitness[1].sample.replace('Studio Ironfist', 'Harbourline Swim School'),
    // a real new heading
    'module-170.0': 'Your first lesson'
  }
  const held = ['article-14.0', 'module-165.6', 'module-165.2', 'article-14.4', 'module-170.1']
  const honesty = {
    fallbacks: { 'article-14.3': { value: 'Swimming lessons', reason: 'brief-offering-quote' } }
  }
  const out = leftDemoText({ slots: fitness, written, asked, held, honesty, pages: fitnessPages, ...pool })
  assert.deepEqual(out.values, {
    'article-14.0': pool.description,
    'article-14.3': 'Swimming lessons',
    'article-14.4': 'Service',
    'module-165.2': 'Step',
    'module-170.1': pool.description
  })
  assert.deepEqual(out.blanks, ['module-165.6'], 'a step description has no neutral words: it empties')
  assert.ok(!('module-170.0' in out.values), 'what the writer wrote anew stays')
  assert.ok(!out.blanks.includes('module-172.0'), 'a record no page shows is not touched')
  assert.ok(!('module-171.0' in out.values) && !out.blanks.includes('module-171.0'), 'a token line stays')
  for (const value of Object.values(out.values))
    assert.doesNotMatch(value, /kickboxing|sparring|punch|nulla/i)
})

test('the site plan wins: a planned value, an emptied fact and a hidden card are never touched here', () => {
  const honesty = {
    values: { 'article-14.0': { value: 'Planned words' } },
    blanks: [{ key: 'module-170.1' }],
    records: [{ group: 'article-14.offering', decision: 'hide' }]
  }
  const out = leftDemoText({
    slots: fitness,
    written: {},
    asked,
    held: asked,
    honesty,
    pages: fitnessPages,
    ...pool
  })
  for (const key of ['article-14.0', 'module-170.1', 'article-14.4'])
    assert.ok(!(key in out.values) && !out.blanks.includes(key), key)
})

test('a dental clinic on a bakery template, written in German: the same roles, the site’s language, the box limit', () => {
  const bakery = [
    slot(
      'module-30.0',
      'editorial.paragraph',
      'Our sourdough rests for forty hours before the stone oven bakes it golden.',
      {
        maxCharacters: 40
      }
    ),
    slot('module-30.1', 'contact.cta_label', 'Order your loaf', {
      group: { id: 'module-30.cta.0', item: 0, kind: 'contact' }
    }),
    slot('module-30.2', 'offering.name', 'Rye Sourdough', {
      group: { id: 'module-30.offering', item: 0, kind: 'product' }
    })
  ]
  const out = leftDemoText({
    slots: bakery,
    written: {},
    asked: bakery.map((s) => s.key),
    held: bakery.map((s) => s.key),
    ownText: 'Praxis Lindenhof, Zahnarzt in Talheim.',
    description: 'Die Praxis Lindenhof ist eine Zahnarztpraxis in Talheim fuer die ganze Familie.',
    locale: 'de',
    business: { phone: '+49 30 0000 0000' },
    pages: []
  })
  assert.equal(out.values['module-30.1'], 'Kontakt')
  assert.equal(out.values['module-30.2'], 'Produkt')
  assert.deepEqual(out.blanks, ['module-30.0'], 'the description is longer than the box: the line empties')
})

test('a slot the plan does not give the copy writer is never judged', () => {
  const out = leftDemoText({
    slots: fitness,
    written: {},
    asked: [],
    held: asked,
    pages: fitnessPages,
    ...pool
  })
  assert.deepEqual(out, {
    values: {},
    blanks: [],
    counts: { fallbacks: 0, neutral: 0, described: 0, blanked: 0 }
  })
})

test('an offering article a category page lists is read; one no page lists is not', () => {
  const card = (entity) => [
    slot(
      `${entity}.0`,
      'editorial.paragraph',
      'Morbi vitae ligula id dolor iaculis tincidunt, vivamus ligula erat.'
    ),
    slot(`${entity}.1`, 'offering.name', 'Deep Tissue Massage', {
      group: { id: `${entity}.offering`, item: 0, kind: 'service' }
    })
  ]
  const slots = [...card('article-21'), ...card('article-22')]
  const out = leftDemoText({
    slots,
    written: {},
    asked: slots.map((s) => s.key),
    held: slots.map((s) => s.key),
    ownText: 'Willowmere Physio, physiotherapy in Ashcombe.',
    description: '',
    business: {},
    pages: [{ entity: 'menuItem-5', link: 'index.php?option=com_content&view=category&id=7' }],
    entities: [
      { key: 'article-21', kind: 'article', identityReferences: { catid: 'category-7' } },
      { key: 'article-22', kind: 'article', identityReferences: { catid: 'category-9' } }
    ]
  })
  assert.deepEqual(out.values, { 'article-21.1': 'Service' })
  assert.deepEqual(out.blanks, ['article-21.0'])
})
