/**
 * The seven default questions (07/10/2026, TracyHQ/tch#1013): name → logo → favicon → about →
 * pages → languages → tone, the same on WordPress, Joomla and EmDash. The file questions, the page
 * list the server fills in, the logo hint that follows the template, and the cleaned language list.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  CONSUMERS,
  DROPPED_LANGUAGE_OPTIONS,
  FEEDS,
  KINDS,
  logoLayoutOf,
  questionsFor,
  SCHEMA,
  SCHEMA_V2,
  validateQuestions,
  withLogoVariants
} from '../src/questions.mjs'

const standard = (cms) =>
  JSON.parse(readFileSync(new URL(`../../tracy-site-build-${cms}/questions.json`, import.meta.url), 'utf8'))

const doc = (questions, schemaVersion = SCHEMA) => ({
  schemaVersion,
  owner: 'wordpress',
  languages: ['en'],
  questions
})

test('logo and favicon are kinds, and their feeds have readers', () => {
  assert.ok(KINDS.includes('logo') && KINDS.includes('favicon'))
  for (const f of ['site.logo', 'site.favicon', 'site.pages']) {
    assert.ok(FEEDS.includes(f), f)
    assert.ok(CONSUMERS[f], `${f} has a CONSUMERS row`)
  }
  assert.deepEqual(CONSUMERS['site.logo'].kinds, ['logo'])
  assert.deepEqual(CONSUMERS['site.favicon'].kinds, ['favicon'])
  assert.equal(CONSUMERS['site.pages'].options, undefined, 'the pages are the release’s own')
})

test('a file question takes no options', () => {
  const q = { id: 'logo', kind: 'logo', label: { en: 'Logo' }, feeds: ['site.logo'] }
  assert.deepEqual(validateQuestions(doc([q])), [])
  assert.match(validateQuestions(doc([{ ...q, options: ['a'] }])).join('\n'), /no options/)
})

test('a site.pages question may come without options — the server fills them — and is valid once filled', () => {
  const q = { id: 'pages', kind: 'multi', label: { en: 'Pages' }, feeds: ['site.pages'] }
  assert.deepEqual(validateQuestions(doc([q])), [])
  assert.deepEqual(validateQuestions(doc([{ ...q, options: ['home', 'about-us'] }])), [])
  assert.deepEqual(validateQuestions(doc([q], SCHEMA_V2)), [], 'v2 binding rules accept it too')
  // Any other multi still needs its options, and an empty list is still refused.
  assert.match(validateQuestions(doc([{ ...q, feeds: ['agent'] }])).join('\n'), /needs options/)
  assert.match(validateQuestions(doc([{ ...q, options: [] }])).join('\n'), /needs options/)
})

test('variantHints belong to a logo question and name known layouts', () => {
  const q = {
    id: 'logo',
    kind: 'logo',
    label: { en: 'Logo' },
    feeds: ['site.logo'],
    variantHints: { pair: { en: 'Two' }, dark: { en: 'Dark' }, single: { en: 'One' } }
  }
  assert.deepEqual(validateQuestions(doc([q])), [])
  assert.match(
    validateQuestions(doc([{ ...q, variantHints: { wide: { en: 'x' } } }])).join('\n'),
    /not a logo layout/
  )
  assert.match(validateQuestions(doc([{ ...q, variantHints: { pair: {} } }])).join('\n'), /no en text/)
  assert.match(
    validateQuestions(doc([{ ...q, kind: 'text', feeds: ['agent'] }])).join('\n'),
    /only a logo question has variantHints/
  )
})

test('the logo hint follows the tiles the server attaches', () => {
  assert.equal(logoLayoutOf(['light', 'dark']), 'pair')
  assert.equal(logoLayoutOf(['dark']), 'dark')
  assert.equal(logoLayoutOf(['single']), 'single')
  assert.equal(logoLayoutOf(undefined), 'single')
  const [logo] = questionsFor(standard('wordpress'), 'en').filter((q) => q.id === 'logo')
  assert.equal(logo.hint, 'Use your usual logo.', 'without a profile the question is the one-tile one')
  const pair = withLogoVariants(logo, ['light', 'dark'])
  assert.deepEqual(pair.variants, ['light', 'dark'])
  assert.equal(pair.hint, 'Add your logo for both light and dark themes.')
  const dark = withLogoVariants(logo, ['dark'])
  assert.deepEqual(dark.variants, ['dark'])
  assert.equal(dark.hint, 'This design shows your logo on a dark background. Use a white or light version.')
  assert.deepEqual(withLogoVariants(logo, ['single']).variants, ['single'])
  assert.equal(logo.variants, undefined, 'the input is not changed')
  assert.equal(
    withLogoVariants(
      questionsFor(standard('joomla'), 'vi').find((q) => q.id === 'logo'),
      ['dark']
    ).hint,
    'Thiết kế này đặt logo trên nền tối. Hãy dùng bản màu trắng hoặc màu sáng.'
  )
})

// `business` closes the file: only Build from my business draws it (`site.business`).
const ORDER = ['name', 'logo', 'favicon', 'about', 'pages', 'languages', 'tone', 'business']

for (const cms of ['wordpress', 'joomla', 'emdash'])
  test(`${cms}: the seven questions, in order, each with a hint in every language of the file`, () => {
    const set = standard(cms)
    assert.deepEqual(validateQuestions(set, { requireName: true }), [])
    assert.deepEqual(
      set.questions.map((q) => q.id),
      ORDER
    )
    const byId = Object.fromEntries(set.questions.map((q) => [q.id, q]))
    assert.equal(byId.logo.kind, 'logo')
    assert.deepEqual(byId.logo.feeds, ['site.logo'])
    assert.equal(byId.favicon.kind, 'favicon')
    assert.deepEqual(byId.favicon.feeds, ['site.favicon'])
    assert.deepEqual(byId.pages.feeds, ['site.pages'])
    assert.equal(byId.business.kind, 'business')
    assert.deepEqual(byId.business.feeds, ['site.business'])
    assert.equal(byId.pages.options, undefined, 'the server fills the pages from the release')
    for (const q of set.questions)
      for (const l of set.languages) assert.ok(q.hint?.[l]?.trim(), `${cms} ${q.id} has a ${l} hint`)
    const en = Object.fromEntries(questionsFor(set, 'en').map((q) => [q.id, q]))
    assert.equal(en.name.hint, 'Write it exactly as customers should see it.')
    assert.equal(en.favicon.hint, 'The small icon in the browser tab.')
    assert.equal(en.pages.hint, 'Every page in this design is included. Untick the ones you do not need.')
    assert.equal(en.languages.hint, 'Your site is written in this language.')
    assert.equal(
      en.tone.hint,
      'Sets the writing style Tracy uses for the text on your site.\nPlain is direct, Warm is friendly, Bold is confident.',
      'the line break survives questionsFor'
    )
    assert.deepEqual(en.logo.variantHints, {
      pair: 'Add your logo for both light and dark themes.',
      dark: 'This design shows your logo on a dark background. Use a white or light version.',
      single: 'Use your usual logo.'
    })
    const offered = byId.languages.options
    for (const gone of DROPPED_LANGUAGE_OPTIONS)
      assert.ok(!offered.includes(gone), `${cms} no longer offers ${gone}`)
    assert.ok(offered.includes('en-gb') && offered.includes('en-us'), `${cms} keeps UK and US English`)
  })

test('the cleaned lists: WordPress 42, Joomla 43, EmDash the WordPress list', () => {
  assert.equal(standard('wordpress').questions.find((q) => q.id === 'languages').options.length, 42)
  assert.equal(standard('joomla').questions.find((q) => q.id === 'languages').options.length, 43)
  assert.deepEqual(
    standard('emdash').questions.find((q) => q.id === 'languages').options,
    standard('wordpress').questions.find((q) => q.id === 'languages').options
  )
})
