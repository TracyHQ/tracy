/**
 * The build chat's engine tool `tracy_build` (TracyHQ/tracy#609): it only forwards to tracy-web's build draft doors,
 * as the person who typed, and guards the build session's questions. The fake fetch below follows the door contract
 * in `src/host/doors.ts`. Every business here is invented.
 *
 *   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/build-tool.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildToolFoldOf, buildToolRowOf, canRetryStop } from '@tracy/core/build-chat'
import {
  ANSWERS_FULL_SAY,
  BODY_TOO_LARGE_SAY,
  BUILD_CHAT_OFF_SAY,
  BUILD_DESCRIPTION,
  BUILD_LOCKED_SAY,
  BUILD_UNCHECKED_SAY,
  BUILD_PARAMETERS,
  BUILD_RUNNING_SAY,
  BUILD_STOPPED_SAY,
  PRIVATE_GUIDANCE_MARK,
  UNCHANGED_FALLBACK_SAY,
  createBuildTool
} from '../src/host/build-tool.mjs'

const SESSION = 'session-build-0f3c2a8e-1b2d-4c5e-8f90-a1b2c3d4e5f6'
const ORIGIN = 'https://tracy.example'

/** A Contract B question of the invented club: a fact conflict offers the conflicting values as its choices. */
const PHONE = {
  schema: 'tracy-build-question/v1',
  id: 'phone',
  topic: 'fact-conflict',
  fact: 'contact.phone',
  prompt: 'Two sources show different phone numbers. Which is correct?',
  choices: [
    { id: 'website', label: '04 000 0000', detail: 'From your website', recommended: true },
    { id: 'maps', label: '04 000 0009', detail: 'From the map listing' }
  ],
  freeText: { maxLength: 40 }
}
const LANGUAGE = {
  schema: 'tracy-build-question/v1',
  id: 'language',
  topic: 'site-language',
  prompt: 'Which language should the site use?',
  choices: [{ id: 'en', label: 'English', recommended: true }],
  freeText: { maxLength: 40 },
  skippable: true
}
const ASK = {
  questions: [
    { id: 'phone', question: PHONE.prompt, options: [{ label: '04 000 0000' }, { label: '04 000 0009' }] },
    { id: 'language', question: LANGUAGE.prompt, options: [{ label: 'English' }] }
  ]
}
const PROFILE = { business: 'Harbour Lane Tennis Club', counts: { services: 4, facts: 9 } }
const PLAN = {
  schema: 'tracy-build-plan/v1',
  id: 'plan-harbour-lane',
  revision: 1,
  name: 'Harbour Lane Tennis Club',
  language: 'en',
  facts: [],
  items: [],
  look: { template: 'ja-sport', accent: '#205080', logo: { kind: 'own' } },
  pages: [{ id: 'home', name: 'Home', blocks: [] }],
  pictures: { own: { frames: 0, from: [] }, generated: { frames: 0 } },
  assumptions: [],
  leftOut: []
}

/** A fake tracy-web: `routes['METHOD /path']` answers `{ status, body }`, or a function of the request. */
function fakeWeb(routes) {
  const calls = []
  const http = async (url, init = {}) => {
    const { pathname } = new URL(url)
    const method = init.method ?? 'GET'
    const body = init.body === undefined ? undefined : JSON.parse(init.body)
    calls.push({ method, path: pathname, headers: init.headers ?? {}, body })
    let answer = routes[`${method} ${pathname}`]
    if (typeof answer === 'function') answer = answer(body, calls)
    if (Array.isArray(answer)) answer = answer.length > 1 ? answer.shift() : answer[0]
    if (answer === undefined) return new Response('not found', { status: 404 })
    // A call that never answers: a timeout or a network blip.
    if (answer === 'network') throw new TypeError('fetch failed')
    return new Response(JSON.stringify(answer.body ?? {}), {
      status: answer.status ?? 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  return { http, calls }
}

/** A tool with a clock the test moves: each sleep advances it. */
function toolWith(web, { events = [], waitMs = 90_000, pollMs = 2_000, actor = 'signed-assertion' } = {}) {
  let clock = 0
  return createBuildTool({
    http: web.http,
    origin: () => ORIGIN,
    actorFor: () => actor,
    eventsOf: () => events,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
    waitMs,
    pollMs
  })
}

const run = (tool, args, sessionId = SESSION) => tool.execute(args, { agent: { session: { id: sessionId } } })
const runIn = (tool, args, sessionId) => tool.execute(args, { agent: { session: { id: sessionId } } })

const researchDone = {
  step: 'research',
  state: 'done',
  result: { profile: PROFILE, questions: [PHONE, LANGUAGE], ask: ASK }
}

test('refuses outside a build chat session and calls no door', async () => {
  const web = fakeWeb({})
  const tool = toolWith(web)
  for (const id of ['session-0f3c2a8e-1b2d-4c5e-8f90-a1b2c3d4e5f6', 'session-build-nope', undefined]) {
    const answer = await runIn(tool, { action: 'research', links: ['https://harbour-lane.example'] }, id)
    assert.equal(answer.refused, true)
    assert.equal(answer.ask, undefined)
  }
  assert.equal(web.calls.length, 0)
})

test('research forwards links and description as the person who typed, and returns ask unchanged', async () => {
  const web = fakeWeb({ 'POST /api/build-draft/research': { body: researchDone } })
  const tool = toolWith(web)
  const answer = await run(tool, {
    action: 'research',
    links: ['https://harbour-lane.example', 'https://maps.example/harbour-lane'],
    description: 'A small tennis club by the harbour'
  })
  assert.deepEqual(answer, { profile: PROFILE, ask: ASK })
  const [call] = web.calls
  assert.equal(call.path, '/api/build-draft/research')
  assert.deepEqual(call.body, {
    links: ['https://harbour-lane.example', 'https://maps.example/harbour-lane'],
    description: 'A small tennis club by the harbour'
  })
  assert.equal(call.headers['x-tracy-actor'], 'signed-assertion')
  assert.equal(call.headers['x-tracy-session'], SESSION)
})

test('research with neither a link nor a description asks the agent for one and calls no door', async () => {
  const web = fakeWeb({})
  const answer = await run(toolWith(web), { action: 'research', links: [] })
  assert.equal(answer.refused, true)
  assert.equal(web.calls.length, 0)
})

test('the replies in the session log are stored through the answers door before the next call, once each', async () => {
  const events = [
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
            {
              type: 'text',
              text: JSON.stringify({
                answers: [
                  { id: 'phone', selected: ['04 000 0009'] },
                  { id: 'language', selected: [] }
                ]
              })
            }
          ]
        }
      }
    }
  ]
  const web = fakeWeb({
    'POST /api/build-draft/research': { body: researchDone },
    'PUT /api/build-draft/answers': { body: { draft: {} } },
    'GET /api/build-draft/templates': { body: { templates: [] } }
  })
  const tool = toolWith(web, { events })
  await run(tool, { action: 'research', description: 'A small tennis club by the harbour' })
  await run(tool, { action: 'templates' })
  await run(tool, { action: 'templates' })
  const order = web.calls.map((c) => `${c.method} ${c.path}`)
  // The log already holds replies before research: the engine door is asked once what it issued (nothing yet).
  assert.deepEqual(order, [
    'GET /api/build-draft/engine',
    'POST /api/build-draft/research',
    'PUT /api/build-draft/answers',
    'PUT /api/build-draft/answers',
    'GET /api/build-draft/templates',
    'GET /api/build-draft/templates'
  ])
  const stored = web.calls.filter((c) => c.method === 'PUT').map((c) => c.body)
  assert.deepEqual(stored, [
    {
      question: PHONE,
      answer: { schema: 'tracy-build-answer/v1', question: 'phone', choice: 'maps' }
    },
    {
      question: LANGUAGE,
      answer: { schema: 'tracy-build-answer/v1', question: 'language', skipped: true }
    }
  ])
  for (const c of web.calls) assert.equal(c.headers['x-tracy-session'], SESSION)
})

/** The log of one owner reply to the research questions: the phone picked from the map listing. */
const phoneReplied = [
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
          { type: 'text', text: JSON.stringify({ answers: [{ id: 'phone', selected: ['04 000 0009'] }] }) }
        ]
      }
    }
  }
]

/** What the owner is shown of one answer: the row, and whether Try again is offered. */
function shownOf(action, answer) {
  const text = JSON.stringify(answer)
  const fold = [
    {
      type: 'tool/call',
      seq: 1,
      data: { turn: 0, name: 'tracy_build', callId: 'c1', arguments: JSON.stringify({ action }) }
    },
    {
      type: 'tool/result',
      seq: 2,
      data: { turn: 0, message: { source: { callId: 'c1' }, content: [{ type: 'text', text }] } }
    }
  ].reduce((state, event) => buildToolFoldOf(state, event), undefined)
  return { row: buildToolRowOf({ action }, text), retry: canRetryStop(fold.stop) }
}

test('the answers door gets each question exactly as the engine issued it, fields it does not know included', async () => {
  // An answer is kept only when its question matches the issued one exactly: nothing is reshaped on the way.
  const issued = { ...PHONE, hint: 'An invented field this tool does not read.' }
  const web = fakeWeb({
    'POST /api/build-draft/research': {
      body: { ...researchDone, result: { ...researchDone.result, questions: [issued, LANGUAGE] } }
    },
    'PUT /api/build-draft/answers': { body: { draft: {} } },
    'GET /api/build-draft/templates': { body: { templates: [] } }
  })
  const tool = toolWith(web, { events: phoneReplied })
  await run(tool, { action: 'research', description: 'A small tennis club by the harbour' })
  await run(tool, { action: 'templates' })
  const [put] = web.calls.filter((c) => c.method === 'PUT')
  assert.deepEqual(put.body.question, issued)
})

test('a step that still works on the plan refuses an edit with its own sentence, never a stale plan', async () => {
  const say = 'I am still working on your plan, so it cannot change right now.'
  const web = fakeWeb({
    'POST /api/build-draft/edit': { status: 409, body: { code: 'ENGINE_BUSY', next: 'Wait.', say } }
  })
  const answer = await run(toolWith(web), {
    action: 'edit',
    changes: [{ field: 'facts.tagline', value: 'x' }]
  })
  assert.equal(answer.busy, true)
  assert.equal(answer.say, say)
  assert.equal(answer.stale, undefined, 'never told the plan moved')
  assert.equal(answer.ask, undefined)
  assert.match(answer.next, /say/)
  assert.deepEqual(shownOf('edit', answer), { row: null, retry: false })
})

test('a step started too often says the door sentence, asks nothing, and offers no Try again', async () => {
  const say = 'I have done this many times in a short while, so I paused here. Please try again later.'
  for (const [action, path, args] of [
    ['research', '/research', { links: ['https://harbour-lane.example'] }],
    ['plan', '/compose', {}]
  ]) {
    const web = fakeWeb({
      [`POST /api/build-draft${path}`]: { status: 429, body: { code: 'TRY_LATER', next: 'Stop.', say } }
    })
    const answer = await run(toolWith(web), { action, ...args })
    assert.equal(answer.paused, true, action)
    assert.equal(answer.say, say, action)
    assert.equal(answer.ask, undefined, action)
    assert.equal(answer.rerun, undefined, action)
    assert.deepEqual(shownOf(action, answer), { row: null, retry: false }, action)
    // Only the one door call: nothing is asked again.
    assert.equal(web.calls.length, 1, action)
  }
})

test('a body too large for a door, or a draft that holds no more questions, fails with a plain sentence', async () => {
  const web = fakeWeb({
    'POST /api/build-draft/edit': { status: 413, body: { code: 'BODY_TOO_LARGE', next: 'Smaller.' } }
  })
  const large = await run(toolWith(web), {
    action: 'edit',
    changes: [{ field: 'facts.tagline', value: 'x' }]
  })
  assert.equal(large.say, BODY_TOO_LARGE_SAY)
  assert.equal(large.stopped, undefined, 'not a fault of the step')
  assert.equal(large.ask, undefined)

  for (const [status, code, say] of [
    [422, 'TOO_MANY_QUESTIONS', ANSWERS_FULL_SAY],
    [413, 'BODY_TOO_LARGE', BODY_TOO_LARGE_SAY]
  ]) {
    const full = fakeWeb({
      'POST /api/build-draft/research': { body: researchDone },
      'PUT /api/build-draft/answers': { status, body: { code, next: 'No.' } },
      'GET /api/build-draft/templates': { body: { templates: [] } }
    })
    const tool = toolWith(full, { events: phoneReplied })
    await run(tool, { action: 'research', description: 'A small tennis club by the harbour' })
    const answer = await run(tool, { action: 'templates' })
    assert.equal(answer.say, say, code)
    assert.equal(answer.options, undefined, `${code}: the action waits, the answer is not dropped silently`)
    assert.ok(!full.calls.some((c) => c.path === '/api/build-draft/templates'), code)
  }
})

test('long work answers running, and status returns the result when it is done', async () => {
  const running = { body: { step: 'compose', state: 'running' } }
  const done = {
    body: { step: 'compose', state: 'done', result: { plan: PLAN, brand: 'own' } }
  }
  // 90 seconds of polls every 2 seconds still running, then done on the call after.
  const engine = Array.from({ length: 45 }, () => running)
  engine.push(done)
  const web = fakeWeb({
    'POST /api/build-draft/compose': { status: 202, body: { step: 'compose', state: 'running' } },
    'GET /api/build-draft/engine': engine
  })
  const tool = toolWith(web)
  const first = await run(tool, { action: 'plan' })
  assert.deepEqual(first, {
    running: true,
    say: BUILD_RUNNING_SAY,
    next: `${PRIVATE_GUIDANCE_MARK} Say the sentence in say, then call tracy_build with action status to keep waiting.`
  })
  const second = await run(tool, { action: 'status' })
  assert.deepEqual(second.plan, { id: 'plan-harbour-lane', revision: 1 })
  assert.equal(second.review.questions[0].intent.kind, 'plan-review')
  assert.equal(second.stopped, undefined)
})

test('a wait longer than one assertion lives polls with a fresh assertion, never a stale one', async () => {
  // The dsh assertion lives 60 seconds (dsh-passwords `ASSERTION_TTL_SECONDS`); tracy-web refuses an older one with
  // 401. A compose of 70 seconds must still come back as the plan, not as the stopped sentence.
  let clock = 0
  const TTL_MS = 60_000
  const running = { step: 'compose', state: 'running' }
  const done = { step: 'compose', state: 'done', result: { plan: PLAN, brand: 'own' } }
  const fresh = (headers) => clock - Number(headers['x-tracy-actor'].split(':')[1]) < TTL_MS
  const web = fakeWeb({
    'POST /api/build-draft/compose': { status: 202, body: running },
    'GET /api/build-draft/engine': (_body, calls) => {
      if (!fresh(calls.at(-1).headers)) return { status: 401, body: { code: 'NOT_SIGNED_IN' } }
      return { body: clock >= 70_000 ? done : running }
    }
  })
  const tool = createBuildTool({
    http: web.http,
    origin: () => ORIGIN,
    actorFor: () => `assertion-minted-at:${clock}`,
    eventsOf: () => [],
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    }
  })
  const answer = await run(tool, { action: 'plan' })
  assert.equal(answer.stopped, undefined, 'a long wait is not a fault')
  assert.deepEqual(answer.plan, { id: 'plan-harbour-lane', revision: 1 })
})

test('a stopped door answer yields stopped with the owner sentence and no ask', async () => {
  const web = fakeWeb({
    'POST /api/build-draft/research': {
      body: {
        step: 'research',
        state: 'stopped',
        say: 'Something went wrong on our side, so I stopped here. The Tracy team can see what happened and will look into it.',
        result: { ask: ASK }
      }
    }
  })
  const answer = await run(toolWith(web), { action: 'research', description: 'A small tennis club' })
  assert.deepEqual(answer, {
    stopped: true,
    say: 'Something went wrong on our side, so I stopped here. The Tracy team can see what happened and will look into it.'
  })
})

test('a stopped step the owner may have run again says so, with private guidance and no question', async () => {
  const say =
    'Something went wrong on our side, so I stopped here. The Tracy team can see what happened and will look into it.'
  const web = fakeWeb({
    'POST /api/build-draft/compose': { body: { step: 'compose', state: 'stopped', say, rerun: true } }
  })
  const answer = await run(toolWith(web), { action: 'plan' })
  assert.deepEqual(
    { stopped: answer.stopped, say: answer.say, step: answer.step, rerun: answer.rerun },
    { stopped: true, say, step: 'compose', rerun: true }
  )
  assert.ok(answer.next.startsWith(`${PRIVATE_GUIDANCE_MARK} `))
  assert.match(answer.next, /say the sentence in say and stop/i)
  assert.match(answer.next, /do not ask a question/i)
  assert.match(answer.next, /Please try again\./)
  // A stop without `rerun` stays exactly the sentence.
  const plain = fakeWeb({
    'POST /api/build-draft/compose': { body: { step: 'compose', state: 'stopped', say } }
  })
  assert.deepEqual(await run(toolWith(plain), { action: 'plan' }), { stopped: true, say })
})

test('faults never leak: a refused door, an unreachable tracy-web and nobody to act as all say the stopped sentence', async () => {
  const forbidden = fakeWeb({
    'POST /api/build-draft/compose': { status: 403, body: { code: 'NOT_BUILD_SESSION' } }
  })
  assert.deepEqual(await run(toolWith(forbidden), { action: 'plan' }), {
    stopped: true,
    say: BUILD_STOPPED_SAY
  })
  const broken = {
    http: async () => {
      throw new Error('connect ECONNREFUSED')
    }
  }
  assert.deepEqual(await run(toolWith(broken), { action: 'templates' }), {
    stopped: true,
    say: BUILD_STOPPED_SAY
  })
  const nobody = fakeWeb({})
  assert.deepEqual(await run(toolWith(nobody, { actor: null }), { action: 'templates' }), {
    stopped: true,
    say: BUILD_STOPPED_SAY
  })
  assert.equal(nobody.calls.length, 0)
})

test('brand unavailable yields stopped: the plan is never composed with the template standing in', async () => {
  for (const body of [
    { step: 'compose', state: 'done', result: { plan: PLAN, brand: 'unavailable' } },
    { step: 'compose', state: 'stopped', reason: 'brand-unavailable' }
  ]) {
    const web = fakeWeb({ 'POST /api/build-draft/compose': { body } })
    assert.deepEqual(await run(toolWith(web), { action: 'plan', request: 'Make it feel calm' }), {
      stopped: true,
      say: BUILD_STOPPED_SAY
    })
    assert.deepEqual(web.calls[0].body, { request: 'Make it feel calm' })
  }
})

test('plan with no request on a draft that holds a plan: the plan did not change, and the model is told so', async () => {
  const say =
    'Your plan is unchanged. You can change any value on the card, tell me what to change, or ask me to start the plan over.'
  const kept = { ...PLAN, revision: 2 }
  const web = fakeWeb({
    'POST /api/build-draft/compose': {
      body: { step: 'compose', state: 'done', say, result: { plan: kept, brand: 'own', unchanged: true } }
    }
  })
  const answered = await run(toolWith(web), { action: 'plan' })
  assert.equal(answered.unchanged, true)
  assert.equal(answered.say, say)
  assert.deepEqual(answered.plan, { id: kept.id, revision: 2 })
  assert.ok(answered.review, 'the owner can still approve or ask again on the review card')
  assert.match(answered.next, /did not change/)
  assert.match(answered.next, /Never say the plan changed/)
  // A door sentence that is not plain is never passed on.
  const dashed = fakeWeb({
    'POST /api/build-draft/compose': {
      body: {
        step: 'compose',
        state: 'done',
        say: `Kept ${String.fromCodePoint(0x2014)} as is`,
        result: { plan: kept, brand: 'own', unchanged: true }
      }
    }
  })
  assert.equal((await run(toolWith(dashed), { action: 'plan' })).say, UNCHANGED_FALLBACK_SAY)
})

test('plan with a request on a living plan waits on the revise step and hands on its lines, never the codes', async () => {
  const revised = { ...PLAN, revision: 3 }
  const notDone = [
    { what: 'A pink look', reason: 'outside_plan', why: 'The colour is changed on the plan card.' },
    { what: 'A prices page', reason: 'no_recipe', why: 'Your template has no prices page.' }
  ]
  const web = fakeWeb({
    'POST /api/build-draft/compose': { body: { step: 'revise', state: 'running' } },
    'GET /api/build-draft/engine': {
      body: {
        step: 'revise',
        state: 'done',
        result: {
          plan: revised,
          brand: 'own',
          unchanged: false,
          revision: { changed: ['The Coaches page is now called Our team.'], notDone }
        }
      }
    }
  })
  const text = 'Call the coaches page Our team, make it pink and add prices.'
  const answered = await run(toolWith(web), { action: 'plan', request: text })
  assert.deepEqual(web.calls[0].body, { request: text })
  assert.deepEqual(answered.plan, { id: revised.id, revision: 3 })
  assert.equal(answered.unchanged, false)
  assert.deepEqual(answered.revision, {
    changed: ['The Coaches page is now called Our team.'],
    notDone: notDone.map(({ what, why }) => ({ what, why }))
  })
  assert.equal(JSON.stringify(answered).includes('outside_plan'), false, 'no reason code reaches the model')
  assert.ok(answered.review)
  assert.match(answered.next, /word for word/)
  assert.match(answered.next, /plan card/)
  // The card offers only business facts, service names and the main colour: the guidance names no other control.
  assert.match(answered.next, /a business fact, a service name or the main colour/)
  assert.doesNotMatch(answered.next, /change the language|number of pictures|the look or/i)
  assert.match(answered.next, /Do not say anything else changed/)
  // Nothing changed: the model says so, and what was not done.
  const same = fakeWeb({
    'POST /api/build-draft/compose': {
      body: {
        step: 'revise',
        state: 'done',
        result: { plan: PLAN, brand: 'own', unchanged: true, revision: { changed: [], notDone } }
      }
    }
  })
  const nothing = await run(toolWith(same), { action: 'plan', request: 'Make it pop.' })
  assert.equal(nothing.unchanged, true)
  assert.match(nothing.next, /Nothing on the plan changed/)
})

test('the stable line codes of a revise step reach the plan card beside their lines; none when it sent none', async () => {
  const revised = { ...PLAN, revision: 3 }
  const result = (revision) =>
    fakeWeb({
      'POST /api/build-draft/compose': {
        body: {
          step: 'revise',
          state: 'done',
          result: { plan: revised, brand: 'own', unchanged: false, revision }
        }
      }
    })
  const coded = await run(
    toolWith(
      result({
        changed: ['Your answer is saved: Opening hours, Mon to Sat 06:30 to 21:30.', 5, 'A model line.'],
        notDone: [
          { what: 'Services', reason: 'outside_plan', why: 'The plan already has this page.' },
          { what: 'bad' }
        ],
        codes: { changed: ['owner_value_saved', 'x', null], notDone: ['page_already_on_plan', 'y'] }
      })
    ),
    { action: 'plan', request: 'We open Mon to Sat 06:30 to 21:30.' }
  )
  assert.deepEqual(coded.revision, {
    changed: ['Your answer is saved: Opening hours, Mon to Sat 06:30 to 21:30.', 'A model line.'],
    notDone: [{ what: 'Services', why: 'The plan already has this page.' }],
    codes: { changed: ['owner_value_saved', null], notDone: ['page_already_on_plan'] }
  })
  assert.match(coded.next, /never say a code/)
  const plain = await run(toolWith(result({ changed: ['A line.'], notDone: [] })), {
    action: 'plan',
    request: 'Please change it.'
  })
  assert.equal('codes' in plain.revision, false)
})

test('a request longer than a change request holds is never sent: the owner is asked again in plain words', async () => {
  const web = fakeWeb({})
  const answered = await run(toolWith(web), { action: 'plan', request: 'a'.repeat(1001) })
  assert.equal(web.calls.length, 0)
  assert.equal(answered.say, 'That request is too long. Please use 1000 characters or fewer.')
  assert.match(answered.next, /shorter/)
})

test('plan sends restart only when it is true: starting over is its own intent', async () => {
  const web = fakeWeb({ 'POST /api/build-draft/compose': { body: { step: 'compose', state: 'running' } } })
  const tool = toolWith(web, { waitMs: 0 })
  await run(tool, { action: 'plan', restart: true })
  await run(tool, { action: 'plan', restart: 'yes', request: 'Start again' })
  await run(tool, { action: 'plan', restart: false })
  assert.deepEqual(
    web.calls.map((c) => c.body),
    [{ restart: true }, { request: 'Start again' }, {}]
  )
  const restart = BUILD_PARAMETERS.properties.restart
  assert.equal(restart.type, 'boolean')
  assert.match(restart.description, /ONLY when the owner clearly asks to start the plan over/)
  assert.match(BUILD_DESCRIPTION, /restart/)
})

test('plan waits on the brand step it started, then says to ask for the plan again', async () => {
  const web = fakeWeb({
    'POST /api/build-draft/compose': { body: { step: 'brand', state: 'running' } },
    'GET /api/build-draft/engine': [
      { body: { step: 'brand', state: 'running' } },
      { body: { step: 'brand', state: 'done', result: { look: 'ready' } } }
    ]
  })
  const answered = await run(toolWith(web), { action: 'plan' })
  assert.equal(answered.look, 'ready')
  assert.match(answered.next, /action plan again/)
  assert.equal(answered.stopped, undefined)
  // A brand step that stopped is a stop with its sentence, never a plan with the template look.
  const stoppedWeb = fakeWeb({
    'POST /api/build-draft/compose': {
      body: {
        step: 'brand',
        state: 'stopped',
        say: 'We could not read your brand yet.',
        reason: 'brand-unavailable'
      }
    }
  })
  assert.deepEqual(await run(toolWith(stoppedWeb), { action: 'plan' }), {
    stopped: true,
    say: 'We could not read your brand yet.'
  })
})

test('templates come back as the card options; edit forwards changes and returns the review', async () => {
  const option = {
    slug: 'ja-sport',
    name: 'Sport',
    version: '1.0.0',
    picture: 'https://tracy.example/t/ja-sport.png',
    reason: 'Made for clubs with classes and coaches',
    quickstart: 'released',
    fits: true
  }
  const web = fakeWeb({
    'GET /api/build-draft/templates': {
      body: { templates: [option, { ...option, slug: 'ja-old', fits: false }] }
    },
    'POST /api/build-draft/edit': (body) => ({
      body: {
        step: 'edit',
        state: 'done',
        result: { plan: { ...PLAN, revision: 2 }, brand: 'own' },
        echo: body
      }
    })
  })
  const tool = toolWith(web)
  const shown = await run(tool, { action: 'templates' })
  assert.deepEqual([shown.options, shown.none], [[option], false])
  const changes = [{ field: 'pages[home].name', value: 'Welcome' }]
  const edited = await run(tool, { action: 'edit', changes })
  assert.deepEqual(web.calls[1].body, { changes })
  assert.deepEqual(edited.plan, { id: 'plan-harbour-lane', revision: 2 })
  assert.ok(edited.review)
})

test('an edit the plan refuses comes back with owner readable problems, not as a question', async () => {
  const web = fakeWeb({
    'POST /api/build-draft/edit': {
      status: 422,
      body: { code: 'INVALID_EDIT', problems: ['The page name is too long.'] }
    }
  })
  const answer = await run(toolWith(web), {
    action: 'edit',
    changes: [{ field: 'pages[home].name', value: 'x' }]
  })
  assert.equal(answer.refused, true)
  assert.deepEqual(answer.problems, ['The page name is too long.'])
  assert.equal(answer.ask, undefined)
})

test('a 409 that names a missing step says which step to take; only a stale edit says retry', async () => {
  const cases = [
    ['plan', 'POST /api/build-draft/compose', 'NO_RESEARCH', 'research', /action research/],
    ['plan', 'POST /api/build-draft/compose', 'NO_TEMPLATE', 'template', /action templates/],
    ['plan', 'POST /api/build-draft/compose', 'NO_KIT', 'template', /another one/],
    ['edit', 'POST /api/build-draft/edit', 'NO_PLAN', 'plan', /action plan/]
  ]
  for (const [action, route, code, missing, next] of cases) {
    const web = fakeWeb({ [route]: { status: 409, body: { code, next: 'for a developer' } } })
    const answer = await run(toolWith(web), {
      action,
      ...(action === 'edit' ? { changes: [{ field: 'pages[home].name', value: 'Home' }] } : {})
    })
    assert.equal(answer.missing, missing, code)
    assert.match(answer.next, next, code)
    assert.equal(answer.stale, undefined, code)
    assert.equal(
      web.calls.filter((c) => c.path === new URL(`${ORIGIN}${route.split(' ')[1]}`).pathname).length,
      1
    )
  }
  const stale = fakeWeb({ 'POST /api/build-draft/edit': { status: 409, body: { code: 'STALE_EDIT' } } })
  const answer = await run(toolWith(stale), {
    action: 'edit',
    changes: [{ field: 'pages[home].name', value: 'H' }]
  })
  assert.equal(answer.stale, true)
  assert.equal(answer.missing, undefined)
})

/** The `ask_user_question` dispatch of a review request, passed on as the model would. */
const reviewAsked = (review, sessionId = SESSION) => ({
  name: 'ask_user_question',
  agent: { session: { id: sessionId } },
  arguments: {
    questions: review.questions.map(({ id, question, options }) => ({ id, question, options }))
  }
})

/** One `ask_user_question` dispatch as dsh's tool guard sees it. */
const asking = (ids, sessionId = SESSION) => ({
  name: 'ask_user_question',
  agent: { session: { id: sessionId } },
  arguments: { questions: ids.map((id) => ({ id, question: `Question ${id}?` })) }
})

test('the guard refuses a question the engine did not issue, and allows issued ones and the plan review', async () => {
  const web = fakeWeb({
    'POST /api/build-draft/research': { body: researchDone },
    'POST /api/build-draft/compose': {
      body: { step: 'compose', state: 'done', result: { plan: PLAN, brand: 'own' } }
    }
  })
  const tool = toolWith(web)
  // Before the engine issued anything, no question passes.
  assert.equal(typeof tool.guard(asking(['phone'])), 'string')
  assert.equal(typeof tool.guard(asking(['plan-review'])), 'string')
  await run(tool, { action: 'research', description: 'A small tennis club' })
  assert.equal(tool.guard(asking(['phone', 'language'])), undefined)
  assert.equal(typeof tool.guard(asking(['phone', 'opening-hours'])), 'string')
  assert.equal(typeof tool.guard(asking([])), 'string')
  assert.equal(typeof tool.guard(asking(['plan-review'])), 'string', 'no plan, no review')
  const planned = await run(tool, { action: 'plan' })
  assert.equal(tool.guard(reviewAsked(planned.review)), undefined)
  // Other tools, and sessions that are not build chats, are not this guard's business.
  assert.equal(tool.guard({ ...asking(['anything']), name: 'web_search' }), undefined)
  assert.equal(tool.guard(asking(['anything'], 'session-0f3c2a8e-1b2d-4c5e-8f90-a1b2c3d4e5f6')), undefined)
  // Arguments sent as a JSON string are read the same way.
  assert.equal(
    typeof tool.guard({ ...asking([]), arguments: JSON.stringify({ questions: [{ id: 'made-up' }] }) }),
    'string'
  )
})

test('the engine may issue more than three questions: every issued one passes the guard', async () => {
  const many = Array.from({ length: 6 }, (_, n) => ({ ...PHONE, id: `conflict-${n}`, fact: `fact.${n}` }))
  const web = fakeWeb({
    'POST /api/build-draft/research': {
      body: { step: 'research', state: 'done', result: { profile: PROFILE, questions: many } }
    }
  })
  const tool = toolWith(web)
  await run(tool, { action: 'research', description: 'A small tennis club' })
  assert.equal(tool.guard(asking(many.map((q) => q.id))), undefined)
})

test('the issued questions are learned again from the engine door after a restart', async () => {
  const events = [
    { type: 'tool/call', data: { name: 'ask_user_question', callId: 'q1', arguments: ASK } },
    {
      type: 'tool/result',
      data: {
        message: {
          source: { callId: 'q1' },
          content: [
            {
              type: 'text',
              text: JSON.stringify({ answers: [{ id: 'phone', selected: [], custom: '04 000 0001' }] })
            }
          ]
        }
      }
    }
  ]
  const web = fakeWeb({
    'GET /api/build-draft/engine': { body: { step: 'research', state: 'done', result: researchDone.result } },
    'PUT /api/build-draft/answers': { body: { draft: {} } },
    'GET /api/build-draft/templates': { body: { templates: [] } }
  })
  const tool = toolWith(web, { events })
  const answer = await run(tool, { action: 'templates' })
  assert.deepEqual([answer.options, answer.none], [[], true])
  const put = web.calls.find((c) => c.method === 'PUT')
  assert.deepEqual(put.body.answer, {
    schema: 'tracy-build-answer/v1',
    question: 'phone',
    text: '04 000 0001'
  })
})

/** The site name question (#593 G4): free text only, no choice; its limit is the chosen design's. */
const SITE_NAME = {
  schema: 'tracy-build-question/v1',
  id: 'site-name',
  topic: 'site-name',
  prompt: 'You asked us to keep your business name off the site. What name should the site show instead?',
  choices: [],
  freeText: { maxLength: 20, placeholder: 'Type your answer' }
}
const SITE_NAME_ASK = {
  questions: [{ id: 'site-name', question: SITE_NAME.prompt, options: [], multiSelect: false }]
}
const TOO_LONG_SAY = 'That name is too long for this design. Please use 20 characters or fewer.'
/** The compose step ended asking the owner for the site name, as `GET /engine` answers it. */
const composeAsking = (say) => ({
  step: 'compose',
  state: 'asking',
  ...(say ? { say } : {}),
  result: { questions: [SITE_NAME], ask: SITE_NAME_ASK }
})
/** The session log of one `ask_user_question` card per reply, each answered by its typed text, oldest first. */
const typedReplies = (...texts) =>
  texts.flatMap((custom, n) => [
    { type: 'tool/call', data: { name: 'ask_user_question', callId: `name-${n}`, arguments: SITE_NAME_ASK } },
    {
      type: 'tool/result',
      data: {
        message: {
          source: { callId: `name-${n}` },
          content: [
            { type: 'text', text: JSON.stringify({ answers: [{ id: 'site-name', selected: [], custom }] }) }
          ]
        }
      }
    }
  ])

test('a plan that needs the site name hands the question on as ask, then the agent asks for the plan again', async () => {
  const web = fakeWeb({ 'POST /api/build-draft/compose': { body: composeAsking() } })
  const tool = toolWith(web)
  assert.equal(typeof tool.guard(asking(['site-name'])), 'string', 'not issued yet')
  const answer = await run(tool, { action: 'plan' })
  assert.equal(answer.stopped, undefined)
  assert.deepEqual(answer.ask, SITE_NAME_ASK)
  assert.equal(answer.say, undefined)
  assert.match(answer.next, /ask_user_question/)
  assert.match(answer.next, /action plan again/)
  assert.equal(tool.guard(asking(['site-name'])), undefined, 'issued by the engine, so it passes')
  assert.equal(typeof tool.guard(asking(['site-name', 'business-name'])), 'string')
  // A name that did not fit comes with its sentence for the owner.
  const again = await run(
    toolWith(fakeWeb({ 'POST /api/build-draft/compose': { body: composeAsking(TOO_LONG_SAY) } })),
    {
      action: 'plan'
    }
  )
  assert.equal(again.say, TOO_LONG_SAY)
  assert.deepEqual(again.ask, SITE_NAME_ASK)
  assert.match(again.next, /say/)
})

test('research that issues the site name question lets it through the guard; its typed reply is stored once', async () => {
  const issued = {
    step: 'research',
    state: 'done',
    result: {
      profile: PROFILE,
      questions: [SITE_NAME, PHONE],
      ask: { questions: [...SITE_NAME_ASK.questions] }
    }
  }
  const events = []
  const web = fakeWeb({
    'POST /api/build-draft/research': { body: issued },
    'PUT /api/build-draft/answers': { body: { draft: {} } },
    'GET /api/build-draft/templates': { body: { templates: [] } }
  })
  const tool = toolWith(web, { events })
  await run(tool, { action: 'research', description: 'A small tennis club' })
  assert.equal(tool.guard({ ...asking([]), arguments: SITE_NAME_ASK }), undefined)
  events.push(...typedReplies('Riverside Courts'))
  await run(tool, { action: 'templates' })
  await run(tool, { action: 'templates' })
  const puts = web.calls.filter((c) => c.method === 'PUT')
  assert.equal(puts.length, 1)
  assert.deepEqual(puts[0].body, {
    question: SITE_NAME,
    answer: { schema: 'tracy-build-answer/v1', question: 'site-name', text: 'Riverside Courts' }
  })
})

test('a typed reply past the limit is not stored: the owner is asked again with the limit, then a shorter one is', async () => {
  const events = []
  const web = fakeWeb({
    'POST /api/build-draft/compose': { body: composeAsking() },
    'PUT /api/build-draft/answers': { body: { draft: {} } }
  })
  const tool = toolWith(web, { events })
  await run(tool, { action: 'plan' })
  events.push(...typedReplies('Riverside Courts and Racquets'))
  const again = await run(tool, { action: 'plan' })
  assert.equal(again.say, TOO_LONG_SAY)
  assert.deepEqual(again.ask, SITE_NAME_ASK)
  assert.equal(web.calls.filter((c) => c.method === 'PUT').length, 0, 'never stored')
  assert.equal(
    web.calls.filter((c) => c.path.endsWith('/compose')).length,
    1,
    'the plan is not asked for meanwhile'
  )
  events.push(...typedReplies('Riverside Courts'))
  await run(tool, { action: 'plan' })
  const puts = web.calls.filter((c) => c.method === 'PUT')
  assert.deepEqual(
    puts.map((c) => c.body.answer.text),
    ['Riverside Courts']
  )
})

/** The log of a plan review of one plan revision the owner answered with the given button. */
function reviewed(label, revision = 1, callId = 'r1') {
  const id = `plan-review:${PLAN.id}:${revision}`
  return [
    { type: 'tool/call', data: { name: 'ask_user_question', callId, arguments: '{}' } },
    {
      type: 'tool/result',
      data: {
        message: {
          source: { callId },
          content: [{ type: 'text', text: JSON.stringify({ answers: [{ id, selected: [label] }] }) }]
        }
      }
    }
  ]
}
const COMPOSED = { body: { step: 'compose', state: 'done', result: { plan: PLAN, brand: 'own' } } }
const building = (state, extra = {}) => ({
  body: { build: { id: 'b1', plan: { id: PLAN.id, revision: 1 }, state, ...extra }, run: { events: [] } }
})

test('build approves the plan last shown, only after the owner pressed Approve, and reads the build until it ends', async () => {
  const events = []
  const web = fakeWeb({
    'POST /api/build-draft/compose': COMPOSED,
    'POST /api/build-draft/build': building('creating'),
    'GET /api/build-draft/build': [
      building('building'),
      building('done', { workspacePath: '/site/harbour-lane' })
    ]
  })
  const tool = toolWith(web, { events })
  await run(tool, { action: 'plan' })
  // Not approved yet: no door is asked.
  const early = await run(tool, { action: 'build' })
  assert.equal(early.refused, true)
  assert.equal(web.calls.filter((c) => c.path.endsWith('/build')).length, 0)
  events.push(...reviewed('Approve'))
  const answer = await run(tool, { action: 'build' })
  assert.equal(answer.built, true)
  assert.equal(
    answer.say,
    'Your site is ready. You can see it in the Browser tab, and you can ask me here for any change.'
  )
  assert.equal(answer.workspacePath, '/site/harbour-lane')
  const post = web.calls.find((c) => c.method === 'POST' && c.path === '/api/build-draft/build')
  assert.deepEqual(post.body, { plan: { id: PLAN.id, revision: 1 } })
  assert.equal(post.headers['x-tracy-session'], SESSION)
})

test('Change the plan is no approval, and a build still running after the wait says so without claiming it is built', async () => {
  const changes = await run(toolWith(fakeWeb({}), { events: reviewed('Change the plan') }), {
    action: 'build'
  })
  assert.equal(changes.refused, true)
  const web = fakeWeb({
    'POST /api/build-draft/compose': COMPOSED,
    'POST /api/build-draft/build': building('creating'),
    'GET /api/build-draft/build': building('building')
  })
  const tool = toolWith(web, { events: reviewed('Approve'), waitMs: 10_000 })
  await run(tool, { action: 'plan' })
  const answer = await run(tool, { action: 'build' })
  assert.equal(answer.building, true)
  assert.equal(answer.built, undefined)
  assert.ok(answer.next.startsWith(PRIVATE_GUIDANCE_MARK))
})

test('after a restart the plan is the one the answered review named; a stopped build is one plain sentence', async () => {
  const web = fakeWeb({
    'GET /api/build-draft': { body: { draft: { plan: { ...PLAN, revision: 5 } } } },
    'POST /api/build-draft/build': building('stopped')
  })
  const answer = await run(toolWith(web, { events: reviewed('Approve', 4) }), { action: 'build' })
  assert.deepEqual(answer, {
    stopped: true,
    say: 'Your site could not be built this time. The Tracy team can see what happened and will look into it.'
  })
  assert.deepEqual(
    web.calls.find((c) => c.method === 'POST').body,
    { plan: { id: PLAN.id, revision: 4 } },
    'never the draft revision of now'
  )
  assert.equal(/[–—]/.test(JSON.stringify(answer)), false)
})

test('a plan edited after the owner pressed Approve is never built: the owner is shown the current plan again', async () => {
  const events = []
  const revised = { ...PLAN, revision: 2, look: { ...PLAN.look, accent: '#FF0000' } }
  const web = fakeWeb({
    'POST /api/build-draft/compose': COMPOSED,
    'POST /api/build-draft/edit': {
      body: { step: 'edit', state: 'done', result: { plan: revised, brand: 'own' } }
    },
    // The door builds only the current revision (STALE_PLAN otherwise), as `POST /build` documents.
    'POST /api/build-draft/build': (body) =>
      body?.plan?.revision === 2 ? building('creating') : { status: 409, body: { code: 'STALE_PLAN' } },
    'GET /api/build-draft': { body: { draft: { plan: revised } } }
  })
  const tool = toolWith(web, { events })
  await run(tool, { action: 'plan' })
  events.push(...reviewed('Approve', 1))
  // The model changes the plan after the owner approved revision 1, then asks to build.
  await run(tool, { action: 'edit', changes: [{ field: 'look.accent', value: '#FF0000' }] })
  const answer = await run(tool, { action: 'build' })
  const post = web.calls.find((c) => c.method === 'POST' && c.path === '/api/build-draft/build')
  assert.deepEqual(post.body, { plan: { id: PLAN.id, revision: 1 } }, 'the revision the owner reviewed')
  assert.equal(answer.built, undefined)
  assert.equal(answer.building, undefined)
  assert.equal(answer.stale, true)
  assert.deepEqual(answer.plan, { id: PLAN.id, revision: 2 })
  const [review] = answer.review.questions
  assert.equal(review.id, `plan-review:${PLAN.id}:2`, 'the current plan, reviewed again')
  assert.match(answer.next, /ask_user_question with review/)
  assert.equal(tool.guard(reviewAsked(answer.review)), undefined)
})

test('the guard lets the plan review through only exactly as handed out: never relabelled or translated', async () => {
  const web = fakeWeb({ 'POST /api/build-draft/compose': COMPOSED })
  const tool = toolWith(web)
  const planned = await run(tool, { action: 'plan' })
  assert.equal(tool.guard(reviewAsked(planned.review)), undefined)
  const [q] = planned.review.questions
  const relabelled = { questions: [{ ...q, options: [{ label: 'Approuver' }, { label: 'Modifier' }] }] }
  assert.equal(typeof tool.guard(reviewAsked(relabelled)), 'string')
  const invented = { questions: [{ ...q, options: [...q.options, { label: 'Build it now' }] }] }
  assert.equal(typeof tool.guard(reviewAsked(invented)), 'string')
  const older = { questions: [{ ...q, id: `plan-review:${PLAN.id}:0` }] }
  assert.equal(typeof tool.guard(reviewAsked(older)), 'string', 'a revision never handed out')
})

test('a poll that fails while the build runs is not a failed build: the tool keeps reading, then says the truth', async () => {
  const web = fakeWeb({
    'POST /api/build-draft/compose': COMPOSED,
    'POST /api/build-draft/build': building('creating'),
    'GET /api/build-draft/build': ['network', { status: 502, body: {} }, building('done')]
  })
  const tool = toolWith(web, { events: reviewed('Approve') })
  await run(tool, { action: 'plan' })
  const answer = await run(tool, { action: 'build' })
  assert.equal(answer.built, true, 'one timed out poll and one 502 are not the outcome')
  // Every poll fails until the wait ends: still building as far as anyone knows, never "could not be built".
  const blind = fakeWeb({
    'POST /api/build-draft/compose': COMPOSED,
    'POST /api/build-draft/build': building('creating'),
    'GET /api/build-draft/build': 'network'
  })
  const waiting = toolWith(blind, { events: reviewed('Approve'), waitMs: 20_000 })
  await run(waiting, { action: 'plan' })
  const unknown = await run(waiting, { action: 'build' })
  assert.equal(unknown.stopped, undefined)
  assert.equal(unknown.building, true)
  assert.equal(unknown.say, BUILD_UNCHECKED_SAY)
  const polls = blind.calls.filter((c) => c.method === 'GET' && c.path === '/api/build-draft/build')
  assert.ok(polls.length < 10, `polls back off when they keep failing (${polls.length})`)
})

test('a POST that times out after the build was created is read back, not reported as a failed build', async () => {
  const web = fakeWeb({
    'POST /api/build-draft/compose': COMPOSED,
    'POST /api/build-draft/build': 'network',
    'GET /api/build-draft/build': building('done')
  })
  const tool = toolWith(web, { events: reviewed('Approve') })
  await run(tool, { action: 'plan' })
  assert.equal((await run(tool, { action: 'build' })).built, true)
})

test('a poll that fails while an engine step runs is not a stop: the step that finishes after it is reported', async () => {
  const web = fakeWeb({
    'POST /api/build-draft/compose': { status: 202, body: { step: 'compose', state: 'running' } },
    'GET /api/build-draft/engine': [
      'network',
      { status: 503, body: {} },
      { body: { step: 'compose', state: 'done', result: { plan: PLAN, brand: 'own' } } }
    ]
  })
  const answer = await run(toolWith(web), { action: 'plan' })
  assert.deepEqual(answer.plan, { id: PLAN.id, revision: 1 })
})

test('the build chat switched off is said plainly, never as a fault the team looks into', async () => {
  const web = fakeWeb({
    'POST /api/build-draft/compose': { status: 403, body: { code: 'BUILD_CHAT_OFF' } }
  })
  const answer = await run(toolWith(web), { action: 'plan' })
  assert.equal(answer.stopped, true)
  assert.equal(answer.say, BUILD_CHAT_OFF_SAY)
  assert.notEqual(answer.say, BUILD_STOPPED_SAY)
})

test('a plan of an older shape never throws out of the tool: it is one plain stopped sentence', async () => {
  const old = { ...PLAN, pictures: undefined, look: { template: 'ja-sport' } }
  const web = fakeWeb({
    'POST /api/build-draft/compose': {
      body: { step: 'compose', state: 'done', result: { plan: old, brand: 'own' } }
    }
  })
  const answer = await run(toolWith(web), { action: 'plan' })
  assert.equal(answer.ask, undefined)
  assert.ok(answer.stopped === true || answer.review, 'a stopped sentence or a review, never a raw error')
})

test('a plan that moved since approval, or a change asked while the build runs, is never retried blindly', async () => {
  const web = fakeWeb({
    'POST /api/build-draft/compose': COMPOSED,
    'POST /api/build-draft/build': { status: 409, body: { code: 'STALE_PLAN' } },
    'POST /api/build-draft/edit': { status: 409, body: { code: 'BUILD_RUNNING' } }
  })
  const tool = toolWith(web, { events: reviewed('Approve') })
  await run(tool, { action: 'plan' })
  assert.equal((await run(tool, { action: 'build' })).stale, true)
  const edit = await run(tool, { action: 'edit', changes: [{ field: 'look.accent', value: '#1F4E9C' }] })
  assert.equal(edit.building, true)
  assert.equal(edit.say, BUILD_LOCKED_SAY)
  assert.equal(edit.ask, undefined)
})

test('the door and the tool say the shared owner sentences with the same words', async () => {
  // apps/tracy-web cannot import @tracy/core (its image does not carry it), so it keeps copies; they must not drift.
  const core = await import('@tracy/core/build-chat')
  const door = await import('../../../../apps/tracy-web/src/build-draft/engine-state.js')
  const revise = await import('../../../../apps/tracy-web/src/build-draft/engine-revise.js')
  const store = await import('../../../../apps/tracy-web/src/build-draft/store.js').catch(() => null)
  assert.equal(door.SAY.fault, core.FAULT_SAY)
  assert.equal(door.UNCHANGED_SAY, core.UNCHANGED_SAY)
  assert.equal(door.siteNameTooLongSay(20), core.nameTooLongSay(20))
  assert.equal(revise.requestTooLongSay(1000), core.requestTooLongSay(1000))
  if (store) assert.equal(store.TEMPLATE_CHANGE_SAY, core.DESIGN_CHANGE_SAY)
})
