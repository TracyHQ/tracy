// Spec TracyHQ/tracy#189 (leftover kinds C03, C09): a text slot the site plan gives the copy writer never keeps the demo's
// words on a brief build. Whatever the writer left (pended, unanswered, refused, or only renamed inside the demo's sentence)
// takes the plan's fallback, the role's neutral words, the business's own description, or nothing. Templates and businesses
// are made up; the same rules judge two trades.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isCardTitle, isDemoLeft, leftDemoText } from '../domain/demo-left-text.mjs'

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
  // A short label the writer echoed is trusted, but never a step's title; a token line is the page's own.
  assert.equal(isDemoLeft(fitness[5], undefined, own, new Set()), true)
  assert.equal(
    isDemoLeft(slot('module-9.0', 'editorial.button_label', 'Ringside'), undefined, own, new Set()),
    false
  )
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
    'module-170.1': pool.description
  })
  assert.deepEqual(
    new Set(out.blanks),
    new Set(['module-165.6', 'module-165.2', 'module-165.3']),
    'incomplete steps have no placeholder fallback'
  )
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
    hides: [],
    counts: { fallbacks: 0, neutral: 0, described: 0, blanked: 0, hidden: 0 }
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

test('a tab or step without a meaningful title and body is emptied, never given a numbered neutral title', () => {
  const steps = [
    slot('module-60.2', 'step.title', 'Sparring', {
      group: { id: 'module-60.step.0', item: 0, kind: 'step' }
    }),
    slot('module-60.5', 'step.title', 'Maintenance', {
      group: { id: 'module-60.step.3', item: 3, kind: 'step' }
    })
  ]
  const out = leftDemoText({
    slots: steps,
    written: { 'module-60.2': 'Your first visit', 'module-60.5': 'Maintenance' },
    asked: steps.map((s) => s.key),
    held: [],
    ownText: 'Brightsmile Dental, family dentistry in Calder Bay.',
    business: {},
    pages: [
      {
        entity: 'menuItem-1',
        link: 'index.php?option=com_content&view=featured',
        assignedModules: [{ entity: 'module-60' }]
      }
    ]
  })
  assert.deepEqual(out.values, {})
  assert.deepEqual(out.blanks, ['module-60.2', 'module-60.5'])
})

test("a Contact page's record and a template language string are read like a page's own lines", () => {
  const lines = [
    slot(
      'contact-2.4',
      'editorial.paragraph',
      'Want to know more? One of our friendly sparring coaches will help.'
    ),
    slot('languageString-55.0', 'editorial.heading', 'Book your sparring class now', { maxCharacters: 40 })
  ]
  const out = leftDemoText({
    slots: lines,
    written: {},
    asked: lines.map((s) => s.key),
    held: lines.map((s) => s.key),
    ownText: 'Copperleaf Bakery, sourdough in Ashby Vale.',
    description: 'Copperleaf Bakery bakes sourdough in Ashby Vale.',
    business: {},
    pages: [{ entity: 'menuItem-8', link: 'index.php?option=com_contact&view=contact&id=2' }],
    entities: [
      { key: 'contact-2', kind: 'contact' },
      { key: 'languageString-55', kind: 'languageString' }
    ]
  })
  assert.equal(out.values['contact-2.4'], 'Copperleaf Bakery bakes sourdough in Ashby Vale.')
  assert.deepEqual(out.blanks, ['languageString-55.0'])
})

test("an offering's card that names the business's other offerings is not kept, and the description that names them all is no stand-in", () => {
  const cards = [
    slot('article-31.1', 'offering.description', 'Pick whitening, braces or implants and book a visit.', {
      group: { id: 'article-31.offering', item: 0, kind: 'service' }
    }),
    slot('article-32.1', 'offering.description', 'Gentle braces for teens and adults.', {
      group: { id: 'article-32.offering', item: 0, kind: 'service' }
    }),
    slot('article-31.2', 'editorial.paragraph', 'Whitening and braces under one roof.')
  ]
  const out = leftDemoText({
    slots: cards,
    written: {
      'article-31.1': 'Pick whitening, braces or implants and book a visit.',
      'article-32.1': 'Gentle braces for teens and adults.',
      'article-31.2': 'Whitening and braces under one roof.'
    },
    asked: cards.map((s) => s.key),
    held: [],
    ownText: 'Brightsmile Dental: teeth whitening, braces and implants in Calder Bay.',
    description: 'Brightsmile Dental offers teeth whitening, braces and implants in Calder Bay.',
    business: {},
    honesty: {
      cardNames: {
        'article-31.offering': 'Teeth whitening',
        'article-32.offering': 'Braces',
        'article-33.offering': 'Implants'
      }
    },
    pages: [
      { entity: 'menuItem-3', link: 'index.php?option=com_content&view=article&id=31' },
      { entity: 'menuItem-4', link: 'index.php?option=com_content&view=article&id=32' }
    ]
  })
  assert.deepEqual(out.values, {})
  assert.deepEqual(out.blanks.sort(), ['article-31.1', 'article-31.2'])
})

/** A section of four steps, each an item of the module's JSON list (a JA ACM list). */
const stepList = (entity, titles) =>
  titles.flatMap((title, i) => [
    slot(`${entity}.${i * 2}`, 'step.title', title, {
      column: 'params',
      jsonPath: ['steps', 'title', i],
      group: { id: `${entity}.step.${i}`, item: i, kind: 'step' }
    }),
    slot(`${entity}.${i * 2 + 1}`, 'step.description', `Demo text of the ${title.toLowerCase()} stage.`, {
      column: 'params',
      jsonPath: ['steps', 'text', i],
      group: { id: `${entity}.step.${i}`, item: i, kind: 'step' }
    })
  ])
const onHome = (entity) => [
  {
    entity: 'menuItem-1',
    link: 'index.php?option=com_content&view=featured',
    assignedModules: [{ entity }]
  }
]

test('a step of a list whose title the writer echoed from the demo is taken off whole, with its other lines', () => {
  const slots = stepList('module-60', ['Sparring', 'Conditioning', 'Maintenance'])
  const out = leftDemoText({
    slots,
    written: {
      'module-60.0': 'Your first visit',
      'module-60.1': 'We look at your teeth and talk through what you want.',
      'module-60.2': 'Cleaning',
      'module-60.3': 'A gentle clean and polish.',
      'module-60.4': 'Maintenance'
    },
    asked: slots.map((s) => s.key),
    held: [],
    ownText: 'Brightsmile Dental, family dentistry in Calder Bay.',
    business: {},
    pages: onHome('module-60'),
    entities: [{ key: 'module-60', kind: 'module' }]
  })
  assert.equal(out.hides.length, 1)
  assert.equal(out.hides[0].how, 'item')
  assert.equal(out.hides[0].group, 'module-60.step.2')
  assert.equal(out.hides[0].entity, 'module-60')
  assert.equal(out.hides[0].index, 2)
  assert.deepEqual(out.hides[0].parents, [['steps']])
  assert.ok(!('module-60.4' in out.values) && !('module-60.5' in out.values), 'no words for a card taken off')
  assert.ok(!out.blanks.includes('module-60.5'))
  assert.equal(out.counts.hidden, 1)
})

test('a list none of whose cards keeps a title of its own is unpublished as a whole section', () => {
  const slots = stepList('module-61', ['Proofing', 'Shaping'])
  const out = leftDemoText({
    slots,
    written: {},
    asked: slots.map((s) => s.key),
    held: slots.map((s) => s.key),
    ownText: 'Northgate Tutoring, maths lessons in Elmford.',
    business: {},
    pages: onHome('module-61'),
    entities: [{ key: 'module-61', kind: 'module' }]
  })
  assert.deepEqual(
    out.hides.map((h) => [h.how, h.entity, h.kind]),
    [['entity', 'module-61', 'module']]
  )
  assert.deepEqual(out.values, {})
  assert.deepEqual(out.blanks, [])
})

test('isCardTitle: titles of repeated cards, never a free heading, a fact card or an offering the plan names', () => {
  const card = (role, kind = 'feature') =>
    slot('module-7.0', role, 'Demo', { group: { id: 'module-7.card.0', item: 0, kind } })
  for (const role of [
    'faq.question',
    'event.title',
    'package.name',
    'claim.heading',
    'editorial.heading',
    'offering.name'
  ])
    assert.equal(isCardTitle(card(role)), true, role)
  assert.equal(isCardTitle(slot('module-7.1', 'editorial.heading', 'Our story')), false, 'a free heading')
  assert.equal(isCardTitle(card('editorial.heading', 'contact')), false, 'a fact card')
  assert.equal(isCardTitle(card('editorial.button_label')), false, 'not a title')
  assert.equal(
    isCardTitle(card('offering.name'), { 'module-7.card.0': 'Children’s lessons' }),
    false,
    'the site plan names this offering'
  )
  assert.equal(isCardTitle(slot('module-7.2', 'step.title', 'Basic')), true, 'a step title, wherever it sits')
})

test('an FAQ question the writer echoed is never trusted as a fitting label, however short', () => {
  const own = new Set(['brightsmile', 'dental'])
  const faq = slot('module-8.0', 'faq.question', 'Do you spar?', {
    group: { id: 'module-8.faq.0', item: 0, kind: 'faq' }
  })
  assert.equal(isDemoLeft(faq, undefined, own, new Set()), true)
  assert.equal(
    isDemoLeft(slot('module-8.1', 'editorial.heading', 'Do you spar?'), undefined, own, new Set()),
    false
  )
})
