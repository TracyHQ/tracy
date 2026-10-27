#!/usr/bin/env node
/**
 * `apply-site-limits.sh` puts this host's resource caps on site containers that are ALREADY running,
 * with `docker update` — no recreate. What it must get right, each pinned below:
 *
 *   1. a dry run (the default) reads and reports, and never runs `docker update`;
 *   2. `--apply` gives every web container the platform's memory cap and every MariaDB its own, with
 *      swap equal to memory, the core share and the process cap — the SAME values render-compose.sh
 *      writes, because it asks the same function;
 *   3. it never caps a container it cannot tie to the site (compose's working_dir label), and never
 *      lowers a cap under what a container uses now (the kernel would kill a process to fit);
 *   4. a host setting render-compose.sh would refuse stops the run before any container is touched;
 *   5. it says, per container, whether the site's compose file keeps the caps across a recreate.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/apply-site-limits.test.mjs
 *
 * `docker` is a stub on PATH that answers from one file per container and logs every call.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { sh } from './sh-async.mjs'
import { linkStub, warmStub } from './warm-stub.mjs'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/apply-site-limits.sh', import.meta.url))

// State per container: `$FAKE_DIR/<name>` holds `working_dir|running|memory|swap|nanocpus|pids`,
// `$FAKE_DIR/<name>.usage` what `docker stats` prints for it. `update` rewrites the state the way the
// daemon would, unless FAKE_UPDATE_FAILS names the container.
const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
case "$1" in
  info) printf '%s\\n' "\${FAKE_NCPU:-8}" ;;
  inspect)
    name="\${!#}"
    [ -f "$FAKE_DIR/$name" ] || { echo "Error: No such object: $name" >&2; exit 1; }
    cat "$FAKE_DIR/$name" ;;
  stats)
    name="\${!#}"
    cat "$FAKE_DIR/$name.usage" 2>/dev/null || echo "0B / 0B" ;;
  update)
    shift
    while [ $# -gt 1 ]; do
      case "$1" in
        --memory) mem="$2"; shift 2 ;;
        --memory-swap) swap="$2"; shift 2 ;;
        --cpus) cpus="$2"; shift 2 ;;
        --pids-limit) pids="$2"; shift 2 ;;
        *) echo "stub: unexpected update flag $1" >&2; exit 2 ;;
      esac
    done
    name="$1"
    [ "\${FAKE_UPDATE_FAILS:-}" = "$name" ] && { echo "Error response from daemon: refused" >&2; exit 1; }
    bytes() { case "$1" in *g) echo $(( \${1%g} * 1073741824 )) ;; *m) echo $(( \${1%m} * 1048576 )) ;; esac; }
    IFS='|' read -r dir running _ _ _ _ < "$FAKE_DIR/$name"
    nano=$(awk -v c="$cpus" 'BEGIN { printf "%.0f", c * 1e9 }')
    printf '%s|%s|%s|%s|%s|%s\\n' "$dir" "$running" "$(bytes "$mem")" "$(bytes "$swap")" "$nano" "$pids" > "$FAKE_DIR/$name"
    echo "$name" ;;
  *) echo "stub: unexpected docker $1" >&2; exit 2 ;;
esac
`

// One stub for the whole file (see warm-stub.mjs); a case links it.
const DOCKER_STUB = warmStub('docker', FAKE_DOCKER, {
  warmEnv: { FAKE_LOG: '/dev/null', FAKE_DIR: '/nonexistent' },
  warmArgs: ['info']
})

/** A caps run exactly as render-compose.sh writes it (the four lines after shm_size / restart). */
const run = (memory, cpus = '2', pids = '1024') =>
  `    mem_limit: ${memory}\n    memswap_limit: ${memory}\n    cpus: ${cpus}\n    pids_limit: ${pids}\n`

/**
 * A host with a private root holding the given sites, and the stub on PATH.
 * @param {import('node:test').TestContext} t
 * @param {Array<{label: string, platform: 'wordpress'|'joomla'|'emdash', compose?: string, containers?: Record<string, {dir?: string, running?: boolean, caps?: string, usage?: string}>}>} sites
 */
function host(t, sites) {
  const base = mkdtempSync(path.join(tmpdir(), 'apply-site-limits-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = path.join(base, 'private')
  const fake = path.join(base, 'fake')
  mkdirSync(path.join(base, 'bin'), { recursive: true })
  mkdirSync(fake, { recursive: true })
  linkStub(DOCKER_STUB, path.join(base, 'bin/docker'))
  for (const site of sites) {
    const dir = path.join(root, site.label)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, '.env'), `HOST_PORT=52001\nPLATFORM=${site.platform}\n`)
    writeFileSync(
      path.join(dir, 'docker-compose.yml'),
      site.compose ?? `services:\n  web:\n    image: tracy/web-${site.platform}:x\n`
    )
    const names = site.platform === 'emdash' ? ['web'] : ['web', 'db']
    for (const service of names) {
      const name = `${site.label}-${service}-1`
      const c = site.containers?.[service] ?? {}
      if (c.absent) continue
      writeFileSync(
        path.join(fake, name),
        `${c.dir ?? dir}|${c.running === false ? 'false' : 'true'}|${c.caps ?? '0|0|0|<no value>'}\n`
      )
      writeFileSync(path.join(fake, `${name}.usage`), `${c.usage ?? '300MiB / 7.651GiB'}\n`)
    }
  }
  return { base, root, fake, log: path.join(base, 'docker.log') }
}

async function apply(h, args = [], env = {}) {
  const r = await sh('bash', [SCRIPT, '--root', h.root, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(h.base, 'bin')}:${process.env.PATH}`,
      FAKE_DIR: h.fake,
      FAKE_LOG: h.log,
      // Neither this machine's /etc/tracy nor a knob in the test runner's own environment may pick a cap.
      TRACY_WEB_ENV_FILE: '/nonexistent/tracy-web.env',
      TRACY_SITE_MEMORY: '',
      TRACY_SITE_MEMORY_EMDASH: '',
      TRACY_SITE_DB_MEMORY: '',
      TRACY_SITE_CPUS: '',
      TRACY_SITE_PIDS: '',
      TRACY_HOST_CPUS: '',
      ...env
    }
  })
  let log = ''
  try {
    log = readFileSync(h.log, 'utf8')
  } catch {
    log = ''
  }
  return { ...r, log, updates: log.split('\n').filter((l) => l.startsWith('update ')) }
}

const state = (h, name) => readFileSync(path.join(h.fake, name), 'utf8').trim().split('|')

const SITES = [
  { label: 'wpone', platform: 'wordpress' },
  { label: 'jone', platform: 'joomla' },
  { label: 'emone', platform: 'emdash' }
]

describe('apply-site-limits.sh', { concurrency: 8 }, () => {
  test('a dry run reports every container, current and would-be caps, and updates nothing', async (t) => {
    const h = host(t, SITES)
    const r = await apply(h)
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.deepEqual(r.updates, [], 'a dry run must not run docker update')
    assert.match(
      r.stdout,
      /this host's caps: web 2g \(EmDash 3g\), database 1g, 2 cores and 1024 processes each/
    )
    assert.match(
      r.stdout,
      /wpone-web-1: would cap — now memory none, swap none, cpus none, pids none; would be memory 2g, swap 2g, cpus 2, pids 1024/
    )
    assert.match(r.stdout, /wpone-db-1: would cap — .*would be memory 1g, swap 1g, cpus 2, pids 1024/)
    assert.match(r.stdout, /jone-db-1: would cap/)
    assert.match(r.stdout, /emone-web-1: would cap — .*would be memory 3g, swap 3g, cpus 2, pids 1024/)
    assert.doesNotMatch(r.stdout, /emone-db-1/, 'an EmDash site has no database container to cap')
    assert.match(
      r.stdout,
      /predates the caps, so a recreate drops them — re-render it: render-compose.sh wpone/
    )
    assert.match(r.stdout, /dry run — nothing changed/)
    assert.match(r.stdout, /5 container\(s\): 0 capped, 0 already capped, 0 skipped, 0 failed/)
  })

  test('--apply caps every web and database container with the host values, and reads them back', async (t) => {
    const h = host(t, SITES)
    const r = await apply(h, ['--apply'])
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.deepEqual(
      r.updates.sort(),
      [
        'update --memory 2g --memory-swap 2g --cpus 2 --pids-limit 1024 jone-web-1',
        'update --memory 2g --memory-swap 2g --cpus 2 --pids-limit 1024 wpone-web-1',
        'update --memory 1g --memory-swap 1g --cpus 2 --pids-limit 1024 jone-db-1',
        'update --memory 1g --memory-swap 1g --cpus 2 --pids-limit 1024 wpone-db-1',
        'update --memory 3g --memory-swap 3g --cpus 2 --pids-limit 1024 emone-web-1'
      ].sort()
    )
    assert.deepEqual(state(h, 'wpone-web-1').slice(2), ['2147483648', '2147483648', '2000000000', '1024'])
    assert.deepEqual(state(h, 'emone-web-1').slice(2), ['3221225472', '3221225472', '2000000000', '1024'])
    assert.match(r.stdout, /wpone-web-1: capped — memory 2g, swap 2g, cpus 2, pids 1024 \(was memory none/)
    assert.match(r.stdout, /5 container\(s\): 5 capped, 0 already capped, 0 skipped, 0 failed/)
    // No recreate, no restart: `update` is the only verb that changes anything.
    assert.deepEqual(
      [
        ...new Set(
          r.log
            .split('\n')
            .filter(Boolean)
            .map((l) => l.split(' ')[0])
        )
      ].sort(),
      ['info', 'inspect', 'stats', 'update']
    )
    // A second run finds nothing to do.
    const again = await apply(h, ['--apply'])
    assert.equal(again.status, 0, again.stderr)
    assert.equal(again.updates.length, 5, 'the second run must not update again')
    assert.match(again.stdout, /5 container\(s\): 0 capped, 5 already capped/)
  })

  test('--label caps one site and nothing else; an unknown label is an error', async (t) => {
    const h = host(t, SITES)
    const r = await apply(h, ['--apply', '--label', 'emone'])
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(r.updates, [
      'update --memory 3g --memory-swap 3g --cpus 2 --pids-limit 1024 emone-web-1'
    ])
    const missing = await apply(h, ['--label', 'nosuch'])
    assert.notEqual(missing.status, 0)
    assert.match(missing.stderr, /no site nosuch/)
    const bad = await apply(h, ['--label', '../etc'])
    assert.equal(bad.status, 2)
    assert.match(bad.stderr, /not a site label/)
  })

  test('a container compose ties to another directory is left alone, and the run says so', async (t) => {
    const h = host(t, [
      { label: 'wpone', platform: 'wordpress', containers: { web: { dir: '/somewhere/else' } } }
    ])
    const r = await apply(h, ['--apply'])
    assert.equal(r.status, 1, 'a skipped container is not a finished run')
    assert.match(r.stdout, /wpone-web-1: SKIPPED — compose says it belongs to \/somewhere\/else/)
    assert.deepEqual(r.updates, ['update --memory 1g --memory-swap 1g --cpus 2 --pids-limit 1024 wpone-db-1'])
  })

  test('a container using 90 % of its new cap is skipped: the kernel would kill a process to fit it', async (t) => {
    const h = host(t, [
      { label: 'embusy', platform: 'emdash', containers: { web: { usage: '2.9GiB / 7.651GiB' } } },
      { label: 'emquiet', platform: 'emdash', containers: { web: { usage: '2.6GiB / 7.651GiB' } } },
      { label: 'emstopped', platform: 'emdash', containers: { web: { running: false, usage: '0B / 0B' } } }
    ])
    const r = await apply(h, ['--apply'])
    assert.equal(r.status, 1)
    assert.match(r.stdout, /embusy-web-1: SKIPPED — it uses 2969 MiB now, 90 % or more of the 3g cap/)
    assert.deepEqual(r.updates.sort(), [
      'update --memory 3g --memory-swap 3g --cpus 2 --pids-limit 1024 emquiet-web-1',
      // Stopped: nothing in it to kill; the cap holds from its next start.
      'update --memory 3g --memory-swap 3g --cpus 2 --pids-limit 1024 emstopped-web-1'
    ])
  })

  test('the host env decides the caps, clamped to the cores docker has; a refused one touches nothing', async (t) => {
    const h = host(t, SITES)
    const r = await apply(h, ['--apply'], {
      TRACY_SITE_MEMORY: '2560m',
      TRACY_SITE_DB_MEMORY: '768m',
      TRACY_SITE_PIDS: '4096',
      TRACY_SITE_CPUS: '4',
      FAKE_NCPU: '2'
    })
    assert.equal(r.status, 0, r.stderr + r.stdout)
    assert.match(r.stderr, /TRACY_SITE_CPUS=4 is more cores than this machine has \(2\) — capped at 2/)
    assert.ok(
      r.updates.includes('update --memory 2560m --memory-swap 2560m --cpus 2 --pids-limit 4096 wpone-web-1'),
      r.log
    )
    assert.ok(
      r.updates.includes('update --memory 768m --memory-swap 768m --cpus 2 --pids-limit 4096 jone-db-1'),
      r.log
    )
    // A two-core machine with no setting: one core each.
    const small = host(t, SITES)
    const s = await apply(small, [], { FAKE_NCPU: '2' })
    assert.match(s.stdout, /1 cores and 1024 processes each/)

    const refused = host(t, SITES)
    const x = await apply(refused, ['--apply'], { TRACY_SITE_MEMORY_EMDASH: '3GB' })
    assert.equal(x.status, 1)
    assert.match(x.stderr, /TRACY_SITE_MEMORY_EMDASH=3GB is not a memory size/)
    assert.deepEqual(x.updates, [], 'a refused setting must stop the run before any container')
    assert.doesNotMatch(x.log, /^inspect /m, 'and before any container is even read')
  })

  test('each line says whether the site compose keeps the caps across a recreate', async (t) => {
    const php = (caps) =>
      `services:\n  db:\n    image: mariadb:11\n    restart: unless-stopped\n${caps ? run('1g') : ''}  web:\n    image: tracy/web-wordpress:x\n    shm_size: 512m\n${caps ? run(caps) : ''}`
    const h = host(t, [
      { label: 'wpnew', platform: 'wordpress', compose: php('2g') },
      { label: 'wpother', platform: 'wordpress', compose: php('4g') }
    ])
    const r = await apply(h)
    assert.match(
      r.stdout,
      /wpnew-web-1: would cap — .*its compose file names the same caps, so a recreate keeps them/
    )
    assert.match(r.stdout, /wpnew-db-1: would cap — .*its compose file names the same caps/)
    assert.match(
      r.stdout,
      /wpother-web-1: would cap — .*names other caps, which a recreate would put back — re-render it: render-compose.sh wpother/
    )
  })

  test('a failed update is reported and fails the run; the others still get their caps', async (t) => {
    const h = host(t, SITES)
    const r = await apply(h, ['--apply'], { FAKE_UPDATE_FAILS: 'jone-web-1' })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /jone-web-1: FAILED — docker update refused/)
    assert.match(r.stdout, /5 container\(s\): 4 capped, 0 already capped, 0 skipped, 1 failed/)
  })

  test('a site whose platform cannot be told is skipped, never guessed', async (t) => {
    const h = host(t, [{ label: 'mystery', platform: 'wordpress', containers: { web: {}, db: {} } }])
    writeFileSync(path.join(h.root, 'mystery', '.env'), 'HOST_PORT=52002\n')
    writeFileSync(
      path.join(h.root, 'mystery', 'docker-compose.yml'),
      'services:\n  web:\n    image: nginx:1\n'
    )
    const r = await apply(h, ['--apply'], { TRACY_SITES_ROOT: path.join(h.base, 'sites') })
    assert.equal(r.status, 1)
    assert.match(r.stdout, /mystery: SKIPPED — its platform cannot be told/)
    assert.deepEqual(r.updates, [])
  })
})
