/**
 * The demo farm, seen by the host's monitoring and deploy (part 2b): check-server.sh step 7c,
 * server-status-alert.sh's container part, tracy-updater.sh's farm image, deploy-tracy-stack.sh 6c.
 * Each block is lifted out of its script and run against a docker stand-in that plays the farm's
 * state, so the case is the script's own text, not a copy of it.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/farm-monitoring.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const DEPLOY = fileURLToPath(new URL('../../../../deploy/scripts/', import.meta.url))

/** The text of `file` from the line holding `from` up to (not including) the line holding `to`. */
function lift(file, from, to) {
  const src = readFileSync(path.join(DEPLOY, file), 'utf8')
  const start = src.indexOf(from)
  assert.ok(start !== -1, `${file} no longer contains: ${from}`)
  const end = src.indexOf(to, start + from.length)
  assert.ok(end !== -1, `${file} has no ${to} after ${from}`)
  return src.slice(start, end)
}

/**
 * A docker that answers for a farm in state `farm` (`up`, `db-down`, `gone`), with `folded` forwarders.
 * Every call is recorded.
 */
function stand({ farm = 'up', folded = ['demo-a', 'demo-b'] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'farm-monitoring-'))
  mkdirSync(path.join(dir, 'bin'))
  const web = farm === 'gone' ? '' : '/tracy-demos-web'
  writeFileSync(
    path.join(dir, 'bin', 'docker'),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${dir}/calls"
case "$*" in
  "ps -a --filter label=tracy.runtime=farm --format {{.Names}}") ${folded.map((l) => `echo ${l}-web-1`).join('; ') || ':'} ;;
  "inspect -f {{.Name}} tracy-demos-web") [ -n "${web}" ] && echo "${web}" || exit 1 ;;
  "inspect -f {{.State.Running}} tracy-demos-web") [ "${farm}" = gone ] && exit 1 || echo true ;;
  "inspect -f {{.State.Running}} tracy-demos-db") case "${farm}" in up) echo true ;; db-down) echo false ;; *) exit 1 ;; esac ;;
  "exec tracy-demos-web curl "*) exit 0 ;;
  "exec tracy-demos-db sh -c "*) [ "${farm}" = up ] ;;
  "image inspect "*) exit 1 ;;
  *) exit 0 ;;
esac
`,
    { mode: 0o755 }
  )
  const run = (script, env = {}) =>
    spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, ...env }
    })
  const calls = () => {
    try {
      return readFileSync(path.join(dir, 'calls'), 'utf8').split('\n').filter(Boolean)
    } catch {
      return []
    }
  }
  return { dir, run, calls, dispose: () => rmSync(dir, { recursive: true, force: true }) }
}

const CHECK_7C = () => lift('check-server.sh', '# ── 7c: the demo farm', '# ── 8: the SPAs')
const checkServer = (s) =>
  s.run(
    `fail() { echo "✗ $1"; [ -n "\${2:-}" ] && echo " $2"; exit 1; }; ok() { echo "✓ $1"; }\n${CHECK_7C()}`
  )

test('check-server.sh 7c: a farm serving its folded demos is ok, and says how many', () => {
  const s = stand()
  try {
    const r = checkServer(s)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /✓ the demo farm serves 2 folded demo\(s\)/)
  } finally {
    s.dispose()
  }
})

for (const [farm, why] of [
  ['db-down', /tracy-demos-db\(not running\)/],
  ['gone', /tracy-demos-web\(not running\).*tracy-demos-db\(not running\)/]
])
  test(`check-server.sh 7c: a farm ${farm} fails, naming the demos it takes down`, () => {
    const s = stand({ farm })
    try {
      const r = checkServer(s)
      assert.equal(r.status, 1, r.stdout + r.stderr)
      assert.match(r.stdout, why)
      assert.match(r.stdout, /2 folded demo\(s\) are not served: demo-a demo-b/)
      assert.match(r.stdout, /never down/)
    } finally {
      s.dispose()
    }
  })

test('check-server.sh 7c: a host with no farm and no folded demo is ok and asks nothing more', () => {
  const s = stand({ farm: 'gone', folded: [] })
  try {
    const r = checkServer(s)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /no demo farm on this host/)
    assert.ok(!s.calls().some((c) => c.startsWith('exec ')))
  } finally {
    s.dispose()
  }
})

const ALERT = () =>
  lift(
    'server-status-alert.sh',
    '  # The demo farm (fleet scripts/lib/demo-farm.sh)',
    '  # Top 5 containers by memory'
  )
const alertRun = (s) =>
  s.run(
    `problems=(); details=(); containers_line="Containers: 9 running"\n${ALERT()}\nprintf 'P:%s\\n' "\${problems[@]}"; printf 'D:%s\\n' "\${details[@]}"; echo "L:$containers_line"`
  )

test('server-status-alert.sh: a farm that is gone while forwarders point at it is an alert, by name', () => {
  const s = stand({ farm: 'gone' })
  try {
    const r = alertRun(s)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /^P:farm:tracy-demos-web$/m)
    assert.match(r.stdout, /^P:farm:tracy-demos-db$/m)
    assert.match(r.stdout, /^D:demo farm tracy-demos-web is not running — 2 folded demo\(s\) down$/m)
    assert.match(r.stdout, /^L:Containers: 9 running; demo farm down \(2 folded demos\)$/m)
  } finally {
    s.dispose()
  }
})

test('server-status-alert.sh: a farm that is up adds its line and no problem; no farm, no line', () => {
  const up = stand()
  const none = stand({ farm: 'gone', folded: [] })
  try {
    const r = alertRun(up)
    assert.doesNotMatch(r.stdout, /^P:farm/m)
    assert.match(r.stdout, /^L:Containers: 9 running; demo farm up \(2 folded demos\)$/m)
    assert.match(alertRun(none).stdout, /^L:Containers: 9 running$/m)
  } finally {
    up.dispose()
    none.dispose()
  }
})

const UPDATER = () => lift('tracy-updater.sh', "# The demo farm's image (web/DEMOS_IMAGE", 'apply_nginx() {')

test('tracy-updater.sh: the farm image is built where a farm runs and it is missing; nowhere else', () => {
  for (const [farm, env, built] of [
    ['up', {}, true],
    ['gone', { TRACY_DEMO_FARM: '1' }, true],
    ['gone', {}, false]
  ]) {
    const s = stand({ farm, folded: [] })
    try {
      const fleet = path.join(s.dir, 'fleet')
      mkdirSync(path.join(fleet, 'web'), { recursive: true })
      writeFileSync(
        path.join(fleet, 'web', 'DEMOS_IMAGE'),
        '# x\njoomla:6-php8.4-fpm=tracy/web-demos:test-r1\n'
      )
      writeFileSync(path.join(fleet, 'web', 'build.sh'), `echo "build $*" >> "${s.dir}/calls"\n`)
      const r = s.run(`FLEET_DIR='${fleet}'\n${UPDATER()}\nbuild_demos_image_if_needed`, env)
      assert.equal(r.status, 0, r.stderr)
      assert.equal(s.calls().includes('build demos'), built, `${farm} ${JSON.stringify(env)}`)
    } finally {
      s.dispose()
    }
  }
})

test('deploy-tracy-stack.sh 6c: the farm is never recreated, stopped or restarted by a deploy', () => {
  const block = lift(
    'deploy-tracy-stack.sh',
    '# ── 6c. The demo farm, left as it is',
    '# ── 7. Prove they answer'
  )
  const code = block
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
  assert.doesNotMatch(code, /docker compose|docker (stop|restart|rm|start|kill)\b/)
  const s = stand({ farm: 'db-down' })
  try {
    const r = s.run(`say() { echo "$*"; }; read_env() { :; }\n${block}`)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /every folded demo on this host is down \(left as found/)
  } finally {
    s.dispose()
  }
})
