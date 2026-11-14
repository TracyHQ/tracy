// The runtime marker and the exec argv (src/site-exec.js), held to the bash helper it mirrors
// (packages/fleet/tracy-fleet-operation/scripts/lib/site-runtime.sh): the same site, the same
// command, the same docker argv — per site and in the demo farm.
//
//   node --test apps/tracy-host/test/site-exec.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { siteDbExec, siteRuntime, siteWebExecArgv } from '../src/site-exec.js'

const LIB = fileURLToPath(
  new URL('../../../packages/fleet/tracy-fleet-operation/scripts/lib/', import.meta.url)
)

function root() {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-site-exec-'))
  const srv = path.join(dir, 'srv')
  mkdirSync(path.join(srv, 'demo1'), { recursive: true })
  mkdirSync(path.join(srv, '_demos', 'exec'), { recursive: true })
  writeFileSync(
    path.join(srv, 'demo1', '.env'),
    'HOST_PORT=52042\nDB_PASSWORD=pw1\nFARM_DB_NAME=d1\nFARM_DB_USER=d1\nFARM_DB_PASSWORD=fpw\n'
  )
  writeFileSync(
    path.join(srv, 'demo1', 'docker-compose.yml'),
    'services:\n  db:\n    environment:\n      MARIADB_DATABASE: "site"\n'
  )
  writeFileSync(path.join(srv, '_demos', 'exec', 'demo1.env'), 'TRACY_MAIL_LABEL=demo1\n')
  return { dir, srv, dispose: () => rmSync(dir, { recursive: true, force: true }) }
}

/** What the bash helper hands docker for the same call. */
function bashArgv(srv, script) {
  const bin = mkdtempSync(path.join(tmpdir(), 'tracy-site-exec-bin-'))
  try {
    writeFileSync(path.join(bin, 'docker'), '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$OUT"\n')
    chmodSync(path.join(bin, 'docker'), 0o755)
    const out = path.join(bin, 'argv')
    const r = spawnSync('bash', ['-c', `. "$L/roots.sh"; . "$L/site-runtime.sh"; ${script}`], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OUT: out, L: LIB, TRACY_PRIVATE_ROOT: srv }
    })
    assert.equal(r.status, 0, r.stderr)
    return readFileSync(out, 'utf8').trimEnd().split('\n')
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
}

test('runtime: absent = site, farm = farm, anything else refused', async () => {
  const r = root()
  try {
    assert.equal(await siteRuntime(r.srv, 'demo1'), 'site')
    writeFileSync(path.join(r.srv, 'demo1', 'runtime'), 'farm\n')
    assert.equal(await siteRuntime(r.srv, 'demo1'), 'farm')
    writeFileSync(path.join(r.srv, 'demo1', 'runtime'), 'other')
    await assert.rejects(siteRuntime(r.srv, 'demo1'), /refusing to guess/)
    await assert.rejects(siteRuntime(r.srv, '../x'), /refused label/)
  } finally {
    r.dispose()
  }
})

test('web exec argv is the bash helper argv, per site and in the farm', async () => {
  const r = root()
  try {
    const cmd = ['php', '-r', 'echo 1;']
    const site = await siteWebExecArgv({ privateRoot: r.srv, label: 'demo1', interactive: true }, cmd)
    assert.deepEqual(site, bashArgv(r.srv, `tracy_site_web_exec demo1 -i -- php -r 'echo 1;'`))
    assert.equal(site.at(-4), 'demo1-web-1')
    writeFileSync(path.join(r.srv, 'demo1', 'runtime'), 'farm\n')
    const farm = await siteWebExecArgv(
      { privateRoot: r.srv, label: 'demo1', workdir: '/var/www/html/images', env: { A: '1' } },
      cmd
    )
    assert.deepEqual(
      farm,
      bashArgv(r.srv, `tracy_site_web_exec demo1 -w /var/www/html/images -e A=1 -- php -r 'echo 1;'`)
    )
    assert.ok(farm.includes('tracy-demos-web'))
    assert.ok(farm.includes('/site/demo1/.webroot/images'))
    await assert.rejects(
      siteWebExecArgv({ privateRoot: r.srv, label: 'demo1', user: 'root' }, cmd),
      /every demo/
    )
    await assert.rejects(
      siteWebExecArgv({ privateRoot: r.srv, label: 'demo1', workdir: '/etc' }, cmd),
      /outside/
    )
  } finally {
    r.dispose()
  }
})

test('db exec: the same argv as the bash helper; the password only in the environment', async () => {
  const r = root()
  try {
    const cmd = ['mariadb', '-N', '-e', 'SELECT 1']
    const site = await siteDbExec({ privateRoot: r.srv, label: 'demo1' }, cmd)
    assert.deepEqual(site.args, bashArgv(r.srv, `tracy_site_db_exec demo1 mariadb -N -e 'SELECT 1'`))
    assert.deepEqual(site.env, { MYSQL_PWD: 'pw1' })
    assert.equal(site.database, 'site')
    assert.ok(!site.args.some((a) => a.includes('pw1')))
    writeFileSync(path.join(r.srv, 'demo1', 'runtime'), 'farm\n')
    const farm = await siteDbExec({ privateRoot: r.srv, label: 'demo1', interactive: true }, [
      'mariadb-dump',
      'd1'
    ])
    assert.deepEqual(farm.args, bashArgv(r.srv, 'tracy_site_db_exec demo1 -i mariadb-dump d1'))
    assert.deepEqual(farm.env, { MYSQL_PWD: 'fpw' })
    assert.ok(farm.args.includes('tracy-demos-db') && farm.args.includes('-ud1'))
  } finally {
    r.dispose()
  }
})
