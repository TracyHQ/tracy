/**
 * `webLanguageProblems` — the pure decision of gate `web-languages` (#753), on fixtures, plus one
 * run against the real dictionaries so a red tree is caught here too.
 *
 *   node --test scripts/test/check-web-languages.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { canonicalText, placeholdersOf, webLanguageProblems } from '../check-web-languages.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const en = { 'a.greeting': 'Hello {name}', 'b.plain': 'Plain' }
const good = { 'a.greeting': 'Hallo {name}', 'b.plain': 'Schlicht' }
const languages = ['en', 'de']

const run = (dict, extra = {}) =>
  webLanguageProblems({
    en,
    languages,
    files: { de: typeof dict === 'string' ? dict : canonicalText(dict) },
    ...extra
  })

test('a complete, canonical translation is green', () => {
  assert.deepEqual(run(good), [])
})

test('placeholdersOf keeps duplicates and ignores order', () => {
  assert.deepEqual(placeholdersOf('{b} and {a} and {b}'), ['a', 'b', 'b'])
})

test('a missing file is red and says how many keys it owes', () => {
  const problems = webLanguageProblems({ en, languages, files: {} })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /locales\/de\.json: missing \(2 keys/)
})

test('a missing key is red and quotes the English text', () => {
  const problems = run({ 'a.greeting': 'Hallo {name}' })
  assert.deepEqual(problems, ['locales/de.json: missing key "b.plain" (English: "Plain")'])
})

test('an empty translation is red', () => {
  assert.match(run({ ...good, 'b.plain': '  ' })[0], /"b\.plain" is empty/)
})

test('a dropped or renamed placeholder is red', () => {
  assert.match(run({ ...good, 'a.greeting': 'Hallo' })[0], /placeholders \{\}, English has \{name\}/)
  assert.match(run({ ...good, 'a.greeting': 'Hallo {nom}' })[0], /placeholders \{nom\}, English has \{name\}/)
})

test('an extra key is red', () => {
  assert.match(run({ ...good, 'c.gone': 'Weg' })[0], /extra key "c\.gone"/)
})

test('an em dash in a translation is red', () => {
  assert.match(run({ ...good, 'b.plain': 'Schlicht — klar' })[0], /em dash/)
})

test('unsorted keys or another layout are red', () => {
  const unsorted = `{\n  "b.plain": "Schlicht",\n  "a.greeting": "Hallo {name}"\n}\n`
  assert.match(run(unsorted)[0], /not canonical/)
  assert.match(run(JSON.stringify(good))[0], /not canonical/)
})

test('invalid JSON is red, not a crash', () => {
  assert.match(run('{ nope')[0], /not valid JSON/)
})

test('tracy-web language list drifting from the interface languages is red', () => {
  const problems = run(good, { webLanguages: ['en'] })
  assert.match(problems[0], /WEB_LANGUAGES .* is \[en\], the shown interface languages are \[en,de\]/)
  assert.deepEqual(run(good, { webLanguages: ['en', 'de'] }), [])
})

test('the real dictionaries pass the gate', () => {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts/check-web-languages.mjs')], {
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /strings complete in 7 languages/)
})

test('a translation left as the English text is red, unless it is allow-listed', () => {
  // `mail.n.person` is kept everywhere; a role name is translated since ADR 0028 §7.
  const en = {
    'a.key': 'Hello',
    'mail.n.person': '{name}',
    'mail.website': 'Website:',
    'role.editor': 'Editor'
  }
  const file = (dict) => `${JSON.stringify(dict, null, 2)}\n`
  const problems = webLanguageProblems({
    en,
    languages: ['en', 'fr', 'vi'],
    files: {
      fr: file({
        'a.key': 'Hello',
        'mail.n.person': '{name}',
        'mail.website': 'Website:',
        'role.editor': 'Éditeur'
      }),
      vi: file({
        'a.key': 'Xin chào',
        'mail.n.person': '{name}',
        'mail.website': 'Website:',
        'role.editor': 'Editor'
      })
    }
  })
  assert.deepEqual(
    problems
      .filter((p) => /still the English/.test(p))
      .map((p) => p.split(':')[0] + ' ' + p.match(/"([^"]+)"/)[1]),
    ['locales/fr.json a.key', 'locales/fr.json mail.website', 'locales/vi.json role.editor']
  )
})
