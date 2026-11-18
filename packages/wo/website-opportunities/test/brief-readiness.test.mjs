// Brief readiness (#50): from collected research to the brief and its verdict. The seam: a researched place goes through
// `fromPlace` and `makeSiteBrief`, and `briefReadinessOf` measures the brief written. Every business here is fictional: a
// padel club, a cafe and a dental clinic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as domain from '../domain/index.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { fromPlace, makeSiteBrief } from '../src/brief-research.js'

const AT = '2026-10-28T09:00:00.000Z'
const sha = (n) => String(n).padStart(64, '0')

/**
 * A reading of a business: each offering named in its bio, the first `described` of them also named by a review (its
 * description), and its team.
 */
function readingOf({ name, offerings, described = offerings.length, team = [], story = [], facts = [] }) {
  const bio = [
    `${name} offers ${offerings.join(', ')}.`,
    ...team.map((p) => ` ${p.role} ${p.name} works here.`),
    ...[...story, ...facts].map((t) => ` ${t}`)
  ].join('')
  const reviews = offerings
    .slice(0, described)
    .map((o) => ({ author: 'A guest', text: `We loved the ${o}, warmly done.` }))
  const sources = readingSourcesOf({ bio, reviews })
  return {
    method: 'model',
    ...checkBusinessReading(
      {
        services: offerings.map((o, i) => ({
          name: o,
          quote: o,
          ref: 'bio',
          ...(i < described ? { mentions: [{ quote: `the ${o}`, ref: `review:${i + 1}` }] } : {})
        })),
        team: team.map((p) => ({ name: p.name, role: p.role, quote: `${p.role} ${p.name}`, ref: 'bio' })),
        story: story.map((t) => ({ text: t, quote: t, ref: 'bio' })),
        facts: facts.map((t) => ({ text: t, quote: t, ref: 'bio' }))
      },
      sources
    )
  }
}

let n = 0
/** A stored picture: the business's own (its website), sharp, and labelled by a vision model unless told otherwise. */
const photo = (extra = {}) => {
  n += 1
  const { vision = { subject: 'venue', content: 'venue-interior' }, ...rest } = extra
  return {
    id: `p${n}`,
    status: 'stored',
    kind: 'image',
    category: 'other',
    sha256: sha(n),
    mime: 'image/jpeg',
    width: 1600,
    height: 1000,
    bytes: 120000,
    source: 'website',
    source_url: `https://example.test/p${n}.jpg`,
    ...(vision ? { labels: { vision: { key: 'k', model: 'm', labels: vision } } } : {}),
    ...rest
  }
}
const photos = (count, extra) => Array.from({ length: count }, () => photo(extra))
const unlabelled = (count) => photos(count, { vision: null })

function briefOf({ name, trade, reading = null, media, sources = [], brand = null, profile = {} }) {
  const brief = makeSiteBrief(
    domain,
    fromPlace({
      sources,
      profile: { name, ...profile, ...(reading ? { businessReading: reading } : {}) },
      brand,
      media
    }),
    { opportunity: { id: 'o1', name, candidate: { trade } }, madeAt: AT }
  )
  assert.deepEqual(domain.validateBrief(brief).errors, [])
  return brief
}
const readinessOf = (input, opts) => domain.briefReadinessOf(briefOf(input), opts)
const check = (readiness, id) => readiness.checks.find((c) => c.id === id)

// --- The club: everything collected, ready to build. ---
const CLUB = 'Copperfield Padel Club'
const CLUB_OFFERINGS = ['Padel class', 'Tennis class', 'Junior camp']
const clubReading = readingOf({
  name: CLUB,
  offerings: CLUB_OFFERINGS,
  team: [{ name: 'Rosa Quillfeather', role: 'Head coach' }]
})
const clubMedia = () => [
  photo({ alt: 'Padel class at sunset' }),
  photo({ alt: 'Tennis class on court two' }),
  photo({ alt: 'Junior camp warm up' }),
  photo({
    vision: {
      subject: 'people',
      content: 'team',
      portraitOf: clubReading.team[0].id,
      role: 'person.image',
      peopleCount: 1
    }
  }),
  ...photos(6)
]

test('the club: every check passes and the build may start', () => {
  const r = readinessOf({ name: CLUB, trade: 'fitness', reading: clubReading, media: clubMedia() })
  assert.equal(r.version, 'brief-readiness/1')
  assert.deepEqual(
    r.checks.filter((c) => c.verdict !== 'pass').map((c) => [c.id, c.verdict]),
    [['template-kinds', 'unknown']]
  )
  assert.equal(r.verdict, 'pass')
  assert.equal(r.next, 'build')
  assert.ok(!r.ownerQuestions.some((q) => q.id === 'owner.photos'))
})

// --- The cafe: thin sources, nothing labelled. ---
test('the cafe: three own photos and none labelled block, and the owner is asked for photos', () => {
  const r = readinessOf({
    name: 'Juniper Lane Cafe',
    trade: 'cafe',
    media: [
      ...unlabelled(3),
      photo({
        vision: null,
        source: 'google-maps',
        credit: { provider: 'Google', photoSource: 'review', authors: [{ displayName: 'Tamsin Example' }] }
      })
    ]
  })
  assert.equal(check(r, 'own-usable-photos').verdict, 'block')
  assert.equal(check(r, 'own-usable-photos').measured.count, 3)
  assert.equal(check(r, 'labelled-share').verdict, 'block')
  assert.equal(r.verdict, 'block')
  assert.equal(r.next, 'research-again', 'unlabelled photos are labelled again before the owner is asked')
  assert.ok(r.ownerQuestions.some((q) => q.id === 'owner.photos'))
})

// --- The clinic: light gaps, the build goes ahead with questions. ---
const CLINIC = 'Brightwater Dental Studio'
const CLINIC_OFFERINGS = ['Teeth whitening', 'Dental implants', 'Braces fitting', 'Gum care']
const clinicReading = readingOf({
  name: CLINIC,
  offerings: CLINIC_OFFERINGS,
  described: 2,
  team: [{ name: 'Ilse Varga', role: 'Dentist' }]
})

test('the clinic: six own photos, half its services shown and described, no portrait: it warns and asks', () => {
  const r = readinessOf({
    name: CLINIC,
    trade: 'dentist',
    reading: clinicReading,
    media: [
      photo({ alt: 'Teeth whitening in our chair' }),
      photo({ alt: 'Dental implants model' }),
      ...photos(4)
    ]
  })
  assert.deepEqual(
    r.checks.filter((c) => c.verdict === 'warn').map((c) => c.id),
    ['own-usable-photos', 'offerings-with-photo', 'offerings-with-description', 'people-with-portrait']
  )
  assert.equal(r.verdict, 'warn')
  assert.equal(r.next, 'build-and-ask')
  const q = Object.fromEntries(r.ownerQuestions.map((x) => [x.id, x]))
  assert.deepEqual(q['owner.offering-photos'].items, ['Braces fitting', 'Gum care'])
  assert.deepEqual(q['owner.offering-descriptions'].items, ['Braces fitting', 'Gum care'])
  assert.deepEqual(q['owner.portraits'].items, ['Ilse Varga'])
  assert.ok(q['owner.photos'])
})

// --- Each threshold at its edges. ---
test('own usable photos: 8 pass, 7 and 4 warn, 3 block', () => {
  for (const [count, verdict] of [
    [8, 'pass'],
    [7, 'warn'],
    [4, 'warn'],
    [3, 'block']
  ]) {
    const r = readinessOf({ name: 'Juniper Lane Cafe', trade: 'cafe', media: photos(count) })
    assert.equal(check(r, 'own-usable-photos').verdict, verdict, `${count} photos`)
  }
})

test('a graphic, a thumbnail or a customer photo is not an own usable photo', () => {
  const r = readinessOf({
    name: 'Juniper Lane Cafe',
    trade: 'cafe',
    media: [
      ...photos(7),
      photo({ vision: { subject: 'poster', content: 'text-graphic', isGraphic: true } }),
      photo({ width: 600, height: 400 }),
      photo({
        source: 'google-maps',
        credit: { provider: 'Google', photoSource: 'review', authors: [{ displayName: 'Tamsin Example' }] }
      })
    ]
  })
  assert.equal(check(r, 'own-usable-photos').measured.count, 7)
  assert.equal(check(r, 'own-usable-photos').verdict, 'warn')
})

test('labelled share: 90% passes, 89% and 60% warn, 59% blocks; an unlabelled general is not labelled', () => {
  for (const [labelled, total, verdict] of [
    [9, 10, 'pass'],
    [8, 9, 'warn'],
    [6, 10, 'warn'],
    [10, 17, 'block']
  ]) {
    const r = readinessOf({
      name: 'Juniper Lane Cafe',
      trade: 'cafe',
      media: [...photos(labelled), ...unlabelled(total - labelled)]
    })
    const c = check(r, 'labelled-share')
    assert.deepEqual([c.measured.labelled, c.measured.photos], [labelled, total])
    assert.equal(c.verdict, verdict, `${labelled}/${total}`)
  }
  const brief = briefOf({ name: 'Juniper Lane Cafe', trade: 'cafe', media: unlabelled(1) })
  assert.deepEqual(brief.assets[0].depicts, { id: 'general', evidence: { via: 'none' } })
  assert.equal(check(domain.briefReadinessOf(brief), 'labelled-share').measured.labelled, 0)
})

test('source and credit: every asset names its source, and a third-party photo its author', () => {
  const credited = photo({
    source: 'google-places',
    credit: { provider: 'Google', authors: [{ displayName: 'Orrin Sample' }] }
  })
  const ok = readinessOf({ name: CLINIC, trade: 'dentist', media: [...photos(8), credited] })
  assert.equal(check(ok, 'source-and-credit').verdict, 'pass')

  const anonymous = photo({ source: 'google-maps', credit: { provider: 'Google', authors: [] } })
  const nowhere = photo({ source: undefined })
  const r = readinessOf({ name: CLINIC, trade: 'dentist', media: [...photos(8), anonymous, nowhere] })
  const c = check(r, 'source-and-credit')
  assert.equal(c.verdict, 'block')
  assert.deepEqual(c.measured.uncredited, [anonymous.id, nowhere.id])
  assert.deepEqual(c.measured.unsourced, [nowhere.id])
  assert.equal(r.next, 'research-again')
})

test('hero candidates: 2 pass, 1 warns, 0 blocks', () => {
  for (const [count, verdict] of [
    [3, 'pass'],
    [2, 'pass'],
    [1, 'warn'],
    [0, 'block']
  ]) {
    const brief = briefOf({ name: CLUB, trade: 'fitness', reading: clubReading, media: clubMedia() })
    const hero = brief.sitemap[0].sections.find((s) => s.kind === 'hero')
    assert.equal(hero.heroCandidates.length, 3, 'the brief writes up to three')
    // Fewer candidates than a brief of this many photos writes: the edge is set on the written brief.
    hero.heroCandidates = hero.heroCandidates.slice(0, count)
    const r = domain.briefReadinessOf(brief)
    assert.equal(check(r, 'hero-candidates').verdict, verdict, `${count} candidates`)
    if (verdict !== 'pass') assert.ok(r.ownerQuestions.some((q) => q.id === 'owner.hero'))
  }
})

test('offerings with a linked photo: 60% passes, 50% and 30% warn, none never blocks', () => {
  const offerings = ['Padel class', 'Tennis class', 'Junior camp', 'Squash ladder', 'Fitness bootcamp']
  const reading = readingOf({ name: CLUB, offerings })
  for (const [linked, verdict] of [
    [3, 'pass'],
    [2, 'warn'],
    [0, 'warn']
  ]) {
    const r = readinessOf({
      name: CLUB,
      trade: 'fitness',
      reading,
      media: [...offerings.slice(0, linked).map((o) => photo({ alt: `${o} today` })), ...photos(8)]
    })
    assert.equal(check(r, 'offerings-with-photo').verdict, verdict, `${linked}/5`)
    assert.equal(check(r, 'offerings-with-photo').measured.linked, linked)
  }
  const ten = Array.from({ length: 10 }, (_, i) => `Court session ${'ABCDEFGHIJ'[i]}`)
  const r = readinessOf({
    name: CLUB,
    trade: 'fitness',
    reading: readingOf({ name: CLUB, offerings: ten }),
    media: [...ten.slice(0, 3).map((o) => photo({ alt: o })), ...photos(8)]
  })
  assert.deepEqual(
    [check(r, 'offerings-with-photo').measured.share, check(r, 'offerings-with-photo').verdict],
    [0.3, 'warn']
  )
})

test('offerings with a description: 80% passes, 75% and 50% warn', () => {
  for (const [offerings, described, verdict] of [
    [CLUB_OFFERINGS.concat(['Squash ladder', 'Fitness bootcamp']), 4, 'pass'],
    [CLINIC_OFFERINGS, 3, 'warn'],
    [CLINIC_OFFERINGS, 2, 'warn'],
    [CLINIC_OFFERINGS, 0, 'warn']
  ]) {
    const reading = readingOf({ name: CLINIC, offerings, described })
    const r = readinessOf({ name: CLINIC, trade: 'dentist', reading, media: photos(8) })
    assert.equal(check(r, 'offerings-with-description').measured.described, described)
    assert.equal(check(r, 'offerings-with-description').verdict, verdict, `${described}/${offerings.length}`)
  }
})

test('named people: a portrait passes, a missing one warns and asks', () => {
  const r = readinessOf({ name: CLUB, trade: 'fitness', reading: clubReading, media: clubMedia() })
  assert.equal(check(r, 'people-with-portrait').verdict, 'pass')
  const without = readinessOf({ name: CLUB, trade: 'fitness', reading: clubReading, media: photos(8) })
  assert.equal(check(without, 'people-with-portrait').verdict, 'warn')
  assert.deepEqual(without.ownerQuestions.find((q) => q.id === 'owner.portraits').items, [
    'Rosa Quillfeather'
  ])
})

// --- A reading with nothing of the business in it (#554): good photos, a hero and credits, yet no offering, story or fact.
const BOXING = 'Riverside Boxing Gym'
test('a reading with no offering, story or fact blocks: research again or add the business information', () => {
  const r = readinessOf({
    name: BOXING,
    trade: 'fitness',
    reading: readingOf({ name: BOXING, offerings: [] }),
    media: clubMedia()
  })
  for (const id of ['own-usable-photos', 'source-and-credit', 'hero-candidates', 'people-with-portrait'])
    assert.equal(check(r, id).verdict, 'pass', id)
  const c = check(r, 'business-content')
  assert.equal(c.verdict, 'block')
  assert.deepEqual(c.measured, { offerings: 0, menus: 0, story: 0, facts: 0, items: 0 })
  assert.deepEqual([r.verdict, r.next], ['block', 'research-again'])
  assert.ok(r.ownerQuestions.some((q) => q.id === 'owner.business-content'))
})

test('Portland-like: a bio, sharp labelled photos and an empty reading still block (the bio is no business content)', () => {
  const r = readinessOf({
    name: BOXING,
    trade: 'fitness',
    profile: { bio: 'Boxing for everyone in town. Come train with us.' },
    reading: readingOf({ name: BOXING, offerings: [] }),
    media: clubMedia()
  })
  assert.equal(check(r, 'business-content').verdict, 'block')
  assert.deepEqual([r.verdict, r.next], ['block', 'research-again'])
})

// --- Every other source of what a business offers counts, so a real brief is never refused for its shape. ---
const DINER = 'Lanternfish Noodle Bar'
test('a published menu alone passes: the Menu page shows it from its source', () => {
  const r = readinessOf(
    {
      name: DINER,
      trade: 'food',
      profile: { menus: [{ url: 'https://example.test/menu.pdf', source: 'website' }] },
      media: clubMedia()
    },
    { templateKinds: ['business', 'gallery'] }
  )
  const c = check(r, 'business-content')
  assert.deepEqual([c.verdict, c.measured.menus], ['pass', 1])
  assert.deepEqual(
    r.checks.filter((x) => x.verdict !== 'pass').map((x) => x.id),
    []
  )
  assert.deepEqual([r.verdict, r.next], ['pass', 'build'])
})

test('menu lines a menu reader collected pass, as offering facts and as Menu page items', () => {
  const r = readinessOf({
    name: DINER,
    trade: 'food',
    profile: {
      menuItems: [
        {
          name: 'Beef noodle soup',
          price: '12',
          source: { kind: 'pdf', url: 'https://example.test/menu.pdf' }
        }
      ]
    },
    media: clubMedia()
  })
  const c = check(r, 'business-content')
  assert.equal(c.verdict, 'pass')
  assert.ok(c.measured.offerings >= 1 && c.measured.items >= 1, JSON.stringify(c.measured))
})

// A demo request's typed `business.items` arrive as `profile.menuItems` and its `business.description` as the bio
// (`public-demos.js` `importSnapshot`): the items count, the description alone does not.
const typedItems = (url) => [
  {
    name: 'Beginner boxing class',
    price: '20',
    currency: 'USD',
    section: null,
    source: { kind: 'page', url },
    verified: false
  }
]
test('offering items typed into a demo request pass, for a trade with or without a menu', () => {
  for (const trade of ['fitness', 'food']) {
    const r = readinessOf({
      name: BOXING,
      trade,
      profile: { bio: 'Boxing for everyone in town.', menuItems: typedItems('https://example.test/') },
      media: clubMedia()
    })
    const c = check(r, 'business-content')
    assert.equal(c.verdict, 'pass', trade)
    assert.ok(c.measured.offerings >= 1, JSON.stringify(c.measured))
  }
  const described = readinessOf({
    name: BOXING,
    trade: 'fitness',
    profile: { bio: 'Boxing for everyone in town.' },
    media: clubMedia()
  })
  assert.equal(check(described, 'business-content').verdict, 'block', 'a typed description alone')
})

test('a news post of the business passes', () => {
  const caption =
    'Big news for the neighbourhood: from next month our gym stays open late on Fridays and Saturdays, and the whole crew is ready to welcome night owls with open sparring, pads and bag work for every level. See you there for a late round with friends and family.'
  const r = readinessOf({
    name: BOXING,
    trade: 'fitness',
    media: clubMedia(),
    sources: [
      {
        source: 'instagram',
        ref: 'riverside',
        status: 'complete',
        collected: { posts: [{ id: 'post1', caption, url: 'https://example.test/p/1' }] }
      }
    ]
  })
  const c = check(r, 'business-content')
  assert.deepEqual([c.verdict, c.measured.items], ['pass', 1])
})

test('no reading at all is no business content either', () => {
  const r = readinessOf({ name: BOXING, trade: 'fitness', media: clubMedia() })
  assert.equal(check(r, 'business-content').verdict, 'block')
  assert.equal(r.verdict, 'block')
})

test('a business with offerings and no named team still passes: zero people is no warning', () => {
  const reading = readingOf({ name: CLUB, offerings: CLUB_OFFERINGS })
  const r = readinessOf({ name: CLUB, trade: 'fitness', reading, media: clubMedia() })
  assert.equal(check(r, 'people-with-portrait').measured.people, 0)
  assert.equal(check(r, 'people-with-portrait').verdict, 'pass')
  assert.equal(check(r, 'business-content').verdict, 'pass')
  assert.deepEqual([r.verdict, r.next], ['pass', 'build'])
})

test('a business with no offering but its own story and facts passes the content check', () => {
  const reading = readingOf({
    name: BOXING,
    offerings: [],
    story: ['Founded by two friends who wanted a ring for everyone in town'],
    facts: ['Open every day from seven in the morning']
  })
  const r = readinessOf({ name: BOXING, trade: 'fitness', reading, media: clubMedia() })
  const c = check(r, 'business-content')
  assert.deepEqual([c.verdict, c.measured.story, c.measured.facts], ['pass', 1, 1])
  assert.equal(r.verdict, 'pass')
})

test('a story only a post tells is business content', () => {
  const caption =
    'Our story began in a small garage. Founded in 2009 by two coaches, the gym opened its doors to everyone who wanted to learn to box, and it still welcomes beginners every week.'
  const r = readinessOf({
    name: BOXING,
    trade: 'fitness',
    reading: readingOf({ name: BOXING, offerings: [] }),
    media: clubMedia(),
    sources: [
      {
        source: 'instagram',
        ref: 'riverside',
        status: 'complete',
        collected: { posts: [{ id: 'post1', caption, url: 'https://example.test/p/1' }] }
      }
    ]
  })
  const c = check(r, 'business-content')
  assert.deepEqual([c.verdict, c.measured.story], ['pass', 1])
  assert.equal(r.verdict, 'pass')
})

test('a fact only the logo states is business content', () => {
  const logo = photo({ vision: null })
  const r = readinessOf({
    name: BOXING,
    trade: 'fitness',
    reading: readingOf({ name: BOXING, offerings: [] }),
    media: [logo, ...clubMedia()],
    brand: {
      logo: logo.id,
      logoResearch: { chosen: { readsAs: 'RIVERSIDE BOXING EST. 1998', mediaId: logo.id } }
    }
  })
  const c = check(r, 'business-content')
  assert.deepEqual([c.verdict, c.measured.facts], ['pass', 1])
  assert.equal(r.verdict, 'pass')
})

test('an item with neither a role nor a reason warns', () => {
  const brief = briefOf({ name: CLUB, trade: 'fitness', reading: clubReading, media: clubMedia() })
  assert.equal(check(domain.briefReadinessOf(brief), 'items-routed').verdict, 'pass')
  brief.integrations = [...brief.integrations, { kind: 'loyalty-card', url: 'https://example.test/card' }]
  const c = check(domain.briefReadinessOf(brief), 'items-routed')
  assert.deepEqual([c.verdict, c.measured.unrouted], ['warn', ['integration.loyalty-card']])
})

test('template content kinds: unknown without a template, block when one it shows is missing', () => {
  const input = { name: CLUB, trade: 'fitness', reading: clubReading, media: clubMedia() }
  assert.equal(check(readinessOf(input), 'template-kinds').verdict, 'unknown')
  const covered = readinessOf(input, { templateKinds: ['business', 'service', 'person', 'gallery'] })
  assert.equal(check(covered, 'template-kinds').verdict, 'pass')
  assert.equal(covered.verdict, 'pass')
  const missing = readinessOf(input, { templateKinds: ['service', 'faq', 'step'] })
  assert.deepEqual(check(missing, 'template-kinds').measured.missing, ['faq', 'step'])
  assert.deepEqual([missing.verdict, missing.next], ['block', 'ask-owner'])
  assert.ok(missing.ownerQuestions.some((q) => q.id === 'owner.template-kinds'))
})

test('the withheld facts of a brief are asked too, once each', () => {
  const brief = briefOf({ name: CLUB, trade: 'fitness', reading: clubReading, media: clubMedia() })
  const r = domain.briefReadinessOf(brief)
  const ids = r.ownerQuestions.map((q) => q.id)
  for (const q of domain.ownerQuestionsOf(brief)) assert.ok(ids.includes(q.id), q.id)
  assert.equal(new Set(ids).size, ids.length)
})
