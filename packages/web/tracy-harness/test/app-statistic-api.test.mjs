import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  AppStatisticReadError,
  appStatisticFilters,
  appStatisticListUrl,
  externalLink,
  readAppStatistic,
  readErrorText
} from '../src/beta/app-statistic-api.ts'
import { en } from '../src/i18n/ns/appstat.ts'
import { translate } from '../src/i18n/translator.ts'

const url = '/api/ops/app-statistic?view=users&days=7'
const signal = () => new AbortController().signal

test('statistics reads keep credentials, request JSON and stop login redirects before parsing', async () => {
  let called
  const answer = await readAppStatistic(url, signal(), async (input, init) => {
    called = { input, init }
    return Response.json({ rows: [], total: 0 })
  })
  assert.deepEqual(answer, { rows: [], total: 0 })
  assert.equal(called.input, url)
  assert.equal(called.init.credentials, 'same-origin')
  assert.equal(called.init.redirect, 'manual')
  assert.equal(called.init.headers.accept, 'application/json')
  assert.ok(called.init.signal instanceof AbortSignal)
})

test('expired session responses request sign-in without parsing HTML, including browser opaque redirects', async () => {
  for (const response of [
    new Response(null, { status: 302, headers: { location: '/login' } }),
    new Response(null, { status: 401 }),
    { type: 'opaqueredirect', status: 0 },
    { redirected: true, status: 200, url: 'https://example.invalid/login' }
  ]) {
    response.json = () => assert.fail('must not parse the login response')
    await assert.rejects(
      readAppStatistic(url, signal(), async () => response),
      (error) => {
        assert.ok(error instanceof AppStatisticReadError)
        assert.equal(error.signInRequired, true)
        assert.equal(error.message, 'Sign-in is required to refresh desktop app statistics.')
        return true
      }
    )
  }
})

test('forbidden, failed, HTML and invalid JSON statistics responses have distinct readable errors', async () => {
  for (const [response, message] of [
    [new Response(null, { status: 403 }), 'Your account does not have access to desktop app statistics.'],
    [
      new Response('<!doctype html>proxy failure', { status: 502 }),
      'Could not read desktop app statistics (502).'
    ],
    [
      new Response('<!doctype html>unexpected page', { headers: { 'content-type': 'text/html' } }),
      'Could not read desktop app statistics: the server returned an unexpected response. Try refreshing.'
    ],
    [
      new Response('{', { headers: { 'content-type': 'application/json' } }),
      'Could not read desktop app statistics: the server returned invalid data. Try refreshing.'
    ]
  ]) {
    await assert.rejects(
      readAppStatistic(url, signal(), async () => response),
      (error) => {
        assert.equal(error.signInRequired, false)
        assert.equal(error.message, message)
        assert.doesNotMatch(error.message, /Unexpected token/)
        return true
      }
    )
  }
})

test('detail reads share the same protection and preserve aborted request cancellation', async () => {
  const detail = '/api/ops/app-statistic/users/example'
  await assert.rejects(
    readAppStatistic(detail, signal(), async () => new Response(null, { status: 503 }), 'details'),
    /Could not read record details \(503\)/
  )
  const controller = new AbortController()
  const aborted = new DOMException('Aborted', 'AbortError')
  controller.abort()
  await assert.rejects(
    readAppStatistic(detail, controller.signal, async () => {
      throw aborted
    }),
    (error) => error === aborted
  )
})

const state = {
  view: 'users',
  days: '7',
  q: '',
  version: '1.0.0',
  channel: 'stable',
  platform: 'macos',
  source: 'joomlart',
  template: 'ja-kinetic',
  account: 'linked',
  attention: true,
  user: null,
  sort: 'time',
  direction: 'desc',
  page: 1,
  pageSize: 50
}
const sent = (view) =>
  Object.fromEntries(new URL(appStatisticListUrl({ ...state, view }), 'https://x.test').searchParams)

test('each view sends only the filters that apply to its records', () => {
  const quick = sent('quickstarts')
  assert.equal(quick.view, 'quickstarts')
  assert.equal(quick.template, 'ja-kinetic')
  assert.equal(quick.source, 'joomlart')
  assert.equal(quick.attention, 'needs-attention')
  for (const key of ['version', 'channel', 'platform']) assert.equal(quick[key], '', key)
  assert.equal(quick.account, 'all')
  const downloads = sent('downloads')
  assert.equal(downloads.template, undefined)
  assert.equal(downloads.version, '1.0.0')
  assert.equal(downloads.account, 'all')
  assert.equal(sent('users').account, 'all')
  assert.deepEqual(appStatisticFilters('quickstarts'), ['template', 'source', 'attention'])
  assert.ok(!appStatisticFilters('users').includes('template'))
  assert.ok(appStatisticFilters('installs').includes('account'))
  assert.ok(!appStatisticFilters('installs').includes('source'))
  assert.equal(sent('installs').source, undefined)
})

test('custom dates replace preset days and preserve exact inclusive calendar dates', () => {
  const params = new URL(
    appStatisticListUrl({ ...state, days: 'custom', start: '2026-10-01', end: '2026-10-07' }),
    'https://x.test'
  ).searchParams
  assert.equal(params.get('days'), null)
  assert.equal(params.get('start'), '2026-10-01')
  assert.equal(params.get('end'), '2026-10-07')
  assert.equal(params.get('platform'), 'macos')
})

test('a user scope is sent as the account id on every view', () => {
  const url = appStatisticListUrl({
    ...state,
    view: 'quickstarts',
    user: '11111111-1111-4111-8111-111111111111'
  })
  assert.match(url, /^\/api\/ops\/app-statistic\?/)
  assert.equal(
    new URL(url, 'https://x.test').searchParams.get('user'),
    '11111111-1111-4111-8111-111111111111'
  )
})

test('a recorded URL becomes a link only when it is http(s); the label is host and path', () => {
  assert.deepEqual(externalLink('https://www.joomlart.com/joomla/templates/ja-kinetic?x=1'), {
    href: 'https://www.joomlart.com/joomla/templates/ja-kinetic?x=1',
    label: 'www.joomlart.com/joomla/templates/ja-kinetic'
  })
  assert.deepEqual(externalLink('https://www.joomlart.com/'), {
    href: 'https://www.joomlart.com/',
    label: 'www.joomlart.com'
  })
  for (const bad of [
    'javascript:alert(1)',
    'data:text/html,x',
    '//evil.example/x',
    'not a url',
    '',
    null,
    undefined
  ])
    assert.equal(externalLink(bad), null, String(bad))
})

test('a read failure is said in the language on screen; anything else gets the generic sentence', async () => {
  const vi = JSON.parse(readFileSync(new URL('../src/i18n/locales/vi/appstat.json', import.meta.url), 'utf8'))
  const tVi = (key, params) => translate('vi', vi, en, key, params)
  const failure = await readAppStatistic(
    url,
    signal(),
    async () => new Response(null, { status: 502 })
  ).catch((error) => error)
  assert.equal(failure.key, 'appstat.error.statistics.status')
  assert.equal(readErrorText(failure, tVi), vi['appstat.error.statistics.status'].replace('{status}', '502'))
  assert.match(readErrorText(failure, tVi), /502/)
  assert.equal(
    readErrorText(new TypeError('Failed to fetch'), tVi, 'details'),
    vi['appstat.error.details.generic']
  )
})
