// tools/release.mjs writes tracy_site_pages.json (Tracy's "Pages" question) from seed/site-model.json:
// the primary menu at every depth (the rule Road REL-2 counts with), each path resolved to its page record slug, the front page marked home.
// `release.mjs --site-pages <dir>` prints that file without cutting a release.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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

test('a heading at level 1 is skipped and said; its child at "/" names Home', () => {
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
  // the branch that holds the front page is the Home entry; the writer says nothing about a heading it does not offer
  assert.doesNotMatch(stderr, /is a heading, not a page/)
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

test('a submenu page is listed, as Road REL-2 counts it (a writer that read level 1 only missed it)', () => {
  const { doc } = pagesOf({
    ...base,
    records: [...base.records, rec('pages', 'team'), rec('pages', 'login')],
    menus: [
      {
        name: 'primary',
        items: [
          { label: { en: 'Home' }, path: '/' },
          {
            label: { en: 'About' },
            path: '/about',
            children: [
              { label: { en: 'Team' }, path: '/about/team' },
              { label: { en: 'Log in' }, path: '/login' }
            ]
          },
          { label: { en: 'Contact' }, path: '/contact' }
        ]
      }
    ]
  })
  assert.deepEqual(doc.pages, [
    { id: 'home', label: 'Home', home: true },
    { id: 'about', label: 'About' },
    { id: 'team', label: 'Team' },
    { id: 'contact', label: 'Contact' }
  ])
})

test('a submenu under a heading is offered, and a label shared by two pages carries its heading', () => {
  const { doc } = pagesOf({
    ...base,
    records: [...base.records, rec('pages', 'design'), rec('pages', 'build')],
    menus: [
      {
        name: 'primary',
        items: [
          { label: { en: 'Home' }, path: '/' },
          {
            label: { en: 'Work' },
            path: '',
            children: [
              { label: { en: 'Layout' }, path: '/design' },
              { label: { en: 'Layout' }, path: '/build' }
            ]
          }
        ]
      }
    ]
  })
  assert.deepEqual(doc.pages, [
    { id: 'home', label: 'Home', home: true },
    { id: 'design', label: 'Work \u203a Layout' },
    { id: 'build', label: 'Work \u203a Layout' }
  ])
})
