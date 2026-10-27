// sync-fleet-files.sh: one build's fleet files onto a host, from a checkout or (through a fake
// docker) from the tracy-host image: what it installs, what it leaves alone, and that an
// incomplete source changes nothing.
//   node --test scripts/test/sync-fleet-files.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { bash, script, tempDir, writeFiles } from './_shard.mjs'

const FLEET = 'packages/fleet/tracy-fleet-operation'
// Files a build carries that are not required by name (one in each tree, so every tree exists);
// hooks/ and migrate/ must never travel. [path in the repo, path under /opt/tracy-fleet]
const EXTRAS = [
  [`${FLEET}/scripts/tools/extra-tool.sh`, 'tools/extra-tool.sh'],
  [`${FLEET}/scripts/webroot/site-index.php`, 'webroot/site-index.php'],
  [`${FLEET}/scripts/hooks/tracy-hooks.py`, 'hooks/tracy-hooks.py'],
  [`${FLEET}/scripts/migrate/move.sh`, 'migrate/move.sh'],
  [`${FLEET}/web/wordpress.Dockerfile`, 'web/wordpress.Dockerfile']
]
// The 18 shard files of section 10 of the shard interface contract, flat in stack/.
const CONTRACT_SHARD_FILES = [
  'install-shard.sh',
  'install-shard-steps.sh',
  'tracy-heartbeat.sh',
  'tracy-updater.sh',
  'tracy-pgdump-r2.sh',
  'check-shard.sh',
  'shard-sign.sh',
  'shard-env-check.sh',
  'sync-fleet-files.sh',
  'compose.shard.yml',
  'nginx-shard.conf',
  'shard.env.example',
  'tracy-heartbeat.service',
  'tracy-heartbeat.timer',
  'tracy-updater.service',
  'tracy-updater.timer',
  'tracy-backup-postgres.service',
  'tracy-backup-postgres.timer'
]

const sync = (args, env = {}) => bash([script('sync-fleet-files.sh'), ...args], { env })
const mode = (file) => (statSync(file).mode & 0o777).toString(8)

function listed() {
  const run = sync(['--list'])
  assert.equal(run.status, 0, run.stderr)
  return run.stdout.trim().split('\n')
}

// One build's source files, laid out as a checkout (by repo path) or as the tracy-host image
// (opt/tracy-fleet/<path under /opt/tracy-fleet>): every file and need line of --list, plus EXTRAS.
// `drop` leaves one repo path out; `change` gives one a second version.
function sourceFiles(layout, { drop = null, change = null } = {}) {
  const pairs = listed()
    .map((line) => line.split(' '))
    .filter(([kind]) => kind === 'file' || kind === 'need')
    .map(([, repo, under]) => [repo, under])
  const files = {}
  for (const [repo, under] of [...pairs, ...EXTRAS]) {
    if (repo === drop) continue
    const at = layout === 'image' ? path.join('opt/tracy-fleet', under) : repo
    files[at] = `${repo === change ? 'v2' : 'v1'} ${repo}\n`
  }
  return files
}

const checkout = (opts) => writeFiles(tempDir('sync-src-'), sourceFiles('checkout', opts))

function fakeDocker(imageRoot) {
  const bin = tempDir('fake-docker-')
  writeFileSync(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash
# Fake docker for sync-fleet-files tests: the "image" is the directory FAKE_IMAGE_ROOT.
case "$1" in
  create) [ -d "$FAKE_IMAGE_ROOT" ] || exit 1; echo fakecid ;;
  cp) src="\${2#fakecid:}"; [ -e "$FAKE_IMAGE_ROOT$src" ] || { echo "Error: no $src in fakecid" >&2; exit 1; }; cp -R "$FAKE_IMAGE_ROOT$src" "$3" ;;
  rm) ;;
  *) echo "fake docker: unexpected $*" >&2; exit 1 ;;
esac
`
  )
  chmodSync(path.join(bin, 'docker'), 0o755)
  return { PATH: `${bin}:${process.env.PATH}`, FAKE_IMAGE_ROOT: imageRoot }
}

test('--list names what the deploy actions ship, the shard files and web/, never hooks/ or migrate/', () => {
  const lines = listed()
  for (const line of [
    'file deploy/compose.server.yml stack/compose.server.yml 0644',
    'file deploy/.env.example stack/tracy-web.env.example 0644',
    'file deploy/compose.shard.yml stack/compose.shard.yml 0644',
    'file deploy/nginx/shard.conf stack/nginx-shard.conf 0644',
    'file deploy/scripts/deploy-tracy-stack.sh stack/deploy-tracy-stack.sh 0755',
    'file deploy/scripts/tracy-updater.sh stack/tracy-updater.sh 0755',
    'file deploy/scripts/sync-fleet-files.sh stack/sync-fleet-files.sh 0755',
    'file deploy/scripts/install-shard-steps.sh stack/install-shard-steps.sh 0644',
    'file deploy/systemd/tracy-backup-postgres.timer stack/tracy-backup-postgres.timer 0644',
    `file ${FLEET}/dsh/docker-proxy.haproxy.cfg dsh/docker-proxy.haproxy.cfg 0644`,
    `file ${FLEET}/dsh/seed-profile.sh dsh/seed-profile.sh 0755`,
    `tree ${FLEET}/scripts/lib lib`,
    `tree ${FLEET}/web web`,
    `need ${FLEET}/scripts/lib/web-image.sh lib/web-image.sh`,
    `need ${FLEET}/web/IMAGE_TAGS web/IMAGE_TAGS`
  ])
    assert.ok(lines.includes(line), line)
  assert.ok(!lines.some((l) => /hooks|migrate/.test(l)))
})

test('stack/ is flat and holds the contract list of shard files (interface contract section 10)', () => {
  const under = listed()
    .filter((l) => l.startsWith('file '))
    .map((l) => l.split(' ')[2])
  for (const dest of under) assert.match(dest, /^(stack|dsh)\/[^/]+$/, dest)
  for (const name of CONTRACT_SHARD_FILES) assert.ok(under.includes(`stack/${name}`), name)
  assert.equal(CONTRACT_SHARD_FILES.length, 18, 'the contract names 18 shard files')
  assert.equal(under.length, 33, '8 stack + 7 dsh files of W5, 18 shard files')
})

test('every file the two deploy actions install is listed, at the same place and mode', () => {
  const lines = listed()
  const actions = [
    '.github/actions/deploy-tracy-stack/action.yml',
    '.github/actions/deploy-host-dsh/action.yml'
  ]
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
  const installs = [...actions.matchAll(/install -m (0\d{3})\s+(\S+)\s+\/opt\/tracy-fleet\/(stack|dsh)\//g)]
  assert.ok(installs.length >= 12, `${installs.length} install lines`)
  for (const [, fileMode, src, where] of installs)
    assert.ok(lines.includes(`file ${src} ${where}/${path.basename(src)} ${fileMode}`), src)
  for (const dir of ['lib', 'provision', 'tools', 'webroot'])
    assert.ok(lines.includes(`tree ${FLEET}/scripts/${dir} ${dir}`), dir)
})

test('from a checkout onto an empty host: every file lands, scripts flat beside the compose files', () => {
  const dest = tempDir('sync-dest-')
  const run = sync(['--from-dir', checkout(), '--dest', dest])
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /^ {2}\+ stack\/deploy-tracy-stack\.sh$/m)
  assert.equal(mode(path.join(dest, 'stack/deploy-tracy-stack.sh')), '755')
  assert.equal(mode(path.join(dest, 'stack/compose.yml')), '644')
  for (const rel of [
    'stack/tracy-heartbeat.timer',
    'stack/nginx-shard.conf',
    'stack/tracy-web.env.example',
    'dsh/docker-proxy.haproxy.cfg',
    'lib/web-image.sh',
    'web/IMAGE_TAGS'
  ])
    assert.ok(existsSync(path.join(dest, rel)), rel)
  assert.ok(existsSync(path.join(dest, 'tools/extra-tool.sh')), 'whole trees, not only the required files')
  assert.ok(existsSync(path.join(dest, 'web/wordpress.Dockerfile')))
  assert.ok(!existsSync(path.join(dest, 'hooks')) && !existsSync(path.join(dest, 'migrate')))
  for (const sub of ['stack/scripts', 'stack/nginx', 'stack/systemd'])
    assert.ok(!existsSync(path.join(dest, sub)), `${sub}: flat, like the deploy action and the contract`)
})

test('a second run says only what changed, replaces by rename, and keeps files it does not know', () => {
  const dest = tempDir('sync-dest-')
  assert.equal(sync(['--from-dir', checkout(), '--dest', dest]).status, 0)
  const target = path.join(dest, 'stack/deploy-tracy-stack.sh')
  writeFileSync(path.join(dest, 'stack/operator-notes.txt'), 'mine\n')
  const inode = statSync(target).ino
  const same = sync(['--from-dir', checkout(), '--dest', dest])
  assert.equal(same.status, 0, same.stderr)
  assert.doesNotMatch(same.stdout, /^ {2}[+~] /m)
  assert.match(same.stdout, /: 0 changed under /)
  const changed = sync([
    '--from-dir',
    checkout({ change: 'deploy/scripts/deploy-tracy-stack.sh' }),
    '--dest',
    dest
  ])
  assert.equal(changed.status, 0, changed.stderr)
  assert.deepEqual(changed.stdout.match(/^ {2}[+~] .*$/gm), ['  ~ stack/deploy-tracy-stack.sh'])
  assert.match(readFileSync(target, 'utf8'), /^v2 /)
  assert.notEqual(
    statSync(target).ino,
    inode,
    'renamed into place: a running copy keeps reading its old inode'
  )
  assert.ok(existsSync(path.join(dest, 'stack/operator-notes.txt')), 'no --delete')
})

test('a source missing a required file changes nothing and names the file', () => {
  const dest = tempDir('sync-dest-')
  const run = sync(['--from-dir', checkout({ drop: `${FLEET}/scripts/lib/web-image.sh` }), '--dest', dest])
  assert.equal(run.status, 1)
  assert.match(run.stderr, /missing in the source: .*lib\/web-image\.sh/)
  assert.deepEqual(readdirSync(dest), [])
})

test('--dry-run says what it would install and writes nothing', () => {
  const dest = tempDir('sync-dest-')
  const run = sync(['--from-dir', checkout(), '--dest', dest, '--dry-run'])
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /^ {2}\+ dsh\/host-dsh-init\.sh$/m)
  assert.deepEqual(readdirSync(dest), [])
})

test('from the tracy-host image (fake docker): name for name; an image without the shard files exits 3', () => {
  const image = writeFiles(tempDir('image-'), sourceFiles('image'))
  const dest = tempDir('sync-dest-')
  const run = sync(
    ['--from-image', 'ghcr.io/tracyhq/tracy-host:app-0123456789ab', '--dest', dest],
    fakeDocker(image)
  )
  assert.equal(run.status, 0, run.stderr)
  assert.equal(mode(path.join(dest, 'stack/tracy-heartbeat.sh')), '755')
  assert.ok(
    existsSync(path.join(dest, 'stack/nginx-shard.conf')) &&
      existsSync(path.join(dest, 'stack/tracy-updater.timer'))
  )
  assert.ok(
    existsSync(path.join(dest, 'web/build.sh')) && existsSync(path.join(dest, 'provision/bootstrap.sh'))
  )
  assert.ok(!existsSync(path.join(dest, 'hooks')))
  // Before W5 P4: no /opt/tracy-fleet/stack at all.
  const old = writeFiles(tempDir('image-old-'), { 'opt/tracy-fleet/lib/web-image.sh': 'v1\n' })
  const pre = sync(
    ['--from-image', 'ghcr.io/tracyhq/tracy-host:app-old', '--dest', tempDir('sync-dest-')],
    fakeDocker(old)
  )
  assert.equal(pre.status, 3)
  assert.match(pre.stderr, /built before W5 P4/)
  // W5 P4 but not the shard line yet: stack/ without sync-fleet-files.sh.
  const w5 = writeFiles(tempDir('image-w5-'), {
    'opt/tracy-fleet/stack/compose.yml': 'v1\n',
    'opt/tracy-fleet/lib/web-image.sh': 'v1\n'
  })
  const half = sync(
    ['--from-image', 'ghcr.io/tracyhq/tracy-host:app-w5', '--dest', tempDir('sync-dest-')],
    fakeDocker(w5)
  )
  assert.equal(half.status, 3)
  assert.match(half.stderr, /built before the shard line/)
})

test('no source, two sources, or a flag without its value is a usage error (exit 2)', () => {
  assert.equal(sync([]).status, 2)
  assert.equal(sync(['--from-dir', '/x', '--from-image', 'y']).status, 2)
  assert.equal(sync(['--from-dir']).status, 2)
})
