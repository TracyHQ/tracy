import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  demoToolNeedsReady,
  roundOrder,
  runDemoLifecycle,
  sendRound,
  sweepRound
} from '../src/host/demo-lifecycle.mjs'

test('native wait polls finite real status and never starts a provision or sends a prompt', async () => {
  let calls = 0,
    time = 0
  const seen = []
  const result = await runDemoLifecycle(
    { operation: 'provision.wait', waitSeconds: 5 },
    async (params) => {
      seen.push(params.operation)
      return { ready: ++calls === 3, state: 'provisioning' }
    },
    {
      now: () => time,
      sleep: async (ms) => {
        time += ms
      }
    }
  )
  assert.equal(result.ready, true)
  assert.deepEqual(seen, ['provision.status', 'provision.status', 'provision.status'])
  calls = 0
  time = 0
  const bounded = await runDemoLifecycle(
    { operation: 'provision.wait', waitSeconds: 1 },
    async () => {
      calls++
      return { ready: false }
    },
    {
      now: () => time,
      sleep: async (ms) => {
        time += ms
      }
    }
  )
  assert.equal(bounded.waiting, true)
  assert.equal(calls, 2)
})
test('native wait Stop cuts the next dispatch and retains an in-flight result without starting another poll', async () => {
  const controller = new AbortController()
  let calls = 0
  const result = await runDemoLifecycle(
    { operation: 'provision.wait' },
    async () => {
      calls++
      controller.abort()
      return { ready: false, jobId: 'durable-job' }
    },
    { signal: controller.signal, sleep: async () => {} }
  )
  assert.equal(result.code, 'TURN_STOPPED')
  assert.equal(result.lastReceipt.jobId, 'durable-job')
  assert.equal(calls, 1)
  assert.equal(
    (
      await runDemoLifecycle(
        { operation: 'provision.start' },
        async () => {
          calls++
        },
        { signal: controller.signal }
      )
    ).code,
    'TURN_STOPPED'
  )
  assert.equal(calls, 1)
})

test('generic shell and file writers require readiness; read-only tools and editor view do not', () => {
  for (const name of [
    'bash',
    'pwsh',
    'terminal_open',
    'terminal_write',
    'write',
    'edit',
    'str_replace_editor'
  ])
    assert.equal(demoToolNeedsReady(name, {}), true, name)
  for (const name of ['read', 'read_image', 'grep', 'glob', 'tracy_demo'])
    assert.equal(demoToolNeedsReady(name, {}), false, name)
  assert.equal(demoToolNeedsReady('str_replace_editor', { command: 'view' }), false)
})

// 🔒 A check is started and its result polled (dev 24/10/2026: one check call outlived Cloudflare's ~100 s
// and every check answered 524 while tracy-web ran on and dropped the result as unheard).
test('check starts the server check and polls its status in short calls until it has a result', async () => {
  let time = 0
  const seen = []
  const result = await runDemoLifecycle(
    { operation: 'check' },
    async (params) => {
      seen.push(params.operation)
      if (params.operation === 'check.start') return { ok: true, running: true, checkId: 'c1' }
      return seen.length < 4
        ? { ok: true, running: true, checkId: 'c1' }
        : { ok: true, pass: true, checks: [] }
    },
    {
      now: () => time,
      sleep: async (ms) => {
        time += ms
      }
    }
  )
  assert.equal(result.pass, true)
  assert.deepEqual(seen, ['check.start', 'check.status', 'check.status', 'check.status'])
})

test('check against a tracy-web without check.start falls back to the one long check call', async () => {
  const seen = []
  const result = await runDemoLifecycle({ operation: 'check' }, async (params) => {
    seen.push(params.operation)
    return params.operation === 'check.start'
      ? { ok: false, code: 'AGENT_DEMO_BAD_OPERATION', httpStatus: 409 }
      : { ok: true, pass: false, checks: [{ id: 'x', pass: false }] }
  })
  assert.equal(result.pass, false)
  assert.deepEqual(seen, ['check.start', 'check'])
})

test('check answers a refusal or a finished result from start at once, never polling', async () => {
  for (const first of [
    { ok: false, code: 'DEMO_CHECK_BUDGET_EXHAUSTED' },
    { ok: true, pass: true, checks: [] }
  ]) {
    const seen = []
    const result = await runDemoLifecycle({ operation: 'check' }, async (params) => {
      seen.push(params.operation)
      return first
    })
    assert.deepEqual(result, first)
    assert.deepEqual(seen, ['check.start'])
  }
})

test('check still running at the wait bound says so; Stop ends polling without another send', async () => {
  let time = 0,
    calls = 0
  const still = await runDemoLifecycle(
    { operation: 'check' },
    async () => {
      calls++
      return { ok: true, running: true, checkId: 'c1' }
    },
    {
      now: () => time,
      sleep: async (ms) => {
        time += ms
      }
    }
  )
  assert.equal(still.code, 'DEMO_CHECK_RUNNING')
  assert.equal(still.running, true)
  assert.ok(calls > 2 && calls < 200, String(calls))
  const controller = new AbortController()
  calls = 0
  const stopped = await runDemoLifecycle(
    { operation: 'check' },
    async () => {
      calls++
      controller.abort()
      return { ok: true, running: true, checkId: 'c1' }
    },
    { signal: controller.signal, sleep: async () => {} }
  )
  assert.equal(stopped.code, 'TURN_STOPPED')
  assert.equal(calls, 1)
})

test('check polls through a few failed status calls on the way, then answers the last failure', async () => {
  const replies = [
    { ok: true, running: true },
    { ok: false, code: 'COWORK_WEB_BAD_RESPONSE', status: 502 },
    { ok: false, httpStatus: 503 },
    { ok: true, pass: true, checks: [] }
  ]
  const passed = await runDemoLifecycle({ operation: 'check' }, async () => replies.shift(), {
    sleep: async () => {}
  })
  assert.equal(passed.pass, true)
  let calls = 0
  const gone = await runDemoLifecycle(
    { operation: 'check' },
    async () => (++calls === 1 ? { ok: true, running: true } : { ok: false, code: 'COWORK_WEB_UNREACHABLE' }),
    { sleep: async () => {} }
  )
  assert.equal(gone.code, 'COWORK_WEB_UNREACHABLE')
  assert.equal(calls, 7)
  const refused = await runDemoLifecycle(
    { operation: 'check' },
    async ({ operation }) =>
      operation === 'check.start' ? { ok: true, running: true } : { ok: false, code: 'DEMO_CHECK_LOST' },
    { sleep: async () => {} }
  )
  assert.equal(refused.code, 'DEMO_CHECK_LOST')
})

test('a check that answers with residue sweep calls runs them through the site tool, then checks again', async () => {
  const seen = []
  const ran = []
  let checks = 0
  const calls = [
    {
      action: 'content.replace',
      params: { find: '$147', replace: 'Menu item', path: '/', all: true, expect: 1 }
    },
    {
      action: 'content.update',
      params: { kind: 'post', id: 11, fields: { post_date: '2026-10-24 00:00:00' } }
    }
  ]
  const result = await runDemoLifecycle(
    { operation: 'check' },
    async (params) => {
      seen.push(params.operation)
      checks += 1
      return checks === 1
        ? { ok: true, pass: false, checks: [], sweep: { calls, unresolved: [] } }
        : { ok: true, pass: true, checks: [] }
    },
    {
      sweep: async (call) => {
        ran.push(call.action)
        return call.action === 'content.update' ? { ok: false, code: 'COUNT_MISMATCH' } : { ok: true }
      }
    }
  )
  assert.equal(result.pass, true)
  assert.deepEqual(seen, ['check.start', 'check.start'])
  assert.deepEqual(ran, ['content.replace', 'content.update'])
  assert.deepEqual(result.swept, [
    {
      calls: 2,
      refused: [{ action: 'content.update', find: null, code: 'COUNT_MISMATCH' }],
      cleared: 0,
      unresolved: 0
    }
  ])
})

test('words a shared footer showed on every page: written once, the later pages answered cleared, never NOT_FOUND', async () => {
  // lrsweep rig round 5: one footer source on every page, plus Home's own features block; the read before the
  // round saw the footer's words on each page, so the plan holds them once per page.
  const footer = {
    text: '398 North 23th Dumbledore Street,\nHogsmeade Village, Britain. M. +201 382 348 5327'
  }
  const pages = {
    '/': [{ text: '398 North 23th Dumbledore Street, Hogsmeade Village, Britain.' }, footer],
    '/about-us/': [footer]
  }
  const flat = (t) => t.replace(/\s+/g, ' ')
  // The replace job: reads the page fresh, writes every place on it, NOT_FOUND when none is left.
  const replaceJob = async ({ params: { find, replace, path } }) => {
    const at = pages[path].filter((source) => flat(source.text).includes(find))
    if (at.length === 0) return { ok: false, code: 'NOT_FOUND' }
    for (const source of at) source.text = flat(source.text).replaceAll(find, replace)
    return { ok: true, count: at.length }
  }
  const call = (find, path) => ({
    action: 'content.replace',
    params: { find, replace: 'Menu item', path, all: 'page' }
  })
  const round = sweepRound(replaceJob)
  const answers = []
  for (const c of [
    call('398 North 23th Dumbledore Street, Hogsmeade Village, Britain.', '/'),
    call('M. +201 382 348 5327', '/'),
    call('398 North 23th Dumbledore Street,', '/about-us/'),
    call('M. +201 382 348 5327', '/about-us/'),
    call('Info@joomlart.com', '/about-us/')
  ])
    answers.push(await round(c))
  assert.deepEqual(
    answers.map((a) => a.code ?? (a.cleared ? 'cleared' : 'ok')),
    ['ok', 'ok', 'cleared', 'cleared', 'NOT_FOUND']
  )
  assert.equal(answers[2].cleared, '398 north 23th dumbledore street, hogsmeade village, britain.')
  assert.equal(answers[3].count, 0)
  assert.doesNotMatch(flat(footer.text), /Dumbledore|\+201/)
})

test('one check sweeps as many rounds as tracy-web plans, and never more than six', async () => {
  let ran = 0
  const result = await runDemoLifecycle(
    { operation: 'check' },
    async () => ({
      ok: true,
      pass: false,
      checks: [],
      sweep: { calls: [{ action: 'content.replace', params: { find: 'Ask', replace: 'Menu item' } }] }
    }),
    { sweep: async () => ((ran += 1), { ok: true }) }
  )
  assert.equal(ran, 6)
  assert.equal(result.swept.length, 6)
  assert.equal(result.pass, false)
})

/** A check that plans `calls` and, after the round, lists `shown` as the words a replace would still clear. */
const clearedRig = (after) => {
  const write = { action: 'content.replace', params: { find: 'Call M. +201 382 348 5327 today', path: '/' } }
  const later = { action: 'content.replace', params: { find: 'M. +201 382 348 5327', path: '/about-us/' } }
  let checks = 0
  const send = async () =>
    ++checks === 1
      ? { ok: true, pass: false, checks: [], sweep: { calls: [write, later], unresolved: [], shown: ['x'] } }
      : after
  const sweep = async (call) => (call === write ? { ok: true, count: 1 } : { ok: false, code: 'NOT_FOUND' })
  return runDemoLifecycle({ operation: 'check' }, send, { sweep })
}

test('a cleared row stands only when the read after its round shows its words gone from its page', async () => {
  // Gone: the check after the round passes with nothing left.
  const gone = await clearedRig({ ok: true, pass: true, checks: [] })
  assert.equal(gone.swept[0].cleared, 1)
  assert.deepEqual(gone.swept[0].refused, [])
  // Still shown on its page (a different spacing and case is the same words): back to the NOT_FOUND it was.
  const shown = await clearedRig({
    ok: true,
    pass: false,
    checks: [],
    sweep: { calls: [], unresolved: [], shown: ['/about-us/\u0000m.  +201 382 348 5327'] }
  })
  assert.equal(shown.swept[0].cleared, 0)
  assert.deepEqual(shown.swept[0].refused, [
    { action: 'content.replace', find: 'M. +201 382 348 5327', code: 'NOT_FOUND', stillShown: true }
  ])
  // The planner's evidence list never reaches the agent.
  assert.equal('shown' in shown.sweep, false)
  // The same words on another page only: this page's row stands.
  const elsewhere = await clearedRig({
    ok: true,
    pass: false,
    checks: [],
    sweep: { calls: [], unresolved: [], shown: ['/contact-us/\u0000M. +201 382 348 5327'] }
  })
  assert.equal(elsewhere.swept[0].cleared, 1)
  // No read after the round: nothing shows the words gone, so the row stays a failure.
  const unread = await clearedRig({ ok: false, code: 'DEMO_QA_UNAVAILABLE' })
  assert.equal(unread.swept[0].cleared, 0)
  assert.equal(unread.swept[0].refused[0].unread, true)
})

test('a round whose every call waits for a plugin door answers the check as it stands, no second round', async () => {
  let checks = 0
  const result = await runDemoLifecycle(
    { operation: 'check' },
    async () => (
      (checks += 1),
      {
        ok: true,
        pass: false,
        checks: [],
        sweep: { calls: [{ action: 'logo', params: { find: 'logo.png' } }], unresolved: [] }
      }
    ),
    { sweep: async () => ({ ok: false, code: 'NEEDS_LOGO_DOOR', unresolved: true }) }
  )
  assert.equal(checks, 1)
  assert.deepEqual(result.swept[0].refused, [
    { action: 'logo', find: 'logo.png', code: 'NEEDS_LOGO_DOOR', waits: true }
  ])
})

test('a sweep call that fails with no code of its own keeps its error words, a coded refusal does not', async () => {
  let checks = 0
  const calls = [
    { action: 'content.update', params: { kind: 'postmeta', id: 42 } },
    { action: 'content.update', params: { kind: 'post', id: 43 } },
    { action: 'content.update', params: { kind: 'post', id: 44 } }
  ]
  const result = await runDemoLifecycle(
    { operation: 'check' },
    async () => (
      (checks += 1),
      { ok: true, pass: false, checks: [], sweep: { calls: checks === 1 ? calls : [], unresolved: [] } }
    ),
    {
      sweep: async (call) => {
        if (call.params.id === 42) return { ok: false, error: 'postmeta takes one field: value' }
        if (call.params.id === 43) throw new Error('relay timed out')
        return { ok: false, code: 'STORE_CHANGED', error: 'the store moved' }
      }
    }
  )
  assert.deepEqual(result.swept[0].refused, [
    {
      action: 'content.update',
      find: null,
      code: 'SWEEP_CALL_FAILED',
      error: 'postmeta takes one field: value'
    },
    { action: 'content.update', find: null, code: 'SWEEP_CALL_FAILED', error: 'relay timed out' },
    { action: 'content.update', find: null, code: 'STORE_CHANGED' }
  ])
})

test('without a sweep runner the check answers its sweep calls as they are', async () => {
  const answer = {
    ok: true,
    pass: false,
    checks: [],
    sweep: { calls: [{ action: 'content.replace', params: {} }] }
  }
  assert.deepEqual(await runDemoLifecycle({ operation: 'check' }, async () => answer), answer)
})

// ── A page's pairs as one call (dev ja-diner WordPress, 27/10/2026) ─────────────────────────────────────────────

/**
 * A replace job as `locateAll` is: every pair located on the page as it stands, the first refusal wins and names its
 * pair (`change`), nothing is written; else every pair is written in one save of the page's record.
 * @param {Record<string, string>} pages
 */
function pageJob(pages) {
  const saves = []
  const sent = []
  const count = (text, find) => text.split(find).length - 1
  const job = async ({ params }) => {
    sent.push(params)
    const { path, changes: list, ...one } = params
    const changes = list ?? [{ find: one.find, replace: one.replace, expect: one.expect }]
    const named = (i) => (changes.length > 1 ? { change: i } : {})
    const text = pages[path]
    const places = changes.reduce((n, c) => n + count(text, c.find), 0)
    if (places > 40) return { ok: false, code: 'TOO_MANY', count: places }
    for (const [i, c] of changes.entries()) {
      const n = count(text, c.find)
      if (n === 0) return { ok: false, code: 'NOT_FOUND', ...named(i) }
      if (changes.some((o, j) => j !== i && o.find.length > c.find.length && o.find.includes(c.find)))
        return { ok: false, code: 'BAD_PARAMS', ...named(i) }
      if (c.expect !== undefined && n !== c.expect)
        return { ok: false, code: 'COUNT_MISMATCH', count: n, ...named(i) }
    }
    let after = text
    for (const c of changes) after = after.replaceAll(c.find, c.replace)
    pages[path] = after
    saves.push(path)
    return { ok: true, count: places }
  }
  return { job, saves, sent }
}

const pageCall = (path, changes) => ({ action: 'content.replace', params: { path, all: 'page', changes } })

test("a page's pairs in one call save its record once; a refused pair is set aside, reported as its own, the rest sent again", async () => {
  const pages = { '/home-red/': 'Smoked Venison Burger · $24.00 · Slow cooked · Ask' }
  const { job, saves, sent } = pageJob(pages)
  const round = sweepRound(job)
  const all = await round(
    pageCall('/home-red/', [
      { find: 'Smoked Venison Burger', replace: 'Menu item', expect: 1 },
      { find: '$24.00', replace: '', expect: 1 },
      { find: 'Slow cooked', replace: '', expect: 1 }
    ])
  )
  assert.deepEqual(saves, ['/home-red/'])
  assert.deepEqual(
    all.pairs.map((p) => [p.find, p.done.ok]),
    [
      ['Smoked Venison Burger', true],
      ['$24.00', true],
      ['Slow cooked', true]
    ]
  )
  // A miscounted pair: the job writes nothing and names it; it answers that refusal, the others go again together.
  pages['/'] = 'Grilled Salmon · Grilled Salmon · $9.00 · Fresh daily'
  const some = await round(
    pageCall('/', [
      { find: 'Grilled Salmon', replace: 'Menu item', expect: 1 },
      { find: '$9.00', replace: '', expect: 1 },
      { find: 'Fresh daily', replace: '', expect: 1 }
    ])
  )
  assert.deepEqual(
    some.pairs.map((p) => [p.find, p.done.ok === true ? 'ok' : p.done.code]),
    [
      ['Grilled Salmon', 'COUNT_MISMATCH'],
      ['$9.00', 'ok'],
      ['Fresh daily', 'ok']
    ]
  )
  assert.deepEqual(saves, ['/home-red/', '/'])
  assert.equal(pages['/'], 'Grilled Salmon · Grilled Salmon ·  · ')
  // The words an earlier write of the round cleared answer cleared, never NOT_FOUND, inside a call too.
  pages['/about/'] = 'Slow cooked · Open late'
  pages['/menu/'] = 'Open late'
  const shared = await round(
    pageCall('/menu/', [
      { find: 'Smoked Venison Burger', replace: 'Menu item', expect: 1 },
      { find: 'Open late', replace: '', expect: 1 }
    ])
  )
  assert.deepEqual(
    shared.pairs.map((p) => [p.find, p.done.ok, p.done.cleared ?? null]),
    [
      ['Smoked Venison Burger', true, 'smoked venison burger'],
      ['Open late', true, null]
    ]
  )
  assert.deepEqual(sent.at(-1), { path: '/menu/', all: 'page', find: 'Open late', replace: '', expect: 1 })
})

test('a pair sharing words with another of its call is sent alone after the rest; a refusal naming no pair sends each alone', async () => {
  const pages = { '/': 'Ask about our menu · Ask · Today' }
  const { job, saves, sent } = pageJob(pages)
  const round = sweepRound(job)
  const overlap = await round(
    pageCall('/', [
      { find: 'Ask about our menu', replace: 'Contact', expect: 1 },
      { find: 'Ask', replace: 'Contact', expect: 1 },
      { find: 'Today', replace: '', expect: 1 }
    ])
  )
  assert.deepEqual(
    overlap.pairs.map((p) => [p.find, p.done.ok]),
    [
      ['Ask about our menu', true],
      ['Today', true],
      ['Ask', true]
    ]
  )
  assert.equal(pages['/'], 'Contact · Contact · ')
  assert.deepEqual(saves, ['/', '/'])
  // Over the job's 40 places for one call (TOO_MANY names no pair): each pair is sent alone, as before.
  pages['/menu/'] = `${'$5.00 '.repeat(30)}${'$7.00 '.repeat(15)}`
  sent.length = 0
  const over = await round(
    pageCall('/menu/', [
      { find: '$5.00', replace: '', expect: 30 },
      { find: '$7.00', replace: '', expect: 15 }
    ])
  )
  assert.deepEqual(
    over.pairs.map((p) => [p.find, p.done.ok]),
    [
      ['$5.00', true],
      ['$7.00', true]
    ]
  )
  assert.deepEqual(
    sent.map((p) => (p.changes ? p.changes.length : p.find)),
    [2, '$5.00', '$7.00']
  )
})

test('the check tells tracy-web it sends a page as one call, and a batched round reports each refused pair', async () => {
  const pages = { '/': 'Grilled Salmon · Grilled Salmon · $9.00' }
  const { job } = pageJob(pages)
  const asked = []
  let round = 0
  const result = await runDemoLifecycle(
    { operation: 'check' },
    async (params) => {
      asked.push(params)
      if (params.operation !== 'check.start') return { ok: false, code: 'AGENT_DEMO_BAD_OPERATION' }
      round += 1
      return round === 1
        ? {
            ok: true,
            pass: false,
            checks: [],
            sweep: {
              calls: [
                pageCall('/', [
                  { find: 'Grilled Salmon', replace: 'Menu item', expect: 1 },
                  { find: '$9.00', replace: '', expect: 1 }
                ])
              ]
            }
          }
        : { ok: true, pass: false, checks: [], sweep: { calls: [] } }
    },
    { sweep: job }
  )
  assert.equal(asked[0].sweepBatches, true)
  // A pair refused before any write inside a page's call is a refusal, never marked unknown.
  assert.equal('unknown' in result.swept[0].refused[0], false)
  assert.deepEqual(result.swept, [
    {
      calls: 1,
      refused: [{ action: 'content.replace', find: 'Grilled Salmon', code: 'COUNT_MISMATCH' }],
      cleared: 0,
      unresolved: 0
    }
  ])
})

// 28/10/2026: a grouped write whose receipt was lost was sent again pair by pair, so "Menu item" became
// "Menu item for customer for customer" and the price it had written read as NOT_FOUND.
test('a grouped call whose outcome is unknown is never sent again: each pair answers that outcome, the page as written', async () => {
  const lostWays = [
    ['a thrown call', () => Promise.reject(new Error('socket hang up')), 'SWEEP_CALL_FAILED'],
    [
      'an unknown outcome',
      async () => ({ ok: false, code: 'OUTCOME_UNKNOWN', written: 0 }),
      'OUTCOME_UNKNOWN'
    ],
    [
      'a gateway status',
      async () => ({ ok: false, code: 'COWORK_WEB_BAD_RESPONSE', httpStatus: 502 }),
      'COWORK_WEB_BAD_RESPONSE'
    ],
    // A refusal of a pre-write kind that says a record was written (an undone write) is no proof either.
    [
      'an undone write',
      async () => ({ ok: false, code: 'VALUE_NOT_ALLOWED', written: 1, reverted: false }),
      'VALUE_NOT_ALLOWED'
    ]
  ]
  for (const [label, receipt, code] of lostWays) {
    const pages = { '/': 'Menu item · Price · Ask about it · Ask' }
    const { job } = pageJob(pages)
    let sends = 0
    // A refusal before any write comes back as the job gave it; a write lands whole and only its answer is lost.
    const lossy = async (call) => {
      sends += 1
      const done = await job(call)
      return done.ok === true ? receipt() : done
    }
    const answered = await sweepRound(lossy)(
      pageCall('/', [
        { find: 'Ask about it', replace: 'Contact', expect: 1 },
        { find: 'Menu item', replace: 'Menu item for customer', expect: 1 },
        { find: 'Ask', replace: 'Contact', expect: 1 },
        { find: 'Price', replace: 'Cost', expect: 1 }
      ])
    )
    // The overlap is refused before any write and the rest goes again once; its lost answer ends the call, and the
    // shorter pair waiting for it is kept back for the next check.
    assert.equal(sends, 2, label)
    assert.equal(pages['/'], 'Menu item for customer · Cost · Contact · Ask', label)
    for (const row of answered.pairs) assert.notEqual(row.done.code, 'NOT_FOUND', `${label}: ${row.find}`)
    assert.deepEqual(
      answered.pairs.map((p) => [p.find, p.done.ok === true ? 'ok' : p.done.code]),
      [
        ['Ask about it', code],
        ['Menu item', code],
        ['Price', code],
        ['Ask', 'SWEEP_NOT_SENT']
      ],
      label
    )
  }
})

test('a refusal that proves nothing was written is split and sent again; a grouped write with a lost receipt is sent once', async () => {
  // Lost receipt, no overlap: one send, the page written once.
  const pages = { '/': 'Menu item · Price' }
  const { job, saves } = pageJob(pages)
  const sent = []
  const lost = async (call) => {
    sent.push(call.params)
    await job(call)
    throw new Error('timeout')
  }
  const once = await sweepRound(lost)(
    pageCall('/', [
      { find: 'Menu item', replace: 'Menu item for customer', expect: 1 },
      { find: 'Price', replace: 'Cost', expect: 1 }
    ])
  )
  assert.equal(sent.length, 1)
  assert.deepEqual(saves, ['/'])
  assert.equal(pages['/'], 'Menu item for customer · Cost')
  assert.deepEqual(
    once.pairs.map((p) => p.done.code),
    ['SWEEP_CALL_FAILED', 'SWEEP_CALL_FAILED']
  )
  // A refusal before any write naming no pair (over the job's 40 places): each pair alone, once.
  pages['/menu/'] = `Menu item · ${'$5.00 '.repeat(30)}${'$7.00 '.repeat(15)}`
  const before = sent.length
  const fine = pageJob(pages)
  const split = await sweepRound(async (call) => {
    sent.push(call.params)
    return fine.job(call)
  })(
    pageCall('/menu/', [
      { find: 'Menu item', replace: 'Menu item for customer', expect: 1 },
      { find: '$5.00', replace: '', expect: 30 },
      { find: '$7.00', replace: '', expect: 15 }
    ])
  )
  assert.deepEqual(
    sent.slice(before).map((p) => (p.changes ? p.changes.length : p.find)),
    [3, 'Menu item', '$5.00', '$7.00']
  )
  assert.ok(split.pairs.every((p) => p.done.ok === true))
  assert.match(pages['/menu/'], /^Menu item for customer · \s*$/)
})

test("a sweep row whose write's answer was lost says unknown: never one to write again; a refusal before any write does not", async () => {
  let round = 0
  const result = await runDemoLifecycle(
    { operation: 'check' },
    async () => {
      round += 1
      return round === 1
        ? {
            ok: true,
            pass: false,
            checks: [],
            sweep: {
              calls: [
                pageCall('/', [
                  { find: 'Menu item', replace: 'Menu item for customer', expect: 1 },
                  { find: 'Price', replace: 'Cost', expect: 1 }
                ]),
                {
                  action: 'content.replace',
                  params: { path: '/about/', find: 'Ask', replace: 'Contact', expect: 2 }
                }
              ]
            }
          }
        : { ok: true, pass: false, checks: [], sweep: { calls: [] } }
    },
    {
      sweep: async (call) =>
        call.params.path === '/'
          ? { ok: false, code: 'OUTCOME_UNKNOWN' }
          : { ok: false, code: 'COUNT_MISMATCH', count: 1 }
    }
  )
  assert.deepEqual(result.swept[0].refused, [
    { action: 'content.replace', find: 'Menu item', code: 'OUTCOME_UNKNOWN', unknown: true },
    { action: 'content.replace', find: 'Price', code: 'OUTCOME_UNKNOWN', unknown: true },
    { action: 'content.replace', find: 'Ask', code: 'COUNT_MISMATCH' }
  ])
  // A refusal before any write is a refusal, never marked unknown.
  const prewrite = result.swept[0].refused.find((r) => r.code === 'COUNT_MISMATCH')
  assert.equal(prewrite.unknown, undefined)
  assert.equal('unknown' in prewrite, false)
})

// ── A round's calls several at a time where the site's door takes them (02/11/2026) ─────────────────────────────

/**
 * A site of records, each page showing its own and the shared footer. The replace job reads the page's records, waits
 * as a real job does (its reads, the write exec), then writes each record it changes under that record's revision: a
 * record another write changed since the read is refused `STORE_CHANGED`, never overwritten (EmDash's `_rev`). Each
 * call's time on the door is logged, so a test can say which calls were in flight together.
 */
function revisedSite() {
  const records = {
    home: { text: 'Our story began in 1998 · Welcome to Bistro Template', v: 0 },
    menu: { text: 'Smoked Venison Burger with fries · Smoked Venison', v: 0 },
    about: { text: 'Meet chef Anna Doe', v: 0 },
    team: { text: 'Anna Doe · John Roe', v: 0 },
    hours: { text: 'Open daily from nine to five', v: 0 },
    visit: { text: 'Free parking behind the bistro', v: 0 },
    footer: { text: '398 North Street · M. +201 382', v: 0 },
    post: { text: '2021-09-10', v: 0 }
  }
  const shows = {
    '/': ['home', 'footer'],
    '/menu/': ['menu', 'footer'],
    '/about/': ['about', 'footer'],
    '/team/': ['team', 'footer'],
    '/hours/': ['hours', 'footer'],
    '/visit/': ['visit', 'footer']
  }
  // The first calls are the slowest: a round sent in its order with nothing held back would be overtaken.
  const slow = { '/': 30, '/menu/': 20, '/about/': 12, '/team/': 4, '/hours/': 8, '/visit/': 2 }
  const spans = []
  let clock = 0
  let flying = 0
  const site = { records, shows, spans, most: 0 }
  site.job = async (call) => {
    const span = { call, from: clock++, to: Number.POSITIVE_INFINITY }
    spans.push(span)
    site.most = Math.max(site.most, ++flying)
    try {
      if (call.action !== 'content.replace') {
        await new Promise((resolve) => setTimeout(resolve, 3))
        records.post = { text: call.params.fields.date, v: records.post.v + 1 }
        return { ok: true }
      }
      const { path, changes: list, ...one } = call.params
      const changes = list ?? [{ find: one.find, replace: one.replace, expect: one.expect }]
      const named = (i) => (changes.length > 1 ? { change: i } : {})
      const read = shows[path].map((id) => ({ id, ...records[id] }))
      await new Promise((resolve) => setTimeout(resolve, slow[path]))
      const count = (find) => read.reduce((n, r) => n + r.text.split(find).length - 1, 0)
      for (const [i, c] of changes.entries()) {
        const n = count(c.find)
        if (n === 0) return { ok: false, code: 'NOT_FOUND', ...named(i) }
        if (c.expect !== undefined && n !== c.expect)
          return { ok: false, code: 'COUNT_MISMATCH', count: n, ...named(i) }
      }
      const touched = read.filter((r) => changes.some((c) => r.text.includes(c.find)))
      if (touched.some((r) => records[r.id].v !== r.v)) return { ok: false, code: 'STORE_CHANGED' }
      for (const r of touched) {
        let text = r.text
        for (const c of changes) text = text.replaceAll(c.find, c.replace)
        records[r.id] = { text, v: r.v + 1 }
      }
      return { ok: true, count: changes.reduce((n, c) => n + count(c.find), 0) }
    } finally {
      flying -= 1
      span.to = clock++
    }
  }
  return site
}

/** One round as tracy-web plans it for the site above: every page's first calls, then the later ones (`onePerPage`). */
const revisedRound = () => [
  pageCall('/', [
    { find: 'Our story began in 1998', replace: 'Our story', expect: 1 },
    { find: '398 North Street', replace: '12 Market Lane', expect: 1 }
  ]),
  pageCall('/menu/', [
    { find: 'Smoked Venison Burger with fries', replace: 'Menu item', expect: 1 },
    { find: '398 North Street', replace: '12 Market Lane', expect: 1 }
  ]),
  pageCall('/hours/', [{ find: 'Open daily from nine to five', replace: 'Open every day', expect: 1 }]),
  pageCall('/visit/', [{ find: 'Free parking behind the bistro', replace: 'Parking nearby', expect: 1 }]),
  pageCall('/about/', [{ find: 'Meet chef Anna Doe', replace: 'Meet the chef', expect: 1 }]),
  pageCall('/team/', [{ find: 'Anna Doe', replace: 'Our chef', expect: 1 }]),
  pageCall('/team/', [{ find: 'John Roe', replace: 'Our cook', expect: 1 }]),
  pageCall('/menu/', [{ find: 'Smoked Venison', replace: 'Menu item', expect: 1 }]),
  // The round's cap took the footer's phone on /visit/ alone; the read showed it on every page (`shown`). Sent beside
  // the write on / it would meet the footer's revision moved under it.
  pageCall('/visit/', [{ find: 'M. +201 382', replace: 'Call us', expect: 1 }]),
  { action: 'content.update', params: { kind: 'post', id: 11, fields: { date: '2026-11-02' } } },
  pageCall('/', [{ find: 'Welcome to Bistro Template', replace: 'Welcome', expect: 1 }])
]

/** Every page's words the read before the round showed, cap or not: the round's, and the footer's on every page. */
const revisedShown = (site) => [
  ...revisedRound().flatMap((call) =>
    (call.params.changes ?? []).map((c) => `${call.params.path}\u0000${c.find}`)
  ),
  ...Object.keys(site.shows).flatMap((path) => [`${path}\u0000398 North Street`, `${path}\u0000M. +201 382`])
]

/** The check of the site above: the round's calls first, then nothing left. `inFlight` is what tracy-web allows. */
async function sweptSite(inFlight) {
  const site = revisedSite()
  let checks = 0
  const result = await runDemoLifecycle(
    { operation: 'check' },
    async () =>
      ++checks === 1
        ? {
            ok: true,
            pass: false,
            checks: [],
            sweep: {
              calls: revisedRound(),
              unresolved: [],
              shown: revisedShown(site),
              ...(inFlight ? { inFlight } : {})
            }
          }
        : { ok: true, pass: true, checks: [] },
    { sweep: site.job }
  )
  return { site, result }
}

/** Whether two logged calls were on the door at the same time. */
const together = (a, b) => a.from < b.to && b.from < a.to

test('a round tracy-web allows four at a time ends as the same site and report as one call at a time', async () => {
  const serial = await sweptSite(undefined)
  const parallel = await sweptSite(4)
  // Without `inFlight` (a WordPress or Joomla site, or a tracy-web from before): one call at a time, as always.
  assert.equal(serial.site.most, 1)
  assert.ok(parallel.site.most > 1, `in flight at most ${parallel.site.most}`)
  assert.ok(parallel.site.most <= 4)
  // The same records, each change written once, none refused for a revision another call moved meanwhile.
  assert.deepEqual(parallel.site.records, serial.site.records)
  assert.equal(parallel.site.records.footer.text, '12 Market Lane · Call us')
  assert.equal(parallel.site.records.menu.text, 'Menu item · Menu item')
  assert.deepEqual(parallel.result.swept, serial.result.swept)
  assert.equal(parallel.result.pass, true)
  // The shared footer's words on /menu/ answer cleared by the write on / before them, in both.
  assert.equal(parallel.result.swept[0].cleared, 1)
  assert.deepEqual(parallel.result.swept[0].refused, [])
})

test("in a round sent several at a time, a page's calls, words one holds of another's and a shared part's words keep their order", async () => {
  const { site } = await sweptSite(4)
  const spans = site.spans
  const of = (path, find) =>
    spans.filter(
      (s) =>
        s.call.params.path === path && (s.call.params.changes ?? [s.call.params]).some((c) => c.find === find)
    )
  const before = (a, b) => a.length > 0 && b.length > 0 && a.every((x) => b.every((y) => x.to < y.from))
  // A page's calls: its second call starts once its first has answered.
  assert.ok(before(of('/menu/', 'Smoked Venison Burger with fries'), of('/menu/', 'Smoked Venison')))
  assert.ok(before(of('/team/', 'Anna Doe'), of('/team/', 'John Roe')))
  // Words one call holds of another's, on another page: in the round's order.
  assert.ok(before(of('/about/', 'Meet chef Anna Doe'), of('/team/', 'Anna Doe')))
  // A shared part's words on two pages, and words the read showed on several pages, one call after the other.
  assert.ok(before(of('/', '398 North Street'), of('/menu/', '398 North Street')))
  assert.ok(before(of('/menu/', '398 North Street'), of('/visit/', 'M. +201 382')))
  // A call that is not a page's words waits for every call before it, and every call after waits for it.
  const update = spans.filter((s) => s.call.action === 'content.update')
  assert.equal(update.length, 1)
  for (const s of spans)
    if (s !== update[0]) assert.ok(!together(s, update[0]), JSON.stringify(s.call.params))
  assert.ok(before(update, of('/', 'Welcome to Bistro Template')))
  // A page with its own words only went beside the others.
  const [hours] = of('/hours/', 'Open daily from nine to five')
  assert.ok(spans.some((s) => s !== hours && together(s, hours)))
})

test('what each call of a round waits for: its page, overlapping words, words several pages show, any other call', () => {
  const calls = [
    pageCall('/a/', [{ find: 'Footer line', replace: 'x' }]),
    pageCall('/b/', [{ find: 'Footer line', replace: 'x' }]),
    pageCall('/c/', [{ find: 'Own words of c', replace: 'x' }]),
    pageCall('/d/', [{ find: 'Phone 555', replace: 'x' }]),
    pageCall('/e/', [{ find: 'Phone 555 or email', replace: 'x' }]),
    pageCall('/c', [{ find: 'More of c', replace: 'x' }]),
    // The round planned these words on /g/ alone; the read showed them on /h/ too.
    pageCall('/g/', [{ find: 'Banner words', replace: 'x' }]),
    {
      action: 'content.replace',
      params: { path: '/f/', find: 'https://template.test/', replace: '/', href: true }
    },
    pageCall('/k/', [{ find: 'Own words of k', replace: 'x' }])
  ]
  const shown = ['/h/\u0000Banner words']
  assert.deepEqual(roundOrder(calls, shown), [
    [],
    // The same words on another page.
    [0],
    // Words its page alone shows: nothing before it.
    [],
    // Words several pages show wait for every call before them with such words, whatever the words.
    [0, 1],
    [0, 1, 3],
    // The same page, with or without its last slash.
    [2],
    [0, 1, 3, 4],
    // A link (and any call that is not a page's words) waits for every call before it…
    [0, 1, 2, 3, 4, 5, 6],
    // …and every call after it waits for it.
    [7]
  ])
  // Without the read's list, /g/'s words are its page's own.
  assert.deepEqual(roundOrder(calls)[6], [])
})

test('a round never has more than four calls in flight, whatever tracy-web asks; a bad number is one at a time', async () => {
  const calls = Array.from({ length: 12 }, (_, i) =>
    pageCall(`/p${i}/`, [{ find: `Own words ${i}`, replace: 'x' }])
  )
  for (const [asked, most] of [
    [16, 4],
    [4, 4],
    [2, 2],
    [1, 1],
    [0, 1],
    ['4', 1],
    [2.5, 1],
    [undefined, 1]
  ]) {
    let flying = 0
    let seen = 0
    const order = []
    const answers = await sendRound(
      calls,
      async (_call, at) => {
        order.push(at)
        seen = Math.max(seen, ++flying)
        await new Promise((resolve) => setTimeout(resolve, 12 - at))
        flying -= 1
        return { ok: true, at }
      },
      { inFlight: asked }
    )
    assert.equal(seen, most, `asked ${asked}`)
    // Each answer at its call's place, whichever came back first; the calls started in the round's order.
    assert.deepEqual(
      answers.map((a) => a.at),
      calls.map((_, i) => i)
    )
    assert.deepEqual(
      order,
      calls.map((_, i) => i)
    )
  }
})

test('Stop in a round sent several at a time sends nothing more, lets the calls in flight answer, and stops', async () => {
  const stop = new AbortController()
  const calls = Array.from({ length: 8 }, (_, i) =>
    pageCall(`/p${i}/`, [{ find: `Own words ${i}`, replace: 'x' }])
  )
  const started = []
  const finished = []
  const answers = await sendRound(
    calls,
    async (_call, at) => {
      started.push(at)
      if (at === 1) stop.abort()
      await new Promise((resolve) => setTimeout(resolve, 5))
      finished.push(at)
      return { ok: true }
    },
    { inFlight: 4, signal: stop.signal }
  )
  assert.equal(answers, null)
  assert.deepEqual(started, [0, 1])
  assert.deepEqual(finished.sort(), [0, 1])
  // Through the check: the stopped answer, and no check after it.
  const stopping = new AbortController()
  let checks = 0
  const result = await runDemoLifecycle(
    { operation: 'check' },
    async () => {
      checks += 1
      return { ok: true, pass: false, checks: [], sweep: { calls, unresolved: [], inFlight: 4 } }
    },
    {
      signal: stopping.signal,
      sweep: async (call) => {
        if (call.params.path === '/p0/') stopping.abort()
        return { ok: true }
      }
    }
  )
  assert.equal(result.code, 'TURN_STOPPED')
  assert.equal(checks, 1)
})

test('words an earlier write of the round holds answer cleared by that write, whichever answer came back first', async () => {
  // /about/'s passage is the round's first call and the slowest; /x/'s words come back first. Both hold the phone
  // the third call looks for on /about/, which waits for both: one at a time, the first write named it.
  const pages = { '/about/': 'Call M. +201 382 today', '/x/': 'M. +201 382 or email' }
  const { job } = pageJob(pages)
  const slowJob = async (call) => {
    await new Promise((resolve) => setTimeout(resolve, call.params.path === '/about/' ? 20 : 1))
    return job(call)
  }
  const calls = [
    pageCall('/about/', [{ find: 'Call M. +201 382 today', replace: 'Call us', expect: 1 }]),
    pageCall('/x/', [{ find: 'M. +201 382 or email', replace: 'Write to us', expect: 1 }]),
    pageCall('/about/', [{ find: 'M. +201 382', replace: '+1 555', expect: 1 }])
  ]
  const cleared = async (inFlight) =>
    (await sendRound(calls, sweepRound(slowJob), { inFlight })).map(
      (a) => a.pairs[0].done.cleared ?? (a.pairs[0].done.ok ? 'ok' : a.pairs[0].done.code)
    )
  const serial = await cleared(1)
  Object.assign(pages, { '/about/': 'Call M. +201 382 today', '/x/': 'M. +201 382 or email' })
  assert.deepEqual(serial, ['ok', 'ok', 'call m. +201 382 today'])
  assert.deepEqual(await cleared(4), serial)
})
