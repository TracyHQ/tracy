/**
 * The standard questionnaire fitted to the template a site is built from (D7, T05 of TracyHQ/tch#1013): logo tiles
 * from the template profile, the release's own pages with home locked, one language for every template, the logo
 * and favicon only while brand uploads are on — and the pages a press keeps.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadStandardQuestions, resolveQuestions } from '../src/lib/build-questions.js'
import { fitPagesQuestion, fitQuestions, pagesOfBrief } from '../src/lib/fit-questions.js'
import { contentHashOf } from '../src/lib/question-sets.js'
import { validateQuestions } from '../src/lib/questions-schema.mjs'
import { briefFromAnswers } from '../src/lib/site-brief.js'
import { TEMPLATE_PROFILES } from '../src/lib/template-profiles.js'

const standard = loadStandardQuestions()
const quiet = () => {}

/** A row of `readReleases` as far as the fitting reads it. */
const release = (tag, version, pages = null) => ({ tag, setting: { version }, pages })

const NOVA_WP_PAGES = [
  { id: 'home', label: 'Home', home: true },
  { id: 'about-us', label: 'About us' },
  { id: 'services', label: 'Services' },
  { id: 'contact', label: 'Contact' }
]
const VEGA_WP_PAGES = [
  { id: 'front', label: 'Front', home: true },
  { id: 'portfolio', label: 'Portfolio' }
]

async function served(platform, row, { brandUploads = true, lang = 'en', warn = quiet } = {}) {
  return resolveQuestions({
    platform,
    quickstart: row?.tag ?? null,
    lang,
    standard,
    release: row,
    brandUploads,
    warn
  })
}
const question = (r, id) => r.questions.find((q) => q.id === id)

test('the logo question draws the tiles of the template profile', async () => {
  const vega = await served('wordpress', release('quickstart/ja-vega/wp7', '1.1.11'))
  assert.deepEqual(question(vega, 'logo').variants, ['dark'], 'JA Vega WordPress: one logo on a dark header')
  const nova = await served('joomla', release('quickstart/ja-nova/j6', '1.0.4'))
  assert.deepEqual(
    question(nova, 'logo').variants,
    ['light', 'dark'],
    'JA Nova Joomla: a light and a dark logo'
  )
  const prodex = await served('joomla', release('quickstart/ja-prodex/j6', '1.0.0'))
  assert.deepEqual(question(prodex, 'logo').variants, ['single'], 'JA Prodex Joomla: one logo')
  // The snapshot holds the tiles too: the set the customer was shown is the set kept.
  assert.deepEqual(vega.doc.questions.find((q) => q.id === 'logo').variants, ['dark'])
  assert.equal(vega.set.contentHash, contentHashOf(vega.doc))
  assert.notEqual(vega.set.contentHash, nova.set.contentHash, 'two templates, two served sets')
  // The hint is the one written for that layout.
  assert.match(question(vega, 'logo').hint, /dark/i)
})

test('JA Resort Joomla asks only the dark logo: its one logo spot sits on a dark band everywhere (TracyHQ/tch#1013)', async () => {
  // Measured 08/10/2026 on site tamq-9j-res: the light logo of a pair was collected and never shown.
  const resort = await served('joomla', release('quickstart/ja-resort/j6', '1.0.1'))
  assert.deepEqual(question(resort, 'logo').variants, ['dark'])
  const impact = await served('joomla', release('quickstart/ja-impact/j6', '1.0.0'))
  assert.deepEqual(question(impact, 'logo').variants, ['dark'], 'JA Impact, the same kind of header')
})

test('a release with no profile row asks one logo, and the server log says so', async () => {
  const lines = []
  const r = await served('wordpress', release('quickstart/nobody/wp7', '1.0.0'), {
    warn: (l) => lines.push(l)
  })
  assert.deepEqual(question(r, 'logo').variants, ['single'])
  assert.equal(lines.length, 1)
  assert.match(lines[0], /no template profile for quickstart\/nobody\/wp7@1\.0\.0/)
  const none = await served('emdash', null, { warn: (l) => lines.push(l) })
  assert.deepEqual(question(none, 'logo').variants, ['single'], 'no release at all: one logo')
})

test('the pages question offers the release file, home locked; another template, another list', async () => {
  const nova = await served('wordpress', release('quickstart/ja-nova/wp7', '1.1.9', NOVA_WP_PAGES))
  const pages = question(nova, 'pages')
  assert.deepEqual(pages.options, ['home', 'about-us', 'services', 'contact'])
  assert.deepEqual(pages.optionLabels, {
    home: 'Home',
    'about-us': 'About us',
    services: 'Services',
    contact: 'Contact'
  })
  assert.deepEqual(pages.locked, ['home'])
  assert.equal(pages.keepsAllPages, undefined)
  const vega = await served('wordpress', release('quickstart/ja-vega/wp7', '1.1.11', VEGA_WP_PAGES))
  assert.deepEqual(question(vega, 'pages').options, ['front', 'portfolio'])
  assert.deepEqual(question(vega, 'pages').locked, ['front'], 'home is whichever page the file marks home')
  // The served document stays a valid questionnaire in every language it carries.
  assert.deepEqual(validateQuestions(nova.doc, { requireName: true }), [])
})

test('a template with no page list keeps every page: no options, and the flag says so', async () => {
  for (const row of [release('quickstart/ja-vega/wp7', '1.1.11', null), null]) {
    const r = await served('wordpress', row)
    const pages = question(r, 'pages')
    assert.ok(pages, 'the question is still served')
    assert.equal(pages.options, undefined)
    assert.equal(pages.keepsAllPages, true)
    assert.deepEqual(validateQuestions(r.doc, { requireName: true }), [], 'still a valid set')
  }
})

test('every template is built in one language', async () => {
  for (const [tag, rows] of Object.entries(TEMPLATE_PROFILES.releases)) {
    const platform = /\/j\d+$/.test(tag) ? 'joomla' : /\/wp\d+$/.test(tag) ? 'wordpress' : 'emdash'
    for (const version of Object.keys(rows)) {
      const r = await served(platform, release(tag, version))
      assert.equal(r.languages, 'one', `${tag}@${version}`)
    }
  }
  for (const platform of ['wordpress', 'joomla', 'emdash'])
    assert.equal((await served(platform, null)).languages, 'one', `${platform} with no template`)
})

test('brand uploads off: no logo or favicon question, every other question kept', async () => {
  for (const platform of ['wordpress', 'joomla', 'emdash']) {
    const r = await served(platform, release('quickstart/ja-nova/j6', '1.0.4'), { brandUploads: false })
    assert.deepEqual(
      r.questions.map((q) => q.id),
      standard[platform].questions.filter((q) => q.kind !== 'logo' && q.kind !== 'favicon').map((q) => q.id)
    )
    assert.ok(!r.doc.questions.some((q) => q.kind === 'logo' || q.kind === 'favicon'), 'nor in the snapshot')
  }
  const on = await served('joomla', null, { brandUploads: true })
  assert.deepEqual(
    on.questions.map((q) => q.id),
    standard.joomla.questions.map((q) => q.id),
    'on: the whole standard file'
  )
})

const novaDoc = () =>
  fitQuestions(standard.wordpress, {
    release: release('quickstart/ja-nova/wp7', '1.1.9', NOVA_WP_PAGES),
    brandUploads: true,
    warn: quiet
  })

test('a press without home keeps home; an unknown page id is dropped with a note', () => {
  const { pages, notes } = pagesOfBrief(novaDoc(), { pages: ['contact', 'gallery', 'about-us'] })
  assert.deepEqual(pages.picked, ['home', 'about-us', 'contact'], 'template order, home always')
  assert.deepEqual(pages.all, [
    { id: 'home', label: 'Home', home: true },
    { id: 'about-us', label: 'About us' },
    { id: 'services', label: 'Services' },
    { id: 'contact', label: 'Contact' }
  ])
  assert.equal(notes.length, 1)
  assert.match(notes[0], /"gallery" is not a page of this template/)
  assert.deepEqual(pagesOfBrief(novaDoc(), { pages: [] }).pages.picked, ['home'], 'nothing ticked: home only')
  assert.deepEqual(
    pagesOfBrief(novaDoc(), {}).pages.picked,
    ['home', 'about-us', 'services', 'contact'],
    'not answered: every page kept'
  )
})

test('no page list, or no pages question: no pages in the brief', () => {
  const bare = fitQuestions(standard.wordpress, { release: null, warn: quiet })
  assert.deepEqual(pagesOfBrief(bare, { pages: ['home'] }), { pages: null, notes: [] })
  const noQuestion = { ...novaDoc(), questions: novaDoc().questions.filter((q) => q.id !== 'pages') }
  assert.equal(pagesOfBrief(noQuestion, { pages: ['home'] }).pages, null)
})

test('a snapshot kept before the pages were filled is filled again before it judges a press', () => {
  // What `question_snapshot` held before T05: the standard file as it is, the pages question with no options.
  const old = structuredClone(standard.wordpress)
  assert.equal(briefFromAnswers(old, { pages: ['about-us'] }), null, 'judged as it was, the answer is lost')
  const refilled = fitPagesQuestion(old, release('quickstart/ja-nova/wp7', '1.1.9', NOVA_WP_PAGES))
  const brief = briefFromAnswers(refilled, { pages: ['about-us'] })
  assert.deepEqual(
    brief.answers.map((a) => [a.id, a.value]),
    [['pages', ['about-us']]]
  )
  assert.deepEqual(pagesOfBrief(refilled, { pages: ['about-us'] }).pages.picked, ['home', 'about-us'])
})

test('a template with more pages than any other list may name keeps every ticked page', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    id: `page-${i}`,
    label: `Page ${i}`,
    ...(i === 0 ? { home: true } : {})
  }))
  const doc = fitPagesQuestion(standard.joomla, release('quickstart/ja-nova/j6', '1.0.4', many))
  const ticked = many.map((p) => p.id)
  assert.equal(briefFromAnswers(doc, { pages: ticked }).answers[0].value.length, 20)
  assert.equal(pagesOfBrief(doc, { pages: ticked }).pages.picked.length, 20)
})
