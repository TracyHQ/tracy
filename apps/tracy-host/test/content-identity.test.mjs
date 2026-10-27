import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  backfillContentIdentity,
  CONTENT_IDENTITY_MARKER,
  CONTRACT_DERIVED_MARKER,
  JOOMLA_EXEC,
  JOOMLA_DERIVE_EXEC,
  LOCK_BUSY,
  JOOMLA_SCRIPT,
  judgeWordPress,
  judgeDerive,
  provisionLock
} from '../src/content-identity.js'
import { start } from '../src/server.js'

// 🔒 27/09/2026: a site provisioned before 25/09 never got its content identity, so `content.read` and
// the Comment picker's `content.locate` answered CONTENT_ADAPTER_UNSUPPORTED on it forever (13 refused
// calls in 24 bench cases). tracy-host now gives it one at start-up, the provision's way, seed kept.

const FLEET_SCRIPTS = new URL('../../../packages/fleet/tracy-fleet-operation/scripts', import.meta.url)
  .pathname
const quiet = { log() {}, warn() {} }

/** A site folder as provision leaves it under the private root, and its webroot under the sites root. */
async function site(
  roots,
  label,
  { platform, port = 52001, token = 'a'.repeat(48), marker = false, compose = true } = {}
) {
  const dir = path.join(roots.privateRoot, label)
  await mkdir(dir, { recursive: true })
  if (compose) await writeFile(path.join(dir, 'docker-compose.yml'), 'services: {}\n')
  if (platform)
    await writeFile(path.join(dir, '.env'), `HOST_PORT=${port}\nPLATFORM=${platform}\nDB_PASSWORD=x\n`)
  if (platform === 'wordpress' && token) await writeFile(path.join(dir, 'tracy-agent.token'), `${token}\n`)
  if (marker) await writeFile(path.join(dir, CONTENT_IDENTITY_MARKER), '')
  await mkdir(path.join(roots.sitesRoot, label, '.webroot'), { recursive: true })
  return dir
}

async function roots() {
  const base = await mkdtemp(path.join(tmpdir(), 'content-identity-'))
  const r = {
    base,
    privateRoot: path.join(base, 'private'),
    sitesRoot: path.join(base, 'sites'),
    scriptsDir: FLEET_SCRIPTS
  }
  await mkdir(r.privateRoot, { recursive: true })
  await mkdir(r.sitesRoot, { recursive: true })
  return r
}

const marked = (dir) =>
  stat(path.join(dir, CONTENT_IDENTITY_MARKER)).then(
    () => true,
    () => false
  )

const derived = (dir) =>
  stat(path.join(dir, CONTRACT_DERIVED_MARKER)).then(
    () => true,
    () => false
  )

/** `.tracy/site.json`, in the SITE folder under the sites root — not the private root (`siteFolder.mjs:854`). */
async function siteJson(roots, label, { origin } = {}) {
  const dir = path.join(roots.sitesRoot, label, '.tracy')
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'site.json'),
    `${JSON.stringify({ siteKey: label, platform: null, ...(origin ? { origin } : {}) }, null, 1)}\n`
  )
}

/**
 * A `run` that answers the provision lock probe and the Joomla exec per site folder, and records
 * every call. `joomla[dir]` is `{ code, tail }` or a function that throws.
 */
function fakeRun({ joomla = {}, busy = [] } = {}) {
  const calls = []
  const run = async (input) => {
    calls.push(input)
    if (input.script === 'flock')
      return { code: busy.some((label) => input.args[1] === provisionLock(label)) ? 1 : 0, tail: [] }
    if (input.script === 'bash') {
      // Joomla's pass runs INSIDE the lock (`JOOMLA_EXEC`, 28/09): `args[3]` is the lock file and
      // `args[4]` the site folder. A lock `flock -n -E 75` cannot take answers 75, which no other road
      // here returns — `docker compose exec` answers 1 for "service is not running".
      if (busy.some((label) => input.args[3] === provisionLock(label))) return { code: LOCK_BUSY, tail: [] }
      const answer = joomla[input.args[4]] ?? { code: 0, tail: ['TRACY_RESULT content_reader=enabled'] }
      if (typeof answer === 'function') return answer()
      return answer
    }
    throw new Error(`unexpected script ${input.script}`)
  }
  return { run, calls }
}

/** A fetch that answers per URL prefix; `refused` prefixes reject the way Node's fetch does. */
function fakeFetch({ answers = {}, refused = [] } = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) })
    const hit = refused.find((prefix) => String(url).startsWith(prefix))
    if (hit) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    const key = Object.keys(answers).find((prefix) => String(url).startsWith(prefix))
    const answer =
      key === undefined ? { status: 200, body: { ok: true, identity: { total: 3 } } } : answers[key]
    return new Response(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body), {
      status: answer.status ?? 200
    })
  }
  return { fetchImpl, calls }
}

test('runs once per site: WordPress and Joomla are set up, marked, and left alone the next time', async () => {
  const r = await roots()
  try {
    const wp = await site(r, 'wp-old', { platform: 'wordpress', port: 52011 })
    const jo = await site(r, 'jo-old', { platform: 'joomla' })
    const { run, calls } = fakeRun()
    const { fetchImpl, calls: posts } = fakeFetch()
    const lines = []
    const first = await backfillContentIdentity({
      config: r,
      run,
      fetchImpl,
      log: { log: (m) => lines.push(m), warn: (m) => lines.push(m) }
    })
    assert.deepEqual(first.enabled, ['jo-old', 'wp-old'])
    assert.deepEqual([first.skipped, first.failed], [[], []])
    assert.ok(await marked(wp))
    assert.ok(await marked(jo))
    // The WordPress door, on the site's own loopback port, with its own token.
    assert.equal(posts.length, 1)
    assert.equal(posts[0].url, 'http://127.0.0.1:52011/wp-admin/admin-ajax.php?action=claude_cowork')
    assert.equal(posts[0].init.method, 'POST')
    assert.equal(posts[0].init.redirect, 'manual')
    assert.deepEqual(posts[0].body, {
      token: 'a'.repeat(48),
      action: 'content.identity',
      params: { newSite: false }
    })
    // The Joomla script, down the site's own container, from the site's own folder.
    const exec = calls.filter((c) => c.script === 'bash')
    assert.equal(exec.length, 1)
    // The lock file rides between the name and the site folder: `flock` takes it, and the pass runs
    // inside it — a provision starting beside this one cannot interleave (28/09).
    assert.deepEqual(exec[0].args, ['-c', JOOMLA_EXEC, 'content-identity', provisionLock('jo-old'), jo])
    assert.match(JOOMLA_EXEC, /flock -n -E 75 "\$1"/)
    // the pass boots Joomla: as root it left cache folders the web user could not write again
    assert.match(JOOMLA_EXEC, /docker compose exec -T -u www-data web php/)
    assert.match(JOOMLA_DERIVE_EXEC, /docker compose exec -T -u www-data -e TRACY_LABEL/)
    assert.equal(exec[0].stdin, await readFile(path.join(FLEET_SCRIPTS, JOOMLA_SCRIPT), 'utf8'))
    assert.ok(lines.some((l) => /wp-old: content identity set up \(WordPress, 3 rows/.test(l)))
    assert.ok(lines.some((l) => /content identity: 2 site\(s\) set up, 0 skipped/.test(l)))

    // A second start finds both marked: no probe, no exec, no request, no line.
    const again = fakeRun()
    const againFetch = fakeFetch()
    const silent = []
    const second = await backfillContentIdentity({
      config: r,
      run: again.run,
      fetchImpl: againFetch.fetchImpl,
      log: { log: (m) => silent.push(m), warn: (m) => silent.push(m) }
    })
    assert.deepEqual(second, { enabled: [], skipped: [], failed: [], why: {} })
    assert.deepEqual([again.calls.length, againFetch.calls.length, silent.length], [0, 0, 0])
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})

test('a site the provision already marked is never touched, whichever CMS it is', async () => {
  const r = await roots()
  try {
    await site(r, 'wp-new', { platform: 'wordpress', marker: true })
    await site(r, 'jo-new', { platform: 'joomla', marker: true })
    const { run, calls } = fakeRun()
    const { fetchImpl, calls: posts } = fakeFetch()
    const out = await backfillContentIdentity({ config: r, run, fetchImpl, log: quiet })
    assert.deepEqual(out, { enabled: [], skipped: [], failed: [], why: {} })
    assert.deepEqual([calls.length, posts.length], [0, 0])
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})

test('a Claude Cowork plugin without the reader is skipped, not failed, and not marked — so an upgrade is picked up later', async () => {
  const r = await roots()
  try {
    const wp = await site(r, 'wp-013', { platform: 'wordpress' })
    const none = await site(r, 'jo-017', { platform: 'joomla' })
    const j5 = await site(r, 'jo-j5', { platform: 'joomla' })
    const rc = await site(r, 'jo-rc3', { platform: 'joomla' })
    const nodoor = await site(r, 'wp-nodoor', { platform: 'wordpress', port: 52020 })
    const notoken = await site(r, 'wp-notoken', { platform: 'wordpress', token: '' })
    const say = (word) => ({
      code: 0,
      tail: [`    content reader: … — skipped`, `TRACY_RESULT content_reader=${word}`]
    })
    const { run } = fakeRun({
      joomla: { [none]: say('none'), [j5]: say('unsupported'), [rc]: say('outdated') }
    })
    const { fetchImpl } = fakeFetch({
      answers: {
        // WordPress 0.13.x: the engine's own refusal of an action it does not know.
        'http://127.0.0.1:52001/': {
          body: { ok: false, error: 'bad_action', message: 'unknown action: content.identity' }
        },
        // No active plugin registered the ajax action: WordPress's own "0".
        'http://127.0.0.1:52020/': { status: 400, body: '0' }
      }
    })
    const out = await backfillContentIdentity({ config: r, run, fetchImpl, log: quiet })
    assert.deepEqual(out.skipped, ['jo-017', 'jo-j5', 'jo-rc3', 'wp-013', 'wp-nodoor', 'wp-notoken'])
    assert.deepEqual([out.enabled, out.failed], [[], []])
    assert.match(out.why['wp-013'], /has no reader/)
    assert.match(out.why['jo-rc3'], /menu-trigger fix/)
    for (const dir of [wp, none, j5, rc, nodoor, notoken]) assert.equal(await marked(dir), false, dir)
    // Upgraded since: the next start sets it up.
    const later = await backfillContentIdentity({
      config: r,
      run: fakeRun().run,
      fetchImpl: fakeFetch().fetchImpl,
      log: quiet
    })
    assert.ok(later.enabled.includes('wp-013') && later.enabled.includes('jo-017'))
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})

test('never a new-site pass: WordPress is sent newSite:false, Joomla runs without TRACY_NEW_SITE', async () => {
  const r = await roots()
  const before = process.env.TRACY_NEW_SITE
  // Even a process started with it set must not hand it on.
  process.env.TRACY_NEW_SITE = '1'
  try {
    await site(r, 'wp-a', { platform: 'wordpress' })
    await site(r, 'jo-a', { platform: 'joomla' })
    const { run, calls } = fakeRun()
    const { fetchImpl, calls: posts } = fakeFetch()
    await backfillContentIdentity({ config: r, run, fetchImpl, log: quiet })
    for (const post of posts) {
      assert.equal(post.body.params.newSite, false)
      assert.equal('requestId' in post.body.params, false)
    }
    for (const call of calls) {
      assert.ok(!JSON.stringify(call.args).includes('TRACY_NEW_SITE'), 'no -e TRACY_NEW_SITE on the exec')
      if (call.script === 'bash') assert.equal(call.env.TRACY_NEW_SITE, undefined)
    }
    assert.equal(calls.filter((c) => c.script === 'bash').length, 1)
  } finally {
    if (before === undefined) delete process.env.TRACY_NEW_SITE
    else process.env.TRACY_NEW_SITE = before
    await rm(r.base, { recursive: true, force: true })
  }
})

test('a failure on one site does not stop the others, and a failed site is tried again next time', async () => {
  const r = await roots()
  try {
    const down = await site(r, 'a-down', { platform: 'joomla' })
    const broken = await site(r, 'b-broken', { platform: 'joomla' })
    const away = await site(r, 'c-away', { platform: 'wordpress', port: 52030 })
    const refused = await site(r, 'd-refused', { platform: 'wordpress', port: 52040, token: 'b'.repeat(48) })
    const fine = await site(r, 'e-fine', { platform: 'joomla' })
    const { run } = fakeRun({
      joomla: {
        [down]: { code: 1, tail: ['service "web" is not running'] },
        [broken]: () => {
          throw new Error('spawn exploded')
        }
      }
    })
    const { fetchImpl, calls: posts } = fakeFetch({
      refused: ['http://127.0.0.1:52030/', 'http://c-away-web-1/'],
      answers: {
        'http://127.0.0.1:52040/': {
          status: 200,
          body: { ok: false, error: 'unauthorized', message: 'invalid or missing token' }
        }
      }
    })
    const warnings = []
    const out = await backfillContentIdentity({
      config: r,
      run,
      fetchImpl,
      log: { log() {}, warn: (m) => warnings.push(m) }
    })
    assert.deepEqual(out.enabled, ['e-fine'])
    assert.deepEqual(out.failed, ['a-down', 'b-broken', 'c-away', 'd-refused'])
    assert.match(out.why['a-down'], /service "web" is not running/)
    assert.match(out.why['b-broken'], /spawn exploded/)
    assert.match(out.why['c-away'], /did not answer \(ECONNREFUSED\)/)
    assert.match(out.why['d-refused'], /invalid or missing token/)
    // Both roads to the unreachable site were tried, loopback first.
    assert.deepEqual(
      posts
        .filter((p) => p.url.includes('52030') || p.url.includes('c-away'))
        .map((p) => p.url.split('/wp-admin')[0]),
      ['http://127.0.0.1:52030', 'http://c-away-web-1']
    )
    assert.equal(warnings.filter((w) => /tried again at the next start/.test(w)).length, 4)
    for (const dir of [down, broken, away, refused]) assert.equal(await marked(dir), false, dir)
    assert.equal(await marked(fine), true)
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})

test('on a Mac stand the loopback port is refused and the web container name is the road', async () => {
  const r = await roots()
  try {
    const wp = await site(r, 'wp-mac', { platform: 'wordpress', port: 52050 })
    const { fetchImpl, calls } = fakeFetch({ refused: ['http://127.0.0.1:52050/'] })
    const out = await backfillContentIdentity({ config: r, run: fakeRun().run, fetchImpl, log: quiet })
    assert.deepEqual(out.enabled, ['wp-mac'])
    assert.deepEqual(
      calls.map((c) => c.url),
      [
        'http://127.0.0.1:52050/wp-admin/admin-ajax.php?action=claude_cowork',
        'http://wp-mac-web-1/wp-admin/admin-ajax.php?action=claude_cowork'
      ]
    )
    assert.ok(await marked(wp))
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})

test('a site a provision is running on is left for the next start', async () => {
  const r = await roots()
  try {
    const jo = await site(r, 'jo-building', { platform: 'joomla' })
    await site(r, 'wp-building', { platform: 'wordpress' })
    const { run, calls } = fakeRun({ busy: ['jo-building', 'wp-building'] })
    const { fetchImpl, calls: posts } = fakeFetch()
    const out = await backfillContentIdentity({ config: r, run, fetchImpl, log: quiet })
    assert.deepEqual(out.skipped, ['jo-building', 'wp-building'])
    assert.match(out.why['jo-building'], /provision of this site is running/)
    // Joomla is one call, the lock and the pass together; WordPress still probes before its HTTP door.
    assert.deepEqual(
      calls.map((c) => c.script),
      ['bash', 'flock']
    )
    assert.equal(calls[0].args[3], provisionLock('jo-building'), 'the pass ran under the lock')
    assert.equal(posts.length, 0)
    assert.equal(await marked(jo), false)
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})

test('only WordPress and Joomla stacks are touched: EmDash, folders with no stack, and non-site names are not', async () => {
  const r = await roots()
  try {
    await site(r, 'em-site', { platform: 'emdash' })
    await site(r, 'half-built', { platform: 'joomla', compose: false })
    await mkdir(path.join(r.privateRoot, '_brands'), { recursive: true })
    await writeFile(path.join(r.privateRoot, '.network-allocator.lock'), '')
    // An old site with no PLATFORM line: its webroot says which CMS it is.
    const old = await site(r, 'jo-no-env', {})
    await writeFile(path.join(r.sitesRoot, 'jo-no-env', '.webroot', 'configuration.php'), '<?php\n')
    const { run, calls } = fakeRun()
    const { fetchImpl, calls: posts } = fakeFetch()
    const out = await backfillContentIdentity({ config: r, run, fetchImpl, log: quiet })
    assert.deepEqual(out.enabled, ['jo-no-env'])
    assert.deepEqual([out.skipped, out.failed], [[], []])
    assert.deepEqual(
      calls.filter((c) => c.script === 'bash').map((c) => c.args[4]),
      [old]
    )
    assert.equal(posts.length, 0)
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})

test('a missing private root is nothing to do, never a failure', async () => {
  const out = await backfillContentIdentity({
    config: {
      privateRoot: '/nonexistent/private',
      sitesRoot: '/nonexistent/sites',
      scriptsDir: FLEET_SCRIPTS
    },
    run: fakeRun().run,
    log: quiet
  })
  assert.deepEqual(out, { enabled: [], skipped: [], failed: [], why: {} })
})

test('judgeWordPress reads the plugin the way the provision does', () => {
  assert.equal(judgeWordPress(200, JSON.stringify({ ok: true, identity: { total: 171 } })).state, 'enabled')
  assert.equal(
    judgeWordPress(200, '{"ok":false,"error":"bad_action","message":"unknown action: content.identity"}')
      .state,
    'skipped'
  )
  assert.equal(judgeWordPress(400, '0').state, 'skipped')
  assert.equal(judgeWordPress(500, '<html>fatal</html>').state, 'failed')
  assert.equal(
    judgeWordPress(200, '{"ok":false,"error":"failed","message":"Content identity could not be set up"}')
      .state,
    'failed'
  )
})

// The lock, the marker and the outcome words are shared with the fleet scripts; that wiring is held by
// gate `infra-contracts`. What is behaviour here is the lock path a label maps to.
test('provisionLock: a label maps to the lock file provision.sh holds for it', () => {
  assert.equal(provisionLock('x'), '/var/lock/tracy-provision-x.lock')
})

test('an imported site whose content identity is already done gets its contract derived, once', async () => {
  const r = await roots()
  try {
    const wp = await site(r, 'wp-imported', { platform: 'wordpress', port: 52060, marker: true })
    await siteJson(r, 'wp-imported', { origin: 'imported' })
    const { run, calls } = fakeRun()
    const { fetchImpl, calls: posts } = fakeFetch({
      answers: {
        'http://127.0.0.1:52060/': {
          body: { ok: true, contract: { dir: 'derived' }, entities: 12, slots: 30, calibrated: true }
        }
      }
    })
    const lines = []
    const out = await backfillContentIdentity({
      config: r,
      run,
      fetchImpl,
      log: { log: (m) => lines.push(m), warn: (m) => lines.push(m) }
    })
    // Identity was already done: the identity pass itself does nothing (no `enabled`/`skipped`/`failed`).
    assert.deepEqual(out, { enabled: [], skipped: [], failed: [], why: {} })
    assert.equal(calls.length, 0)
    assert.equal(posts.length, 1)
    assert.equal(posts[0].url, 'http://127.0.0.1:52060/wp-admin/admin-ajax.php?action=claude_cowork')
    assert.deepEqual(posts[0].body, {
      token: 'a'.repeat(48),
      action: 'content.contract',
      params: { operation: 'derive', label: 'wp-imported', requestId: 'backfill-wp-imported' }
    })
    assert.ok(await derived(wp))
    assert.ok(
      lines.some((l) =>
        /wp-imported: content contract derived \(derived, 12 entities, 30 slots, calibrated=1\)/.test(l)
      )
    )

    // A second start: already derived — no second call, no marker rewrite.
    const again = fakeFetch()
    const out2 = await backfillContentIdentity({
      config: r,
      run: fakeRun().run,
      fetchImpl: again.fetchImpl,
      log: quiet
    })
    assert.deepEqual(out2, { enabled: [], skipped: [], failed: [], why: {} })
    assert.equal(again.calls.length, 0)
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})

test('an old Claude Cowork plugin without the derive operation is skipped, not failed, and not marked', async () => {
  const r = await roots()
  try {
    const wp = await site(r, 'wp-old-plugin', { platform: 'wordpress', port: 52061, marker: true })
    await siteJson(r, 'wp-old-plugin', { origin: 'imported' })
    const { fetchImpl, calls: posts } = fakeFetch({
      answers: {
        'http://127.0.0.1:52061/': {
          body: { ok: false, error: 'bad_params', message: 'unknown contract operation: derive' }
        }
      }
    })
    const out = await backfillContentIdentity({ config: r, run: fakeRun().run, fetchImpl, log: quiet })
    assert.deepEqual(out, { enabled: [], skipped: [], failed: [], why: {} })
    assert.equal(posts.length, 1)
    assert.equal(await derived(wp), false)
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})

test('a site that is not imported never gets a derive call', async () => {
  const r = await roots()
  try {
    const wp = await site(r, 'wp-native', { platform: 'wordpress', port: 52062, marker: true })
    // No .tracy/site.json at all: unknown origin, treated like a native site.
    const { fetchImpl, calls: posts } = fakeFetch()
    const out = await backfillContentIdentity({ config: r, run: fakeRun().run, fetchImpl, log: quiet })
    assert.deepEqual(out, { enabled: [], skipped: [], failed: [], why: {} })
    assert.equal(posts.length, 0)
    assert.equal(await derived(wp), false)

    // Explicitly `origin: "native"` (or anything but `"imported"`) is the same as absent.
    await siteJson(r, 'wp-native', { origin: 'native' })
    const again = fakeFetch()
    await backfillContentIdentity({ config: r, run: fakeRun().run, fetchImpl: again.fetchImpl, log: quiet })
    assert.equal(again.calls.length, 0)
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})

test('Joomla derive runs a dedicated exec carrying TRACY_LABEL, distinct from the identity exec', async () => {
  const r = await roots()
  try {
    const jo = await site(r, 'jo-imported', { platform: 'joomla', marker: true })
    await siteJson(r, 'jo-imported', { origin: 'imported' })
    const calls = []
    const run = async (input) => {
      calls.push(input)
      if (input.script === 'bash')
        return { code: 0, tail: ['TRACY_RESULT derived=bound entities=8 slots=20 calibrated=1'] }
      throw new Error(`unexpected script ${input.script}`)
    }
    const out = await backfillContentIdentity({
      config: r,
      run,
      fetchImpl: fakeFetch().fetchImpl,
      log: quiet
    })
    assert.deepEqual(out, { enabled: [], skipped: [], failed: [], why: {} })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].script, 'bash')
    assert.deepEqual(calls[0].args, [
      '-c',
      JOOMLA_DERIVE_EXEC,
      'contract-derive',
      provisionLock('jo-imported'),
      jo,
      'jo-imported'
    ])
    assert.match(JOOMLA_DERIVE_EXEC, /-e TRACY_LABEL="\$3"/)
    assert.notEqual(JOOMLA_DERIVE_EXEC, JOOMLA_EXEC)
    assert.ok(await derived(jo))
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})

test('judgeDerive reads the plugin the way this pass does', () => {
  assert.equal(
    judgeDerive(200, JSON.stringify({ ok: true, contract: {}, entities: 5, slots: 9, calibrated: false }))
      .state,
    'enabled'
  )
  assert.equal(
    judgeDerive(200, '{"ok":false,"error":"bad_action","message":"unknown action: content.contract"}').state,
    'skipped'
  )
  assert.equal(judgeDerive(400, '0').state, 'skipped')
  assert.equal(judgeDerive(500, '<html>fatal</html>').state, 'failed')
})

test('start: runs the pass in the background after the mtime pass, and TRACY_HOST_CONTENT_IDENTITY=0 turns it off', async () => {
  const r = await roots()
  try {
    const jo = await site(r, 'jo-boot', { platform: 'joomla' })
    const env = {
      HOST_NAME: 'local',
      HOST_SECRET: 's',
      TRACY_SITES_ROOT: r.sitesRoot,
      TRACY_PRIVATE_ROOT: r.privateRoot,
      TRACY_FLEET_DIR: FLEET_SCRIPTS,
      PORT: '0'
    }
    const off = fakeRun()
    const stopped = await start({
      env: { ...env, TRACY_HOST_CONTENT_IDENTITY: '0' },
      log: quiet,
      run: off.run
    })
    assert.deepEqual(await stopped.identified, { enabled: [], skipped: [], failed: [], why: {} })
    await stopped.close()
    assert.equal(off.calls.length, 0)
    assert.equal(await marked(jo), false)
    const on = fakeRun()
    const running = await start({ env, log: quiet, run: on.run })
    assert.deepEqual((await running.identified).enabled, ['jo-boot'])
    await running.close()
    assert.equal(await marked(jo), true)
  } finally {
    await rm(r.base, { recursive: true, force: true })
  }
})
