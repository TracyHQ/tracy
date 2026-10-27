/**
 * `cowork_latest`: which Cowork package a new site installs, and what happens when the manifest
 * names a package that was never uploaded.
 *
 * 🔒 THE FAILURE THIS PINS STOPPED EVERY NEW WORDPRESS SITE. `update.json` is read live from `main`,
 * and the version in it is bumped in the same commit as the plugin header — but the release zip it
 * points at is uploaded by a separate, deliberate act. Measured 21/09/2026: `main` said 0.10.0, the
 * zip answered 404, and provision died at "installing cowork 0.10.0 … plugin could not be found"
 * on every host that reads the manifest, which is all of them. The floor zip existed the whole time.
 *
 * `curl` is a stub on PATH, the same way the mint-agent-token suite stubs `docker`: a HEAD (`-I`)
 * answers the status the test chose, anything else answers the manifest the test wrote. No network.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, '..', 'scripts', 'lib', 'cowork-extension.sh')
const PREFIX = 'https://github.com/TracyHQ/claude-cowork/releases/download/'

/** Runs `cowork_latest wordpress <floor>` with a stubbed `curl`. */
function latest({ manifest, headStatus, floor = '0.8.0' }) {
  const bin = mkdtempSync(path.join(tmpdir(), 'cowork-curl-'))
  const stub = path.join(bin, 'curl')
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
# A HEAD probe (-I) answers the status; a GET answers the manifest.
# The script spells the probe as one combined flag (\`-sIL\`), so look for the I inside a flag
# rather than for a bare -I — a stub that only knew the bare form answered the manifest to a HEAD.
for a in "$@"; do case "$a" in -*I*) printf '%s' '${headStatus}'; exit 0;; esac; done
cat <<'JSON'
${JSON.stringify(manifest)}
JSON
`
  )
  chmodSync(stub, 0o755)
  try {
    const out = execFileSync('bash', [SCRIPT, 'wordpress', floor], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const [version, url] = out.trim().split('\t')
    return { version, url }
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
}

test('a manifest whose package answers 2xx is trusted — the newer version wins', () => {
  const pkg = `${PREFIX}wordpress-v0.10.0/claude-cowork-0.10.0.zip`
  const { version, url } = latest({ manifest: { version: '0.10.0', package: pkg }, headStatus: '200' })
  assert.equal(version, '0.10.0')
  assert.equal(url, pkg)
})

test('a manifest whose package was never uploaded falls to the floor, never to a dead URL', () => {
  // The exact shape of 21/09: version bumped and merged, release not cut. Before the probe this
  // answered 0.10.0 with a URL that 404s, and provision installed nothing.
  const pkg = `${PREFIX}wordpress-v0.10.0/claude-cowork-0.10.0.zip`
  const { version, url } = latest({ manifest: { version: '0.10.0', package: pkg }, headStatus: '404' })
  assert.equal(version, '0.8.0')
  assert.equal(url, `${PREFIX}wordpress-v0.8.0/claude-cowork-0.8.0.zip`)
})

test('a probe that cannot answer at all (000) is treated like a missing package', () => {
  const pkg = `${PREFIX}wordpress-v0.10.0/claude-cowork-0.10.0.zip`
  const { version } = latest({ manifest: { version: '0.10.0', package: pkg }, headStatus: '000' })
  assert.equal(version, '0.8.0')
})

/**
 * `cowork_package`: the package a site installs, from the host's cache. `curl` is a stub that copies a fixture to its
 * `-o` path (or fails), and counts its calls in a file.
 */
function packageRun({ fixture, fail = false, version = '0.24.27', cache }) {
  const bin = mkdtempSync(path.join(tmpdir(), 'cowork-pkg-'))
  const calls = path.join(bin, 'calls')
  writeFileSync(calls, '')
  writeFileSync(
    path.join(bin, 'curl'),
    `#!/usr/bin/env bash
echo x >> '${calls}'
${fail ? 'exit 28' : ''}
out=''; while [ $# -gt 0 ]; do [ "$1" = -o ] && { out="$2"; shift; }; shift; done
cp '${fixture}' "$out"
`
  )
  chmodSync(path.join(bin, 'curl'), 0o755)
  let out = ''
  let status = 0
  try {
    out = execFileSync(
      'bash',
      ['-c', `. '${SCRIPT}'; cowork_package joomla '${version}' https://example.test/pkg.zip`],
      {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TRACY_COWORK_CACHE_DIR: cache },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }
    ).trim()
  } catch (error) {
    status = error.status
  }
  const n = execFileSync('wc', ['-l', calls], { encoding: 'utf8' }).trim().split(/\s+/)[0]
  rmSync(bin, { recursive: true, force: true })
  return { out, status, calls: Number(n) }
}

test('cowork_package: a version is downloaded once, kept, and read from the cache by the next site', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'cowork-cache-'))
  const zip = path.join(work, 'fixture.zip')
  execFileSync('python3', [
    '-c',
    'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1], "w"); z.writestr("pkg.xml", "<x/>"); z.close()',
    zip
  ])
  const cache = path.join(work, 'cache')
  const first = packageRun({ fixture: zip, cache })
  assert.equal(first.status, 0)
  assert.equal(first.out, path.join(cache, 'joomla-0.24.27.zip'))
  assert.equal(first.calls, 1)
  const second = packageRun({ fixture: zip, cache })
  assert.equal(second.out, first.out)
  assert.equal(second.calls, 0, 'the second site reads the cache')
  rmSync(work, { recursive: true, force: true })
})

test('cowork_package: a failed or unreadable download leaves nothing in the cache, and a strange version is refused', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'cowork-cache-'))
  const junk = path.join(work, 'junk.zip')
  writeFileSync(junk, '<html>rate limited</html>')
  const cache = path.join(work, 'cache')
  assert.notEqual(packageRun({ fixture: junk, fail: true, cache }).status, 0)
  assert.notEqual(packageRun({ fixture: junk, cache }).status, 0, 'a page that is not a zip is not kept')
  assert.deepEqual(execFileSync('ls', ['-A', cache], { encoding: 'utf8' }).trim(), '')
  assert.notEqual(packageRun({ fixture: junk, cache, version: '../x' }).status, 0)
  rmSync(work, { recursive: true, force: true })
})
