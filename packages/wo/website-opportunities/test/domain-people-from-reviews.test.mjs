// A person only guest reviews name may fill a team card (spec TracyHQ/tracy#189, product owner rule of 29/10/2026): with a
// role the reviews give, or named in at least two reviews. The team section stays with the real people, every demo word
// of a kept card that the sources do not back is emptied, the picture is the person's initials, and the build names them
// to the owner. Three made-up trades: a racquet club, a dental clinic, a bakery. All names below are made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planSite } from '../domain/site-plan.mjs'
import { planFill } from '../domain/fill-plan.mjs'
import { pagePlan } from '../domain/page-plan.mjs'
import { showablePeopleOf, peopleFromReviewsNote } from '../domain/brief-people.mjs'

const served = { set: { contentHash: 'c'.repeat(64) }, questions: [{ id: 'name', kind: 'text' }] }
const NOW = '2026-10-29T00:00:00.000Z'

/** A person card field of a module's JSON list. */
const cardSlot = (entity, field, index, role, sample, type = 'text') => ({
  key: `${entity}.${field}.${index}`,
  entity,
  column: 'params',
  nestedJson: 'jatools-config',
  type,
  role,
  sample,
  maxCharacters: 60,
  jsonPath: ['teams', 'teams-intro[data]', `teams-intro[data][${field}]`, index],
  group: { id: `${entity}.person.${index}`, item: index, kind: 'person' }
})

/** A team module of four demo cards: photo, name, link to the demo person's page, social icons markup. */
function teamMap(entity = 'module-40', demo = ['Rowan Mercer', 'Ilse Varga', 'Tobin Hale', 'Petra Quill']) {
  const slots = demo.flatMap((name, i) => [
    cardSlot(entity, 'img', i, 'person.image', `images/demo/team/${i}.jpg`, 'image'),
    cardSlot(entity, 'title', i, 'person.name', name),
    cardSlot(entity, 'link', i, 'editorial.navigation_url', 'index.php?Itemid=90', 'url'),
    cardSlot(
      entity,
      'team-info',
      i,
      'editorial.paragraph',
      '<div class="list-social"><a href="#"><i class="fab fa-facebook"></i></a></div>'
    )
  ])
  return {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: entity, kind: 'module' }],
    pages: [],
    slots
  }
}

/** A team fact as a stored brief holds it: held off the site by rule, for being named only in reviews. */
const heldFact = (id, name, role) => ({
  id,
  field: 'team',
  value: { name, ...(role ? { role } : {}), relationship: 'team' },
  onSite: false,
  reasons: ['review-only-person'],
  decidedBy: 'rule',
  confidence: 'single-source'
})
const reviewPerson = (id, label, role, factId) => ({
  id,
  label,
  ...(role ? { role } : {}),
  factId,
  source: { ref: 'review:1', kind: 'review', source: 'google' }
})

/** A made-up racquet club: two coaches named in one held review each, with the role "coach". */
function clubBrief() {
  return {
    business: { name: 'Harbourline Racquet Club' },
    facts: [heldFact('f1', 'Anouk', 'coach'), heldFact('f2', 'Dario', 'coach')],
    googlePlace: {
      reviews: [{ author: 'Guest One', text: 'Lovely courts and friendly staff.' }],
      heldReviews: [{ author: 'Guest Two', namesHeld: ['Anouk', 'Dario'] }]
    },
    reading: {
      services: [{ id: 's1', label: 'Tennis', quote: 'Tennis', source: { kind: 'bio' } }],
      team: [reviewPerson('t1', 'Anouk', 'coach', 'f1'), reviewPerson('t2', 'Dario', 'coach', 'f2')]
    }
  }
}

/** A made-up dental clinic: two dentists named in two reviews each (no role given), one assistant named once. */
function clinicBrief() {
  return {
    business: { name: 'Brightwater Dental' },
    facts: [heldFact('g1', 'Mara'), heldFact('g2', 'Felipe'), heldFact('g3', 'Noor')],
    googlePlace: {
      reviews: [
        { author: 'Patient A', publishTime: '2026-01-01', text: 'Mara and Felipe were so gentle.' },
        { author: 'Patient B', publishTime: '2026-02-01', text: 'Thanks to Mara for the cleaning.' },
        {
          author: 'Patient C',
          publishTime: '2026-03-01',
          text: 'Felipe explained everything. Noor was kind.'
        }
      ]
    },
    reading: {
      services: [{ id: 'd1', label: 'Cleaning', quote: 'Cleaning', source: { kind: 'bio' } }],
      team: [
        reviewPerson('p1', 'Mara', null, 'g1'),
        reviewPerson('p2', 'Felipe', null, 'g2'),
        reviewPerson('p3', 'Noor', null, 'g3')
      ]
    }
  }
}

/** A made-up bakery: the owner names herself in her bio; a helper is named once in a review, with no role. */
function bakeryBrief() {
  return {
    business: { name: 'Crumb and Kettle' },
    facts: [
      {
        id: 'h1',
        field: 'team',
        value: { name: 'Elsie', role: 'owner' },
        onSite: true,
        decidedBy: 'rule',
        reasons: []
      },
      heldFact('h2', 'Bram')
    ],
    googlePlace: { reviews: [{ author: 'Visitor', text: 'Bram served us the best rye.' }] },
    reading: {
      services: [{ id: 'b1', label: 'Sourdough', quote: 'Sourdough', source: { kind: 'bio' } }],
      team: [
        { id: 'o1', label: 'Elsie', role: 'owner', factId: 'h1', source: { kind: 'bio' } },
        reviewPerson('o2', 'Bram', null, 'h2')
      ]
    }
  }
}

const planOf = (brief, map) => planSite(brief, served, { now: NOW, contentMap: map })
const names = (h, entity) =>
  Object.entries(h.values)
    .filter(([key]) => key.startsWith(`${entity}.title.`))
    .map(([, v]) => v.value)

test('club: two coaches only reviews name, each with a role, fill two team cards; the section stays', () => {
  const p = planOf(clubBrief(), teamMap())
  assert.deepEqual(names(p.honesty, 'module-40'), ['Anouk', 'Dario'])
  assert.ok(
    !p.honesty.hide.some((x) => x.how === 'entity' && x.entity === 'module-40'),
    'the section is not hidden whole'
  )
  assert.deepEqual(
    p.honesty.hide.filter((x) => x.entity === 'module-40').map((x) => x.index),
    [2, 3],
    'only the demo cards beyond the real people go'
  )
})

test('clinic: a person two reviews name is shown without a role; one named once with no role stays off', () => {
  const people = showablePeopleOf(clinicBrief())
  assert.deepEqual(
    people.map((p) => [p.label, p.role, p.fromReviews]),
    [
      ['Mara', null, true],
      ['Felipe', null, true]
    ]
  )
  const p = planOf(
    clinicBrief(),
    teamMap('module-41', ['Dr. Lena Morrow', 'Dr. Ada Kim', 'Dr. Felix Brandt'])
  )
  assert.deepEqual(names(p.honesty, 'module-41'), ['Mara', 'Felipe'])
  assert.ok(!Object.values(p.honesty.values).some((v) => /Noor|Lena|Ada|Felix/.test(v.value)))
})

test('bakery: the owner from her own bio shows, a helper named once in a review with no role stays off', () => {
  const people = showablePeopleOf(bakeryBrief())
  assert.deepEqual(
    people.map((p) => [p.label, p.fromReviews]),
    [['Elsie', false]]
  )
  const p = planOf(bakeryBrief(), teamMap('module-42'))
  assert.deepEqual(names(p.honesty, 'module-42'), ['Elsie'])
  assert.equal(peopleFromReviewsNote(people), null, 'nobody shown from reviews, no note')
})

test('the owner’s own choice wins: a person the owner left off stays off, whatever the reviews say', () => {
  const brief = clubBrief()
  brief.facts[0] = { ...brief.facts[0], decidedBy: 'owner', reasons: ['owner-left-off'] }
  assert.deepEqual(
    showablePeopleOf(brief).map((p) => p.label),
    ['Dario']
  )
  // Another reason to hold a person (a stale or sensitive fact) keeps them off too.
  const stale = clubBrief()
  stale.facts[1] = { ...stale.facts[1], reasons: ['review-only-person', 'stale'] }
  assert.deepEqual(
    showablePeopleOf(stale).map((p) => p.label),
    ['Anouk']
  )
})

test('a kept card loses every demo word the sources do not back: its link to a demo profile and its social icons', () => {
  for (const [brief, entity] of [
    [clubBrief(), 'module-40'],
    [clinicBrief(), 'module-41']
  ]) {
    const p = planOf(brief, teamMap(entity))
    const blanked = new Set(p.honesty.blanks.map((b) => b.key))
    for (const i of [0, 1]) {
      assert.ok(blanked.has(`${entity}.link.${i}`), `${entity} card ${i} link`)
      // The social icons never stay: the line is emptied, or carries the role the sources give (the club's coaches).
      assert.ok(
        blanked.has(`${entity}.team-info.${i}`) ||
          p.honesty.values[`${entity}.team-info.${i}`]?.value === 'Coach',
        `${entity} card ${i} social icons`
      )
      assert.ok(!blanked.has(`${entity}.title.${i}`), 'the real name stays')
    }
  }
})

test('the build names the people shown from reviews, for the owner to check', () => {
  const club = planOf(clubBrief(), teamMap())
  assert.ok(
    club.notes.some((n) => /Anouk and Dario are shown on the team cards from what guest reviews say/.test(n))
  )
  const clinic = planOf(clinicBrief(), teamMap('module-41'))
  assert.ok(clinic.notes.some((n) => /Mara and Felipe/.test(n) && !/Noor/.test(n)))
  const bakery = planOf(bakeryBrief(), teamMap('module-42'))
  assert.ok(!bakery.notes.some((n) => /guest reviews say/.test(n)))
})

test('a kept card with no portrait shows the person’s initials, never the demo face', () => {
  const brief = clinicBrief()
  const map = teamMap('module-41')
  const cardNames = planOf(brief, map).honesty.cardNames
  const fill = planFill({ contentMap: map, brief, cardNames })
  const pic = (i) => fill.slots.find((s) => s.key === `module-41.img.${i}`)
  assert.equal(pic(0).action, 'substitute')
  assert.equal(pic(0).substitute.kind, 'initials-avatar')
  assert.equal(pic(0).substitute.initials, 'M')
  assert.equal(pic(1).substitute.initials, 'F')
})

test('a team page, even under another page, stays when the brief has people to show; it goes when it has none', () => {
  const pages = [
    { id: 'home', home: true },
    { id: 'about-us', label: 'About us' },
    { id: 'about-us/our-trainers', label: 'Learn more' },
    { id: 'about-us/our-dentists', label: 'Our dentists' }
  ]
  const withPeople = pagePlan({ pages, facts: { people: 2 }, now: NOW })
  const row = (plan, id) => plan.pages.find((p) => p.id === id)
  assert.equal(row(withPeople, 'about-us/our-trainers').keep, true)
  assert.equal(row(withPeople, 'about-us/our-trainers').role, 'team')
  assert.equal(row(withPeople, 'about-us/our-dentists').keep, false, 'one team page is enough')
  const none = pagePlan({ pages, facts: { people: 0 }, now: NOW })
  assert.equal(row(none, 'about-us/our-trainers').keep, false)
})

test('a kept person’s own module loses the demo person’s social links, whatever group the template gives them', () => {
  const map = teamMap('module-43', ['Rowan Mercer'])
  const social = (i, role, sample, type) => ({
    key: `module-43.social.${role}.${i}`,
    entity: 'module-43',
    column: 'params',
    type,
    role,
    sample,
    jsonPath: ['hero', `hero[social-intro][${role === 'contact.social_url' ? 'link' : 'title'}]`, i],
    group: { id: `module-43.social.${i}`, item: 0, kind: 'contact' }
  })
  map.slots.push(
    social(0, 'contact.social_label', 'Facebook', 'text'),
    social(0, 'contact.social_url', '#', 'url')
  )
  for (const brief of [clubBrief(), clinicBrief()]) {
    const blanked = new Set(planOf(brief, map).honesty.blanks.map((b) => b.key))
    assert.ok(blanked.has('module-43.social.contact.social_label.0'))
    assert.ok(blanked.has('module-43.social.contact.social_url.0'))
  }
})

test('a card with no role field shows the sourced role on its free line under the name; with no role, the line is emptied', () => {
  const club = planOf(clubBrief(), teamMap()).honesty
  assert.equal(club.values['module-40.team-info.0'].value, 'Coach')
  assert.equal(club.values['module-40.team-info.1'].value, 'Coach')
  assert.ok(!club.blanks.some((b) => b.key === 'module-40.team-info.0'))
  const clinic = planOf(clinicBrief(), teamMap('module-41')).honesty
  assert.ok(
    clinic.blanks.some((b) => b.key === 'module-41.team-info.0'),
    'no role in the sources: nothing written'
  )
})

test('a role field takes the sourced role in the casing of the template’s demo role', () => {
  const map = teamMap('module-44', ['Rowan Mercer', 'Ilse Varga'])
  map.slots.push(
    cardSlot('module-44', 'position', 0, 'person.role', 'HEAD TRAINER'),
    cardSlot('module-44', 'position', 1, 'person.role', 'Assistant coach')
  )
  const h = planOf(clubBrief(), map).honesty
  assert.equal(h.values['module-44.position.0'].value, 'COACH')
  assert.equal(h.values['module-44.position.1'].value, 'Coach')
  assert.ok(
    h.blanks.some((b) => b.key === 'module-44.team-info.0'),
    'the role has its own field, the free line is emptied'
  )
})
