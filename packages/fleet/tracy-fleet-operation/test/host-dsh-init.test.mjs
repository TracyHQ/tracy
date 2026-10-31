#!/usr/bin/env node
/**
 * What `dsh/host-dsh-init.sh` accepts, and what its --dry-run promises to write.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/host-dsh-init.test.mjs
 *
 * The dry run is the only contract of that script a machine can check without root, Linux and
 * docker: every mutation goes through `run`/`run_sh`, which print instead of acting, and the
 * preconditions are reported rather than enforced. So each case here runs the real script, as a
 * non-root user, with every path it reads or would write pointed into a scratch directory.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../dsh/host-dsh-init.sh', import.meta.url))
// The host label IS the shard name of the shard beta, so there is one rule for both: SHARD_NAME in
// apps/tracy-web/src/lib/shard-shapes.js, which the master and the shard installer will check too.
// Neither is on develop yet (shard-shapes.js arrives with W1, the installer with W3/W4): until then
// only the script half of that comparison runs.
const LABEL_RULE = '^[a-z][a-z0-9]{0,15}$'
const SHAPES = new URL('../../../../apps/tracy-web/src/lib/shard-shapes.js', import.meta.url)

function scratch(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'host-dsh-init-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/**
 * One dry run; HOME, the dsh home, the env file and the sites root all live under `dir`.
 * `env` adds to (or overrides) that environment, for the knobs the script reads from it.
 */
function dryRun(dir, args, env = {}) {
  const run = spawnSync('bash', [SCRIPT, ...args, '--dry-run'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dir,
      HOST_DSH_HOME: path.join(dir, 'home'),
      HOST_DSH_ENV_FILE: path.join(dir, 'host-dsh.env'),
      HOST_SITES_ROOT: path.join(dir, 'sites'),
      ...env
    }
  })
  return { status: run.status, out: run.stdout, err: run.stderr }
}

/** A dsh home that already holds a dsh-passwords.env, as on a host that was initialised before. */
function keptPasswords(dir, text) {
  mkdirSync(path.join(dir, 'home'), { recursive: true })
  const file = path.join(dir, 'home', 'dsh-passwords.env')
  writeFileSync(file, text)
  return file
}

/** The file a new host's actor secret comes from, as `--actor-secret-file` args. */
function actor(dir) {
  const file = path.join(dir, 'actor.secret')
  writeFileSync(file, 'actor-secret-value\n')
  return ['--actor-secret-file', file]
}

test('the script parses (bash -n)', () => {
  const run = spawnSync('bash', ['-n', SCRIPT], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
})

test('a shard label the old list never named is accepted, and names its agent hostname', (t) => {
  const dir = scratch(t)
  const { status, out, err } = dryRun(dir, ['s1', '--image-tag', 'ctx-test', ...actor(dir)])
  assert.equal(status, 0, err)
  assert.match(out, /host s1 · hostname s1-agent\.tracy\.ai/)
})

test('a label of sixteen characters, the longest the rule allows, is accepted', (t) => {
  const dir = scratch(t)
  const { status, out, err } = dryRun(dir, ['s0123456789abcde', '--image-tag', 'ctx-test', ...actor(dir)])
  assert.equal(status, 0, err)
  assert.match(out, /host s0123456789abcde · hostname s0123456789abcde-agent\.tracy\.ai/)
})

test('labels outside the shard name rule are refused before anything runs', (t) => {
  const dir = scratch(t)
  for (const label of ['S1', 's-1', 'eu_west', '_s1', '1s', 's1.tracy', 's1\nx', 'a'.repeat(17), '']) {
    const { status, out, err } = dryRun(dir, [label])
    assert.equal(status, 2, `label ${JSON.stringify(label)}: exit ${status} ${err}`)
    assert.doesNotMatch(out, /==> 1\. \/desk-home/, `label ${JSON.stringify(label)} reached step 1`)
  }
})

test('a refused label is named on the first line of stderr, not by the old host list', (t) => {
  const dir = scratch(t)
  // The empty label is left out: it is "no host given", which prints the usage instead.
  for (const label of ['S1', 'a'.repeat(17)]) {
    const { status, err } = dryRun(dir, [label])
    assert.equal(status, 2, `label ${JSON.stringify(label)}: exit ${status} ${err}`)
    assert.ok(err.startsWith('invalid host label:'), `label ${JSON.stringify(label)}: stderr was ${err}`)
  }
})

test('the label rule is the shard name rule that SHARD_NAME in shard-shapes.js holds', async (t) => {
  assert.ok(
    readFileSync(SCRIPT, 'utf8').includes(`[[ "$HOST" =~ ${LABEL_RULE} ]]`),
    `host-dsh-init.sh does not check ${LABEL_RULE}`
  )
  if (!existsSync(SHAPES)) {
    t.diagnostic('apps/tracy-web/src/lib/shard-shapes.js is not on this branch yet (W1): script half only')
    return
  }
  const { SHARD_NAME } = await import(SHAPES.href)
  assert.equal(SHARD_NAME.source, LABEL_RULE)
})

test('--tracy-origin is what the dry run says it will write as MCP_TRACY_ORIGIN', (t) => {
  const dir = scratch(t)
  const { status, out, err } = dryRun(dir, ['s1', '--tracy-origin', 'https://s1.tracy.ai', ...actor(dir)])
  assert.equal(status, 0, err)
  assert.match(out, /tracy origin https:\/\/s1\.tracy\.ai/)
  assert.match(out, /MCP_TRACY_ORIGIN=https:\/\/s1\.tracy\.ai$/m)
  assert.doesNotMatch(err, /no --tracy-origin/)
})

test('without --tracy-origin the default stays production, and the run says so', (t) => {
  const dir = scratch(t)
  const { status, out, err } = dryRun(dir, ['prod1', ...actor(dir)])
  assert.equal(status, 0, err)
  assert.match(out, /MCP_TRACY_ORIGIN=https:\/\/cowork\.tracy\.ai$/m)
  assert.match(err, /no --tracy-origin/)
})

test('an origin with a path, a trailing slash, plain http or upper case is refused', (t) => {
  const dir = scratch(t)
  for (const origin of [
    'https://s1.tracy.ai/',
    'https://s1.tracy.ai/app',
    'http://s1.tracy.ai',
    's1.tracy.ai',
    'https://S1.tracy.ai'
  ]) {
    const { status, err } = dryRun(dir, ['s1', '--tracy-origin', origin, ...actor(dir)])
    assert.equal(status, 2, `${origin}: exit ${status} ${err}`)
    assert.match(err, /invalid --tracy-origin/)
  }
})

test('a kept dsh-passwords.env with another origin is named, not silently kept', (t) => {
  const dir = scratch(t)
  keptPasswords(dir, 'MCP_TRACY_ORIGIN=https://cowork.tracy.ai\nMCP_SEAT_SECRET=kept\n')
  const { status, err } = dryRun(dir, ['s1', '--tracy-origin', 'https://s1.tracy.ai'])
  assert.equal(status, 0, err)
  assert.match(err, /keeps MCP_TRACY_ORIGIN=https:\/\/cowork\.tracy\.ai, not https:\/\/s1\.tracy\.ai/)
})

test('--seat-secret-out keeps the seat secret off the terminal and says where it goes', (t) => {
  const dir = scratch(t)
  const shown = dryRun(dir, ['s1', '--tracy-origin', 'https://s1.tracy.ai', ...actor(dir)])
  assert.match(shown.out, /<openssl rand -hex 32>/, 'without the flag the banner shows the secret')
  const target = path.join(dir, 'seat.secret')
  const kept = dryRun(dir, [
    's1',
    '--tracy-origin',
    'https://s1.tracy.ai',
    ...actor(dir),
    '--seat-secret-out',
    target
  ])
  assert.equal(kept.status, 0, kept.err)
  assert.doesNotMatch(kept.out, /<openssl rand -hex 32>/)
  assert.ok(
    kept.out.includes(`[dry-run] write ${target} (0600) with MCP_SEAT_SECRET generated above`),
    kept.out
  )
})

test('--seat-secret-out on a kept dsh-passwords.env reads the secret back from it', (t) => {
  const dir = scratch(t)
  const file = keptPasswords(dir, 'MCP_TRACY_ORIGIN=https://s1.tracy.ai\nMCP_SEAT_SECRET=kept\n')
  const target = path.join(dir, 'seat.secret')
  const { status, out, err } = dryRun(dir, [
    's1',
    '--tracy-origin',
    'https://s1.tracy.ai',
    '--seat-secret-out',
    target
  ])
  assert.equal(status, 0, err)
  assert.ok(out.includes(`[dry-run] write ${target} (0600) with MCP_SEAT_SECRET read from ${file}`), out)
})

test('--seat-secret-out refuses a relative path', (t) => {
  const dir = scratch(t)
  const { status, err } = dryRun(dir, ['s1', ...actor(dir), '--seat-secret-out', 'seat.secret'])
  assert.equal(status, 2, err)
  assert.match(err, /absolute path/)
})

test('the transcript names tracy-web, never the retired Workers', (t) => {
  const dir = scratch(t)
  const { status, out, err } = dryRun(dir, ['s1', '--tracy-origin', 'https://s1.tracy.ai', ...actor(dir)])
  assert.equal(status, 0, err)
  const said = out + err
  for (const gone of ['wrangler', 'Worker', 'HOST_SEAT_SECRET', 'dev-cowork', 'KV flag']) {
    assert.ok(!said.includes(gone), `the transcript still says "${gone}"`)
  }
  assert.match(out, /SEAT_s1_SECRET/)
  assert.match(out, /HOST_s1_DSH_ORIGIN=http:\/\/tracy-dsh:8080/)
})

test('the closing notes say where the secrets come from, and do not claim a read that did not happen', (t) => {
  const dir = scratch(t)
  const fresh = dryRun(dir, ['s1', '--tracy-origin', 'https://s1.tracy.ai', ...actor(dir)])
  assert.equal(fresh.status, 0, fresh.err)
  assert.match(fresh.out, /MCP_TRACY_ACTOR_SECRET=<the same value this script read>/)
  assert.match(fresh.out, /SEAT_s1_SECRET=<MCP_SEAT_SECRET: the banner above, or the --seat-secret-out file>/)
  const kept = scratch(t)
  keptPasswords(kept, 'MCP_TRACY_ORIGIN=https://s1.tracy.ai\nMCP_SEAT_SECRET=kept\n')
  const again = dryRun(kept, ['s1', '--tracy-origin', 'https://s1.tracy.ai'])
  assert.equal(again.status, 0, again.err)
  assert.doesNotMatch(again.out, /the same value this script read|the banner above/)
  assert.match(again.out, /MCP_TRACY_ACTOR_SECRET=<the value already in .*dsh-passwords\.env>/)
  assert.match(
    again.out,
    /SEAT_s1_SECRET=<MCP_SEAT_SECRET: the value already in .*dsh-passwords\.env, or the --seat-secret-out file>/
  )
})

test('dev is a label like any other: no generated actor secret, no dev-cowork origin', (t) => {
  const dir = scratch(t)
  const source = actor(dir)
  const { status, out, err } = dryRun(dir, ['dev', '--tracy-origin', 'https://cowork.tracy.site', ...source])
  assert.equal(status, 0, err)
  assert.doesNotMatch(out + err, /GENERATED|generating a NEW MCP_TRACY_ACTOR_SECRET/)
  assert.ok(out.includes(`actor secret read from ${source[1]}`), out)
  assert.match(out, /MCP_TRACY_ORIGIN=https:\/\/cowork\.tracy\.site$/m)
})

// The dry run prints the gateway it will smoke-test and the container it will wait on and read
// logs from, so both knobs are observable without docker. What it does NOT print is the live
// `docker inspect`/`curl` calls of a real run; those go through the same two variables.
const DEFAULT_GATEWAY_LINES = [
  /against http:\/\/127\.0\.0\.1:51700$/m,
  /curl -sS [^\n]* -X POST http:\/\/127\.0\.0\.1:51700\/gateway\/seat\/session/,
  /waiting for tracy-dsh to report healthy/,
  /docker inspect -f \{\{\.State\.Health\.Status\}\} tracy-dsh, up to 300s/,
  /docker logs tracy-dsh 2>&1/,
  /HOST_s1_DSH_ORIGIN=http:\/\/tracy-dsh:8080/
]

test('the gateway and the container default to the single dsh of today', (t) => {
  const dir = scratch(t)
  const { status, out, err } = dryRun(dir, ['s1', '--image-tag', 'ctx-test', ...actor(dir)])
  assert.equal(status, 0, err)
  for (const line of DEFAULT_GATEWAY_LINES) assert.match(out, line)
})

test('HOST_DSH_GATEWAY and HOST_DSH_CONTAINER point the init at a second, prefixed dsh', (t) => {
  const dir = scratch(t)
  const { status, out, err } = dryRun(dir, ['d1', '--image-tag', 'ctx-test', ...actor(dir)], {
    HOST_DSH_GATEWAY: 'http://127.0.0.1:51800',
    HOST_DSH_CONTAINER: 'tracy-d1-dsh'
  })
  assert.equal(status, 0, err)
  assert.match(out, /against http:\/\/127\.0\.0\.1:51800$/m)
  assert.match(out, /curl -sS [^\n]* -X POST http:\/\/127\.0\.0\.1:51800\/gateway\/seat\/session/)
  assert.match(out, /waiting for tracy-d1-dsh to report healthy/)
  assert.match(out, /docker inspect -f \{\{\.State\.Health\.Status\}\} tracy-d1-dsh, up to 300s/)
  assert.match(out, /docker logs tracy-d1-dsh 2>&1/)
  assert.match(out, /HOST_d1_DSH_ORIGIN=http:\/\/tracy-d1-dsh:8080/)
  // Nothing of the first dsh is left behind (the image name `…/tracy-dsh:<tag>` is not a container).
  assert.doesNotMatch(out, /127\.0\.0\.1:51700\/gateway/)
  assert.doesNotMatch(out, /docker inspect [^\n]*tracy-dsh\b/)
  assert.doesNotMatch(out, /docker logs tracy-dsh\b/)
})

test('a container name that could carry shell syntax is refused before anything runs', (t) => {
  const dir = scratch(t)
  for (const name of ['tracy-dsh; id', '$(id)', '-x', 'a b']) {
    const { status, out, err } = dryRun(dir, ['s1', ...actor(dir)], { HOST_DSH_CONTAINER: name })
    assert.equal(status, 2, `container ${JSON.stringify(name)}: exit ${status} ${err}`)
    assert.ok(
      err.startsWith('invalid HOST_DSH_CONTAINER:'),
      `container ${JSON.stringify(name)}: stderr was ${err}`
    )
    assert.doesNotMatch(out, /==> 1\. \/desk-home/)
  }
})

test('a gateway with a path, a trailing slash or no scheme is refused before anything runs', (t) => {
  const dir = scratch(t)
  for (const gateway of [
    'http://127.0.0.1:51700/',
    'http://127.0.0.1:51700/gateway',
    '127.0.0.1:51700',
    'ftp://h:1'
  ]) {
    const { status, out, err } = dryRun(dir, ['s1', ...actor(dir)], { HOST_DSH_GATEWAY: gateway })
    assert.equal(status, 2, `gateway ${gateway}: exit ${status} ${err}`)
    assert.ok(err.startsWith('invalid HOST_DSH_GATEWAY:'), `gateway ${gateway}: stderr was ${err}`)
    assert.equal(out, '', `gateway ${gateway}: printed ${out}`)
  }
})

test('a run that will write dsh-passwords.env without any actor secret source stops first, with exit 2', (t) => {
  const dir = scratch(t)
  const { status, out, err } = dryRun(dir, ['s1', '--tracy-origin', 'https://s1.tracy.ai'])
  assert.equal(status, 2, err)
  assert.equal(out, '', 'nothing is printed before the refusal, so no step looks as if it ran')
  assert.match(err, /no source for MCP_TRACY_ACTOR_SECRET/)
  assert.match(err, /--actor-secret-file/)
})

test('an actor secret file that does not exist is refused up front, with exit 2', (t) => {
  const dir = scratch(t)
  const { status, out, err } = dryRun(dir, ['s1', '--actor-secret-file', path.join(dir, 'nope.secret')])
  assert.equal(status, 2, err)
  assert.equal(out, '')
  assert.match(err, /--actor-secret-file: no readable file/)
})

test('an actor secret file that is empty or only whitespace is refused up front, with exit 2', (t) => {
  const dir = scratch(t)
  for (const [name, text] of [
    ['empty', ''],
    ['newline', '\n'],
    ['blanks', '  \t \r\n\n'],
    ['quotes', '""\n']
  ]) {
    const file = path.join(dir, `${name}.secret`)
    writeFileSync(file, text)
    const { status, out, err } = dryRun(dir, ['s1', '--actor-secret-file', file])
    assert.equal(status, 2, `${name}: exit ${status} ${err}`)
    assert.equal(out, '', `${name}: nothing is printed before the refusal`)
    assert.match(err, /--actor-secret-file: .* holds no secret/, name)
  }
})

test('an actor secret file with a secret and its trailing newline is accepted', (t) => {
  const dir = scratch(t)
  const file = path.join(dir, 'ok.secret')
  writeFileSync(file, 'abc123\n')
  const { status, err } = dryRun(dir, ['s1', '--actor-secret-file', file])
  assert.equal(status, 0, err)
})

test('a kept dsh-passwords.env needs no actor secret source, but --force brings the need back', (t) => {
  const dir = scratch(t)
  keptPasswords(dir, 'MCP_TRACY_ORIGIN=https://s1.tracy.ai\nMCP_SEAT_SECRET=kept\n')
  const kept = dryRun(dir, ['s1', '--tracy-origin', 'https://s1.tracy.ai'])
  assert.equal(kept.status, 0, kept.err)
  const forced = dryRun(dir, ['s1', '--tracy-origin', 'https://s1.tracy.ai', '--force'])
  assert.equal(forced.status, 2, forced.err)
  assert.match(forced.err, /no source for MCP_TRACY_ACTOR_SECRET/)
})

test('--seat-secret-out is checked before any step writes: folder, files it would clobber, directory, symlink', (t) => {
  const dir = scratch(t)
  const base = ['s1', '--tracy-origin', 'https://s1.tracy.ai', ...actor(dir)]
  mkdirSync(path.join(dir, 'a-directory'))
  writeFileSync(path.join(dir, 'real.secret'), 'x')
  symlinkSync(path.join(dir, 'real.secret'), path.join(dir, 'link.secret'))
  const cases = [
    [path.join(dir, 'missing-folder', 'seat.secret'), /no such directory/],
    [path.join(dir, 'home', 'dsh-passwords.env'), /would overwrite/],
    [path.join(dir, 'host-dsh.env'), /would overwrite/],
    ['/etc/tracy/tracy-web.env', /would overwrite/],
    [path.join(dir, 'a-directory'), /is a directory/],
    [path.join(dir, 'link.secret'), /is a symlink/]
  ]
  for (const [target, message] of cases) {
    const { status, out, err } = dryRun(dir, [...base, '--seat-secret-out', target])
    assert.equal(status, 2, `${target}: exit ${status} ${err}`)
    assert.match(err, message, target)
    assert.equal(out, '', `${target}: printed ${out}`)
  }
  assert.equal(readFileSync(path.join(dir, 'real.secret'), 'utf8'), 'x', 'the symlink target is untouched')
})

// Step 3a writes a real file, which a dry run on a laptop never reaches (the real branch needs
// root, Linux and docker). So the block is cut out of the script, between its two section
// markers, and run alone with the variables it reads: the same text, as a non-root user, in a
// scratch directory. A change of the markers makes this test fail loudly rather than skip.
function seatSecretStep(dir, { secret, target, pathPrefix = '' }) {
  const text = readFileSync(SCRIPT, 'utf8')
  const from = text.indexOf('# ── 3a. The seat secret')
  const to = text.indexOf('# ── 3b. Model keys')
  assert.ok(from !== -1 && to > from, 'the 3a / 3b section markers moved: update this test')
  const harness = [
    'set -euo pipefail',
    'say() { printf \'==> %s\\n\' "$*"; }',
    'die() { printf \'!!  %s\\n\' "$*" >&2; exit 1; }',
    'DRY_RUN=0',
    text.slice(from, to)
  ].join('\n')
  const run = spawnSync('bash', ['-c', harness], {
    encoding: 'utf8',
    env: {
      PATH: pathPrefix ? `${pathPrefix}${path.delimiter}${process.env.PATH}` : process.env.PATH,
      SEAT_SECRET: secret,
      SEAT_SECRET_OUT: target,
      PASSWORDS_ENV: path.join(dir, 'home', 'dsh-passwords.env')
    }
  })
  return { status: run.status, out: run.stdout, err: run.stderr }
}

test('step 3a writes the seat secret at 0600 even over a world-readable file, and leaves no temp file', (t) => {
  const dir = scratch(t)
  const target = path.join(dir, 'seat.secret')
  writeFileSync(target, 'old\n', { mode: 0o644 })
  const { status, err } = seatSecretStep(dir, { secret: 'fresh-secret', target })
  assert.equal(status, 0, err)
  assert.equal(readFileSync(target, 'utf8'), 'fresh-secret\n')
  assert.equal(statSync(target).mode & 0o777, 0o600)
  assert.deepEqual(readdirSync(dir).sort(), ['seat.secret'])
})

test('step 3a reads the secret back from a kept dsh-passwords.env', (t) => {
  const dir = scratch(t)
  keptPasswords(dir, 'MCP_TRACY_ORIGIN=https://s1.tracy.ai\nMCP_SEAT_SECRET="kept-secret"\n')
  const target = path.join(dir, 'seat.secret')
  const { status, err } = seatSecretStep(dir, { secret: '', target })
  assert.equal(status, 0, err)
  assert.equal(readFileSync(target, 'utf8'), 'kept-secret\n')
  assert.equal(statSync(target).mode & 0o777, 0o600)
})

test('step 3a never writes the secret through a symlink', (t) => {
  const dir = scratch(t)
  const elsewhere = path.join(dir, 'elsewhere')
  writeFileSync(elsewhere, 'precious\n')
  const target = path.join(dir, 'seat.secret')
  symlinkSync(elsewhere, target)
  const { status, err } = seatSecretStep(dir, { secret: 'fresh-secret', target })
  assert.equal(status, 1, err)
  assert.match(err, /is a symlink/)
  assert.equal(readFileSync(elsewhere, 'utf8'), 'precious\n')
})

/** A `chmod` ahead of the real one on PATH, running `body` (a /bin/sh script body). */
function stubChmod(dir, body) {
  const bin = path.join(dir, 'bin')
  mkdirSync(bin)
  writeFileSync(path.join(bin, 'chmod'), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return bin
}

test('step 3a leaves no temporary file, and no secret, when chmod fails', (t) => {
  const dir = scratch(t)
  const bin = stubChmod(dir, 'exit 1')
  const target = path.join(dir, 'seat.secret')
  const { status, err } = seatSecretStep(dir, { secret: 'fresh-secret', target, pathPrefix: bin })
  assert.equal(status, 1, err)
  assert.match(err, /cannot set the mode of/)
  assert.deepEqual(readdirSync(dir).sort(), ['bin'], 'the temporary file beside the target is gone')
  assert.ok(!existsSync(target), 'the target was never written')
})

test('step 3a leaves no temporary file when it is interrupted between mktemp and the rename', (t) => {
  const dir = scratch(t)
  // The stub chmod sends TERM to the shell that called it, then returns: the shell's trap runs as
  // soon as the foreground command ends, which is the window an operator's Ctrl-C or a kill hits.
  const bin = stubChmod(dir, 'kill -TERM "$PPID"\nexit 0')
  const target = path.join(dir, 'seat.secret')
  const { status } = seatSecretStep(dir, { secret: 'fresh-secret', target, pathPrefix: bin })
  assert.equal(status, 143, 'the script ends on the signal, not carrying on to the rename')
  assert.deepEqual(readdirSync(dir).sort(), ['bin'], 'the temporary file beside the target is gone')
  assert.ok(!existsSync(target), 'the target was never written')
})

test('step 6 signs with seconds x 1000, never date +%s%3N (uutils prints nanoseconds: 403 stale)', () => {
  const text = readFileSync(SCRIPT, 'utf8')
  assert.ok(!/date \+%s%3N/.test(text), 'no `date +%s%3N` left in the script')
  assert.ok(text.includes('TS="$(( $(date +%s) * 1000 ))"'), 'the smoke test timestamp is seconds x 1000')
})

test('the site agent’s notes store is made under the sites root, dsh’s own (www-data), so wishes are kept (#210)', (t) => {
  const dir = scratch(t)
  const { status, out, err } = dryRun(dir, ['s1', '--tracy-origin', 'https://s1.tracy.ai', ...actor(dir)])
  assert.equal(status, 0, err)
  const sites = path.join(dir, 'sites')
  assert.ok(out.includes(`install -d -m 0700 -o 33 -g 33 ${sites}/.site-notes`), out)
})
