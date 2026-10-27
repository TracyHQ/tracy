import assert from 'node:assert/strict'
import { test } from 'node:test'
import { supportedLocales } from '@tracy/seeder/language-catalog'
import { requests } from '../src/host/requests.mjs'

const job = (over = {}) => ({ answers: { languages: ['en'] }, ...over })

test('adding a language keeps the source and routes to the language stage', () => {
  // It used to rerun `copy`, which then refused a second language outright — so `language.add`
  // could not add a language at all, not even French.
  assert.deepEqual(requests['language.add'].change({ language: 'fr' }, job()), {
    answers: { languages: ['en-GB', 'fr-FR'] },
    stage: 'language'
  })
  assert.deepEqual(requests['language.add'].change({ language: 'zh-CN' }, job()), {
    answers: { languages: ['en-GB', 'zh-CN'] },
    stage: 'language'
  })
})

test('every spelling of one language is one language', () => {
  const twice = requests['language.add'].change(
    { language: 'fr-FR' },
    {
      answers: { languages: ['en', 'en-GB', 'fr'] }
    }
  )
  assert.deepEqual(twice.answers.languages, ['en-GB', 'fr-FR'])
})

test('a second language joins the first rather than replacing it', () => {
  const after = requests['language.add'].change(
    { language: 'zh-TW' },
    {
      answers: { languages: ['en-GB', 'fr-FR'] }
    }
  )
  assert.deepEqual(after.answers.languages, ['en-GB', 'fr-FR', 'zh-TW'])
})

test('an ambiguous language is a QUESTION for the customer, never a default', () => {
  // Choosing between Simplified and Traditional on the customer's behalf ships a finished site in
  // the wrong Chinese, and nobody on the team can see that it is wrong.
  assert.throws(
    () => requests['language.add'].change({ language: 'zh' }, job()),
    /zh-CN \(Chinese \(Simplified\)\) or zh-TW \(Chinese \(Traditional\)\).*Ask the customer/s
  )
})

test('a locale with no verified pack is refused, and the refusal names what there is', () => {
  // A well-formed Joomla tag that the reviewed catalog does not carry. It used to be de-DE; the
  // catalog grew to 53 packs on 21/09 and de-DE is now one of them, so the probe moved to a tag
  // that is still outside — and it stays outside only as long as nobody verifies a Korean pack.
  const missing = 'ko-KR'
  assert.ok(!supportedLocales(6).includes(missing), `${missing} joined the catalog; pick another`)
  const error = (() => {
    try {
      requests['language.add'].change({ language: missing }, job())
    } catch (e) {
      return e
    }
  })()
  assert.match(error.message, /No verified Joomla language pack is registered for ko-KR/)
  assert.match(error.message, /zh-CN/)
  assert.throws(
    () => requests['language.add'].change({ language: 'nonsense' }, job()),
    /not a Joomla language tag/
  )
})

test('the tool description offers exactly the locales the catalog pins', () => {
  // Two lists, one source: what an agent may offer must be what the Claude Cowork plugin will install. The
  // expected list is read from the catalog, not typed here — the day the catalog went from four
  // packs to 53 (21/09) a typed list turned this test red for a change that was correct.
  const verified = supportedLocales(6)
  assert.deepEqual(requests['language.add'].locales, verified)
  assert.equal(verified[0], 'en-GB', 'the source language leads')
  for (const tag of ['fr-FR', 'zh-CN', 'zh-TW']) assert.ok(verified.includes(tag), tag)
  assert.ok(
    requests['language.add'].hint.includes(verified.filter((tag) => !tag.startsWith('en-')).join(', ')),
    'the hint names every verified pack but English ones, in catalog order — English is the source'
  )
  // And it says what it does NOT do, because the description is where an agent decides what to
  // promise a customer.
  assert.match(requests['language.add'].hint, /does NOT translate category names/)
})

test('the other registered commands are unchanged', () => {
  assert.deepEqual(requests['design.apply.airbnb'].change({}, job()), {
    answers: {},
    stage: 'template',
    inspiration: 'airbnb'
  })
  assert.deepEqual(requests['content.revise'].change({ answers: { name: 'X' } }, job()), {
    answers: { name: 'X' },
    stage: 'copy'
  })
})

// Lee, 23/09/2026: another English is not a second language to derive — it renames the English
// edition, so the answer carries it in the source's place and keeps every other language.
test('asking for a variant of the source language renames the English edition', () => {
  assert.deepEqual(requests['language.add'].change({ language: 'en-US' }, job()), {
    answers: { languages: ['en-US'] },
    stage: 'language'
  })
  assert.deepEqual(
    requests['language.add'].change({ language: 'en-us' }, job({ answers: { languages: ['en', 'vi-VN'] } }))
      .answers,
    { languages: ['en-US', 'vi-VN'] }
  )
  assert.deepEqual(
    requests['language.add'].change({ language: 'fr' }, job({ answers: { languages: ['en-US', 'vi-VN'] } }))
      .answers,
    { languages: ['en-US', 'vi-VN', 'fr-FR'] }
  )
  assert.deepEqual(
    requests['language.add'].change(
      { language: 'en-GB' },
      job({ answers: { languages: ['en-US', 'vi-VN'] } })
    ).answers,
    { languages: ['en-GB', 'vi-VN'] }
  )
  assert.match(requests['language.add'].hint, /renames the English edition/)
})

// Measured 23/09/2026 on j-cr4l1l (ja-kinetic, a design with no second edition): the build's
// `language` stage failed on a stand hiccup, the agent in the chat called `language.add vi-VN`, and
// that APPENDED to `['vi-VN']` as `['en-GB', 'vi-VN']` — so the one-language stage published en-GB.
test('on a one-language design, language.add switches the site to that language instead of adding one', () => {
  const one = { answers: { languages: ['vi-VN'] }, designPlan: { workflow: 'template', multilingual: false } }
  assert.deepEqual(requests['language.add'].change({ language: 'vi' }, one), {
    answers: { languages: ['vi-VN'] },
    stage: 'copy'
  })
  const english = { answers: { languages: ['en-GB'] }, designPlan: { multilingual: false } }
  assert.deepEqual(requests['language.add'].change({ language: 'fr-FR' }, english), {
    answers: { languages: ['fr-FR'] },
    stage: 'copy'
  })
})
