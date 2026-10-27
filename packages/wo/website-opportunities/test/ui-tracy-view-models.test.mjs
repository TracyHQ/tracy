// What the Tracy tab and the place profile's Build card show, from the server's answers (ui/public/tracy-view-models.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tracyBuildView, tracyConnectView, tracyTemplateView } from '../ui/public/tracy-view-models.js'

const TRACY = 'https://tracy.example'

test('Tracy tab: not connected offers Connect', () => {
  const v = tracyConnectView({ state: 'disconnected', tracyUrl: TRACY })
  assert.equal(v.status, 'Not connected')
  assert.equal(v.tone, 'neutral')
  assert.deepEqual(v.actions, ['connect'])
  assert.equal(v.code, null)
  assert.equal(v.polling, false)
})

test('Tracy tab: a waiting code shows the code and the link that opens Tracy, and keeps polling', () => {
  const v = tracyConnectView({
    state: 'pending',
    tracyUrl: TRACY,
    userCode: 'ABCD-1234',
    verificationUri: `${TRACY}/connect`,
    verificationUriComplete: `${TRACY}/connect?code=ABCD-1234`
  })
  assert.equal(v.code, 'ABCD-1234')
  assert.equal(v.link, `${TRACY}/connect?code=ABCD-1234`)
  assert.equal(v.status, 'Waiting for you to allow it in Tracy')
  assert.equal(v.polling, true)
  assert.deepEqual(v.actions, ['newCode'])
})

test('Tracy tab: connected names the account and offers Disconnect', () => {
  const v = tracyConnectView({
    state: 'connected',
    tracyUrl: TRACY,
    account: { email: 'seller@example.com', name: 'Sam' }
  })
  assert.equal(v.status, 'Connected as seller@example.com')
  assert.equal(v.tone, 'ok')
  assert.deepEqual(v.actions, ['disconnect'])
})

test('Tracy tab: revoked asks to reconnect; a denied or expired code says why', () => {
  const r = tracyConnectView({ state: 'reconnect', tracyUrl: TRACY, account: { email: 'a@example.com' } })
  assert.equal(r.status, 'Tracy no longer accepts this server: reconnect it')
  assert.equal(r.tone, 'bad')
  assert.deepEqual(r.actions, ['reconnect', 'disconnect'])
  assert.equal(
    tracyConnectView({ state: 'disconnected', tracyUrl: TRACY, error: 'access_denied' }).problem,
    'The request was denied in Tracy.'
  )
  assert.equal(
    tracyConnectView({ state: 'disconnected', tracyUrl: TRACY, error: 'expired_token' }).problem,
    'The code expired before it was allowed. Connect again.'
  )
})

test('Build: not connected sends the person to the Tracy tab', () => {
  const v = tracyBuildView({ connection: { state: 'disconnected' }, demo: null })
  assert.deepEqual(v.primary, { kind: 'connect', label: 'Connect Tracy to build', href: '#/operator/tracy' })
  assert.equal(v.status, null)
})

test('Build: connected with no demo offers one button', () => {
  const v = tracyBuildView({ connection: { state: 'connected' }, demo: null })
  assert.deepEqual(v.primary, { kind: 'submit', label: 'Build it with Tracy' })
})

test('Build: a demo being built shows its state, keeps polling and can be cancelled', () => {
  const v = tracyBuildView({
    connection: { state: 'connected' },
    demo: { builder: 'tracy', status: 'building' }
  })
  assert.equal(v.status, 'Tracy is building the demo')
  assert.equal(v.tone, 'busy')
  assert.equal(v.primary, null)
  assert.equal(v.polling, true)
  assert.equal(v.cancellable, true)
})

test('Build: a ready demo shows its link, the Tracy editor link and the date it is kept until', () => {
  const v = tracyBuildView({
    connection: { state: 'connected' },
    demo: {
      builder: 'tracy',
      status: 'ready',
      url: 'https://corner-cafe.example',
      editUrl: `${TRACY}/s/corner-cafe`,
      expiresAt: '2026-11-07T00:00:00.000Z'
    }
  })
  assert.equal(v.status, 'Demo ready')
  assert.equal(v.tone, 'ok')
  assert.equal(v.link, 'https://corner-cafe.example')
  assert.equal(v.editLink, `${TRACY}/s/corner-cafe`)
  assert.equal(v.expiry, 'Kept until November 7, 2026')
  assert.equal(v.polling, false)
  assert.equal(v.cancellable, false)
})

test('Build: the live demo limit names both numbers and where to make room', () => {
  const v = tracyBuildView({
    connection: { state: 'connected', tracyUrl: TRACY },
    demo: { builder: 'tracy', status: 'refused', error: { code: 'DEMO_LIMIT_REACHED', live: 20, limit: 20 } }
  })
  assert.equal(v.notice, 'You have 20 live demos (limit 20). Delete one in Tracy to make room.')
  assert.equal(v.noticeLink, TRACY)
  assert.deepEqual(v.primary, { kind: 'submit', label: 'Build it with Tracy' })
})

test('Build: a failed or deleted demo can be built again', () => {
  const failed = tracyBuildView({
    connection: { state: 'connected' },
    demo: { builder: 'tracy', status: 'failed' }
  })
  assert.equal(failed.status, 'The build failed')
  assert.deepEqual(failed.primary, { kind: 'submit', label: 'Build again' })
  const gone = tracyBuildView({
    connection: { state: 'connected' },
    demo: {
      builder: 'tracy',
      status: 'ready',
      url: 'https://x.example',
      deletedAt: '2026-11-07T00:00:00.000Z'
    }
  })
  assert.equal(gone.status, 'The demo was deleted')
  assert.equal(gone.link, null)
  assert.deepEqual(gone.primary, { kind: 'submit', label: 'Build again' })
})

test('Build: a demo recorded as built elsewhere is not Tracy’s and leaves the button as it is', () => {
  const v = tracyBuildView({
    connection: { state: 'connected' },
    demo: { builtElsewhere: true, url: 'https://elsewhere.example' }
  })
  assert.deepEqual(v.primary, { kind: 'submit', label: 'Build it with Tracy' })
  assert.equal(v.status, null)
})

test('Build: a failed demo says why, with Tracy’s code', () => {
  const coded = tracyBuildView({
    connection: { state: 'connected' },
    demo: { builder: 'tracy', status: 'failed', error: { code: 'SITE_FILL_FAILED' } }
  })
  assert.equal(coded.notice, 'Tracy stopped the build (SITE_FILL_FAILED).')
  const told = tracyBuildView({
    connection: { state: 'connected' },
    demo: { builder: 'tracy', status: 'failed', error: { code: 'INVALID_LABEL', message: 'Bad site name.' } }
  })
  assert.equal(told.notice, 'Bad site name. (INVALID_LABEL)')
})

test('Build: a sent demo shows how many live demos the account has of its limit', () => {
  const v = tracyBuildView({
    connection: { state: 'connected' },
    demo: { builder: 'tracy', status: 'queued', demos: { live: 3, limit: 20 } }
  })
  assert.equal(v.count, 'Live demos in Tracy: 3 of 20')
  const none = tracyBuildView({
    connection: { state: 'connected' },
    demo: { builder: 'tracy', status: 'queued' }
  })
  assert.equal(none.count, null)
})

const OPTIONS = {
  cms: [
    {
      cms: 'wordpress',
      pinned: { design: 'tracy', quickstart: 'tracy-base/wp7' },
      templates: [
        { design: 'ja-fresco', quickstart: 'quickstart/ja-fresco/wp7', label: 'JA Fresco' },
        { design: 'tracy', quickstart: 'tracy-base/wp7', label: 'Tracy Base' }
      ]
    },
    {
      cms: 'joomla',
      pinned: { design: 'tracy', quickstart: 'tracy-base/j6' },
      templates: [{ design: 'ja-diner', quickstart: 'quickstart/ja-diner/j6', label: 'JA Diner' }]
    }
  ]
}

test('Template choice: kept as Tracy’s default, the request names nothing', () => {
  const v = tracyTemplateView(OPTIONS, {})
  assert.deepEqual(
    v.cms.map((o) => [o.value, o.label]),
    [
      ['', 'Tracy’s choice'],
      ['wordpress', 'WordPress'],
      ['joomla', 'Joomla']
    ]
  )
  assert.equal(v.templates, null, 'no template list before a CMS is picked')
  assert.deepEqual(v.body, {})
})

test('Template choice: a CMS alone takes that CMS’s default; a template names itself', () => {
  const cmsOnly = tracyTemplateView(OPTIONS, { cms: 'wordpress' })
  assert.deepEqual(
    cmsOnly.templates.map((o) => [o.value, o.label]),
    [
      ['', 'Tracy’s default (Tracy Base)'],
      ['quickstart/ja-fresco/wp7', 'JA Fresco'],
      ['tracy-base/wp7', 'Tracy Base']
    ]
  )
  assert.deepEqual(cmsOnly.body, { cms: 'wordpress' })
  const named = tracyTemplateView(OPTIONS, { cms: 'wordpress', quickstart: 'quickstart/ja-fresco/wp7' })
  assert.deepEqual(named.body, {
    cms: 'wordpress',
    template: { quickstart: 'quickstart/ja-fresco/wp7', design: 'ja-fresco' }
  })
  // A pick that is not offered (any more) is not sent.
  assert.deepEqual(tracyTemplateView(OPTIONS, { cms: 'emdash', quickstart: 'x' }).body, {})
  assert.deepEqual(
    tracyTemplateView(OPTIONS, { cms: 'joomla', quickstart: 'quickstart/ja-fresco/wp7' }).body,
    {
      cms: 'joomla'
    }
  )
})

test('Template choice: no options (Tracy did not answer) shows no chooser', () => {
  assert.equal(tracyTemplateView(null, {}), null)
  assert.equal(tracyTemplateView({ cms: [] }, {}), null)
})

test('Build: a demo waiting for the operator links the chat in Tracy that finishes it', () => {
  const v = tracyBuildView({
    connection: { state: 'connected' },
    demo: {
      builder: 'tracy',
      status: 'waiting-for-you',
      editUrl: 'https://tracy.example/corner-cafe/s/wo-demo-1?wo-demo-chat=1'
    }
  })
  assert.equal(v.status, 'Open in Tracy to finish the demo')
  assert.equal(v.editLink, 'https://tracy.example/corner-cafe/s/wo-demo-1?wo-demo-chat=1')
  assert.equal(v.link, null)
  assert.equal(v.polling, true)
  assert.equal(v.primary, null, 'no second build while this one waits')
})
