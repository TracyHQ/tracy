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
  "docker inspect -f") echo "\${FAKE_FARM_IP:-172.30.0.77}"; exit 0 ;;
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
    TRACY_TUNNEL: 'none'
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
exit 0
`,
      { mode: 0o755 }
    )
    const r = h.run([P('farm-release.sh'), LABEL, '--root', h.srv], { TRACY_EGRESS_FENCE: 'off' })
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
    assert.ok(!calls.some((c) => / (stop|down|restart) /.test(c)), 'the farm is never stopped')
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
      /docker exec -i -u 0 "\$TRACY_DEMOS_WEB_CONTAINER" php -n -- /
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
