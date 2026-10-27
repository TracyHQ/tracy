#!/usr/bin/env node
/**
 * The fleet half of site mail: a site's mail() reaches tracy-web through a shim, authenticated by a
 * per-site token (tasks/todo-mail-site-khach.md, the contract section).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/site-mail.test.mjs
 *
 * Pinned here, each one a silent failure if it drifts:
 *   - every web service variant render-compose.sh writes carries TRACY_MAIL_URL/LABEL/TOKEN — a
 *     variant without them is a site whose mail() says "not configured" forever;
 *   - the token the shell derives equals Node's createHmac over the same message — tracy-web
 *     recomputes it in Node, so one byte of difference is every site's mail answering 401;
 *   - the shim's exit status follows tracy-web's answer (that status IS mail()'s return value), it
 *     never forwards a sendmail flag, and it posts stdin byte for byte;
 *   - go-live's draft/live round trip gives back a customer's own mailer instead of forcing 'mail';
 *   - enable-site-mail.sh moves an existing site onto the image with the shim, writes the token,
 *     and refuses — changing nothing — when that image is not built.
 *
 * No daemon: the shim runs against a node:http server, and docker is a stub on PATH.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { emdashCompose, TOKEN_BIND } from './token-custody-cases.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.join(HERE, '..')
const RENDER = path.join(PKG, 'scripts/provision/render-compose.sh')
const TOKEN_LIB = path.join(PKG, 'scripts/lib/site-mail-token.sh')
const ROOTS_LIB = path.join(PKG, 'scripts/lib/roots.sh')
const JOOMLA = path.join(PKG, 'scripts/provision/platform/joomla.sh')
const ENABLE = path.join(PKG, 'scripts/provision/enable-site-mail.sh')
const SHIM = path.join(PKG, 'web/tracy-sendmail')
const TAGS = readFileSync(path.join(PKG, 'web/IMAGE_TAGS'), 'utf8')

const TEMP = []
const mkTemp = (prefix) => {
  const d = mkdtempSync(path.join(tmpdir(), prefix))
  TEMP.push(d)
  return d
}
after(() => {
  for (const d of TEMP) rmSync(d, { recursive: true, force: true })
})

/** What tracy-web computes — the reference every shell path must equal. */
const nodeToken = (secret, label) =>
  createHmac('sha256', secret).update(`site-mail:v1:${label}`).digest('hex')

/** The image IMAGE_TAGS names for a key. */
function taggedImage(key) {
  const line = TAGS.split('\n').find((row) => row.startsWith(`${key}=`))
  assert.ok(line, `web/IMAGE_TAGS has no line for ${key}`)
  return line.slice(key.length + 1)
}

// An environment with nothing from this machine's own tracy setup leaking in.
const CLEAN_ENV = (() => {
  const env = { ...process.env, TRACY_WEB_ENV_FILE: '/nonexistent', TRACY_HOOKS_ENV: '/nonexistent' }
  for (const k of ['TRACY_MAIL_URL', 'TRACY_NETWORK_PREFIX', 'HOST_SECRET', 'TRACY_HMAC_TOOL']) delete env[k]
  return env
})()

// ── render-compose: the three variables on every web service variant ─────────────────────────────

const DB = (name) => `services:
  db:
    image: mariadb:11
    command:
      - --sql-mode=NO_ENGINE_SUBSTITUTION
    environment:
      MARIADB_DATABASE: "${name}"
`
const VARIANTS = [
  // [label, .env, existing compose]
  [
    'wpclone',
    'HOST_PORT=8081\nPLATFORM=wordpress\nDB_PASSWORD=s\n',
    `${DB('wp')}
  web:
    image: wordpress:php8.3-apache
    entrypoint: ["apache2-foreground"]
`
  ],
  [
    'jclone',
    'HOST_PORT=8082\nPLATFORM=joomla\nDB_PASSWORD=s\n',
    `${DB('joomla')}
  web:
    image: joomla:5-apache
    entrypoint: ["apache2-foreground"]
`
  ],
  [
    'wpfresh',
    'HOST_PORT=8083\nPLATFORM=wordpress\nDB_PASSWORD=s\n',
    `${DB('wpfresh')}
  web:
    image: wordpress:apache
    environment:
      WORDPRESS_DB_HOST: db
`
  ],
  [
    'jfresh',
    'HOST_PORT=8084\nPLATFORM=joomla\nDB_PASSWORD=s\nJOOMLA_ADMIN_PASSWORD=x\n',
    `${DB('jfresh')}
  web:
    image: joomla:6-apache
    environment:
      JOOMLA_DB_HOST: db
`
  ],
  [
    'emsite',
    'HOST_PORT=8085\nPLATFORM=emdash\n',
    `services:
  web:
    image: tracy/emdash:1.2.3
`
  ]
]

function renderVariant([label, env, compose], extraEnv = {}) {
  const root = mkTemp('site-mail-render-')
  const dir = path.join(root, label)
  mkdirSync(path.join(dir, 'data'), { recursive: true })
  mkdirSync(path.join(dir, 'uploads'), { recursive: true })
  writeFileSync(path.join(dir, '.env'), env)
  writeFileSync(path.join(dir, 'docker-compose.yml'), compose)
  const r = spawnSync('bash', [RENDER, label, '--root', root, '--no-image-check'], {
    encoding: 'utf8',
    env: { ...CLEAN_ENV, ...extraEnv }
  })
  assert.equal(r.status, 0, `${label}: ${r.stderr}`)
  return readFileSync(path.join(dir, 'docker-compose.yml'), 'utf8')
}

/** The web service's `environment:` block, as its lines. */
function webEnvironment(out) {
  const web = out.slice(out.indexOf('\n  web:'))
  const at = web.indexOf('\n    environment:\n')
  assert.ok(at >= 0, `web service has no environment block:\n${web}`)
  const lines = []
  for (const line of web.slice(at + '\n    environment:\n'.length).split('\n')) {
    if (!line.startsWith('      ')) break
    lines.push(line.trim())
  }
  return lines
}

test('every web service variant carries TRACY_MAIL_URL, TRACY_MAIL_LABEL and TRACY_MAIL_TOKEN', () => {
  for (const variant of VARIANTS) {
    const label = variant[0]
    const out = renderVariant(variant)
    const env = webEnvironment(out)
    assert.ok(env.includes('TRACY_MAIL_URL: "http://172.30.0.10:8080/_site-mail"'), `${label}:\n${out}`)
    assert.ok(env.includes(`TRACY_MAIL_LABEL: "${label}"`), `${label}:\n${out}`)
    // Interpolated from the site's .env (0600), never written into the world-readable compose file.
    assert.ok(env.includes('TRACY_MAIL_TOKEN: "${TRACY_MAIL_TOKEN:-}"'), `${label}:\n${out}`)
    // Once, in the web service, and not on the database.
    assert.equal(out.split('TRACY_MAIL_LABEL:').length, 2, `${label}:\n${out}`)
    assert.ok(out.indexOf('TRACY_MAIL_URL') > out.indexOf('\n  web:'), `${label}:\n${out}`)
  }
})

test('the variables a variant already had are all still there beside the mail ones', () => {
  const byLabel = Object.fromEntries(VARIANTS.map((v) => [v[0], webEnvironment(renderVariant(v))]))
  assert.ok(byLabel.jfresh.includes('JOOMLA_DB_HOST: db'))
  assert.ok(byLabel.jfresh.includes('JOOMLA_DB_PREFIX: "tr_"'))
  assert.ok(byLabel.wpfresh.includes('WORDPRESS_TABLE_PREFIX: "tr_"'))
  assert.ok(byLabel.emsite.includes('TRACY_FRAME_ANCESTORS: "${TRACY_FRAME_ANCESTORS:-}"'))
  // A clone had no environment at all: its block is exactly the comment plus the three.
  assert.equal(byLabel.wpclone.length, 4, byLabel.wpclone.join('\n'))
  // The clone keeps the tell render-compose uses to know it is a clone: no installer variables.
  assert.ok(!byLabel.wpclone.some((l) => /_DB_HOST:/.test(l)))
})

test('the mail URL follows TRACY_NETWORK_PREFIX, the host env file, or TRACY_MAIL_URL outright', () => {
  const variant = VARIANTS[0]
  assert.match(
    renderVariant(variant, { TRACY_NETWORK_PREFIX: '10.90.0' }),
    /TRACY_MAIL_URL: "http:\/\/10\.90\.0\.10:8080\/_site-mail"/
  )
  const envFile = path.join(mkTemp('site-mail-hostenv-'), 'tracy-web.env')
  writeFileSync(envFile, 'OTHER=1\nTRACY_NETWORK_PREFIX="10.77.0"\n')
  assert.match(
    renderVariant(variant, { TRACY_WEB_ENV_FILE: envFile }),
    /TRACY_MAIL_URL: "http:\/\/10\.77\.0\.10:8080\/_site-mail"/
  )
  assert.match(
    renderVariant(variant, { TRACY_MAIL_URL: 'http://relay.example:9000/_site-mail' }),
    /TRACY_MAIL_URL: "http:\/\/relay\.example:9000\/_site-mail"/
  )
})

// ── the token ─────────────────────────────────────────────────────────────────────────────────────

function shellToken(label, env) {
  return spawnSync('bash', ['-c', '. "$1"; tracy_site_mail_token "$2"', '_', TOKEN_LIB, label], {
    encoding: 'utf8',
    env: { ...CLEAN_ENV, ...env }
  })
}

test('the shell token equals createHmac over "site-mail:v1:"+label, through openssl and through python3', () => {
  const secret = 's3cr3t with spaces & $ymbols'
  for (const tool of ['openssl', 'python3']) {
    for (const label of ['joomlart-com-0871462c', 'a', 'x.y_z-1']) {
      const r = shellToken(label, { HOST_SECRET: secret, TRACY_HMAC_TOOL: tool })
      assert.equal(r.status, 0, `${tool}: ${r.stderr}`)
      assert.equal(r.stdout, nodeToken(secret, label), `${tool} for ${label}`)
    }
  }
  // Auto-selected tool, same answer.
  assert.equal(shellToken('auto', { HOST_SECRET: secret }).stdout, nodeToken(secret, 'auto'))
})

test('the token reads HOST_SECRET from hooks.env when the environment has none, and fails without one', () => {
  const hooks = path.join(mkTemp('site-mail-hooks-'), 'hooks.env')
  writeFileSync(hooks, 'FLEET_RELAY_SECRET=other\nHOST_SECRET=from-file\n')
  const r = shellToken('site1', { TRACY_HOOKS_ENV: hooks })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, nodeToken('from-file', 'site1'))

  const none = shellToken('site1', {})
  assert.notEqual(none.status, 0)
  assert.equal(none.stdout, '')
  assert.match(none.stderr, /HOST_SECRET is not set/)
})

// ── the shim ──────────────────────────────────────────────────────────────────────────────────────

/** A one-shot tracy-web stand-in: records the request, answers with `status` and a JSON body. */
async function withRelay(status, fn) {
  const seen = []
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) })
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(status < 300 ? { ok: true, id: 'm1' } : { code: 'SITE_MAIL_TEST' }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/_site-mail`
  try {
    return await fn(url, seen)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

/** Run the shim asynchronously (the relay lives in this process), feeding `input` on stdin. */
function runShim(args, env, input) {
  return new Promise((resolve) => {
    const child = spawn('sh', [SHIM, ...args], { env: { ...CLEAN_ENV, ...env } })
    let stderr = ''
    child.stderr.on('data', (c) => {
      stderr += c
    })
    child.on('close', (code) => resolve({ code, stderr }))
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

// CRLF line ends, a UTF-8 subject, and a byte that is not valid UTF-8: all must arrive untouched.
const MESSAGE = Buffer.concat([
  Buffer.from(
    'From: "Shop" <shop@example.com>\r\nTo: buyer@example.net\r\nSubject: =?UTF-8?B?w4LDqg==?=\r\n\r\nLine one\r\n.\r\nLàst line\r\n',
    'utf8'
  ),
  Buffer.from([0xff, 0x00, 0x0a])
])

test('the shim posts stdin byte for byte with the site and token headers, and exits 0 on 2xx', async () => {
  await withRelay(200, async (url, seen) => {
    const r = await runShim(
      ['-t', '-i', '-f', 'bounce@example.com', '-oi', '-Fsomeone', '--', 'rcpt@example.org'],
      { TRACY_MAIL_URL: url, TRACY_MAIL_LABEL: 'site-a', TRACY_MAIL_TOKEN: 'abc123' },
      MESSAGE
    )
    assert.equal(r.code, 0, r.stderr)
    assert.equal(seen.length, 1)
    const [req] = seen
    assert.equal(req.method, 'POST')
    assert.equal(req.url, '/_site-mail')
    assert.equal(req.headers['x-tracy-site'], 'site-a')
    assert.equal(req.headers['x-tracy-token'], 'abc123')
    assert.equal(req.headers['content-type'], 'message/rfc822')
    assert.ok(req.body.equals(MESSAGE), 'the body must be the message, byte for byte')
    // No sendmail flag or command-line recipient travels anywhere: not in the URL, not in a header.
    const everything = JSON.stringify(req.headers) + req.url
    for (const leak of ['bounce@example.com', 'rcpt@example.org', 'someone']) {
      assert.ok(!everything.includes(leak), `${leak} must not be forwarded`)
    }
  })
})

test('the shim exits non-zero on 4xx (69) and on 429/5xx (75), naming the answer on stderr', async () => {
  const env = (url) => ({ TRACY_MAIL_URL: url, TRACY_MAIL_LABEL: 'site-a', TRACY_MAIL_TOKEN: 't' })
  for (const [status, code] of [
    [401, 69],
    [403, 69],
    [413, 69],
    [429, 75],
    [500, 75],
    [502, 75],
    [503, 75]
  ]) {
    await withRelay(status, async (url) => {
      const r = await runShim(['-t', '-i'], env(url), MESSAGE)
      assert.equal(r.code, code, `HTTP ${status}: ${r.stderr}`)
      assert.match(r.stderr, new RegExp(`${status}`))
      assert.match(r.stderr, /SITE_MAIL_TEST/)
    })
  }
})

test('the shim exits 75 when a variable is missing, and when tracy-web cannot be reached', async () => {
  const full = { TRACY_MAIL_URL: 'http://127.0.0.1:9/x', TRACY_MAIL_LABEL: 'l', TRACY_MAIL_TOKEN: 't' }
  for (const drop of ['TRACY_MAIL_URL', 'TRACY_MAIL_LABEL', 'TRACY_MAIL_TOKEN']) {
    const env = { ...full, [drop]: '' }
    const r = await runShim(['-t', '-i'], env, MESSAGE)
    assert.equal(r.code, 75, `${drop}: ${r.stderr}`)
    assert.match(r.stderr, new RegExp(`missing:.*${drop}`))
  }
  // Port 9 (discard) on loopback: nothing listens, curl fails to connect.
  const r = await runShim(['-t', '-i'], full, MESSAGE)
  assert.equal(r.code, 75, r.stderr)
  assert.match(r.stderr, /could not reach/)
})

// ── platform_set_mail: the draft/live round trip ─────────────────────────────────────────────────

function joomlaSite(mailer) {
  const sites = mkTemp('site-mail-sites-')
  const priv = mkTemp('site-mail-private-')
  const label = 'jsite'
  const webroot = path.join(sites, label, '.webroot')
  mkdirSync(webroot, { recursive: true })
  mkdirSync(path.join(priv, label), { recursive: true })
  const config = path.join(webroot, 'configuration.php')
  writeFileSync(
    config,
    [
      '<?php',
      'class JConfig {',
      `\tpublic $mailer = '${mailer}';`,
      "\tpublic $mailfrom = 'owner@example.com';",
      "\tpublic $smtphost = 'smtp.example.com';",
      "\tpublic $smtpuser = 'owner';",
      "\tpublic $smtppass = 'pw';",
      "\tpublic $smtpport = '587';",
      '}',
      ''
    ].join('\n')
  )
  chmodSync(config, 0o640)
  return { sites, siteDir: path.join(priv, label), label, config }
}

function setMail(site, want) {
  const r = spawnSync(
    'bash',
    [
      '-c',
      'set -euo pipefail; . "$1"; tracy_web_image() { echo stub; }; . "$2"; platform_set_mail "$3"',
      '_',
      ROOTS_LIB,
      JOOMLA,
      want
    ],
    {
      encoding: 'utf8',
      env: { ...CLEAN_ENV, TRACY_SITES_ROOT: site.sites, LABEL: site.label, SITE_DIR: site.siteDir }
    }
  )
  assert.equal(r.status, 0, `platform_set_mail ${want}: ${r.stderr}`)
  return r.stdout
}

const mailerOf = (config) => /\$mailer\s*=\s*'([^']*)'/.exec(readFileSync(config, 'utf8'))[1]
const memoOf = (site) => path.join(site.siteDir, '.mail-before-draft')

test("a customer's smtp survives draft then live, and the smtp keys are never touched", () => {
  const site = joomlaSite('smtp')
  const before = readFileSync(site.config, 'utf8')

  setMail(site, 'off')
  assert.equal(mailerOf(site.config), 'none')
  assert.equal(readFileSync(memoOf(site), 'utf8'), 'smtp\n')
  assert.equal(statSync(memoOf(site)).mode & 0o777, 0o600)

  // A second draft must not overwrite the memory with 'none'.
  setMail(site, 'off')
  assert.equal(readFileSync(memoOf(site), 'utf8'), 'smtp\n')

  assert.match(setMail(site, 'on'), /mailer = smtp \(restored\)/)
  assert.equal(mailerOf(site.config), 'smtp')
  assert.ok(!existsSync(memoOf(site)), 'the memory is forgotten once it has been put back')
  // Byte for byte what it was, and the file keeps its mode (Apache reads it on every request).
  assert.equal(readFileSync(site.config, 'utf8'), before)
  assert.equal(statSync(site.config).mode & 0o777, 0o640)
})

test('plain mail -> draft -> live gives mail; live with nothing remembered gives mail', () => {
  const site = joomlaSite('mail')
  setMail(site, 'off')
  assert.equal(mailerOf(site.config), 'none')
  setMail(site, 'on')
  assert.equal(mailerOf(site.config), 'mail')

  // A clone arrives on 'none' from render_configuration.py with no memory: first go-live = 'mail'.
  const fresh = joomlaSite('none')
  setMail(fresh, 'on')
  assert.equal(mailerOf(fresh.config), 'mail')
  assert.ok(!existsSync(memoOf(fresh)))
})

test('a memory that is not a plain word is not written into the PHP file', () => {
  const site = joomlaSite('none')
  writeFileSync(memoOf(site), "smtp'; system('id'); //\n")
  setMail(site, 'on')
  assert.equal(mailerOf(site.config), 'mail')
  assert.ok(!readFileSync(site.config, 'utf8').includes('system'))
})

// ── enable-site-mail.sh ───────────────────────────────────────────────────────────────────────────

/**
 * A docker stub: `image inspect` knows the images in DOCKER_IMAGES (name=label value, "-" for an
 * image built without the label), `compose up` succeeds, `compose exec` answers like a container
 * whose env came from the site's .env and compose, `compose ps` names DOCKER_WEB_CID (or exits
 * DOCKER_PS_EXIT), and a root
 * `exec … cat /run/tracy-agent.token` reads DOCKER_MOUNTED_TOKEN (what the running bind holds).
 * Every call is appended to DOCKER_LOG.
 */
const DOCKER_STUB_BODY = `#!/usr/bin/env bash
echo "$*" >> "$DOCKER_LOG"
if [ "$1" = image ] && [ "$2" = inspect ]; then
  img="\${@: -1}"
  for pair in $DOCKER_IMAGES; do
    name="\${pair%%=*}"; value="\${pair#*=}"
    if [ "$name" = "$img" ]; then
      case "$*" in *--format*) [ "$value" = - ] && echo "<no value>" || echo "$value" ;; esac
      exit 0
    fi
  done
  echo "Error: No such image: $img" >&2; exit 1
fi
if [ "$1" = compose ] && [ "$2" = up ]; then exit "\${DOCKER_UP_EXIT:-0}"; fi
if [ "$1" = compose ] && [ "$2" = ps ]; then
  [ "\${DOCKER_PS_EXIT:-0}" = 0 ] || exit "$DOCKER_PS_EXIT"
  printf '%s\n' "\${DOCKER_WEB_CID:-}"; exit 0
fi
if [ "$1" = exec ] && [ "$2" = -u ] && [ "$3" = 0 ] && [ "$5 $6" = "cat /run/tracy-agent.token" ]; then
  [ -n "\${DOCKER_MOUNTED_TOKEN:-}" ] || exit 1
  cat "$DOCKER_MOUNTED_TOKEN"; exit 0
fi
if [ "$1" = compose ] && [ "$2" = exec ]; then
  label="$(sed -n 's/^ *TRACY_MAIL_LABEL: *"\\(.*\\)"$/\\1/p' docker-compose.yml)"
  grep -q '^TRACY_MAIL_TOKEN=' .env && printf '%s' "$label"
  exit 0
fi
exit 0
`

// Written and run once per file: a fresh executable per case is scanned by macOS on its first run (~100 ms).
let dockerStubDir
function dockerStub() {
  if (!dockerStubDir) {
    dockerStubDir = mkTemp('site-mail-docker-')
    const bin = path.join(dockerStubDir, 'docker')
    writeFileSync(bin, DOCKER_STUB_BODY)
    chmodSync(bin, 0o755)
    spawnSync(bin, ['version'], { env: { ...CLEAN_ENV, DOCKER_LOG: '/dev/null' }, stdio: 'ignore' })
  }
  return dockerStubDir
}

function enableSite(compose) {
  const root = mkTemp('site-mail-enable-')
  const label = 'oldwp'
  const dir = path.join(root, label)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, '.env'), 'HOST_PORT=8090\nPLATFORM=wordpress\nDB_PASSWORD=pw\n')
  chmodSync(path.join(dir, '.env'), 0o600)
  writeFileSync(path.join(dir, 'docker-compose.yml'), compose)
  return { root, label, dir }
}

function runEnable(site, { images, args = [], env = {} } = {}) {
  const log = path.join(site.root, 'docker.log')
  const r = spawnSync('bash', [ENABLE, '--label', site.label, '--root', site.root, ...args], {
    encoding: 'utf8',
    env: {
      ...CLEAN_ENV,
      PATH: `${dockerStub()}:${process.env.PATH}`,
      DOCKER_LOG: log,
      DOCKER_IMAGES: images,
      HOST_SECRET: 'host-secret',
      TRACY_SITES_ROOT: path.join(site.root, 'sites'),
      ...env
    }
  })
  return { ...r, log: existsSync(log) ? readFileSync(log, 'utf8') : '' }
}

const OLD_WP = `${DB('wordpress')}
  web:
    image: tracy/web-wordpress:php8.2-apache-20260906-r1
    restart: unless-stopped
    entrypoint: ["apache2-foreground"]
`

test('enable-site-mail moves an old site to the same-PHP image with the shim, writes the token, recreates only web', () => {
  const site = enableSite(OLD_WP)
  const target = taggedImage('wordpress:php8.2-apache')
  const r = runEnable(site, { images: `${target}=v1` })
  assert.equal(r.status, 0, r.stderr + r.stdout)

  const env = readFileSync(path.join(site.dir, '.env'), 'utf8')
  assert.ok(env.includes(`TRACY_MAIL_TOKEN=${nodeToken('host-secret', 'oldwp')}\n`), env)
  assert.ok(env.includes('DB_PASSWORD=pw\n'), 'the rest of .env survives')
  assert.equal(statSync(path.join(site.dir, '.env')).mode & 0o777, 0o600)
  assert.ok(!r.stdout.includes(nodeToken('host-secret', 'oldwp')), 'the token is never printed')

  const compose = readFileSync(path.join(site.dir, 'docker-compose.yml'), 'utf8')
  assert.ok(compose.includes(`image: ${target}`), compose)
  assert.ok(compose.includes('TRACY_MAIL_LABEL: "oldwp"'), compose)
  assert.match(r.log, /^compose up -d --no-deps web$/m)
  assert.match(r.stdout, /site mail enabled/)
  assert.ok(existsSync(path.join(site.dir, '.docker-compose.yml.before-site-mail')))
})

test('enable-site-mail run twice changes nothing the second time', () => {
  const site = enableSite(OLD_WP)
  const images = `${taggedImage('wordpress:php8.2-apache')}=v1`
  assert.equal(runEnable(site, { images }).status, 0)
  const envBefore = readFileSync(path.join(site.dir, '.env'), 'utf8')
  const composeBefore = readFileSync(path.join(site.dir, 'docker-compose.yml'), 'utf8')

  const again = runEnable(site, { images })
  assert.equal(again.status, 0, again.stderr)
  assert.match(again.stdout, /token: already in \.env/)
  assert.match(again.stdout, /compose: unchanged/)
  assert.equal(readFileSync(path.join(site.dir, '.env'), 'utf8'), envBefore)
  assert.equal(readFileSync(path.join(site.dir, 'docker-compose.yml'), 'utf8'), composeBefore)
})

test('enable-site-mail replaces a token that no longer matches the host secret', () => {
  const site = enableSite(OLD_WP)
  writeFileSync(path.join(site.dir, '.env'), 'HOST_PORT=8090\nTRACY_MAIL_TOKEN=stale\nDB_PASSWORD=pw\n')
  const r = runEnable(site, { images: `${taggedImage('wordpress:php8.2-apache')}=v1` })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /token: replaced/)
  const env = readFileSync(path.join(site.dir, '.env'), 'utf8')
  assert.equal(env.match(/^TRACY_MAIL_TOKEN=/gm).length, 1, env)
  assert.ok(!env.includes('stale'))
})

test('enable-site-mail refuses, changing nothing, when the target image lacks the shim or is not built', () => {
  for (const images of [`${taggedImage('wordpress:php8.2-apache')}=-`, 'nothing=v1']) {
    const site = enableSite(OLD_WP)
    const envBefore = readFileSync(path.join(site.dir, '.env'), 'utf8')
    const r = runEnable(site, { images })
    assert.notEqual(r.status, 0, `${images}: ${r.stdout}`)
    assert.equal(readFileSync(path.join(site.dir, '.env'), 'utf8'), envBefore)
    assert.equal(readFileSync(path.join(site.dir, 'docker-compose.yml'), 'utf8'), OLD_WP)
    assert.doesNotMatch(r.log, /compose up/)
  }
})

test('enable-site-mail refuses unknown arguments and labels that are not plain names', () => {
  const site = enableSite(OLD_WP)
  const unknown = runEnable(site, { images: '', args: ['--apply'] })
  assert.equal(unknown.status, 2)
  assert.match(unknown.stderr, /unknown argument: --apply/)
  for (const bad of ['../etc', '.hidden', 'a/b']) {
    const r = spawnSync('bash', [ENABLE, '--label', bad], { encoding: 'utf8', env: CLEAN_ENV })
    assert.equal(r.status, 2, bad)
  }
})

test('enable-site-mail puts the previous compose back when the recreate fails', () => {
  const site = enableSite(OLD_WP)
  const r = runEnable(site, {
    images: `${taggedImage('wordpress:php8.2-apache')}=v1`,
    env: { DOCKER_UP_EXIT: '1' }
  })
  assert.notEqual(r.status, 0)
  assert.equal(readFileSync(path.join(site.dir, 'docker-compose.yml'), 'utf8'), OLD_WP)
  assert.match(r.stderr, /putting the previous one back/)
})

// ── enable-site-mail.sh on EmDash: the agent-token custody the re-render installs ─────────────────
//
// render-compose.sh always writes the read-only token bind (#155) for EmDash, so re-rendering an
// EmDash site IS installing that bind. The script moves only a site already under the protected
// mount with a verified host token and a running reader holding that same token; every other state
// is the token-mount migration's or the staged recovery's (emdash/README.md) and must be refused
// with nothing written — not the .env, not the compose, no recreate.

const EMDASH_IMAGE = 'tracy/web-emdash:0.37.0'
const HOST_TOKEN = 'ec_pat_host-token-value'
const OWNER = { TRACY_TOKEN_OWNER_UID: String(process.getuid()) }

function emdashSite({ token = 'generator', hostToken = HOST_TOKEN } = {}) {
  const root = mkTemp('site-mail-emdash-')
  const label = 'oldemdash'
  const dir = path.join(root, label)
  mkdirSync(path.join(dir, 'data'), { recursive: true })
  mkdirSync(path.join(dir, 'uploads'), { recursive: true })
  writeFileSync(
    path.join(dir, '.env'),
    'HOST_PORT=8091\nPLATFORM=emdash\nEMDASH_ENCRYPTION_KEY=k\nEMDASH_SITE_URL=https://oldemdash.example\n'
  )
  chmodSync(path.join(dir, '.env'), 0o600)
  const compose = emdashCompose(dir, { token, image: EMDASH_IMAGE, sitesRoot: path.join(root, 'sites') })
  writeFileSync(path.join(dir, 'docker-compose.yml'), compose)
  if (hostToken !== null) {
    writeFileSync(path.join(dir, 'tracy-agent.token'), `${hostToken}\n`)
    chmodSync(path.join(dir, 'tracy-agent.token'), 0o600)
  }
  // What the running container's bind reads; by default the host token itself.
  const mounted = path.join(root, 'mounted.token')
  writeFileSync(mounted, `${hostToken ?? ''}\n`)
  return { root, label, dir, compose, mounted }
}

function runEmdash(site, env = {}, args = []) {
  return runEnable(site, {
    images: `${EMDASH_IMAGE}=v1`,
    args,
    env: { ...OWNER, DOCKER_WEB_CID: 'cid-oldemdash', DOCKER_MOUNTED_TOKEN: site.mounted, ...env }
  })
}

function assertUntouched(site, r, what) {
  assert.notEqual(r.status, 0, `${what}: ${r.stdout}`)
  assert.match(r.stderr, /nothing changed/, what)
  assert.equal(readFileSync(path.join(site.dir, 'docker-compose.yml'), 'utf8'), site.compose, what)
  assert.doesNotMatch(readFileSync(path.join(site.dir, '.env'), 'utf8'), /TRACY_MAIL_TOKEN=/, what)
  assert.ok(!existsSync(path.join(site.dir, '.docker-compose.yml.before-site-mail')), what)
  assert.doesNotMatch(r.log, /compose up/, what)
  assert.ok(
    !r.stdout.includes(HOST_TOKEN) && !r.stderr.includes(HOST_TOKEN),
    'the agent token is never printed'
  )
}

test('enable-site-mail moves a protected EmDash site: bind kept, mail run added, reader proven first', () => {
  const site = emdashSite()
  const r = runEmdash(site)
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.match(r.stdout, /agent token: protected read-only mount, host token verified/)
  const compose = readFileSync(path.join(site.dir, 'docker-compose.yml'), 'utf8')
  assert.equal(compose.split('\n').filter((l) => l === TOKEN_BIND).length, 1, compose)
  assert.ok(compose.includes('TRACY_MAIL_LABEL: "oldemdash"'), compose)
  // The reader was asked BEFORE the recreate.
  const lines = r.log.split('\n')
  const read = lines.findIndex((l) => l === 'exec -u 0 cid-oldemdash cat /run/tracy-agent.token')
  const up = lines.findIndex((l) => l === 'compose up -d --no-deps web')
  assert.ok(read >= 0 && up > read, r.log)
  assert.equal(readFileSync(path.join(site.dir, 'tracy-agent.token'), 'utf8'), `${HOST_TOKEN}\n`)
  assert.ok(!r.stdout.includes(HOST_TOKEN), 'the agent token is never printed')
})

test('enable-site-mail moves a site the token-mount migration left (bind first or last)', () => {
  for (const token of ['first', 'last']) {
    const site = emdashSite({ token })
    const r = runEmdash(site)
    assert.equal(r.status, 0, `${token}: ${r.stderr}`)
    const compose = readFileSync(path.join(site.dir, 'docker-compose.yml'), 'utf8')
    assert.equal(compose.split('\n').filter((l) => l === TOKEN_BIND).length, 1, compose)
  }
})

test('enable-site-mail refuses a pre-#155 EmDash site, with or without a host token, changing nothing', () => {
  for (const hostToken of [null, HOST_TOKEN]) {
    const site = emdashSite({ token: 'none', hostToken })
    const r = runEmdash(site)
    assertUntouched(site, r, `pre-#155, host token ${hostToken ? 'present' : 'absent'}`)
    assert.match(r.stderr, /migrate-token-mount/)
    assert.equal(existsSync(path.join(site.dir, 'tracy-agent.token')), hostToken !== null)
  }
})

test('enable-site-mail refuses an EmDash compose that is not a fleet form, changing nothing', () => {
  const site = emdashSite()
  site.compose = site.compose.replace('    restart: unless-stopped', '    restart: always')
  writeFileSync(path.join(site.dir, 'docker-compose.yml'), site.compose)
  assertUntouched(site, runEmdash(site), 'hand-edited compose')
})

test('enable-site-mail refuses an EmDash host token that is not one root-owned 0600 regular file', () => {
  const cases = {
    missing: (s) => rmSync(path.join(s.dir, 'tracy-agent.token')),
    'wider mode': (s) => chmodSync(path.join(s.dir, 'tracy-agent.token'), 0o644),
    empty: (s) => writeFileSync(path.join(s.dir, 'tracy-agent.token'), ''),
    symlink: (s) => {
      const t = path.join(s.dir, 'tracy-agent.token')
      writeFileSync(path.join(s.dir, 'data', 'tracy-agent.token'), `${HOST_TOKEN}\n`, { mode: 0o600 })
      rmSync(t)
      symlinkSync(path.join(s.dir, 'data', 'tracy-agent.token'), t)
    }
  }
  for (const [what, arrange] of Object.entries(cases)) {
    const site = emdashSite()
    arrange(site)
    assertUntouched(site, runEmdash(site), what)
  }
  const site = emdashSite()
  assertUntouched(
    site,
    runEmdash(site, { TRACY_TOKEN_OWNER_UID: String(process.getuid() + 1) }),
    'another owner'
  )
})

test('enable-site-mail refuses when the running EmDash reader holds a different token (stale inode)', () => {
  const site = emdashSite()
  writeFileSync(site.mounted, 'ec_pat_the-old-inode\n')
  assertUntouched(site, runEmdash(site), 'stale inode')
  const unreadable = emdashSite()
  assertUntouched(unreadable, runEmdash(unreadable, { DOCKER_MOUNTED_TOKEN: '' }), 'no mounted token')
})

test('enable-site-mail compares EmDash tokens as the reader does: trimmed, shape-checked, inner whitespace kept', () => {
  // The reader trims and then demands the whole PAT shape, so inner whitespace is not noise: a host
  // token that differs from the mounted one only by a space inside is a DIFFERENT (malformed) token.
  const inner = emdashSite({ hostToken: 'ec_pat_abcdefgh ijklmnop' })
  writeFileSync(inner.mounted, 'ec_pat_abcdefghijklmnop\n')
  assertUntouched(inner, runEmdash(inner), 'inner whitespace in the host token')
  for (const [what, hostToken] of Object.entries({
    'too short': 'ec_pat_short',
    'wrong prefix': 'pat_abcdefghijklmnopqrst',
    'two lines': 'ec_pat_abcdefghijklmnop\nec_pat_qrstuvwxyzabcdef'
  })) {
    const site = emdashSite({ hostToken })
    assertUntouched(site, runEmdash(site), what)
  }
  // Leading and trailing whitespace is what the reader's trim() drops, on either side.
  const padded = emdashSite({ hostToken: `  \t${HOST_TOKEN}\r` })
  writeFileSync(padded.mounted, HOST_TOKEN)
  const r = runEmdash(padded)
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.ok(
    !r.stdout.includes(HOST_TOKEN) && !r.stderr.includes(HOST_TOKEN),
    'the agent token is never printed'
  )
})

test('enable-site-mail proves the running EmDash reader with --no-start too, and refuses an unproven runtime', () => {
  const cases = {
    'no running container': [{ DOCKER_WEB_CID: '' }, []],
    'no running container, --no-start': [{ DOCKER_WEB_CID: '' }, ['--no-start']],
    'compose ps failed': [{ DOCKER_PS_EXIT: '1' }, []],
    'compose ps failed, --no-start': [{ DOCKER_PS_EXIT: '1' }, ['--no-start']],
    'stale inode, --no-start': [{}, ['--no-start']]
  }
  for (const [what, [env, args]] of Object.entries(cases)) {
    const site = emdashSite()
    if (what.startsWith('stale')) writeFileSync(site.mounted, 'ec_pat_the-old-inode\n')
    assertUntouched(site, runEmdash(site, env, args), what)
  }
  // Proven: --no-start writes the token and compose, and recreates nothing.
  const site = emdashSite()
  const r = runEmdash(site, {}, ['--no-start'])
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.match(r.log, /exec -u 0 cid-oldemdash cat \/run\/tracy-agent\.token/)
  assert.doesNotMatch(r.log, /compose up/)
  assert.match(readFileSync(path.join(site.dir, '.env'), 'utf8'), /^TRACY_MAIL_TOKEN=/m)
})
