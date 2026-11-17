/**
 * How the owner's answers travel in the build chat (#609, run of 17/11/2026): the tool stores them by itself, the agent
 * is told what to call after them, and an answer to a question the engine asks again is sent again, never dropped as
 * one already sent. The fake fetch follows the door contract in `src/host/doors.ts`. Every business here is invented.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/build-tool-answer-flow.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ANSWERS_ARRIVE_GUIDANCE,
  PRIVATE_GUIDANCE_MARK,
  RESEARCH_DONE_NEXT,
  createBuildTool
} from '../src/host/build-tool.mjs'
import vi from '../../../locale/tracy-locale-vi/vi/tracy-build-chat.json' with { type: 'json' }

const SESSION = 'session-build-5d2e7f10-3a4b-4c6d-8e9f-0a1b2c3d4e5f'
const LINKS = [
  'https://www.google.com/maps/search/?api=1&query=Brindlewick+Courts',
  'https://brindlewick.example/'
]
const PLACE = {
  schema: 'tracy-build-question/v1',
  id: 'place-choice',
  topic: 'place-choice',
  prompt: 'We found more than one place on Google Maps under this name. Which one is yours?',
  choices: [
    { id: 'ChIJinventedBrindleN', label: 'Brindlewick Courts, 2 Alder Way' },
    { id: 'ChIJinventedBrindleS', label: 'Brindlewick Courts, 7 Moss Lane' },
    { id: 'none', label: 'None of these' }
  ],
  freeText: { maxLength: 1000 }
}
const askOf = (q) => ({
  questions: [{ id: q.id, question: q.prompt, options: q.choices.map((c) => ({ label: c.label })) }]
})
const BUTTON = {
  schema: 'tracy-build-question/v1',
  id: 'main-button',
  topic: 'main-button',
  prompt: 'What should the main button on your site ask visitors to do?',
  choices: [
    { id: 'book', label: 'Book online', recommended: true },
    { id: 'call', label: 'Call us' }
  ],
  freeText: { maxLength: 1000 }
}
const PROFILE = { business: 'Brindlewick Courts', counts: { facts: 6 } }
const placeAsking = {
  step: 'research',
  state: 'asking',
  result: { questions: [PLACE], ask: askOf(PLACE), links: [{ name: 'Google Maps', state: 'choice' }] }
}
const researchDone = (questions) => ({
  step: 'research',
  state: 'done',
  result: {
    profile: PROFILE,
    questions,
    ...(questions.length ? { ask: askOf(questions[0]) } : {}),
    links: []
  }
})

/** A fake tracy-web: `routes['METHOD /path']` answers a body, or a list of bodies taken in turn. */
function fakeWeb(routes) {
  const calls = []
  const http = async (url, init = {}) => {
    const { pathname } = new URL(url)
    const method = init.method ?? 'GET'
    const body = init.body === undefined ? undefined : JSON.parse(init.body)
    calls.push({ method, path: pathname.replace('/api/build-draft', ''), body })
    let answer = routes[`${method} ${pathname.replace('/api/build-draft', '')}`]
    if (Array.isArray(answer)) answer = answer.length > 1 ? answer.shift() : answer[0]
    if (answer === undefined) return new Response('{}', { status: 404 })
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  return { http, calls }
}
const toolOf = (web, events) =>
  createBuildTool({
    http: web.http,
    origin: () => 'https://tracy.example',
    actorFor: () => 'signed-assertion',
    eventsOf: () => events,
    sleep: async () => {},
    waitMs: 10,
    pollMs: 1
  })
const run = (tool, args) => tool.execute(args, { agent: { session: { id: SESSION } } })
/** The log of the owner's answer on one question card: a pressed option, or typed text. */
const replied = (callId, ask, answer) => [
  { type: 'tool/call', data: { name: 'ask_user_question', callId, arguments: JSON.stringify(ask) } },
  {
    type: 'tool/result',
    data: {
      message: {
        source: { callId },
        content: [{ type: 'text', text: JSON.stringify({ answers: [answer] }) }]
      }
    }
  }
]
const puts = (web) => web.calls.filter((c) => c.method === 'PUT').map((c) => c.body.answer)

test('a research that hands questions tells the agent the answers travel alone and templates come next', async () => {
  const web = fakeWeb({ 'POST /research': researchDone([BUTTON]) })
  const answer = await run(toolOf(web, []), { action: 'research', links: LINKS.slice(1) })
  assert.ok(answer.next.startsWith(PRIVATE_GUIDANCE_MARK))
  assert.ok(answer.next.includes(ANSWERS_ARRIVE_GUIDANCE))
  assert.match(answer.next, /When the owner has answered, call tracy_build with action templates/)
  assert.match(answer.next, /Never call research again to pass an answer/)
  // With nothing to ask, templates come next at once.
  const done = await run(toolOf(fakeWeb({ 'POST /research': researchDone([]) }), []), {
    action: 'research',
    links: LINKS.slice(1)
  })
  assert.ok(done.next.endsWith(RESEARCH_DONE_NEXT))
})

test('the first research answer opens the chat with a sentence in the language of the chat, once', async () => {
  const web = fakeWeb({ 'POST /research': researchDone([]) })
  const tool = toolOf(web, [])
  const first = await run(tool, { action: 'research', links: LINKS.slice(1), language: 'vi' })
  assert.equal(first.say, vi['say.researchRead'])
  assert.match(first.next, /Begin with the sentence in say/)
  const second = await run(tool, { action: 'research', links: LINKS.slice(1), language: 'vi' })
  assert.equal(second.say, undefined)
})

test('an answer to a question the engine asks again is sent again, never dropped as already sent', async () => {
  const events = []
  const web = fakeWeb({
    'POST /research': researchDone([BUTTON]),
    'PUT /answers': { draft: {} },
    'GET /templates': { templates: [] },
    'GET /engine': researchDone([BUTTON])
  })
  const tool = toolOf(web, events)
  await run(tool, { action: 'research', links: LINKS.slice(1) })
  events.push(...replied('q1', askOf(BUTTON), { id: 'main-button', selected: ['Call us'] }))
  await run(tool, { action: 'templates' })
  await run(tool, { action: 'templates' })
  assert.equal(puts(web).length, 1)
  // A new research replaced the answered one: the engine issues the same question again, so the answer goes again.
  await run(tool, { action: 'status' })
  await run(tool, { action: 'templates' })
  assert.deepEqual(puts(web), [
    { schema: 'tracy-build-answer/v1', question: 'main-button', choice: 'call' },
    { schema: 'tracy-build-answer/v1', question: 'main-button', choice: 'call' }
  ])
})

test('place asked, answered, research done, a typed profile answer: templates next, research never again', async () => {
  const events = []
  const web = fakeWeb({
    'POST /research': placeAsking,
    'POST /compose': researchDone([BUTTON]),
    'PUT /answers': { draft: {} },
    'GET /templates': { templates: [] }
  })
  const tool = toolOf(web, events)
  const asked = await run(tool, { action: 'research', links: LINKS })
  assert.deepEqual(asked.ask, askOf(PLACE))
  assert.match(asked.next, /action plan again/)
  assert.match(asked.next, /Never call research again to pass an answer/)
  events.push(
    ...replied('q1', asked.ask, { id: 'place-choice', selected: ['Brindlewick Courts, 7 Moss Lane'] })
  )
  const done = await run(tool, { action: 'plan' })
  assert.deepEqual(done.profile, PROFILE)
  assert.match(done.next, /call tracy_build with action templates/)
  const typed =
    `We would like visitors to book a court online first. ${'Members may also call the desk. '.repeat(8)}`.trim()
  events.push(...replied('q2', done.ask, { id: 'main-button', selected: [], custom: typed }))
  await run(tool, { action: 'templates' })
  assert.deepEqual(
    web.calls.map((c) => `${c.method} ${c.path}`),
    ['POST /research', 'PUT /answers', 'POST /compose', 'PUT /answers', 'GET /templates']
  )
  assert.deepEqual(puts(web), [
    { schema: 'tracy-build-answer/v1', question: 'place-choice', choice: 'ChIJinventedBrindleS' },
    { schema: 'tracy-build-answer/v1', question: 'main-button', text: typed }
  ])
  assert.ok(typed.length > 200, 'a long typed answer is sent whole')
})
