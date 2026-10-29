// Every kept page has its own search title and description, and the not-found page speaks for the business (spec
// TracyHQ/tracy#189, round 9, class G and I). Pure: no model, no site. Every business is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notFoundPageOf, pageSeoOf } from '../domain/page-seo.mjs'
import { placeSeoOf } from '../domain/place-seo.mjs'
import { planSite } from '../domain/site-plan.mjs'

/** A made-up mobile tutor, based in a district, teaching across the city. */
function tutorBrief() {
  return {
    business: {
      name: 'Brightpath Tutors',
      trade: 'education',
      phone: '+44 20 7946 0777',
      address: '3 Orchard Way - Fernhill - Port Marlow - Exampleland',
      serviceAreas: [{ text: 'Lessons at your home across Port Marlow' }]
    },
    reading: {
      services: [
        { label: 'Maths Tutoring', quote: 'maths tutoring' },
        { label: 'Physics Tutoring', quote: 'physics tutoring' }
      ]
    }
  }
}

/** A made-up bakery with no address. */
function bakeryBrief() {
  return {
    business: { name: 'Copperleaf Bakery', trade: 'food' },
    reading: { services: [{ label: 'Sourdough', quote: 'sourdough' }] }
  }
}

const kept = [
  { id: 'home', path: '/', role: 'home', decision: 'keep' },
  { id: 'about-us', path: '/about-us', role: 'about', decision: 'keep' },
  { id: 'about-us/our-tutors', path: '/about-us/our-tutors', role: 'team', decision: 'keep' },
  { id: 'about-us/contact', path: '/about-us/contact', role: 'contact', decision: 'keep' },
  { id: 'lessons', path: '/lessons', role: 'services', decision: 'keep' },
  { id: 'plans', path: '/plans', role: 'pricing', decision: 'drop' }
]

test('every kept page has a title and a description of its own; a dropped page has none', () => {
  const name = 'Brightpath Tutors'
  const seo = placeSeoOf(tutorBrief(), { name })
  const plan = pageSeoOf(tutorBrief(), { seo, name, pages: kept, contact: { phone: { value: '+44 20 7946 0777' } } })
  assert.deepEqual(
    plan.map((p) => p.path),
    ['/', '/about-us', '/about-us/our-tutors', '/about-us/contact', '/lessons']
  )
  // The home page says exactly the site plan's search result.
  assert.equal(plan[0].title, seo.title)
  assert.equal(plan[0].description, seo.description)
  const byPath = Object.fromEntries(plan.map((p) => [p.path, p]))
  assert.equal(byPath['/about-us/contact'].title, 'Contact | Brightpath Tutors')
  assert.equal(
    byPath['/about-us/contact'].description,
    'Contact Brightpath Tutors in Port Marlow: call +44 20 7946 0777.'
  )
  assert.equal(byPath['/lessons'].title, 'Maths and physics tutoring | Brightpath Tutors')
  assert.match(byPath['/about-us'].description, /^About Brightpath Tutors, based in Fernhill, Port Marlow\./)
  // No two pages share a title or a description, none is too long, none carries a dash.
  assert.equal(new Set(plan.map((p) => p.title)).size, plan.length)
  assert.equal(new Set(plan.map((p) => p.description)).size, plan.length)
  for (const p of plan) {
    assert.ok([...p.title].length <= 60, p.title)
    assert.ok([...p.description].length <= 155, p.description)
    assert.doesNotMatch(`${p.title} ${p.description}`, /[–—]| - /)
  }
})

test('a business by appointment says so in its Contact description; no city, no place is invented', () => {
  const plan = pageSeoOf(bakeryBrief(), {
    seo: placeSeoOf(bakeryBrief(), { name: 'Copperleaf Bakery' }),
    name: 'Copperleaf Bakery',
    pages: kept.slice(0, 4),
    contact: { booking: { value: 'By appointment.' } }
  })
  const contact = plan.find((p) => p.role === 'contact')
  assert.equal(contact.description, 'Contact Copperleaf Bakery. By appointment.')
  assert.ok(plan.every((p) => !/ in |based in/.test(p.description)))
})

test('the not-found page names the business and leads home and to the kept Contact page', () => {
  const page = notFoundPageOf(tutorBrief(), { name: 'Brightpath Tutors', pages: kept })
  assert.equal(page.title, 'Page not found | Brightpath Tutors')
  assert.match(page.message, /Brightpath Tutors/)
  assert.deepEqual(
    page.links.map((l) => l.path),
    ['/', '/about-us/contact']
  )
  const bare = notFoundPageOf(bakeryBrief(), { name: null, pages: [] })
  assert.deepEqual(
    bare.links.map((l) => l.path),
    ['/']
  )
})

test('the site plan carries every kept page search result and the not-found page', () => {
  const served = {
    set: { contentHash: 'c'.repeat(64) },
    questions: [
      { id: 'name', kind: 'text' },
      { id: 'pages', kind: 'multi', feeds: ['site.pages'], options: ['home', 'about', 'contact'], locked: ['home'] }
    ]
  }
  const brief = {
    madeAt: '2026-10-20T08:00:00.000Z',
    ...tutorBrief(),
    sitemap: [{ slug: 'home', sections: [{ kind: 'hero', copy: 'Brightpath Tutors.' }] }],
    content: { items: [] }
  }
  const plan = planSite(brief, served, { now: '2026-10-30T00:00:00.000Z' })
  const kept = plan.pages.filter((p) => p.decision === 'keep')
  assert.ok(kept.length >= 2)
  assert.deepEqual(
    plan.seo.pages.map((p) => p.id),
    kept.map((p) => p.id)
  )
  assert.equal(plan.seo.pages[0].title, plan.seo.title)
  assert.equal(plan.seo.notFound.heading, 'Page not found')
})
