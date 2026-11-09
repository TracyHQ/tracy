/**
 * The EmDash content map and its coverage binding. The map is generated from a theme's seed, field map and content API
 * map (never captured); the audit binds what a page shows to a slot through the provenance stamps the template prints.
 * The two real themes (JA Diner 0.1.0, JA Restaurant 1.0.2) are read from the tree; the binder is run on invented items.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkContentMapFit } from '../../../wo/website-opportunities/domain/content-map-fit.mjs'
import { checkContentMapRoles } from '../../../wo/website-opportunities/domain/content-map-roles.mjs'
import {
  buildEmdashCoverageFile,
  crawlKeyOf,
  fitFindingsOf,
  mediaIndexOf,
  mergeViewports
} from '../content-coverage/lib/emdash-audit.mjs'
import { bindItems, indexOfMap, normLink } from '../content-coverage/lib/emdash-bind.mjs'
import {
  emdashContentMapOf,
  emdashContentMapOfTheme,
  serializeMap,
  withoutMeasured
} from '../content-coverage/lib/emdash-content-map.mjs'
import { labelRulesOf } from '../content-coverage/lib/label-rules.mjs'
import { measureSlotFit } from '../content-coverage/lib/slot-fit.mjs'

// A ULID-shaped storage key stem, as EmDash media uploads produce.
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const CMS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const THEMES = [
  ['tracy-emdash-theme-diner', 'tracy-diner', '0.1.0'],
  ['tracy-emdash-theme-restaurant', 'tracy-restaurant', '1.0.2']
]
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

for (const [folder, template, version] of THEMES) {
  const themeDir = path.join(CMS, folder)

  test(`${template} ${version}: the committed content map is what the theme's files generate`, () => {
    const built = emdashContentMapOfTheme(themeDir)
    assert.equal(built.version, version)
    assert.equal(built.template, template)
    const committed = readJson(path.join(themeDir, 'contracts', version, 'content-map.json'))
    assert.equal(serializeMap(withoutMeasured(committed)), serializeMap(withoutMeasured(built.map)))
  })

  test(`${template}: the map names pages, entries, slots with targets, samples and roles`, () => {
    const { map } = emdashContentMapOfTheme(themeDir)
    assert.equal(map.schemaVersion, 'tracy-quickstart-content-map/emdash/v1')
    assert.ok(
      map.pages.some((p) => p.route === '/'),
      'the home page'
    )
    assert.ok(map.pages.length >= 20)
    assert.ok(map.menus.length > 0 && map.menus[0].items.length > 0)
    const keys = new Set()
    for (const slot of map.slots) {
      assert.ok(!keys.has(slot.key), `${slot.key} once`)
      keys.add(slot.key)
      assert.ok(['text', 'image', 'url', 'richtext', 'date', 'term'].includes(slot.type), slot.key)
      assert.ok(slot.target && typeof slot.sample === 'string' && slot.entity, slot.key)
    }
    const title = map.slots.find((s) => s.key === 'settings.title')
    assert.equal(title.role, 'business.name')
    assert.ok(
      map.slots.some((s) => /\[\d+\]\./.test(s.key) && s.target.sub !== undefined),
      'a repeater cell'
    )
  })

  test(`${template}: every text and image slot has a role and the card structure is whole`, () => {
    const { map } = emdashContentMapOfTheme(themeDir)
    assert.deepEqual(checkContentMapRoles(map), { declared: true, ok: true, errors: [] })
  })

  test(`${template}: the committed map carries a complete Slot fit and the coverage file names exactly that map`, () => {
    const dir = path.join(themeDir, 'contracts', version)
    const committed = readJson(path.join(dir, 'content-map.json'))
    const fit = checkContentMapFit(committed)
    assert.deepEqual([fit.declared, fit.ok, fit.missingKeys.length], [true, true, 0])
    const coverage = readJson(path.join(dir, 'content-coverage.json'))
    assert.equal(coverage.platform, 'emdash')
    assert.equal(coverage.contract.id, `${template}/emdash-0.x/${version}`)
    assert.equal(coverage.contract.presentationLockSha256, null)
  })

  test(`${template}: the label rules run on the generated map (vocabulary 2: reported, not enforced)`, () => {
    const { map } = emdashContentMapOfTheme(themeDir)
    const rules = labelRulesOf({ map })
    assert.equal(rules.applies, false)
    assert.deepEqual(Object.keys(rules.rules), ['R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9'])
  })
}

// --- the generator on an invented theme ------------------------------------------------------------------------------

const SEED = {
  defaultLocale: 'en',
  settings: { title: 'Cafe', tagline: 'Coffee' },
  collections: [
    {
      slug: 'cards',
      fields: [
        { slug: 'title', type: 'string' },
        { slug: 'photo', type: 'image' },
        { slug: 'cta_link', type: 'string' },
        { slug: 'layout_view', type: 'string' },
        { slug: 'badge_class', type: 'string' },
        {
          slug: 'items',
          type: 'repeater',
          validation: {
            subFields: [
              { slug: 'name', type: 'string' },
              { slug: 'price', type: 'string' }
            ]
          }
        }
      ]
    }
  ],
  content: {
    cards: [
      {
        slug: 'hot',
        locale: 'en',
        data: {
          title: 'Hot drinks',
          photo: 'a.jpg',
          cta_link: '/menu',
          layout_view: 'wide',
          path: '/menu',
          badge_class: 'Hot',
          items: [{ name: 'Flat white', price: '$4' }]
        }
      }
    ]
  },
  taxonomies: [{ name: 'tag', labelSingular: 'Tag', terms: [{ slug: 'warm', label: 'Warm' }] }],
  menus: [{ name: 'primary', label: 'Primary', items: [{ label: 'Menu', url: '/menu' }] }]
}
const FIELD_MAP = {
  roleVocabularyVersion: 'place-content-roles/2',
  settings: {
    title: { role: 'business.name', group: { kind: 'business', name: 'identity' } },
    tagline: { role: 'business.tagline', group: { kind: 'business', name: 'identity' } }
  },
  fields: {
    'cards.title': { source: 'text', target: 'string', label: 'Title', role: 'editorial.heading' },
    'cards.badge_class': { source: 'text', target: 'string', label: 'Badge', role: 'editorial.heading' },
    'cards.photo': { source: 'image', target: 'image', label: 'Photo', role: 'editorial.decorative_image' },
    'cards.items': {
      source: 'group',
      target: 'repeater',
      label: 'Items',
      group: { kind: 'menu_item' },
      subRoles: { name: 'offering.name', price: 'offering.price' }
    }
  }
}
const mapOf = () =>
  emdashContentMapOf({ seed: SEED, fieldMap: FIELD_MAP, template: 'tracy-cafe', version: '1.0.0' })

test('the generator: copy fields, repeater cells, links, terms and settings become slots; a layout setting does not, unless the field map gives it a role (a class-named field printed as a badge)', () => {
  const map = mapOf()
  const byKey = new Map(map.slots.map((s) => [s.key, s]))
  assert.deepEqual(
    [...byKey.keys()].sort(),
    [
      'cards.hot.badge_class',
      'cards.hot.cta_link',
      'cards.hot.items[0].name',
      'cards.hot.items[0].price',
      'cards.hot.photo',
      'cards.hot.title',
      'settings.tagline',
      'settings.title',
      'taxonomy.tag.warm'
    ].sort()
  )
  assert.deepEqual(byKey.get('cards.hot.items[0].name').target, {
    collection: 'cards',
    entry: 'hot',
    field: 'items',
    item: 0,
    sub: 'name'
  })
  assert.equal(byKey.get('cards.hot.items[0].price').role, 'offering.price')
  assert.equal(byKey.get('cards.hot.items[0].price').group.id, 'cards.hot.items.0')
  assert.equal(byKey.get('cards.hot.cta_link').type, 'url')
  assert.equal('role' in byKey.get('cards.hot.cta_link'), false)
  assert.equal(map.menus[0].items[0].label, 'Menu')
  assert.deepEqual(checkContentMapRoles(map), { declared: true, ok: true, errors: [] })
})

test('the currency check ignores what the audit measured into the map and nothing else', () => {
  const map = mapOf()
  const measured = measureSlotFit({ map, findings: { pages: [] } }).map
  assert.ok(measured.slots.some((s) => s.fit))
  assert.equal(serializeMap(withoutMeasured(measured)), serializeMap(withoutMeasured(map)))
  const edited = structuredClone(map)
  edited.slots.find((s) => s.key === 'cards.hot.title').role = 'editorial.paragraph'
  assert.notEqual(serializeMap(withoutMeasured(edited)), serializeMap(withoutMeasured(map)))
})

// --- the binder ------------------------------------------------------------------------------------------------------

const stamp = (slug, field = null, collection = 'cards') => ({
  collection,
  id: 'X',
  slug,
  field,
  block: false,
  exact: true
})
const item = (value, over = {}) => ({
  kind: 'text',
  value,
  tag: 'p',
  zone: 'main',
  selector: 'p',
  stamp: null,
  ...over
})
const SOURCE = { haystack: 'read more # articles', formsLabels: new Set(['name']), publicDir: null }
const bind = (items, media = null) =>
  bindItems(items, indexOfMap(mapOf()), { source: SOURCE, origin: 'http://site.test', media })
const slotsOf = (it) => [it.status, it.matchBy, ...(it.slots ?? [])]

test('binder: a stamp names the field, and the field must hold the words shown', () => {
  const [a, other] = bind([
    item('Hot drinks', { stamp: stamp('hot', 'title') }),
    item('Words that field does not hold', { stamp: stamp('hot', 'title') })
  ])
  assert.deepEqual(slotsOf(a), ['matched', 'stamp', 'cards.hot.title'])
  assert.equal(other.status, 'hole')
})

test('binder: a repeater cell is told apart by its words, an entry-only stamp by the slot that holds them', () => {
  const [cell, entry] = bind([
    item('Flat white', { stamp: stamp('hot', 'items.name') }),
    item('$4', { stamp: stamp('hot') })
  ])
  assert.deepEqual(slotsOf(cell), ['matched', 'stamp', 'cards.hot.items[0].name'])
  assert.deepEqual(slotsOf(entry), ['matched', 'entry', 'cards.hot.items[0].price'])
})

test('binder: two slots printed in one block are bound together; a slider clone follows its stamped twin', () => {
  const [both, twin, clone] = bind([
    item('Flat white $4', { stamp: stamp('hot') }),
    item('Hot drinks', { stamp: stamp('hot', 'title') }),
    item('Hot drinks')
  ])
  assert.deepEqual(slotsOf(both), [
    'matched',
    'composite',
    'cards.hot.items[0].name',
    'cards.hot.items[0].price'
  ])
  assert.equal(twin.status, 'matched')
  assert.deepEqual(slotsOf(clone), ['matched', 'clone', 'cards.hot.title'])
})

test('binder: menu labels, terms and exact words of an unstamped card are bound, and said how', () => {
  const [menu, term, words] = bind([item('Menu', { zone: 'nav' }), item('Warm'), item('Flat white')])
  assert.deepEqual([menu.status, menu.matchBy], ['matched', 'menu'])
  assert.deepEqual(slotsOf(term), ['matched', 'words', 'taxonomy.tag.warm'])
  assert.deepEqual(slotsOf(words), ['matched', 'words', 'cards.hot.items[0].name'])
})

test('binder: what nothing accounts for is a hole of the right class', () => {
  const [unknown, template, form, figures, picture, design] = bind([
    item('A promise nobody declared'),
    item('read more'),
    item('Name *', { inForm: true }),
    item('4 articles'),
    {
      kind: 'image',
      value: 'http://site.test/_emdash/api/media/file/ZZZ',
      tag: 'img',
      zone: 'main',
      stamp: null,
      selector: 'img'
    },
    {
      kind: 'image',
      value: 'http://site.test/brand/logo.png',
      tag: 'img',
      zone: 'header',
      stamp: null,
      selector: 'img'
    }
  ])
  assert.deepEqual([unknown.status, unknown.class], ['hole', 'unknown'])
  assert.deepEqual([template.status, template.class], ['hole', 'template'])
  assert.deepEqual([form.status, form.class], ['hole', 'core'])
  assert.deepEqual([figures.class, figures.pattern], ['template', '# articles'])
  assert.deepEqual([picture.status, picture.class], ['hole', 'unknown'])
  assert.deepEqual([design.status, design.class], ['ignored', 'core'])
})

const picture = (name, over = {}) => ({
  kind: 'image',
  value: `http://site.test/_emdash/api/media/file/${name}`,
  tag: 'img',
  zone: 'main',
  selector: 'img',
  stamp: null,
  ...over
})

test("binder: a picture is bound by the site's own record of which field holds the file", () => {
  const [bound, missing] = bind(
    [picture('ZZZ.jpg'), picture('YYY.jpg')],
    new Map([
      ['ZZZ.jpg', ['cards.hot.photo']],
      ['YYY.jpg', ['cards.hot.unmapped']]
    ])
  )
  assert.deepEqual(slotsOf(bound), ['matched', 'media', 'cards.hot.photo'])
  assert.match(missing.cause, /cards\.hot\.unmapped, which the content map has no slot for/)
})

test("binder: a picture outside the media file route never matches a media record by its file name (the reviewer's case)", () => {
  const index = new Map([['ZZZ.jpg', ['cards.hot.photo']]])
  const [outside, nested] = bind(
    [
      picture('ZZZ.jpg', { value: 'http://site.test/static/ZZZ.jpg' }),
      picture('ZZZ.jpg', { value: 'http://site.test/_emdash/api/media/file/x/ZZZ.jpg' })
    ],
    index
  )
  assert.deepEqual([outside.status, outside.class], ['hole', 'unknown'])
  assert.deepEqual([nested.status, nested.class], ['hole', 'unknown'])
  const [own] = bind([picture('ZZZ.jpg')], index)
  assert.deepEqual(slotsOf(own), ['matched', 'media', 'cards.hot.photo'])
})

test("binder: an entry stamp never binds a picture by itself; the file must be that entry's (or another slot's) own", () => {
  const stamped = { stamp: stamp('hot') }
  // an undocumented file under a stamped entry: no media record, so a hole, not "matched to the entry's photo"
  const [undocumented] = bind([picture('static.jpg', stamped)], new Map([['OTHER', ['cards.hot.photo']]]))
  assert.deepEqual([undocumented.status, undocumented.class], ['hole', 'unknown'])
  // with no media index at all every picture is a hole that says why
  const [blind] = bind([picture('anything.jpg', stamped)])
  assert.equal(blind.status, 'hole')
  assert.match(blind.cause, /--token-file/)
  // the stamped entry's own file binds to that entry's slot even when another entry shows the same file
  const [own] = bind(
    [picture('ZZZ.jpg', stamped)],
    new Map([['ZZZ.jpg', ['cards.other.photo', 'cards.hot.photo']]])
  )
  assert.deepEqual(slotsOf(own), ['matched', 'media', 'cards.hot.photo'])
})

const link = (href, over = {}) => ({
  kind: 'link',
  value: href,
  text: 'x',
  tag: 'a',
  zone: 'main',
  selector: 'a',
  stamp: null,
  ...over
})

test("binder: a link stamped for a text label is not covered by the label (the reviewer's case)", () => {
  const [undeclared, declared] = bind([
    link('/undeclared-demo', { stamp: stamp('hot', 'title') }),
    link('/undeclared-demo', { stamp: stamp('hot', 'cta_link') })
  ])
  assert.equal(undeclared.status, 'hole')
  // nor does a url slot with ANOTHER address cover it
  assert.equal(declared.status, 'hole')
})

test("binder: the whole query is part of a link's route (only ?page=N falls back to the page)", () => {
  const [other, same, leaf] = bind([link('/menu?mode=demo'), link('/menu?b=2&a=1'), link('/menu?page=3')])
  assert.deepEqual([other.status, other.class], ['hole', 'unknown'])
  assert.equal(same.status, 'hole')
  assert.deepEqual([leaf.status, leaf.matchBy], ['matched', 'route'])
  assert.equal(normLink('/x?b=2&a=1', 'http://s.test'), '/x?a=1&b=2')
})

test('binder: a link is bound by its stamp, a link slot, a menu, a page or a term; otherwise it is a hole', () => {
  const [slot, stamped, menu, nowhere, mail, source, orphan, page] = bind([
    link('/menu'),
    link('/menu', { stamp: stamp('hot', 'cta_link') }),
    link('http://site.test/menu/', { zone: 'nav' }),
    link('#'),
    link('mailto:nobody@example.org'),
    link('/read-more'),
    link('https://elsewhere.example/x'),
    link('/page-of-the-map')
  ])
  assert.deepEqual(slotsOf(slot), ['matched', 'words', 'cards.hot.cta_link'])
  assert.deepEqual(slotsOf(stamped), ['matched', 'stamp', 'cards.hot.cta_link'])
  assert.equal(menu.status, 'matched')
  assert.equal(nowhere.status, 'ignored')
  assert.deepEqual([mail.status, mail.class], ['hole', 'unknown'])
  assert.deepEqual([source.status, source.class], ['hole', 'unknown'])
  assert.deepEqual([orphan.status, orphan.class, orphan.kind], ['hole', 'unknown', 'link'])
  assert.equal(page.status, 'hole')
  const [leaf] = bind([link('/menu?page=2')])
  assert.deepEqual([leaf.status, leaf.matchBy], ['matched', 'route'])
})

// --- the coverage file -----------------------------------------------------------------------------------------------

test('the coverage file: counts, holes with accepted reasons carried over, no presentation lock, the same schema as Joomla', () => {
  const map = mapOf()
  const items = mergeViewports({
    desktop: {
      items: [
        item('Hot drinks', { stamp: stamp('hot', 'title'), rect: { x: 0, y: 0, w: 300, h: 40 } }),
        item('Orphan text')
      ]
    },
    phone: {
      items: [item('Hot drinks', { stamp: stamp('hot', 'title'), rect: { x: 0, y: 0, w: 200, h: 60 } })]
    }
  })
  assert.equal(items.length, 2)
  assert.deepEqual(Object.keys(items[0].viewports), ['desktop', 'phone'])
  bindItems(items, indexOfMap(map), { source: SOURCE, origin: 'http://site.test' })
  const result = {
    pages: [
      { url: 'http://site.test/', status: 200, mapPages: [{ entity: 'cards.hot' }], items, hygiene: [] }
    ],
    failures: [],
    capReached: false,
    summary: { pages: 1, mappedPages: 1, unmappedPages: 0, bound: { stamp: 1 } }
  }
  const previous = {
    holes: [{ kind: 'text', value: 'Orphan text', accepted: 'Kept on purpose for the demo.' }]
  }
  const doc = buildEmdashCoverageFile({
    result,
    map,
    contractId: 'tracy-cafe/emdash-0.x/1.0.0',
    mapSha256: 'abc',
    previous
  })
  assert.equal(doc.schemaVersion, 'tracy-content-coverage/v1')
  assert.equal(doc.contract.presentationLockSha256, null)
  assert.deepEqual(
    doc.holes.map((h) => [h.value, h.class, h.accepted]),
    [['Orphan text', 'unknown', 'Kept on purpose for the demo.']]
  )
  assert.equal(doc.counts.text.matched, 1)
  assert.equal(doc.coverage.text, 50)
})

test("Slot fit reads a stamped text only when it shows the slot's words whole", () => {
  const map = mapOf()
  const whole = {
    kind: 'text',
    value: 'Hot drinks',
    status: 'matched',
    matchBy: 'stamp',
    slots: ['cards.hot.title']
  }
  const part = { kind: 'text', value: 'Hot', status: 'matched', matchBy: 'stamp', slots: ['cards.hot.title'] }
  const found = fitFindingsOf({ pages: [{ items: [whole, part] }] }, map).pages[0].items
  assert.deepEqual(
    found.map((i) => i.matchBy),
    ['exact', 'stamp']
  )
})

test("the crawl queues a link with its whole query, so demo content served only by that URL is audited (the reviewer's case)", () => {
  const o = 'http://site.test'
  assert.equal(crawlKeyOf('/preview?mode=demo', `${o}/`, o), '/preview?mode=demo')
  assert.notEqual(crawlKeyOf('/preview?mode=demo', `${o}/`, o), crawlKeyOf('/preview', `${o}/`, o))
  assert.equal(crawlKeyOf('/x?b=2&a=1', `${o}/`, o), crawlKeyOf('/x?a=1&b=2', `${o}/`, o))
  assert.equal(crawlKeyOf('/blog?page=2', `${o}/`, o), '/blog?page=2')
  assert.equal(crawlKeyOf('https://elsewhere.test/x', `${o}/`, o), null)
  assert.equal(crawlKeyOf('/photo.jpg?x=1', `${o}/`, o), null)
})

test('binder: a sample the template fills in ("{year} {name}") is a pattern: filled words are covered, other words still are not', () => {
  const map = structuredClone(mapOf())
  map.slots.push({
    key: 'cards.hot.footer',
    entity: 'cards.hot',
    target: {},
    type: 'text',
    sample: 'Copyright {year} {name}',
    label: 'x'
  })
  const run = (value) =>
    bindItems([item(value, { stamp: stamp('hot', 'footer') })], indexOfMap(map), {
      source: SOURCE,
      origin: 'http://site.test'
    })[0]
  assert.equal(run('Copyright 2026 Cafe').status, 'matched')
  assert.equal(run('Credits 2026 Somebody Else').status, 'hole')
})

test("the generator: the caption of a picture inside Portable Text is part of that field's words", () => {
  const seed = structuredClone(SEED)
  seed.collections[0].fields.push({ slug: 'body', type: 'portableText' })
  seed.content.cards[0].data.body = [
    { _type: 'block', _key: 'b1', children: [{ _type: 'span', text: 'Intro words.' }] },
    { _type: 'image', _key: 'i1', alt: '', caption: 'Caption under the picture' }
  ]
  const map = emdashContentMapOf({ seed, fieldMap: FIELD_MAP, template: 'tracy-cafe', version: '1.0.0' })
  const body = map.slots.find((s) => s.key === 'cards.hot.body')
  assert.match(body.sample, /Caption under the picture/)
  const [caption] = bindItems(
    [item('Caption under the picture', { stamp: stamp('hot', 'body'), tag: 'figcaption' })],
    indexOfMap(map),
    { source: SOURCE, origin: 'http://site.test' }
  )
  assert.equal(caption.status, 'matched')
})

test('routes: the query is kept as written, encoding included; only the keys are sorted', () => {
  const o = 'http://site.test'
  assert.equal(normLink('/preview?token=x%23y', o), '/preview?token=x%23y')
  assert.equal(crawlKeyOf('/preview?token=x%23y', `${o}/`, o), '/preview?token=x%23y')
  assert.notEqual(crawlKeyOf('/preview?token=x%23y', `${o}/`, o), crawlKeyOf('/preview?token=x', `${o}/`, o))
  assert.equal(normLink('/p?q=a%26b', o), '/p?q=a%26b')
  assert.equal(normLink('/p?q=a%3Db', o), '/p?q=a%3Db')
  assert.equal(normLink('/p?b=2&a=1', o), '/p?a=1&b=2')
  // a link to the encoded route is not covered by a slot that holds the decoded one
  const [encoded] = bind([link('/menu?t=x%23y')])
  assert.equal(encoded.status, 'hole')
})

test('pictures: a record matches only a file of the audited origin, under the media door, by its whole name', () => {
  const media = new Map([
    ['hero.key.png', ['cards.hot.photo']],
    [ULID_STEM, ['cards.hot.photo']]
  ])
  const at = (url) => bind([picture('x', { value: url })], media)[0]
  assert.equal(at('http://site.test/_emdash/api/media/file/hero.key.png').status, 'matched')
  assert.equal(at(`http://site.test/_emdash/api/media/file/${ULID_STEM}`).status, 'matched')
  assert.equal(at('http://site.test/_emdash/api/media/file/hero.different.png').status, 'hole')
  assert.equal(at('http://site.test/_emdash/api/media/file/hero').status, 'hole')
  assert.equal(at('http://foreign.test/hero.key.png').status, 'hole')
  assert.equal(at('http://foreign.test/_emdash/api/media/file/hero.key.png').status, 'hole')
})

test("pictures: a file of the template's public folder is design only on this origin and only inside that folder", () => {
  const source = { haystack: '', publicDir: path.join(CMS, 'tracy-emdash-theme-diner/public') }
  const run = (value) =>
    bindItems([picture('x', { value })], indexOfMap(mapOf()), {
      source,
      origin: 'http://site.test',
      media: new Map()
    })[0]
  assert.equal(run('http://site.test/brand/bg-icon.png').status, 'locked')
  assert.equal(run('http://foreign.test/brand/bg-icon.png').status, 'hole')
  assert.equal(run('http://site.test/%2e%2e/package.json').status, 'hole')
})

test('years: a literal year in a sample matches as written; only a copyright field or a {year} pattern may differ', () => {
  const map = structuredClone(mapOf())
  map.slots.push(
    {
      key: 'cards.hot.founded',
      entity: 'cards.hot',
      target: { field: 'founded' },
      type: 'text',
      sample: 'Founded in 2020',
      label: 'x'
    },
    {
      key: 'cards.hot.copyright',
      entity: 'cards.hot',
      target: { field: 'copyright' },
      type: 'text',
      sample: 'Copyright 2021 Cafe',
      label: 'x'
    }
  )
  const run = (field, value) =>
    bindItems([item(value, { stamp: stamp('hot', field) })], indexOfMap(map), {
      source: SOURCE,
      origin: 'http://site.test'
    })[0]
  assert.equal(run('founded', 'Founded in 2020').status, 'matched')
  assert.equal(run('founded', 'Founded in 2026').status, 'hole')
  assert.equal(run('copyright', 'Copyright 2026 Cafe').status, 'matched')
})

test('words: spacing may differ, signs and extra words may not', () => {
  const map = structuredClone(mapOf())
  map.slots.push(
    {
      key: 'cards.hot.price',
      entity: 'cards.hot',
      target: { field: 'price' },
      type: 'text',
      sample: '$30',
      label: 'x'
    },
    {
      key: 'cards.hot.note',
      entity: 'cards.hot',
      target: { field: 'note' },
      type: 'richtext',
      sample: 'First paragraph of the note.',
      label: 'x'
    }
  )
  const run = (field, value) =>
    bindItems([item(value, { stamp: stamp('hot', field) })], indexOfMap(map), {
      source: SOURCE,
      origin: 'http://site.test'
    })[0]
  assert.equal(run('price', '$ 30').status, 'matched')
  assert.equal(run('price', '30').status, 'hole')
  assert.equal(run('price', 'EUR 30').status, 'hole')
  assert.equal(run('note', 'First paragraph').status, 'matched')
  assert.equal(run('note', 'First paragraph of the note. And undeclared words after it').status, 'hole')
})

test("forms: a label is the Forms plugin's only when the theme's forms file holds it", () => {
  const source = {
    haystack: 'send email',
    formsLabels: new Set(['name', 'email', 'send email']),
    publicDir: null
  }
  const run = (value) =>
    bindItems([item(value, { inForm: true })], indexOfMap(mapOf()), { source, origin: 'http://site.test' })[0]
  assert.deepEqual([run('Name *').status, run('Name *').class], ['hole', 'core'])
  assert.equal(run('A demo promise printed inside a form').class, 'unknown')
})

test('words: a closing mark the template adds ("Contact." for "Contact", "85%" for a count) is ignored; a word, sign or figure is not', () => {
  const map = structuredClone(mapOf())
  map.slots.push(
    {
      key: 'cards.hot.label',
      entity: 'cards.hot',
      target: { field: 'label' },
      type: 'text',
      sample: 'Contact',
      label: 'x'
    },
    {
      key: 'cards.hot.count',
      entity: 'cards.hot',
      target: { field: 'count' },
      type: 'text',
      sample: '85',
      label: 'x'
    },
    {
      key: 'cards.hot.fee',
      entity: 'cards.hot',
      target: { field: 'fee' },
      type: 'text',
      sample: 'Fee 30',
      label: 'x'
    }
  )
  const run = (field, value) =>
    bindItems([item(value, { stamp: stamp('hot', field) })], indexOfMap(map), {
      source: SOURCE,
      origin: 'http://site.test'
    })[0]
  assert.equal(run('label', 'Contact.').status, 'matched')
  assert.equal(run('label', 'Contact us.').status, 'hole')
  assert.equal(run('count', '85%').status, 'matched')
  assert.equal(run('count', '86%').status, 'hole')
  assert.equal(run('fee', 'Fee 30%').status, 'hole')
})

/** mediaIndexOf with the REST read answered from `collections` (collection -> items). */
async function indexWith(collections) {
  const real = globalThis.fetch
  globalThis.fetch = async (url) => {
    const name = new URL(url).pathname.split('/').pop()
    return { ok: true, json: async () => ({ data: { items: collections[name] ?? [] } }) }
  }
  try {
    return await mediaIndexOf({
      siteUrl: 'http://site.test',
      token: 't',
      map: { entities: Object.keys(collections).map((c) => ({ identity: { collection: c } })) }
    })
  } finally {
    globalThis.fetch = real
  }
}

const asMedia = (file) =>
  bind([picture('x', { value: `http://site.test/_emdash/api/media/file/${file}` })], mediaOf)[0]
let mediaOf = new Map()

test('media index: a file is its storage key (the media route serves `storage.download(key)` as stored), never a part of it', async () => {
  mediaOf = await indexWith({
    cards: [
      {
        slug: 'hot',
        data: {
          photo: {
            id: 'different-id',
            filename: 'a.jpg',
            meta: { storageKey: `${ULID_STEM}.jpg` }
          }
        }
      }
    ]
  })
  assert.deepEqual([...mediaOf.keys()].sort(), [`${ULID_STEM}.jpg`])
  assert.equal(asMedia(`${ULID_STEM}.jpg`).status, 'matched')
  // the bare stem is another route: the storage has no such key, so it is no coverage
  assert.equal(asMedia(ULID_STEM).status, 'hole')
})

test('media index: a Portable Text picture keys the index only through a URL on the audited site under the media route', async () => {
  mediaOf = await indexWith({
    cards: [
      {
        slug: 'hot',
        data: {
          photo: [
            { _type: 'image', asset: { id: 'a1', url: 'https://foreign.test/foreign.png' } },
            { _type: 'image', asset: { id: 'a2', url: '/_emdash/api/media/file/own.png' } },
            {
              _type: 'image',
              asset: { id: 'a3', url: 'https://foreign.test/_emdash/api/media/file/alien.png' }
            }
          ]
        }
      }
    ]
  })
  assert.deepEqual([...mediaOf.keys()].sort(), ['own.png'])
  assert.equal(asMedia('foreign.png').status, 'hole')
  assert.equal(asMedia('alien.png').status, 'hole')
})

test('forms: a visible form text is the plugin\'s only when it equals a whole label of the forms file ("Name" is not "surname")', () => {
  const run = (labels, value) =>
    bindItems([item(value, { inForm: true })], indexOfMap(mapOf()), {
      source: { haystack: '', formsLabels: new Set(labels), publicDir: null },
      origin: 'http://site.test'
    })[0]
  const substring = run(['surname'], 'Name')
  assert.deepEqual([substring.status, substring.class], ['hole', 'unknown'])
  assert.equal(run(['name', 'surname'], 'Name *').class, 'core')
})

test('media index: a record id is never a file key (the route serves the storage key); both reproduced cases are holes', async () => {
  mediaOf = await indexWith({
    cards: [
      { slug: 'hot', data: { photo: { id: 'direct-id', meta: { storageKey: 'actual.jpg' } } } },
      {
        slug: 'cold',
        data: {
          body: [{ _type: 'image', asset: { id: 'asset-id', url: 'https://foreign.test/foreign.png' } }]
        }
      }
    ]
  })
  assert.deepEqual([...mediaOf.keys()], ['actual.jpg'])
  assert.equal(asMedia('actual.jpg').status, 'matched')
  assert.equal(asMedia('direct-id').status, 'hole')
  assert.equal(asMedia('asset-id').status, 'hole')
})
