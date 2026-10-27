#!/usr/bin/env node
/**
 * The one place a site's docker-compose.yml is written.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/render-compose.test.mjs
 *
 * These tests pin what a compose file must carry now that the site's web container is also the
 * agent's shell (Plan 3): the two mounts that put the site folder at the same path everywhere, and
 * a web image that has the agent's tools in it. Both fail SILENTLY if they drift — a site with the
 * mounts missing serves its customers perfectly and hands its agent an empty directory, and a site
 * on an upstream image answers every page while its grep tool dies with ENOENT.
 *
 * The renderer is driven the way a migration drives it: against a site directory on disk, with no
 * docker and no fleet. `--no-image-check` is passed because the images are built on the host and
 * their absence here says nothing.
 */

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { classifyTokenMount, siteShape } from '../../../../apps/tracy-host/src/webroot.js'
import { buildCandidateText } from '../scripts/provision/emdash/migrate-token-mount.mjs'
import {
  DEFAULT_LIMITS,
  DEFAULT_MAIL_URL,
  LABELS,
  TOKEN_BIND,
  emdashCompose,
  phpCompose,
  webDnsAlias
} from './token-custody-cases.mjs'
// The canonical DNS-name deriver the renderer must agree with byte-for-byte (issue #165). A test
// crossing the app boundary is fine — nothing here ships — and it is the strongest parity guard: if
// either side changes its hash length or input, the alias in the rendered compose stops matching.
import { webDnsName } from '../../../../apps/tracy-web/src/sites/label.js'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/render-compose.sh', import.meta.url))
const TAGS = readFileSync(fileURLToPath(new URL('../web/IMAGE_TAGS', import.meta.url)), 'utf8')

/** The image IMAGE_TAGS names for a key — the test reads the same file the renderer does. */
function taggedImage(key) {
  const line = TAGS.split('\n').find((row) => row.startsWith(`${key}=`))
  assert.ok(line, `web/IMAGE_TAGS has no line for ${key}`)
  return line.slice(key.length + 1)
}

/** A site directory as provision leaves one: an .env, and whatever compose file is given. */
function makeSite(label, { env, compose }) {
  const root = mkdtempSync(path.join(tmpdir(), 'render-compose-'))
  const dir = path.join(root, label)
  mkdirSync(path.join(dir, 'webroot'), { recursive: true })
  mkdirSync(path.join(dir, 'site'), { recursive: true })
  writeFileSync(path.join(dir, '.env'), env)
  if (compose) writeFileSync(path.join(dir, 'docker-compose.yml'), compose)
  return { root, dir }
}

function render(root, label, extra = [], env = {}) {
  return execFileSync('bash', [SCRIPT, label, '--root', root, '--no-image-check', ...extra], {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

const CLONE_COMPOSE = `services:
  db:
    image: mariadb:11
    command:
      - --sql-mode=NO_ENGINE_SUBSTITUTION
    environment:
      MARIADB_DATABASE: "wordpress"

  web:
    image: wordpress:php8.3-apache
    entrypoint: ["apache2-foreground"]
    volumes:
      - ./webroot:/var/www/html
    ports:
      - "127.0.0.1:\${HOST_PORT:-8080}:80"

volumes:
  db:
`

test('a restored WordPress site: both site mounts, and the image with the tools in it', () => {
  const { root, dir } = makeSite('wpclone', {
    env: 'HOST_PORT=8081\nPLATFORM=wordpress\nDB_PASSWORD=secret\n',
    compose: CLONE_COMPOSE
  })
  render(root, 'wpclone')
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  // Absolute, under TRACY_SITES_ROOT (default /srv/tracy-sites, unset in this test) — not the old
  // `./site` / `./webroot` relative to the compose file's own directory (Plan 3 Task 2).
  assert.match(out, /- \/srv\/tracy-sites\/wpclone:\/site\/wpclone$/m)
  assert.match(out, /- \/srv\/tracy-sites\/wpclone\/\.webroot:\/site\/wpclone\/\.webroot$/m)
  assert.ok(out.includes(`image: ${taggedImage('wordpress:php8.3-apache')}`), out)
  // The parts of the old shape that must survive a re-render: the entrypoint override (the image
  // would otherwise install a WordPress over the customer's), the site's own database name and
  // sql-mode, and the port that its tunnel ingress names.
  assert.match(out, /entrypoint: \["apache2-foreground"\]/)
  assert.match(out, /MARIADB_DATABASE: "wordpress"/)
  assert.match(out, /--sql-mode=NO_ENGINE_SUBSTITUTION/)
  // `:?` and not `:-8080`: a site whose .env lost HOST_PORT must refuse to come up, not land on a
  // default port. 8080 was never neutral — it is one port away from the pool provision.sh hands
  // sites from, and on production it is exactly the kind of port something else already holds.
  assert.match(out, /127\.0\.0\.1:\$\{HOST_PORT:\?[^}]+\}:80/)
  assert.ok(!out.includes('HOST_PORT:-'), 'no port default may survive a re-render')
  // The password stays in .env, which is 0600; the compose file is not.
  assert.ok(!out.includes('secret'), 'the database password must not be written into compose')
})

test('a fleet-born Joomla keeps its installer environment and its extension list', () => {
  const compose = `services:
  db:
    image: mariadb:11
    command:
      - --sql-mode=
    environment:
      MARIADB_DATABASE: "joomla"

  web:
    image: joomla:6-apache
    environment:
      JOOMLA_DB_HOST: db
      JOOMLA_EXTENSIONS_URLS: "https://example.com/cowork.zip"
    volumes:
      - ./webroot:/var/www/html
`
  const { root, dir } = makeSite('jfresh', {
    env: 'HOST_PORT=8082\nPLATFORM=joomla\nDB_PASSWORD=secret\nJOOMLA_ADMIN_PASSWORD=x\n',
    compose
  })
  render(root, 'jfresh')
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  assert.match(out, /- \/srv\/tracy-sites\/jfresh:\/site\/jfresh$/m)
  assert.match(out, /- \/srv\/tracy-sites\/jfresh\/\.webroot:\/site\/jfresh\/\.webroot$/m)
  assert.ok(out.includes(`image: ${taggedImage('joomla:6-apache')}`), out)
  assert.match(out, /JOOMLA_DB_HOST: db/)
  assert.match(out, /JOOMLA_EXTENSIONS_URLS: "https:\/\/example\.com\/cowork\.zip"/)
  // A fleet-born site must NOT get the clone's entrypoint override: the installer is the point.
  assert.ok(!out.includes('apache2-foreground'), out)
})

test('an EmDash site mounts data and uploads where a webroot would be', () => {
  const compose = `services:
  web:
    image: tracy/emdash:0.34.0
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    ports:
      - "127.0.0.1:\${HOST_PORT:-8080}:4321"
`
  const { root, dir } = makeSite('emd', {
    env: 'HOST_PORT=8083\nPLATFORM=emdash\n',
    compose
  })
  mkdirSync(path.join(dir, 'data'), { recursive: true })
  render(root, 'emd')
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  // The site mount moves under TRACY_SITES_ROOT like every other platform's. data/ and uploads/
  // stay where platform/emdash.sh's own mkdir puts them — the PRIVATE root, i.e. this site's own
  // directory (`dir`) — only their container target sits under `.webroot`.
  assert.match(out, /- \/srv\/tracy-sites\/emd:\/site\/emd$/m)
  assert.ok(out.includes(`- ${dir}/data:/site/emd/.webroot/data`), out)
  assert.ok(out.includes(`- ${dir}/uploads:/site/emd/.webroot/uploads`), out)
  // Its own version, carried across: the web image is the same EmDash with the agent's tools on it.
  assert.match(out, /image: tracy\/web-emdash:0\.34\.0/)
  // No database service — EmDash keeps its site in a file inside the site dir.
  assert.ok(!out.includes('mariadb'), out)
  // The application is the site's own volume, filled from the image once: the owner's edits to
  // the code survive a recreate, and data/ and uploads/ still sit under it as bind mounts.
  assert.ok(out.includes('      - app:/app\n      - ./data:/app/data'), out)
  assert.match(out, /^volumes:\n  app:$/m)
  // 🔒 The agent PAT (#155) is mounted READ-ONLY, at /run — OUTSIDE /app and /app/data, the two
  // agent-writable binds — so the container's own www-data agent shell can neither read nor replace
  // it; only a root exec (the MCP transport) reads it. A regression that dropped `:ro`, or moved it
  // under /app*, would silently hand the site's write key to its own agent shell.
  assert.match(out, /^ {6}- \.\/tracy-agent\.token:\/run\/tracy-agent\.token:ro$/m, out)
  assert.ok(!out.includes('tracy-agent.token:/app'), out)
  // The EmDash middleware turns TRACY_FRAME_ANCESTORS into a `frame-ancestors` CSP, which is what
  // lets a demo be shown in the Design inspiration preview iframe. The compose reads it from the
  // site's .env with an empty default, so a customer EmDash site (whose .env never sets the value)
  // stays unframeable — only a demo provision writes the value into .env.
  assert.match(out, /^ {6}TRACY_FRAME_ANCESTORS: "\$\{TRACY_FRAME_ANCESTORS:-\}"$/m, out)
})

// 🔒 The EmDash token comment lives inside an UNQUOTED `<<COMPOSE` heredoc, so any backtick in it
// is command substitution the shell runs at render time. It once carried `docker exec` and
// `compose up` in backticks: rendering fired `compose up` — "compose: command not found" onto
// stderr (parent's line-345) — while the file still rendered, so all 62 suites stayed green and
// only stderr told. This proves the render runs NO command out of its own comments, and that the
// explanation survives as plain text rather than being deleted with the backticks.
test('rendering EmDash runs no shell command from its comments, and emits no command-not-found', () => {
  const compose = `services:
  web:
    image: tracy/emdash:0.34.0
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
`
  const { root, dir } = makeSite('emdcmd', {
    env: 'HOST_PORT=8091\nPLATFORM=emdash\n',
    compose
  })
  mkdirSync(path.join(dir, 'data'), { recursive: true })
  const res = spawnSync('bash', [SCRIPT, 'emdcmd', '--root', root, '--no-image-check'], {
    encoding: 'utf8',
    env: { ...process.env }
  })
  assert.equal(res.status, 0, res.stderr)
  // The tell of a comment word-splitting into a command: any of these on stderr means a backtick
  // (or bare command) in an unquoted heredoc fired at render time.
  assert.doesNotMatch(res.stderr, /command not found/, res.stderr)
  assert.doesNotMatch(res.stderr, /\b(compose|docker|exec):/, res.stderr)
  // The words are still in the rendered YAML comment — as plain text, not run.
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  assert.match(out, /only a root docker exec — the site-tools MCP transport — reads it/, out)
  // Had `compose up` been a live substitution it would have expanded to empty — "BEFORE , so".
  assert.match(out, /a regular root:0600 file BEFORE compose up, so/, out)
})

test('a non-EmDash site never gets TRACY_FRAME_ANCESTORS — a customer site must not be frameable', () => {
  const { root, dir } = makeSite('wpnoframe', {
    env: 'HOST_PORT=8090\nPLATFORM=wordpress\nDB_PASSWORD=secret\n',
    compose: CLONE_COMPOSE
  })
  render(root, 'wpnoframe')
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  // Only EmDash reads TRACY_FRAME_ANCESTORS, and framing is a demo affordance, never a customer
  // one: the WordPress/Joomla shapes must not carry the variable at all.
  assert.ok(!out.includes('TRACY_FRAME_ANCESTORS'), out)
})

test('re-rendering a site twice writes the same file — a migration may run it on a live site', () => {
  const { root, dir } = makeSite('again', {
    env: 'HOST_PORT=8084\nPLATFORM=wordpress\nDB_PASSWORD=secret\n',
    compose: CLONE_COMPOSE
  })
  render(root, 'again')
  const first = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  render(root, 'again')
  assert.equal(readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8'), first)
  // And the second run must not walk the image back to the upstream one it started from.
  assert.ok(first.includes(`image: ${taggedImage('wordpress:php8.3-apache')}`))
})

test('a PHP site whose .env has no password is refused, not written', () => {
  const { root, dir } = makeSite('nopass', {
    env: 'HOST_PORT=8085\nPLATFORM=wordpress\n',
    compose: CLONE_COMPOSE
  })
  assert.throws(() => render(root, 'nopass'))
  // The site keeps the compose file it had: a refusal must not leave half a stack behind.
  assert.equal(readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8'), CLONE_COMPOSE)
})

test('a site with no compose file is refused rather than guessed at', () => {
  const { root } = makeSite('bare', {
    env: 'HOST_PORT=8086\nPLATFORM=wordpress\nDB_PASSWORD=secret\n'
  })
  assert.throws(() => render(root, 'bare'), /flavor/)
  // With the missing facts supplied — the flavour, and the database name and sql-mode that would
  // have come off the old file — it renders. So the refusal is about what it does not know, and
  // never about a shape it could not write.
  const out = render(root, 'bare', ['--flavor', 'clone'], {
    DB_NAME: 'wordpress',
    DB_SQL_MODE: ''
  })
  assert.match(out, /rendered/)
})

// ── the PHP a site is already running is not ours to move ────────────────────────────────
//
// The image line is the site's PHP. A resolver that falls from `wordpress:php8.2-apache` to the
// platform's default line moves a site from 8.2 to 8.3 while writing a compose file that says
// nothing about it — and a site pinned to 8.2 is usually pinned because something is fatal on 8.3.
// These four are the tests that would have caught that.

/** The resolver on its own, in the stance provision uses for a NEW site (warn, keep the base). */
function resolve(platform, base, env = {}) {
  return execFileSync(
    'bash',
    [
      '-c',
      '. "$1"; tracy_web_image "$2" "$3"',
      '_',
      fileURLToPath(new URL('../scripts/lib/web-image.sh', import.meta.url)),
      platform,
      base
    ],
    { encoding: 'utf8', env: { ...process.env, TRACY_WEB_IMAGE_CHECK: '0', ...env } }
  ).trim()
}

test('a base tag IMAGE_TAGS does not list keeps its own PHP — never the platform default', () => {
  // Lenient stance (a new site being provisioned): the site stays on exactly the image it named.
  assert.equal(resolve('wordpress', 'wordpress:php7.4-apache'), 'wordpress:php7.4-apache')
  assert.notEqual(resolve('wordpress', 'wordpress:php7.4-apache'), taggedImage('wordpress'))
})

test('every listed PHP maps to its OWN image, so a hop never lands on another one', () => {
  // php_matrix.py answers `joomla:php8.4-apache` for a 6.1 point update; before the fix that
  // resolved to the Joomla 5 image, moving the site DOWN a PHP version.
  assert.equal(resolve('joomla', 'joomla:php8.4-apache'), taggedImage('joomla:php8.4-apache'))
  assert.notEqual(resolve('joomla', 'joomla:php8.4-apache'), taggedImage('joomla'))
  assert.throws(() => resolve('joomla', 'joomla:php8.1-apache'), /PHP 8\.1 is unsupported/)
  // The bare platform line answers one question only: what a site with no image of its own gets.
  assert.equal(resolve('joomla', ''), taggedImage('joomla'))
})

test('php8.0 is a KNOWN GAP, not a listed image — and it degrades like any unlisted base', () => {
  // 🔒 This test exists so the gap cannot close by accident. Both php8.0 bases are Debian 11, whose
  // pool now 404s, so the lines left IMAGE_TAGS on 08/09/2026 (the block at the top of that file
  // carries the measurements). What that costs is one real hop — php_matrix.py answers php8.0 for
  // Joomla 3.10 -> 4.4 and nothing else — so the refusal has to stay legible rather than becoming
  // "the platform default", which is the failure the test above was written for.
  for (const base of ['joomla:php8.0-apache', 'wordpress:php8.0-apache']) {
    const platform = base.split(':')[0]
    // Lenient (a new site): keeps its own PHP. Never the platform default, never another PHP.
    assert.equal(resolve(platform, base), base)
    assert.notEqual(resolve(platform, base), taggedImage(platform))
  }
  // php_matrix still names it, and that is correct — it states what Joomla needs, not what we build.
  const hop = execFileSync(
    'python3',
    [
      fileURLToPath(new URL('../scripts/provision/php_matrix.py', import.meta.url)),
      '--from',
      '3.10.12',
      '--to',
      '4.4.13'
    ],
    { encoding: 'utf8' }
  ).trim()
  assert.equal(hop, '8.0', 'the 3.10 -> 4.4 hop is the one this gap costs')
})

test('the render path REFUSES an unlisted base rather than moving a running site', () => {
  const compose = CLONE_COMPOSE.replace('wordpress:php8.3-apache', 'wordpress:php7.4-apache')
  const { root, dir } = makeSite('pinned', {
    env: 'HOST_PORT=8087\nPLATFORM=wordpress\nDB_PASSWORD=secret\n',
    compose
  })
  assert.throws(() => render(root, 'pinned'), /IMAGE_TAGS has no line for wordpress:php7\.4-apache/)
  // The compose file is exactly as it was: a refusal must not half-write a stack.
  assert.equal(readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8'), compose)
})

test('a fleet-born WordPress keeps its installer environment', () => {
  const compose = `services:
  db:
    image: mariadb:11
    command:
      - --sql-mode=NO_ENGINE_SUBSTITUTION
    environment:
      MARIADB_DATABASE: "wordpress"

  web:
    image: wordpress:apache
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_TABLE_PREFIX: "tr_"
    volumes:
      - ./webroot:/var/www/html
`
  const { root, dir } = makeSite('wpfresh', {
    env: 'HOST_PORT=8088\nPLATFORM=wordpress\nDB_PASSWORD=secret\nWP_ADMIN_PASSWORD=x\n',
    compose
  })
  render(root, 'wpfresh')
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  assert.match(out, /- \/srv\/tracy-sites\/wpfresh:\/site\/wpfresh$/m)
  assert.match(out, /- \/srv\/tracy-sites\/wpfresh\/\.webroot:\/site\/wpfresh\/\.webroot$/m)
  assert.ok(out.includes(`image: ${taggedImage('wordpress:apache')}`), out)
  assert.match(out, /WORDPRESS_DB_HOST: db/)
  assert.match(out, /WORDPRESS_TABLE_PREFIX: "tr_"/)
  // The installer is the point of a fleet-born site: it must not get the clone's entrypoint.
  assert.ok(!out.includes('apache2-foreground'), out)
})

test('a refused render leaves no half-written temp file beside the compose', () => {
  const { root, dir } = makeSite('nopass2', {
    env: 'HOST_PORT=8089\nPLATFORM=wordpress\n',
    compose: CLONE_COMPOSE
  })
  assert.throws(() => render(root, 'nopass2'))
  assert.equal(existsSync(path.join(dir, '.docker-compose.yml.new')), false)
})

// ── Confinement ───────────────────────────────────────────────────────────────────────────────
//
// 🔒 This is not hygiene, it is the second half of the host boundary. The socket proxy bounds WHICH
// container the agent may `docker exec` into; it cannot bound the exec's request body, so a
// privileged root exec into a `-web-1` container is reachable (measured 06/09: uid 0, CapEff
// 000001ffffffffff). What stands between that and the host is this container's own profile. The
// test is here rather than in a comment because a line that quietly stops being rendered for ONE
// platform is exactly the drift nobody sees: the site serves, the agent works, and only that one
// site is soft.
test('every platform renders the web container with no-new-privileges and shm_size', () => {
  for (const { label, out } of renderedShapes()) {
    assert.match(out, /^ {4}security_opt: \["no-new-privileges:true"\]$/m, `${label}:\n${out}`)
    assert.match(out, /^ {4}shm_size: 512m$/m, `${label}:\n${out}`)
    // On the WEB service, not on the database: the agent's shell is the web container, and a
    // line landing under `db:` would read as done while the container that matters is bare.
    const web = out.slice(out.indexOf('\n  web:'))
    assert.match(web, /security_opt: \["no-new-privileges:true"\]/, `${label} web block:\n${web}`)
    // web-clone's Chromium runs with no `--disable-dev-shm-usage` of its own (system-browser.mjs
    // hardcodes its flag list), so the container's default 64 MB /dev/shm is a real-page crash
    // waiting to happen — this line is what raises it, and it must land on the web service too.
    assert.match(web, /shm_size: 512m/, `${label} web block:\n${web}`)
  }
})

test('the confinement line survives a re-render — a migration must not quietly drop it', () => {
  const { root, dir } = makeSite('wprerender', {
    env: 'HOST_PORT=8085\nPLATFORM=wordpress\nDB_PASSWORD=s\n',
    compose: CLONE_COMPOSE
  })
  render(root, 'wprerender')
  const once = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  render(root, 'wprerender')
  const twice = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  assert.equal(once, twice)
  assert.equal(twice.match(/security_opt/g)?.length, 1, 'exactly one confinement line, not two')
  assert.equal(twice.match(/shm_size/g)?.length, 1, 'exactly one shm_size line, not two')
})

// ── networks / dns (Plan 3 Task 2 fix round: this had no coverage) ──────────────────────────────
//
// 🔒 This is the one mechanism the whole plan depends on for tracy-web to reach `<label>-web-1`
// (CLAUDE.md's blast map: a wrong `deploy/compose.yml` name here, or a dropped `networks:` line,
// makes a site invisible to tracy-web with nothing at the surface that says why). It fails exactly
// as silently as the mounts this file already guards: the site itself serves customers perfectly
// on its own `default` network, and only tracy-web notices anything is missing.

/** Every platform shape, reused from "no-new-privileges and shm_size" above. */
const NETWORK_SHAPES = [
  ['netwp', 'HOST_PORT=8181\nPLATFORM=wordpress\nDB_PASSWORD=s\n', CLONE_COMPOSE],
  [
    'netwpfresh',
    'HOST_PORT=8182\nPLATFORM=wordpress\nDB_PASSWORD=s\n',
    `services:
  db:
    image: mariadb:11
    command:
      - --sql-mode=NO_ENGINE_SUBSTITUTION
    environment:
      MARIADB_DATABASE: "netwpfresh"

  web:
    image: wordpress:apache
    environment:
      WORDPRESS_DB_NAME: "netwpfresh"
    volumes:
      - ./webroot:/var/www/html
`
  ],
  [
    'netjoofresh',
    'HOST_PORT=8183\nPLATFORM=joomla\nDB_PASSWORD=s\n',
    `services:
  db:
    image: mariadb:11
    command:
      - --sql-mode=NO_ENGINE_SUBSTITUTION
    environment:
      MARIADB_DATABASE: "netjoofresh"

  web:
    image: joomla:5-apache
    environment:
      JOOMLA_DB_NAME: "netjoofresh"
    volumes:
      - ./webroot:/var/www/html
`
  ],
  [
    'netemdash',
    'HOST_PORT=8184\nPLATFORM=emdash\n',
    `services:
  web:
    image: tracy/emdash:1.2.3
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
`
  ]
]

/** Each platform shape rendered ONCE (no host env), shared by the confinement, network and cap tests. */
let shapeRenders
function renderedShapes() {
  shapeRenders ??= NETWORK_SHAPES.map(([label, env, compose]) => {
    const { root, dir } = makeSite(label, { env, compose })
    mkdirSync(path.join(dir, 'data'), { recursive: true })
    mkdirSync(path.join(dir, 'uploads'), { recursive: true })
    render(root, label, [], NO_WEB_ENV)
    return { label, env, out: readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8') }
  })
  return shapeRenders
}

test('every shape joins [default, tracy] on the web service, and declares the tracy network', () => {
  for (const { label, out } of renderedShapes()) {
    // On the WEB service specifically, same reasoning as the confinement test above: a line that
    // landed under `db:` instead would read as done while the container tracy-web actually needs
    // to reach is unreachable.
    const web = out.slice(out.indexOf('\n  web:'))
    assert.match(web, /^ {4}networks: \[default, tracy\]$/m, `${label} web block:\n${web}`)

    // Both top-level networks are external: provision creates them before compose starts. The
    // site network is named after the label; the shared Tracy network keeps its deployment name.
    assert.match(
      out,
      new RegExp(
        `^networks:\\n {2}default:\\n {4}external: true\\n {4}name: ${label}_default\\n {2}tracy:\\n {4}external: true\\n {4}name: tracy_tracy$`,
        'm'
      ),
      out
    )

    // No TRACY_SITE_DNS in this render: local-only, and must not appear at all by default, not
    // merely be empty — an empty `dns: []` would still change compose's own resolver behaviour.
    assert.doesNotMatch(web, /dns:/, `${label} web block:\n${web}`)
  }
})

test('TRACY_SITE_NETWORK renames the network this site joins, for local compose lanes', () => {
  const { root, dir } = makeSite('netnamed', {
    env: 'HOST_PORT=8185\nPLATFORM=wordpress\nDB_PASSWORD=s\n',
    compose: CLONE_COMPOSE
  })
  render(root, 'netnamed', [], { TRACY_SITE_NETWORK: 'compose_dev_tracy' })
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  assert.match(out, /^ {4}name: compose_dev_tracy$/m, out)
  assert.doesNotMatch(out, /name: tracy_tracy/, out)
})

test('TRACY_SITE_DNS adds a dns: line on the web service, local dev only', () => {
  const { root, dir } = makeSite('netdns', {
    env: 'HOST_PORT=8186\nPLATFORM=wordpress\nDB_PASSWORD=s\n',
    compose: CLONE_COMPOSE
  })
  render(root, 'netdns', [], { TRACY_SITE_DNS: '10.89.0.1' })
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  const web = out.slice(out.indexOf('\n  web:'))
  assert.match(web, /^ {4}dns: \[10\.89\.0\.1\]$/m, web)
})

// ── a long label gets a bounded DNS alias on the tracy network (issue #165) ───────────────────────
//
// 🔒 A label whose `<label>-web-1` exceeds 63 octets does not resolve over Docker DNS (measured Node
// 22.17: ENOTFOUND on a 66-octet name), so its web container needs an explicit `tracy-web-<hash>`
// alias that DOES resolve — and tracy-web/tracy-host dial that same alias. This is the renderer half;
// the parity assertion below proves it matches `webDnsName` exactly. Regression: before the fix the
// renderer wrote the plain `[default, tracy]` shorthand for every label, alias or not.

const LONG_LABEL = 'synthetic-imported-site-dns-length-regression-165-0a1b2c3def' // synthetic 60 chars → 66-octet name

test('a long label renders an aliased tracy network, and the alias equals webDnsName', () => {
  assert.equal(`${LONG_LABEL}-web-1`.length, 66, 'the fixture must actually exceed the DNS-label cap')
  const { root, dir } = makeSite(LONG_LABEL, {
    env: `HOST_PORT=8187\nPLATFORM=wordpress\nDB_PASSWORD=s\n`,
    compose: CLONE_COMPOSE
  })
  render(root, LONG_LABEL)
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  const alias = webDnsName(LONG_LABEL)
  assert.match(alias, /^tracy-web-[0-9a-f]{32}$/)
  assert.ok(alias.length <= 63)
  // The web service joins the tracy network with the alias — the map form, not the shorthand.
  const web = out.slice(out.indexOf('\n  web:'))
  assert.match(
    web,
    /^ {4}networks:\n {6}default: \{\}\n {6}tracy:\n {8}aliases: \["tracy-web-[0-9a-f]{32}"\]$/m,
    web
  )
  assert.ok(web.includes(`aliases: ["${alias}"]`), `renderer alias must equal webDnsName:\n${web}`)
  // The over-long container name is NOT what the alias is — the container name is still `<label>-web-1`
  // for docker exec/cp, but nothing dials it over DNS anymore.
  assert.ok(!web.includes(`aliases: ["${LONG_LABEL}-web-1"]`), 'the alias must not be the over-long name')
})

test('a short label keeps the [default, tracy] shorthand — no deployed normal site changes', () => {
  // The boundary from the other side: a label whose `<label>-web-1` fits keeps the exact shorthand,
  // so re-rendering a normal site produces no alias and no diff to its network shape.
  const { root, dir } = makeSite('shortlabel', {
    env: 'HOST_PORT=8188\nPLATFORM=wordpress\nDB_PASSWORD=s\n',
    compose: CLONE_COMPOSE
  })
  render(root, 'shortlabel')
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  const web = out.slice(out.indexOf('\n  web:'))
  assert.match(web, /^ {4}networks: \[default, tracy\]$/m, web)
  assert.doesNotMatch(web, /aliases:/, web)
})

// ── tracy_web_dns_name: the shell twin the readiness probes dial through (issue #165) ─────────────
//
// platform/{wordpress,joomla}.sh curl the web container over the docker network to know a site is up;
// they must dial the SAME name tracy-web/tracy-host do. `<label>-web-1` for a short label, the bounded
// `tracy-web-<hash>` alias for a long one — proven equal to `webDnsName` here so the probe never dials
// a name Docker cannot resolve. render-compose.sh defines it, and provision.sh sources render-compose.sh
// before the platform file, so the helper is in scope wherever the probes run.
function dnsName(label) {
  return execFileSync('bash', ['-c', `. "$1"; tracy_web_dns_name "$2"`, '_', SCRIPT, label], {
    encoding: 'utf8'
  })
}

test('tracy_web_dns_name gives the container name for a short label, the alias for a long one', () => {
  assert.equal(dnsName('shortlabel'), 'shortlabel-web-1')
  assert.equal(dnsName('shortlabel'), webDnsName('shortlabel'))
  const long = dnsName(LONG_LABEL)
  assert.match(long, /^tracy-web-[0-9a-f]{32}$/)
  assert.equal(long, webDnsName(LONG_LABEL), 'the shell probe must dial the same name the app does')
  assert.ok(!long.includes(`${LONG_LABEL}-web-1`), 'the over-long container name must not be dialled')
})

// ── tracy_detect_platform (Plan 3 Task 2 fix round, minor item 3) ────────────────────────────────
//
// A re-render of a site with no PLATFORM in .env and no decisive image on its existing compose
// falls back to reading markers off the webroot. That webroot now lives under TRACY_SITES_ROOT,
// not under $SITE_DIR/webroot (the private root) — this pins the fallback to the right root.
test('tracy_detect_platform reads the webroot marker under TRACY_SITES_ROOT, not the private root', () => {
  const label = 'detectme'
  const { root, dir } = makeSite(label, { env: 'HOST_PORT=8199\nDB_PASSWORD=s\n' })
  // A WordPress marker at the OLD location ($SITE_DIR/webroot) — if the fallback still read from
  // here, detection would answer "wordpress" instead of the Joomla marker planted below at the
  // real, new location. Proves the fallback actually moved, not merely that it still works.
  writeFileSync(path.join(dir, 'webroot', 'wp-config.php'), '<?php\n')

  const sitesRoot = mkdtempSync(path.join(tmpdir(), 'render-compose-sites-'))
  const webroot = path.join(sitesRoot, label, '.webroot')
  mkdirSync(webroot, { recursive: true })
  writeFileSync(path.join(webroot, 'configuration.php'), '<?php\n')

  const out = render(root, label, ['--flavor', 'clone'], {
    TRACY_SITES_ROOT: sitesRoot,
    DB_NAME: 'joomla',
    DB_SQL_MODE: ''
  })
  assert.match(out, /\(joomla\/clone,/, out)
})

// 🔒 THE CUSTODY MATCHERS ACCEPT EXACTLY WHAT THIS GENERATOR WRITES (Hano, 23/09/2026). The door's
// `classifyTokenMount` and `mint-agent-token.sh`'s awk are exact-form matchers, and their shared
// fixture (`emdashCompose`, token-custody-cases.mjs) is only worth something if it IS this file's
// output. So: the real render, compared line for line (comments and blank lines aside) with the
// fixture; the real render classified by both matchers; the pre-#155 file (the render minus the
// token bind) and the migration's own insertion into it classified the same way. A change to
// `tracy_compose_emdash` that the matchers do not know turns this red instead of turning every new
// site into TOKEN_CUSTODY_UNKNOWN.
const MINT_SCRIPT = fileURLToPath(new URL('../scripts/provision/mint-agent-token.sh', import.meta.url))
/** The script's own `token_mount_custody` on every file, in ONE bash process: one answer per file. */
const awkCustodyAll = (files, siteDir) => {
  const fn = /^token_mount_custody\(\) \{\n[\s\S]*?\n\}\n/m.exec(readFileSync(MINT_SCRIPT, 'utf8'))
  assert.ok(fn, 'token_mount_custody() is no longer in mint-agent-token.sh')
  const script = `${fn[0]}\nd="$1"; shift; for f in "$@"; do printf '%s\n' "$(token_mount_custody "$f" "$d")"; done`
  return execFileSync('bash', ['-c', script, 'custody', siteDir, ...files], { encoding: 'utf8' })
    .trim()
    .split('\n')
}
/** Both matchers' answers for each variant text of one site (files written beside its compose). */
const custodyAnswers = (dir, texts) => {
  const files = texts.map((text, i) => {
    const file = path.join(dir, `variant-${i}.yml`)
    writeFileSync(file, text)
    return file
  })
  return { door: texts.map((text) => classifyTokenMount(text, dir)), awk: awkCustodyAll(files, dir) }
}
const significant = (text) => text.split('\n').filter((line) => !/^ *$/.test(line) && !/^ *#/.test(line))

// Each label either side of the #165 boundary: `<label>-web-1` of 63 octets keeps the shorthand, 64
// and up gets the aliased map form, and both matchers must know both (a 58-character label was
// `unknown` to them until 23/09/2026).
const CUSTODY_LABELS = [
  ['a short label', null],
  ['a 57-character label', LABELS.fits],
  ['a 58-character label', LABELS.over],
  ['a 60-character label', LABELS.long]
]
// The renderer environments the custody forms are proven under, each with the `TRACY_MAIL_URL` the
// site-mail run (#289) and the caps (28/09/2026) must then carry — written here, not read back from
// the render. The host's tracy-web env file is pointed at nothing so this machine's own /etc/tracy
// cannot pick the prefix or a cap, and the machine is said to have eight cores so the default cap is
// the same on every machine that runs this.
const NO_WEB_ENV = { TRACY_WEB_ENV_FILE: '/nonexistent/tracy-web.env', TRACY_HOST_CPUS: '8' }
const CUSTODY_ENVS = [
  ['production defaults', NO_WEB_ENV, DEFAULT_MAIL_URL, DEFAULT_LIMITS],
  [
    'a local lane (network + dns)',
    { ...NO_WEB_ENV, TRACY_SITE_NETWORK: 'compose_dev_tracy', TRACY_SITE_DNS: '10.89.0.1' },
    DEFAULT_MAIL_URL,
    DEFAULT_LIMITS
  ],
  [
    'a host network prefix',
    { ...NO_WEB_ENV, TRACY_NETWORK_PREFIX: '10.77.4' },
    'http://10.77.4.10:8080/_site-mail',
    DEFAULT_LIMITS
  ],
  [
    "a host's own mail URL",
    { ...NO_WEB_ENV, TRACY_MAIL_URL: 'https://relay.example.test:8443/_site-mail' },
    'https://relay.example.test:8443/_site-mail',
    DEFAULT_LIMITS
  ],
  [
    "a host's own caps",
    {
      ...NO_WEB_ENV,
      TRACY_SITE_MEMORY: '2048m',
      TRACY_SITE_MEMORY_EMDASH: '2560m',
      TRACY_SITE_DB_MEMORY: '768m',
      TRACY_SITE_CPUS: '1.5',
      TRACY_SITE_PIDS: '4096'
    },
    DEFAULT_MAIL_URL,
    { web: '2048m', emdash: '2560m', db: '768m', cpus: '1.5', pids: '4096' }
  ],
  [
    'a two-core host',
    { ...NO_WEB_ENV, TRACY_HOST_CPUS: '2' },
    DEFAULT_MAIL_URL,
    { ...DEFAULT_LIMITS, cpus: '1' }
  ]
]
/** The render with its site-mail run removed: what the generator wrote before #289. */
const withoutMail = (text) =>
  text
    .split('\n')
    .filter((line) => !/^ {6}(?:TRACY_MAIL_[A-Z]+: |# Site mail: )/.test(line))
    .join('\n')
/** The render with its cap runs removed: what the generator wrote before 28/09/2026. */
const withoutLimits = (text) =>
  text
    .split('\n')
    .filter((line) => !/^ {4}(?:mem_limit|memswap_limit|cpus|pids_limit): /.test(line))
    .join('\n')
// Label class x environment class are independent axes (the label only decides the alias stanza; the
// environment only decides network, dns, mail and caps), so instead of the 4 x 6 product each
// environment runs once and the four label classes rotate through them: every label class (both
// sides of the 63-octet boundary) and every environment class is still rendered and judged.
const CUSTODY_COMBOS = CUSTODY_ENVS.map((envRow, i) => [CUSTODY_LABELS[i % CUSTODY_LABELS.length], envRow])
for (const [[labelName, longLabel], [name, env, mail, limits]] of CUSTODY_COMBOS) {
  test(`EmDash custody forms are the generator's own output (${labelName}, ${name})`, () => {
    const label = longLabel ?? 'emdcustody'
    const { root, dir } = makeSite(label, {
      env: 'HOST_PORT=8093\nPLATFORM=emdash\n',
      compose: 'services:\n  web:\n    image: tracy/emdash:0.34.0\n'
    })
    mkdirSync(path.join(dir, 'data'), { recursive: true })
    render(root, label, [], env)
    const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
    const opts = {
      image: /^ {4}image: (\S+)$/m.exec(out)[1],
      network: env.TRACY_SITE_NETWORK ?? 'tracy_tracy',
      dns: env.TRACY_SITE_DNS ?? null
    }
    assert.deepEqual(
      significant(out),
      significant(emdashCompose(dir, { ...opts, token: 'generator', mail, limits }))
    )
    assert.equal(out.includes(`aliases: ["${webDnsAlias(label)}"]`), `${label}-web-1`.length > 63, out)

    // Every variant of the render, with the answer both matchers must give it (written here).
    const variants = [{ name: 'the render itself', text: out, expect: 'protected' }]

    // The bind and the mail run without the caps: the generator between #289 and 28/09/2026 — every
    // site running today — still protected.
    const preLimits = withoutLimits(out)
    assert.notEqual(preLimits, out, 'the render carries no cap run to remove')
    assert.deepEqual(
      significant(preLimits),
      significant(emdashCompose(dir, { ...opts, token: 'generator', mail }))
    )
    variants.push({ name: 'no caps', text: preLimits, expect: 'protected' })

    // The caps without the mail run were never written: its generator writes both.
    variants.push({ name: 'caps without mail run', text: withoutMail(out), expect: 'unknown' })

    // The bind without the mail run: the generator between #155 and #289, still protected.
    const preMail = withoutMail(preLimits)
    assert.notEqual(preMail, preLimits, 'the render carries no site-mail run to remove')
    assert.deepEqual(significant(preMail), significant(emdashCompose(dir, { ...opts, token: 'generator' })))
    variants.push({ name: 'no mail run', text: preMail, expect: 'protected' })

    // The mail run and the caps without the bind were never written: not the pre-#155 file,
    // whatever the host holds.
    const unbound = out
      .split('\n')
      .filter((line) => line !== TOKEN_BIND)
      .join('\n')
    variants.push({ name: 'no bind', text: unbound, expect: 'unknown' })
    variants.push({ name: 'caps beside no bind', text: withoutMail(unbound), expect: 'unknown' })

    const legacy = withoutLimits(withoutMail(unbound))
    assert.notEqual(legacy, preMail, 'the render carries no token bind to remove')
    assert.deepEqual(significant(legacy), significant(emdashCompose(dir, opts)))
    variants.push({ name: 'pre-#155 file', text: legacy, expect: 'none' })

    const noComments = significant(legacy).join('\n') + '\n'
    for (const [i, candidate] of [buildCandidateText(legacy), buildCandidateText(noComments)].entries()) {
      assert.ok(candidate, 'the migration refused the generator’s own pre-#155 file')
      variants.push({ name: `migration output ${i}`, text: candidate, expect: 'protected' })
    }
    // The migration inserted into a file that already has the bind is two binds: not a fleet form.
    variants.push({ name: 'migration over a bound file', text: buildCandidateText(out), expect: 'unknown' })

    const { door, awk } = custodyAnswers(
      dir,
      variants.map((v) => v.text)
    )
    const names = variants.map((v) => v.name).join(' | ')
    assert.deepEqual(
      door,
      variants.map((v) => v.expect),
      `door: ${names}`
    )
    assert.deepEqual(
      awk,
      variants.map((v) => v.expect),
      `script: ${names}`
    )
  })
}

// 🔒 THE PHP PROOF IS THIS GENERATOR'S OUTPUT, TOO (Hano, 23/09/2026). `siteShape` and
// `mint-agent-token.sh`'s `site_shape` accept a compose as proof of a Joomla/WordPress site only
// when it is exactly one of the three PHP forms rendered here; `phpCompose` (token-custody-cases.mjs)
// is the fixture both are tested against. So: each real render, compared line for line with the
// fixture, then classified by both matchers with the `.env` PLATFORM line removed (the compose alone
// must prove it). A change to a PHP form the matchers do not know turns this red instead of sending
// every PHP site to TOKEN_CUSTODY_UNKNOWN.
/** The script's own `site_shape` on every site dir, in ONE bash process: one answer per dir. */
const awkSiteShapeAll = (siteDirs) => {
  const source = readFileSync(MINT_SCRIPT, 'utf8')
  const proof = /^compose_proves_php\(\) \{\n[\s\S]*?\n\}\n/m.exec(source)
  const fn = /^site_shape\(\) \{\n[\s\S]*?\n\}\n/m.exec(source)
  assert.ok(proof && fn, 'compose_proves_php() or site_shape() is no longer in mint-agent-token.sh')
  const script = `${proof[0]}\n${fn[0]}\nfor d in "$@"; do printf '%s\n' "$(site_shape "$d")"; done`
  return execFileSync('bash', ['-c', script, 'shape', ...siteDirs], { encoding: 'utf8' })
    .trim()
    .split('\n')
}

const JOOMLA_FRESH_COMPOSE = `services:
  db:
    image: mariadb:11
    command:
      - --sql-mode=
    environment:
      MARIADB_DATABASE: "joomla"

  web:
    image: joomla:6-apache
    environment:
      JOOMLA_DB_HOST: db
      JOOMLA_EXTENSIONS_URLS: "https://example.com/cowork.zip"
    volumes:
      - ./webroot:/var/www/html
`
const WORDPRESS_FRESH_COMPOSE = `services:
  db:
    image: mariadb:11
    command:
      - --sql-mode=NO_ENGINE_SUBSTITUTION
    environment:
      MARIADB_DATABASE: "wordpress"

  web:
    image: wordpress:apache
    environment:
      WORDPRESS_DB_HOST: db
    volumes:
      - ./webroot:/var/www/html
`
for (const [flavorIndex, [flavor, platform, compose, fixture]] of [
  ['clone', 'wordpress', CLONE_COMPOSE, { dbName: 'wordpress', sqlMode: 'NO_ENGINE_SUBSTITUTION' }],
  [
    'joomla',
    'joomla',
    JOOMLA_FRESH_COMPOSE,
    { dbName: 'joomla', sqlMode: '', extensions: 'https://example.com/cowork.zip' }
  ],
  [
    'wordpress',
    'wordpress',
    WORDPRESS_FRESH_COMPOSE,
    { dbName: 'wordpress', sqlMode: 'NO_ENGINE_SUBSTITUTION' }
  ]
].entries()) {
  // Same rotation as the EmDash forms above: each environment class once per flavor, the label
  // classes spread across them (offset by flavor so the three flavors meet different pairs).
  for (const [i, envRow] of CUSTODY_ENVS.entries()) {
    const [labelName, longLabel] = CUSTODY_LABELS[(i + flavorIndex) % CUSTODY_LABELS.length]
    const [name, env, mail, limits] = envRow
    test(`the ${flavor} PHP form is the generator's own output and proves the platform (${labelName}, ${name})`, async () => {
      const label = longLabel ?? `php${flavor}proof`
      const envFile = `HOST_PORT=8094\nPLATFORM=${platform}\nDB_PASSWORD=secret\nJOOMLA_ADMIN_PASSWORD=x\n`
      const { root, dir } = makeSite(label, { env: envFile, compose })
      render(root, label, [], env)
      const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
      const opts = {
        ...fixture,
        flavor,
        image: /^ {2}web:\n {4}image: (\S+)$/m.exec(out)[1],
        network: env.TRACY_SITE_NETWORK ?? 'tracy_tracy',
        dns: env.TRACY_SITE_DNS ?? null
      }
      assert.deepEqual(significant(out), significant(phpCompose(dir, { ...opts, mail, limits })))
      assert.equal(out.includes(`aliases: ["${webDnsAlias(label)}"]`), `${label}-web-1`.length > 63, out)

      const variants = [{ name: 'the render itself', text: out, expect: 'other' }]
      // The same file as the generator wrote it before 28/09/2026 — every site running today —
      // still proves it.
      const preLimits = withoutLimits(out)
      assert.deepEqual(significant(preLimits), significant(phpCompose(dir, { ...opts, mail })))
      variants.push({ name: 'no caps', text: preLimits, expect: 'other' })
      // The caps without the mail run were never written: no proof.
      variants.push({ name: 'caps without mail run', text: withoutMail(out), expect: 'unknown' })
      // The same file as the generator wrote it before #289 (the clone's own `environment:` goes
      // with its run) still proves it.
      let preMail = withoutMail(preLimits)
      if (flavor === 'clone')
        preMail = preMail.replace(
          '    entrypoint: ["apache2-foreground"]\n    environment:\n',
          '    entrypoint: ["apache2-foreground"]\n'
        )
      assert.deepEqual(significant(preMail), significant(phpCompose(dir, opts)))
      variants.push({ name: 'no mail run', text: preMail, expect: 'other' })
      // One line past the form, the proof is gone in both.
      const stanzaEnd = out.includes('    networks: [default, tracy]\n')
        ? '    networks: [default, tracy]\n'
        : `        aliases: ["${webDnsAlias(label)}"]\n`
      assert.ok(out.includes(stanzaEnd), out)
      variants.push({
        name: 'one line past the form',
        text: out.replace(stanzaEnd, `${stanzaEnd}    volumes:\t[]\n`),
        expect: 'unknown'
      })

      // A pre-06/09 `.env`: the compose alone must prove the platform, in both matchers. One site
      // dir per variant (its basename is the label the forms are judged against).
      const dirs = variants.map((variant, v) => {
        const variantDir = path.join(root, `variant-${v}`, label)
        mkdirSync(variantDir, { recursive: true })
        writeFileSync(path.join(variantDir, '.env'), 'HOST_PORT=8094\nDB_PASSWORD=secret\n')
        writeFileSync(path.join(variantDir, 'docker-compose.yml'), variant.text)
        return variantDir
      })
      const door = []
      for (const variantDir of dirs) door.push(await siteShape(variantDir))
      const names = variants.map((v) => v.name).join(' | ')
      assert.deepEqual(
        door,
        variants.map((v) => v.expect),
        `door: ${names}`
      )
      assert.deepEqual(
        awkSiteShapeAll(dirs),
        variants.map((v) => v.expect),
        `script: ${names}`
      )
    })
  }
}

// ── resource caps (28/09/2026) ────────────────────────────────────────────────────────────────
//
// 🔒 Every agent command runs in the web container, and until 28/09 nothing bounded what it could
// take from the host: `docker inspect` read Memory=0 NanoCpus=0 PidsLimit=<none> on every site of
// the stand. The caps are one value per host (its env), never per site, and a render must refuse an
// impossible one before it writes anything: a cap no site can live under, written into every new
// site's compose, is an outage that looks like a slow machine.

/** The four cap lines of one service's block, in order, or null when that block carries none. */
function capsOf(block) {
  const m = /^ {4}mem_limit: (\S+)\n {4}memswap_limit: (\S+)\n {4}cpus: (\S+)\n {4}pids_limit: (\S+)$/m.exec(
    block
  )
  return m ? { memory: m[1], swap: m[2], cpus: m[3], pids: m[4] } : null
}
/** The `web:` and `db:` blocks of a rendered compose (db is empty for EmDash). */
function servicesOf(out) {
  const web = out.slice(out.indexOf('\n  web:'), out.indexOf('\nvolumes:'))
  const db = out.includes('\n  db:') ? out.slice(out.indexOf('\n  db:'), out.indexOf('\n  web:')) : ''
  return { web, db }
}

test('every platform caps its web container, and a PHP site its database too', () => {
  for (const { label, env, out } of renderedShapes()) {
    const { web, db } = servicesOf(out)
    const emdash = env.includes('PLATFORM=emdash')
    assert.deepEqual(
      capsOf(web),
      {
        memory: emdash ? DEFAULT_LIMITS.emdash : DEFAULT_LIMITS.web,
        swap: emdash ? DEFAULT_LIMITS.emdash : DEFAULT_LIMITS.web,
        cpus: DEFAULT_LIMITS.cpus,
        pids: DEFAULT_LIMITS.pids
      },
      `${label} web block:\n${web}`
    )
    // Right after shm_size, where the custody matchers read it.
    assert.match(web, /^ {4}shm_size: 512m\n {4}mem_limit: /m, web)
    if (emdash) assert.equal(db, '', out)
    else {
      assert.deepEqual(
        capsOf(db),
        {
          memory: DEFAULT_LIMITS.db,
          swap: DEFAULT_LIMITS.db,
          cpus: DEFAULT_LIMITS.cpus,
          pids: DEFAULT_LIMITS.pids
        },
        `${label} db block:\n${db}`
      )
      assert.match(db, /^ {4}restart: unless-stopped\n {4}mem_limit: /m, db)
    }
    assert.equal(out.match(/mem_limit:/g)?.length, emdash ? 1 : 2, out)
  }
})

test('a host sets the caps once: its environment first, then its tracy-web env file', () => {
  const hostEnv = path.join(mkdtempSync(path.join(tmpdir(), 'render-compose-hostenv-')), 'tracy-web.env')
  writeFileSync(
    hostEnv,
    'SITE_DOMAIN=tracy.site\nTRACY_SITE_MEMORY="2g"\nTRACY_SITE_DB_MEMORY=768m\nTRACY_SITE_PIDS=4096\n'
  )
  const { root, dir } = makeSite('capsenv', {
    env: 'HOST_PORT=8190\nPLATFORM=wordpress\nDB_PASSWORD=s\n',
    compose: CLONE_COMPOSE
  })
  // A hand run on a server: nothing in the shell, the file speaks.
  render(root, 'capsenv', [], { ...NO_WEB_ENV, TRACY_WEB_ENV_FILE: hostEnv })
  let { web, db } = servicesOf(readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8'))
  assert.deepEqual(capsOf(web), { memory: '2g', swap: '2g', cpus: '2', pids: '4096' }, web)
  assert.deepEqual(capsOf(db), { memory: '768m', swap: '768m', cpus: '2', pids: '4096' }, db)
  // tracy-host's environment wins over the file, knob by knob.
  render(root, 'capsenv', [], { ...NO_WEB_ENV, TRACY_WEB_ENV_FILE: hostEnv, TRACY_SITE_MEMORY: '1024m' })
  ;({ web, db } = servicesOf(readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')))
  assert.deepEqual(capsOf(web), { memory: '1024m', swap: '1024m', cpus: '2', pids: '4096' }, web)
  assert.equal(capsOf(db).memory, '768m', db)
})

test('the default core cap is two, or one on a machine with fewer than four; never above the machine', () => {
  const cores = (hostCpus, extra = {}) => {
    const { root, dir } = makeSite('capscpu', {
      env: 'HOST_PORT=8191\nPLATFORM=emdash\n',
      compose: 'services:\n  web:\n    image: tracy/emdash:1.2.3\n'
    })
    const r = spawnSync('bash', [SCRIPT, 'capscpu', '--root', root, '--no-image-check'], {
      encoding: 'utf8',
      env: { ...process.env, ...NO_WEB_ENV, TRACY_HOST_CPUS: hostCpus, ...extra }
    })
    assert.equal(r.status, 0, r.stderr)
    return {
      cpus: capsOf(servicesOf(readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')).web).cpus,
      stderr: r.stderr
    }
  }
  assert.equal(cores('1').cpus, '1')
  assert.equal(cores('3').cpus, '1')
  assert.equal(cores('4').cpus, '2')
  assert.equal(cores('64').cpus, '2')
  assert.equal(cores('8', { TRACY_SITE_CPUS: '0.5' }).cpus, '0.5')
  // docker refuses to create a container asking for more cores than the machine has ("range of CPUs
  // is from 0.01 to 2.00"), so an over-large host setting is held to the machine — and said so.
  const clamped = cores('2', { TRACY_SITE_CPUS: '4' })
  assert.equal(clamped.cpus, '2')
  assert.match(clamped.stderr, /more cores than this machine has \(2\)/)
})

test('an impossible cap refuses the render, names the setting, and writes nothing', () => {
  const refusals = [
    ['TRACY_SITE_MEMORY', '2GB', /not a memory size/],
    ['TRACY_SITE_MEMORY', '1.5g', /not a memory size/],
    ['TRACY_SITE_MEMORY', '1610612736', /not a memory size/],
    ['TRACY_SITE_MEMORY', '${X}', /not a memory size/],
    ['TRACY_SITE_MEMORY', '156m', /below 256m/],
    ['TRACY_SITE_DB_MEMORY', '1 g', /not a memory size/],
    ['TRACY_SITE_CPUS', '0', /not a positive number of cores/],
    ['TRACY_SITE_CPUS', '-1', /not a positive number of cores/],
    ['TRACY_SITE_CPUS', 'two', /not a positive number of cores/],
    ['TRACY_SITE_PIDS', '-1', /not a process count/],
    ['TRACY_SITE_PIDS', '16', /not a process count/],
    ['TRACY_SITE_PIDS', '2k', /not a process count/]
  ]
  for (const [name, value, why] of refusals) {
    const { root, dir } = makeSite('capsbad', {
      env: 'HOST_PORT=8192\nPLATFORM=wordpress\nDB_PASSWORD=s\n',
      compose: CLONE_COMPOSE
    })
    const r = spawnSync('bash', [SCRIPT, 'capsbad', '--root', root, '--no-image-check'], {
      encoding: 'utf8',
      env: { ...process.env, ...NO_WEB_ENV, [name]: value }
    })
    assert.notEqual(r.status, 0, `${name}=${value} rendered:\n${r.stdout}`)
    assert.match(r.stderr, why, `${name}=${value}`)
    assert.ok(r.stderr.includes(name), `${name}=${value}: the refusal must name the setting:\n${r.stderr}`)
    assert.equal(
      readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8'),
      CLONE_COMPOSE,
      `${name}=${value}`
    )
    assert.equal(existsSync(path.join(dir, '.docker-compose.yml.new')), false, `${name}=${value}`)
  }
})

// ── P0: per-site network and the access-key mount (tasks/todo-tch-opensource.md) ────────────────
test('P0: an isolated site is on its own network only, mails tracy-web by name, and mounts its key read-only', () => {
  const { root, dir } = makeSite('wpiso', {
    env: 'HOST_PORT=8081\nPLATFORM=wordpress\nDB_PASSWORD=secret\n',
    compose: CLONE_COMPOSE
  })
  writeFileSync(path.join(dir, 'network-isolated'), '')
  mkdirSync(path.join(root, '.site-access', 'wpiso'), { recursive: true })
  writeFileSync(path.join(root, '.site-access', 'wpiso', 'key.json'), '{}')
  render(root, 'wpiso', [], { TRACY_SITE_DNS: '172.30.0.53' })
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  assert.match(out, /^    networks: \[default\]$/m)
  assert.doesNotMatch(out, /tracy_tracy|^  tracy:/m, 'the shared network is gone from the file')
  assert.doesNotMatch(out, /^    dns:/m, 'no resolver on a network the site has left')
  assert.match(out, /TRACY_MAIL_URL: "http:\/\/tracy-web:8080\/_site-mail"/)
  assert.ok(out.includes(`- ${path.join(root, '.site-access', 'wpiso')}:/run/tracy-access:ro`), out)
})

test('P0: a site with no key and no marker renders exactly as before — shared network, no key mount', () => {
  const { root, dir } = makeSite('wpold', {
    env: 'HOST_PORT=8081\nPLATFORM=wordpress\nDB_PASSWORD=secret\n',
    compose: CLONE_COMPOSE
  })
  render(root, 'wpold')
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  assert.match(out, /^    networks: \[default, tracy\]$/m)
  assert.doesNotMatch(out, /\/run\/tracy-access/)
})

// ── a quickstart EmDash site keeps the template's own image ──────────────────────────────────
//
// A quickstart site runs `tracy/<template>-emdash:<version>` (plus `-tools`, the agent layer), built
// on the host from the release pinned in quickstarts.json — not from IMAGE_TAGS and not from a
// `tracy/emdash` tag. The strict re-render refused every one of them, so secure-site-access.sh could
// not isolate a single EmDash site (2 on prod1, 15 on dev, 26/10/2026).
const EMDASH_QUICKSTART_COMPOSE = (image) => `services:
  web:
    image: ${image}
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    ports:
      - "127.0.0.1:\${HOST_PORT:-8080}:4321"
`

test('P0: a quickstart EmDash site (-tools image) re-renders isolated, on exactly the image it runs', () => {
  for (const image of ['tracy/tracy-base-emdash:0.5.6-tools', 'tracy/tracy-business-emdash:1.7.23-tools']) {
    const { root, dir } = makeSite('emdiso', {
      env: 'HOST_PORT=8085\nPLATFORM=emdash\n',
      compose: EMDASH_QUICKSTART_COMPOSE(image)
    })
    mkdirSync(path.join(dir, 'data'), { recursive: true })
    writeFileSync(path.join(dir, 'network-isolated'), '')
    mkdirSync(path.join(root, '.site-access', 'emdiso'), { recursive: true })
    writeFileSync(path.join(root, '.site-access', 'emdiso', 'key.json'), '{}')
    render(root, 'emdiso')
    const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
    assert.equal(out.match(/^ {4}image: (.*)$/m)?.[1], image, out)
    assert.match(out, /^    networks: \[default\]$/m)
    assert.doesNotMatch(out, /tracy_tracy|^  tracy:/m, 'the shared network is gone from the file')
    assert.ok(out.includes(`- ${path.join(root, '.site-access', 'emdiso')}:/run/tracy-access:ro`), out)
  }
})

test('a quickstart EmDash image without -tools is kept too — a re-render never moves an image', () => {
  const image = 'tracy/tracy-business-emdash:1.7.23'
  const { root, dir } = makeSite('emdplain', {
    env: 'HOST_PORT=8086\nPLATFORM=emdash\n',
    compose: EMDASH_QUICKSTART_COMPOSE(image)
  })
  render(root, 'emdplain')
  const out = readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
  assert.equal(out.match(/^ {4}image: (.*)$/m)?.[1], image, out)
})

test("an EmDash site on an image outside Tracy's namespace is still refused, compose untouched", () => {
  const compose = EMDASH_QUICKSTART_COMPOSE('ghcr.io/someone/shop-emdash:1.0')
  const { root, dir } = makeSite('emdforeign', { env: 'HOST_PORT=8088\nPLATFORM=emdash\n', compose })
  assert.throws(() => render(root, 'emdforeign'), /refusing rather than moving it/)
  assert.equal(readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8'), compose)
})

test('an explicit PHP 8.1 image is refused before a running compose is rewritten', () => {
  const { root, dir } = makeSite('php81policy', {
    env: 'HOST_PORT=8099\nPLATFORM=wordpress\nDB_PASSWORD=secret\n',
    compose: CLONE_COMPOSE
  })
  assert.throws(
    () => render(root, 'php81policy', ['--image', 'wordpress:php8.1-apache']),
    /PHP 8\.1 is unsupported/
  )
  assert.equal(readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8'), CLONE_COMPOSE)
})
