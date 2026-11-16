/**
 * The build chat asks in the language the person is chatting in (decided rule, owner, #609): the chat agent names the
 * language the owner writes in on every `tracy_build` call (`language`). When the build chat has words for it, the
 * question card is worded in it and every answer names it in `chatLanguage`, whatever the account's interface
 * language; a language it has no words for falls back to the interface language; an English chat reads as before.
 * Every business, place and address here is invented.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/build-tool-chat-language.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import fr from '../../../locale/tracy-locales/fr/tracy-build-chat.json' with { type: 'json' }
import vi from '../../../locale/tracy-locale-vi/vi/tracy-build-chat.json' with { type: 'json' }
import { BUILD_PARAMETERS, createBuildTool, INTERFACE_LANGUAGE_HEADER } from '../src/host/build-tool.mjs'

const SESSION = 'session-build-3c2b1a0f-9e8d-4c7b-a6f5-e4d3c2b1a0f9'
const ORIGIN = 'https://tracy.example'

/** The place choice question, as `placeChoiceQuestionOf` makes it for two invented branches. */
const PLACE = {
  schema: 'tracy-build-question/v1',
  id: 'place-choice',
  topic: 'place-choice',
  code: 'place_choice',
  params: {},
  prompt: 'We found more than one place on Google Maps under this name. Which one is yours?',
  choices: [
    {
      id: 'place-a1',
      label: 'Juniper Lane Bakery, 4 Orchard Row',
      code: 'place_choice_option',
      params: { name: 'Juniper Lane Bakery', address: '4 Orchard Row' }
    },
    {
      id: 'place-b2',
      label: 'Juniper Lane Bakery, 18 Mill Street',
      code: 'place_choice_option',
      params: { name: 'Juniper Lane Bakery', address: '18 Mill Street' }
    },
    { id: 'none', label: 'None of these', code: 'place_choice_none', params: {} }
  ],
  freeText: { maxLength: 120 }
}
/** The main button question, as the needs profile issues it for a business with a phone, a social link and an address. */
const BUTTON = {
  schema: 'tracy-build-question/v1',
  id: 'main-button',
  topic: 'main-button',
  code: 'main_button',
  params: {},
  prompt: 'What should the main button on your site ask visitors to do?',
  choices: [
    { id: 'call', label: 'Call us', code: 'main_button_call', params: {}, recommended: true },
    { id: 'message', label: 'Message us', code: 'main_button_message', params: {} },
    { id: 'visit', label: 'Visit us', code: 'main_button_visit', params: {} }
  ],
  freeText: { maxLength: 40 }
}
const QUESTIONS = [PLACE, BUTTON]
const ASK = {
  questions: QUESTIONS.map((q) => ({
    id: q.id,
    question: q.prompt,
    options: q.choices.map((c) => ({ label: c.label })),
    multiSelect: false,
    ...(q.choices.find((c) => c.recommended)
      ? { recommended: q.choices.find((c) => c.recommended).label }
      : {})
  }))
}
const researchDone = {
  step: 'research',
  state: 'done',
  result: { profile: { business: 'Juniper Lane Bakery' }, questions: QUESTIONS, ask: ASK }
}

/** A fake tracy-web whose every answer names `language` as the account's interface language. */
function fakeWeb(language) {
  const routes = {
    'POST /api/build-draft/research': researchDone,
    'GET /api/build-draft/templates': { templates: [] }
  }
  const http = async (url, init = {}) => {
    const answer = routes[`${init.method ?? 'GET'} ${new URL(url).pathname}`]
    if (answer === undefined) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'content-type': 'application/json', [INTERFACE_LANGUAGE_HEADER]: language }
    })
  }
  return createBuildTool({
    http,
    origin: () => ORIGIN,
    actorFor: () => 'signed-assertion',
    eventsOf: () => []
  })
}
const run = (tool, args) => tool.execute(args, { agent: { session: { id: SESSION } } })
const research = (tool, language) =>
  run(tool, { action: 'research', description: 'A small bakery on the lane', language })

test('the tool asks the agent for the language the owner writes in on every call', () => {
  assert.ok(BUILD_PARAMETERS.required.includes('language'))
  assert.equal(BUILD_PARAMETERS.properties.language.type, 'string')
})

test('a Vietnamese chat gets Vietnamese questions and choices while the interface language is English', async () => {
  const tool = fakeWeb('en')
  const answer = await research(tool, 'vi')
  assert.equal(answer.chatLanguage, 'vi')
  const [place, button] = answer.ask.questions
  assert.equal(place.question, vi['ask.question.place_choice'])
  assert.notEqual(place.question, PLACE.prompt)
  // The places are the business's own names and addresses: never translated.
  assert.deepEqual(
    place.options.map((o) => o.label),
    [PLACE.choices[0].label, PLACE.choices[1].label, vi['ask.choice.place_choice_none']]
  )
  assert.notEqual(vi['ask.choice.place_choice_none'], 'None of these')
  assert.equal(button.question, vi['ask.question.main_button'])
  const said = ['call', 'message', 'visit'].map((id) => vi[`ask.choice.main_button_${id}`])
  assert.deepEqual(
    button.options.map((o) => o.label),
    said
  )
  for (const [i, choice] of BUTTON.choices.entries()) {
    assert.notEqual(said[i], choice.label)
    // The button's own text stays beside the translated label, word for word.
    assert.equal(
      button.options[i].description,
      vi['ask.choice.main_button_text'].replace('{text}', choice.label)
    )
  }
  assert.equal(button.recommended, said[0])
  // A later call that names the language again keeps it.
  assert.equal((await run(tool, { action: 'templates', language: 'vi' })).chatLanguage, 'vi')
})

test('a regional tag reads as its language, and a call that names none keeps the last one', async () => {
  const tool = fakeWeb('en')
  assert.equal((await research(tool, 'vi-VN')).chatLanguage, 'vi')
  assert.equal((await run(tool, { action: 'templates' })).chatLanguage, 'vi')
})

test('a language the build chat has no words for falls back to the interface language', async () => {
  const answer = await research(fakeWeb('fr'), 'sw')
  assert.equal(answer.chatLanguage, 'fr')
  assert.equal(answer.ask.questions[0].question, fr['ask.question.place_choice'])
  assert.equal(answer.ask.questions[1].question, fr['ask.question.main_button'])
})

test('an English chat on an English interface reads exactly as before', async () => {
  const answer = await research(fakeWeb('en'), 'en')
  assert.equal(answer.chatLanguage, 'en')
  assert.deepEqual(answer.ask, ASK)
})

test('an English chat on a Vietnamese interface is asked in English', async () => {
  const answer = await research(fakeWeb('vi'), 'en')
  assert.equal(answer.chatLanguage, 'en')
  assert.deepEqual(answer.ask, ASK)
})
