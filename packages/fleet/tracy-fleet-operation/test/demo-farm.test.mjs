/**
 * The demo farm (scripts/lib/demo-farm.sh, lib/site-runtime.sh, provision/fold.sh, unfold.sh): what
 * is written for it, and the one way into a site whichever runtime serves it. Docker here is a shim
 * that records its argv; the real thing runs in test/e2e/demo-farm/run.sh.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/demo-farm.test.mjs
 */
import { composeIsForwarder } from '../../../../apps/tracy-host/src/webroot.js'
import { forwarderCompose } from './token-custody-cases.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))
const FARM_SITE_PHP = join(SCRIPTS, 'provision/farm-site.php')

/** A private root + sites root with one demo, a docker shim, and a bash runner over the libs. */
function host({ isolated = true, label = 'demo1', platform = 'joomla' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tracy-demo-farm-'))
  const srv = join(dir, 'srv')
  const site = join(srv, label)
  const bin = join(dir, 'bin')
  for (const d of [join(site, 'apache'), join(dir, 'sites', label, '.webroot'), bin])
    mkdirSync(d, { recursive: true })
  writeFileSync(
    join(site, '.env'),
    `HOST_PORT=52042\nPLATFORM=${platform}\nDB_PASSWORD=pw1\nTRACY_MAIL_TOKEN=tok1\n`
  )
  if (isolated) writeFileSync(join(site, 'network-isolated'), '')
  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env bash
{ printf 'MYSQL_PWD=%s ARGV' "\${MYSQL_PWD:-}"; printf ' [%s]' "$@"; printf '\\n'; } >> "$DOCKER_LOG"
case "$1 $2" in "network inspect") exit 1 ;; esac
exit 0
`
  )
  chmodSync(join(bin, 'docker'), 0o755)
  const log = join(dir, 'docker.log')
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    DOCKER_LOG: log,
    TRACY_PRIVATE_ROOT: srv,
    TRACY_SITES_ROOT: join(dir, 'sites'),
    TRACY_WEB_ENV_FILE: '/dev/null',
    TRACY_DEMOS_IMAGE: 'tracy/web-demos:test',
    SITE_DIR: site,
    LABEL: label,
    PLATFORM: platform,
    FLEET_ZONE: 'tracy.test'
  }
  const bash = (script, extra = {}) => {
    const r = spawnSync(
      'bash',
      [
        '-c',
        `set -euo pipefail; . "$S/lib/roots.sh"; . "$S/lib/site-apache-conf.sh"; . "$S/provision/render-compose.sh"; ${script}`
      ],
      { encoding: 'utf8', env: { ...env, S: SCRIPTS, ...extra } }
    )
    return r
  }
  const docker = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [])
  return { dir, srv, site, label, bash, docker, dispose: () => rmSync(dir, { recursive: true, force: true }) }
}

const ok = (r) => {
  assert.equal(r.status, 0, r.stderr)
  return r.stdout
}

// ── the marker ─────────────────────────────────────────────────────────────────────────────────

test('runtime: absent = site, `farm` = farm, anything else is refused', () => {
  const h = host()
  try {
    assert.equal(ok(h.bash('tracy_site_runtime demo1')).trim(), 'site')
    writeFileSync(join(h.site, 'runtime'), 'farm\n')
    assert.equal(ok(h.bash('tracy_site_runtime demo1')).trim(), 'farm')
    writeFileSync(join(h.site, 'runtime'), 'pool\n')
    const r = h.bash('tracy_site_runtime demo1')
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /refusing to guess/)
  } finally {
    h.dispose()
  }
})

// ── the exec helper ────────────────────────────────────────────────────────────────────────────

test('web exec: per site it is <label>-web-1 at /var/www/html, as every caller does today', () => {
  const h = host()
  try {
    ok(h.bash('tracy_site_web_exec demo1 -i -- php -v'))
    assert.deepEqual(h.docker(), [
      'MYSQL_PWD= ARGV [exec] [-i] [-u] [www-data] [-w] [/var/www/html] [demo1-web-1] [php] [-v]'
    ])
  } finally {
    h.dispose()
  }
})

test('web exec: in the farm it is tracy-demos-web, as the demo (its docroot, its pool env), never root', () => {
  const h = host()
  try {
    writeFileSync(join(h.site, 'runtime'), 'farm\n')
    mkdirSync(join(h.srv, '_demos', 'exec'), { recursive: true })
    writeFileSync(join(h.srv, '_demos', 'exec', 'demo1.env'), 'TRACY_MAIL_LABEL=demo1\n')
    ok(h.bash('tracy_site_web_exec demo1 -w /var/www/html/administrator -e A=1 -- ls'))
    assert.deepEqual(h.docker(), [
      `MYSQL_PWD= ARGV [exec] [-u] [www-data] [-w] [/site/demo1/.webroot/administrator] [--env-file] [${h.srv}/_demos/exec/demo1.env] [-e] [A=1] [tracy-demos-web] [ls]`
    ])
    for (const user of ['root', '0', '0:0']) {
      const r = h.bash(`tracy_site_web_exec demo1 -u ${user} -- id`)
      assert.notEqual(r.status, 0, user)
      assert.match(r.stderr, /reaches every demo/)
    }
    const outside = h.bash('tracy_site_web_exec demo1 -w /site/other/.webroot -- ls')
    assert.notEqual(outside.status, 0)
    assert.match(outside.stderr, /outside the demo's own folder/)
    assert.equal(h.docker().length, 1, 'nothing refused reached docker')
  } finally {
    h.dispose()
  }
})

test('db exec: root of <label>-db-1 per site, the demo user in the farm; the password never in argv', () => {
  const h = host()
  try {
    writeFileSync(
      join(h.site, 'docker-compose.yml'),
      'services:\n  db:\n    environment:\n      MARIADB_DATABASE: "site"\n'
    )
    ok(h.bash('tracy_site_db_exec demo1 -i mariadb -N -e "SELECT 1" site'))
    writeFileSync(join(h.site, 'runtime'), 'farm\n')
    writeFileSync(
      join(h.site, '.env'),
      'PLATFORM=joomla\nFARM_DB_NAME=d_demo1_x\nFARM_DB_USER=d_demo1_x\nFARM_DB_PASSWORD=fpw\n'
    )
    ok(h.bash('tracy_site_db_exec demo1 mariadb-dump d_demo1_x'))
    ok(h.bash('tracy_site_db_exec demo1 sh -c true'))
    const [site, farm, other] = h.docker()
    assert.equal(
      site,
      'MYSQL_PWD=pw1 ARGV [exec] [-i] [-e] [MYSQL_PWD] [-e] [TRACY_DB_NAME=site] [-e] [TRACY_DB_USER=root] [demo1-db-1] [mariadb] [-uroot] [-N] [-e] [SELECT 1] [site]'
    )
    assert.equal(
      farm,
      'MYSQL_PWD=fpw ARGV [exec] [-e] [MYSQL_PWD] [-e] [TRACY_DB_NAME=d_demo1_x] [-e] [TRACY_DB_USER=d_demo1_x] [tracy-demos-db] [mariadb-dump] [-ud_demo1_x] [d_demo1_x]'
    )
    assert.match(other, /\[tracy-demos-db\] \[sh\] \[-c\] \[true\]$/, 'a non-client command gets no -u')
    assert.equal(ok(h.bash('tracy_site_db_name demo1')).trim(), 'd_demo1_x')
  } finally {
    h.dispose()
  }
})

// ── what is rendered ───────────────────────────────────────────────────────────────────────────

test('db ident: readable, at most 51 characters, distinct for labels that sanitize alike', () => {
  const h = host()
  try {
    const a = ok(h.bash('tracy_farm_db_ident a-b'))
    const b = ok(h.bash('tracy_farm_db_ident a_b'))
    const long = ok(h.bash(`tracy_farm_db_ident ${'x'.repeat(80)}`))
    assert.match(a, /^d_a_b_[0-9a-f]{8}$/)
    assert.notEqual(a, b)
    assert.ok(long.length <= 51, long)
  } finally {
    h.dispose()
  }
})

test('vhost: its own port, its docroot, AllowOverride All, its noindex conf included, PHP to its own pool', () => {
  const h = host()
  try {
    ok(h.bash('tracy_write_apache_conf "$SITE_DIR" on'))
    const vhost = ok(h.bash('tracy_farm_render_vhost demo1 52042'))
    assert.match(vhost, /^Listen 52042$/m)
    assert.match(vhost, /^<VirtualHost \*:52042>$/m)
    assert.match(vhost, /DocumentRoot \/site\/demo1\/\.webroot\n/)
    assert.match(vhost, /<Directory \/site\/demo1\/\.webroot>[\s\S]*AllowOverride All[\s\S]*<\/Directory>/)
    // The trailing-slash redirect of tracy-noindex.conf's `<Directory /var/www/html>`, said again for the farm docroot.
    assert.match(
      vhost,
      /<Directory \/site\/demo1\/\.webroot>[\s\S]*RewriteRule \^ https:\/\/%\{HTTP_HOST\}%\{REQUEST_URI\}\/ \[R=301,L\][\s\S]*<\/Directory>/
    )
    assert.match(
      vhost,
      /SetHandler "proxy:unix:\/run\/tracy-demos\/demo1\.sock\|fcgi:\/\/tracy-demo-demo1\/"/
    )
    assert.match(vhost, /Include \/etc\/tracy-demos\/site-apache\/demo1\/tracy-noindex\.conf/)
    // A literal $1, not the shell's first argument (the bug the e2e caught: SERVER_PORT became the label).
    assert.match(vhost, /SetEnvIf Host ":\(\[0-9\]\+\)\$" TRACY_SERVER_PORT=\$1$/m)
    assert.doesNotMatch(vhost, /TRACY_SERVER_PORT=demo1/)
    for (const bad of ['8080', '0', 'abc', '70000'])
      assert.notEqual(h.bash(`tracy_farm_render_vhost demo1 ${bad}`).status, 0, bad)
  } finally {
    h.dispose()
  }
})

test('vhost: refused without the demo noindex conf (its headers and frame policy would be lost)', () => {
  const h = host()
  try {
    const r = h.bash('tracy_farm_render_vhost demo1 52042')
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /frame policy would be lost/)
  } finally {
    h.dispose()
  }
})

test('pool: ondemand, 4 children, 20 s idle, open_basedir on its own folders, its own env', () => {
  const h = host()
  try {
    mkdirSync(join(h.site, 'farm'))
    writeFileSync(
      join(h.site, 'farm', 'pool.env'),
      'WORDPRESS_DB_HOST=tracy-demos-db\nWORDPRESS_TABLE_PREFIX=tr_\n'
    )
    const pool = ok(
      h.bash('tracy_farm_render_pool demo1', { TRACY_MAIL_URL: 'http://172.30.0.10:8080/_site-mail' })
    )
    for (const line of [
      '[demo1]',
      'pm = ondemand',
      'pm.max_children = 4',
      'pm.process_idle_timeout = 20s',
      'listen = /run/tracy-demos/demo1.sock',
      'clear_env = yes',
      'security.limit_extensions = .php',
      'php_admin_value[open_basedir] = /site/demo1/.webroot/:/run/tracy-access/demo1/:/tmp/tracy-demos/demo1/',
      'env[TRACY_MAIL_URL] = "http://172.30.0.10:8080/_site-mail"',
      'env[TRACY_MAIL_LABEL] = "demo1"',
      'env[TRACY_MAIL_TOKEN] = "tok1"',
      'env[TRACY_ACCESS_KEY_FILE] = "/run/tracy-access/demo1/key.json"',
      'env[WORDPRESS_TABLE_PREFIX] = "tr_"'
    ])
      assert.ok(pool.split('\n').includes(line), `missing: ${line}`)
    const execEnv = ok(h.bash('tracy_farm_render_exec_env demo1', { TRACY_MAIL_URL: 'http://x/_site-mail' }))
    assert.match(execEnv, /^TRACY_MAIL_LABEL=demo1$/m)
    assert.match(execEnv, /^WORDPRESS_DB_HOST=tracy-demos-db$/m)
  } finally {
    h.dispose()
  }
})

test('pool: a value it could not write safely refuses the whole pool', () => {
  const h = host()
  try {
    mkdirSync(join(h.site, 'farm'))
    for (const bad of ['a"b', 'a${X}', 'a;b', 'a\\b']) {
      writeFileSync(join(h.site, 'farm', 'pool.env'), `WORDPRESS_CONFIG_EXTRA=${bad}\n`)
      const r = h.bash('tracy_farm_render_pool demo1')
      assert.notEqual(r.status, 0, bad)
    }
  } finally {
    h.dispose()
  }
})

test('farm compose: mounts the members and nothing else; its database is internal to the farm', () => {
  const h = host()
  try {
    let compose = ok(h.bash('tracy_farm_render_compose', { TRACY_DEMOS_MAIL_NETWORK: '' }))
    assert.doesNotMatch(compose, /\/site\/demo1/, 'a label that is not a member is not mounted')
    mkdirSync(join(h.srv, '_demos', 'fpm'), { recursive: true })
    writeFileSync(join(h.srv, '_demos', 'fpm', 'demo1.conf'), '[demo1]\n')
    compose = ok(h.bash('tracy_farm_render_compose', { TRACY_DEMOS_MAIL_NETWORK: '' }))
    assert.match(compose, /^name: tracy-demos$/m)
    assert.match(compose, /container_name: tracy-demos-web/)
    assert.match(compose, /container_name: tracy-demos-db/)
    assert.match(
      compose,
      /tmpfs:\n {6}- \/var\/www\/html:ro,size=1m\n/,
      'no anonymous volume for the base image VOLUME'
    )
    assert.match(compose, /image: tracy\/web-demos:test/)
    assert.ok(compose.includes(`      - ${h.dir}/sites/demo1:/site/demo1\n`))
    assert.ok(compose.includes(`      - ${h.dir}/sites/demo1/.webroot:/site/demo1/.webroot\n`))
    assert.ok(compose.includes(`      - ${h.site}/apache:/etc/tracy-demos/site-apache/demo1:ro\n`))
    assert.doesNotMatch(compose, /\/run\/tracy-access\/demo1/, 'no access key yet, no mount')
    assert.doesNotMatch(
      compose,
      /tracy-sites|\/srv\/tracy-sites:|- [^\n]*\/sites:/,
      'never the whole sites root'
    )
    for (const flag of [
      '--sql-mode=NO_ENGINE_SUBSTITUTION',
      '--max-allowed-packet=256M',
      '--innodb-buffer-pool-size=256M'
    ])
      assert.ok(compose.includes(`      - ${flag}\n`), flag)
    assert.match(compose, /back:\n {4}name: tracy-demos-back\n {4}internal: true/)
    assert.match(compose, /demos-db:[\s\S]*networks: \[back\]/)
    mkdirSync(join(h.srv, '.site-access', 'demo1'), { recursive: true })
    writeFileSync(join(h.srv, '.site-access', 'demo1', 'key.json'), '{}')
    compose = ok(h.bash('tracy_farm_render_compose', { TRACY_DEMOS_MAIL_NETWORK: 'tracy_tracy' }))
    assert.ok(compose.includes(`      - ${h.srv}/.site-access/demo1:/run/tracy-access/demo1:ro\n`))
    assert.match(compose, /networks: \[front, back, mail\]/)
    assert.match(compose, /mail:\n {4}external: true\n {4}name: tracy_tracy/)
  } finally {
    h.dispose()
  }
})

test('forwarder: a farm-marked demo renders <label>-web-1 as a forwarder on the same names, and no db', () => {
  for (const isolated of [true, false]) {
    const h = host({ isolated })
    try {
      writeFileSync(join(h.site, 'runtime'), 'farm\n')
      ok(
        h.bash('tracy_render_compose', {
          WEB_IMAGE: 'tracy/web-joomla:test',
          COMPOSE_FLAVOR: 'fresh',
          DB_NAME: 'site',
          DB_SQL_MODE: ''
        })
      )
      const compose = readFileSync(join(h.site, 'docker-compose.yml'), 'utf8')
      assert.match(compose, /^ {2}web:\n {4}image: haproxy:3\.0-alpine@sha256:/m)
      assert.match(
        compose,
        /entrypoint: \["haproxy", "-db", "-f", "\/usr\/local\/etc\/haproxy\/haproxy\.cfg"\]/
      )
      assert.match(compose, /tracy\.runtime: farm/)
      assert.ok(compose.includes('"127.0.0.1:${HOST_PORT:?'), 'still publishes 127.0.0.1:<HOST_PORT>')
      assert.match(compose, /TRACY_DEMO_PORT: "\$\{HOST_PORT:\?/)
      assert.ok(
        compose.includes(
          `      - ${h.srv}/_demos/forward.haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro\n`
        )
      )
      assert.doesNotMatch(compose, /^ {2}db:/m, 'no db service')
      assert.doesNotMatch(compose, /^volumes:/m)
      assert.match(compose, /default:\n {4}external: true\n {4}name: demo1_default/)
      assert.match(compose, /farm:\n {4}external: true\n {4}name: tracy-demos-front/)
      if (isolated) assert.doesNotMatch(compose, /^ {6}tracy:/m)
      else assert.match(compose, /^ {6}tracy: \{\}$/m)
      // The custody matchers' fixture IS this generator's output (comments and blank lines aside),
      // and both matchers recognise the real thing.
      const bare = (t) => t.split('\n').filter((l) => !/^ *$/.test(l) && !/^ *#/.test(l))
      assert.deepEqual(
        bare(compose),
        bare(forwarderCompose(h.site, { shared: !isolated, farmDir: `${h.srv}/_demos` }))
      )
      assert.ok(composeIsForwarder(compose, 'demo1'), 'webroot.js composeIsForwarder')
    } finally {
      h.dispose()
    }
  }
})

test('forwarder: re-rendering a folded demo by hand reads its facts from the kept per-site compose', () => {
  const h = host()
  try {
    ok(
      h.bash('tracy_render_compose', {
        WEB_IMAGE: 'tracy/web-joomla:6-apache-20261027-r1',
        COMPOSE_FLAVOR: 'fresh',
        DB_NAME: 'site',
        DB_SQL_MODE: 'NO_ENGINE_SUBSTITUTION'
      })
    )
    mkdirSync(join(h.site, 'farm'))
    writeFileSync(
      join(h.site, 'farm', 'per-demo.compose.yml'),
      readFileSync(join(h.site, 'docker-compose.yml'))
    )
    writeFileSync(join(h.site, 'runtime'), 'farm\n')
    const r = spawnSync(
      'bash',
      [join(SCRIPTS, 'provision/render-compose.sh'), 'demo1', '--root', h.srv, '--no-image-check'],
      {
        encoding: 'utf8',
        env: { ...process.env, TRACY_SITES_ROOT: join(h.dir, 'sites'), TRACY_WEB_ENV_FILE: '/dev/null' }
      }
    )
    assert.equal(r.status, 0, r.stderr)
    const compose = readFileSync(join(h.site, 'docker-compose.yml'), 'utf8')
    assert.match(compose, /tracy\.runtime: farm/, 'stays a forwarder')
    assert.match(r.stdout, /joomla\/fresh/)
  } finally {
    h.dispose()
  }
})

test('the farm is never a runtime for EmDash', () => {
  const h = host({ platform: 'emdash' })
  try {
    writeFileSync(join(h.site, 'runtime'), 'farm\n')
    const r = h.bash('tracy_render_compose', { WEB_IMAGE: 'tracy/web-emdash:x', COMPOSE_FLAVOR: 'fresh' })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /no demo farm runtime for emdash/)
  } finally {
    h.dispose()
  }
})

test('forwarder config: TCP to the demo own farm listener, re-resolving the farm', () => {
  const h = host()
  try {
    const cfg = ok(h.bash('tracy_farm_forward_cfg'))
    assert.match(cfg, /mode tcp/)
    assert.match(cfg, /bind :80/)
    assert.match(cfg, /server farm "tracy-demos-web:\$\{TRACY_DEMO_PORT\}" resolvers docker/)
    assert.match(cfg, /nameserver dns 127\.0\.0\.11:53/)
  } finally {
    h.dispose()
  }
})

// ── fold / unfold refusals ─────────────────────────────────────────────────────────────────────

test('fold refuses a customer site, an EmDash site, and a label it cannot find — before touching docker', () => {
  for (const [platform, demo, want] of [
    ['joomla', false, /not a demo/],
    ['emdash', true, /only Joomla and WordPress demos fold/]
  ]) {
    const h = host({ platform })
    try {
      if (demo) ok(h.bash('tracy_write_demo_limits "$SITE_DIR" on'))
      const r = spawnSync('bash', [join(SCRIPTS, 'provision/fold.sh'), 'demo1', '--root', h.srv], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${h.dir}/bin:${process.env.PATH}`,
          DOCKER_LOG: join(h.dir, 'docker.log'),
          TRACY_SITES_ROOT: join(h.dir, 'sites')
        }
      })
      assert.equal(r.status, 2, r.stderr)
      assert.match(r.stderr, want)
      assert.deepEqual(h.docker(), [])
    } finally {
      h.dispose()
    }
  }
  const h = host()
  try {
    const r = spawnSync('bash', [join(SCRIPTS, 'provision/fold.sh'), 'nosuch', '--root', h.srv], {
      encoding: 'utf8'
    })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /no such site/)
  } finally {
    h.dispose()
  }
})

test('unfold of a demo that is not in the farm changes nothing', () => {
  const h = host()
  try {
    const r = spawnSync('bash', [join(SCRIPTS, 'provision/unfold.sh'), 'demo1', '--root', h.srv], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${h.dir}/bin:${process.env.PATH}`,
        DOCKER_LOG: join(h.dir, 'docker.log'),
        TRACY_SITES_ROOT: join(h.dir, 'sites')
      }
    })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /not in the demo farm — nothing to do/)
    assert.deepEqual(h.docker(), [])
  } finally {
    h.dispose()
  }
})

// ── farm-site.php: the webroot half ────────────────────────────────────────────────────────────

const HAS_PHP = spawnSync('php', ['-r', 'exit(PHP_VERSION_ID >= 80100 ? 0 : 1);']).status === 0
function php(cwd, args, env = {}) {
  return spawnSync('php', ['--', ...args], {
    cwd,
    input: readFileSync(FARM_SITE_PHP),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

test('farm-site.php: Joomla config read and rewritten in place, read-only mode kept', {
  skip: !HAS_PHP && 'no php ≥ 8.1'
}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'tracy-farm-php-'))
  try {
    const cfg = join(dir, 'configuration.php')
    writeFileSync(
      cfg,
      "<?php\nclass JConfig {\n\tpublic $host = 'db';\n\tpublic $user = 'root';\n\tpublic $password = 'p\\'w';\n\tpublic $db = 'site';\n\tpublic $log_path = '/var/www/html/administrator/logs';\n\tpublic $tmp_path = '/var/www/html/tmp';\n}\n"
    )
    chmodSync(cfg, 0o444)
    const got = php(dir, ['config-get', 'joomla'])
    assert.equal(got.status, 0, got.stderr)
    assert.match(got.stdout, /^password=p'w$/m)
    assert.match(got.stdout, /^host=db$/m)
    const set = php(dir, ['config-set', 'joomla'], {
      FARM_SET_host: 'tracy-demos-db',
      FARM_SET_password: "x'y"
    })
    assert.equal(set.status, 0, set.stderr)
    const after = php(dir, ['config-get', 'joomla'])
    assert.match(after.stdout, /^host=tracy-demos-db$/m)
    assert.match(after.stdout, /^password=x'y$/m)
    assert.match(after.stdout, /^user=root$/m, 'what was not given stays')
    assert.equal(spawnSync('php', ['-l', cfg]).status, 0)
    assert.equal(spawnSync('stat', ['-c', '%a', cfg], { encoding: 'utf8' }).stdout.trim(), '444')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('farm-site.php: WordPress literal vs the official image env form', {
  skip: !HAS_PHP && 'no php ≥ 8.1'
}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'tracy-farm-php-'))
  try {
    writeFileSync(
      join(dir, 'wp-config.php'),
      "<?php\ndefine( 'DB_NAME', getenv_docker('WORDPRESS_DB_NAME', 'wordpress') );\ndefine( 'DB_USER', getenv_docker('WORDPRESS_DB_USER', 'example username') );\ndefine( 'DB_PASSWORD', getenv_docker('WORDPRESS_DB_PASSWORD', 'example password') );\ndefine( 'DB_HOST', getenv_docker('WORDPRESS_DB_HOST', 'mysql') );\n"
    )
    assert.match(php(dir, ['config-get', 'wordpress']).stdout, /^form=env$/m)
    assert.notEqual(
      php(dir, ['config-set', 'wordpress'], { FARM_SET_DB_HOST: 'x' }).status,
      0,
      'an env form is not rewritten'
    )
    writeFileSync(
      join(dir, 'wp-config.php'),
      "<?php\ndefine('DB_NAME', 'site');\ndefine('DB_USER', 'root');\ndefine('DB_PASSWORD', 'pw');\ndefine('DB_HOST', 'db');\n"
    )
    assert.match(php(dir, ['config-get', 'wordpress']).stdout, /^form=literal$/m)
    assert.equal(
      php(dir, ['config-set', 'wordpress'], { FARM_SET_DB_HOST: 'tracy-demos-db', FARM_SET_DB_NAME: 'd_x' })
        .status,
      0
    )
    const after = readFileSync(join(dir, 'wp-config.php'), 'utf8')
    assert.match(after, /define\('DB_HOST', 'tracy-demos-db'\);/)
    assert.match(after, /define\('DB_NAME', 'd_x'\);/)
    assert.match(after, /define\('DB_USER', 'root'\);/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('farm-site.php: .htaccess php_value/php_flag become .user.ini settings, and come back exactly', {
  skip: !HAS_PHP && 'no php ≥ 8.1'
}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'tracy-farm-php-'))
  try {
    mkdirSync(join(dir, 'sub'))
    mkdirSync(join(dir, 'images'))
    const root =
      'RewriteEngine On\nphp_value upload_max_filesize 64M\n<IfModule mod_php7.c>\nphp_flag display_errors on\n</IfModule>\n<IfModule mod_php.c>\n  php_value memory_limit "256M"\n</IfModule>\n'
    const sub = 'php_flag engine off\n'
    writeFileSync(join(dir, '.htaccess'), root)
    writeFileSync(join(dir, 'sub', '.htaccess'), sub)
    writeFileSync(join(dir, 'sub', '.user.ini'), 'max_execution_time = 60\n')
    writeFileSync(join(dir, 'images', '.htaccess'), 'Require all denied\n')
    assert.equal(php(dir, ['htaccess-farm']).status, 0)
    assert.equal(php(dir, ['htaccess-farm']).status, 0, 'a second run changes nothing')
    const ht = readFileSync(join(dir, '.htaccess'), 'utf8')
    assert.match(ht, /^#tracy-farm# php_value upload_max_filesize 64M$/m, 'a bare line is commented')
    assert.match(
      ht,
      /^ {2}php_value memory_limit "256M"$/m,
      'a guarded line is left (already inert without mod_php)'
    )
    assert.match(ht, /^php_flag display_errors on$/m, 'a php7 guard was dead under mod_php 8 and stays so')
    const ini = readFileSync(join(dir, '.user.ini'), 'utf8')
    assert.match(ini, /^upload_max_filesize = 64M$/m)
    assert.match(ini, /^memory_limit = 256M$/m)
    assert.doesNotMatch(ini, /display_errors/)
    assert.equal(ini.match(/tracy-farm begin/g).length, 1)
    assert.match(
      readFileSync(join(dir, 'sub', '.user.ini'), 'utf8'),
      /^max_execution_time = 60\n[\s\S]*^engine = Off$/m
    )
    assert.equal(
      existsSync(join(dir, 'images', '.user.ini')),
      false,
      'a folder without php lines gets nothing'
    )
    assert.equal(php(dir, ['htaccess-unfarm']).status, 0)
    assert.equal(readFileSync(join(dir, '.htaccess'), 'utf8'), root)
    assert.equal(readFileSync(join(dir, 'sub', '.htaccess'), 'utf8'), sub)
    assert.equal(readFileSync(join(dir, 'sub', '.user.ini'), 'utf8'), 'max_execution_time = 60\n')
    assert.equal(existsSync(join(dir, '.user.ini')), false, 'a .user.ini it created is removed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('heredocs: the pool and the farm compose render with no command run on the host, comments intact', () => {
  const h = host()
  try {
    mkdirSync(join(h.srv, '_demos', 'fpm'), { recursive: true })
    writeFileSync(join(h.srv, '_demos', 'fpm', 'demo1.conf'), '[demo1]\n')
    const pool = h.bash('tracy_farm_render_pool demo1', {
      TRACY_MAIL_URL: 'http://172.30.0.10:8080/_site-mail'
    })
    assert.equal(pool.status, 0, pool.stderr)
    assert.equal(pool.stderr, '')
    assert.ok(pool.stdout.includes('(Apache hands it `.php` files alone)'), 'pool comment intact')
    const compose = h.bash('tracy_farm_render_compose', { TRACY_DEMOS_MAIL_NETWORK: '' })
    assert.equal(compose.status, 0, compose.stderr)
    assert.equal(compose.stderr, '')
    assert.ok(compose.stdout.includes('(a `compose run` config test too)'), 'compose comment intact')
  } finally {
    h.dispose()
  }
})
