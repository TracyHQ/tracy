import { createHash } from 'node:crypto'
/**
 * Every decision that turns a session's cwd into a `docker exec` argv, pinned without Docker.
 * The two that matter most: the container comes from the cwd and nowhere else, and a cwd outside
 * the sites root never runs anything.
 *
 *   node --test packages/tools/tracy-subprocess-docker/test/route.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BLANKED_SECRET_ENV,
  EXEC_ID_VAR,
  READ_ONLY_BLANKED_ENV,
  blankedSecretFlags,
  REAPER_NOTHING_FOUND,
  rgSidecar,
  assertExecId,
  containerPath,
  envFlags,
  execArgv,
  execTarget,
  mapProgram,
  reaperArgv,
  reaperScript,
  runsOnHarness,
  siteOf,
  attachmentsRootOf,
  readsOwnAttachment,
  readsOwnSpill,
  workdirDecision,
  APP_NEXT_ANY_CMS,
  outsideSiteReason,
  OUTSIDE_SITE_NEXT,
  EMDASH_APP_NEXT
} from '../src/route.mjs'

const cfg = { docker: 'docker', sitesRoot: '/site', containerRoot: '/site', containerName: '{label}-web-1' }

test('siteOf: label is the first segment under the root', () => {
  assert.deepEqual(siteOf('/site/fijitrips/.webroot/wp-content', '/site'), {
    label: 'fijitrips',
    relative: '.webroot/wp-content'
  })
  assert.deepEqual(siteOf('/site/fijitrips', '/site'), { label: 'fijitrips', relative: '' })
})

test('siteOf: outside the root is refused, never run on the host', () => {
  assert.throws(() => siteOf('/desk-home/profiles/web', '/site'), /outside \/site/)
  assert.throws(() => siteOf('/site', '/site'), /outside \/site/)
  assert.throws(() => siteOf('/sitefoo/x', '/site'), /outside \/site/)
})

test('siteOf: a label that is not a fleet label is refused', () => {
  assert.throws(() => siteOf('/site/../etc', '/site'), /not a site label/)
  assert.throws(() => siteOf('/site/Bad_Label', '/site'), /not a site label/)
  assert.throws(() => siteOf('/site/a.b', '/site'), /not a site label/)
})

test('containerPath: the dev root on a Mac maps onto /site inside the container', () => {
  assert.equal(
    containerPath('/Users/you/tch/tch/sites/wpdemo/.webroot', '/Users/you/tch/tch/sites', '/site'),
    '/site/wpdemo/.webroot'
  )
  assert.equal(containerPath('/site/wpdemo', '/site', '/site'), '/site/wpdemo')
})

test('envFlags: strings become -e, tombstones vanish, bad names are refused', () => {
  assert.deepEqual(envFlags({ DSH_SESSION_ID: 'abc', GONE: undefined }), ['-e', 'DSH_SESSION_ID=abc'])
  assert.deepEqual(envFlags(undefined), [])
  assert.throws(() => envFlags({ 'A B': 'x' }), /environment name/)
})

test('mapProgram: the packaged ripgrep of the harness host becomes the container rg', () => {
  assert.equal(
    mapProgram(
      '/usr/local/lib/dsh/node_modules/.pnpm/@vscode+ripgrep@1.15.9/node_modules/@vscode/ripgrep/bin/rg'
    ),
    'rg'
  )
  assert.equal(mapProgram('bash'), 'bash')
  assert.equal(mapProgram('/usr/bin/php'), '/usr/bin/php')
})

test('execArgv: only a read-only seat runs as nobody', () => {
  const userOf = (mode) => {
    const argv = execArgv({
      argv: ['bash', '-c', 'true'],
      cwd: '/site/fijitrips',
      env: undefined,
      mode,
      root: '/site/fijitrips',
      tty: false,
      cfg
    })
    return argv[argv.indexOf('-u') + 1]
  }
  assert.equal(userOf('read-only'), 'nobody')
  assert.equal(userOf('workspace-write'), 'www-data')
  assert.equal(userOf('danger-full-access'), 'www-data')
})

test('execArgv: a bash call from an editor seat', () => {
  const argv = execArgv({
    argv: ['bash', '-c', 'wp core version'],
    cwd: '/site/fijitrips/.webroot',
    env: { DSH_SESSION_ID: 's1' },
    mode: 'workspace-write',
    root: '/site/fijitrips',
    tty: false,
    cfg
  })
  assert.deepEqual(argv, [
    'docker',
    'exec',
    '-i',
    '-u',
    'www-data',
    '-w',
    '/site/fijitrips/.webroot',
    '-e',
    'DSH_SESSION_ID=s1',
    ...blankedSecretFlags('workspace-write'),
    'fijitrips-web-1',
    'bash',
    '-c',
    'wp core version'
  ])
})

test('execArgv: an unstamped (owner) call runs as www-data, a terminal gets a tty', () => {
  const argv = execArgv({
    argv: ['bash', '-l'],
    cwd: '/site/fijitrips',
    env: undefined,
    mode: null,
    root: null,
    tty: true,
    cfg
  })
  assert.deepEqual(argv, [
    'docker',
    'exec',
    '-it',
    '-u',
    'www-data',
    '-w',
    '/site/fijitrips',
    ...blankedSecretFlags(null),
    'fijitrips-web-1',
    'bash',
    '-l'
  ])
})

test('execArgv: the container name never comes from argv or env', () => {
  const argv = execArgv({
    argv: ['bash', '-c', 'docker exec other-web-1 id'],
    cwd: '/site/fijitrips',
    env: { CONTAINER: 'other-web-1' },
    mode: null,
    root: null,
    tty: false,
    cfg
  })
  // The container is the token right before the program; env and argv text never move it.
  assert.equal(argv[argv.indexOf('bash') - 1], 'fijitrips-web-1')
  assert.equal(argv.filter((a) => a === 'other-web-1').length, 0)
})

test('siteOf: a ".." segment after the label leaves the site folder and is refused', () => {
  assert.throws(() => siteOf('/site/wpdemo/../../etc', '/site'), /not a site path/)
  assert.throws(() => siteOf('/site/wpdemo/..', '/site'), /not a site path/)
  assert.throws(() => siteOf('/site/wpdemo/a/../../fijitrips', '/site'), /not a site path/)
  // A dot-prefixed name that merely starts with two dots is a real directory, not a climb.
  assert.deepEqual(siteOf('/site/wpdemo/..keep', '/site'), { label: 'wpdemo', relative: '..keep' })
})

test('execArgv: a cwd in another site than the stamped workspace is refused', () => {
  assert.throws(
    () =>
      execArgv({
        argv: ['bash', '-c', 'id'],
        cwd: '/site/fijitrips/.webroot',
        env: undefined,
        mode: 'workspace-write',
        root: '/site/wpdemo',
        tty: false,
        cfg
      }),
    /belongs to another site than the session's workspace/
  )
})

test('execArgv: the same site under the stamped workspace passes through', () => {
  const argv = execArgv({
    argv: ['bash', '-c', 'id'],
    cwd: '/site/wpdemo/.webroot/wp-content',
    env: undefined,
    mode: 'read-only',
    root: '/site/wpdemo',
    tty: false,
    cfg
  })
  assert.equal(argv[argv.indexOf('bash') - 1], 'wpdemo-web-1')
  assert.equal(argv[argv.indexOf('-w') + 1], '/site/wpdemo/.webroot/wp-content')
})

test('execArgv: a stamped root outside the sites root is refused, not ignored', () => {
  assert.throws(
    () =>
      execArgv({
        argv: ['id'],
        cwd: '/site/wpdemo',
        env: undefined,
        mode: 'read-only',
        root: '/desk-home/profiles/web',
        tty: false,
        cfg
      }),
    /outside \/site/
  )
})

/**
 * workdirDecision — the same judgement as execArgv's root check, one layer up, for the calls that
 * never carry a stamp: `danger-full-access` skips confine() entirely.
 */
test("workdirDecision: a tool with no working-directory argument is not this guard's business", () => {
  const call = {
    name: 'read',
    args: { path: '/site/fijitrips/x' },
    sessionCwd: '/site/wpdemo',
    sitesRoot: '/site'
  }
  assert.equal(workdirDecision(call), null)
})

test('workdirDecision: an absent or relative working directory is allowed', () => {
  assert.equal(
    workdirDecision({
      name: 'bash',
      args: { command: 'id' },
      sessionCwd: '/site/wpdemo',
      sitesRoot: '/site'
    }),
    null
  )
  assert.equal(
    workdirDecision({
      name: 'bash',
      args: { command: 'id', workdir: '.webroot' },
      sessionCwd: '/site/wpdemo',
      sitesRoot: '/site'
    }),
    null
  )
  assert.equal(
    workdirDecision({
      name: 'terminal_open',
      args: { type: 'shell' },
      sessionCwd: '/site/wpdemo',
      sitesRoot: '/site'
    }),
    null
  )
})

test("workdirDecision: an absolute working directory in the session's own site is allowed", () => {
  assert.equal(
    workdirDecision({
      name: 'bash',
      args: { command: 'id', workdir: '/site/wpdemo/.webroot' },
      sessionCwd: '/site/wpdemo',
      sitesRoot: '/site'
    }),
    null
  )
  assert.equal(
    workdirDecision({
      name: 'terminal_open',
      args: { type: 'shell', cwd: '/site/wpdemo' },
      sessionCwd: '/site/wpdemo/.webroot',
      sitesRoot: '/site'
    }),
    null
  )
})

test('workdirDecision: an absolute working directory naming another site is denied', () => {
  const reason = workdirDecision({
    name: 'bash',
    args: { command: 'id', workdir: '/site/fijitrips' },
    sessionCwd: '/site/wpdemo',
    sitesRoot: '/site'
  })
  assert.match(String(reason), /belongs to another site than the session's workspace/)
})

test('workdirDecision: the terminal tool is guarded on its own argument name', () => {
  const reason = workdirDecision({
    name: 'terminal_open',
    args: { type: 'shell', cwd: '/site/fijitrips' },
    sessionCwd: '/site/wpdemo',
    sitesRoot: '/site'
  })
  assert.match(String(reason), /belongs to another site than the session's workspace/)
})

test('workdirDecision: without a session workspace there is nothing to check against, so deny', () => {
  const reason = workdirDecision({
    name: 'bash',
    args: { command: 'id', workdir: '/site/wpdemo' },
    sessionCwd: undefined,
    sitesRoot: '/site'
  })
  assert.match(String(reason), /no session workspace/)
})

test("workdirDecision: a working directory outside the sites root is denied with siteOf's own message", () => {
  const reason = workdirDecision({
    name: 'bash',
    args: { command: 'id', workdir: '/etc' },
    sessionCwd: '/site/wpdemo',
    sitesRoot: '/site'
  })
  assert.match(String(reason), /outside \/site/)
})

test('workdirDecision: a ".." climb out of the session site is denied, not resolved', () => {
  const reason = workdirDecision({
    name: 'bash',
    args: { command: 'id', workdir: '/site/wpdemo/../fijitrips' },
    sessionCwd: '/site/wpdemo',
    sitesRoot: '/site'
  })
  assert.match(String(reason), /not a site path/)
})

test('workdirDecision: a non-object or non-string argument never throws', () => {
  assert.equal(
    workdirDecision({ name: 'bash', args: undefined, sessionCwd: '/site/wpdemo', sitesRoot: '/site' }),
    null
  )
  assert.equal(
    workdirDecision({ name: 'bash', args: null, sessionCwd: '/site/wpdemo', sitesRoot: '/site' }),
    null
  )
  assert.equal(
    workdirDecision({ name: 'bash', args: 'nope', sessionCwd: '/site/wpdemo', sitesRoot: '/site' }),
    null
  )
  assert.equal(
    workdirDecision({ name: 'bash', args: { workdir: 42 }, sessionCwd: '/site/wpdemo', sitesRoot: '/site' }),
    null
  )
})

test('execArgv: the exec id is tagged onto the command as the LAST -e flag', () => {
  const argv = execArgv({
    argv: ['bash', '-c', 'sleep 300'],
    cwd: '/site/wpdemo',
    env: { FOO: 'bar' },
    mode: 'workspace-write',
    root: '/site/wpdemo',
    tty: false,
    execId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    cfg
  })
  // After the caller's own entries and immediately before the container name: docker keeps the
  // last `-e` for a repeated key, so a command asking for TRACY_EXEC_ID cannot blind the reaper.
  const blanks = blankedSecretFlags('workspace-write')
  assert.deepEqual(argv.slice(-(8 + blanks.length)), [
    '-e',
    'FOO=bar',
    ...blanks,
    '-e',
    `${EXEC_ID_VAR}=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`,
    'wpdemo-web-1',
    'bash',
    '-c',
    'sleep 300'
  ])
})

test('execArgv: without an exec id there is no marker flag, only the blanked secrets', () => {
  const argv = execArgv({
    argv: ['id'],
    cwd: '/site/wpdemo',
    env: undefined,
    mode: 'read-only',
    root: null,
    tty: false,
    cfg
  })
  assert.deepEqual(argv, [
    'docker',
    'exec',
    '-i',
    '-u',
    'nobody',
    '-w',
    '/site/wpdemo',
    ...blankedSecretFlags('read-only'),
    'wpdemo-web-1',
    'id'
  ])
})

test('assertExecId: only what can be spelled into a shell script unquoted-safe', () => {
  assert.equal(assertExecId('7f1b0c2e-0000-4000-8000-abcdefabcdef'), '7f1b0c2e-0000-4000-8000-abcdefabcdef')
  for (const bad of ["x'; rm -rf /; #", 'a b', '$(id)', '', '-leading', 'a'.repeat(65)]) {
    assert.throws(() => assertExecId(bad), /is not an exec id/, JSON.stringify(bad))
  }
})

test('execTarget: the container and the user the reaper must use are the spawn own pair', () => {
  assert.deepEqual(
    execTarget({ cwd: '/site/wpdemo/.webroot', mode: 'read-only', root: '/site/wpdemo', cfg }),
    {
      label: 'wpdemo',
      user: 'nobody',
      container: 'wpdemo-web-1'
    }
  )
  // Unstamped is `danger-full-access`, the same default execArgv has always applied.
  assert.equal(execTarget({ cwd: '/site/wpdemo', mode: null, root: null, cfg }).user, 'www-data')
  assert.throws(
    () => execTarget({ cwd: '/site/fijitrips', mode: 'workspace-write', root: '/site/wpdemo', cfg }),
    /belongs to another site/
  )
})

test('reaperArgv: a plain exec, same container, same user, no tty and no stdin', () => {
  const argv = reaperArgv({
    execId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    user: 'nobody',
    container: 'wpdemo-web-1',
    graceSeconds: 2,
    cfg
  })
  assert.deepEqual(argv.slice(0, 6), ['docker', 'exec', '-u', 'nobody', 'wpdemo-web-1', 'sh'])
  assert.equal(argv[6], '-c')
  assert.equal(argv.length, 8)
  // No `-i`/`-t`: the reaper is the harness cleaning up, not a seat's command.
  assert.equal(argv.includes('-i'), false)
  assert.equal(argv.includes('-it'), false)
})

test('reaperScript: TERM what carries the marker, KILL the survivors, and never itself', () => {
  const script = reaperScript('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 2)
  assert.match(script, /marker='TRACY_EXEC_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'/)
  assert.match(script, /for dir in \/proc\/\[0-9\]\*/)
  assert.match(script, /environ/)
  assert.match(script, /kill -TERM \$pids/)
  // "nothing carried the marker" is a distinct answer, not a success: the provider retries once on
  // it when the spawn was terminated before the daemon could start the exec.
  assert.match(script, new RegExp(`\\|\\| exit ${REAPER_NOTHING_FOUND}$`, 'm'))
  assert.equal(REAPER_NOTHING_FOUND !== 0, true)
  assert.match(script, /\nsleep 2\n/)
  assert.match(script, /kill -KILL \$pids/)
  // Its own pid is skipped, and the marker is a plain shell variable — not exported — so the
  // script's own /proc/<pid>/environ cannot match it.
  assert.match(script, /self=\$\$/)
  assert.match(script, /\$pid" != "\$self/)
  assert.equal(/export/.test(script), false)
})

test('reaperScript: the grace is whole seconds, and bounded — it is spelled into `sleep`', () => {
  assert.throws(() => reaperScript('abc', 1.5), /whole seconds/)
  assert.throws(() => reaperScript('abc', -1), /whole seconds/)
  assert.throws(() => reaperScript('abc', 600), /whole seconds/)
  assert.throws(() => reaperScript("a'; id; #", 2), /is not an exec id/)
})

test('mapProgram: every shape resolveRgPath() can return becomes the container own rg', () => {
  // MEASURED 06/09 in the fleet image, and the reason this test exists: `@vscode/ripgrep` delegates
  // to a per-platform package, and `rgPath` points inside it. The old pattern demanded the bare
  // segment `ripgrep`, so this path went into `docker exec` verbatim and every grep/glob answered
  // `exit 127` — a failure with no file name in it.
  const measured =
    '/opt/dsh/node_modules/.pnpm/@vscode+ripgrep-linux-arm64@1.18.0/node_modules/@vscode/ripgrep-linux-arm64/bin/rg'
  assert.equal(mapProgram(measured), 'rg')
  assert.equal(mapProgram('/x/node_modules/@vscode/ripgrep/bin/rg'), 'rg')
  assert.equal(mapProgram('/x/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg'), 'rg')
  assert.equal(mapProgram('C:\\x\\@vscode\\ripgrep-win32-x64\\bin\\rg.exe'), 'rg')
  // The single-file runtime's sidecar, the other branch of resolveRgPath(): the exact path next to
  // the running executable, and nothing else that merely ends in `-rg`.
  assert.equal(mapProgram(rgSidecar('/opt/dsh/bin/dsh'), undefined, '/opt/dsh/bin/dsh'), 'rg')
  // Everything else is the container's own PATH lookup, untouched.
  assert.equal(mapProgram('php'), 'php')
  assert.equal(mapProgram('/usr/bin/wp'), '/usr/bin/wp')
})

test('mapProgram: a program inside the SITE is never rewritten — that file is the customer\u2019s', () => {
  // A customer whose own tree happens to contain a vendored ripgrep: their file, their path.
  const vendored = '/site/wpdemo/node_modules/@vscode/ripgrep/bin/rg'
  assert.equal(mapProgram(vendored, '/site'), vendored)
  // The exclusion is what makes that true — without a sitesRoot the packaged pattern claims it.
  assert.equal(mapProgram(vendored), 'rg')
})

test('execArgv: a packaged ripgrep path arrives in the container as `rg`', () => {
  const argv = execArgv({
    argv: [
      '/opt/dsh/node_modules/.pnpm/@vscode+ripgrep-linux-arm64@1.18.0/node_modules/@vscode/ripgrep-linux-arm64/bin/rg',
      '--no-config',
      '--json',
      'SECRET'
    ],
    cwd: '/site/wpdemo',
    env: undefined,
    mode: null,
    root: null,
    tty: false,
    cfg
  })
  assert.deepEqual(argv.slice(-4), ['rg', '--no-config', '--json', 'SECRET'])
})

test('rgSidecar: the path resolveRgPath() would use, on both platform shapes', () => {
  assert.equal(rgSidecar('/opt/dsh/bin/dsh'), '/opt/dsh/bin/dsh-rg')
  assert.equal(rgSidecar('/usr/local/bin/node'), '/usr/local/bin/node-rg')
  // Windows: the `.exe` moves to the end, it is not appended to the name.
  assert.equal(rgSidecar('C:\\Program Files\\dsh\\dsh.exe'), 'C:\\Program Files\\dsh\\dsh-rg.exe')
  assert.equal(rgSidecar('C:/dsh/node.EXE'), 'C:/dsh/node-rg.exe')
  // Whatever this process is, the answer is a real sibling of it.
  assert.equal(rgSidecar(), `${process.execPath}-rg`)
})

test('mapProgram: only THE sidecar is rewritten — a tool that merely ends in -rg is not', () => {
  // The rule used to be a `-rg` suffix pattern, which also swallowed somebody's own binary and
  // silently ran ripgrep instead, with nothing anywhere saying why. Anchored to one exact path.
  const execPath = '/opt/dsh/bin/dsh'
  assert.equal(mapProgram('/opt/dsh/bin/dsh-rg', undefined, execPath), 'rg')
  assert.equal(mapProgram('/usr/local/bin/foo-rg', undefined, execPath), '/usr/local/bin/foo-rg')
  assert.equal(mapProgram('/usr/local/bin/ripgrep-rg', undefined, execPath), '/usr/local/bin/ripgrep-rg')
  // A different runtime's sidecar is not this runtime's either.
  assert.equal(mapProgram('/usr/local/bin/node-rg', undefined, execPath), '/usr/local/bin/node-rg')
  // And the site tree still wins, before any of this.
  assert.equal(mapProgram('/site/wpdemo/bin/dsh-rg', '/site', execPath), '/site/wpdemo/bin/dsh-rg')
})

/**
 * runsOnHarness — dsh's own ripgrep runs in the dsh process, because no web container has that
 * binary. Leaving the container means this check is the boundary, so every rule is pinned.
 */
const HARNESS_RG =
  '/opt/dsh/node_modules/.pnpm/@vscode+ripgrep-linux-arm64@1.18.0/node_modules/@vscode/ripgrep-linux-arm64/bin/rg'

test('runsOnHarness: the argv dsh builds for grep and for glob runs in the dsh process', () => {
  const site = { cwd: '/site/wpdemo', sitesRoot: '/site' }
  // Exactly what `runRipgrep` hands the seam: `--no-config`, then `buildGrepCommand`/`buildGlobCommand`.
  const grep = [HARNESS_RG, '--no-config', '--json', '--regexp=DB_NAME', '--glob=*.php', '--', '.webroot']
  assert.equal(runsOnHarness({ argv: grep, ...site }), true)
  const glob = [
    HARNESS_RG,
    '--no-config',
    '--files',
    '--glob=**/*.php',
    '--sort=modified',
    '--no-ignore',
    '--hidden',
    '--glob=!**/.git',
    '--glob=!**/.git/**'
  ]
  assert.equal(runsOnHarness({ argv: glob, ...site }), true)
  // The single-file runtime's sidecar is the same binary, and only the exact path counts.
  const execPath = '/opt/dsh/bin/dsh'
  assert.equal(
    runsOnHarness({ argv: ['/opt/dsh/bin/dsh-rg', '--json', '--regexp=x'], ...site, execPath }),
    true
  )
})

test('runsOnHarness: any other program stays on the docker exec path', () => {
  const site = { cwd: '/site/wpdemo', sitesRoot: '/site' }
  for (const program of [
    'bash',
    'rg',
    '/usr/bin/rg',
    '/usr/local/bin/foo-rg',
    // A customer's vendored ripgrep is the customer's binary, never run in the dsh process...
    '/site/wpdemo/node_modules/@vscode/ripgrep/bin/rg',
    // ...and a path that only reaches the site tree after normalization is not let through either.
    '//site/wpdemo/node_modules/@vscode/ripgrep/bin/rg',
    '/opt/../site/wpdemo/node_modules/@vscode/ripgrep/bin/rg'
  ]) {
    assert.equal(runsOnHarness({ argv: [program, '--json', '--regexp=x'], ...site }), false, program)
  }
  assert.equal(runsOnHarness({ argv: [], ...site }), false)
})

test('runsOnHarness: an argument dsh never builds is refused, whatever else it would do', () => {
  const site = { cwd: '/site/wpdemo', sitesRoot: '/site' }
  for (const flag of [
    '--pre=/bin/sh',
    '--pre',
    '--search-zip',
    '-z',
    '--follow',
    '-L',
    '--file=/desk-home/dsh-passwords.env',
    '--ignore-file=/desk-home/cordis.patch.yml',
    '-uuu',
    '/desk-home'
  ]) {
    assert.throws(
      () => runsOnHarness({ argv: [HARNESS_RG, '--no-config', flag, '--regexp=x'], ...site }),
      /is not one Tracy's grep or glob builds/,
      flag
    )
  }
  // Model values ride inside `--regexp=`/`--glob=` or after `--`, where they are never flags.
  assert.equal(
    runsOnHarness({ argv: [HARNESS_RG, '--json', '--regexp=--pre=sh', '--', '-L'], ...site }),
    true
  )
})

// 🔒 27/09/2026: dsh's grep on the session's own spill passed the fence and died at the spawn.
test("runsOnHarness: a root outside the site passes only when the fence granted it (a session's own spill)", () => {
  const argv = [HARNESS_RG, '--json', '--regexp=x']
  const spill = '/tmp/dsh-spill-ab/session-0123456789ab/out.txt'
  assert.throws(
    () => runsOnHarness({ argv: [...argv, '--', spill], cwd: '/site/wpdemo', sitesRoot: '/site' }),
    /is outside the session's site/
  )
  const granted = new Set([spill])
  assert.equal(
    runsOnHarness({
      argv: [...argv, '--', spill],
      cwd: '/site/wpdemo',
      sitesRoot: '/site',
      allowRoot: (p) => granted.has(p)
    }),
    true
  )
  // Another session's spill, or the spill root itself, is not granted: still refused.
  for (const other of ['/tmp/dsh-spill-ab/session-ffffffffffff/out.txt', '/tmp/dsh-spill-ab'])
    assert.throws(
      () =>
        runsOnHarness({
          argv: [...argv, '--', other],
          cwd: '/site/wpdemo',
          sitesRoot: '/site',
          allowRoot: (p) => granted.has(p)
        }),
      /is outside the session's site/,
      other
    )
})

test('runsOnHarness: the cwd must be a site, and the search root must stay inside it', () => {
  const argv = [HARNESS_RG, '--json', '--regexp=x']
  assert.throws(() => runsOnHarness({ argv, cwd: '/desk-home', sitesRoot: '/site' }), /outside \/site/)
  assert.throws(
    () => runsOnHarness({ argv, cwd: '/site/wpdemo/../fijitrips', sitesRoot: '/site' }),
    /not a site path/
  )
  for (const root of ['/site/fijitrips', '../fijitrips', '..', '/desk-home']) {
    assert.throws(
      () => runsOnHarness({ argv: [...argv, '--', root], cwd: '/site/wpdemo', sitesRoot: '/site' }),
      /is outside the session's site "\/site\/wpdemo"/,
      root
    )
  }
  assert.throws(
    () => runsOnHarness({ argv: [...argv, '--', 'a', 'b'], cwd: '/site/wpdemo', sitesRoot: '/site' }),
    /takes one search root, got 2/
  )
  // The site folder is the boundary, not the cwd: from `.webroot`, `..` is still this site.
  assert.equal(
    runsOnHarness({ argv: [...argv, '--', '..'], cwd: '/site/wpdemo/.webroot', sitesRoot: '/site' }),
    true
  )
})

test('attachmentsRootOf: the store root comes from DSH_HOME, and an unusable one answers null', () => {
  assert.equal(attachmentsRootOf({ DSH_HOME: '/desk-home' }), '/desk-home/attachments')
  assert.equal(attachmentsRootOf({ DSH_HOME: '/desk-home/' }), '/desk-home/attachments')
  assert.equal(attachmentsRootOf({ DSH_HOME: '  /srv/dsh  ' }), '/srv/dsh/attachments')
  // 🔒 NULL IS A REFUSAL, NOT A DEFAULT. Guessing a root would open a directory nobody named.
  for (const env of [{}, { DSH_HOME: '' }, { DSH_HOME: '   ' }, { DSH_HOME: 'desk-home' }, undefined]) {
    assert.equal(attachmentsRootOf(env), null, JSON.stringify(env))
  }
})

test('readsOwnAttachment: read_image may open the attachment store, and nothing else may open anything else', () => {
  // The call that failed on demojoomla 16/09, and the whole reason this door exists: the customer
  // pasted a screenshot, dsh stored it, the model accepts images, and the fence refused the last hop.
  const root = attachmentsRootOf({ DSH_HOME: '/desk-home' })
  const pasted =
    '/desk-home/attachments/v1/objects/5d/5db1085fba52135b6f2200cfef7ebc94069b2c945108e3b1e53d2beae81912c2'
  assert.equal(readsOwnAttachment('read_image', pasted, root), true)

  // 🔒 ONE TOOL. Everything else stays outside `/desk-home` exactly as before — which is what keeps
  // the store from being listable and the secrets beside it from being readable.
  for (const tool of ['read', 'glob', 'grep', 'write', 'edit', 'str_replace_editor', 'bash', 'pwsh']) {
    assert.equal(readsOwnAttachment(tool, pasted, root), false, tool)
  }

  // 🔒 ONE SUBTREE. `/desk-home` holds dsh-passwords.env, the seat book and the model keys.
  for (const path of [
    '/desk-home/dsh-passwords.env',
    '/desk-home/.credentials.yaml',
    '/desk-home/attachments',
    '/desk-home/attachments-elsewhere/x.png',
    '/desk-home/sessions/s/session.v3.jsonl.zstd',
    '/site/other-customer/.webroot/configuration.php'
  ]) {
    assert.equal(readsOwnAttachment('read_image', path, root), false, path)
  }

  // 🔒 FAIL CLOSED. No root, no door.
  assert.equal(readsOwnAttachment('read_image', pasted, null), false)
  assert.equal(readsOwnAttachment('read_image', pasted, ''), false)
})

// A file the viewer attached to the chat (HTML, CSS, any non-image) is not inlined into the prompt:
// dsh stores it under `attachments/v1/files/<2>/<sha256>/<name>` and tells the model to `read` that
// path. Production 01/10/2026: a customer attached a design `.html` on "Add a new site", the fence
// refused the `read`, and the agent could only see pasted images. `read` opens that one subtree.
test('readsOwnAttachment: read may open an attached file, and only under attachments/v1/files', () => {
  const root = attachmentsRootOf({ DSH_HOME: '/desk-home' })
  const sha = '5db1085fba52135b6f2200cfef7ebc94069b2c945108e3b1e53d2beae81912c2'
  const attached = `/desk-home/attachments/v1/files/5d/${sha}/page.html`
  assert.equal(readsOwnAttachment('read', attached, root), true)
  assert.equal(readsOwnAttachment('read_image', attached, root), true)

  // 🔒 STILL ONE TOOL FOR FILES. Listing or searching the store would hand out other sessions' digests.
  for (const tool of ['glob', 'grep', 'write', 'edit', 'str_replace_editor', 'bash', 'pwsh']) {
    assert.equal(readsOwnAttachment(tool, attached, root), false, tool)
  }

  // 🔒 `read` gets the files subtree only — not image objects, not the canonical file objects, not
  // the store root, and nothing beside it.
  for (const path of [
    `/desk-home/attachments/v1/objects/5d/${sha}`,
    `/desk-home/attachments/v1/file-objects/5d/${sha}`,
    '/desk-home/attachments/v1/files',
    '/desk-home/attachments/v1/files-elsewhere/x.html',
    '/desk-home/attachments/v2/files/5d/x.html',
    '/desk-home/dsh-passwords.env',
    '/desk-home/.credentials.yaml'
  ]) {
    assert.equal(readsOwnAttachment('read', path, root), false, path)
  }

  // 🔒 FAIL CLOSED.
  assert.equal(readsOwnAttachment('read', attached, null), false)
  assert.equal(readsOwnAttachment('read', attached, ''), false)
})

// 🔒 A TOOL RESULT TOO LONG FOR THE CONTEXT IS SPILLED TO A FILE, AND THE AGENT IS TOLD TO READ IT.
// dsh's local spill store writes `<tmp>/dsh-spill-*/session-<sha256(session id)[:12]>/…`, outside
// every site — so the fence refused the one file the harness had just told the agent to open, and on
// a sealed Business quickstart the agent went for Grep, then Bash, then guessed module ids for five
// minutes (j-ee6vsk, 23/09/2026). Reading ITS OWN session's spill is let through; another session's,
// the spill root, and any write stay refused.
test("readsOwnSpill: a read of this session's own spilled output passes, nothing else does", () => {
  const tmp = '/tmp'
  const own = `/tmp/dsh-spill-6M2YVJ/session-${createHash('sha256').update('session-1').digest('hex').slice(0, 12)}/ab12-tool-output.txt`
  const other = `/tmp/dsh-spill-6M2YVJ/session-${createHash('sha256').update('session-2').digest('hex').slice(0, 12)}/cd34-tool-output.txt`
  assert.equal(readsOwnSpill('read', own, 'session-1', tmp), true)
  assert.equal(readsOwnSpill('grep', own, 'session-1', tmp), true)
  assert.equal(readsOwnSpill('read', other, 'session-1', tmp), false)
  assert.equal(readsOwnSpill('write', own, 'session-1', tmp), false)
  assert.equal(readsOwnSpill('edit', own, 'session-1', tmp), false)
  assert.equal(readsOwnSpill('grep', '/tmp/dsh-spill-6M2YVJ', 'session-1', tmp), false)
  assert.equal(readsOwnSpill('read', own, null, tmp), false)
  assert.equal(
    readsOwnSpill('read', `/tmp/elsewhere/session-x/${own.split('/').pop()}`, 'session-1', tmp),
    false
  )
})

// 🔒 27/09/2026 A1 bench: a fenced file tool answered the rule alone, and the agent spent two to four steps
// finding that bash reaches the site's own container. The deny names that road; the fence does not move.
test('a file tool fenced outside the site is told the road that exists: bash in the site container', () => {
  const reason = outsideSiteReason('read', 'path', '/etc/apache2/apache2.conf', '/', '/site/benchwp02')
  assert.match(
    reason,
    /^subprocess-docker: read path "\/etc\/apache2\/apache2\.conf" \(resolves to "\/"\) is outside the session's site "\/site\/benchwp02"\. /
  )
  assert.ok(reason.endsWith(OUTSIDE_SITE_NEXT))
  assert.match(OUTSIDE_SITE_NEXT, /bash/)
  // 🔒 28/09/2026: a road for a mode WITHOUT bash too (Writer, SEO/GEO): where the site's own files are,
  // bash only where the mode has it, and the site's own reads otherwise.
  assert.match(OUTSIDE_SITE_NEXT, /the site's files: \.webroot\//)
  assert.match(OUTSIDE_SITE_NEXT, /bash reads \(grep -rn, cat\) if this mode has it/)
  assert.match(OUTSIDE_SITE_NEXT, /tracy_site content\.read and page\.text read the site/)
  assert.doesNotMatch(OUTSIDE_SITE_NEXT, /\/app/, 'the EmDash app root has its own answer')
  assert.ok(OUTSIDE_SITE_NEXT.length <= 200, 'one instruction, not a paragraph')
})

// 🔒 28/09/2026 bench: 9 refused grep/read calls into EmDash's /app in 24 cases, each hunting for where a
// text is printed. Under /app the deny names first the read that finds a text's content field; then the
// truth about the code (ADR 0022): the file tools cannot reach it, bash in the site's container can, and
// `site.rebuild` serves it — the same as the persona and the site's AGENTS.md. The fence answers as before.
test('a file tool fenced under the EmDash app root is told the words are content, and which reads find them', () => {
  for (const value of ['/app', '/app/', '/app/src/components/Footer.astro', '/app/../app/src']) {
    const reason = outsideSiteReason('grep', 'path', value, '/', '/site/benchemdash02', 'emdash')
    assert.ok(
      reason.startsWith(
        `subprocess-docker: grep path ${JSON.stringify(value)} (resolves to "/") is outside the session's site "/site/benchemdash02". `
      ),
      value
    )
    assert.ok(reason.endsWith(EMDASH_APP_NEXT), value)
  }
  assert.doesNotMatch(EMDASH_APP_NEXT, /not editable from chat/)
  assert.match(EMDASH_APP_NEXT, /file tools cannot reach it/)
  assert.match(EMDASH_APP_NEXT, /tracy_site content\.replace \{find, replace, dryRun:true\}/)
  assert.match(
    EMDASH_APP_NEXT,
    /Code: bash in the container \(if this mode has it\), then tracy_site_build_emdash request site\.rebuild\./
  )
  // The words road comes first, and no grep: the hunt for words in the template code is what cost the steps.
  assert.ok(EMDASH_APP_NEXT.indexOf('content.replace') < EMDASH_APP_NEXT.indexOf('bash'))
  assert.doesNotMatch(EMDASH_APP_NEXT, /grep/, 'no hunt for words in the template code')
  assert.ok(EMDASH_APP_NEXT.length <= 250, 'one instruction, not a paragraph')
  // A path that only starts with the same letters is not the app root.
  for (const value of ['/application/x', '/apps', '/site/benchemdash02/../app-data'])
    assert.ok(
      outsideSiteReason('read', 'path', value, value, '/site/x', 'emdash').endsWith(OUTSIDE_SITE_NEXT),
      value
    )
})

/**
 * 🔒 THE CMS DECIDES THE `/app` ANSWER, NOT THE PATH (28/09/2026). `EMDASH_APP_NEXT` names
 * `tracy_emdash` — a tool a WordPress or Joomla site does not have — and it was chosen by the path
 * alone, so a model on a WordPress site that reached for `/app` was sent down a road that cannot work.
 */
test('🔒 the /app answer is EmDash’s only on an EmDash site; unread CMS claims no tool', () => {
  const at = (/** @type {string | null} */ platform) =>
    outsideSiteReason('grep', 'path', '/app/src/x.astro', '/', '/site/s', platform)
  assert.ok(at('emdash').endsWith(EMDASH_APP_NEXT))
  // WordPress and Joomla have no `/app` of Tracy's: the ordinary answer, which names bash in their
  // own container, is the true one.
  assert.ok(at('wordpress').endsWith(OUTSIDE_SITE_NEXT))
  assert.ok(at('joomla').endsWith(OUTSIDE_SITE_NEXT))
  assert.doesNotMatch(at('wordpress'), /tracy_emdash/)
  assert.doesNotMatch(at('joomla'), /tracy_emdash/)
  // Unread: the road every CMS has, and no tool claimed.
  assert.ok(at(null).endsWith(APP_NEXT_ANY_CMS))
  assert.doesNotMatch(APP_NEXT_ANY_CMS, /tracy_emdash/)
  assert.match(APP_NEXT_ANY_CMS, /tracy_site content\.replace/)
  assert.ok(APP_NEXT_ANY_CMS.length <= 250, 'one instruction, not a paragraph')
  // The argument is optional, and an omitted platform is "unread", never EmDash.
  assert.ok(outsideSiteReason('grep', 'path', '/app/x', '/', '/site/s').endsWith(APP_NEXT_ANY_CMS))
})

test('execArgv: site secrets an agent command does not need are blanked, after the caller asks them back', () => {
  // A command that sets one itself still gets it blank: docker keeps the last -e for a repeated key.
  const argv = execArgv({
    argv: ['env'],
    cwd: '/site/wpdemo',
    env: { JOOMLA_ADMIN_PASSWORD: 'asked-back', FOO: 'bar' },
    mode: 'workspace-write',
    root: '/site/wpdemo',
    tty: false,
    cfg
  })
  const last = (name) => argv.findLast((a) => a.startsWith(`${name}=`))
  for (const name of BLANKED_SECRET_ENV) assert.equal(last(name), `${name}=`, name)
  assert.equal(last('FOO'), 'FOO=bar')
  // wp-cli reads the database password from the environment: an editor keeps it, read-only does not.
  assert.equal(last('WORDPRESS_DB_PASSWORD'), undefined)
  const readOnly = execArgv({
    argv: ['env'],
    cwd: '/site/wpdemo',
    env: undefined,
    mode: 'read-only',
    root: null,
    tty: false,
    cfg
  })
  for (const name of [...BLANKED_SECRET_ENV, ...READ_ONLY_BLANKED_ENV])
    assert.ok(readOnly.includes(`${name}=`), name)
})
