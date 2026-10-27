import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mintSession } from '../src/lib/session.js'
import { inspectOwnJob } from '../src/sites/job-inspect.js'
import { sitesRoutes } from '../src/sites/route.js'
import { widgetConversation } from '../src/widget/model.js'

const owner = '00000000-0000-4000-8000-000000000001'
const base = {
  creation_state: 'done',
  job_state: 'done',
  site_key: 'mine.test',
  address: 'https://mine.test/',
  brief_state: 'applied',
  design_state: 'applied',
  recorded_at: new Date(0)
}
const result = (row) =>
  inspectOwnJob(
    {
      async query(sql, args) {
        assert.match(sql, /^select /)
        assert.doesNotMatch(sql, /\b(insert|update|delete)\b/i)
        assert.deepEqual(args, [owner, 'mine.test', 'job1'])
        return { rows: row ? [row] : [] }
      }
    },
    { siteKey: 'mine.test', jobId: 'job1', accountId: owner, now: 1 }
  )
test('SELECT-only persisted build facts: known states, nulls, unknowns and safe links', async () => {
  assert.equal((await result(null)).status, 403)
  assert.equal((await result({ ...base, site_key: null })).status, 404)
  const done = (await result(base)).body
  assert.equal(done.state, 'done')
  assert.equal(done.completion.briefState, 'applied')
  assert.deepEqual(done.links, { openWebsite: 'https://mine.test/', continueTracy: '/mine.test/' })
  for (const [patch, state] of [
    [{ creation_state: 'claiming', job_state: 'queued' }, 'pending'],
    [{ creation_state: 'provisioning', job_state: 'running' }, 'running'],
    [{ creation_state: 'failed' }, 'failed'],
    [{ job_state: 'unexpected' }, 'unavailable'],
    [{ brief_state: 'unexpected' }, 'unavailable'],
    [{ design_state: 'unexpected' }, 'unavailable'],
    [{ creation_state: 'unexpected' }, 'unavailable'],
    [{ brief_state: 'applying' }, 'running']
  ])
    assert.equal((await result({ ...base, ...patch })).body.state, state)
  const empty = (
    await result({ ...base, brief_state: null, design_state: null, recorded_at: 'bad', address: null })
  ).body
  assert.equal(empty.completion.briefState, null)
  assert.equal(empty.freshness.recordedAt, null)
  assert.equal(empty.links.openWebsite, null)
  for (const address of [
    'javascript:alert(1)',
    'https://user:password@mine.test/',
    'https://mine.test/#token'
  ])
    assert.equal((await result({ ...base, address })).body.links.openWebsite, null)
})
test('actual inspect route fences auth, grant, job/site and creator before return, with no host/writes', async () => {
  const secret = 'test-only-secret',
    cookie = 'tracy_sess=' + (await mintSession('me@test.invalid', secret))
  for (const scenario of ['ok', 'signedout', 'grant', 'wrongsite', 'creator', 'missing']) {
    const queries = []
    const pool = {
      async query(sql) {
        queries.push(sql)
        assert.match(sql, /^select /i)
        if (sql.includes('from job'))
          return {
            rows:
              scenario === 'missing'
                ? []
                : [{ site_key: scenario === 'wrongsite' ? 'other.test' : 'mine.test', kind: 'provision' }]
          }
        if (sql.includes('from site_creation')) return { rows: scenario === 'creator' ? [] : [base] }
        throw Error('Unexpected SQL')
      }
    }
    const app = sitesRoutes({
      pool,
      config: { origin: 'https://tracy.test', sessionSecret: secret },
      host: new Proxy(
        {},
        {
          get() {
            throw Error('No host calls allowed')
          }
        }
      ),
      seats: {
        accountByEmail: async () => ({ id: owner }),
        grantFor: async () => (scenario === 'grant' ? null : { role: 'owner' }),
        actingEditor: (g) => g?.role === 'owner'
      },
      github: {}
    })
    const response = await app.request('https://tracy.test/api/sites/mine.test/jobs/job1?inspect=1', {
      headers: { cookie: scenario === 'signedout' ? '' : cookie }
    })
    assert.equal(
      response.status,
      { ok: 200, signedout: 401, grant: 403, wrongsite: 403, creator: 403, missing: 404 }[scenario],
      scenario
    )
    if (scenario === 'signedout' || scenario === 'grant') assert.equal(queries.length, 0)
    if (scenario === 'ok') {
      assert.equal(queries.length, 2)
      assert.equal((await response.json()).state, 'done')
    }
  }
})
function visitor() {
  return {
    history: [],
    brief: { name: 'Known', about: 'Known brief', goal: 'contact', style: 'modern', platform: 'wordpress' },
    templateIds: [],
    systemIds: [],
    build: { siteKey: 'mine.test', jobId: 'job1' }
  }
}
test('model preload and empty-argument status tool use server-owned facts; signed-in login tool/action cannot open auth', async (t) => {
  let reads = 0,
    saves = 0,
    calls = 0
  const facts = {
    schema: 'widget-build-status/v1',
    state: 'done',
    links: { openWebsite: 'https://mine.test/', continueTracy: '/mine.test/' }
  }
  const conversation = widgetConversation({
    pool: { query: async () => ({ rows: [] }) },
    config: { model: { apiKey: 'test', baseUrl: 'https://model.invalid', words: 'test' } },
    catalog: async () => ({ templates: [], systems: [] }),
    state: (v) => ({ history: v.history, brief: v.brief, build: v.build }),
    save: async () => {
      saves++
    },
    isSignedIn: async () => true,
    buildStatus: async () => {
      reads++
      return facts
    }
  })
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body)
    calls++
    assert.match(body.messages[0].content, /"signedIn":true/)
    assert.match(body.messages[0].content, /"state":"done"/)
    const status = body.tools.find((x) => x.function.name === 'get_current_build_status')
    assert.deepEqual(status.function.parameters.properties, {})
    if (calls === 1)
      return Response.json({
        choices: [
          {
            message: {
              role: 'assistant',
              tool_calls: [
                { id: 'a', function: { name: 'get_current_build_status', arguments: '{}' } },
                { id: 'b', function: { name: 'get_current_build_status', arguments: '{"jobId":"other"}' } },
                { id: 'c', function: { name: 'open_sign_in', arguments: '{}' } }
              ]
            }
          }
        ]
      })
    assert.equal(JSON.parse(body.messages.find((x) => x.tool_call_id === 'a').content).state, 'done')
    assert.equal(
      JSON.parse(body.messages.find((x) => x.tool_call_id === 'b').content).reason,
      'INVALID_ARGUMENTS'
    )
    assert.equal(JSON.parse(body.messages.find((x) => x.tool_call_id === 'c').content).signedIn, true)
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              speak: 'Your existing website is ready.',
              action: { type: 'open_login' }
            })
          }
        }
      ]
    })
  })
  const v = visitor(),
    out = await conversation.turn({}, v, 'Check my website')
  assert.equal(out.action, null)
  assert.equal(out.buildStatus.state, 'done')
  assert.equal(reads, 2)
  assert.equal(calls, 2)
  assert.equal(saves, 1)
  const login = await conversation.turn({}, v, 'open login')
  assert.equal(login.action, null)
  assert.equal(calls, 2)
  assert.equal(login.signedIn, true)
})
