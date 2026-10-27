/**
 * A quickstart is not "up" until its front page answers below 500.
 *
 * Measured 23/09 on dev: `quickstart/ja-intranet/j6` provisioned to `state: done` while its front page
 * answered 500 (`Attempted to load class "JFactory"`); nothing on the way ever asked the page.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { webDnsName } from '../../../../apps/tracy-web/src/sites/label.js'

const LIB = fileURLToPath(new URL('../scripts/lib/front-page.sh', import.meta.url))
const temps = []

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

/**
 * A `curl` that answers per URL: `byName` for `http://<label>-web-1/`, `byPort` for the loopback
 * port. `null` = that road does not answer (curl prints 000 and exits non-zero, as the real one does).
 */
function stand({ byName = null, byPort = null, inside = null, identity, execExit = 0 }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-front-page-'))
  temps.push(dir)
  const bin = path.join(dir, 'bin')
  mkdirSync(bin)
  const answer = (code) => (code === null ? 'printf 000; exit 7' : `printf ${code}`)
  writeFileSync(
    path.join(bin, 'curl'),
    `#!/bin/sh
for a in "$@"; do url="$a"; done
case "$url" in
  http://demo-web-1/) ${answer(byName)} ;;
  http://127.0.0.1:52110/) ${answer(byPort)} ;;
  *) echo "unexpected url $url" >&2; exit 2 ;;
esac
`,
    { mode: 0o755 }
  )
  const log = path.join(dir, 'docker-args')
  const verified = identity ?? `${'a'.repeat(64)}|true|demo|web`
  writeFileSync(
    path.join(bin, 'docker'),
    `#!/bin/sh
printf '%s\\n' "$@" >> "${log}"
case "$1" in
  inspect) printf '%s' '${verified}' ;;
  exec) printf '%s' '${inside ?? '000'}'; exit ${execExit} ;;
  *) exit 2 ;;
esac
`,
    { mode: 0o755 }
  )
  return { bin, log }
}

function refuse(roads) {
  const { bin, log } = stand(roads)
  const run = spawnSync(
    'bash',
    ['-euo', 'pipefail', '-c', '. "$1"; tracy_front_page_refusal demo 52110', '_', LIB],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }
    }
  )
  return {
    status: run.status,
    out: run.stdout.trim(),
    docker: (() => {
      try {
        return readFileSync(log, 'utf8')
      } catch {
        return ''
      }
    })()
  }
}

test('a page that renders lets the site be called up', () => {
  assert.deepEqual(refuse({ byName: 200 }), { status: 0, out: '', docker: '' })
})

test('a redirect is the site answering', () => {
  assert.equal(refuse({ byPort: 303 }).status, 0)
})

test('a 500 is refused, with the status in the reason', () => {
  const r = refuse({ byPort: 500 })
  assert.equal(r.status, 1)
  assert.match(r.out, /front page answers 500/)
})

test('the loopback port is asked when the container name does not resolve (fleet host)', () => {
  assert.equal(refuse({ byName: null, byPort: 502 }).status, 1)
  assert.equal(refuse({ byName: null, byPort: 200 }).status, 0)
})

test('silence on both roads is refused, not taken for a healthy site', () => {
  const r = refuse({})
  assert.equal(r.status, 1)
  assert.match(r.out, /did not answer at all/)
})

test('an isolated PHP site is probed inside its verified running web container', () => {
  const r = refuse({ inside: 200 })
  assert.equal(r.status, 0)
  const args = r.docker.trim().split('\n')
  const exec = args.slice(args.indexOf('exec'))
  assert.deepEqual(exec, [
    'exec',
    'a'.repeat(64),
    'curl',
    '--noproxy',
    '*',
    '-s',
    '--max-time',
    '20',
    '-o',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    '--header',
    'Host: demo-web-1',
    'http://127.0.0.1/'
  ])
  assert.ok(args.includes('demo-web-1'))
})

test('the internal probe preserves redirect and server-error policy', () => {
  assert.equal(refuse({ inside: 302 }).status, 0)
  assert.match(refuse({ inside: 500 }).out, /front page answers 500/)
  assert.equal(refuse({ byName: 500, inside: 200 }).docker, '')
  assert.equal(refuse({ byPort: 503, inside: 200 }).docker, '')
})

test('an unverified container cannot supply health evidence', () => {
  for (const identity of [
    '',
    `${'a'.repeat(64)}|false|demo|web`,
    `${'a'.repeat(64)}|true|other|web`,
    `${'a'.repeat(64)}|true|demo|db`,
    'short|true|demo|web',
    `${'a'.repeat(64)}|true|demo|web|extra`
  ]) {
    const r = refuse({ inside: 200, identity })
    assert.equal(r.status, 1, identity)
    assert.ok(!r.docker.split('\n').includes('exec'), identity)
  }
})

test('missing curl, failed exec and malformed HTTP output remain unavailable', () => {
  for (const roads of [
    { inside: 200, execExit: 127 },
    { inside: 200, execExit: 28 },
    { inside: '200noise' },
    { inside: '200\n200' },
    { inside: '' },
    { inside: '000' }
  ]) {
    assert.equal(refuse(roads).status, 1, JSON.stringify(roads))
  }
})

// Issue #165: a label past 57 characters has a `<label>-web-1` longer than a DNS label, so on the
// macOS stack (where only the docker-network name answers) the probe must dial the bounded alias —
// the same name `webDnsName` gives tracy-web — or a healthy long-label quickstart reads as silent.
test('a long label is dialled by its bounded #165 alias, never the over-long container name', () => {
  const label = 'synthetic-quickstart-front-page-dns-length-regression-165abc' // 60 chars
  assert.equal(label.length, 60)
  const alias = webDnsName(label)
  assert.notEqual(alias, `${label}-web-1`)
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-front-page-long-'))
  temps.push(dir)
  const bin = path.join(dir, 'bin')
  mkdirSync(bin)
  const log = path.join(dir, 'urls')
  writeFileSync(
    path.join(bin, 'curl'),
    `#!/bin/sh
for a in "$@"; do url="$a"; done
printf '%s\\n' "$url" >> "${log}"
case "$url" in
  http://${alias}/) printf 200 ;;
  *) printf 000; exit 7 ;;
esac
`,
    { mode: 0o755 }
  )
  const run = spawnSync(
    'bash',
    ['-euo', 'pipefail', '-c', '. "$1"; tracy_front_page_refusal "$2" 52110', '_', LIB, label],
    { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }
  )
  assert.deepEqual({ status: run.status, out: run.stdout.trim() }, { status: 0, out: '' })
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), [`http://${alias}/`])
})
