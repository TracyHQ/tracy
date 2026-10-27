import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validatePlaceProfile } from '../domain/place-profile.mjs'

const fact = (id, value) => ({ id, value, evidenceRefs: ['e1'] })
const document = () => ({
  schema: 'website-opportunities/place-profile',
  schemaVersion: '1.0.0',
  business: { id: 'business', name: fact('name', 'Example Studio') },
  classification: { providerCategories: [], derivedCategories: [] },
  offerings: [
    fact('service', {
      kind: 'service',
      name: 'Massage',
      variants: [
        {
          duration: { amount: 60, unit: 'minute' },
          price: { kind: 'exact', raw: 'AED 200', amount: 200, currency: 'AED' }
        }
      ]
    })
  ],
  people: [],
  claims: { statistics: [], recognitions: [], relationships: [] },
  faqs: [],
  quotes: [],
  events: [],
  media: [
    fact('photo', {
      kind: 'image',
      url: 'https://example.test/photo.jpg',
      relations: [{ entityId: 'service', relation: 'depicts', evidenceRefs: ['e1'] }]
    })
  ],
  brand: {},
  links: [],
  sources: [{ id: 's1', kind: 'website', ref: 'https://example.test' }],
  evidence: [
    {
      id: 'e1',
      sourceId: 's1',
      locator: { kind: 'css', value: '.service' },
      extraction: { method: 'html', version: '1' }
    }
  ],
  coverage: [{ target: 'people', status: 'not_researched', sourceRefs: [] }],
  conflicts: [],
  extensions: {}
})

test('a sourced service, its duration, price and picture form a valid profile', () => {
  assert.deepEqual(validatePlaceProfile(document()), { ok: true, errors: [] })
})

test('schema validation rejects malformed facts, enum values and unknown unnamespaced content', () => {
  const changes = [
    [
      (d) => {
        d.schemaVersion = '2.0.0'
      },
      'schemaVersion'
    ],
    [
      (d) => {
        d.business.name = 'Example Studio'
      },
      'business.name'
    ],
    [
      (d) => {
        delete d.business.name.evidenceRefs
      },
      'business.name.evidenceRefs'
    ],
    [
      (d) => {
        d.offerings[0].value.kind = 'restaurant'
      },
      'offerings[0].value.kind'
    ],
    [
      (d) => {
        d.offerings[0].value.variants[0].price.kind = 'cheap'
      },
      'offerings[0].value.variants[0].price.kind'
    ],
    [
      (d) => {
        d.offerings[0].value.variants[0].duration.amount = -1
      },
      'offerings[0].value.variants[0].duration.amount'
    ],
    [
      (d) => {
        d.coverage[0].status = 'missing'
      },
      'coverage[0].status'
    ],
    [
      (d) => {
        d.evidence[0].locator.kind = 'guess'
      },
      'evidence[0].locator.kind'
    ],
    [
      (d) => {
        d.extensions.cuisine = fact('cuisine', ['Italian'])
      },
      'extensions.cuisine'
    ],
    [
      (d) => {
        d.sitemap = []
      },
      'sitemap'
    ],
    [
      (d) => {
        d.business.constructor = 'unexpected'
      },
      'business.constructor'
    ]
  ]
  for (const [change, path] of changes) {
    const doc = document()
    change(doc)
    const result = validatePlaceProfile(doc)
    assert.equal(result.ok, false, path)
    assert.ok(
      result.errors.some((e) => e.path === path),
      JSON.stringify(result.errors)
    )
  }
  for (const value of [null, [], 'profile', 1]) assert.equal(validatePlaceProfile(value).ok, false)
})

test('references resolve and fact ids are unique across all content blocks', () => {
  const doc = document()
  doc.business.name.evidenceRefs.push('missing-evidence')
  doc.evidence[0].sourceId = 'missing-source'
  doc.media[0].value.relations[0].entityId = 'missing-entity'
  doc.quotes.push(fact('name', { kind: 'review', text: 'Good', restrictions: ['not-on-demo'] }))
  doc.coverage[0].sourceRefs.push('missing-source')
  const result = validatePlaceProfile(doc)
  assert.equal(result.ok, false)
  for (const code of ['EVIDENCE_NOT_FOUND', 'SOURCE_NOT_FOUND', 'ENTITY_NOT_FOUND', 'DUPLICATE_ID'])
    assert.ok(
      result.errors.some((e) => e.code === code),
      code
    )
})

test('namespaced extensions carry facts and relation evidence is checked too', () => {
  const doc = document()
  doc.extensions['research:cuisine'] = fact('cuisine', ['Italian'])
  assert.equal(validatePlaceProfile(doc).ok, true)
  doc.media[0].value.relations[0].evidenceRefs = ['missing']
  assert.deepEqual(validatePlaceProfile(doc).errors, [
    { path: 'media[0].value.relations[0].evidenceRefs[0]', code: 'EVIDENCE_NOT_FOUND' }
  ])
})

test('every address in a profile is http(s); tel: and mailto: only on a contact link', () => {
  const cases = [
    [(d) => d.links.push(fact('l', { kind: 'website', url: 'javascript:alert(1)' })), 'links[0].value.url'],
    [(d) => d.links.push(fact('l', { kind: 'website', url: 'tel:+15550100' })), 'links[0].value.url'],
    [(d) => (d.media[0].value.url = 'data:text/html,hi'), 'media[0].value.url'],
    [(d) => (d.sources[0].ref = 'javascript:alert(1)'), 'sources[0].ref'],
    [(d) => (d.evidence[0].locator = { kind: 'url', value: 'vbscript:msgbox' }), 'evidence[0].locator.value'],
    [
      (d) =>
        d.quotes.push(
          fact('q', {
            kind: 'post',
            text: 'Hi',
            attribution: { url: 'javascript:alert(1)' },
            restrictions: []
          })
        ),
      'quotes[0].value.attribution.url'
    ],
    [
      (d) => (d.extensions['research:menu'] = fact('x', { url: 'file:///etc/passwd' })),
      'extensions.research:menu.value.url'
    ]
  ]
  for (const [change, path] of cases) {
    const doc = document()
    change(doc)
    const result = validatePlaceProfile(doc)
    assert.ok(
      result.errors.some((e) => e.path === path && e.code === 'URL_SCHEME'),
      `${path}: ${JSON.stringify(result.errors)}`
    )
  }
  const doc = document()
  doc.links.push(fact('call', { kind: 'phone', url: 'tel:+15550100' }))
  doc.links.push(fact('mail', { kind: 'email', url: 'mailto:hello@example.test' }))
  doc.links.push(fact('site', { kind: 'website', url: 'http://example.test/' }))
  doc.sources.push(
    { id: 's2', kind: 'google-places', ref: 'ChIJ123' },
    { id: 's3', kind: 'research', ref: 'stored:profile' }
  )
  assert.deepEqual(validatePlaceProfile(doc), { ok: true, errors: [] })
})

test('a fact without evidence is refused, and strings have a ceiling', () => {
  const cases = [
    [(d) => (d.business.name.evidenceRefs = []), 'business.name.evidenceRefs', 'MIN_ITEMS'],
    [
      (d) => (d.media[0].value.relations[0].evidenceRefs = []),
      'media[0].value.relations[0].evidenceRefs',
      'MIN_ITEMS'
    ],
    [
      (d) => (d.extensions['research:x'] = { id: 'x', value: 1, evidenceRefs: [] }),
      'extensions.research:x.evidenceRefs',
      'MIN_ITEMS'
    ],
    [(d) => (d.business.name.value = 'n'.repeat(201)), 'business.name.value', 'MAX_LENGTH'],
    [(d) => (d.offerings[0].value.name = 'n'.repeat(201)), 'offerings[0].value.name', 'MAX_LENGTH'],
    [
      (d) => d.quotes.push(fact('q', { kind: 'story', text: 't'.repeat(2001), restrictions: [] })),
      'quotes[0].value.text',
      'MAX_LENGTH'
    ],
    [
      (d) => (d.links = [fact('l', { kind: 'website', url: `https://example.test/${'a'.repeat(2048)}` })]),
      'links[0].value.url',
      'MAX_LENGTH'
    ]
  ]
  for (const [change, path, code] of cases) {
    const doc = document()
    change(doc)
    const result = validatePlaceProfile(doc)
    assert.ok(
      result.errors.some((e) => e.path === path && e.code === code),
      `${path}: ${JSON.stringify(result.errors)}`
    )
  }
})
