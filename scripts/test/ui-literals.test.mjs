/**
 * `bareLiterals` (`scripts/lib/ui-literals.mjs`, tickets #740 and #754): English a reader would
 * meet, written straight into JSX or into an error message instead of through `t()`, is found;
 * translated text, symbols, codes and attributes nobody reads are not.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bareLiterals, isSentence } from '../lib/ui-literals.mjs'

test('JSX text and read attributes with words are found', () => {
  const found = bareLiterals(
    'x.tsx',
    `const A = () => (<div title="Close panel"><span>Save changes</span><input placeholder="Search…" /></div>)`
  )
  assert.deepEqual(
    found.map((f) => [f.kind, f.text]),
    [
      ['title', 'Close panel'],
      ['text', 'Save changes'],
      ['placeholder', 'Search…']
    ]
  )
})

test('t() calls, symbols, numbers and unread attributes pass', () => {
  const found = bareLiterals(
    'x.tsx',
    `const A = ({ t }) => (<div className="row-wide" data-block="result" title={t('close')}><span>{t('save')}</span> · 2 <b>x</b></div>)`
  )
  assert.deepEqual(found, [])
})

test('a plain string in a JSX expression container counts like JSX text or a read attribute (#754)', () => {
  const found = bareLiterals(
    'x.tsx',
    "const A = () => (<div title={'Close'} aria-label={`Close panel`}><span>{'Save'}</span><>{`Go back`}</></div>)"
  )
  assert.deepEqual(
    found.map((f) => [f.kind, f.text, f.rule]),
    [
      ['title', 'Close', 'jsx'],
      ['aria-label', 'Close panel', 'jsx'],
      ['text', 'Save', 'jsx'],
      ['text', 'Go back', 'jsx']
    ]
  )
})

test('expression containers holding code, symbols or unread attributes pass', () => {
  const found = bareLiterals(
    'x.tsx',
    "const A = ({ t, n }) => (<div className={'row-wide'} title={t('close')} aria-label={`${n}`}><span>{n}</span>{' · '}{`${n} px`}</div>)"
  )
  assert.deepEqual(found, [])
})

test('an English sentence handed to a message property, new Error or setError is found in .ts (#754)', () => {
  const found = bareLiterals(
    'api.ts',
    [
      "const a = { message: 'The site could not be reached. Try again.' }",
      'const b = { error: `Upload failed for ${name}, try again.` }',
      "const c = { 'title': 'Your changes are saved.' }",
      "state.hint = 'Pick a page before you comment.'",
      "throw new Error('The template list could not load.')",
      "setError('Something went wrong on our side.')",
      "store.setError('Your session has expired, sign in again!')"
    ].join('\n')
  )
  assert.deepEqual(
    found.map((f) => [f.line, f.kind, f.rule]),
    [
      [1, 'message', 'sentence'],
      [2, 'error', 'sentence'],
      [3, 'title', 'sentence'],
      [4, 'hint', 'sentence'],
      [5, 'new Error', 'sentence'],
      [6, 'setError', 'sentence'],
      [7, 'setError', 'sentence']
    ]
  )
})

test('the sentence rule also reads .mjs and the non-JSX parts of .tsx', () => {
  assert.equal(bareLiterals('a.mjs', "throw new Error('The page could not be saved.')").length, 1)
  assert.equal(
    bareLiterals('a.tsx', "const A = () => { setError('The page could not be saved.'); return <b /> }")
      .length,
    1
  )
})

test('the sentence rule stays quiet on codes, keys, short labels, other sinks and strings.ts', () => {
  const code = [
    "const a = { message: 'site.unreachable' }",
    "const b = { error: 'HTTP 500' }",
    "const c = { label: 'Save changes' }",
    'throw new Error(`fetch ${url} failed`)',
    "const d = { body: 'The site could not be reached. Try again.' }",
    "console.log('The site could not be reached. Try again.')",
    "throw new TypeError('A value of the wrong kind arrived here.')"
  ].join('\n')
  assert.deepEqual(bareLiterals('api.ts', code), [])
  assert.deepEqual(
    bareLiterals(
      'packages/ui/x/src/client/strings.ts',
      "export const en = { message: 'The site could not be reached. Try again.' }"
    ),
    []
  )
})

test('isSentence wants a capital, three words and closing punctuation', () => {
  assert.equal(isSentence('Try again later.'), true)
  assert.equal(isSentence('Loading the preview…'), true)
  assert.equal(isSentence('Are you sure?'), true)
  assert.equal(isSentence('try again later.'), false)
  assert.equal(isSentence('Try again.'), false)
  assert.equal(isSentence('Try again later'), false)
})
