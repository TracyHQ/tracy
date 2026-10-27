/**
 * The keep-verbatim rule binds all seven translated languages (05/10/2026), with the
 * eighteen terms added that day. Fixtures pin the decision; the last case pins the shipped
 * catalogues.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { KEEP_VERBATIM_TERMS } from '../../packages/locale/tracy-locale-vi/terms.ts'
import { lostTerms } from '../lib/kept-terms.ts'
import { allLostTerms } from '../check-kept-terms.ts'

test('the list holds the eighteen terms added on 05/10/2026', () => {
  for (const term of [
    'folder',
    'upload',
    'download',
    'sandbox',
    'backup',
    'restore',
    'tab',
    'admin',
    'chat',
    'template',
    'email',
    'theme',
    'preview',
    'log',
    'link',
    'prompt',
    'terminal',
    'domain'
  ]) {
    assert.ok(KEEP_VERBATIM_TERMS.includes(term), term)
  }
})

test('the words the PO kept translated stay off the list', () => {
  for (const term of ['account', 'password', 'page', 'post', 'draft', 'publish', 'menu', 'media']) {
    assert.ok(!KEEP_VERBATIM_TERMS.includes(term), term)
  }
})

test('a German translation that writes Datei for file loses the term', () => {
  const lost = lostTerms('de', 'x', { a: 'Upload a file' }, { a: 'Eine Datei hochladen' })
  assert.deepEqual(lost.map((l) => l.term).sort(), ['file', 'upload'])
})

test('a German translation that keeps the terms, capitalised, passes', () => {
  assert.deepEqual(lostTerms('de', 'x', { a: 'Upload a file' }, { a: 'Ein File per Upload senden' }), [])
})

test('a Chinese translation keeps the term between Chinese characters', () => {
  assert.deepEqual(lostTerms('zh', 'x', { a: 'Open this site' }, { a: '打开这个 site' }), [])
  assert.deepEqual(lostTerms('zh', 'x', { a: 'Open this site' }, { a: '打开这个site' }), [])
})

test("a key the translation lacks is not this gate's problem", () => {
  assert.deepEqual(lostTerms('fr', 'x', { a: 'Open the file' }, {}), [])
})

test('every shipped catalogue keeps every listed term', () => {
  const lost = allLostTerms()
  assert.equal(
    lost.length,
    0,
    lost
      .slice(0, 20)
      .map((l) => `${l.lang} ${l.ns}.${l.key}: "${l.term}"`)
      .join('\n')
  )
})

test('a placeholder named like a term does not count as keeping the term', () => {
  const lost = lostTerms(
    'nl',
    'x',
    { a: 'The theme {theme} is missing' },
    { a: 'Het thema {theme} ontbreekt' }
  )
  assert.deepEqual(
    lost.map((l) => l.term),
    ['theme']
  )
})
