// The first screen of a brief build answers three questions (spec TracyHQ/tracy#189, COO rule 29/10/2026): WHAT the
// business offers, WHERE it is, and HOW TO CONTACT it. Decided by slot role in the site plan, checked on the served page.
// Pure: no model, no site. Every business below is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkHeroAnswers, heroSlotsOf, planHero } from '../domain/hero-first-screen.mjs'
import { planSite } from '../domain/site-plan.mjs'

/** A T4 template's hero module (roles declared), a section after it, and a Contact page. */
function t4Map() {
  const at = (field) => ['hero', `hero[${field}]`, 0]
  return {
    roleVocabularyVersion: 3,
    entities: [
      { key: 'module-40', kind: 'module', identity: { module: 'mod_ja_acm', position: 'hero' } },
      { key: 'module-41', kind: 'module', identity: { module: 'mod_ja_acm', position: 'section-1' } }
    ],
    pages: [
      {
        entity: 'menuItem-10',
        route: 'home',
        link: 'index.php?option=com_content&view=featured',
        assignedModules: [
          { entity: 'module-41', position: 'section-1', assignmentMode: 'include', published: '1' },
          { entity: 'module-40', position: 'hero', assignmentMode: 'include', published: '1' }
        ]
      },
      {
        entity: 'menuItem-30',
        route: 'about/contact',
        link: 'index.php?option=com_contact&view=contact&id=1'
      }
    ],
    slots: [
      {
        key: 'module-40.0',
        entity: 'module-40',
        type: 'image',
        role: 'business.hero_image',
        sample: 'images/hero.jpg'
      },
      {
        key: 'module-40.1',
        entity: 'module-40',
        type: 'text',
        role: 'claim.heading',
        jsonPath: at('title'),
        sample: 'No1 studio since 1999',
        maxCharacters: 110,
        fit: { measured: true, maxCharacters: 45 }
      },
      {
        key: 'module-40.2',
        entity: 'module-40',
        type: 'text',
        role: 'editorial.paragraph',
        jsonPath: at('desc'),
        sample: 'Become your best self.',
        maxCharacters: 128,
        fit: { measured: true, maxCharacters: 70 }
      },
      {
        key: 'module-40.3',
        entity: 'module-40',
        type: 'text',
        role: 'editorial.paragraph',
        jsonPath: at('sub-desc'),
        sample: 'No strings attached'
      },
      {
        key: 'module-40.4',
        entity: 'module-40',
        type: 'text',
        role: 'contact.cta_label',
        jsonPath: at('button'),
        group: { id: 'module-40.section.0', kind: 'contact' },
        sample: 'GET A FREE SESSION',
        maxCharacters: 84,
        fit: { measured: true, maxCharacters: 43 }
      },
      {
        key: 'module-40.5',
        entity: 'module-40',
        type: 'url',
        role: 'contact.cta_url',
        jsonPath: at('btn-link'),
        group: { id: 'module-40.section.0', kind: 'contact' },
        sample: 'index.php?Itemid=30'
      },
      {
        key: 'module-40.6',
        entity: 'module-40',
        type: 'text',
        role: 'contact.cta_label',
        jsonPath: at('button-2'),
        group: { id: 'module-40.cta.2', kind: 'contact' },
        sample: ''
      },
      {
        key: 'module-40.7',
        entity: 'module-40',
        type: 'text',
        column: 'title',
        role: 'editorial.heading',
        sample: 'Hero'
      },
      {
        key: 'module-41.0',
        entity: 'module-41',
        type: 'text',
        role: 'editorial.heading',
        sample: 'Our classes'
      }
    ]
  }
}

/** A T3 template's slideshow: one HTML module, no roles, the words read from its markup. */
function t3Map() {
  return {
    entities: [
      { key: 'module-70', kind: 'module', identity: { module: 'mod_custom', position: 'slideshow' } }
    ],
    pages: [
      {
        entity: 'menuItem-5',
        route: 'home',
        assignedModules: [
          { entity: 'module-70', position: 'slideshow', assignmentMode: 'include', published: '1' }
        ]
      },
      { entity: 'menuItem-12', route: 'contact-us' }
    ],
    slots: [
      {
        key: 'module-70.0',
        entity: 'module-70',
        type: 'text',
        column: 'content',
        xpath: '/html/body/div/h2/text()',
        sample: 'Welcome to our home'
      },
      {
        key: 'module-70.1',
        entity: 'module-70',
        type: 'text',
        column: 'content',
        xpath: '/html/body/div/p/text()',
        sample: 'The finest place in town since 1990',
        maxCharacters: 90
      },
      {
        key: 'module-70.2',
        entity: 'module-70',
        type: 'text',
        column: 'content',
        xpath: '/html/body/div/a/text()',
        sample: 'Learn more',
        maxCharacters: 40
      },
      {
        key: 'module-70.3',
        entity: 'module-70',
        type: 'url',
        column: 'content',
        xpath: '/html/body/div/a/@href',
        sample: 'index.php?Itemid=12'
      }
    ]
  }
}

/** A made-up dental clinic: phone, an address with its city, three services, a key message. */
function clinicBrief() {
  return {
    madeAt: '2026-10-20T08:00:00.000Z',
    business: {
      name: 'Brightmoor Dental',
      trade: 'health',
      phone: '+44 20 7946 0555',
      address: '22 Elm Row - Westford - Calderhill - Exampleland'
    },
    keyMessages: [
      {
        label: 'Gentle dentistry for families',
        quotes: [{ text: 'Gentle dentistry for families', sourceRef: 'bio' }]
      }
    ],
    reading: {
      services: [
        { label: 'Check-ups', quote: 'check-ups' },
        { label: 'Teeth Whitening', quote: 'teeth whitening' },
        { label: 'Dental Implants', quote: 'dental implants' }
      ]
    },
    sitemap: [
      {
        slug: 'home',
        sections: [
          {
            kind: 'hero',
            copy: 'Gentle dentistry for families: check-ups, teeth whitening, dental implants.'
          }
        ]
      }
    ],
    content: { items: [] }
  }
}

/** A made-up bakery: no phone, a WhatsApp number, no address and no area served. */
function bakeryBrief() {
  return {
    madeAt: '2026-10-20T08:00:00.000Z',
    business: { name: 'Copperleaf Bakery' },
    contact: { whatsapp: { number: '+447700900222' } },
    reading: {
      services: [
        { label: 'Sourdough Bread', quote: 'sourdough bread' },
        { label: 'Pastries', quote: 'pastries' }
      ]
    },
    sitemap: [
      { slug: 'home', sections: [{ kind: 'hero', copy: 'Copperleaf Bakery. Sourdough bread, pastries.' }] }
    ],
    content: { items: [] }
  }
}

const valueOf = (plan, key) => plan.slots.find((s) => s.key === key)?.value

test('the hero slots are found by role and position: headline, subline, the main button and its link', () => {
  const hero = heroSlotsOf(t4Map())
  assert.equal(hero.entity, 'module-40')
  assert.equal(hero.headline.key, 'module-40.1')
  assert.equal(hero.subline.key, 'module-40.2')
  assert.equal(hero.cta.label.key, 'module-40.4')
  assert.equal(hero.cta.href.key, 'module-40.5')
})

test('a T3 slideshow with no roles: the hero slots are read from the markup they sit in', () => {
  const hero = heroSlotsOf(t3Map())
  assert.equal(hero.entity, 'module-70')
  assert.equal(hero.headline.key, 'module-70.0')
  assert.equal(hero.subline.key, 'module-70.1')
  assert.equal(hero.cta.label.key, 'module-70.2')
  assert.equal(hero.cta.href.key, 'module-70.3')
})

test('a clinic with no USP: the headline says what and where, the subline the whole list, the button calls the phone', () => {
  const plan = planHero(clinicBrief(), t4Map(), {
    phone: { value: '+44 20 7946 0555', href: 'tel:+442079460555', source: 'business.phone' }
  })
  // "Gentle dentistry for families" is the owner's line, but generic: it is no USP (COO rule 29/10/2026).
  assert.equal(valueOf(plan, 'module-40.1'), 'Check-ups and teeth whitening in Calderhill')
  assert.equal(valueOf(plan, 'module-40.2'), 'Check-ups, teeth whitening and dental implants.')
  assert.equal(valueOf(plan, 'module-40.4'), 'Call +44 20 7946 0555')
  assert.equal(valueOf(plan, 'module-40.5'), 'tel:+442079460555')
  // The line under the button is left alone.
  assert.equal(valueOf(plan, 'module-40.3'), undefined)
  assert.deepEqual(
    plan.hero.missing.map((m) => m.kind),
    ['why', 'who']
  )
  assert.equal(plan.hero.missing[0].question, 'What makes you different from other clinics in Calderhill?')
  assert.equal(plan.hero.contact.kind, 'phone')
})

test('a bakery with no phone falls to WhatsApp; with no area the headline names only what it sells, and WHERE is reported', () => {
  const plan = planHero(bakeryBrief(), t4Map(), {
    whatsapp: { value: '+447700900222', href: 'https://wa.me/447700900222', source: 'contact.whatsapp' }
  })
  assert.equal(valueOf(plan, 'module-40.1'), 'Sourdough bread and pastries')
  // The headline holds every offering and the brief names nobody it serves: the subline says nothing twice.
  assert.equal(valueOf(plan, 'module-40.2'), undefined)
  assert.equal(valueOf(plan, 'module-40.4'), 'WhatsApp us')
  assert.equal(valueOf(plan, 'module-40.5'), 'https://wa.me/447700900222')
  assert.deepEqual(
    plan.hero.missing.map((m) => m.kind),
    ['why', 'who', 'where']
  )
})

test('no phone, no WhatsApp: a verified booking link, else the Contact page under a label that names the action', () => {
  const booked = {
    ...bakeryBrief(),
    integrations: [{ kind: 'booking', url: 'https://book.example/copperleaf', verified: true }]
  }
  booked.sitemap[0].sections[0].cta = {
    kind: 'booking',
    label: 'Book a table',
    href: 'https://book.example/copperleaf'
  }
  const plan = planHero(booked, t4Map(), {})
  assert.equal(valueOf(plan, 'module-40.4'), 'Book a table')
  assert.equal(valueOf(plan, 'module-40.5'), 'https://book.example/copperleaf')

  const form = planHero(bakeryBrief(), t4Map(), {})
  assert.equal(valueOf(form, 'module-40.4'), 'Send us a message')
  // The template's own link already leads to the Contact page: it is kept, never rewritten.
  assert.equal(valueOf(form, 'module-40.5'), undefined)
  assert.equal(form.hero.contact.kind, 'form')
})

test('a service area stands for the city when the brief has no address; nothing is invented when it has neither', () => {
  const brief = {
    ...bakeryBrief(),
    business: { name: 'Copperleaf Bakery', serviceAreas: [{ text: 'Deliveries across Ashby Vale' }] }
  }
  // A T3 slideshow: its heading and its line are both the first screen.
  const plan = planHero(brief, t3Map(), {})
  assert.equal(valueOf(plan, 'module-70.0'), 'Sourdough bread and pastries')
  assert.equal(valueOf(plan, 'module-70.1'), undefined)
  assert.equal(plan.hero.where.value, 'Deliveries across Ashby Vale')

  const bare = { business: { name: 'Copperleaf Bakery' }, sitemap: [], content: { items: [] } }
  const none = planHero(bare, t3Map(), {})
  assert.equal(valueOf(none, 'module-70.0'), undefined)
  assert.equal(valueOf(none, 'module-70.1'), undefined)
  assert.deepEqual(
    none.hero.missing.map((m) => m.kind),
    ['what', 'why', 'who', 'where']
  )
})

test('a line too long for its box drops services from the end, never cuts a word', () => {
  const brief = clinicBrief()
  brief.reading.services.push(
    { label: 'Orthodontics', quote: 'orthodontics' },
    { label: 'Emergency Care', quote: 'emergency care' }
  )
  const map = t4Map()
  map.slots.find((s) => s.key === 'module-40.2').fit.maxCharacters = 60
  const plan = planHero(brief, map, {})
  const line = valueOf(plan, 'module-40.2')
  assert.ok(line.length <= 60, line)
  assert.equal(line, 'Check-ups, teeth whitening and dental implants.')
  assert.ok(valueOf(plan, 'module-40.1').length <= 45)
})

test('the site plan carries the hero lines as slot values and the answers', () => {
  const plan = planSite(
    clinicBrief(),
    { questions: [] },
    { now: '2026-10-29T00:00:00.000Z', contentMap: t4Map() }
  )
  const head = plan.slots.find((s) => s.key === 'module-40.1')
  assert.equal(head.decision, 'value')
  assert.equal(head.value, 'Check-ups and teeth whitening in Calderhill')
  const sub = plan.slots.find((s) => s.key === 'module-40.2')
  assert.equal(sub.decision, 'value')
  assert.equal(sub.reason, 'hero-what')
  assert.equal(sub.value, 'Check-ups, teeth whitening and dental implants.')
  const cta = plan.slots.find((s) => s.key === 'module-40.4')
  assert.equal(cta.reason, 'hero-contact')
  assert.equal(cta.value, 'Call +44 20 7946 0555')
  assert.equal(plan.slots.find((s) => s.key === 'module-40.5').value, 'tel:+442079460555')
  assert.deepEqual(
    plan.hero.missing.map((m) => m.kind),
    ['why', 'who']
  )
})

const page = (inner) =>
  `<html><body><header><a href="/">Home</a></header><div id="t4-hero"><div class="acm-hero">${inner}</div></div>` +
  '<div id="t4-section-1"><h2>Our services</h2><a class="btn" href="tel:+442079460555">Call</a></div></body></html>'

test('the check reads the served first screen and names the questions it does not answer', () => {
  const brief = clinicBrief()
  const good = page(
    '<h1>Gentle dentistry for families</h1><div class="lead">Check-ups, teeth whitening and dental implants in Calderhill.</div>' +
      '<a class="btn" href="tel:+442079460555">Call +44 20 7946 0555</a>'
  )
  // The clinic's brief proves no difference and names nobody it serves: the check says so, and asks the owner.
  const answers = checkHeroAnswers({ pages: [{ path: '/', html: good }], brief })
  assert.deepEqual(
    answers.map((m) => m.kind),
    ['why', 'who']
  )
  assert.equal(answers[0].question, 'What makes you different from other clinics in Calderhill?')

  const mood = page(
    '<h1>Gentle dentistry for families</h1><div class="lead">Smile a little more every day.</div>' +
      '<a class="btn" href="/index.php/contact">Contact</a>'
  )
  assert.deepEqual(
    checkHeroAnswers({ pages: [{ path: '/', html: mood }], brief }).map((m) => m.kind),
    ['what', 'why', 'who', 'where', 'contact']
  )
})

test('the check passes a bakery hero that sends to WhatsApp, and names WHERE the brief itself lacks', () => {
  const html = page(
    '<h1>Copperleaf Bakery</h1><p>Sourdough bread and pastries.</p><a class="btn" href="https://wa.me/447700900222">WhatsApp us</a>'
  )
  const missing = checkHeroAnswers({ pages: [{ path: '/', html }], brief: bakeryBrief() })
  assert.deepEqual(
    missing.map((m) => m.kind),
    ['why', 'who', 'where']
  )
  assert.match(missing[2].why, /brief/)
})

test('a button that says "Call" but leads to a page, and a headline that alone says the trade, are reported', () => {
  const html = page(
    '<h1>Gentle dentistry for families</h1><div class="lead">Smile a little more in Calderhill.</div>' +
      '<a class="btn" href="/index.php/contact">CALL 020 7946 0555</a>'
  )
  const missing = checkHeroAnswers({ pages: [{ path: '/', html }], brief: clinicBrief() })
  assert.deepEqual(
    missing.map((m) => m.kind),
    ['what', 'why', 'who', 'contact']
  )
  assert.match(missing[3].why, /promises a call/)
})

test('a hero with one line only: it says what and where, and keeps a short form for a heading that names the place', () => {
  const map = t4Map()
  map.slots = map.slots.filter((s) => s.key !== 'module-40.1')
  const plan = planHero(clinicBrief(), map, {})
  const sub = plan.slots.find((s) => s.key === 'module-40.2')
  assert.equal(sub.value, 'Check-ups, teeth whitening and dental implants in Calderhill.')
  assert.equal(sub.short, undefined)
})

test('no phone, WhatsApp or booking: a channel the business names itself comes before the Contact page', () => {
  const brief = bakeryBrief()
  delete brief.contact
  brief.sitemap[0].sections[0].cta = {
    kind: 'link',
    label: 'Message on Instagram',
    href: 'https://ig.me/m/copperleaf.example'
  }
  const plan = planHero(brief, t4Map(), {})
  assert.equal(valueOf(plan, 'module-40.4'), 'Message on Instagram')
  assert.equal(valueOf(plan, 'module-40.5'), 'https://ig.me/m/copperleaf.example')
  const html = page(
    '<h1>Copperleaf Bakery</h1><p>Sourdough bread and pastries.</p><a class="btn" href="https://ig.me/m/copperleaf.example">Message on Instagram</a>'
  )
  assert.deepEqual(
    checkHeroAnswers({ pages: [{ path: '/', html }], brief }).map((m) => m.kind),
    ['why', 'who', 'where']
  )
})
