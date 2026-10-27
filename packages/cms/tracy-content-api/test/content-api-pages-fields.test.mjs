// `view=pages` and `fields=`: the two answers the relay writes from a Claude Cowork plugin's ordinary listing
// and envelope (apps/tracy-web/src/sites/content-pages.js, content-fields.js). The schema is the
// contract a reader of those answers relies on, so it is tested here, on literal documents.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateChanges, validateContent, validatePages, PAGES_SCHEMA_VERSION } from '../validate.mjs'

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

const pages = {
  schemaVersion: 'tracy-content-pages/v1',
  site: {
    id: 's-1',
    name: 'Lantern',
    url: 'https://lantern.example',
    defaultLocale: 'en-GB',
    locales: ['en-GB']
  },
  pages: [
    {
      id: 'c-about',
      type: 'page',
      title: 'About us',
      url: 'https://lantern.example/about-us',
      path: '/about-us',
      locale: 'en-GB',
      translationGroupId: null,
      status: 'published'
    }
  ],
  truncated: false
}

test('a pages document with its site, rows and truncation flag is valid', () => {
  assert.equal(PAGES_SCHEMA_VERSION, 'tracy-content-pages/v1')
  assert.deepEqual(validatePages(pages), [])
  // validateContent answers for every document the relay returns, pages included.
  assert.deepEqual(validateContent(pages), [])
})

test('a pages row without an address, or a document that hides truncation, is refused', () => {
  const noUrl = { ...pages, pages: [{ ...pages.pages[0], url: null }] }
  assert.ok(validatePages(noUrl).length > 0)
  const { truncated: _, ...silent } = pages
  assert.ok(validatePages(silent).length > 0)
  const dup = { ...pages, pages: [pages.pages[0], pages.pages[0]] }
  assert.ok(
    validatePages(dup).some(
      (error) => error.code === 'CONTENT_DUPLICATE_ID' || /duplicate/i.test(error.message)
    )
  )
})

test('a projected envelope keeps its envelope and needs only the id of each content', () => {
  const envelope = fixture('joomla.json')
  const projected = {
    ...envelope,
    projection: ['title'],
    contents: envelope.contents.map((row) => ({ id: row.id, title: row.title }))
  }
  assert.deepEqual(validateContent(projected), [])
  const lost = { ...projected, contents: [{ title: 'no id' }] }
  assert.ok(validateContent(lost).length > 0)
  // Without `projection`, the same trimmed rows are an incomplete envelope, as before.
  const { projection: _, ...unmarked } = projected
  assert.ok(validateContent(unmarked).length > 0)
})

test('notModified carries the version and nothing else', () => {
  const notModified = {
    schemaVersion: 'tracy-content/v1',
    notModified: true,
    version: 'cv1.' + 'a'.repeat(32)
  }
  assert.deepEqual(validateContent(notModified), [])
  assert.ok(validateContent({ ...notModified, contents: [] }).length > 0)
  const { version: _, ...bare } = notModified
  assert.ok(validateContent(bare).length > 0)
})

test('a changes document names what moved and what is gone, never both for one id', () => {
  const row = {
    id: 'c-about',
    type: 'page',
    title: 'About',
    url: 'https://lantern.example/about',
    locale: 'en-GB',
    revision: 'r2',
    updatedAt: null
  }
  const changes = {
    schemaVersion: 'tracy-content-changes/v1',
    site: pages.site,
    since: 'cv1.' + 'a'.repeat(32),
    version: 'cv1.' + 'b'.repeat(32),
    changed: [row],
    removed: ['c-old'],
    truncated: false
  }
  assert.deepEqual(validateChanges(changes), [])
  assert.deepEqual(validateContent(changes), [])
  assert.ok(validateChanges({ ...changes, removed: ['c-about'] }).length > 0)
})

test('lockedBy on a content is null or who holds it', () => {
  const envelope = fixture('joomla.json')
  const held = { kind: 'admin-user', name: 'Anna', since: '2026-09-26T10:00:00Z', until: null }
  const withLock = {
    ...envelope,
    contents: envelope.contents.map((row, i) => ({ ...row, lockedBy: i === 0 ? held : null }))
  }
  assert.deepEqual(validateContent(withLock), [])
  const bad = {
    ...envelope,
    contents: envelope.contents.map((row) => ({ ...row, lockedBy: { kind: 'someone' } }))
  }
  assert.ok(validateContent(bad).length > 0)
})

test('native names the CMS records a content is written through, by id or by key', () => {
  const envelope = fixture('joomla.json')
  const native = [
    [
      { kind: 'menuItem', id: 101 },
      { kind: 'article', id: 7 }
    ],
    [{ kind: 'templatePart', key: 'header' }],
    [{ kind: 'posts', id: '01J9ZQ3K7Y' }],
    []
  ]
  const withNative = {
    ...envelope,
    contents: envelope.contents.map((row, i) => ({ ...row, native: native[i % 4] }))
  }
  assert.deepEqual(validateContent(withNative), [])
  assert.deepEqual(validatePages({ ...pages, pages: [{ ...pages.pages[0], native: native[0] }] }), [])
  for (const bad of [{ kind: 'article' }, { id: 7 }, { kind: '', id: 7 }, 'article:7'])
    assert.ok(
      validateContent({ ...envelope, contents: envelope.contents.map((row) => ({ ...row, native: [bad] })) })
        .length > 0,
      JSON.stringify(bad)
    )
})
