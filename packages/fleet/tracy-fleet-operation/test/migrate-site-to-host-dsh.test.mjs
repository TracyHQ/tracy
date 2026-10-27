#!/usr/bin/env node
/**
 * Moving one site off its lane and onto the host's dsh.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/migrate-site-to-host-dsh.test.mjs
 *
 * Four of the script's steps cannot be measured on the fleet before they have already happened to
 * a customer, so they are measured here instead:
 *
 *   1. THE SITE FOLDER'S LEVEL. A lane-era site keeps its folder one level deeper than the shape
 *      attach-site.sh binds. Getting this wrong is silent in the worst way: the agent lands in a
 *      directory that holds one directory and reports that the site is empty. Three directions are
 *      pinned — the lift, the refusal when both shapes hold content, and the RESUME of a move that
 *      was interrupted (which must not look like the refusal).
 *   2. WHO OWNS THE FOLDER. Root ownership reads fine and writes EACCES, so the failure shows up
 *      as a broken tool on the customer's first edit rather than as a permission.
 *   3. THE SESSION COPY. Only the `--site-<label>--` project directory may be merged into the host
 *      dsh's one sessions root; every other project directory name is shared by every lane. And a
 *      lane home that cannot be read must REFUSE, because "no history" and "history not found"
 *      must not print the same way.
 *   4. THE ADOPT FLIP. `workspaceDomainState` requires `workspaceIds`, so writing a `global` of
 *      `{initialized: false}` alone is a document the domain refuses to open — and that refusal is
 *      a boot failure for every site on the host.
 *
 * Plus a dry run of the whole script against a fake site tree, which asserts what it prints AND
 * that it wrote nothing.
 *
 * The script takes TRACY_ROOT / TRACY_SITES_ROOT / TRACY_DOCKER / TRACY_CHOWN so all of this runs
 * off a host.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { scriptStub } from './warm-stub.mjs'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/migrate-site-to-host-dsh.sh', import.meta.url))
const ROLLBACK = fileURLToPath(
  new URL('../scripts/provision/rollback-site-from-host-dsh.sh', import.meta.url)
)
const TAGS = fileURLToPath(new URL('../web/IMAGE_TAGS', import.meta.url))
// The image IMAGE_TAGS names for the base a WordPress clone runs, read from the same file the
// script reads, so a tag bump there does not turn this test red for no reason.
const WP83 = readFileSync(TAGS, 'utf8')
  .split('\n')
  .find((row) => row.startsWith('wordpress:php8.3-apache='))
  .slice('wordpress:php8.3-apache='.length)
const re = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** A throwaway /srv/tracy. */
function root() {
  return mkdtempSync(path.join(tmpdir(), 'tracy-migrate-'))
}

function write(file, body) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, body)
}

// A linked trampoline, not a fresh executable: macOS scans each new one on its first run (~100 ms).
function executable(file, body) {
  mkdirSync(path.dirname(file), { recursive: true })
  scriptStub(file, body)
}

/**
 * Source the script and run one of its functions, the way the script itself would — globals set,
 * no docker in sight.
 */
function callFunction(fn, vars) {
  const assignments = Object.entries(vars)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('; ')
  // `$1`, not `$0`: the script only runs its main when BASH_SOURCE[0] equals $0, and sourcing it
  // as $0 would make it do exactly that.
  return execFileSync('bash', ['-c', `. "$1"; ${assignments}; ${fn}`, '_', SCRIPT], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
}

/** A site at the LANE shape: the site folder one level deeper, under its own label. */
function laneSite(dir, label, { platform = 'wordpress' } = {}) {
  const siteDir = path.join(dir, label)
  write(path.join(siteDir, 'site', label, 'AGENTS.md'), '# agent instructions\n')
  write(path.join(siteDir, 'site', label, 'SiteContent', 'note.md'), 'content\n')
  mkdirSync(path.join(siteDir, 'site', label, '.webroot'), { recursive: true })
  mkdirSync(path.join(siteDir, 'webroot'), { recursive: true })
  write(path.join(siteDir, '.env'), 'DB_PASSWORD=secret\nHOST_PORT=8123\n')
  write(
    path.join(siteDir, 'docker-compose.yml'),
    [
      'services:',
      '  db:',
      '    image: mariadb:11',
      '    command:',
      '      - --sql-mode=NO_ENGINE_SUBSTITUTION',
      '    environment:',
      '      MARIADB_DATABASE: "site"',
      '  web:',
      `    image: ${platform === 'joomla' ? 'joomla:5-apache' : 'wordpress:php8.3-apache'}`,
      '    entrypoint: ["apache2-foreground"]',
      '    volumes:',
      '      - ./webroot:/var/www/html',
      ''
    ].join('\n')
  )
  return siteDir
}

/**
 * A docker that answers the questions this script asks and does nothing else.
 *
 *   laneHome  what `docker inspect <lane> --format '{{range .Mounts}}…'` reports
 *   user      `.Config.User`;  uid/gid  what `docker exec <c> id -u` answers
 *   running   `.State.Running` — `false` is a container that exists and is not serving
 *   fail      a first argument (`start`, `compose`, …) this docker refuses
 *   log       a file every invocation is appended to, each line stamped with whether the site
 *             folder was at the LANE's shape at that moment — which is how the unwind's ORDER is
 *             observed rather than assumed
 */
function fakeDocker(
  dir,
  {
    laneHome = '',
    user = '33',
    running = 'true',
    uid = '',
    gid = '',
    image = '',
    runId = '',
    fail = '',
    log = '',
    nested = '',
    name = 'docker'
  } = {}
) {
  const bin = path.join(dir, 'bin', name)
  executable(
    bin,
    [
      '#!/bin/sh',
      `LOG=${JSON.stringify(log)}`,
      `NESTED=${JSON.stringify(nested)}`,
      'if [ -n "$LOG" ]; then',
      '  n=no',
      '  if [ -n "$NESTED" ] && [ -d "$NESTED" ]; then n=yes; fi',
      '  printf "%s | nested=%s\\n" "$*" "$n" >> "$LOG"',
      'fi',
      `if [ "$1" = ${JSON.stringify(fail)} ]; then exit 1; fi`,
      'case "$1" in',
      '  inspect)',
      '    case "$*" in',
      `      *Mounts*) printf '%s' ${JSON.stringify(laneHome)} ;;`,
      `      *State.Running*) echo ${running} ;;`,
      '      *State.Health*) : ;;',
      `      *Config.User*) echo ${user} ;;`,
      `      *Config.Image*) ${image ? `echo ${image}` : ':'} ;;`,
      '      *) : ;;',
      '    esac ;;',
      '  run)',
      '    case "$*" in',
      `      *" -u"*|*" -g"*) ${runId ? `echo ${runId}` : ':'} ;;`,
      '      *) : ;;',
      '    esac ;;',
      '  exec)',
      '    case "$*" in',
      `      *"id -u"*) ${uid ? `echo ${uid}` : ':'} ;;`,
      `      *"id -g"*) ${gid ? `echo ${gid}` : ':'} ;;`,
      '      *) : ;;',
      '    esac ;;',
      'esac',
      'exit 0'
    ].join('\n')
  )
  return bin
}

test('the site folder comes up one level, and the move is backed up 0600', () => {
  const dir = root()
  const siteDir = laneSite(dir, 'fijitrips')
  const out = callFunction('tracy_migrate_site_folder_level', {
    SITE_DIR: siteDir,
    LABEL: 'fijitrips',
    STAMP: 'test',
    DRY: '0'
  })

  assert.match(out, /lifted one level/)
  assert.ok(existsSync(path.join(siteDir, 'site', 'AGENTS.md')), 'AGENTS.md is at the new shape')
  assert.ok(existsSync(path.join(siteDir, 'site', 'SiteContent', 'note.md')), 'the whole tree came up')
  assert.ok(!existsSync(path.join(siteDir, 'site', 'fijitrips')), 'the extra level is gone')
  const backup = path.join(siteDir, 'site.pre-host-dsh.test.tgz')
  assert.ok(existsSync(backup), 'the move left a backup')
  assert.equal(statSync(backup).mode & 0o777, 0o600, 'the backup is no more readable than the .env beside it')
  assert.ok(!existsSync(path.join(siteDir, '.site-level-migrating')), 'the marker is cleared')
})

test('a move interrupted halfway RESUMES instead of refusing', () => {
  const dir = root()
  const siteDir = laneSite(dir, 'tchwp2')
  // Exactly the state a Ctrl-C between two `mv` calls leaves: content in both places, and the
  // script's own marker saying the half-moved shape is its doing.
  execFileSync('mv', [
    path.join(siteDir, 'site', 'tchwp2', 'SiteContent'),
    path.join(siteDir, 'site', 'SiteContent')
  ])
  write(path.join(siteDir, '.site-level-migrating'), '')

  const out = callFunction('tracy_migrate_site_folder_level', {
    SITE_DIR: siteDir,
    LABEL: 'tchwp2',
    STAMP: 'test',
    DRY: '0'
  })

  assert.match(out, /resuming the interrupted move/)
  assert.ok(existsSync(path.join(siteDir, 'site', 'AGENTS.md')), 'the rest came up')
  assert.ok(existsSync(path.join(siteDir, 'site', 'SiteContent', 'note.md')), 'what had already moved stayed')
  assert.ok(!existsSync(path.join(siteDir, 'site', 'tchwp2')))
  assert.ok(!existsSync(path.join(siteDir, '.site-level-migrating')), 'the marker is cleared')
  assert.equal(
    readdirSync(siteDir).filter((name) => name.startsWith('site.pre-host-dsh')).length,
    0,
    'a resume does not take a second backup'
  )
})

test('a site already at the new shape is left alone, and nothing is backed up', () => {
  const dir = root()
  const siteDir = path.join(dir, 'joomlatest')
  write(path.join(siteDir, 'site', 'AGENTS.md'), '# agent instructions\n')
  const out = callFunction('tracy_migrate_site_folder_level', {
    SITE_DIR: siteDir,
    LABEL: 'joomlatest',
    STAMP: 'test',
    DRY: '0'
  })

  assert.match(out, /already at/)
  assert.equal(readdirSync(siteDir).filter((name) => name.startsWith('site.pre-host-dsh')).length, 0)
  assert.ok(existsSync(path.join(siteDir, 'site', 'AGENTS.md')))
})

test('both shapes holding content is a refusal, not a guess', () => {
  const dir = root()
  const siteDir = laneSite(dir, 'tchwp2')
  // Somebody already started levelling this one, or a second site folder was written beside it —
  // and there is no marker, so this is not a run of ours to resume.
  write(path.join(siteDir, 'site', 'AGENTS.md'), '# a different one\n')

  assert.throws(
    () =>
      callFunction('tracy_migrate_site_folder_level', {
        SITE_DIR: siteDir,
        LABEL: 'tchwp2',
        STAMP: 'test',
        DRY: '0'
      }),
    (error) => {
      assert.match(String(error.stderr), /both shapes hold content/)
      return true
    }
  )
  assert.ok(existsSync(path.join(siteDir, 'site', 'tchwp2', 'AGENTS.md')), 'nothing was moved')
})

test('an empty extra level is removed without a backup', () => {
  const dir = root()
  const siteDir = path.join(dir, 'tchjoomla5')
  write(path.join(siteDir, 'site', 'AGENTS.md'), '# agent instructions\n')
  mkdirSync(path.join(siteDir, 'site', 'tchjoomla5'), { recursive: true })

  const out = callFunction('tracy_migrate_site_folder_level', {
    SITE_DIR: siteDir,
    LABEL: 'tchjoomla5',
    STAMP: 'test',
    DRY: '0'
  })
  assert.match(out, /is empty — removing the extra level/)
  assert.ok(!existsSync(path.join(siteDir, 'site', 'tchjoomla5')))
})

test('the site folder is handed to the uid the host dsh runs as', () => {
  const dir = root()
  const siteDir = path.join(dir, 'fijitrips')
  write(path.join(siteDir, 'site', 'AGENTS.md'), '# agent instructions\n')
  const log = path.join(dir, 'chown.log')
  executable(path.join(dir, 'bin', 'chown'), `#!/bin/sh\necho "$@" >> ${JSON.stringify(log)}\n`)

  const out = callFunction('tracy_migrate_chown_site_folder', {
    SITE_DIR: siteDir,
    DRY: '0',
    DOCKER: fakeDocker(dir, { user: '33' }),
    HOST_DSH: 'tracy-dsh',
    CHOWN: path.join(dir, 'bin', 'chown')
  })

  assert.match(out, /giving .*\/site to 33:33/)
  assert.equal(
    readFileSync(log, 'utf8').trim(),
    `-R 33:33 ${path.join(siteDir, 'site')}`,
    'the whole site folder, recursively, to the uid read from the container'
  )
})

test("only the label's own project directory is merged into the host dsh", () => {
  const dir = root()
  const siteDir = path.join(dir, 'fijitrips')
  const home = path.join(siteDir, 'dsh-home')
  // What a lane's sessions root looks like: one directory per cwd the agent has stood in.
  write(path.join(home, 'sessions', '--site-fijitrips--', 'aaaaaaaa-1111', 'session.jsonl.zstd'), 'x')
  write(path.join(home, 'sessions', '--site-fijitrips--', 'bbbbbbbb-2222', 'session.jsonl.zstd'), 'x')
  write(path.join(home, 'sessions', '--var-www-html--', 'cccccccc-3333', 'session.jsonl.zstd'), 'x')
  write(path.join(home, 'storages', 'workspace.json'), '{"unit":{"name":"workspace","version":2}}')

  const vars = {
    SITE_DIR: siteDir,
    LABEL: 'fijitrips',
    ROOT: dir,
    DRY: '0',
    LANE_HOME: home,
    DOCKER: fakeDocker(dir),
    HOST_DSH: 'tracy-dsh',
    CHOWN: 'true'
  }
  const out = callFunction('tracy_migrate_sessions', vars)

  const hostSessions = path.join(dir, 'host-dsh', 'home', 'sessions')
  assert.ok(existsSync(path.join(hostSessions, '--site-fijitrips--', 'aaaaaaaa-1111', 'session.jsonl.zstd')))
  assert.ok(existsSync(path.join(hostSessions, '--site-fijitrips--', 'bbbbbbbb-2222')))
  assert.ok(!existsSync(path.join(hostSessions, '--var-www-html--')), 'a shared project name never merges')
  assert.match(out, /sessions carried over: 2 new, 0 already there/)

  const staged = path.join(dir, 'host-dsh', 'migrated', 'fijitrips')
  assert.ok(
    existsSync(path.join(staged, 'sessions', '--var-www-html--', 'cccccccc-3333')),
    'the stray is staged'
  )
  assert.ok(
    existsSync(path.join(staged, 'storages', 'workspace.json')),
    'the lane storages are staged for reference'
  )

  // Twice is once: a session already carried over is not carried again.
  assert.match(callFunction('tracy_migrate_sessions', vars), /sessions carried over: 0 new, 2 already there/)
})

test('a lane home that is not a lane home is a refusal, not a quiet zero', () => {
  const dir = root()
  const siteDir = path.join(dir, 'tracy-ai-8836f920')
  // `tracyai-dsh-alpha` keeps its home at `dsh-home-alpha`; a guessed `dsh-home` finds this.
  mkdirSync(path.join(siteDir, 'dsh-home'), { recursive: true })
  write(
    path.join(siteDir, 'dsh-home-alpha', 'sessions', '--site-tracy-ai-8836f920--', 'x', 's.jsonl.zstd'),
    'x'
  )

  assert.throws(
    () =>
      callFunction('tracy_migrate_sessions', {
        SITE_DIR: siteDir,
        LABEL: 'tracy-ai-8836f920',
        ROOT: dir,
        DRY: '0',
        LANE_HOME: path.join(siteDir, 'dsh-home'),
        CHOWN: 'true'
      }),
    (error) => {
      assert.match(String(error.stderr), /that is not a lane home/)
      return true
    }
  )
})

test('no lane home at all warns loudly and copies nothing', () => {
  const dir = root()
  const siteDir = path.join(dir, 'orphan')
  mkdirSync(siteDir, { recursive: true })
  const out = execFileSync(
    'bash',
    [
      '-c',
      `. "$1"; SITE_DIR=${JSON.stringify(siteDir)}; LABEL=orphan; ROOT=${JSON.stringify(dir)}; DRY=0; LANE_HOME=""; tracy_migrate_sessions 2>&1`,
      '_',
      SCRIPT
    ],
    { encoding: 'utf8' }
  )
  assert.match(out, /!! no lane home known/)
  assert.match(out, /--lane-home/)
})

test('the adopt flip writes a COMPLETE global when the file has none', () => {
  const dir = root()
  const storages = path.join(dir, 'host-dsh', 'home', 'storages')
  // `global: null` is what the JSON backend writes for a unit whose singleton was never set.
  write(
    path.join(storages, 'workspace.json'),
    JSON.stringify({
      unit: { name: 'workspace', version: 2 },
      global: null,
      tables: { workspaces: {} }
    })
  )

  const out = callFunction('tracy_adopt_sessions_main', {
    ROOT: dir,
    STAMP: 'test',
    DRY: '0',
    HOST_DSH: 'tracy-dsh',
    DOCKER: fakeDocker(dir),
    CHOWN: 'true'
  })

  const doc = JSON.parse(readFileSync(path.join(storages, 'workspace.json'), 'utf8'))
  assert.equal(doc.global.initialized, false)
  assert.deepEqual(doc.global.workspaceIds, [], 'workspaceIds has no schema default — it must be written')
  assert.deepEqual(doc.global.archivedSessionIds, [])
  assert.match(out, /initialized: false/)
  assert.ok(
    existsSync(path.join(storages, 'workspace.json.pre-adopt.test')),
    'the registry as it was is kept'
  )
  assert.match(out, /up and quiet/)
})

test('the adopt flip keeps an existing workspace order', () => {
  const dir = root()
  const storages = path.join(dir, 'host-dsh', 'home', 'storages')
  write(
    path.join(storages, 'workspace.json'),
    JSON.stringify({
      unit: { name: 'workspace', version: 2 },
      global: { initialized: true, workspaceIds: ['a', 'b'], archivedSessionIds: ['s1'] },
      tables: { workspaces: { a: { path: '/site/x' }, b: { path: '/site/y' } } }
    })
  )

  callFunction('tracy_adopt_sessions_main', {
    ROOT: dir,
    STAMP: 'test',
    DRY: '0',
    HOST_DSH: 'tracy-dsh',
    DOCKER: fakeDocker(dir),
    CHOWN: 'true'
  })

  const doc = JSON.parse(readFileSync(path.join(storages, 'workspace.json'), 'utf8'))
  assert.equal(doc.global.initialized, false)
  assert.deepEqual(doc.global.workspaceIds, ['a', 'b'])
  assert.deepEqual(doc.global.archivedSessionIds, ['s1'])
  assert.deepEqual(Object.keys(doc.tables.workspaces), ['a', 'b'], 'the table is untouched')
})

test('--adopt-sessions-only takes the adopt path and nothing else', () => {
  const dir = root()
  laneSite(dir, 'fijitrips')
  for (const flag of ['--adopt-sessions-only', '--adopt-sessions']) {
    const out = execFileSync('bash', [SCRIPT, 'fijitrips', flag, '--dry-run'], {
      encoding: 'utf8',
      env: { ...process.env, TRACY_ROOT: dir, TRACY_DOCKER: fakeDocker(dir) }
    })
    assert.match(out, /nothing to flip/, `${flag} went to the registry, not the migration`)
    assert.doesNotMatch(out, /render-compose/, `${flag} must not re-render a migrated site's compose`)
    assert.doesNotMatch(out, /attach-site/, `${flag} must not re-attach`)
    assert.doesNotMatch(out, /stopping fijitrips-dsh/, `${flag} must not stop the lane again`)
  }
})

test('a dry run prints every mutation and performs none', () => {
  const dir = root()
  const siteDir = laneSite(dir, 'fijitrips')
  const laneHome = path.join(siteDir, 'dsh-home')
  write(path.join(laneHome, 'sessions', '--site-fijitrips--', 'aaaa', 's.jsonl.zstd'), 'x')

  const out = execFileSync('bash', [SCRIPT, 'fijitrips', '--dry-run'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TRACY_ROOT: dir,
      TRACY_SITES_ROOT: path.join(dir, 'sites'),
      TRACY_DOCKER: fakeDocker(dir, { laneHome }),
      TRACY_WEB_IMAGE_TAGS: TAGS,
      TRACY_WEB_IMAGE_CHECK: '0',
      TRACY_CHOWN: 'true'
    }
  })

  assert.match(out, /DRY RUN/)
  assert.match(out, /lane home: .*dsh-home \(read from the container\)/, 'the home is read, never guessed')
  assert.match(
    out,
    new RegExp(`rendered ahead of time: ${re(WP83)}`),
    'the strict render happens in preflight, before anything moves'
  )
  assert.match(out, /preflight passed — acting now/)
  assert.match(
    out,
    /compose up -d --no-deps web/,
    '--no-deps, or a customer database restarts as a side effect'
  )
  assert.match(out, /attach-site\.sh fijitrips/)
  assert.match(out, /tracy-write-probe/, 'the probe WRITES; reading was never in doubt')
  assert.match(out, /platform: wordpress \(measured\)/)
  assert.match(out, /"label":"fijitrips"/)
  assert.match(out, /"attached":null/)
  assert.match(out, /"laneStopped":false/, 'a dry run stopped nothing and must not claim it did')
  assert.match(out, new RegExp(`"webImage":"${re(WP83)}"`), 'the image it WOULD run, not the old one')
  assert.match(out, /wrangler kv key put --binding=FLEET_SITES "host-dsh:fijitrips" on --remote/)
  assert.match(out, /wrangler kv key put --binding=FLEET_SITES "attached:fijitrips" on --remote/)

  // Nothing on disk moved.
  assert.ok(existsSync(path.join(siteDir, 'site', 'fijitrips', 'AGENTS.md')), 'the folder was not levelled')
  assert.equal(readdirSync(siteDir).filter((name) => name.includes('pre-host-dsh')).length, 0)
  assert.ok(!readFileSync(path.join(siteDir, '.env'), 'utf8').includes('PLATFORM='), '.env untouched')
  assert.ok(
    readFileSync(path.join(siteDir, 'docker-compose.yml'), 'utf8').includes('wordpress:php8.3-apache'),
    'the compose file on disk is still the old one'
  )
})

test('an unusable label is refused before anything is read', () => {
  const dir = root()
  for (const label of ['..', '.hidden', 'a/b']) {
    assert.throws(
      () =>
        execFileSync('bash', [SCRIPT, label, '--dry-run'], {
          encoding: 'utf8',
          env: { ...process.env, TRACY_ROOT: dir, TRACY_DOCKER: 'true' }
        }),
      (error) => {
        assert.match(String(error.stderr), /unusable label/)
        return true
      }
    )
  }
})

test('the rollback refuses when there is no pre-migration compose to restore', () => {
  const dir = root()
  laneSite(dir, 'fijitrips')
  assert.throws(
    () =>
      execFileSync('bash', [ROLLBACK, 'fijitrips', '--dry-run'], {
        encoding: 'utf8',
        env: { ...process.env, TRACY_ROOT: dir, TRACY_DOCKER: '/nonexistent-docker' }
      }),
    (error) => {
      assert.match(String(error.stderr), /no docker-compose\.yml\.pre-host-dsh/)
      return true
    }
  )
})

test('the rollback puts the site folder back where the lane binds it, and leaves .webroot alone', () => {
  const dir = root()
  const siteDir = laneSite(dir, 'fijitrips')
  // The state the migration leaves behind: levelled folder, one compose backup, its own marker.
  callFunction('tracy_migrate_site_folder_level', {
    SITE_DIR: siteDir,
    LABEL: 'fijitrips',
    STAMP: 'test',
    DRY: '0'
  })
  execFileSync('cp', [
    path.join(siteDir, 'docker-compose.yml'),
    path.join(siteDir, 'docker-compose.yml.pre-host-dsh.test')
  ])

  // `inspect` fails: this fake host has no lane container, which is the one branch that must not
  // stop a rollback. Everything else succeeds.
  const bin = path.join(dir, 'bin', 'docker-nolane')
  executable(bin, '#!/bin/sh\nif [ "$1" = inspect ]; then exit 1; fi\nexit 0\n')

  const out = execFileSync('bash', [ROLLBACK, 'fijitrips'], {
    encoding: 'utf8',
    env: { ...process.env, TRACY_ROOT: dir, TRACY_DOCKER: bin }
  })

  assert.ok(
    existsSync(path.join(siteDir, 'site', 'fijitrips', 'AGENTS.md')),
    'the lane finds its folder again'
  )
  assert.ok(
    existsSync(path.join(siteDir, 'site', '.webroot')),
    '.webroot stays put — it is where attach-site.sh lands its bind'
  )
  assert.match(out, /"siteFolderRelevelled":true/)
  assert.match(out, /wrangler kv key delete --binding=FLEET_SITES "host-dsh:fijitrips"/)
  assert.match(out, /wrangler kv key delete --binding=FLEET_SITES "attached:fijitrips"/)
  assert.match(out, /conversations exist in TWO places/, 'the divergence after an adopt is said out loud')
  assert.match(out, /rm -rf .*--site-fijitrips--/)
})

test('the rollback refuses to call a lane that died on start "started"', () => {
  const dir = root()
  const siteDir = laneSite(dir, 'fijitrips')
  execFileSync('cp', [
    path.join(siteDir, 'docker-compose.yml'),
    path.join(siteDir, 'docker-compose.yml.pre-host-dsh.test')
  ])
  // The container exists and `start` succeeds, but it is not running a moment later.
  const bin = path.join(dir, 'bin', 'docker-dead')
  executable(
    bin,
    [
      '#!/bin/sh',
      'if [ "$1" = inspect ]; then',
      '  case "$*" in *State.Running*) echo false ;; esac',
      '  exit 0',
      'fi',
      'exit 0'
    ].join('\n')
  )

  assert.throws(
    () =>
      execFileSync('bash', [ROLLBACK, 'fijitrips'], {
        encoding: 'utf8',
        env: { ...process.env, TRACY_ROOT: dir, TRACY_DOCKER: bin }
      }),
    (error) => {
      assert.match(String(error.stderr), /did NOT come back up/)
      return true
    }
  )
})

// ── round 2: the two runs that can leave a machine down ────────────────────────────────────────

/** A host dsh home with a registry in it, ready to be flipped. */
function hostRegistry(dir, global = { initialized: true, workspaceIds: ['a'], archivedSessionIds: [] }) {
  const file = path.join(dir, 'host-dsh', 'home', 'storages', 'workspace.json')
  write(
    file,
    JSON.stringify({
      unit: { name: 'workspace', version: 2 },
      global,
      tables: { workspaces: { a: { path: '/site/x' } } }
    })
  )
  return file
}

test('an adopt that fails after the stop restores the registry and puts the dsh back', () => {
  const dir = root()
  const file = hostRegistry(dir)
  const log = path.join(dir, 'docker.log')
  // `start` refuses, so the run dies with the container down — the one state this must never leave.
  const docker = fakeDocker(dir, { fail: 'start', running: 'false', log })

  assert.throws(
    () =>
      execFileSync('bash', [SCRIPT, 'fijitrips', '--adopt-sessions-only'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TRACY_ROOT: dir,
          TRACY_DOCKER: docker,
          TRACY_CHOWN: 'true',
          TRACY_DSH_WAIT_SECONDS: '0'
        }
      }),
    (error) => {
      const err = String(error.stderr)
      assert.match(err, /putting tracy-dsh back/)
      assert.match(err, /restoring the registry from/)
      assert.match(err, /IS NOT SERVING/, 'a dsh that will not come back is shouted about, not implied')
      assert.match(err, /cp -a .*pre-adopt.* && .*restart tracy-dsh/, 'the recovery line names both halves')
      return true
    }
  )

  const doc = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(doc.global.initialized, true, 'the registry is back as it was — the flip is undone')
  const calls = readFileSync(log, 'utf8')
  assert.match(calls, /^stop tracy-dsh /m, 'it stopped')
  assert.ok(
    calls.split('\n').filter((line) => line.startsWith('start tracy-dsh')).length >= 2,
    'it tried to start again in the unwind, not only on the happy path'
  )
})

test('an adopt whose dsh never serves FAILS — the wait does not fall back to a weaker test', () => {
  const dir = root()
  const file = hostRegistry(dir)
  // `start` succeeds, the container exists — and it is not running. Exactly the crash-loop shape.
  const docker = fakeDocker(dir, { running: 'false' })

  assert.throws(
    () =>
      execFileSync('bash', [SCRIPT, 'fijitrips', '--adopt-sessions-only'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TRACY_ROOT: dir,
          TRACY_DOCKER: docker,
          TRACY_CHOWN: 'true',
          TRACY_DSH_WAIT_SECONDS: '0'
        }
      }),
    (error) => {
      assert.match(String(error.stderr), /is not serving 0s after the flip/)
      return true
    }
  )
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).global.initialized, true, 'and it undid the flip')
})

test('the log is read from a stamp docker can place in time', () => {
  const dir = root()
  hostRegistry(dir)
  const log = path.join(dir, 'docker.log')
  const docker = fakeDocker(dir, { log })

  execFileSync('bash', [SCRIPT, 'fijitrips', '--adopt-sessions-only'], {
    encoding: 'utf8',
    env: { ...process.env, TRACY_ROOT: dir, TRACY_DOCKER: docker, TRACY_CHOWN: 'true' }
  })

  const since = readFileSync(log, 'utf8')
    .split('\n')
    .find((line) => line.startsWith('logs --since'))
  assert.ok(since, 'the log was read at all')
  // No zone means docker reads it as the HOST's local time: west of UTC the mark is in the future
  // and nothing ever matches (fail-open), east of it the previous boot's errors are read as this
  // one's.
  assert.match(since.split(' ')[2], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
})

test('a migration that fails mid-flight puts the folder back BEFORE it starts the lane', () => {
  const dir = root()
  const siteDir = laneSite(dir, 'fijitrips')
  const laneHome = path.join(siteDir, 'dsh-home')
  mkdirSync(path.join(laneHome, 'sessions'), { recursive: true })
  const log = path.join(dir, 'docker.log')
  const original = readFileSync(path.join(siteDir, 'docker-compose.yml'), 'utf8')
  // `compose` refuses at step 5 — after the folder has moved and the compose file has been swapped.
  const docker = fakeDocker(dir, {
    laneHome,
    fail: 'compose',
    log,
    nested: path.join(siteDir, 'site', 'fijitrips')
  })

  assert.throws(
    () =>
      execFileSync('bash', [SCRIPT, 'fijitrips'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TRACY_ROOT: dir,
          TRACY_SITES_ROOT: path.join(dir, 'sites'),
          TRACY_DOCKER: docker,
          TRACY_CHOWN: 'true',
          TRACY_WEB_IMAGE_TAGS: TAGS,
          TRACY_WEB_IMAGE_CHECK: '0',
          TRACY_LANE_WAIT_SECONDS: '0',
          TRACY_WEB_WAIT_SECONDS: '0'
        }
      }),
    (error) => {
      assert.match(String(error.stderr), /putting the site folder back one level down/)
      return true
    }
  )

  // N6: the compose file is whole, and it is the one the site was serving from.
  assert.equal(readFileSync(path.join(siteDir, 'docker-compose.yml'), 'utf8'), original)
  assert.ok(
    !existsSync(path.join(siteDir, '.docker-compose.yml.host-dsh')),
    'no staged half-file left behind'
  )

  // N7: the folder is where the lane binds it…
  assert.ok(existsSync(path.join(siteDir, 'site', 'fijitrips', 'AGENTS.md')))
  // …and it was already there when the lane was started. `nested=yes` is stamped by the fake docker
  // at call time, so this is the ORDER, not just the end state.
  const start = readFileSync(log, 'utf8')
    .split('\n')
    .find((line) => line.startsWith('start fijitrips-dsh'))
  assert.ok(start, 'the lane was started again')
  assert.match(start, /nested=yes/, 'the lane must never be started against an empty bind source')
})

test('a half-moved folder stops the unwind from starting the lane at all', () => {
  const dir = root()
  const siteDir = laneSite(dir, 'fijitrips')
  const laneHome = path.join(siteDir, 'dsh-home')
  mkdirSync(path.join(laneHome, 'sessions'), { recursive: true })
  // The marker says a previous run was interrupted mid-move; this run resumes it and then fails.
  // Whatever else happens, a lane must not be started while the shapes are ambiguous.
  const docker = fakeDocker(dir, { laneHome, fail: 'compose' })
  const chown = path.join(dir, 'bin', 'chown-marker')
  // Leave the marker behind at the moment the failure happens, by writing it from the chown step.
  executable(
    chown,
    `#!/bin/sh\ntouch ${JSON.stringify(path.join(siteDir, '.site-level-migrating'))}\nexit 0\n`
  )

  assert.throws(
    () =>
      execFileSync('bash', [SCRIPT, 'fijitrips'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TRACY_ROOT: dir,
          TRACY_SITES_ROOT: path.join(dir, 'sites'),
          TRACY_DOCKER: docker,
          TRACY_CHOWN: chown,
          TRACY_WEB_IMAGE_TAGS: TAGS,
          TRACY_WEB_IMAGE_CHECK: '0',
          TRACY_LANE_WAIT_SECONDS: '0',
          TRACY_WEB_WAIT_SECONDS: '0'
        }
      }),
    (error) => {
      const err = String(error.stderr)
      assert.match(err, /MOVE IS HALF DONE/)
      assert.match(err, /NOT starting fijitrips-dsh/, 'an ambiguous folder is not a lane to restart')
      return true
    }
  )
})

test('an option missing its value says so instead of dying on an unbound variable', () => {
  const dir = root()
  for (const flag of ['--lane', '--lane-home', '--web']) {
    assert.throws(
      () =>
        execFileSync('bash', [SCRIPT, 'fijitrips', flag], {
          encoding: 'utf8',
          env: { ...process.env, TRACY_ROOT: dir, TRACY_DOCKER: 'true' }
        }),
      (error) => {
        assert.match(String(error.stderr), new RegExp(`${flag} needs a`))
        return true
      }
    )
  }
})

test('the owner comes from the container as a NUMBER, not a name the host would have to resolve', () => {
  const dir = root()
  const siteDir = path.join(dir, 'fijitrips')
  write(path.join(siteDir, 'site', 'AGENTS.md'), '# a\n')
  const log = path.join(dir, 'chown.log')
  executable(path.join(dir, 'bin', 'chown'), `#!/bin/sh\necho "$@" >> ${JSON.stringify(log)}\n`)

  callFunction('tracy_migrate_chown_site_folder', {
    SITE_DIR: siteDir,
    DRY: '0',
    // The container calls itself `www-data`; only it knows which uid that is.
    DOCKER: fakeDocker(dir, { user: 'www-data', uid: '33', gid: '33' }),
    HOST_DSH: 'tracy-dsh',
    CHOWN: path.join(dir, 'bin', 'chown')
  })

  assert.equal(readFileSync(log, 'utf8').trim(), `-R 33:33 ${path.join(siteDir, 'site')}`)
})

// ── round 3: the uid, asked while there is still something to ask ──────────────────────────────

test('the uid is read BEFORE the host dsh is stopped', () => {
  const dir = root()
  hostRegistry(dir)
  const log = path.join(dir, 'docker.log')

  execFileSync('bash', [SCRIPT, 'fijitrips', '--adopt-sessions-only'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TRACY_ROOT: dir,
      TRACY_DOCKER: fakeDocker(dir, { log, uid: '33', gid: '33' }),
      TRACY_CHOWN: 'true'
    }
  })

  const calls = readFileSync(log, 'utf8').split('\n')
  const asked = calls.findIndex((line) => line.startsWith('exec tracy-dsh id -u'))
  const stopped = calls.findIndex((line) => line.startsWith('stop tracy-dsh'))
  assert.ok(asked >= 0, 'it asked the running process what uid it is')
  assert.ok(stopped >= 0, 'it stopped the container')
  // Every chown in this run — the flip's, and the unwind's — happens with the container down, and
  // a stopped container answers no exec. Asking afterwards means never asking.
  assert.ok(asked < stopped, 'the uid must be read while the container can still be asked')
  assert.equal(
    calls.filter((line) => line.startsWith('exec tracy-dsh id -u')).length,
    1,
    'and read once, not once per chown'
  )
})

test('a host dsh already stopped at entry resolves its uid through its image, never by name', () => {
  const dir = root()
  hostRegistry(dir)
  const chownLog = path.join(dir, 'chown.log')
  executable(path.join(dir, 'bin', 'chown'), `#!/bin/sh\necho "$@" >> ${JSON.stringify(chownLog)}\n`)
  // The container exists, is NOT running, and names its user. Only its image knows the number.
  const docker = fakeDocker(dir, { running: 'false', user: 'www-data', image: 'tracy/dsh:test', runId: '33' })

  assert.throws(
    () =>
      execFileSync('bash', [SCRIPT, 'fijitrips', '--adopt-sessions-only'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TRACY_ROOT: dir,
          TRACY_DOCKER: docker,
          TRACY_CHOWN: path.join(dir, 'bin', 'chown'),
          TRACY_DSH_WAIT_SECONDS: '0'
        }
      }),
    (error) => {
      assert.match(String(error.stderr), /resolved www-data to 33:33 through tracy\/dsh:test/)
      return true
    }
  )

  const owners = readFileSync(chownLog, 'utf8').trim().split('\n')
  assert.ok(owners.length > 0, 'it did chown the registry')
  for (const call of owners) {
    assert.match(call, /^33:33 /, 'a number, never a name the host would resolve in its own passwd')
  }
})

test('a uid nobody can answer for REFUSES before the container is stopped', () => {
  const dir = root()
  hostRegistry(dir)
  const log = path.join(dir, 'docker.log')
  // Not running, named user, and an image that answers nothing.
  const docker = fakeDocker(dir, { running: 'false', user: 'www-data', image: 'tracy/dsh:test', log })

  assert.throws(
    () =>
      execFileSync('bash', [SCRIPT, 'fijitrips', '--adopt-sessions-only'], {
        encoding: 'utf8',
        env: { ...process.env, TRACY_ROOT: dir, TRACY_DOCKER: docker, TRACY_CHOWN: 'true' }
      }),
    (error) => {
      const err = String(error.stderr)
      assert.match(err, /cannot tell which uid tracy-dsh runs as/)
      assert.match(err, /TRACY_HOST_DSH_OWNER=<uid>:<gid>/, 'and it says how to answer by hand')
      assert.match(err, /not stopping tracy-dsh/, 'refusing BEFORE the machine is taken down')
      return true
    }
  )
  assert.ok(
    !readFileSync(log, 'utf8')
      .split('\n')
      .some((line) => line.startsWith('stop ')),
    'nothing was stopped'
  )
})

test('putting the site folder back refuses a collision instead of nesting it', () => {
  const dir = root()
  const siteDir = path.join(dir, 'fijitrips')
  write(path.join(siteDir, 'site', 'AGENTS.md'), '# levelled\n')
  write(path.join(siteDir, 'site', 'fijitrips', 'AGENTS.md'), '# already there\n')

  const out = execFileSync(
    'bash',
    [
      '-c',
      `. "$1"; SITE_DIR=${JSON.stringify(siteDir)}; LABEL=fijitrips; DRY=0; tracy_migrate_unlevel 2>&1 || echo REFUSED`,
      '_',
      SCRIPT
    ],
    { encoding: 'utf8' }
  )

  assert.match(out, /cannot put AGENTS.md back/)
  assert.match(out, /REFUSED/)
  assert.equal(
    readFileSync(path.join(siteDir, 'site', 'fijitrips', 'AGENTS.md'), 'utf8'),
    '# already there\n',
    'the file that was already there is untouched'
  )
})
