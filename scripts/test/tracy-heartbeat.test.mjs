// tracy-heartbeat.sh against a fake master and a fake /_shard/status, both served from this
// process and both checking the signature against the contract's canonical string
// (docs/sre/hop-dong-cua-shard.md section 2: the REAL method, the path without its query).
//   node --test scripts/test/tracy-heartbeat.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { R, bashAsync, has, script, tempDir, verifyShardHeaders, writeFiles } from './_shard.mjs'

const SECRET = 'a1'.repeat(32) // shard-sign.sh takes 64 lowercase hex
const skip = has('jq') ? false : 'jq is not installed'
const STATUS = {
  sites: 7,
  releases_read_at: '2026-10-15T00:00:00Z',
  migration_head: '123-shard-node.sql',
  accepting: true
}
const GRANTED = new Date(Date.now() + 15 * 60 * 1000).toISOString()
// The body of contract section 7, in its order.
const BODY_KEYS = [
  'app_tag',
  'dsh_tag',
  'source_commit',
  'updater_version',
  'sites',
  'mem_available_mb',
  'disk_free_mb',
  'load1',
  'releases_read_at',
  'migration_head',
  'accepting',
  'updating',
  'last_update',
  'last_backup'
]

// `answer` is what the check door says; `status` what /_shard/status says (null: a 503, unreadable).
function fakeMaster(answer, { status = STATUS } = {}) {
  const seen = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const pathname = new URL(req.url, 'http://fake').pathname
      const verdict = verifyShardHeaders({
        secret: SECRET,
        method: req.method,
        path: pathname,
        body,
        headers: req.headers
      })
      seen.push({ method: req.method, url: req.url, host: req.headers.host, body, verdict })
      if (!verdict.ok)
        return res
          .writeHead(403, { 'content-type': 'application/json' })
          .end(JSON.stringify({ code: 'SIGNATURE_INVALID', why: 'signature' }))
      if (pathname === '/_shard/status') {
        if (status === null) return res.writeHead(503).end()
        return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(status))
      }
      if (pathname === '/api/shards/s9/check')
        return res
          .writeHead(answer.status, { 'content-type': answer.type ?? 'application/json' })
          .end(answer.body)
      res.writeHead(404).end()
    })
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, seen, origin: `http://127.0.0.1:${server.address().port}` })
    )
  )
}

function shardDir(origin, { secret = SECRET, meminfo = true } = {}) {
  return writeFiles(tempDir('heartbeat-'), {
    'tracy-web.env': `HOST_NAME=s9\nTRACY_ORIGIN=https://s9.tracy.test\nMASTER_ORIGIN=${origin}\nSHARD_SECRET=${secret}\nAPP_IMAGE_TAG=app-111111111111\nWEB_PORT=51710\n`,
    'host-dsh.env': 'DSH_IMAGE_TAG=2026-10-01-aaaaaaaa\n',
    ...(meminfo ? { meminfo: 'MemTotal:       32000000 kB\nMemAvailable:   20480000 kB\n' } : {}),
    loadavg: '0.42 0.30 0.20 1/300 1234\n',
    'state/.keep': ''
  })
}

const beat = (dir, origin, args = [], extraEnv = {}) =>
  bashAsync([script('tracy-heartbeat.sh'), ...args], {
    env: {
      TRACY_WEB_ENV: path.join(dir, 'tracy-web.env'),
      TRACY_DSH_ENV: path.join(dir, 'host-dsh.env'),
      TRACY_STATE_DIR: path.join(dir, 'state'),
      TRACY_MEMINFO: path.join(dir, 'meminfo'),
      TRACY_LOADAVG: path.join(dir, 'loadavg'),
      TRACY_STATUS_ORIGIN: origin,
      TRACY_NO_KICK: '1',
      ...extraEnv
    }
  })

test('a heartbeat signed GET then POST carries the contract body, and the whole answer becomes desired.json', {
  skip
}, async () => {
  const answer = {
    app_tag: 'app-222222222222',
    dsh_tag: '2026-10-02-bbbbbbbb',
    source_commit: 'abc1234',
    hold: false,
    reason: null,
    granted_until: GRANTED
  }
  const m = await fakeMaster({ status: 200, body: JSON.stringify(answer) })
  try {
    const dir = shardDir(m.origin)
    const run = await beat(dir, m.origin)
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(
      m.seen.map((s) => [s.method, s.url, s.verdict.ok]),
      [
        ['GET', '/_shard/status', true],
        ['POST', '/api/shards/s9/check', true]
      ]
    )
    assert.equal(m.seen[0].host, 's9.tracy.test', 'the status door is asked under the shard origin')
    const sent = JSON.parse(m.seen[1].body)
    assert.deepEqual(Object.keys(sent), BODY_KEYS)
    assert.equal(sent.app_tag, 'app-111111111111')
    assert.equal(sent.dsh_tag, '2026-10-01-aaaaaaaa')
    assert.equal(sent.sites, 7)
    assert.equal(sent.migration_head, '123-shard-node.sql')
    assert.equal(sent.releases_read_at, '2026-10-15T00:00:00Z')
    assert.equal(sent.accepting, true)
    assert.equal(sent.mem_available_mb, 20000)
    assert.equal(sent.load1, 0.42)
    assert.equal(sent.updating, false)
    assert.equal(sent.last_update, null)
    assert.equal(sent.last_backup, null)
    const { received_at: receivedAt, ...kept } = JSON.parse(
      readFileSync(path.join(dir, 'state/desired.json'), 'utf8')
    )
    assert.deepEqual(kept, answer, 'the answer is kept whole (contract section 7)')
    assert.equal(typeof receivedAt, 'number')
    assert.match(
      run.stdout,
      /would start tracy-updater\.service/,
      'other tags, no hold, a slot: the updater is started'
    )
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'state/heartbeat.json'), 'utf8')).code, '200')
  } finally {
    m.server.close()
  }
})

test('TRACY_UPDATER_UNIT names the unit that is started (a co-hosted second stack)', { skip }, async () => {
  const answer = {
    app_tag: 'app-222222222222',
    dsh_tag: '2026-10-02-bbbbbbbb',
    hold: false,
    reason: null,
    granted_until: GRANTED
  }
  const m = await fakeMaster({ status: 200, body: JSON.stringify(answer) })
  try {
    const run = await beat(shardDir(m.origin), m.origin, [], {
      TRACY_UPDATER_UNIT: 'tracy-d1-updater.service'
    })
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stdout, /would start tracy-d1-updater\.service/)
  } finally {
    m.server.close()
  }
})

test('what cannot be read is sent as null, and a false stays false (contract section 7)', {
  skip
}, async () => {
  const answer = {
    status: 200,
    body: JSON.stringify({
      app_tag: 'app-111111111111',
      dsh_tag: '2026-10-01-aaaaaaaa',
      hold: false,
      reason: null,
      granted_until: null
    })
  }
  const full = await fakeMaster(answer, { status: { ...STATUS, sites: 0, accepting: false } })
  try {
    const run = await beat(shardDir(full.origin), full.origin)
    assert.equal(run.status, 0, run.stderr)
    const sent = JSON.parse(full.seen[1].body)
    assert.equal(sent.sites, 0)
    assert.equal(sent.accepting, false)
  } finally {
    full.server.close()
  }
  const blind = await fakeMaster(answer, { status: null })
  try {
    const dir = shardDir(blind.origin, { meminfo: false })
    const run = await beat(dir, blind.origin)
    assert.equal(run.status, 0, run.stderr)
    const sent = JSON.parse(blind.seen[1].body)
    assert.deepEqual(Object.keys(sent), BODY_KEYS)
    for (const key of ['sites', 'mem_available_mb', 'releases_read_at', 'migration_head', 'accepting'])
      assert.equal(sent[key], null, key)
    assert.ok(
      existsSync(path.join(dir, 'state/desired.json')),
      'the master still answers a shard it cannot see into'
    )
  } finally {
    blind.server.close()
  }
})

test('a TAG_UNKNOWN hold with null tags is kept as an answer; a hold, or no update slot, starts nothing', {
  skip
}, async () => {
  const unknown = {
    app_tag: null,
    dsh_tag: null,
    source_commit: null,
    hold: true,
    reason: 'TAG_UNKNOWN',
    granted_until: null
  }
  const m = await fakeMaster({ status: 200, body: JSON.stringify(unknown) })
  try {
    const dir = shardDir(m.origin)
    const run = await beat(dir, m.origin)
    assert.equal(run.status, 0, run.stderr)
    const { received_at: _receivedAt, ...kept } = JSON.parse(
      readFileSync(path.join(dir, 'state/desired.json'), 'utf8')
    )
    assert.deepEqual(kept, unknown)
    assert.match(run.stdout, /hold: TAG_UNKNOWN/)
    assert.doesNotMatch(run.stdout, /would start/)
  } finally {
    m.server.close()
  }
  const noSlot = {
    app_tag: 'app-222222222222',
    dsh_tag: '2026-10-01-aaaaaaaa',
    hold: false,
    reason: null,
    granted_until: null
  }
  const n = await fakeMaster({ status: 200, body: JSON.stringify(noSlot) })
  try {
    const run = await beat(shardDir(n.origin), n.origin)
    assert.equal(run.status, 0, run.stderr)
    assert.doesNotMatch(run.stdout, /would start/, 'no granted_until: the master has given no update slot')
  } finally {
    n.server.close()
  }
})

test("the updater's and the backup's last results go up in the contract's shape", { skip }, async () => {
  const m = await fakeMaster({
    status: 200,
    body: JSON.stringify({
      app_tag: 'app-111111111111',
      dsh_tag: '2026-10-01-aaaaaaaa',
      hold: false,
      reason: null,
      granted_until: null
    })
  })
  try {
    const dir = shardDir(m.origin)
    writeFileSync(
      path.join(dir, 'state/updater.json'),
      JSON.stringify({
        app_tag: 'app-222222222222',
        dsh_tag: '2026-10-02-bbbbbbbb',
        ok: false,
        finished_at: '2026-10-16T01:00:00Z',
        finished_epoch: 1,
        log_tail: 'deploy failed',
        web_images_missing: ['tracy/web-joomla:5']
      })
    )
    writeFileSync(
      path.join(dir, 'state/backup-r2.json'),
      JSON.stringify({
        ok: true,
        object: 'postgres/s9/x.sql.gz.age',
        bytes: 10,
        finished_at: '2026-10-16T03:20:00Z'
      })
    )
    const run = await beat(dir, m.origin)
    assert.equal(run.status, 0, run.stderr)
    const sent = JSON.parse(m.seen[1].body)
    assert.deepEqual(sent.last_update, {
      app_tag: 'app-222222222222',
      dsh_tag: '2026-10-02-bbbbbbbb',
      ok: false,
      finished_at: '2026-10-16T01:00:00Z',
      log_tail: 'deploy failed',
      web_images_missing: true
    })
    assert.deepEqual(sent.last_backup, { at: '2026-10-16T03:20:00Z', ok: true })
  } finally {
    m.server.close()
  }
})

for (const [what, answer] of [
  [
    'an unsafe tag',
    { status: 200, body: JSON.stringify({ app_tag: 'app-1; reboot', dsh_tag: 'x', hold: false }) }
  ],
  [
    'a missing dsh_tag without a hold',
    { status: 200, body: JSON.stringify({ app_tag: 'app-222222222222', hold: false }) }
  ],
  ['an HTML page answered 200', { status: 200, type: 'text/html', body: '<html>error 1033</html>' }],
  ['a 403', { status: 403, body: '' }]
]) {
  test(`${what} leaves desired.json as it was`, { skip }, async () => {
    const m = await fakeMaster(answer)
    try {
      const dir = shardDir(m.origin)
      const before = JSON.stringify({
        app_tag: 'app-111111111111',
        dsh_tag: '2026-10-01-aaaaaaaa',
        hold: false,
        received_at: 1
      })
      writeFileSync(path.join(dir, 'state/desired.json'), before)
      const run = await beat(dir, m.origin)
      assert.equal(run.status, 0, run.stderr)
      assert.equal(readFileSync(path.join(dir, 'state/desired.json'), 'utf8'), before)
      assert.match(run.stdout, /desired state left as it was/)
      assert.equal(
        JSON.parse(readFileSync(path.join(dir, 'state/heartbeat.json'), 'utf8')).code,
        String(answer.status)
      )
    } finally {
      m.server.close()
    }
  })
}

test('a running update is reported as updating, without touching any lock', { skip }, async () => {
  const m = await fakeMaster({
    status: 200,
    body: JSON.stringify({ app_tag: 'app-111111111111', dsh_tag: '2026-10-01-aaaaaaaa', hold: false })
  })
  try {
    const dir = shardDir(m.origin)
    writeFileSync(
      path.join(dir, 'state/updating.json'),
      JSON.stringify({ pid: process.pid, app_tag: 'app-2', dsh_tag: 'd', started_at: 'x' })
    )
    const run = await beat(dir, m.origin)
    assert.equal(run.status, 0, run.stderr)
    assert.equal(JSON.parse(m.seen[1].body).updating, true)
  } finally {
    m.server.close()
  }
})

test('--dry-run posts nothing, writes nothing and prints no secret', { skip }, async () => {
  const m = await fakeMaster({ status: 200, body: '{}' })
  try {
    const dir = shardDir(m.origin)
    const run = await beat(dir, m.origin, ['--dry-run'])
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(
      m.seen.map((s) => s.url),
      ['/_shard/status']
    )
    assert.match(run.stdout, /would POST .*\/api\/shards\/s9\/check/)
    assert.match(run.stdout, /x-shard-signature: [0-9a-f]{64}/)
    assert.ok(!run.stdout.includes(SECRET) && !run.stderr.includes(SECRET))
    assert.ok(!existsSync(path.join(dir, 'state/desired.json')))
  } finally {
    m.server.close()
  }
})

test('no SHARD_SECRET is a misconfigured VM: exit 1, nothing sent', { skip }, async () => {
  const dir = shardDir('https://cowork.tracy.test', { secret: '' })
  const run = await beat(dir, 'http://127.0.0.1:9')
  assert.equal(run.status, 1)
  assert.match(run.stderr, /needs HOST_NAME, MASTER_ORIGIN and SHARD_SECRET/)
})

test('the units run it every 60 s, as a oneshot that cannot hang', () => {
  const service = readFileSync(path.join(R, 'deploy/systemd/tracy-heartbeat.service'), 'utf8')
  const timer = readFileSync(path.join(R, 'deploy/systemd/tracy-heartbeat.timer'), 'utf8')
  assert.match(service, /^Type=oneshot$/m)
  assert.match(service, /^ExecStart=\/opt\/tracy-fleet\/stack\/tracy-heartbeat\.sh$/m)
  assert.match(service, /^TimeoutStartSec=50$/m)
  assert.match(timer, /^OnUnitActiveSec=60$/m)
  assert.match(timer, /^WantedBy=timers\.target$/m)
})
