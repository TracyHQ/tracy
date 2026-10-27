#!/usr/bin/env node
/**
 * The #165 bounded-alias migration, driven the way it runs on a host — the real CLI over a temp
 * site directory and a docker stub, plus the structural read/patch helper on its own.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/migrate-web-dns-alias.test.mjs
 *
 * What is pinned here is the contract a migration of a customer's live site has to keep: a dry run
 * touches nothing, the added alias is EXACTLY the one `webDnsName` derives, everything else in the
 * compose file survives byte for byte, the wrong site/path/shape/image is refused rather than
 * guessed at, only the web container is recreated, readiness proves the alias resolves to this
 * container's own endpoint, and a failure after the swap restores the original bytes — loudly, and
 * WITHOUT overwriting a concurrent edit, if the rollback itself cannot complete.
 *
 * No installs, no daemon: `fake-docker.mjs` stands in for docker (parsing compose with the repo's
 * js-yaml), and the semantic-diff/patch logic is exercised against `dns-alias.mjs` directly. The
 * parity assertion crosses into the app package (nothing here ships) because `webDnsName` is the
 * canonical derivation the alias must equal.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, test } from 'node:test'
import { webDnsName } from '../../../../apps/tracy-web/src/sites/label.js'
import { renderInspectFormat } from './docker-inspect-format.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLI = path.join(HERE, '../scripts/provision/migrate-web-dns-alias.sh')
const DNS_ALIAS = path.join(HERE, '../scripts/provision/dns-alias.mjs')
const FAKE_DOCKER = path.join(HERE, 'fake-docker.mjs')

// Temp dirs to remove when the suite finishes — nothing is left under the OS temp root, and no
// tracked source is chmodded. The docker stub is reached through an executable shim we own, so
// `fake-docker.mjs` itself keeps its committed mode.
const TEMP = []
const mkTemp = (prefix) => {
  const d = mkdtempSync(path.join(tmpdir(), prefix))
  TEMP.push(d)
  return d
}
after(() => {
  for (const d of TEMP) rmSync(d, { recursive: true, force: true })
})

// The script starts `docker` ~40 times and `node dns-alias.mjs` ~14 times per migration. As real
// processes that is ~55 node startups (~40 ms each) — most of this file's wall time — so both are
// answered by ONE long-lived node process (tool-server.mjs) through tiny bash shims. The programs
// that run are the real ones (fake-docker.mjs, the unmodified dns-alias.mjs); only the process
// boundary is gone. TRACY_TEST_REAL_PROCS=1 restores one real node process per call.
const SHIM_DIR = mkTemp('dns-alias-docker-')
const DOCKER_SHIM = path.join(SHIM_DIR, 'docker')
const REAL_PROCS = process.env.TRACY_TEST_REAL_PROCS === '1'
const SPOOL = mkTemp('dns-alias-spool-')
const TOOL_SERVER = path.join(HERE, 'tool-server.mjs')

async function startToolServer() {
  const child = spawn(process.execPath, [TOOL_SERVER, SPOOL, DNS_ALIAS], {
    stdio: ['ignore', 'pipe', 'inherit']
  })
  after(() => {
    child.stdout.destroy()
    child.kill()
  })
  return await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.stdout.once('data', (d) => resolve(String(d).trim()))
    child.once('exit', (c) => reject(new Error(`tool-server exited early (${c})`)))
  })
}

// Request/reply body shared by both shims (wire format: see tool-server.mjs).
const shimCall = (port, tool) => `
exec 3<>/dev/tcp/127.0.0.1/${port}
printf '%s\\n' "$#" >&3
printf '%s\\0' ${tool} "\${FAKE_STATE:-}" "\${FAKE_LOG:-}" "$PPID" "$@" >&3
IFS= read -r code <&3
IFS= read -r -d '' so <&3
IFS= read -r -d '' se <&3
exec 3>&-
printf '%s' "$so"
printf '%s' "$se" >&2
`

if (REAL_PROCS) {
  writeFileSync(DOCKER_SHIM, `#!/usr/bin/env bash\nexec node ${JSON.stringify(FAKE_DOCKER)} "$@"\n`)
} else {
  const port = await startToolServer()
  writeFileSync(DOCKER_SHIM, `#!/usr/bin/env bash${shimCall(port, 'docker')}exit "$code"\n`)
  // `node` shim: only `…/dns-alias.mjs` calls are served; anything else (or a stdin read) is real node.
  // Process substitutions (/dev/fd/N) can't cross the socket, so their bytes are copied to files first.
  const realNode = JSON.stringify(process.execPath)
  writeFileSync(
    path.join(SHIM_DIR, 'node'),
    `#!/usr/bin/env bash
case "\${1:-}" in
  */dns-alias.mjs) ;;
  *) exec ${realNode} "$@" ;;
esac
script=$1; shift
args=()
# Keep the marker in a variable: bash 3.2 (macOS) doubles it in args+=($'\\x01'"$c").
p=$'\\x01'
for a in "$@"; do
  [ "$a" = "-" ] && exec ${realNode} "$script" "$@"
  case "$a" in
    /dev/fd/*) IFS= read -r -d '' c < "$a"; args+=("$p$c") ;;
    *) args+=("$a") ;;
  esac
done
set -- "\${args[@]}"
${shimCall(port, 'dns-alias')}exit "$code"
`
  )
  chmodSync(path.join(SHIM_DIR, 'node'), 0o755)
  process.env.PATH = `${SHIM_DIR}${path.delimiter}${process.env.PATH}`
}
chmodSync(DOCKER_SHIM, 0o755)

// A synthetic 60-char label whose `<label>-web-1` is 66 octets — past the 63-octet DNS-label cap,
// so it needs the alias. The same fixture render-compose.test.mjs uses, for the same reason.
const LONG = 'synthetic-imported-site-dns-length-regression-165-0a1b2c3def'
const ALIAS = webDnsName(LONG)

// A realistic full container id and image id, so the identity/drift checks are exercised the way
// they run against a real daemon rather than against a toy `sha256:abc`.
const WEB_ID = 'sha256:9f2e1c6b4a7d8e0f1234567890abcdef1234567890abcdef1234567890abcdef'
const WEB_IMAGE = 'sha256:aa11bb22cc33dd44ee55ff6677889900aabbccddeeff00112233445566778899'

/** A compose file as a pre-#165 render left it: the web service on the `[default, tracy]` shorthand,
 * so its long-label container registered an over-long name and no alias. */
const composeFor = (label) => `services:
  db:
    image: mariadb:11
    restart: unless-stopped
    command:
      - --sql-mode=NO_ENGINE_SUBSTITUTION
      - --max-allowed-packet=256M
    environment:
      MARIADB_ROOT_PASSWORD: "\${DB_PASSWORD}"
      MARIADB_DATABASE: "wordpress"
    volumes:
      - db:/var/lib/mysql

  web:
    image: tracy/web-wordpress:php8.3-apache
    restart: unless-stopped
    security_opt: ["no-new-privileges:true"]
    shm_size: 512m
    depends_on: [db]
    entrypoint: ["apache2-foreground"]
    volumes:
      - /srv/tracy-sites/${label}:/var/www/html
    networks: [default, tracy]
    ports:
      - "127.0.0.1:\${HOST_PORT:?this site's .env has no HOST_PORT}:80"

volumes:
  db:

networks:
  default:
    external: true
    name: ${label}_default
  tracy:
    external: true
    name: tracy_tracy
`

/** The candidate the patch must produce: the one shorthand line expanded to the aliased map form. */
const aliasedCompose = (label) =>
  composeFor(label).replace(
    '    networks: [default, tracy]\n',
    `    networks:\n      default: {}\n      tracy:\n        aliases: ["${webDnsName(label)}"]\n`
  )

/** A site directory plus a docker-stub state file, wired the way the CLI expects to find them. */
function makeSite(label, { compose, running = true, up, probe, aliases = [], extraState = {} } = {}) {
  const root = mkTemp('dns-alias-')
  const dir = path.join(root, label)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, '.env'), 'HOST_PORT=52080\nPLATFORM=wordpress\nDB_PASSWORD=secret\n')
  writeFileSync(path.join(dir, 'docker-compose.yml'), compose ?? composeFor(label))
  const web = `${label}-web-1`
  const realDir = realpathSync(dir)
  const state = {
    siteDir: realDir,
    network: 'tracy_tracy',
    probe: probe ?? 'ok',
    up: up ?? ['ok-alias'],
    containers: running
      ? {
          [web]: {
            id: WEB_ID,
            image: WEB_IMAGE,
            running: true,
            health: '',
            labels: {
              'com.docker.compose.project.working_dir': realDir,
              'com.docker.compose.project.config_files': path.join(realDir, 'docker-compose.yml')
            },
            networks: {
              default: { Aliases: [], IPAddress: '172.20.0.9' },
              tracy_tracy: { Aliases: aliases, IPAddress: '172.20.0.5' }
            }
          },
          // The tracy-web stack container the DNS/HTTP probe runs from — it must be inspectable and
          // attached to the tracy network, or the observer check (on-network) rejects it.
          'tracy-web-1': {
            id: 'sha256:' + 'ab'.repeat(32),
            image: 'sha256:' + 'cd'.repeat(32),
            running: true,
            health: '',
            labels: {},
            networks: { tracy_tracy: { Aliases: ['tracy-web'], IPAddress: '172.20.0.2' } }
          }
        }
      : {
          'tracy-web-1': {
            running: true,
            networks: { tracy_tracy: { Aliases: ['tracy-web'], IPAddress: '172.20.0.2' } }
          }
        },
    // The migration proves DNS from an existing tracy-web stack container; provide one to probe from.
    ps: running
      ? { [`${label}/web`]: [web], 'tracy/tracy-web': ['tracy-web-1'] }
      : { [`${label}/web`]: [], 'tracy/tracy-web': ['tracy-web-1'] },
    ...extraState
  }
  const statePath = path.join(root, 'state.json')
  const logPath = path.join(root, 'docker.log')
  writeFileSync(statePath, JSON.stringify(state, null, 2))
  writeFileSync(logPath, '')
  return { root, dir, web, statePath, logPath }
}

/** Async spawn that resolves like spawnSync's result — so independent migrations can run side by side. */
function sh(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', reject)
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

function run(label, args, { root, statePath, logPath, env = {} } = {}) {
  return sh('bash', [CLI, label, ...args, '--root', root], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TRACY_DOCKER: DOCKER_SHIM,
      TRACY_WEB_WAIT_SECONDS: '0',
      TRACY_WEB_POLL_SECONDS: '0',
      FAKE_STATE: statePath,
      FAKE_LOG: logPath,
      ...env
    }
  })
}

const compose = (dir) => readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
const backups = (dir) => readdirSync(dir).filter((f) => f.startsWith('docker-compose.yml.pre-dns-alias.'))
const patchState = (statePath, fn) => {
  const s = JSON.parse(readFileSync(statePath, 'utf8'))
  fn(s)
  writeFileSync(statePath, JSON.stringify(s))
}

// Every test owns its temp site and state file, so the suite runs them side by side.
describe('migrate-web-dns-alias', { concurrency: 8 }, () => {
  // ── dns-alias.mjs: the structural half, on its own ────────────────────────────────────────────────

  function dnsAlias(args, input) {
    return spawnSync(process.execPath, [DNS_ALIAS, ...args], { encoding: 'utf8', input })
  }

  test('patch expands the [default, tracy] shorthand to the aliased map form, and the alias is webDnsName', async () => {
    const r = dnsAlias(['patch', '--service', 'web', '--alias', ALIAS, '--in', '-'], composeFor(LONG))
    assert.equal(r.status, 0)
    assert.equal(r.stdout, aliasedCompose(LONG))
    assert.ok(r.stdout.includes(`aliases: ["${ALIAS}"]`))
    // Parity: the alias written is exactly the one tracy-web/tracy-host dial.
    assert.match(ALIAS, /^tracy-web-[0-9a-f]{32}$/)
    assert.ok(ALIAS.length <= 63)
  })

  test('patch is idempotent — an already-aliased file reports "already" (exit 3), no rewrite', async () => {
    const r = dnsAlias(['patch', '--service', 'web', '--alias', ALIAS, '--in', '-'], aliasedCompose(LONG))
    assert.equal(r.status, 3)
  })

  test('patch refuses a network stanza it does not recognise rather than rewriting it', async () => {
    const weird = composeFor(LONG).replace(
      '    networks: [default, tracy]\n',
      '    networks: [tracy, default, other]\n'
    )
    const r = dnsAlias(['patch', '--service', 'web', '--alias', ALIAS, '--in', '-'], weird)
    assert.equal(r.status, 4)
  })

  test('patch refuses when an existing alias disagrees with the one #165 derives, without echoing it', async () => {
    const secret = 'tracy-web-00000000000000000000000000000000'
    const wrong = aliasedCompose(LONG).replace(ALIAS, secret)
    const r = dnsAlias(['patch', '--service', 'web', '--alias', ALIAS, '--in', '-'], wrong)
    assert.equal(r.status, 4)
    // The refusal reports a count, never the customer's alias value.
    assert.doesNotMatch(r.stderr, new RegExp(secret))
  })

  test('diff passes when candidate adds only the alias, fails on any other change', async () => {
    const original = { services: { web: { image: 'x', networks: ['default', 'tracy'] } } }
    const candidate = {
      services: { web: { image: 'x', networks: { default: {}, tracy: { aliases: [ALIAS] } } } }
    }
    const write = (obj) => {
      const p = path.join(mkTemp('cfg-'), 'c.json')
      writeFileSync(p, JSON.stringify(obj))
      return p
    }
    const ok = dnsAlias([
      'diff',
      '--service',
      'web',
      '--alias',
      ALIAS,
      '--original',
      write(original),
      '--candidate',
      write(candidate)
    ])
    assert.equal(ok.status, 0)
    // An unrelated change (a different image) is caught, and the differing section is named.
    const tampered = {
      services: { web: { image: 'DIFFERENT', networks: { default: {}, tracy: { aliases: [ALIAS] } } } }
    }
    const bad = dnsAlias([
      'diff',
      '--service',
      'web',
      '--alias',
      ALIAS,
      '--original',
      write(original),
      '--candidate',
      write(tampered)
    ])
    assert.equal(bad.status, 5)
    assert.match(bad.stderr, /services/)
  })

  test('web-port and web-network derive from the config; a missing web port refuses rather than guessing', async () => {
    const write = (obj) => {
      const p = path.join(mkTemp('cfg-'), 'c.json')
      writeFileSync(p, JSON.stringify(obj))
      return p
    }
    const cfg = write({
      services: {
        web: {
          ports: [{ protocol: 'tcp', target: 80, published: '52080' }],
          networks: { default: {}, tracy: {} }
        }
      },
      networks: { tracy: { name: 'tracy_tracy' } }
    })
    assert.equal(dnsAlias(['web-port', '--service', 'web', '--config', cfg]).stdout, '80')
    assert.equal(dnsAlias(['web-network', '--service', 'web', '--config', cfg]).stdout, 'tracy_tracy')
    const noport = write({
      services: { web: { networks: { tracy: {} } } },
      networks: { tracy: { name: 'tracy_tracy' } }
    })
    assert.notEqual(dnsAlias(['web-port', '--service', 'web', '--config', noport]).status, 0)
  })

  // ── the CLI: no-ops ───────────────────────────────────────────────────────────────────────────────

  test('a short label is a no-op — no deployed normal site changes', async () => {
    const site = makeSite('shortsite', {})
    const before = compose(site.dir)
    const r = await run('shortsite', ['--apply'], site)
    assert.equal(r.status, 0)
    assert.match(r.stdout, /short/)
    assert.equal(compose(site.dir), before)
    assert.equal(readFileSync(site.logPath, 'utf8'), '', 'a short label touches no docker at all')
  })

  test('idempotent: file already aliased and the container already answers to it → no-op', async () => {
    const site = makeSite(LONG, { compose: aliasedCompose(LONG), aliases: [ALIAS] })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /already done/)
    assert.equal(compose(site.dir), before)
    assert.equal(backups(site.dir).length, 0)
    assert.doesNotMatch(readFileSync(site.logPath, 'utf8'), /\bup -d\b/, 'a true no-op recreates nothing')
  })

  // ── the CLI: dry-run ──────────────────────────────────────────────────────────────────────────────

  test('dry-run does the whole preflight but mutates nothing', async () => {
    const site = makeSite(LONG, {})
    const before = compose(site.dir)
    const r = await run(LONG, [], site) // no --apply
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /preflight passed/)
    assert.equal(compose(site.dir), before, 'the compose file is untouched by a dry run')
    assert.equal(backups(site.dir).length, 0, 'no backup is taken in a dry run')
    assert.doesNotMatch(
      readFileSync(site.logPath, 'utf8'),
      /\bup -d\b/,
      'no container is recreated in a dry run'
    )
  })

  // ── the CLI: apply ────────────────────────────────────────────────────────────────────────────────

  test('apply adds the alias, backs up 0600, preserves every other byte, recreates only web', async () => {
    const site = makeSite(LONG, {})
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.equal(r.status, 0, r.stderr)
    // The alias is added; nothing else in the file changed.
    assert.equal(compose(site.dir), aliasedCompose(LONG))
    assert.equal(
      before.replace('    networks: [default, tracy]\n', ''),
      compose(site.dir).replace(
        /    networks:\n      default: \{\}\n      tracy:\n        aliases: \["[^"]+"\]\n/,
        ''
      )
    )
    // Backup taken, 0600, and equal to the pre-migration file.
    const bk = backups(site.dir)
    assert.equal(bk.length, 1)
    const bkPath = path.join(site.dir, bk[0])
    assert.equal(statSync(bkPath).mode & 0o777, 0o600)
    assert.equal(readFileSync(bkPath, 'utf8'), before)
    // Only the web service is recreated, and nothing is pulled or built.
    const log = readFileSync(site.logPath, 'utf8')
    assert.match(
      log,
      new RegExp(`compose --project-name ${LONG} up -d --no-deps --no-build --pull never web`)
    )
    assert.doesNotMatch(log, /\bup -d\b.*\bdb\b/, 'the database is never recreated')
    // The success line reports technical status only.
    assert.match(r.stdout, new RegExp(`"alias":"${ALIAS}"`))
    // The full site path and label are not spilled into shared logs.
    assert.doesNotMatch(r.stdout, new RegExp(site.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })

  test('apply PRESERVES the original file mode (not the backup 0600) — portably, no chmod --reference', async () => {
    // The measured macOS regression: `chmod --reference` is a no-op there, so a 0640 source became
    // 0600 on the swap. Capture the mode ourselves and re-apply it; the swapped-in file must keep 0640.
    const site = makeSite(LONG, {})
    chmodSync(path.join(site.dir, 'docker-compose.yml'), 0o640)
    const r = await run(LONG, ['--apply'], site)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(compose(site.dir), aliasedCompose(LONG))
    assert.equal(
      statSync(path.join(site.dir, 'docker-compose.yml')).mode & 0o777,
      0o640,
      'the swapped compose keeps the original mode'
    )
    // The backup is deliberately 0600 and is NOT the mode reference.
    const bk = backups(site.dir)
    assert.equal(statSync(path.join(site.dir, bk[0])).mode & 0o777, 0o600)
  })

  test('rollback RESTORES the original file mode, not the 0600 backup mode', async () => {
    const site = makeSite(LONG, { probe: 'dnsfail' }) // verify fails after swap → rollback
    chmodSync(path.join(site.dir, 'docker-compose.yml'), 0o640)
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.equal(compose(site.dir), before, 'original bytes restored')
    assert.equal(
      statSync(path.join(site.dir, 'docker-compose.yml')).mode & 0o777,
      0o640,
      'original mode restored on rollback'
    )
  })

  test('a pre-existing NON-ALIAS compose change against the running container is refused (config-hash, #162)', async () => {
    // The running container carries a config-hash for an OLDER config; the file on disk has unrelated
    // pending changes (the #162 overlap). Adding only the alias would silently fold those in, so the
    // config-hash gate refuses before any swap or backup.
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.containers[site.web].labels['com.docker.compose.config-hash'] =
        'sha256:staleconfig0000000000000000000000000000000000000000000000000000'
    })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /config-hash/)
    assert.equal(compose(site.dir), before)
    assert.equal(backups(site.dir).length, 0)
  })

  test('the opaque #165 selector resolves to exactly one local site; a raw label never enters argv', async () => {
    const site = makeSite(LONG, {})
    // Dry run driven by the derived alias, not the label — this is the form the workflow passes.
    const r = await sh('bash', [CLI, '--from-alias', ALIAS, '--root', site.root], {
      encoding: 'utf8',
      env: {
        ...process.env,
        TRACY_DOCKER: DOCKER_SHIM,
        TRACY_WEB_WAIT_SECONDS: '0',
        TRACY_WEB_POLL_SECONDS: '0',
        FAKE_STATE: site.statePath,
        FAKE_LOG: site.logPath
      }
    })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /preflight passed/)
    // The hashed TARGET is what logs carry — never the raw label.
    assert.doesNotMatch(r.stdout, new RegExp(LONG))
  })

  test('a selector that matches no local site refuses rather than guessing', async () => {
    const site = makeSite(LONG, {})
    const noMatch = 'tracy-web-' + 'f'.repeat(32)
    const r = await sh('bash', [CLI, '--from-alias', noMatch, '--root', site.root], {
      encoding: 'utf8',
      env: { ...process.env, TRACY_DOCKER: DOCKER_SHIM, FAKE_STATE: site.statePath, FAKE_LOG: site.logPath }
    })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /did not resolve to exactly one/)
  })

  test('the already-done no-op must PROVE it serves: a failed probe refuses to claim done', async () => {
    const site = makeSite(LONG, { compose: aliasedCompose(LONG), aliases: [ALIAS], probe: 'httpfail' })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.doesNotMatch(r.stdout, /already done/)
    assert.equal(compose(site.dir), before, 'a failed no-op mutates nothing')
    assert.doesNotMatch(readFileSync(site.logPath, 'utf8'), /\bup -d\b/)
  })

  test('an ambiguous observer to probe from is refused in preflight, BEFORE any mutation', async () => {
    // The readiness observer is validated in the read-only preflight now — an ambiguous fleet is caught
    // before the swap/recreate, not discovered afterwards forcing a predictable failed rollback.
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.ps['tracy/tracy-web'] = ['tracy-web-1', 'tracy-web-2']
    })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /ambiguous observer|before any mutation/)
    assert.equal(compose(site.dir), before)
    assert.equal(backups(site.dir).length, 0, 'no backup — the refusal is before any mutation')
    assert.doesNotMatch(readFileSync(site.logPath, 'utf8'), /\bup -d\b/, 'nothing is recreated')
  })

  test('file already carries the alias but the runtime lacks it → force-recreate, no swap, no backup', async () => {
    const site = makeSite(LONG, { compose: aliasedCompose(LONG), aliases: [] })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(compose(site.dir), before, 'an already-correct file is not rewritten')
    assert.equal(backups(site.dir).length, 0, 'nothing to back up when the file is unchanged')
    const log = readFileSync(site.logPath, 'utf8')
    assert.match(log, new RegExp(`up -d --no-deps --no-build --pull never --force-recreate web`))
  })

  test('apply refuses when the compose does not validate through docker compose config', async () => {
    // The semantic gate runs `docker compose config` on both files first; a compose whose required
    // variable is unset cannot be validated, and the run stops with the site untouched.
    const site = makeSite(LONG, {})
    const before = compose(site.dir)
    writeFileSync(path.join(site.dir, '.env'), 'PLATFORM=wordpress\nDB_PASSWORD=secret\n')
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /does not validate/)
    assert.equal(compose(site.dir), before)
  })

  test('apply refuses a candidate that validates but differs from the original by more than the alias', async () => {
    // The candidate resolves through `docker compose config` yet the stub reports it differing in a
    // field the patch never touched — the semantic gate must refuse rather than swap it in.
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.tamperCandidate = true
    })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /more than the alias/)
    assert.equal(compose(site.dir), before)
    assert.equal(backups(site.dir).length, 0)
  })

  // ── the CLI: refusals ─────────────────────────────────────────────────────────────────────────────

  test('a label that could spell a path is refused before any path is built', async () => {
    const site = makeSite(LONG, {})
    const r = await run('../escape', ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /unusable label/)
  })

  test('a site directory that symlinks outside the root is refused', async () => {
    const site = makeSite(LONG, {})
    const outside = mkTemp('outside-')
    mkdirSync(path.join(outside, 'victim'), { recursive: true })
    writeFileSync(path.join(outside, 'victim', 'docker-compose.yml'), composeFor('victim'))
    const linkRoot = mkTemp('linkroot-')
    symlinkSync(path.join(outside, 'victim'), path.join(linkRoot, 'victim'))
    const r = await sh('bash', [CLI, 'victim', '--apply', '--root', linkRoot], {
      encoding: 'utf8',
      env: { ...process.env, TRACY_DOCKER: DOCKER_SHIM, FAKE_STATE: site.statePath, FAKE_LOG: site.logPath }
    })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /outside|symlinked/)
  })

  test('a compose file that is a symlink is refused', async () => {
    const site = makeSite(LONG, {})
    const real = path.join(site.dir, 'real-compose.yml')
    writeFileSync(real, composeFor(LONG))
    const link = path.join(site.dir, 'docker-compose.yml')
    spawnSync('rm', [link])
    symlinkSync(real, link)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /symlink/)
  })

  test('a matched container associated with another project directory is refused', async () => {
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.containers[site.web].labels['com.docker.compose.project.working_dir'] = '/srv/tracy/someone-else'
    })
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /another project/)
  })

  test('a container with no compose association is refused rather than adopted', async () => {
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.containers[site.web].labels['com.docker.compose.project.working_dir'] = ''
    })
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /association/)
  })

  test('a container composed from more than one file is refused rather than patching one override', async () => {
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      const c = s.containers[site.web]
      c.labels['com.docker.compose.project.config_files'] =
        c.labels['com.docker.compose.project.config_files'] + ',' + path.join(site.dir, 'override.yml')
    })
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /more than one file/)
  })

  test('an ambiguous container selection is refused, not picked', async () => {
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.ps[`${LONG}/web`] = [`${LONG}-web-1`, `${LONG}-web-2`]
    })
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /ambiguous/)
  })

  test('no running web container is refused rather than acting blind', async () => {
    const site = makeSite(LONG, { running: false })
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /no running container/)
  })

  // ── the CLI: identity / drift under lock ────────────────────────────────────────────────────────

  test('a mutable image tag that no longer resolves to the running image is refused (image not pinned by --pull never)', async () => {
    // The web image tag resolves locally to a DIFFERENT image id than the running container was
    // created from — recreating with --pull never would silently change the image, so preflight
    // refuses before any swap.
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.imageResolves = { 'tracy/web-wordpress:php8.3-apache': 'sha256:' + 'cd'.repeat(32) }
    })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /different image/)
    assert.equal(compose(site.dir), before)
    assert.equal(backups(site.dir).length, 0)
  })

  test('the web image missing locally is refused rather than pulled', async () => {
    const site = makeSite(LONG, {})
    // No local image resolves for the tag, and the running container reports no image to fall back to.
    patchState(site.statePath, (s) => {
      delete s.containers[site.web].image
      s.imageResolves = {}
    })
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /not present locally/)
  })

  test('a container recreated out from under the run since preflight is refused, not acted on', async () => {
    // The stub changes the container's own image id during the preflight full-JSON inspect (as a
    // concurrent recreate would); the apply revalidate compares the fingerprint and refuses.
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.driftImage = { on: 'inspect-json', to: 'sha256:' + 'de'.repeat(32) }
    })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /image changed|container changed/)
    assert.equal(compose(site.dir), before)
    assert.equal(backups(site.dir).length, 0)
  })

  test('a mutable image TAG that moves after preflight (running .Image unchanged) is refused before the swap', async () => {
    // Distinct from the runtime-image drift above: the running container's own .Image does NOT move, so
    // the fingerprint still matches — but the local tag is reassigned to a different id after preflight,
    // and a --pull never recreate would land on THAT. The under-lock tag re-inspect catches it before
    // any mutation, where a fingerprint compare alone would not.
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.driftResolve = {
        on: 'inspect-json',
        ref: 'tracy/web-wordpress:php8.3-apache',
        to: 'sha256:' + 'ef'.repeat(32)
      }
    })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /different image than preflight/)
    assert.equal(compose(site.dir), before)
    assert.equal(backups(site.dir).length, 0, 'no mutation on pre-swap tag drift')
  })

  test('a recreated container carrying the WRONG config-hash is refused and rolled back (candidate-hash gate)', async () => {
    // Image and alias can be right while the container was built from a drifted config — the recreate is
    // proven to carry the CANDIDATE config-hash, not just any config. A wrong one fails and rolls back.
    const site = makeSite(LONG, { up: ['ok-badhash'] })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /config-hash|roll(ing|ed) back/)
    assert.equal(compose(site.dir), before, 'the original compose bytes are restored on rollback')
  })

  test('a compose file edited between preflight and the swap is refused, not overwritten', async () => {
    // The stub appends to the compose during the preflight full-JSON inspect (after the baseline hash
    // is captured); the apply revalidate sees the hash move and refuses concurrent drift.
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.driftCompose = { on: 'inspect-json', append: '\n# concurrent edit\n' }
    })
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /changed since preflight/)
    // The concurrent edit is preserved; the migration did not layer its own change on top.
    assert.doesNotMatch(compose(site.dir), new RegExp(`aliases: \\["${ALIAS}"\\]`))
    assert.match(compose(site.dir), /# concurrent edit/)
    assert.equal(backups(site.dir).length, 0)
  })

  test('a held lock refuses the run rather than racing the swap (concurrent drift)', async () => {
    const site = makeSite(LONG, {})
    mkdirSync(path.join(site.dir, '.dns-alias.lock'))
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /another migration holds/)
    assert.equal(compose(site.dir), before)
  })

  // ── the CLI: readiness / DNS / rollback ────────────────────────────────────────────────────────

  test('a DNS miss from the observer fails the migration and restores the original compose', async () => {
    const site = makeSite(LONG, { probe: 'dnsfail' })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /roll(ing|ed) back|verification failed/)
    assert.equal(compose(site.dir), before, 'the original compose bytes are restored on rollback')
  })

  test('an HTTP failure on the derived port fails the migration and restores the original compose', async () => {
    const site = makeSite(LONG, { probe: 'httpfail' })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /roll(ing|ed) back|verification failed/)
    assert.equal(compose(site.dir), before)
  })

  test('an alias that resolves to a foreign endpoint fails the migration', async () => {
    const site = makeSite(LONG, { probe: 'wrongip' })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /roll(ing|ed) back|verification failed/)
    assert.equal(compose(site.dir), before)
  })

  test('no observer to probe from is refused in preflight, BEFORE any mutation', async () => {
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.ps['tracy/tracy-web'] = []
    })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /no single attached tracy-web observer|before any mutation/)
    assert.equal(compose(site.dir), before)
    assert.equal(backups(site.dir).length, 0, 'no backup — the refusal is before any mutation')
    assert.doesNotMatch(readFileSync(site.logPath, 'utf8'), /\bup -d\b/, 'nothing is recreated')
  })

  test('dry-run refuses a missing observer before any mutation (not discovered after a recreate)', async () => {
    // The observer/connectivity gate is in the shared read-only preflight, so even a dry run refuses a
    // missing observer up front rather than a caller learning of it only when an --apply rolls back.
    const site = makeSite(LONG, {})
    patchState(site.statePath, (s) => {
      s.ps['tracy/tracy-web'] = []
    })
    const r = await run(LONG, [], site) // no --apply
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /no single attached tracy-web observer|before any mutation/)
    assert.doesNotMatch(readFileSync(site.logPath, 'utf8'), /\bup -d\b/)
  })

  test('dry-run refuses when the web endpoint does not answer HTTP before migration', async () => {
    // The connectivity check is a DIRECT probe to the container's own endpoint (the #165 alias may not
    // exist yet). A site that does not answer there is refused before anything is touched.
    const site = makeSite(LONG, { extraState: { rollbackProbe: 'httpfail' } })
    const r = await run(LONG, [], site) // no --apply
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /own endpoint before migration|before any mutation/)
  })

  test('a readiness failure restores the exact original compose', async () => {
    const site = makeSite(LONG, { up: ['ok-noalias'] }) // web comes up WITHOUT the alias → verify fails
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /roll(ing|ed) back|verification failed/)
    assert.equal(compose(site.dir), before, 'the original compose bytes are restored on rollback')
  })

  test('the readiness health template survives a container WITHOUT a healthcheck on the Docker CLI 27.x', async () => {
    // The script swallows inspect errors (`|| true`), so a template the tracy-host CLI refuses would
    // read as "no healthcheck" for every container. Render the exact template the script sends.
    const source = readFileSync(CLI, 'utf8')
    const templates = [...source.matchAll(/inspect -f '([^']*Health[^']*)'/g)].map((m) => m[1])
    assert.equal(templates.length, 1, 'one health template in the readiness check')
    assert.doesNotMatch(templates[0], /\.State\.Health/, 'no field access to a key that may be missing')
    const none = renderInspectFormat(templates[0], { State: { Running: true } })
    assert.equal(none.code, 0, none.stderr)
    assert.equal(none.stdout, '\n')
    const healthy = renderInspectFormat(templates[0], {
      State: { Running: true, Health: { Status: 'healthy' } }
    })
    assert.equal(healthy.stdout, 'healthy\n')
  })

  test('a recreated web container that reports healthy passes readiness', async () => {
    const site = makeSite(LONG, { up: ['ok-healthy'] })
    const r = await run(LONG, ['--apply'], site)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(compose(site.dir), aliasedCompose(LONG))
  })

  test('a recreated web container that reports UNHEALTHY fails readiness and restores the compose', async () => {
    // With a Health template the CLI refuses, the swallowed error made this container look ready.
    const site = makeSite(LONG, { up: ['ok-unhealthy'] })
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /did not come back healthy/)
    assert.equal(compose(site.dir), before, 'the original compose bytes are restored on rollback')
  })

  test('a rollback that cannot recreate the old web is loud, not swallowed', async () => {
    const site = makeSite(LONG, { up: ['ok-noalias', 'fail'] }) // verify fails, then the rollback up fails
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /ROLLBACK FAILED/)
    // The original bytes are back on disk even though the recreate failed — the failure is about the
    // container, not the file.
    assert.equal(compose(site.dir), before)
  })

  test('a compose edited after the swap is NOT overwritten by rollback — the failure stays loud', async () => {
    // Readiness fails, and the stub edits the compose during the failing recreate (after the swap).
    // Rollback must see its own swapped bytes are gone and refuse to clobber the concurrent edit.
    const site = makeSite(LONG, {
      up: ['ok-noalias'],
      extraState: { driftCompose: { on: 'up', append: '\n# post-swap edit\n' } }
    })
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /ROLLBACK FAILED/)
    assert.match(compose(site.dir), /# post-swap edit/, 'the concurrent post-swap edit is left intact')
  })

  test('a catchable SIGTERM AFTER the swap exits through cleanup: lock held across rollback, then gone', async () => {
    // The phase-aware cleanup — not the in-line rollback — must handle an UNEXPECTED exit after the swap.
    // The stub sends the migrate script a SIGTERM on the first recreate up (once PHASE=swapped), so the
    // process leaves through its EXIT trap. The trap must: keep the owned lock held through the whole
    // drift-aware restore (proven by the stub observing it on the rollback recreate), restore the ORIGINAL
    // bytes and mode, then remove the lock and every temp. SIGKILL would skip this; SIGTERM must not.
    const site = makeSite(LONG, { extraState: { killOnRecreate: true } })
    chmodSync(path.join(site.dir, 'docker-compose.yml'), 0o640)
    const before = compose(site.dir)
    const r = await run(LONG, ['--apply'], site)
    assert.notEqual(r.status, 0, 'a terminated run does not exit 0')
    assert.match(r.stderr, /unexpected exit after the swap/)
    assert.equal(compose(site.dir), before, 'the original bytes are restored by cleanup')
    assert.equal(
      statSync(path.join(site.dir, 'docker-compose.yml')).mode & 0o777,
      0o640,
      'the original mode is restored'
    )
    // The lock was still held while the rollback recreate ran (cleanup releases it only after restore)…
    const state = JSON.parse(readFileSync(site.statePath, 'utf8'))
    assert.equal(state.lockDuringRollback, true, 'the owned lock is held through the rollback')
    // …and nothing is left behind: no lock dir, no candidate/staged temps.
    const leftovers = readdirSync(site.dir).filter(
      (f) => f.startsWith('.dns-alias.lock') || f.startsWith('.docker-compose.')
    )
    assert.deepEqual(leftovers, [], `cleanup left no lock or temp: ${leftovers.join(', ')}`)
  })

  // ── the workflow: the opt-in migration step guards its runtime ─────────────────────────────────────

  test('the deploy-dev migration step asserts node presence and .node-version BEFORE invoking the CLI', async () => {
    // The migration is a Node program; a runtime mismatch must fail with a clear message, not surface as
    // an opaque CLI error mid-run. Assert the workflow step checks `command -v node` and compares
    // `node -v` to `.node-version` before it reaches the migrate script — the job-local runtime, no host
    // install. A static read of the YAML (not a run) is the right shape for a workflow guarantee.
    const ROOT = path.join(HERE, '../../../..')
    const wf = readFileSync(path.join(ROOT, '.github/workflows/build-app-images.yml'), 'utf8')
    const idx = wf.indexOf('Migrate one dev site to the #165 DNS alias')
    assert.notEqual(idx, -1, 'the migration step exists')
    const step = wf.slice(idx)
    const nodeCheck = step.indexOf('command -v node')
    const versionCheck = step.indexOf('.node-version')
    const cli = step.indexOf('migrate-web-dns-alias.sh')
    assert.ok(nodeCheck > -1, 'the step checks node is on PATH')
    assert.ok(versionCheck > -1, 'the step compares against .node-version')
    assert.ok(cli > -1, 'the step invokes the CLI')
    assert.ok(nodeCheck < cli && versionCheck < cli, 'the node/version checks run before the CLI')
    // Default mode stays dry-run so the selector is proven to resolve before anything is recreated.
    assert.match(wf, /migrate_dns_alias_mode:[\s\S]*?default:\s*'dry-run'/)
  })
})
