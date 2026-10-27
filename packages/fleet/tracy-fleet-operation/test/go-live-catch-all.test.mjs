/**
 * `provision/go-live.sh` on a shard host (`TRACY_TUNNEL=catch-all`, shard beta): the tunnel sends
 * every name to tracy-web, so a customer's own domain is recorded and announced as routed with no
 * tunnel call, and taken out the same way.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/go-live-catch-all.test.mjs
 *
 * The script runs from a scratch copy of `provision/` + `lib/`, with `ingress_api.py`, `docker`,
 * `iptables` and `netfilter-persistent` replaced by stubs, so nothing on this machine is touched.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))
const LABEL = 'lantern'

function stage() {
  const root = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'go-live-catch-all-'))
  mkdirSync(path.join(root, 'fleet', 'provision'), { recursive: true })
  mkdirSync(path.join(root, 'fleet', 'lib'), { recursive: true })
  copyFileSync(
    path.join(SCRIPTS, 'provision', 'go-live.sh'),
    path.join(root, 'fleet', 'provision', 'go-live.sh')
  )
  for (const lib of readdirSync(path.join(SCRIPTS, 'lib')))
    if (lib.endsWith('.sh'))
      copyFileSync(path.join(SCRIPTS, 'lib', lib), path.join(root, 'fleet', 'lib', lib))
  const argvLog = path.join(root, 'ingress-argv.log')
  writeFileSync(
    path.join(root, 'fleet', 'provision', 'ingress_api.py'),
    ['import sys', `open(${JSON.stringify(argvLog)}, "a").write(" ".join(sys.argv[1:]) + "\\n")`, ''].join(
      '\n'
    )
  )
  const bin = path.join(root, 'bin')
  mkdirSync(bin)
  const stub = (name, body) => {
    writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`)
    chmodSync(path.join(bin, name), 0o755)
  }
  stub('docker', 'case "$1 $2" in "network inspect") echo 10.9.0.0/24; exit 0 ;; esac\nexit 0')
  stub('iptables', 'case "$1" in -S) echo "-N DOCKER-USER"; exit 0 ;; -C) exit 1 ;; esac\nexit 0')
  stub('netfilter-persistent', 'exit 0')
  const site = path.join(root, 'private', LABEL)
  mkdirSync(site, { recursive: true })
  writeFileSync(path.join(site, '.env'), 'HOST_PORT=52001\n')
  return { root, bin, argvLog, site }
}

function goLive({ root, bin }, args, extraEnv = {}) {
  return spawnSync(
    'bash',
    [
      path.join(root, 'fleet', 'provision', 'go-live.sh'),
      '--label',
      LABEL,
      '--root',
      path.join(root, 'private'),
      '--platform',
      'emdash',
      ...args
    ],
    {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        HOME: root,
        TRACY_PRIVATE_ROOT: path.join(root, 'private'),
        TRACY_SITES_ROOT: path.join(root, 'sites'),
        TRACY_TUNNEL: 'catch-all',
        ...extraEnv
      },
      encoding: 'utf8',
      timeout: 60_000
    }
  )
}

test('catch-all: a live with an own domain records it and says it is routed to tracy-web, with no tunnel call', () => {
  const s = stage()
  try {
    const run = goLive(s, ['--op', 'live', '--domain', 'shop.example.com', '--route-gen', '7'])
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
    assert.match(run.stdout, /\n==> ingress: shop\.example\.com → tracy-web /)
    assert.match(run.stdout, /^TRACY_RESULT go_live=live label=lantern/m)
    assert.equal(existsSync(s.argvLog), false, 'ingress_api.py was never called')
    assert.equal(readFileSync(path.join(s.site, '.golive-domains'), 'utf8').trim(), 'shop.example.com')
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('catch-all: dropping the domain takes it off the record and says it is removed, with no tunnel call', () => {
  const s = stage()
  try {
    writeFileSync(path.join(s.site, '.golive-domains'), 'shop.example.com\n')
    const run = goLive(s, ['--op', 'drop-domain', '--domain', 'shop.example.com', '--route-gen', '8'])
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
    assert.match(run.stdout, /==> ingress: removed shop\.example\.com/)
    assert.equal(existsSync(s.argvLog), false)
    assert.equal(readFileSync(path.join(s.site, '.golive-domains'), 'utf8').trim(), '')
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('without catch-all nothing changes: no service named, the domain is not added and not announced', () => {
  const s = stage()
  try {
    const run = goLive(s, ['--op', 'live', '--domain', 'shop.example.com'], { TRACY_TUNNEL: '' })
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
    assert.match(run.stderr, /does not say where tracy-web listens/)
    assert.doesNotMatch(run.stdout, /==> ingress: shop\.example\.com → tracy-web/)
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('ingress_api.py refuses to touch a tunnel on a catch-all host, before any call', async () => {
  let hits = 0
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    hits++
    res.end('{}')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const run = spawnSync(
      'python3',
      [
        path.join(SCRIPTS, 'provision', 'ingress_api.py'),
        '--hostname',
        'shop.example.com',
        '--port',
        '52001'
      ],
      {
        env: {
          ...process.env,
          TRACY_TUNNEL: 'catch-all',
          TRACY_CF_API_TOKEN: 't',
          TRACY_CF_ACCOUNT_ID: 'a',
          TRACY_TUNNEL_ID: 'u',
          TRACY_CF_API_BASE: `http://127.0.0.1:${server.address().port}/client/v4`
        },
        encoding: 'utf8'
      }
    )
    assert.equal(run.status, 1)
    assert.match(run.stderr, /TRACY_TUNNEL=catch-all/)
    assert.equal(hits, 0)
  } finally {
    server.close()
  }
})
