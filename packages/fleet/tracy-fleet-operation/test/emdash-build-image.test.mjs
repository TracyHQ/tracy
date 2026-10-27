/**
 * `provision/emdash/build-image.sh` — which upstream tag "the latest version" means.
 *
 * What must hold: with no version argument the script builds the newest RELEASED `emdash@<x.y.z>`.
 * A prerelease (`emdash@1.0.1-rc.1`) is never picked: `sort -V` orders `1.0.1-rc.1` after `1.0.1`,
 * so on 28/09/2026 the unfiltered pipeline chose the release candidate over the release. Other
 * monorepo prefixes (`@emdash-cms/admin@…`) are never picked either.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-build-image.test.mjs
 *
 * Upstream is a local repository carrying only tags; `docker` is a stub on PATH that says the
 * image already exists, so the script stops right after naming the tag it chose.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/emdash/build-image.sh', import.meta.url))

function upstream(t, tags) {
  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-build-image-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const repo = path.join(dir, 'upstream')
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' })
  mkdirSync(repo)
  git('init', '-q')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'root')
  for (const tag of tags) git('tag', tag)
  mkdirSync(path.join(dir, 'bin'))
  writeFileSync(path.join(dir, 'bin/docker'), '#!/usr/bin/env bash\nexit 0\n')
  chmodSync(path.join(dir, 'bin/docker'), 0o755)
  return { repo, bin: path.join(dir, 'bin') }
}

function chosen(t, tags) {
  const { repo, bin } = upstream(t, tags)
  const run = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, EMDASH_UPSTREAM: repo }
  })
  assert.equal(run.status, 0, run.stderr)
  return /==> (emdash@\S+)\s+→\s+(\S+)/.exec(run.stdout)?.slice(1, 3)
}

test('a release beats its own release candidates', (t) => {
  assert.deepEqual(chosen(t, ['emdash@0.42.0', 'emdash@1.0.1-rc.0', 'emdash@1.0.1-rc.1', 'emdash@1.0.1']), [
    'emdash@1.0.1',
    'tracy/emdash:1.0.1'
  ])
})

test('a release candidate newer than every release is not built', (t) => {
  assert.deepEqual(chosen(t, ['emdash@1.0.1', 'emdash@1.1.0-rc.0']), ['emdash@1.0.1', 'tracy/emdash:1.0.1'])
})

test('other monorepo prefixes are ignored', (t) => {
  assert.deepEqual(chosen(t, ['emdash@0.38.0', '@emdash-cms/admin@2.0.0', 'create-emdash@9.0.0']), [
    'emdash@0.38.0',
    'tracy/emdash:0.38.0'
  ])
})

/**
 * The build-stage heap patch. Upstream is a repository whose tag carries a Dockerfile; `docker image
 * inspect` says the image is missing, and `docker build` copies the patched Dockerfile out of the
 * build context before the script's trap removes it.
 */
function builtDockerfile(t, dockerfile) {
  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-build-image-heap-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const repo = path.join(dir, 'upstream')
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' })
  mkdirSync(repo)
  git('init', '-q')
  writeFileSync(path.join(repo, 'Dockerfile'), dockerfile)
  git('add', 'Dockerfile')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'root')
  git('tag', 'emdash@1.1.0')
  const out = path.join(dir, 'built.Dockerfile')
  mkdirSync(path.join(dir, 'bin'))
  writeFileSync(
    path.join(dir, 'bin/docker'),
    // `image inspect` says "missing" until `build` ran, then "present" for the closing inspect.
    `#!/usr/bin/env bash\ncase "$1" in image) [ -f ${JSON.stringify(out)} ] || exit 1;; build) cp "\${@: -1}/Dockerfile" ${JSON.stringify(out)};; esac\nexit 0\n`
  )
  chmodSync(path.join(dir, 'bin/docker'), 0o755)
  // The script patches with GNU `sed -i` (it runs on the Linux droplet); on macOS use gnu-sed.
  if (process.platform === 'darwin') {
    const gsed = spawnSync('which', ['gsed'], { encoding: 'utf8' }).stdout.trim()
    if (gsed === '') {
      t.skip('needs GNU sed: brew install gnu-sed')
      return null
    }
    writeFileSync(path.join(dir, 'bin/sed'), `#!/usr/bin/env bash\nexec ${JSON.stringify(gsed)} "$@"\n`)
    chmodSync(path.join(dir, 'bin/sed'), 0o755)
  }
  const run = spawnSync('bash', [SCRIPT, '1.1.0'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, EMDASH_UPSTREAM: repo }
  })
  return { run, text: run.status === 0 ? readFileSync(out, 'utf8') : '' }
}

const heapLines = (text) => text.split('\n').filter((l) => l.includes('max-old-space-size='))

test('an upstream heap line in the build stage is rewritten to 8 GB, not shadowed by a second one', (t) => {
  const built = builtDockerfile(
    t,
    'FROM node:22-slim AS base\nFROM base AS deps\nFROM deps AS build\nCOPY . .\nENV NODE_OPTIONS=--max-old-space-size=4096\nRUN pnpm build && pnpm deploy\nFROM node:22-slim\n'
  )
  if (built === null) return
  const { run, text } = built
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(heapLines(text), ['ENV NODE_OPTIONS=--max-old-space-size=8192'])
})

test('a build stage without a heap line gets one right under FROM deps AS build', (t) => {
  const built = builtDockerfile(
    t,
    'FROM node:22-slim AS base\nFROM base AS deps\nFROM deps AS build\nCOPY . .\nRUN pnpm build && pnpm deploy\nFROM node:22-slim\n'
  )
  if (built === null) return
  const { run, text } = built
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(heapLines(text), ['ENV NODE_OPTIONS=--max-old-space-size=8192'])
  assert.match(text, /FROM deps AS build\nENV NODE_OPTIONS=--max-old-space-size=8192\n/)
})
