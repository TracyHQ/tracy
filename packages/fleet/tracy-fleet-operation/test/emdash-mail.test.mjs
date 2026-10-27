#!/usr/bin/env node
/**
 * `provision/emdash/configure-mail.mjs` (#803): the step that gives a new EmDash site a mail path
 * through the Tracy relay. Driven against a fake site that answers with the shapes the real routes
 * return — `{ success, data }` envelopes, the emdash-smtp `global-settings` form, the exclusive
 * hook list — and that stores what the real plugin would store, so what is asserted is behaviour:
 * which requests were made, which were not, and what the site holds afterwards.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-mail.test.mjs
 *
 * No listener is opened (this suite must run in a sandbox that forbids one): the helper takes its
 * `fetch`, and the CLI cases stop before the first request.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  configureMail,
  normalizeOrigin,
  parseArgs,
  readToken,
  validateSender
} from '../scripts/provision/emdash/configure-mail.mjs'

const HELPER = fileURLToPath(new URL('../scripts/provision/emdash/configure-mail.mjs', import.meta.url))
const ORIGIN = 'http://127.0.0.1:4321'
const TOKEN = 'ec_pat_ABCdef0123456789ghijkl'
const SENDER = 'owner@example.test'
const HOOKS = '/_emdash/api/admin/hooks/exclusive'
const ADMIN = '/_emdash/api/plugins/emdash-smtp/admin'
const TRUSTED = ['generic', 'phpmail', 'postmark', 'resend']

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const ok = (data) => json({ success: true, data })
const fail = (code, status) => json({ success: false, error: { code, message: `${code} happened` } }, status)
const trim = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined)

/**
 * A fake EmDash site. `global` is what emdash-smtp holds under `settings:global`; `selected` is the
 * exclusive `email:deliver` choice. `intercept(call, state)` may answer a request itself (a Response
 * or a promise of one) — returning undefined lets the fake answer as the real routes do.
 */
function makeSite({
  global = {},
  selected = null,
  providers = ['emdash-smtp'],
  options = TRUSTED,
  intercept
} = {}) {
  const state = { global: { logLevel: 'all', ...global }, selected, providers, options }
  const calls = []
  const select = (key, value, opts) => ({
    type: 'select',
    action_id: key,
    label: key,
    options: opts.map((v) => ({ label: v || 'None', value: v })),
    ...(value !== undefined ? { initial_value: value } : {})
  })
  const text = (key, value) => ({
    type: 'text_input',
    action_id: key,
    label: key,
    ...(value !== undefined ? { initial_value: value } : {})
  })
  const page = (toast) => ({
    blocks: [
      { type: 'header', text: 'SMTP Providers' },
      {
        type: 'form',
        block_id: 'provider-picker',
        fields: [select('providerId', state.options[0], state.options)],
        submit: { label: 'Load Provider', action_id: 'select_provider' }
      },
      {
        type: 'form',
        block_id: 'global-settings',
        fields: [
          select('primaryProviderId', state.global.primaryProviderId, state.options),
          select('fallbackProviderId', state.global.fallbackProviderId, ['', ...state.options]),
          text('fromEmail', state.global.fromEmail),
          text('fromName', state.global.fromName),
          text('replyTo', state.global.replyTo),
          select('logLevel', state.global.logLevel, ['all', 'errors', 'off'])
        ],
        submit: { label: 'Save Global Settings', action_id: 'save_global' }
      },
      {
        type: 'form',
        block_id: 'test-send',
        fields: [text('to')],
        submit: { label: 'Send', action_id: 'send_test' }
      }
    ],
    ...(toast ? { toast } : {})
  })
  const answer = (call) => {
    const { method, pathname, body } = call
    if (method === 'GET' && pathname === HOOKS) {
      return ok({
        items: [
          { hookName: 'comment:moderate', providers: [], selectedPluginId: null },
          {
            hookName: 'email:deliver',
            providers: state.providers.map((pluginId) => ({ pluginId })),
            selectedPluginId: state.selected
          }
        ]
      })
    }
    if (method === 'PUT' && pathname === `${HOOKS}/email:deliver`) {
      if (!state.providers.includes(body.pluginId)) return fail('VALIDATION_ERROR', 400)
      state.selected = body.pluginId
      return ok({ hookName: 'email:deliver', selectedPluginId: body.pluginId })
    }
    if (method === 'POST' && pathname === ADMIN) {
      if (!state.providers.includes('emdash-smtp')) return fail('NOT_FOUND', 404)
      if (body.type === 'page_load') return ok(page())
      if (body.type === 'form_submit' && body.action_id === 'save_global') {
        const v = body.values
        state.global = {
          primaryProviderId: trim(v.primaryProviderId),
          fallbackProviderId: trim(v.fallbackProviderId),
          fromEmail: trim(v.fromEmail),
          fromName: trim(v.fromName),
          replyTo: trim(v.replyTo),
          logLevel: v.logLevel === 'errors' || v.logLevel === 'off' ? v.logLevel : 'all'
        }
        return ok(page({ message: 'Global SMTP settings saved.', type: 'success' }))
      }
      return ok(page())
    }
    return fail('NOT_FOUND', 404)
  }
  const fetch = async (url, init = {}) => {
    const u = new URL(url)
    const call = {
      url: String(url),
      origin: u.origin,
      pathname: decodeURIComponent(u.pathname),
      method: init.method ?? 'GET',
      headers: init.headers ?? {},
      redirect: init.redirect,
      signal: init.signal,
      body: init.body ? JSON.parse(init.body) : undefined
    }
    calls.push(call)
    const custom = intercept?.(call, state, calls.length)
    return custom !== undefined ? custom : answer(call)
  }
  const writes = () => calls.filter((c) => c.method === 'PUT' || c.body?.type === 'form_submit')
  return { fetch, calls, state, writes, answer }
}

const run = (site, extra = {}) =>
  configureMail({
    origin: ORIGIN,
    token: TOKEN,
    sender: SENDER,
    fetch: site.fetch,
    timeoutMs: 2000,
    ...extra
  })

async function refuses(site, code, extra) {
  await assert.rejects(run(site, extra), (err) => {
    assert.equal(err.code, code, `${err.code}: ${err.message}`)
    assert.ok(!err.message.includes(TOKEN), 'the PAT is in the error message')
    return true
  })
}

// ── the fix: an unconfigured site gets the relay path, and it is read back ───────────────────────

test('an unconfigured site gets phpmail, the sender and the exclusive hook, then a readback', async () => {
  const site = makeSite()
  const result = await run(site)
  assert.deepEqual(site.state.global, {
    primaryProviderId: 'phpmail',
    fallbackProviderId: undefined,
    fromEmail: SENDER,
    fromName: undefined,
    replyTo: undefined,
    logLevel: 'all'
  })
  assert.equal(site.state.selected, 'emdash-smtp')
  assert.deepEqual(result, { hook: 'set', provider: 'set', sender: 'set' })
  assert.deepEqual(
    site.writes().map((c) => c.body.action_id ?? c.pathname),
    ['save_global', `${HOOKS}/email:deliver`]
  )
  // The last two requests are reads: the state is confirmed after the last write.
  assert.deepEqual(
    site.calls.slice(-2).map((c) => [c.method, c.body?.type]),
    [
      ['GET', undefined],
      ['POST', 'page_load']
    ]
  )
  for (const c of site.calls) {
    assert.equal(c.origin, ORIGIN)
    assert.equal(c.redirect, 'manual')
    assert.equal(c.headers.authorization, `Bearer ${TOKEN}`)
    assert.equal(c.headers['X-EmDash-Request'], '1')
  }
})

test('no test message is ever sent, and no provider form is touched', async () => {
  const site = makeSite()
  await run(site)
  for (const c of site.calls) {
    assert.ok(
      !['send_test', 'select_provider', 'save_provider'].includes(c.body?.action_id),
      c.body?.action_id
    )
    assert.ok(!String(c.body?.action_id ?? '').startsWith('clear_secret'))
  }
})

test('a second run on a configured site writes nothing', async () => {
  const site = makeSite()
  await run(site)
  const before = site.calls.length
  const result = await run(site)
  assert.deepEqual(result, { hook: 'kept', provider: 'kept', sender: 'kept' })
  assert.equal(site.writes().length, 2, 'the retry wrote again')
  assert.ok(site.calls.length > before)
})

// ── what the customer (or a snapshot) already chose is kept ──────────────────────────────────────

test("a customer's provider, sender and the other fields are preserved", async () => {
  const mine = {
    primaryProviderId: 'generic',
    fallbackProviderId: 'resend',
    fromEmail: 'shop@customer.example',
    fromName: 'Shop',
    replyTo: 'help@customer.example',
    logLevel: 'errors'
  }
  const site = makeSite({ global: mine, selected: 'emdash-smtp' })
  const result = await run(site)
  assert.deepEqual(site.state.global, mine)
  assert.equal(site.writes().length, 0)
  assert.deepEqual(result, { hook: 'kept', provider: 'preserved', sender: 'kept' })
})

test('only what is missing is added: the provider stays, the sender is filled, every field is resent', async () => {
  const site = makeSite({
    global: {
      primaryProviderId: 'generic',
      fallbackProviderId: 'resend',
      fromName: 'Shop',
      replyTo: 'r@c.example',
      logLevel: 'off'
    }
  })
  const result = await run(site)
  assert.deepEqual(site.state.global, {
    primaryProviderId: 'generic',
    fallbackProviderId: 'resend',
    fromEmail: SENDER,
    fromName: 'Shop',
    replyTo: 'r@c.example',
    logLevel: 'off'
  })
  assert.deepEqual(result, { hook: 'set', provider: 'preserved', sender: 'set' })
  const save = site.writes()[0].body
  assert.deepEqual(Object.keys(save.values).sort(), [
    'fallbackProviderId',
    'fromEmail',
    'fromName',
    'logLevel',
    'primaryProviderId',
    'replyTo'
  ])
  assert.equal(JSON.stringify(save).includes('password'), false)
})

test('an existing sender needs no owner email', async () => {
  const site = makeSite({ global: { fromEmail: 'shop@customer.example' } })
  const result = await run(site, { sender: undefined })
  assert.equal(site.state.global.fromEmail, 'shop@customer.example')
  assert.equal(site.state.global.primaryProviderId, 'phpmail')
  assert.deepEqual(result, { hook: 'set', provider: 'set', sender: 'kept' })
})

test('another plugin chosen for email:deliver is left alone, with no write at all', async () => {
  const site = makeSite({ providers: ['emdash-smtp', 'acme-mail'], selected: 'acme-mail' })
  const result = await run(site)
  assert.equal(site.state.selected, 'acme-mail')
  assert.equal(site.writes().length, 0)
  assert.deepEqual(result, { hook: 'other', provider: 'untouched', sender: 'untouched' })
})

// ── refusals before any write ────────────────────────────────────────────────────────────────────

test('no sender on a site that has none is refused — no address is invented', async () => {
  for (const sender of [undefined, '']) {
    const site = makeSite()
    await refuses(site, 'NO_SENDER', { sender })
    assert.equal(site.writes().length, 0)
    assert.equal(site.state.global.fromEmail, undefined)
  }
})

test('an invalid sender or origin is refused before the first request', async () => {
  const badSenders = [
    'a@b.example\r\nBcc: x@y.example',
    'a@b.example\n',
    ' a@b.example',
    'a b@c.example',
    'nobody',
    'a@b',
    '@b.example',
    'a@',
    'a@b..example',
    '.a@b.example',
    'a..b@c.example',
    'A <a@b.example>',
    'a@b.example,c@d.example',
    `${'a'.repeat(250)}@b.example`
  ]
  for (const sender of badSenders) {
    const site = makeSite()
    await refuses(site, 'BAD_SENDER', { sender })
    assert.equal(site.calls.length, 0, `a request was made for sender ${JSON.stringify(sender)}`)
  }
  const badOrigins = [
    '',
    'https://127.0.0.1:4321',
    'http://example.com:4321',
    'http://127.0.0.1',
    'http://127.0.0.1:0',
    'http://127.0.0.1:99999',
    'http://127.0.0.1:4321/',
    'http://127.0.0.1:4321/x',
    'http://u:p@127.0.0.1:4321',
    'http://127.0.0.1.evil.example:4321',
    'http://127.0.0.1:4321?x=1',
    'http://127.0.0.1:43 21',
    'ftp://127.0.0.1:4321',
    // A container address is taken only as a canonical private IPv4 literal: never a name (a lookup
    // would choose where the PAT goes), never a public, link-local or other-loopback address.
    'http://demo-web-1:4321',
    'http://host.docker.internal:4321',
    'http://8.8.8.8:4321',
    'http://172.15.0.2:4321',
    'http://172.32.0.2:4321',
    'http://192.169.0.2:4321',
    'http://169.254.169.254:80',
    'http://127.0.0.2:4321',
    'http://0.0.0.0:4321',
    'http://10.0.0.256:4321',
    'http://010.0.0.2:4321',
    'http://10.0.2:4321',
    'http://10.0.0.2.3:4321',
    'http://172.30.0.7:4321/',
    'https://172.30.0.7:4321'
  ]
  for (const origin of badOrigins) {
    const site = makeSite()
    await refuses(site, 'BAD_ORIGIN', { origin })
    assert.equal(site.calls.length, 0, `a request was made for origin ${JSON.stringify(origin)}`)
  }
  const goodOrigins = [
    'http://127.0.0.1:4321',
    'http://localhost:8080',
    'http://[::1]:65535',
    'http://172.30.0.7:4321',
    'http://172.16.0.1:4321',
    'http://172.31.255.254:4321',
    'http://10.0.0.2:4321',
    'http://192.168.97.3:4321'
  ]
  for (const good of goodOrigins) assert.equal(normalizeOrigin(good), good)
  assert.equal(validateSender(SENDER), SENDER)
})

test('a token of the wrong shape is refused before the first request and never echoed', async () => {
  for (const token of [
    undefined,
    '',
    'ec_pat_short',
    'Bearer x',
    `${TOKEN}\n`,
    `${TOKEN} `,
    `${TOKEN}\r\nx-evil: 1`
  ]) {
    const site = makeSite()
    await assert.rejects(run(site, { token }), (err) => {
      assert.equal(err.code, 'BAD_TOKEN')
      if (token) assert.ok(!err.message.includes(token.trim()))
      return true
    })
    assert.equal(site.calls.length, 0)
  }
})

test('arguments: missing, duplicated, unknown and valueless ones are refused', () => {
  const good = ['--origin', ORIGIN, '--token-file', '/x/t', '--sender', SENDER]
  assert.deepEqual(parseArgs(good), { origin: ORIGIN, tokenFile: '/x/t', sender: SENDER })
  assert.deepEqual(parseArgs(good.slice(0, 4)), { origin: ORIGIN, tokenFile: '/x/t', sender: undefined })
  const bad = [
    [],
    ['--origin', ORIGIN],
    ['--token-file', '/x/t'],
    [...good, '--origin', ORIGIN],
    [...good, '--sender', 'b@c.example'],
    [...good, '--test', 'x@y.example'],
    [...good, 'stray'],
    ['--origin', '--token-file', '/x/t'],
    ['--origin', ORIGIN, '--token-file'],
    ['--origin', ORIGIN, '--token-file', ''],
    ['--origin', ORIGIN, '--token-file', '/x/t', '--sender'],
    ['--origin', ORIGIN, '--token-file', '/x/t', '--sender', ''],
    ['--origin=http://127.0.0.1:4321', '--token-file', '/x/t']
  ]
  for (const argv of bad)
    assert.throws(
      () => parseArgs(argv),
      (err) => err.code === 'USAGE',
      JSON.stringify(argv)
    )
})

// ── the token file ───────────────────────────────────────────────────────────────────────────────

function scratch() {
  return mkdtempSync(path.join(tmpdir(), 'emdash-mail-'))
}

test('the token file must be a small regular file holding one PAT; anything else is refused', () => {
  const dir = scratch()
  try {
    const good = path.join(dir, 'good')
    writeFileSync(good, `${TOKEN}\n`)
    assert.equal(readToken(good), TOKEN)

    const cases = {
      missing: path.join(dir, 'missing'),
      empty: path.join(dir, 'empty'),
      malformed: path.join(dir, 'malformed'),
      twoLines: path.join(dir, 'two'),
      huge: path.join(dir, 'huge'),
      directory: path.join(dir, 'dir'),
      symlink: path.join(dir, 'link'),
      fifo: path.join(dir, 'fifo')
    }
    writeFileSync(cases.empty, '')
    writeFileSync(cases.malformed, 'SECRETLEAK-not-a-pat\n')
    writeFileSync(cases.twoLines, `${TOKEN}\n${TOKEN}\n`)
    writeFileSync(cases.huge, `${TOKEN}${'A'.repeat(8192)}\n`)
    mkdirSync(cases.directory)
    symlinkSync(good, cases.symlink)
    assert.equal(spawnSync('mkfifo', [cases.fifo]).status, 0, 'mkfifo is needed for this case')

    for (const [name, file] of Object.entries(cases)) {
      assert.throws(
        () => readToken(file),
        (err) =>
          err.code === 'BAD_TOKEN' && !err.message.includes('SECRETLEAK') && !err.message.includes(TOKEN),
        name
      )
      // The CLI: bounded (a FIFO must not hang it), nonzero, and silent about the file's content.
      const r = spawnSync(
        process.execPath,
        [HELPER, '--origin', ORIGIN, '--token-file', file, '--sender', SENDER],
        {
          encoding: 'utf8',
          timeout: 20000
        }
      )
      assert.equal(r.signal, null, `${name}: the helper hung`)
      assert.equal(r.status, 1, `${name}: ${r.stderr}`)
      assert.match(r.stderr, /^configure-mail: /)
      assert.doesNotMatch(r.stdout + r.stderr, /SECRETLEAK|ec_pat_/, name)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the CLI refuses bad arguments with exit 2 and keeps a PAT-shaped argument out of its output', () => {
  const runs = [
    [],
    ['--origin', ORIGIN],
    ['--origin', 'https://example.com', '--token-file', '/nonexistent/t'],
    ['--origin', ORIGIN, '--token-file', '/nonexistent/t', '--sender', 'a@b.example\r\nBcc: x@y.example'],
    ['--origin', ORIGIN, '--token-file', '/nonexistent/t', '--token', TOKEN]
  ]
  for (const argv of runs) {
    const r = spawnSync(process.execPath, [HELPER, ...argv], { encoding: 'utf8', timeout: 20000 })
    assert.equal(r.status, 2, `${JSON.stringify(argv)}: ${r.stderr}`)
    assert.doesNotMatch(r.stdout + r.stderr, /ec_pat_/)
  }
})

// ── answers that cannot be understood are never read as success ──────────────────────────────────

const raw = (body, status = 200, type = 'application/json') =>
  new Response(body, { status, headers: { 'content-type': type } })

test('an unreadable answer to the first read is refused with no write', async () => {
  const answers = {
    empty: () => raw(''),
    notJson: () => raw('{"success":true,'),
    html: () => raw('<!doctype html><title>Sign in</title>', 200, 'text/html'),
    array: () => json([]),
    nullBody: () => json(null),
    noSuccess: () => json({ data: { items: [] } }),
    errorAt200: () => json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'x' } }),
    errorBesideData: () => json({ success: true, error: { code: 'X' }, data: { items: [] } }),
    noData: () => json({ success: true }),
    itemsNotArray: () => ok({ items: {} }),
    noHook: () => ok({ items: [] }),
    twoHooks: () =>
      ok({
        items: [
          { hookName: 'email:deliver', providers: [{ pluginId: 'emdash-smtp' }], selectedPluginId: null },
          {
            hookName: 'email:deliver',
            providers: [{ pluginId: 'emdash-smtp' }],
            selectedPluginId: 'emdash-smtp'
          }
        ]
      }),
    providersNotArray: () =>
      ok({ items: [{ hookName: 'email:deliver', providers: 'emdash-smtp', selectedPluginId: null }] }),
    selectionMissing: () =>
      ok({ items: [{ hookName: 'email:deliver', providers: [{ pluginId: 'emdash-smtp' }] }] }),
    selectionEmpty: () =>
      ok({
        items: [{ hookName: 'email:deliver', providers: [{ pluginId: 'emdash-smtp' }], selectedPluginId: '' }]
      }),
    selectionNotAProvider: () =>
      ok({
        items: [
          { hookName: 'email:deliver', providers: [{ pluginId: 'emdash-smtp' }], selectedPluginId: 'ghost' }
        ]
      })
  }
  for (const [name, answer] of Object.entries(answers)) {
    const site = makeSite({ intercept: (call) => (call.pathname === HOOKS ? answer() : undefined) })
    await assert.rejects(
      run(site),
      (err) => ['BAD_RESPONSE', 'API_ERROR', 'UNKNOWN_STATE', 'NO_PLUGIN'].includes(err.code),
      name
    )
    assert.equal(site.writes().length, 0, name)
  }
})

test('a settings form that is missing, doubled or of an unknown shape is refused with no write', async () => {
  const mutate = {
    noBlocks: (d) => ({ ...d, blocks: undefined }),
    noForm: (d) => ({ ...d, blocks: d.blocks.filter((b) => b.block_id !== 'global-settings') }),
    twoForms: (d) => ({
      ...d,
      blocks: [...d.blocks, d.blocks.find((b) => b.block_id === 'global-settings')]
    }),
    fieldMissing: (d) => form(d, (f) => f.filter((x) => x.action_id !== 'replyTo')),
    fieldDoubled: (d) => form(d, (f) => [...f, f[2]]),
    fieldUnknown: (d) => form(d, (f) => [...f, { type: 'text_input', action_id: 'bcc', label: 'Bcc' }]),
    wrongType: (d) =>
      form(d, (f) =>
        f.map((x) => (x.action_id === 'fromEmail' ? { ...x, type: 'secret_input', has_value: true } : x))
      ),
    valueNotString: (d) =>
      form(d, (f) => f.map((x) => (x.action_id === 'fromName' ? { ...x, initial_value: 7 } : x))),
    primaryNotAnOption: (d) =>
      form(d, (f) =>
        f.map((x) => (x.action_id === 'primaryProviderId' ? { ...x, initial_value: 'ghost' } : x))
      ),
    optionsMissing: (d) =>
      form(d, (f) => f.map((x) => (x.action_id === 'primaryProviderId' ? { ...x, options: undefined } : x))),
    logLevelUnknown: (d) =>
      form(d, (f) => f.map((x) => (x.action_id === 'logLevel' ? { ...x, initial_value: 'verbose' } : x)))
  }
  function form(d, change) {
    return {
      ...d,
      blocks: d.blocks.map((b) => (b.block_id === 'global-settings' ? { ...b, fields: change(b.fields) } : b))
    }
  }
  for (const [name, change] of Object.entries(mutate)) {
    const site = makeSite({
      intercept: (call) => {
        if (call.pathname !== ADMIN || call.body.type !== 'page_load') return undefined
        return site
          .answer(call)
          .json()
          .then((body) => ok(change(body.data)))
      }
    })
    await refuses(site, 'UNKNOWN_STATE')
    assert.equal(site.writes().length, 0, name)
  }
})

test('a site without the relay provider, or without emdash-smtp, is refused', async () => {
  // The marketplace variant of the plugin has no local sendmail provider.
  const marketplace = makeSite({ options: ['postmark', 'resend'] })
  await refuses(marketplace, 'NO_RELAY_PROVIDER')
  assert.equal(marketplace.writes().length, 0)

  const noPlugin = makeSite({ providers: [] })
  await refuses(noPlugin, 'NO_PLUGIN')
  assert.equal(noPlugin.writes().length, 0)
})

// ── transport failures ───────────────────────────────────────────────────────────────────────────

test('401, 403, 404, 5xx and a network rejection are refused, each named, with no write', async () => {
  const cases = [
    [() => fail('UNAUTHORIZED', 401), 'AUTH'],
    [() => fail('FORBIDDEN', 403), 'AUTH'],
    [() => fail('CSRF_REJECTED', 403), 'AUTH'],
    [() => fail('NOT_FOUND', 404), 'NOT_FOUND'],
    [() => fail('NOT_CONFIGURED', 500), 'HTTP'],
    [() => raw('Bad gateway', 502, 'text/plain'), 'HTTP'],
    [
      () =>
        ok({ items: [] })
          .json()
          .then((b) => json(b, 201)),
      'HTTP'
    ],
    [() => Promise.reject(new TypeError(`fetch failed for Bearer ${TOKEN}`)), 'NETWORK']
  ]
  for (const [answer, code] of cases) {
    for (const where of [HOOKS, ADMIN]) {
      const site = makeSite({ intercept: (call) => (call.pathname === where ? answer() : undefined) })
      await refuses(site, code)
      assert.equal(site.writes().length, 0)
    }
  }
})

test('a redirect is refused and never followed: the PAT goes to no other origin', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const site = makeSite({
      intercept: (call) =>
        call.pathname === HOOKS
          ? new Response(null, { status, headers: { location: 'https://evil.example/collect' } })
          : undefined
    })
    await refuses(site, 'REDIRECT')
    assert.equal(site.calls.length, 1)
    assert.ok(site.calls.every((c) => c.origin === ORIGIN && c.redirect === 'manual'))
  }
})

test('a request that never answers times out, aborts, and ends the run', async () => {
  let aborted = false
  const site = makeSite({
    intercept: (call) =>
      new Promise((_, reject) => {
        call.signal.addEventListener('abort', () => {
          aborted = true
          reject(new Error('aborted'))
        })
      })
  })
  await refuses(site, 'TIMEOUT', { timeoutMs: 30 })
  assert.equal(aborted, true)
  assert.equal(site.calls.length, 1)
})

test('an answer that arrives after the timeout does not resume the chain of writes', async () => {
  // The fake ignores the abort signal and answers late, as a proxy that buffered the answer would.
  const site = makeSite({
    intercept: (call) =>
      call.body?.action_id === 'save_global'
        ? new Promise((resolve) => setTimeout(() => resolve(site.answer(call)), 120))
        : undefined
  })
  await refuses(site, 'TIMEOUT', { timeoutMs: 30 })
  const seen = site.calls.length
  await new Promise((resolve) => setTimeout(resolve, 250))
  assert.equal(site.calls.length, seen, 'a request was made after the timeout')
  assert.equal(site.state.selected, null, 'the hook was written after the timeout')
  // The late write did land on the site; the next run reads it back and finishes without repeating it.
  const again = makeSite({ global: site.state.global })
  assert.deepEqual(await run(again), { hook: 'set', provider: 'kept', sender: 'kept' })
  assert.deepEqual(
    again.writes().map((c) => c.method),
    ['PUT']
  )
})

// ── partial writes, readback ─────────────────────────────────────────────────────────────────────

test('a failed second write fails the run; the retry reads the state and only finishes what is left', async () => {
  let broken = true
  const site = makeSite({
    intercept: (call) => (broken && call.method === 'PUT' ? fail('EXCLUSIVE_HOOK_SET_ERROR', 500) : undefined)
  })
  await refuses(site, 'HTTP')
  assert.equal(site.state.global.primaryProviderId, 'phpmail')
  assert.equal(site.state.selected, null)
  broken = false
  const before = site.writes().length
  assert.deepEqual(await run(site), { hook: 'set', provider: 'kept', sender: 'kept' })
  assert.deepEqual(
    site
      .writes()
      .slice(before)
      .map((c) => c.method),
    ['PUT'],
    'the retry repeated the settings write'
  )
})

test('a settings write that is not confirmed stops before the hook is written', async () => {
  const answers = [
    (site, call) => site.answer({ ...call, body: { type: 'page_load' } }), // no toast: nothing was saved
    (site, call) =>
      site
        .answer({ ...call, body: { type: 'page_load' } })
        .json()
        .then((b) => ok({ ...b.data, toast: { message: 'No.', type: 'error' } })),
    () => fail('PLUGIN_ERROR', 400),
    () => raw('')
  ]
  for (const answer of answers) {
    const site = makeSite({
      intercept: (call) => (call.body?.action_id === 'save_global' ? answer(site, call) : undefined)
    })
    await assert.rejects(run(site), (err) => ['WRITE_FAILED', 'HTTP', 'BAD_RESPONSE'].includes(err.code))
    assert.deepEqual(
      site.writes().map((c) => c.method),
      ['POST'],
      'the hook was written after a failed save'
    )
    assert.equal(site.state.selected, null)
  }
})

test('a hook write answered with another selection is refused', async () => {
  const site = makeSite({
    intercept: (call) =>
      call.method === 'PUT' ? ok({ hookName: 'email:deliver', selectedPluginId: null }) : undefined
  })
  await refuses(site, 'WRITE_FAILED')
})

test('a readback that does not match is reported as unverified, not as success', async () => {
  // Writes are acknowledged but something else changes the state before the readback.
  const drift = [
    (state) => {
      state.global.primaryProviderId = 'generic'
    },
    (state) => {
      state.global.fromEmail = 'someone@else.example'
    },
    (state) => {
      state.global.fromName = 'Changed'
    },
    (state) => {
      state.selected = null
    }
  ]
  for (const change of drift) {
    const site = makeSite({
      intercept: (call, state) => {
        if (call.method !== 'PUT') return undefined
        const answer = site.answer(call)
        change(state)
        return answer
      }
    })
    await refuses(site, 'UNVERIFIED')
  }
  // A site that acknowledges the save and stores nothing.
  const deaf = makeSite({
    intercept: (call) =>
      call.body?.action_id === 'save_global'
        ? deaf
            .answer({ ...call, body: { type: 'page_load' } })
            .json()
            .then((b) => ok({ ...b.data, toast: { message: 'Saved.', type: 'success' } }))
        : undefined
  })
  await refuses(deaf, 'UNVERIFIED')
})
