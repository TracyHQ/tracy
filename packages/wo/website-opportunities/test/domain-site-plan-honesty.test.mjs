// Seam 1 of spec TracyHQ/tracy#189 (ticket #192): no invented people, prices or numbers, and extra records hidden. The
// site plan decides, from a brief and a trimmed content map, which cards stay, which are hidden and what a fact slot holds;
// the last look (`honestWritten`) rejects what a writer invents. Every rule runs on two trades: a made-up racquet club on a
// combat-sports template, and a made-up dental clinic on a template of another shape. All names below are made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSite } from '../domain/site-plan.mjs'
import { honestWritten } from '../domain/honest-written.mjs'

const served = { set: { contentHash: 'c'.repeat(64) }, questions: [{ id: 'name', kind: 'text' }] }

/** An item of a JSON list of a module, as a content map holds it. */
const item = (entity, list, field, index, role, kind, sample, extra = {}) => ({
  key: `${entity}.${list}.${field}.${index}`,
  entity,
  column: 'params',
  nestedJson: 'jatools-config',
  type: extra.type ?? 'text',
  role,
  sample,
  maxCharacters: 60,
  jsonPath: [list, `${list}[${field}]`, index],
  group: { id: `${entity}.${kind}.${index}`, item: index, kind },
  ...extra
})

/** A combat-sports template: four trainers, three priced plans, two priced gift cards, five class articles, a stat line. */
function combatMap() {
  const coaches = ['Rowan Mercer', 'Ilse Varga', 'Tobin Hale', 'Petra Quill']
  const slots = [
    ...coaches.flatMap((name, i) => [
      item('module-50', 'team', 'title', i, 'person.name', 'person', name),
      item('module-50', 'team', 'img', i, 'person.image', 'person', `images/demo/team/${i}.jpg`, {
        type: 'image'
      }),
      item('module-50', 'team', 'bio', i, 'person.bio', 'person', `${name} has fought in many rings.`)
    ]),
    ...[0, 1, 2].flatMap((i) => [
      item('module-60', 'plans', 'price', i, 'package.price', 'package', `$${141 + i * 20}.00`),
      item('module-60', 'plans', 'title', i, 'package.name', 'package', `Getfit plan ${i}`)
    ]),
    ...['Gift card', 'Tennis lesson'].flatMap((name, i) => [
      item('module-61', 'cards', 'title', i, 'offering.name', 'service', name),
      item('module-61', 'cards', 'price', i, 'offering.price', 'service', `$${(i + 1) * 50}.00`)
    ]),
    ...['Gift card', 'Membership'].flatMap((name, i) => [
      item('module-62', 'cards', 'title', i, 'offering.name', 'service', name),
      item('module-62', 'cards', 'price', i, 'offering.price', 'service', `$${(i + 3) * 50}.00`)
    ]),
    ...[70, 71, 72, 73, 74].flatMap((n) => [
      {
        key: `article-${n}.0`,
        entity: `article-${n}`,
        column: 'title',
        type: 'text',
        role: 'offering.name',
        sample: `Boxing class ${n}`,
        maxCharacters: 60,
        group: { id: `article-${n}.offering`, item: 0, kind: 'service' }
      },
      {
        key: `article-${n}.1`,
        entity: `article-${n}`,
        column: 'introtext',
        type: 'text',
        role: 'offering.description',
        sample: 'Lorem ipsum dolor sit amet, boxing for all.',
        maxCharacters: 400,
        group: { id: `article-${n}.offering`, item: 0, kind: 'service' }
      },
      {
        key: `article-${n}.2`,
        entity: `article-${n}`,
        column: 'attribs',
        type: 'text',
        role: 'offering.schedule',
        sample: 'MONDAY + FRIDAY 6:00 AM',
        maxCharacters: 60,
        jsonPath: ['classes-info', 'label'],
        group: { id: `article-${n}.offering`, item: 0, kind: 'service' }
      }
    ]),
    ...['Join over ', '100k', ' of inspiring fighters'].map((sample, i) => ({
      key: `module-80.${i}`,
      entity: 'module-80',
      column: 'params',
      type: 'text',
      role: ['stat.context', 'stat.value', 'stat.label'][i],
      sample,
      jsonPath: ['top-desc'],
      xpath: `/html/body/div/div/text()[${i + 1}]`,
      group: { id: 'module-80.stat.0', item: 0, kind: 'stat_item' }
    })),
    item('module-90', 'hero', 'name', 0, 'quote.author_name', 'quote', 'Brooklyn Vance'),
    item('module-90', 'hero', 'name-pos', 0, 'quote.author_context', 'quote', 'CEO Getfit'),
    {
      key: 'module-95.0',
      entity: 'module-95',
      type: 'text',
      role: 'editorial.button_label',
      sample: 'Try a boxing class',
      maxCharacters: 30
    },
    {
      key: 'module-95.1',
      entity: 'module-95',
      type: 'text',
      role: 'editorial.button_label',
      sample: 'View more',
      maxCharacters: 30
    }
  ]
  const entities = [
    ...['module-50', 'module-60', 'module-61', 'module-62', 'module-80', 'module-90', 'module-95'].map(
      (key) => ({
        key,
        kind: 'module'
      })
    ),
    ...[70, 71, 72, 73, 74].map((n) => ({ key: `article-${n}`, kind: 'article' }))
  ]
  return { roleVocabularyVersion: 'place-content-roles/3', entities, pages: [], slots }
}

/** A made-up racquet club: two coaches, four services, no price. */
function clubBrief() {
  return {
    business: { name: 'Harbourline Racquet Club', phone: '+971 4 555 0199' },
    reading: {
      about: 'Tennis, padel and swimming coaching for all ages.',
      services: [
        { id: 's1', label: 'Tennis', quote: 'Tennis & Padel', source: { kind: 'bio' } },
        { id: 's2', label: 'Padel', quote: 'Tennis & Padel', source: { kind: 'bio' } },
        { id: 's3', label: 'Swimming Lessons', quote: 'Swimming Lessons', source: { kind: 'bio' } },
        { id: 's4', label: 'Fitness Lessons', quote: 'Personal fitness lessons', source: { kind: 'bio' } }
      ],
      team: [
        { id: 't1', label: 'Anouk', role: 'coach', source: { kind: 'review' } },
        { id: 't2', label: 'Dario', role: 'coach', source: { kind: 'review' } },
        { id: 't3', label: 'Reviewer Only', reviewsOnly: true, source: { kind: 'review' } }
      ]
    }
  }
}

/** A dental clinic template of another shape: person cards as articles, services in a list, no packages. */
function dentalMap() {
  const slots = [
    ...[10, 11, 12].flatMap((n, i) => [
      {
        key: `article-${n}.0`,
        entity: `article-${n}`,
        column: 'title',
        type: 'text',
        role: 'person.name',
        sample: ['Dr. Lena Morrow', 'Dr. Felix Brandt', 'Dr. Ada Kim'][i],
        group: { id: `article-${n}.person`, item: 0, kind: 'person' }
      },
      {
        key: `article-${n}.1`,
        entity: `article-${n}`,
        column: 'introtext',
        type: 'text',
        role: 'person.role',
        sample: 'Orthodontist',
        group: { id: `article-${n}.person`, item: 0, kind: 'person' }
      }
    ]),
    ...[0, 1, 2].flatMap((i) => [
      item(
        'module-20',
        'services',
        'title',
        i,
        'offering.name',
        'service',
        ['Whitening', 'Cleaning', 'Braces'][i]
      ),
      item('module-20', 'services', 'price', i, 'offering.price', 'service', `from $${(i + 2) * 100}`)
    ])
  ]
  const entities = [
    { key: 'module-20', kind: 'module' },
    ...[10, 11, 12].map((n) => ({ key: `article-${n}`, kind: 'article' }))
  ]
  return { roleVocabularyVersion: 'place-content-roles/3', entities, pages: [], slots }
}

/** A made-up dental clinic: one dentist, two services. */
function clinicBrief() {
  return {
    business: { name: 'Brightwater Dental', email: 'care@brightwater.example' },
    reading: {
      services: [
        { id: 'd1', label: 'Check-ups', quote: 'Gentle check-ups', source: { kind: 'bio' } },
        { id: 'd2', label: 'Cleaning', quote: 'Cleaning', source: { kind: 'bio' } }
      ],
      team: [{ id: 'p1', label: 'Dr. Mara Holt', role: 'dentist', source: { kind: 'bio' } }]
    }
  }
}

const plan = (brief, contentMap) =>
  planSite(brief, served, { now: '2026-10-29T00:00:00.000Z', contentMap }).honesty
const hiddenGroups = (h) => h.records.filter((r) => r.decision === 'hide').map((r) => r.group)

test('a brief with two people yields exactly those two names, and the trainer cards beyond them are hidden', () => {
  const h = plan(clubBrief(), combatMap())
  const names = Object.entries(h.values)
    .filter(([key]) => key.includes('.team.title.'))
    .map(([, v]) => v.value)
  assert.deepEqual(names, ['Anouk', 'Dario'])
  assert.deepEqual(
    hiddenGroups(h).filter((g) => g.includes('.person.')),
    ['module-50.person.2', 'module-50.person.3']
  )
  assert.deepEqual(
    h.hide.filter((x) => x.entity === 'module-50').map((x) => x.index),
    [2, 3],
    'the two extra cards are taken out of the list, not the whole section'
  )
  // A kept trainer's demo bio is emptied, never left or invented.
  assert.ok(h.blanks.some((b) => b.key === 'module-50.team.bio.0'))
})

test('the clinic: one dentist kept by name, the other dentist articles hidden whole', () => {
  const h = plan(clinicBrief(), dentalMap())
  assert.equal(h.values['article-10.0'].value, 'Dr. Mara Holt')
  // The sourced role, in the casing of the demo role it replaces ("Orthodontist").
  assert.equal(h.values['article-10.1'].value, 'Dentist')
  assert.deepEqual(
    h.hide.filter((x) => x.how === 'entity').map((x) => x.entity),
    ['article-11', 'article-12']
  )
  const names = Object.values(h.values).map((v) => v.value)
  assert.ok(!names.some((n) => /Lena|Felix|Ada/.test(n)), 'no demo person stays named')
})

test('a person the brief names only from reviews is never shown', () => {
  const h = plan(clubBrief(), combatMap())
  assert.ok(!Object.values(h.values).some((v) => v.value === 'Reviewer Only'))
})

test('a priced card stays only for an offering its name holds, without the price; a gift card or a membership goes', () => {
  const h = plan(clubBrief(), combatMap())
  // Every priced plan is hidden: the brief holds no price. Its module goes whole.
  assert.ok(h.hide.some((x) => x.how === 'entity' && x.entity === 'module-60'))
  // The "Tennis lesson" card names the club's Tennis: kept with the brief's name, the demo price emptied.
  assert.equal(h.values['module-61.cards.title.1'].value, 'Tennis')
  assert.ok(h.blanks.some((b) => b.key === 'module-61.cards.price.1' && b.reason === 'no-brief-fact'))
  // The gift card beside it names no offering of the brief: taken out of the list.
  assert.deepEqual(
    h.hide.filter((x) => x.entity === 'module-61').map((x) => x.index),
    [0]
  )
  // A list of gift cards and memberships only: the whole module goes.
  assert.ok(h.hide.some((x) => x.how === 'entity' && x.entity === 'module-62'))
  assert.ok(!Object.values(h.values).some((v) => /\$|gift card|membership/i.test(v.value)))
  // The clinic: "Cleaning" is a service of the brief, kept without its price; Whitening and Braces are not, and go.
  const clinic = plan(clinicBrief(), dentalMap())
  assert.equal(clinic.values['module-20.services.title.1'].value, 'Cleaning')
  assert.ok(clinic.blanks.some((b) => b.key === 'module-20.services.price.1'))
  assert.deepEqual(
    clinic.hide.filter((x) => x.entity === 'module-20').map((x) => x.index),
    [0, 2]
  )
})

test('the plan names each kept card’s pinned label for the picture planner (`cardNames`)', () => {
  const h = plan(clubBrief(), combatMap())
  assert.equal(h.cardNames['module-50.person.0'], 'Anouk')
  assert.equal(h.cardNames['module-61.service.1'], 'Tennis')
  assert.equal(h.cardNames['article-73.offering'], 'Fitness Lessons')
  assert.ok(!('module-50.person.2' in h.cardNames), 'a hidden card has no label')
  assert.ok(!('module-61.service.0' in h.cardNames))
  const clinic = plan(clinicBrief(), dentalMap())
  assert.equal(clinic.cardNames['article-10.person'], 'Dr. Mara Holt')
  assert.equal(clinic.cardNames['module-20.service.1'], 'Cleaning')
})

test('one card per real offering: extra class articles are hidden, kept ones take the brief names and lose the demo schedule', () => {
  const h = plan(clubBrief(), combatMap())
  assert.deepEqual(
    ['article-70.0', 'article-71.0', 'article-72.0', 'article-73.0'].map((k) => h.values[k].value),
    ['Tennis', 'Padel', 'Swimming Lessons', 'Fitness Lessons']
  )
  assert.deepEqual(
    h.hide.filter((x) => x.how === 'entity' && x.kind === 'article').map((x) => x.entity),
    ['article-74']
  )
  assert.ok(h.blanks.some((b) => b.key === 'article-70.2'))
  // A kept card's demo filler gives way to the business's own words about that offering.
  assert.equal(h.fallbacks['article-73.1'].value, 'Personal fitness lessons')
})

test('#189 a card falls back to the quote about its own offering, never one that speaks for several', () => {
  // Racquet club: "Tennis & Padel" names two offerings, and a line holding only a card's own name says nothing (COO rule,
  // #189 round 9): the Tennis and Padel lines have no fallback and are taken off unless the writer gives them words.
  const h = plan(clubBrief(), combatMap())
  assert.equal('article-70.1' in h.fallbacks, false)
  assert.equal('article-71.1' in h.fallbacks, false)
  assert.ok(h.nameOnly.includes('article-70.1') && h.nameOnly.includes('article-71.1'))
  assert.equal(h.fallbacks['article-73.1'].value, 'Personal fitness lessons')
  // Dental clinic: the Cleaning card's quote also names Check-ups, and its own label alone would only repeat the name.
  const brief = clinicBrief()
  brief.reading.services[1].quote = 'Check-ups and Cleaning for the whole family'
  const map = dentalMap()
  map.slots.push(
    ...[0, 1, 2].map((i) =>
      item('module-20', 'services', 'desc', i, 'offering.description', 'service', 'Demo treatment words')
    )
  )
  const c = plan(brief, map)
  assert.deepEqual(
    Object.values(c.fallbacks).map((f) => f.value),
    []
  )
})

test('a statistic and a signature line the brief does not hold are emptied', () => {
  const h = plan(clubBrief(), combatMap())
  for (const key of [
    'module-80.0',
    'module-80.1',
    'module-80.2',
    'module-90.hero.name.0',
    'module-90.hero.name-pos.0'
  ])
    assert.ok(
      h.blanks.some((b) => b.key === key),
      key
    )
  const owned = clubBrief()
  owned.reading.team.unshift({ id: 'o1', label: 'Sana Ilves', role: 'founder', source: { kind: 'bio' } })
  assert.equal(plan(owned, combatMap()).values['module-90.hero.name.0'].value, 'Sana Ilves')
})

test('the last look: a writer’s invented coach, price or number is rejected, any build, brief or none', () => {
  const map = combatMap()
  const written = {
    'module-50.team.title.0': 'Mia Bennett',
    'module-61.cards.price.1': '$99.00',
    'module-80.1': '500+',
    'module-95.0': 'Book a tennis lesson'
  }
  const own = 'Harbourline Racquet Club. Tennis, padel and swimming coaching for all ages.'
  const none = honestWritten({ slots: map.slots, written, ownText: own })
  assert.deepEqual(none.drop.sort(), ['module-50.team.title.0', 'module-61.cards.price.1', 'module-80.1'])
  assert.equal(none.counts.invented, 3)
  // A name the customer gave passes.
  assert.deepEqual(
    honestWritten({
      slots: map.slots,
      written: { 'module-50.team.title.0': 'Anouk' },
      ownText: 'Coach Anouk'
    }).drop,
    []
  )
})

test('the last look with the plan: plan values win, hidden cards take nothing, demo labels become neutral, filler gives way', () => {
  const map = combatMap()
  const h = plan(clubBrief(), map)
  const out = honestWritten({
    slots: map.slots,
    written: {
      'module-50.team.title.0': 'Mia Bennett',
      'module-50.team.title.3': 'Noah Reed',
      'article-71.1': 'Lorem ipsum dolor sit amet, boxing for all.'
    },
    ownText: 'Harbourline Racquet Club. Tennis, padel and swimming coaching. Anouk Dario',
    honesty: h,
    business: { phone: '+971 4 555 0199' }
  })
  assert.equal(out.values['module-50.team.title.0'], 'Anouk')
  assert.equal(out.evidence['module-50.team.title.0'], 'Anouk')
  assert.ok(out.drop.includes('module-50.team.title.3'), 'a hidden card is not written')
  // The filler gives way to nothing: the card's line has no words beyond its name, so the engine takes it off.
  assert.equal('article-71.1' in out.values, false)
  assert.ok(h.nameOnly.includes('article-71.1'))
  assert.equal(
    out.values['module-95.0'],
    'Contact',
    'a demo button label the writer left takes the neutral label'
  )
  assert.ok(!('module-95.1' in out.values), 'an interface label is no demo word')
  // A label the writer wrote for the business stays.
  const kept = honestWritten({
    slots: map.slots,
    written: { 'module-95.0': 'Book a tennis lesson' },
    ownText: 'Tennis lessons',
    honesty: h,
    business: { phone: '+971 4 555 0199' }
  })
  assert.ok(!('module-95.0' in kept.values))
})

test('a demo button with no way to reach the business reads "Learn more"; a demo menu label takes the opened page’s title', () => {
  // The club: no phone or email, a menu entry opening a class article whose title the plan gives.
  const map = combatMap()
  map.slots.push({
    key: 'menuItem-120.0',
    entity: 'menuItem-120',
    column: 'title',
    type: 'text',
    role: 'editorial.menu_label',
    sample: 'Boxing classes',
    maxCharacters: 30
  })
  map.pages = [{ entity: 'menuItem-120', link: 'index.php?option=com_content&view=article&id=70' }]
  const h = plan(clubBrief(), map)
  const own = 'Harbourline Racquet Club. Tennis, padel and swimming coaching.'
  const out = honestWritten({ slots: map.slots, written: {}, ownText: own, honesty: h, pages: map.pages })
  assert.equal(out.values['module-95.0'], 'Learn more')
  assert.equal(out.values['menuItem-120.0'], 'Tennis', 'the label of the page it opens')
  // The clinic, in German: a menu entry opening no article falls back to the neutral label.
  const dental = dentalMap()
  dental.slots.push(
    {
      key: 'menuItem-130.0',
      entity: 'menuItem-130',
      column: 'title',
      type: 'text',
      role: 'editorial.menu_label',
      sample: 'Smile makeover',
      maxCharacters: 30
    },
    {
      key: 'module-21.0',
      entity: 'module-21',
      type: 'text',
      role: 'editorial.button_label',
      sample: 'Book your smile makeover',
      maxCharacters: 30
    }
  )
  dental.pages = [{ entity: 'menuItem-130', link: 'index.php?option=com_content&view=category&id=8' }]
  const clinic = honestWritten({
    slots: dental.slots,
    written: {},
    ownText: 'Brightwater Dental. Gentle check-ups. Cleaning.',
    honesty: plan(clinicBrief(), dental),
    locale: 'de',
    pages: dental.pages
  })
  assert.equal(clinic.values['menuItem-130.0'], 'Mehr erfahren')
  assert.equal(clinic.values['module-21.0'], 'Mehr erfahren')
})
