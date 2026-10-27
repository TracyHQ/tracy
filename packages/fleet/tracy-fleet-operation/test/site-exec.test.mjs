/**
 * lib/site-exec.sh — what a `docker exec` into a site container that died says about itself.
 *
 * B-10, measured 22/09 on the local stand: two stock EmDash installs (`inv-ed-6ihhfd`,
 * `inv-ed-b5065i`) stopped in the middle of `==> content`, each at a different entry, and the
 * provision log carried NOT ONE error line. `bootstrap-site.sh` carries on to `==> media` when a
 * step fails (`|| rc=$?`), so a log that simply stops means the exec itself was cut — the container
 * stopped under it — and the only witness of why (the server's own crash, an OOM kill, a restart)
 * was the container's state and log, which nobody read before the site was torn down. Four clean
 * repros on a quiet machine the next day could not reproduce it, so the fix is that the next one
 * names its own cause.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const LIB = fileURLToPath(new URL('../scripts/lib/site-exec.sh', import.meta.url))
const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const temps = []

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

/** A `docker` on PATH that answers `inspect` and `logs` for one container the way the test says. */
function fakeDocker({ inspect, logs }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-site-exec-'))
  temps.push(dir)
  const bin = path.join(dir, 'bin')
  mkdirSync(bin)
  const inspectPart =
    inspect === null ? 'echo "Error: No such object: $3" >&2; exit 1' : `printf '%s\\n' '${inspect}'`
  writeFileSync(
    path.join(bin, 'docker'),
    `#!/bin/sh
case "$1" in
  inspect) ${inspectPart} ;;
  logs) printf '%s\\n' ${logs.map((l) => `'${l}'`).join(' ')} ;;
  *) exit 0 ;;
esac
`,
    { mode: 0o755 }
  )
  return bin
}

function explain(bin, container, rc) {
  return spawnSync(
    'bash',
    [
      '-euo',
      'pipefail',
      '-c',
      `. "$1"; tracy_explain_exec_failure "$2" "$3"`,
      '_',
      LIB,
      container,
      String(rc)
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }
    }
  )
}

test('an exec cut by a container that stopped names the exit code, the container state and its last log lines', () => {
  const bin = fakeDocker({
    inspect:
      'status=exited restarts=1 oom=false exit=137 started=2026-09-22T21:05:40Z finished=2026-09-22T21:05:39Z',
    logs: ['[emdash] seeding services/ka', 'FATAL ERROR: Reached heap limit Allocation failed']
  })
  const run = explain(bin, 'inv-ed-b5065i-web-1', 137)
  assert.equal(run.status, 0, 'explaining never fails the caller a second time')
  assert.match(run.stderr, /inv-ed-b5065i-web-1/)
  assert.match(run.stderr, /exit code 137/)
  assert.match(run.stderr, /status=exited restarts=1 oom=false exit=137/)
  assert.match(run.stderr, /Reached heap limit/, 'the server side of the story is in the provision log')
  assert.match(run.stderr, /killed/i, '137 is said out loud as a kill, not left as a number')
  assert.equal(run.stdout, '', 'everything goes to stderr, where provision failures are read')
})

test('a container that is already gone is reported as gone, not as an inspect error', () => {
  const bin = fakeDocker({ inspect: null, logs: [] })
  const run = explain(bin, 'inv-ed-6ihhfd-web-1', 1)
  assert.equal(run.status, 0)
  assert.match(run.stderr, /inv-ed-6ihhfd-web-1 no longer exists/)
  assert.match(run.stderr, /exit code 1/)
})

test('the EmDash template branch explains a failed bootstrap before giving up, and provision loads the lib', () => {
  const emdash = readFileSync(`${PROVISION}platform/emdash.sh`, 'utf8')
  const branch = /if \[ "\$template_id" = tracy-business \]; then([\s\S]*?)return 0\n\s*fi/.exec(emdash)
  assert.ok(branch, 'the tracy-business branch exists in platform_post_up')
  assert.match(
    branch[1],
    /bootstrap-site\.sh[^\n]*\|\| rc=\$\?/,
    'the exec code is kept, not swallowed by `|| return 1`'
  )
  assert.match(branch[1], /tracy_explain_exec_failure "\$\{LABEL\}-web-1" "\$rc"/)
  const provision = readFileSync(`${PROVISION}provision.sh`, 'utf8')
  assert.match(provision, /\. "\$HERE\/\.\.\/lib\/site-exec\.sh"/)
})
