/**
 * A commit in a site's baseline repo (`webroot-baseline.git`) leaves no git running behind it (L14b).
 *
 * Measured 05/10/2026 on the dev Mac: deleting a site whose install had failed stopped at teardown
 * step 3 with "rm: cannot remove '…/webroot-baseline.git': Directory not empty". What was left in it
 * was one file, `gc.log` ("fatal: unable to read 95727ea4…", "fatal: failed to run repack"): the
 * baseline commit (`add -A -f` of the whole webroot, far past gc.auto's 6700 loose objects) had
 * started a DETACHED automatic gc, which was still repacking while teardown emptied the directory,
 * and which then wrote its log into it.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/webroot-repo-gc.test.mjs
 *
 * Real git, real scripts. Instead of 6700 files, git's own trigger is made cheap: the global config
 * this test hands git says `gc.auto = 1` (git samples `objects/17/`, and two loose objects there are
 * "too many") and `gc.autoDetach = false`, so an automatic gc runs in the foreground and is over —
 * its pack on disk — when the script returns. The webroot carries files whose blobs land in
 * `objects/17/`. A pack after the run means a commit asked for maintenance.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', 'scripts')
const GIT = join(scripts, 'webroot', 'webroot-git.sh')
const LABEL = 'site-under-test'
const temps = []

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

/** `count` file bodies whose git blob id starts with `17`, none equal to one in `taken`. */
function bodiesIn17(count, taken = new Set()) {
  const found = []
  for (let i = 0; found.length < count; i += 1) {
    const body = `/* tracy ${i} */\n`
    if (taken.has(body)) continue
    const id = createHash('sha1')
      .update(`blob ${Buffer.byteLength(body)}\0${body}`)
      .digest('hex')
    if (id.startsWith('17')) found.push(body)
  }
  return found
}

/** A WordPress-shaped webroot (the platform reader recognises it) plus three files in `objects/17/`. */
function stack() {
  const srv = mkdtempSync(join(tmpdir(), 'tracy-repo-gc-'))
  temps.push(srv)
  const webroot = join(srv, LABEL, '.webroot')
  mkdirSync(join(webroot, 'wp-includes'), { recursive: true })
  mkdirSync(join(webroot, 'wp-content', 'themes', 'tracy'), { recursive: true })
  writeFileSync(join(webroot, 'wp-includes', 'version.php'), '<?php $wp_version = "6.6";\n')
  const bodies = bodiesIn17(3)
  bodies.forEach((body, i) =>
    writeFileSync(join(webroot, 'wp-content', 'themes', 'tracy', `base-${i}.css`), body)
  )
  return {
    srv,
    webroot,
    bodies,
    repo: join(srv, LABEL, 'webroot-baseline.git'),
    gitconfig: join(srv, 'gitconfig')
  }
}

/** Run a webroot script with git's automatic gc set to fire at `gcAuto` loose objects (0: never). */
function run(s, script, args, { gcAuto }) {
  writeFileSync(s.gitconfig, `[gc]\n\tauto = ${gcAuto}\n\tautoDetach = false\n[maintenance]\n\tauto = true\n`)
  return execFileSync('bash', [script, '--label', LABEL, ...args], {
    env: {
      ...process.env,
      TRACY_SRV: s.srv,
      TRACY_PRIVATE_ROOT: s.srv,
      TRACY_SITES_ROOT: s.srv,
      TRACY_HEAVY_LOCK: join(s.srv, 'heavy.lock'),
      GIT_CONFIG_GLOBAL: s.gitconfig,
      GIT_CONFIG_NOSYSTEM: '1'
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

const packs = (s) => {
  const dir = join(s.repo, 'objects', 'pack')
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.pack')) : []
}

/** No gc ran: nothing packed, no gc.pid or gc.log, and the objects that would trigger one are still loose. */
function assertNoGc(s) {
  assert.deepEqual(packs(s), [], 'an automatic gc packed the repo')
  for (const file of ['gc.pid', 'gc.log']) assert.equal(existsSync(join(s.repo, file)), false, file)
  assert.ok(readdirSync(join(s.repo, 'objects', '17')).length >= 3, 'the objects stay loose')
}

test('the baseline commit of a webroot past the gc threshold starts no automatic gc', () => {
  const s = stack()
  const out = run(s, GIT, ['--op', 'ensure'], { gcAuto: 1 })
  assert.equal(JSON.parse(out.trim().split('\n').at(-1)).ok, true)
  assertNoGc(s)
})

test('a moment past the gc threshold starts no automatic gc either', () => {
  const s = stack()
  run(s, GIT, ['--op', 'ensure'], { gcAuto: 0 })
  bodiesIn17(3, new Set(s.bodies)).forEach((body, i) =>
    writeFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', `moment-${i}.css`), body)
  )
  run(s, GIT, ['--op', 'moment', '--title', 'Tighten the footer'], { gcAuto: 1 })
  const subject = execFileSync('git', ['--git-dir', s.repo, 'log', '-1', '--format=%s'], { encoding: 'utf8' })
  assert.match(subject, /Tighten the footer/, 'the moment was committed')
  assertNoGc(s)
})

/**
 * The scripts that cannot run on this Mac (GNU `stat -c`, `ionice`, a database for a backup) are held
 * to the same rule by reading them: every shell git call that names a `--git-dir=` carries the config,
 * and every file that does sources the library that defines it.
 */
test('every git call the webroot scripts make on a site repo carries the no-maintenance config', () => {
  const dir = join(scripts, 'webroot')
  const offenders = []
  let calls = 0
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.sh'))) {
    const src = readFileSync(join(dir, name), 'utf8')
    const lines = src.split('\n')
    const own = lines.filter((line) => !/^\s*#/.test(line) && /\bgit\b.*--git-dir=/.test(line))
    if (own.length === 0) continue
    calls += own.length
    for (const line of own)
      if (!line.includes('"${TRACY_REPO_GIT_CONFIG[@]}"')) offenders.push(`${name}: ${line.trim()}`)
    if (!/^\. "\$(LIB_DIR|HERE\/\.\.\/lib)\/webroot-repo-git\.sh"$/m.test(src))
      offenders.push(`${name}: does not source lib/webroot-repo-git.sh`)
  }
  assert.ok(calls >= 6, `the scan found ${calls} git calls — the pattern no longer matches the scripts`)
  assert.deepEqual(offenders, [])
})
