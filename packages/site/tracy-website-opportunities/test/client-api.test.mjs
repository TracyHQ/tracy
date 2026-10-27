/**
 * The doors of tracy-web, as the tab calls them: root-absolute paths, the session cookie, a refusal
 * read as its `code`, and "send the picks" as create → research with one request id per pick.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createApi,
  handOffBuild,
  placePhotoUrl,
  placePhotoUrlById,
  pressDemo,
  sendLinks,
  sendPicks,
  startResearchAgain,
  MENU_PARTS
} from '../src/client/api.ts'
import { createRequestIds } from '../src/client/request-ids.ts'

function door(answers) {
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(init.body) : undefined,
      init
    })
    const answer = answers(url, init)
    if (answer instanceof Error) throw answer
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.body
    }
  }
  return { fetch, calls }
}

test('reads go to the root door with the session cookie', async () => {
  const { fetch, calls } = door(() => ({ status: 200, body: { opportunities: [] } }))
  const api = createApi(fetch)
  const answer = await api.list()
  assert.deepEqual(answer, { ok: true, status: 200, body: { opportunities: [] } })
  assert.equal(calls[0].url, '/api/website-opportunities')
  assert.equal(calls[0].init.credentials, 'same-origin')
})

test('a refusal is its code; a broken network is NETWORK; a body without code is HTTP_<status>', async () => {
  const api = createApi(
    door((url) =>
      url.endsWith('/search')
        ? { status: 404, body: { code: 'FEATURE_OFF', next: 'Ask an admin' } }
        : url.endsWith('/settings')
          ? new Error('offline')
          : { status: 500, body: null }
    ).fetch
  )
  assert.deepEqual(await api.search({ query: 'x', radiusM: 1000 }), {
    ok: false,
    status: 404,
    code: 'FEATURE_OFF'
  })
  assert.deepEqual(await api.settings(), { ok: false, status: 0, code: 'NETWORK' })
  assert.deepEqual(await api.list(), { ok: false, status: 500, code: 'HTTP_500' })
})

test('a pending logo research keeps the time the server named for asking again', async () => {
  const api = createApi(
    door(() => ({
      status: 409,
      body: { code: 'DEMO_LOGO_RESEARCH_PENDING', next: 'x', retryAt: '2026-10-24T10:01:00.000Z' }
    })).fetch
  )
  assert.deepEqual(await api.prepareDemoChat('11111111-1111-4111-8111-111111111111'), {
    ok: false,
    status: 409,
    code: 'DEMO_LOGO_RESEARCH_PENDING',
    retryAt: '2026-10-24T10:01:00.000Z'
  })
})

test('ids in paths are encoded', async () => {
  const { fetch, calls } = door(() => ({ status: 200, body: {} }))
  const api = createApi(fetch)
  await api.detail('a/b')
  await api.cancel('j 1')
  await api.handOffState('b 1')
  assert.equal(calls[0].url, '/api/website-opportunities/a%2Fb')
  assert.deepEqual(
    [calls[2].url, calls[2].method],
    ['/api/website-opportunities/builds/b%201/handoff', 'GET']
  )
  assert.equal(calls[1].url, '/api/website-opportunities/jobs/j%201/cancel')
  assert.equal(calls[1].method, 'POST')
})

test('send the picks: each one is created, then researched with its own request id', async () => {
  let n = 0
  const { fetch, calls } = door((url) =>
    url === '/api/website-opportunities'
      ? { status: 201, body: { opportunity: { id: `op${++n}` } } }
      : { status: 202, body: { job: { id: 'j', state: 'queued' } } }
  )
  let m = 0
  const ids = createRequestIds(() => `req-${++m}`)
  const outcome = await sendPicks(createApi(fetch), [{ name: 'A' }, { name: 'B' }], ids)
  assert.deepEqual(outcome, { sent: 2, failed: [] })
  assert.deepEqual(
    calls.map((c) => [c.method, c.url, c.body]),
    [
      ['POST', '/api/website-opportunities', { candidate: { name: 'A' } }],
      ['POST', '/api/website-opportunities/op1/research', { requestId: 'req-1' }],
      ['POST', '/api/website-opportunities', { candidate: { name: 'B' } }],
      ['POST', '/api/website-opportunities/op2/research', { requestId: 'req-2' }]
    ]
  )
})

test('a pick that fails is reported, and its retry reuses the same request id', async () => {
  let failResearch = true
  const { fetch, calls } = door((url) =>
    url === '/api/website-opportunities'
      ? { status: 200, body: { opportunity: { id: 'op1' } } }
      : failResearch
        ? new Error('offline')
        : { status: 202, body: { job: { id: 'j' } } }
  )
  let m = 0
  const ids = createRequestIds(() => `req-${++m}`)
  const api = createApi(fetch)
  assert.deepEqual(await sendPicks(api, [{ name: 'A' }], ids), { sent: 0, failed: ['A'] })
  failResearch = false
  assert.deepEqual(await sendPicks(api, [{ name: 'A' }], ids), { sent: 1, failed: [] })
  const research = calls.filter((c) => c.url.endsWith('/research')).map((c) => c.body.requestId)
  assert.deepEqual(research, ['req-1', 'req-1'])
})

test('hand to the agent: POST the handoff, then open the exact accepted chat', async () => {
  const { fetch, calls } = door(() => ({
    status: 200,
    body: {
      handoff: { state: 'ready', placed: { a: 'images/a.jpg' }, prompt: 'Build…' },
      site: { key: 'pho hoa' },
      next: '/pho%20hoa/s/held-session'
    }
  }))
  const answer = await handOffBuild(createApi(fetch), 'b/1')
  assert.deepEqual(answer, { ok: true, target: '/pho%20hoa/s/held-session' })
  assert.equal(calls[0].url, '/api/website-opportunities/builds/b%2F1/handoff')
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].body, undefined)
})

test('hand to the agent: the page opens on the chat the server made, never on another site', async () => {
  const answer = (next) =>
    handOffBuild(
      createApi(
        door(() => ({ status: 200, body: { handoff: { state: 'ready' }, site: { key: 'hill' }, next } }))
          .fetch
      ),
      'b1'
    )
  assert.deepEqual(await answer('/hill/s/session-1'), { ok: true, target: '/hill/s/session-1' })
  assert.deepEqual(await answer('/other/s/session-1?wo-handoff=b1'), { ok: false, reasonKey: 'reason.other' })
  assert.deepEqual(await answer('https://evil.test/hill/?wo-handoff=b1'), {
    ok: false,
    reasonKey: 'reason.other'
  })
})

test('a refused handoff names its reason and goes nowhere', async () => {
  const refuse = (code) => createApi(door(() => ({ status: 409, body: { code } })).fetch)
  assert.deepEqual(await handOffBuild(refuse('SITE_NOT_READY'), 'b1'), {
    ok: false,
    reasonKey: 'reason.site_not_ready'
  })
  assert.deepEqual(await handOffBuild(refuse('HANDOFF_UNSUPPORTED'), 'b1'), {
    ok: false,
    reasonKey: 'reason.handoff_unsupported'
  })
  assert.deepEqual(await handOffBuild(refuse('STORE_UNAVAILABLE'), 'b1'), {
    ok: false,
    reasonKey: 'reason.store_unavailable'
  })
  // A 200 without a site key cannot be followed.
  const empty = createApi(door(() => ({ status: 200, body: { handoff: {} } })).fetch)
  assert.deepEqual(await handOffBuild(empty, 'b1'), { ok: false, reasonKey: 'reason.other' })
})

test('a press while an earlier one still runs waits for it, then opens the same chat', async () => {
  let n = 0
  const { fetch, calls } = door(() =>
    ++n < 3
      ? { status: 409, body: { code: 'HANDOFF_IN_PROGRESS', handoff: null, qa: null } }
      : {
          status: 200,
          body: { handoff: { state: 'ready' }, site: { key: 'hill' }, next: '/hill/s/s1?wo-handoff=b1' }
        }
  )
  let waited = 0
  const slept = []
  const answer = await handOffBuild(createApi(fetch), 'b1', {
    onWaiting: () => (waited += 1),
    sleep: async (ms) => void slept.push(ms)
  })
  assert.deepEqual(answer, { ok: true, target: '/hill/s/s1?wo-handoff=b1' })
  assert.equal(calls.length, 3)
  assert.ok(calls.every((c) => c.method === 'POST'))
  assert.equal(waited, 2)
  assert.deepEqual(slept, [5000, 5000])
})

test('an earlier press that never ends is named as such, not as "Not available"', async () => {
  const { fetch, calls } = door(() => ({ status: 409, body: { code: 'HANDOFF_IN_PROGRESS' } }))
  const answer = await handOffBuild(createApi(fetch), 'b1', { tries: 2, sleep: async () => {} })
  assert.deepEqual(answer, { ok: false, reasonKey: 'reason.handoff_in_progress' })
  assert.equal(calls.length, 3)
})

test('a baseline not read yet and a demo left to a person are named as such, not as "Not available"', async () => {
  const refuse = (status, code) => createApi(door(() => ({ status, body: { code } })).fetch)
  assert.deepEqual(await handOffBuild(refuse(503, 'HANDOFF_BASELINE_FAILED'), 'b1'), {
    ok: false,
    reasonKey: 'reason.handoff_baseline_failed'
  })
  assert.deepEqual(await handOffBuild(refuse(409, 'QA_NEEDS_REVIEW'), 'b1'), {
    ok: false,
    reasonKey: 'reason.qa_needs_review'
  })
})

test('capabilities and site checks go to their own doors; checks send the website list', async () => {
  const { fetch, calls } = door((url) =>
    url.endsWith('/capabilities')
      ? { status: 200, body: { maps: { browserKey: 'k' }, kinds: ['cafes'] } }
      : { status: 200, body: { checks: { 'https://a.vn': { status: 'queued' } } } }
  )
  const api = createApi(fetch)
  const caps = await api.capabilities()
  assert.equal(caps.ok && caps.body.maps?.browserKey, 'k')
  const checks = await api.siteChecks(['https://a.vn'])
  assert.deepEqual(checks.ok && checks.body.checks, { 'https://a.vn': { status: 'queued' } })
  assert.deepEqual(
    calls.map((c) => [c.url, c.method, c.body]),
    [
      ['/api/website-opportunities/capabilities', 'GET', undefined],
      ['/api/website-opportunities/site-checks', 'POST', { urls: ['https://a.vn'] }]
    ]
  )
})

test("place photos load through the server: by the search's photo name, or by place id as a fallback", () => {
  assert.equal(
    placePhotoUrl('places/ChIJ1/photos/AbC', 480),
    '/api/website-opportunities/places/photo?name=places%2FChIJ1%2Fphotos%2FAbC&w=480'
  )
  assert.equal(placePhotoUrlById('ChIJ 1', 320), '/api/website-opportunities/places/ChIJ%201/photo?w=320')
})

test('social stats post the pages in the order given; force only for one row’s button', async () => {
  const { fetch, calls } = door(() => ({ status: 200, body: { stats: {} } }))
  const api = createApi(fetch)
  const handles = [{ network: 'facebook', url: 'https://facebook.com/a' }]
  await api.socialStats(handles)
  await api.socialStats(handles, true)
  assert.deepEqual(
    calls.map((c) => [c.url, c.method, c.body]),
    [
      ['/api/website-opportunities/social-stats', 'POST', { handles }],
      ['/api/website-opportunities/social-stats', 'POST', { handles, force: true }]
    ]
  )
})

test('My opportunities: one page by its query, and a bulk press with its request id', async () => {
  const { fetch, calls } = door(() => ({
    status: 200,
    body: { opportunities: [], counts: {}, nextCursor: null, total: 0 }
  }))
  const api = createApi(fetch)
  await api.listPage('stage=new&limit=50')
  assert.equal(calls[0].url, '/api/website-opportunities?stage=new&limit=50')
  assert.equal(calls[0].method, 'GET')
  await api.bulk('resume', 'req-12345678', { jobIds: ['j1'] })
  assert.equal(calls[1].url, '/api/website-opportunities/jobs/bulk')
  assert.equal(calls[1].method, 'POST')
  assert.deepEqual(calls[1].body, { action: 'resume', requestId: 'req-12345678', jobIds: ['j1'] })
  await api.bulk('cancel', 'req-87654321', { filter: { attention: true } })
  assert.deepEqual(calls[2].body, {
    action: 'cancel',
    requestId: 'req-87654321',
    filter: { attention: true }
  })
})

test('a demo’s doors: extend and reopen by opportunity, rebuild with its request id', async () => {
  const { fetch, calls } = door(() => ({ status: 200, body: { demo: {} } }))
  const api = createApi(fetch)
  await api.demo('opp 1', 'extend')
  await api.demo('opp 1', 'reopen')
  await api.rebuildDemo('opp 1', 'rebuild-req-1')
  assert.deepEqual(
    calls.map((c) => [c.method, c.url, c.body]),
    [
      ['POST', '/api/website-opportunities/opp%201/demo/extend', undefined],
      ['POST', '/api/website-opportunities/opp%201/demo/reopen', undefined],
      ['POST', '/api/website-opportunities/opp%201/demo/rebuild', { requestId: 'rebuild-req-1' }]
    ]
  )
})

test('pressDemo: a rebuild holds one request id until it succeeds, so a repeat press is the same build', async () => {
  const answers = [
    { status: 502, body: { code: 'SITE_CREATE_REFUSED' } },
    { status: 202, body: { build: {} } }
  ]
  const { fetch, calls } = door(() => answers.shift() ?? { status: 200, body: { demo: {} } })
  const api = createApi(fetch)
  let n = 0
  const ids = createRequestIds(() => `rebuild-id-${++n}`)
  assert.equal((await pressDemo(api, ids, 'o1', 'rebuild')).ok, false)
  assert.equal((await pressDemo(api, ids, 'o1', 'rebuild')).ok, true)
  assert.equal(calls[0].body.requestId, calls[1].body.requestId)
  await pressDemo(api, ids, 'o1', 'rebuild')
  assert.notEqual(
    calls[2].body.requestId,
    calls[1].body.requestId,
    'a new press after a success is a new build'
  )
  await pressDemo(api, ids, 'o1', 'extend')
  assert.equal(calls[3].url, '/api/website-opportunities/o1/demo/extend')
})

test('single and bulk demo build requests serialize the explicit selection; Retry sends only its original action', async () => {
  const { fetch, calls } = door(() => ({ status: 202, body: { actions: [] } }))
  const api = createApi(fetch)
  const selection = { cms: 'wordpress', design: 'ja-essence', quickstart: 'ja-essence/wp' }
  await api.buildDemo('opp', 'request', undefined, selection)
  await api.buildDemos(['opp', 'opp2'], 'bulk-request', selection)
  await api.buildDemo('opp', 'retry-request', 'failed-action')
  assert.deepEqual(
    calls.map((c) => c.body),
    [
      { requestId: 'request', workflow: 'agent-demo/1', chatMode: 'client-send/1', selection },
      {
        ids: ['opp', 'opp2'],
        requestId: 'bulk-request',
        selection,
        workflow: 'agent-demo/1',
        chatMode: 'client-send/1'
      },
      { requestId: 'retry-request', retryOf: 'failed-action' }
    ]
  )
})

test('demo chat follows the account-scoped exact accepted action read door', async () => {
  const { fetch, calls } = door(() => ({
    status: 200,
    body: { action: { id: 'accepted/action', workflow: 'agent-demo/1', chat: null } }
  }))
  const answer = await createApi(fetch).demoAction('accepted/action')
  assert.equal(answer.ok, true)
  assert.equal(calls[0].url, '/api/website-opportunities/demo/actions/accepted%2Faction')
  assert.equal(calls[0].method, 'GET')
})

test('prepare and send reserve chat identity without calling a backend prompt door', async () => {
  const { fetch, calls } = door(() => ({
    status: 200,
    body: { action: { id: 'accepted' }, submission: { nativeRequestId: 'native' } }
  }))
  const api = createApi(fetch)
  await api.prepareDemoChat('accepted/action')
  await api.reserveDemoChatSend('accepted/action', {
    sessionId: 'reserved-session',
    briefHash: 'hash',
    nativeRequestId: 'native'
  })
  assert.deepEqual(
    calls.map(({ url, method, body }) => ({ url, method, body })),
    [
      {
        url: '/api/website-opportunities/demo/actions/accepted%2Faction/chat/prepare',
        method: 'POST',
        body: {}
      },
      {
        url: '/api/website-opportunities/demo/actions/accepted%2Faction/chat/send',
        method: 'POST',
        body: { sessionId: 'reserved-session', briefHash: 'hash', nativeRequestId: 'native' }
      }
    ]
  )
})

test('Find demo builds retain template selection and the browser-chat workflow while rechecking stored research', async () => {
  const { fetch, calls } = door(() => ({ status: 202, body: { actions: [] } }))
  const selection = { cms: 'joomla', design: 'ja-essence', quickstart: 'quickstart/ja-essence/j6' }
  await createApi(fetch).buildDemo('from-find', 'request-find', undefined, selection, undefined, true)
  assert.deepEqual(calls[0].body, {
    requestId: 'request-find',
    workflow: 'agent-demo/1',
    chatMode: 'client-send/1',
    selection,
    fromFind: true
  })
})

test('Research again: the preview reads its own door; the press is a research with again and no only', async () => {
  const { fetch, calls } = door(() => ({ status: 202, body: { job: { id: 'j' } } }))
  const api = createApi(fetch)
  const ids = createRequestIds(() => 'req-again-0001')
  await api.researchAgainPreview('o 1')
  const answer = await startResearchAgain(api, 'o 1', ids)
  assert.equal(answer.ok, true)
  assert.deepEqual(
    calls.map((c) => [c.method, c.url, c.body]),
    [
      ['GET', '/api/website-opportunities/o%201/research-again', undefined],
      ['POST', '/api/website-opportunities/o%201/research', { requestId: 'req-again-0001', again: true }]
    ]
  )
  // The signed-in tab never reaches the public doors.
  assert.equal((await api.publicAgainPreview('ChIJ')).code, 'UNSUPPORTED')
  assert.equal((await api.publicResearchAgain('ChIJ')).code, 'UNSUPPORTED')
  assert.equal(calls.length, 2)
})

test('Read menu again: Research again limited to the two menu parts, in the preview and the press', async () => {
  const { fetch, calls } = door(() => ({ status: 202, body: { job: { id: 'j' } } }))
  const api = createApi(fetch)
  const ids = createRequestIds(() => 'req-menu-0001')
  await api.researchAgainPreview('o 1', MENU_PARTS)
  const answer = await startResearchAgain(api, 'o 1', ids, MENU_PARTS)
  assert.equal(answer.ok, true)
  assert.deepEqual(
    calls.map((c) => [c.method, c.url, c.body]),
    [
      ['GET', '/api/website-opportunities/o%201/research-again?parts=menu-file%2Cmenu-photos', undefined],
      [
        'POST',
        '/api/website-opportunities/o%201/research',
        { requestId: 'req-menu-0001', again: true, parts: ['menu-file', 'menu-photos'] }
      ]
    ]
  )
})

test('links of one business: one create with links and name, then its research', async () => {
  let n = 0
  const ids = createRequestIds(() => `req-${++n}`)
  const judged = [
    { url: 'https://share.google/x', kind: 'google', used: false, reason: 'unresolvable' },
    { url: 'https://instagram.com/club', kind: 'instagram', used: true }
  ]
  const { fetch, calls } = door((url) =>
    url.endsWith('/research')
      ? { status: 202, body: { job: { id: 'j1' } } }
      : { status: 201, body: { opportunity: { id: 'op1' }, links: judged } }
  )
  const answer = await sendLinks(
    createApi(fetch),
    { links: ['https://share.google/x', 'https://instagram.com/club'], name: ' Dubai Club ' },
    ids
  )
  assert.equal(answer.ok, true)
  // The success keeps the server's word on each link, so the page can say the Google link was left out.
  assert.deepEqual(answer.body, { job: { id: 'j1' }, links: judged })
  assert.deepEqual(
    calls.map((c) => [c.method, c.url, c.body]),
    [
      [
        'POST',
        '/api/website-opportunities',
        { links: ['https://share.google/x', 'https://instagram.com/club'], name: 'Dubai Club' }
      ],
      ['POST', '/api/website-opportunities/op1/research', { requestId: 'req-1' }]
    ]
  )
})

test('an ambiguous Google link answers its candidates; the same links go again with the picked place', async () => {
  const candidates = [
    { provider: 'google-places', providerId: 'p1', name: 'Coach', address: 'Dubai' },
    { provider: 'google-places', providerId: 'p2', name: 'Coach Academy' }
  ]
  const links = [{ url: 'https://share.google/x', kind: 'google', used: true }]
  const { fetch, calls } = door((url, init) => {
    if (url.endsWith('/research')) return { status: 202, body: { job: {} } }
    const body = JSON.parse(init.body)
    return body.place
      ? { status: 201, body: { opportunity: { id: 'op9' } } }
      : { status: 409, body: { code: 'GOOGLE_LINK_AMBIGUOUS', candidates, links } }
  })
  const api = createApi(fetch)
  const ids = createRequestIds(() => 'req')
  const first = await sendLinks(api, { links: ['https://share.google/x'] }, ids)
  assert.equal(first.ok, false)
  assert.equal(first.code, 'GOOGLE_LINK_AMBIGUOUS')
  assert.deepEqual(first.candidates, candidates)
  assert.deepEqual(first.links, links)
  const again = await sendLinks(api, { links: ['https://share.google/x'], place: first.candidates[1] }, ids)
  assert.equal(again.ok, true)
  assert.deepEqual(calls[1].body, { links: ['https://share.google/x'], place: candidates[1] })
  assert.equal(calls[2].url, '/api/website-opportunities/op9/research')
})

test('no usable link: the refusal carries each link and its reason, and no research starts', async () => {
  const links = [{ url: 'http://192.168.1.10/', used: false, reason: 'blocked' }]
  const { fetch, calls } = door(() => ({ status: 422, body: { code: 'NO_USABLE_LINKS', links } }))
  const answer = await sendLinks(
    createApi(fetch),
    { links: ['http://192.168.1.10/'] },
    createRequestIds(() => 'r')
  )
  assert.deepEqual(answer, { ok: false, status: 422, code: 'NO_USABLE_LINKS', links })
  assert.equal(calls.length, 1)
})
