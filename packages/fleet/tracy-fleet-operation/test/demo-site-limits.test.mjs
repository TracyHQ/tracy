/**
 * A demo site is lean: its compose file mounts a small Apache prefork pool and gives MariaDB small
 * buffers; a customer's site keeps the image defaults.
 *
 * 12/10/2026 on fleet01 (2 cores, 3.9 GB): ~22 Joomla demos at the image defaults left 32 MB
 * available and 939 MB in swap (184 apache2 processes, 22 mariadbd), and untouched demos stopped
 * answering. The marker is one file in the site dir (`apache/tracy-demo-limits.conf`), written by
 * provision.sh for a demo install, so every later re-render keeps the demo lean.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/demo-site-limits.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))

/** Mark (or unmark) the site the way provision.sh does, then render its compose file. */
function render(siteDir, demo, flavor = 'clone') {
  execFileSync(
    'bash',
    [
      '-c',
      '. "$1lib/roots.sh"; . "$1provision/render-compose.sh"; tracy_write_demo_limits "$SITE_DIR" "$2"; tracy_render_compose',
      '_',
      SCRIPTS,
      demo
    ],
    {
      env: {
        ...process.env,
        SITE_DIR: siteDir,
        LABEL: 'demo1',
        PLATFORM: 'joomla',
        WEB_IMAGE: 'tracy/web-joomla:test',
        COMPOSE_FLAVOR: flavor,
        DB_NAME: 'site',
        DB_SQL_MODE: '',
        TRACY_WEB_ENV_FILE: '/dev/null'
      }
    }
  )
  return readFileSync(join(siteDir, 'docker-compose.yml'), 'utf8')
}

function site() {
  const dir = mkdtempSync(join(tmpdir(), 'tracy-demo-limits-'))
  mkdirSync(join(dir, 'apache'))
  writeFileSync(join(dir, '.env'), 'DB_PASSWORD=x\n')
  return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) }
}

const LEAN_DB = [
  '--innodb-buffer-pool-size=16M',
  '--innodb-log-buffer-size=4M',
  '--aria-pagecache-buffer-size=8M',
  '--key-buffer-size=8M'
]
const MOUNT = './apache/tracy-demo-limits.conf:/etc/apache2/conf-enabled/zz-tracy-demo-limits.conf:ro'

test('a demo gets the lean Apache pool mounted and the lean MariaDB flags, for every PHP shape', () => {
  for (const flavor of ['clone', 'fresh']) {
    const s = site()
    try {
      const compose = render(s.dir, 'on', flavor)
      assert.ok(compose.includes(MOUNT), `${flavor}: no demo-limits mount`)
      for (const flag of LEAN_DB)
        assert.ok(compose.includes(`      - ${flag}\n`), `${flavor}: missing ${flag}`)
      const conf = readFileSync(join(s.dir, 'apache', 'tracy-demo-limits.conf'), 'utf8')
      assert.match(conf, /MaxRequestWorkers\s+6\b/)
      assert.match(conf, /MaxSpareServers\s+2\b/)
      assert.match(conf, /StartServers\s+1\b/)
    } finally {
      s.dispose()
    }
  }
})

test('a customer site keeps the defaults, and an install that is not a demo removes a leftover marker', () => {
  const s = site()
  try {
    render(s.dir, 'on')
    const compose = render(s.dir, 'off')
    assert.equal(existsSync(join(s.dir, 'apache', 'tracy-demo-limits.conf')), false)
    assert.ok(!compose.includes('tracy-demo-limits'), 'a customer site mounts no demo limits')
    for (const flag of LEAN_DB) assert.ok(!compose.includes(flag), `a customer site got ${flag}`)
    assert.ok(compose.includes('      - --max-allowed-packet=256M\n'))
  } finally {
    s.dispose()
  }
})

/**
 * Through the REAL provision.sh, not the renderer alone: a fresh install writes its compose in its
 * own platform_compose (step 3), and until 14/11/2026 the marker was written only inside the
 * `PLATFORM_NEEDS_WEBROOT=1` block — so a fresh or installer-quickstart demo ran full-size and the
 * demo farm (fold.sh), which takes only a marked demo, could not take it. `docker` is a shim that
 * stops the run at the first `compose up`, after the compose file is written.
 */
function provisionFresh(label, demo) {
  const dir = mkdtempSync(join(tmpdir(), 'tracy-lean-provision-'))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  mkdirSync(join(dir, 'srv'))
  mkdirSync(join(dir, 'sites'))
  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env bash
case "$1 $2" in
  "compose up") echo "stopped at compose up" >&2; exit 97 ;;
  "network inspect") exit 1 ;;
esac
exit 0
`
  )
  chmodSync(join(bin, 'docker'), 0o755)
  const run = spawnSync(
    'bash',
    [
      join(SCRIPTS, 'provision/provision.sh'),
      '--site',
      `${label}.example`,
      '--label',
      label,
      '--platform',
      'wordpress',
      '--fresh',
      '--root',
      join(dir, 'srv')
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: pathWithFlock(`${bin}:${process.env.PATH}`),
        TRACY_DEMO_SITE: demo ? '1' : '',
        TRACY_SITES_ROOT: join(dir, 'sites'),
        TRACY_PRIVATE_ROOT: join(dir, 'srv'),
        TRACY_PORT_LOCK: join(dir, 'port.lock'),
        TRACY_WEB_ENV_FILE: '/dev/null',
        TRACY_HOOKS_ENV: '/dev/null'
      }
    }
  )
  rmSync(`/var/lock/tracy-provision-${label}.lock`, { force: true })
  const siteDir = join(dir, 'srv', label)
  return { run, siteDir, dispose: () => rmSync(dir, { recursive: true, force: true }) }
}

test('a fresh demo install through provision.sh is lean too (the marker is not tied to a fetched webroot)', () => {
  const label = `leanfresh${process.pid}`
  const p = provisionFresh(label, true)
  try {
    assert.equal(p.run.status, 97, p.run.stderr.slice(-2000))
    assert.ok(
      existsSync(join(p.siteDir, 'apache', 'tracy-demo-limits.conf')),
      'no lean marker on a fresh demo'
    )
    const compose = readFileSync(join(p.siteDir, 'docker-compose.yml'), 'utf8')
    assert.ok(compose.includes(MOUNT), 'the fresh demo compose mounts no demo limits')
    for (const flag of LEAN_DB) assert.ok(compose.includes(`      - ${flag}\n`), `missing ${flag}`)
  } finally {
    p.dispose()
  }
})

test('a fresh install that is not a demo carries no marker through provision.sh', () => {
  const label = `leancust${process.pid}`
  const p = provisionFresh(label, false)
  try {
    assert.equal(p.run.status, 97, p.run.stderr.slice(-2000))
    assert.equal(existsSync(join(p.siteDir, 'apache', 'tracy-demo-limits.conf')), false)
    assert.ok(!readFileSync(join(p.siteDir, 'docker-compose.yml'), 'utf8').includes('tracy-demo-limits'))
  } finally {
    p.dispose()
  }
})
