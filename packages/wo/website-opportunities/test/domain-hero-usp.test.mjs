// The hero headline says what sets the business apart, only when the brief proves it (spec TracyHQ/tracy#189, COO rule
// 29/10/2026): specific, differentiating, and a fact of the brief or a theme two reviews state. Else the headline says what
// and where, and the owner is asked. Pure: no model, no site. Every business below is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkHeroAnswers, planHero } from '../domain/hero-first-screen.mjs'
import { checkUspTheme, findUsp, isSpecificClaim } from '../domain/hero-usp.mjs'

/** A hero with a headline (45 characters), a subline (70) and a main button. */
function heroMap() {
  const at = (field) => ['hero', `hero[${field}]`, 0]
  const text = (n, role, field, sample, max) => ({
    key: `module-40.${n}`,
    entity: 'module-40',
    type: 'text',
    role,
    jsonPath: at(field),
    sample,
    fit: { measured: true, maxCharacters: max }
  })
  return {
    entities: [{ key: 'module-40', kind: 'module', identity: { module: 'mod_ja_acm', position: 'hero' } }],
    pages: [
      {
        entity: 'menuItem-10',
        route: 'home',
        assignedModules: [{ entity: 'module-40', position: 'hero', published: '1' }]
      }
    ],
    slots: [
      text(1, 'claim.heading', 'title', 'Find your flow', 45),
      text(2, 'editorial.paragraph', 'desc', 'Every day a little better.', 70),
      text(3, 'contact.cta_label', 'button', 'JOIN NOW', 30),
      {
        key: 'module-40.4',
        entity: 'module-40',
        type: 'url',
        role: 'contact.cta_url',
        jsonPath: at('link'),
        sample: '#'
      }
    ]
  }
}

const phone = { phone: { value: '+44 20 7946 0123', href: 'tel:+442079460123', source: 'business.phone' } }
const valueOf = (plan, key) => plan.slots.find((s) => s.key === key)?.value

/** A made-up swim school: generic key message, but two reviews say the same coaches teach their children and them. */
function swimBrief() {
  return {
    business: {
      name: 'Tidewater Swim Club',
      trade: 'fitness',
      subTrade: { id: 'coaching' },
      phone: '+44 20 7946 0123',
      address: '4 Quay Lane - Port Marlow - Exampleland'
    },
    keyMessages: [{ id: 'k1', label: 'Premium European swim coaching', factRefs: ['f1'] }],
    facts: [
      { id: 'f1', field: 'story', value: { text: 'Premium European swim coaching' }, onSite: true },
      { id: 'f2', field: 'phone', value: '+44 20 7946 0123', onSite: true }
    ],
    reading: {
      services: [
        { label: 'Swimming Lessons', quote: 'swimming lessons' },
        { label: 'Water Polo', quote: 'water polo' },
        { label: 'Aqua Fitness', quote: 'aqua fitness' }
      ],
      audience: [{ label: 'all ages and levels', quote: 'For all ages and levels' }]
    },
    googlePlace: {
      reviews: [
        {
          rating: 5,
          text: 'Great coaches. My kids also swim with the same coaches as me, and they love it.'
        },
        {
          rating: 4,
          text: 'They coach my daughter, and my husband trains with them too. Patient with every level.'
        },
        { rating: 5, text: 'Friendly team, highly recommend.' }
      ]
    },
    sitemap: [],
    content: { items: [] }
  }
}

/** A made-up yoga studio: only generic praise, in its own words and in every review. */
function yogaBrief() {
  return {
    business: {
      name: 'Lumen Yoga Loft',
      trade: 'fitness',
      subTrade: { id: 'studio' },
      address: '9 Mill Yard - Port Marlow - Exampleland'
    },
    keyMessages: [{ id: 'k1', label: 'Quality yoga for everyone', factRefs: ['f1'] }],
    facts: [{ id: 'f1', field: 'story', value: { text: 'Quality yoga for everyone' }, onSite: true }],
    reading: { services: [{ label: 'Yoga Classes', quote: 'yoga classes' }] },
    googlePlace: {
      reviews: [
        { rating: 5, text: 'Friendly teachers and great classes.' },
        { rating: 5, text: 'Best studio in town, highly recommend!' },
        { rating: 3, text: 'Nice place, good vibe.' }
      ]
    },
    sitemap: [],
    content: { items: [] }
  }
}

/** A made-up tennis coach: one fact the owner states proves a credential. */
function tennisBrief() {
  return {
    business: {
      name: 'Ridgeline Tennis',
      trade: 'fitness',
      subTrade: { id: 'coaching' },
      address: '1 Court Row - Port Marlow - Exampleland'
    },
    facts: [
      {
        id: 'f9',
        field: 'story',
        value: { text: 'Former national champion, coaching since 2009. Lessons all week.' },
        onSite: true
      },
      { id: 'f10', field: 'story', value: { text: 'Coached by a former pro since 2001' }, onSite: false }
    ],
    reading: { services: [{ label: 'Tennis Lessons', quote: 'tennis lessons' }] },
    googlePlace: { reviews: [] },
    sitemap: [],
    content: { items: [] }
  }
}

test('generic words never make a USP; a concrete method, credential or promise does', () => {
  const others = ['coaching team', 'Port Marlow', 'swimming lessons']
  assert.equal(isSpecificClaim('European coaching in Port Marlow', { others }).specific, false)
  assert.equal(isSpecificClaim('For all ages & levels', { others }).specific, false)
  assert.equal(isSpecificClaim('Friendly, premium, the best quality', { others }).specific, false)
  assert.equal(isSpecificClaim('Former national champion, coaching since 2009', { others }).specific, true)
  assert.equal(isSpecificClaim('The same coaches teach the whole family', { others }).specific, true)
})

test('a review theme two reviews state is the USP: the headline says it with the place, the subline what and who', () => {
  const found = findUsp(swimBrief(), { places: ['Port Marlow'] })
  assert.equal(found.usp.id, 'whole-family')
  assert.deepEqual(
    found.usp.evidence.map((e) => e.review),
    [0, 1]
  )
  assert.match(found.usp.evidence[0].quote, /same coaches/)
  // The owner's key message is generic: weighed, and refused.
  const msg = found.weighed.find((w) => w.kind === 'key-message')
  assert.equal(msg.pass, false)

  const plan = planHero(swimBrief(), heroMap(), phone)
  assert.equal(valueOf(plan, 'module-40.1'), 'One team for the whole family, in Port Marlow')
  assert.equal(plan.slots.find((s) => s.key === 'module-40.1').reason, 'hero-why')
  // The USP's key words carry the template's accent.
  assert.equal(
    plan.slots.find((s) => s.key === 'module-40.1').marked,
    'One team for the [[whole family]], in Port Marlow'
  )
  // The box is short: the detail of who goes first, the place is in the headline, the offerings stay.
  assert.equal(
    valueOf(plan, 'module-40.2'),
    'Swimming lessons, water polo and aqua fitness for kids and adults.'
  )
  assert.equal(valueOf(plan, 'module-40.3'), 'Call +44 20 7946 0123')
  assert.deepEqual(plan.hero.missing, [])
})

test('only generic praise: no USP, the headline says what and where, and the owner is asked what sets them apart', () => {
  const found = findUsp(yogaBrief(), { places: ['Port Marlow'] })
  assert.equal(found.usp, null)
  const plan = planHero(yogaBrief(), heroMap(), {})
  assert.equal(valueOf(plan, 'module-40.1'), 'Yoga classes in Port Marlow')
  assert.equal(plan.slots.find((s) => s.key === 'module-40.1').reason, 'hero-what')
  const why = plan.hero.missing.find((m) => m.kind === 'why')
  assert.equal(why.question, 'What makes you different from other studios in Port Marlow?')
})

test('a fact of the brief is the USP; a box too short for the place leaves the place to the subline', () => {
  const plan = planHero(tennisBrief(), heroMap(), {})
  assert.equal(plan.hero.usp.kind, 'fact')
  assert.deepEqual(plan.hero.usp.evidence, [{ kind: 'fact', id: 'f9' }])
  assert.equal(valueOf(plan, 'module-40.1'), 'Former national champion, coaching since 2009')
  assert.equal(valueOf(plan, 'module-40.2'), 'Tennis lessons in Port Marlow.')
  // A fact the site does not show proves nothing.
  assert.ok(!plan.hero.weighed.some((w) => /former pro/.test(w.label)))
})

test("a model's review theme passes only with quotes found word for word in two reviews, or a fact", () => {
  const brief = swimBrief()
  const quoted = {
    label: 'The same coaches teach the whole family',
    quotes: [
      { review: 0, text: 'My kids also swim with the same coaches as me' },
      { review: 1, text: 'They coach my daughter, and my husband trains with them too.' }
    ]
  }
  assert.equal(checkUspTheme(quoted, brief).pass, true)
  const invented = {
    ...quoted,
    quotes: [{ review: 0, text: 'The same coaches teach us all' }, quoted.quotes[1]]
  }
  assert.equal(checkUspTheme(invented, brief).pass, false)
  const once = { ...quoted, quotes: [quoted.quotes[0]] }
  assert.equal(checkUspTheme(once, brief).pass, false)
  const generic = { label: 'Friendly and professional', quotes: quoted.quotes }
  assert.equal(checkUspTheme(generic, brief).pass, false)
})

test('the check on the served page names a missing USP and a missing audience', () => {
  const html = (inner) =>
    `<html><body><div class="hero">${inner}</div><section><h2>Next</h2></section></body></html>`
  const good = html(
    '<h1>One team for the whole family, in Port Marlow</h1><p>Swimming lessons, water polo and aqua fitness for kids and adults.</p><a class="btn" href="tel:+442079460123">Call +44 20 7946 0123</a>'
  )
  assert.deepEqual(checkHeroAnswers({ pages: [{ path: '/', html: good }], brief: swimBrief() }), [])
  const mood = html(
    '<h1>Premium European swim coaching in Port Marlow</h1><p>Swimming lessons and water polo.</p><a class="btn" href="tel:+442079460123">Call +44 20 7946 0123</a>'
  )
  assert.deepEqual(
    checkHeroAnswers({ pages: [{ path: '/', html: mood }], brief: swimBrief() }).map((m) => m.kind),
    ['why', 'who']
  )
})
