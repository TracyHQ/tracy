// WHERE in three tiers (spec TracyHQ/tracy#189, COO rule 29/10/2026): a business that serves wider than its pin names its
// city in the hero and its district on the About and Contact pages and in the search result; a venue names
// "<district>, <city>" when it fits; with no district, the city. Pure: no model, no site. Every business is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { districtOf, heroWhereOf, planHero } from '../domain/hero-first-screen.mjs'
import { planPlaceIntros } from '../domain/page-intros.mjs'
import { placeSeoOf } from '../domain/place-seo.mjs'

/** A hero with a headline (45), a subline (70) and a button. */
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
      { entity: 'menuItem-10', route: 'home', assignedModules: [{ entity: 'module-40', position: 'hero' }] },
      { entity: 'menuItem-11', route: 'about-us', link: 'index.php?option=com_content&view=article&id=2' },
      { entity: 'menuItem-12', route: 'contact', link: 'index.php?option=com_contact&view=contact&id=1' }
    ],
    intros: [{ entity: 'module-9', field: 'menuitem_config', items: [['11'], ['12']] }],
    slots: [
      text(1, 'claim.heading', 'title', 'Find your flow', 45),
      text(2, 'editorial.paragraph', 'desc', 'Every day a little better.', 70),
      ...[0, 1].flatMap((n) => [
        {
          key: `module-9.${n}`,
          entity: 'module-9',
          type: 'text',
          jsonPath: ['menuitem_config', 'title', n],
          sample: 'Title'
        },
        {
          key: `module-9.${n + 10}`,
          entity: 'module-9',
          type: 'text',
          jsonPath: ['menuitem_config', 'description', n],
          sample: 'A line about this page.',
          fit: { measured: true, maxCharacters: 120 }
        }
      ])
    ]
  }
}

const pages = [
  { id: 'home', decision: 'keep' },
  { id: 'about-us', decision: 'keep' },
  { id: 'contact', decision: 'keep' }
]

/** A made-up mobile tutor: based in a district, teaching across the city (tier wide). */
function tutorBrief() {
  return {
    business: {
      name: 'Brightpath Tutors',
      trade: 'education',
      phone: '+44 20 7946 0777',
      address: '3 Orchard Way - Fernhill - Port Marlow - Exampleland',
      serviceAreas: [{ text: 'Lessons at your home across Port Marlow' }]
    },
    reading: { services: [{ label: 'Maths Tutoring', quote: 'maths tutoring' }] }
  }
}

/** A made-up cafe customers visit: a district, no wider area (tier venue). */
function cafeBrief(address = '8 Quay Street - Old Harbour - Port Marlow - Exampleland') {
  return {
    business: { name: 'Saltwind Cafe', trade: 'food', address },
    reading: { services: [{ label: 'Coffee', quote: 'coffee' }] }
  }
}

test('the district is a part of the address, never invented', () => {
  assert.equal(
    districtOf('Al Hebiah Fourth - Fernhill Gardens - Port Marlow - Exampleland'),
    'Fernhill Gardens'
  )
  assert.equal(districtOf('12 Mill Road - Port Marlow - Exampleland'), null)
  assert.equal(districtOf('Port Marlow'), null)
})

test('tier wide: the hero names the city; About and Contact say the district and the area; the search result names both', () => {
  const where = heroWhereOf(tutorBrief())
  assert.equal(where.tier, 'wide')
  assert.equal(where.value, 'Port Marlow')
  const plan = planHero(tutorBrief(), heroMap(), {})
  assert.equal(plan.slots.find((s) => s.key === 'module-40.1').value, 'Maths tutoring in Port Marlow')
  const intros = planPlaceIntros({ brief: tutorBrief(), contentMap: heroMap(), pages })
  assert.deepEqual(
    intros.map((i) => [i.page, i.value]),
    [
      ['about-us', 'Based in Fernhill. Lessons at your home across Port Marlow.'],
      ['contact', 'Based in Fernhill. Lessons at your home across Port Marlow.']
    ]
  )
  const seo = placeSeoOf(tutorBrief(), { name: 'Brightpath Tutors', phone: '+44 20 7946 0777' })
  assert.equal(seo.title, 'Maths tutoring in Port Marlow | Brightpath Tutors')
  assert.equal(
    seo.description,
    'Brightpath Tutors, based in Fernhill, Port Marlow. Maths tutoring. Lessons at your home across Port Marlow.'
  )
  assert.deepEqual(seo.schema.address, {
    '@type': 'PostalAddress',
    streetAddress: '3 Orchard Way, Fernhill',
    addressLocality: 'Port Marlow',
    addressCountry: 'Exampleland'
  })
  assert.equal(seo.schema.areaServed, 'Lessons at your home across Port Marlow')
  assert.equal(seo.schema.telephone, '+44 20 7946 0777')
})

test('tier venue: the hero names "<district>, <city>" when it fits, else the city; no place intro', () => {
  assert.equal(heroWhereOf(cafeBrief()).tier, 'venue')
  const plan = planHero(cafeBrief(), heroMap(), {})
  assert.equal(plan.slots.find((s) => s.key === 'module-40.1').value, 'Coffee in Old Harbour, Port Marlow')
  const long = cafeBrief('8 Quay Street - Upper Saint Aldwyn Quarter - Port Marlow - Exampleland')
  const fallback = planHero(long, heroMap(), {})
  assert.equal(fallback.slots.find((s) => s.key === 'module-40.1').value, 'Coffee in Port Marlow')
  assert.deepEqual(planPlaceIntros({ brief: cafeBrief(), contentMap: heroMap(), pages }), [])
  assert.equal(placeSeoOf(cafeBrief(), { name: 'Saltwind Cafe' }).schema.areaServed, undefined)
})

test('tier city: no district, the city alone, and no country added', () => {
  const brief = cafeBrief('12 Mill Road - Port Marlow - Exampleland')
  const where = heroWhereOf(brief)
  assert.equal(where.tier, 'city')
  assert.equal(where.value, 'Port Marlow')
  const seo = placeSeoOf(brief, { name: 'Saltwind Cafe' })
  assert.equal(seo.title, 'Coffee in Port Marlow | Saltwind Cafe')
  assert.equal(seo.description, 'Saltwind Cafe, based in Port Marlow. Coffee.')
})
