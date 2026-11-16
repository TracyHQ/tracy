/**
 * The build chat's engine tool in the owner's interface language (TracyHQ/tracy#609): tracy-web names the language on
 * every build draft answer (`x-tracy-interface-language`), the tool hands it to the agent in `interfaceLanguage`, words
 * the question card in it, and reads a reply's translated label back to its choice id. Every business here is invented.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/build-tool-interface-language.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import vi from '../../../locale/tracy-locale-vi/vi/tracy-build-chat.json' with { type: 'json' }
import { createBuildTool, INTERFACE_LANGUAGE_HEADER } from '../src/host/build-tool.mjs'

const SESSION = 'session-build-7a1d2c3e-4b5f-4a6b-9c8d-0e1f2a3b4c5d'
const ORIGIN = 'https://tracy.example'

/** The contact method question, as the needs profile issues it for a business with no way to reach it. */
const CONTACT = {
  schema: 'tracy-build-question/v1',
  id: 'contact-method',
  topic: 'contact-method',
  code: 'contact_method',
  prompt: 'We found no phone, email or booking link. How should visitors contact you?',
  choices: [
    { id: 'phone', label: 'A phone number', code: 'contact_method_phone', params: {}, recommended: true },
    { id: 'email', label: 'An email address', code: 'contact_method_email', params: {} },
    { id: 'link', label: 'A booking or contact link', code: 'contact_method_link', params: {} }
  ],
  freeText: { maxLength: 80 }
}
const ASK = {
  questions: [
    {
      id: 'contact-method',
      question: CONTACT.prompt,
      options: CONTACT.choices.map((c) => ({ label: c.label })),
      recommended: 'A phone number'
    }
  ]
}
const PROFILE = { business: 'Willow Creek Pottery Studio', counts: { services: 3, facts: 4 } }
const researchDone = {
  step: 'research',
  state: 'done',
  result: { profile: PROFILE, questions: [CONTACT], ask: ASK }
}

/** A fake tracy-web whose every answer names `language` in the interface language header (none when undefined). */
function fakeWeb(routes, language) {
  const calls = []
  const http = async (url, init = {}) => {
    const { pathname } = new URL(url)
    const method = init.method ?? 'GET'
    calls.push({ method, path: pathname, body: init.body === undefined ? undefined : JSON.parse(init.body) })
    const answer = routes[`${method} ${pathname}`]
    if (answer === undefined) return new Response('not found', { status: 404 })
    const headers = { 'content-type': 'application/json' }
    if (language !== undefined) headers[INTERFACE_LANGUAGE_HEADER] = language
    return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200, headers })
  }
  return { http, calls }
}

const toolWith = (web, events = []) =>
  createBuildTool({
    http: web.http,
    origin: () => ORIGIN,
    actorFor: () => 'signed-assertion',
    eventsOf: () => events
  })
const run = (tool, args) => tool.execute(args, { agent: { session: { id: SESSION } } })

test('the interface language tracy-web names reaches every answer of the tool, and words the question card', async () => {
  const web = fakeWeb(
    {
      'POST /api/build-draft/research': { body: researchDone },
      'GET /api/build-draft/templates': { body: { templates: [] } }
    },
    'vi'
  )
  const tool = toolWith(web)
  const researched = await run(tool, { action: 'research', description: 'A pottery studio by the creek' })
  assert.equal(researched.interfaceLanguage, 'vi')
  const [question] = researched.ask.questions
  // The Vietnamese words come from the table the browser loads, and are not the English ones.
  const said = ['phone', 'email', 'link'].map((id) => vi[`ask.choice.contact_method_${id}`])
  assert.equal(question.question, vi['ask.question.contact_method'])
  assert.notEqual(question.question, CONTACT.prompt)
  assert.deepEqual(
    question.options.map((o) => o.label),
    said
  )
  for (const [i, choice] of CONTACT.choices.entries()) assert.notEqual(said[i], choice.label)
  assert.equal(question.recommended, said[0])
  // A later answer of another step names it too.
  assert.equal((await run(tool, { action: 'templates' })).interfaceLanguage, 'vi')
})

test('an answer that names no interface language, or not a language tag, leaves the request in English', async () => {
  for (const language of [undefined, 'vi; drop table', 'VIETNAMESE']) {
    const web = fakeWeb({ 'POST /api/build-draft/research': { body: researchDone } }, language)
    const answer = await run(toolWith(web), {
      action: 'research',
      description: 'A pottery studio by the creek'
    })
    assert.equal(answer.interfaceLanguage, undefined, String(language))
    assert.deepEqual(answer.ask, ASK, String(language))
  }
})

/** The owner's reply on the card worded in Vietnamese: the second button, said as the card showed it. */
const repliedInVietnamese = (label) => [
  {
    type: 'tool/call',
    data: { name: 'ask_user_question', callId: 'q1', arguments: JSON.stringify(ASK) }
  },
  {
    type: 'tool/result',
    data: {
      message: {
        source: { callId: 'q1' },
        content: [
          { type: 'text', text: JSON.stringify({ answers: [{ id: 'contact-method', selected: [label] }] }) }
        ]
      }
    }
  }
]

test('a reply with a Vietnamese label is stored as the choice id at its place on the card', async () => {
  const web = fakeWeb(
    {
      'POST /api/build-draft/research': { body: researchDone },
      'PUT /api/build-draft/answers': { body: { draft: {} } },
      'GET /api/build-draft/templates': { body: { templates: [] } }
    },
    'vi'
  )
  const tool = toolWith(web, repliedInVietnamese(vi['ask.choice.contact_method_email']))
  await run(tool, { action: 'research', description: 'A pottery studio by the creek' })
  await run(tool, { action: 'templates' })
  const stored = web.calls.filter((c) => c.method === 'PUT').map((c) => c.body.answer)
  assert.deepEqual(stored, [{ schema: 'tracy-build-answer/v1', question: 'contact-method', choice: 'email' }])
})
