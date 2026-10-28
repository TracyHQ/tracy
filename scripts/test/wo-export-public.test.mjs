/**
 * scripts/wo-export-public.mjs `--sync --push`, run for real against a bare repository standing in for
 * TracyHQ/website-opportunities and a local stub of the GitHub pulls API. The export itself is the real
 * one (`git archive` of this checkout, the package's own leak scan); only `npm` is stubbed, because
 * `npm install --package-lock-only` would reach the registry. Asserted: the sync commit reaches `main`
 * only through a PR from `automation/wo/<source>/<export>` merged via the API, and every way that can
 * fail says so instead of pushing `main`.
 *
 *   node --test scripts/test/wo-export-public.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  advanceMain,
  STUB_TOKEN,
  startGitHubStub
} from '../../packages/fleet/tracy-fleet-operation/test/github-api-stub.mjs'
import { sh } from '../../packages/fleet/tracy-fleet-operation/test/sh-async.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts', 'wo-export-public.mjs')
const REPO = 'TracyHQ/website-opportunities'
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Seed',
  GIT_AUTHOR_EMAIL: 'seed@example.invalid',
  GIT_COMMITTER_NAME: 'Seed',
  GIT_COMMITTER_EMAIL: 'seed@example.invalid'
}

/** A PATH holding only what the script needs, an `npm` that writes a lockfile offline, and `gh` only if asked. */
function binDir(root, { gh } = {}) {
  const bin = join(root, 'bin')
  mkdirSync(bin)
  for (const tool of ['git', 'node', 'tar', 'sh', 'bash', 'env', 'cat', 'rm', 'mkdir']) {
    const real = execFileSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).trim()
    symlinkSync(real, join(bin, tool))
  }
  writeFileSync(
    join(bin, 'npm'),
    '#!/bin/sh\nprintf \'{"lockfileVersion":3,"packages":{}}\\n\' > package-lock.json\n'
  )
  chmodSync(join(bin, 'npm'), 0o755)
  if (gh !== undefined) {
    writeFileSync(join(bin, 'gh'), gh)
    chmodSync(join(bin, 'gh'), 0o755)
  }
  return bin
}

async function world({ onCreate, onMerge, gh } = {}) {
  // The maintainer's own user token: `GET /user` answers.
  const identity = { login: 'maintainer', kind: 'user' }
  const root = mkdtempSync(join(tmpdir(), 'wo-export-'))
  const bare = join(root, 'remote.git')
  const seed = join(root, 'seed')
  const env = { ...process.env, ...GIT_ENV }
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  mkdirSync(seed)
  writeFileSync(join(seed, 'README.md'), 'public tree\n')
  execFileSync('git', ['init', '-q', '-b', 'main', seed], { env })
  execFileSync('git', ['-C', seed, 'add', '-A'], { env })
  execFileSync('git', ['-C', seed, 'commit', '-q', '-m', 'seed'], { env })
  execFileSync('git', ['-C', seed, 'push', '-q', bare, 'main'], { env })
  const stub = await startGitHubStub({ bare, repo: REPO, onCreate, onMerge, identity })
  const bin = binDir(root, { gh })
  const out = join(root, 'out')
  /** @param {Record<string, string|undefined>} [extraEnv] */
  const run = (extraEnv = { GITHUB_TOKEN: STUB_TOKEN }) => {
    const e = {
      ...process.env,
      ...GIT_ENV,
      PATH: bin,
      GIT_CONFIG_GLOBAL: '/dev/null'
    }
    delete e.GITHUB_TOKEN
    delete e.GH_TOKEN
    return sh('node', [SCRIPT, '--out', out, '--sync', bare, '--repo', REPO, '--push', '--api', stub.url], {
      cwd: ROOT,
      env: { ...e, ...extraEnv },
      timeout: 120_000
    })
  }
  const rev = (r) => execFileSync('git', ['-C', bare, 'rev-parse', r], { encoding: 'utf8' }).trim()
  const cleanup = async () => {
    await stub.close()
    rmSync(root, { recursive: true, force: true })
  }
  return { root, bare, out, stub, run, rev, cleanup }
}

const sourceSha = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], {
  encoding: 'utf8'
}).trim()

describe('wo-export-public --sync --push publishes through a pull request', { concurrency: 3 }, () => {
  test('happy path: PR from automation/wo/<source>/<export>, merged via the API, branch deleted', async () => {
    const w = await world()
    try {
      const before = w.rev('main')
      const r = await w.run()
      assert.equal(r.status, 0, r.stdout + r.stderr)
      assert.equal(w.stub.pulls.length, 1)
      const [pr] = w.stub.pulls
      assert.match(pr.head.ref, new RegExp(`^automation/wo/${sourceSha}/[0-9a-f]{12}$`))
      assert.equal(pr.merged, true)
      assert.equal(w.rev('main^1'), before, 'main gained a merge commit on top of what it was')
      assert.equal(w.rev('main^2'), pr.head.sha)
      assert.deepEqual(w.stub.branches(), ['main'])
      const files = execFileSync('git', ['-C', w.bare, 'ls-tree', '--name-only', 'main'], {
        encoding: 'utf8'
      })
      assert.match(files, /^package\.json$/m)
      assert.doesNotMatch(files, /^turbo\.json$/m)
    } finally {
      await w.cleanup()
    }
  })

  test('main moved once: the first PR is closed and the export redone on the new main', async () => {
    let moved = false
    const w = await world({
      onCreate: () => {
        if (moved) return
        moved = true
        advanceMain(w.bare, join(w.root, 'other'), 'NOTES.md', 'a maintainer edit\n')
      }
    })
    try {
      const r = await w.run()
      assert.equal(r.status, 0, r.stdout + r.stderr)
      assert.equal(w.stub.pulls.length, 2)
      assert.equal(w.stub.pulls[0].state, 'closed')
      assert.notEqual(w.stub.pulls[0].merged, true)
      assert.equal(w.stub.pulls[1].merged, true)
      // The second export was built on the moved main, so the merge has it as first parent.
      const movedMain = w.rev('main^1')
      assert.equal(
        execFileSync('git', ['-C', w.bare, 'rev-parse', `${w.stub.pulls[1].head.sha}^1`], {
          encoding: 'utf8'
        }).trim(),
        movedMain
      )
      assert.deepEqual(w.stub.branches(), ['main'])
    } finally {
      await w.cleanup()
    }
  })

  test('conflict twice: fails with the second PR URL and main untouched', async () => {
    const w = await world({
      onMerge: () => ({ status: 405, json: { message: 'Pull Request is not mergeable' } })
    })
    try {
      const before = w.rev('main')
      const r = await w.run()
      assert.notEqual(r.status, 0)
      assert.ok(r.stderr.includes(w.stub.prUrl(2)), r.stderr)
      assert.equal(w.stub.pulls[0].state, 'closed')
      assert.equal(w.stub.pulls[1].state, 'open')
      assert.equal(w.rev('main'), before)
    } finally {
      await w.cleanup()
    }
  })

  test('merge API answers merged:false: a failure naming the PR', async () => {
    const w = await world({ onMerge: () => ({ status: 200, json: { merged: false, message: 'not today' } }) })
    try {
      const r = await w.run()
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /merged:false/)
      assert.ok(r.stderr.includes(w.stub.prUrl(1)), r.stderr)
      assert.doesNotMatch(r.stdout, /merged into main/)
    } finally {
      await w.cleanup()
    }
  })

  test('a leftover PR of this maintainer is closed, never merged; one by another user is left alone', async () => {
    const w = await world()
    try {
      // A first run whose merge "failed" leaves its PR open with its branch.
      const first = await startGitHubStub({
        bare: w.bare,
        repo: REPO,
        identity: { login: 'maintainer', kind: 'user' },
        onMerge: () => ({ status: 200, json: { merged: false, message: 'interrupted' } })
      })
      const e = {
        ...process.env,
        ...GIT_ENV,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GITHUB_TOKEN: STUB_TOKEN
      }
      const crashed = await sh(
        'node',
        [
          SCRIPT,
          '--out',
          join(w.root, 'out-1'),
          '--sync',
          w.bare,
          '--repo',
          REPO,
          '--push',
          '--api',
          first.url
        ],
        {
          cwd: ROOT,
          env: { ...e, PATH: join(w.root, 'bin') }
        }
      )
      await first.close()
      assert.notEqual(crashed.status, 0)
      w.stub.pulls.push(first.pulls[0])
      const leftover = first.pulls[0]
      // Another user's PR from a same-repository branch under the prefix, at the same commit.
      execFileSync('git', ['-C', w.bare, 'update-ref', 'refs/heads/automation/wo/other/x', leftover.head.sha])
      w.stub.pulls.push({
        ...leftover,
        number: 2,
        html_url: w.stub.prUrl(2),
        user: { login: 'mallory' },
        head: { ...leftover.head, ref: 'automation/wo/other/x' }
      })

      const r = await w.run()
      assert.equal(r.status, 0, r.stdout + r.stderr)
      assert.match(r.stdout, /closed leftover/)
      assert.equal(w.stub.pulls[0].state, 'closed')
      assert.notEqual(w.stub.pulls[0].merged, true)
      assert.equal(w.stub.pulls[1].state, 'open', "not this maintainer's PR: untouched")
      assert.notEqual(w.stub.pulls[1].merged, true)
      assert.equal(w.stub.pulls.length, 3, 'one fresh PR')
      assert.equal(w.stub.pulls[2].merged, true)
      assert.deepEqual(w.stub.branches().sort(), ['automation/wo/other/x', 'main'])
    } finally {
      await w.cleanup()
    }
  })

  test('no token: GITHUB_TOKEN unset and no gh — fails before cloning anything', async () => {
    const w = await world()
    try {
      const r = await w.run({})
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /GITHUB_TOKEN/)
      assert.match(r.stderr, /gh is not installed/)
      assert.equal(existsSync(w.out), false)
      assert.equal(w.stub.calls.length, 0)
    } finally {
      await w.cleanup()
    }
  })

  test('no token: gh present but logged out — fails before cloning anything', async () => {
    const w = await world({ gh: '#!/bin/sh\necho "not logged in" >&2\nexit 1\n' })
    try {
      const r = await w.run({})
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /gh auth login/)
      assert.equal(existsSync(w.out), false)
    } finally {
      await w.cleanup()
    }
  })

  test('the token can come from `gh auth token`', async () => {
    const w = await world({ gh: `#!/bin/sh\n[ "$1 $2" = "auth token" ] && echo ${STUB_TOKEN}\n` })
    try {
      const r = await w.run({})
      assert.equal(r.status, 0, r.stdout + r.stderr)
      assert.equal(w.stub.pulls[0].merged, true)
    } finally {
      await w.cleanup()
    }
  })
})

test('an --api that is not a loopback http stub is refused before any work', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wo-export-'))
  const PATH = binDir(root)
  try {
    for (const api of [
      'https://api.evil.example.invalid',
      'https://localhost:1',
      'http://127.0.0.1:1@evil.example.invalid'
    ]) {
      const out = join(root, 'out')
      const r = await sh(
        'node',
        [SCRIPT, '--out', out, '--sync', join(root, 'none.git'), '--repo', REPO, '--push', '--api', api],
        {
          cwd: ROOT,
          env: { ...process.env, PATH, GITHUB_TOKEN: STUB_TOKEN }
        }
      )
      assert.notEqual(r.status, 0, api)
      assert.match(r.stderr, /refusing API/, api)
      assert.equal(existsSync(out), false, api)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('there is no path that pushes main: --replace, --remote --push and a target without main all refuse', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wo-export-'))
  // The offline npm stub: were a refusal to break, the run must still not reach a registry.
  const PATH = binDir(root)
  const env = { ...process.env, ...GIT_ENV, PATH, GIT_CONFIG_GLOBAL: '/dev/null', GITHUB_TOKEN: STUB_TOKEN }
  try {
    // An EMPTY repository: the one case the old initial publication pushed main directly.
    const empty = join(root, 'empty.git')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', empty])
    const refsOf = () => execFileSync('git', ['-C', empty, 'for-each-ref'], { encoding: 'utf8' })

    const replace = await sh(
      'node',
      [SCRIPT, '--out', join(root, 'a'), '--remote', empty, '--push', '--replace'],
      { cwd: ROOT, env }
    )
    assert.notEqual(replace.status, 0)
    assert.match(replace.stderr, /--replace .* is gone/)

    const initial = await sh('node', [SCRIPT, '--out', join(root, 'b'), '--remote', empty, '--push'], {
      cwd: ROOT,
      env
    })
    assert.notEqual(initial.status, 0)
    assert.match(initial.stderr, /--remote .* is gone/)
    assert.equal(existsSync(join(root, 'b')), false)

    const stub = await startGitHubStub({ bare: empty, repo: REPO })
    try {
      const noMain = await sh(
        'node',
        [SCRIPT, '--out', join(root, 'c'), '--sync', empty, '--repo', REPO, '--push', '--api', stub.url],
        { cwd: ROOT, env }
      )
      assert.notEqual(noMain.status, 0)
      assert.match(noMain.stderr, /has no main.*by hand/)
      assert.equal(existsSync(join(root, 'c')), false)
      assert.equal(stub.calls.length, 0)
    } finally {
      await stub.close()
    }
    assert.equal(refsOf(), '', 'nothing was pushed to the empty repository')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
