// Template kit, EmDash: the contract folder of a theme has no manifest.json (the manifest is made from the content
// map), pages are addressed plainly, the adapter reads the site name, logos, favicon and menu from the settings and the
// theme files, and a page splits into the parts the theme prints (read from the stamps of a page fetched with
// `X-Tracy-Preview: pick`). All data made up.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { platformOf, readManifest } from '../template-kit/lib/contract-manifest.mjs'
import { setUrlStyle, urlOfPath } from '../template-kit/lib/kit-paths.mjs'
import { indexMap, ownerOfPath } from '../template-kit/lib/map-index.mjs'
import { adapterFor, templateFileOf, usePlatform } from '../template-kit/lib/site/adapters/index.mjs'
import {
  brandVariablesOf,
  emdashAdapter,
  logoPlacesOf,
  readEmdashSettings
} from '../template-kit/lib/site/adapters/emdash.mjs'
import { withEmdashPages } from '../template-kit/lib/site/adapters/emdash-map.mjs'
import { measureBrandColours } from '../template-kit/lib/site/colour-measure.mjs'
import { sidesOf } from '../template-kit/lib/site/colour-sides.mjs'
import { readEmdashSections } from '../template-kit/lib/site/read-emdash-sections.js'

const MAP = {
  schemaVersion: 'tracy-quickstart-content-map/emdash/v1',
  template: 'tracy-bistro',
  version: '2.0.3',
  entities: [
    { key: 'settings', kind: 'settings', identity: {} },
    { key: 'pages.home', kind: 'entry', identity: { collection: 'pages', slug: 'home' } },
    { key: 'pages.menu', kind: 'entry', identity: { collection: 'pages', slug: 'menu' } },
    { key: 'chrome.chrome', kind: 'entry', identity: { collection: 'chrome', slug: 'chrome' } }
  ],
  pages: [
    { entity: 'pages.home', route: '/', openAs: '/', title: 'Welcome', view: 'front-page' },
    { entity: 'pages.menu', route: '/menu', openAs: '/menu', title: 'Our menu', view: 'list' }
  ],
  menus: [
    {
      name: 'primary',
      items: [
        { label: 'Home', url: '/' },
        { label: 'Menu', url: '/menu' }
      ]
    }
  ],
  slots: [
    {
      key: 'settings.title',
      entity: 'settings',
      target: { setting: 'title' },
      type: 'text',
      role: 'business.name',
      sample: 'Bistro'
    },
    {
      key: 'pages.home.title',
      entity: 'pages.home',
      target: { collection: 'pages', entry: 'home', field: 'title' },
      type: 'text',
      role: 'editorial.heading',
      sample: 'Welcome'
    },
    {
      key: 'pages.home.intro',
      entity: 'pages.home',
      target: { collection: 'pages', entry: 'home', field: 'intro' },
      type: 'text',
      role: 'editorial.paragraph',
      sample: 'Hello'
    },
    {
      key: 'pages.home.items[0].name',
      entity: 'pages.home',
      target: { collection: 'pages', entry: 'home', field: 'items', item: 0, sub: 'name' },
      type: 'text',
      role: 'editorial.heading',
      sample: 'Soup'
    },
    {
      key: 'pages.menu.title',
      entity: 'pages.menu',
      target: { collection: 'pages', entry: 'menu', field: 'title' },
      type: 'text',
      role: 'editorial.heading',
      sample: 'Our menu'
    },
    {
      key: 'pages.menu.note',
      entity: 'pages.menu',
      target: { collection: 'pages', entry: 'menu', field: 'note' },
      type: 'text',
      role: 'editorial.paragraph',
      sample: 'Fresh'
    },
    {
      key: 'chrome.chrome.topbar',
      entity: 'chrome.chrome',
      target: { collection: 'chrome', entry: 'chrome', field: 'topbar' },
      type: 'text',
      role: 'contact.hours',
      sample: '9-5'
    },
    {
      key: 'chrome.chrome.brand_name',
      entity: 'chrome.chrome',
      target: { collection: 'chrome', entry: 'chrome', field: 'brand_name' },
      type: 'text',
      role: 'business.name',
      sample: 'Bistro'
    },
    {
      key: 'chrome.chrome.address',
      entity: 'chrome.chrome',
      target: { collection: 'chrome', entry: 'chrome', field: 'address' },
      type: 'text',
      role: 'contact.address',
      sample: '1 Main St'
    }
  ]
}

const part = (selector, classes, stamps, extra = {}) => ({
  selector,
  tag: 'section',
  classes,
  height: 100,
  hasHeaderTag: false,
  isFooter: false,
  shown: true,
  stamps: stamps.map(([collection, slug, field]) => ({ collection, slug, kind: null, field })),
  ...extra
})
const TOP = part('body > div > div.bs-topbar', ['bs-topbar'], [['chrome', 'chrome', 'topbar']])
const HEAD = part('body > div > div.bs-band', ['bs-band'], [['chrome', 'chrome', 'brand_name']], {
  hasHeaderTag: true
})
const FOOT = part('body > div > footer.bs-footer', ['bs-footer'], [['chrome', 'chrome', 'address']], {
  isFooter: true,
  tag: 'footer'
})
const SECTIONS = {
  '/': {
    before: [TOP, HEAD],
    main: [
      part(
        'body > div > main#main > section.bs-hero',
        ['bs-section', 'bs-hero'],
        [
          ['pages', 'home', 'title'],
          ['pages', 'home', 'intro']
        ]
      ),
      part(
        'body > div > main#main > section.bs-dishes',
        ['bs-section', 'bs-dishes'],
        [
          ['pages', 'home', 'items'],
          ['pages', 'menu', 'note']
        ]
      )
    ],
    after: [FOOT]
  },
  '/menu': {
    before: [TOP, HEAD],
    main: [
      part(
        'body > div > main#main > section.bs-list',
        ['bs-section', 'bs-list'],
        [['pages', 'menu', 'title']]
      )
    ],
    after: [FOOT]
  }
}

test('a contract folder with no manifest.json gets one made from its EmDash content map', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-emdash-'))
  try {
    writeFileSync(join(dir, 'content-map.json'), JSON.stringify(MAP))
    const m = readManifest(dir)
    assert.equal(m.id, 'tracy-bistro/emdash-0.x/2.0.3')
    assert.equal(m.platform, 'emdash')
    assert.deepEqual(m.quickstart, {
      product: 'tracy-bistro',
      version: '2.0.3',
      release: 'tracy-bistro/emdash-0.x'
    })
    assert.equal(
      readManifest(dir, { release: 'tracy-bistro/emdash-1.x' }).id,
      'tracy-bistro/emdash-1.x/2.0.3'
    )
    assert.equal(platformOf(dir), 'emdash')
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id: 'x/y/1', platform: 'wordpress' }))
    assert.equal(readManifest(dir).id, 'x/y/1', 'a manifest.json always wins')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a folder with neither a manifest nor an EmDash map is refused by name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-emdash-'))
  try {
    assert.throws(() => readManifest(dir), /no manifest\.json and no EmDash content-map\.json/)
    assert.equal(platformOf(dir), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('EmDash pages are addressed with their plain path', () => {
  usePlatform('emdash')
  assert.equal(urlOfPath('/menu/soup', 'http://127.0.0.1:4361'), 'http://127.0.0.1:4361/menu/soup')
  assert.equal(urlOfPath('/', 'http://127.0.0.1:4361'), 'http://127.0.0.1:4361/')
  assert.equal(urlOfPath('/blog?start=6', 'http://127.0.0.1:4361'), 'http://127.0.0.1:4361/blog?start=6')
  assert.equal(templateFileOf({ platform: 'emdash', template: 'tracy-bistro' }), null)
  setUrlStyle('index-php')
})

test('a page splits into the shared parts and one block per section; a slot belongs to the section that prints it', () => {
  const map = withEmdashPages(MAP, SECTIONS)
  const home = map.pages.find((p) => p.entity === 'pages.home')
  assert.equal(home.route, 'home')
  assert.deepEqual(
    home.assignedModules.map((a) => [a.entity, a.position, a.kind]),
    [
      ['part-topbar', 'header-topbar', 'template-header'],
      ['header', 'header-band', 'template-header'],
      ['block-home-hero', 'hero', 'section'],
      ['block-home-dishes', 'dishes', 'section'],
      ['footer', 'footer', 'template-part']
    ]
  )
  assert.equal(home.assignedModules[2].selector, 'body > div > main#main > section.bs-hero')
  const owner = Object.fromEntries(map.slots.map((s) => [s.key, s.entity]))
  assert.equal(owner['pages.home.title'], 'block-home-hero')
  assert.equal(owner['pages.home.intro'], 'block-home-hero')
  assert.equal(owner['pages.home.items[0].name'], 'block-home-dishes', 'a repeater row follows its field')
  assert.equal(
    owner['pages.menu.note'],
    'block-home-dishes',
    'a field its own page does not print goes to the first section that does'
  )
  assert.equal(owner['pages.menu.title'], 'block-menu-list')
  assert.equal(owner['chrome.chrome.topbar'], 'part-topbar')
  assert.equal(owner['chrome.chrome.address'], 'footer')
  assert.equal(
    owner['chrome.chrome.brand_name'],
    'chrome.chrome',
    'the business name is the header block by role, never claimed'
  )
  assert.equal(owner['settings.title'], 'settings')
  assert.ok(map.entities.some((e) => e.key === 'block-home-hero' && e.kind === 'section'))
  assert.ok(map.entities.some((e) => e.key === 'part-topbar'))
  assert.ok(map.platformGaps.some((g) => g.key === 'menuBlocks'))
  assert.deepEqual(map.sectionGaps, [])
  assert.deepEqual(
    map.otherPageAreas.map((a) => a.entity),
    ['part-topbar', 'header', 'main-body', 'footer']
  )
})

test('an entry that is no page of its own is one block on every page that prints it; a part on some pages only belongs to its page', () => {
  const map = {
    ...MAP,
    entities: [
      ...MAP.entities,
      { key: 'reservation.reservation', kind: 'entry', identity: {} },
      { key: 'masthead.menu', kind: 'entry', identity: {} }
    ],
    slots: [
      ...MAP.slots,
      {
        key: 'reservation.reservation.title',
        entity: 'reservation.reservation',
        target: { field: 'title' },
        type: 'text',
        role: 'editorial.heading',
        sample: 'Book'
      },
      {
        key: 'masthead.menu.title',
        entity: 'masthead.menu',
        target: { field: 'title' },
        type: 'text',
        role: 'editorial.heading',
        sample: 'Menu'
      }
    ]
  }
  const form = (selector) =>
    part(selector, ['bs-section', 'bs-reserve'], [['reservation', 'reservation', 'title']])
  const sections = structuredClone(SECTIONS)
  sections['/'].main.push(form('body > div > main#main > section.bs-reserve'))
  sections['/menu'].main.push(form('body > div > main#main > div.bs-reserve'))
  sections['/menu'].before.splice(
    2,
    0,
    part('body > div > section.bs-masthead', ['bs-masthead'], [['masthead', 'menu', 'title']])
  )
  const out = withEmdashPages(map, sections)
  const owner = Object.fromEntries(out.slots.map((s) => [s.key, s.entity]))
  assert.equal(owner['reservation.reservation.title'], 'block-reservation-reservation')
  assert.equal(
    owner['masthead.menu.title'],
    'block-masthead-menu',
    'a masthead only /menu prints is not shared'
  )
  const ids = (path) => out.pages.find((p) => p.openAs === path).assignedModules.map((a) => a.entity)
  assert.deepEqual(ids('/menu'), [
    'part-topbar',
    'header',
    'block-masthead-menu',
    'block-menu-list',
    'block-reservation-reservation',
    'footer'
  ])
  assert.ok(ids('/').includes('block-reservation-reservation'))
  assert.equal(out.entities.filter((e) => e.key === 'block-reservation-reservation').length, 1)
})

test('a page title the theme does not stamp belongs to the part whose heading says it, not to the menu that lists it', () => {
  const sections = structuredClone(SECTIONS)
  // The menu (shared) stamps the page titles; the page prints its own title in a heading with no stamp.
  for (const path of ['/', '/menu'])
    sections[path].before[0].stamps.push({ collection: 'pages', slug: 'menu', kind: 'field', field: 'title' })
  sections['/menu'].main[0].stamps = []
  sections['/menu'].main[0].headings = ['Our MENU']
  const owner = Object.fromEntries(withEmdashPages(MAP, sections).slots.map((s) => [s.key, s.entity]))
  assert.equal(owner['pages.menu.title'], 'block-menu-list')
  const noHeading = structuredClone(sections)
  noHeading['/menu'].main[0].headings = []
  const alone = Object.fromEntries(withEmdashPages(MAP, noHeading).slots.map((s) => [s.key, s.entity]))
  assert.equal(
    alone['pages.menu.title'],
    'part-topbar',
    'with no other evidence the part that prints it holds it'
  )
})

test('an own page claims its slot before a shared part does', () => {
  const sections = structuredClone(SECTIONS)
  sections['/'].after.unshift(part('body > div > div.bs-strip', ['bs-strip'], [['pages', 'menu', 'title']]))
  const map = withEmdashPages(MAP, sections)
  assert.equal(map.slots.find((s) => s.key === 'pages.menu.title').entity, 'block-menu-list')
})

test('the entry a page is owns the page, and the page map is found by its path', () => {
  const map = withEmdashPages(MAP, SECTIONS)
  const idx = indexMap(map)
  assert.deepEqual(ownerOfPath(idx, '/menu'), { owner: 'pages.menu', kind: 'page' })
  assert.deepEqual(ownerOfPath(idx, '/'), { owner: 'pages.home', kind: 'page' })
})

test('without the sections read from the site, every page is header, main body and footer by tag', () => {
  const map = withEmdashPages(MAP, null)
  assert.deepEqual(
    map.pages[0].assignedModules.map((a) => a.selector),
    ['header', 'main', 'footer']
  )
  assert.ok(map.sectionGaps.length === 2)
  assert.deepEqual(map.slots, MAP.slots, 'no slot moves')
})

test('a page the run could not read stays three areas and is named', () => {
  const sections = { '/': SECTIONS['/'] }
  const map = withEmdashPages(MAP, sections)
  assert.deepEqual(
    map.pages[1].assignedModules.map((a) => a.entity),
    ['header', 'main-body', 'footer']
  )
  assert.ok(map.sectionGaps.some((g) => g.field === 'blocks[pages.menu]' && /\/menu/.test(g.reason)))
})

test('the page reader returns the parts around <main> with their selectors and the fields stamped inside', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(`<body><div class="wrap">
      <div class="bs-topbar" data-tracy-src="emdash:chrome:01A:chrome field:topbar">9-5</div>
      <div class="bs-band"><header><a>Bistro</a></header></div>
      <main id="main">
        <section class="bs-section bs-hero"><h1 data-tracy-src="emdash:pages:01B:home field:title">Welcome</h1>
          <ul><li data-tracy-src="emdash:pages:01B:home block:items">Soup</li></ul></section>
        <h1 class="bs-title">Gallery</h1>
        <section class="bs-section bs-hero"><p data-tracy-src="emdash:pages:01B:home field:intro">Hi</p></section>
        <script>1</script>
      </main>
      <footer class="bs-footer"><p data-tracy-src="emdash:chrome:01A:chrome field:address">1 Main St</p></footer>
    </div></body>`)
    const read = await page.evaluate(readEmdashSections)
    assert.deepEqual(
      read.before.map((p) => [p.classes[0], p.hasHeaderTag]),
      [
        ['bs-topbar', false],
        ['bs-band', true]
      ]
    )
    assert.equal(read.main.length, 3, 'a script is not a section')
    assert.deepEqual(read.main[1].headings, ['Gallery'], 'a heading that is itself a part of main is read')
    assert.deepEqual(read.main[0].stamps, [
      { collection: 'pages', slug: 'home', kind: 'field', field: 'title' },
      { collection: 'pages', slug: 'home', kind: 'block', field: 'items' }
    ])
    assert.equal(
      await page.locator(read.main[1].selector).count(),
      1,
      'two sections of one class still find one element each'
    )
    assert.equal(await page.locator(read.before[0].selector).count(), 1)
    assert.equal(read.after[0].isFooter, true)
    assert.equal(await page.evaluate(() => (document.body.innerHTML ? 1 : 0)), 1)
  } finally {
    await browser.close()
  }
})

const HEADER = `<BrandLogo spots={logoSpots(logos, 'themed')} alt="x"><img src="/brand/logo.png"/></BrandLogo>`
const FOOTER = `<BrandLogo spots={logoSpots(logos, 'dark')} alt="x"/>`

function sourceOf(files) {
  return { query: null, readFile: (rel) => files[rel] ?? null }
}

test('the adapter names the logo settings a theme prints and what is shown without a picture', () => {
  const adapter = emdashAdapter(sourceOf({ 'src/components/site/Header.astro': HEADER }), {
    settings: { title: 'Bistro', logo: { url: '/_emdash/api/media/file/A.png' }, favicon: null },
    map: MAP,
    template: 'tracy-bistro'
  })
  assert.equal(adapter.cms, 'emdash')
  assert.equal(adapter.framework, 'astro')
  assert.equal(adapter.siteName, 'Bistro')
  assert.deepEqual(adapter.logoSettings(), [
    {
      key: 'settings.logo',
      value: '/_emdash/api/media/file/A.png',
      prints: [{ where: 'header', layout: 'src/components/site/Header.astro', emptyShows: 'template-text' }]
    },
    {
      key: 'chrome.logo_dark',
      value: '',
      prints: [{ where: 'header', layout: 'src/components/site/Header.astro', emptyShows: 'template-text' }]
    }
  ])
})

test('a footer drawn on ink prints the dark logo only', () => {
  const files = { 'src/components/site/Header.astro': HEADER, 'src/components/site/Footer.astro': FOOTER }
  assert.deepEqual(
    logoPlacesOf(files).map((p) => [p.where, p.dark]),
    [
      ['header', false],
      ['footer', true]
    ]
  )
  const keys = emdashAdapter(sourceOf(files), { settings: {} }).logoSettings()
  assert.deepEqual(
    keys.find((s) => s.key === 'settings.logo').prints.map((p) => p.where),
    ['header']
  )
  assert.deepEqual(
    keys.find((s) => s.key === 'chrome.logo_dark').prints.map((p) => p.where),
    ['header', 'footer']
  )
})

test('the adapter answers the menu, the page behind an entity, the favicon and the head from what it was given', () => {
  const adapter = adapterFor('emdash', sourceOf({}), {
    settings: { title: 'Bistro', favicon: { url: '/f.png' } },
    map: MAP
  })
  assert.deepEqual(adapter.mainMenuTitles(), ['Home', 'Menu'])
  assert.deepEqual(adapter.menuOf('pages.menu'), { title: 'Our menu', params: {} })
  assert.equal(adapter.menuOf('pages.nope'), null)
  assert.equal(adapter.isListing(MAP.pages[1]), true)
  assert.equal(adapter.isListing(MAP.pages[0]), false)
  assert.deepEqual(adapter.nameSettings(), [
    { kind: 'setting', scope: 'cms', setting: 'settings.title', value: 'Bistro' }
  ])
  assert.deepEqual(adapter.favicon([{ href: '/favicon.svg?v=2' }]), {
    currentFile: '/favicon.svg',
    mechanism: { setting: 'settings.favicon', value: '/f.png', fallback: '/favicon.svg' }
  })
  const head = adapter.head({ withName: 2, of: 2, examples: [] })
  assert.equal(head.titleSuffix.setting, 'settings.title')
  assert.equal(adapter.isFreeHtml({}), false)
  assert.ok(adapter.errors.some((e) => e.kind === 'not-on-platform' && e.field === 'site.head.injection'))
  const bare = emdashAdapter({ query: null, readFile: null }, { settings: {} })
  assert.ok(
    bare.errors.some((e) => e.kind === 'missing' && e.field === 'site.template'),
    'no site folder, no theme files'
  )
  assert.deepEqual(bare.logoSettings(), [])
})

test('without settings the adapter says so instead of inventing a name', () => {
  const adapter = emdashAdapter(sourceOf({}), { settings: null, settingsReason: 'no agent token' })
  assert.equal(adapter.siteName, null)
  assert.deepEqual(adapter.nameSettings(), [])
  assert.ok(adapter.errors.some((e) => e.field === 'site.settings' && e.reason === 'no agent token'))
})

test('the settings are read with GET and the agent token from a file; every failure is a reason, not a throw', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-emdash-'))
  try {
    const tokenFile = join(dir, 'agent.token')
    writeFileSync(tokenFile, 'secret-token\n')
    const calls = []
    const ok = async (url, init) => {
      calls.push([String(url), init.headers.authorization, init.method])
      return { ok: true, status: 200, json: async () => ({ success: true, data: { title: 'Bistro' } }) }
    }
    const r = await readEmdashSettings({ siteUrl: 'http://127.0.0.1:4361', tokenFile, fetchImpl: ok })
    assert.deepEqual(r.settings, { title: 'Bistro' })
    assert.deepEqual(calls, [
      ['http://127.0.0.1:4361/_emdash/api/settings', 'Bearer secret-token', undefined]
    ])
    assert.match((await readEmdashSettings({ siteUrl: 'http://x' })).reason, /--token-file/)
    assert.match(
      (await readEmdashSettings({ siteUrl: 'http://x', tokenFile: join(dir, 'none') })).reason,
      /could not be read/
    )
    const denied = async () => ({ ok: false, status: 401 })
    assert.match(
      (await readEmdashSettings({ siteUrl: 'http://x', tokenFile, fetchImpl: denied })).reason,
      /answered 401/
    )
    const down = async () => {
      throw new Error('ECONNREFUSED')
    }
    assert.match(
      (await readEmdashSettings({ siteUrl: 'http://x', tokenFile, fetchImpl: down })).reason,
      /ECONNREFUSED/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the brand colours are the design system role variables of tokens.css, named with the theme colour as fallback', () => {
  const css = `:root {
    --color-accent: var(--ds-c-accent, #D24A24);
    --color-accent-hover: var(--ds-c-accent-hover, #b93d1b);
    --color-secondary: var(--ds-c-accent-on-ink, #ffd33d);
    --color-primary: var(--color-accent);
    --color-ring: #123456;
  }
  .dark { --color-accent: var(--ds-c-accent, #f08a68); }`
  assert.deepEqual(brandVariablesOf(css), [
    {
      name: '--ds-c-accent',
      value: '#d24a24',
      declaredIn: 'src/styles/tokens.css',
      names: 'primary',
      brand: true
    },
    {
      name: '--ds-c-accent-on-ink',
      value: '#ffd33d',
      declaredIn: 'src/styles/tokens.css',
      names: 'secondary',
      brand: true
    }
  ])
  assert.deepEqual(brandVariablesOf(null), [])
  const adapter = emdashAdapter(sourceOf({ 'src/styles/tokens.css': ':root{--color-primary:#AABBCC}' }), {})
  assert.deepEqual(adapter.colourVariables(), [
    {
      name: '--color-primary',
      value: '#aabbcc',
      declaredIn: 'src/styles/tokens.css',
      names: 'primary',
      brand: true
    }
  ])
})

test('a picture slot takes the file the page serves, read from the media record; without it the gap is named', () => {
  const map = {
    ...MAP,
    slots: [
      ...MAP.slots,
      {
        key: 'pages.home.photo',
        entity: 'pages.home',
        target: { field: 'photo' },
        type: 'image',
        role: 'editorial.decorative_image',
        sample: 'rest-6.jpg'
      },
      {
        key: 'pages.home.empty',
        entity: 'pages.home',
        target: { field: 'empty' },
        type: 'image',
        role: 'editorial.decorative_image',
        sample: ''
      }
    ]
  }
  const served = '_emdash/api/media/file/01A.01B.jpg'
  const withMedia = withEmdashPages(map, SECTIONS, { 'pages.home.photo': served })
  assert.equal(withMedia.slots.find((s) => s.key === 'pages.home.photo').sample, served)
  assert.equal(withMedia.slots.find((s) => s.key === 'pages.home.empty').sample, '')
  assert.deepEqual(withMedia.sectionGaps, [])
  const without = withEmdashPages(map, SECTIONS, null)
  assert.equal(without.slots.find((s) => s.key === 'pages.home.photo').sample, 'rest-6.jpg')
  assert.match(without.sectionGaps[0].reason, /1 picture slots hold their demo file name.*--token-file/)
})

test('a stylesheet that prints every rule in a cascade layer (Tailwind v4) still has its variables and page ground', () => {
  const layered = (selector, prop, value) => ({
    at: ['@layer base'],
    selector,
    decls: [{ prop, value, important: false }]
  })
  const sides = sidesOf([
    layered(':root', '--color-bg', 'var(--ds-c-bg, #f4f2e7)'),
    layered('body', 'background', 'var(--color-bg)')
  ])
  assert.deepEqual(sides.get('base').grounds, ['#f4f2e7'])
  assert.equal(sides.get('base').groundMeasured, true)
  const inMedia = sidesOf([
    {
      at: ['@media (min-width: 40em)'],
      selector: ':root',
      decls: [{ prop: '--color-bg', value: '#000000', important: false }]
    },
    layered('body', 'background', 'var(--color-bg, #ffffff)')
  ])
  assert.deepEqual(
    inMedia.get('base').grounds,
    ['#ffffff'],
    'a variable set under a media condition is not the base'
  )
})

test("a theme's own brand token is its accent when only links are painted with another colour", () => {
  const css = `@layer base { :root { --color-accent: var(--ds-c-accent, #d24a24); --color-accent-text: var(--ds-c-accent-text, #bc4220); }
    a { color: var(--color-accent-text); } .rs-btn { background: var(--color-accent); } }`
  const styles = [{ css, from: '/a.css' }]
  const [token] = brandVariablesOf(':root { --color-accent: var(--ds-c-accent, #d24a24); }')
  assert.equal(measureBrandColours(styles, { variables: [token] }).primary, '#d24a24')
  const { brand: _brand, ...plain } = token
  assert.equal(
    measureBrandColours(styles, { variables: [plain] }).primary,
    '#bc4220',
    'only a theme that says so wins over links'
  )
})
