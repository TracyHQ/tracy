// The write step bench's real site door (ADR 0044) against a fake fetch: it calls the customer's doors as the bench
// account, with a signed session cookie, and reads their answers.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sessionFromCookieHeader } from '../src/lib/session.js'
import { httpSiteDoor } from '../src/write-step/bench-site-door.js'

const SECRET = 'test-secret-test-secret-test-secret-0000'

function door(answers, options = {}) {
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push({ url, init })
    const [status, body] = answers.shift()
    return { status, text: async () => JSON.stringify(body) }
  }
  return {
    seen,
    door: httpSiteDoor({
      baseUrl: 'http://app.test',
      secret: SECRET,
      email: 'Bench@Example.test',
      platform: 'joomla',
      templateOf: async (quickstart) => (quickstart === 'no-card/j6' ? null : 'demo-gym'),
      fetchImpl,
      sleep: async () => {},
      ...options
    })
  }
}

test('create posts the customer request as the bench account and wants a 202 with a job id', async () => {
  const { seen, door: d } = door([[202, { siteKey: 'write-bench-abc.sites.example', jobId: 'j1' }]])
  assert.deepEqual(await d.create({ label: 'write-bench-abc', quickstart: 'demo-gym/j6' }), {
    ok: true,
    siteKey: 'write-bench-abc.sites.example',
    jobId: 'j1'
  })
  assert.equal(seen[0].url, 'http://app.test/api/sites')
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    label: 'write-bench-abc',
    platform: 'joomla',
    design: 'demo-gym',
    quickstart: 'demo-gym/j6'
  })
  assert.equal(await sessionFromCookieHeader(seen[0].init.headers.cookie, SECRET), 'bench@example.test')
})

test('a quickstart no template card installs is refused before anything is asked of the server', async () => {
  const { seen, door: d } = door([])
  const made = await d.create({ label: 'write-bench-abc', quickstart: 'no-card/j6' })
  assert.equal(made.ok, false)
  assert.equal(made.code, 'NO_TEMPLATE_CARD')
  assert.equal(seen.length, 0)
})

test('a refused create keeps the code', async () => {
  const { door: d } = door([[400, { code: 'UNSUPPORTED_QUICKSTART' }]])
  const made = await d.create({ label: 'write-bench-abc', quickstart: 'x' })
  assert.equal(made.ok, false)
  assert.equal(made.code, 'UNSUPPORTED_QUICKSTART')
})

test('job states map to running, done and failed', async () => {
  const { door: d } = door([
    [200, { state: 'running', step: 'install' }],
    [200, { state: 'done' }],
    [200, { state: 'failed', step: 'install', error: 'disk full' }]
  ])
  assert.deepEqual(await d.job('k', 'j'), { state: 'running', step: 'install', reason: undefined })
  assert.equal((await d.job('k', 'j')).state, 'done')
  const failed = await d.job('k', 'j')
  assert.equal(failed.state, 'failed')
  assert.equal(failed.reason, 'disk full')
})

test('inspect reads the contract through the Apply door', async () => {
  const { seen, door: d } = door([[200, { ok: true, contract: 'demo-gym/j6/1.2.3', revision: 'r1' }]])
  assert.deepEqual(await d.inspect('k.sites.example'), { ok: true, contract: 'demo-gym/j6/1.2.3' })
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    action: 'content.contract',
    params: { operation: 'inspect' }
  })
})

test('remove waits through a pending delete until the site is removed', async () => {
  const { door: d } = door([
    [202, { code: 'DELETE_PENDING' }],
    [200, { removed: true }]
  ])
  assert.deepEqual(await d.remove('k.sites.example'), { ok: true })
  const refused = door([[403, { code: 'NOT_SITE_OWNER' }]])
  assert.equal((await refused.door.remove('k.sites.example')).ok, false)
})

test('apply hands back the plugin answer, per-slot errors included, and shapes a door refusal as a refusal', async () => {
  const refusal = {
    ok: false,
    error: 'contract_failed',
    errors: [{ code: 'A', field: { slotKey: 'module-1.1' } }]
  }
  const { seen, door: d } = door([
    [200, refusal],
    [403, { code: 'TOOLSET_NOT_GRANTED', role: 'viewer' }],
    [400, { error: { code: 'CONTENT_BAD_QUERY', message: 'bad query' } }],
    [200, { ok: true, contract: 'demo-gym/j6/1.2.3' }]
  ])
  const call = { siteKey: 'a.sites.example', action: 'content.contract', params: { operation: 'apply' } }
  assert.deepEqual(await d.apply(call), refusal)
  assert.equal(seen[0].url, 'http://app.test/api/sites/a.sites.example/apply')
  assert.deepEqual(JSON.parse(seen[0].init.body), { action: call.action, params: call.params })
  const noSeat = await d.apply(call)
  assert.deepEqual([noSeat.ok, noSeat.code, noSeat.status], [false, 'TOOLSET_NOT_GRANTED', 403])
  const nested = await d.apply(call)
  assert.deepEqual([nested.ok, nested.code, nested.message], [false, 'CONTENT_BAD_QUERY', 'bad query'])
  assert.equal((await d.apply(call)).contract, 'demo-gym/j6/1.2.3')
})

test('recovery pins only a full backup and restores through one verified, idempotent customer operation', async () => {
  const point = {
    kind: 'backup',
    version: 2,
    sha: 'a'.repeat(40),
    database: { state: 'full', sha256: 'b'.repeat(64) }
  }
  const history = {
    rows: [{ ...point, version: 3, database: { state: 'none' } }, point],
    may: { restoreEverything: true }
  }
  const { door: d, seen } = door([
    [200, history],
    [200, history],
    [202, { operationId: 'op-1', status: 'unknown' }],
    [200, { ok: true, operationId: 'op-1', status: 'succeeded', head: 'c'.repeat(40) }]
  ])
  const pinned = await d.recoveryPoint('k.sites.example')
  assert.equal(pinned.version, 2)
  const restored = await d.restorePoint('k.sites.example', pinned, 'chain-recovery-test')
  assert.equal(restored.ok, true)
  const requests = seen.filter((r) => r.init.method === 'POST').map((r) => JSON.parse(r.init.body))
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[0], requests[1])
  assert.deepEqual(requests[0], {
    mode: 'everything',
    version: 2,
    confirm: 'restore',
    idemKey: 'chain-recovery-test'
  })
})

test('recovery refuses changed backup bytes and never restores a files-only point', async () => {
  const point = {
    kind: 'backup',
    version: 1,
    sha: 'a'.repeat(40),
    database: { state: 'full', sha256: 'b'.repeat(64) }
  }
  const { door: d, seen } = door([
    [200, { rows: [{ ...point, database: { state: 'none' } }], may: { restoreEverything: true } }],
    [200, { rows: [{ ...point, sha: 'c'.repeat(40) }] }]
  ])
  assert.equal(await d.recoveryPoint('k.sites.example'), null)
  assert.equal(
    (await d.restorePoint('k.sites.example', point, 'same-operation')).code,
    'RECOVERY_POINT_CHANGED'
  )
  assert.equal(
    seen.some((r) => r.init.method === 'POST'),
    false
  )
})

test('pending backup history is not reported as an absent full recovery point', async () => {
  const { door: d } = door([[202, { code: 'FLEET_JOB_PENDING' }]], { now: () => 0 })
  await assert.rejects(d.recoveryPoint('k.sites.example', { waitMs: 0 }), {
    code: 'SITE_RECOVERY_POINT_PENDING'
  })
})

test('turn undo requires verified completion even when the service accepted the request', async () => {
  const states = [
    [200, { ok: true, complete: false, turns: [{ files: { status: 'unsure' } }] }],
    [200, { ok: true, complete: false, turns: [{ content: { failed: [{ applyId: 'a1' }] } }] }],
    [200, { ok: true }],
    [200, {}],
    [202, { ok: true, complete: true }],
    [200, { ok: true, complete: true, turns: [] }]
  ]
  const { door: d } = door(states)
  const body = { session: 'session-1', turnId: 'session-1:1', scope: 'turn', idemKey: 'repair-1' }
  for (let i = 0; i < 5; i++) {
    const answer = await d.undoTurn('k.sites.example', body)
    assert.equal(answer.ok, false, `unverified response ${i} must not mark the turn undone`)
    assert.equal(answer.code, i === 4 ? 'HTTP_202' : 'TURN_UNDO_UNVERIFIED')
  }
  assert.equal((await d.undoTurn('k.sites.example', body)).ok, true)
})

test('pending backup history waits for full proof before returning a recovery point', async () => {
  const point = {
    kind: 'backup',
    version: 1,
    sha: 'a'.repeat(40),
    database: { state: 'full', sha256: 'b'.repeat(64) }
  }
  const { door: d, seen } = door([
    [202, { code: 'FLEET_JOB_PENDING' }],
    [200, { may: { restoreEverything: true }, rows: [point] }]
  ])
  assert.deepEqual(await d.recoveryPoint('k.sites.example'), {
    version: point.version,
    sha: point.sha,
    database: point.database
  })
  assert.equal(seen.length, 2)
})

test('pending recovery reads stop at their deadline without another request', async () => {
  let time = 0
  const { door: d, seen } = door([[202, { code: 'FLEET_JOB_PENDING' }]], {
    now: () => time,
    sleep: async (ms) => {
      time += ms
    }
  })
  await assert.rejects(d.recoveryPoint('k.sites.example', { waitMs: 500 }), {
    code: 'SITE_RECOVERY_POINT_PENDING'
  })
  assert.equal(seen.length, 1)
})

test('canceling a pending recovery read prevents further requests', async () => {
  const controller = new AbortController()
  const { door: d, seen } = door([[202, { code: 'FLEET_JOB_PENDING' }]], {
    sleep: async () => {
      controller.abort(new Error('run canceled'))
    }
  })
  await assert.rejects(d.recoveryPoint('k.sites.example', { signal: controller.signal }), /run canceled/)
  assert.equal(seen.length, 1)
})

test('repeated pending recovery reads have a finite attempt limit even with a fixed clock', async () => {
  const { door: d, seen } = door(
    Array.from({ length: 4 }, () => [202, { code: 'FLEET_JOB_PENDING' }]),
    { now: () => 0 }
  )
  await assert.rejects(d.recoveryPoint('k.sites.example'), { code: 'SITE_RECOVERY_POINT_PENDING' })
  assert.equal(seen.length, 4)
})

test('an unrelated 202 never starts recovery polling', async () => {
  const { door: d, seen } = door([[202, { code: 'OTHER_PENDING' }]])
  await assert.rejects(d.recoveryPoint('k.sites.example'), { code: 'SITE_RECOVERY_POINT_PENDING' })
  assert.equal(seen.length, 1)
})

test('canceling a recovery request aborts the in-flight owner fetch', async () => {
  const controller = new AbortController()
  let requested = 0
  const { door: d } = door([], {
    fetchImpl: async (_url, init) => {
      requested++
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
        controller.abort(new Error('run canceled in request'))
      })
    }
  })
  await assert.rejects(
    d.recoveryPoint('k.sites.example', { signal: controller.signal }),
    /run canceled in request/
  )
  assert.equal(requested, 1)
})

test('the overall deadline expiring during a pending recovery request retains the pending code', async () => {
  let requests = 0
  let clock = 0
  const keepAlive = setTimeout(() => {}, 2000)
  const { door: d } = door([], {
    now: () => clock,
    sleep: async () => {},
    fetchImpl: async (_url, init) => {
      if (++requests === 1)
        return { status: 202, text: async () => JSON.stringify({ code: 'FLEET_JOB_PENDING' }) }
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => {
            clock = 60
            reject(init.signal.reason)
          },
          { once: true }
        )
      })
    }
  })
  try {
    await assert.rejects(d.recoveryPoint('k.sites.example', { waitMs: 60 }), {
      code: 'SITE_RECOVERY_POINT_PENDING'
    })
    assert.equal(requests, 2)
  } finally {
    clearTimeout(keepAlive)
  }
})

test('a pending recovery request keeps a network failure even at its wait deadline', async () => {
  let requests = 0
  let clock = 0
  const failure = new TypeError('network failed')
  const { door: d } = door([], {
    now: () => clock,
    sleep: async () => {},
    fetchImpl: async () => {
      if (++requests === 1)
        return { status: 202, text: async () => JSON.stringify({ code: 'FLEET_JOB_PENDING' }) }
      clock = 60
      throw failure
    }
  })
  await assert.rejects(d.recoveryPoint('k.sites.example', { waitMs: 60 }), (error) => error === failure)
  assert.equal(requests, 2)
})

test('external timeout cancellation wins over a pending recovery deadline', async () => {
  let requests = 0
  let clock = 0
  const controller = new AbortController()
  const reason = new DOMException('external run deadline', 'TimeoutError')
  const { door: d } = door([], {
    now: () => clock,
    sleep: async () => {},
    fetchImpl: async () => {
      if (++requests === 1)
        return { status: 202, text: async () => JSON.stringify({ code: 'FLEET_JOB_PENDING' }) }
      clock = 60
      controller.abort(reason)
      throw reason
    }
  })
  await assert.rejects(
    d.recoveryPoint('k.sites.example', { waitMs: 60, signal: controller.signal }),
    (error) => error === reason
  )
  assert.equal(requests, 2)
})
