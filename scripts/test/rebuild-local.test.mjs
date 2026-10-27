// `scripts/rebuild-local.sh` run end to end against a throwaway repo, with `docker` stubbed on PATH:
// which image tag compose is told to run, and which commit `--ref` builds from.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'rebuild-local.sh')
const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8'
  }).trim()

function put(root, path, body, mode) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), body)
  if (mode) chmodSync(join(root, path), mode)
}

// A repo with just enough for the script to reach `docker compose up`: the compose files, a
// deploy/.env that pins DSH_IMAGE_TAG=dev the way the shared checkout's does, a gitlink for the
// submodule, an inert seeder stager, and node_modules + web bundles so nothing gets bootstrapped.
function makeStand() {
  const root = mkdtempSync(join(tmpdir(), 'rebuild-local-'))
  const repo = join(root, 'repo')
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'develop')
  put(repo, 'scripts/rebuild-local.sh', readFileSync(SCRIPT, 'utf8'), 0o755)
  put(repo, 'deploy/compose.yml', 'services: {}\n')
  put(repo, 'deploy/compose.macos.yml', 'services: {}\n')
  put(repo, 'packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh', 'exit 0\n')
  put(repo, '.gitignore', 'deploy/.env\nnode_modules\n')
  git(repo, 'add', '-A')
  git(repo, 'update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},vendor/tracy/deepseek-harness`)
  git(repo, 'commit', '-q', '-m', 'base')
  put(repo, 'deploy/.env', 'DSH_IMAGE_TAG=dev\nAPP_IMAGE_TAG=\n')
  const bin = join(root, 'bin')
  const log = join(root, 'docker.log')
  // Each call logs its args plus the image variables compose would interpolate from the environment.
  put(
    bin,
    'docker',
    `#!/usr/bin/env bash
echo "$* | APP_IMAGE_TAG=\${APP_IMAGE_TAG-unset} DSH_IMAGE_TAG=\${DSH_IMAGE_TAG-unset} DSH_IMAGE=\${DSH_IMAGE-unset} WEB_IMAGE=\${WEB_IMAGE-unset} HOST_IMAGE=\${HOST_IMAGE-unset}" >> "${log}"
exit 0
`,
    0o755
  )
  return { root, repo, bin, log }
}

function run(stand, args, env = {}) {
  const base = { ...process.env }
  delete base.APP_IMAGE_TAG
  delete base.DSH_IMAGE_TAG
  const r = spawnSync('bash', [join(stand.repo, 'scripts/rebuild-local.sh'), ...args], {
    cwd: stand.repo,
    encoding: 'utf8',
    env: { ...base, PATH: `${stand.bin}:${base.PATH}`, TMPDIR: stand.root, ...env }
  })
  let log = ''
  try {
    log = readFileSync(stand.log, 'utf8')
  } catch {}
  return { ...r, log }
}

test('compose recreates tracy-dsh on the tag the script just built, not deploy/.env DSH_IMAGE_TAG=dev', () => {
  const stand = makeStand()
  // node_modules present, so build_dsh bootstraps nothing; --here builds from this repo.
  mkdirSync(join(stand.repo, 'node_modules'))
  const r = run(stand, ['--here', 'dsh'], { APP_IMAGE_TAG: 'local-develop-eeac5aef' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.log, /build .*-t tracy\/dsh:local-develop-eeac5aef/)
  const up = r.log.split('\n').find((l) => / up -d .*tracy-dsh/.test(l))
  assert.ok(up, `no compose up for tracy-dsh in:\n${r.log}`)
  assert.match(up, /DSH_IMAGE_TAG=local-develop-eeac5aef /)
  assert.match(up, /DSH_IMAGE=tracy\/dsh /)
})

test('compose recreates web and host on the tag just built even when APP_IMAGE_TAG is not exported', () => {
  const stand = makeStand()
  for (const p of [
    'packages/web/tracy-harness/dist',
    'packages/web/tracy-design-page/dist',
    'packages/web/tracy-wo-find-page/dist',
    'apps/tracy-docs/dist',
    'apps/tracy-web/static/ops-cms'
  ]) {
    mkdirSync(join(stand.repo, p), { recursive: true })
  }
  const r = run(stand, ['--here', 'web', 'host'])
  assert.equal(r.status, 0, r.stderr)
  const ups = r.log.split('\n').filter((l) => / up -d /.test(l))
  assert.equal(ups.length, 2, r.log)
  for (const l of ups) assert.match(l, /APP_IMAGE_TAG=dev .*WEB_IMAGE=tracy\/web HOST_IMAGE=tracy\/host/)
})

test('--ref origin/<branch> builds that branch even when the clone only fetches develop', () => {
  const stand = makeStand()
  // An "origin" holding a branch the clone's narrowed refspec never fetches (the shared checkout's
  // remote.origin.fetch lists develop and one other branch only).
  const origin = join(stand.root, 'origin.git')
  git(stand.root, 'clone', '-q', '--bare', stand.repo, origin)
  git(stand.repo, 'remote', 'add', 'origin', origin)
  git(stand.repo, 'config', 'remote.origin.fetch', '+refs/heads/develop:refs/remotes/origin/develop')
  git(stand.repo, 'fetch', '-q', 'origin')
  const work = join(stand.root, 'work')
  git(stand.root, 'clone', '-q', origin, work)
  git(work, 'checkout', '-q', '-b', 'wo/research-again')
  put(work, 'marker.txt', 'x')
  git(work, 'add', 'marker.txt')
  git(work, 'commit', '-q', '-m', 'branch work')
  git(work, 'push', '-q', 'origin', 'wo/research-again')
  const want = git(work, 'rev-parse', 'HEAD')

  const r = run(stand, ['--ref', 'origin/wo/research-again', 'host'])
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, new RegExp(`checking out origin/wo/research-again \\(${want.slice(0, 12)}\\)`))
})

test('--ref that names no commit stops before building anything, and says which ref', () => {
  const stand = makeStand()
  git(stand.repo, 'remote', 'add', 'origin', stand.repo)
  const r = run(stand, ['--ref', 'no-such-ref', 'host'])
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /--ref no-such-ref/)
  assert.doesNotMatch(r.log, /build/)
})
