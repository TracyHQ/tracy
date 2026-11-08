// compile-seed.test.mjs — the target layer of ADR 0016: a model becomes an EmDash seed.
//
// The four skill invariants that a compiler can break silently each get a case here. They are not
// style rules: each one has a failure that leaves the site rendering perfectly while the data is
// wrong, which is exactly the kind a human review passes.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { compile, DEFAULT_FIELD_TYPES, isoUtc } from '../tools/compile-seed.mjs'
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

// found while porting JA Restaurant
test('the media map also carries what seed-apply reads: key, mime, alt and one target per locale of each use', () => {
  const { mediaMap } = compile(model())
  assert.deepEqual(mediaMap.items, [
    {
      key: 'dam.jpg',
      file: 'dam.jpg',
      mime: 'image/jpeg',
      alt: 'The dam',
      targets: [
        { collection: 'projects', slug: 'dam', locale: 'en', path: 'cover' },
        { collection: 'projects', slug: 'dam', locale: 'ru', path: 'cover' }
      ]
    }
  ])
  assert.equal(mediaMap.files.length, 1, 'the model-side view stays')
})

test('a datetime is written the way EmDash stores it, so a re-run finds no false conflict', () => {
  const base = model()
  base.types[0].fields.push({ name: 'published', type: 'date' })
  base.records[0].values.published = '2021-09-27 00:02:00'
  base.records[1].values.published = '2021-09-27T03:00:00+03:00'
  base.records[2] = { ...base.records[2], type: 'people', values: { name: 'Ann' } }
  const { seed } = compile(base)
  assert.equal(seed.content.projects[0].data.published, '2021-09-27T00:02:00.000Z')
  assert.equal(seed.content.projects[1].data.published, '2021-09-27T00:00:00.000Z')
  assert.equal(isoUtc('2021-09-27 00:02:00.789'), '2021-09-27T00:02:00.789Z')
  assert.equal(isoUtc('2021-09-27T00:02:00.5+02:00'), '2021-09-26T22:02:00.500Z')
  assert.equal(isoUtc('not a date'), 'not a date')
  assert.equal(isoUtc('2021-09-27'), '2021-09-27T00:00:00.000Z')
})

test('prose stored as text that holds HTML is said out loud; a configured collection without a label is too', () => {
  const html = model()
  html.records[0].values.body = '<p>Built in 1950.</p>'
  const { warnings } = compile(html, { collections: { people: { supports: ['revisions', 'search'] } } })
  assert.ok(warnings.some((w) => w.startsWith('projects.body:') && /Portable Text/.test(w)))
  assert.ok(warnings.some((w) => /collections\.people .*no label/.test(w)))
  assert.deepEqual(compile(model()).warnings, [])
})

test('CLI: positional arguments survive without --config, and --media-from copies the files and refuses a missing one', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'compile-seed-'))
  const tool = path.join(import.meta.dirname, '..', 'tools', 'compile-seed.mjs')
  try {
    writeFileSync(path.join(dir, 'model.json'), JSON.stringify(model()))
    mkdirSync(path.join(dir, 'files'))
    const run = (...args) => spawnSync(process.execPath, [tool, path.join(dir, 'model.json'), path.join(dir, 'seed'), ...args], { encoding: 'utf8' })
    assert.equal(run().status, 0)
    const missing = run('--media-from', path.join(dir, 'files'))
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /1 media file\(s\) not found/)
    writeFileSync(path.join(dir, 'files', 'dam.jpg'), 'x')
    assert.equal(run('--media-from', path.join(dir, 'files')).status, 0)
    assert.equal(readFileSync(path.join(dir, 'seed', 'media', 'dam.jpg'), 'utf8'), 'x')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI: a media file name that leaves the seed or source folder is refused, nothing is copied, and a nested name still is', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'compile-seed-'))
  const tool = path.join(import.meta.dirname, '..', 'tools', 'compile-seed.mjs')
  try {
    mkdirSync(path.join(dir, 'files', 'images'), { recursive: true })
    writeFileSync(path.join(dir, 'files', 'images', 'a.jpg'), 'img')
    writeFileSync(path.join(dir, 'victim.txt'), 'original')
    const run = (file, ...extra) => {
      const m = model({ media: [{ file, alt: { en: 'x' }, usedBy: [] }] })
      writeFileSync(path.join(dir, 'model.json'), JSON.stringify(m))
      return spawnSync(process.execPath, [tool, path.join(dir, 'model.json'), path.join(dir, 'out', 'seed'), ...extra], { encoding: 'utf8' })
    }
    const from = ['--media-from', path.join(dir, 'files')]
    for (const bad of ['../../victim.txt', '../victim.txt', path.join(dir, 'victim.txt'), '/etc/passwd', 'C:\\x.jpg', 'images\\..\\..\\a.jpg', 'images/../../../victim.txt']) {
      for (const args of [from, []]) {
        const r = run(bad, ...args)
        assert.notEqual(r.status, 0, bad)
        assert.ok(r.stderr.includes(JSON.stringify(bad).slice(1, -1)) || r.stderr.includes('media file'), `${bad}: ${r.stderr}`)
      }
      assert.equal(readFileSync(path.join(dir, 'victim.txt'), 'utf8'), 'original')
    }
    const ok = run('images/a.jpg', ...from)
    assert.equal(ok.status, 0, ok.stderr)
    assert.equal(readFileSync(path.join(dir, 'out', 'seed', 'media', 'images', 'a.jpg'), 'utf8'), 'img')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI: a symlinked folder under the source or the seed media folder cannot carry a media file out', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'compile-seed-'))
  const tool = path.join(import.meta.dirname, '..', 'tools', 'compile-seed.mjs')
  try {
    mkdirSync(path.join(dir, 'outside'))
    mkdirSync(path.join(dir, 'files'))
    writeFileSync(path.join(dir, 'outside', 'victim.txt'), 'original')
    writeFileSync(path.join(dir, 'files', 'ok.jpg'), 'new')
    const run = (file) => {
      writeFileSync(path.join(dir, 'model.json'), JSON.stringify(model({ media: [{ file, alt: { en: 'x' }, usedBy: [] }] })))
      return spawnSync(process.execPath, [tool, path.join(dir, 'model.json'), path.join(dir, 'seed'), '--media-from', path.join(dir, 'files')], { encoding: 'utf8' })
    }
    // target side: seed/media/nested -> outside; the source file exists so only the target can go wrong
    mkdirSync(path.join(dir, 'seed', 'media'), { recursive: true })
    symlinkSync(path.join(dir, 'outside'), path.join(dir, 'seed', 'media', 'nested'))
    mkdirSync(path.join(dir, 'files', 'nested'))
    writeFileSync(path.join(dir, 'files', 'nested', 'victim.txt'), 'attack')
    const t = run('nested/victim.txt')
    assert.notEqual(t.status, 0)
    assert.equal(readFileSync(path.join(dir, 'outside', 'victim.txt'), 'utf8'), 'original')
    // source side: files/link -> outside; nothing outside is read into the seed
    rmSync(path.join(dir, 'seed'), { recursive: true })
    symlinkSync(path.join(dir, 'outside'), path.join(dir, 'files', 'link'))
    const s = run('link/victim.txt')
    assert.notEqual(s.status, 0)
    assert.match(s.stderr, /symlink/)
    assert.equal(run('ok.jpg').status, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI: a seed/media folder that is itself a symlink to an outside folder is refused', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'compile-seed-'))
  const tool = path.join(import.meta.dirname, '..', 'tools', 'compile-seed.mjs')
  try {
    mkdirSync(path.join(dir, 'outside'))
    mkdirSync(path.join(dir, 'files'))
    mkdirSync(path.join(dir, 'seed'))
    writeFileSync(path.join(dir, 'outside', 'victim.txt'), 'original')
    writeFileSync(path.join(dir, 'files', 'victim.txt'), 'attack')
    symlinkSync(path.join(dir, 'outside'), path.join(dir, 'seed', 'media'))
    writeFileSync(path.join(dir, 'model.json'), JSON.stringify(model({ media: [{ file: 'victim.txt', alt: { en: 'x' }, usedBy: [] }] })))
    const r = spawnSync(process.execPath, [tool, path.join(dir, 'model.json'), path.join(dir, 'seed'), '--media-from', path.join(dir, 'files')], { encoding: 'utf8' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /symlink/)
    assert.equal(readFileSync(path.join(dir, 'outside', 'victim.txt'), 'utf8'), 'original')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
