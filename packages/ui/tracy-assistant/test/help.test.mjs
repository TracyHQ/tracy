/**
 * Help's controller (`src/client/help.ts`) against a fake `fetch` and a fake row list: what a
 * `/help` question sends, how questions queue, and that nothing ever touches the agent.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  answerTextOf,
  createHelp,
  HELP_KIND,
  MAX_WAITING,
  sentFilesOf,
  startPressOf,
  streamingRowOf
} from '../src/client/help.ts'

const enc = new TextEncoder()

/** A streaming SSE response whose body the test releases piece by piece. */
function sse(frames) {
  let controller
  const body = new ReadableStream({ start: (c) => (controller = c) })
  return {
    res: { ok: true, status: 200, body, json: async () => ({}) },
    push: (event, data) =>
      controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
    end: () => controller.close(),
    frames
  }
}

function setup(responses, opts = {}) {
  const calls = []
  const rows = new Map()
  const fetch = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null, method: init?.method ?? 'GET' })
    const next = responses.shift()
    return typeof next === 'function' ? next() : next
  }
  const help = createHelp({
    sessionId: 's1',
    rows: {
      upsert: (r) => rows.set(r.id, r),
      remove: (id) => rows.delete(id),
      tailSeq: () => 41
    },
    fetch,
    site: () => 'shop.tracy.site',
    ...(opts.transcriptShown ? { transcriptShown: opts.transcriptShown } : {}),
    ...(opts.start ? { start: opts.start } : {})
  })
  return { help, calls, rows }
}

const tick = () => new Promise((r) => setTimeout(r, 0))
const turns = (calls) => calls.filter((c) => c.url === '/api/assistant/turns')

test('a question posts the text, the session and the anchor seq, and streams into one row', async () => {
  const a = sse()
  const { help, calls, rows } = setup([a.res])
  help.ask('  how do I undo?  ')
  await tick()
  assert.equal(turns(calls).length, 1)
  assert.deepEqual(turns(calls)[0].body, {
    message: 'how do I undo?',
    site: 'shop.tracy.site',
    session: { id: 's1', anchorSeq: 41 }
  })
  a.push('meta', { conversationId: 'c1', turnId: '5', links: [{ href: '/x/', label: 'x' }] })
  a.push('delta', { text: 'Use ' })
  a.push('delta', { text: 'Site changes.' })
  a.push('done', {})
  a.end()
  await tick()
  await tick()
  const row = [...rows.values()][0]
  assert.equal(row.anchorSeq, 41)
  assert.equal(row.data.answer, 'Use Site changes.')
  assert.equal(row.data.status, 'done')
  assert.equal(row.data.question, 'how do I undo?')
})

test('a bare /help draws a greeting, once, and calls nothing', async () => {
  const { help, calls, rows } = setup([])
  help.ask('')
  help.ask('   ')
  assert.equal(calls.length, 0)
  assert.equal(rows.size, 1)
  assert.equal([...rows.values()][0].data.variant, 'greeting')
})

test('a second question waits for the first and is sent after it; no two posts overlap', async () => {
  const a = sse()
  const b = sse()
  const { help, calls, rows } = setup([a.res, b.res])
  help.ask('one')
  help.ask('two')
  await tick()
  assert.equal(turns(calls).length, 1)
  assert.equal([...rows.values()].find((r) => r.data.question === 'two').data.status, 'queued')
  a.push('delta', { text: 'A' })
  a.push('done', {})
  a.end()
  await tick()
  await tick()
  assert.equal(turns(calls).length, 2)
  assert.equal(turns(calls)[1].body.message, 'two')
})

test(`only ${MAX_WAITING} questions may wait; the next is refused on screen, not sent`, async () => {
  const a = sse()
  const { help, calls, rows } = setup([a.res])
  for (const q of ['q0', 'q1', 'q2', 'q3', 'q4']) help.ask(q)
  await tick()
  assert.equal(turns(calls).length, 1)
  const refused = [...rows.values()].filter((r) => r.data.error === 'error.queueFull')
  assert.equal(refused.length, 1)
  assert.equal(refused[0].data.question, 'q4')
})

test('removing a waiting question drops it and it is never sent', async () => {
  const a = sse()
  const b = sse()
  const { help, calls, rows } = setup([a.res, b.res])
  help.ask('first')
  help.ask('second')
  await tick()
  const second = [...rows.values()].find((r) => r.data.question === 'second')
  help.remove(second.id)
  a.push('done', {})
  a.end()
  await tick()
  await tick()
  assert.equal(turns(calls).length, 1)
  assert.equal(rows.has(second.id), false)
})

test('Stop ends all of Help: the answer keeps what arrived, the waiting questions are stopped and never sent', async () => {
  const a = sse()
  const b = sse()
  const { help, calls, rows } = setup([a.res, b.res])
  help.ask('long')
  help.ask('next')
  help.ask('third')
  await tick()
  a.push('delta', { text: 'partial' })
  await tick()
  const byQuestion = (q) => [...rows.values()].find((r) => r.data.question === q)
  help.stopAll()
  // The waiting questions are stopped at once, before the aborted read settles.
  assert.equal(byQuestion('next').data.status, 'stopped')
  assert.equal(byQuestion('third').data.status, 'stopped')
  a.end()
  await tick()
  await tick()
  assert.equal(byQuestion('long').data.answer, 'partial')
  assert.equal(byQuestion('long').data.status, 'stopped')
  assert.equal(turns(calls).length, 1)
  // A question asked after the stop is answered as usual.
  help.ask('again')
  await tick()
  assert.equal(turns(calls).length, 2)
  assert.equal(byQuestion('again').data.status, 'streaming')
})

test('a 429 on the day window names it, pauses the queue and keeps the waiting question', async () => {
  const limited = {
    ok: false,
    status: 429,
    body: null,
    json: async () => ({ code: 'RATE_LIMITED', window: 'day' })
  }
  const { help, calls, rows } = setup([limited])
  help.ask('one')
  help.ask('two')
  await tick()
  await tick()
  const one = [...rows.values()].find((r) => r.data.question === 'one')
  assert.equal(one.data.error, 'error.limitDay')
  assert.equal(turns(calls).length, 1)
  assert.equal([...rows.values()].find((r) => r.data.question === 'two').data.status, 'queued')
})

test('restore draws earlier turns at their anchor, a cut one as an error, and the tip once', async () => {
  const conv = {
    ok: true,
    status: 200,
    json: async () => ({
      conversationId: 'c9',
      tipSeen: true,
      turns: [
        { id: '1', role: 'user', text: 'a?', anchorSeq: 7 },
        { id: '2', role: 'assistant', text: 'A.' },
        { id: '3', role: 'user', text: 'b?', anchorSeq: 12.5 }
      ]
    })
  }
  const { help, calls, rows } = setup([conv])
  await help.restore()
  assert.equal(calls[0].url, '/api/assistant/conversation?session=s1')
  const list = [...rows.values()]
  assert.equal(list.length, 2)
  assert.equal(list[0].anchorSeq, 7)
  assert.equal(list[0].data.answer, 'A.')
  assert.equal(list[1].anchorSeq, 12.5)
  assert.equal(list[1].data.error, 'error.cut')
})

test('restore on a fresh account shows the tip and records it as seen', async () => {
  const conv = {
    ok: true,
    status: 200,
    json: async () => ({ conversationId: 'c1', tipSeen: false, turns: [] })
  }
  const { help, calls, rows } = setup([conv, { ok: true, status: 204 }])
  await help.restore()
  assert.equal([...rows.values()][0].data.variant, 'tip')
  assert.ok(calls.some((c) => c.url === '/api/assistant/tip/seen' && c.method === 'POST'))
})

test('no call ever leaves for anything but /api/assistant (the agent is never reached)', async () => {
  const a = sse()
  const { help, calls } = setup([a.res])
  help.ask('hello')
  await tick()
  assert.ok(calls.every((c) => c.url.startsWith('/api/assistant/')))
})

test('rating: the answer id comes from done, a press posts it, a second press clears it, a refusal puts it back', async () => {
  const a = sse()
  const { help, rows, calls } = setup([
    a.res,
    { ok: false, status: 404, json: async () => ({}) },
    { ok: true, status: 204 },
    { ok: true, status: 204 }
  ])
  help.ask('q')
  await tick()
  a.push('meta', { conversationId: 'c1', turnId: '4' })
  a.push('delta', { text: 'A' })
  a.push('done', { turnId: '5' })
  a.end()
  await tick()
  await tick()
  const row = [...rows.values()][0]
  assert.equal(row.data.answerId, '5')
  help.rate(row.id, 1)
  assert.equal(rows.get(row.id).data.rating, 1)
  assert.deepEqual(calls.at(-1).body, { rating: 1 })
  assert.equal(calls.at(-1).url, '/api/assistant/turns/5/rating')
  assert.equal(calls.at(-1).method, 'POST')
  await tick()
  await tick()
  // The server refused the first press (404): the thumb goes back.
  assert.equal(rows.get(row.id).data.rating, undefined)
  help.rate(row.id, -1)
  await tick()
  assert.equal(rows.get(row.id).data.rating, -1)
  help.rate(row.id, -1)
  assert.deepEqual(calls.at(-1).body, { rating: null })
  assert.equal(rows.get(row.id).data.rating, undefined)
})

test('rating a row that has no answer id yet does nothing', async () => {
  const { help, rows, calls } = setup([sse().res])
  help.ask('q')
  await tick()
  help.rate([...rows.values()][0].id, 1)
  assert.ok(!calls.some((c) => c.url.includes('/rating')))
})

test('a restored answer brings back its id, its rating and when it was written', async () => {
  const conv = {
    ok: true,
    status: 200,
    json: async () => ({
      conversationId: 'c9',
      tipSeen: true,
      turns: [
        { id: '1', role: 'user', text: 'a?', anchorSeq: 7, at: '2026-10-12T00:01:00.000Z' },
        { id: '2', role: 'assistant', text: 'A.', rating: -1, at: '2026-10-12T00:02:00.000Z' },
        { id: '3', role: 'user', text: 'b?', anchorSeq: 9, at: 'not a date' }
      ]
    })
  }
  const { help, rows } = setup([conv])
  await help.restore()
  const [answered, cut] = [...rows.values()]
  assert.equal(answered.data.answerId, '2')
  assert.equal(answered.data.rating, -1)
  assert.equal(answered.data.at, Date.parse('2026-10-12T00:02:00.000Z'))
  assert.equal('answerId' in cut.data, false)
  assert.equal('at' in cut.data, false)
})

test('an answer carries the time it finished, and a bare /help reply the time it was given', async () => {
  const a = sse()
  const rows = new Map()
  let clock = 1_000
  const help = createHelp({
    sessionId: 's1',
    rows: { upsert: (r) => rows.set(r.id, r), remove: (id) => rows.delete(id), tailSeq: () => 3 },
    fetch: async () => a.res,
    site: () => null,
    transcriptShown: () => true,
    now: () => clock
  })
  help.ask('q')
  await tick()
  a.push('meta', { conversationId: 'c1', turnId: '4' })
  a.push('delta', { text: 'A' })
  clock = 2_000
  a.push('done', { turnId: '5' })
  a.end()
  await tick()
  await tick()
  assert.equal([...rows.values()][0].data.at, 2_000)
  clock = 3_000
  help.ask('')
  assert.equal([...rows.values()].at(-1).data.variant, 'askBack')
  assert.equal([...rows.values()].at(-1).data.at, 3_000)
})

test('a question and the reply to a bare /help are upserted as an exchange; the suggestions and the tip are not', async () => {
  const { help, rows } = setup([sse().res], { transcriptShown: () => true })
  help.ask('q')
  help.ask('')
  const [question, askBack] = [...rows.values()]
  assert.equal(question.exchange, true)
  assert.equal(askBack.exchange, true)
  const start = setup([])
  start.help.ask('')
  assert.equal([...start.rows.values()][0].data.variant, 'greeting')
  assert.equal('exchange' in [...start.rows.values()][0], false)
  const conv = {
    ok: true,
    status: 200,
    json: async () => ({ conversationId: 'c', tipSeen: false, turns: [] })
  }
  const tip = setup([conv, { ok: true, status: 204 }])
  await tip.help.restore()
  assert.equal([...tip.rows.values()][0].data.variant, 'tip')
  assert.equal('exchange' in [...tip.rows.values()][0], false)
})

test('the action row shows under a finished answer only, and copies the words shown', () => {
  const t = (key) => (key === 'askBack.text' ? 'What would you like help with?' : key)
  const base = {
    variant: 'turn',
    sessionId: 's',
    rowId: 'q1',
    question: 'q',
    answer: 'The answer.',
    links: []
  }
  assert.equal(answerTextOf({ ...base, status: 'done' }, t), 'The answer.')
  assert.equal(answerTextOf({ ...base, status: 'streaming' }, t), null)
  assert.equal(answerTextOf({ ...base, status: 'queued', answer: '' }, t), null)
  // Stopped or cut after some words: the words keep their row, as an interrupted agent reply does.
  assert.equal(answerTextOf({ ...base, status: 'stopped' }, t), 'The answer.')
  assert.equal(answerTextOf({ ...base, status: 'error', error: 'error.unavailable', answer: '' }, t), null)
  assert.equal(
    answerTextOf({ ...base, variant: 'askBack', answer: '', status: 'done' }, t),
    'What would you like help with?'
  )
  assert.equal(answerTextOf({ ...base, variant: 'greeting', answer: '', status: 'done' }, t), null)
  assert.equal(answerTextOf({ ...base, variant: 'tip', answer: '', status: 'done' }, t), null)
})

test('after a 429 the queue is held, and the next question the person types lifts the hold and is sent', async () => {
  const limited = {
    ok: false,
    status: 429,
    body: null,
    json: async () => ({ code: 'RATE_LIMITED', window: 'minute' })
  }
  const a = sse()
  const { help, calls, rows } = setup([limited, a.res])
  help.ask('one')
  await tick()
  await tick()
  assert.equal([...rows.values()].find((r) => r.data.question === 'one').data.error, 'error.limit')
  help.ask('two')
  await tick()
  assert.equal(turns(calls).length, 2, 'the second question was sent, not left waiting')
  assert.equal(turns(calls)[1].body.message, 'two')
  a.push('delta', { text: 'ok' })
  a.push('done', {})
  a.end()
  await tick()
  await tick()
  assert.equal([...rows.values()].find((r) => r.data.question === 'two').data.status, 'done')
})

const variants = (rows) => [...rows.values()].map((r) => r.data.variant)

test('the suggestions row goes away once a question is typed, and the answer row stays', async () => {
  const a = sse()
  const { help, rows } = setup([a.res])
  help.ask('')
  assert.deepEqual(variants(rows), ['greeting'])
  help.ask('how do I undo?')
  await tick()
  assert.deepEqual(variants(rows), ['turn'])
})

test('pressing a suggestion asks it and takes the suggestions away', async () => {
  const a = sse()
  const { help, rows, calls } = setup([a.res])
  help.ask('')
  // A chip calls ask with its own text (HelpNode.tsx).
  help.ask('What can Tracy do?')
  await tick()
  assert.deepEqual(variants(rows), ['turn'])
  assert.equal(turns(calls)[0].body.message, 'What can Tracy do?')
})

test('dropGreeting takes the suggestions away, and a later bare /help on the start screen draws them again', () => {
  const { help, rows } = setup([])
  help.ask('')
  help.dropGreeting()
  assert.deepEqual(variants(rows), [])
  help.ask('')
  assert.deepEqual(variants(rows), ['greeting'])
})

test('once the chat has begun, a bare /help is answered like a chat message, every time, with no suggestions', async () => {
  let shown = false
  const { help, rows, calls } = setup([], { transcriptShown: () => shown })
  help.ask('')
  assert.deepEqual(variants(rows), ['greeting'])
  shown = true
  help.ask('')
  help.ask('  ')
  await tick()
  // The start screen's suggestions do not survive into the chat; each bare /help gets its own reply.
  assert.deepEqual(variants(rows), ['askBack', 'askBack'])
  for (const row of rows.values()) {
    assert.equal(row.data.question, '')
    assert.equal(row.data.status, 'done')
    assert.equal(row.anchorSeq, 41)
  }
  assert.equal(calls.length, 0)
})

test('streamingRowOf names the Help row being written, and nothing else', () => {
  const row = (rowId, status, kind = HELP_KIND) => ({ key: rowId, kind, data: { rowId, status } })
  assert.equal(streamingRowOf([]), undefined)
  assert.equal(streamingRowOf([row('q1', 'done'), row('q2', 'queued')]), undefined)
  assert.equal(streamingRowOf([row('q1', 'done'), row('q2', 'streaming'), row('q3', 'queued')]), 'q2')
  assert.equal(streamingRowOf([row('x', 'streaming', 'other-kind')]), undefined)
})

test('the stop of the chat box stops the answer being written; the row keeps what arrived', async () => {
  const a = sse()
  const { help, rows } = setup([a.res])
  help.ask('long one')
  await tick()
  a.push('delta', { text: 'Part' })
  await tick()
  const nodes = () => [...rows.values()].map((r) => ({ key: r.id, kind: r.kind, data: r.data }))
  const id = streamingRowOf(nodes())
  assert.ok(id)
  help.stopAll()
  // The fake body ignores the abort signal; ending it stands in for the aborted read.
  a.end()
  await tick()
  await tick()
  assert.equal(streamingRowOf(nodes()), undefined)
  assert.equal(rows.get(id).data.status, 'stopped')
  assert.equal(rows.get(id).data.answer, 'Part')
})

// ── the creation screen's chat (David, 26/10/2026) ──────────────────────────────────────────────

const LOGO = {
  id: 'f-1',
  name: 'logo.png',
  type: 'image/png',
  bytes: 2048,
  url: '/api/assistant/attachments/f-1'
}

test('a question carries its stored files and the creation screen flag; files alone are a question', async () => {
  const a = sse()
  const { help, calls, rows } = setup([a.res], { start: () => true })
  help.ask('', [LOGO])
  await tick()
  assert.equal(turns(calls).length, 1, 'files alone are not a bare /help')
  assert.match(turns(calls)[0].body.requestId, /^[0-9a-f-]{36}$/)
  assert.deepEqual(turns(calls)[0].body, {
    message: '',
    site: 'shop.tracy.site',
    start: true,
    attachments: ['f-1'],
    requestId: turns(calls)[0].body.requestId,
    session: { id: 's1', anchorSeq: 41 }
  })
  const row = [...rows.values()].at(-1)
  assert.deepEqual(row.data.files, [LOGO])
  assert.equal(row.data.variant, 'turn')
})

test("a restore on the creation screen asks for the start actions and brings back each question's files", async () => {
  const restore = {
    ok: true,
    status: 200,
    json: async () => ({
      conversationId: 'c1',
      links: [{ href: 'tracy-action:create', label: 'Create' }],
      tipSeen: true,
      turns: [
        { id: '7', role: 'user', text: 'my logo', files: [LOGO], anchorSeq: 3 },
        { id: '8', role: 'assistant', text: 'Thanks', anchorSeq: 3 }
      ]
    })
  }
  const { help, calls, rows } = setup([restore], { start: () => true })
  await help.restore()
  assert.match(calls[0].url, /&start=1$/)
  const row = rows.get('t7')
  assert.deepEqual(row.data.files, [LOGO])
  assert.deepEqual(row.data.links, [{ href: 'tracy-action:create', label: 'Create' }])
})

test('a start action address names its step and a platform only for Create; anything else is not one', () => {
  assert.deepEqual(startPressOf('tracy-action:create'), { action: 'create' })
  assert.deepEqual(startPressOf('tracy-action:create?platform=emdash'), {
    action: 'create',
    platform: 'emdash'
  })
  assert.deepEqual(startPressOf('tracy-action:import'), { action: 'import' })
  assert.deepEqual(startPressOf('tracy-action:business'), { action: 'business' })
  assert.deepEqual(startPressOf('tracy-action:templates'), { action: 'templates' })
  assert.equal(startPressOf('tracy-action:delete'), null)
  assert.equal(startPressOf('tracy-action:create?platform=drupal'), null)
  assert.equal(startPressOf('/new/?tab=tracy:add-site'), null)
})

test('the files the page offers are those of sent questions only', () => {
  const row = (id, status, files, extra = {}) => ({
    kind: HELP_KIND,
    data: {
      variant: 'turn',
      sessionId: 's1',
      rowId: id,
      question: '',
      answer: '',
      status,
      links: [],
      files,
      ...extra
    }
  })
  const other = { ...LOGO, id: 'f-2', name: 'menu.pdf', type: 'application/pdf' }
  const rows = [
    row('a', 'done', [LOGO]),
    row('b', 'queued', [other]),
    row('c', 'error', [other], { error: 'error.unavailable' }),
    row('d', 'error', [other], { error: 'error.cut' }),
    { kind: HELP_KIND, data: { ...row('e', 'done', [other]).data, sessionId: 's2' } }
  ]
  assert.deepEqual(
    sentFilesOf(rows, 's1').map((f) => f.id),
    ['f-1', 'f-2']
  )
})

test('reload after a retry uses the latest answer linked to that question, even after another question', async () => {
  const { help, rows } = setup([
    {
      ok: true,
      json: async () => ({
        turns: [
          { id: '1', role: 'user', text: 'First', files: [LOGO] },
          { id: '2', role: 'assistant', text: 'Partial', replyToId: '1' },
          { id: '3', role: 'user', text: 'Second' },
          { id: '4', role: 'assistant', text: 'Second answer', replyToId: '3' },
          { id: '5', role: 'assistant', text: 'Complete first answer', replyToId: '1' }
        ]
      })
    }
  ])
  await help.restore()
  assert.equal(rows.get('t1').data.answer, 'Complete first answer')
  assert.deepEqual(rows.get('t1').data.files, [LOGO])
  assert.equal(rows.get('t3').data.answer, 'Second answer')
})
