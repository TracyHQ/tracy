// tools/release.mjs writes tracy_site_pages.json (Tracy's "Pages" question) from seed/site-model.json:
// the primary menu's level 1, each path resolved to its page record slug, the front page marked home.
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
  assert.match(stderr, /"Home" is a heading, not a page \(children: Terminal\)/)
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
