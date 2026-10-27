// The site Settings tab's data (layout D, Akemi 04/10/2026): the header facts and the compact rows
// for a Joomla and a WordPress site, each row with the admin page that edits it.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { outputFiles } = await require('esbuild').build({
  entryPoints: [path.join(here, '..', 'src', 'site-tabs', 'settings-rows.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false
})
const {
  settingRows,
  siteSummary,
  ownDomainsOf,
  domainState,
  readOwnDomain,
  unreachableReasonKey,
  publishRefusalKey
} = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

/** `t` answering with the key and its parameters, so a row is named by its key. */
const t = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key)

const joomla = {
  siteUrl: 'https://tracybusinessja.tracy.site',
  adminUrl: 'https://tracybusinessja.tracy.site/administrator/',
  platform: 'joomla',
  state: 'ready',
  displayName: 'tracybusinessja.tracy.site',
  values: {
    version: '6.1.1',
    title: 'Northgate Industrial',
    language: 'en-GB',
    languages: 43,
    timezone: 'UTC',
    template: 'Tracy Business',
    sef: true
  }
}
const wordpress = {
  siteUrl: 'https://wptest0929.tracy.site/',
  adminUrl: 'https://wptest0929.tracy.site/wp-admin/',
  platform: 'wordpress',
  state: 'ready',
  values: {
    version: '7.1.2',
    title: 'Northgate',
    language: 'en_US',
    timezone: 'UTC',
    theme: 'Tracy Business',
    homepage: 'page',
    permalinks: ''
  }
}

test('the header names the site by its own title, then the CMS and its version', () => {
  assert.deepEqual(siteSummary(joomla, 'k'), { name: 'Northgate Industrial', sub: 'Joomla 6.1.1' })
  assert.deepEqual(siteSummary(wordpress, 'k'), { name: 'Northgate', sub: 'WordPress 7.1.2' })
})

test('a site the CMS did not answer for is named as Tracy shows it, and the version is left out', () => {
  const unread = { ...joomla, state: 'unreachable', values: {} }
  assert.deepEqual(siteSummary(unread, 'k'), { name: 'tracybusinessja.tracy.site', sub: 'Joomla' })
  assert.deepEqual(siteSummary({ ...unread, displayName: undefined }, 'site.key'), {
    name: 'site.key',
    sub: 'Joomla'
  })
})

test('Joomla rows: the admin first, then the fixed order, each linked to its admin page', () => {
  const rows = settingRows(joomla, t)
  assert.deepEqual(
    rows.map((r) => r.key),
    ['admin', 'version', 'title', 'language', 'languages', 'timezone', 'template', 'sef']
  )
  assert.equal(rows[0].href, joomla.adminUrl)
  assert.equal(rows[1].label, 'settings.version{"cms":"Joomla"}')
  assert.equal(
    rows[1].href,
    'https://tracybusinessja.tracy.site/administrator/index.php?option=com_joomlaupdate'
  )
  assert.equal(rows.find((r) => r.key === 'sef').value, 'settings.enabled')
  assert.equal(rows.find((r) => r.key === 'languages').value, '43')
})

test('WordPress rows read its own words: the homepage kind and plain permalinks', () => {
  const rows = settingRows(wordpress, t)
  assert.deepEqual(
    rows.map((r) => r.key),
    ['admin', 'version', 'title', 'language', 'timezone', 'theme', 'homepage', 'permalinks']
  )
  assert.equal(rows.find((r) => r.key === 'homepage').value, 'settings.homepage.page')
  assert.equal(rows.find((r) => r.key === 'permalinks').value, 'settings.plain')
  assert.equal(rows.find((r) => r.key === 'theme').href, 'https://wptest0929.tracy.site/wp-admin/themes.php')
})

test('without an address no row links anywhere, and the admin says unavailable', () => {
  const rows = settingRows({ ...wordpress, siteUrl: null, adminUrl: null }, t)
  assert.ok(rows.every((r) => r.href === null))
  assert.equal(rows[0].value, 'settings.unavailable')
})

// ── Own domains that cannot connect, or no longer hold their name (review findings after #988) ──

const lapsedOf = (name, extra = {}) => ({
  name,
  kind: 'custom',
  state: 'lapsed',
  lapsedAt: '2026-10-07T10:00:00.000Z',
  ...extra
})

test('a lapsed reservation is read only from the lapsed list, and only when it says so — never as pending, connected or ready', () => {
  const domains = ownDomainsOf({
    allowed: true,
    managedDomain: 'tracy.test',
    status: 'ready',
    connected: [],
    lapsed: [
      lapsedOf('shop.example.com'),
      // Not one: no state, another state, no name, the same name twice.
      { name: 'nostate.example.com', kind: 'custom' },
      { name: 'other.example.com', state: 'connected', checks: [] },
      lapsedOf(''),
      lapsedOf('shop.example.com')
    ]
  })
  assert.deepEqual(
    domains.map((d) => [d.name, d.state, d.lapsedAt]),
    [['shop.example.com', 'lapsed', '2026-10-07T10:00:00.000Z']]
  )
  assert.equal(domainState(domains[0], null), 'lapsed')
  // A `pending` slot that says `lapsed`, and a connected list entry that does, are not drawn.
  assert.deepEqual(
    ownDomainsOf({ pending: lapsedOf('a.example.com'), connected: [lapsedOf('b.example.com')] }),
    []
  )
  // Even an operation naming it does not make a lapsed reservation look connected or busy.
  const running = {
    publish: 'published',
    mayPublish: true,
    operation: {
      op: 'live',
      state: 'running',
      domains: ['shop.example.com'],
      retry: false,
      jobId: 'j',
      startedAt: 'x'
    }
  }
  assert.equal(domainState(domains[0], running), 'lapsed')
})

test("a pending bare domain reads `unsupported` from the server's own word for it; anything else about it reads as before", () => {
  const pending = (extra) =>
    ownDomainsOf({
      pending: { name: 'example.com', kind: 'custom', state: 'pending', checks: [], ...extra }
    })[0]
  const apex = pending({
    problem: 'DOMAIN_APEX_UNSUPPORTED',
    suggestion: 'www.example.com',
    holdUntil: '2026-10-10T10:00:00.000Z'
  })
  assert.equal(apex.problem, 'DOMAIN_APEX_UNSUPPORTED')
  assert.equal(apex.suggestion, 'www.example.com')
  assert.equal(apex.holdUntil, '2026-10-10T10:00:00.000Z')
  assert.equal(domainState(apex, null), 'unsupported')
  // No problem named, or one of the wrong type: the ordinary states.
  assert.equal(domainState(pending({}), null), 'waiting')
  assert.equal(domainState(pending({ problem: 42, holdUntil: 7 }), null), 'waiting')
  assert.equal('holdUntil' in pending({ holdUntil: 7 }), false)
  // A connected domain carries no problem, whatever the payload says.
  const connected = ownDomainsOf({
    connected: [{ name: 'example.com', state: 'connected', problem: 'DOMAIN_APEX_UNSUPPORTED', checks: [] }]
  })[0]
  assert.equal('problem' in connected, false)
  assert.equal(domainState(connected, null), 'connected')

  // Each operation state of a bare domain: one that failed to connect it says why it never can (not
  // Failed with records and Connect again); one still running, or a removal that did not take it off
  // the host, keeps its own state, so the host is asked to let go of a name it may have.
  const op = (o, state, code) => ({
    publish: 'draft',
    mayPublish: true,
    operation: { op: o, state, domains: ['example.com'], retry: false, jobId: 'j', startedAt: 'x', ...code }
  })
  assert.equal(domainState(apex, op('live', 'failed', { code: 'SITE_LIVE_FAILED' })), 'unsupported')
  assert.equal(domainState(apex, op('live', 'running')), 'connecting')
  assert.equal(domainState(apex, op('drop-domain', 'running')), 'removing')
  assert.equal(domainState(apex, op('drop-domain', 'failed', { code: 'DROP_FAILED' })), 'cleanup')
  assert.equal(domainState(apex, op('draft', 'failed', { code: 'DOMAIN_STILL_ROUTED' })), 'cleanup')
  assert.equal(domainState(apex, op('draft', 'failed', { code: 'OTHER' })), 'unsupported')
  // The same failures on an ordinary pending domain read as before.
  assert.equal(domainState(pending({}), op('live', 'failed', { code: 'SITE_LIVE_FAILED' })), 'failed')

  // Any problem the server names, not only a bare domain: a name under a suffix it cannot tell is a
  // registered one reads `unsupported` the same way, in every operation state, with no suggestion.
  const unknownSuffix = ownDomainsOf({
    pending: {
      name: 'shop.example',
      kind: 'custom',
      state: 'pending',
      checks: [],
      problem: 'INVALID_SITE_KEY'
    }
  })[0]
  assert.equal(unknownSuffix.problem, 'INVALID_SITE_KEY')
  assert.equal('suggestion' in unknownSuffix, false)
  const opOn = (o, state, code) => {
    const it = op(o, state, code)
    it.operation.domains = ['shop.example']
    return it
  }
  assert.equal(domainState(unknownSuffix, null), 'unsupported')
  assert.equal(
    domainState(unknownSuffix, opOn('live', 'failed', { code: 'SITE_LIVE_FAILED' })),
    'unsupported'
  )
  assert.equal(domainState(unknownSuffix, opOn('live', 'running')), 'connecting')
  assert.equal(domainState(unknownSuffix, opOn('drop-domain', 'running')), 'removing')
  assert.equal(domainState(unknownSuffix, opOn('drop-domain', 'failed', { code: 'DROP_FAILED' })), 'cleanup')
  // An operation of ANOTHER name, running or failed, changes nothing about it.
  assert.equal(domainState(unknownSuffix, op('live', 'running')), 'unsupported')
  assert.equal(domainState(unknownSuffix, op('live', 'failed', { code: 'SITE_LIVE_FAILED' })), 'unsupported')
})

// ── Whether the real domain opens the site (#1037): the HTTPS probe's reading on the card ──

const check = (record, status) => ({
  record,
  type: record === 'ownership' ? 'TXT' : 'CNAME',
  name: record === 'ownership' ? '_tracy.www.example.com' : 'www.example.com',
  status,
  observed: []
})
const ownDomain = (ownership, routing, extra = {}) =>
  readOwnDomain({
    name: 'www.example.com',
    kind: 'custom',
    state: 'pending',
    checks: [check('ownership', ownership), check('routing', routing)],
    ...extra
  })

test('a well-formed `connection` is kept as sent; a malformed one is no reading at all', () => {
  const read = (connection) => ownDomain('ok', 'ok', { connection }).connection
  assert.deepEqual(read({ status: 'unchecked' }), { status: 'unchecked' })
  assert.deepEqual(read({ status: 'waiting', route: 'direct' }), { status: 'waiting', route: 'direct' })
  assert.deepEqual(read({ status: 'ok', checkedAt: '2026-10-08T10:00:00.000Z' }), {
    status: 'ok',
    checkedAt: '2026-10-08T10:00:00.000Z'
  })
  assert.deepEqual(read({ status: 'failed', error: 'TLS_INVALID', checkedAt: '2026-10-08T10:00:00.000Z' }), {
    status: 'failed',
    error: 'TLS_INVALID',
    checkedAt: '2026-10-08T10:00:00.000Z'
  })
  // Fields of the wrong type are left out; a route this screen does not know is not passed on.
  assert.deepEqual(read({ status: 'waiting', route: 'tunnel', checkedAt: 7, more: true }), {
    status: 'waiting'
  })
  // Not a reading: no status, a status this screen does not know, an error that is not a string.
  for (const malformed of [
    undefined,
    null,
    'ok',
    [],
    {},
    { status: 'connected' },
    { status: 7 },
    { status: 'failed', error: 42 },
    { status: 'failed', error: null }
  ])
    assert.equal('connection' in ownDomain('ok', 'ok', { connection: malformed }), false)
  // A lapsed reservation has no route to ask, whatever the payload says.
  assert.equal(
    'connection' in
      ownDomain('ok', 'ok', { state: 'lapsed', connection: { status: 'failed', error: 'TIMEOUT' } }),
    false
  )
})

test('a pending domain whose route is installed reads what asking the domain found, and no longer the routing record', () => {
  const failed = { status: 'failed', error: 'DNS_NXDOMAIN', checkedAt: '2026-10-08T10:00:00.000Z' }
  assert.equal(domainState(ownDomain('ok', 'ok', { connection: failed }), null), 'unreachable')
  assert.equal(domainState(ownDomain('ok', 'wrong', { connection: failed }), null), 'unreachable')
  assert.equal(domainState(ownDomain('ok', 'ok', { connection: { status: 'waiting' } }), null), 'opening')
  assert.equal(
    domainState(ownDomain('ok', 'ok', { connection: { status: 'waiting', route: 'direct' } }), null),
    'opening'
  )

  // Before the route is installed the OWNERSHIP record decides: it is what the server connects on.
  const unchecked = { connection: { status: 'unchecked' } }
  assert.equal(domainState(ownDomain('ok', 'wrong', unchecked), null), 'verified')
  assert.equal(domainState(ownDomain('ok', 'missing', unchecked), null), 'verified')
  assert.equal(domainState(ownDomain('ok', 'unknown', unchecked), null), 'verified')
  assert.equal(domainState(ownDomain('wrong', 'ok', unchecked), null), 'wrong')
  assert.equal(domainState(ownDomain('unknown', 'ok', unchecked), null), 'unknown')
  assert.equal(domainState(ownDomain('missing', 'ok', unchecked), null), 'waiting')
  assert.equal(domainState(ownDomain('unchecked', 'unchecked', unchecked), null), 'waiting')

  // A server older than the probe sends no `connection`: both records are read, as before.
  assert.equal(domainState(ownDomain('ok', 'wrong'), null), 'wrong')
  assert.equal(domainState(ownDomain('ok', 'ok'), null), 'verified')
  assert.equal(domainState(ownDomain('ok', 'unknown'), null), 'unknown')
  assert.equal(domainState(ownDomain('ok', 'missing'), null), 'waiting')
  // So does a `connection` that is not a reading.
  assert.equal(domainState(ownDomain('ok', 'wrong', { connection: { status: 'connected' } }), null), 'wrong')
})

test('an operation on the domain, a problem the server names and a connected domain each still win over the connection', () => {
  const failed = { connection: { status: 'failed', error: 'TIMEOUT' } }
  const op = (o, state, code) => ({
    publish: 'published',
    mayPublish: true,
    operation: {
      op: o,
      state,
      domains: ['www.example.com'],
      retry: false,
      jobId: 'j',
      startedAt: 'x',
      ...code
    }
  })
  const pending = ownDomain('ok', 'ok', failed)
  assert.equal(domainState(pending, op('live', 'running')), 'connecting')
  assert.equal(domainState(pending, op('drop-domain', 'running')), 'removing')
  assert.equal(domainState(pending, op('drop-domain', 'failed', { code: 'DROP_FAILED' })), 'cleanup')
  assert.equal(domainState(pending, op('live', 'failed', { code: 'DOMAIN_NOT_ROUTED' })), 'failed')
  // An operation that names another domain leaves the connection's reading in place.
  const other = op('live', 'running')
  other.operation.domains = ['shop.example.com']
  assert.equal(domainState(pending, other), 'unreachable')
  assert.equal(
    domainState(ownDomain('ok', 'ok', { ...failed, problem: 'INVALID_SITE_KEY' }), null),
    'unsupported'
  )

  const connected = (connection) => ownDomain('ok', 'wrong', { state: 'connected', connection })
  const published = { publish: 'published', mayPublish: true, operation: null }
  const draft = { publish: 'draft', mayPublish: true, operation: null }
  for (const connection of [{ status: 'ok' }, { status: 'waiting' }, failed.connection]) {
    assert.equal(domainState(connected(connection), published), 'live')
    assert.equal(domainState(connected(connection), draft), 'connected')
    assert.equal(domainState(connected(connection), null), 'connected')
  }
})

test('every code the probe can end on has a reason in words, and an unknown one reads as the generic reason', () => {
  const reasons = {
    'domains.unreachable.dns': ['DNS_NXDOMAIN', 'DNS_NO_ADDRESS', 'DNS_TIMEOUT', 'DNS_FAILED'],
    'domains.unreachable.address': ['ADDRESS_NOT_PUBLIC'],
    'domains.unreachable.certificate': ['TLS_INVALID'],
    'domains.unreachable.connect': ['CONNECT_FAILED', 'TIMEOUT'],
    'domains.unreachable.otherSite': [
      'REDIRECT',
      'HTTP_STATUS',
      'EMPTY',
      'TOO_LARGE',
      'WRONG_ANSWER',
      'PAGE_NOT_SITE'
    ],
    'domains.unreachable.siteDown': ['SITE_NOT_ANSWERING', 'PAGE_EMPTY', 'PAGE_INCOMPLETE', 'PAGE_TOO_LARGE'],
    'domains.unreachable.redirect': ['PAGE_REDIRECT'],
    // Cloudflare for SaaS (#1037, slice 2): the registration and its certificate come first.
    'domains.unreachable.hostnamePending': ['HOSTNAME_PREPARING', 'HOSTNAME_PENDING', 'HOSTNAME_UNCONFIRMED'],
    'domains.unreachable.certificatePending': ['CERT_PENDING'],
    'domains.unreachable.hostnameFailed': ['HOSTNAME_FAILED', 'CERT_FAILED'],
    'domains.unreachable.hostnameTaken': ['HOSTNAME_CONFLICT'],
    'domains.unreachable.hostnameUnread': ['HOSTNAME_UNREAD'],
    'domains.unreachable.generic': ['NO_ATTEMPT', 'PROBE_FAILED', 'UNKNOWN', 'SOMETHING_NEW', '', undefined]
  }
  for (const [key, codes] of Object.entries(reasons))
    for (const code of codes) assert.equal(unreachableReasonKey(code), key, String(code))
})

test("publishRefusalKey: the door's NOT_SITE_EDITOR (ADR 0028) and an older server's NOT_SITE_ADMIN say the same thing", () => {
  assert.equal(publishRefusalKey(403, 'NOT_SITE_EDITOR'), 'publish.adminOnly')
  assert.equal(publishRefusalKey(403, 'NOT_SITE_ADMIN'), 'publish.adminOnly')
  assert.equal(publishRefusalKey(403, 'SEAT_NOT_AUTHORIZED'), 'settings.url.noAccess')
  assert.equal(publishRefusalKey(403, 'SOMETHING_ELSE'), 'publish.unknown')
})

test('#1037 slice 2: the records a certificate asks for are read as many as were sent, each once, after the two Tracy names; the registration is read only as sent', () => {
  const domain = readOwnDomain({
    name: 'www.example.com',
    state: 'pending',
    hostname: { ready: false, reason: 'CERT_PENDING' },
    checks: [
      {
        record: 'validation',
        type: 'TXT',
        name: '_acme-challenge.www.example.com',
        expected: 'v1',
        status: 'unchecked',
        observed: []
      },
      {
        record: 'routing',
        type: 'CNAME',
        name: 'www.example.com',
        expected: 'connect.tracy.site',
        status: 'ok',
        observed: ['connect.tracy.site']
      },
      {
        record: 'validation',
        type: 'TXT',
        name: '_acme-challenge.www.example.com',
        expected: 'v1',
        status: 'unchecked',
        observed: []
      },
      {
        record: 'validation',
        type: 'TXT',
        name: '_acme-challenge.www.example.com',
        expected: 'v2',
        status: 'unchecked',
        observed: []
      },
      // A validation record without its value tells the customer nothing to add: not read.
      { record: 'validation', type: 'TXT', name: '_x.www.example.com', status: 'unchecked', observed: [] },
      {
        record: 'ownership',
        type: 'TXT',
        name: '_tracy.www.example.com',
        expected: 't',
        status: 'ok',
        observed: ['t']
      }
    ]
  })
  assert.deepEqual(
    domain.checks.map((c) => [c.record, c.expected]),
    [
      ['ownership', 't'],
      ['routing', 'connect.tracy.site'],
      ['validation', 'v1'],
      ['validation', 'v2']
    ]
  )
  assert.deepEqual(domain.hostname, { ready: false, reason: 'CERT_PENDING' })
  assert.equal(readOwnDomain({ name: 'a.example.com', hostname: { ready: 'yes' } }).hostname, undefined)
  assert.equal(readOwnDomain({ name: 'a.example.com', hostname: null }).hostname, undefined)
})
