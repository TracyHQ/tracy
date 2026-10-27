#!/usr/bin/env node
/**
 * push-site-folder.sh and sync-site-folders.sh, run for REAL against
 * git: a local bare repo stands in for GitHub (TRACY_GIT_REMOTE_BASE), and a small HTTP server in
 * this process stands in for tracy-web's `/fleet/git-token` — it checks the HMAC with the host
 * secret, the host name and the label exactly as the real door does, so the signing path in
 * `lib/relay-git-token.sh` is exercised end to end, not stubbed.
 *
 * What is asserted is what a customer's repo ends up holding after an hourly run (plan
 * `tasks/todo-sync-site-folder-github.md`, R10): the scaffold, later syncs on top of it, no empty
 * commits, nothing secret-shaped or oversized pushed, no hook from the site folder ever run, a
 * repo-less site skipped, a refused push recovered, and two runs taking turns on one repo.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/site-folder-sync.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'
import { sh } from './sh-async.mjs'

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))
const PUSH = path.join(SCRIPTS, 'tools/push-site-folder.sh')
const SYNC = path.join(SCRIPTS, 'tools/sync-site-folders.sh')
const RELAY = path.join(SCRIPTS, 'lib/relay-git-token.sh')

const HOST = 'test-host'
const HOST_SECRET = 'host-secret-for-tests'
const TOKEN = 'ghs_fake_token_never_on_disk'
const SHARED_REPOS = ['TracyHQ/design-inspirations']

// ── the fake token door ──────────────────────────────────────────────────────────────────────────
// site key → { label, host, repo|null }. Filled by each test.
const SITES = new Map()
const ASKS = []
let server
let origin

before(async () => {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (d) => (raw += d))
    req.on('end', () => {
      const send = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body))
      }
      if (req.url !== '/fleet/git-token') return send(404, {})
      const body = JSON.parse(raw)
      ASKS.push(body)
      const expected = createHmac('sha256', HOST_SECRET).update(raw).digest('hex')
      if (body.host !== HOST || req.headers['x-tracy-signature'] !== expected) {
        return send(403, { code: 'BAD_SIGNATURE' })
      }
      if (!body.siteKey) {
        if (!SHARED_REPOS.includes(body.repo)) return send(400, { code: 'INVALID_REQUEST' })
        return send(200, { token: TOKEN, repo: body.repo })
      }
      if (!body.label) return send(400, { code: 'INVALID_REQUEST' })
      const site = SITES.get(body.siteKey)
      if (!site) return send(404, { code: 'NO_REPO' })
      if (site.host !== body.host || site.label !== body.label) return send(403, { code: 'REPO_NOT_YOURS' })
      if (!site.repo) return send(404, { code: 'NO_REPO' })
      if (body.repo && body.repo !== site.repo) return send(403, { code: 'REPO_NOT_YOURS' })
      return send(200, { token: TOKEN, repo: site.repo, expiresAt: '2099-01-01T00:00:00Z' })
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})
after(() => server.close())

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────
const git = (args, opts = {}) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    ...opts
  }).trim()

/** A throwaway host: two roots, a directory of bare "GitHub" repos, a lock directory. */
function host() {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-sync-'))
  const h = {
    dir,
    sites: path.join(dir, 'sites'),
    priv: path.join(dir, 'private'),
    remotes: path.join(dir, 'github'),
    locks: path.join(dir, 'locks'),
    dispose: () => rmSync(dir, { recursive: true, force: true })
  }
  for (const d of [h.sites, h.priv, h.remotes, h.locks]) mkdirSync(d, { recursive: true })
  h.env = {
    ...process.env,
    PATH: pathWithFlock(),
    TRACY_SITES_ROOT: h.sites,
    TRACY_PRIVATE_ROOT: h.priv,
    TRACY_SRV: '',
    TRACY_WEB_ORIGIN: origin,
    TRACY_HOOKS_ENV: path.join(dir, 'no-hooks.env'),
    HOST_NAME: HOST,
    HOST_SECRET,
    TRACY_GIT_REMOTE_BASE: `file://${h.remotes}`,
    TRACY_REPO_LOCK_DIR: h.locks,
    TRACY_SYNC_LOCK: path.join(h.locks, 'site-sync'),
    TRACY_HEAVY_LOCK: path.join(h.locks, 'heavy'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1'
  }
  return h
}

/** A bare repo standing in for `TracyHQ/<name>`, holding GitHub's auto_init commit unless `empty`. */
function remote(h, name, { empty = false } = {}) {
  const bare = path.join(h.remotes, 'TracyHQ', `${name}.git`)
  mkdirSync(path.dirname(bare), { recursive: true })
  git(['init', '-q', '--bare', '--initial-branch=main', bare])
  if (!empty) {
    commitToRemote(h, bare, { 'README.md': `# ${name}\n` }, 'Initial commit')
  }
  return bare
}

/** Push files straight to the remote, as a teammate on GitHub would. */
function commitToRemote(h, bare, files, message) {
  const work = mkdtempSync(path.join(h.dir, 'clone-'))
  const hasMain = git(['--git-dir', bare, 'branch', '--list', 'main']) !== ''
  if (hasMain) git(['clone', '-q', bare, work])
  else git(['init', '-q', '--initial-branch=main', work])
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(work, file)), { recursive: true })
    writeFileSync(path.join(work, file), body)
  }
  git(['-C', work, 'add', '-A'])
  git(['-C', work, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message])
  git(['-C', work, 'push', '-q', bare, 'HEAD:refs/heads/main'])
  rmSync(work, { recursive: true, force: true })
}

/** A site folder shaped the way ensure-site-folder.mjs leaves one, registered with the fake door. */
function site(h, label, { repo = `TracyHQ/${label}`, files = {} } = {}) {
  const dir = path.join(h.sites, label)
  mkdirSync(path.join(dir, '.tracy'), { recursive: true })
  mkdirSync(path.join(dir, '.webroot'), { recursive: true })
  const siteKey = `${label}.tracy.test`
  const base = {
    '.gitignore': '.webroot/\n.tracy/\n',
    'AGENTS.md': `# ${label}\n`,
    'README.md': `# ${label} site folder\n`,
    'TracyWork/a.md': 'first note\n',
    '.webroot/index.php': '<?php // the CMS, never pushed\n',
    '.tracy/site.json': `${JSON.stringify({ siteKey, platform: 'wordpress' })}\n`
  }
  for (const [file, body] of Object.entries({ ...base, ...files })) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), body)
  }
  SITES.set(siteKey, { label, host: HOST, repo })
  return { dir, siteKey, label }
}

const push = (h, s) => sh('bash', [PUSH, s.label, s.siteKey], { env: h.env, timeout: 60_000 })
const out = (r) => `${r.stdout}${r.stderr}`
const tree = (bare) =>
  git(['--git-dir', bare, 'ls-tree', '-r', '--name-only', 'main']).split('\n').filter(Boolean)
const subjects = (bare) => git(['--git-dir', bare, 'log', '--format=%s', 'main']).split('\n')
const head = (bare) => git(['--git-dir', bare, 'rev-parse', 'main'])

// ── cases ────────────────────────────────────────────────────────────────────────────────────────

test('three runs: scaffold on top of auto_init, then a sync that adds and removes, then no empty commit', async () => {
  const h = host()
  try {
    const bare = remote(h, 'alpha')
    const s = site(h, 'alpha')

    const first = await push(h, s)
    assert.equal(first.status, 0, out(first))
    assert.deepEqual(subjects(bare), ['chore(tracy): scaffold the site folder', 'Initial commit'])
    assert.deepEqual(tree(bare).sort(), ['.gitignore', 'AGENTS.md', 'README.md', 'TracyWork/a.md'])
    // The door was asked with the label, and the site record (not the script) named the repo.
    assert.deepEqual(ASKS.at(-1), { siteKey: s.siteKey, label: 'alpha', host: HOST })

    // R1: the metadata is in the private root, nothing was created in the site folder, and the
    // token is in no config file.
    const syncGit = path.join(h.priv, 'alpha', 'site-sync.git')
    assert.ok(existsSync(path.join(syncGit, 'HEAD')))
    assert.equal(existsSync(path.join(s.dir, '.git')), false)
    const config = readFileSync(path.join(syncGit, 'config'), 'utf8')
    assert.doesNotMatch(config, new RegExp(TOKEN))
    assert.match(config, /url = file:\/\/.*\/TracyHQ\/alpha\.git/)

    writeFileSync(path.join(s.dir, 'TracyWork', 'b.md'), 'second note\n')
    rmSync(path.join(s.dir, 'TracyWork', 'a.md'))
    const second = await push(h, s)
    assert.equal(second.status, 0, out(second))
    assert.equal(subjects(bare)[0], 'chore(tracy): sync the site folder from the host — TracyWork')
    assert.ok(tree(bare).includes('TracyWork/b.md'))
    assert.ok(!tree(bare).includes('TracyWork/a.md'))

    const before = head(bare)
    const third = await push(h, s)
    assert.equal(third.status, 0, out(third))
    assert.match(out(third), /nothing to push/)
    assert.equal(head(bare), before, 'an unchanged folder makes no commit')
  } finally {
    h.dispose()
  }
})

test('a secret-shaped file is excluded by the host; un-ignored by the site, it aborts the site with no commit (R3)', async () => {
  const h = host()
  try {
    const bare = remote(h, 'secrets')
    const s = site(h, 'secrets', {
      files: { '.env': 'DB_PASSWORD=x\n', 'keys/x.pem': 'PEM\n', 'dump.sql': 'x' }
    })

    // Host excludes alone: pushed, without them.
    const clean = await push(h, s)
    assert.equal(clean.status, 0, out(clean))
    for (const file of ['.env', 'keys/x.pem', 'dump.sql']) assert.ok(!tree(bare).includes(file))

    // The agent's .gitignore un-ignores two of them: the staged-tree scan refuses the whole site.
    writeFileSync(path.join(s.dir, '.gitignore'), '.webroot/\n.tracy/\n!.env\n!*.pem\n')
    writeFileSync(path.join(s.dir, 'TracyWork', 'later.md'), 'would ride along\n')
    const before = head(bare)
    const refused = await push(h, s)
    assert.notEqual(refused.status, 0)
    assert.match(out(refused), /refusing to push \.env/)
    assert.match(out(refused), /refusing to push keys\/x\.pem/)
    assert.equal(head(bare), before, 'nothing reaches the remote')
  } finally {
    h.dispose()
  }
})

test('a staged file over 95 MB is left out by name; the rest is pushed (R3)', async () => {
  const h = host()
  try {
    const bare = remote(h, 'heavy')
    const s = site(h, 'heavy', { files: { 'TracyWork/deliverables/site.zip': 'small archive\n' } })
    execFileSync('truncate', ['-s', '96M', path.join(s.dir, 'TracyWork', 'big.bin')])

    const r = await push(h, s)
    assert.equal(r.status, 0, out(r))
    assert.match(out(r), /skipped TracyWork\/big\.bin — 96 MB/)
    const files = tree(bare)
    assert.ok(!files.includes('TracyWork/big.bin'))
    assert.ok(files.includes('AGENTS.md'))
    assert.ok(files.includes('TracyWork/deliverables/site.zip'), 'an archive under the limit is allowed')
  } finally {
    h.dispose()
  }
})

test('a hook planted in a .git inside the site folder never runs, and that .git is not used (R1)', async () => {
  const h = host()
  try {
    const bare = remote(h, 'hooked')
    const s = site(h, 'hooked')
    // The legacy in-folder repo the old script created — now the agent's to tamper with.
    git(['init', '-q', s.dir])
    const marker = path.join(h.dir, 'hook-ran')
    for (const hook of ['pre-commit', 'pre-push', 'post-commit', 'reference-transaction']) {
      const file = path.join(s.dir, '.git', 'hooks', hook)
      writeFileSync(file, `#!/bin/sh\necho ${hook} >> "${marker}"\n`)
      chmodSync(file, 0o755)
    }
    git(['-C', s.dir, 'config', 'core.hooksPath', path.join(s.dir, '.git', 'hooks')])

    const r = await push(h, s)
    assert.equal(r.status, 0, out(r))
    assert.equal(existsSync(marker), false, 'no hook from the site folder ran')
    assert.ok(!tree(bare).some((file) => file.startsWith('.git/')))
    assert.equal(git(['-C', s.dir, 'rev-list', '--all']), '', 'the in-folder repo got no commit')
  } finally {
    h.dispose()
  }
})

test('the first-commit path needs ls-remote to confirm there is no main; an unreachable origin fails (R6)', async () => {
  const h = host()
  try {
    const bare = remote(h, 'fresh', { empty: true })
    const s = site(h, 'fresh')
    const first = await push(h, s)
    assert.equal(first.status, 0, out(first))
    assert.match(out(first), /origin has no main yet/)
    assert.deepEqual(subjects(bare), ['chore(tracy): scaffold the site folder'])

    // The record names a repo that is not there: fetch AND ls-remote fail → no new history.
    const lost = site(h, 'lost')
    const r = await push(h, lost)
    assert.notEqual(r.status, 0)
    assert.match(out(r), /could not read origin/)
  } finally {
    h.dispose()
  }
})

test('a site with no repo exits 3 and is counted as skipped; a wrong label never gets a token', async () => {
  const h = host()
  try {
    remote(h, 'withrepo')
    site(h, 'withrepo')
    const bare = site(h, 'norepo', { repo: null })
    const r = await push(h, bare)
    assert.equal(r.status, 3, out(r))

    const all = await sh('bash', ['-c', 'exec "$0" 2>&1', SYNC], { env: h.env, timeout: 60_000 })
    assert.equal(all.status, 0, all.stdout)
    assert.match(all.stdout, /done: 1 synced, 1 skipped, 0 failed/)

    // `.tracy/site.json` of `norepo` edited to name `withrepo`'s key: the door refuses the label.
    writeFileSync(
      path.join(h.sites, 'norepo', '.tracy', 'site.json'),
      `${JSON.stringify({ siteKey: 'withrepo.tracy.test' })}\n`
    )
    const stolen = await sh('bash', [PUSH, 'norepo', 'withrepo.tracy.test'], { env: h.env })
    assert.notEqual(stolen.status, 0)
    assert.notEqual(stolen.status, 3)
    assert.match(out(stolen), /REPO_NOT_YOURS/)
  } finally {
    h.dispose()
  }
})

test('a rejected push fails the run; the next run starts from origin/main and gets through', async () => {
  const h = host()
  try {
    const bare = remote(h, 'flaky')
    const s = site(h, 'flaky')
    const flag = path.join(h.dir, 'reject')
    const hook = path.join(bare, 'hooks', 'pre-receive')
    writeFileSync(
      hook,
      `#!/bin/sh\nif [ -f "${flag}" ]; then echo "rejected by test" >&2; exit 1; fi\nexit 0\n`
    )
    chmodSync(hook, 0o755)

    writeFileSync(flag, '')
    const refused = await push(h, s)
    assert.notEqual(refused.status, 0)
    assert.match(out(refused), /push to TracyHQ\/flaky was refused/)
    assert.deepEqual(subjects(bare), ['Initial commit'])

    // Meanwhile a teammate pushed: the next run must append to that, not to its own stale commit.
    rmSync(flag)
    commitToRemote(h, bare, { 'docs/team.md': 'from GitHub\n' }, 'docs: from the team')
    const recovered = await push(h, s)
    assert.equal(recovered.status, 0, out(recovered))
    assert.deepEqual(subjects(bare), [
      'chore(tracy): scaffold the site folder',
      'docs: from the team',
      'Initial commit'
    ])
  } finally {
    h.dispose()
  }
})

test('two runs on one repo take turns under the repo lock; neither pushes while it is held (R4)', async () => {
  const h = host()
  try {
    const label = 'turns'
    const bare = remote(h, label)
    const s = site(h, label)
    const first = await push(h, s)
    assert.equal(first.status, 0, out(first))
    writeFileSync(path.join(s.dir, 'TracyWork', 'next.md'), 'one more\n')

    // Hold the repo lock first, so both runs start while it is taken and must queue.
    const lockFile = path.join(h.locks, `tracy-repo-${label}`)
    const held = path.join(h.dir, 'lock-held')
    const holder = sh('bash', ['-c', `exec 8>"${lockFile}"; flock 8; touch "${held}"; sleep 2`], {
      env: h.env
    })
    while (!existsSync(held)) await new Promise((resolve) => setTimeout(resolve, 20))
    const before = head(bare)
    const runs = Promise.all([push(h, s), push(h, s)])
    // Unlocked, a sync pushes in a few hundred milliseconds; under the lock, nothing moves.
    await new Promise((resolve) => setTimeout(resolve, 1000))
    assert.equal(head(bare), before, 'no run pushed while the repo lock was held')
    const [[a, b]] = await Promise.all([runs, holder])
    assert.equal(a.status, 0, out(a))
    assert.equal(b.status, 0, out(b))
    // One run pushed the new file; the other found the repo already matching the folder.
    const log = subjects(bare)
    assert.deepEqual(log.slice(0, 2), [
      'chore(tracy): sync the site folder from the host — TracyWork',
      'chore(tracy): scaffold the site folder'
    ])
    assert.ok(tree(bare).includes('TracyWork/next.md'))
    assert.match(out(a) + out(b), /nothing to push/)
  } finally {
    h.dispose()
  }
})

test('the shared-repo form asks without a site key and prints only the token (R7)', async () => {
  const h = host()
  try {
    const r = await sh(
      'bash',
      ['-c', `. "${RELAY}"; tracy_relay_git_token_shared TracyHQ/design-inspirations`],
      {
        env: h.env
      }
    )
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, TOKEN)
    assert.deepEqual(ASKS.at(-1), { repo: 'TracyHQ/design-inspirations', host: HOST })

    const refused = await sh(
      'bash',
      ['-c', `. "${RELAY}"; tracy_relay_git_token_shared TracyHQ/not-shared`],
      {
        env: h.env
      }
    )
    assert.notEqual(refused.status, 0)
    assert.equal(refused.stdout, '')
    assert.match(refused.stderr, /INVALID_REQUEST/)
  } finally {
    h.dispose()
  }
})
