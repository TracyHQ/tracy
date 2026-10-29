#!/usr/bin/env node
/**
 * sync-brands.sh, run for real against a bare repository standing in for
 * TracyHQ/design-inspirations and a local stub of the GitHub pulls API (`github-api-stub.mjs`, which
 * also answers tracy-web's `/fleet/git-token`). What is asserted is the publishing contract that lets
 * `main` be protected: the commit reaches `main` only through a PR merged via the API, from a branch
 * `automation/brands/<host>/<sha>` that is gone afterwards — never a push to `main`.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/sync-brands.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'
import { advanceMain, STUB_TOKEN, startGitHubStub } from './github-api-stub.mjs'
import { sh } from './sh-async.mjs'
import { apiBase, gitFailureCause } from '../scripts/lib/github-pr-publish.mjs'

const SCRIPT = fileURLToPath(new URL('../scripts/tools/sync-brands.sh', import.meta.url))
const REPO = 'TracyHQ/design-inspirations'
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Seed',
  GIT_AUTHOR_EMAIL: 'seed@example.invalid',
  GIT_COMMITTER_NAME: 'Seed',
  GIT_COMMITTER_EMAIL: 'seed@example.invalid'
}

// The shelf's own generator, reduced to what the script relies on: it rebuilds `index.json` from
// whatever `systems/` holds.
const BUILD_CATALOG = `import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const root = join(import.meta.dirname, '..')
const hosts = readdirSync(join(root, 'systems')).sort()
writeFileSync(join(root, 'index.json'), JSON.stringify(hosts) + '\\n')
`

const manifest = (at) => `${JSON.stringify({ source: { extractedAt: at } })}\n`

/** A throwaway world: the bare "GitHub" repository, one site with one brand, and a stub API. */
async function world({ onCreate, onMerge, onClose, pulls } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sync-brands-'))
  const bare = join(root, 'remote.git')
  const seed = join(root, 'seed')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  mkdirSync(join(seed, 'scripts'), { recursive: true })
  mkdirSync(join(seed, 'systems', 'old.example.com'), { recursive: true })
  writeFileSync(join(seed, 'scripts', 'build-catalog.mjs'), BUILD_CATALOG)
  writeFileSync(join(seed, 'systems', 'old.example.com', 'manifest.json'), manifest('2026-01-01T00:00:00Z'))
  writeFileSync(join(seed, 'index.json'), '["old.example.com"]\n')
  const env = { ...process.env, ...GIT_ENV }
  execFileSync('git', ['init', '-q', '-b', 'main', seed], { env })
  execFileSync('git', ['-C', seed, 'add', '-A'], { env })
  execFileSync('git', ['-C', seed, 'commit', '-q', '-m', 'seed'], { env })
  execFileSync('git', ['-C', seed, 'push', '-q', bare, 'main'], { env })

  const sites = join(root, 'sites')
  const brand = join(sites, 'site-a', 'Brand', 'acme.example.com')
  mkdirSync(brand, { recursive: true })
  writeFileSync(join(brand, 'manifest.json'), manifest('2026-10-01T00:00:00Z'))
  writeFileSync(join(brand, 'tokens.css'), ':root { --brand: #123456; }\n')

  // rsync is not on every test machine; the script only ever runs `rsync -a --delete src/ dst/`.
  const bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(
    join(bin, 'rsync'),
    '#!/usr/bin/env bash\nsrc="${@: -2:1}"; dst="${@: -1}"; rm -rf "$dst"; mkdir -p "$dst"; cp -a "$src/." "$dst/"\n'
  )
  chmodSync(join(bin, 'rsync'), 0o755)

  const stub = await startGitHubStub({ bare, repo: REPO, onCreate, onMerge, onClose, pulls })
  /** @param {Record<string, string>} [extraEnv] */
  const run = (extraEnv = {}) =>
    sh('bash', [SCRIPT], {
      env: {
        ...process.env,
        ...GIT_ENV,
        PATH: `${bin}:${pathWithFlock()}`,
        GIT_CONFIG_GLOBAL: '/dev/null',
        TRACY_SITES_ROOT: sites,
        TRACY_PRIVATE_ROOT: join(root, 'private'),
        TRACY_SRV: '',
        TRACY_BRANDS_LOCK: join(root, 'tracy-brands-sync.lock'),
        TRACY_BRANDS_REMOTE: bare,
        TRACY_GITHUB_API: stub.url,
        TRACY_WEB_ORIGIN: stub.url,
        TRACY_HOOKS_ENV: join(root, 'no-hooks.env'),
        HOST_SECRET: 'test-secret',
        HOST_NAME: 'host-a',
        GIT_TERMINAL_PROMPT: '0',
        ...extraEnv
      },
      timeout: 60_000
    })
  const rev = (r) => execFileSync('git', ['-C', bare, 'rev-parse', r], { encoding: 'utf8' }).trim()
  const show = (path) =>
    execFileSync('git', ['-C', bare, 'show', `main:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  const cleanup = async () => {
    await stub.close()
    rmSync(root, { recursive: true, force: true })
  }
  return { root, bare, stub, run, show, rev, cleanup, seed }
}

/** Push a commit on top of main to `automation/brands/<host>/<sha>` of the bare remote. */
function pushBranch(w, host, files) {
  const work = mkdtempSync(join(w.root, 'branch-'))
  const env = { ...process.env, ...GIT_ENV }
  execFileSync('git', ['clone', '-q', w.bare, work], { env })
  for (const [f, content] of Object.entries(files)) {
    mkdirSync(join(work, f, '..'), { recursive: true })
    writeFileSync(join(work, f), content)
  }
  execFileSync('git', ['-C', work, 'add', '-A'], { env })
  execFileSync('git', ['-C', work, 'commit', '-q', '-m', 'leftover'], { env })
  const sha = execFileSync('git', ['-C', work, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const ref = `automation/brands/${host}/${sha.slice(0, 12)}`
  execFileSync('git', ['-C', work, 'push', '-q', 'origin', `HEAD:refs/heads/${ref}`], { env })
  return { sha, ref }
}

/** Push one more commit onto `ref` of the bare remote (someone else's push); returns its sha. */
function moveBranch(w, ref) {
  const work = mkdtempSync(join(w.root, 'mover-'))
  const env = { ...process.env, ...GIT_ENV }
  execFileSync('git', ['clone', '-q', '--branch', ref, w.bare, work], { env })
  writeFileSync(join(work, 'someone-else.txt'), 'pushed during the close\n')
  execFileSync('git', ['-C', work, 'add', '-A'], { env })
  execFileSync('git', ['-C', work, 'commit', '-q', '-m', 'someone else'], { env })
  execFileSync('git', ['-C', work, 'push', '-q', 'origin', `HEAD:refs/heads/${ref}`], { env })
  return execFileSync('git', ['-C', work, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

/** An open PR as the pulls API lists it. */
const openPr = (w, number, ref, sha, login) => ({
  number,
  html_url: w.stub.prUrl(number),
  state: 'open',
  user: { login },
  head: { ref, sha, repo: { full_name: REPO } },
  base: { ref: 'main' }
})

describe('sync-brands.sh publishes through a pull request', { concurrency: 4 }, () => {
  test('happy path: one PR from automation/brands/<host>/, merged via the API, branch deleted', async () => {
    const w = await world()
    try {
      const r = await w.run()
      assert.equal(r.status, 0, r.stdout + r.stderr)
      assert.equal(w.stub.pulls.length, 1)
      const [pr] = w.stub.pulls
      assert.match(pr.head.ref, /^automation\/brands\/host-a\/[0-9a-f]{12}$/)
      assert.equal(pr.merged, true)
      assert.equal(pr.title, 'brands: acme.example.com')
      assert.deepEqual(JSON.parse(w.show('index.json')), ['acme.example.com', 'old.example.com'])
      assert.match(w.show('systems/acme.example.com/tokens.css'), /#123456/)
      assert.deepEqual(w.stub.branches(), ['main'])
      // The merge was pinned to the pushed head.
      assert.ok(w.stub.calls.includes(`PUT /repos/${REPO}/pulls/1/merge`))
      assert.match(r.stdout, /published to https:\/\/github.com\/TracyHQ\/design-inspirations/)
      // A second run finds the shelf up to date and opens nothing.
      const again = await w.run()
      assert.equal(again.status, 0, again.stdout + again.stderr)
      assert.match(again.stdout, /nothing to publish/)
      assert.equal(w.stub.pulls.length, 1)
    } finally {
      await w.cleanup()
    }
  })

  test('main moved once: the first PR is closed, the run regenerates on the new main and merges', async () => {
    let moved = false
    const w = await world({
      onCreate: () => {
        if (moved) return
        moved = true
        advanceMain(
          w.bare,
          join(w.root, 'other'),
          'systems/other.example.com/manifest.json',
          manifest('2026-09-01T00:00:00Z')
        )
      }
    })
    try {
      const r = await w.run()
      assert.equal(r.status, 0, r.stdout + r.stderr)
      assert.equal(w.stub.pulls.length, 2)
      assert.equal(w.stub.pulls[0].state, 'closed')
      assert.notEqual(w.stub.pulls[0].merged, true)
      assert.equal(w.stub.pulls[1].merged, true)
      assert.match(r.stdout, /main moved/)
      // Regenerated from the new main: the index holds the other host's brand as well as ours.
      assert.deepEqual(JSON.parse(w.show('index.json')), [
        'acme.example.com',
        'old.example.com',
        'other.example.com'
      ])
      assert.deepEqual(w.stub.branches(), ['main'])
    } finally {
      await w.cleanup()
    }
  })

  test('conflict twice: fails with the second PR URL, never pushes main', async () => {
    const w = await world({
      onMerge: () => ({ status: 405, json: { message: 'Pull Request is not mergeable' } })
    })
    try {
      const mainBefore = execFileSync('git', ['-C', w.bare, 'rev-parse', 'main'], { encoding: 'utf8' })
      const r = await w.run()
      assert.notEqual(r.status, 0)
      assert.ok(r.stderr.includes(w.stub.prUrl(2)), r.stderr)
      assert.equal(w.stub.pulls.length, 2)
      assert.equal(w.stub.pulls[0].state, 'closed')
      assert.equal(w.stub.pulls[1].state, 'open')
      assert.equal(execFileSync('git', ['-C', w.bare, 'rev-parse', 'main'], { encoding: 'utf8' }), mainBefore)
      assert.doesNotMatch(r.stdout + r.stderr, /another host/)
    } finally {
      await w.cleanup()
    }
  })

  test('merge API answers merged:false: a failure naming the PR, not a success', async () => {
    const w = await world({ onMerge: () => ({ status: 200, json: { merged: false, message: 'not today' } }) })
    try {
      const r = await w.run()
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /merged:false/)
      assert.ok(r.stderr.includes(w.stub.prUrl(1)), r.stderr)
      assert.doesNotMatch(r.stdout, /published to/)
      assert.equal(w.stub.pulls.length, 1)
    } finally {
      await w.cleanup()
    }
  })

  test('a leftover branch someone moves while its PR is being closed survives: the delete is compare-and-delete', async () => {
    let moved = ''
    const w = await world({
      // Between the publisher's check of the branch and its delete, someone pushes to the branch.
      onClose: (pr) => {
        if (pr.number !== 1) return
        moved = moveBranch(w, pr.head.ref)
      }
    })
    try {
      const { sha, ref } = pushBranch(w, 'host-a', { 'left.txt': 'from the crashed run\n' })
      w.stub.pulls.push(openPr(w, 1, ref, sha, 'tracy-fleet[bot]'))

      const r = await w.run()
      assert.equal(r.status, 0, r.stdout + r.stderr)
      assert.equal(w.stub.pulls[0].state, 'closed', 'closing the PR is unchanged')
      assert.ok(moved)
      assert.ok(w.stub.branches().includes(ref), 'the moved branch is still there')
      assert.equal(w.rev(ref), moved, 'and still holds the new commit')
      assert.match(r.stdout, /moved/)
      assert.doesNotMatch(r.stdout, /closed leftover .* deleted its branch/)
      assert.ok(!w.stub.calls.some((c) => c.startsWith('DELETE ')), 'no unconditional REST delete')
    } finally {
      await w.cleanup()
    }
  })

  test('the run branch someone moves while its failed PR is being closed survives too', async () => {
    let moved = ''
    let ref = ''
    const w = await world({
      onMerge: () => ({ status: 405, json: { message: 'Pull Request is not mergeable' } }),
      onClose: (pr) => {
        if (pr.number !== 1) return
        ref = pr.head.ref
        moved = moveBranch(w, ref)
      }
    })
    try {
      const r = await w.run()
      assert.notEqual(r.status, 0)
      assert.ok(moved)
      assert.ok(w.stub.branches().includes(ref), 'the moved run branch is still there')
      assert.equal(w.rev(ref), moved)
    } finally {
      await w.cleanup()
    }
  })

  test('a crash left the own PR of this host open: it is closed, never merged, and the run publishes fresh', async () => {
    const w = await world()
    try {
      // What a run that died after opening its PR leaves: the branch and the open PR, nothing merged.
      // Built on today's main with the very content this run would publish — still not merged.
      const { sha, ref } = pushBranch(w, 'host-a', {
        'systems/acme.example.com/manifest.json': manifest('2026-10-01T00:00:00Z'),
        'systems/acme.example.com/tokens.css': ':root { --brand: #123456; }\n',
        'index.json': '["acme.example.com","old.example.com"]\n'
      })
      w.stub.pulls.push(openPr(w, 1, ref, sha, 'tracy-fleet[bot]'))

      const r = await w.run()
      assert.equal(r.status, 0, r.stdout + r.stderr)
      assert.match(r.stdout, /closed leftover/)
      assert.equal(w.stub.pulls[0].state, 'closed')
      assert.notEqual(w.stub.pulls[0].merged, true)
      assert.equal(w.stub.pulls.length, 2, 'one fresh PR, no duplicate')
      assert.equal(w.stub.pulls[1].merged, true)
      assert.notEqual(w.stub.pulls[1].head.sha, sha, 'the merged commit is the one this run produced')
      assert.equal(w.rev(`main^2`), w.stub.pulls[1].head.sha)
      assert.deepEqual(w.stub.branches(), ['main'])
    } finally {
      await w.cleanup()
    }
  })

  test('PRs that do not belong to this publisher are neither merged nor closed, and do not block the run', async () => {
    const w = await world()
    try {
      // Another user's PR from a same-repository branch under this host's prefix, built on main.
      const mine = pushBranch(w, 'host-a', { 'evil.txt': 'not ours\n' })
      w.stub.pulls.push(openPr(w, 1, mine.ref, mine.sha, 'mallory'))
      // A fork's PR whose branch name falls under the prefix.
      w.stub.pulls.push({
        ...openPr(w, 2, 'automation/brands/host-a/fork00000000', mine.sha, 'tracy-fleet[bot]'),
        head: {
          ref: 'automation/brands/host-a/fork00000000',
          sha: mine.sha,
          repo: { full_name: 'mallory/design-inspirations' }
        }
      })
      // This publisher's own PR, but its branch was force-updated after the crash.
      const moved = pushBranch(w, 'host-a', { 'moved.txt': 'force-updated\n' })
      w.stub.pulls.push(openPr(w, 3, moved.ref, '0'.repeat(40), 'tracy-fleet[bot]'))
      // Another host's own PR.
      const other = pushBranch(w, 'host-b', { 'b.txt': 'host b\n' })
      w.stub.pulls.push(openPr(w, 4, other.ref, other.sha, 'tracy-fleet[bot]'))

      const r = await w.run()
      assert.equal(r.status, 0, r.stdout + r.stderr)
      for (const pr of w.stub.pulls.slice(0, 4)) {
        assert.equal(pr.state, 'open', `PR #${pr.number} untouched`)
        assert.notEqual(pr.merged, true)
      }
      assert.ok(w.stub.branches().includes(mine.ref))
      assert.ok(w.stub.branches().includes(moved.ref))
      assert.ok(w.stub.branches().includes(other.ref))
      assert.equal(w.stub.pulls[4].merged, true)
      for (const f of ['evil.txt', 'moved.txt', 'b.txt']) assert.throws(() => w.show(f))
    } finally {
      await w.cleanup()
    }
  })

  test('a push that fails says why: the remote is gone, not "another host won"', async () => {
    const w = await world()
    try {
      // First run clones; then the remote disappears.
      assert.equal((await w.run()).status, 0)
      writeFileSync(
        join(w.root, 'sites', 'site-a', 'Brand', 'acme.example.com', 'manifest.json'),
        manifest('2026-10-02T00:00:00Z')
      )
      rmSync(w.bare, { recursive: true, force: true })
      const r = await w.run()
      assert.notEqual(r.status, 0)
      assert.doesNotMatch(r.stdout + r.stderr, /another host/)
      assert.match(r.stdout + r.stderr, /fetch of main failed|not found|repository/i)
      assert.ok(existsSync(join(w.root, 'private', '_brands', '.git')))
    } finally {
      await w.cleanup()
    }
  })
})

describe('sync-brands.sh never hands the token to anything but GitHub', { concurrency: 4 }, () => {
  test('an API override that is not a loopback http URL is refused before a token is asked for', async () => {
    const w = await world()
    try {
      for (const api of [
        'https://localhost:1',
        'http://127.0.0.1:1@localhost:2',
        'http://localhost',
        'https://api.evil.example.invalid',
        'http://localhost.evil.example.invalid:80'
      ]) {
        const r = await w.run({ TRACY_GITHUB_API: api })
        assert.notEqual(r.status, 0, api)
        assert.match(r.stderr, /refus/i, api)
      }
      assert.equal(w.stub.calls.length, 0, 'no token was asked for, no API was called')
    } finally {
      await w.cleanup()
    }
  })

  test('a remote override that is not loopback http or a local bare repository is refused', async () => {
    const w = await world()
    try {
      const notBare = join(w.root, 'sites')
      for (const remote of [
        'https://localhost:1/x.git',
        'https://evil.example.invalid/TracyHQ/design-inspirations.git',
        `file://${notBare}`,
        notBare,
        'relative/path.git'
      ]) {
        const r = await w.run({ TRACY_BRANDS_REMOTE: remote })
        assert.notEqual(r.status, 0, remote)
        assert.match(r.stderr, /refus/i, remote)
      }
      assert.equal(w.stub.calls.length, 0)
      assert.equal(existsSync(join(w.root, 'private', '_brands')), false)
    } finally {
      await w.cleanup()
    }
  })

  test('a lock override is refused unless it names tracy-brands-sync.lock, and never truncates a file', async () => {
    const w = await world()
    try {
      const victim = join(w.root, 'victim.txt')
      writeFileSync(victim, 'keep me\n')
      const r = await w.run({ TRACY_BRANDS_LOCK: victim })
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /refus/i)
      assert.equal(readFileSync(victim, 'utf8'), 'keep me\n')
    } finally {
      await w.cleanup()
    }
  })

  test('the credential helper answers only for github.com: a loopback remote never sees the token', async () => {
    const w = await world()
    /** @type {string[]} */
    const auth = []
    // A remote that asks for credentials, as GitHub does before a clone.
    const remote = createServer((req, res) => {
      auth.push(String(req.headers.authorization ?? ''))
      res.writeHead(401, { 'www-authenticate': 'Basic realm="x"' })
      res.end()
    })
    await new Promise((resolve) => remote.listen(0, '127.0.0.1', resolve))
    try {
      const port = /** @type {import('node:net').AddressInfo} */ (remote.address()).port
      const r = await w.run({ TRACY_BRANDS_REMOTE: `http://127.0.0.1:${port}/repo.git` })
      assert.notEqual(r.status, 0)
      assert.ok(auth.length > 0, 'git did reach the remote')
      for (const a of auth) {
        assert.ok(!a.includes(Buffer.from(`x-access-token:${STUB_TOKEN}`).toString('base64')), a)
        assert.equal(a, '', 'no credentials offered at all')
      }
    } finally {
      await new Promise((resolve) => remote.close(resolve))
      await w.cleanup()
    }
  })
})

test('gitFailureCause names auth, protection and network failures by what they are', () => {
  assert.match(
    gitFailureCause(
      "remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/x/y.git/'"
    ),
    /authentication/
  )
  assert.match(
    gitFailureCause('remote: error: GH006: Protected branch update failed for refs/heads/main.'),
    /protection/
  )
  assert.match(
    gitFailureCause(
      "fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com"
    ),
    /network/
  )
  assert.match(gitFailureCause(' ! [rejected]        HEAD -> automation/x (fetch first)'), /already holds/)
  assert.doesNotMatch(gitFailureCause('anything else'), /another host/)
})

test('apiBase: api.github.com by default, a loopback http stub at most, nothing else', () => {
  assert.equal(apiBase(undefined), 'https://api.github.com')
  assert.equal(apiBase('http://127.0.0.1:4567/'), 'http://127.0.0.1:4567')
  assert.equal(apiBase('http://localhost:80'), 'http://localhost:80')
  for (const bad of [
    'https://api.evil.example.invalid',
    'http://localhost.evil.example.invalid:1',
    'http://127.0.0.1:1@evil.example.invalid',
    'https://localhost:1',
    'http://127.0.0.1:1/path'
  ])
    assert.throws(() => apiBase(bad), /refusing/, bad)
})
