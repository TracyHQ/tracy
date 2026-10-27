/**
 * The create door's reading of the popup's answers, and the proof that its sizes are the popup's own
 * (this process mirrors them because it cannot import `packages/` in production).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  LONGTEXT_MAX as CLIENT_LONGTEXT_MAX,
  TEXT_MAX as CLIENT_TEXT_MAX
} from '../../../packages/site/tracy-add-site/src/client/site-brief.mjs'
import { BRIEF_ABOUT_MAX, BRIEF_TEXT_MAX, readBriefFacts, readBriefInput } from '../src/lib/site-brief.js'

test("the sizes are the popup's own", () => {
  assert.equal(BRIEF_ABOUT_MAX, CLIENT_LONGTEXT_MAX)
  assert.equal(BRIEF_TEXT_MAX, CLIENT_TEXT_MAX)
})

// The old three-question body, still read for a browser that holds the old plugin bundle.
test('a brief is read as {about, goal, style}, cleaned', () => {
  assert.deepEqual(readBriefInput({ about: '  A family\n bakery  ', goal: 'sell', style: 'friendly' }), {
    about: 'A family bakery',
    goal: 'sell',
    style: 'friendly'
  })
})

test('an answer the popup does not offer reads as unanswered, and a brief with nothing left is no brief', () => {
  assert.deepEqual(readBriefInput({ about: '', goal: 'world-domination', style: 7 }), null)
  assert.deepEqual(readBriefInput({ about: 'A bakery', goal: 'nope', style: null }), {
    about: 'A bakery',
    goal: null,
    style: null
  })
})

test('anything that is not an object is no brief', () => {
  for (const raw of [undefined, null, 'a bakery', 7, [], [{ about: 'x' }]])
    assert.equal(readBriefInput(raw), null)
})

test("the text is cut to the box's size and stripped of control characters", () => {
  assert.equal(readBriefInput({ about: 'x'.repeat(BRIEF_ABOUT_MAX + 50) }).about.length, BRIEF_ABOUT_MAX)
  assert.equal(readBriefInput({ about: 'a\u0000b\u0007c' }).about, 'a b c')
})

// ── The popup now asks the site's own questionnaire: answers by question id ──────────────────────

import { briefFromAnswers, readBriefAnswers } from '../src/lib/site-brief.js'

const SET = {
  questions: [
    { id: 'name', kind: 'text', label: { en: 'Company name' }, feeds: ['site.name', 'agent'] },
    { id: 'about', kind: 'longtext', label: { en: 'About' }, feeds: ['copy.about', 'agent'] },
    {
      id: 'sector',
      kind: 'choice',
      label: { en: 'Sector' },
      feeds: ['agent'],
      options: ['construction', 'other'],
      optionLabels: { construction: { en: 'Construction' } }
    },
    {
      id: 'licence',
      kind: 'text',
      label: { en: 'Licence' },
      feeds: ['agent'],
      showWhen: { all: [{ question: 'sector', is: 'construction' }] }
    },
    {
      id: 'languages',
      kind: 'languages',
      label: { en: 'Language' },
      feeds: ['site.languages'],
      options: ['en', 'vi']
    }
  ]
}

test('answers are read by id off the body, with the hash of the set that was shown', () => {
  const hash = 'a'.repeat(64)
  assert.deepEqual(
    readBriefAnswers({ answers: { name: 'Golden', languages: ['en', 7] }, questionnaire: hash }),
    {
      answers: { name: 'Golden', languages: ['en'] },
      questionnaire: hash
    }
  )
  assert.equal(readBriefAnswers({ answers: {}, questionnaire: 'not-a-hash' }).questionnaire, null)
  for (const raw of [undefined, null, 'x', [], { about: 'old shape' }, { answers: 'x' }, { answers: [] }])
    assert.equal(readBriefAnswers(raw), null)
})

test('an answer is held to its question: unknown option, hidden question and unknown id are dropped', () => {
  const made = briefFromAnswers(SET, {
    name: '  Golden \u0000 Crust ',
    about: 'A bakery',
    sector: 'other',
    licence: 'X-1',
    languages: ['vi', 'zz'],
    stray: 'nobody asked'
  })
  assert.deepEqual(
    made.answers.map((a) => [a.id, a.value]),
    [
      ['name', 'Golden Crust'],
      ['about', 'A bakery'],
      ['sector', 'other'],
      ['languages', ['vi']]
    ]
  )
  assert.equal(made.about, 'A bakery')
  assert.equal(made.said, 'Sector: other')
  // The condition holds: the licence question is shown, and its answer counts.
  assert.equal(
    briefFromAnswers(SET, { sector: 'construction', licence: 'X-1' }).said,
    'Sector: Construction\nLicence: X-1'
  )
})

test('nothing answered, or only answers the set does not take, is no brief', () => {
  assert.equal(briefFromAnswers(SET, {}), null)
  assert.equal(briefFromAnswers(SET, { sector: 'nope', stray: 'x' }), null)
  assert.equal(briefFromAnswers({ questions: [] }, { name: 'x' }), null)
})

test('a text answer is cut to its size', () => {
  const made = briefFromAnswers(SET, { name: 'x'.repeat(500), about: 'y'.repeat(500) })
  assert.equal(made.answers[0].value.length, 200)
  assert.equal(made.about.length, BRIEF_ABOUT_MAX)
})

// ── The seven default questions (07/10/2026): file answers, and the template's own pages ─────────

const SEVEN = {
  questions: [
    { id: 'name', kind: 'text', label: { en: 'Business name' }, feeds: ['site.name', 'agent'] },
    { id: 'logo', kind: 'logo', label: { en: 'Logo' }, feeds: ['site.logo'] },
    { id: 'favicon', kind: 'favicon', label: { en: 'Favicon' }, feeds: ['site.favicon'] },
    // The server filled the release's pages in before the set was hashed and served.
    {
      id: 'pages',
      kind: 'multi',
      label: { en: 'Pages' },
      feeds: ['site.pages'],
      options: ['home', 'about-us', 'blog']
    },
    {
      id: 'tone',
      kind: 'choice',
      label: { en: 'Tone' },
      feeds: ['copy.tone', 'agent'],
      options: ['plain', 'warm']
    }
  ]
}
const ID_A = 'b1a2c3d4e5f60718293a4b5c6d7e8f90'
const ID_B = 'f0e1d2c3b4a5968778695a4b3c2d1e0f'

test('a logo answer is one upload id, or one per tile; a favicon answer is one id', () => {
  const made = briefFromAnswers(SEVEN, {
    name: 'Golden',
    logo: { light: ID_A, dark: ID_B, wide: ID_A },
    favicon: ID_B
  })
  assert.deepEqual(made.answers.find((a) => a.id === 'logo').value, { light: ID_A, dark: ID_B })
  assert.equal(made.answers.find((a) => a.id === 'favicon').value, ID_B)
  assert.equal(briefFromAnswers(SEVEN, { logo: ID_A }).answers[0].value, ID_A)
  // Something that is not an id is no answer: a path, a URL, a data URI, a number, an empty object.
  for (const bad of [
    '../etc/passwd',
    'https://x.test/a.png',
    'data:image/png;base64,AAAA',
    7,
    {},
    { light: 'a b' }
  ])
    assert.equal(briefFromAnswers(SEVEN, { logo: bad, favicon: bad }), null, JSON.stringify(bad))
})

test('file ids never land in what the customer said; the pages go by name', () => {
  const made = briefFromAnswers(SEVEN, {
    logo: { single: ID_A },
    favicon: ID_B,
    pages: ['home', 'blog', 'not-a-page'],
    tone: 'warm'
  })
  assert.equal(made.said, '', 'logo, favicon, pages and tone are all read by name')
  assert.ok(!made.said.includes(ID_A) && !made.said.includes(ID_B))
  assert.deepEqual(
    made.answers.find((a) => a.id === 'pages').value,
    ['home', 'blog'],
    'a page the set does not hold is dropped'
  )
  assert.deepEqual(made.answers.find((a) => a.id === 'pages').feeds, ['site.pages'])
})

test('a logo answer per tile survives the body reader', () => {
  const read = readBriefAnswers({
    answers: { logo: { light: ID_A, dark: 7, __proto__x: ID_B }, favicon: ID_B }
  })
  assert.deepEqual(read.answers, { logo: { light: ID_A }, favicon: ID_B })
})

// One language per site this round (D10): the door serves `languages: 'one'` beside every set, and a press that sends
// several (an old bundle, a hand-made request) is built in the first one.
test('a site built in one language keeps only the first language picked', () => {
  const many = { name: 'Golden', languages: ['vi', 'en', 'fr'] }
  assert.deepEqual(
    briefFromAnswers(SET, many, { oneLanguage: true }).answers.find((a) => a.id === 'languages').value,
    ['vi']
  )
  assert.deepEqual(
    briefFromAnswers(SET, many).answers.find((a) => a.id === 'languages').value,
    ['vi', 'en'],
    'without the flag a set still takes several (those it offers)'
  )
})

// Contact facts a caller collected with a source behind each (Website Opportunities: Google, the restaurant's own site).
test('collected contact facts are read with their source; a fact without a source, too long, or unknown is dropped', () => {
  const at = '2026-10-19T10:00:00.000Z'
  assert.deepEqual(
    readBriefFacts({
      facts: {
        phone: { value: ' +84 235 5550 134 ', source: 'business.phone', fetchedAt: at },
        email: { value: 'hello@phoba.vn', source: 'business.email' },
        address: { value: '12 Tran Phu, Hoi An', source: 'business.address', fetchedAt: 'yesterday' },
        hours: { value: 'Mon: 8 AM – 9 PM; Tue: 8 AM – 9 PM', source: 'business.hours' },
        fax: { value: '123', source: 'x' }
      }
    }),
    {
      phone: { value: '+84 235 5550 134', source: 'business.phone', fetchedAt: at },
      email: { value: 'hello@phoba.vn', source: 'business.email' },
      address: { value: '12 Tran Phu, Hoi An', source: 'business.address' },
      hours: { value: 'Mon: 8 AM – 9 PM; Tue: 8 AM – 9 PM', source: 'business.hours' }
    }
  )
  assert.equal(readBriefFacts({ facts: { phone: '+84 235 5550 134' } }), null, 'a fact needs a source')
  assert.equal(readBriefFacts({ facts: { phone: { value: '', source: 'business.phone' } } }), null)
  assert.equal(
    readBriefFacts({
      facts: { address: { value: 'x'.repeat(BRIEF_TEXT_MAX + 1), source: 'business.address' } }
    }),
    null,
    'a clipped fact is a wrong fact: dropped, never cut'
  )
  for (const raw of [undefined, null, {}, { facts: [] }, { facts: 'x' }])
    assert.equal(readBriefFacts(raw), null)
})
