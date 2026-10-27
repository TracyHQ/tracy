/**
 * The webroot scripts, run for real on a throwaway stack: bash + git + python3 + node, the same
 * four things the fleet host has. What is asserted is the JSON contract the Workers read —
 * who wrote each row, what a backup carries, what "since the latest backup" contains — because
 * the Worker tests stub these answers and a stub only proves the stub.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/webroot-git.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', 'scripts')
const GIT = join(scripts, 'webroot', 'webroot-git.sh')
const BACKUP = join(scripts, 'webroot', 'webroot-backup.sh')
const LABEL = 'site-under-test'

function stack() {
  const srv = mkdtempSync(join(tmpdir(), 'tracy-srv-'))
  // `.webroot`, under the site's own directory — the shape tracy_webroot_dir() in lib/roots.sh
  // names (Plan 3 Task 2), not the old bare `webroot`. TRACY_SITES_ROOT is pointed at the same
  // `srv` as TRACY_PRIVATE_ROOT below (via `run()`), so both roots live in one throwaway tree —
  // there is no second real root to stand up just for this test.
  const webroot = join(srv, LABEL, '.webroot')
  // A WordPress-shaped tree, so the zone classifier recognises the platform.
  mkdirSync(join(webroot, 'wp-includes'), { recursive: true })
  mkdirSync(join(webroot, 'wp-content', 'themes', 'tracy'), { recursive: true })
  mkdirSync(join(webroot, 'wp-content', 'plugins', 'jce'), { recursive: true })
  writeFileSync(join(webroot, 'wp-includes', 'version.php'), '<?php $wp_version = "6.6";\n')
  writeFileSync(join(webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'body { margin: 0 }\n')
  writeFileSync(join(webroot, 'wp-content', 'plugins', 'jce', 'jce.php'), '<?php // jce\n')
  return { srv, webroot, dispose: () => rmSync(srv, { recursive: true, force: true }) }
}

function run(script, srv, args) {
  const out = execFileSync('bash', [script, '--label', LABEL, ...args], {
    env: {
      ...process.env,
      // Both roots point at the same throwaway tree: this suite predates the two-root split and
      // has no need to exercise it separately, only to keep behaving exactly as it did on one
      // root (the whole point of Plan 3 Task 2's defaults). TRACY_SRV is the private root's old
      // name, still honoured by lib/roots.sh.
      TRACY_SRV: srv,
      TRACY_SITES_ROOT: srv,
      TRACY_HEAVY_LOCK: join(srv, 'heavy.lock'),
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null'
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const last = out.trim().split('\n').at(-1) ?? ''
  return JSON.parse(last)
}

test('ensure builds the baseline and tags it v1 "Initial backup" by the agent', () => {
  const s = stack()
  try {
    const built = run(GIT, s.srv, ['--op', 'ensure'])
    assert.equal(built.ok, true)
    const history = run(GIT, s.srv, ['--op', 'history'])
    assert.deepEqual(history.latest, { version: 1, sha: built.baseline })
    assert.equal(history.rows.length, 1)
    const v1 = history.rows[0]
    assert.equal(v1.kind, 'backup')
    assert.equal(v1.version, 1)
    assert.equal(v1.title, 'Initial backup')
    assert.deepEqual(v1.by, { kind: 'agent' })
    assert.equal(v1.files, 3)
  } finally {
    s.dispose()
  }
})

test('a moment commits the dirty worktree as the agent; changes shows it with its files and zones', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(
      join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'),
      'body { margin: 0; padding: 0 }\n'
    )
    const idle = run(GIT, s.srv, ['--op', 'moment', '--title', 'Tighten the footer wrap at 1100px'])
    assert.equal(idle.committed, true)
    assert.equal(idle.files, 1)
    // A second idle with nothing dirty is a normal answer, not a commit.
    const quiet = run(GIT, s.srv, ['--op', 'moment', '--title', 'What does the footer do?'])
    assert.equal(quiet.committed, false)

    const changes = run(GIT, s.srv, ['--op', 'changes'])
    assert.equal(changes.since.version, 1)
    assert.equal(changes.moments.length, 1)
    assert.equal(changes.moments[0].title, 'Tighten the footer wrap at 1100px')
    assert.equal(changes.moments[0].kind, 'moment')
    assert.deepEqual(changes.moments[0].by, { kind: 'agent' })
    assert.equal(changes.moments[0].files, 1)
    assert.equal(changes.files.length, 1)
    const file = changes.files[0]
    assert.equal(file.path, 'wp-content/themes/tracy/style.css')
    assert.equal(file.status, 'modified')
    assert.equal(file.additions, 1)
    assert.equal(file.deletions, 1)
    assert.equal(file.zone, 'design')
    assert.deepEqual(file.by, { kind: 'agent' })
  } finally {
    s.dispose()
  }
})

test('edits made on the site are sealed as "outside Tracy" when somebody looks', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(join(s.webroot, 'wp-content', 'plugins', 'jce', 'jce.php'), '<?php // jce 2.9\n')
    writeFileSync(join(s.webroot, 'wp-content', 'plugins', 'jce', 'jce.xml'), '<extension/>\n')
    const changes = run(GIT, s.srv, ['--op', 'changes'])
    assert.equal(changes.moments.length, 1)
    assert.equal(changes.moments[0].kind, 'outside')
    assert.deepEqual(changes.moments[0].by, { kind: 'outside' })
    assert.equal(changes.moments[0].files, 2)
    assert.deepEqual(changes.files.map((f) => [f.path, f.status, f.zone, f.by.kind]).sort(), [
      ['wp-content/plugins/jce/jce.php', 'modified', 'addons', 'outside'],
      ['wp-content/plugins/jce/jce.xml', 'added', 'addons', 'outside']
    ])
  } finally {
    s.dispose()
  }
})

test('a backup is tagged by the person, carries their notes, and resets what "changes" compares against', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(
      join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'),
      'body { margin: 0; padding: 0 }\n'
    )
    run(GIT, s.srv, ['--op', 'moment', '--title', 'Tighten the footer wrap at 1100px'])
    const notes = join(s.srv, 'notes.md')
    writeFileSync(notes, 'Design\n· Tighten the footer wrap at 1100px\n')
    const made = run(BACKUP, s.srv, [
      '--op',
      'create',
      '--title',
      'Footer touch-ups',
      '--notes-file',
      notes,
      '--by-name',
      'Lee',
      '--by-email',
      'lee@example.com'
    ])
    assert.equal(made.ok, true)
    assert.equal(made.version, 2)
    // A backup never leaves the host: no GitHub ledger field in the answer at all.
    assert.deepEqual(Object.keys(made).sort(), [
      'database',
      'databaseError',
      'fleetSha',
      'fleetTag',
      'ok',
      'title',
      'version'
    ])

    const history = run(GIT, s.srv, ['--op', 'history'])
    assert.equal(history.latest.version, 2)
    assert.deepEqual(
      history.rows.map((r) => [r.kind, r.title, r.by.kind]),
      [
        ['backup', 'Footer touch-ups', 'person'],
        ['moment', 'Tighten the footer wrap at 1100px', 'agent'],
        ['backup', 'Initial backup', 'agent']
      ]
    )
    const v2 = history.rows[0]
    assert.deepEqual(v2.by, { kind: 'person', name: 'Lee', email: 'lee@example.com' })
    assert.equal(v2.notes, 'Design\n· Tighten the footer wrap at 1100px')
    assert.equal(v2.files, 1, 'files changed since v1')

    const list = run(BACKUP, s.srv, ['--op', 'list'])
    assert.equal(list.backups[0].version, 2)
    assert.deepEqual(list.backups[0].by, { kind: 'person', name: 'Lee', email: 'lee@example.com' })

    const after = run(GIT, s.srv, ['--op', 'changes'])
    assert.equal(after.since.version, 2)
    assert.deepEqual(after.moments, [])
    assert.deepEqual(after.files, [])
  } finally {
    s.dispose()
  }
})

test('a site built before v1 existed gets its Initial backup on the first look', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    // Pretend the tag was never made: the old ensure only tagged tracy-baseline.
    const repo = join(s.srv, LABEL, 'webroot-baseline.git')
    execFileSync('git', ['--git-dir', repo, 'tag', '-d', 'tracy-release/v1'], { stdio: 'ignore' })
    const changes = run(GIT, s.srv, ['--op', 'changes'])
    assert.equal(changes.since.version, 1)
  } finally {
    s.dispose()
  }
})

// Regression (04/10/2026): `ensure_initial_backup` asked "is there any backup tag?" with
// `for-each-ref | grep -q .` under pipefail. grep quit on the first ref while git was still writing
// the rest; git died of SIGPIPE, the check read "none", and the op then failed re-tagging an
// existing v1. Real once the ref list outgrows one write (some dozens of backups); certain here,
// where it outgrows a pipe.
test('a site with thousands of backup points still passes the v1 check every op starts with', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    const repo = join(s.srv, LABEL, 'webroot-baseline.git')
    const sha = execFileSync('git', ['--git-dir', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const refs = Array.from({ length: 5000 }, (_, i) => `create refs/tags/tracy-release/v${i + 2} ${sha}\n`)
    execFileSync('git', ['--git-dir', repo, 'update-ref', '--stdin'], { input: refs.join('') })
    // `ensure` ends in ensure_initial_backup, like every reading op, without walking every point.
    assert.equal(run(GIT, s.srv, ['--op', 'ensure']).ok, true)
  } finally {
    s.dispose()
  }
})

test('a site whose repo was never built gets it on the first read, not an error', () => {
  const s = stack()
  try {
    // No `ensure` first: this is the emdash lane, and any site that reached the host another way.
    const history = run(GIT, s.srv, ['--op', 'history'])
    assert.equal(history.ok, true)
    assert.equal(history.latest?.version, 1)
    assert.equal(history.rows.length, 1)
    assert.equal(history.rows[0].kind, 'backup')
    // The second read finds the repo and does not build a second baseline.
    const changes = run(GIT, s.srv, ['--op', 'changes'])
    assert.equal(changes.ok, true)
    assert.equal(changes.since.sha, history.latest.sha)
    assert.deepEqual(changes.files, [])
  } finally {
    s.dispose()
  }
})

test('a webroot with no files still gets a baseline and v1 — an empty site is not an error', () => {
  // Emdash keeps its content outside the webroot; the tree Tracy tracks is empty.
  const srv = mkdtempSync(join(tmpdir(), 'tracy-srv-'))
  mkdirSync(join(srv, LABEL, '.webroot', 'empty-dir'), { recursive: true })
  try {
    const history = run(GIT, srv, ['--op', 'history'])
    assert.equal(history.ok, true)
    assert.equal(history.latest?.version, 1)
    assert.equal(history.rows.length, 1)
    const changes = run(GIT, srv, ['--op', 'changes'])
    assert.deepEqual(changes.files, [])
    assert.deepEqual(changes.moments, [])
  } finally {
    rmSync(srv, { recursive: true, force: true })
  }
})

// ── Undo guard (plan todo-site-changes Q1, invariant 11) ──────────────────────────────────────

const STYLE = ['wp-content', 'themes', 'tracy', 'style.css']
const gitIn = (s, ...args) =>
  execFileSync(
    'git',
    ['--git-dir', join(s.srv, LABEL, 'webroot-baseline.git'), '--work-tree', s.webroot, ...args],
    {
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
    }
  ).trim()

test('undo refuses an outside moment: NOT_UNDOABLE, nothing written, no commit', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(join(s.webroot, 'wp-content', 'plugins', 'jce', 'jce.php'), '<?php // jce 2.9\n')
    const changes = run(GIT, s.srv, ['--op', 'changes'])
    const outside = changes.moments[0]
    assert.equal(outside.kind, 'outside')
    const head = gitIn(s, 'rev-parse', 'HEAD')
    const refused = run(GIT, s.srv, ['--op', 'restore-undo', '--sha', outside.sha])
    assert.deepEqual(refused, { ok: false, code: 'NOT_UNDOABLE' })
    assert.equal(gitIn(s, 'rev-parse', 'HEAD'), head, 'no commit')
    assert.equal(
      readFileSync(join(s.webroot, 'wp-content', 'plugins', 'jce', 'jce.php'), 'utf8'),
      '<?php // jce 2.9\n'
    )
  } finally {
    s.dispose()
  }
})

test('undo refuses when a file of the moment changed since: CONFLICT names it, writes nothing, seals nothing', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(join(s.webroot, ...STYLE), 'body { color: brown }\n')
    writeFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'new.css'), 'a { }\n')
    const turn = run(GIT, s.srv, ['--op', 'moment', '--title', 'Use the darker brown'])
    // Newer work on one of its files, not sealed yet (an admin edit a second ago).
    writeFileSync(join(s.webroot, ...STYLE), 'body { color: black }\n')
    const head = gitIn(s, 'rev-parse', 'HEAD')
    const refused = run(GIT, s.srv, ['--op', 'restore-undo', '--sha', turn.head])
    assert.deepEqual(refused, { ok: false, code: 'CONFLICT', files: ['wp-content/themes/tracy/style.css'] })
    assert.equal(gitIn(s, 'rev-parse', 'HEAD'), head, 'no commit, not even an outside seal')
    assert.equal(readFileSync(join(s.webroot, ...STYLE), 'utf8'), 'body { color: black }\n')
    assert.equal(readFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'new.css'), 'utf8'), 'a { }\n')
    assert.match(gitIn(s, 'status', '--porcelain'), /style\.css/, 'the newer edit is still pending')
  } finally {
    s.dispose()
  }
})

test('undo refuses when a later moment changed a file, or a file it created is gone', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(join(s.webroot, ...STYLE), 'body { color: brown }\n')
    writeFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'new.css'), 'a { }\n')
    const turn = run(GIT, s.srv, ['--op', 'moment', '--title', 'Use the darker brown'])
    writeFileSync(join(s.webroot, ...STYLE), 'body { color: navy }\n')
    rmSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'new.css'))
    run(GIT, s.srv, ['--op', 'moment', '--title', 'Navy instead'])
    const head = gitIn(s, 'rev-parse', 'HEAD')
    const refused = run(GIT, s.srv, ['--op', 'restore-undo', '--sha', turn.head])
    assert.equal(refused.code, 'CONFLICT')
    assert.deepEqual(refused.files.sort(), [
      'wp-content/themes/tracy/new.css',
      'wp-content/themes/tracy/style.css'
    ])
    assert.equal(gitIn(s, 'rev-parse', 'HEAD'), head)
    assert.equal(readFileSync(join(s.webroot, ...STYLE), 'utf8'), 'body { color: navy }\n')
  } finally {
    s.dispose()
  }
})

test('undo refuses when only the mode of a file changed since', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(join(s.webroot, ...STYLE), 'body { color: brown }\n')
    const turn = run(GIT, s.srv, ['--op', 'moment', '--title', 'Use the darker brown'])
    chmodSync(join(s.webroot, ...STYLE), 0o755)
    const refused = run(GIT, s.srv, ['--op', 'restore-undo', '--sha', turn.head])
    assert.deepEqual(refused, { ok: false, code: 'CONFLICT', files: ['wp-content/themes/tracy/style.css'] })
  } finally {
    s.dispose()
  }
})

test('a clean undo puts the files back, removes what it created, and seals other pending edits as outside first', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(join(s.webroot, ...STYLE), 'body { color: brown }\n')
    writeFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'new.css'), 'a { }\n')
    const turn = run(GIT, s.srv, ['--op', 'moment', '--title', 'Use the darker brown'])
    // Unrelated pending work: it must stay, and not be swallowed by the restore commit.
    writeFileSync(join(s.webroot, 'wp-content', 'plugins', 'jce', 'jce.php'), '<?php // jce 2.9\n')
    const done = run(GIT, s.srv, ['--op', 'restore-undo', '--sha', turn.head])
    assert.equal(done.ok, true)
    assert.equal(done.files, 2)
    assert.equal(readFileSync(join(s.webroot, ...STYLE), 'utf8'), 'body { margin: 0 }\n')
    assert.equal(existsSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'new.css')), false)
    assert.equal(
      readFileSync(join(s.webroot, 'wp-content', 'plugins', 'jce', 'jce.php'), 'utf8'),
      '<?php // jce 2.9\n'
    )
    const log = gitIn(s, 'log', '--format=%ae %s', '-3').split('\n')
    assert.match(log[0], /^fleet@tracy\.ai restore: undo /)
    assert.equal(log[1], 'outside@tracy.ai outside Tracy: changes made to the site outside Tracy')
    assert.equal(gitIn(s, 'status', '--porcelain'), '')
    // The restore itself is not a turn: undoing it again is refused by name.
    assert.deepEqual(run(GIT, s.srv, ['--op', 'restore-undo', '--sha', done.head]), {
      ok: false,
      code: 'NOT_UNDOABLE'
    })
  } finally {
    s.dispose()
  }
})

test('undo refuses the baseline commit', () => {
  const s = stack()
  try {
    const built = run(GIT, s.srv, ['--op', 'ensure'])
    assert.deepEqual(run(GIT, s.srv, ['--op', 'restore-undo', '--sha', built.baseline]), {
      ok: false,
      code: 'NOT_UNDOABLE'
    })
  } finally {
    s.dispose()
  }
})

test('commit op names the raw author and subject, so a restore commit (fleet@ + "restore: …") is told from a moment titled the same', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(join(s.webroot, ...STYLE), 'body { color: brown }\n')
    // A chat moment whose title copies a restore subject: title_of() would read it as one.
    const spoof = run(GIT, s.srv, ['--op', 'moment', '--title', 'restore: undo abcdef1 (x)'])
    const spoofRead = run(GIT, s.srv, ['--op', 'commit', '--sha', spoof.head])
    assert.equal(spoofRead.author, 'agent@tracy.ai')
    assert.equal(spoofRead.subject, 'agent: restore: undo abcdef1 (x)')
    writeFileSync(join(s.webroot, ...STYLE), 'body { color: red }\n')
    writeFileSync(join(s.webroot, 'tracy-changed.json'), '{"at":1}\n')
    const turn = run(GIT, s.srv, ['--op', 'moment', '--title', 'Use red'])
    // Pending work the undo seals first: one press, two commits (P0 #6).
    writeFileSync(join(s.webroot, 'wp-content', 'plugins', 'jce', 'jce.php'), '<?php // jce 3\n')
    const done = run(GIT, s.srv, ['--op', 'restore-undo', '--sha', turn.head])
    const read = run(GIT, s.srv, ['--op', 'commit', '--sha', done.head])
    assert.equal(read.sha, done.head)
    assert.equal(read.author, 'fleet@tracy.ai')
    assert.match(read.subject, new RegExp(`^restore: undo ${turn.head.slice(0, 7)}`))
    assert.equal(read.total, done.files)
    assert.equal(read.total, read.files.length)
    const seal = run(GIT, s.srv, ['--op', 'commit', '--sha', read.parent])
    assert.equal(seal.author, 'outside@tracy.ai')
    assert.equal(seal.parent, turn.head)
  } finally {
    s.dispose()
  }
})

// ── Configuration files never leave as bytes (plan todo-site-changes Q1, invariant 10) ───────

const SECRET = "define( 'DB_PASSWORD', 'fixture-not-a-real-secret' );"

/** The script run raw: exit status and stdout, because a refusal here is an exit, not JSON alone. */
function runRaw(srv, args) {
  try {
    const stdout = execFileSync('bash', [GIT, '--label', LABEL, ...args], {
      env: {
        ...process.env,
        TRACY_SRV: srv,
        TRACY_SITES_ROOT: srv,
        TRACY_HEAVY_LOCK: join(srv, 'heavy.lock'),
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null'
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return { status: 0, stdout, stderr: '' }
  } catch (e) {
    return { status: e.status, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }
  }
}

function withConfig(s) {
  writeFileSync(join(s.webroot, 'wp-config.php'), `<?php\n${SECRET}\n`)
  run(GIT, s.srv, ['--op', 'ensure'])
  writeFileSync(join(s.webroot, 'wp-config.php'), `<?php\n${SECRET}\n// edited\n`)
}

test('file-diff and file-show refuse wp-config.php, configuration.php and .env by name', () => {
  const s = stack()
  try {
    withConfig(s)
    writeFileSync(join(s.webroot, 'configuration.php'), `<?php class JConfig { public $password = 'x'; }\n`)
    writeFileSync(join(s.webroot, '.env'), 'EMDASH_ENCRYPTION_KEY=fixture\n')
    for (const args of [
      ['--op', 'file-diff', '--path', 'wp-config.php'],
      ['--op', 'file-show', '--path', 'wp-config.php', '--ref', 'baseline'],
      ['--op', 'file-show', '--path', 'wp-config.php', '--ref', 'worktree'],
      ['--op', 'file-show', '--path', 'configuration.php', '--ref', 'worktree'],
      ['--op', 'file-show', '--path', '.env', '--ref', 'worktree']
    ]) {
      const r = runRaw(s.srv, args)
      assert.equal(r.status, 3, args.join(' '))
      assert.deepEqual(JSON.parse(r.stdout.trim()), {
        ok: false,
        code: 'CONFIG_FILE_BLOCKED',
        blocked: true,
        reason: 'configuration-file'
      })
      assert.doesNotMatch(r.stdout + r.stderr, /fixture|password/)
    }
  } finally {
    s.dispose()
  }
})

test('file-diff refuses a directory, the root and a glob: no config bytes through a wider pathspec', () => {
  const s = stack()
  try {
    withConfig(s)
    for (const p of ['.', 'wp-config.ph?', '*config.php', ':(glob)**/wp-config.php', 'wp-content']) {
      const r = runRaw(s.srv, ['--op', 'file-diff', '--path', p])
      assert.doesNotMatch(r.stdout + r.stderr, /fixture-not-a-real-secret/, p)
    }
    const dir = runRaw(s.srv, ['--op', 'file-diff', '--path', '.'])
    assert.equal(dir.status, 2)
    assert.deepEqual(JSON.parse(dir.stdout.trim()), { ok: false, code: 'INVALID_PATH' })
  } finally {
    s.dispose()
  }
})

test('file-show does not follow a symlink, in the file or in a folder on the way', () => {
  const s = stack()
  try {
    withConfig(s)
    symlinkSync('wp-config.php', join(s.webroot, 'notes.txt'))
    symlinkSync('.', join(s.webroot, 'loop'))
    for (const p of ['notes.txt', 'loop/wp-content/themes/tracy/style.css']) {
      const r = runRaw(s.srv, ['--op', 'file-show', '--path', p, '--ref', 'worktree'])
      assert.equal(r.status, 3, p)
      assert.deepEqual(JSON.parse(r.stdout.trim()), { ok: false, code: 'SYMLINK_NOT_FOLLOWED' })
      assert.doesNotMatch(r.stdout, /fixture/)
    }
  } finally {
    s.dispose()
  }
})

test('an ordinary file still diffs and shows', () => {
  const s = stack()
  try {
    withConfig(s)
    writeFileSync(join(s.webroot, ...STYLE), 'body { color: brown }\n')
    const diff = runRaw(s.srv, ['--op', 'file-diff', '--path', 'wp-content/themes/tracy/style.css'])
    assert.equal(diff.status, 0)
    assert.match(diff.stdout, /^\+body \{ color: brown \}$/m)
    const shown = runRaw(s.srv, [
      '--op',
      'file-show',
      '--path',
      'wp-content/themes/tracy/style.css',
      '--ref',
      'worktree'
    ])
    assert.equal(shown.stdout, 'body { color: brown }\n')
  } finally {
    s.dispose()
  }
})

// ── Q2 (plan todo-site-changes §8): internal files, turns, outside seals ──────────────────────────

const REPO_OF = (srv) => join(srv, LABEL, 'webroot-baseline.git')

/** Raw git on the site's repo, the way an old script version would have written it. */
function git(srv, webroot, ...args) {
  return execFileSync('git', ['--git-dir', REPO_OF(srv), '--work-tree', webroot, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
  })
}

const tracked = (s) => git(s.srv, s.webroot, 'ls-files').split('\n').filter(Boolean).sort()

/** The files Tracy itself leaves in a webroot (P0 tmp-files.md), plus one junk folder. */
function plantInternal(webroot) {
  writeFileSync(join(webroot, 'tracy-changed.json'), '{"at":1,"reason":"save"}\n')
  writeFileSync(join(webroot, 'tracy-changed.json.tmp'), '{}\n')
  writeFileSync(join(webroot, 'tracy-cowork.zip'), 'PK\n')
  mkdirSync(join(webroot, 'wp-content', 'mu-plugins'), { recursive: true })
  writeFileSync(join(webroot, 'wp-content', 'mu-plugins', '.tracy-access.php.0a1b2c3d4e5f'), '<?php\n')
  mkdirSync(join(webroot, 'cache'), { recursive: true })
  writeFileSync(join(webroot, 'cache', 'page.html'), '<html>\n')
}

const INTERNAL = [
  'cache/page.html',
  'tracy-changed.json',
  'tracy-changed.json.tmp',
  'tracy-cowork.zip',
  'wp-content/mu-plugins/.tracy-access.php.0a1b2c3d4e5f'
]

test('Q2 helper, new site: the baseline holds no file Tracy writes for itself, and junk still goes', () => {
  const s = stack()
  try {
    plantInternal(s.webroot)
    run(GIT, s.srv, ['--op', 'ensure'])
    const files = tracked(s)
    for (const path of INTERNAL) assert.ok(!files.includes(path), `${path} is in the baseline`)
    assert.ok(files.includes('wp-content/themes/tracy/style.css'))
  } finally {
    s.dispose()
  }
})

test('Q2 helper, untracked on an older site: a moment carries the edit and none of the internal files', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    plantInternal(s.webroot)
    writeFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'body { margin: 1px }\n')
    const made = run(GIT, s.srv, ['--op', 'moment', '--title', 'Ok chốt'])
    assert.equal(made.committed, true)
    assert.equal(made.files, 1)
    for (const path of INTERNAL) assert.ok(!tracked(s).includes(path), `${path} was committed`)
  } finally {
    s.dispose()
  }
})

// BUG-DEV-1 (Site changes V2, dev round 02/10): `history` hid the housekeeping commit (all its files
// are excluded), so Site changes listed it only once a turn recorded it in Postgres — the count jumped
// by one with nothing new. History keeps it as a row now; `changes` still leaves it out.
test('history lists the housekeeping commit as an outside row with all its files; a commit that only imitates it stays hidden', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    plantInternal(s.webroot)
    git(s.srv, s.webroot, 'add', '-f', '--', 'tracy-changed.json', 'cache/page.html')
    git(
      s.srv,
      s.webroot,
      '-c',
      'user.name=Agent',
      '-c',
      'user.email=agent@tracy.ai',
      'commit',
      '-q',
      '-m',
      'agent: Ok chốt'
    )
    // The same subject under another author is not Tracy's housekeeping.
    plant(s.webroot, ['cache/other.html'])
    git(s.srv, s.webroot, 'add', '-f', '--', 'cache/other.html')
    git(
      s.srv,
      s.webroot,
      '-c',
      'user.name=Someone',
      '-c',
      'user.email=someone@example.test',
      'commit',
      '-q',
      '-m',
      'outside Tracy: housekeeping, internal files taken out of the history'
    )
    const imitation = git(s.srv, s.webroot, 'rev-parse', 'HEAD').trim()
    writeFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'body { margin: 3px }\n')
    run(GIT, s.srv, ['--op', 'moment', '--title', 'Change the badge text'])
    const kept = git(s.srv, s.webroot, 'log', '--format=%H%x09%ae', '-2').trim().split('\n')[1].split('\t')
    assert.equal(kept[1], 'outside@tracy.ai', 'the moment was preceded by housekeeping')

    const history = run(GIT, s.srv, ['--op', 'history'])
    const row = history.rows.find((r) => r.sha === kept[0])
    assert.ok(row, 'the housekeeping commit is a row')
    assert.equal(row.kind, 'outside')
    assert.equal(row.title, 'housekeeping, internal files taken out of the history')
    assert.equal(row.author, 'outside@tracy.ai')
    assert.ok(row.files >= 1, 'it counts the files it took out')
    assert.ok(!history.hidden.some((h) => h.sha === kept[0]), 'not hidden')
    assert.ok(
      history.hidden.some((h) => h.sha === imitation),
      'an imitation by another author stays hidden'
    )
    assert.ok(!history.rows.some((r) => r.sha === imitation))

    const changes = run(GIT, s.srv, ['--op', 'changes'])
    assert.ok(!changes.moments.some((m) => m.sha === kept[0]), '`changes` still leaves it out')
  } finally {
    s.dispose()
  }
})

test('Q2 helper, already tracked: one outside "housekeeping" commit takes them out of the index, the files stay on disk, and the reader hides it', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    plantInternal(s.webroot)
    // What an older script left behind: a moment that swallowed tracy-changed.json (the screenshot
    // of 01/10, moment 6 holding only that file).
    git(s.srv, s.webroot, 'add', '-f', '--', 'tracy-changed.json', 'cache/page.html')
    git(
      s.srv,
      s.webroot,
      '-c',
      'user.name=Agent',
      '-c',
      'user.email=agent@tracy.ai',
      'commit',
      '-q',
      '-m',
      'agent: Ok chốt'
    )
    writeFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'body { margin: 2px }\n')
    const made = run(GIT, s.srv, ['--op', 'moment', '--title', 'Change the badge text'])
    assert.equal(made.committed, true)
    assert.equal(made.files, 1, 'the moment holds the edit, not a deletion of tracy-changed.json')
    for (const path of INTERNAL) assert.ok(!tracked(s).includes(path), `${path} is still tracked`)
    assert.ok(existsSync(join(s.webroot, 'tracy-changed.json')), 'the file itself stays on disk')

    const log = git(s.srv, s.webroot, 'log', '--format=%ae%x09%s', '-3').trim().split('\n')
    assert.deepEqual(
      log.map((l) => l.split('\t')),
      [
        ['agent@tracy.ai', 'agent: Change the badge text'],
        ['outside@tracy.ai', 'outside Tracy: housekeeping, internal files taken out of the history'],
        ['agent@tracy.ai', 'agent: Ok chốt']
      ]
    )
    const changes = run(GIT, s.srv, ['--op', 'changes'])
    assert.deepEqual(
      changes.moments.map((m) => [m.title, m.files]),
      [['Change the badge text', 1]],
      'a commit holding only internal files is not a row'
    )
    assert.deepEqual(
      changes.files.map((f) => f.path),
      ['wp-content/themes/tracy/style.css']
    )
  } finally {
    s.dispose()
  }
})

const STYLE_OF = (s) => join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css')
const JCE_OF = (s) => join(s.webroot, 'wp-content', 'plugins', 'jce', 'jce.php')

test('Q2 turn: the seal at turn open takes what was dirty before it; the moment holds only the turn, with its trailer', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(JCE_OF(s), '<?php // jce, updated in wp-admin\n')
    const opened = run(GIT, s.srv, ['--op', 'seal-outside', '--turn', 'session-a1:3'])
    assert.equal(opened.ok, true)
    assert.equal(opened.skipped, null)
    assert.deepEqual(opened.sealed.files, ['wp-content/plugins/jce/jce.php'])
    assert.match(opened.sealed.sha, /^[0-9a-f]{40}$/)

    writeFileSync(STYLE_OF(s), 'body { color: red }\n')
    const made = run(GIT, s.srv, ['--op', 'moment', '--title', 'Make it red', '--turn', 'session-a1:3'])
    assert.equal(made.committed, true)
    assert.deepEqual(made.paths, ['wp-content/themes/tracy/style.css'])
    assert.equal(made.sha, made.head)

    const body = git(s.srv, s.webroot, 'log', '-1', '--format=%B').trim()
    assert.equal(body, 'agent: Make it red\n\nTracy-Turn: session-a1:3')
    const changes = run(GIT, s.srv, ['--op', 'changes'])
    assert.deepEqual(
      changes.moments.map((m) => [m.kind, m.title, m.turn, m.files]),
      [
        ['moment', 'Make it red', 'session-a1:3', 1],
        ['outside', 'changes made to the site outside Tracy', null, 1]
      ]
    )
    assert.deepEqual(changes.truncated, { moments: false, files: false })
  } finally {
    s.dispose()
  }
})

// SC-3 (tracy-web `sites/setup-moment.js`, 12/10/2026): a Tracy setup run holds the webroot under the turn id
// `setup-<run uuid>:1` — the same two ops as a chat turn. What was dirty before it stays outside, a look while it
// writes seals nothing, and its moment carries the run's trailer, which Site changes reads as the run's row.
test('SC-3 setup run: its turn id holds the webroot like a chat turn, and its moment names the run', () => {
  const s = stack()
  const turn = 'setup-0f6c8a52-6a63-4f0c-9d3e-3b1f2f0d7a11:1'
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(JCE_OF(s), '<?php // left by provision after the baseline\n')
    const opened = run(GIT, s.srv, ['--op', 'seal-outside', '--turn', turn])
    assert.equal(opened.skipped, null)
    assert.deepEqual(opened.sealed.files, ['wp-content/plugins/jce/jce.php'])

    writeFileSync(STYLE_OF(s), 'body { color: tan }\n')
    assert.deepEqual(
      run(GIT, s.srv, ['--op', 'changes'])
        .moments.slice(0, 1)
        .map((m) => m.kind),
      ['outside']
    )
    assert.equal(run(GIT, s.srv, ['--op', 'changes']).moments.length, 1, 'no seal while the run writes')

    const made = run(GIT, s.srv, ['--op', 'moment', '--title', 'Tracy setup', '--turn', turn])
    assert.equal(made.committed, true)
    assert.equal(made.files, 1)
    assert.deepEqual(made.paths, ['wp-content/themes/tracy/style.css'])
    assert.equal(
      git(s.srv, s.webroot, 'log', '-1', '--format=%B').trim(),
      `agent: Tracy setup\n\nTracy-Turn: ${turn}`
    )
    const changes = run(GIT, s.srv, ['--op', 'changes'])
    assert.deepEqual(
      changes.moments.map((m) => [m.kind, m.turn, m.files]),
      [
        ['moment', turn, 1],
        ['outside', null, 1]
      ]
    )
  } finally {
    s.dispose()
  }
})

test('Q2 turn: a look at Changes while a turn is open seals nothing; the edit stays in the turn', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    run(GIT, s.srv, ['--op', 'seal-outside', '--turn', 'session-a1:1'])
    writeFileSync(STYLE_OF(s), 'body { color: blue }\n')
    const looked = run(GIT, s.srv, ['--op', 'changes'])
    assert.deepEqual(looked.moments, [], 'no outside seal mid-turn')
    run(GIT, s.srv, ['--op', 'history'])
    const made = run(GIT, s.srv, ['--op', 'moment', '--title', 'Blue', '--turn', 'session-a1:1'])
    assert.deepEqual(made.paths, ['wp-content/themes/tracy/style.css'])
    // The turn is closed now: the next look seals again.
    writeFileSync(JCE_OF(s), '<?php // edited over SSH\n')
    const after = run(GIT, s.srv, ['--op', 'changes'])
    assert.equal(after.moments[0].kind, 'outside')
  } finally {
    s.dispose()
  }
})

test('Q2 turn: an open-turn mark older than 30 minutes no longer stops a look from sealing', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    run(GIT, s.srv, ['--op', 'seal-outside', '--turn', 'session-a1:1'])
    const marks = join(REPO_OF(s.srv), 'tracy-turn-open')
    execFileSync('bash', ['-c', `touch -t 202001010000 "${marks}"/*`])
    writeFileSync(STYLE_OF(s), 'body { color: green }\n')
    const looked = run(GIT, s.srv, ['--op', 'changes'])
    assert.equal(looked.moments.length, 1)
    assert.equal(looked.moments[0].kind, 'outside')
  } finally {
    s.dispose()
  }
})

test("Q2 turn: another conversation's open turn is not sealed under it — the seal is skipped and said", () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    run(GIT, s.srv, ['--op', 'seal-outside', '--turn', 'session-a1:1'])
    writeFileSync(STYLE_OF(s), 'body { color: teal }\n')
    const second = run(GIT, s.srv, ['--op', 'seal-outside', '--turn', 'session-b2:1'])
    assert.equal(second.sealed, null)
    assert.equal(second.skipped, 'turn-open')
    const first = run(GIT, s.srv, ['--op', 'moment', '--title', 'Teal', '--turn', 'session-a1:1'])
    assert.deepEqual(first.paths, ['wp-content/themes/tracy/style.css'])
  } finally {
    s.dispose()
  }
})

test("Q2 turn: the same conversation's earlier turn that never closed does not hold the next one's seal", () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    run(GIT, s.srv, ['--op', 'seal-outside', '--turn', 'session-a1:1'])
    writeFileSync(STYLE_OF(s), 'body { color: olive }\n') // turn 1 died before its moment
    const next = run(GIT, s.srv, ['--op', 'seal-outside', '--turn', 'session-a1:2'])
    assert.equal(next.skipped, null)
    assert.deepEqual(next.sealed.files, ['wp-content/themes/tracy/style.css'])
  } finally {
    s.dispose()
  }
})

test('Q2 turn: a turn id that is not <session>:<turn> is refused before anything is written', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    for (const bad of ['../x:1', 'session a:1', 'session-a1', 'session-a1:x']) {
      assert.throws(
        () => run(GIT, s.srv, ['--op', 'seal-outside', '--turn', bad]),
        /exit|Command failed/,
        bad
      )
    }
  } finally {
    s.dispose()
  }
})

test('Q2 caps: past 200 commits and 500 files the reader says truncated instead of a short count', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    execFileSync(
      'bash',
      [
        '-c',
        `cd "${s.webroot}" && mkdir -p wp-content/uploads/bulk && for i in $(seq 1 501); do echo $i > wp-content/uploads/bulk/f$i.txt; done`
      ],
      { stdio: 'ignore' }
    )
    git(s.srv, s.webroot, 'add', '-A')
    git(
      s.srv,
      s.webroot,
      '-c',
      'user.name=Agent',
      '-c',
      'user.email=agent@tracy.ai',
      'commit',
      '-q',
      '-m',
      'agent: bulk'
    )
    execFileSync(
      'bash',
      [
        '-c',
        // `maintenance.auto=false` + `gc.auto=0`: a modern `git commit` kicks off a DETACHED
        // auto-maintenance; 201 in a row make it repack while the next read walks the history,
        // which then dies with "Could not read <sha> / revision walk setup failed" under load.
        `for i in $(seq 1 201); do git --git-dir="${REPO_OF(s.srv)}" -c user.name=Agent -c user.email=agent@tracy.ai -c maintenance.auto=false -c gc.auto=0 commit -q --allow-empty -m "agent: n$i"; done`
      ],
      { stdio: 'ignore', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } }
    )
    const changes = run(GIT, s.srv, ['--op', 'changes'])
    assert.equal(changes.moments.length, 200)
    assert.equal(changes.files.length, 500)
    assert.deepEqual(changes.truncated, { moments: true, files: true })
    assert.equal(run(GIT, s.srv, ['--op', 'history']).truncated, true)
    const bulk = git(s.srv, s.webroot, 'log', '--format=%H', '--grep=^agent: bulk$').trim()
    const bulkRead = run(GIT, s.srv, ['--op', 'commit', '--sha', bulk])
    assert.equal(bulkRead.truncated, true)
    // The list stops at 500; the total does not (Site changes V2 undo-scope).
    assert.equal(bulkRead.files.length, 500)
    assert.equal(bulkRead.total, 501)
  } finally {
    s.dispose()
  }
})

test("Q2 diff by sha: a file's diff is that moment's own change (SHA^ → SHA), not baseline → today", () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(STYLE_OF(s), 'body { color: one }\n')
    const first = run(GIT, s.srv, ['--op', 'moment', '--title', 'One', '--turn', 'session-a1:1'])
    writeFileSync(STYLE_OF(s), 'body { color: two }\n')
    run(GIT, s.srv, ['--op', 'moment', '--title', 'Two', '--turn', 'session-a1:2'])
    const out = execFileSync(
      'bash',
      [
        GIT,
        '--label',
        LABEL,
        '--op',
        'file-diff',
        '--sha',
        first.sha,
        '--path',
        'wp-content/themes/tracy/style.css'
      ],
      { encoding: 'utf8', env: { ...process.env, TRACY_SRV: s.srv, TRACY_SITES_ROOT: s.srv } }
    )
    assert.match(out, /^-body \{ margin: 0 \}$/m)
    assert.match(out, /^\+body \{ color: one \}$/m)
    assert.doesNotMatch(out, /two/)
  } finally {
    s.dispose()
  }
})

test('Q2 turn-moments: the commits of each named turn, with their files, in one read', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(STYLE_OF(s), 'body { color: one }\n')
    const a = run(GIT, s.srv, ['--op', 'moment', '--title', 'One', '--turn', 'session-a1:1'])
    writeFileSync(JCE_OF(s), '<?php // two\n')
    const b = run(GIT, s.srv, ['--op', 'moment', '--title', 'Two', '--turn', 'session-a1:2'])
    const read = run(GIT, s.srv, [
      '--op',
      'turn-moments',
      '--turns',
      'session-a1:1,session-a1:2,session-zz:9'
    ])
    assert.equal(read.ok, true)
    assert.deepEqual(read.turns['session-a1:1'], [
      { sha: a.sha, at: read.turns['session-a1:1'][0].at, files: ['wp-content/themes/tracy/style.css'] }
    ])
    assert.equal(read.turns['session-a1:2'][0].sha, b.sha)
    assert.deepEqual(read.turns['session-zz:9'], [])
    assert.equal(read.truncated, false)
  } finally {
    s.dispose()
  }
})

test('undo-check: a run of moments, newest first, is checked on the tree each earlier undo leaves', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(STYLE_OF(s), 'body { color: one }\n')
    const a = run(GIT, s.srv, ['--op', 'moment', '--title', 'One', '--turn', 'session-a1:1'])
    // The later moment rewrites the same file: alone, the older one reads as moved since.
    writeFileSync(STYLE_OF(s), 'body { color: two }\n')
    writeFileSync(JCE_OF(s), '<?php // two\n')
    const b = run(GIT, s.srv, ['--op', 'moment', '--title', 'Two', '--turn', 'session-a1:2'])
    const head = git(s.srv, s.webroot, 'rev-parse', 'HEAD').trim()
    const alone = run(GIT, s.srv, ['--op', 'undo-check', '--shas', a.sha])
    assert.equal(alone.conflict.code, 'CONFLICT')
    assert.deepEqual(alone.conflict.files, ['wp-content/themes/tracy/style.css'])
    const both = run(GIT, s.srv, ['--op', 'undo-check', '--shas', `${b.sha},${a.sha}`])
    assert.equal(both.ok, true)
    assert.equal(both.conflict, null)
    assert.deepEqual(
      both.commits.map((c) => [c.sha, c.checked, c.undoable, c.total]),
      [
        [b.sha, true, true, 2],
        [a.sha, true, true, 1]
      ]
    )
    assert.deepEqual(both.commits[0].zones, { design: 1, addons: 1 })
    assert.equal(git(s.srv, s.webroot, 'rev-parse', 'HEAD').trim(), head, 'read-only: no commit')
    assert.equal(readFileSync(STYLE_OF(s), 'utf8'), 'body { color: two }\n', 'read-only: no file written')
  } finally {
    s.dispose()
  }
})

test('undo-check: a newer edit outside the run stops the walk at the moment it touches', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(STYLE_OF(s), 'body { color: one }\n')
    const a = run(GIT, s.srv, ['--op', 'moment', '--title', 'One', '--turn', 'session-a1:1'])
    writeFileSync(JCE_OF(s), '<?php // two\n')
    const b = run(GIT, s.srv, ['--op', 'moment', '--title', 'Two', '--turn', 'session-a1:2'])
    // An admin edit after both, on the older moment's file, not sealed yet.
    writeFileSync(STYLE_OF(s), 'body { color: admin }\n')
    const read = run(GIT, s.srv, ['--op', 'undo-check', '--shas', `${b.sha},${a.sha}`])
    assert.deepEqual(read.conflict, {
      sha: a.sha,
      code: 'CONFLICT',
      files: ['wp-content/themes/tracy/style.css']
    })
    assert.deepEqual(
      read.commits.map((c) => c.checked),
      [true, true]
    )
    // Newest first matters: the older moment named first stops the walk there.
    const reversed = run(GIT, s.srv, ['--op', 'undo-check', '--shas', `${a.sha},${b.sha}`])
    assert.equal(reversed.conflict.sha, a.sha)
    assert.equal(reversed.commits[1].checked, false)
    const base = run(GIT, s.srv, ['--op', 'history']).rows.at(-1).sha
    const notTurn = run(GIT, s.srv, ['--op', 'undo-check', '--shas', base])
    assert.equal(notTurn.conflict.code, 'NOT_UNDOABLE')
  } finally {
    s.dispose()
  }
})

test('Q2 records: a look that seals says what it sealed; the turn-open seal lists recent outside commits', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(JCE_OF(s), '<?php // edited in wp-admin\n')
    const looked = run(GIT, s.srv, ['--op', 'changes'])
    assert.deepEqual(looked.sealed.files, ['wp-content/plugins/jce/jce.php'])
    assert.equal(run(GIT, s.srv, ['--op', 'history']).sealed, null, 'nothing dirty, nothing sealed')
    const opened = run(GIT, s.srv, ['--op', 'seal-outside', '--turn', 'session-a1:1'])
    assert.deepEqual(
      opened.outside.map((o) => [o.sha, o.cause, o.deployTag, o.files]),
      [[looked.sealed.sha, 'seal', null, ['wp-content/plugins/jce/jce.php']]]
    )
  } finally {
    s.dispose()
  }
})

test('E5.1c: a seal says when it was made and when its parent was, so Site changes can tell which CMS row wrote it', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    const parent = Number(git(s.srv, s.webroot, 'log', '-1', '--format=%ct').trim())
    writeFileSync(JCE_OF(s), '<?php // jce, updated by WP-Cron\n')
    const looked = run(GIT, s.srv, ['--op', 'history'])
    assert.equal(looked.sealed.parentAt, parent)
    assert.equal(
      looked.sealed.at,
      Number(git(s.srv, s.webroot, 'log', '-1', '--format=%ct', looked.sealed.sha).trim())
    )
    const opened = run(GIT, s.srv, ['--op', 'seal-outside', '--turn', 'session-a1:1'])
    assert.deepEqual(
      opened.outside.map((o) => [o.sha, o.parentAt]),
      [[looked.sealed.sha, parent]]
    )
  } finally {
    s.dispose()
  }
})

test('Q2 commit op: each file of one moment carries its zone, as in changes', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    writeFileSync(STYLE_OF(s), 'body { color: plum }\n')
    const made = run(GIT, s.srv, ['--op', 'moment', '--title', 'Plum', '--turn', 'session-a1:1'])
    const read = run(GIT, s.srv, ['--op', 'commit', '--sha', made.sha])
    assert.deepEqual(
      read.files.map((f) => [f.path, f.zone]),
      [['wp-content/themes/tracy/style.css', 'design']]
    )
  } finally {
    s.dispose()
  }
})

// ── Q4 (plan todo-site-changes §12 "Q4 cache"): files a CMS rewrites by itself ─────────────────────
// Survey: tasks/evidence/site-changes/Q4/cache-survey.md — each path below was read in the CMS's own
// code or measured on scwp1002/scjo1002 (02/10). None of them is a change anyone made to the site.

/** Paths a CMS or an extension writes at runtime, relative to the webroot. */
const CACHE = [
  // Joomla, JoomlArt T4: render-time optimizer and the CSS it compiles from template-style params
  'media/t4/optimize/css/5313d648f5daaa2ea82ec9ab9a597309.css',
  'media/t4/optimize/js/4c2774ee353227959cf90a7360690188.js',
  'media/t4/css/119.css',
  // Joomla, JoomlArt T3 (leemood on dev, 02/10): css-<hash>-<n>.css, and the LESS dev output
  't3-assets/css/css-0f1e2d3c-37980.css',
  't3-assets/dev/templates.t3_bs3_blank.less.template.less.css',
  // Joomla core: Media Manager thumbnails, the core-update scratch file (it holds a password)
  'media/cache/com_media/thumbs/photo.jpg',
  'administrator/components/com_joomlaupdate/update.php',
  // Joomla extensions: Akeeba Backup's output folder, JA Extension Manager's download store
  'administrator/components/com_akeebabackup/backup/site-20261002.jpa',
  'jaextmanager_data/.htaccess',
  // WordPress core: the rollback copy taken during an update, and the maintenance flag
  'wp-content/upgrade-temp-backup/plugins/jce/jce.php',
  '.maintenance',
  // WordPress plugins: compiled CSS caches, a firewall's state, a contact form's temp uploads
  'wp-content/uploads/elementor/css/post-12.css',
  'wp-content/et-cache/12/et-core-unified-12.min.css',
  'wp-content/litespeed/css/0a1b2c.css',
  'wp-content/wflogs/config-synced.php',
  'wp-content/uploads/wc-logs/index.html',
  'wp-content/uploads/wpcf7_uploads/1234567/cv.pdf',
  'wp-content/uploads/wpcf7_captcha/abc.png'
]

/** Same names one level down, or things that only LOOK like a cache: these are code or content. */
const LOOK_ALIKES = [
  'wp-content/plugins/jce/media/t4/optimize/keep.css',
  'wp-content/plugins/jce/t3-assets/keep.css',
  'wp-content/plugins/jce/media/cache/keep.php',
  'wp-content/plugins/jce/tmpl/backup/default.php',
  'wp-content/plugins/jce/wp-content/upgrade-temp-backup/keep.php',
  'wp-content/advanced-cache.php',
  'wp-content/object-cache.php',
  'wp-content/w3tc-config/master.php',
  'wp-content/languages/de_DE.mo',
  'wp-content/uploads/2026/10/photo-300x200.jpg',
  'wp-content/uploads/fonts/inter.woff2',
  'templates/tracy_business/css/custom.css'
]

function plant(webroot, paths, body = 'x\n') {
  for (const path of paths) {
    mkdirSync(dirname(join(webroot, path)), { recursive: true })
    writeFileSync(join(webroot, path), body)
  }
}

test('Q4 excludes, new site: the baseline holds no CMS cache, and every look-alike stays tracked', () => {
  const s = stack()
  try {
    plant(s.webroot, [...CACHE, ...LOOK_ALIKES])
    run(GIT, s.srv, ['--op', 'ensure'])
    const files = tracked(s)
    for (const path of CACHE) assert.ok(!files.includes(path), `${path} is in the baseline`)
    for (const path of LOOK_ALIKES) assert.ok(files.includes(path), `${path} was dropped`)
  } finally {
    s.dispose()
  }
})

test('Q4 excludes, untracked on an older site: a moment holds the edit, not the cache a page view rebuilt', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    plant(s.webroot, CACHE)
    writeFileSync(STYLE_OF(s), 'body { margin: 3px }\n')
    const made = run(GIT, s.srv, ['--op', 'moment', '--title', 'Edit CSS', '--turn', 'session-a1:1'])
    assert.equal(made.committed, true)
    assert.deepEqual(made.paths, ['wp-content/themes/tracy/style.css'])
    for (const path of CACHE) assert.ok(!tracked(s).includes(path), `${path} was committed`)
  } finally {
    s.dispose()
  }
})

test('Q4 excludes, already tracked: housekeeping takes the cache out once, the files stay, the next moment holds only the edit', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    plant(s.webroot, [...CACHE, ...LOOK_ALIKES])
    // An older script tracked them all (the exclude list did not name them yet).
    git(s.srv, s.webroot, 'add', '-f', '--', ...CACHE, ...LOOK_ALIKES)
    git(
      s.srv,
      s.webroot,
      '-c',
      'user.name=Agent',
      '-c',
      'user.email=agent@tracy.ai',
      'commit',
      '-q',
      '-m',
      'agent: before Q4'
    )
    writeFileSync(STYLE_OF(s), 'body { margin: 4px }\n')
    const made = run(GIT, s.srv, ['--op', 'moment', '--title', 'Edit CSS', '--turn', 'session-a1:2'])
    assert.deepEqual(
      made.paths,
      ['wp-content/themes/tracy/style.css'],
      'no staged deletion of a cache file rides along'
    )
    const files = tracked(s)
    for (const path of CACHE) assert.ok(!files.includes(path), `${path} is still tracked`)
    for (const path of LOOK_ALIKES) assert.ok(files.includes(path), `${path} was taken out`)
    for (const path of CACHE) assert.ok(existsSync(join(s.webroot, path)), `${path} left the disk`)
    const subjects = git(s.srv, s.webroot, 'log', '--format=%s', '-3').trim().split('\n')
    assert.deepEqual(subjects, [
      'agent: Edit CSS',
      'outside Tracy: housekeeping, internal files taken out of the history',
      'agent: before Q4'
    ])
  } finally {
    s.dispose()
  }
})

test('Q4 reader: an old moment is not rewritten; its cache files are flagged `excluded`, left out of its count, and a cache-only moment is named in `hidden`', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    const T3 = 't3-assets/css/css-0f1e2d3c-37980.css'
    const T4 = 'media/t4/optimize/css/5313d648f5daaa2ea82ec9ab9a597309.css'
    const oldMoment = (message, paths, ...trailer) => {
      git(s.srv, s.webroot, 'add', '-f', '--', ...paths)
      git(
        s.srv,
        s.webroot,
        '-c',
        'user.name=Agent',
        '-c',
        'user.email=agent@tracy.ai',
        'commit',
        '-q',
        '-m',
        message,
        ...trailer
      )
      return git(s.srv, s.webroot, 'rev-parse', 'HEAD').trim()
    }
    // leemood on dev, 02/10: chat moments holding nothing but T3's compiled CSS.
    plant(s.webroot, [T3])
    const cacheOnly = oldMoment('agent: What does the header say?', [T3], '-m', 'Tracy-Turn: session-a1:1')
    // c0a061d4 on scjo1002: a real edit and two T4 optimizer files in one moment.
    plant(s.webroot, [T4])
    writeFileSync(STYLE_OF(s), 'body { margin: 5px }\n')
    const mixed = oldMoment(
      'agent: Add a CSS comment',
      [T4, 'wp-content/themes/tracy/style.css'],
      '-m',
      'Tracy-Turn: session-a1:2'
    )

    const history = run(GIT, s.srv, ['--op', 'history'])
    assert.equal(git(s.srv, s.webroot, 'cat-file', '-t', mixed).trim(), 'commit')
    assert.ok(
      git(s.srv, s.webroot, 'rev-list', 'HEAD').includes(mixed),
      'the old moment is still in the history: nothing was rewritten'
    )
    const rows = history.rows.filter((r) => r.kind === 'moment')
    assert.deepEqual(
      rows.map((r) => [r.sha, r.files]),
      [[mixed, 1]],
      'the cache-only moment is not a row; the mixed one counts only the real edit'
    )
    assert.deepEqual(
      history.hidden.filter((h) => h.turn),
      [{ sha: cacheOnly, turn: 'session-a1:1' }],
      'the cache-only chat moment is named (beside the housekeeping commit this look made)'
    )

    const read = run(GIT, s.srv, ['--op', 'commit', '--sha', mixed])
    assert.deepEqual(
      read.files.map((f) => [f.path, f.excluded === true]),
      [
        [T4, true],
        ['wp-content/themes/tracy/style.css', false]
      ]
    )
  } finally {
    s.dispose()
  }
})

// ── an orphaned index.lock (dev 03/10: an empty one froze a site's history for 4.5 days) ──────

/** One op with a `flock` on PATH (the shim on macOS), so `locked()` really holds the site lock. */
function runWithFlock(srv, args, env = {}) {
  const r = spawnSync('bash', [GIT, '--label', LABEL, ...args], {
    env: {
      ...process.env,
      PATH: pathWithFlock(),
      TRACY_SRV: srv,
      TRACY_SITES_ROOT: srv,
      TRACY_HEAVY_LOCK: join(srv, 'heavy.lock'),
      TRACY_PROVISION_LOCK_DIR: srv,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      ...env
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const last = r.stdout.trim().split('\n').at(-1) ?? ''
  return { status: r.status, stderr: r.stderr, json: last.startsWith('{') ? JSON.parse(last) : null }
}

/** An empty index.lock in the site's repo, `minutesAgo` old — what a killed git leaves behind. */
function plantIndexLock(srv, minutesAgo) {
  const lock = join(srv, LABEL, 'webroot-baseline.git', 'index.lock')
  writeFileSync(lock, '')
  const when = new Date(Date.now() - minutesAgo * 60_000)
  utimesSync(lock, when, when)
  return lock
}

function dirtyTheme(s) {
  writeFileSync(join(s.webroot, 'wp-content', 'themes', 'tracy', 'style.css'), 'body { margin: 1px }\n')
}

test('an index.lock older than 10 minutes, under the site lock, is removed and the op goes on', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    dirtyTheme(s)
    const lock = plantIndexLock(s.srv, 11)
    const out = runWithFlock(s.srv, ['--op', 'moment', '--title', 'After a killed git'])
    assert.equal(out.status, 0, out.stderr)
    assert.equal(out.json.committed, true)
    assert.match(out.stderr, /removed an orphaned index\.lock/)
    assert.ok(!existsSync(lock), 'the orphaned lock is gone')
  } finally {
    s.dispose()
  }
})

test('the deploy resync path (caller holds the site lock) clears an orphaned index.lock too', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    dirtyTheme(s)
    const lock = plantIndexLock(s.srv, 60 * 24 * 4)
    const out = runWithFlock(s.srv, ['--op', 'seal-outside'], { TRACY_WEBROOT_LOCK_HELD: '1' })
    assert.equal(out.status, 0, out.stderr)
    assert.ok(!existsSync(lock), 'the 4-day-old lock is gone')
  } finally {
    s.dispose()
  }
})

test('a young index.lock is kept: the op stops as before, the file untouched', () => {
  const s = stack()
  try {
    run(GIT, s.srv, ['--op', 'ensure'])
    dirtyTheme(s)
    const lock = plantIndexLock(s.srv, 2)
    const out = runWithFlock(s.srv, ['--op', 'moment', '--title', 'While git may still be alive'])
    // The behaviour before this fix, kept: git refuses, nothing is committed.
    assert.equal(out.json.committed, false)
    assert.match(out.stderr, /index\.lock/)
    assert.doesNotMatch(out.stderr, /removed an orphaned/)
    assert.ok(existsSync(lock), 'a lock that may belong to a live git stays')
  } finally {
    s.dispose()
  }
})

test('an old index.lock is kept while the site is being provisioned (the baseline add may hold it)', async () => {
  const s = stack()
  const provisionLock = join(s.srv, `tracy-provision-${LABEL}.lock`)
  writeFileSync(provisionLock, '')
  // Hold the provision lock from another process, as provision.sh does for the whole build.
  const holder = spawn('bash', ['-c', `exec 9>"${provisionLock}"; flock 9; echo held; sleep 30`], {
    env: { ...process.env, PATH: pathWithFlock() },
    stdio: ['ignore', 'pipe', 'ignore']
  })
  try {
    await new Promise((resolve) => holder.stdout.once('data', resolve))
    run(GIT, s.srv, ['--op', 'ensure'])
    dirtyTheme(s)
    const lock = plantIndexLock(s.srv, 30)
    const out = runWithFlock(s.srv, ['--op', 'moment', '--title', 'During provision'])
    assert.equal(out.json.committed, false)
    assert.ok(existsSync(lock), 'provision may still be writing the index')
  } finally {
    holder.kill('SIGKILL')
    s.dispose()
  }
})

test('a repo left with 0 commits and an old index.lock (dev 03/10, joomlart-com-0871462c): the first look clears it and builds the baseline', () => {
  const s = stack()
  try {
    // What a baseline `add -A` killed mid-way leaves: the repo, loose objects, no commit, the lock.
    const repo = join(s.srv, LABEL, 'webroot-baseline.git')
    execFileSync('git', ['init', '-q', `--separate-git-dir=${repo}`, s.webroot], {
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
    })
    rmSync(join(s.webroot, '.git'))
    const lock = plantIndexLock(s.srv, 60 * 24 * 17)
    const out = runWithFlock(s.srv, ['--op', 'history'])
    assert.equal(out.status, 0, out.stderr)
    assert.ok(!existsSync(lock), 'the orphaned lock is gone')
    assert.equal(out.json.latest?.version, 1, 'the reader built the baseline and its v1')
  } finally {
    s.dispose()
  }
})

test('moment preserves same-size edits when rebuilding a racy cache-tree outside the webroot', () => {
  const s = stack()
  try {
    const rel = 'wp-content/themes/tracy/style.css'
    const file = STYLE_OF(s)
    const before = 'body { color: one }\n'
    const after = 'body { color: two }\n'
    writeFileSync(file, before)
    run(GIT, s.srv, ['--op', 'ensure'])
    // Simulate equal stat timestamps without relying on scheduler timing.
    git(s.srv, s.webroot, 'config', 'core.checkStat', 'minimal')
    git(s.srv, s.webroot, 'config', 'core.trustctime', 'false')
    const past = new Date(Math.floor(Date.now() / 1000) * 1000 - 10_000)
    utimesSync(file, past, past)
    git(s.srv, s.webroot, 'update-index', '--force-remove', '--', rel)
    git(s.srv, s.webroot, 'add', '--', rel)
    utimesSync(join(REPO_OF(s.srv), 'index'), past, past)
    writeFileSync(file, after)
    utimesSync(file, past, past)
    const made = run(GIT, s.srv, ['--op', 'moment', '--title', 'Two', '--turn', 'racy-review:2'])
    assert.equal(made.committed, true)
    assert.deepEqual(made.paths, [rel])
    assert.equal(git(s.srv, s.webroot, 'show', `HEAD:${rel}`), after)
  } finally {
    s.dispose()
  }
})
