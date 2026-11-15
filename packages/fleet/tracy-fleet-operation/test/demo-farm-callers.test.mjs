/**
 * The demo farm, part 2a: what the scripts that act on ONE site do when that site is a template demo
 * folded into the farm (lib/site-runtime.sh marker `<private>/<label>/runtime` = `farm`).
 *
 *   - every script that changes a site's own runtime refuses it up front, naming `unfold`, before it
 *     reads or changes anything (docker is never asked)
 *   - go-live serves `--op live` without domains the farm way, and refuses draft / drop-domain / domains
 *   - the farm is never in TRACY-FLEET-EGRESS (every folded demo is published = live)
 *   - farm-release.sh lets go of the demo's farm part (teardown.sh's step 1b)
 *
 * Docker and iptables here are shims that record their argv; the real thing runs in
 * test/e2e/demo-farm/run.sh.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/demo-farm-callers.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))
const LABEL = 'demo-farm1'

/** A private root with one folded demo (and one per-site demo beside it), docker/iptables shims. */
function host() {
  const dir = mkdtempSync(join(tmpdir(), 'tracy-farm-callers-'))
  const srv = join(dir, 'srv')
  const bin = join(dir, 'bin')
  for (const label of [LABEL, 'demo-site1']) {
    mkdirSync(join(srv, label, 'apache'), { recursive: true })
    mkdirSync(join(dir, 'sites', label, '.webroot'), { recursive: true })
    writeFileSync(join(srv, label, '.env'), 'HOST_PORT=52042\nPLATFORM=joomla\nDB_PASSWORD=pw1\n')
    writeFileSync(join(srv, label, 'docker-compose.yml'), 'services: {}\n')
    writeFileSync(join(srv, label, 'apache/tracy-demo-limits.conf'), '# lean\n')
  }
  writeFileSync(join(srv, LABEL, 'runtime'), 'farm\n')
  mkdirSync(bin)
  const shim = (name) =>
    writeFileSync(
      join(bin, name),
      `#!/usr/bin/env bash
printf '${name} %s\\n' "$*" >> "$CALLS"
case "${name} $1 $2" in
  "docker info --format") echo 4; exit 0 ;;
  "docker network inspect") echo "\${FAKE_FRONT_SUBNET:-172.31.9.0/24}"; exit 0 ;;
  "docker inspect -f")
    case "$3" in
      *State.Running*) echo true ;;
      *farm-config*) echo "\${FAKE_FARM_HASH:-}" ;;
      *) echo "\${FAKE_FARM_IP:-172.30.0.77}" ;;
    esac
    exit 0 ;;
  "iptables -C "*) exit 1 ;;
esac
exit 0
`,
      { mode: 0o755 }
    )
  shim('docker')
  shim('iptables')
  const calls = join(dir, 'calls')
  writeFileSync(calls, '')
  const env = {
    ...process.env,
    PATH: pathWithFlock(`${bin}:${process.env.PATH}`),
    CALLS: calls,
    TRACY_PRIVATE_ROOT: srv,
    TRACY_ROOT: srv,
    TRACY_SITES_ROOT: join(dir, 'sites'),
    TRACY_WEB_ENV_FILE: '/dev/null',
    TRACY_DEMOS_IMAGE: 'tracy/web-demos:test',
    TRACY_DEMOS_MAIL_NETWORK: ''
  }
  const run = (args, extra = {}) =>
    spawnSync('bash', args, { encoding: 'utf8', timeout: 60_000, env: { ...env, ...extra } })
  const called = () => readFileSync(calls, 'utf8').split('\n').filter(Boolean)
  return { dir, srv, run, called, dispose: () => rmSync(dir, { recursive: true, force: true }) }
}

const P = (name) => join(SCRIPTS, 'provision', name)
const REFUSED = [
  ['set-php.sh', (h) => [P('set-php.sh'), '--label', LABEL, '--from', '5.1', '--to', '5.2', '--root', h.srv]],
  [
    'set-web-image.sh',
    (h) => [P('set-web-image.sh'), '--label', LABEL, '--image', 'tracy/web-joomla:x', '--root', h.srv]
  ],
  ['enable-j6-legacy-compat.sh', (h) => [P('enable-j6-legacy-compat.sh'), '--label', LABEL, '--root', h.srv]],
  [
    'move-off-upstream-image.sh',
    (h) => [P('move-off-upstream-image.sh'), '--label', LABEL, '--root', h.srv, '--apply']
  ],
  [
    'migrate-site-from-host.sh',
    (h) => [P('migrate-site-from-host.sh'), LABEL, '--from', 'old-host', '--root', h.srv]
  ],
  ['migrate-site-to-host-dsh.sh', () => [P('migrate-site-to-host-dsh.sh'), LABEL]],
  ['rollback-site-from-host-dsh.sh', () => [P('rollback-site-from-host-dsh.sh'), LABEL]],
  ['migrate-web-dns-alias.sh', (h) => [P('migrate-web-dns-alias.sh'), LABEL, '--root', h.srv]],
  ['attach-site.sh', () => [P('attach-site.sh'), LABEL]],
  ['detach-site.sh', () => [P('detach-site.sh'), LABEL]],
  ['apply-site-limits.sh', (h) => [P('apply-site-limits.sh'), '--label', LABEL, '--root', h.srv, '--apply']],
  [
    'webroot/site-demo-contact.sh',
    () => [join(SCRIPTS, 'webroot/site-demo-contact.sh'), '--label', LABEL, '--op', 'install']
  ]
]

for (const [name, argv] of REFUSED)
  test(`${name}: a demo in the demo farm is refused up front, naming unfold, and docker is never asked`, () => {
    const h = host()
    try {
      const r = h.run(argv(h))
      assert.notEqual(r.status, 0, r.stdout)
      assert.match(r.stderr, new RegExp(`${LABEL} is a demo served by the demo farm .*unfold it first`))
      assert.deepEqual(
        h.called().filter((c) => c.startsWith('docker ') || c.startsWith('iptables ')),
        [],
        'nothing was asked of docker or the firewall'
      )
    } finally {
      h.dispose()
    }
  })

test('apply-site-limits.sh: a sweep passes a folded demo over and still caps the per-site demo', () => {
  const h = host()
  try {
    const r = h.run([P('apply-site-limits.sh'), '--root', h.srv])
    assert.match(r.stdout, new RegExp(`${LABEL}: in the demo farm — passed over`))
    assert.doesNotMatch(r.stdout, new RegExp(`${LABEL}: SKIPPED`))
    assert.ok(!h.called().some((c) => c.includes(`${LABEL}-web-1`) || c.includes(`${LABEL}-db-1`)))
  } finally {
    h.dispose()
  }
})

/** go-live.sh on a host shaped like this one: a Joomla webroot and noindex conf for both demos. */
function goLive(h, label, args) {
  const webroot = join(h.dir, 'sites', label, '.webroot')
  writeFileSync(join(webroot, 'configuration.php'), "<?php\nclass JConfig {\n\tpublic $mailer = 'none';\n}\n")
  writeFileSync(
    join(h.srv, label, 'apache/tracy-noindex.conf'),
    'Header always set X-Robots-Tag "noindex, nofollow"\n'
  )
  const demos = join(h.srv, '_demos')
  for (const d of ['apache', 'fpm', 'exec']) mkdirSync(join(demos, d), { recursive: true })
  writeFileSync(join(demos, 'fpm', `${LABEL}.conf`), '; pool\n')
  writeFileSync(join(demos, 'compose.yml'), '# the farm\n')
  return h.run([P('go-live.sh'), '--label', label, '--root', h.srv, '--platform', 'joomla', ...args], {
    FLEET_ZONE: 'tracy.test',
    TRACY_TUNNEL: 'none',
    ...farmUpToDate(h)
  })
}

test('go-live.sh --op live, no domains, on a folded demo (the demo flow right after install): served the farm way', () => {
  const h = host()
  try {
    const r = goLive(h, LABEL, ['--op', 'live'])
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, new RegExp(`^TRACY_RESULT go_live=live label=${LABEL} platform=joomla$`, 'm'))
    assert.match(r.stdout, /mail egress: open \(served by the demo farm/)
    const calls = h.called()
    assert.deepEqual(
      calls.filter((c) => c.startsWith('iptables ')),
      [],
      'the farm has no subnet to flip'
    )
    assert.ok(
      !calls.some((c) => c.includes('exec -T web apache2ctl') || c.includes(`${LABEL}-web-1`)),
      'never apache2ctl in the forwarder'
    )
    assert.ok(
      calls.some((c) => c.includes('tracy-demos-reload')),
      'noindex reaches the farm (farm-refresh)'
    )
    assert.doesNotMatch(readFileSync(join(h.srv, LABEL, 'apache/tracy-noindex.conf'), 'utf8'), /X-Robots-Tag/)
    assert.match(
      readFileSync(join(h.dir, 'sites', LABEL, '.webroot/configuration.php'), 'utf8'),
      /\$mailer = 'mail'/
    )
  } finally {
    h.dispose()
  }
})

for (const args of [
  ['--op', 'draft'],
  ['--op', 'drop-domain', '--domain', 'shop.example'],
  ['--op', 'live', '--domain', 'shop.example']
])
  test(`go-live.sh ${args.join(' ')} on a folded demo: refused before any change, naming unfold`, () => {
    const h = host()
    try {
      const r = goLive(h, LABEL, args)
      assert.equal(r.status, 1, r.stdout + r.stderr)
      assert.match(r.stderr, /only `--op live` without domains is served there; unfold it first/)
      assert.deepEqual(h.called(), [])
      assert.match(readFileSync(join(h.srv, LABEL, 'apache/tracy-noindex.conf'), 'utf8'), /X-Robots-Tag/)
    } finally {
      h.dispose()
    }
  })

test('go-live.sh --op live on a per-site demo: the firewall step runs as before, apache2ctl in its own container', () => {
  const h = host()
  try {
    const r = goLive(h, 'demo-site1', ['--op', 'live'])
    assert.equal(r.status, 0, r.stdout + r.stderr)
    const calls = h.called()
    assert.ok(calls.some((c) => c.startsWith('docker network inspect demo-site1_default')))
    assert.ok(
      calls.some((c) => c.startsWith('iptables ')),
      calls.join('\n')
    )
    assert.ok(calls.some((c) => c.includes('apache2ctl -k graceful')))
    assert.ok(!calls.some((c) => c.includes('tracy-demos')))
  } finally {
    h.dispose()
  }
})

/** farm-common.sh's functions over this host, the way fold/unfold/farm-refresh source them. */
/** The farm web already serves what the compose renders now (slot a, its hash): an apply only reloads. */
const farmUpToDate = (h) => {
  mkdirSync(join(h.srv, '_demos'), { recursive: true })
  writeFileSync(join(h.srv, '_demos', '.active-web'), 'tracy-demos-web-a\n')
  const r = h.run([
    '-c',
    `set -euo pipefail; S='${SCRIPTS}'; . "$S/lib/roots.sh"; . "$S/provision/render-compose.sh"; tracy_farm_web_hash`
  ])
  assert.equal(r.status, 0, r.stderr)
  return { FAKE_FARM_HASH: r.stdout.trim() }
}

const common = (h, script, extra) =>
  h.run(
    [
      '-c',
      `set -euo pipefail; S='${SCRIPTS}'; . "$S/lib/roots.sh"; LABEL='${LABEL}'; SITE_DIR='${join(h.srv, LABEL)}'
       . "$S/provision/render-compose.sh"; . "$S/lib/site-lifecycle.sh"; . "$S/provision/farm-common.sh"; ${script}`
    ],
    extra
  )

test('the farm is never enrolled in TRACY-FLEET-EGRESS: an apply asks nothing of the firewall', () => {
  const h = host()
  try {
    const demos = join(h.srv, '_demos')
    mkdirSync(demos, { recursive: true })
    const r = common(h, 'farm_ensure_files; farm_render; farm_apply', {
      TRACY_DEMOS_MAIL_NETWORK: 'tracy_tracy'
    })
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(
      h.called().filter((c) => c.startsWith('iptables ')),
      []
    )
  } finally {
    h.dispose()
  }
})

test('farm-release.sh: the farm lets go of the demo — pool, vhost, schema, user, FARM_DB_*, farm/ and marker', () => {
  const h = host()
  try {
    const demos = join(h.srv, '_demos')
    for (const d of ['apache', 'fpm', 'exec']) mkdirSync(join(demos, d), { recursive: true })
    for (const label of [LABEL, 'other-demo']) {
      writeFileSync(join(demos, 'apache', `${label}.conf`), '# vhost\n')
      writeFileSync(join(demos, 'fpm', `${label}.conf`), '; pool\n')
      writeFileSync(join(demos, 'exec', `${label}.env`), 'X=1\n')
    }
    mkdirSync(join(h.srv, 'other-demo'))
    writeFileSync(join(demos, '.env'), 'FARM_DB_ROOT_PASSWORD=rootpw\n')
    mkdirSync(join(h.srv, LABEL, 'farm'))
    writeFileSync(join(h.srv, LABEL, 'farm', 'per-demo.compose.yml'), 'services: {}\n')
    writeFileSync(
      join(h.srv, LABEL, '.env'),
      'HOST_PORT=52042\nPLATFORM=joomla\nDB_PASSWORD=pw1\nFARM_DB_NAME=d_x_1\nFARM_DB_USER=d_x_1\nFARM_DB_PASSWORD=fp\n'
    )
    // The farm database answers as the server that stays up; the image and the web health check pass.
    writeFileSync(
      join(h.dir, 'bin', 'docker'),
      `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "$CALLS"
case "$*" in *skip_networking*) echo "skip_networking=0" ;; esac
case "$*" in "inspect -f {{.State.Running}} "*) echo true ;; esac
exit 0
`,
      { mode: 0o755 }
    )
    const r = h.run([P('farm-release.sh'), LABEL, '--root', h.srv], {
      TRACY_EGRESS_FENCE: 'off',
      TRACY_FARM_DOWN_WAIT: '0',
      TRACY_FARM_UP_WAIT: '0'
    })
    assert.equal(r.status, 0, r.stderr)
    for (const d of ['apache', 'fpm']) assert.equal(existsSync(join(demos, d, `${LABEL}.conf`)), false)
    assert.equal(existsSync(join(demos, 'exec', `${LABEL}.env`)), false)
    assert.ok(existsSync(join(demos, 'fpm', 'other-demo.conf')), 'the other demo stays a member')
    const compose = readFileSync(join(demos, 'compose.yml'), 'utf8')
    assert.ok(!compose.includes(`/${LABEL}`), 'the farm no longer mounts its folders')
    assert.ok(compose.includes('/other-demo'), 'the other demo is still mounted')
    const calls = h.called()
    assert.ok(
      calls.some((c) => c.includes("DROP DATABASE IF EXISTS `d_x_1`; DROP USER IF EXISTS 'd_x_1'@'%';"))
    )
    assert.ok(
      calls.some((c) => / compose .* up -d /.test(c)),
      'the farm re-applied'
    )
    // The web is REPLACED, not re-created: the next slot starts first, the old one is taken out of every
    // forwarder (its marker), and only then stopped. The database is never stopped; compose never goes down.
    const at = (re) => calls.findIndex((c) => re.test(c))
    const started = at(/ compose .* up -d --no-deps .* demos-web-a$/)
    const out = at(/^docker exec tracy-demos-web rm -f \/run\/tracy-demos-ready\/ok$/)
    const stopped = at(/^docker stop -t 45 tracy-demos-web$/)
    const marked = at(/^docker exec tracy-demos-web-a sh -c mkdir -p \/run\/tracy-demos-ready/)
    assert.ok(
      started >= 0 && marked > started && out > marked && stopped > out,
      `order: ${[started, marked, out, stopped]}`
    )
    assert.ok(
      !calls.some(
        (c) =>
          / compose .* (down|stop|restart)\b/.test(c) || /^docker (stop|restart) .*tracy-demos-db/.test(c)
      )
    )
    assert.equal(readFileSync(join(demos, '.active-web'), 'utf8').trim(), 'tracy-demos-web-a')
    assert.doesNotMatch(readFileSync(join(h.srv, LABEL, '.env'), 'utf8'), /^FARM_DB/m)
    assert.equal(existsSync(join(h.srv, LABEL, 'farm')), false)
    assert.equal(existsSync(join(h.srv, LABEL, 'runtime')), false)
    // Twice is nothing.
    const again = h.run([P('farm-release.sh'), LABEL, '--root', h.srv], { TRACY_EGRESS_FENCE: 'off' })
    assert.equal(again.status, 0, again.stderr)
    assert.match(again.stdout, /holds nothing in the demo farm/)
  } finally {
    h.dispose()
  }
})

test('farm-refresh.sh: a demo not in the farm is left alone; a config that fails the test changes nothing', () => {
  const h = host()
  try {
    const none = h.run([P('farm-refresh.sh'), 'demo-site1', '--root', h.srv])
    assert.equal(none.status, 0, none.stderr)
    assert.match(none.stdout, /not served by the demo farm — nothing to refresh/)
    const demos = join(h.srv, '_demos')
    for (const d of ['apache', 'fpm', 'exec']) mkdirSync(join(demos, d), { recursive: true })
    writeFileSync(join(demos, 'apache', `${LABEL}.conf`), '# the vhost serving now\n')
    writeFileSync(join(demos, 'fpm', `${LABEL}.conf`), '; the pool serving now\n')
    writeFileSync(join(demos, 'compose.yml'), '# the compose serving now\n')
    writeFileSync(
      join(h.srv, LABEL, 'apache', 'tracy-noindex.conf'),
      'Header always set X-Robots-Tag "noindex"\n'
    )
    // The throwaway config test (`compose run … php-fpm -t && apache2ctl -t`) fails.
    writeFileSync(
      join(h.dir, 'bin', 'docker'),
      `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "$CALLS"
case "$*" in *" run --rm "*) echo "AH00526: Syntax error" >&2; exit 1 ;; esac
exit 0
`,
      { mode: 0o755 }
    )
    const r = h.run([P('farm-refresh.sh'), LABEL, '--root', h.srv], { TRACY_EGRESS_FENCE: 'off' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /fails the config test — the farm serves it as before/)
    assert.equal(readFileSync(join(demos, 'apache', `${LABEL}.conf`), 'utf8'), '# the vhost serving now\n')
    assert.equal(readFileSync(join(demos, 'fpm', `${LABEL}.conf`), 'utf8'), '; the pool serving now\n')
    assert.equal(readFileSync(join(demos, 'compose.yml'), 'utf8'), '# the compose serving now\n')
    assert.ok(
      !h.called().some((c) => / up -d /.test(c) || c.includes('tracy-demos-reload')),
      'nothing applied'
    )
  } finally {
    h.dispose()
  }
})

test('the pool forbids starting programs (decision 5): disable_functions in every rendered pool', () => {
  const h = host()
  try {
    const r = common(h, `tracy_farm_render_pool '${LABEL}'`)
    assert.equal(r.status, 0, r.stderr)
    assert.match(
      r.stdout,
      /^php_admin_value\[disable_functions\] = exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec,symlink,link$/m
    )
  } finally {
    h.dispose()
  }
})

test('farm_image_ensure: a host without the farm image builds it (web/build.sh demos) before the first fold uses it', () => {
  const h = host()
  try {
    const web = join(h.dir, 'web')
    mkdirSync(web)
    for (const f of ['emdash.Dockerfile', 'demos.Dockerfile']) writeFileSync(join(web, f), 'FROM scratch\n')
    writeFileSync(
      join(web, 'build.sh'),
      `echo "build $*" >> "${join(h.dir, 'calls')}"; : > "${join(h.dir, 'built')}"\n`
    )
    // docker answers `image inspect` only once build.sh has run.
    writeFileSync(
      join(h.dir, 'bin', 'docker'),
      `#!/usr/bin/env bash\nprintf 'docker %s\\n' "$*" >> "$CALLS"\ncase "$1 $2" in "image inspect") [ -e "${join(h.dir, 'built')}" ] ;; *) exit 0 ;; esac\n`,
      { mode: 0o755 }
    )
    const r = common(h, 'farm_image_ensure tracy/web-demos:test', {
      TRACY_WEB_DIR: web,
      TRACY_WEB_IMAGE_BUILD_LOCK: join(h.dir, 'build.lock')
    })
    assert.equal(r.status, 0, r.stderr)
    assert.ok(h.called().includes('build demos'))
    const again = common(h, 'farm_image_ensure tracy/web-demos:test', { TRACY_WEB_DIR: web })
    assert.equal(again.status, 0)
    assert.equal(h.called().filter((c) => c === 'build demos').length, 1, 'built once')
    rmSync(join(h.dir, 'built'))
    writeFileSync(join(web, 'build.sh'), 'exit 1\n')
    const failed = common(h, 'farm_image_ensure tracy/web-demos:test', { TRACY_WEB_DIR: web })
    assert.notEqual(failed.status, 0)
    assert.match(failed.stderr, /could not be built here/)
  } finally {
    h.dispose()
  }
})

test('fold.sh: a link out of the webroot is refused by path before anything changes; links inside are fine', () => {
  const h = host()
  try {
    rmSync(join(h.srv, LABEL, 'runtime'))
    writeFileSync(
      join(h.srv, LABEL, 'docker-compose.yml'),
      'services:\n  db:\n    environment:\n      MARIADB_DATABASE: "site"\n'
    )
    const webroot = join(h.dir, 'sites', LABEL, '.webroot')
    mkdirSync(join(webroot, 'images'), { recursive: true })
    writeFileSync(join(webroot, 'index.php'), '<?php\n')
    symlinkSync('../index.php', join(webroot, 'images', 'inside.php'))
    symlinkSync('/var/www/html/index.php', join(webroot, 'docroot.php'))
    symlinkSync(`/site/${LABEL}/.webroot/index.php`, join(webroot, 'farmroot.php'))
    symlinkSync('/site/other-demo/.webroot/configuration.php', join(webroot, 'leak.txt'))
    symlinkSync('../../../other-demo/.webroot/wp-config.php', join(webroot, 'images', 'up.txt'))
    writeFileSync(
      join(h.dir, 'bin', 'docker'),
      `#!/usr/bin/env bash\nprintf 'docker %s\\n' "$*" >> "$CALLS"\ncase "$*" in "inspect -f {{.State.Running}} "*) echo true ;; esac\nexit 0\n`,
      { mode: 0o755 }
    )
    const r = h.run([P('fold.sh'), LABEL, '--root', h.srv])
    assert.equal(r.status, 2, r.stdout + r.stderr)
    assert.match(r.stderr, /leak\.txt -> \/site\/other-demo\/\.webroot\/configuration\.php/)
    assert.match(r.stderr, /images\/up\.txt -> \.\.\/\.\.\/\.\.\/other-demo/)
    assert.doesNotMatch(r.stderr, /inside\.php|docroot\.php|farmroot\.php/)
    assert.ok(
      !h.called().some((c) => / stop | exec | compose /.test(c)),
      'nothing was stopped, run or changed'
    )
    assert.ok(!existsSync(join(h.srv, LABEL, 'farm')))
  } finally {
    h.dispose()
  }
})

test('fold.sh: a chain of links is judged by where it ENDS — base, parent, leak; dangling and loops are bad too', () => {
  const h = host()
  try {
    rmSync(join(h.srv, LABEL, 'runtime'))
    writeFileSync(
      join(h.srv, LABEL, 'docker-compose.yml'),
      'services:\n  db:\n    environment:\n      MARIADB_DATABASE: "site"\n'
    )
    const webroot = join(h.dir, 'sites', LABEL, '.webroot')
    mkdirSync(join(webroot, 'images'), { recursive: true })
    writeFileSync(join(webroot, 'index.php'), '<?php\n')
    // A chain: no single target names another demo.
    symlinkSync(`/site/${LABEL}/.webroot`, join(webroot, 'base'))
    symlinkSync('base/..', join(webroot, 'parent'))
    symlinkSync('parent/../b/.webroot/secret.txt', join(webroot, 'leak.txt'))
    symlinkSync('nowhere.php', join(webroot, 'dangling.php'))
    symlinkSync('loop2', join(webroot, 'loop1'))
    symlinkSync('loop1', join(webroot, 'loop2'))
    symlinkSync('../base/index.php', join(webroot, 'images', 'fine.php'))
    writeFileSync(
      join(h.dir, 'bin', 'docker'),
      `#!/usr/bin/env bash\nprintf 'docker %s\\n' "$*" >> "$CALLS"\ncase "$*" in "inspect -f {{.State.Running}} "*) echo true ;; esac\nexit 0\n`,
      { mode: 0o755 }
    )
    const r = h.run([P('fold.sh'), LABEL, '--root', h.srv])
    assert.equal(r.status, 2, r.stdout + r.stderr)
    for (const bad of [
      'leak.txt -> parent/../b/.webroot/secret.txt',
      'parent -> base/..',
      'dangling.php',
      'loop1',
      'loop2'
    ])
      assert.ok(r.stderr.includes(bad), `${bad} not reported:\n${r.stderr}`)
    assert.ok(!/ base -> /.test(r.stderr), 'base ends at the webroot itself')
    assert.ok(!r.stderr.includes('fine.php'), 'a link through base to a file inside is fine')
    assert.ok(!h.called().some((c) => / stop | exec | compose /.test(c)))
  } finally {
    h.dispose()
  }
})

// ── definers: dropped where the dump writes them as syntax, never inside a row ──────────
const DUMP_WITH_DEFINERS = [
  "INSERT INTO `t` VALUES (1,'CREATE DEFINER=`writer`@`localhost` VIEW v AS SELECT 1'),(2,'/*!50013 DEFINER=`w`@`h` SQL SECURITY DEFINER */'),(3,'/*!50017 DEFINER=`w`@`h`*/ and /*!50117 DEFINER=`w`@`h`*/');",
  "/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `tr` BEFORE INSERT ON `t` FOR EACH ROW SET NEW.a = '/*!50017 DEFINER=`x`@`y`*/' */;;",
  '/*!50106 CREATE*/ /*!50117 DEFINER=`root`@`localhost`*/ /*!50106 EVENT `ev` ON SCHEDULE EVERY 1 DAY DO DELETE FROM t WHERE 1=0 */ ;;',
  '/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */',
  'CREATE DEFINER=`root`@`localhost` PROCEDURE `p`()',
  ''
].join('\n')
const DUMP_STRIPPED = [
  DUMP_WITH_DEFINERS.split('\n')[0],
  "/*!50003 CREATE*/ /*!50003 TRIGGER `tr` BEFORE INSERT ON `t` FOR EACH ROW SET NEW.a = '/*!50017 DEFINER=`x`@`y`*/' */;;",
  '/*!50106 CREATE*/ /*!50106 EVENT `ev` ON SCHEDULE EVERY 1 DAY DO DELETE FROM t WHERE 1=0 */ ;;',
  '/*!50013 SQL SECURITY DEFINER */',
  'CREATE PROCEDURE `p`()',
  ''
].join('\n')

test('farm_strip_definers: real definers go; a row whose text holds each form stays byte-identical', () => {
  const h = host()
  try {
    const dump = join(h.dir, 'dump.sql')
    writeFileSync(dump, DUMP_WITH_DEFINERS)
    const r = common(h, `farm_strip_definers < '${dump}'`)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, DUMP_STRIPPED)
  } finally {
    h.dispose()
  }
})

test('every import into a farm schema strips definers with the one filter (lib/strip-definers.sed)', () => {
  for (const file of ['provision/farm-common.sh', 'provision/restore.sh', 'webroot/webroot-backup.sh']) {
    const text = readFileSync(join(SCRIPTS, file), 'utf8')
    assert.match(text, /strip-definers\.sed/, file)
    assert.doesNotMatch(text, /s\/DEFINER=`\[\^`\]\*`@/, `${file} still has a line-blind DEFINER regex`)
  }
})

test('farm_pool_drain: waits while the pool says a request runs; leaves idle workers; gives up after the bound; old pools take the slow road', () => {
  const h = host()
  try {
    const status = join(h.dir, 'status')
    const workers = join(h.dir, 'workers')
    writeFileSync(status, 'busy=1 pids=11,12\nbusy=1 pids=11,12\nbusy=0 pids=11,12\n')
    writeFileSync(workers, '1\n')
    writeFileSync(
      join(h.dir, 'bin', 'docker'),
      `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "$CALLS"
case "$*" in
  *"php -n -- /run/tracy-demos/"*) line=$(sed -n 1p "${status}"); sed -i 1d "${status}"; [ -n "$line" ] && echo "$line" ;;
  *'n=0'*) n=$(cat "${workers}"); echo "$n"; [ "$n" -gt 0 ] && echo $((n - 1)) > "${workers}" ;;
esac
exit 0
`,
      { mode: 0o755 }
    )
    const r = common(h, 'farm_pool_drain')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /no request of demo-farm1 runs in the farm any more \(2 s\)/)
    let calls = readFileSync(join(h.dir, 'calls'), 'utf8')
    assert.ok(!/ sh (TERM|QUIT|KILL) /.test(calls), 'no worker signalled: idle ones cannot write')
    assert.ok(!/tracy-demos-reload|USR2/.test(calls), 'never an FPM reload')
    // A request that never ends: refused after the bound.
    writeFileSync(status, `${'busy=1 pids=11\n'.repeat(10)}`)
    const stuck = common(h, 'farm_pool_drain', { TRACY_FARM_DRAIN_WAIT: '2' })
    assert.equal(stuck.status, 1)
    assert.match(stuck.stderr, /still runs in the farm after 2 s/)
    // A pool with no status path: its workers are asked to quit (this pool only) and waited for.
    writeFileSync(status, '')
    writeFileSync(workers, '1\n')
    writeFileSync(join(h.dir, 'calls'), '')
    const old = common(h, 'farm_pool_drain')
    assert.equal(old.status, 0, old.stderr)
    calls = readFileSync(join(h.dir, 'calls'), 'utf8')
    assert.ok(calls.includes(`done sh QUIT ${LABEL}`))
  } finally {
    h.dispose()
  }
})

test("pool sockets are Apache's user's alone (0600), never www-data's: no demo's PHP can open another's pool", () => {
  const h = host()
  try {
    const r = common(h, `tracy_farm_render_pool '${LABEL}'`)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /^user = www-data$/m, 'workers stay www-data')
    assert.match(r.stdout, /^listen\.owner = farmhttp$/m)
    assert.match(r.stdout, /^listen\.group = farmhttp$/m)
    assert.match(r.stdout, /^listen\.mode = 0600$/m)
    assert.doesNotMatch(r.stdout, /^listen\.acl_/m)
    assert.doesNotMatch(r.stdout, /^listen = [^/]/m, 'no pool listens on TCP')
    const web = fileURLToPath(new URL('../web/', import.meta.url))
    const farmPool = readFileSync(join(web, 'demos/php-fpm-farm.conf'), 'utf8')
    assert.match(farmPool, /^listen\.owner = farmhttp\nlisten\.group = farmhttp\nlisten\.mode = 0600$/m)
    const docker = readFileSync(join(web, 'demos.Dockerfile'), 'utf8')
    assert.match(docker, /APACHE_RUN_USER=farmhttp/)
    assert.match(docker, /useradd -u 3301 -g farmhttp -G www-data/)
    assert.match(
      readFileSync(join(web, 'demos/entrypoint.sh'), 'utf8'),
      /^chown root:farmhttp \/run\/tracy-demos$/m
    )
    // unfold's drain asks a pool's status as root: www-data may not open the socket any more.
    assert.match(
      readFileSync(join(SCRIPTS, 'provision/farm-common.sh'), 'utf8'),
      /docker exec -i -u 0 "\$\(tracy_farm_web\)" php -n -- /
    )
  } finally {
    h.dispose()
  }
})

test("farm_render writes every member's pool again with the compose: no pool keeps a socket the new Apache cannot open", () => {
  const h = host()
  try {
    const fpm = join(h.srv, '_demos', 'fpm')
    mkdirSync(fpm, { recursive: true })
    // A pool written for the r1 image (sockets www-data 0660), beside this demo's.
    const old =
      '[demo-site1]\nuser = www-data\nlisten = /run/tracy-demos/demo-site1.sock\nlisten.owner = www-data\nlisten.group = www-data\nlisten.mode = 0660\n'
    writeFileSync(join(fpm, 'demo-site1.conf'), old)
    writeFileSync(join(fpm, `${LABEL}.conf`), old.replaceAll('demo-site1', LABEL))
    const r = common(h, 'farm_render')
    assert.equal(r.status, 0, r.stderr)
    for (const member of ['demo-site1', LABEL]) {
      const pool = readFileSync(join(fpm, `${member}.conf`), 'utf8')
      assert.match(pool, /^listen\.owner = farmhttp$/m, member)
      assert.match(pool, /^listen\.mode = 0600$/m, member)
      assert.match(pool, new RegExp(`^listen = /run/tracy-demos/${member}\\.sock$`, 'm'))
    }
    assert.ok(readFileSync(join(h.srv, '_demos', 'compose.yml'), 'utf8').includes('/site/demo-site1'))
  } finally {
    h.dispose()
  }
})

test('farm-forwarders.sh: opt-in — without --apply nothing restarts; with it only a forwarder on an older config, one at a time', () => {
  const h = host()
  try {
    const demos = join(h.srv, '_demos')
    for (const d of ['apache', 'fpm', 'exec']) mkdirSync(join(demos, d), { recursive: true })
    for (const label of [LABEL, 'cur-demo']) writeFileSync(join(demos, 'fpm', `${label}.conf`), '; pool\n')
    assert.equal(common(h, 'farm_ensure_files').status, 0)
    const current = readFileSync(join(demos, 'forward.haproxy.cfg'), 'utf8')
    // What each forwarder runs, kept in files; `docker restart` makes a forwarder read the host's file again.
    const running = (label) => join(h.dir, `running-${label}.cfg`)
    writeFileSync(running(LABEL), `${current}# older\n`)
    writeFileSync(running('cur-demo'), current)
    writeFileSync(
      join(h.dir, 'bin', 'docker'),
      `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "$CALLS"
case "$1" in
  inspect) echo true ;;
  exec) cat "${h.dir}/running-\${2%-web-1}.cfg" ;;
  restart) cp "${demos}/forward.haproxy.cfg" "${h.dir}/running-\${4%-web-1}.cfg" ;;
esac
exit 0
`,
      { mode: 0o755 }
    )
    const dry = h.run([P('farm-forwarders.sh'), '--root', h.srv])
    assert.equal(dry.status, 0, dry.stderr)
    assert.match(dry.stdout, new RegExp(`${LABEL}: its forwarder runs an older config`))
    assert.doesNotMatch(dry.stdout, /cur-demo/)
    assert.deepEqual(
      h.called().filter((c) => c.startsWith('docker restart')),
      []
    )
    const r = h.run([P('farm-forwarders.sh'), '--root', h.srv, '--apply'])
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(
      h.called().filter((c) => c.startsWith('docker restart')),
      [`docker restart -t 5 ${LABEL}-web-1`]
    )
    assert.match(r.stdout, /1 of 1 forwarder\(s\) moved to the current config, 0 failed/)
    assert.equal(readFileSync(running(LABEL), 'utf8'), current)
    // A second run finds nothing to do.
    const again = h.run([P('farm-forwarders.sh'), '--root', h.srv, '--apply'])
    assert.match(again.stdout, /0 of 0 forwarder\(s\)/)
  } finally {
    h.dispose()
  }
})

// ── the blue/green switch (farm-common.sh farm_switch), against a docker that remembers its containers ──

/** A docker that keeps state in files: which farm web containers exist, which are ready, what they were given. */
function statefulDocker(h) {
  const st = join(h.dir, 'state')
  mkdirSync(st, { recursive: true })
  writeFileSync(
    join(h.dir, 'bin', 'docker'),
    `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "$CALLS"
S="${st}"
name_of() { for a in "$@"; do case "$a" in tracy-demos-web*) echo "$a"; return ;; esac; done; }
case "$1" in
  inspect)
    n="$(name_of "$@")"
    [ -e "$S/$n" ] || exit 1
    case "$3" in
      *State.Running*) echo true ;;
      *farm-config*) cat "$S/$n" ;;
      *.Name*) echo "/$n" ;;
    esac ;;
  compose)
    case "$*" in
      *" up -d --no-deps "*) n="tracy-demos-web-\${*: -1}"; n="\${n/tracy-demos-web-demos-web-/tracy-demos-web-}"
        echo "\${FAKE_NEW_HASH:-newhash}" > "$S/$n" ;;
    esac ;;
  exec)
    n="$2"
    case "$*" in
      *"curl "*) [ "\${FAKE_UNHEALTHY:-}" = "$n" ] && exit 1; exit 0 ;;
      *"test -d /run/tracy-demos-ready"*) [ "$n" = tracy-demos-web ] && exit 1; exit 0 ;;
      *"test -f /run/tracy-demos-ready/ok"*) [ -e "$S/$n.ready" ]; exit $? ;;
      *"mkdir -p /run/tracy-demos-ready"*) : > "$S/$n.ready" ;;
      *"rm -f /run/tracy-demos-ready/ok"*) rm -f "$S/$n.ready" ;;
      *tracy-demos-reload*) exit 0 ;;
      *"/proc/net/tcp"*) echo 0 ;;
    esac ;;
  rm) n="$(name_of "$@")"; rm -f "$S/$n" "$S/$n.ready" ;;
  stop) n="$(name_of "$@")"; : ;;
esac
exit 0
`,
    { mode: 0o755 }
  )
  const web = (name, { ready = true, hash = 'oldhash' } = {}) => {
    writeFileSync(join(st, name), `${hash}\n`)
    if (ready) writeFileSync(join(st, `${name}.ready`), '')
  }
  const exists = (name) => existsSync(join(st, name))
  const isReady = (name) => existsSync(join(st, `${name}.ready`))
  return { web, exists, isReady }
}

const apply = (h, extra = {}) =>
  common(h, 'farm_ensure_files; farm_render; farm_apply', {
    TRACY_EGRESS_FENCE: 'off',
    TRACY_FARM_DOWN_WAIT: '0',
    TRACY_FARM_UP_WAIT: '0',
    TRACY_FARM_SWITCH_DRAIN: '5',
    ...extra
  })

test('farm_switch: the next slot starts and is ready BEFORE the old one leaves its forwarders; then drain, stop, remove', () => {
  const h = host()
  try {
    const d = statefulDocker(h)
    d.web('tracy-demos-web-a')
    writeFileSync(join(h.srv, '_demos.tmp'), '')
    mkdirSync(join(h.srv, '_demos'), { recursive: true })
    writeFileSync(join(h.srv, '_demos', '.active-web'), 'tracy-demos-web-a\n')
    const r = apply(h)
    assert.equal(r.status, 0, r.stderr)
    const calls = h.called()
    const at = (re) => calls.findIndex((c) => re.test(c))
    const started = at(/ compose .* up -d --no-deps .*demos-web-b$/)
    const healthy = at(/^docker exec tracy-demos-web-b curl /)
    const ready = at(/^docker exec tracy-demos-web-b sh -c mkdir -p \/run\/tracy-demos-ready/)
    const out = at(/^docker exec tracy-demos-web-a rm -f \/run\/tracy-demos-ready\/ok$/)
    const quiet = at(/^docker exec tracy-demos-web-a sh -c\s*$/)
    const stopped = at(/^docker stop -t 45 tracy-demos-web-a$/)
    const removed = at(/^docker rm -f tracy-demos-web-a$/)
    assert.ok(
      started >= 0 &&
        healthy > started &&
        ready > healthy &&
        out > ready &&
        quiet > out &&
        stopped > quiet &&
        removed > stopped,
      JSON.stringify({ started, healthy, ready, out, quiet, stopped, removed })
    )
    assert.equal(readFileSync(join(h.srv, '_demos', '.active-web'), 'utf8').trim(), 'tracy-demos-web-b')
    assert.ok(d.exists('tracy-demos-web-b') && d.isReady('tracy-demos-web-b'))
    assert.ok(!d.exists('tracy-demos-web-a'))
    assert.ok(
      !calls.some((c) => /tracy-demos-db/.test(c) && /\b(stop|rm|restart)\b/.test(c)),
      'the database is never touched'
    )
    // The next switch goes back to a.
    const again = apply(h, { FAKE_NEW_HASH: 'newer' })
    assert.equal(again.status, 0, again.stderr)
    assert.equal(readFileSync(join(h.srv, '_demos', '.active-web'), 'utf8').trim(), 'tracy-demos-web-a')
    assert.ok(!d.exists('tracy-demos-web-b'))
  } finally {
    h.dispose()
  }
})

test('farm_switch: a pre-slot farm (one container named tracy-demos-web) is replaced by slot a, with no marker to take away', () => {
  const h = host()
  try {
    const d = statefulDocker(h)
    d.web('tracy-demos-web', { ready: false })
    const r = apply(h)
    assert.equal(r.status, 0, r.stderr)
    const calls = h.called()
    assert.ok(calls.some((c) => / compose .* up -d --no-deps .*demos-web-a$/.test(c)))
    // No marker to remove in a pre-slot farm: a current-config forwarder is told it is gone by a 410 on /tracy-ready.
    assert.ok(
      !calls.some((c) => c.startsWith('docker exec tracy-demos-web rm -f ')),
      'a pre-slot farm has no marker'
    )
    const gone = calls.findIndex((c) =>
      c.startsWith('docker exec tracy-demos-web sh -c printf "Redirect gone /tracy-ready')
    )
    const stoppedOld = calls.findIndex((c) => /^docker stop -t 45 tracy-demos-web$/.test(c))
    assert.ok(gone >= 0 && stoppedOld > gone, `410 first, then the stop: ${gone} ${stoppedOld}`)
    assert.ok(calls.some((c) => /^docker stop -t 45 tracy-demos-web$/.test(c)))
    assert.ok(!d.exists('tracy-demos-web') && d.exists('tracy-demos-web-a') && d.isReady('tracy-demos-web-a'))
    assert.equal(readFileSync(join(h.srv, '_demos', '.active-web'), 'utf8').trim(), 'tracy-demos-web-a')
  } finally {
    h.dispose()
  }
})

test('farm_switch: a new slot that never gets healthy is removed and the serving one is left exactly as it was', () => {
  const h = host()
  try {
    const d = statefulDocker(h)
    d.web('tracy-demos-web-a')
    mkdirSync(join(h.srv, '_demos'), { recursive: true })
    writeFileSync(join(h.srv, '_demos', '.active-web'), 'tracy-demos-web-a\n')
    const r = apply(h, { FAKE_UNHEALTHY: 'tracy-demos-web-b', TRACY_FARM_WAIT_TRIES: '2' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /tracy-demos-web-b did not (come up|answer)/)
    assert.ok(d.exists('tracy-demos-web-a') && d.isReady('tracy-demos-web-a'), 'marker intact, still there')
    assert.ok(!d.exists('tracy-demos-web-b'))
    assert.equal(readFileSync(join(h.srv, '_demos', '.active-web'), 'utf8').trim(), 'tracy-demos-web-a')
    const calls = h.called()
    assert.ok(
      !calls.some((c) => /tracy-demos-web-a/.test(c) && /(rm -f \/run|docker stop|docker rm)/.test(c)),
      'the serving slot was never touched'
    )
  } finally {
    h.dispose()
  }
})

test('farm_apply: a slot that has what compose renders only reloads; a leftover second web is removed first', () => {
  const h = host()
  try {
    const d = statefulDocker(h)
    mkdirSync(join(h.srv, '_demos', 'fpm'), { recursive: true })
    const hash = farmUpToDate(h).FAKE_FARM_HASH
    d.web('tracy-demos-web-a', { hash })
    d.web('tracy-demos-web-b', { ready: false, hash: 'half-started' })
    const r = apply(h)
    assert.equal(r.status, 0, r.stderr)
    const calls = h.called()
    assert.ok(!d.exists('tracy-demos-web-b'), 'the leftover of a switch that did not finish is gone')
    assert.match(r.stderr, /leftover of a switch that did not finish/)
    assert.ok(!calls.some((c) => / compose .* up -d --no-deps /.test(c)), 'no new slot')
    assert.ok(
      calls.some((c) => /^docker exec tracy-demos-web-a tracy-demos-reload$/.test(c)),
      'a graceful reload inside'
    )
  } finally {
    h.dispose()
  }
})

// ── an interrupted switch: settle retires a leftover slot the way a switch does, never kills it ──

/** What settle did to one container: the index of each call that matters, -1 when it never happened. */
const retireOrder = (calls, name) => {
  const at = (re) => calls.findIndex((c) => re.test(c))
  return {
    unready: at(new RegExp(`^docker exec ${name} rm -f /run/tracy-demos-ready/ok$`)),
    quiet: at(new RegExp(`^docker exec ${name} sh -c\\s*$`)),
    stop: at(new RegExp(`^docker stop -t 45 ${name}$`)),
    removed: at(new RegExp(`^docker rm -f ${name}$`))
  }
}
const settleCase = (name, { servingFile, serving, leftover, leftoverReady }) =>
  test(`settle after an interrupted switch (${name}): ${leftover} is withdrawn, waited for, stopped, removed; ${serving} keeps serving`, () => {
    const h = host()
    try {
      const d = statefulDocker(h)
      const hash = farmUpToDate(h).FAKE_FARM_HASH
      d.web(serving, { hash })
      d.web(leftover, { ready: leftoverReady, hash: 'half' })
      writeFileSync(join(h.srv, '_demos', '.active-web'), `${servingFile}\n`)
      const r = apply(h)
      assert.equal(r.status, 0, r.stderr)
      const calls = h.called()
      const o = retireOrder(calls, leftover)
      assert.ok(o.removed > o.stop && o.stop > o.quiet && o.quiet >= 0, JSON.stringify(o))
      if (leftoverReady)
        assert.ok(
          o.unready >= 0 && o.unready < o.quiet,
          `a ready leftover is withdrawn first: ${JSON.stringify(o)}`
        )
      else assert.equal(o.unready, -1, 'an unready leftover has nothing to withdraw')
      const s = retireOrder(calls, serving)
      assert.deepEqual(Object.values(s), [-1, -1, -1, -1], 'the serving slot is not touched')
      assert.ok(d.exists(serving) && !d.exists(leftover))
    } finally {
      h.dispose()
    }
  })

settleCase('cut after the new slot was marked ready, .active-web not yet written', {
  servingFile: 'tracy-demos-web-a',
  serving: 'tracy-demos-web-a',
  leftover: 'tracy-demos-web-b',
  leftoverReady: true
})
settleCase('cut after .active-web changed, the old slot not yet unready', {
  servingFile: 'tracy-demos-web-b',
  serving: 'tracy-demos-web-b',
  leftover: 'tracy-demos-web-a',
  leftoverReady: true
})
settleCase('cut after the old slot was made unready, before it stopped', {
  servingFile: 'tracy-demos-web-b',
  serving: 'tracy-demos-web-b',
  leftover: 'tracy-demos-web-a',
  leftoverReady: false
})
settleCase('cut while the new slot started, never ready', {
  servingFile: 'tracy-demos-web-a',
  serving: 'tracy-demos-web-a',
  leftover: 'tracy-demos-web-b',
  leftoverReady: false
})

test('farm_switch: the forwarders get time to start using the new slot BEFORE the old one is withdrawn', () => {
  const h = host()
  try {
    const d = statefulDocker(h)
    d.web('tracy-demos-web-a')
    mkdirSync(join(h.srv, '_demos'), { recursive: true })
    writeFileSync(join(h.srv, '_demos', '.active-web'), 'tracy-demos-web-a\n')
    // A sleep that only writes down how long it was asked to wait, so the order shows in the call log.
    writeFileSync(
      join(h.dir, 'bin', 'sleep'),
      '#!/usr/bin/env bash\nprintf \'sleep %s\\n\' "$*" >> "$CALLS"\n',
      {
        mode: 0o755
      }
    )
    const r = apply(h, { TRACY_FARM_UP_WAIT: '7', TRACY_FARM_DOWN_WAIT: '5' })
    assert.equal(r.status, 0, r.stderr)
    const calls = h.called()
    const at = (re) => calls.findIndex((c) => re.test(c))
    const ready = at(/^docker exec tracy-demos-web-b sh -c mkdir -p \/run\/tracy-demos-ready/)
    const up = at(/^sleep 7$/)
    const withdrawn = at(/^docker exec tracy-demos-web-a rm -f \/run\/tracy-demos-ready\/ok$/)
    const down = at(/^sleep 5$/)
    const stopped = at(/^docker stop -t 45 tracy-demos-web-a$/)
    assert.ok(
      ready >= 0 && up > ready && withdrawn > up && down > withdrawn && stopped > down,
      JSON.stringify({ ready, up, withdrawn, down, stopped })
    )
  } finally {
    h.dispose()
  }
})
