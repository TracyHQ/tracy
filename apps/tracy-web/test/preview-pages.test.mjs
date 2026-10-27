/**
 * The pages the preview measurement reads (Akemi, 15/10/2026: a customer who wears a system gets the
 * whole site restyled, so LAYOUT-3 and every preview detector run on every page the template
 * declares). The list comes from the release's own contract, per CMS: Joomla's content map (menu
 * items), WordPress's content map plus the demo's published pages, EmDash's QA contract.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

import {
  declaredPagesOf,
  emdashPagesOf,
  joomlaPagesOf,
  localeNoteOf,
  localeSampleOf,
  pageSlugOf,
  pageSourceOf,
  pagesFor,
  wordpressPagesOf
} from '../scripts/preview-pages.mjs'

const ROOT = resolve(import.meta.dirname, '../../..')

test('Joomla: every menu item that is a page, at /index.php/<route>; headings, aliases and URLs are not pages', () => {
  const pages = joomlaPagesOf({
    pages: [
      { route: 'home-menu', link: '' },
      { route: 'home-menu/home', link: 'index.php?option=com_content&view=featured' },
      { route: 'product/features', link: 'index.php?option=com_content&view=article&id=90' },
      { route: 'footer-product-features', link: 'index.php?Itemid=218' },
      { route: 'docs', link: 'https://example.com/docs' },
      { route: 'company/contact', link: 'index.php?option=com_contact&view=contact&id=1' }
    ]
  })
  assert.deepEqual(pages, [
    '/',
    '/index.php/home-menu/home',
    '/index.php/product/features',
    '/index.php/company/contact'
  ])
  assert.deepEqual(joomlaPagesOf(null), ['/'])
})

test('Joomla: a trashed or unpublished menu item, and a category view without its category, are not pages', () => {
  // JA Vital 1.0.5 declared /about-us and /check (trashed, published -2) and /pages/other-pages/search
  // (unpublished, 0); JA Spa 1.0.6 /page/joomla-content (a category blog with no category id): all 404,
  // so their rules stayed unmeasured on every release (batch 2, 16/10/2026)
  const map = {
    pages: [
      { entity: 'menuItem-101', route: 'home', link: 'index.php?option=com_content&view=featured' },
      { entity: 'menuItem-109', route: 'about-us', link: 'index.php?option=com_content&view=article&id=1' },
      { entity: 'menuItem-144', route: 'pages/search', link: 'index.php?option=com_search&view=search' },
      {
        entity: 'menuItem-118',
        route: 'page/joomla-content',
        link: 'index.php?option=com_content&view=category&layout=blog'
      },
      {
        entity: 'menuItem-120',
        route: 'blog',
        link: 'index.php?option=com_content&view=category&layout=blog&id=8'
      }
    ]
  }
  const lock = {
    entities: {
      'menuItem-101': { published: '1' },
      'menuItem-109': { published: '-2' },
      'menuItem-144': { published: '0' },
      'menuItem-118': { published: '1' },
      'menuItem-120': { published: '1' }
    }
  }
  assert.deepEqual(joomlaPagesOf(map, lock), ['/', '/index.php/home', '/index.php/blog'])
  // without the lock, publication is not known: every linked item stays a page
  assert.equal(joomlaPagesOf(map).length, 5)
})

test("WordPress: the content map's pages, then the demo's published pages, each once, home first", () => {
  const map = {
    entities: [
      { kind: 'page', identity: { postType: 'page', slug: 'pricing' } },
      { kind: 'option', identity: { name: 'blogname' } },
      { kind: 'page', identity: { postType: 'page', slug: 'features' } }
    ]
  }
  assert.deepEqual(wordpressPagesOf(map, ['/product/blog/', '/pricing/', 'https://x/']), [
    '/',
    '/pricing/',
    '/features/',
    '/product/blog/'
  ])
})

test('WordPress: a content-map slug the demo publishes under a parent page is that child page, not /<slug>/', () => {
  const map = {
    entities: [
      { kind: 'page', identity: { postType: 'page', slug: 'contact' } },
      { kind: 'page', identity: { postType: 'page', slug: 'pricing' } }
    ]
  }
  assert.deepEqual(wordpressPagesOf(map, ['/about-us-2/contact/', '/about-us-2/', '/pricing/']), [
    '/',
    '/about-us-2/contact/',
    '/pricing/',
    '/about-us-2/'
  ])
})

test('EmDash: the QA contract pages of the default locale that answer 200', () => {
  const pages = emdashPagesOf({
    defaultLocale: 'en',
    pages: [
      { path: '/', locale: 'en', status: 200 },
      { path: '/about', locale: 'en', status: 200 },
      { path: '/404', locale: 'en', status: 404 },
      { path: '/ru/about', locale: 'ru', status: 200 },
      { path: '/search?q=building', locale: 'en', status: 200 }
    ]
  })
  assert.deepEqual(pages, ['/', '/about', '/search?q=building'])
})

test('--pages: all (default) is every declared page, home is the fast mode, a list is taken as given', () => {
  const declared = ['/', '/a/', '/b/']
  assert.deepEqual(pagesFor(undefined, declared), declared)
  assert.deepEqual(pagesFor('all', declared), declared)
  assert.deepEqual(pagesFor('home', declared), ['/'])
  assert.deepEqual(pagesFor('/b/, /a/', declared), ['/b/', '/a/'])
  assert.equal(pageSlugOf('/'), 'home')
  assert.equal(pageSlugOf('/index.php/product/features'), 'product-features')
})

test('JA Kinetic: both CMS read their contract of the measured version, and list more than the home page', async () => {
  const noRest = async () => new Response('[]', { status: 200 })
  for (const d of [
    { platform: 'joomla', tag: 'quickstart/ja-kinetic/j6', version: '1.0.6', address: 'https://j.invalid/' },
    {
      platform: 'wordpress',
      tag: 'quickstart/ja-kinetic/wp7',
      version: '1.0.9',
      address: 'https://w.invalid/'
    }
  ]) {
    const file = pageSourceOf(d)
    assert.ok(file && existsSync(join(ROOT, file)), `${d.tag}: ${file}`)
    const { pages, source } = await declaredPagesOf(d, { root: ROOT, fetchImpl: /** @type {any} */ (noRest) })
    assert.deepEqual(source, [file])
    assert.equal(pages[0], '/')
    assert.ok(pages.length > 10, `${d.tag}: ${pages.length} pages`)
  }
  const emdash = pageSourceOf({ platform: 'emdash', tag: 'tracy-business/emdash-0.x', version: '1.7.19' })
  assert.equal(emdash, 'packages/cms/tracy-emdash-theme-business/qa.contract.json')
  assert.ok(existsSync(join(ROOT, emdash)))
})

test('multilingual WordPress: every default-locale page, every page of the two stress locales, every locale home; the rest are twins', () => {
  const pages = ['/', '/about/', '/news/']
  for (const l of ['de', 'ru', 'fr', 'zh-tw']) pages.push(`/${l}/`, `/${l}/about-${l}/`, `/${l}/news-${l}/`)
  // Tracy Business WordPress 1.3.6: the REST list does not always name a locale's home page
  const s = localeSampleOf(pages.filter((p) => p !== '/fr/'))
  assert.deepEqual(s.stress, ['de', 'ru'])
  assert.deepEqual(s.pages, [
    '/',
    '/about/',
    '/news/',
    '/de/',
    '/de/about-de/',
    '/de/news-de/',
    '/ru/',
    '/ru/about-ru/',
    '/ru/news-ru/',
    '/fr/',
    '/zh-tw/'
  ])
  assert.deepEqual(s.twins, { fr: 2, 'zh-tw': 2 })
  assert.match(String(localeNoteOf(s)), /4 locales.*de and ru.*4 other locale copies/)
})

test('a single-language site, or a lone two-letter slug, is no locale sample', () => {
  const pages = ['/', '/about/', '/uk/', '/news/', '/news/item/']
  assert.deepEqual(localeSampleOf(pages), { pages, twins: {}, stress: [], locales: [] })
  assert.equal(localeNoteOf(localeSampleOf(pages)), null)
})

test('a URL menu item that links another item (&Itemid=) is not a page of its own', () => {
  const pages = joomlaPagesOf({
    pages: [
      {
        route: 'podcast/podcast-detail/podcast-detail-layout-1',
        link: 'index.php?option=com_content&view=article&id=70'
      },
      {
        route: 'podcast/podcast-detail/podcast-detail-layout-3',
        link: 'index.php?option=com_content&view=article&id=67-soothe&catid=15&Itemid=147'
      }
    ]
  })
  assert.deepEqual(pages, ['/', '/index.php/podcast/podcast-detail/podcast-detail-layout-1'])
})

test('a menu heading or separator that kept a link from an earlier type is not a page', () => {
  // JA Impact 1.0.3 'User' (menuItem-106, pages/user) is a heading whose link column still reads the
  // login view it once was: Joomla answers 404 at /index.php/pages/user, so 13 rules stayed unmeasured
  const map = {
    pages: [
      { entity: 'menuItem-106', route: 'pages/user', link: 'index.php?option=com_users&view=login' },
      {
        entity: 'menuItem-107',
        route: 'pages/user/login-form',
        link: 'index.php?option=com_users&view=login'
      },
      { entity: 'menuItem-130', route: 'pages/line', link: 'index.php?option=com_content&view=featured' }
    ]
  }
  const lock = {
    entities: {
      'menuItem-106': { published: '1', type: 'heading' },
      'menuItem-107': { published: '1', type: 'component' },
      'menuItem-130': { published: '1', type: 'separator' }
    }
  }
  assert.deepEqual(joomlaPagesOf(map, lock), ['/', '/index.php/pages/user/login-form'])
})

test('an article submit form (com_content view=form) is not a page: a visitor without a login gets 403', () => {
  const pages = joomlaPagesOf({
    pages: [
      { route: 'pages/login', link: 'index.php?option=com_users&view=login' },
      { route: 'pages/submit-article', link: 'index.php?option=com_content&view=form&layout=edit' }
    ]
  })
  assert.deepEqual(pages, ['/', '/index.php/pages/login'])
})
