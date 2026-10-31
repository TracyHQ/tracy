/** Page discovery through the shipped Tracy plugin and the real vendored dsh agent loop/registry. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { siteToolDescription } from '../src/host/surface.mjs'
import { runPageSearchHarness as run } from './fixtures/page-search-harness.mjs'
const query = (search) => ({ action: 'content.read', params: { view: 'pages', search } })

for (const platform of ['joomla', 'emdash']) {
  test(`real AgentLoop scopes the ${platform} tool and preserves OR page IDs`, async () => {
    const r = await run([query(['Alpha', 'Beta'])], { platform })
    assert.equal(r.sent.length, 1)
    const answer = JSON.stringify(r.requests.map((request) => request.messages))
    assert.match(answer, /opaque-alpha/)
    assert.match(answer, /opaque-beta/)
    assert.doesNotMatch(answer, /opaque-other/)
    assert.equal(
      r.requests[0].tools.find((tool) => tool.name === 'tracy_site').description,
      siteToolDescription(platform)
    )
  })
}

test('real AgentLoop uses the scoped shipped tool: two titles, one relay, complete IDs, stable schema and logged results', async () => {
  const r = await run([query(['Alpha', 'Beta'])])
  assert.ok(r.requests.length >= 2)
  assert.equal(r.sent.length, 1, JSON.stringify(r.sent))
  assert.match(r.sent[0].url, /\/_conversation\/apply$/)
  assert.equal(r.sent[0].headers['x-tracy-workspace-label'], 'owned')
  assert.equal(r.sent[0].headers['x-tracy-actor'], 'signed:editor@example.test')
  assert.deepEqual(r.sent[0].body.params, { view: 'pages' })
  const answer = JSON.stringify(r.requests.map((r) => r.messages))
  assert.match(answer, /opaque-alpha/)
  assert.match(answer, /opaque-beta/)
  assert.doesNotMatch(answer, /opaque-other/)
  assert.equal(
    r.requests[0].tools.find((t) => t.name === 'tracy_site').description,
    siteToolDescription('wordpress')
  )
  for (const request of r.requests) assert.deepEqual(r.requests[0].tools, request.tools)
  assert.ok(r.events.some((e) => e.type === 'tool/result'))
})

test('real AgentLoop preserves independent string calls; invalid batches never relay', async () => {
  const independent = await run([query('Alpha'), query('Beta')])
  const shown = JSON.stringify(independent.requests.map((request) => request.messages))
  assert.match(shown, /opaque-alpha/)
  assert.match(shown, /opaque-beta/)
  assert.equal(independent.events.filter((event) => event.type === 'tool/result').length, 2)
  const invalid = await run([query(Array(9).fill('Alpha'))])
  assert.equal(invalid.sent.length, 0)
  const answers = JSON.stringify(invalid.requests.map((r) => r.messages))
  assert.match(answers, /CONTENT_BAD_QUERY/)
})

test('real AgentLoop preserves seat refusal; batching supplies no guessed IDs or alternative write', async () => {
  const r = await run([query(['Alpha', 'Beta'])], { denied: true })
  assert.equal(r.sent.length, 1, JSON.stringify(r.sent))
  const answers = JSON.stringify(r.requests.map((r) => r.messages))
  assert.match(answers, /SEAT_REVOKED/)
  assert.doesNotMatch(answers, /opaque-alpha/)
  assert.equal(r.sent[0].body.action, 'content.read')
})

test('the shipped registry keeps read batching parallel and write/browser actions exclusive', async () => {
  // These classifications drive the real ToolRegistry exercised above; this change adds no action.
  const { actionRunsInParallel } = await import('../src/host/site-context.mjs')
  assert.equal(actionRunsInParallel(query(['Alpha', 'Beta'])), true)
  for (const action of [
    'content.update',
    'content.replace',
    'apply.revert',
    'page.look',
    'page.text',
    'db.dump'
  ])
    assert.equal(actionRunsInParallel({ action, params: {} }), false, action)
})

for (const platform of ['wordpress', 'joomla', 'emdash']) {
  test(`concurrent ${platform} searches preserve independent results when inventory may be shared`, async () => {
    const r = await run([query('Alpha'), query('Beta')], {
      platform,
      lookup: async () => {
        await new Promise((resolve) => setTimeout(resolve, 25))
        return {
          schemaVersion: 'tracy-content-pages/v1',
          site: { defaultLocale: 'en' },
          pages: [
            { id: 'alpha-exact', title: 'Alpha', path: '/alpha', locale: 'en' },
            { id: 'beta-exact', title: 'Beta', path: '/beta', locale: 'en' }
          ],
          truncated: false
        }
      }
    })
    // Scheduler preparation may finish after the first response under CPU contention.
    // Exact overlapping transport sharing is asserted without clocks in page-read-flights.test.
    assert.ok(r.sent.length >= 1 && r.sent.length <= 2)
    const results = r.events.filter((event) => event.type === 'tool/result')
    assert.equal(results.length, 2)
    const messages = r.requests[1].messages.filter((message) => message.role === 'tool')
    assert.match(JSON.stringify(messages[0]), /alpha-exact/)
    assert.doesNotMatch(JSON.stringify(messages[0]), /beta-exact/)
    assert.match(JSON.stringify(messages[1]), /beta-exact/)
    assert.doesNotMatch(JSON.stringify(messages[1]), /alpha-exact/)
  })
}

test('settled page searches refresh on a subsequent model step', async () => {
  const r = await run([], {
    respond: async (_options, step) => ({ calls: step <= 2 ? [query('Alpha')] : [] })
  })
  assert.equal(r.sent.length, 2)
})

test('different locales and known URLs retain separate relay requests', async () => {
  const r = await run([
    { action: 'content.read', params: { view: 'pages', locale: 'en', search: 'Alpha' } },
    { action: 'content.read', params: { view: 'pages', locale: 'vi', search: 'Alpha' } },
    { action: 'content.read', params: { view: 'pages', url: '/alpha' } }
  ])
  assert.equal(r.sent.length, 3)
  assert.deepEqual(
    r.sent.map((sent) => sent.body.params).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    [
      { view: 'pages', locale: 'en' },
      { view: 'pages', locale: 'vi' },
      { view: 'pages', url: '/alpha' }
    ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  )
})

test('invalid listing types recover through a page lookup across CMSs, while full:true preserves the refusal', async () => {
  const refusal = { error: { code: 'CONTENT_BAD_QUERY', message: 'Unknown content type.' } }
  for (const platform of ['wordpress', 'joomla', 'emdash']) {
    const r = await run([], {
      platform,
      lookup: async (params) =>
        params.type
          ? refusal
          : {
              schemaVersion: 'tracy-content-pages/v1',
              site: { url: 'https://owned.test', defaultLocale: 'en', locales: ['en'] },
              pages: [
                {
                  id: 'opaque-service',
                  title: 'Alpha service',
                  path: '/alpha',
                  type: 'service',
                  locale: 'en'
                }
              ],
              truncated: false
            },
      respond: async (options, step) => {
        if (step === 1)
          return { calls: [{ action: 'content.read', params: { type: 'invalid', locale: 'en' } }] }
        if (step === 2) {
          const text = options.messages
            .filter((m) => m.role === 'tool')
            .at(-1)
            .content.find((b) => b.type === 'text').text
          const error = JSON.parse(text)
          assert.equal(error.error.code, 'CONTENT_BAD_QUERY')
          assert.deepEqual(error.next.params, { view: 'pages', locale: 'en' })
          return {
            calls: [{ action: error.next.action, params: { ...error.next.params, search: 'Alpha service' } }]
          }
        }
        return { text: 'done' }
      }
    })
    assert.equal(r.sent.length, 2)
    assert.match(JSON.stringify(r.requests.at(-1).messages), /opaque-service/)
  }
  const full = await run([{ action: 'content.read', params: { type: 'invalid', full: true } }], {
    lookup: async () => refusal
  })
  const result = full.requests
    .at(-1)
    .messages.filter((m) => m.role === 'tool')
    .at(-1)
    .content.find((b) => b.type === 'text').text
  const unchanged = JSON.parse(result)
  assert.deepEqual(unchanged.error, refusal.error)
  assert.equal(typeof unchanged.next, 'string')
  assert.doesNotMatch(unchanged.next, /view:pages|do not infer/)
})
