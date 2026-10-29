#!/usr/bin/env node
/**
 * A site does not land on, or stay on, a bare upstream web image while its base has an IMAGE_TAGS
 * line. The upstream image has no chromium and no node, so the visual check of every edit on such a
 * site answers NO_BROWSER (7 customer turns on prod1, all Joomla).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/web-image-never-upstream.test.mjs
 *
 * Pinned here:
 *   - the resolver, asked by a provision (TRACY_WEB_IMAGE_BUILD=1), BUILDS the one missing line
 *     (web/build.sh --line) and answers the Tracy image; only a failed build leaves the new site on
 *     the upstream base, with a block on stderr naming the two commands that fix it;
 *   - nothing that build prints reaches stdout (it would become part of the image name) or starts
 *     with `==` (tracy-host would show it to the customer as a Build step);
 *   - without the switch (go-live, restore, snapshot) and in the strict stance nothing is built,
 *     and a base with no line keeps today's behaviour;
 *   - each platform file resolves exactly ONE base, so a quickstart never builds the clone's image;
 *   - web/build.sh --line builds exactly that line, and finds the Joomla skill tree on a fleet host;
 *   - move-off-upstream-image.sh lists, dry-runs, and moves one site to the line for the SAME base,
 *     putting the old compose back when the moved container does not prove itself.
 *
 * No daemon: docker is a bash stub on PATH that keeps a list of "built" images in a file.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.join(HERE, '..')
const LIB = path.join(PKG, 'scripts/lib/web-image.sh')
const PROVISION = path.join(PKG, 'scripts/provision')
const MOVER = path.join(PROVISION, 'move-off-upstream-image.sh')
const WEB = path.join(PKG, 'web')
const TAGS = readFileSync(path.join(WEB, 'IMAGE_TAGS'), 'utf8')

const TEMP = []
const mkTemp = (prefix) => {
  const d = mkdtempSync(path.join(tmpdir(), prefix))
  TEMP.push(d)
  return d
}
after(() => {
  for (const d of TEMP) rmSync(d, { recursive: true, force: true })
})

/** The image IMAGE_TAGS names for a key. */
function line(key) {
  const row = TAGS.split('\n').find((r) => r.startsWith(`${key}=`))
  assert.ok(row, `web/IMAGE_TAGS has no line for ${key}`)
  return row.slice(key.length + 1)
}

/**
 * docker, as a stub: `image inspect` answers from $DOCKER_STATE/images, `build … -t X` adds X there
 * (or fails with DOCKER_BUILD_FAIL=1), `run` exits DOCKER_RUN_EXIT, container `inspect` prints
 * DOCKER_CONTAINER_STATE, `compose ps` names DOCKER_WEB_CID, `compose up` exits DOCKER_UP_EXIT, and
 * `compose exec` answers like the image the site's compose names: a tracy/web-* one has the tools
 * (unless DOCKER_TOOLS_EXIT says otherwise) and answers DOCKER_HOME_AFTER; an upstream one has none
 * and answers DOCKER_HOME_BEFORE. Every call is appended to DOCKER_LOG.
 */
const DOCKER_STUB = `#!/usr/bin/env bash
echo "$*" >> "$DOCKER_LOG"
images="$DOCKER_STATE/images"
touch "$images"
web_image() { sed -n 's/^ *image: *//p' docker-compose.yml | grep -v '^mariadb' | head -1; }
case "$1" in
  image)
    [ "$2" = inspect ] || exit 0
    img="\${@: -1}"
    grep -qxF -- "$img" "$images" && exit 0
    echo "Error: No such image: $img" >&2; exit 1 ;;
  build)
    prev=""; tag=""
    for a in "$@"; do [ "$prev" = -t ] && tag="$a"; prev="$a"; done
    echo "#1 [internal] load build definition for $tag"
    if [ "\${DOCKER_BUILD_FAIL:-0}" = 1 ]; then echo "ERROR: failed to solve: apt-get update" >&2; exit 1; fi
    echo "$tag" >> "$images"; exit 0 ;;
  run) exit "\${DOCKER_RUN_EXIT:-0}" ;;
  images) for i in \${DOCKER_EMDASH:-}; do echo "$i"; done; exit 0 ;;
  inspect) echo "\${DOCKER_CONTAINER_STATE:-running}"; exit 0 ;;
  compose)
    case "$2" in
      ps) printf '%s\\n' "\${DOCKER_WEB_CID:-}"; exit 0 ;;
      up) exit "\${DOCKER_UP_EXIT:-0}" ;;
      exec)
        img="$(web_image)"
        case "$*" in
          *"-u www-data"*) case "$img" in tracy/web-*) exit "\${DOCKER_TOOLS_EXIT:-0}" ;; *) exit 1 ;; esac ;;
          *"php -r"*) case "$img" in tracy/web-*) printf '%s' "\${DOCKER_HOME_AFTER:-200}" ;; *) printf '%s' "\${DOCKER_HOME_BEFORE:-200}" ;; esac; exit 0 ;;
        esac ;;
    esac ;;
esac
exit 0
`

// Written and run once per file: a fresh executable per case is scanned by macOS on its first run.
let stubDir
function dockerStub() {
  if (!stubDir) {
    stubDir = mkTemp('web-image-docker-')
    const bin = path.join(stubDir, 'docker')
    writeFileSync(bin, DOCKER_STUB)
    chmodSync(bin, 0o755)
    spawnSync(bin, ['version'], { env: { ...process.env, DOCKER_LOG: '/dev/null', DOCKER_STATE: stubDir } })
  }
  return stubDir
}

/** A clean docker world: its own image list and call log. */
function world(built = []) {
  const dir = mkTemp('web-image-world-')
  writeFileSync(path.join(dir, 'images'), built.map((i) => `${i}\n`).join(''))
  const log = path.join(dir, 'docker.log')
  writeFileSync(log, '')
  return {
    dir,
    log,
    env: {
      PATH: `${dockerStub()}:${process.env.PATH}`,
      DOCKER_STATE: dir,
      DOCKER_LOG: log,
      TRACY_WEB_IMAGE_BUILD_LOCK: path.join(dir, 'build.lock')
    },
    calls: () => readFileSync(log, 'utf8'),
    builds: () =>
      readFileSync(log, 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('build '))
  }
}

const CLEAN = (() => {
  const env = { ...process.env }
  for (const k of [
    'TRACY_WEB_IMAGE',
    'TRACY_WEB_IMAGE_STRICT',
    'TRACY_WEB_IMAGE_CHECK',
    'TRACY_WEB_IMAGE_BUILD',
    'TRACY_WEB_IMAGE_TAGS',
    'TRACY_WEB_DIR',
    'LABEL'
  ])
    delete env[k]
  return env
})()

function resolve(w, platform, base, extra = {}) {
  return spawnSync('bash', ['-c', '. "$1"; tracy_web_image "$2" "$3"', '_', LIB, platform, base], {
    encoding: 'utf8',
    env: { ...CLEAN, ...w.env, ...extra }
  })
}

const noStepLines = (r) => {
  assert.doesNotMatch(r.stdout, /^==/m, 'a line starting with == becomes a customer-visible Build step')
  assert.doesNotMatch(r.stderr, /^==/m, 'stderr is merged into the Build stream on tracy-host')
}

// ── the resolver ───────────────────────────────────────────────────────────────────────────────────

test('a provision builds the one missing line and answers the Tracy image, never the upstream base', () => {
  const w = world()
  const want = line('joomla:5-apache')
  const r = resolve(w, 'joomla', 'joomla:5-apache', { TRACY_WEB_IMAGE_BUILD: '1' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, `${want}\n`, 'only the image on stdout: it is captured into WEB_IMAGE')
  assert.equal(w.builds().length, 1, w.calls())
  assert.match(
    w.builds()[0],
    new RegExp(`--build-arg BASE=joomla:5-apache .*-t ${want.replace(/[.]/g, '\\.')} `)
  )
  assert.match(r.stderr, /building it now: bash .*web\/build\.sh --line joomla:5-apache/)
  assert.match(r.stderr, /^ {3}\[web image\] /m, 'build output is on stderr, indented')
  assert.match(r.stderr, new RegExp(`${want.replace(/[.]/g, '\\.')} built — this site gets it`))
  noStepLines(r)
})

test('a failed build leaves the NEW site on its upstream base, loudly, naming the build and the mover', () => {
  const w = world()
  const want = line('joomla:6-apache')
  const r = resolve(w, 'joomla', 'joomla:6-apache', {
    TRACY_WEB_IMAGE_BUILD: '1',
    DOCKER_BUILD_FAIL: '1',
    LABEL: 'acme-com'
  })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'joomla:6-apache\n', 'same PHP: the lenient fallback is the base itself')
  assert.match(r.stderr, new RegExp(`!! ${want.replace(/[.]/g, '\\.')} COULD NOT BE BUILT on this host`))
  assert.match(r.stderr, /!! This NEW site runs the bare upstream image joomla:6-apache/)
  assert.match(r.stderr, /no\s*\n?!! chromium, node/)
  assert.match(r.stderr, /!! {3}bash .*\/web\/build\.sh --line joomla:6-apache/)
  assert.match(r.stderr, /!! {3}bash .*\/provision\/move-off-upstream-image\.sh --label acme-com --apply/)
  noStepLines(r)
})

test('without the switch (go-live, restore, snapshot source the platform too) nothing is built', () => {
  const w = world()
  const r = resolve(w, 'joomla', 'joomla:5-apache')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'joomla:5-apache\n')
  assert.equal(w.builds().length, 0, w.calls())
  assert.match(r.stderr, /is not built on this host/)
})

test('the strict stance never builds, and names the one-line build command', () => {
  const w = world()
  const r = resolve(w, 'joomla', 'joomla:5-apache', {
    TRACY_WEB_IMAGE_BUILD: '1',
    TRACY_WEB_IMAGE_STRICT: '1'
  })
  assert.notEqual(r.status, 0)
  assert.equal(r.stdout, '')
  assert.equal(w.builds().length, 0, w.calls())
  assert.match(r.stderr, /refusing rather than moving it/)
  assert.match(r.stderr, /web\/build\.sh --line joomla:5-apache/)
})

test('a base with no line keeps today’s behaviour: no build, the upstream base, one !! line', () => {
  const w = world()
  const r = resolve(w, 'wordpress', 'wordpress:php7.4-apache', { TRACY_WEB_IMAGE_BUILD: '1' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'wordpress:php7.4-apache\n')
  assert.equal(w.builds().length, 0)
  assert.match(r.stderr, /web\/IMAGE_TAGS has no line for wordpress:php7\.4-apache/)
})

test('an image already built is answered without a build', () => {
  const want = line('wordpress:php8.3-apache')
  const w = world([want])
  const r = resolve(w, 'wordpress', 'wordpress:php8.3-apache', { TRACY_WEB_IMAGE_BUILD: '1' })
  assert.equal(r.stdout, `${want}\n`)
  assert.equal(w.builds().length, 0)
})

test('a new site with no base builds the base line its platform default names', () => {
  const w = world()
  const want = line('joomla')
  const r = resolve(w, 'joomla', '', { TRACY_WEB_IMAGE_BUILD: '1' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, `${want}\n`)
  assert.equal(w.builds().length, 1)
  assert.ok(w.builds()[0].includes(`-t ${want} `), w.builds()[0])
})

test('unpatched PHP is still refused before any build', () => {
  const w = world()
  for (const base of ['joomla:4-apache', 'wordpress:php8.1-apache']) {
    const r = resolve(w, base.split(':')[0], base, { TRACY_WEB_IMAGE_BUILD: '1' })
    assert.notEqual(r.status, 0, base)
    assert.equal(r.stdout, '')
  }
  assert.equal(w.builds().length, 0)
})

// ── who asks for the build ───────────────────────────────────────────────────────────────────────

test('provision.sh turns the build on around the platform source only, and never exports it', () => {
  const src = readFileSync(path.join(PROVISION, 'provision.sh'), 'utf8')
  const code = src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
  const at = code.findIndex((l) => l.trim() === '. "$HERE/platform/$PLATFORM.sh"')
  assert.ok(at > 0, 'provision.sh no longer sources its platform file the way this test expects')
  assert.equal(code[at - 1].trim(), 'TRACY_WEB_IMAGE_BUILD=1')
  assert.equal(code[at + 1].trim(), 'unset TRACY_WEB_IMAGE_BUILD')
  const all = spawnSync('grep', ['-rn', 'TRACY_WEB_IMAGE_BUILD', path.join(PKG, 'scripts')], {
    encoding: 'utf8'
  }).stdout
  assert.doesNotMatch(all, /export[^\n]*TRACY_WEB_IMAGE_BUILD\b(?!_LOCK)/)
})

/** Source a platform file on one road and return the bases it resolved. */
function basesOf(platform, road) {
  const calls = path.join(mkTemp('platform-bases-'), 'calls')
  const script = String.raw`
tracy_web_image() { printf '%s\n' "$2" >> "$CALLS"; printf '%s\n' "$2"; }
tracy_webroot_dir() { printf '%s\n' "/nonexistent"; }
. "$HERE/platform/$PLATFORM.sh"
printf 'WEB_IMAGE=%s\n' "$WEB_IMAGE"`
  const r = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...CLEAN, HERE: PROVISION, PLATFORM: platform, CALLS: calls, FRESH: '0', QUICKSTART: '', ...road }
  })
  assert.equal(r.status, 0, r.stderr)
  return { bases: readFileSync(calls, 'utf8').trim().split('\n'), image: /WEB_IMAGE=(.*)/.exec(r.stdout)[1] }
}

test('each platform file resolves exactly one base per road, so a provision builds only its own', () => {
  assert.deepEqual(basesOf('joomla', {}), { bases: ['joomla:5-apache'], image: 'joomla:5-apache' })
  assert.deepEqual(basesOf('joomla', { FRESH: '1' }), {
    bases: ['joomla:6-apache'],
    image: 'joomla:6-apache'
  })
  assert.deepEqual(basesOf('joomla', { QUICKSTART: 'ja-x' }), {
    bases: ['joomla:6-apache'],
    image: 'joomla:6-apache'
  })
  assert.deepEqual(basesOf('wordpress', {}), {
    bases: ['wordpress:php8.3-apache'],
    image: 'wordpress:php8.3-apache'
  })
  assert.deepEqual(basesOf('wordpress', { FRESH: '1' }), {
    bases: ['wordpress:apache'],
    image: 'wordpress:apache'
  })
})

// ── web/build.sh --line ──────────────────────────────────────────────────────────────────────────

function buildSh(dir, args, w) {
  return spawnSync('bash', [path.join(dir, 'build.sh'), ...args], {
    encoding: 'utf8',
    env: { ...CLEAN, FORCE: '', ...w.env }
  })
}

test('build.sh --line builds exactly that line: no other image, no EmDash loop', () => {
  const w = world()
  const r = buildSh(WEB, ['--line', 'wordpress:php8.2-apache'], w)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(w.builds().length, 1, w.calls())
  assert.ok(w.builds()[0].includes(`-t ${line('wordpress:php8.2-apache')} `), w.builds()[0])
  assert.doesNotMatch(w.calls(), /^images /m, 'the EmDash loop lists tracy/emdash images; --line must not')
})

test('build.sh pulls a Docker Hub base, never layering a tag on the host’s cached copy; EmDash’s local base is not pulled', () => {
  const hub = world()
  assert.equal(buildSh(WEB, ['--line', 'joomla:5-apache'], hub).status, 0)
  assert.match(hub.builds()[0], /^build --pull -f /, hub.builds()[0])
  const emdash = world()
  const r = buildSh(WEB, ['emdash'], { env: { ...emdash.env, DOCKER_EMDASH: 'tracy/emdash:1.2.0' } })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(emdash.builds().length, 1, emdash.calls())
  assert.doesNotMatch(emdash.builds()[0], /--pull/, 'tracy/emdash:<version> is in no registry')
})

test('build.sh --line refuses a key with no line, and a key that is not <platform>:<tag>', () => {
  const w = world()
  const missing = buildSh(WEB, ['--line', 'joomla:php7.4-apache'], w)
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /IMAGE_TAGS has no line for joomla:php7\.4-apache/)
  for (const bad of [[], ['joomla']]) {
    const r = buildSh(WEB, ['--line', ...bad], w)
    assert.equal(r.status, 2, bad.join(' '))
    assert.match(r.stderr, /--line takes one <platform>:<upstream tag> key/)
  }
  assert.equal(w.builds().length, 0)
})

test('build.sh finds the Joomla skill tree beside web/ on a fleet host and uses that as the context', () => {
  // The tracy-host layout: $TRACY_FLEET_DIR/{web,vendor/joomla/joomlart-t4-skill}, no repo around it.
  const fleet = path.join(mkTemp('fleet-layout-'), 'opt-tracy-fleet')
  mkdirSync(path.join(fleet, 'web'), { recursive: true })
  mkdirSync(path.join(fleet, 'vendor/joomla/joomlart-t4-skill'), { recursive: true })
  for (const f of [
    'build.sh',
    'IMAGE_TAGS',
    'joomla.Dockerfile',
    'wordpress.Dockerfile',
    'emdash.Dockerfile',
    'tracy-sendmail',
    'tracy-sendmail.ini'
  ])
    copyFileSync(path.join(WEB, f), path.join(fleet, 'web', f))
  const w = world()
  const r = buildSh(path.join(fleet, 'web'), ['--line', 'joomla:5-apache'], w)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(w.builds().length, 1, w.calls())
  assert.ok(w.builds()[0].endsWith(` ${fleet}`), w.builds()[0])
})

test('the tracy-host image carries the Joomla skill tree where build.sh looks for it', () => {
  const dockerfile = readFileSync(path.join(PKG, '../../../apps/tracy-host/Dockerfile'), 'utf8')
  assert.match(
    dockerfile,
    /^COPY vendor\/joomla\/joomlart-t4-skill \/opt\/tracy-fleet\/vendor\/joomla\/joomlart-t4-skill$/m
  )
  assert.match(dockerfile, /^COPY packages\/fleet\/tracy-fleet-operation\/web \/opt\/tracy-fleet\/web$/m)
})

// ── move-off-upstream-image.sh ───────────────────────────────────────────────────────────────────

const compose = (image) => `services:
  db:
    image: mariadb:11
    restart: unless-stopped
  web:
    image: ${image}
    restart: unless-stopped
    entrypoint: ["apache2-foreground"]
    shm_size: 512m
`

function sitesRoot(sites) {
  const root = mkTemp('move-off-upstream-')
  for (const [label, image] of Object.entries(sites)) {
    mkdirSync(path.join(root, label), { recursive: true })
    writeFileSync(path.join(root, label, '.env'), 'HOST_PORT=8099\nPLATFORM=joomla\n')
    writeFileSync(path.join(root, label, 'docker-compose.yml'), compose(image))
  }
  return root
}

function move(root, args, w, env = {}) {
  return spawnSync('bash', [MOVER, '--root', root, ...args], {
    encoding: 'utf8',
    env: { ...CLEAN, ...w.env, DOCKER_WEB_CID: 'cid123', TRACY_MOVE_WAIT_SECONDS: '2', ...env }
  })
}

const composeOf = (root, label) => readFileSync(path.join(root, label, 'docker-compose.yml'), 'utf8')

test('--list names each site on a bare upstream image and the line it would move to, or that it stays', () => {
  const root = sitesRoot({
    jo5: 'joomla:5-apache',
    wp82: 'wordpress:php8.2-apache',
    jo4: 'joomla:4-apache',
    wp74: 'wordpress:php7.4-apache',
    ours: line('joomla:6-apache'),
    em: 'tracy/emdash:1.2.3'
  })
  const w = world([line('wordpress:php8.2-apache')])
  const r = move(root, ['--list'], w)
  assert.equal(r.status, 0, r.stderr)
  assert.match(
    r.stdout,
    new RegExp(
      `jo5  joomla:5-apache  -> ${line('joomla:5-apache').replace(/[.]/g, '\\.')}  \\(not built yet: --apply builds it; web running\\)`
    )
  )
  assert.match(
    r.stdout,
    new RegExp(
      `wp82  wordpress:php8\\.2-apache  -> ${line('wordpress:php8.2-apache').replace(/[.]/g, '\\.')}  \\(built;`
    )
  )
  assert.match(r.stdout, /jo4 {2}joomla:4-apache {2}no line: stays, host-browser fallback \(unpatched PHP/)
  assert.match(
    r.stdout,
    /wp74 {2}wordpress:php7\.4-apache {2}no line: stays, host-browser fallback \(web\/IMAGE_TAGS has no line/
  )
  assert.doesNotMatch(r.stdout, /\bours\b|\bem\b/)
  assert.match(r.stdout, /2 to move, 2 stay/)
  assert.equal(w.builds().length, 0, 'listing builds nothing')
  assert.equal(composeOf(root, 'jo5'), compose('joomla:5-apache'))
})

test('a dry run says what --apply would do and changes nothing', () => {
  const root = sitesRoot({ jo5: 'joomla:5-apache' })
  const w = world()
  const r = move(root, ['--label', 'jo5'], w)
  assert.equal(r.status, 0, r.stderr)
  assert.match(
    r.stdout,
    new RegExp(
      `jo5: joomla:5-apache -> ${line('joomla:5-apache').replace(/[.]/g, '\\.')} \\(the line for the same base: same PHP\\)`
    )
  )
  assert.match(r.stdout, /--apply builds it first: bash .*build\.sh --line joomla:5-apache/)
  assert.match(r.stdout, /dry run: nothing changed/)
  assert.equal(composeOf(root, 'jo5'), compose('joomla:5-apache'))
  assert.doesNotMatch(w.calls(), /^(build|run|compose up)/m)
})

test('--apply on a running site: builds the line, changes only the image line, recreates web only, proves it', () => {
  const root = sitesRoot({ jo5: 'joomla:5-apache' })
  const w = world()
  const target = line('joomla:5-apache')
  const r = move(root, ['--label', 'jo5', '--apply'], w)
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.equal(w.builds().length, 1)
  assert.match(
    w.calls(),
    new RegExp(`^run --rm -u www-data --entrypoint sh ${target.replace(/[.]/g, '\\.')} -c `, 'm')
  )
  assert.equal(composeOf(root, 'jo5'), compose(target), 'every other line of the compose is as it was')
  assert.equal(
    readFileSync(path.join(root, 'jo5', '.docker-compose.yml.before-tracy-image'), 'utf8'),
    compose('joomla:5-apache')
  )
  assert.match(w.calls(), /^compose up -d --no-deps web$/m)
  assert.match(w.calls(), /^compose exec -T -u www-data web sh -c /m)
  assert.match(
    r.stdout,
    new RegExp(
      `jo5 now runs ${target.replace(/[.]/g, '\\.')}: chromium and node on PATH for www-data, home page 200 \\(was 200\\)`
    )
  )
})

test('--apply on a site that is not running writes the compose and starts nothing', () => {
  const root = sitesRoot({ wp82: 'wordpress:php8.2-apache' })
  const target = line('wordpress:php8.2-apache')
  const w = world([target])
  const r = move(root, ['--label', 'wp82', '--apply'], w, { DOCKER_WEB_CID: '' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(composeOf(root, 'wp82'), compose(target))
  assert.equal(w.builds().length, 0, 'already built')
  assert.doesNotMatch(w.calls(), /^compose up/m)
  assert.match(r.stdout, /written, not started \(the site was not running\)/)
})

test('a site already on a Tracy image, or on no PHP platform image, is nothing to move', () => {
  const root = sitesRoot({ ours: line('joomla:6-apache'), em: 'tracy/emdash:1.2.3' })
  const w = world()
  for (const label of ['ours', 'em']) {
    const before = composeOf(root, label)
    const r = move(root, ['--label', label, '--apply'], w)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /nothing to move/)
    assert.equal(composeOf(root, label), before)
  }
  assert.equal(w.calls(), '')
})

test('a base with no line, or an unpatched PHP, stays where it is: exit 1, nothing built or written', () => {
  const root = sitesRoot({ wp74: 'wordpress:php7.4-apache', jo4: 'joomla:4-apache' })
  const w = world()
  for (const [label, base] of [
    ['wp74', 'wordpress:php7.4-apache'],
    ['jo4', 'joomla:4-apache']
  ]) {
    const r = move(root, ['--label', label, '--apply'], w)
    assert.equal(r.status, 1, r.stdout)
    assert.match(r.stdout, /no line: stays, host-browser fallback/)
    assert.equal(composeOf(root, label), compose(base))
  }
  assert.equal(w.builds().length, 0)
})

test('a build that fails, or an image without the tools, changes nothing', () => {
  const root = sitesRoot({ jo5: 'joomla:5-apache' })
  const failed = move(root, ['--label', 'jo5', '--apply'], world(), { DOCKER_BUILD_FAIL: '1' })
  assert.equal(failed.status, 1)
  assert.match(failed.stderr, /could not be built on this host — nothing changed/)
  const noTools = move(root, ['--label', 'jo5', '--apply'], world([line('joomla:5-apache')]), {
    DOCKER_RUN_EXIT: '1'
  })
  assert.equal(noTools.status, 1)
  assert.match(noTools.stderr, /no chromium or no node on PATH for www-data — nothing changed/)
  assert.equal(composeOf(root, 'jo5'), compose('joomla:5-apache'))
  assert.ok(!existsSync(path.join(root, 'jo5', '.docker-compose.yml.before-tracy-image')))
})

test('a moved container that does not prove itself is put back on the previous compose', () => {
  for (const env of [
    { DOCKER_TOOLS_EXIT: '1' },
    { DOCKER_HOME_BEFORE: '200', DOCKER_HOME_AFTER: '500' },
    { DOCKER_UP_EXIT: '1' }
  ]) {
    const root = sitesRoot({ jo5: 'joomla:5-apache' })
    const w = world([line('joomla:5-apache')])
    const r = move(root, ['--label', 'jo5', '--apply'], w, { ...env, TRACY_MOVE_WAIT_SECONDS: '1' })
    assert.equal(r.status, 1, JSON.stringify(env))
    assert.match(r.stderr, /putting the previous compose back/)
    assert.equal(composeOf(root, 'jo5'), compose('joomla:5-apache'), JSON.stringify(env))
    assert.equal(w.calls().match(/^compose up -d --no-deps web$/gm).length, 2, 'recreated, then put back')
  }
})

test('the mover refuses a label that is not a plain name and mixed modes', () => {
  const root = sitesRoot({})
  const w = world()
  for (const bad of ['../etc', '.hidden', 'a/b']) assert.equal(move(root, ['--label', bad], w).status, 2, bad)
  assert.equal(move(root, ['--list', '--label', 'x'], w).status, 2)
  assert.equal(move(root, [], w).status, 2)
  assert.equal(move(root, ['--label', 'x', '--bogus'], w).status, 2)
})
