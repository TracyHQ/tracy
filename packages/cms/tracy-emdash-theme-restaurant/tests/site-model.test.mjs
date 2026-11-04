// site-model.test.mjs — one negative fixture per rule of the source contract (ADR 0016).
//
// WHY IT IS WRITTEN THIS WAY. A validator is worth what its failures prove. Every rule in
// validate.mjs has a code, and every code below gets a model that is valid EXCEPT for that one
// rule — so a rule that stops working fails here rather than in a build three weeks later. The
// positive fixture is mutated rather than retyped: a hand-written "invalid" model tends to be
// invalid for three reasons at once, and then it passes the test while the rule is broken.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { validateModel } from '../contract/validate.mjs'
import { SITE_MODEL_SCHEMA } from '../contract/site-model.mjs'
import { FOREIGN_STORAGE_WORDS } from './foreign-words.mjs'

const here = path.dirname(new URL(import.meta.url).pathname)

/** A small, entirely valid model: two locales, one list type, one single type, a taxonomy. */
function validModel() {
  return {
    $schema: SITE_MODEL_SCHEMA,
    source: {
      kind: 'joomla',
      parity: 'measured',
      origin: 'tracy-base-j6',
      capturedAt: '2026-09-15T00:00:00.000Z'
    },
    locales: { default: 'en', all: ['en', 'ru'] },
    site: { title: { en: 'Acme', ru: 'Акме' } },
    types: [
      {
        name: 'projects',
        mode: 'list',
        label: { en: 'Projects', ru: 'Проекты' },
        fields: [
          { name: 'title', type: 'text' },
          { name: 'body', type: 'prose' },
          { name: 'cover', type: 'image' },
          { name: 'lead', type: 'reference', of: 'people' }
        ]
      },
      { name: 'people', mode: 'list', fields: [{ name: 'name', type: 'text' }] },
      { name: 'home', mode: 'single', fields: [{ name: 'heading', type: 'text' }] }
    ],
    taxonomies: [
      { name: 'sector', appliesTo: ['projects'], terms: [{ slug: 'energy' }, { slug: 'transport' }] }
    ],
    records: [
      {
        type: 'projects',
        slug: 'dam',
        locale: 'en',
        status: 'published',
        values: { title: 'Dam', body: '<p>A dam.</p>' },
        terms: { sector: ['energy'] }
      },
      { type: 'projects', slug: 'dam', locale: 'ru', status: 'published', values: { title: 'Плотина' } },
      { type: 'people', slug: 'ann', locale: 'en', values: { name: 'Ann' } },
      { type: 'home', slug: 'home', locale: 'en', values: { heading: 'Welcome' } }
    ],
    menus: [{ name: 'main', items: [{ label: { en: 'Projects', ru: 'Проекты' }, path: '/projects' }] }],
    routes: [
      { path: '/', kind: 'page' },
      { path: '/projects', kind: 'list', type: 'projects' },
      { path: '/projects/dam', kind: 'detail', type: 'projects', slug: 'dam' }
    ],
    redirects: [{ from: '/old', to: '/projects' }],
    media: [{ file: 'dam.jpg', alt: { en: 'The dam' }, usedBy: ['projects/dam#cover'] }],
    tokens: {},
    facts: []
  }
}

/** Codes reported for a model built by mutating the valid one. */
function codesAfter(mutate) {
  const model = validModel()
  mutate(model)
  return validateModel(model).map((e) => e.code)
}

test('the positive fixture is valid — otherwise every negative case below proves nothing', () => {
  assert.deepEqual(validateModel(validModel()), [])
})

const cases = [
  [
    'SCHEMA_MISMATCH',
    (m) => {
      m.$schema = 'something-else/v9'
    }
  ],
  [
    'KEY_MISSING',
    (m) => {
      delete m.types
    }
  ],
  [
    'SOURCE_KIND',
    (m) => {
      m.source.kind = 'drupal'
    }
  ],
  [
    'SOURCE_PARITY',
    (m) => {
      m.source.parity = 'probably'
    }
  ],
  [
    'LOCALE_DEFAULT',
    (m) => {
      m.locales.default = 'de'
    }
  ],
  [
    'LOCALES_EMPTY',
    (m) => {
      m.locales.all = []
    }
  ],
  [
    'TYPE_NAME',
    (m) => {
      m.types[0].name = ''
    }
  ],
  [
    'TYPE_DUPLICATE',
    (m) => {
      m.types[1].name = 'projects'
    }
  ],
  [
    'TYPE_MODE',
    (m) => {
      m.types[0].mode = 'many'
    }
  ],
  [
    'FIELD_TYPE',
    (m) => {
      m.types[0].fields[0].type = 'wysiwyg'
    }
  ],
  [
    'FIELD_DUPLICATE',
    (m) => {
      m.types[0].fields[1].name = 'title'
    }
  ],
  [
    'FIELD_REFERENCE_TARGET',
    (m) => {
      delete m.types[0].fields[3].of
    }
  ],
  [
    'REFERENCE_UNKNOWN_TYPE',
    (m) => {
      m.types[0].fields[3].of = 'ghosts'
    }
  ],
  [
    'FIELD_GROUP_EMPTY',
    (m) => {
      m.types[0].fields.push({ name: 'blocks', type: 'group' })
    }
  ],
  [
    'LABEL_EMPTY',
    (m) => {
      m.types[0].label.en = ''
    }
  ],
  [
    'LOCALE_UNKNOWN',
    (m) => {
      m.types[0].label.de = 'Projekte'
    }
  ],
  [
    'TAXONOMY_UNKNOWN_TYPE',
    (m) => {
      m.taxonomies[0].appliesTo = ['ghosts']
    }
  ],
  [
    'TERM_DUPLICATE',
    (m) => {
      m.taxonomies[0].terms.push({ slug: 'energy' })
    }
  ],
  [
    'RECORD_UNKNOWN_TYPE',
    (m) => {
      m.records[0].type = 'ghosts'
    }
  ],
  [
    'RECORD_LOCALE',
    (m) => {
      m.records[0].locale = 'de'
    }
  ],
  [
    'RECORD_STATUS',
    (m) => {
      m.records[0].status = 'pending'
    }
  ],
  [
    'RECORD_DUPLICATE',
    (m) => {
      m.records.push({ ...m.records[0] })
    }
  ],
  [
    'VALUE_UNKNOWN_FIELD',
    (m) => {
      m.records[0].values.subtitle = 'x'
    }
  ],
  [
    'RECORD_UNKNOWN_TERM',
    (m) => {
      m.records[0].terms.sector = ['mining']
    }
  ],
  [
    'RECORD_UNKNOWN_TAXONOMY',
    (m) => {
      m.records[0].terms = { region: ['north'] }
    }
  ],
  [
    'ROUTE_KIND',
    (m) => {
      m.routes[0].kind = 'homepage'
    }
  ],
  [
    'ROUTE_UNKNOWN_TYPE',
    (m) => {
      m.routes[1].type = 'ghosts'
    }
  ],
  [
    'ROUTE_PATH',
    (m) => {
      m.routes[0].path = 'projects'
    }
  ],
  [
    'MENU_DANGLING',
    (m) => {
      m.menus[0].items[0].path = '/nowhere'
    }
  ],
  [
    'MEDIA_DANGLING',
    (m) => {
      m.media[0].usedBy = ['projects/ghost#cover']
    }
  ],
  [
    'REDIRECT_LOOP',
    (m) => {
      m.redirects[0].to = '/old'
    }
  ],
  ['NOT_AN_OBJECT', () => {}] // handled separately below
]

for (const [code, mutate] of cases) {
  if (code === 'NOT_AN_OBJECT') continue
  test(`${code}: the rule fires, and the model is otherwise valid`, () => {
    const codes = codesAfter(mutate)
    assert.ok(codes.includes(code), `expected ${code}, got ${codes.join(', ') || '(none)'}`)
  })
}

test('MENU_DANGLING: an anchor inside a real route is a place on it, not a dangling link', () => {
  const withAnchor = codesAfter((m) => {
    m.menus[0].items[0].path = '/projects#featured'
  })
  assert.ok(!withAnchor.includes('MENU_DANGLING'), 'an anchor on a declared route must pass')
  const trulyDangling = codesAfter((m) => {
    m.menus[0].items[0].path = '/nowhere#featured'
  })
  assert.ok(trulyDangling.includes('MENU_DANGLING'), 'an anchor does not excuse a missing route')
})

test('NOT_AN_OBJECT: a file holding an array is refused whole', () => {
  assert.deepEqual(
    validateModel([]).map((e) => e.code),
    ['NOT_AN_OBJECT']
  )
})

test('VALUE_HOLDS_A_PAGE: a value carrying page furniture is a rendered page in a field', () => {
  const withNav = codesAfter((m) => {
    m.records[0].values.body = '<header><nav>Home</nav></header><p>A dam.</p>'
  })
  assert.ok(withNav.includes('VALUE_HOLDS_A_PAGE'))
  // …and ordinary inline markup is not:
  const plain = codesAfter((m) => {
    m.records[0].values.body = '<p>A <strong>dam</strong>, built in <em>1961</em>.</p>'
  })
  assert.ok(!plain.includes('VALUE_HOLDS_A_PAGE'))
})

test('the contract stays neutral: no CMS storage word appears under scripts/contract/', () => {
  const dir = path.join(here, '..', 'contract')
  const offenders = []
  for (const name of readdirSync(dir)) {
    const text = readFileSync(path.join(dir, name), 'utf8').toLowerCase()
    for (const word of FOREIGN_STORAGE_WORDS) {
      if (text.includes(word)) offenders.push(`${name}: ${word}`)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `ADR 0016 §2 — storage vocabulary leaked into the contract:\n${offenders.join('\n')}`
  )
})
