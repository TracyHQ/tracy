import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { loadShippedTranslations } from '../src/shipped-translations.mjs'

/** A data directory with one contract and one language, shaped like `dist/data`. */
function fixture(root) {
  const id = 'tracy-business/j6/1.1.0'
  mkdirSync(path.join(root, 'quickstart-contracts', id), { recursive: true })
  mkdirSync(path.join(root, 'quickstart-translations', id), { recursive: true })
  writeFileSync(
    path.join(root, 'quickstart-contracts', id, 'content-map.json'),
    JSON.stringify({
      slots: [
        { key: 'module-1.0', type: 'text', sample: 'Request a quote', maxCharacters: 50 },
        { key: 'module-1.1', type: 'url', sample: '/contact', maxCharacters: 2048 },
        { key: 'module-2.0', type: 'text', sample: '', maxCharacters: 40 },
        { key: 'module-3.0', type: 'text', sample: 'Office', maxCharacters: 40 }
      ]
    })
  )
  writeFileSync(
    path.join(root, 'quickstart-translations', id, 'de-DE.json'),
    JSON.stringify({ 'module-1.0': 'Angebot anfordern', 'module-1.1': '/kontakt', 'module-3.0': 'Büro' })
  )
  return id
}

test('shipped translations are keyed the way the planner looks them up', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'shipped-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const id = fixture(root)
  const map = loadShippedTranslations(root, id, 'de-DE')
  // locale : maxCharacters : source — the planner's exact key, built from the content map
  assert.equal(map.get('de-DE:50:Request a quote'), 'Angebot anfordern')
  assert.equal(map.get('de-DE:40:Office'), 'Büro')
  // a url slot is not text and never enters the cache, translated or not
  assert.equal(map.has('de-DE:2048:/contact'), false)
  // an empty source has nothing to key on
  assert.equal(map.has('de-DE:40:'), false)
  assert.equal(map.size, 2)
})

test('a quickstart that ships no translations yields an empty map, not an error', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'shipped-none-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const id = fixture(root)
  assert.equal(loadShippedTranslations(root, id, 'fr-FR').size, 0, 'a language with no file')
  assert.equal(
    loadShippedTranslations(root, 'tracy-apple/j6/1.2.0', 'de-DE').size,
    0,
    'a contract with no directory'
  )
  assert.equal(loadShippedTranslations(root, '', 'de-DE').size, 0, 'no contract id at all')
  assert.equal(loadShippedTranslations(undefined, id, 'de-DE').size, 0, 'no data dir')
})

test('a broken file is ignored rather than stopping the language', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'shipped-bad-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const id = fixture(root)
  writeFileSync(path.join(root, 'quickstart-translations', id, 'de-DE.json'), '{ not json')
  assert.equal(loadShippedTranslations(root, id, 'de-DE').size, 0)
})
