/**
 * The answers of the "Customize your site" card and sheet: which questions count, what a dirty value is read back as,
 * what survives a change of template, and what the create door is sent. The card and sheet themselves (open, close,
 * Create site) are driven in a real browser by `e2e/create-brief-sheet.test.mjs`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  answersFromDraft,
  askDraftFrom,
  briefAnswered,
  briefProgress,
  briefSummary,
  carryAnswers,
  cleanAnswers,
  EMPTY_BRIEF,
  fetchSiteQuestions,
  LONGTEXT_MAX,
  QUESTIONS_FAILED,
  servedFrom,
  SHEET_KINDS,
  sheetOrder,
  TEXT_MAX,
  toBrief
} from '../src/client/site-brief.mjs'

const QUESTIONS = [
  { id: 'name', kind: 'text', label: 'Company name' },
  { id: 'about', kind: 'longtext', label: 'About' },
  { id: 'sector', kind: 'choice', label: 'Sector', options: ['construction', 'other'] },
  {
    id: 'licence',
    kind: 'text',
    label: 'Licence',
    showWhen: { all: [{ question: 'sector', is: 'construction' }] }
  },
  { id: 'languages', kind: 'languages', label: 'Language', options: ['en', 'vi'] }
]

test('nothing answered is not an answer', () => {
  assert.equal(briefAnswered(QUESTIONS, EMPTY_BRIEF), false)
  assert.equal(briefAnswered(QUESTIONS, { name: '   ', languages: [] }), false)
  assert.equal(briefAnswered(QUESTIONS, undefined), false)
})

test('any one answer is enough to send a brief', () => {
  assert.equal(briefAnswered(QUESTIONS, { name: 'Golden Crust' }), true)
  assert.equal(briefAnswered(QUESTIONS, { sector: 'other' }), true)
  assert.equal(briefAnswered(QUESTIONS, { languages: ['vi'] }), true)
})

test('an answer to a question a condition hides does not count, and does not travel', () => {
  assert.equal(briefAnswered(QUESTIONS, { licence: 'X-1' }), false)
  assert.deepEqual(cleanAnswers(QUESTIONS, { sector: 'other', licence: 'X-1' }), { sector: 'other' })
  assert.deepEqual(cleanAnswers(QUESTIONS, { sector: 'construction', licence: 'X-1' }), {
    sector: 'construction',
    licence: 'X-1'
  })
})

test('text is trimmed and cut to its box; a short answer and a description have their own sizes', () => {
  assert.equal(cleanAnswers(QUESTIONS, { name: '  Golden  ' }).name, 'Golden')
  assert.equal(cleanAnswers(QUESTIONS, { name: 'x'.repeat(TEXT_MAX + 50) }).name.length, TEXT_MAX)
  assert.equal(cleanAnswers(QUESTIONS, { about: 'y'.repeat(LONGTEXT_MAX + 50) }).about.length, LONGTEXT_MAX)
})

test('an answer is sent with the hash of the set it answers, so the server judges it against that set', () => {
  const set = { id: 'tracy-business/emdash', revision: 3, contentHash: 'a'.repeat(64) }
  assert.deepEqual(toBrief(QUESTIONS, set, { name: 'Golden Crust', languages: ['vi'] }), {
    answers: { name: 'Golden Crust', languages: ['vi'] },
    questionnaire: 'a'.repeat(64)
  })
  assert.deepEqual(toBrief(QUESTIONS, null, { name: 'Golden Crust' }), { answers: { name: 'Golden Crust' } })
})

test('the served questions are read when there are some, and the set and a one-language template with them', () => {
  assert.equal(servedFrom(null), null)
  assert.equal(servedFrom({ questions: [] }), null)
  const served = servedFrom({
    questions: QUESTIONS,
    set: { id: 's', revision: 1, contentHash: 'b'.repeat(64) },
    languages: 'one'
  })
  assert.equal(served.questions.length, QUESTIONS.length)
  assert.equal(served.set.contentHash, 'b'.repeat(64))
  assert.equal(served.oneLanguage, true)
  assert.equal(servedFrom({ questions: QUESTIONS }).set, null)
})

test('the questionnaire is asked for the platform, the template and the person language; a failure says so', async () => {
  const seen = []
  const ok = async (url) => (seen.push(url), { ok: true, json: async () => ({ questions: QUESTIONS }) })
  assert.equal(
    (await fetchSiteQuestions({ platform: 'emdash', design: 'tracy-business', lang: 'vi' }, ok)).questions
      .length,
    5
  )
  assert.equal(seen[0], '/api/sites/questions?platform=emdash&lang=vi&design=tracy-business')
  assert.equal(
    await fetchSiteQuestions({ platform: 'wordpress' }, async () => ({ ok: false })),
    QUESTIONS_FAILED
  )
  assert.equal(
    await fetchSiteQuestions({ platform: 'wordpress' }, async () => {
      throw new Error('offline')
    }),
    QUESTIONS_FAILED
  )
  // A set with no questions is not a failure: there is simply nothing to ask.
  assert.equal(
    await fetchSiteQuestions({ platform: 'wordpress' }, async () => ({
      ok: true,
      json: async () => ({ questions: [] })
    })),
    null
  )
})

test('the answers last applied go back into the ask form by kind: text as typed, a choice or a list as picked', () => {
  assert.deepEqual(
    askDraftFrom(QUESTIONS, {
      name: 'Golden Crust ',
      about: '',
      sector: 'construction',
      languages: ['vi', '', 7],
      stray: 'kept out'
    }),
    {
      name: { selected: [], custom: 'Golden Crust ' },
      about: { selected: [], custom: '' },
      sector: { selected: ['construction'] },
      languages: { selected: ['vi'] }
    }
  )
  // A value of the wrong shape for its question is left out, and nothing applied is nothing drawn.
  assert.deepEqual(askDraftFrom(QUESTIONS, { name: ['a'], sector: '' }), {})
  assert.deepEqual(askDraftFrom(QUESTIONS, EMPTY_BRIEF), {})
  assert.deepEqual(askDraftFrom(QUESTIONS, undefined), {})
})

test('the draft comes back as answers as typed, hidden ones kept, and goes round trip through the ask form shape', () => {
  const answers = { name: ' Golden ', sector: 'construction', licence: 'X-1', languages: ['vi'] }
  assert.deepEqual(answersFromDraft(QUESTIONS, askDraftFrom(QUESTIONS, answers)), answers)
  assert.deepEqual(answersFromDraft(QUESTIONS, { sector: { selected: [] }, stray: { selected: ['x'] } }), {})
})

test('the questions the set flags required come first, each group in the set order', () => {
  const set = [
    { id: 'a', kind: 'text', label: 'A' },
    { id: 'b', kind: 'text', label: 'B', required: true },
    { id: 'c', kind: 'text', label: 'C' },
    { id: 'd', kind: 'text', label: 'D', required: true }
  ]
  assert.deepEqual(
    sheetOrder(set).map((q) => q.id),
    ['b', 'd', 'a', 'c']
  )
})

test('a new set keeps the answers whose question it still asks and whose value still fits, and drops the rest', () => {
  const next = [
    { id: 'name', kind: 'text', label: 'Business name' },
    { id: 'sector', kind: 'choice', label: 'Sector', options: ['bakery', 'other'] },
    { id: 'languages', kind: 'languages', label: 'Language', options: ['en', 'fr'] }
  ]
  assert.deepEqual(
    carryAnswers(next, {
      name: 'Golden Crust',
      about: 'We bake',
      sector: 'construction',
      languages: ['vi', 'en'],
      empty: ''
    }),
    { answers: { name: 'Golden Crust', languages: ['en'] }, kept: 2, dropped: 2 }
  )
  assert.deepEqual(carryAnswers(next, undefined), { answers: {}, kept: 0, dropped: 0 })
})

test('progress counts the questions shown now, a condition opening one adds to the total', () => {
  assert.deepEqual(briefProgress(QUESTIONS, {}), { answered: 0, total: 4 })
  assert.deepEqual(briefProgress(QUESTIONS, { name: '  ' }), { answered: 0, total: 4 })
  assert.deepEqual(briefProgress(QUESTIONS, { name: 'Golden', sector: 'construction' }), {
    answered: 2,
    total: 5
  })
})

// The seven default questions (07/10/2026): the sheet asks only what it can draw.
test('a question the sheet cannot draw is not served to it: a list with no options; the logo and favicon tiles are', () => {
  const served = servedFrom({
    questions: [
      { id: 'name', kind: 'text', label: 'Business name' },
      { id: 'logo', kind: 'logo', label: 'Logo', variants: ['light', 'dark'] },
      { id: 'favicon', kind: 'favicon', label: 'Favicon' },
      { id: 'sector', kind: 'multi', label: 'Sector' },
      { id: 'tone', kind: 'choice', label: 'Tone', options: ['plain', 'warm', 'bold'] },
      { id: 'mystery', kind: 'video', label: 'Video' }
    ]
  })
  assert.deepEqual(
    served.questions.map((q) => q.id),
    ['name', 'logo', 'favicon', 'tone']
  )
  assert.equal(
    servedFrom({ questions: [{ id: 'sector', kind: 'multi', label: 'Sector' }] }),
    null,
    'nothing left to ask'
  )
  assert.deepEqual(SHEET_KINDS, ['text', 'longtext', 'choice', 'multi', 'languages', 'logo', 'favicon'])
})

// The logo and favicon (T08): an answer is upload ids, one per logo tile.
const BRAND = [
  { id: 'name', kind: 'text', label: 'Business name' },
  { id: 'logo', kind: 'logo', label: 'Logo', variants: ['light', 'dark'] },
  { id: 'favicon', kind: 'favicon', label: 'Favicon' }
]
const ID_A = 'a1b2c3d4-0000-4000-8000-00000000000a'
const ID_B = 'a1b2c3d4-0000-4000-8000-00000000000b'
const ID_F = 'a1b2c3d4-0000-4000-8000-00000000000f'

test('a logo answer is its tiles, a favicon answer its id; both count and travel, an empty logo does not', () => {
  const answers = { logo: { light: ID_A, dark: ID_B }, favicon: ID_F }
  assert.deepEqual(cleanAnswers(BRAND, answers), answers)
  assert.equal(briefAnswered(BRAND, { logo: { dark: ID_B } }), true)
  assert.equal(briefAnswered(BRAND, { logo: {} }), false)
  assert.deepEqual(cleanAnswers(BRAND, { logo: { light: '', sepia: ID_A }, favicon: '' }), {})
  assert.deepEqual(briefProgress(BRAND, { logo: {}, favicon: ID_F }), { answered: 1, total: 3 })
})

test('the logo tiles and the favicon go round trip through the ask form shape', () => {
  const answers = { name: 'Tamarind', logo: { light: ID_A, dark: ID_B }, favicon: ID_F }
  const draft = askDraftFrom(BRAND, answers)
  assert.deepEqual(draft.logo, { selected: [`light:${ID_A}`, `dark:${ID_B}`] })
  assert.deepEqual(draft.favicon, { selected: [ID_F] })
  assert.deepEqual(answersFromDraft(BRAND, draft), answers)
  assert.deepEqual(answersFromDraft(BRAND, { logo: { selected: [] }, favicon: { selected: [] } }), {})
})

test('a change of template keeps the logo on the tiles the new design has, and the favicon', () => {
  const next = (variants) => [
    { id: 'logo', kind: 'logo', label: 'Logo', variants },
    { id: 'favicon', kind: 'favicon', label: 'Favicon' }
  ]
  const given = { logo: { light: ID_A, dark: ID_B }, favicon: ID_F }
  assert.deepEqual(carryAnswers(next(['light', 'dark']), given), { answers: given, kept: 2, dropped: 0 })
  assert.deepEqual(carryAnswers(next(['dark']), given).answers, { logo: { dark: ID_B }, favicon: ID_F })
  // The usual logo is the one for light backgrounds: it becomes the single logo, and back.
  assert.deepEqual(carryAnswers(next(['single']), given).answers.logo, { single: ID_A })
  assert.deepEqual(carryAnswers(next(['light', 'dark']), { logo: { single: ID_A } }).answers.logo, {
    light: ID_A
  })
  assert.deepEqual(carryAnswers(next(['dark']), { logo: { light: ID_A } }), {
    answers: {},
    kept: 0,
    dropped: 1
  })
  // Brand uploads switched off: the new set asks neither.
  assert.deepEqual(carryAnswers([{ id: 'name', kind: 'text', label: 'Name' }], given), {
    answers: {},
    kept: 0,
    dropped: 2
  })
})

// Pages (T09): the template's own pages, all ticked to begin with; home is locked.
const PAGES = {
  id: 'pages',
  kind: 'multi',
  label: 'Pages',
  feeds: ['site.pages'],
  options: ['home', 'features', 'pricing', 'contact'],
  locked: ['home']
}

test('a pages question with no page list is still asked: the template keeps every page', () => {
  const kept = { id: 'pages', kind: 'multi', label: 'Pages', feeds: ['site.pages'], keepsAllPages: true }
  assert.deepEqual(
    servedFrom({ questions: [kept] }).questions.map((q) => q.id),
    ['pages']
  )
})

test('every page ticked is no answer; an untick is an answer that keeps home', () => {
  assert.deepEqual(askDraftFrom([PAGES], {}), {}, 'nothing answered: the sheet draws every page ticked')
  assert.deepEqual(
    answersFromDraft([PAGES], { pages: { selected: ['home', 'features', 'pricing', 'contact'] } }),
    {}
  )
  assert.deepEqual(answersFromDraft([PAGES], { pages: { selected: ['contact', 'features'] } }), {
    pages: ['home', 'features', 'contact']
  })
  assert.deepEqual(briefProgress([PAGES], {}), { answered: 0, total: 1 })
  assert.deepEqual(briefProgress([PAGES], { pages: ['home', 'contact'] }), { answered: 1, total: 1 })
})

test('a change of template ticks every page of the new design again, and says nothing about it', () => {
  assert.deepEqual(carryAnswers([PAGES], { pages: ['home', 'contact'], name: 'Tamarind' }, { fresh: true }), {
    answers: {},
    kept: 0,
    dropped: 1
  })
  // The same set read again at Create site keeps what was unticked.
  assert.deepEqual(carryAnswers([PAGES], { pages: ['home', 'contact'] }).answers, {
    pages: ['home', 'contact']
  })
})

test('the card sums up what was answered: a short text as typed, a pick by its label, the tone named, pages counted', () => {
  const questions = [
    { id: 'name', kind: 'text', label: 'Business name', feeds: ['site.name'] },
    { id: 'about', kind: 'longtext', label: 'About' },
    { id: 'pages', kind: 'multi', label: 'Pages', options: ['home', 'about', 'news'], feeds: ['site.pages'] },
    { id: 'lang', kind: 'languages', label: 'Site language', options: ['en', 'vi'] },
    {
      id: 'tone',
      kind: 'choice',
      label: 'Tone',
      options: ['plain', 'warm'],
      optionLabels: { plain: 'Plain', warm: 'Warm' },
      feeds: ['copy.tone']
    },
    { id: 'sector', kind: 'choice', label: 'Sector', options: ['build'] }
  ]
  assert.deepEqual(briefSummary(questions, {}), [], 'nothing answered says nothing')
  assert.deepEqual(
    briefSummary(questions, {
      name: '  Northgate Industrial ',
      about: 'We build plants.',
      pages: ['home', 'news'],
      lang: ['vi'],
      tone: 'warm',
      sector: 'build'
    }),
    [
      { kind: 'text', text: 'Northgate Industrial' },
      { kind: 'pages', count: 2 },
      { kind: 'language', code: 'vi' },
      { kind: 'pick', label: 'Warm', tone: true },
      { kind: 'pick', label: 'build', tone: false }
    ]
  )
  assert.deepEqual(briefSummary(questions, { name: '   ' }), [], 'an answer of spaces is no answer')
})

// #1403 item 7: the questions door says whether a text model can write the answers.
test('servedFrom reads answersWritten; a server from before the field is taken at its word that it can', () => {
  assert.equal(servedFrom({ questions: QUESTIONS, answersWritten: false })?.answersWritten, false)
  assert.equal(servedFrom({ questions: QUESTIONS, answersWritten: true })?.answersWritten, true)
  assert.equal(servedFrom({ questions: QUESTIONS })?.answersWritten, true)
})
