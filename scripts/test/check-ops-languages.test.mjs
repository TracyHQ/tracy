/**
 * `opsLanguageProblems` — the pure decision of gate `ops-languages` (the /ops SPA's dictionaries,
 * plan `tasks/todo-ops-i18n.md` D2), on fixtures, plus one run of the gate over the real tree.
 *
 *   node --test scripts/test/check-ops-languages.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { canonicalJson, fingerprintText, opsLanguageProblems } from '../lib/ops-dictionaries.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const LANGUAGES = ['en', 'de', 'fr']
const en = {
  'demo.hello': 'Hello {name}',
  'demo.files_one': '{count} file',
  'demo.files_other': '{count} files'
}
const good = {
  de: { 'demo.hello': 'Hallo {name}', 'demo.files_one': '{count} File', 'demo.files_other': '{count} Files' },
  fr: {
    'demo.hello': 'Bonjour {name}',
    'demo.files_one': '{count} file',
    'demo.files_other': '{count} files'
  }
}

/** A tree with one namespace `demo` owning `Demo.tsx`; each override replaces one part. */
function tree(over = {}) {
  const locales = over.locales ?? {
    de: { demo: canonicalJson(good.de) },
    fr: { demo: canonicalJson(good.fr) }
  }
  return {
    languages: LANGUAGES,
    namespaces: over.namespaces ?? [{ file: 'demo.ts', NS: 'demo', SCREENS: ['Demo.tsx'], en }],
    locales,
    fingerprints: over.fingerprints ?? { demo: fingerprintText(en) },
    screens: over.screens ?? {
      'Demo.tsx': "export const Demo = ({ t }) => <p title={t('demo.hello')}>{t('demo.hello')}</p>\n"
    }
  }
}
const problemsOf = (over) => opsLanguageProblems(tree(over))
const withLocale = (lang, dict) => ({
  locales: { ...tree().locales, [lang]: { demo: typeof dict === 'string' ? dict : canonicalJson(dict) } }
})

test('a complete, translated, fingerprinted, literal-free namespace is green', () => {
  assert.deepEqual(problemsOf(), [])
})

test('a missing translation file, a missing key and an extra key are red', () => {
  assert.match(
    problemsOf({ locales: { de: { demo: canonicalJson(good.de) }, fr: {} } }).join('\n'),
    /fr\/demo\.json: missing/
  )
  const { 'demo.hello': _dropped, ...noHello } = good.de
  assert.match(problemsOf(withLocale('de', noHello)).join('\n'), /de\/demo\.json: missing key "demo\.hello"/)
  assert.match(
    problemsOf(withLocale('de', { ...good.de, 'demo.old': 'Alt' })).join('\n'),
    /extra key "demo\.old"/
  )
})

test('an empty value and the untranslated sentinel are red', () => {
  assert.match(
    problemsOf(withLocale('de', { ...good.de, 'demo.hello': ' ' })).join('\n'),
    /"demo\.hello" is empty/
  )
  assert.match(
    problemsOf(withLocale('de', { ...good.de, 'demo.hello': '[to be translated]' })).join('\n'),
    /"demo\.hello" is still \[to be translated\]/
  )
})

test('a placeholder set that differs from English is red', () => {
  const problems = problemsOf(withLocale('de', { ...good.de, 'demo.hello': 'Hallo {nom}' }))
  assert.match(problems.join('\n'), /"demo\.hello" has placeholders \{nom\}, English has \{name\}/)
})

test('markup tags for <Trans> that differ from English are red', () => {
  const tagged = { ...en, 'demo.link': 'Read <a>the guide</a>' }
  const problems = problemsOf({
    namespaces: [{ file: 'demo.ts', NS: 'demo', SCREENS: ['Demo.tsx'], en: tagged }],
    fingerprints: { demo: fingerprintText(tagged) },
    locales: {
      de: { demo: canonicalJson({ ...good.de, 'demo.link': 'Lies <b>die Anleitung</b>' }) },
      fr: { demo: canonicalJson({ ...good.fr, 'demo.link': 'Lisez <a>le guide</a>' }) }
    }
  })
  assert.deepEqual(problems, ['locales/de/demo.json: "demo.link" has tags <b>, English has <a>'])
})

test('an em dash in a translation is red', () => {
  assert.match(
    problemsOf(withLocale('fr', { ...good.fr, 'demo.hello': 'Bonjour — {name}' })).join('\n'),
    /fr\/demo\.json: "demo\.hello" contains an em dash/
  )
})

test('a kept English term the translation dropped is red', () => {
  const problems = problemsOf(withLocale('de', { ...good.de, 'demo.files_other': '{count} Dateien' }))
  assert.match(problems.join('\n'), /de\/demo\.json: "demo\.files_other" dropped the kept term "file"/)
})

test('a file that is not canonical JSON is red', () => {
  assert.match(problemsOf(withLocale('de', JSON.stringify(good.de))).join('\n'), /not canonical/)
  assert.match(problemsOf(withLocale('de', '{ nope')).join('\n'), /not valid JSON/)
})

test('an English string changed since its translations were made is red until --accept-sources', () => {
  const reworded = { ...en, 'demo.hello': 'Hi {name}' }
  const problems = problemsOf({
    namespaces: [{ file: 'demo.ts', NS: 'demo', SCREENS: ['Demo.tsx'], en: reworded }]
  })
  assert.match(problems.join('\n'), /demo\.hello: the English changed since it was translated/)
  assert.match(problemsOf({ fingerprints: {} }).join('\n'), /demo: no fingerprints/)
  const added = { ...en, 'demo.new': 'New words' }
  const unrecorded = problemsOf({
    namespaces: [{ file: 'demo.ts', NS: 'demo', SCREENS: ['Demo.tsx'], en: added }],
    locales: {
      de: { demo: canonicalJson({ ...good.de, 'demo.new': 'Neue Wörter' }) },
      fr: { demo: canonicalJson({ ...good.fr, 'demo.new': 'Nouveaux mots' }) }
    }
  })
  assert.match(unrecorded.join('\n'), /demo\.new: new English source/)
})

test('a bare English literal in a file the namespace owns is red', () => {
  const problems = problemsOf({
    screens: { 'Demo.tsx': 'export const Demo = () => <button aria-label="Close">Save</button>\n' }
  })
  assert.match(problems.join('\n'), /Demo\.tsx:1: English aria-label "Close"/)
  assert.match(problems.join('\n'), /Demo\.tsx:1: English text "Save"/)
})

test('a listed screen that does not exist, or one two namespaces claim, is red', () => {
  assert.match(problemsOf({ screens: {} }).join('\n'), /demo: SCREENS names Demo\.tsx, which does not exist/)
  const twice = problemsOf({
    namespaces: [
      { file: 'demo.ts', NS: 'demo', SCREENS: ['Demo.tsx'], en },
      { file: 'other.ts', NS: 'other', SCREENS: ['Demo.tsx'], en: {} }
    ],
    fingerprints: { demo: fingerprintText(en), other: fingerprintText({}) },
    locales: {
      de: { demo: canonicalJson(good.de), other: canonicalJson({}) },
      fr: { demo: canonicalJson(good.fr), other: canonicalJson({}) }
    }
  })
  assert.match(twice.join('\n'), /Demo\.tsx is claimed by demo and other/)
})

test('a namespace file whose NS, keys or SCREENS break the contract is red', () => {
  const broken = problemsOf({
    namespaces: [{ file: 'demo.ts', NS: 'dem', SCREENS: 'Demo.tsx', en: { ...en, 'other.key': 'Words' } }]
  })
  const text = broken.join('\n')
  assert.match(text, /demo\.ts: NS is "dem", the file is demo/)
  assert.match(text, /demo\.ts: SCREENS is not a list of file paths/)
  assert.match(text, /demo\.ts: key "other\.key" does not start with "demo\."/)
})

test('a locale folder for a language outside the interface languages is red', () => {
  const problems = problemsOf({ locales: { ...tree().locales, ja: { demo: canonicalJson(good.de) } } })
  assert.match(problems.join('\n'), /locales\/ja: not an interface language/)
})

test('the gate is green on the repository as it stands', () => {
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-ops-languages.ts'], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  assert.equal(run.status, 0, run.stderr || run.stdout)
})
