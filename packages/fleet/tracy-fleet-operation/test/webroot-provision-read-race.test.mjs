// A first history read and a provision retry share a real Git index and a stable per-site initialization fence.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { pathWithFlock } from './flock-shim.mjs'

const scripts = fileURLToPath(new URL('../scripts/', import.meta.url))
const provision = readFileSync(join(scripts, 'provision/provision.sh'), 'utf8')
const start = provision.indexOf('exec 8>"/var/lock/tracy-provision-$LABEL.lock"')
const end = provision.indexOf('# ── 0½.', start)
assert.ok(start >= 0 && end > start, 'the real provision admission block must be exercised')
const admission = provision.slice(start, end).replaceAll('/var/lock/', '$TRACY_PROVISION_LOCK_DIR/')
const until = async (check) => {
  const deadline = Date.now() + 15_000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('the controlled shell operation did not reach its boundary')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
function job(script, env) {
  const child = spawn('bash', ['-c', script], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  const output = { stdout: '', stderr: '' }
  child.stdout.on('data', (chunk) => (output.stdout += chunk))
  child.stderr.on('data', (chunk) => (output.stderr += chunk))
  return {
    child,
    output,
    done: new Promise((resolve) => child.on('close', (code) => resolve({ code, ...output })))
  }
}

test('a first history read finishing before provision mutation cannot race the retry baseline index', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tracy-first-read-race-'))
  const label = 'owned-test'
  const webroot = join(root, label, '.webroot')
  const bin = join(root, 'bin')
  mkdirSync(join(webroot, 'wp-includes'), { recursive: true })
  mkdirSync(bin)
  writeFileSync(join(webroot, 'wp-includes/version.php'), '<?php $wp_version="6.6";')
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
  const wrapper = join(bin, 'git')
  writeFileSync(
    wrapper,
    `#!/usr/bin/env python3
import os, pathlib, subprocess, sys, time
args=sys.argv[1:]
root=pathlib.Path(os.environ['TEST_ROOT'])
if os.environ.get('PAUSE_FIRST_ADD') and 'add' in args and not (root/'paused').exists():
    (root/'paused').mkdir()
    prefix=args[:args.index('add')]
    writer=subprocess.Popen([os.environ['REAL_GIT'], *prefix, 'update-index', '--index-info'],stdin=subprocess.PIPE)
    repo=pathlib.Path(next(arg.split('=',1)[1] for arg in args if arg.startswith('--git-dir=')))
    deadline=time.monotonic()+15
    while not (repo/'index.lock').exists():
        if time.monotonic()>deadline: raise RuntimeError('real Git did not acquire index.lock')
        time.sleep(.01)
    (root/'writer-ready').touch()
    while not (root/'release').exists():
        if time.monotonic()>deadline: raise RuntimeError('test did not release first reader')
        time.sleep(.01)
    writer.stdin.close()
    if writer.wait()!=0: raise RuntimeError('real Git index writer failed')
os.execv(os.environ['REAL_GIT'],[os.environ['REAL_GIT'],*args])
`
  )
  chmodSync(wrapper, 0o755)
  const env = {
    ...process.env,
    PATH: `${bin}:${pathWithFlock()}`,
    REAL_GIT: realGit,
    TEST_ROOT: root,
    LABEL: label,
    SITE_DIR: join(root, label),
    TRACY_PRIVATE_ROOT: root,
    TRACY_SITES_ROOT: root,
    TRACY_PROVISION_LOCK_DIR: root,
    TRACY_HEAVY_LOCK: join(root, 'heavy.lock'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null'
  }
  const git = join(scripts, 'webroot/webroot-git.sh')
  const reader = job(`bash "${git}" --label "$LABEL" --op history`, { ...env, PAUSE_FIRST_ADD: '1' })
  let retry
  try {
    await until(() => existsSync(join(root, 'writer-ready')))
    retry = job(
      `set -euo pipefail
. "${scripts}lib/roots.sh"
. "${scripts}lib/webroot-repo-git.sh"
${admission}
touch "$TEST_ROOT/mutation-started"
printf 'baseline-existed:%s\\n' "$TRACY_INITIAL_BACKUP_BASELINE_EXISTED" >&2
bash "${git}" --label "$LABEL" --op ensure
`,
      env
    )
    await until(
      () =>
        existsSync(join(root, 'mutation-started')) ||
        /waiting for.*webroot initialization/.test(retry.output.stderr)
    )
    assert.equal(
      existsSync(join(root, 'mutation-started')),
      false,
      'provision must wait before mutating a reader-owned baseline'
    )
    writeFileSync(join(root, 'release'), '')
    const read = await reader.done
    const built = await retry.done
    assert.equal(read.code, 0, read.stderr)
    assert.equal(built.code, 0, built.stderr)
    assert.doesNotMatch(built.stderr, /index\.lock/)
    assert.match(built.stderr, /baseline-existed:1/)
    const first = JSON.parse(read.stdout.trim().split('\n').at(-1))
    const second = JSON.parse(built.stdout.trim().split('\n').at(-1))
    assert.equal(first.latest.sha, second.baseline, 'retry preserves the first reader baseline')
    const repo = join(root, label, 'webroot-baseline.git')
    const tag = () =>
      execFileSync(realGit, [`--git-dir=${repo}`, 'rev-parse', 'tracy-release/v1'], {
        encoding: 'utf8'
      }).trim()
    const before = tag()
    const backup = await job(
      `bash "${scripts}webroot/webroot-backup.sh" --label "$LABEL" --op initial-backup`,
      {
        ...env,
        TRACY_INITIAL_BACKUP_BASELINE_EXISTED: '1'
      }
    ).done
    assert.equal(backup.code, 0, backup.stderr)
    assert.deepEqual(JSON.parse(backup.stdout.trim().split('\n').at(-1)), {
      ok: true,
      initial: false,
      reason: 'baseline predates this provision'
    })
    assert.equal(tag(), before, 'an older file-only v1 is never retagged with the rebuilt database')
  } finally {
    writeFileSync(join(root, 'release'), '')
    await reader.done
    if (retry) await retry.done
    rmSync(root, { recursive: true, force: true })
  }
})

test('history and changes during guarded provisioning return building without initializing a repo', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tracy-provision-owned-'))
  const label = 'owned-test'
  const webroot = join(root, label, '.webroot')
  mkdirSync(join(webroot, 'wp-includes'), { recursive: true })
  writeFileSync(join(webroot, 'wp-includes/version.php'), '<?php $wp_version="6.6";')
  const env = {
    ...process.env,
    PATH: pathWithFlock(),
    LABEL: label,
    SITE_DIR: join(root, label),
    TEST_ROOT: root,
    TRACY_PRIVATE_ROOT: root,
    TRACY_SITES_ROOT: root,
    TRACY_PROVISION_LOCK_DIR: root,
    TRACY_HEAVY_LOCK: join(root, 'heavy.lock'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null'
  }
  const provider = job(
    `set -euo pipefail
. "${scripts}lib/roots.sh"
. "${scripts}lib/webroot-repo-git.sh"
${admission}
touch "$TEST_ROOT/provider-ready"
python3 -c 'import os,pathlib,time; p=pathlib.Path(os.environ["TEST_ROOT"])/"release"; deadline=time.monotonic()+15
while not p.exists() and time.monotonic()<deadline: time.sleep(.01)'
`,
    env
  )
  try {
    await until(() => existsSync(join(root, 'provider-ready')))
    const bounded = await job(
      `set -euo pipefail
. "${scripts}lib/webroot-repo-git.sh"
tracy_webroot_init_lock "$SITE_DIR" 1
touch "$TEST_ROOT/unsafe-mutation"
`,
      env
    ).done
    assert.equal(bounded.code, 1, 'a contended initialization wait ends at its deadline')
    assert.match(bounded.stderr, /try again shortly/)
    assert.equal(existsSync(join(root, 'unsafe-mutation')), false)
    for (const op of ['history', 'changes']) {
      const result = await job(`bash "${scripts}webroot/webroot-git.sh" --label "$LABEL" --op ${op}`, env)
        .done
      assert.equal(result.code, 0, result.stderr)
      const answer = JSON.parse(result.stdout.trim().split('\n').at(-1))
      assert.equal(answer.building, true)
      assert.equal(answer.latest, null)
      assert.deepEqual(answer.rows, [])
      assert.equal(existsSync(join(root, label, 'webroot-baseline.git')), false)
    }
    const other = join(root, 'another-site', '.webroot')
    mkdirSync(other, { recursive: true })
    writeFileSync(join(other, 'index.html'), 'another site')
    const independent = await job(
      `bash "${scripts}webroot/webroot-git.sh" --label another-site --op history`,
      env
    ).done
    assert.equal(independent.code, 0, independent.stderr)
    assert.equal(JSON.parse(independent.stdout.trim().split('\n').at(-1)).latest.version, 1)
  } finally {
    writeFileSync(join(root, 'release'), '')
    await provider.done
    rmSync(root, { recursive: true, force: true })
  }
})

test('concurrent established history reads wait for the writer without claiming the site is building', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tracy-established-readers-'))
  const label = 'owned-test'
  const webroot = join(root, label, '.webroot')
  mkdirSync(webroot, { recursive: true })
  writeFileSync(join(webroot, 'index.html'), 'healthy site')
  const env = {
    ...process.env,
    PATH: pathWithFlock(),
    LABEL: label,
    TEST_ROOT: root,
    TRACY_PRIVATE_ROOT: root,
    TRACY_SITES_ROOT: root,
    TRACY_PROVISION_LOCK_DIR: root,
    TRACY_HEAVY_LOCK: join(root, 'heavy.lock'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null'
  }
  const command = `bash "${scripts}webroot/webroot-git.sh" --label "$LABEL" --op history`
  const initial = await job(command, env).done
  assert.equal(initial.code, 0, initial.stderr)
  const writer = job(
    `python3 -c 'import fcntl,os,pathlib,time
r=pathlib.Path(os.environ["TEST_ROOT"])
f=open(r/"owned-test/webroot-baseline.git/tracy-webroot.lock","w")
fcntl.flock(f,fcntl.LOCK_EX)
(r/"writer-ready").touch()
deadline=time.monotonic()+15
while not (r/"release").exists() and time.monotonic()<deadline: time.sleep(.01)'`,
    env
  )
  let first
  let second
  try {
    await until(() => existsSync(join(root, 'writer-ready')))
    first = job(command, env)
    // Probe the actual kernel lock to prove the first reader reached its admission fence.
    const probeDeadline = Date.now() + 15_000
    for (;;) {
      const probe = await job(
        `. "${scripts}lib/webroot-repo-git.sh"; tracy_webroot_init_lock "${root}/${label}" 0`,
        env
      ).done
      if (probe.code !== 0) break
      assert.ok(Date.now() < probeDeadline, 'the first reader must reach its admission fence')
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    second = job(command, env)
    const release = setTimeout(() => writeFileSync(join(root, 'release'), ''), 150)
    const results = await Promise.all([first.done, second.done])
    clearTimeout(release)
    for (const result of results) {
      assert.equal(result.code, 0, result.stderr)
      const answer = JSON.parse(result.stdout.trim().split('\n').at(-1))
      assert.notEqual(answer.building, true, 'an ordinary competing reader is not a provisioning site')
      assert.equal(answer.latest.version, 1)
      assert.equal(answer.rows.length, 1)
    }
  } finally {
    writeFileSync(join(root, 'release'), '')
    await writer.done
    if (first) await first.done
    if (second) await second.done
    rmSync(root, { recursive: true, force: true })
  }
})

test('provision admission waits until every shared established reader has released its fence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tracy-shared-readers-'))
  const env = {
    ...process.env,
    PATH: pathWithFlock(),
    LABEL: 'owned-test',
    SITE_DIR: join(root, 'owned-test'),
    TEST_ROOT: root,
    TRACY_PRIVATE_ROOT: root,
    TRACY_PROVISION_LOCK_DIR: root
  }
  const holder = (n) =>
    job(
      `set -euo pipefail
. "${scripts}lib/webroot-repo-git.sh"
tracy_webroot_init_lock "$SITE_DIR" 0 shared
touch "$TEST_ROOT/ready-${n}"
python3 -c 'import os,pathlib,time; p=pathlib.Path(os.environ["TEST_ROOT"])/"release-${n}"; deadline=time.monotonic()+15
while not p.exists() and time.monotonic()<deadline: time.sleep(.01)'
`,
      env
    )
  const first = holder(1)
  let second
  let provider
  try {
    await until(() => existsSync(join(root, 'ready-1')))
    second = holder(2)
    await until(() => existsSync(join(root, 'ready-2')))
    provider = job(
      `set -euo pipefail
. "${scripts}lib/roots.sh"
. "${scripts}lib/webroot-repo-git.sh"
${admission}
touch "$TEST_ROOT/mutation-started"
`,
      env
    )
    await until(() => /waiting for.*webroot initialization/.test(provider.output.stderr))
    writeFileSync(join(root, 'release-1'), '')
    assert.equal((await first.done).code, 0)
    assert.equal(
      existsSync(join(root, 'mutation-started')),
      false,
      'the second reader still excludes provision'
    )
    const exclusive = await job(
      `. "${scripts}lib/webroot-repo-git.sh"; tracy_webroot_init_lock "$SITE_DIR" 0`,
      env
    ).done
    assert.equal(exclusive.code, 1, 'the remaining shared reader still owns the fence')
    writeFileSync(join(root, 'release-2'), '')
    assert.equal((await second.done).code, 0)
    const result = await provider.done
    assert.equal(result.code, 0, result.stderr)
    assert.equal(existsSync(join(root, 'mutation-started')), true)
  } finally {
    writeFileSync(join(root, 'release-1'), '')
    writeFileSync(join(root, 'release-2'), '')
    await first.done
    if (second) await second.done
    if (provider) await provider.done
    rmSync(root, { recursive: true, force: true })
  }
})
