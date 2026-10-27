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
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

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
