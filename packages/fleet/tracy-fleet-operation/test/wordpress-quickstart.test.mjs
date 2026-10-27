/**
 * The WordPress quickstart road through provision, as behaviour: `quickstart.py` is RUN against the
 * catalogue and against catalogues of its own, and the two shell pieces that can run without a host
 * (the AcyMailing key rewrite, the site-address builder) are RUN against a docker stand-in.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/wordpress-quickstart.test.mjs
 *
 * What the shell must merely CONTAIN (the order of its steps, the names it shares with the catalogue
 * and the hook servers) is a cross-file rule and lives in gate `infra-contracts`.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { sh as shAsync } from './sh-async.mjs'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const read = (name) => readFileSync(new URL(name, new URL('../scripts/provision/', import.meta.url)), 'utf8')
const py = (...args) =>
  spawnSync('python3', [`${PROVISION}quickstart.py`, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TRACY_RELEASES_GITHUB_TOKEN: '' }
  })

const catalog = JSON.parse(read('quickstarts.json'))

for (const [id, entry] of Object.entries(catalog)) {
  test(`quickstart.py --platform: ${id} answers ${entry.platform}, as the catalogue says`, () => {
    assert.equal(py('--id', id, '--platform').stdout.trim(), entry.platform)
  })
}

test('quickstart.py: an unknown id, and a field the entry lacks, are refused', () => {
  const unknown = py('--id', 'nope/x1', '--platform')
  assert.notEqual(unknown.status, 0)
  assert.match(unknown.stderr, /unknown quickstart/)
  const missing = py('--id', 'tracy-apple/j6', '--field', 'coworkMinVersion')
  assert.notEqual(missing.status, 0)
})

test('an unpinned part is refused before any download, and says why', () => {
  // Every real entry is pinned now, so the invariant is proven on a catalog of its own.
  const dir = mkdtempSync(join(tmpdir(), 'qs-'))
  const unpinned = {
    'demo/x1': {
      platform: 'wordpress',
      version: '0.0.1',
      webroot: {
        file: 'w.tar.gz',
        url: 'https://example.invalid/w.tar.gz',
        sha256: null,
        bytes: null,
        pending: 'release not published yet'
      },
      database: {
        file: 'd.sql.gz',
        url: 'https://example.invalid/d.sql.gz',
        sha256: null,
        bytes: null,
        pending: 'release not published yet'
      }
    }
  }
  const file = join(dir, 'quickstarts.json')
  writeFileSync(file, JSON.stringify(unpinned))
  for (const part of ['webroot', 'database']) {
    const r = spawnSync(
      'python3',
      [join(PROVISION, 'quickstart.py'), '--id', 'demo/x1', '--part', part, '--out', '/dev/null'],
      {
        encoding: 'utf8',
        env: { ...process.env, TRACY_RELEASES_GITHUB_TOKEN: '', TRACY_QUICKSTARTS_JSON: file }
      }
    )
    assert.notEqual(r.status, 0, part)
    assert.match(r.stderr, /not pinned yet/)
    assert.match(r.stderr, /not published/)
  }
})

test('a pinned private entry asks for the releases token before any network', () => {
  const [id] = Object.entries(catalog).find(([, entry]) => entry.webroot?.githubAssetId) ?? []
  assert.ok(id, 'the catalogue has no private (asset-id) entry to ask about')
  const pinned = py('--id', id, '--part', 'webroot', '--out', '/dev/null')
  assert.notEqual(pinned.status, 0)
  assert.match(pinned.stderr, /TRACY_RELEASES_GITHUB_TOKEN/)
})

// A restored archive carries the build's AcyMailing keys; every site restored from one release
// would share them. The function is RUN against a docker stand-in that answers the table lookup and
// records the write, so the keys themselves are checked, not the text that makes them.
test('a restored site with AcyMailing gets three keys of its own; one without is left alone', () => {
  const sh = read('platform/wordpress.sh')
  const start = sh.indexOf('tracy_wp_acym_keys() {')
  const fn = sh.slice(start, sh.indexOf('\n}\n', start) + 3)
  const dir = mkdtempSync(join(tmpdir(), 'acym-'))
  const docker = join(dir, 'docker')
  // `$FOUND` answers the lookup; a REPLACE is recorded, or refused when `$REFUSE` is set.
  writeFileSync(
    docker,
    '#!/bin/sh\nfor a; do sql="$a"; done\ncase "$sql" in\n' +
      '  SELECT*) echo "$FOUND" ;;\n' +
      '  REPLACE*) [ -z "$REFUSE" ] || exit 1; printf "%s\\n" "$sql" >> "$DIR/writes" ;;\nesac\n'
  )
  chmodSync(docker, 0o755)
  const run = (env) =>
    spawnSync('bash', ['-c', `set -euo pipefail\n${fn}\ntracy_wp_acym_keys tr_`], {
      encoding: 'utf8',
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        SITE_DIR: dir,
        DIR: dir,
        DB_NAME: 'wordpress',
        DB_PASSWORD: 'x',
        ...env
      }
    })

  const none = run({ FOUND: '0' })
  assert.equal(none.status, 0, none.stderr)
  assert.equal(existsSync(join(dir, 'writes')), false, 'no AcyMailing, no write')

  for (const _ of [1, 2]) assert.equal(run({ FOUND: '1' }).status, 0)
  const writes = readFileSync(join(dir, 'writes'), 'utf8').trim().split('\n')
  const keys = writes.map((sql) => {
    const m =
      /^REPLACE INTO `tr_acym_configuration` \(name, value\) VALUES \('api_key', '([0-9A-Za-z]{30})'\), \('cron_key', '([0-9A-Za-z]{30})'\), \('security_key', '([0-9A-Za-z]{30})'\)$/.exec(
        sql
      )
    assert.ok(m, `the write names the three keys in AcyMailing's shape: ${sql}`)
    return m.slice(1)
  })
  assert.equal(new Set(keys.flat()).size, 6, 'every key is fresh, across keys and across runs')

  const refused = run({ FOUND: '1', REFUSE: '1' })
  assert.notEqual(refused.status, 0, 'a table that cannot be rewritten stops the provision')
  assert.match(refused.stderr, /could not write this site's own AcyMailing keys/)
})

test('a release that pins no plugin is bound through the latest one; a bind it cannot make never stops the provision', (t) => {
  const sh = read('platform/wordpress.sh')
  const start = sh.indexOf('tracy_wp_bind_latest() {')
  assert.notEqual(start, -1)
  const fn = sh.slice(start, sh.indexOf('\n}\n', start) + 3)
  const dir = mkdtempSync(join(tmpdir(), 'bind-latest-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const marker = join(dir, 'site.json')
  const before =
    '{"contract":"ja-x/wp7/1.0.2","platform":"wordpress","quickstart":"quickstart/ja-x/wp7","coworkMinVersion":"0.17.2","coworkContractVersion":"","policy":1}\n'
  // The helpers the function calls, as the provision defines them: `$BIND` decides the bind,
  // `$TRACY_WP_COWORK_INSTALLED` is the version the install step recorded, every wp-cli line is recorded.
  const stubs =
    'tracy_wp_bind_contract() { [ "$BIND" = ok ]; }\n' +
    'tracy_wp() { printf "%s\\n" "$1" >> "$DIR/wp"; }\n' +
    'tracy_wp_content_identity() { echo reader >> "$DIR/wp"; [ -z "$READER_FAILS" ]; }\n' +
    'tracy_wp_showcase_nav() { echo showcase >> "$DIR/wp"; [ -z "$SHOWCASE_FAILS" ]; }\n' +
    `. ${JSON.stringify(fileURLToPath(new URL('../scripts/lib/showcase-nav.sh', import.meta.url)))}\n`
  const receipt = join(dir, 'showcase-nav.request')
  const started = join(dir, 'showcase-nav.started')
  // `receipt`: none (a site this run did not lay down), pending (laid down, phase not begun), or
  // started (an earlier pass's phase began and stopped: the menus may be half-edited).
  const run = (env, { owed = 'none' } = {}) => {
    writeFileSync(marker, before)
    writeFileSync(join(dir, 'wp'), '')
    rmSync(receipt, { force: true })
    rmSync(started, { force: true })
    if (owed !== 'none') writeFileSync(receipt, 'provision-demo-20261023101500\n')
    if (owed === 'started') writeFileSync(started, '')
    const r = spawnSync(
      'bash',
      [
        '-c',
        `set -euo pipefail\n${stubs}${fn}\ntracy_wp_bind_latest ja-x/wp7/1.0.2 "$MARKER"\necho handed-over`
      ],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          DIR: dir,
          MARKER: marker,
          LABEL: 'demo',
          SITE_DIR: dir,
          QUICKSTART: 'quickstart/ja-x/wp7',
          COWORK_MIN_VERSION: '0.17.2',
          BIND: 'ok',
          TRACY_WP_COWORK_INSTALLED: '0.17.3',
          READER_FAILS: '',
          SHOWCASE_FAILS: '',
          ...env
        }
      }
    )
    return {
      ...r,
      marker: readFileSync(marker, 'utf8'),
      wp: readFileSync(join(dir, 'wp'), 'utf8'),
      kept: existsSync(receipt)
    }
  }

  const bound = run({})
  assert.equal(bound.status, 0, bound.stderr)
  assert.match(bound.stdout, /handed-over/)
  assert.deepEqual(JSON.parse(bound.marker), { ...JSON.parse(before), coworkContractVersion: '0.17.3' })
  assert.equal(bound.wp.match(/reader/g)?.length, 1, 'the reader is asked once, after the bind')
  assert.doesNotMatch(bound.wp, /option delete/)
  assert.doesNotMatch(
    bound.wp,
    /plugin get/,
    'the version comes from the install step, not one more wp-cli start'
  )

  // A version the install step did not record still leaves a marker that says "contract road": the floor.
  for (const TRACY_WP_COWORK_INSTALLED of ['', 'Error: not installed'])
    assert.equal(JSON.parse(run({ TRACY_WP_COWORK_INSTALLED }).marker).coworkContractVersion, '0.17.2')

  const refused = run({ BIND: 'refused' })
  assert.equal(refused.status, 0, 'a refused bind hands the site over as before')
  assert.match(refused.stdout, /handed-over/)
  assert.equal(refused.marker, before, 'the marker keeps saying "record road"')
  assert.match(refused.wp, /option delete claude_cowork_contract/, 'the contract setting is taken back')
  assert.equal(refused.wp.match(/reader/g)?.length, 1, 'an unbound site still gets its reader')
  assert.match(refused.stderr, /was not bound to ja-x\/wp7\/1\.0\.2/)

  const noReader = run({ READER_FAILS: '1' })
  assert.equal(noReader.status, 0, 'a reader that does not answer never stops the provision')
  assert.equal(JSON.parse(noReader.marker).coworkContractVersion, '0.17.3')

  // The showcase phase runs on a site this road DID bind, after its marker and before its reader; a
  // refused bind skips it.
  assert.match(bound.wp, /showcase\nreader/)
  assert.match(refused.stdout, /showcase navigation: not applied/)
  assert.doesNotMatch(refused.wp, /^showcase$/m)
  const fresh = run({ BIND: 'refused' }, { owed: 'pending' })
  assert.equal(fresh.status, 0, 'a site whose phase never began is skipped and handed over')
  assert.match(fresh.stdout, /showcase navigation: skipped — not bound to ja-x\/wp7\/1\.0\.2/)
  assert.equal(fresh.kept, false)

  // 🔒 A phase an earlier pass began and did not finish may have left the menus half-edited. A bind
  // that fails on the next pass never settles its receipt as skipped: it is said with `!!` and
  // settled as failed, and the site is handed over — the phase is cosmetic.
  const unfinished = run({ BIND: 'refused' }, { owed: 'started' })
  assert.equal(unfinished.status, 0, unfinished.stderr)
  assert.match(unfinished.stdout, /handed-over/)
  assert.deepEqual(
    unfinished.stderr.split('\n').filter((l) => l.startsWith('!! showcase navigation:')),
    [
      `!! showcase navigation: the phase started on an earlier pass and did not finish — the menus may be partly hidden; the revert could not be attempted (not bound to ja-x/wp7/1.0.2, so its showcase map cannot be applied)`
    ],
    'one `!!` line'
  )
  assert.match(unfinished.stdout, /showcase navigation: failed — started on an earlier pass/)
  assert.doesNotMatch(unfinished.wp, /^showcase$/m, 'not bound: no contract to revert it through')
  assert.doesNotMatch(unfinished.stdout, /showcase navigation: skipped/)
  assert.match(unfinished.stderr, /handed over sealed by the host fence only/)
  assert.equal(unfinished.kept, false)
  assert.equal(existsSync(started), false)
  // The phase itself answers 1 only for a contract that no longer inspects as bound after it.
  const halfway = run({ SHOWCASE_FAILS: '1' })
  assert.notEqual(halfway.status, 0, 'a site whose binding broke under the showcase phase is not handed over')
  assert.doesNotMatch(halfway.stdout, /handed-over/)
  assert.match(
    halfway.stderr,
    /bound to ja-x\/wp7\/1\.0\.2, but the binding no longer inspects as bound after its template showcase phase/
  )
  assert.equal(
    JSON.parse(halfway.marker).coworkContractVersion,
    '0.17.3',
    'the marker still says it is bound'
  )
})

// L29 (05/10/2026): one bind in 265 came back EMPTY and the host log kept nothing else, so the cause
// could not be found afterwards. The REAL file is sourced and a REAL curl talks to a socket that
// answers what the scenario says: only curl itself knows its exit code and the HTTP status.
test('a bind or inspect answer that is not JSON says what curl saw, and never the token', async () => {
  const token = 'c'.repeat(64)
  const site = mkdtempSync(join(tmpdir(), 'bind-contract-'))
  writeFileSync(join(site, 'tracy-agent.token'), `${token}\n`)
  // What the plugin answers, per operation: an object is its JSON, a number an empty answer with
  // that status, 'hang-up' a connection closed with no reply at all (curl exit 52).
  let says = {}
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      const say = says[JSON.parse(body).params.operation]
      if (say === 'hang-up') return req.socket.end()
      if (typeof say === 'number') {
        res.writeHead(say, { 'content-length': 0 })
        return res.end()
      }
      // `{ httpStatus, json }`: a JSON body under a status that is not 200.
      const [code, json] = say?.httpStatus ? [say.httpStatus, say.json] : [200, say]
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(json))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  // The provision only ever calls the bind where its failure is survived (`|| return 1`, `if !`),
  // so errexit is off inside it there, and here.
  const script = String.raw`set -euo pipefail
tracy_web_image() { printf '%s\n' "$2"; }
. "$HERE/platform/wordpress.sh"
tracy_web_dns_name() { printf '127.0.0.1:%s\n' "$PORT"; }
tracy_wp() { return 0; }
tracy_wp_bind_contract ja-x/wp7/1.0.2 || exit 3
`
  const env = {
    PATH: process.env.PATH,
    HERE: PROVISION,
    SITE_DIR: site,
    LABEL: 'demo',
    PORT: String(server.address().port)
  }
  const run = async (scenario) => {
    says = scenario
    const r = await shAsync('bash', ['-c', script], { env })
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(token), 'the token never reaches the log')
    return r
  }
  const bind = { ok: true, bound: true, contract: 'ja-x/wp7/1.0.2', revision: 'abc' }
  const inspect = { ok: true, bound: true, contract: 'ja-x/wp7/1.0.2', entities: [{}, {}] }
  try {
    const hungUp = await run({ bind: 'hang-up' })
    assert.equal(hungUp.status, 3)
    assert.match(hungUp.stderr, /did not answer the bind with JSON.*curl exit 52/)
    assert.match(hungUp.stderr, /Empty reply from server/, "curl's own error is kept")

    const gateway = await run({ bind: 502 })
    assert.equal(gateway.status, 3)
    assert.match(gateway.stderr, /did not answer the bind with JSON.*HTTP 502/)

    const lateGateway = await run({ bind, inspect: 502 })
    assert.equal(lateGateway.status, 3)
    assert.match(lateGateway.stderr, /!! inspect after bind: no JSON answer \(.*HTTP 502/)

    // The inspect confirms THIS contract, exactly as Joomla's `tracy_inspect_confirms` does: a 2xx,
    // `contract` equal to the one just bound, `bound` exactly true.
    for (const [answer, said] of [
      [
        { ...inspect, contract: 'some-other/wp7/1.0.0' },
        /bound to 'some-other\/wp7\/1\.0\.0', not 'ja-x\/wp7\/1\.0\.2'/
      ],
      [{ httpStatus: 500, json: inspect }, /not a 2xx answer \(.*HTTP 500/],
      [{ ...inspect, bound: 'true' }, /!! inspect after bind: /]
    ]) {
      const loose = await run({ bind, inspect: answer })
      assert.equal(loose.status, 3, JSON.stringify(answer))
      assert.match(loose.stderr, said)
      assert.doesNotMatch(loose.stdout, /inspect: bound/)
    }

    // What already worked keeps its words.
    const bound = await run({ bind, inspect })
    assert.equal(bound.status, 0, bound.stderr)
    assert.match(bound.stdout, /bound to ja-x\/wp7\/1\.0\.2 \(revision abc\)/)
    assert.match(bound.stdout, /inspect: bound, 2 entities/)
    const again = await run({ bind: { ok: false, message: 'already bound to ja-x/wp7/1.0.2' }, inspect })
    assert.equal(again.status, 0, again.stderr)
    assert.match(again.stdout, /already bound to ja-x\/wp7\/1\.0\.2/)
    const refused = await run({ bind: { ok: false, message: 'no profile ja-x/wp7/1.0.2 here' } })
    assert.equal(refused.status, 3)
    assert.match(refused.stderr, /!! bind refused: no profile ja-x\/wp7\/1\.0\.2 here/)
  } finally {
    server.close()
  }
})

// The showcase-navigation phase, through the REAL wordpress.sh against a socket that answers each
// call in turn: one bounded loop of `apply`, one request id kept for the whole phase, then `status`
// and an inspect. The receipt the provision wrote is what says this is a site it laid down.
test('a new site has its template showcase taken out of the menus; skips, losses and refusals are said', async () => {
  const token = 'd'.repeat(64)
  const request = 'provision-demo-20261023101500'
  const site = mkdtempSync(join(tmpdir(), 'showcase-nav-'))
  writeFileSync(join(site, 'tracy-agent.token'), `${token}\n`)
  let says = {}
  let calls = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      const params = JSON.parse(body).params
      calls.push(params)
      const queue = says[params.operation] ?? []
      const say = queue.length > 1 ? queue.shift() : queue[0]
      if (say === 'hang-up') return req.socket.end()
      if (typeof say === 'number') {
        res.writeHead(say, { 'content-length': 0 })
        return res.end()
      }
      // `{ httpStatus, json }`: a JSON body under a status that is not 200.
      const [code, json] = say?.httpStatus ? [say.httpStatus, say.json] : [200, say]
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(json))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const script = String.raw`set -euo pipefail
tracy_web_image() { printf '%s\n' "$2"; }
. "$HERE/platform/wordpress.sh"
tracy_web_dns_name() { printf '127.0.0.1:%s\n' "$PORT"; }
tracy_wp_showcase_nav ja-x/wp7/1.0.2 || exit 3
`
  const env = {
    PATH: process.env.PATH,
    HERE: PROVISION,
    SITE_DIR: site,
    LABEL: 'demo',
    PORT: String(server.address().port)
  }
  const receipt = join(site, 'showcase-nav.request')
  const mark = join(site, 'showcase-nav.started')
  // `started`: an earlier pass started the phase and did not finish it (its mark is there).
  const run = async (scenario, { held = true, receiptText = `${request}\n`, started = false } = {}) => {
    says = Object.fromEntries(Object.entries(scenario).map(([k, v]) => [k, [...v]]))
    calls = []
    if (held) writeFileSync(receipt, receiptText)
    else rmSync(receipt, { force: true })
    if (started) writeFileSync(mark, '')
    else rmSync(mark, { force: true })
    const r = await shAsync('bash', ['-c', script], { env })
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(token), 'the token never reaches the log')
    return { ...r, calls, kept: existsSync(receipt) }
  }
  const running = (moved, remaining) => ({ ok: true, status: 'running', moved, remaining })
  const completed = { ok: true, status: 'completed', moved: 1, remaining: 0 }
  const status = [{ ok: true, status: 'complete', remaining: 0, skipped: [] }]
  const inspect = [{ ok: true, bound: true, contract: 'ja-x/wp7/1.0.2', entities: [] }]
  try {
    const applied = await run({
      'showcaseNav.apply': [running(2, 3), running(2, 1), completed],
      'showcaseNav.status': status,
      inspect
    })
    assert.equal(applied.status, 0, applied.stderr)
    assert.deepEqual(
      applied.calls.map((c) => c.operation),
      ['showcaseNav.apply', 'showcaseNav.apply', 'showcaseNav.apply', 'showcaseNav.status', 'inspect']
    )
    assert.deepEqual(
      [...new Set(applied.calls.filter((c) => c.request_id).map((c) => `${c.request_id}|${c.apply_id}`))],
      [`${request}|snav-${request}`]
    )
    assert.match(applied.stdout, /showcase navigation: 2 moved, 3 left/)
    assert.match(applied.stdout, /showcase navigation: applied\n/)
    assert.equal(applied.kept, false, 'a final state settles the receipt')
    assert.equal(existsSync(join(site, 'showcase-nav.started')), false)

    const lost = await run({
      'showcaseNav.apply': ['hang-up', 502, completed],
      'showcaseNav.status': status,
      inspect
    })
    assert.equal(lost.status, 0, lost.stderr)
    assert.equal(
      lost.calls.filter((c) => c.request_id === request).length,
      3,
      'asked again with the same request'
    )
    assert.equal(lost.stdout.match(/no answer .*same request/g)?.length, 2)

    // 🔒 The phase is cosmetic: a failure is said with `!!`, what it applied is reverted once, the
    // contract is inspected again, and the receipt settles as failed — the provision goes on.
    const operations = (r) => r.calls.map((c) => c.operation)
    // 🔒 One failure is said in exactly ONE `!! showcase navigation:` line.
    const warned = (r) => r.stderr.split('\n').filter((l) => l.startsWith('!! showcase navigation:'))
    const gone = await run({ 'showcaseNav.apply': [502], inspect })
    assert.equal(gone.status, 0, gone.stderr)
    assert.equal(warned(gone).length, 1, gone.stderr)
    assert.match(warned(gone)[0], /lost its answer 3 times in a row/)
    assert.match(gone.stdout, /showcase navigation: failed — lost its answer 3 times in a row/)
    assert.equal(gone.kept, false, 'a failed phase settles its receipt')
    assert.equal(existsSync(join(site, 'showcase-nav.started')), false)
    assert.deepEqual(
      [
        ...new Set(
          gone.calls
            .filter((c) => c.operation === 'showcaseNav.revert')
            .map((c) => `${c.request_id}|${c.apply_id}`)
        )
      ],
      [`${request}.rv|snav-revert-${request}`],
      'the revert is its own request, kept for the whole revert'
    )
    assert.equal(operations(gone).at(-1), 'inspect', 'the contract is inspected again after the revert')

    for (const [answer, said] of [
      [
        { ok: false, error: 'unsupported', message: 'no showcase-nav map' },
        /skipped — unsupported: no showcase-nav map/
      ],
      [
        { ok: false, error: 'bad_params', message: 'unknown contract operation: showcaseNav.apply' },
        /skipped — unsupported: the installed Claude Cowork plugin predates/
      ]
    ]) {
      const skipped = await run({ 'showcaseNav.apply': [answer] })
      assert.equal(skipped.status, 0, skipped.stderr)
      assert.match(skipped.stdout, said)
      assert.deepEqual(
        skipped.calls.map((c) => c.operation),
        ['showcaseNav.apply']
      )
      assert.equal(skipped.kept, false)
    }

    const reverted = [{ ok: true, status: 'reverted', moved: 1, remaining: 0 }]

    // The plugin answers `skipped` as an object keyed by owner (`showcaseNavSkipped()`), beside `owners`
    // and `conflicts`. Measured on dev (JA Diner wp7): both owners `conflict`, nothing hidden, and the
    // log said a plain "applied" because only a list was counted.
    const edited = 'edited on this site since the quickstart shipped it; left as it is'
    const partly = await run({
      'showcaseNav.apply': [completed],
      'showcaseNav.status': [
        {
          ok: true,
          status: 'complete',
          remaining: 0,
          owners: 3,
          skipped: { 'navigation-93': edited, 'navigation-12': 'already as the map leaves it' },
          conflicts: []
        }
      ],
      inspect
    })
    assert.equal(partly.status, 0, partly.stderr)
    assert.match(
      partly.stdout,
      /showcase navigation: applied, 1 of 3 owners left as they were \(conflict: navigation-93: edited on this site since the quickstart shipped it; left as it is\); 1 already as the map leaves them\n/
    )
    assert.deepEqual(warned(partly), [])
    assert.equal(partly.kept, false)

    // Every owner left as it was: nothing was hidden, so it is never "applied". One `!!` line, settled
    // as failed, and the provision goes on (the phase is cosmetic).
    const none = await run({
      'showcaseNav.apply': [completed],
      'showcaseNav.status': [
        {
          ok: true,
          status: 'complete',
          remaining: 0,
          owners: 2,
          skipped: { 'navigation-93': edited, 'navigation-278': edited },
          conflicts: []
        }
      ],
      'showcaseNav.revert': reverted,
      inspect
    })
    assert.equal(none.status, 0, none.stderr)
    assert.equal(warned(none).length, 1, none.stderr)
    assert.match(
      warned(none)[0],
      /^!! showcase navigation: nothing was hidden — all 2 owners the map changes were left as they were \(conflict: navigation-93: edited .*; navigation-278: edited /
    )
    assert.match(none.stdout, /showcase navigation: failed — nothing was hidden — all 2 owners/)
    assert.doesNotMatch(none.stdout, /showcase navigation: applied/)
    assert.equal(none.kept, false)

    // A why that starts `kept` was kept on purpose (the Joomla rule, held alike here): its own bucket,
    // never a conflict, so beside an owner written (absent from `skipped`) it is never reverted away.
    const keptOne = 'kept the mega-menu sub of item-7: a child of it is still in the menu'
    const mixed = await run({
      'showcaseNav.apply': [completed],
      'showcaseNav.status': [
        {
          ok: true,
          status: 'complete',
          remaining: 0,
          owners: 3,
          skipped: { 'navigation-93': edited, 'header-1': keptOne },
          conflicts: []
        }
      ],
      'showcaseNav.revert': reverted,
      inspect
    })
    assert.equal(mixed.status, 0, mixed.stderr)
    assert.match(
      mixed.stdout,
      /showcase navigation: applied, 1 of 3 owners left as they were \(conflict: navigation-93: edited .*\); 1 kept on purpose \(header-1: kept the mega-menu sub of item-7: a child of it is still in the menu\)\n/
    )
    assert.deepEqual(warned(mixed), [])
    assert.ok(!operations(mixed).includes('showcaseNav.revert'))
    // Every owner a conflict or kept, none written or already: nothing was hidden, as Joomla reads it.
    const keptOnly = await run({
      'showcaseNav.apply': [completed],
      'showcaseNav.status': [
        {
          ok: true,
          status: 'complete',
          remaining: 0,
          owners: 2,
          skipped: { 'navigation-93': edited, 'header-1': keptOne },
          conflicts: []
        }
      ],
      'showcaseNav.revert': reverted,
      inspect
    })
    assert.equal(keptOnly.status, 0, keptOnly.stderr)
    assert.equal(warned(keptOnly).length, 1, keptOnly.stderr)
    assert.match(
      warned(keptOnly)[0],
      /^!! showcase navigation: nothing was hidden — all 2 owners the map changes were left as they were \(conflict: navigation-93: edited .*\); 1 mega-menu styles kept with them \(header-1: kept /
    )
    assert.doesNotMatch(keptOnly.stdout, /showcase navigation: applied/)
    const allKept = await run({
      'showcaseNav.apply': [completed],
      'showcaseNav.status': [
        {
          ok: true,
          status: 'complete',
          remaining: 0,
          owners: 1,
          skipped: { 'header-1': keptOne },
          conflicts: []
        }
      ],
      'showcaseNav.revert': reverted,
      inspect
    })
    assert.equal(allKept.status, 0, allKept.stderr)
    assert.match(allKept.stdout, /showcase navigation: applied, 1 kept on purpose \(header-1: kept /)
    assert.deepEqual(warned(allKept), [])
    assert.ok(!operations(allKept).includes('showcaseNav.revert'))
    assert.equal(allKept.kept, false)

    // A refusal after a `running` answer or a lost one comes after a call that may have written: it
    // is reverted like any other failure (a refusal on the first call is below).
    for (const [scenario, said] of [
      [
        { 'showcaseNav.apply': [running(2, 3), { ok: false, error: 'conflict', message: 'menu changed' }] },
        /refused: .*conflict/
      ],
      [
        { 'showcaseNav.apply': [502, { ok: false, error: 'conflict', message: 'menu changed' }] },
        /refused: .*conflict/
      ],
      [{ 'showcaseNav.apply': [{ status: 'completed', remaining: 0 }] }, /refused/],
      [{ 'showcaseNav.apply': [running(2, 3), running(0, 3)] }, /made no progress/],
      [
        {
          'showcaseNav.apply': [completed],
          'showcaseNav.status': [{ ok: true, status: 'none', remaining: 0 }]
        },
        /status after apply did not confirm it/
      ],
      [
        {
          'showcaseNav.apply': [completed],
          'showcaseNav.status': status,
          inspect: [{ ok: false, message: 'not bound' }, ...inspect]
        },
        /inspect after showcase navigation: not bound/
      ]
    ]) {
      const failed = await run({ inspect, 'showcaseNav.revert': reverted, ...scenario })
      assert.equal(failed.status, 0, `${JSON.stringify(scenario)}\n${failed.stderr}`)
      assert.equal(warned(failed).length, 1, failed.stderr)
      assert.match(
        warned(failed)[0],
        new RegExp(`^!! showcase navigation: .*${said.source}.*; what it applied was reverted$`)
      )
      assert.match(failed.stdout, /showcase navigation: failed — .*; what it applied was reverted/)
      assert.ok(operations(failed).includes('showcaseNav.revert'), 'what it applied is reverted')
      assert.equal(operations(failed).at(-1), 'inspect')
      assert.equal(failed.kept, false)
    }

    // An apply refused on its FIRST call committed no batch: nothing was written, so nothing is
    // reverted, the contract is still inspected, and the one `!!` line says the menus are untouched.
    const languages =
      'This site already has a second language; taking its showcase entries out of the menus would leave the translated menus showing them. Nothing has been written.'
    const untouched = await run({
      'showcaseNav.apply': [{ ok: false, error: 'contract_failed', message: languages }],
      'showcaseNav.revert': [{ ok: false, error: 'contract_failed', message: languages }],
      inspect
    })
    assert.equal(untouched.status, 0, untouched.stderr)
    assert.deepEqual(warned(untouched), [
      `!! showcase navigation: refused: {"ok": false, "error": "contract_failed", "message": "${languages}"}; nothing was written, the template showcase stays in the menus`
    ])
    assert.match(
      untouched.stdout,
      /showcase navigation: failed — refused: .*contract_failed.*; nothing was written, the template showcase stays in the menus\n/
    )
    assert.doesNotMatch(untouched.stderr + untouched.stdout, /partly hidden|revert did not/)
    assert.deepEqual(
      operations(untouched),
      ['showcaseNav.apply', 'inspect'],
      'no revert, the inspect still runs'
    )
    assert.equal(untouched.kept, false, 'the receipt is settled as failed')

    // The same refusal after a `running` answer may follow a written batch: the old recovery and words.
    const afterRunning = await run({
      'showcaseNav.apply': [running(2, 3), { ok: false, error: 'contract_failed', message: languages }],
      'showcaseNav.revert': [{ ok: false, error: 'contract_failed', message: languages }],
      inspect
    })
    assert.equal(afterRunning.status, 0, afterRunning.stderr)
    assert.equal(warned(afterRunning).length, 1, afterRunning.stderr)
    assert.match(
      warned(afterRunning)[0],
      /^!! showcase navigation: apply stopped part-way and the revert did not complete — the menus may be partly hidden; refused: .*contract_failed.*; revert: revert refused: .*contract_failed/
    )
    assert.ok(operations(afterRunning).includes('showcaseNav.revert'))
    assert.equal(operations(afterRunning).at(-1), 'inspect')
    assert.equal(afterRunning.kept, false)

    // A revert that fails is said, and the provision still goes on while the contract inspects bound.
    const unreverted = await run({
      'showcaseNav.apply': [running(2, 3), running(0, 3)],
      'showcaseNav.revert': [{ ok: false, error: 'conflict', message: 'a revert is already running' }],
      inspect
    })
    assert.equal(unreverted.status, 0, unreverted.stderr)
    assert.equal(warned(unreverted).length, 1, unreverted.stderr)
    assert.match(
      unreverted.stderr,
      /!! showcase navigation: apply stopped part-way and the revert did not complete — the menus may be partly hidden; made no progress.*; revert: revert refused: .*conflict/
    )
    assert.match(
      unreverted.stdout,
      /showcase navigation: failed — made no progress.*; the revert did not finish/
    )
    assert.equal(operations(unreverted).at(-1), 'inspect')
    assert.equal(unreverted.kept, false)

    // A revert refused because the plugin records nothing hidden (the apply hid nothing, or another
    // request's revert already put it back) is not an unfinished revert: the menus are as they were.
    const nothingLeft = {
      ok: false,
      error: 'contract_failed',
      message: 'This site has no showcase navigation entries to bring back'
    }
    for (const scenario of [
      {
        'showcaseNav.apply': [completed],
        'showcaseNav.status': [
          {
            ok: true,
            status: 'complete',
            remaining: 0,
            owners: 1,
            skipped: { 'navigation-93': edited },
            conflicts: []
          }
        ]
      },
      { 'showcaseNav.apply': [running(2, 3), running(0, 3)] }
    ]) {
      const asWas = await run({ inspect, ...scenario, 'showcaseNav.revert': [nothingLeft] })
      assert.equal(asWas.status, 0, asWas.stderr)
      assert.equal(warned(asWas).length, 1, asWas.stderr)
      assert.match(
        warned(asWas)[0],
        /^!! showcase navigation: .+; nothing was left applied to revert, the menus are as they were$/
      )
      assert.doesNotMatch(asWas.stderr + asWas.stdout, /partly hidden|revert did not/)
      assert.match(
        asWas.stdout,
        /showcase navigation: failed — .+; nothing was left applied to revert, the menus are as they were\n/
      )
      assert.equal(operations(asWas).filter((op) => op === 'showcaseNav.revert').length, 1)
      assert.equal(operations(asWas).at(-1), 'inspect', 'the contract is inspected again')
      assert.equal(asWas.kept, false, 'the receipt is settled as failed')
    }
    // Only that exact answer: another contract_failed refusal of the revert keeps the old warning.
    const otherRefusal = await run({
      'showcaseNav.apply': [running(2, 3), running(0, 3)],
      'showcaseNav.revert': [
        { ok: false, error: 'contract_failed', message: 'An owner is open in the editor' }
      ],
      inspect
    })
    assert.equal(otherRefusal.status, 0, otherRefusal.stderr)
    assert.match(
      warned(otherRefusal)[0],
      /^!! showcase navigation: apply stopped part-way and the revert did not complete — the menus may be partly hidden; made no progress.*; revert: revert refused: .*An owner is open in the editor/
    )
    assert.match(
      otherRefusal.stdout,
      /showcase navigation: failed — made no progress.*; the revert did not finish/
    )

    // Apply dies mid-run (one batch moved, then its answers are lost) and the revert fails too — refused
    // or its answers lost — while the contract still inspects as bound: the provision goes on, and the
    // `!!` line says plainly the menus may be partly hidden.
    for (const [revert, why] of [
      [[502], /revert: revert lost its answer 3 times in a row/],
      [[{ ok: false, error: 'conflict', message: 'busy' }], /revert: revert refused: .*conflict/]
    ]) {
      const partway = await run({
        'showcaseNav.apply': [running(2, 3), 502],
        'showcaseNav.revert': revert,
        inspect
      })
      assert.equal(partway.status, 0, partway.stderr)
      assert.equal(warned(partway).length, 1, partway.stderr)
      assert.match(
        partway.stderr,
        /!! showcase navigation: apply stopped part-way and the revert did not complete — the menus may be partly hidden; lost its answer 3 times in a row/
      )
      assert.match(partway.stderr, why)
      assert.match(partway.stdout, /showcase navigation: 2 moved, 3 left/)
      assert.match(
        partway.stdout,
        /showcase navigation: failed — lost its answer 3 times in a row.*; the revert did not finish/
      )
      assert.ok(operations(partway).includes('showcaseNav.revert'))
      assert.equal(operations(partway).at(-1), 'inspect', 'the contract is inspected again')
      assert.equal(partway.kept, false, 'the receipt is settled as failed')
    }

    // A receipt that holds no request id: said, kept for a person, nothing called, the provision goes on.
    const garbled = await run({ 'showcaseNav.apply': [completed] }, { receiptText: 'not a request id!\n' })
    assert.equal(garbled.status, 0, garbled.stderr)
    assert.match(
      garbled.stderr,
      /!! showcase navigation: showcase-nav.request does not hold a request id — kept for a person/
    )
    assert.deepEqual(garbled.calls, [])
    assert.equal(readFileSync(receipt, 'utf8'), 'not a request id!\n', 'kept as it was')

    // A contract that no longer inspects as bound after the failed phase and its revert is a broken
    // binding: that stays fatal, the receipt kept.
    const broken = await run({
      'showcaseNav.apply': [completed],
      'showcaseNav.status': status,
      'showcaseNav.revert': reverted,
      inspect: [{ ok: false, message: 'not bound' }]
    })
    assert.equal(broken.status, 3)
    assert.match(
      broken.stderr,
      /inspect after the failed showcase navigation and its revert: not bound — the contract binding is broken/
    )
    assert.ok(operations(broken).includes('showcaseNav.revert'))
    assert.equal(broken.kept, true)

    // Only an inspect that confirms THIS contract counts: another contract, a bound-looking body over
    // a 500, or `bound: "true"` is not a confirmation — after the apply, and after the revert.
    for (const loose of [
      { ...inspect[0], contract: 'some-other/wp7/1.0.0' },
      { httpStatus: 500, json: inspect[0] },
      { ...inspect[0], bound: 'true' }
    ]) {
      const r = await run({
        'showcaseNav.apply': [completed],
        'showcaseNav.status': status,
        'showcaseNav.revert': reverted,
        inspect: [loose]
      })
      assert.equal(r.status, 3, JSON.stringify(loose))
      assert.match(
        r.stderr,
        /inspect after the failed showcase navigation and its revert: .* — the contract binding is broken/
      )
      assert.match(
        r.stderr,
        /!! showcase navigation: inspect after showcase navigation: /,
        'the apply was not confirmed either'
      )
      assert.equal(r.kept, true)
    }

    // No plugin token: the phase cannot run, so it is skipped with a `!!` line and nothing is called.
    rmSync(join(site, 'tracy-agent.token'))
    const tokenless = await run({ 'showcaseNav.apply': [completed] })
    writeFileSync(join(site, 'tracy-agent.token'), `${token}\n`)
    assert.equal(tokenless.status, 0, tokenless.stderr)
    assert.match(tokenless.stderr, /!! showcase navigation: no plugin token/)
    assert.match(tokenless.stdout, /showcase navigation: skipped — no plugin token/)
    assert.deepEqual(tokenless.calls, [])
    assert.equal(tokenless.kept, false)

    // 🔒 A phase an earlier pass started and did not finish is never skipped. With no token there is
    // no door to revert it through: one `!!` line says the menus may be partly hidden and the revert
    // could not be attempted, it is settled as failed, nothing is called, and the provision goes on.
    rmSync(join(site, 'tracy-agent.token'))
    const stranded = await run({ 'showcaseNav.apply': [completed] }, { started: true })
    writeFileSync(join(site, 'tracy-agent.token'), `${token}\n`)
    assert.equal(stranded.status, 0, stranded.stderr)
    assert.equal(warned(stranded).length, 1, stranded.stderr)
    assert.match(
      warned(stranded)[0],
      /the phase started on an earlier pass and did not finish — the menus may be partly hidden; the revert could not be attempted \(no plugin token\)/
    )
    assert.match(stranded.stdout, /showcase navigation: failed — started on an earlier pass and not finished/)
    assert.doesNotMatch(stranded.stdout, /showcase navigation: skipped/)
    assert.deepEqual(stranded.calls, [])
    assert.equal(stranded.kept, false)
    assert.equal(existsSync(mark), false)

    // With the door and the token there, a later pass does not apply again — the earlier pass may
    // have died anywhere in it: it reverts once, inspects, and settles as failed.
    const recovered = await run({ 'showcaseNav.revert': reverted, inspect }, { started: true })
    assert.equal(recovered.status, 0, recovered.stderr)
    assert.deepEqual(operations(recovered), ['showcaseNav.revert', 'inspect'])
    assert.deepEqual(
      [...new Set(recovered.calls.filter((c) => c.request_id).map((c) => `${c.request_id}|${c.apply_id}`))],
      [`${request}.rv|snav-revert-${request}`],
      'the revert is keyed to the job that earlier pass started'
    )
    assert.equal(warned(recovered).length, 1, recovered.stderr)
    assert.match(
      warned(recovered)[0],
      /started on an earlier pass and not finished; what it applied was reverted/
    )
    assert.match(
      recovered.stdout,
      /showcase navigation: failed — started on an earlier pass and not finished; what it applied was reverted/
    )
    assert.equal(recovered.kept, false)
    assert.equal(existsSync(mark), false)

    const stuck = await run({ 'showcaseNav.revert': [502], inspect }, { started: true })
    assert.equal(stuck.status, 0, stuck.stderr)
    assert.equal(warned(stuck).length, 1, stuck.stderr)
    assert.match(
      warned(stuck)[0],
      /revert did not complete — the menus may be partly hidden; started on an earlier pass and not finished; revert: revert lost its answer/
    )
    assert.match(
      stuck.stdout,
      /showcase navigation: failed — started on an earlier pass.*; the revert did not finish/
    )
    assert.equal(operations(stuck).at(-1), 'inspect')
    assert.equal(stuck.kept, false)

    // That recovery's inspect not confirming the contract stays fatal, receipt and mark kept.
    const unbound = await run(
      { 'showcaseNav.revert': reverted, inspect: [{ ok: false, message: 'not bound' }] },
      { started: true }
    )
    assert.equal(unbound.status, 3)
    assert.match(unbound.stderr, /the contract binding is broken/)
    assert.equal(unbound.kept, true)
    assert.equal(existsSync(mark), true)

    // 🔒 The mark decides, not the receipt: a started phase whose receipt is missing or holds no
    // request id has no job to revert. One `!!` line, settled as failed, nothing called, never "not
    // applied"; a receipt that holds no request id is still kept for a person.
    for (const [receiptOpts, left, why] of [
      [
        { receiptText: 'not a request id!\n' },
        'not a request id!\n',
        /\(showcase-nav\.request does not hold a request id to revert it with; the file is kept for a person to look at\)$/
      ],
      [{ held: false }, null, /\(there is no showcase-nav\.request to revert it with\)$/]
    ]) {
      const orphan = await run(
        { 'showcaseNav.apply': [completed], 'showcaseNav.revert': reverted, inspect },
        { ...receiptOpts, started: true }
      )
      assert.equal(orphan.status, 0, orphan.stderr)
      assert.equal(warned(orphan).length, 1, orphan.stderr)
      assert.match(
        warned(orphan)[0],
        /^!! showcase navigation: the phase started on an earlier pass and did not finish — the menus may be partly hidden; the revert could not be attempted /
      )
      assert.match(warned(orphan)[0], why)
      assert.match(orphan.stdout, /showcase navigation: failed — started on an earlier pass and not finished/)
      assert.doesNotMatch(orphan.stdout, /not applied|skipped/)
      assert.deepEqual(orphan.calls, [])
      assert.equal(existsSync(receipt) ? readFileSync(receipt, 'utf8') : null, left)
      assert.equal(existsSync(mark), false, 'settled: the mark goes')
    }

    const existing = await run({ 'showcaseNav.apply': [completed] }, { held: false })
    assert.equal(existing.status, 0, existing.stderr)
    assert.deepEqual(existing.calls, [], 'a re-run on an existing site makes no call')
    assert.match(existing.stdout, /showcase navigation: not applied/)
  } finally {
    server.close()
    rmSync(site, { recursive: true, force: true })
  }
})

// An /ops demo is provisioned as a template card (`workflow: 'template'`, `demo: true`), and a redeploy
// is a teardown and then a fresh provision of the same label. Through the REAL `platform_post_up` and
// the REAL showcase phase (only the HTTP call, wp-cli and the plugin install are stand-ins): a sealed
// entry applies its showcase on both plugin roads, a second pass on the handed-over site calls
// nothing, a reinstall applies again with the request id of the new site, an unsealed one is skipped.
test('an /ops demo of a sealed WordPress card takes its showcase out of the menus; a reinstall applies again', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'wp-demo-showcase-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const catalogue = join(dir, 'quickstarts.json')
  writeFileSync(
    catalogue,
    JSON.stringify({
      'quickstart/ja-x/wp7': {
        platform: 'wordpress',
        contract: 'ja-x/wp7/1.0.2',
        coworkMinVersion: '0.17.2'
      },
      'quickstart/ja-open/wp7': { platform: 'wordpress' }
    })
  )
  const script = String.raw`set -euo pipefail
tracy_web_image() { printf '%s\n' "$2"; }
. "$HERE/platform/wordpress.sh"
mkdir -p "$TRACY_SITES_ROOT/demo" "$SITE_DIR"
: > "$TRACY_SITES_ROOT/demo/wp-config.php"
printf '%s\n' "$TOKEN" > "$SITE_DIR/tracy-agent.token"
tracy_webroot_dir() { printf '%s/%s\n' "$TRACY_SITES_ROOT" "$1"; }
tracy_web_dns_name() { printf 'demo.test\n'; }
site_answers() { :; }
tracy_wp_table_prefix() { printf 'wp_\n'; }
tracy_wp() { :; }
tracy_wp_acym_keys() { :; }
tracy_wp_install_doors() { printf 'doors %s\n' "$*" >> "$CALLS"; }
tracy_wp_bind_contract() { printf 'bind %s\n' "$1" >> "$CALLS"; }
tracy_wp_content_identity() { :; }
# The release pins its plugin (PINNED=1) or not: the pinned part is written, never downloaded.
python3() {
  local last
  for last; do :; done
  if [ -n "$PINNED" ] && [[ " $* " == *" --part cowork "* ]]; then : > "$last"; return 0; fi
  command python3 "$@"
}
tracy_wp_contract_post() {
  local op
  op="$(command python3 -c 'import json,sys; p=json.loads(sys.argv[1])["params"]; print(p["operation"], p.get("request_id", ""))' "$1")"
  printf '%s\n' "$op" >> "$CALLS"
  case "$op" in
    showcaseNav.apply*) printf '{"ok":true,"status":"completed","moved":2,"remaining":0}\n' ;;
    showcaseNav.status*) printf '{"ok":true,"status":"complete","remaining":0,"skipped":[]}\n' ;;
    *) printf '{"ok":true,"bound":true,"contract":"ja-x/wp7/1.0.2","entities":[]}\n' ;;
  esac
  printf 'curl exit 0, HTTP 200\n'
}
platform_post_up; echo "first=$?"
platform_post_up; echo "again=$?"
# A reinstall: teardown.sh removes the private folder, provision.sh lays the site down again.
rm -f "$SITE_DIR"/showcase-nav.*
tracy_showcase_begin
platform_post_up; echo "reinstall=$?"
`
  const run = (quickstart, pinned) => {
    const site = join(dir, `site-${quickstart.replaceAll('/', '-')}-${pinned}`)
    const sites = join(dir, `sites-${quickstart.replaceAll('/', '-')}-${pinned}`)
    const calls = join(dir, `calls-${quickstart.replaceAll('/', '-')}-${pinned}`)
    mkdirSync(site, { recursive: true })
    writeFileSync(join(site, 'showcase-nav.request'), 'provision-demo-20261023101500\n')
    writeFileSync(calls, '')
    const r = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HERE: PROVISION,
        SITE_DIR: site,
        TRACY_SITES_ROOT: sites,
        TRACY_QUICKSTARTS_JSON: catalogue,
        LABEL: 'demo',
        QUICKSTART: quickstart,
        BUILD_WORKFLOW: 'template',
        PINNED: pinned ? '1' : '',
        TOKEN: 'd'.repeat(64),
        CALLS: calls
      }
    })
    return { ...r, calls: readFileSync(calls, 'utf8'), kept: existsSync(join(site, 'showcase-nav.request')) }
  }
  for (const pinned of [true, false]) {
    const out = run('quickstart/ja-x/wp7', pinned)
    assert.equal(out.status, 0, out.stderr)
    assert.match(out.stdout, /first=0\n[\s\S]*again=0\n[\s\S]*reinstall=0\n/, out.stderr)
    const applies = out.calls.split('\n').filter((l) => l.startsWith('showcaseNav.apply'))
    assert.equal(applies.length, 2, `${pinned ? 'pinned' : 'latest'} road: ${out.calls}`)
    assert.equal(
      applies[0],
      'showcaseNav.apply provision-demo-20261023101500',
      'the receipt the provision wrote'
    )
    assert.match(
      applies[1],
      /^showcaseNav\.apply provision-demo-\d{14}$/,
      'the reinstalled site is owed it again'
    )
    assert.match(
      out.stdout,
      /showcase navigation: applied\n[\s\S]*showcase navigation: not applied[\s\S]*showcase navigation: applied\n/
    )
    assert.equal(out.kept, false)
  }
  const open = run('quickstart/ja-open/wp7', false)
  assert.equal(open.status, 0, open.stderr)
  assert.match(open.stdout, /showcase navigation: skipped — this template carries no content contract/)
  assert.doesNotMatch(open.calls, /showcaseNav/)
})

test('provision.sh hands the platforms a site address with no trailing slash', () => {
  // The lines that build SITE_URL are RUN, not read: a quickstart placeholder has no trailing
  // slash, so a live address that keeps one makes search-replace write `//careers/` links.
  const lines = read('provision.sh')
    .split('\n')
    .filter((line) => /^(FLEET_ZONE|SITE_URL)=/.test(line))
    .join('\n')
  const siteUrl = (liveSite) =>
    spawnSync(
      'bash',
      ['-c', `LABEL=acme; LIVE_SITE="$1"\n${lines}\nprintf %s "$SITE_URL"`, 'bash', liveSite],
      {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, FLEET_ZONE: 'tracy.site' }
      }
    ).stdout
  assert.equal(siteUrl('https://acme.tracy.site/'), 'https://acme.tracy.site')
  assert.equal(siteUrl('http://acme.localhost:8080/'), 'http://acme.localhost:8080')
  assert.equal(siteUrl('https://acme.tracy.site'), 'https://acme.tracy.site')
  assert.equal(siteUrl(''), 'https://acme.tracy.site')
})
