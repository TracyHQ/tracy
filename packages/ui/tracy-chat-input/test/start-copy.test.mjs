/**
 * The empty chat's title and input hint are declared per kind of start, not drawn from one fixed pair
 * (TracyHQ/tracy#613). Today one kind declares its own: the build chat. Every other workspace keeps
 * the words it already had.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { COMPOSER_CSS } from '../src/client/composer-styles.ts'
import { START_COPY, startCopyOf, startKindOf } from '../src/client/start-copy.ts'
import { en } from '../src/client/strings.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const locales = path.resolve(here, '..', '..', '..', 'locale')
const BUILD_SESSION = 'session-build-0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const LANGUAGES = [
  ['vi', path.join(locales, 'tracy-locale-vi', 'vi')],
  ...['de', 'es', 'fr', 'it', 'nl', 'zh'].map((l) => [l, path.join(locales, 'tracy-locales', l)])
]

test('the build chat page is the one kind that declares its own start words', () => {
  assert.equal(startKindOf(`/new/s/${BUILD_SESSION}`), 'build')
  assert.equal(startKindOf(`/new/s/${BUILD_SESSION}/`), 'build')
})

test('every other page has no kind, so it keeps the words it had', () => {
  for (const pathname of [
    '/new/',
    '/new/build',
    '/new/s/session-0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    '/site/acme/',
    '/site/acme/s/session-0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    '/',
    ''
  ])
    assert.equal(startKindOf(pathname), null, pathname)
  assert.equal(startKindOf(undefined), null)
  assert.equal(startCopyOf(null), null)
})

test('the build chat says what to do here', () => {
  const copy = startCopyOf('build')
  assert.deepEqual(copy, { title: 'start.build.title', placeholder: 'start.build.placeholder' })
  assert.equal(en['start.build.title'], 'Tell me about your business')
  assert.equal(en['start.build.placeholder'], 'Describe your business or paste a link to it')
  for (const kind of Object.keys(START_COPY))
    for (const key of Object.values(START_COPY[kind])) assert.ok(key in en, `${kind} names ${key}`)
})

test('the site and creation words are untouched', () => {
  assert.equal(en['start.title'], 'Your website, changed just by asking')
  assert.equal(en['start.site.title'], 'Your site, ready to edit')
  assert.equal(en['start.site.titleViewer'], 'What would you like to know today?')
  assert.equal(en['start.site.placeholderViewer'], 'Ask about this site')
})

test('all seven languages carry both strings, keep link, and use no dash', () => {
  for (const [language, dir] of LANGUAGES) {
    const table = JSON.parse(readFileSync(path.join(dir, 'tracy-chat-input.json'), 'utf8'))
    for (const key of ['start.build.title', 'start.build.placeholder']) {
      assert.equal(typeof table[key], 'string', `${language} ${key}`)
      assert.notEqual(table[key], en[key], `${language} ${key} is translated`)
      assert.doesNotMatch(table[key], /[—–]/, `${language} ${key}`)
    }
    assert.match(table['start.build.placeholder'], /\blink\b/i, `${language} keeps the word link`)
  }
  const vi = JSON.parse(readFileSync(path.join(LANGUAGES[0][1], 'tracy-chat-input.json'), 'utf8'))
  assert.match(vi['start.build.title'], /\bmình\b/, 'the agent speaks as mình')
  assert.match(vi['start.build.title'], /\bbạn\b/, 'the owner is bạn')
})

test('the hint of a declared kind is drawn from a custom property, on the hero card only', () => {
  assert.match(COMPOSER_CSS, /data-tracy-copy="build"/)
  assert.match(COMPOSER_CSS, /content: var\(--tc-start-hint-build, none\)/)
  // A site or creation hero carries no mark, so no rule of the kind reaches it.
  for (const line of COMPOSER_CSS.split('\n').filter((l) => l.includes('--tc-start-hint-')))
    assert.ok(!line.includes('data-tracy-start="1"'), line)
})
