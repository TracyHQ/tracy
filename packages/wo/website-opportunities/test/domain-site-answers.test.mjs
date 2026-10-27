import { test } from 'node:test'
import assert from 'node:assert/strict'
import { answersFromBrief, contactFacts } from '../domain/site-answers.mjs'

const HASH = 'a'.repeat(64)
const served = {
  set: { contentHash: HASH },
  questions: [
    { id: 'name', kind: 'text' },
    { id: 'logo', kind: 'logo' },
    { id: 'about', kind: 'longtext' },
    {
      id: 'pages',
      kind: 'multi',
      feeds: ['site.pages'],
      options: ['home', 'about-us', 'our-menu', 'our-menu-2', 'blog', 'contact-us', 'shop'],
      locked: ['home'],
      optionLabels: { blog: { en: 'Blog' } }
    },
    { id: 'languages', kind: 'languages', options: ['en-gb', 'vi-vn'] },
    { id: 'tone', kind: 'choice', options: ['plain', 'warm', 'bold'] }
  ]
}
const brief = {
  business: { name: 'The Larch House' },
  brand: { voice: 'English; informal tone — emoji (observed from bio)' },
  sitemap: [
    { slug: 'home', sections: [{ kind: 'hero', copy: 'The Larch House. European cuisine.' }] },
    { slug: 'menu', sections: [] },
    {
      slug: 'about',
      sections: [
        {
          kind: 'story',
          evidence: [
            {
              source: 'profile.bio',
              quote:
                'Relax at The Larch House, a European-style deli in a 100-year-old villa. ' +
                'Daily happy hour. '.repeat(30)
            }
          ]
        }
      ]
    },
    { slug: 'contact', sections: [] }
  ],
  // One post of the restaurant's own: without it the blog is taken off (see below).
  content: {
    items: [
      {
        id: 'fb-1',
        authorship: 'page',
        kinds: ['news'],
        title: 'New terrace seating',
        body: 'Our garden terrace is open again.',
        temporal: null
      }
    ]
  }
}

test('name, about (≤ 300, from the bio), the pages kept and the tone are answered; nothing is guessed', () => {
  const r = answersFromBrief(brief, served)
  assert.equal(r.questionnaire, HASH)
  assert.equal(r.answers.name, 'The Larch House')
  assert.ok(r.answers.about.length <= 300 && r.answers.about.startsWith('Relax at The Larch House'))
  // Every page of the template stays but the second menu layout; the brief's own sitemap no longer limits them.
  assert.deepEqual(r.answers.pages, ['home', 'about-us', 'our-menu', 'blog', 'contact-us', 'shop'])
  assert.deepEqual(r.pagePlan.pages.find((p) => p.id === 'our-menu-2')?.keep, false)
  assert.equal(r.answers.tone, 'warm')
  assert.equal(r.answers.logo, undefined)
  assert.equal(r.answers.languages, undefined)
  assert.ok(r.notes.some((n) => n.startsWith('languages')))
})

test('a template whose every page is kept leaves the pages question unanswered, which keeps them all', () => {
  const r = answersFromBrief(brief, {
    ...served,
    questions: [
      {
        id: 'pages',
        kind: 'multi',
        feeds: ['site.pages'],
        options: ['home', 'shop', 'blog'],
        locked: ['home']
      }
    ]
  })
  assert.equal(r.answers.pages, undefined)
  assert.match(r.notes[0], /every template page is kept/)
})

test('a pricing page keeps its layout: neutral without a collected price, the collected prices when the brief has them', () => {
  const pricing = {
    ...served,
    questions: [
      {
        id: 'pages',
        kind: 'multi',
        feeds: ['site.pages'],
        options: ['home', 'pricing', 'blog'],
        locked: ['home']
      }
    ]
  }
  const r = answersFromBrief(brief, pricing)
  assert.equal(r.answers.pages, undefined)
  assert.equal(r.pagePlan.pages.find((p) => p.id === 'pricing').fill, 'neutral')
  const priced = {
    ...brief,
    sitemap: [
      ...brief.sitemap,
      {
        slug: 'menu',
        sections: [
          {
            kind: 'menu',
            menuItems: [
              { name: 'Massage 60 min', price: '45' },
              { name: 'Facial', price: null }
            ]
          }
        ]
      }
    ]
  }
  assert.equal(
    answersFromBrief(priced, pricing).pagePlan.pages.find((p) => p.id === 'pricing').fill,
    'prices'
  )
})

test('a brief with no post of the restaurant unticks the blog, with its reason, so the build hides it and its menu links', () => {
  const r = answersFromBrief({ ...brief, content: undefined }, served)
  assert.deepEqual(r.answers.pages, ['home', 'about-us', 'our-menu', 'contact-us', 'shop'])
  assert.ok(r.notes.includes('pages: blog off — no post of the restaurant was collected'), r.notes.join('\n'))
})

test('contact facts for the create door: each sourced value with when the research was frozen; hours joined in order; nothing unsourced', () => {
  const at = '2026-10-19T10:00:00.000Z'
  const brief = {
    madeAt: at,
    business: {
      name: 'Pho Ba',
      branch: null,
      address: '12 Tran Phu, Hoi An',
      phone: ' +84 235 5550 134 ',
      email: 'hello@phoba.vn',
      socials: {},
      hours: ['Mon: 8 AM – 9 PM', ' ', 'Tue: 8 AM – 9 PM']
    }
  }
  assert.deepEqual(contactFacts(brief), {
    phone: { value: '+84 235 5550 134', source: 'business.phone', fetchedAt: at },
    email: { value: 'hello@phoba.vn', source: 'business.email', fetchedAt: at },
    address: { value: '12 Tran Phu, Hoi An', source: 'business.address', fetchedAt: at },
    hours: { value: 'Mon: 8 AM – 9 PM; Tue: 8 AM – 9 PM', source: 'business.hours', fetchedAt: at }
  })
  assert.deepEqual(
    contactFacts({ business: { name: 'Pho Ba', branch: null, address: null, phone: null, socials: {} } }),
    {}
  )
  assert.deepEqual(contactFacts({}), {})
})

test('the about answer is the About line the reading made of quoted words, before the raw bio (#1780)', () => {
  const read = {
    ...brief,
    reading: { about: 'The Fern Station offers European cuisine: brunch and coffee.' }
  }
  assert.equal(
    answersFromBrief(read, served).answers.about,
    'The Fern Station offers European cuisine: brunch and coffee.'
  )
})
