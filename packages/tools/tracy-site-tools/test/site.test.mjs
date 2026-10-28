/**
 * The decisions of `tracy_site` that need no server: who a call acts as, which actions leave the lane,
 * what each refusal points at next, how pages and files are read. A refusal's `next` is product, so it
 * is held by the door it names, the facts it carries and its length bound, not by whole sentences.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { localePlan } from '../src/host/emdash.mjs'
import { LEGACY_BOUND_MESSAGE, LEGACY_STRUCTURE_CODE } from '../src/host/legacy-refusal.mjs'
import { normalizeCall } from '../src/host/normalize.mjs'
import {
  ACTION_ALIASES,
  applyRequest,
  budgetAnswer,
  CONTRACT_LANGUAGE_RULE,
  canonicalCall,
  canonicalTarget,
  decodeEntity,
  excerpt,
  findMatch,
  findRoots,
  hostResolverRule,
  imageSize,
  iniEntry,
  isCandidateImage,
  LOCAL_ACTIONS,
  layerOfFile,
  lookTarget,
  mediaRoots,
  PAGE_TEXT_DEFAULT_CHARS,
  pairingVerdict,
  pickViewer,
  planCall,
  publicOriginOf,
  publicTarget,
  RELAY_ACTIONS,
  rankMedia,
  readablePage,
  redirectStaysOnSite,
  refusalNext,
  relayRefusal,
  VIRTUAL_SITE_HOST,
  viewerFromHello,
  WRITE_VERBS,
  withNext,
  ENGINE_ONLY_ACTIONS
} from '../src/host/site.mjs'

/** A table row's name in a test title: its JSON, cut, whatever the row holds. */
const rowName = (row) => {
  try {
    return String(JSON.stringify(row)).slice(0, 80)
  } catch {
    return String(row).slice(0, 80)
  }
}

/** @param {string} name */
const fixtureOf = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

/** The generic sentences a SHAPE refusal must never get (the r2 default, and the unknown-code one). */
const DEFAULTS = [/answered no, and that is an answer/, /^Read the error: if it names a parameter/]
const ALL_ACTIONS = [...LOCAL_ACTIONS, ...RELAY_ACTIONS]
/** Every `tracy_site` action a sentence names. @param {string} text */
const actionsNamed = (text) =>
  ALL_ACTIONS.filter((a) => new RegExp(`(^|[^\\w.])${a.replace('.', '\\.')}(?![\\w.])`).test(text))

/**
 * Each sealed surface of r2's two PHP sites (no `db.*` on a sealed surface, no `media.upload`: a sealed
 * agent cannot produce a file's bytes). The consistency test holds the real `SURFACE_ACTIONS`; this
 * copy keeps the replay honest without importing a file another package owns.
 */
const SURFACES = {
  wordpress: [
    'info',
    'content.list',
    'content.get',
    'plugin.list',
    'theme.list',
    'content.update',
    'content.delete',
    'content.language',
    'language.install',
    'media.draw',
    'apply.list',
    'apply.revert',
    'page.text',
    'page.look',
    'media.scan'
  ],
  joomla: [
    'info',
    'content.list',
    'content.get',
    'extension.list',
    'content.contract',
    'media.draw',
    'apply.list',
    'apply.revert',
    'page.text',
    'page.look',
    'media.scan'
  ]
}

/**
 * Check `refusalNext(answer, facts)` against `has`/`hasNot` and a length bound; every next names no
 * `undefined` hole and (unless `generic`) none of the default sentences.
 */
function assertNext(answer, facts, { has = [], hasNot = [], max = 200, generic = false }, label) {
  const next = refusalNext(answer, facts)
  assert.equal(typeof next, 'string', label)
  for (const re of has) assert.match(next, re, `${label}: ${String(re)}`)
  for (const re of hasNot) assert.doesNotMatch(next, re, `${label}: ${String(re)}`)
  assert.doesNotMatch(next, /undefined/, label)
  assert.ok(next.length <= max, `${label}: ${next.length} chars`)
  if (!generic) for (const d of DEFAULTS) assert.doesNotMatch(next, d, label)
  return next
}

// ── who a call acts as ───────────────────────────────────────────────────────────────────────────────

test('viewerFromHello and pickViewer: the Worker restates session and origin, a local profile uses cookie and Host, a host dsh never borrows another session’s viewer', () => {
  assert.deepEqual(
    viewerFromHello(
      { 'x-tracy-session': 'abc', 'x-forwarded-host': 'cowork.tracy.ai', 'x-forwarded-proto': 'https' },
      { sessionId: 'session-9f1ebb44-31f1-46bf-b6b0-63bb5ae308c8' }
    ),
    {
      cookie: 'tracy_sess=abc',
      origin: 'https://cowork.tracy.ai',
      sessionId: 'session-9f1ebb44-31f1-46bf-b6b0-63bb5ae308c8'
    }
  )
  assert.deepEqual(viewerFromHello({ cookie: 'tracy_sess=x', host: '127.0.0.1:51710' }, {}), {
    cookie: 'tracy_sess=x',
    origin: 'http://127.0.0.1:51710',
    sessionId: null
  })
  assert.equal(viewerFromHello({}, {}), null)
  assert.equal(viewerFromHello({ cookie: 'a', host: 'h' }, { sessionId: '../etc' }).sessionId, null)
})

{
  const mine = { cookie: 'mine', origin: 'o', at: 1 }
  const latest = { cookie: 'latest', origin: 'o', at: 2 }
  const map = new Map([['session-1', mine]])
  const rows = [
    ['own session wins', [map, latest, 'session-1'], { viewer: mine, bound: true }],
    ['the latest is the fallback', [map, latest, 'session-2'], { viewer: latest, bound: false }],
    ['nobody is nobody', [new Map(), null, undefined], { viewer: null, bound: false }],
    ['host dsh: own session', [map, latest, 'session-1', false], { viewer: mine, bound: true }],
    [
      'host dsh: another session gets nobody',
      [map, latest, 'session-2', false],
      { viewer: null, bound: false }
    ],
    ['host dsh: no session gets nobody', [map, latest, undefined, false], { viewer: null, bound: false }]
  ]
  for (const [label, args, expected] of rows)
    test(`viewerFromHello and pickViewer: the Worker restates session and origin, a local profile uses cookie and Host, a host dsh never borrows another session’s viewer: ${label}`, () => {
      assert.deepEqual(pickViewer(...args), expected, label)
    })
}

test('relayRefusal: a 401 on the prompter route is a fleet secret, never somebody’s sign-in; everything else passes through', () => {
  const refused = { ok: false, httpStatus: 401, code: 'NOT_SIGNED_IN' }
  const seat = { ok: false, httpStatus: 403, code: 'SEAT_NOT_AUTHORIZED' }

  const mine = relayRefusal('prompter', refused, 'https://cowork.tracy.site')

  assert.deepEqual(relayRefusal('viewer', refused, 'https://cowork.tracy.site'), refused)
  assert.deepEqual([mine.code, mine.httpStatus], ['ACTOR_NOT_ACCEPTED', 401])
  assert.match(mine.error, /cowork\.tracy\.site/)
  assert.match(relayRefusal('prompter', refused).error, /^Tracy did not accept/)
  assert.deepEqual(relayRefusal('prompter', { ok: true, contract: 'x' }), { ok: true, contract: 'x' })
  assert.deepEqual(relayRefusal('prompter', seat), seat)
  assert.equal(relayRefusal('prompter', null), null)
  assertNext(
    { ok: false, code: 'ACTOR_NOT_ACCEPTED' },
    undefined,
    {
      has: [
        /Tracy's configuration, not the customer's session/,
        /do not reach the database or the CMS another way/
      ],
      hasNot: [/ask the customer to reload/],
      max: 400
    },
    'ACTOR_NOT_ACCEPTED'
  )
})

test('pairingVerdict: only the two statuses that mean something are read as meaning something', () => {
  assert.equal(pairingVerdict(200), 'paired')
  assert.equal(pairingVerdict(401), 'unpaired')
})

{
  for (const status of [0, 403, 404, 429, 500, 502, 503])
    test(`pairingVerdict: only the two statuses that mean something are read as meaning something: ${rowName(status)}`, () => {
      assert.equal(pairingVerdict(status), 'unknown', String(status))
    })
}

// ── planning a call ──────────────────────────────────────────────────────────────────────────────────

test('planCall: relay actions pass through, local ones are marked, the rest are refused with the surface’s list', () => {
  const plan = (action, params, local) => ({ ok: true, action, params, local, target: null, siteKey: null })
  const bad = planCall({ action: 'db.drop' })

  assert.deepEqual(
    planCall({ action: 'content.list', params: { kind: 'menuItem', limit: 50 } }),
    plan('content.list', { kind: 'menuItem', limit: 50 }, false)
  )
  assert.deepEqual(planCall({ action: 'media.scan' }), plan('media.scan', {}, true))
  assert.deepEqual(
    planCall({ action: 'page.look', params: { path: '/about' } }),
    plan('page.look', { path: '/about' }, true)
  )
  assert.deepEqual([bad.ok, bad.code], [false, 'BAD_ACTION'])
  assert.match(bad.error, /unknown action "db.drop"/)
  assert.ok(bad.actions.includes('content.list'))
  assert.equal(planCall({}).ok, false)
  assert.equal(planCall({ action: 'info', params: [1] }).params?.length, undefined, 'an array is not params')
})

{
  for (const a of ALL_ACTIONS)
    test(`planCall: relay actions pass through, local ones are marked, the rest are refused with the surface’s list: ${rowName(a)}`, () => {
      assert.equal(planCall({ action: a }).ok, !ENGINE_ONLY_ACTIONS.includes(a), a)
    })
}

{
  for (const gone of ['files.list', 'file.read', 'files.pack'])
    test(`planCall: relay actions pass through, local ones are marked, the rest are refused with the surface’s list: ${rowName(gone)}`, () => {
      assert.equal(RELAY_ACTIONS.includes(gone), false, gone)
      assert.equal(planCall({ action: gone }).ok, false, gone)
      assert.equal(applyRequest({ action: gone, siteKey: 'a.tracy.ai' }).ok, false, gone)
    })
}

{
  for (const local of ['page.text', 'content.find'])
    test(`planCall: relay actions pass through, local ones are marked, the rest are refused with the surface’s list: ${rowName(local)}`, () => {
      assert.ok(LOCAL_ACTIONS.includes(local) && !RELAY_ACTIONS.includes(local), local)
      assert.equal(planCall({ action: local, params: { path: '/' } }).local, true, local)
    })
}

test('planCall: target and siteKey are carried only when really given; aliases and stray keys move into params, never over them', () => {
  assert.equal(planCall({ action: 'info' }).target, null)
  assert.equal(
    planCall({ action: 'core.upgrade', target: ' https://fijitrips-example-5254d120.tracy.ai/ ' }).target,
    'https://fijitrips-example-5254d120.tracy.ai/'
  )
  assert.deepEqual(
    planCall({ action: 'db.snapshot', params: { tables: ['a'] }, target: 'https://x.tracy.ai/' }).params,
    { tables: ['a'] }
  )
  const other = planCall({
    action: 'theme.install',
    siteKey: 'coba.tracy.ai',
    params: { url: 'https://x/z.zip' }
  })
  assert.deepEqual([other.ok, other.siteKey, other.action], [true, 'coba.tracy.ai', 'theme.install'])

  const alias = planCall({ action: 'content_contract', params: {} })
  const inspect = planCall({ action: 'content.contract.inspect' })
  const hoist = planCall({
    action: 'content.get',
    kind: 'post',
    id: 42,
    params: { id: 7 },
    siteKey: 'a.tracy.test',
    target: 'x'
  })

  assert.deepEqual(
    [alias.ok && alias.action, alias.ok && alias.notes],
    ['content.contract', ['action content_contract → content.contract']]
  )
  assert.equal(inspect.ok && inspect.params.operation, 'inspect')
  assert.deepEqual(hoist.params, { id: 7, kind: 'post' }, 'params says id 7: the stray id does not win')
  assert.deepEqual(
    [hoist.notes, hoist.siteKey, hoist.target],
    [['kind moved into params'], 'a.tracy.test', 'x']
  )
  assert.equal('notes' in planCall({ action: 'info' }), false, 'a clean call keeps its exact shape')
})

{
  const empty = ['', '   ', 42]
  for (const target of empty)
    test(`planCall: target and siteKey are carried only when really given; aliases and stray keys move into params, never over them: ${rowName(target)}`, () => {
      assert.equal(planCall({ action: 'info', target }).target, null, JSON.stringify(target))
    })
}

{
  for (const siteKey of ['   ', 'a b', '../other', 42, 'UPPER.tracy.ai'])
    test(`planCall: target and siteKey are carried only when really given; aliases and stray keys move into params, never over them: ${rowName(siteKey)}`, () => {
      assert.equal(planCall({ action: 'info', siteKey }).siteKey, null, JSON.stringify(siteKey))
    })
}

test('planCall: every key beside action moves into params — none is dropped silently, so the closed-params check can refuse it', () => {
  // `query`, not `search`: since 30/09/2026 `search` is a key of content.list (the relay guards it).
  const stray = planCall({
    action: 'content.list',
    query: 'Hotline',
    slug: 'contact',
    params: { kind: 'post' }
  })
  const removes = planCall({
    action: 'content.update',
    removes: 'delete the banner',
    params: { kind: 'post', id: 42 }
  })
  const kept = planCall(
    JSON.parse('{"action":"info","siteKey":"a.tracy.test","target":"x","__proto__":{"polluted":1}}')
  )

  const n = /** @type {any} */ (normalizeCall(stray.action, stray.params, { platform: 'wordpress' }))

  assert.deepEqual(stray.params, { kind: 'post', query: 'Hotline', slug: 'contact' })
  assert.deepEqual(stray.notes, ['query moved into params', 'slug moved into params'])
  assert.deepEqual([n.kind, n.answer.code, n.answer.given], ['refuse', 'UNKNOWN_PARAM', ['query', 'slug']])
  assert.equal(removes.ok && removes.params.removes, 'delete the banner')
  assert.deepEqual(kept.params, {})
  assert.equal(/** @type {any} */ ({}).polluted, undefined)
})

test('applyRequest: the shape the apply door accepts; a local action, an unknown one or no site is refused', () => {
  const ok = applyRequest({
    action: 'theme.install',
    siteKey: 'coba.tracy.ai',
    params: { url: 'https://x/z.zip' }
  })
  const big = {
    action: 'content.update',
    siteKey: 's.tracy.ai',
    params: { fields: { post_content: 'x'.repeat(40_000) } }
  }

  assert.deepEqual(ok, {
    ok: true,
    action: 'theme.install',
    siteKey: 'coba.tracy.ai',
    params: { url: 'https://x/z.zip' },
    target: null
  })
  assert.ok(JSON.stringify(big).length > 4 * 1024, 'the body is bigger than the hello cap')
  assert.equal(applyRequest(big).ok, true)
})

{
  for (const refused of [
    { action: 'media.scan', siteKey: 'a.tracy.ai' },
    { action: 'page.look', siteKey: 'a.tracy.ai' },
    { action: 'nonsense', siteKey: 'a.tracy.ai' },
    { action: 'info' },
    { action: 'info', siteKey: 'A B' }
  ])
    test(`applyRequest: the shape the apply door accepts; a local action, an unknown one or no site is refused: ${rowName(refused)}`, () => {
      assert.equal(applyRequest(refused).ok, false, JSON.stringify(refused))
    })
}

test('canonicalCall: an alias is the contract with the operation its suffix carries; params, then beside action, then the suffix decide the operation', () => {
  assert.deepEqual(canonicalCall({ action: 'content_contract' }), { action: 'content.contract', params: {} })
  assert.deepEqual(canonicalCall({ action: 'contract' }), { action: 'content.contract', params: {} })
  assert.deepEqual(
    canonicalCall({ action: 'content.get', kind: 'post', id: 42 }).params,
    {},
    'only those two move'
  )
})

{
  for (const [asked, operation] of [
    ['contract.inspect', 'inspect'],
    ['content.contract.inspect', 'inspect'],
    ['contract.apply', 'apply'],
    ['content.contract.apply', 'apply']
  ])
    test(`canonicalCall: an alias is the contract with the operation its suffix carries; params, then beside action, then the suffix decide the operation: ${rowName(asked)}`, () => {
      assert.deepEqual(
        canonicalCall({ action: asked, params: { page: 'home' } }),
        { action: 'content.contract', params: { page: 'home', operation } },
        asked
      )
    })
}

{
  for (const asked of Object.keys(ACTION_ALIASES))
    test(`canonicalCall: an alias is the contract with the operation its suffix carries; params, then beside action, then the suffix decide the operation: ${rowName(asked)}`, () => {
      const [action, operation] = ACTION_ALIASES[asked]
      assert.ok(RELAY_ACTIONS.includes(action), `${asked} → ${action}`)
      assert.ok(operation === null || operation === 'inspect' || operation === 'apply', asked)
    })
}

{
  const rows = [
    [
      'params already says it',
      canonicalCall({ action: 'contract.apply', operation: 'inspect', params: { operation: 'apply' } }).params
        .operation,
      'apply'
    ],
    [
      'beside action beats the suffix',
      canonicalCall({ action: 'contract.apply', operation: 'inspect' }).params.operation,
      'inspect'
    ],
    [
      'null counts as absent',
      canonicalCall({ action: 'contract.apply', params: { operation: null } }).params.operation,
      'apply'
    ],
    ['dryRun is hoisted', canonicalCall({ action: 'content.replace', dryRun: true }).params.dryRun, true],
    [
      'dryRun never overrides params’ own',
      canonicalCall({ action: 'content.replace', dryRun: true, params: { dryRun: false } }).params.dryRun,
      false
    ]
  ]
  for (const [label, got, expected] of rows)
    test(`canonicalCall: an alias is the contract with the operation its suffix carries; params, then beside action, then the suffix decide the operation: ${label}`, () => {
      assert.equal(got, expected, label)
    })
}

test('canonicalCall: parsed or JSON text read the same; garbage is no action and never throws; the arguments are never changed', () => {
  const call = { action: 'contract.inspect', params: { page: 'home', slots: 'text' } }
  const params = { page: 'home' }
  const args = { action: 'contract.apply', operation: 'apply', params }

  const out = canonicalCall(args)

  assert.deepEqual(canonicalCall(JSON.stringify(call)), canonicalCall(call))
  assert.deepEqual(canonicalCall({ action: '  content.list  ', params: { kind: 'post' } }), {
    action: 'content.list',
    params: { kind: 'post' }
  })
  assert.equal(canonicalCall({ action: 'help' }).action, 'help')
  assert.deepEqual(canonicalCall({ action: 7, params: { a: 1 } }), { action: '', params: { a: 1 } })
  assert.deepEqual(canonicalCall({ action: 'info', params: [1] }).params, {})
  assert.deepEqual(canonicalCall({ action: 'info', params: '{"a":1}' }).params, {})
  assert.notEqual(out.params, params)
  assert.deepEqual(args, { action: 'contract.apply', operation: 'apply', params: { page: 'home' } })
  assert.ok(Object.isFrozen(ACTION_ALIASES) && Object.isFrozen(ACTION_ALIASES['contract.apply']))
})

{
  const none = { action: '', params: {} }
  for (const garbage of [
    undefined,
    null,
    0,
    42,
    true,
    '',
    'not json',
    '{"action":',
    '[1,2]',
    '"text"',
    [1, 2],
    {}
  ])
    test(`canonicalCall: parsed or JSON text read the same; garbage is no action and never throws; the arguments are never changed: ${rowName(garbage)}`, () => {
      assert.deepEqual(canonicalCall(garbage), none, JSON.stringify(garbage))
    })
}

{
  for (const own of ['constructor', 'toString'])
    test(`canonicalCall: parsed or JSON text read the same; garbage is no action and never throws; the arguments are never changed: ${rowName(own)}`, () => {
      assert.deepEqual(canonicalCall({ action: own }), { action: own, params: {} })
    })
}

{
  const invariants = [
    /the SAME call with id left out \(or 0\) CREATES one and answers \{created:true, id\}/,
    /adding, editing and translating are one verb/,
    /apply\.revert removes what an insert made/,
    /parent_id \/ move_after MOVE it/,
    /TRASHES: it writes that kind's own trash column/,
    /nothing is purged/
  ]

  test('the tool description’s write verbs say how a call creates, edits, moves, reverts and trashes', () => {
    for (const re of invariants) assert.match(WRITE_VERBS, re)
  })
  for (const action of ['content.update', 'content.delete', 'apply.revert'])
    test(`the tool description’s write verbs name add, edit, move and trash, and every action they name is one the door carries: ${rowName(action)}`, () => {
      assert.ok(WRITE_VERBS.includes(action), `${action} is not described`)
      assert.ok(ALL_ACTIONS.includes(action), `${action} is described but the door does not relay it`)
    })
}

test('CONTRACT_LANGUAGE_RULE is the one language sentence: one language per slot, a fact in every language, and neither of the two rules it replaced', () => {
  assert.match(CONTRACT_LANGUAGE_RULE, /Each slot is one language/)
  assert.match(
    CONTRACT_LANGUAGE_RULE,
    /a fact \(phone, e-mail, address, hours\) in every language the inspect lists/
  )
  assert.doesNotMatch(CONTRACT_LANGUAGE_RULE, /source slots only|language job/)
})

// ── where a call may look ────────────────────────────────────────────────────────────────────────────

{
  const ok = (path, url, origin) => ({ ok: true, path, url, origin, container: 'demo9090-web-1' })
  const good = [
    [[undefined], ok('/', 'http://127.0.0.1/', 'http://127.0.0.1')],
    [[''], ok('/', 'http://127.0.0.1/', 'http://127.0.0.1')],
    [
      ['/about-us?lang=vi#team'],
      ok('/about-us?lang=vi#team', 'http://127.0.0.1/about-us?lang=vi#team', 'http://127.0.0.1')
    ],
    [['/', 4321], ok('/', 'http://127.0.0.1:4321/', 'http://127.0.0.1:4321')]
  ]
  for (const [args, expected] of good)
    test(`lookTarget: only a path on this site’s own web container, never a host: ${rowName(args)}`, () => {
      assert.deepEqual(lookTarget('demo9090', ...args), expected, JSON.stringify(args))
    })
}

{
  for (const bad of ['//evil.example/', 'about', 'http://evil.example/', '/a b', '/tab\there', 42, {}])
    test(`lookTarget: only a path on this site’s own web container, never a host: ${rowName(bad)}`, () => {
      const refused = lookTarget('demo9090', bad)
      assert.equal(refused.ok, false, JSON.stringify(bad))
      assert.match(refused.error, /path must be a path on this site/)
    })
}

{
  for (const label of [null, '', '../other', 'Demo', 'a/b'])
    test(`lookTarget: only a path on this site’s own web container, never a host: ${label}`, () => {
      assert.equal(lookTarget(label, '/').ok, false, String(label))
    })
}

{
  const site = 'http://demowp-web-1/'
  const same = (authority) => ({ same: true, authority })
  const away = { same: false, authority: null }
  const rows = [
    [site, 'http://demowp-web-1:51710/', same('demowp-web-1:51710')],
    ['http://demowp-web-1/a', 'http://demowp-web-1/b', same(null)],
    ['http://demowp-web-1/a', '/b/', same(null)],
    ...[
      'http://evil.example/',
      'http://evil.example:51710/',
      'https://demowp.tracy.test:51710/',
      '//evil.example/'
    ].map((location) => [site, location, away]),
    ...['', '   ', 'http://', null, undefined, 42].map((location) => [site, location, away]),
    [site, 'https://demowp-web-1/', away],
    [site, 'https://demowp-web-1:51710/', away]
  ]
  for (const [from, location, expected] of rows)
    test(`redirectStaysOnSite: a port-only redirect is still this site; another name, a scheme change or no Location is not: ${rowName(from)}`, () => {
      assert.deepEqual(redirectStaysOnSite(from, location), expected, JSON.stringify(location))
    })
}

test('publicOriginOf and publicTarget: the label under the host’s site domain, and only a redirect to exactly that origin', () => {
  const from = 'http://127.0.0.1/'
  const origin = 'https://demo1.tracy.site'
  assert.deepEqual(publicTarget('demo1', '/about', 80, origin, from, 'https://demo1.tracy.site/about'), {
    ok: true,
    path: '/about',
    url: 'https://demo1.tracy.site/about',
    origin,
    container: 'demo1-web-1',
    via: '127.0.0.1:80',
    resolverRule: '--host-resolver-rules=MAP demo1.tracy.site ~NOTFOUND'
  })
  assert.equal(
    publicTarget('shop1', '/', 4321, 'https://shop1.tracy.site', from, 'https://shop1.tracy.site/').via,
    '127.0.0.1:4321',
    'the connect side is this site’s own port'
  )
  assert.equal(publicTarget('demo1', '/', 80, null, from, 'https://demo1.tracy.site/').ok, false)
  assert.equal(publicTarget('../x', '/', 80, origin, from, 'https://demo1.tracy.site/').ok, false)
})

{
  const origins = [
    ['demo1', 'tracy.site', 'https://demo1.tracy.site'],
    ['qc-hano-wp-0923-01', 'tracy.site', 'https://qc-hano-wp-0923-01.tracy.site'],
    ['demo1', ' tracy.ai ', 'https://demo1.tracy.ai'],
    ['demo1', undefined, null],
    ['demo1', '', null],
    ...['https://tracy.site', 'tracy.site/x', 'Tracy.Site', 'tracy.site:443', '.tracy.site', 'a..b', 42].map(
      (domain) => ['demo1', domain, null]
    ),
    ...['../x', 'Demo1', '', 'a.b', null].map((label) => [label, 'tracy.site', null])
  ]
  for (const [label, domain, expected] of origins)
    test(`publicOriginOf and publicTarget: the label under the host’s site domain, and only a redirect to exactly that origin: ${label}`, () => {
      assert.equal(publicOriginOf(label, domain), expected, `${String(label)} ${String(domain)}`)
    })
}

{
  const from = 'http://127.0.0.1/'
  const origin = 'https://demo1.tracy.site'
  for (const location of [
    'https://other.tracy.site/',
    'https://demo1.tracy.site:8443/',
    'http://demo1.tracy.site/',
    'https://demo1.tracy.site.evil.example/',
    ''
  ])
    test(`publicOriginOf and publicTarget: the label under the host’s site domain, and only a redirect to exactly that origin: ${rowName(location)}`, () => {
      assert.equal(publicTarget('demo1', '/', 80, origin, from, location).ok, false, location)
    })
}

test('canonicalTarget and hostResolverRule: the virtual host at the canonical port, routed onto the loopback service, never a bad label or port', () => {
  const emdash = canonicalTarget('shop', '/', 4321, 8443)
  const p80 = canonicalTarget('demowp', '/', 80, 80)

  assert.deepEqual(canonicalTarget('demowp', '/about', 80, 51710), {
    ok: true,
    path: '/about',
    url: `http://${VIRTUAL_SITE_HOST}:51710/about`,
    origin: `http://${VIRTUAL_SITE_HOST}:51710`,
    container: 'demowp-web-1',
    authority: `${VIRTUAL_SITE_HOST}:51710`,
    connect: '127.0.0.1:80',
    resolverRule: `--host-resolver-rules=MAP ${VIRTUAL_SITE_HOST}:51710 127.0.0.1:80`
  })
  assert.deepEqual(
    [emdash.connect, emdash.resolverRule],
    ['127.0.0.1:4321', `--host-resolver-rules=MAP ${VIRTUAL_SITE_HOST}:8443 127.0.0.1:4321`]
  )
  assert.equal(
    p80.origin,
    `http://${VIRTUAL_SITE_HOST}`,
    'URL.origin drops a default port, so must the origin'
  )
  assert.equal(p80.url, `http://${VIRTUAL_SITE_HOST}:80/`)
  assert.equal(new URL(p80.url).origin, p80.origin)
  assert.match(VIRTUAL_SITE_HOST, /\.invalid$/, 'without the rule it resolves to nothing')
  assert.equal(canonicalTarget('../evil', '/', 80, 51710).ok, false)
  assert.equal(
    hostResolverRule('demowp-web-1:51710', 'demowp-web-1:80'),
    '--host-resolver-rules=MAP demowp-web-1:51710 demowp-web-1:80'
  )
  assert.equal(
    hostResolverRule('shop-web-1:51710', 'shop-web-1:4321'),
    '--host-resolver-rules=MAP shop-web-1:51710 shop-web-1:4321'
  )
})

{
  for (const bad of [0, -1, 70000, 1.5, Number.NaN, '51710'])
    test(`canonicalTarget and hostResolverRule: the virtual host at the canonical port, routed onto the loopback service, never a bad label or port: ${rowName(bad)}`, () => {
      assert.equal(canonicalTarget('demowp', '/', 80, bad).ok, false, JSON.stringify(bad))
    })
}

// ── media ────────────────────────────────────────────────────────────────────────────────────────────

test('media: roots per platform, candidate images, ranking and image headers', () => {
  const png = new Uint8Array(24)
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  png.set([0, 0, 0x06, 0x40], 16)
  png.set([0, 0, 0x03, 0xe8], 20)
  const jpg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00,
    0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03
  ])
  const webp = new Uint8Array(30)
  webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20])
  webp.set([0x9f, 0x01, 0x2c, 0x01], 26)
  const rows = [
    { path: 'a', bytes: 10 },
    { path: 'b', bytes: 30 },
    { path: 'c', bytes: 20 }
  ]

  assert.deepEqual(
    [mediaRoots('joomla'), mediaRoots('wordpress'), mediaRoots('emdash')],
    [['images'], ['wp-content/uploads'], ['uploads']]
  )
  assert.ok(mediaRoots('unknown').includes('uploads'), 'the fallback covers EmDash too')
  assert.deepEqual(
    rankMedia(rows, 2).map((r) => r.path),
    ['b', 'c']
  )
  assert.deepEqual([rankMedia(rows, 0).length, rankMedia(rows, 500).length], [1, 3])
  assert.deepEqual(imageSize(png), { width: 1600, height: 1000 })
  assert.deepEqual(imageSize(jpg), { width: 640, height: 480 })
  assert.deepEqual(imageSize(webp), { width: 415, height: 300 })
  assert.equal(imageSize(new Uint8Array([1, 2, 3])), null)
})

{
  const images = [
    ['images/hero.jpg', true],
    ['images/hero-150x150.jpg', false],
    ['images/cache/hero.jpg', false],
    ['images/logo_thumb.png', false],
    ['images/readme.txt', false]
  ]
  for (const [file, expected] of images)
    test(`media: roots per platform, candidate images, ranking and image headers: ${rowName(file)}`, () => {
      assert.equal(isCandidateImage(file), expected, file)
    })
}

// ── reading a page and looking for a phrase ──────────────────────────────────────────────────────────

test('readablePage: language, title and words from one page; scripts, styles and comments are no prose; nothing declared is null', () => {
  const full = readablePage(
    '<!doctype html><html lang="vi-VN"><head><title>Trang ch&#7911;</title><style>.a{color:red}</style></head><body><h1>Xin ch&agrave;o</h1><script>var x = "not prose"</script><p>M&#7897;t&nbsp;hai</p></body></html>'
  )
  assert.deepEqual([full.lang, full.title, full.text], ['vi-VN', 'Trang chủ', 'Xin chào\nMột hai'])
  assert.deepEqual(readablePage('<html><body><p>words</p></body></html>'), {
    lang: null,
    title: null,
    text: 'words'
  })
  const t0 = Date.now()
  readablePage(`<p>x</p>${'<a"'.repeat(40_000)}`)
  assert.ok(Date.now() - t0 < 2000, 'unclosed tags stay linear')
})

{
  const rows = [
    ['names with digits decode', '<p>12 m&sup2; &frac12; &there4;</p>', '12 m² ½ ∴'],
    [
      'script and style are never prose',
      '<body><script>alert("hi")</script><style>p{}</style><p>only this</p></body>',
      'only this'
    ],
    [
      'a block boundary is a line break, an inline tag is not',
      '<p>one</p><p>two <b>and</b> three</p>',
      'one\ntwo and three'
    ],
    ['an unknown entity is left as written', '<p>a &fake; b</p>', 'a &fake; b'],
    ['comments carry no words', '<p>kept</p><!-- <p>hidden</p> -->', 'kept']
  ]
  for (const [label, html, text] of rows)
    test(`readablePage: language, title and words from one page; scripts, styles and comments are no prose; nothing declared is null: ${label}`, () => {
      assert.equal(readablePage(html).text, text, label)
    })
}

{
  for (const bad of [undefined, null, 0, {}, []])
    test(`readablePage: language, title and words from one page; scripts, styles and comments are no prose; nothing declared is null: ${rowName(bad)}`, () => {
      assert.deepEqual(
        readablePage(bad),
        { lang: null, title: null, text: '' },
        'anything that is not a string is an empty page'
      )
    })
}

{
  const rows = [
    ['amp', '&'],
    ['#x26', '&'],
    ['#38', '&'],
    ['Agrave', 'À'],
    ['agrave', 'à'],
    ['fake', null]
  ]
  for (const [name, expected] of rows)
    test(`decodeEntity: one entity table for the page reader and the replace job: ${rowName(name)}`, () => {
      assert.equal(decodeEntity(name), expected, name)
    })
}

test('findRoots: where each platform keeps the files a find may open; EmDash has none', () => {
  assert.deepEqual(findRoots('emdash'), [])
  assert.ok(
    findRoots('joomla').includes('language') && findRoots('wordpress').includes('wp-content/languages')
  )
})

{
  const rows = [
    [
      'joomla',
      'language/en-GB/com_users.ini',
      'PHRASES',
      [/language\/overrides\/<tag>\.override\.ini/, /never edit this shipped file/]
    ],
    [
      'joomla',
      'administrator/language/en-GB/com_users.ini',
      'PHRASES',
      [/administrator\/language\/overrides\//]
    ],
    ['joomla', 'language/overrides/en-GB.override.ini', 'PHRASES', [/edit the same line/]],
    ['joomla', 'templates/cassiopeia/html/mod_login/default.php', 'PRESENTATION', []],
    ['joomla', 'modules/mod_login/tmpl/default.php', 'PHRASES', [/do not edit this file/]],
    ['wordpress', 'wp-content/languages/themes/tracy-vi.po', 'PHRASES', []],
    [
      'wordpress',
      'wp-content/themes/tracy/header.php',
      'PRESENTATION',
      [/the theme this site runs \(its child theme's first, when one runs\)/]
    ],
    ['joomla', 'templates/cassiopeia/index.php', undefined, []],
    ['emdash', 'data/data.db', undefined, []],
    ['unknown', 'language/en-GB/joomla.ini', undefined, []]
  ]
  for (const [platform, file, layer, doors] of rows)
    test(`layerOfFile: which layer a file found belongs to, and the door that changes it: ${rowName(platform)}`, () => {
      const where = layerOfFile(platform, file)

      assert.equal(where?.layer, layer, `${platform} ${file}`)
      for (const re of doors) assert.match(where?.door ?? '', re, `${platform} ${file}`)
    })
}

test('iniEntry and findMatch: a KEY="value" line splits; a hit is the value (or the whole line outside a language file), case-blind, cut when long', () => {
  assert.deepEqual(iniEntry('COM_USERS_LOGIN="Log in"'), { key: 'COM_USERS_LOGIN', value: 'Log in' })
  assert.deepEqual(iniEntry('  JGLOBAL_PASSWORD = "Mật khẩu"  '), {
    key: 'JGLOBAL_PASSWORD',
    value: 'Mật khẩu'
  })
  assert.equal(iniEntry('; a comment'), null)
  assert.equal(iniEntry('<?php echo Text::_("X"); ?>'), null)
  const long = findMatch(`<?php $x = "${'a'.repeat(400)}needle"; ?>`, 'needle')
  assert.ok(findMatch('JLOGIN="Log In"', 'log in') && findMatch('JLOGIN="Log In"', 'LOG IN'), 'case-blind')
  assert.equal(long.text.length, 200, 'one minified file cannot fill the answer')
})

{
  const rows = [
    [
      'a key that contains the word is not a hit',
      findMatch('COM_USERS_LOGIN_HOME="Trang chủ"', 'home'),
      null
    ],
    [
      'its value is',
      findMatch('MOD_BREADCRUMBS_HOME="Home"', 'home'),
      { key: 'MOD_BREADCRUMBS_HOME', value: 'Home' }
    ],
    [
      'outside a language file the line is the evidence',
      findMatch("  <?php echo Text::_('JGLOBAL_PASSWORD'); // Password ?>", 'password'),
      { text: "<?php echo Text::_('JGLOBAL_PASSWORD'); // Password ?>" }
    ],
    ['a line without the phrase', findMatch('JGLOBAL_USERNAME="Tên đăng nhập"', 'password'), null],
    ['an empty line', findMatch('', 'anything'), null]
  ]
  for (const [label, got, expected] of rows)
    test(`iniEntry and findMatch: a KEY="value" line splits; a hit is the value (or the whole line outside a language file), case-blind, cut when long: ${label}`, () => {
      assert.deepEqual(got, expected, label)
    })
}

test('excerpt: a small default cap, the matching lines with neighbours, gaps shown, an empty passage for no match, never a throw', () => {
  const five = ['one', 'two', 'three', 'NEEDLE here', 'five', 'six', 'seven'].join('\n')
  const distant = ['a', 'HIT one', 'b', 'c', 'd', 'e', 'f', 'HIT two', 'g'].join('\n')
  const capped = excerpt('x'.repeat(5000), null, undefined)
  const match = excerpt(five, 'needle', undefined)
  const two = excerpt(distant, 'hit', undefined)

  assert.equal(PAGE_TEXT_DEFAULT_CHARS, 2000)
  assert.deepEqual([capped.text.length, capped.truncated, capped.chars], [2000, true, 5000])
  assert.deepEqual(
    [match.matched, match.text, match.truncated],
    [1, 'two\nthree\nNEEDLE here\nfive\nsix', false]
  )
  assert.equal(two.matched, 2)
  assert.ok(two.text.includes('…') && !two.text.includes('c\nd\ne'), 'a gap is shown, never joined')
  assert.deepEqual(
    [excerpt('one\ntwo', 'nowhere', undefined).matched, excerpt('one\ntwo', 'nowhere', undefined).text],
    [0, '']
  )
  assert.deepEqual(
    [
      excerpt('The Home Page', 'home', undefined).matched,
      excerpt('The Home Page', '   ', undefined).matched,
      excerpt('The Home Page', '', undefined).matched
    ],
    [1, null, null]
  )
})

{
  const page = 'y'.repeat(5000)
  const caps = [
    [4000, 4000],
    [0, 2000],
    [-5, 2000],
    [1.5, 2000]
  ]
  for (const [asked, got] of caps)
    test(`excerpt: a small default cap, the matching lines with neighbours, gaps shown, an empty passage for no match, never a throw: ${rowName(asked)}`, () => {
      assert.equal(excerpt(page, null, asked).text.length, got, String(asked))
    })
}

{
  for (const bad of [undefined, null, 0, {}, []])
    test(`excerpt: a small default cap, the matching lines with neighbours, gaps shown, an empty passage for no match, never a throw: ${rowName(bad)}`, () => {
      assert.equal(excerpt(bad, null, undefined).text, '')
    })
}

// ── what a refusal points at next ────────────────────────────────────────────────────────────────────

test('refusalNext: each door code names the next step — the customer, the call, or a repair — and never a way round', () => {
  assert.match(refusalNext({ code: 'AGENT_DEMO_PLAN_REQUIRED' }), /tracy_demo.*plan.save/)
  assert.match(refusalNext({ code: 'AGENT_DEMO_NOT_GRANTED' }), /assigned.*Retry.*do not write/)
  const signedIn = refusalNext({ ok: false, code: 'NOT_SIGNED_IN' })
  assert.equal(
    refusalNext({ ok: false, code: 'NO_VIEWER' }),
    signedIn,
    'one sentence: the same problem with the same fix'
  )
})

{
  const rows = [
    ...['KEY_INVALID', 'KEY_REVOKED', 'KEY_EXPIRED', 'API_KEYS_NOT_CONFIGURED', 'RATE_LIMITED'].map(
      (code) => ({ answer: { code }, has: [/do not (reach the site another way|retry in a loop)/i] })
    ),
    { answer: { code: 'KEY_REVOKED' }, has: [/never comes back/] },
    { answer: { code: 'RATE_LIMITED' }, has: [/Retry-After/] },
    {
      answer: { code: 'SCOPE_OUTSIDE_ROLE', role: 'editor', toolsets: ['code', 'site'] },
      has: [/does not grant code, site/]
    },
    { answer: { code: 'SCOPE_OUTSIDE_ROLE' }, has: [/some of those toolsets/] },
    {
      answer: { httpStatus: 409, code: 'COMPONENT_NOT_REGISTERED' },
      has: [/content door is not connected/, /\.webroot\//]
    },
    {
      answer: { code: 'TOOLSET_NOT_GRANTED', toolset: 'code', role: 'writer' },
      has: [/needs a role with the code toolset; do not work around it/]
    },
    { answer: { code: 'TOOLSET_NOT_GRANTED' }, has: [/required toolset; do not work around it/] },
    {
      // A Viewer (ADR 0028): view and ask, the request under the chat box, never the CMS admin.
      answer: { code: 'TOOLSET_NOT_GRANTED', toolset: 'content', role: 'viewer' },
      has: [
        /is a Viewer/,
        /changes need edit access/,
        /"Ask for edit access" below the chat box/,
        /Do not suggest the CMS admin/
      ],
      hasNot: [/toolset/, /Menu/]
    },
    {
      answer: {
        code: 'CONTRACT_SLOT_NOT_CONTENT',
        toolset: 'code',
        role: 'editor',
        slots: ['module-430.layout']
      },
      has: [/module-430\.layout is not one of those slots/, /Apply again without it/, /code toolset/]
    },
    { answer: { code: 'CONTRACT_SLOT_NOT_CONTENT' }, has: [/slot/i] },
    {
      answer: {
        code: 'SITE_OUTSIDE_CONVERSATION',
        siteKey: 'ban-xe-noi-that.tracy.test',
        conversationSite: 'site-4x82yk'
      },
      has: [
        /site-4x82yk/,
        /ban-xe-noi-that\.tracy\.test is its own workspace/,
        /open its workspace/,
        /no other way in/
      ]
    },
    { answer: { code: 'SITE_OUTSIDE_CONVERSATION' }, has: [/own workspace/] },
    {
      answer: { code: 'COMPONENT_NOT_ON_FLEET_COPY' },
      has: [/hosted copy/, /could not be verified/, /Retry once in a moment/]
    },
    // 30/09: a cold copy is a retry, never the end of the request; a wrong one names the repair.
    {
      answer: { code: 'COMPONENT_NOT_ON_FLEET_COPY', copyReason: 'timeout', transient: true },
      has: [/still warming up/, /Retry the same call in a moment/, /live site was not touched/]
    },
    {
      answer: { code: 'COMPONENT_NOT_ON_FLEET_COPY', copyReason: 'unreachable', transient: true },
      has: [/still warming up/, /Retry the same call/]
    },
    // 28/10: a copy silent for a day is not warming up — no retry, the customer is told it needs checking.
    {
      answer: { code: 'COMPONENT_NOT_ON_FLEET_COPY', copyReason: 'timeout', transient: false },
      has: [/has not answered for a long while/, /Do not retry/, /needs checking/, /do not write another way/]
    },
    {
      answer: { code: 'COMPONENT_NOT_ON_FLEET_COPY', copyReason: 'unauthorized', transient: false },
      has: [/does not accept the token/, /pairing again/, /do not write another way/]
    },
    {
      answer: { code: 'COMPONENT_NOT_ON_FLEET_COPY', copyReason: 'platform_mismatch', transient: false },
      has: [/different CMS/, /import needs checking/]
    },
    {
      answer: { code: 'COWORK_WEB_UNREACHABLE', error: 'fetch failed' },
      has: [/retry once, then tell the customer/]
    },
    {
      answer: { code: 'NOT_SIGNED_IN' },
      has: [
        /ask the customer to reload this site's page/,
        /make the same call once more/,
        /[Dd]o not reach the database or the CMS another way/
      ]
    },
    { answer: { code: 'NO_VIEWER' }, has: [/[Dd]o not reach the database or the CMS another way/] },
    {
      answer: { code: 'COMPONENT_UNAUTHORIZED' },
      has: [/[Dd]o not reach the database or the CMS another way/]
    },
    { answer: { code: 'SEAT_NOT_AUTHORIZED' }, has: [/do not work around it/] },
    { answer: { code: 'NOT_SITE_OWNER' }, has: [/do not work around it/] },
    { answer: { code: 'INVALID_REQUEST' }, has: [/call once more/] },
    { answer: { code: 'ACTION_NOT_ALLOWED' }, has: [/Use one this tool lists/] },
    { answer: { code: 'APPLY_TARGET_NOT_ALLOWED' }, has: [/Drop `target` and call again/] },
    { answer: { code: 'COMPONENT_UNREACHABLE' }, has: [/Retry once/] },
    {
      answer: { code: 'COMPONENT_BAD_RESPONSE' },
      has: [/nothing is known to have happened\. Read the site before retrying/]
    },
    { answer: { code: 'CONVERSATION_SITE_UNKNOWN' }, has: [/do not act on any other site/] },
    {
      answer: { code: 'A_CODE_NOBODY_HAS_WRITTEN_YET' },
      has: [/Read the error: if it names a parameter, fix it/, /Do not reach the site another way/],
      generic: true
    },
    {
      answer: { error: 'refused', message: 'no' },
      has: [/This site answered no, and that is an answer/],
      generic: true
    },
    { answer: { error: 'fetch failed' }, has: [/^Read the error/], generic: true }
  ]
  for (const { answer, has, hasNot, generic } of rows)
    test(`refusalNext: each door code names the next step — the customer, the call, or a repair — and never a way round: ${rowName(answer)}`, () => {
      assertNext(
        { ok: false, ...answer },
        undefined,
        { has, hasNot, generic, max: 400 },
        JSON.stringify(answer)
      )
    })
}

{
  const notRefusals = [
    { ok: true, code: 'COMPONENT_NOT_REGISTERED' },
    { code: 'COMPONENT_NOT_REGISTERED' },
    null,
    'COMPONENT_NOT_REGISTERED'
  ]
  for (const answer of notRefusals)
    test(`refusalNext: each door code names the next step — the customer, the call, or a repair — and never a way round: ${rowName(answer)}`, () => {
      assert.equal(refusalNext(answer), null, JSON.stringify(answer))
    })
}

test('refusalNext: a shape refusal of the component (code on `error`) gets its own next by class, never a default', () => {
  const style = { message: 'style required, e.g. airbnb' }
  assert.equal(
    refusalNext({ ok: false, code: 'bad_params', ...style }),
    refusalNext({ ok: false, error: 'bad_params', ...style })
  )
  assertNext(
    { ok: false, code: 'bad_params', ...style },
    undefined,
    {
      has: [
        /correct the call/i,
        /not reach the database or the CMS another way/i,
        /not repeat the identical call/i
      ],
      hasNot: [/answered no/]
    },
    'bad_params sends the agent back to the call'
  )
  assertNext(
    { ok: false, code: 'SITE_BUSY', error: 'Another conversation…' },
    undefined,
    { has: [/Another conversation is changing/], max: 400 },
    'a door code wins over error'
  )
})

{
  const rows = [
    [
      'bad_params',
      'kind must be one of: post, postmeta, option, templatePart, term, menuItem',
      /kind "post"/
    ],
    ['bad_action', 'unknown action: content.contract', /page\.text/],
    [
      'write_failed',
      'no writable field for kind post; given content; allowed post_title, post_content',
      /post_content/
    ],
    // Local stand 24/10/2026: a post's featured image asked as a post field, five times.
    [
      'write_failed',
      'no writable field for kind post; given featured_image_id; allowed post_title, post_content',
      /kind:"postmeta"[\s\S]*_thumbnail_id/
    ],
    ['not_found', 'no post at id 0, key "contact-vi"', /content\.list/]
  ]
  for (const [error, message, want] of rows)
    test(`refusalNext: a shape refusal of the component (code on \`error\`) gets its own next by class, never a default: ${rowName(error)}`, () => {
      assertNext({ ok: false, error, message }, { platform: 'wordpress' }, { has: [want] }, error)
    })
}

test('refusalNext: a refused apply.revert keeps the plugin’s own next, else names the newer change or the person — never a retry', () => {
  // The Claude Cowork plugin for WordPress 0.14.7 (claude-cowork#71) refuses an out-of-order revert
  // with its own way on; that sentence is the one the model gets, on both roads.
  const own =
    'apply.revert {apply_id:"a-2"} first, newest first, then this one; or tell the customer this change can no longer be undone by itself.'
  const wp = {
    ok: false,
    error: 'conflict',
    message: 'Later content exists; revert the latest change first: apply a-2 changed post 12 after this one',
    code: 'CONFLICT',
    errors: [{ code: 'CONFLICT', severity: 'recoverable', message: 'Later content exists' }],
    next: own
  }
  assert.equal(refusalNext(wp, { platform: 'wordpress', action: 'apply.revert' }), own)
  assert.equal(refusalNext(wp, 'wordpress'), own)
  assert.equal(/** @type {any} */ (withNext(wp, 'wordpress')).next, own)

  const mediaConflictNext = 'The attachment is now used; tell the customer the picture was not restored.'
  const mediaConflict = {
    ok: false,
    error: 'conflict',
    code: 'id_taken',
    message: 'Attachment id 42 is now in use',
    next: mediaConflictNext
  }
  assert.equal(
    refusalNext(mediaConflict, { platform: 'wordpress', action: 'apply.revert' }),
    mediaConflictNext
  )

  // Without one (the Joomla component; a WordPress plugin before 0.14.7): the revert sentence, found by
  // the action asked or by the component's own revert message.
  const revertNext =
    'This change cannot be undone alone: revert the newer change first (apply.list shows it), or tell the person the words were changed since. Never repeat this revert.'
  const retry = /read it again|make the call once|once more|same apply/i
  const refusals = [
    [
      {
        ok: false,
        error: 'conflict',
        message: 'Later content exists; revert the latest revision first',
        errors: [{ code: 'CONFLICT', message: 'Later content exists; revert the latest revision first' }]
      },
      { platform: 'joomla' }
    ],
    [
      {
        ok: false,
        error: 'conflict',
        message:
          'The words this change wrote in post 12 (post_content) were changed since; nothing was reverted',
        code: 'CONFLICT',
        errors: [{ code: 'CONFLICT', severity: 'recoverable' }]
      },
      'wordpress'
    ],
    [
      { ok: false, error: 'conflict', message: 'x' },
      { platform: 'wordpress', action: 'apply.revert' }
    ],
    [
      { ok: false, code: 'CONFLICT', errors: [{ code: 'CONFLICT' }] },
      { platform: 'joomla', action: 'apply.revert' }
    ]
  ]
  for (const [answer, facts] of refusals) {
    const next = refusalNext(answer, /** @type {any} */ (facts)) ?? ''
    assert.equal(next, revertNext, JSON.stringify(answer))
    assert.doesNotMatch(next, retry, JSON.stringify(answer))
  }

  // A conflict that is not a revert keeps its own sentences.
  assert.match(
    refusalNext({ ok: false, error: 'conflict', message: 'x' }, { platform: 'joomla' }) ?? '',
    /read it again/
  )
  assert.match(
    refusalNext(
      { ok: false, errors: [{ code: 'CONFLICT', severity: 'recoverable' }] },
      { platform: 'joomla', sealed: true, action: 'content.contract' }
    ) ?? '',
    /few seconds.*once more/
  )
})

{
  for (const error of [
    'bad_params',
    'bad_action',
    'write_failed',
    'not_found',
    'contract_failed',
    'batch_failed',
    'revert_failed',
    'writer_busy',
    LEGACY_STRUCTURE_CODE,
    'conflict',
    'read_failed',
    'dump_failed',
    'list_failed',
    'unavailable',
    'unsupported',
    'contract_unavailable',
    'contract_unbound',
    'unauthorized'
  ])
    test(`refusalNext: a shape refusal of the component (code on \`error\`) gets its own next by class, never a default: ${rowName(error)}`, () => {
      const next = refusalNext({ ok: false, error, message: 'x' }, { platform: 'joomla' }) ?? ''
      assert.ok(next.length > 0, error)
      for (const d of DEFAULTS) assert.doesNotMatch(next, d, error)
    })
}

{
  const lock = { ok: false, error: 'writer_busy', message: 'another writer is changing this site' }
  const rows = [
    [
      { ...lock, retried: 3 },
      /nothing from this call was written\. Tell the customer and offer to try again/
    ],
    [lock, /Nothing was written: the site was busy\. Make the same call once more/],
    [{ ok: false, error: 'writer_busy', message: 'Deadlock found' }, /may have been written/]
  ]
  for (const [answer, want] of rows)
    test(`refusalNext: writer_busy — only the lock miss says nothing was written; any other message may have written: ${rowName(answer)}`, () => {
      assertNext(answer, undefined, { has: [want] }, JSON.stringify(answer))
    })
}

{
  const cases = [
    ['Unknown contract operation', /operation "inspect"/],
    ['apply_id required; it must start with "contract-"', /Leave apply_id and request_id out/],
    ['apply_id must start with "contract-", got "x"', /Leave apply_id and request_id out/],
    ['request_id required: any string, the same on a retry and new for a different change', /Leave apply_id/],
    ['request_id reused with different content', /Leave apply_id/],
    ['Use one new apply_id per content revision', /Leave apply_id/],
    ['Content changed; inspect again', /inspect.*again.*revision/],
    ['Expected 1–1500 scalar content changes', /1 to 1,500/],
    ['Unknown content slot or non-string value', /Slot keys come from the inspect/],
    ['Content cannot remove an occupied slot: module-441.6', /^module-441\.6 must keep words/],
    [
      'Content cannot activate an empty slot: module-441.9',
      /^module-441\.9 is empty in this quickstart's design/
    ],
    ['Markup and control characters are not content: module-441.1', /Plain text only in module-441\.1/],
    ['Joomla plugin directives are not content: module-441.1', /No \{…\} directives/],
    ['Content too long: module-435.0', /^module-435\.0 holds only so many characters/],
    ['Unsupported CTA URL: module-428.0', /tel:\+digits/],
    ['Image aspect ratio does not match its slot', /media\.draw/],
    ['Split the revision into at most 300 entities', /two applies/],
    ['Syntax error', /apply\.revert \{apply_id\}/]
  ]
  for (const [message, want] of cases)
    test(`refusalNext: contract_failed is answered by its message, one short line each: ${rowName(message)}`, () => {
      assertNext(
        { ok: false, error: 'contract_failed', message },
        { platform: 'joomla', action: 'content.contract' },
        { has: [want] },
        message
      )
    })
}

test('refusalNext: every host code this package raises has a next that names the data it carries', () => {
  assertNext(
    { ok: false, code: 'NO_TOKEN', label: 'demoemdash1' },
    undefined,
    { has: [/stage the credential/, /finalize last/], max: 2000 },
    'NO_TOKEN staged recovery'
  )
  const staged = refusalNext({ ok: false, code: 'NO_TOKEN', label: 'demoemdash1' })
  assert.ok(
    staged.indexOf('stage the credential') < staged.indexOf('run migrate-token-mount.mjs'),
    'the staged recovery is named before the migration'
  )
})

{
  const wp = { platform: 'wordpress' }
  const rows = [
    {
      answer: { code: 'NOT_ON_THIS_PLATFORM', what: 'kind module', instead: 'a block inside post_content' },
      facts: wp,
      has: [/^Use a block inside post_content\.$/]
    },
    {
      answer: { code: 'ADDRESS_MISSING', needs: 'kind and id', candidates: [{ id: 42, title: 'Home' }] },
      facts: { ...wp, action: 'content.update' },
      has: [/id:42 \(Home\)/]
    },
    { answer: { code: 'CONFIRM_FIRST', tool: 'content_delete' }, has: [/ask_user_question/, /confirm:true/] },
    {
      answer: { code: 'BODY_SHRINK', kind: 'post', id: 42, read: true },
      has: [/^Only the blocks meant: .*; a whole post_content keeps every block, never padded/]
    },
    {
      answer: { code: 'BODY_SHRINK', kind: 'post', id: 42, read: false },
      has: [/content\.get \{kind:"post", id:42\} first/]
    },
    {
      answer: { code: 'BODY_SHRINK', kind: 'templatePart', key: 'header', read: false },
      has: [/key:"header"/]
    },
    {
      answer: { code: 'BLOCK_MARKUP', kind: 'post', id: 68, at: 0 },
      has: [/closes with "-->" \("\/-->" when it has no closing tag\)/, /content\.get/]
    },
    {
      answer: { code: 'UNKNOWN_PARAM', action: 'content.contract', operation: 'apply', given: ['applyId'] },
      has: [/Leave apply_id and request_id out/]
    },
    {
      answer: { code: 'NO_TOKEN', label: 'demoemdash1', error: 'x' },
      has: [
        /demoemdash1/,
        /host access/,
        /migrate-token-mount\.mjs/,
        /scripts\/provision\/emdash\/README\.md/,
        /recovery-required/,
        /Do NOT read or write the site's database/
      ],
      hasNot: [/mint-agent-token/],
      max: 2000
    },
    { answer: { code: 'NO_TOKEN' }, has: [/<label>/, /migrate-token-mount\.mjs/], max: 2000 },
    ...[
      'NOT_LISTABLE',
      'NO_WRITABLE_FIELD',
      'NOTHING_TO_LIST',
      'UNKNOWN_OPERATION',
      'UNKNOWN_SLOT',
      'CONTRACT_RULE',
      'INSPECT_FIRST',
      'EMDASH_SITE',
      'BAD_ACTION',
      'UNKNOWN_PARAM',
      'NO_RECEIPTS_ON_EMDASH',
      'EMDASH_ULID_REQUIRED',
      'EMDASH_LOCALE_REQUIRED',
      'BLOCK_MARKUP',
      'PENDING_DRAFT',
      'WOULD_UNPUBLISH',
      'REV_MISSING',
      'BAD_CALL',
      'TOOL_FAILED',
      'NOT_EMDASH',
      'SITE_REFUSED',
      'NOT_MCP'
    ].map((code) => ({ answer: { code }, facts: wp, has: [/./] })),
    {
      answer: { code: 'NOTHING_TO_LIST' },
      facts: { action: 'apply.list' },
      has: [/go on with the request/],
      hasNot: [/\bstop\b/i]
    }
  ]
  for (const { answer, facts, has, hasNot, max } of rows)
    test(`refusalNext: every host code this package raises has a next that names the data it carries: ${rowName(answer)}`, () => {
      assertNext({ ok: false, ...answer }, facts, { has, hasNot, max }, answer.code)
    })
}

test('refusalNext: a legacy structural refusal names the roads that work per CMS, and locks nothing', () => {
  const answer = { ok: false, error: LEGACY_STRUCTURE_CODE, message: LEGACY_BOUND_MESSAGE }
  const next = refusalNext(answer)

  assert.equal(refusalNext({ ok: false, code: LEGACY_STRUCTURE_CODE }), next)
  const wp = refusalNext({ ok: false, error: LEGACY_STRUCTURE_CODE }, 'wordpress')
  const joomla = refusalNext(
    { ok: false, error: LEGACY_STRUCTURE_CODE },
    { platform: 'joomla', sealed: true }
  )
  const emdash = refusalNext({ ok: false, code: LEGACY_STRUCTURE_CODE }, 'emdash')
  assertText(wp, {
    has: [
      /wp-cli/,
      /media\.draw \{prompt, slot\}, which uploads into wp-content\/uploads\/tracy-content\//,
      /tracy_site_build_wordpress request language\.add/
    ],
    hasNot: [/media\.upload/, /tracy_site_build_joomla|images\/tracy-content/]
  })
  assertText(joomla, { has: [/php cli\/joomla\.php/, /media\.draw/], hasNot: [/wp-content|media\.upload/] })
  assertText(emdash, { has: [/src\/styles\/tokens\.css/, /site\.rebuild/] })
})

{
  for (const platform of [null, 'joomla', 'wordpress', 'emdash'])
    test(`refusalNext: a legacy structural refusal names the roads that work per CMS, and locks nothing: ${rowName(platform)}`, () => {
      const text = refusalNext({ ok: false, error: LEGACY_STRUCTURE_CODE }, platform ?? undefined)
      assert.doesNotMatch(
        text,
        /sealed|locked|do not look|tell the customer|content[-_ ]?only/i,
        String(platform)
      )
      assert.match(text, /Never write the database directly/, String(platform))
    })
}

{
  const answer = { ok: false, error: LEGACY_STRUCTURE_CODE, message: LEGACY_BOUND_MESSAGE }
  const next = refusalNext(answer)

  for (const road of [/multilingual\.retire/, /tracy_site_build_joomla/, /tracy_site_build_wordpress/])
    test(`refusalNext: a legacy structural refusal names the roads that work per CMS, and locks nothing: ${rowName(road)}`, () => {
      assert.match(next, road)
    })
}

/** Assert every regex in `has` matches `text` and every one in `hasNot` does not. */
function assertText(text, { has = [], hasNot = [] }) {
  for (const re of has) assert.match(text, re)
  for (const re of hasNot) assert.doesNotMatch(text, re)
}

test('withNext attaches the next step to a refusal and leaves every other answer as it came', () => {
  const fenced = withNext({ ok: false, httpStatus: 403, code: 'SITE_OUTSIDE_CONVERSATION' })
  const fine = { ok: true, records: [] }
  const own = { ok: false, code: 'COMPONENT_NOT_REGISTERED', next: 'the door said so' }
  const withErrors = {
    ok: false,
    error: 'contract_failed',
    message: 'Content changed; inspect again',
    errors: [
      {
        code: 'SLOT_TOO_LONG',
        severity: 'recoverable',
        field: { slotKey: 'module-428.1' },
        limit: 60,
        actual: 84
      }
    ]
  }

  assert.deepEqual([fenced.ok, fenced.httpStatus, fenced.code], [false, 403, 'SITE_OUTSIDE_CONVERSATION'])
  assert.ok(typeof fenced.next === 'string' && fenced.next.length > 0)
  assert.equal(withNext(fine), fine)
  assert.equal(withNext(own), own, 'a next the answer already carries is kept')
  assert.equal(withNext(null), null)
  assert.match(withNext({ ok: false, code: 'SOMETHING_ELSE' }).next, /Read the error/)
  assert.deepEqual(
    /** @type {any} */ (withNext(withErrors, { platform: 'joomla' })).errors,
    withErrors.errors,
    'errors[] stay on the answer for the model'
  )
})

test('BAD_ACTION names this surface’s doors; a known action off the surface is NOT_ON_THIS_PLATFORM and names this platform’s door', () => {
  const help = planCall({ action: 'help' }, { actions: SURFACES.wordpress })
  const off = planCall(
    { action: 'content.contract', params: { operation: 'inspect' } },
    { actions: SURFACES.wordpress }
  )

  assert.deepEqual(
    [help.ok, help.actions, help.actions.includes('content.contract')],
    [false, SURFACES.wordpress, false]
  )
  assertNext(
    help,
    { platform: 'wordpress', actions: SURFACES.wordpress },
    { has: [/page\.text/], hasNot: [/content\.contract/] },
    'help'
  )
  assertNext(
    planCall({ action: 'site.restart' }),
    { platform: 'wordpress' },
    { has: [/Nothing to restart/] },
    'restart'
  )
  assert.deepEqual([off.ok, off.code], [false, 'NOT_ON_THIS_PLATFORM'])
  assertNext(off, { platform: 'wordpress' }, { has: [/content\.update \{kind:"post"/] }, 'off surface')
})

test('media.delete is offered on WordPress and Joomla but an older plugin refusal tells the agent to report it', () => {
  for (const platform of ['wordpress', 'joomla']) {
    const planned = planCall({ action: 'media.delete' })
    assert.equal(planned.ok, true, platform)
    const next = refusalNext(
      { ok: false, error: 'bad_action', message: 'unknown action: media.delete' },
      { platform, action: 'media.delete' }
    )
    assert.match(next ?? '', /Claude Cowork plugin does not support deleting pictures yet; it needs updating/)
    assert.match(next ?? '', /do not delete with shell or file tools/)
  }
})

test('media.delete refusals say when nothing was deleted and never suggest another write path', () => {
  const cases = [
    [
      { ok: false, code: 'too_large', totalBytes: 9_000_000 },
      { platform: 'wordpress', action: 'media.delete' },
      /9,000,000 bytes.*nothing was deleted.*undo copy/i
    ],
    [
      {
        ok: false,
        code: 'bad_params',
        message: 'cannot delete current value of an image slot home.hero.img'
      },
      { platform: 'joomla', action: 'media.delete' },
      /Change that slot first with content\.contract/
    ],
    [
      { ok: false, code: 'write_failed', message: 'storage operation rolled back' },
      { platform: 'wordpress', action: 'media.delete' },
      /rolled back; nothing was deleted/
    ],
    [
      { ok: false, code: 'not_found', message: 'media file not found' },
      { platform: 'joomla', action: 'media.delete' },
      /picture was not found; nothing was deleted/
    ]
  ]
  for (const [answer, facts, expected] of cases) {
    const next = refusalNext(answer, facts)
    assert.match(next ?? '', expected)
    assert.match(next ?? '', /Do not use shell or file tools/i)
  }
})

test('a refusal next never names an action the surface refuses (an action left out is refused)', () => {
  const sealedJ = { platform: 'joomla', sealed: true, actions: SURFACES.joomla }
  const open = [
    'content.list',
    'content.get',
    'content.update',
    'content.delete',
    'apply.revert',
    'apply.list'
  ]
  const picture =
    refusalNext(
      {
        ok: false,
        error: 'contract_failed',
        message: 'Image must already exist in the site media library: module-441.8'
      },
      sealedJ
    ) ?? ''
  assertText(picture, { has: [/media\.draw \{prompt, slot:"module-441\.8"\}/], hasNot: [/media\.upload/] })
  assertText(refusalNext({ ok: false, error: LEGACY_STRUCTURE_CODE }, sealedJ) ?? '', {
    has: [/media\.draw/],
    hasNot: [/media\.upload/]
  })
  assert.match(
    refusalNext(planCall({ action: 'content.batch' }, { actions: open }), {
      platform: 'joomla',
      sealed: false,
      actions: open
    }) ?? '',
    /^One content\.update per record: content\.update \{kind, id, fields\}; each write gets an apply_id of its own/
  )
  assert.match(
    refusalNext(planCall({ action: 'apply.list' }, { actions: ['page.text'] }), { platform: 'emdash' }) ?? '',
    /no receipts/
  )
})

{
  const sealedJ = { platform: 'joomla', sealed: true, actions: SURFACES.joomla }
  const sealedWp = { platform: 'wordpress', sealed: true, actions: SURFACES.wordpress }
  const boundWp = {
    platform: 'wordpress',
    sealed: true,
    actions: [
      'content.list',
      'content.get',
      'info',
      'plugin.list',
      'theme.list',
      'page.text',
      'page.look',
      'media.scan',
      'media.draw',
      'content.contract',
      'apply.revert',
      'apply.list'
    ]
  }
  const cases = [
    [sealedJ, 'media.upload', /media\.draw \{prompt, slot/],
    [sealedWp, 'media.upload', /media\.draw \{prompt, like/],
    [sealedJ, 'content.update', /content\.contract/],
    [sealedJ, 'db.dump', /content\.contract/],
    [sealedWp, 'db.tables', /page\.text/],
    [sealedWp, 'content.contract', /content\.update \{kind:"post"/],
    [boundWp, 'content.update', /content\.contract \{operation:"inspect"/],
    [boundWp, 'content.batch', /content\.contract \{operation:"inspect"/],
    [boundWp, 'language.install', /content\.contract/],
    [boundWp, 'media.upload', /media\.draw \{prompt, slot/]
  ]
  for (const [facts, action, want] of cases)
    test(`a refusal next never names an action the surface refuses (an action left out is refused): ${rowName(facts)}`, () => {
      const refused = planCall({ action, params: {} }, { actions: facts.actions })
      const next = refusalNext(refused, { ...facts, action }) ?? ''

      assert.deepEqual([refused.ok, refused.code], [false, 'NOT_ON_THIS_PLATFORM'], action)
      assert.match(next, want, `${action}: ${next}`)
      for (const named of actionsNamed(next).filter((x) => x !== action))
        assert.ok(facts.actions.includes(named), `${action} → ${named}: ${next}`)
    })
}

test('the r2 corpus: every recorded refusal is replayed — no shape answer gets a default, every next is short and on its surface', () => {
  const { groups } = fixtureOf('refusal-corpus-r2.json')
  let replayed = 0
  for (const g of groups) {
    const answer = g.answer && typeof g.answer === 'object' ? g.answer : null
    if ((g.tool !== 'tracy_site' && g.tool !== 'tracy_emdash') || answer === null) continue
    const platform = g.site.startsWith('wp') ? 'wordpress' : g.site.startsWith('j') ? 'joomla' : 'emdash'
    const surface = SURFACES[platform]
    const action = g.args?.action ?? null
    // A call the surface no longer offers cannot meet this refusal again — except the contract and the batch on WordPress.
    const stillMet = platform === 'wordpress' && ['content.contract', 'content.batch'].includes(action)
    if (g.tool === 'tracy_site' && surface && action && !surface.includes(action) && !stillMet) continue

    const next = refusalNext(answer, {
      platform,
      action,
      actions: surface,
      sealed: true,
      tool: g.args?.tool ?? null
    })

    assert.ok(next, `${g.code} ${g.message}`)
    replayed += 1
    if (['SITE_UNREACHABLE', 'CONTENT_CONTRACT', 'NO_FILE_LAYERS', LEGACY_STRUCTURE_CODE].includes(g.code))
      continue
    assert.ok(next.length <= 200, `${g.code}: ${next}`)
    for (const d of DEFAULTS) assert.doesNotMatch(next, d, `${g.code} ${g.message}`)
    if (surface)
      for (const named of actionsNamed(next))
        assert.ok(surface.includes(named), `${g.code} names ${named}: ${next}`)
  }
  assert.ok(replayed >= 25, `replayed ${replayed}`)
})

{
  const { rewrites } = fixtureOf('refusal-corpus-r2.json')
  const byGroup = Object.fromEntries(rewrites.map((r) => [r.group.split(' ')[0], r.answer]))
  const nextOf = (a, facts) =>
    refusalNext(Object.fromEntries(Object.entries(a).filter(([key]) => key !== 'next')), facts) ?? ''
  const wp = { platform: 'wordpress' }
  const rows = [
    [
      byGroup.G2,
      wp,
      /page\.text \{path, match\}.*content\.update \{kind:"post", id, fields:\{post_content\}\}/
    ],
    [
      {
        ok: false,
        error: 'bad_params',
        message:
          'content.list serves kind "post" only; "page" is not listed here. Read one with content.get {kind, id or key}, and use post_type to narrow posts.'
      },
      wp,
      /content\.list \{kind:"post", post_type:"page"\}/
    ],
    [
      { ok: false, error: 'not_found', message: 'no post at id 0, key "contact-vi"' },
      wp,
      /content\.list \{kind:"post", post_type:"page"\}/
    ],
    [
      {
        ok: false,
        code: 'TOOL_FAILED',
        emdash: 'CONFLICT',
        tool: 'content_publish',
        error: '[CONFLICT] Content changed'
      },
      {},
      /content_get for the current _rev, then content_publish once/
    ],
    [
      { ok: false, error: 'write_failed', message: 'no writable field for kind post; given hero.heading' },
      {},
      /The words live inside post_content/
    ],
    [
      { ok: false, error: 'writer_busy', message: 'another writer is changing this site' },
      {},
      /Make the same call once more in a few seconds/
    ],
    [
      { ok: false, error: 'bad_params', message: 'id or key required to name which templatePart to read' },
      {},
      /content\.get \{kind:"templatePart", key:"header"\}/
    ]
  ]
  for (const [answer, facts, want] of rows)
    test(`the T10 rewrites: each measured group gets the call its rewrite names: ${rowName(answer)}`, () => {
      assert.match(nextOf(answer, facts), want, JSON.stringify(answer).slice(0, 80))
    })
}

test('EmDash refusals follow the words road: never "ULID, never a slug", never "{list: true} first", and each tool family gets its own next', () => {
  assertNext(
    { ok: false, code: 'EMDASH_LOCALE_REQUIRED', languages: 'unread' },
    undefined,
    { hasNot: [/several languages/] },
    'unread'
  )
})

{
  const tools = [
    'content_get',
    'content_list',
    'content_update',
    'content_publish',
    'menu_get',
    'taxonomy_list_terms',
    'media_upload'
  ]
  const codes = [
    'CONFLICT',
    'NOT_FOUND',
    'COLLECTION_NOT_FOUND',
    'INVALID_CURSOR',
    'VALIDATION',
    'INSUFFICIENT_SCOPE',
    'UNKNOWN_TOOL',
    'REV_MISSING',
    ''
  ]
  for (const tool of tools)
    test(`EmDash refusals follow the words road: never "ULID, never a slug", never "{list: true} first", and each tool family gets its own next: ${rowName(tool)}`, () => {
      for (const emdash of codes)
        assertNext(
          { ok: false, code: 'TOOL_FAILED', tool, emdash, error: 'x' },
          undefined,
          { hasNot: [/never a slug|ULID, never|\{list: ?true\} first|skip content_get|no content_get/i] },
          `${tool} ${emdash}`
        )
    })
}

{
  const failed = (tool, error, extra = {}) => ({ ok: false, code: 'TOOL_FAILED', tool, error, ...extra })
  const rows = [
    [failed('menu_get', "[NOT_FOUND] Menu 'main' not found"), /menu_list \{locale\}/],
    [failed('content_get', '[NOT_FOUND] Content item not found: home'), /collection named after it/],
    [
      failed('content_update', 'MCP error -32602: Input validation error'),
      /\{list:true, tools:\["content_update"\]\}/
    ],
    [{ ok: false, code: 'EMDASH_SITE' }, /no receipts/, { action: 'apply.list' }],
    [
      { ok: false, code: 'EMDASH_LOCALE_REQUIRED', served: ['de', 'vi'] },
      /serves de, vi: make the same call with locale:"<one of them>"/
    ],
    [{ ok: false, code: 'EMDASH_LOCALE_REQUIRED', languages: 'unread' }, /could not be read just now/],
    [
      { ok: false, code: 'PENDING_DRAFT', tool: 'content_publish' },
      /ask_user_question.*confirm:true|confirm:true.*ask_user_question/s
    ]
  ]
  for (const [answer, want, facts] of rows)
    test(`EmDash refusals follow the words road: never "ULID, never a slug", never "{list: true} first", and each tool family gets its own next: ${rowName(answer)}`, () => {
      assertNext(answer, facts, { has: [want] }, JSON.stringify(answer).slice(0, 80))
    })
}

{
  // A wrong collection or a made-up cursor is the model's to correct, never the customer's.
  const failed = (tool, emdash, error, extra = {}) => ({
    ok: false,
    code: 'TOOL_FAILED',
    tool,
    emdash,
    error,
    ...extra
  })
  for (const tool of ['content_list', 'content_get', 'content_create', 'schema_get_collection']) {
    const answer = failed(tool, 'COLLECTION_NOT_FOUND', "[COLLECTION_NOT_FOUND] Collection 'x' not found")
    test(`EmDash COLLECTION_NOT_FOUND is the model's to correct, not the customer's: ${rowName(answer)}`, () => {
      assertNext(answer, undefined, {
        has: [
          /collection named after it: content_get \{collection:"<page>", id:"<slug>"\}/,
          /schema_list_collections lists the collections/
        ],
        hasNot: [/tell the customer|another way/]
      })
    })
  }
  for (const tool of ['content_list', 'media_list', 'taxonomy_list_terms', 'search']) {
    const answer = failed(tool, 'INVALID_CURSOR', '[INVALID_CURSOR] Invalid pagination cursor: eyJvIjo3fQ==')
    test(`EmDash INVALID_CURSOR sends the nextCursor an earlier answer gave: ${rowName(answer)}`, () => {
      const next = assertNext(answer, undefined, {}, tool)
      assert.equal(
        next,
        'A cursor is never made by hand: send the nextCursor an earlier answer gave, exactly as it came; with none, the same call without cursor answers one (limit:<fewer rows> if it came cut).'
      )
    })
  }
  // An ENTRY the collection lacks is not a wrong collection: the collection's own list has the slugs.
  for (const tool of ['content_get', 'content_translations', 'content_update']) {
    const answer = failed(tool, 'NOT_FOUND', '[NOT_FOUND] Content item not found: services', {
      collection: 'services'
    })
    test(`EmDash NOT_FOUND on an entry points at the collection's own list: ${rowName(answer)}`, () => {
      const next = assertNext(answer, undefined, { hasNot: [/named after it/] }, tool)
      assert.equal(
        next,
        'No entry with that id or slug in services: content_list {collection:"services"} lists its entries with their slugs and titles.'
      )
    })
  }
  // A wrong COLLECTION keeps its sentence, and so does a refusal that names no collection or a strange one.
  const sentence = /collection named after it: content_get \{collection:"<page>", id:"<slug>"\}/
  const wrongCollection = failed('content_get', 'NOT_FOUND', "[NOT_FOUND] Collection 'news' not found", {
    collection: 'news'
  })
  test(`EmDash NOT_FOUND on a wrong collection keeps the page sentence: ${rowName(wrongCollection)}`, () => {
    assertNext(wrongCollection, undefined, { has: [sentence] })
  })
  for (const collection of [undefined, '', 'a b', 'x'.repeat(31), '"; drop']) {
    const answer = failed(
      'content_get',
      'NOT_FOUND',
      '[NOT_FOUND] Content item not found: home',
      collection === undefined ? {} : { collection }
    )
    test(`EmDash NOT_FOUND naming no usable collection keeps the page sentence: ${rowName(answer)}`, () => {
      assertNext(answer, undefined, { has: [/collection named after it/] }, String(collection))
    })
  }
}

{
  const upload = (error, emdash = '') =>
    refusalNext({
      ok: false,
      code: 'TOOL_FAILED',
      tool: 'media_upload',
      ...(emdash ? { emdash } : {}),
      error
    }) ?? ''
  const toHostRoad = [
    '[VALIDATION_ERROR] Invalid base64 data',
    'Invalid base64 data',
    '[VALIDATION_ERROR] URL not allowed: Hostname resolved to no addresses',
    '[FETCH_ERROR] Failed to fetch file from URL',
    'MCP error -32602: Invalid arguments'
  ]
  for (const error of toHostRoad)
    test(`EmDash media_upload refusals send the agent to the host’s read, name the site’s own size limit, and keep the scope message: ${rowName(error)}`, () => {
      const next = upload(error)

      assert.match(next, /tracy_site media\.upload \{file:"<its name in the Files tab>"\}/, error)
      assert.doesNotMatch(next, /the same call with contentType/, error)
      assert.ok(next.length <= 200, error)
    })
}

{
  const upload = (error, emdash = '') =>
    refusalNext({
      ok: false,
      code: 'TOOL_FAILED',
      tool: 'media_upload',
      ...(emdash ? { emdash } : {}),
      error
    }) ?? ''
  const rows = [
    [upload('Invalid base64 data', 'VALIDATION'), /tracy_site media\.upload \{file/],
    [
      upload('[PAYLOAD_TOO_LARGE] File exceeds maximum size of 50MB'),
      /upload limit of 50MB.*8 MiB|8 MiB.*upload limit of 50MB/s
    ],
    [upload('too big', 'PAYLOAD_TOO_LARGE'), /over this site's upload limit: ask the customer/],
    [
      upload('[VALIDATION_ERROR] contentType is required when uploading base64 data'),
      /contentType.*tracy_site media\.upload \{file|tracy_site media\.upload \{file.*contentType/s
    ],
    [upload('[INSUFFICIENT_SCOPE] media:write'), /agent token does not carry that right/]
  ]
  for (const [next, want] of rows)
    test(`EmDash media_upload refusals send the agent to the host’s read, name the site’s own size limit, and keep the scope message: ${rowName(next)}`, () => {
      assert.match(next, want)
    })
}

test('EmDash locale plan: with the default served the write is filled; without it the refusal counts every language it serves, cut at six names', () => {
  const stand = [
    'uk',
    'tr',
    'th',
    'ta',
    'sv',
    'sr',
    'sl',
    'sk',
    'ro',
    'pt',
    'pl',
    'nl',
    'ms',
    'lv',
    'lt',
    'ko',
    'ja',
    'it',
    'id',
    'hu',
    'hr',
    'hi',
    'he',
    'fr',
    'fi',
    'fa',
    'et',
    'es',
    'el',
    'de',
    'da',
    'cs',
    'ca',
    'bn',
    'bg',
    'ar',
    'af',
    'vi',
    'ru',
    'en'
  ]
  const write = { collection: 'site', id: 'site', _rev: 'r' }

  const filled = localePlan('content_update', write, { served: stand, artifactDefault: 'en' })
  const cut = localePlan('content_update', write, { served: stand })

  assert.equal(filled.ok, true)
  assert.equal(cut.ok, false)
  const many = refusalNext(cut) ?? ''
  assert.match(many, /This site serves 40 languages \(uk, tr, th, ta, sv, sr, …\)/)
  assert.match(many, /locale:"<the language of the page meant>"/)
  assert.ok(many.length <= 200, many)
})

test('EmDash tool refusals: SITE_REFUSED and NOT_MCP say what happened to THIS call — a write is never said to be retried', () => {
  const write =
    refusalNext({ ok: false, code: 'NOT_MCP', tool: 'content_update', error: 'not JSON-RPC' }) ?? ''
  const read = refusalNext({ ok: false, code: 'SITE_REFUSED', tool: 'content_get', httpStatus: 502 }) ?? ''
  const lower = refusalNext({ ok: false, code: 'SITE_REFUSED', tool: 'content_get', error: 'HTTP 403' }) ?? ''

  assertText(write, {
    has: [/never sends a write twice/, /tell the customer/],
    hasNot: [/retried|asked once more/]
  })
  assert.match(read, /Tracy asked once more/)
  assert.match(refusalNext({ ok: false, code: 'NOT_MCP', tool: 'menu_list' }) ?? '', /Tracy asked once more/)
  assert.doesNotMatch(lower, /once more|retried/)
})

{
  for (const tool of ['schema_delete_collection', 'content_get', 'unknown_tool', null])
    test(`EmDash tool refusals: SITE_REFUSED and NOT_MCP say what happened to THIS call — a write is never said to be retried: ${rowName(tool)}`, () => {
      for (const code of ['SITE_REFUSED', 'NOT_MCP']) {
        const next = refusalNext({ ok: false, code, ...(tool ? { tool } : {}) }) ?? ''
        assert.ok(next.length > 0 && next.length <= 200, `${code} ${tool}: ${next.length}`)
      }
    })
}

test('Content API refusals keep an actionable next: adapter unsupported per platform, describe alone, any other bad query', () => {
  const answer = (code, message) => ({ ok: false, error: { code, message } })
  const unsupported = answer(
    'CONTENT_ADAPTER_UNSUPPORTED',
    'Content identity is not set up on this site yet.'
  )
  assertNext(
    answer('CONTENT_ADAPTER_UNSUPPORTED', 'No reader'),
    { platform: 'emdash', action: 'content.read' },
    { has: [/tracy_emdash content_get \{collection, id:"<slug>"\}/] },
    'emdash'
  )
  assertNext(
    unsupported,
    { platform: 'joomla', actions: ['page.text', 'content.read'] },
    { has: [/page\.text/], hasNot: [/content\.replace/] },
    'a surface without one road is not sent down it'
  )
  assertNext(
    answer('CONTENT_BAD_QUERY', 'describe must be sent alone, without type or id'),
    { action: 'content.read' },
    { has: [/\{describe: ?true\} alone/] },
    'describe'
  )
  assert.match(
    refusalNext(answer('CONTENT_BAD_QUERY', 'limit must be 1-100')) ?? '',
    /Fix the one field its message names/
  )
})

// A list asked for a search-like key (`query`, `q`, …) is pointed at `search`, which content.list takes since
// 30/09/2026 (the plugin releases exist; the relay and this host refuse what an older plugin ignored); a
// language is no parameter of content.list, and content.read lists by language.
{
  const ALLOWED = ['kind', 'offset', 'limit', 'include_body', 'search']
  const refused = (given, platform) => ({
    ok: false,
    code: 'UNKNOWN_PARAM',
    action: 'content.list',
    platform,
    given,
    allowed: ALLOWED
  })
  const rows = [
    { platform: 'joomla', sealed: true },
    { platform: 'joomla', sealed: false },
    { platform: 'wordpress', sealed: true },
    { platform: 'wordpress', sealed: false }
  ]
  const STRAY = ['s', 'q', 'query', 'text', 'match', 'filter', 'find', 'title', 'contains']
  // 09/10/2026: the listing's type is named — a bare `{type}` was filled with the CMS's own word and refused.
  const JOOMLA_ROAD_AS = (/** @type {string} */ type) =>
    `content.list {kind, search:"<part of the title>"} finds a record by title or alias; else content.read {type:"${type}", locale, fields:"title,slug"} lists titles; page.text {path, match} finds words.`
  const WORDPRESS_ROAD_AS = (/** @type {string} */ type) =>
    `content.list {search:"<part of the title>"} finds a post by title or slug; else content.read {type:"${type}", locale, fields:"title,slug"} lists titles; page.text {path, match} finds words.`
  const JOOMLA_ROAD = JOOMLA_ROAD_AS('article')
  const WORDPRESS_ROAD = WORDPRESS_ROAD_AS('article')
  // A kind `content.read` does not list (a Joomla category, banner, language…; a custom post type on WordPress):
  // the fallback is the same call paged, never `content.read`, which would refuse the type (CONTENT_BAD_QUERY).
  const PAGED = (/** @type {string} */ dropped) =>
    `Same call without ${dropped}: content.list {kind, offset, limit} lists this kind a page at a time.`
  const JOOMLA_PAGED_ROAD =
    'content.list {kind, search:"<part of the title>"} finds a record by title or alias; if refused, the same call without search lists this kind a page at a time.'
  const WORDPRESS_PAGED_ROAD =
    'content.list {search:"<part of the title>"} finds a post by title or slug; if refused, the same call without search lists this kind a page at a time.'
  /** The Joomla kinds `content.read` lists (type article, page, shared), and the ones it does not. */
  const READ_LISTED = ['article', 'menuItem', 'module']
  const READ_UNLISTED = [
    'category',
    'tag',
    'field',
    'templateStyle',
    'language',
    'menutype',
    'banner',
    'bannerClient',
    'contact',
    'newsfeed'
  ]
  /** Kinds the plugin's search refuses: neither searched nor listed by `content.read`. */
  const NOT_SEARCHED = [
    'user',
    'redirect',
    'extensionParams',
    'languageFilter',
    'articleAssociation',
    'menuAssociation',
    'moduleAssignment',
    'fieldValue'
  ]
  for (const row of rows)
    test(`content.list asked for a search-like key points at search, keeps content.read {type, locale} for when it is refused, and says where words are found: ${rowName(row)}`, () => {
      const { platform, sealed } = row
      const facts = { platform, sealed, action: 'content.list' }
      const stray = assertNext(refused(['query'], platform), facts, {}, 'query')
      assert.equal(stray, platform === 'wordpress' ? WORDPRESS_ROAD : JOOMLA_ROAD)
      for (const key of STRAY)
        assert.equal(assertNext(refused([key], platform), facts, {}, key), stray, `${key}: one road`)
      const language = assertNext(refused(['language'], platform), facts, {}, 'language')
      assert.match(
        language,
        /^content\.list has no language filter: every language is listed; content\.read \{type:"article", locale, fields:"title,slug"\} lists /
      )
    })
  // The plugin's OWN refusals of a search (`joomla-v0.20.0` Engine.php / SiteWriter.php `SearchNeedle`;
  // `wordpress-v0.16.0` Engine.php), by the messages the releases answer with: reachable once `search` is
  // advertised, so each has its own next and none falls to the door's generic "names the wrong parameter".
  const PLUGIN_REFUSALS = /** @type {const} */ ([
    [
      'joomla',
      'search must be a string of at most 200 characters',
      /^Same call with search as one piece of text/
    ],
    ['joomla', 'search is limited to 200 characters', /^Same call with search as one piece of text/],
    ['joomla', 'search must be valid UTF-8 text', /^Same call with search as one piece of text/],
    [
      'joomla',
      'search does not cover kind "user". It covers: article, category, tag, menuItem, module, templateStyle, language, menutype, banner, contact, newsfeed, bannerClient, field. Leave search out and page the list with offset and limit',
      /^Same call without search: content\.list \{kind, offset, limit\} lists this kind a page at a time\.$/
    ],
    [
      'joomla',
      'this site cannot filter a list by search; leave search out and page the list with offset and limit',
      /^Same call without search: content\.list \{kind, offset, limit\} lists this kind a page at a time\.$/
    ],
    [
      'wordpress',
      'search must be a string: the words to look for in a title or slug',
      /^Same call with search as one piece of text/
    ],
    [
      'wordpress',
      'search is at most 200 characters: send the distinctive words of the title, not the whole text',
      /^Same call with search as one piece of text/
    ],
    ['wordpress', 'search must be valid UTF-8 text', /^Same call with search as one piece of text/],
    [
      'wordpress',
      'content.list cannot search kind "templatePart": its rows come from the theme\'s files and the overrides stored over them, and that list is short enough to read whole. Drop "search", or search posts (kind "post") by title or slug.',
      /^Same call without search: content\.list \{kind, offset, limit\} lists this kind a page at a time\.$/
    ]
  ])
  test("content.list search the plugin itself refuses (bad_params) gets the call that works, not the door's generic sentence", () => {
    for (const [platform, message, expected] of PLUGIN_REFUSALS) {
      const next = refusalNext(
        { ok: false, error: 'bad_params', message },
        { platform, sealed: false, action: 'content.list', actions: null }
      )
      assert.match(next ?? '', expected, `${platform}: ${message.slice(0, 50)}`)
      assert.ok((next ?? '').length <= 200, message.slice(0, 50))
    }
  })
  test('content.list search-like key: a surface without content.read gets search and the words road, never content.read', () => {
    const asked = (/** @type {string} */ platform, /** @type {boolean} */ sealed) =>
      refusalNext(refused(['query'], platform), {
        platform,
        sealed,
        action: 'content.list',
        actions: ['content.list', 'page.text']
      })
    assert.equal(
      asked('joomla', false),
      'content.list {kind, search:"<part of the title>"} finds a record by title or alias; page.text {path, match} finds words.'
    )
    assert.equal(
      asked('wordpress', false),
      'content.list {search:"<part of the title>"} finds a post by title or slug; page.text {path, match} finds words.'
    )
    // A sealed Joomla site finds words through the contract's inspect, as its other refusals say.
    const sealed = asked('joomla', true) ?? ''
    assert.match(
      sealed,
      /^content\.list \{kind, search:"<part of the title>"\} finds a record by title or alias; /
    )
    assert.match(
      sealed,
      /content\.contract \{operation:"inspect", match:"<words>"\} finds the slot holding words\.$/
    )
    assert.ok(sealed.length <= 200, String(sealed.length))
    for (const text of [asked('joomla', false), asked('wordpress', false), sealed])
      assert.doesNotMatch(text ?? '', /content\.read/)
    assert.doesNotMatch(
      refusalNext(refused(['language'], 'joomla'), {
        platform: 'joomla',
        action: 'content.list',
        actions: ['content.list', 'page.text']
      }) ?? '',
      /content\.read/
    )
  })
  test('content.list search-like key: where search would be refused it is not offered — a site that learned its plugin ignores it, a kind it does not cover — and a call that carries one is told which key to drop', () => {
    for (const row of rows) {
      const { platform, sealed } = row
      const facts = { platform, sealed, action: 'content.list' }
      const closed = refusalNext(refused(['query'], platform), { ...facts, noListSearch: true }) ?? ''
      assert.doesNotMatch(closed, /search:"/, `${rowName(row)}: the plugin was found not to read it`)
      assert.match(
        closed,
        /^No search here: content\.read \{type:"article", locale, fields:"title,slug"\} lists /
      )
      // The plugin searches these kinds' titles; it refuses the others by name — and `content.read` lists none
      // of them either, so the road is the same call without the stray key, a page at a time. It is never told
      // "no search" (a site whose plugin has one would be told what is not true) and never sent to `content.read`.
      const uncovered = platform === 'joomla' ? 'user' : 'option'
      const paged = refusalNext(refused(['query'], platform), {
        ...facts,
        asked: { kind: uncovered, query: 'x' }
      })
      assert.equal(paged, PAGED('query'), `${rowName(row)}: kind ${uncovered}`)
      assert.doesNotMatch(paged ?? '', /has no search|content\.read/)
      // A kind that is searched and that `content.read` lists: search, and content.read if it is refused.
      const covered = platform === 'joomla' ? 'article' : 'page'
      assert.equal(
        refusalNext(refused(['query'], platform), { ...facts, asked: { kind: covered, query: 'x' } }),
        platform === 'wordpress' ? WORDPRESS_ROAD_AS('page') : JOOMLA_ROAD,
        `${rowName(row)}: kind ${covered}`
      )
      // A blank search is no search: the road is still offered.
      assert.equal(
        refusalNext(refused(['query'], platform), { ...facts, asked: { search: '  ', query: 'x' } }),
        platform === 'wordpress' ? WORDPRESS_ROAD : JOOMLA_ROAD
      )
      // The call already carries one: the stray key is the fault, and the sentence says so.
      assert.equal(
        refusalNext(refused(['query'], platform), {
          ...facts,
          asked: { kind: 'post', search: 'roof', query: 'roof' }
        }),
        `Same call without query: content.list takes ${ALLOWED.join(', ')} here.`
      )
    }
  })
  // `search` reached a site whose plugin does not read it (30/09/2026): the relay's guard or this
  // host's memory says LIST_SEARCH_UNSUPPORTED, and the roads are the ones an older plugin leaves —
  // never `search` again.
  const ignored = { ok: false, httpStatus: 501, code: 'LIST_SEARCH_UNSUPPORTED' }
  for (const row of rows)
    test(`content.list search the plugin ignored names the roads that work, never search again, in at most 200 characters: ${rowName(row)}`, () => {
      const { platform, sealed } = row
      const facts = { platform, sealed, action: 'content.list' }
      const next = assertNext(ignored, facts, {}, 'ignored')
      // 09/10/2026 (bench hb, 16 of 16 such answers): ONE call with its type filled in, and the id it answers.
      assert.equal(
        next,
        'No search here: content.read {type:"article", locale, fields:"title,slug"} lists one language\'s records by title; native {kind, id} is the id content.get or content.delete takes.',
        `${platform}: ${next}`
      )
      assert.doesNotMatch(next, /search:"/, 'the plugin just said it does not read one')
      assert.doesNotMatch(
        next,
        /\{type,|name:"<slug>"/,
        'no placeholder for the type, no slug the model does not have'
      )
    })
  test('content.list search the plugin ignored does not send a surface without content.read to it', () => {
    const bare = { platform: 'joomla', action: 'content.list', actions: ['content.list', 'page.text'] }
    const next = refusalNext(ignored, bare) ?? ''
    assert.doesNotMatch(next, /content\.read/)
    assert.match(next, /page\.text \{path, match\}/)
    assert.doesNotMatch(next, /search:"/)
  })
  // 🔒 THE ROAD A REFUSAL NAMES MUST EXIST FOR THE KIND ASKED (review of the advertising, 30/09/2026).
  // `content.read` lists the Content API's types (page, article, service, project, shared, generic), not the
  // plugin's kinds: on Joomla an article, a menu item (page) and a module (shared) are in it; a category, a tag,
  // a banner, a language… are not, and `content.read {type:"banner"}` is refused CONTENT_BAD_QUERY. A refusal that
  // sent the model there for a banner sent it nowhere. What works for every kind is the same call without
  // `search`, a page at a time.
  test('content.list search the plugin ignored: content.read is named for a kind it lists, and every other kind is told the same call paged without search', () => {
    for (const sealed of [true, false]) {
      const at = (/** @type {Record<string, unknown> | null} */ asked) =>
        refusalNext(ignored, { platform: 'joomla', sealed, action: 'content.list', asked }) ?? ''
      // No kind is Joomla's default, an article; no facts at all keep the road the door always named.
      for (const asked of [null, { search: 'x' }, ...READ_LISTED.map((kind) => ({ kind, search: 'x' }))]) {
        const next = at(asked)
        assert.match(
          next,
          /^No search here: content\.read \{type:"(article|page|shared)", locale, fields:"title,slug"\} lists /,
          `sealed ${sealed}: ${JSON.stringify(asked)}`
        )
        assert.doesNotMatch(next, /a page at a time/)
        assert.ok(next.length <= 200, `${next.length} chars`)
      }
      for (const kind of [...READ_UNLISTED, ...NOT_SEARCHED]) {
        const next = at({ kind, search: 'x' })
        assert.equal(next, PAGED('search'), `sealed ${sealed}: kind ${kind}`)
        assert.doesNotMatch(next, /content\.read|search:"/, kind)
      }
    }
    // A site whose plugin was found to ignore search: the same roads, by the kind asked.
    const learned = (/** @type {string} */ kind) =>
      refusalNext(ignored, {
        platform: 'joomla',
        sealed: false,
        action: 'content.list',
        asked: { kind, search: 'x' },
        noListSearch: true
      })
    assert.match(learned('article') ?? '', /content\.read \{type:"article", locale/)
    assert.match(learned('menuItem') ?? '', /content\.read \{type:"page", locale/)
    assert.match(learned('module') ?? '', /content\.read \{type:"shared", locale/)
    assert.equal(learned('banner'), PAGED('search'))
  })
  test('content.list search the plugin ignored, on WordPress: content.read for the post types it lists, a custom post type is told the same call paged', () => {
    const at = (/** @type {Record<string, unknown> | null} */ asked) =>
      refusalNext(ignored, { platform: 'wordpress', sealed: false, action: 'content.list', asked }) ?? ''
    // Posts and pages, template parts and menus (`shared`): what `content.read` lists.
    for (const asked of [
      null,
      { search: 'x' },
      { kind: 'post', search: 'x' },
      { kind: 'page', search: 'x' },
      { post_type: 'page', search: 'x' },
      { post_type: 'post', search: 'x' },
      { post_type: 'wp_navigation', search: 'x' },
      { post_type: 'wp_template_part', search: 'x' }
    ]) {
      const next = at(asked)
      assert.match(
        next,
        /^No search here: content\.read \{type:"(article|page|shared)", locale, fields:"title,slug"\} lists /,
        JSON.stringify(asked)
      )
      assert.ok(next.length <= 200, `${next.length} chars`)
    }
    // A post type of a plugin (a product, an order) is not in `content.read`; `option` is listed by this host.
    for (const asked of [
      { post_type: 'product', search: 'x' },
      { kind: 'post', post_type: 'shop_order', search: 'x' },
      { kind: 'option', search: 'x' }
    ])
      assert.equal(at(asked), PAGED('search'), JSON.stringify(asked))
  })
  test('content.list search-like key on a kind content.read does not list: search is offered with the paged list as its fallback — and with the paged list alone where search would be refused', () => {
    for (const platform of /** @type {const} */ (['joomla', 'wordpress'])) {
      const stray = (/** @type {Record<string, unknown>} */ asked, extra = {}) =>
        refusalNext(refused(['query'], platform), {
          platform,
          sealed: false,
          action: 'content.list',
          asked: { ...asked, query: 'x' },
          ...extra
        }) ?? ''
      const unlisted = platform === 'joomla' ? { kind: 'banner' } : { post_type: 'product' }
      const road = platform === 'joomla' ? JOOMLA_PAGED_ROAD : WORDPRESS_PAGED_ROAD
      assert.equal(stray(unlisted), road, platform)
      assert.ok(road.length <= 200, `${road.length} chars`)
      assert.doesNotMatch(stray(unlisted), /content\.read/)
      // The site learned its plugin ignores search: no search is offered, the paged list is the road.
      assert.equal(stray(unlisted, { noListSearch: true }), PAGED('query'), `${platform}: learned`)
    }
    // Every Joomla kind, by the road it gets: search then content.read; search then the paged list; the paged list.
    const joomla = (/** @type {string} */ kind) =>
      refusalNext(refused(['query'], 'joomla'), {
        platform: 'joomla',
        sealed: false,
        action: 'content.list',
        asked: { kind, query: 'x' }
      }) ?? ''
    const READ_TYPE = { article: 'article', menuItem: 'page', module: 'shared' }
    for (const kind of READ_LISTED)
      assert.equal(
        joomla(kind),
        JOOMLA_ROAD_AS(READ_TYPE[/** @type {keyof typeof READ_TYPE} */ (kind)]),
        kind
      )
    for (const kind of READ_UNLISTED) assert.equal(joomla(kind), JOOMLA_PAGED_ROAD, kind)
    for (const kind of NOT_SEARCHED) assert.equal(joomla(kind), PAGED('query'), kind)
  })
  test('content.list language key: content.read {type, locale} is named for a kind it lists, and not for one it does not', () => {
    const at = (/** @type {string | undefined} */ kind) =>
      refusalNext(refused(['language'], 'joomla'), {
        platform: 'joomla',
        sealed: false,
        action: 'content.list',
        asked: kind === undefined ? { language: 'vi' } : { kind, language: 'vi' }
      }) ?? ''
    for (const kind of [undefined, ...READ_LISTED])
      assert.match(
        at(kind),
        /^content\.list has no language filter: every language is listed; content\.read /,
        String(kind)
      )
    for (const kind of [...READ_UNLISTED, ...NOT_SEARCHED]) {
      const next = at(kind)
      assert.match(next, /^content\.list has no language filter: every language is listed; /, kind)
      assert.doesNotMatch(next, /content\.read/, kind)
    }
  })
  // A search the plugin could not run (an SQL error on an odd collation, …) answers `read_failed`; unlike the
  // read of one record, the same list without `search` is a road that works, and the sentence says so.
  test('content.list search that failed inside the plugin: once more, then the list without search — never only "tell the customer"', () => {
    const failed = { ok: false, error: 'read_failed', message: 'SQLSTATE: illegal mix of collations' }
    const at = (/** @type {Record<string, unknown> | null} */ asked, action = 'content.list') =>
      refusalNext(failed, { platform: 'joomla', sealed: false, action, asked }) ?? ''
    const searched = at({ kind: 'article', search: 'roof' })
    assert.match(
      searched,
      /make the same call once more; if it fails again, leave search out and page with offset and limit\.$/
    )
    assert.doesNotMatch(searched, /tell the customer/)
    assert.ok(searched.length <= 200, `${searched.length} chars`)
    // A list with no search, or another action, keeps the sentence it always had.
    const plain =
      'The component could not read that (the message says why): make the same call once more; if it fails again, tell the customer.'
    assert.equal(at({ kind: 'article' }), plain)
    assert.equal(at({ kind: 'article', search: '  ' }), plain, 'a blank search filtered nothing')
    assert.equal(at({ kind: 'article', id: 4, search: 'x' }, 'content.get'), plain)
    assert.equal(at(null), plain)
  })
  test("another action's stray search key keeps the words road", () => {
    const other =
      refusalNext(
        { ...refused(['search'], 'joomla'), action: 'content.get' },
        { platform: 'joomla', action: 'content.get' }
      ) ?? ''
    assert.doesNotMatch(other, /content\.read|search:"/)
  })
}

{
  for (const code of [
    'CONTENT_ADAPTER_UNSUPPORTED',
    'CONTENT_SNAPSHOT_EXPIRED',
    'CONTENT_BAD_QUERY',
    'CONTENT_UNAUTHENTICATED',
    'CONTENT_FORBIDDEN',
    'CONTENT_NOT_FOUND',
    'CONTENT_FIELD_TOO_LARGE',
    'CONTENT_SOURCE_UNAVAILABLE'
  ])
    test(`Content API refusals keep an actionable next: adapter unsupported per platform, describe alone, any other bad query: ${rowName(code)}`, () => {
      const next = refusalNext({ error: { code, message: 'Reader refusal' } })
      assert.ok(typeof next === 'string' && next.length > 0, code)
      // Its own sentence, never the fallback a refusal with no known code gets.
      for (const d of DEFAULTS) assert.doesNotMatch(next, d, code)
    })
}

{
  const answer = (code, message) => ({ ok: false, error: { code, message } })
  const unsupported = answer(
    'CONTENT_ADAPTER_UNSUPPORTED',
    'Content identity is not set up on this site yet.'
  )
  for (const platform of ['wordpress', 'joomla'])
    test(`Content API refusals keep an actionable next: adapter unsupported per platform, describe alone, any other bad query: ${rowName(platform)}`, () => {
      for (const action of ['content.read', 'content.locate'])
        assertNext(
          unsupported,
          { platform, action },
          {
            has: [
              /no Content API/,
              /content\.read and content\.locate .*do not call them again/,
              /page\.text \{path, match\}/,
              /content\.replace \{find, replace, path\}/
            ],
            hasNot: [/administrator/]
          },
          `${platform} ${action}`
        )
    })
}

/** A W3 refusal: `errors[]` beside the old `contract_failed` shape. */
const w3 = (/** @type {Record<string, unknown>[]} */ ...errors) => ({
  ok: false,
  error: 'contract_failed',
  message: 'Content changed; inspect again',
  errors
})
/** One W3 error on slot module-428.1 of content_home, unless `over` says otherwise. */
const e = (
  /** @type {string} */ code,
  /** @type {'recoverable' | 'unrecoverable'} */ severity,
  over = {}
) => ({
  code,
  message: `${code} message`,
  field: { slotKey: 'module-428.1', contentId: 'content_home' },
  severity,
  ...over
})

// Issue #722: the reader's masked failure (`CONTENT_SOURCE_UNAVAILABLE`, 503) told the agent to "ask the
// administrator to check source availability and contract binding", and customers read that jargon back.
// At the pinned Claude Cowork plugins (Joomla 0.24.4, WordPress 0.14.9/0.15.3) an unbound site answers 501
// `CONTENT_ADAPTER_UNSUPPORTED` instead; the 503 is any other failure inside the reader (a profile the plugin
// cannot load, two reads overlapping, a database fault). page.text reads the served page and content.replace
// writes through its own doors, so neither depends on the reader: the next names them, and no administrator.
{
  const unavailable = {
    ok: false,
    error: { code: 'CONTENT_SOURCE_UNAVAILABLE', message: 'Content source or binding could not be read' }
  }
  for (const platform of ['wordpress', 'joomla'])
    for (const action of ['content.read', 'content.locate'])
      test(`content source unavailable: the next takes the roads that do not need the reader, in plain words: ${platform} ${action}`, () => {
        assertNext(
          unavailable,
          { platform, action },
          {
            has: [
              /content\.read and content\.locate/,
              /page\.text \{path, match\}/,
              /content\.replace \{find, replace, path\}/,
              /plain words/
            ],
            hasNot: [/administrator/i, /binding/i, /contract/i, /source availability/i, /retry/i]
          },
          `${platform} ${action}`
        )
      })
  test('content source unavailable: a surface without a road is not sent down it', () => {
    assertNext(
      unavailable,
      { platform: 'joomla', actions: ['page.text', 'content.read'] },
      { has: [/page\.text/], hasNot: [/content\.replace/, /administrator/i] },
      'no replace on this surface'
    )
  })
}

// ADR 0022: at the pinned Claude Cowork plugins a site that already differs from its quickstart's design
// gets a `PRESENTATION_DRIFT` WARNING and the apply goes through. The code still comes back as an ERROR in
// two cases, and in neither was anything written: on Joomla (0.24.4, `QuickstartContract::settleDrift`) the
// apply's own write made a new difference, so the whole apply was rolled back; on WordPress (0.14.9, 0.15.3,
// `QuickstartContract::plan`) a slot no longer matches what it was bound to (a bound entity moved, the
// installed profile changed), refused before the first write. The old next said the layout "no longer
// matches its presentation lock, so nothing can be written" — a locked site, which none of them is.
{
  const drift = (/** @type {string | null} */ platform) =>
    refusalNext(w3(e('PRESENTATION_DRIFT', 'unrecoverable')), {
      platform,
      sealed: true,
      action: 'content.contract'
    }) ?? ''
  for (const [platform, has] of /** @type {[string | null, RegExp[]][]} */ ([
    ['joomla', [/own change would have altered the page's design/, /undone/]],
    ['wordpress', [/no longer matches what it was bound to/, /before anything was written/]],
    [null, [/nothing was written/i]]
  ]))
    test(`presentation drift: the refusal says what this apply did, not that the site is locked: ${rowName(platform)}`, () => {
      const next = drift(platform)
      assertText(next, {
        has: [...has, /tell the customer/, /do not resend/i],
        hasNot: [/presentation lock/i, /nothing can be written/, /work around/]
      })
      assert.ok(next.length <= 220, `${platform}: ${next.length}`)
    })
}

test('errors[]: every code gets its own next — recoverable ones say how, unrecoverable ones say stop', () => {
  const two =
    refusalNext(
      w3(
        e('SLOT_TOO_LONG', 'recoverable', {
          limit: 60,
          actual: 84,
          field: { slotKey: 'module-1.0', contentId: 'c1' }
        }),
        e('PRESENTATION_DRIFT', 'unrecoverable', { field: { slotKey: 'module-2.0', contentId: 'c2' } })
      )
    ) ?? ''
  const many = Array.from({ length: 14 }, (_, i) =>
    e('SLOT_TOO_LONG', 'recoverable', {
      limit: 5,
      actual: 9,
      field: { slotKey: `module-${i}.0`, contentId: 'c' }
    })
  )
  const listed = refusalNext(w3(...many)) ?? ''
  assert.match(two, /^2 errors \(module-1\.0, module-2\.0\)/)
  assert.match(two, /Nothing was written/, 'an unrecoverable error comes first, whatever its place')
  assert.match(listed, /^14 errors \(module-0\.0, .*module-9\.0, …\)/)
  assert.doesNotMatch(listed, /module-10\.0/)
})

{
  const cases = [
    [
      e('REVISION_STALE', 'recoverable', { current: 'rev-9' }),
      /content\.read \{id:"content_home"\}.*rev-9|rev-9.*content\.read \{id:"content_home"\}/
    ],
    [e('REVISION_REQUIRED', 'recoverable'), /content\.read \{id:"content_home"\}/],
    [e('SLOT_TOO_LONG', 'recoverable', { limit: 60, actual: 84 }), /module-428\.1.*60.*84/],
    [e('SLOT_EVIDENCE_REQUIRED', 'recoverable'), /ask the customer.*evidence\["module-428\.1"\]/i],
    [e('SLOT_NOT_CONTENT', 'recoverable'), /plain/i],
    [e('SLOT_LINK_UNSUPPORTED', 'recoverable'), /https:\/\/.*mailto:.*tel:/],
    [e('SLOT_IMAGE_INVALID', 'recoverable'), /media\.draw \{prompt, slot:"module-428\.1"\}/],
    [
      e('SLOT_LOCKED_BY_USER', 'recoverable', {
        lockedBy: { kind: 'admin-user', name: 'Anna', since: '2026-09-26T10:00:00Z', until: null }
      }),
      /Anna.*editor.*ask the customer.*saved and closed.*never write over it/i
    ],
    [e('SLOT_LOCKED_BY_USER', 'recoverable'), /someone.*editor.*ask the customer/i],
    [e('WRITER_BUSY', 'recoverable'), /few seconds.*once more/],
    [e('CONFLICT', 'recoverable'), /few seconds.*once more/],
    [e('SLOT_UNKNOWN', 'unrecoverable'), /module-428\.1.*content\.read.*tell the customer/],
    [e('SLOT_EMPTY_STATE', 'unrecoverable'), /change the layout through the CMS/],
    [e('SLOT_EDITION_MISSING', 'unrecoverable'), /language.*tell the customer/],
    [e('CHANGES_INVALID', 'unrecoverable'), /tell the customer/],
    [e('PRESENTATION_DRIFT', 'unrecoverable'), /own change would have altered.*tell the customer/i],
    [e('CONTRACT_FAILED', 'unrecoverable'), /tell the customer/]
  ]
  for (const [error, expected] of cases)
    test(`errors[]: every code gets its own next — recoverable ones say how, unrecoverable ones say stop: ${rowName(error)}`, () => {
      const next = assertNext(
        w3(error),
        { platform: 'joomla', sealed: true, action: 'content.contract' },
        { has: [expected], max: 220, generic: true },
        String(error.code)
      )
      if (error.severity === 'unrecoverable')
        assert.doesNotMatch(next, /apply (?:it )?again|once more/i, String(error.code))
    })
}

test('an open write refused because someone has the record open says who, and never to write anyway; broken JSON names the undo and the field', () => {
  const facts = { platform: 'joomla', action: 'content.update' }
  assertNext(
    { ok: false, code: 'PARAMS_NOT_JSON', field: 'params', key: 'jatools-config', offset: 970 },
    facts,
    { has: [/^params\["jatools-config"\] stops being JSON at char 970/, /whole params/] },
    'nested'
  )
  assertNext(
    { ok: false, code: 'PARAMS_NOT_JSON', field: 'attribs', key: null, offset: 3 },
    facts,
    { has: [/^attribs stops being JSON at char 3/] },
    'top'
  )
  assertNext(
    { ok: false, code: 'PARAMS_NOT_JSON', field: 'params', key: 'x'.repeat(300), offset: 99_999 },
    facts,
    {},
    'a long key still fits'
  )
})

{
  const lockedBy = {
    kind: 'admin-user',
    name: 'Ada Editor',
    since: '2026-09-26T14:32:00Z',
    until: '2026-09-26T14:34:30Z'
  }
  for (const platform of ['wordpress', 'joomla'])
    test(`an open write refused because someone has the record open says who, and never to write anyway; broken JSON names the undo and the field: ${rowName(platform)}`, () => {
      assertNext(
        {
          ok: false,
          error: 'locked',
          message: '"Welcome" is open in the editor',
          code: 'SLOT_LOCKED_BY_USER',
          lockedBy
        },
        { platform, action: 'content.update' },
        { has: [/Ada Editor.*editor.*ask the customer.*never write over it/i], generic: true },
        platform
      )
    })
}

{
  const syntax = {
    code: 'CONTRACT_FAILED',
    message: 'Syntax error',
    field: { slotKey: null, contentId: null },
    severity: 'unrecoverable'
  }
  for (const answer of [
    { ok: false, error: 'contract_failed', message: 'Syntax error', errors: [syntax] },
    { ok: false, error: 'contract_failed', message: 'Syntax error' }
  ])
    test(`an open write refused because someone has the record open says who, and never to write anyway; broken JSON names the undo and the field: ${rowName(answer)}`, () => {
      assertNext(
        answer,
        { platform: 'joomla', action: 'content.contract' },
        { has: [/apply\.revert \{apply_id\}/, /params/], hasNot: [/^The contract refused this apply/] },
        'Syntax error names the undo'
      )
    })
}

// ── budgetAnswer: a cap on arrival, cut at a record boundary, with the door's own narrowing ───────────

/** @param {number} n @param {number} size */
const rows = (n, size) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `Row ${i + 1}`, body: 'x'.repeat(size) }))

{
  const answer = { ok: true, items: rows(3, 10) }
  const exact = JSON.stringify(answer).length
  const cycle = { ok: true }
  cycle.self = cycle
  const same = [
    [answer, { maxChars: exact, listKey: 'items', next: 'x' }],
    [answer, { maxChars: exact + 1000, listKey: 'items', next: 'x' }],
    [{ ok: true, items: rows(20, 100) }, undefined],
    [{ ok: true, items: rows(20, 100) }, null],
    [{ ok: true, items: rows(20, 100) }, {}],
    [{ ok: true, items: rows(20, 100) }, { maxChars: 'x' }],
    [{ ok: true, items: rows(20, 100) }, { maxChars: -1 }],
    [{ ok: true, items: rows(20, 100) }, { maxChars: 0 }],
    [{ ok: true, items: rows(20, 100) }, { maxChars: Number.NaN }],
    [cycle, { maxChars: 10 }],
    [{ ok: true, n: 10n }, { maxChars: 1 }],
    [undefined, { maxChars: 1 }]
  ]
  for (const [value, opts] of same)
    test(`budgetAnswer: an answer within budget, or with a bad budget or an unmeasurable shape, comes back as the same object: ${rowName(value)}`, () => {
      assert.equal(budgetAnswer(value, opts), value, JSON.stringify(opts))
    })
}

test('budgetAnswer: a list is cut at a record boundary — as many whole records as fit, valid JSON, and the narrowing named', () => {
  const items = rows(60, 200)
  const answer = { ok: true, kind: 'post', items, cursor: null }
  const chars = JSON.stringify(answer).length
  const next = 'content.list {kind:"post", limit:20, offset:20} gives the next records'
  for (const maxChars of [1000, 3000, 8000, 8001, 8002, 8003]) {
    const out = /** @type {any} */ (budgetAnswer(answer, { maxChars, listKey: 'items', next }))
    const text = JSON.stringify(out)
    const shown = out.items.length
    const more = {
      ...out,
      items: items.slice(0, shown + 1),
      truncated: { shown: shown + 1, total: 60, chars }
    }

    assert.ok(text.length <= maxChars, `${text.length} > ${maxChars}`)
    assert.deepEqual(JSON.parse(text), out, 'valid JSON')
    assert.ok(shown > 0 && shown < 60)
    assert.deepEqual(out.items, items.slice(0, shown), 'whole records, from the head, unchanged')
    assert.deepEqual(
      [out.truncated, out.next, out.kind, out.cursor],
      [{ shown, total: 60, chars }, next, 'post', null]
    )
    assert.ok(JSON.stringify(more).length > maxChars, `record ${shown + 1} would have fit at ${maxChars}`)
  }
  assert.deepEqual(answer.items, items, 'the answer it was given is not changed')
})

test('budgetAnswer: every other key stays whole, a record bigger than the budget is never cut inside, and a cut answer cut again is the same', () => {
  const pages = Array.from({ length: 40 }, (_, i) => `page-${i} (menu-item-${100 + i})`)
  const blocks = Array.from({ length: 300 }, (_, i) => `module-${400 + i} [Tracy Business] Block ${i}`)
  const index = { ok: true, slotCount: 1800, pages, blocks, next: 'narrow it: {operation:"inspect", page}' }
  const opts = { maxChars: 4000, listKey: 'items', next: 'limit, offset' }
  const huge = { ok: true, map: 'm'.repeat(5000), items: rows(10, 10) }

  const out = /** @type {any} */ (budgetAnswer(index, { maxChars: 4000, listKey: 'blocks' }))
  const tight = /** @type {any} */ (budgetAnswer(index, { maxChars: 500, listKey: 'blocks', next: 'n' }))
  const big = /** @type {any} */ (
    budgetAnswer(
      {
        ok: true,
        items: [
          { id: 1, body: 'y'.repeat(5000) },
          { id: 2, body: 'z' }
        ]
      },
      { maxChars: 1000, listKey: 'items', next: 'n' }
    )
  )
  const once = budgetAnswer({ ok: true, items: rows(50, 300), total: 50 }, opts)
  const first = budgetAnswer(huge, opts)

  assert.deepEqual(out.pages, pages)
  assert.ok(out.blocks.length > 0 && out.blocks.length < 300)
  assert.equal(out.next, index.next, "without a caller's next, the answer's own is kept")
  assert.deepEqual(
    [tight.pages, tight.blocks, tight.truncated, tight.next],
    [pages, [], { shown: 0, total: 300, chars: JSON.stringify(index).length }, 'n']
  )
  assert.deepEqual([big.items, big.truncated.shown, big.truncated.total], [[], 0, 2])
  assert.equal(budgetAnswer(once, opts), once, 'idempotent')
  assert.equal(budgetAnswer(first, opts), first)
  assert.deepEqual(
    first.truncated,
    { shown: 0, total: 10, chars: JSON.stringify(huge).length },
    'a second pass keeps the original’s numbers'
  )
})

test('budgetAnswer: no list keeps its small keys whole and says what the rest hold; a bare list or value still comes back as valid, capped JSON; __proto__ stays a key', () => {
  const answer = {
    ok: true,
    kind: 'post',
    id: 42,
    fields: { post_title: 'Home', post_content: '<!-- wp:group -->'.repeat(1500) },
    truncated: false
  }
  const list = rows(30, 100)
  const proto = JSON.parse(`{"__proto__":{"x":1},"items":${JSON.stringify(rows(20, 100))}}`)

  const noList = /** @type {any} */ (
    budgetAnswer(answer, { maxChars: 2000, next: 'content.get {kind, id, match}' })
  )
  const bare = /** @type {any} */ (budgetAnswer(list, { maxChars: 1500, next: 'n' }))
  const value = budgetAnswer('w'.repeat(3000), { maxChars: 500, next: 'n' })
  const notList = /** @type {any} */ (
    budgetAnswer({ ok: true, items: rows(20, 100) }, { maxChars: 300, listKey: 'truncated', next: 'n' })
  )
  const protoOut = /** @type {any} */ (budgetAnswer(proto, { maxChars: 1000, listKey: 'items', next: 'n' }))

  assert.ok(JSON.stringify(noList).length <= 2000)
  assert.deepEqual([noList.ok, noList.kind, noList.id], [true, 'post', 42])
  assert.equal(
    noList.fields,
    `(not shown: ${JSON.stringify(answer.fields).length} chars; keys post_title, post_content)`
  )
  assert.deepEqual(noList.truncated, { shown: 3, total: 4, chars: JSON.stringify(answer).length })
  assert.deepEqual(Object.keys(noList), ['ok', 'kind', 'id', 'fields', 'truncated', 'next'])
  assert.ok(JSON.stringify(bare).length <= 1500 && bare.truncated.total === 30)
  assert.deepEqual(bare.items, list.slice(0, bare.items.length))
  assert.deepEqual(value, {
    answer: '(not shown: 3002 chars)',
    truncated: { shown: 0, total: 1, chars: 3002 },
    next: 'n'
  })
  assert.equal(typeof notList.items, 'string', 'a listKey that is not a list falls back to keys')
  assert.equal(JSON.parse(JSON.stringify(notList)).truncated.total, 2)
  assert.ok(Object.hasOwn(protoOut, '__proto__'))
  assert.match(JSON.stringify(protoOut), /^\{"__proto__":\{"x":1\},"items":/)
})

// ── Imported sites: the contract the plugin derives from their own database (29/09/2026) ──────────

test('refusalNext: derive is import provisioning’s; the door refuses it to every seat and says so', () => {
  const next = refusalNext({ ok: false, code: 'CONTRACT_OPERATION_PROVISION_ONLY', operation: 'derive' })
  assert.match(next, /import provisioning/)
  assert.match(next, /content\.contract \{operation:"apply"/)
  assert.doesNotMatch(next, /derive again|retry/i)
})

test('W3 on a derived site: an unwritable slot says read again; a picture says upload it to the library first', () => {
  const unwritable = refusalNext(w3(e('SLOT_UNWRITABLE', 'recoverable')), {
    platform: 'wordpress',
    action: 'content.contract'
  })
  assert.match(unwritable, /module-428\.1/)
  assert.match(unwritable, /content\.read/)
  const picture = refusalNext(w3(e('SLOT_IMAGE_INVALID', 'recoverable')), {
    platform: 'wordpress',
    action: 'content.contract'
  })
  assert.match(picture, /media\.upload/)
  assert.match(picture, /web address/)
  assert.match(picture, /media\.draw \{prompt, slot:"module-428\.1"\}/)
})

// 🔒 09/10/2026 (bench hb: 2 WordPress deletes): the model rewrote the door's question with an id of its own
// ("confirm-delete"), ask_user_question refused it as no question Tracy wrote, and the step was spent. Each
// CONFIRM_FIRST next says the id goes as given, beside the options' order and the customer's own words.
test("CONFIRM_FIRST: every next says the question id goes as given, the options in order, the words the customer's — within 200 characters", () => {
  for (const extra of [{}, { languages: 3 }, { otherLanguages: 2 }]) {
    const next = refusalNext({ ok: false, code: 'CONFIRM_FIRST', ...extra }, { platform: 'wordpress' }) ?? ''
    assert.match(
      next,
      /^ask_user_question with this answer's ask \(id as given, options in order, customer's words\); /
    )
    assert.match(next, /the same call with confirm:true/)
    assert.ok(next.length <= 200, `${next.length}: ${next}`)
  }
})

test('planCall: content.renderedWords is the engine’s own call, refused to the agent with or without the surface list', () => {
  // 🔒 Fail closed (review 23/10/2026): a surface whose action list did not load must not open it.
  for (const opts of [{}, { actions: ['content.replace', 'content.renderedWords'] }]) {
    const out = planCall({ action: 'content.renderedWords', params: { operation: 'apply' } }, opts)
    assert.deepEqual([out.ok, out.code], [false, 'NOT_ON_THIS_PLATFORM'], JSON.stringify(out))
    assertNext(
      out,
      { platform: 'wordpress', actions: opts.actions ?? null },
      { has: [/content\.replace \{find, replace, path\}/] },
      'engine only'
    )
    assert.ok(!out.actions?.includes('content.renderedWords'), 'never offered back')
  }
})

test('CONFIRM_FIRST retry explains missing consent without widening the approved call', () => {
  const next =
    refusalNext({ ok: false, code: 'CONFIRM_FIRST', confirmationMissing: true }, { platform: 'wordpress' }) ??
    ''
  assert.match(next, /confirm:true is not consent/)
  assert.match(next, /wait for the customer/)
  assert.ok(next.length <= 200)
})
