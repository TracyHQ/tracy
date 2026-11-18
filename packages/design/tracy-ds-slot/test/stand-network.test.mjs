// Exercise the stock CLI with synthetic inputs and intercepted subprocesses: no Docker or archive runs.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const STAND = new URL('../scripts/stand.mjs', import.meta.url).pathname
const NAME = 'stand-network-test'
const networkId = 'a'.repeat(64)
const guard = `import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { appendFileSync, copyFileSync } from 'node:fs';
const scenario = JSON.parse(process.env.STAND_NETWORK_SCENARIO);
const invoke = (command, args) => {
  appendFileSync(process.env.STAND_NETWORK_COMMANDS, JSON.stringify([command, ...args]) + '\\n');
  if (command === 'cp') { copyFileSync(args[0], args[1]); return ''; }
  if (command === 'tar') return '';
  if (command !== 'docker') throw new Error('UNEXPECTED_SUBPROCESS:' + command);
  if (args[0] === 'rm') return '';
  if (args[0] === 'network' && args[1] === 'create') {
    if (scenario.create) return '${networkId}';
    throw new Error('NETWORK_CREATE: address pools exhausted');
  }
  if (args[0] === 'network' && args[1] === 'inspect') {
    if (scenario.inspect === null) throw new Error('NETWORK_INSPECT: not found');
    return JSON.stringify(scenario.inspect);
  }
  if (args[0] === 'run') throw new Error('DB_RUN_BOUNDARY');
  throw new Error('UNEXPECTED_DOCKER:' + args.join(' '));
};
cp.execFileSync = invoke;
cp.spawnSync = (command, args) => {
  try { return { status: 0, stdout: invoke(command, args), stderr: '' }; }
  catch (error) { return { status: 1, stdout: '', stderr: error.message }; }
};
syncBuiltinESMExports();`

function stand(t, scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'stand-network-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const pack = join(dir, 'pack')
  mkdirSync(pack)
  const bytes = Buffer.from('synthetic part')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  for (const file of ['webroot.tar.gz', 'database.sql.gz']) writeFileSync(join(pack, file), bytes)
  writeFileSync(
    join(pack, 'manifest.json'),
    JSON.stringify({
      platform: 'joomla',
      version: '1.0.0',
      prefix: 'test_',
      parts: {
        webroot: { file: 'webroot.tar.gz', sha256 },
        database: { file: 'database.sql.gz', sha256 }
      }
    })
  )
  const commands = join(dir, 'commands.jsonl')
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(guard)}`,
      STAND,
      'up',
      'quickstart/ja-example/j6',
      '--version',
      '1.0.0',
      '--port',
      '59999',
      '--name',
      NAME,
      '--dir',
      join(dir, 'work'),
      '--from-dir',
      pack
    ],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        DOCKER_HOST: 'unix:///synthetic-docker.sock',
        DS_STAND_CACHE: '',
        STAND_NETWORK_SCENARIO: JSON.stringify(scenario),
        STAND_NETWORK_COMMANDS: commands
      }
    }
  )
  assert.equal(result.error, undefined)
  return { ...result, commands: readFileSync(commands, 'utf8').trim().split('\n').map(JSON.parse) }
}

test('network creation failure is reported before any database run, without a retry', (t) => {
  const r = stand(t, { create: false, inspect: null })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /NETWORK_CREATE: address pools exhausted/)
  assert.deepEqual(
    r.commands.filter((a) => a[1] === 'network'),
    [
      ['docker', 'network', 'create', NAME],
      ['docker', 'network', 'inspect', '--format', '{{json .}}', NAME]
    ]
  )
  assert.ok(!r.commands.some((a) => a[1] === 'run'))
})

test('a newly created network proceeds directly to the database boundary', (t) => {
  const r = stand(t, { create: true, inspect: null })
  assert.match(r.stderr, /DB_RUN_BOUNDARY/)
  assert.deepEqual(
    r.commands.filter((a) => a[1] === 'network'),
    [['docker', 'network', 'create', NAME]]
  )
})

test('an existing network is reused only after exact-name inspect with a full ID', (t) => {
  const r = stand(t, { create: false, inspect: { Name: NAME, Id: networkId } })
  assert.match(r.stderr, /DB_RUN_BOUNDARY/)
  assert.deepEqual(
    r.commands.filter((a) => a[1] === 'network'),
    [
      ['docker', 'network', 'create', NAME],
      ['docker', 'network', 'inspect', '--format', '{{json .}}', NAME]
    ]
  )
})

test('a different network name or incomplete identity cannot hide the creation failure', (t) => {
  for (const inspect of [
    { Name: NAME + '-other', Id: networkId },
    { Name: NAME, Id: 'abc123' },
    { Name: NAME },
    null,
    'invalid inspection'
  ]) {
    const r = stand(t, { create: false, inspect })
    assert.match(r.stderr, /NETWORK_CREATE: address pools exhausted/)
    assert.ok(!r.commands.some((a) => a[1] === 'run'))
  }
})
