// A cut re-made before its switch is flipped starts from the version `--from` names, not from the manifest already
// uploaded for the version being re-cut.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  symlinkSync,
  realpathSync,
  renameSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { releaseManifestRefusal } from '../src/release-current-manifest.mjs'

test('the release manifest is the base unless it is stale or names another version than --from', () => {
  const m = (version) => ({ platform: 'joomla', version, parts: { webroot: {}, database: {} } })
  assert.equal(releaseManifestRefusal(m('1.0.4'), undefined), null)
  assert.equal(releaseManifestRefusal(m('1.0.4'), '1.0.4'), null)
  assert.match(
    releaseManifestRefusal(m('1.0.5'), '1.0.4'),
    /manifest is 1\.0\.5, the cut starts from 1\.0\.4/
  )
  assert.equal(releaseManifestRefusal({ product: 'x', version: '1.0.0' }, undefined), 'stale manifest')
})

// Stop at the first build subprocess: these tests exercise real input loading, never a release build.
const BUILDER = new URL('../scripts/release-joomla.mjs', import.meta.url).pathname
const TAG = 'quickstart/ja-example/j6'
const digest = (value) => createHash('sha256').update(value).digest('hex')
const childGuard = `import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';
cp.execFileSync = (cmd) => {
  appendFileSync(process.env.RELEASE_INPUT_COMMANDS, cmd + '\\n');
  throw new Error('INPUT_BOUNDARY:' + cmd);
};
syncBuiltinESMExports();`
function localFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'release-local-input-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const pack = join(dir, 'pack')
  const base = join(dir, 'corrected')
  const out = join(dir, 'out')
  mkdirSync(pack)
  mkdirSync(base)
  const parts = Object.fromEntries(
    ['webroot', 'database'].map((role) => {
      const file = role === 'webroot' ? 'demo.tar.gz' : 'demo.sql.gz'
      const bytes = Buffer.from(`synthetic ${role} bytes`)
      writeFileSync(join(pack, file), bytes)
      return [role, { file, bytes: bytes.length, sha256: digest(bytes) }]
    })
  )
  const manifest = {
    schemaVersion: 'tracy-quickstart/v1',
    product: 'ja-example',
    id: TAG,
    release: TAG,
    platform: 'joomla',
    version: '1.0.11',
    template: 'ja_example',
    cms: { name: 'joomla', version: '6.1.1' },
    parts
  }
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'joomla',
    version: '1.0.11',
    template: 'ja_example',
    cms: '6.1.1',
    install: Object.fromEntries(
      Object.entries(parts).map(([k, v]) => [k, { file: v.file, sha256: v.sha256 }])
    )
  }
  const contract = {
    schemaVersion: 'tracy-quickstart-contract/v1',
    id: 'ja-example/j6/1.0.11',
    platform: 'joomla',
    template: 'ja_example',
    quickstart: structuredClone(manifest)
  }
  const save = () => {
    for (const [file, value] of [
      [join(pack, 'manifest.json'), manifest],
      [join(pack, 'tracy_setting.json'), setting],
      [join(base, 'manifest.json'), contract]
    ])
      writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
  }
  save()
  writeFileSync(join(base, 'content-map.json'), '{"entities":[],"slots":[],"pages":[]}\n')
  writeFileSync(join(base, 'presentation-lock.json'), '{"entities":{},"files":{}}\n')
  const run = (extra = [], local = true, destination = out, source = pack) => {
    const commands = join(dir, 'commands')
    rmSync(commands, { force: true })
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        `data:text/javascript,${encodeURIComponent(childGuard)}`,
        BUILDER,
        TAG,
        '--out',
        destination,
        '--no-tokenize',
        ...(local ? ['--from-dir', source, '--base-contract-dir', base] : []),
        ...extra
      ],
      { encoding: 'utf8', timeout: 10000, env: { ...process.env, RELEASE_INPUT_COMMANDS: commands } }
    )
    assert.equal(result.error, undefined)
    return {
      ...result,
      commands: existsSync(commands) ? readFileSync(commands, 'utf8').trim().split('\n') : []
    }
  }
  return { dir, pack, base, out, manifest, setting, contract, save, run }
}

test('local release inputs use the exact pack and explicit corrected base without GitHub or a build', (t) => {
  const f = localFixture(t)
  const result = f.run(['--from', '1.0.11'])
  assert.deepEqual(result.commands, ['tar'])
  assert.match(result.stderr, /INPUT_BOUNDARY:tar/)
  for (const file of ['manifest.json', 'tracy_setting.json', 'demo.tar.gz', 'demo.sql.gz'])
    assert.deepEqual(readFileSync(join(f.out, 'from', file)), readFileSync(join(f.pack, file)))
  for (const file of ['manifest.json', 'content-map.json', 'presentation-lock.json'])
    assert.deepEqual(readFileSync(join(f.out, 'base-contract', file)), readFileSync(join(f.base, file)))
  const receipt = JSON.parse(readFileSync(join(f.out, 'source-inputs.json'), 'utf8'))
  assert.equal(receipt.mode, 'local')
  assert.equal(receipt.pack, realpathSync(f.pack))
  assert.equal(receipt.baseContract, realpathSync(f.base))
  assert.equal(receipt.files.length, 7)
})

test('local release inputs keep a nested pack distinct from its base and support the stock installer shape', (t) => {
  const f = localFixture(t)
  const bytes = Buffer.from('synthetic installer bytes')
  const file = 'demo.zip'
  f.manifest.parts = { installer: { file, bytes: bytes.length, sha256: digest(bytes) } }
  f.setting.install = { installer: { file, sha256: digest(bytes) } }
  f.contract.quickstart = structuredClone(f.manifest)
  f.save()
  // A source nested in the other source still has its own snapshot destination.
  renameSync(f.pack, join(f.base, 'pack'))
  writeFileSync(join(f.base, 'pack', file), bytes)
  const result = f.run([], true, f.out, join(f.base, 'pack'))
  assert.deepEqual(result.commands, ['unzip'])
  assert.match(result.stderr, /INPUT_BOUNDARY:unzip/)
  assert.deepEqual(readFileSync(join(f.out, 'from', file)), bytes)
  assert.deepEqual(
    readFileSync(join(f.out, 'from', 'manifest.json')),
    readFileSync(join(f.base, 'pack', 'manifest.json'))
  )
  assert.deepEqual(
    readFileSync(join(f.out, 'base-contract', 'manifest.json')),
    readFileSync(join(f.base, 'manifest.json'))
  )
})

test('local release inputs refuse missing, altered or unsafe parts before any subprocess or output', (t) => {
  for (const change of ['missing', 'hash', 'bytes', 'path', 'symlink', 'shape']) {
    const f = localFixture(t)
    if (change === 'missing') rmSync(join(f.pack, 'demo.sql.gz'))
    if (change === 'hash') writeFileSync(join(f.pack, 'demo.sql.gz'), 'changed')
    if (change === 'bytes') {
      f.manifest.parts.database.bytes++
      f.save()
    }
    if (change === 'path') {
      f.manifest.parts.database.file = '../demo.sql.gz'
      f.save()
    }
    if (change === 'symlink') {
      rmSync(join(f.pack, 'demo.sql.gz'))
      symlinkSync(join(f.pack, 'demo.tar.gz'), join(f.pack, 'demo.sql.gz'))
    }
    if (change === 'shape') {
      delete f.manifest.parts.database
      f.save()
    }
    const result = f.run()
    assert.equal(result.status, 1, change)
    assert.deepEqual(result.commands, [], change)
    assert.equal(existsSync(f.out), false, change)
  }
})

test('local release inputs refuse source identity, base-contract and conflicting-flag drift', (t) => {
  for (const change of [
    'tag',
    'version',
    'setting',
    'base-parts',
    'base-template',
    'base-id',
    'missing-map',
    'invalid-lock',
    'mixed-from',
    'mixed-contract',
    'rolling',
    'overlap',
    'stale-output'
  ]) {
    const f = localFixture(t)
    let extra = []
    if (change === 'tag') f.manifest.release = 'quickstart/other/j6'
    if (change === 'version') f.manifest.version = 'wrong'
    if (change === 'setting') f.setting.install.database.sha256 = '0'.repeat(64)
    if (change === 'base-parts') f.contract.quickstart.parts.database.sha256 = '0'.repeat(64)
    if (change === 'base-template') f.contract.template = 'another'
    if (change === 'base-id') f.contract.id = 'other/j6/1.0.11'
    if (change === 'mixed-from') extra = ['--from', '1.0.10']
    if (change === 'mixed-contract') extra = ['--contract-from', '1.0.11']
    if (change === 'rolling') extra = ['--rolling-as', '1.0.11']
    f.save()
    if (change === 'missing-map') rmSync(join(f.base, 'content-map.json'))
    if (change === 'invalid-lock') writeFileSync(join(f.base, 'presentation-lock.json'), 'null')
    if (change === 'stale-output') {
      mkdirSync(f.out)
      writeFileSync(join(f.out, 'stale'), 'old input')
    }
    const result = f.run(extra, true, change === 'overlap' ? f.pack : f.out)
    assert.equal(result.status, 1, change)
    assert.deepEqual(result.commands, [], change)
    assert.equal(existsSync(f.out), change === 'stale-output', change)
  }
})

test('local release inputs require both explicit paths and never reinterpret a missing flag value', (t) => {
  for (const extra of [
    ['--from-dir'],
    ['--base-contract-dir'],
    ['--from-dir', '/absent'],
    ['--base-contract-dir', '/absent']
  ]) {
    const f = localFixture(t)
    const result = f.run(extra, false)
    assert.equal(result.status, 1)
    assert.deepEqual(result.commands, [])
    assert.equal(existsSync(f.out), false)
  }
})

test('local release inputs leave the default released-source route on its existing GitHub path', (t) => {
  const f = localFixture(t)
  const result = f.run([], false)
  assert.ok(result.commands.length > 0)
  assert.ok(result.commands.every((cmd) => cmd === 'gh'))
  assert.equal(existsSync(join(f.out, 'source-inputs.json')), false)
})
