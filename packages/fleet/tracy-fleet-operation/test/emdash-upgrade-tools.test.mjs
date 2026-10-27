/**
 * `provision/emdash/upgrade-tools-image.sh` — moving EmDash quickstart sites that already run onto
 * the image with the agent's tools (David, 24/09/2026; new sites get it at provision since #309).
 *
 * What must hold: only a quickstart EmDash site whose token custody is `protected` and whose own
 * web container runs is moved; the dry run changes nothing; the move rewrites exactly one line of
 * the compose file (the one the custody matcher lets vary) and recreates the container; and a new
 * container that does not prove itself puts the old compose back and brings the old image up.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-upgrade-tools.test.mjs
 *
 * The compose files are rendered by `render-compose.sh` itself, because the custody matcher
 * accepts the generator's form line for line and nothing hand-written. `docker` is a stub on PATH.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))
const SCRIPT = path.join(SCRIPTS, 'provision/emdash/upgrade-tools-image.sh')
const RENDER = path.join(SCRIPTS, 'provision/render-compose.sh')
const PLAIN = 'tracy/tracy-business-emdash:1.3.0'

const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
case "$*" in
  "inspect "*"-web-1 --format "*)
    c="\${2%-web-1}"; echo "true $c web $FAKE_ROOT/$c" ;;
  "image inspect --format {{.Id}} "*) echo "sha256:base" ;;
  "image inspect --format {{ index .Config.Labels \\"tracy.web.inputs\\" }} "*) exit 1 ;;
  build\\ *) exit "\${FAKE_BUILD_EXIT:-0}" ;;
  "compose up -d --no-deps web") : ;;
  "exec -u www-data "*"command -v chromium"*) exit "\${FAKE_CHROMIUM_EXIT:-0}" ;;
  exec\\ *) : ;;
  *) : ;;
esac
`

const selector = (label) =>
  execFileSync(
    'bash',
    ['-c', `printf '%s' "$1" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-12`, '_', label],
    {
      encoding: 'utf8'
    }
  ).trim()

/** A private root with one site per kind, each compose written by the real renderer. */
function fleet(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-upgrade-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const root = path.join(dir, 'private')
  mkdirSync(path.join(dir, 'bin'), { recursive: true })
  mkdirSync(path.join(dir, 'sites'), { recursive: true })
  writeFileSync(path.join(dir, 'bin/docker'), FAKE_DOCKER)
  chmodSync(path.join(dir, 'bin/docker'), 0o755)
  const site = (label, env, image) => {
    mkdirSync(path.join(root, label, 'data'), { recursive: true })
    writeFileSync(path.join(root, label, '.env'), env)
    writeFileSync(path.join(root, label, 'tracy-agent.token'), '')
    if (image)
      execFileSync(
        'bash',
        [
          RENDER,
          label,
          '--root',
          root,
          '--platform',
          'emdash',
          '--flavor',
          'fresh',
          '--image',
          image,
          '--no-image-check'
        ],
        {
          env: { ...process.env, TRACY_PRIVATE_ROOT: root, TRACY_SITES_ROOT: path.join(dir, 'sites') },
          stdio: 'ignore'
        }
      )
  }
  const emdashEnv = (port) => `HOST_PORT=${port}\nPLATFORM=emdash\nEMDASH_SITE_URL=https://x.example\n`
  site('ed-new', emdashEnv(52001), PLAIN)
  site('ed-moved', emdashEnv(52002), `${PLAIN}-tools`)
  site('ed-bare', emdashEnv(52003), 'tracy/emdash:0.38.0')
  // A pre-#155 site: the same compose without the read-only token bind.
  site('ed-old', emdashEnv(52004), PLAIN)
  const old = path.join(root, 'ed-old/docker-compose.yml')
  writeFileSync(
    old,
    readFileSync(old, 'utf8').replace(/^ *- \.\/tracy-agent\.token:\/run\/tracy-agent\.token:ro\n/m, '')
  )
  site('wp-php', 'HOST_PORT=52005\nPLATFORM=wordpress\n', null)
  return { dir, root }
}

function upgrade(f, args = [], fake = {}) {
  const log = path.join(f.dir, 'docker.log')
  rmSync(log, { force: true })
  const r = spawnSync('bash', [SCRIPT, '--root', f.root, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${f.dir}/bin:${process.env.PATH}`,
      TRACY_FLEET_DIR: path.join(f.dir, 'no-fleet'),
      FAKE_LOG: log,
      FAKE_ROOT: f.root,
      ...fake
    }
  })
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  const lines = Object.fromEntries(
    r.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [sel, state, ...rest] = l.split(' ')
        return [sel, { state, detail: rest.join(' ') }]
      })
  )
  return { ...r, calls, lines, of: (label) => lines[selector(label)] }
}

const composeOf = (f, label) => readFileSync(path.join(f.root, label, 'docker-compose.yml'), 'utf8')

describe('upgrade-tools-image.sh', () => {
  test('the dry run names what it would move and why it leaves the rest, and changes nothing', (t) => {
    const f = fleet(t)
    const before = composeOf(f, 'ed-new')
    const r = upgrade(f)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.of('ed-new').state, 'would-move')
    assert.equal(r.of('ed-new').detail, `${PLAIN} -> ${PLAIN}-tools`)
    assert.equal(r.of('ed-moved').state, 'current')
    assert.equal(r.of('ed-bare').state, 'skipped')
    assert.equal(r.of('ed-old').state, 'skipped')
    assert.match(r.of('ed-old').detail, /token custody is (none|unknown)/)
    assert.equal(r.of('wp-php'), undefined, 'a WordPress site is not this script’s')
    assert.equal(composeOf(f, 'ed-new'), before)
    assert.deepEqual(
      r.calls.filter((c) => /^build |compose up/.test(c)),
      []
    )
    assert.ok(!r.stdout.includes('ed-new'), 'no raw label in the output')
  })

  test('--apply moves the site: one line of its compose changes, and the container is recreated', (t) => {
    const f = fleet(t)
    const before = composeOf(f, 'ed-new')
    const r = upgrade(f, ['--apply'])
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.of('ed-new').state, 'moved')
    const after = composeOf(f, 'ed-new')
    assert.equal(after, before.replace(`    image: ${PLAIN}\n`, `    image: ${PLAIN}-tools\n`))
    assert.notEqual(after, before)
    assert.ok(r.calls.some((c) => c.startsWith('build ') && c.includes(`BASE=${PLAIN}`)))
    assert.ok(r.calls.includes('compose up -d --no-deps web'))
    assert.ok(!existsSync(path.join(f.root, 'ed-new/docker-compose.yml.pre-tools')), 'no backup left behind')
    // Only the eligible site was touched.
    assert.equal(r.of('ed-old').state, 'skipped')
    assert.match(composeOf(f, 'ed-old'), new RegExp(`image: ${PLAIN.replace(/[.:/]/g, '\\$&')}\\n`))
  })

  test('a new container with no browser puts the old compose back and brings the old image up', (t) => {
    const f = fleet(t)
    const before = composeOf(f, 'ed-new')
    const r = upgrade(f, ['--apply', '--label', 'ed-new'], { FAKE_CHROMIUM_EXIT: '1' })
    assert.equal(r.status, 1)
    assert.equal(r.of('ed-new').state, 'failed')
    assert.equal(composeOf(f, 'ed-new'), before, 'the compose is byte for byte what it was')
    assert.equal(
      r.calls.filter((c) => c === 'compose up -d --no-deps web').length,
      2,
      'up with the new image, then with the old'
    )
  })

  test('a tools image that cannot be built leaves the site as it was', (t) => {
    const f = fleet(t)
    const before = composeOf(f, 'ed-new')
    const r = upgrade(f, ['--apply', '--label', 'ed-new'], { FAKE_BUILD_EXIT: '1' })
    assert.equal(r.status, 1)
    assert.equal(r.of('ed-new').state, 'failed')
    assert.equal(composeOf(f, 'ed-new'), before)
    assert.deepEqual(
      r.calls.filter((c) => c.startsWith('compose up')),
      []
    )
  })

  test('--label limits the run to one site', (t) => {
    const f = fleet(t)
    const r = upgrade(f, ['--label', 'ed-moved'])
    assert.deepEqual(Object.keys(r.lines), [selector('ed-moved')])
  })
})
