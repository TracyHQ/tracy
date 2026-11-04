// compile-seed.test.mjs — the target layer of ADR 0016: a model becomes an EmDash seed.
//
// The four skill invariants that a compiler can break silently each get a case here. They are not
// style rules: each one has a failure that leaves the site rendering perfectly while the data is
// wrong, which is exactly the kind a human review passes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile, DEFAULT_FIELD_TYPES } from '../tools/compile-seed.mjs'
import { FIELD_TYPES, SITE_MODEL_SCHEMA } from '../contract/site-model.mjs'

function model(overrides = {}) {
  return {
    $schema: SITE_MODEL_SCHEMA,
    source: { kind: 'joomla', parity: 'measured' },
    locales: { default: 'en', all: ['en', 'ru'] },
    site: { title: { en: 'Acme' }, tagline: { en: 'We build' }, postsPerPage: 4 },
    types: [
      {
        name: 'projects',
        mode: 'list',
        label: { en: 'Projects' },
        fields: [
          { name: 'title', type: 'text' },
          { name: 'body', type: 'prose' },
          { name: 'cover', type: 'image' },
          { name: 'team', type: 'group', fields: [{ name: 'name', type: 'text' }] },
          { name: 'lead', type: 'reference', of: 'people' }
        ]
      },
      { name: 'people', mode: 'list', fields: [{ name: 'name', type: 'text' }] }
    ],
    taxonomies: [
      {
        name: 'sector',
        appliesTo: ['projects'],
        terms: [{ slug: 'energy', label: { en: 'Energy', ru: 'Энергетика' } }]
      }
    ],
    records: [
      {
        type: 'projects',
        slug: 'dam',
        locale: 'en',
        values: { title: 'Dam' },
        terms: { sector: ['energy'] }
      },
      { type: 'projects', slug: 'dam', locale: 'ru', values: { title: 'Плотина' } },
      { type: 'people', slug: 'ann', locale: 'en', values: { name: 'Ann' } }
    ],
    menus: [
      {
        name: 'main',
        label: { en: 'Main' },
        items: [
          {
            label: { en: 'Projects', ru: 'Проекты' },
            path: '/projects',
            localisedPath: { ru: '/ru/projects' }
          }
        ]
      }
    ],
    routes: [
      { path: '/projects', kind: 'list', type: 'projects' },
      { path: '/projects/dam', kind: 'detail', type: 'projects', slug: 'dam' }
    ],
    media: [{ file: 'dam.jpg', alt: { en: 'The dam' }, usedBy: ['projects/dam#cover'] }],
    ...overrides
  }
}

test('invariant #4: an entry id carries the slug, and the real database id is never invented', () => {
  const { seed } = compile(model())
  const entry = seed.content.projects[0]
  assert.equal(entry.id, 'projects:dam:en')
  assert.equal(entry.slug, 'dam')
  assert.ok(!('data' in entry) || entry.data.id === undefined, 'a seed must not carry a database id')
})

test('invariant #2: media never rides inside the seed — it is listed for the importer', () => {
  const { seed, mediaMap } = compile(model())
  const serialised = JSON.stringify(seed)
  assert.ok(
    !serialised.includes('$media'),
    'EmDash 0.37 does not fetch $media.url; the seed must not ask it to'
  )
  assert.deepEqual(
    mediaMap.files.map((f) => f.file),
    ['dam.jpg']
  )
  assert.deepEqual(mediaMap.files[0].usedBy, ['projects/dam#cover'])
})

test('invariant #3: everything the compiler writes is content, never a publication decision', () => {
  const { seed } = compile(model())
  for (const entries of Object.values(seed.content)) {
    for (const entry of entries) assert.ok(['published', 'draft'].includes(entry.status))
  }
  const drafted = compile(
    model({
      records: [{ type: 'people', slug: 'ann', locale: 'en', status: 'draft', values: { name: 'Ann' } }],
      media: [] // the fixture's one image belongs to a record this case drops
    })
  ).seed
  assert.equal(drafted.content.people[0].status, 'draft', 'a draft in the source stays a draft')
})

test('invariant #1: a type becomes fields, so the admin can edit every value', () => {
  const { seed } = compile(model())
  const projects = seed.collections.find((c) => c.slug === 'projects')
  assert.deepEqual(
    projects.fields.map((f) => f.slug),
    ['title', 'body', 'cover', 'team', 'lead']
  )
  assert.deepEqual(
    projects.fields.map((f) => f.type),
    ['string', 'text', 'image', 'repeater', 'reference']
  )
  // …and the two attributes EmDash keeps in unexpected places are written where it looks for them:
  assert.deepEqual(projects.fields[3].validation.subFields, [{ slug: 'name', label: 'Name', type: 'string' }])
  // EmDash ≥0.41: naming the target binds the field to a relation (an entry picker).
  assert.deepEqual(projects.fields[4].validation, { targetCollection: 'people' })
})

test('a non-default locale is linked as a translation, not duplicated', () => {
  const { seed } = compile(model())
  const [en, ru] = seed.content.projects
  assert.equal(en.translationOf, undefined)
  assert.equal(ru.translationOf, 'projects:dam:en')
  assert.equal(seed.menus.find((m) => m.locale === 'ru').translationOf, 'menu:main:en')
  assert.equal(seed.taxonomies.find((t) => t.locale === 'ru').translationOf, 'tax:sector:en')
})

test('a menu item can take a different URL per locale', () => {
  const { seed } = compile(model())
  assert.equal(seed.menus.find((m) => m.locale === 'en').items[0].url, '/projects')
  assert.equal(seed.menus.find((m) => m.locale === 'ru').items[0].url, '/ru/projects')
})

test('routable is read from the routes, so the two cannot drift', () => {
  const { seed } = compile(model())
  assert.equal(seed.collections.find((c) => c.slug === 'projects').routable, true)
  assert.equal(seed.collections.find((c) => c.slug === 'people').routable, false)
})

test('every source field kind has a target type — the gap is caught here, not in a built site', () => {
  // The real failure this guards: someone adds a kind to the contract for a new source, the
  // compiler has no mapping for it, and the first template to use it gets `string` — which
  // renders fine and loses the value on the first edit in the admin. The mapping must be total.
  const unmapped = FIELD_TYPES.filter((kind) => DEFAULT_FIELD_TYPES[kind] === undefined)
  assert.deepEqual(unmapped, [], `source kinds with no EmDash type: ${unmapped.join(', ')}`)
})

test('a group label with no destination survives as a label, and EmDash gets a url it accepts', () => {
  const { seed } = compile(
    model({
      menus: [
        {
          name: 'mega',
          items: [
            {
              label: { en: 'Resources' },
              path: '',
              kind: 'heading',
              children: [{ label: { en: 'Guides' }, path: '/projects' }]
            }
          ]
        }
      ]
    })
  )
  const item = seed.menus.find((m) => m.locale === 'en').items[0]
  assert.equal(item.label, 'Resources', 'the word the owner wrote must not be dropped')
  assert.equal(item.type, 'custom')
  assert.equal(item.url, '#', 'EmDash refuses a custom item with no url')
  assert.equal(item.children[0].url, '/projects', 'the children keep their real destinations')
})

test('a redirect is renamed to the pair EmDash reads, not the pair the contract writes', () => {
  const { seed } = compile(model({ redirects: [{ from: '/old', to: '/projects' }] }))
  assert.deepEqual(seed.redirects, [{ source: '/old', destination: '/projects' }])
})

test('an invalid model is refused before anything is written', () => {
  assert.throws(() => compile({ $schema: 'nope' }), /the model is invalid/)
})
