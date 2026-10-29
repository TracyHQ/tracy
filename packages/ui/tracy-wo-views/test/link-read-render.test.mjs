import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

const require = createRequire(import.meta.url)
const folder = mkdtempSync(path.join(tmpdir(), 'link-read-render-'))
const uiRequire = createRequire(require.resolve('@tracy/ui'))
const baseUiRequire = createRequire(uiRequire.resolve('@base-ui/react'))
let lib
before(async () => {
  const outfile = path.join(folder, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'; export { LinkRows, LinkReadResults } from './src/link-rows'; export { en as addWords } from '../../site/tracy-add-site/src/client/strings'; export { en as woWords } from '../../site/tracy-website-opportunities/src/client/strings';`,
      resolveDir: path.resolve(import.meta.dirname, '..'),
      loader: 'tsx'
    },
    alias: {
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom/server': baseUiRequire.resolve('react-dom/server')
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => rmSync(folder, { recursive: true, force: true }))

const links = [
  {
    url: 'https://share.google/juniper-fictional',
    kind: 'google',
    used: false,
    primary: true,
    readStatus: 'could-not-read',
    readReason: 'not-configured'
  },
  {
    url: 'https://instagram.com/juniper-fictional',
    kind: 'instagram',
    used: true,
    readStatus: 'could-not-read',
    readReason: 'blocked'
  },
  {
    url: 'https://juniper.example',
    kind: 'website',
    used: true,
    readStatus: 'read',
    counts: { photos: 2, reviews: 0, contacts: 3 }
  }
]
const words = {
  'read.not-configured':
    'Could not read: this source is not available here. Paste another link for the same business.',
  'read.blocked':
    'Could not read: this page is private or blocked. Paste a public link for the same business.',
  'read.read': 'Read: {photos}, {reviews}, {contacts}',
  'read.photos.one': '{count} photo',
  'read.photos.other': '{count} photos',
  'read.reviews.one': '{count} review',
  'read.reviews.other': '{count} reviews',
  'read.contacts.one': '{count} contact item',
  'read.contacts.other': '{count} contact items'
}
const copy = (key, params = {}) =>
  Object.entries(params).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), words[key] ?? key)

test('editable links and research results both render every URL with read counts or recovery text', () => {
  for (const Component of [lib.LinkRows, lib.LinkReadResults]) {
    const html = lib.renderToStaticMarkup(
      lib.createElement(Component, { links, rows: links.map((l) => l.url), server: links, copy, onRows() {} })
    )
    for (const link of links) assert.ok(html.includes(link.url), link.url)
    assert.match(html, /this source is not available here/)
    assert.match(html, /this page is private or blocked/)
    assert.match(html, /Read: 2 photos, 0 reviews, 3 contact items/)
    assert.doesNotMatch(html, /credential_missing/)
  }
})

test('editable and result rows pluralise each contribution independently', () => {
  for (const Component of [lib.LinkRows, lib.LinkReadResults]) {
    for (const [count, expected] of [
      [0, 'Read: 0 photos, 0 reviews, 0 contact items'],
      [1, 'Read: 1 photo, 1 review, 1 contact item'],
      [2, 'Read: 2 photos, 2 reviews, 2 contact items']
    ]) {
      const source = [
        {
          url: 'https://juniper.example',
          kind: 'website',
          used: true,
          readStatus: 'read',
          counts: { photos: count, reviews: count, contacts: count }
        }
      ]
      const html = lib.renderToStaticMarkup(
        lib.createElement(Component, {
          links: source,
          rows: source.map((l) => l.url),
          server: source,
          copy,
          onRows() {}
        })
      )
      assert.ok(html.includes(expected), html)
    }
  }
})

test('both plugin namespaces render translated singular counts in every interface language', () => {
  for (const locale of ['en', 'vi', 'de', 'es', 'fr', 'it', 'nl', 'zh']) {
    for (const namespace of ['tracy-add-site', 'tracy-website-opportunities']) {
      const dictionary =
        locale === 'en'
          ? namespace === 'tracy-add-site'
            ? lib.addWords
            : lib.woWords
          : JSON.parse(
              readFileSync(
                path.resolve(
                  import.meta.dirname,
                  '../../..',
                  'locale',
                  locale === 'vi' ? 'tracy-locale-vi/vi' : `tracy-locales/${locale}`,
                  `${namespace}.json`
                ),
                'utf8'
              )
            )
      const translate = (key, params = {}) => {
        const mapped =
          namespace === 'tracy-add-site'
            ? 'own_links_' + key.replaceAll('.', '_').replaceAll('-', '_')
            : 'links.' + key
        assert.equal(typeof dictionary[mapped], 'string', `${locale}: ${mapped}`)
        return Object.entries(params).reduce(
          (value, [name, count]) => value.replaceAll(`{${name}}`, String(count)),
          dictionary[mapped]
        )
      }
      const html = lib.renderToStaticMarkup(
        lib.createElement(lib.LinkReadResults, {
          locale,
          copy: translate,
          links: [
            {
              url: 'https://juniper.example',
              used: true,
              readStatus: 'read',
              counts: { photos: 1, reviews: 1, contacts: 1 }
            }
          ]
        })
      )
      for (const unit of ['photos', 'reviews', 'contacts']) {
        const key = namespace === 'tracy-add-site' ? `own_links_read_${unit}_one` : `links.read.${unit}.one`
        const expected = dictionary[key].replaceAll('{count}', '1')
        assert.ok(html.includes(expected), `${locale}: ${html}`)
      }
    }
  }
})
