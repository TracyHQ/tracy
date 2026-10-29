/** What every engine of "Apply" shares: batches asked at once, a model made firm about facts, a deadline. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  briefForJudges,
  budgetSignal,
  chunk,
  firmGenerate,
  jsonObjectIn,
  JUDGE_BRIEF_MAX,
  planConcurrently,
  pool,
  recordedDoor,
  sayUnbound,
  siteBlock,
  stopwatch
} from '../src/sites/brief-engines/shared.js'
import { FACT_RULES, VOICE_RULES } from '../src/sites/brief-engines/guard.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** A planner shaped like the seeder's: batches asked one after another, `values`/`pending` read from each answer. */
function planner(batches, { retryOnce = null } = {}) {
  return async (generate) => {
    const values = {}
    const pending = []
    for (const keys of batches) {
      const input = { slots: keys.map((key) => ({ key })) }
      let body = JSON.parse(await generate({ system: 'plan', input }))
      if (retryOnce && keys.includes(retryOnce) && body.values[retryOnce] === 'bad')
        body = JSON.parse(await generate({ system: 'plan', input: { ...input, fix: 'write it again' } }))
      Object.assign(values, body.values)
      pending.push(...body.pending)
    }
    return { values, pending }
  }
}

test('planConcurrently asks every batch at once and hands the planner its own answers', async () => {
  let inFlight = 0
  let peak = 0
  let asked = 0
  const generate = async ({ input }) => {
    asked += 1
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await wait(20)
    inFlight -= 1
    return JSON.stringify({
      values: Object.fromEntries(input.slots.map((s) => [s.key, `v-${s.key}`])),
      pending: []
    })
  }
  const { result, calls, failed } = await planConcurrently(planner([['a', 'b'], ['c'], ['d', 'e']]), generate)
  assert.deepEqual(result.values, { a: 'v-a', b: 'v-b', c: 'v-c', d: 'v-d', e: 'v-e' })
  assert.equal(peak, 3, 'all three batches were in flight together')
  assert.equal(asked, 3, 'the model was asked once per batch, not once per run of the planner')
  assert.deepEqual({ calls, failed }, { calls: 3, failed: 0 })
})

test('a retry the planner makes on its own is asked live', async () => {
  const seen = []
  const generate = async ({ input }) => {
    seen.push(Boolean(input.fix))
    return JSON.stringify({ values: { a: input.fix ? 'good' : 'bad' }, pending: [] })
  }
  const { result } = await planConcurrently(planner([['a']], { retryOnce: 'a' }), generate)
  assert.equal(result.values.a, 'good')
  assert.deepEqual(
    seen,
    [false, true],
    'the first answer was asked ahead, the retry when the planner asked for it'
  )
})

test('a retry asked live counts as a call, so "every call failed" means every call', async () => {
  // The first answer comes back in the wrong shape and is asked again; the retry fails. One call answered, one failed.
  const generate = async ({ input }) => {
    if (input.fix) throw new Error('model gone')
    return JSON.stringify({ values: { a: 'bad' }, pending: [] })
  }
  const { calls, failed } = await planConcurrently(planner([['a']], { retryOnce: 'a' }), generate)
  assert.deepEqual({ calls, failed }, { calls: 2, failed: 1 })
})

test('one batch that fails costs its own slots and nothing else', async () => {
  const generate = async ({ input }) => {
    if (input.slots.some((s) => s.key === 'c')) throw new Error('model down')
    return JSON.stringify({ values: Object.fromEntries(input.slots.map((s) => [s.key, 'ok'])), pending: [] })
  }
  const { result, failed } = await planConcurrently(planner([['a', 'b'], ['c']]), generate)
  assert.deepEqual(result.values, { a: 'ok', b: 'ok' })
  assert.deepEqual(result.pending, ['c'])
  assert.equal(failed, 1, 'said once, not asked a second time when the planner reached it')
})

test('a translation is planned the same way: echoed first, asked at once, and a failure fails the plan instead of being kept as an answer', async () => {
  // A planner shaped like the language planner: batches of an array in, an array of {i, text} out.
  const planner = (batches) => async (generate) => {
    const out = {}
    for (const items of batches) {
      const answer = JSON.parse(await generate({ system: 'translate', input: items }))
      for (const row of answer) out[row.i] = row.text
    }
    return out
  }
  const echo = ({ input }) => JSON.stringify(input.map(({ i, text }) => ({ i, text })))
  let peak = 0
  let inFlight = 0
  const generate = async ({ input }) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await wait(15)
    inFlight -= 1
    return JSON.stringify(input.map(({ i, text }) => ({ i, text: `vi:${text}` })))
  }
  const batches = [[{ i: 0, text: 'a' }], [{ i: 1, text: 'b' }], [{ i: 2, text: 'c' }]]
  const ok = await planConcurrently(planner(batches), generate, { quiet: echo, failure: 'throw' })
  assert.deepEqual(ok.result, { 0: 'vi:a', 1: 'vi:b', 2: 'vi:c' })
  assert.equal(peak, 3)
  // The default would have left the source as the "translation"; a translation must fail loudly instead.
  const down = async () => {
    throw new Error('model down')
  }
  await assert.rejects(
    planConcurrently(planner(batches), down, { quiet: echo, failure: 'throw' }),
    /model down/
  )
  const kept = await planConcurrently(planner(batches), down, { quiet: echo })
  assert.deepEqual(
    kept.result,
    { 0: 'a', 1: 'b', 2: 'c' },
    'the text planners keep the template’s words instead'
  )
})

test('the fact rules ride on every instruction, and the run’s signal on every call', async () => {
  let sent
  const model = { chat: async (request) => ((sent = request), 'x') }
  const signal = new AbortController().signal
  await firmGenerate(model, signal)({ system: 'Write slots.', input: { a: 1 } })
  assert.equal(sent.messages[0].content, `Write slots.${FACT_RULES}${VOICE_RULES}`)
  assert.equal(sent.messages[1].content, '{"a":1}')
  assert.equal(sent.signal, signal)
})

test('the copy voice is formal and wins over the tone and the brief voice, for every writer', () => {
  assert.match(VOICE_RULES, /wins over any tone named above, over the voice the brief observed/)
  assert.match(VOICE_RULES, /no slang/)
  assert.match(VOICE_RULES, /no emoji/)
  assert.match(VOICE_RULES, /never repeat a sentence on one page or\s+across pages/)
  assert.match(VOICE_RULES, /unless the brief states that number/)
  assert.match(VOICE_RULES, /sentence\s+case/)
  assert.doesNotMatch(VOICE_RULES, /[\u2013\u2014]/, 'no dash a model would copy into copy')
})

test('a deadline stops what is still waiting, and the run’s own signal stops it sooner', async () => {
  const late = budgetSignal(undefined, Date.now() + 30)
  assert.equal(late.aborted, false)
  await wait(60)
  assert.equal(late.aborted, true)
  const controller = new AbortController()
  const both = budgetSignal(controller.signal, Date.now() + 60_000)
  controller.abort()
  assert.equal(both.aborted, true)
})

test('pool keeps the order, bounds the work and turns a throw into an answer', async () => {
  let inFlight = 0
  let peak = 0
  const job = (n) => async () => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await wait(5)
    inFlight -= 1
    if (n === 2) throw new Error('two')
    return n * 10
  }
  const answers = await pool([1, 2, 3, 4, 5].map(job), 2)
  assert.equal(peak, 2)
  assert.deepEqual(
    answers.map((a) => (a.ok ? a.value : 'x')),
    [10, 'x', 30, 40, 50]
  )
})

test('chunk and siteBlock', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(siteBlock({ name: 'N', about: 'A', tone: '', contact: '', languages: ['en'] }), {
    name: 'N',
    about: 'A',
    languages: ['en']
  })
  assert.deepEqual(siteBlock({ name: 'N', about: 'A', tone: 't', contact: 'c', languages: ['en'] }, ['vi']), {
    name: 'N',
    about: 'A',
    tone: 't',
    contact: 'c',
    languages: ['vi']
  })
})

test('the other answers ride in the site block as their own field, so every planner reads them beside the description', () => {
  const block = siteBlock({
    name: 'Habla Hall',
    about: 'Evening Spanish classes for adults.',
    tone: '',
    contact: '',
    details: 'Sector: Language school\nClass size: at most eight students',
    languages: ['en']
  })
  assert.equal(block.details, 'Sector: Language school\nClass size: at most eight students')
  assert.equal(block.about, 'Evening Spanish classes for adults.', 'the description is not mixed with them')
  assert.equal('details' in siteBlock({ name: 'N', about: 'A', details: '', languages: ['en'] }), false)
})

test('the opening hours and the profiles the owner linked ride in the site block, for the site identity (L32)', () => {
  const block = siteBlock({
    name: 'Golden Crust Bakery',
    about: 'A family bakery.',
    tone: '',
    contact: '0912 345 678 · hello@goldencrust.example · 12 Hang Bac, Hanoi',
    hours: 'Open 6am-8pm every day',
    social: { instagram: 'https://instagram.com/goldencrust' },
    languages: ['en']
  })
  assert.equal(block.hours, 'Open 6am-8pm every day')
  assert.deepEqual(block.social, { instagram: 'https://instagram.com/goldencrust' })
  const bare = siteBlock({ name: 'N', about: 'A', hours: '', social: {}, languages: ['en'] })
  assert.equal('hours' in bare, false)
  assert.equal('social' in bare, false)
})

test('the phone, email and address Apply read apart ride in the site block as they were read, beside the joined line (L32)', () => {
  const block = siteBlock({
    name: 'Golden Crust Bakery',
    about: 'A family bakery.',
    tone: '',
    contact: '0912 345 678 · hello@goldencrust.example · 12 Hang Bac, Hanoi',
    phone: '0912 345 678',
    email: 'hello@goldencrust.example',
    address: '12 Hang Bac, Hanoi',
    languages: ['en']
  })
  assert.equal(block.phone, '0912 345 678')
  assert.equal(block.email, 'hello@goldencrust.example')
  assert.equal(block.address, '12 Hang Bac, Hanoi')
  const bare = siteBlock({ name: 'N', about: 'A', phone: '', email: '', address: '', languages: ['en'] })
  for (const key of ['phone', 'email', 'address']) assert.equal(key in bare, false, key)
})

test('a judge is shown everything the customer said up to its bound, not the first 300 characters', () => {
  assert.ok(JUDGE_BRIEF_MAX >= 1000)
  const about = `Evening Spanish classes for adults in a small group, ${'with conversation practice '.repeat(10)}.`
  const said = 'Sector: Language school\nWhat we do not offer: exam preparation'
  const shown = briefForJudges({ about, said })
  assert.ok(about.length > 300)
  assert.match(shown, /What we do not offer: exam preparation$/, 'the last answer is there')
  assert.equal(briefForJudges({ about: 'x'.repeat(5000) }).length, JUDGE_BRIEF_MAX)
})

test('a stopwatch records a phase run twice as the sum, and a span measured elsewhere beside it', async () => {
  const seen = {}
  const watch = stopwatch({ time: (name, ms) => (seen[name] = ms) })
  assert.equal(await watch('hideMs', async () => (await wait(20), 'a')), 'a', 'the answer passes through')
  const first = seen.hideMs
  assert.ok(first >= 15, `the first run: ${first}`)
  await watch('hideMs', () => wait(20))
  assert.ok(seen.hideMs >= first + 15, `both runs counted: ${seen.hideMs} after ${first}`)
  watch.add('packMs', 7)
  watch.add('packMs', 5)
  assert.equal(seen.packMs, 12)
  await assert.rejects(
    watch('failedMs', async () => {
      await wait(10)
      throw new Error('no')
    }),
    /no/
  )
  assert.ok(seen.failedMs >= 5, 'a phase that failed still says how long it ran')
})

test('the first complete JSON object of an answer is read, however it is wrapped; anything else is nothing', () => {
  assert.deepEqual(jsonObjectIn('{"hide": ["a"], "relabel": {}}'), { hide: ['a'], relabel: {} })
  assert.deepEqual(jsonObjectIn('Sure!\n```json\n{"hide": ["a"]}\n```\nNote {the rest}'), { hide: ['a'] })
  assert.deepEqual(jsonObjectIn('{not json} then {"relabel": {"x": "y"}}'), { relabel: { x: 'y' } })
  assert.deepEqual(jsonObjectIn('{"hide": ["a\\"b"]} trailing }'), { hide: ['a"b'] })
  assert.deepEqual(
    jsonObjectIn('{"a": {"b": 1}} {"c": 2}'),
    { a: { b: 1 } },
    'the first, whole, nested object'
  )
  for (const none of ['no braces', '', null, undefined, '[1, 2]', '{"unterminated": 1'])
    assert.equal(jsonObjectIn(none), null, `${JSON.stringify(none)} holds no object`)
})

test('the door an engine writes through tells the run every apply id a call names, and changes nothing else', async () => {
  const seen = []
  const ids = []
  const door = async (call) => (seen.push(call), { ok: true, echo: call.action })
  const recorded = recordedDoor({ applied: (id) => ids.push(id) }, door)
  const write = { siteKey: 's', action: 'content.update', params: { apply_id: 'residue-x', kind: 'post' } }
  assert.deepEqual(await recorded(write), { ok: true, echo: 'content.update' })
  await recorded({ siteKey: 's', action: 'content.list', params: { kind: 'page' } })
  await recorded({
    siteKey: 's',
    action: 'content.contract',
    params: { operation: 'apply', apply_id: 'contract-y' }
  })
  assert.deepEqual(ids, ['residue-x', 'contract-y'], 'a read names none')
  assert.equal(seen[0], write, 'the call goes through as it was')
  const plain = async () => ({ ok: true })
  assert.equal(recordedDoor({}, plain), plain, 'a run that records nothing gets the door itself')
})

test('the door says which apply ids are not this Apply’s own: the fixed demo-trim receipt, and the ones the engine names', async () => {
  const told = []
  const door = async () => ({ ok: true })
  const recorded = recordedDoor(
    { applied: (id, how) => told.push([id, how?.reused === true]) },
    door,
    (id) => id === 'mlang-install-1'
  )
  for (const apply_id of ['dtrim-seed', 'contract-a', 'mlang-install-1', 'residue-b'])
    await recorded({ siteKey: 's', action: 'content.update', params: { apply_id } })
  assert.deepEqual(told, [
    ['dtrim-seed', true],
    ['contract-a', false],
    ['mlang-install-1', true],
    ['residue-b', false]
  ])
})

// L29 (05/10/2026): the site was unbound because its bind came back EMPTY, while the plugin on it did carry the
// profile. The refusal says only that a site is unbound, never why, so the sentence must not name a cause.
test('an unbound site is said without a cause the refusal does not give', () => {
  for (const refusal of [
    'No content contract is configured for this site; name one with the contract parameter',
    'CONTRACT_UNBOUND'
  ]) {
    const said = sayUnbound(refusal)
    assert.equal(
      said,
      'this site is not bound to its template’s content contract, so it keeps the template’s words'
    )
    assert.doesNotMatch(said, /plugin|profile|carr(y|ies)/)
  }
  assert.equal(
    sayUnbound('the door is closed'),
    'the door is closed',
    'any other refusal keeps its own words'
  )
})
