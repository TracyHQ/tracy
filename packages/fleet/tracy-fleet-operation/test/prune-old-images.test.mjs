#!/usr/bin/env node
/**
 * Every deploy pulls a new image and no step ever removed the old ones. Measured 24/09/2026 on the
 * dev machine: 467 images — 30 tracy-dsh builds at ~6.6 GB each, 194 tracy-web, 194
 * tracy-host — plus 52 GB of build cache filled the 290 GB disk to 99%, and the next deploy died
 * mid `git fetch` with no error line. `prune-old-images.sh` runs after a green deploy and removes
 * what the host can pull back from the registry at any time, never what it may need offline:
 *
 *   1. an image any container uses (running or stopped) stays;
 *   2. the tags the env files name — the current one and the one a `--rollback` goes back to — stay;
 *   3. the newest `--keep` images of each repository stay;
 *   4. images of other repositories are never looked at;
 *   5. it never fails the deploy it follows, even when docker refuses a removal.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/prune-old-images.test.mjs
 *
 * `docker` is a stub on PATH that answers from files and logs every call.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PRUNE = fileURLToPath(new URL('../../../../deploy/scripts/prune-old-images.sh', import.meta.url))

const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
case "$1" in
  images) cat "$FAKE_IMAGES" ;;
  ps) cat "$FAKE_CONTAINERS" ;;
  inspect) for id in "\${@:2}"; do grep "^$id " "$FAKE_CONTAINER_IMAGES" | cut -d' ' -f2; done ;;
  rmi) [ -n "$FAKE_RMI_FAILS" ] && { echo "conflict: unable to remove" >&2; exit 1; }; echo "Untagged: $2" ;;
esac
`

const WEB = 'ghcr.io/tracyhq/tracy-web'
const DSH = 'ghcr.io/tracyhq/tracy-dsh'
/** `docker images --format` rows: created|repository|tag|id — newest first on purpose shuffled. */
const IMAGES = [
  `2026-09-20 10:00:00 +0000 UTC|${WEB}|app-3|sha-w3`,
  `2026-09-24 10:00:00 +0000 UTC|${WEB}|app-7|sha-w7`,
  `2026-09-22 10:00:00 +0000 UTC|${WEB}|app-5|sha-w5`,
  `2026-09-23 10:00:00 +0000 UTC|${WEB}|app-6|sha-w6`,
  `2026-09-21 10:00:00 +0000 UTC|${WEB}|app-4|sha-w4`,
  `2026-09-19 10:00:00 +0000 UTC|${WEB}|app-2|sha-w2`,
  `2026-09-24 09:00:00 +0000 UTC|${DSH}|ctx-b|sha-db`,
  `2026-09-10 09:00:00 +0000 UTC|${DSH}|ctx-a|sha-da`,
  `2026-09-01 09:00:00 +0000 UTC|wordpress|apache|sha-wp`,
  `2026-09-01 09:00:00 +0000 UTC|${WEB}|<none>|sha-dangling`
]

function host(t, { rmiFails = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'prune-old-images-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(path.join(dir, 'bin'))
  writeFileSync(path.join(dir, 'bin/docker'), FAKE_DOCKER)
  chmodSync(path.join(dir, 'bin/docker'), 0o755)
  writeFileSync(path.join(dir, 'images'), `${IMAGES.join('\n')}\n`)
  // A stopped container still holds app-2 by id; the running stack is on app-7.
  writeFileSync(path.join(dir, 'containers'), 'c-web\nc-old\nc-site\n')
  writeFileSync(path.join(dir, 'container-images'), 'c-web sha-w7\nc-old sha-w2\nc-site sha-wp\n')
  writeFileSync(path.join(dir, 'web.env'), 'APP_IMAGE_TAG=app-7\nAPP_IMAGE_TAG_PREVIOUS=app-4\n')
  writeFileSync(path.join(dir, 'log'), '')
  const run = (...args) =>
    spawnSync('bash', [PRUNE, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
        FAKE_LOG: path.join(dir, 'log'),
        FAKE_IMAGES: path.join(dir, 'images'),
        FAKE_CONTAINERS: path.join(dir, 'containers'),
        FAKE_CONTAINER_IMAGES: path.join(dir, 'container-images'),
        ...(rmiFails ? { FAKE_RMI_FAILS: '1' } : {})
      }
    })
  const removed = () =>
    readFileSync(path.join(dir, 'log'), 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('rmi '))
      .map((l) => l.slice(4))
      .sort()
  return { dir, run, removed }
}

test('only what the host can pull back is removed', (t) => {
  const h = host(t)
  const r = h.run('--repo', WEB, '--repo', DSH, '--keep', '2', '--keep-env', `${h.dir}/web.env:APP_IMAGE_TAG`)
  assert.equal(r.status, 0, r.stderr)
  // Kept: app-7 and app-6 (newest two), app-4 (rollback tag), app-2 (a stopped container uses it),
  // both dsh images (only two exist), the dangling row and wordpress (not ours to judge).
  assert.deepEqual(h.removed(), [`${WEB}:app-3`, `${WEB}:app-5`])
  assert.match(r.stdout, /removed 2 image/)
})

test('a repository not named is never touched', (t) => {
  const h = host(t)
  h.run('--repo', DSH, '--keep', '1')
  assert.deepEqual(h.removed(), [`${DSH}:ctx-a`])
})

test('a removal docker refuses is reported, and the deploy it follows stays green', (t) => {
  const h = host(t, { rmiFails: true })
  const r = h.run('--repo', WEB, '--keep', '2')
  assert.equal(r.status, 0)
  assert.match(r.stdout + r.stderr, /could not remove/)
})

test('no repository named is a usage error, not a prune of everything', (t) => {
  const h = host(t)
  const r = h.run('--keep', '2')
  assert.notEqual(r.status, 0)
  assert.deepEqual(h.removed(), [])
})

test('--dry-run names what would go and removes nothing', (t) => {
  const h = host(t)
  const r = h.run('--repo', WEB, '--keep', '2', '--keep-env', `${h.dir}/web.env:APP_IMAGE_TAG`, '--dry-run')
  assert.deepEqual(h.removed(), [])
  assert.match(r.stdout, /would remove ghcr\.io\/tracyhq\/tracy-web:app-3/)
  assert.match(r.stdout, /would remove ghcr\.io\/tracyhq\/tracy-web:app-5/)
})

// Regression (04/10/2026): "is this image in use / named by an env file?" was `printf | grep -q …
// && continue` under pipefail. grep quit on the match while bash was still writing the lines after
// it; SIGPIPE made the pipeline fail, `continue` was skipped, and the image was removed. A host with
// many containers is where the in-use list is long; here it is longer than a pipe, so the loss is certain.
test('an image in use is kept however long the in-use list after it', (t) => {
  const h = host(t)
  const many = Array.from({ length: 20000 }, (_, i) => `c-many sha-x${String(i).padStart(5, '0')}`)
  writeFileSync(path.join(h.dir, 'containers'), 'c-web\nc-many\n')
  writeFileSync(path.join(h.dir, 'container-images'), `c-web sha-w7\nc-many sha-w3\n${many.join('\n')}\n`)
  const r = h.run('--repo', WEB, '--keep', '2', '--keep-env', `${h.dir}/web.env:APP_IMAGE_TAG`)
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(h.removed(), [`${WEB}:app-2`, `${WEB}:app-5`])
})
