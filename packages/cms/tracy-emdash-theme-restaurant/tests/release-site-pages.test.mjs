// tools/release.mjs writes tracy_site_pages.json (Tracy's "Pages" question) from seed/site-model.json:
// every content page of the primary menu at any depth (Tracy's own rule, read from the checkout: REL-2), each path
// resolved to its page record slug, the front page marked home.
// `release.mjs --site-pages <dir>` prints that file without cutting a release.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const RELEASE = path.join(import.meta.dirname, '..', 'tools', 'release.mjs')
const rec = (type, slug, locale = 'en') => ({
  type,
  slug,
  locale,
  status: 'published',
  values: { title: slug }
})

function pagesOf(model) {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-pages-'))
  mkdirSync(path.join(dir, 'seed'))
  writeFileSync(path.join(dir, 'seed', 'site-model.json'), JSON.stringify(model))
  const r = spawnSync(process.execPath, [RELEASE, '--site-pages', dir], { encoding: 'utf8' })
  return { status: r.status, doc: r.status === 0 ? JSON.parse(r.stdout) : null, stderr: r.stderr }
}

const base = {
  locales: { default: 'en' },
  records: [
    ...['home', 'about', 'contact'].flatMap((s) => [rec(s, s), rec(s, s, 'ru')]),
    rec('services_page', 'services'),
    rec('services', 'design-build'),
    rec('services', 'epc'),
    rec('pages', 'privacy'),
    rec('site', 'site')
  ]
}

test('primary menu level 1 -> page record slugs, front page marked home', () => {
  const { doc } = pagesOf({
    ...base,
    menus: [
      {
        name: 'primary',
        items: [
          { label: { en: 'Home', ru: 'Главная' }, path: '/' },
          { label: { en: 'About' }, path: '/about', localisedPath: { ru: '/ru/about' } },
          { label: { en: 'Services' }, path: '/services' },
          { label: { en: 'Contact' }, path: '/contact' }
        ]
      },
      { name: 'footer', items: [{ label: { en: 'Privacy' }, path: '/privacy' }] }
    ]
  })
  assert.deepEqual(doc, {
    pages: [
      { id: 'home', label: 'Home', home: true },
      { id: 'about', label: 'About' },
      { id: 'services', label: 'Services' },
      { id: 'contact', label: 'Contact' }
    ]
  })
})

test('a heading at level 1 is no page; its child at "/" is the front page, named by the heading', () => {
  const { doc, stderr } = pagesOf({
    ...base,
    menus: [
      {
        name: 'mainmenu',
        items: [
          {
            label: { en: 'Home' },
            path: '',
            kind: 'heading',
            children: [{ label: { en: 'Terminal' }, path: '/' }]
          },
          { label: { en: 'About' }, path: '/about' }
        ]
      }
    ]
  })
  assert.deepEqual(doc.pages, [
    { id: 'home', label: 'Home', home: true },
    { id: 'about', label: 'About' }
  ])
  assert.match(stderr, /no "primary" menu: used "mainmenu"/)
})

test('the pages under a submenu heading are offered too, system pages are not (REL-2)', () => {
  const { doc, stderr } = pagesOf({
    ...base,
    records: [
      ...base.records,
      rec('pages', 'simple-menu'),
      rec('pages', 'smart-search'),
      rec('pages', 'menu')
    ],
    menus: [
      {
        name: 'primary',
        items: [
          { label: { en: 'Home' }, path: '/' },
          {
            label: { en: 'Menu' },
            path: '/menu',
            children: [{ label: { en: 'Simple Menu' }, path: '/menu/simple-menu' }]
          },
          {
            label: { en: 'Explore' },
            children: [{ label: { en: 'Smart Search' }, path: '/explore/smart-search' }]
          },
          { label: { en: 'About' }, path: '/about' }
        ]
      }
    ]
  })
  assert.deepEqual(doc.pages, [
    { id: 'home', label: 'Home', home: true },
    { id: 'menu', label: 'Menu' },
    { id: 'simple-menu', label: 'Simple Menu' },
    { id: 'about', label: 'About' }
  ])
  assert.match(stderr, /skipped as system pages: Smart Search/)
})

test('a path two page records answer is not guessed: skipped and said', () => {
  const { doc, stderr } = pagesOf({
    ...base,
    records: [...base.records, rec('pages', 'about')],
    menus: [
      {
        name: 'primary',
        items: [
          { label: { en: 'Home' }, path: '/' },
          { label: { en: 'About' }, path: '/about' }
        ]
      }
    ]
  })
  assert.deepEqual(doc.pages, [{ id: 'home', label: 'Home', home: true }])
  assert.match(stderr, /"About" \(\/about\) matches 2 page records: skipped/)
})

test('no seed/site-model.json stops the release', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-pages-'))
  const r = spawnSync(process.execPath, [RELEASE, '--site-pages', dir], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /tracy_site_pages\.json: .*site-model\.json is missing/)
})

test("the generated list holds every nested page of this template's own seed, Our History included (REL-2)", () => {
  const r = spawnSync(process.execPath, [RELEASE, '--site-pages', path.join(import.meta.dirname, '..')], {
    encoding: 'utf8'
  })
  assert.equal(r.status, 0, r.stderr)
  const ids = JSON.parse(r.stdout).pages.map((p) => p.id)
  for (const id of [
    'our-history',
    'simple-menu',
    'menu-with-image',
    '2-column-menu',
    'phone-reservation',
    'contact-us'
  ])
    assert.ok(ids.includes(id), `${id} is listed`)
  assert.doesNotMatch(r.stderr, /matches 2 page records/, 'no path is answered by two records')
})

test('no section that holds one entry shares its slug with a page: the page rule would count both as page records', () => {
  const model = JSON.parse(
    readFileSync(path.join(import.meta.dirname, '..', 'seed', 'site-model.json'), 'utf8')
  )
  const perType = {}
  for (const r of model.records) perType[r.type] = (perType[r.type] ?? 0) + 1
  const pages = new Set(model.records.filter((r) => r.type === 'pages').map((r) => r.slug))
  const clash = model.records
    .filter((r) => !['pages', 'site'].includes(r.type) && perType[r.type] === 1 && pages.has(r.slug))
    .map((r) => `${r.type}/${r.slug}`)
  assert.deepEqual(clash, [])
})
