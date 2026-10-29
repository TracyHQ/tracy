// The intro of an offering page names its offerings and the place (spec TracyHQ/tracy#189, COO rule 29/10/2026). Pure:
// no model, no site. Every business below is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planPageIntros } from '../domain/page-intros.mjs'

/** A trimmed content map: a per-page masthead, an offerings category page, a contact page, two offering articles. */
function contentMap() {
  const masthead = (field, n, sample) => ({
    key: `module-9.${field === 'title' ? n : n + 10}`,
    entity: 'module-9',
    type: 'text',
    role: field === 'title' ? 'editorial.menu_label' : 'editorial.paragraph',
    jsonPath: ['menuitem_config', field, n],
    sample,
    fit: { measured: true, maxCharacters: 120 }
  })
  return {
    entities: [
      { key: 'category-4', kind: 'category' },
      { key: 'article-21', kind: 'article', identityReferences: { catid: 'category-4' } },
      { key: 'article-22', kind: 'article', identityReferences: { catid: 'category-4' } }
    ],
    pages: [
      { entity: 'menuItem-1', route: 'home', link: 'index.php?option=com_content&view=featured' },
      { entity: 'menuItem-40', route: 'treatments', link: 'index.php?option=com_content&view=category&id=4' },
      { entity: 'menuItem-41', route: 'contact', link: 'index.php?option=com_contact&view=contact&id=1' }
    ],
    intros: [{ entity: 'module-9', field: 'menuitem_config', items: [['41'], ['40']] }],
    slots: [
      masthead('title', 0, 'Say hello'),
      masthead('description', 0, 'We would love to hear from you.'),
      masthead('title', 1, 'Our classes'),
      masthead('description', 1, 'Ten rounds of boxing and conditioning.'),
      {
        key: 'article-21.0',
        entity: 'article-21',
        type: 'text',
        role: 'offering.name',
        sample: 'Beginner boxing'
      },
      {
        key: 'article-22.0',
        entity: 'article-22',
        type: 'text',
        role: 'offering.name',
        sample: 'Advanced boxing'
      }
    ]
  }
}

function clinicBrief(address = '22 Elm Row - Westford - Calderhill - Exampleland') {
  return {
    business: { name: 'Brightmoor Dental', ...(address ? { address } : {}) },
    reading: {
      services: [
        { label: 'Teeth Whitening', quote: 'teeth whitening' },
        { label: 'Dental Implants', quote: 'dental implants' }
      ]
    }
  }
}

const kept = [
  { id: 'home', decision: 'keep' },
  { id: 'treatments', decision: 'keep' },
  { id: 'contact', decision: 'keep' }
]
const cardNames = { 'article-21.offering': 'Teeth Whitening', 'article-22.offering': 'Dental Implants' }

test('an offering page intro names its offerings and the place; the contact intro is not touched', () => {
  const [intro, ...rest] = planPageIntros({
    brief: clinicBrief(),
    contentMap: contentMap(),
    pages: kept,
    cardNames
  })
  assert.equal(rest.length, 0)
  assert.equal(intro.key, 'module-9.11')
  assert.equal(intro.reason, 'intro-what')
  assert.equal(intro.when, 'missing')
  assert.equal(intro.value, 'Teeth whitening and dental implants in Westford, Calderhill.')
  assert.equal(intro.short, 'Teeth whitening and dental implants.')
  assert.equal(intro.heading, 'module-9.1')
  assert.deepEqual(intro.offerings, ['teeth whitening', 'dental implants'])
})

test('a page the plan drops gets no intro, and a brief with no place names only the offerings', () => {
  const dropped = kept.map((p) => (p.id === 'treatments' ? { ...p, decision: 'drop' } : p))
  assert.deepEqual(
    planPageIntros({ brief: clinicBrief(), contentMap: contentMap(), pages: dropped, cardNames }),
    []
  )
  const [intro] = planPageIntros({
    brief: clinicBrief(null),
    contentMap: contentMap(),
    pages: kept,
    cardNames: {}
  })
  assert.equal(intro.value, 'Teeth whitening and dental implants.')
  assert.equal(intro.place, undefined)
})

test('an offering page intro names who the offerings serve, from the owner audience, before the place', () => {
  const brief = clinicBrief()
  brief.reading.audience = [{ label: 'nervous patients', quote: 'for nervous patients' }]
  const [intro] = planPageIntros({ brief, contentMap: contentMap(), pages: kept, cardNames })
  assert.equal(
    intro.value,
    'Teeth whitening and dental implants for nervous patients in Westford, Calderhill.'
  )
  assert.equal(intro.who, 'nervous patients')
})
