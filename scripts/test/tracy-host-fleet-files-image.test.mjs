// The tracy-host image carries the files a host's deploy installs, so a machine with no checkout —
// a shard's updater — can lay them down from the image it is about to run. Three things must stay
// in step and nothing else joins them:
//   1. the two deploy actions' `install … /opt/tracy-fleet/{stack,dsh}/` lines (what prod1/dev get),
//   2. the COPY lines of apps/tracy-host/Dockerfile (what the image carries),
//   3. scripts/ci/image-context.mjs, which fingerprints each COPY source as a git path — a glob is
//      no path, and the build job exits 2 on it.
// And the root .dockerignore must drop none of them: a COPY of an ignored file fails the build, and
// an ignored file under a copied directory vanishes with no error at all.
//
// Adding a fleet file the actions do not install is three one-line edits: its COPY line in the
// Dockerfile, its row in CARRIED below, its line in FILES of deploy/scripts/check-fleet-files-in-image.sh.
// The tests here fail on any one of the three missing.

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { copySources } from '../ci/image-context.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const DOCKERFILE = read('apps/tracy-host/Dockerfile')
const STACK = '/opt/tracy-fleet/stack/'
const DSH = '/opt/tracy-fleet/dsh/'

/**
 * Fleet files the image carries beyond what the two deploy actions install: path in the image →
 * source. Two for the stack, then one row per shard-beta file (install-shard.sh, tracy-heartbeat.sh,
 * …), each next to its own COPY line in the Dockerfile.
 */
const CARRIED = new Map([
  [`${STACK}prune-old-images.sh`, 'deploy/scripts/prune-old-images.sh'],
  [`${STACK}tracy-web.env.example`, 'deploy/.env.example'],
  // The shard beta's files (docs/sre/hop-dong-cua-shard.md section 10), one row per COPY line.
  [`${STACK}install-shard.sh`, 'deploy/scripts/install-shard.sh'],
  [`${STACK}install-shard-steps.sh`, 'deploy/scripts/install-shard-steps.sh'],
  [`${STACK}tracy-heartbeat.sh`, 'deploy/scripts/tracy-heartbeat.sh'],
  [`${STACK}tracy-updater.sh`, 'deploy/scripts/tracy-updater.sh'],
  [`${STACK}tracy-pgdump-r2.sh`, 'deploy/scripts/tracy-pgdump-r2.sh'],
  [`${STACK}check-shard.sh`, 'deploy/scripts/check-shard.sh'],
  [`${STACK}shard-sign.sh`, 'deploy/scripts/shard-sign.sh'],
  [`${STACK}shard-env-check.sh`, 'deploy/scripts/shard-env-check.sh'],
  [`${STACK}sync-fleet-files.sh`, 'deploy/scripts/sync-fleet-files.sh'],
  [`${STACK}compose.shard.yml`, 'deploy/compose.shard.yml'],
  [`${STACK}nginx-shard.conf`, 'deploy/nginx/shard.conf'],
  [`${STACK}shard.env.example`, 'deploy/shard.env.example'],
  [`${STACK}tracy-heartbeat.service`, 'deploy/systemd/tracy-heartbeat.service'],
  [`${STACK}tracy-heartbeat.timer`, 'deploy/systemd/tracy-heartbeat.timer'],
  [`${STACK}tracy-updater.service`, 'deploy/systemd/tracy-updater.service'],
  [`${STACK}tracy-updater.timer`, 'deploy/systemd/tracy-updater.timer'],
  [`${STACK}tracy-backup-postgres.service`, 'deploy/systemd/tracy-backup-postgres.service'],
  [`${STACK}tracy-backup-postgres.timer`, 'deploy/systemd/tracy-backup-postgres.timer']
])

/**
 * Whole directories the image carries for a machine with no checkout: path in the image → source.
 * A shard builds `tracy/web-joomla:*` from /opt/tracy-fleet with no checkout, and joomla.Dockerfile
 * copies this tree into the site image. About 66 MB, 63 MB of it assets/, all read at run time.
 */
const CARRIED_TREES = new Map([
  ['/opt/tracy-fleet/vendor/joomla/joomlart-t4-skill', 'vendor/joomla/joomlart-t4-skill']
])

/** COPY lines as {sources, dest}: continuations joined, `--from=` copies and flags dropped. */
function copies(text) {
  const out = []
  for (const line of text.replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    const words = line.trim().split(/\s+/)
    if (words[0] !== 'COPY' || words.some((w) => w.startsWith('--from='))) continue
    const args = words.slice(1).filter((w) => !w.startsWith('--'))
    out.push({ sources: args.slice(0, -1), dest: args.at(-1) })
  }
  return out
}

/** Path in the image → source path, for every file the Dockerfile copies by name. */
function imageFiles(text) {
  const files = new Map()
  for (const { sources, dest } of copies(text)) {
    for (const src of sources) {
      if (dest.endsWith('/')) files.set(`${dest}${src.split('/').at(-1)}`, src)
      else if (sources.length === 1) files.set(dest, src)
    }
  }
  return files
}

/** Sources of `install -m <mode> <src> /opt/tracy-fleet/<dir>/` lines in a composite action. */
function installs(actionPath, dir) {
  const line = new RegExp(`install -m 0\\d{3} (\\S+)\\s+/opt/tracy-fleet/${dir}/\\s*$`, 'gm')
  return [...read(actionPath).matchAll(line)].map((m) => m[1])
}

/** Docker's reading of one .dockerignore pattern: anchored at the context root, `*` and `?` stay
 * inside one path segment, `**` crosses them, and a match on a directory takes everything below. */
function ignoredBy(pattern, file) {
  const body = pattern.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  const re = body
    .split(/(\*\*\/|\*\*|\*|\?)/)
    .map((part) => {
      if (part === '**/') return '(?:.*/)?'
      if (part === '**') return '.*'
      if (part === '*') return '[^/]*'
      if (part === '?') return '[^/]'
      return part.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return new RegExp(`^${re}(?:/.*)?$`).test(file)
}

/** Whether the root .dockerignore keeps `file` out of the build context: the last match wins. */
function excludedFromContext(file) {
  let excluded = false
  for (const raw of read('.dockerignore').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('!')) {
      if (ignoredBy(line.slice(1), file)) excluded = false
    } else if (ignoredBy(line, file)) {
      excluded = true
    }
  }
  return excluded
}

test('every file the stack deploy installs is in the image, at the same name', () => {
  const files = imageFiles(DOCKERFILE)
  const installed = installs('.github/actions/deploy-tracy-stack/action.yml', 'stack')
  assert.ok(installed.length >= 6, `read ${installed.length} install lines: the action changed shape`)
  for (const src of installed) {
    assert.equal(files.get(`${STACK}${src.split('/').at(-1)}`), src, `${src} is not copied to ${STACK}`)
  }
})

test('every file the host-dsh deploy installs is in the image, at the same name', () => {
  const files = imageFiles(DOCKERFILE)
  const installed = installs('.github/actions/deploy-host-dsh/action.yml', 'dsh')
  assert.ok(installed.length >= 7, `read ${installed.length} install lines: the action changed shape`)
  for (const src of installed) {
    assert.equal(files.get(`${DSH}${src.split('/').at(-1)}`), src, `${src} is not copied to ${DSH}`)
  }
})

test('the image also carries what an updater and an installer use without a checkout', () => {
  const files = imageFiles(DOCKERFILE)
  for (const [dest, src] of CARRIED) assert.equal(files.get(dest), src, `${src} is not copied to ${dest}`)
  // One literal line per tree: the next test holds every COPY source to a tracked git path.
  for (const [dest, src] of CARRIED_TREES)
    assert.equal(files.get(dest), src, `${src} is not copied to ${dest}`)
  const installed = new Set([
    ...installs('.github/actions/deploy-tracy-stack/action.yml', 'stack').map(
      (s) => `${STACK}${s.split('/').at(-1)}`
    ),
    ...installs('.github/actions/deploy-host-dsh/action.yml', 'dsh').map(
      (s) => `${DSH}${s.split('/').at(-1)}`
    )
  ])
  for (const dest of files.keys()) {
    if (!dest.startsWith(STACK) && !dest.startsWith(DSH)) continue
    assert.ok(
      installed.has(dest) || CARRIED.has(dest),
      `${dest} is copied but neither installed nor in CARRIED`
    )
  }
})

test('every COPY source is a tracked git path, never a glob, so image-context.mjs can fingerprint it', () => {
  for (const src of copySources(DOCKERFILE)) {
    const tracked = execFileSync('git', ['-C', ROOT, '--literal-pathspecs', 'ls-files', '--', src], {
      encoding: 'utf8'
    }).trim()
    assert.notEqual(tracked, '', `${src} is not a tracked path`)
  }
})

test('the root .dockerignore drops none of the fleet files the image copies', () => {
  assert.equal(excludedFromContext('docs/README.md'), true, 'the reader sees the real file')
  assert.equal(
    excludedFromContext('packages/web/tracy-harness/dist/index.js'),
    false,
    'a negation re-includes'
  )
  for (const [dest, src] of imageFiles(DOCKERFILE)) {
    if (!dest.startsWith(STACK) && !dest.startsWith(DSH)) continue
    assert.equal(excludedFromContext(src), false, `${src} is outside the build context`)
  }
})

test('the root .dockerignore drops no file of the trees the image carries whole', () => {
  for (const src of CARRIED_TREES.values()) {
    const tracked = execFileSync('git', ['-C', ROOT, '--literal-pathspecs', 'ls-files', '--', src], {
      encoding: 'utf8'
    })
      .trim()
      .split('\n')
    assert.ok(tracked.length > 200, `${src}: ${tracked.length} tracked files read`)
    assert.equal(excludedFromContext(`${src}/node_modules/x/index.js`), true, 'the matcher sees an ignore')
    const dropped = tracked.filter((file) => excludedFromContext(file))
    assert.deepEqual(dropped, [], `${src}: files the build context would silently lose`)
  }
})

test('the image says which commit built it, after the last COPY, and the build passes the commit', () => {
  const lines = DOCKERFILE.split(/\r?\n/)
  const lastCopy = lines.findLastIndex((l) => l.startsWith('COPY '))
  const arg = lines.indexOf('ARG TRACY_SOURCE_COMMIT=')
  assert.ok(arg > lastCopy, 'ARG TRACY_SOURCE_COMMIT must follow every COPY, or each commit busts the cache')
  assert.match(DOCKERFILE, /^ENV TRACY_SOURCE_COMMIT=\$\{TRACY_SOURCE_COMMIT\}$/m)
  assert.match(DOCKERFILE, /org\.opencontainers\.image\.revision="\$\{TRACY_SOURCE_COMMIT\}"/)
  assert.match(
    read('.github/workflows/build-app-images.yml'),
    /one tracy-host "\$HOST_IMAGE" "\$HOST_CTX" apps\/tracy-host\/Dockerfile \\\n\s+--build-arg "TRACY_SOURCE_COMMIT=\$GITHUB_SHA"/
  )
})

test('check-fleet-files-in-image.sh compares exactly the fleet files the Dockerfile copies', () => {
  const table = read('deploy/scripts/check-fleet-files-in-image.sh').match(/^FILES='\n([\s\S]*?)^'$/m)
  assert.ok(table, 'no FILES table in deploy/scripts/check-fleet-files-in-image.sh')
  const listed = new Map(
    table[1]
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [dest, src] = line.trim().split(/\s+/)
        return [`/opt/tracy-fleet/${dest}`, src]
      })
  )
  const copied = new Map(
    [...imageFiles(DOCKERFILE)].filter(([dest]) => dest.startsWith(STACK) || dest.startsWith(DSH))
  )
  assert.deepEqual(listed, copied)
})

/**
 * The `docker` the script sees in these tests. `docker run` plays the image: it prints the digest
 * of every FILES source of this checkout, so the image "matches" (STUB_DRIFT alters the first
 * one); `docker image inspect` prints STUB_REVISION, or fails (STUB_INSPECT_FAILS). Written as a
 * function so the source is checked and formatted like the rest of the file, and run by node
 * (CommonJS, as a script with no extension is).
 */
function stubDocker() {
  const { createHash } = require('node:crypto')
  const { readFileSync } = require('node:fs')
  const [verb, sub] = process.argv.slice(2)
  if (verb === 'image' && sub === 'inspect') {
    if (process.env.STUB_INSPECT_FAILS) process.exit(1)
    process.stdout.write(`${process.env.STUB_REVISION ?? ''}\n`)
    return
  }
  if (verb !== 'run') process.exit(2)
  const script = readFileSync('deploy/scripts/check-fleet-files-in-image.sh', 'utf8')
  const table = script.match(/^FILES='\n([\s\S]*?)^'$/m)[1]
  table
    .split('\n')
    .filter((line) => line.trim())
    .forEach((line, index) => {
      const [dest, src] = line.trim().split(/\s+/)
      const hash = createHash('sha256').update(readFileSync(src))
      if (index === 0 && process.env.STUB_DRIFT) hash.update('# drift')
      process.stdout.write(`${dest} ${hash.digest('hex')}\n`)
    })
}

/** Runs check-fleet-files-in-image.sh from the repository root with the stub `docker` on PATH. */
function checkScript({ revision, drift = false, inspectFails = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-check-'))
  try {
    const stub = join(dir, 'docker')
    writeFileSync(stub, `#!/usr/bin/env node\n(${stubDocker.toString()})()\n`)
    chmodSync(stub, 0o755)
    const run = spawnSync('bash', ['deploy/scripts/check-fleet-files-in-image.sh', 'stub/image:x'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        STUB_REVISION: revision,
        ...(drift ? { STUB_DRIFT: '1' } : {}),
        ...(inspectFails ? { STUB_INSPECT_FAILS: '1' } : {})
      }
    })
    return { status: run.status, out: run.stdout, err: run.stderr }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('check-fleet-files-in-image.sh names the commit the image was built from', () => {
  const { status, out, err } = checkScript({ revision: '0123abc' })
  assert.equal(status, 0, err)
  assert.match(out, /carries 33 fleet files, byte for byte/)
  assert.match(out, /^built from commit: 0123abc$/m)
})

test('check-fleet-files-in-image.sh says so when the image has no commit label, and still passes', () => {
  const { status, out, err } = checkScript({ revision: '' })
  assert.equal(status, 0, err)
  assert.match(out, /^built from commit: \(none — image built without --build-arg TRACY_SOURCE_COMMIT\)$/m)
  assert.doesNotMatch(out, /built from commit\s*$/m, 'no bare "built from commit" line')
})

test('check-fleet-files-in-image.sh does not call a failed docker image inspect "no commit"', () => {
  const { status, out, err } = checkScript({ revision: '', inspectFails: true })
  assert.equal(status, 0, err)
  assert.match(out, /^built from commit: \(unknown — docker image inspect failed\)$/m)
})

test('check-fleet-files-in-image.sh fails, with a diff, when the image drifts from the checkout', () => {
  const { status, out, err } = checkScript({ revision: '0123abc', drift: true })
  assert.equal(status, 1, out)
  assert.match(err, /does not carry this checkout's fleet files/)
  assert.doesNotMatch(out, /built from commit/, 'a drifted image does not get the all-clear lines')
})

test('every file sync-fleet-files.sh installs is in the image at the same path, and nothing else is (docs/sre/hop-dong-cua-shard.md section 10)', () => {
  const copied = new Map(
    [...imageFiles(DOCKERFILE)].filter(([dest]) => dest.startsWith(STACK) || dest.startsWith(DSH))
  )
  const listed = new Map(
    execFileSync('bash', [join(ROOT, 'deploy/scripts/sync-fleet-files.sh'), '--list'], {
      encoding: 'utf8'
    })
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('file '))
      .map((line) => line.split(' '))
      .map(([, src, under]) => [`/opt/tracy-fleet/${under}`, src])
  )
  assert.equal(listed.size, 33, "the fleet's 15 files and the shard's 18")
  assert.deepEqual(copied, listed)
})

test('the optional trees sync-fleet-files.sh lifts are the trees the Dockerfile copies, to the same path', () => {
  const files = imageFiles(DOCKERFILE)
  const listed = execFileSync('bash', [join(ROOT, 'deploy/scripts/sync-fleet-files.sh'), '--list'], {
    encoding: 'utf8'
  })
    .trim()
    .split('\n')
    .filter((line) => line.startsWith('optional-tree '))
    .map((line) => line.split(' '))
    .map(([, src, under]) => [`/opt/tracy-fleet/${under}`, src])
  assert.deepEqual(new Map(listed), CARRIED_TREES)
  for (const [dest, src] of listed) assert.equal(files.get(dest), src, `${src} is not copied to ${dest}`)
})
