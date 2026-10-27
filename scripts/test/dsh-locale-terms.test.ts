/**
 * The keep-verbatim rule of the Vietnamese catalogue, as the `dsh-locale` gate decides it (#797,
 * F-S2-009 and F-S2-010).
 *
 * The contract is one sentence in three places (`terms.ts`, `docs/references/i18n.md` §5,
 * `vocabulary.md` §6): an English source that holds a listed term has that term in its `vi`
 * translation. The gate only ever looked at terms when a value EQUALLED its source, so a sentence
 * that translated the term away passed. These cases pin the rule the documents state, on fixtures
 * and on the catalogue that ships.
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { hasTerm, KEEP_VERBATIM_TERMS } from '../../packages/locale/tracy-locale-vi/terms.ts'
import {
  checkedCount,
  droppedTerms,
  keepsAnyTerm,
  namespaceProblems,
  placeholders
} from '../lib/dsh-locale-terms.ts'
import { OWNED } from '../lib/tracy-owned-namespaces.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const VI = join(ROOT, 'packages/locale/tracy-locale-vi/vi')

test('a translation that keeps one term and loses another is a problem', () => {
  const source = { a: 'Open the files of this site' }
  // "site" survives, "file" became "tệp": the case the old "any term" test let through.
  const problems = namespaceProblems('ns', source, { a: 'Mở các tệp của site này' })
  assert.equal(problems.length, 1, problems.join('\n'))
  assert.match(problems[0], /^ {2}ns\.a: lost keep-verbatim term "file"/)
  assert.deepEqual(namespaceProblems('ns', source, { a: 'Mở các file của site này' }), [])
})

test('every dropped term is named, one line each', () => {
  const problems = namespaceProblems(
    'ns',
    { a: 'This session edits files in the workspace' },
    { a: 'Phiên này sửa tệp trong không gian làm việc' }
  )
  assert.deepEqual(
    problems.map((line) => /"(\w+)"/.exec(line)?.[1]),
    ['file', 'session', 'workspace']
  )
})

test('the boundary and the English plural are the ones `hasTerm` already had', () => {
  // A plural in the source is kept by the singular, and the reverse.
  assert.deepEqual(droppedTerms('Your sites', 'Site của bạn'), [])
  assert.deepEqual(droppedTerms('Your site', 'Các sites của bạn'), [])
  // A longer word is not the term: "deployment" does not demand "deploy", "website" is not "site".
  assert.deepEqual(droppedTerms('The deployment finished', 'Bản triển khai đã xong'), [])
  assert.deepEqual(droppedTerms('Open the site', 'Mở website'), ['site'])
  // Case does not matter; the term inside another word does not count as kept.
  assert.deepEqual(droppedTerms('API token', 'Token api'), [])
  assert.deepEqual(droppedTerms('The model answered', 'Đã có remodel'), ['model'])
  // A source without a term asks for nothing.
  assert.deepEqual(droppedTerms('Save changes', 'Lưu thay đổi'), [])
})

test('the checks the gate already made are still made', () => {
  const source = { kept: 'Save', gone: 'Close', count: '{n} of {total}', same: 'Cancel', term: 'Plugin' }
  const translated = { kept: 'Lưu', extra: 'Thừa', count: '{n} trên {tong}', same: 'Cancel', term: 'Plugin' }
  assert.deepEqual(namespaceProblems('ns', source, translated), [
    '  ns.gone: missing translation',
    '  ns.extra: extra key, the owning plugin has none',
    '  ns.count: placeholder mismatch — en {n,total} vs vi {n,tong}',
    '  ns.same: still verbatim English'
  ])
  // A recorded decision may equal its source; a value that is only a term may too.
  assert.deepEqual(namespaceProblems('ns', { same: 'Cancel' }, { same: 'Cancel' }, new Set(['ns.same'])), [])
  assert.equal(keepsAnyTerm('Plugin'), true)
  assert.equal(keepsAnyTerm('Cancel'), false)
  assert.deepEqual(placeholders('{b} then {a} then {b}'), ['a', 'b', 'b'])
  assert.equal(checkedCount(source, translated), 4)
})

test('a catalogue that is not a flat dictionary of strings is reported, not read as empty', () => {
  for (const broken of [null, [], 'text', 3]) {
    assert.deepEqual(namespaceProblems('ns', { a: 'Save' }, broken), [
      '  ns: the translation is not a key → string dictionary'
    ])
    assert.equal(checkedCount({ a: 'Save' }, broken), 0)
  }
  assert.deepEqual(namespaceProblems('ns', { a: 'Save', b: 'Open' }, { a: { nested: 'Lưu' }, b: 7 }), [
    '  ns.a: value is not a string',
    '  ns.b: value is not a string'
  ])
})

test('the term list is a parameter: a caller passes its own list, or none', () => {
  const source = { a: 'Open the workspace' }
  assert.deepEqual(namespaceProblems('ns', source, { a: 'Arbeitsbereich öffnen' }, new Set(), []), [])
  assert.equal(namespaceProblems('ns', source, { a: 'Mở không gian làm việc' }).length, 1)
})

test('there is one term list, and the gate reads it through the tested module', () => {
  assert.equal(
    existsSync(join(ROOT, 'packages/locale/tracy-i18n/src/terms.ts')),
    false,
    'the second list is gone'
  )
  const gate = readFileSync(join(ROOT, 'scripts/check-dsh-locale.ts'), 'utf8')
  assert.match(gate, /from '\.\/lib\/dsh-locale-terms\.ts'/)
  assert.match(gate, /namespaceProblems\(ns, source, translated, KEPT_VERBATIM\)/)
  assert.ok(KEEP_VERBATIM_TERMS.includes('site') && KEEP_VERBATIM_TERMS.includes('file'))
  assert.equal(hasTerm('sites', 'site'), true)
})

test('the Vietnamese catalogue that ships keeps every term of its sources', () => {
  const files = readdirSync(VI).filter((file) => file.endsWith('.json'))
  assert.deepEqual(files.map((file) => file.slice(0, -5)).sort(), Object.keys(OWNED).sort())
  const dropped: string[] = []
  for (const [ns, source] of Object.entries(OWNED)) {
    const translated = JSON.parse(readFileSync(join(VI, `${ns}.json`), 'utf8')) as Record<string, string>
    for (const [key, english] of Object.entries(source)) {
      for (const term of droppedTerms(english, translated[key] ?? '')) dropped.push(`${ns}.${key}: ${term}`)
    }
  }
  assert.deepEqual(dropped, [])
})

test('restore.forbiddenBody names the two roles as every other language does', () => {
  // ADR 0028: role names are translated, so each language names Owner and Editor in its own words.
  const ROLE_NAMES: Record<string, [RegExp, RegExp]> = {
    de: [/Eigentümer/, /Bearbeiter/],
    it: [/Proprietario/, /Editor/],
    fr: [/Propriétaire/, /Éditeur/],
    nl: [/Eigenaar/, /Bewerker/],
    zh: [/所有者/, /编辑者/],
    es: [/Propietario/, /Editor/]
  }
  const vi = JSON.parse(readFileSync(join(VI, 'tracy-site-tabs.json'), 'utf8')) as Record<string, string>
  const english = OWNED['tracy-site-tabs']['restore.forbiddenBody']
  assert.match(english, /owner or an editor/i)
  assert.match(vi['restore.forbiddenBody'], /Chủ sở hữu/)
  assert.match(vi['restore.forbiddenBody'], /Người chỉnh sửa/)
  assert.deepEqual(placeholders(vi['restore.forbiddenBody']), placeholders(english))
  for (const [lang, [owner, editor]] of Object.entries(ROLE_NAMES)) {
    const other = JSON.parse(
      readFileSync(join(ROOT, `packages/locale/tracy-locales/${lang}/tracy-site-tabs.json`), 'utf8')
    )
    assert.match(other['restore.forbiddenBody'], owner, lang)
    assert.match(other['restore.forbiddenBody'], editor, lang)
  }
})
