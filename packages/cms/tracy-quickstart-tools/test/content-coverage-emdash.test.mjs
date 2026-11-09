/**
 * The EmDash content map and its coverage binding. The map is generated from a theme's seed, field map and content API
 * map (never captured); the audit binds what a page shows to a slot through the provenance stamps the template prints.
 * The two real themes (JA Diner 0.1.0, JA Restaurant 1.0.1) are read from the tree; the binder is run on invented items.
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

const CMS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const THEMES = [
  ['tracy-emdash-theme-diner', 'tracy-diner', '0.1.0'],
  ['tracy-emdash-theme-restaurant', 'tracy-restaurant', '1.0.1']
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
const SOURCE = { haystack: 'read more # articles', publicDir: null }
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
      ['ZZZ', ['cards.hot.photo']],
      ['YYY', ['cards.hot.unmapped']]
    ])
  )
  assert.deepEqual(slotsOf(bound), ['matched', 'media', 'cards.hot.photo'])
  assert.match(missing.cause, /cards\.hot\.unmapped, which the content map has no slot for/)
})

test("binder: a picture outside the media file route never matches a media record by its file name (the reviewer's case)", () => {
  const index = new Map([['ZZZ', ['cards.hot.photo']]])
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
    new Map([['ZZZ', ['cards.other.photo', 'cards.hot.photo']]])
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
    sample: 'Copyright 2021 Cafe',
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
