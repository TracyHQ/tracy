#!/usr/bin/env node
/**
 * Daily QA PR discovery: which PRs (and which direct pushes) landed in `develop` between
 * `discoveredThrough` and the pinned SHA `T`. A throwaway git repo is built by the test, and a fake
 * `gh` on PATH returns canned `gh pr list` JSON; nothing talks to GitHub.
 *
 *   node --test scripts/test/qa-pr-range.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, test } from 'node:test'
import { classifyFiles, discoverPrs, PrRangeError } from '../qa/lib/pr-range.mjs'

const tmp = mkdtempSync(join(tmpdir(), 'qa-pr-range-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const repo = join(tmp, 'repo')
const bin = join(tmp, 'bin')
const ghJson = join(tmp, 'gh.json')
const ghArgs = join(tmp, 'gh.args')

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'qa',
  GIT_AUTHOR_EMAIL: 'qa@example.test',
  GIT_COMMITTER_NAME: 'qa',
  GIT_COMMITTER_EMAIL: 'qa@example.test',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.hooksPath',
  GIT_CONFIG_VALUE_0: '/dev/null'
}
const git = (...args) => execFileSync('git', args, { cwd: repo, env: gitEnv, encoding: 'utf8' }).trim()
const commitFile = (path, msg) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  writeFileSync(join(repo, path), `${msg}\n${Math.random()}\n`)
  git('add', path)
  git('commit', '-q', '-m', msg)
  return git('rev-parse', 'HEAD')
}

const sha = {}
const env = () => ({
  ...process.env,
  PATH: `${bin}:${process.env.PATH}`,
  FAKE_GH_JSON: ghJson,
  FAKE_GH_ARGS: ghArgs
})
const pr = (number, mergeCommit, extra = {}) => ({
  number,
  title: `PR ${number}`,
  author: { login: `dev${number}`, is_bot: false },
  mergedAt: '2026-10-02T10:00:00Z',
  mergeCommit: mergeCommit ? { oid: mergeCommit } : null,
  ...extra
})
const setGh = (list) => writeFileSync(ghJson, JSON.stringify(list))

before(() => {
  mkdirSync(repo)
  mkdirSync(bin)
  writeFileSync(join(bin, 'gh'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$FAKE_GH_ARGS"\ncat "$FAKE_GH_JSON"\n')
  chmodSync(join(bin, 'gh'), 0o755)
  git('init', '-q', '-b', 'develop')
  sha.old = commitFile('apps/tracy-web/old.js', 'feat: an old change (#90)')
  sha.from = commitFile('README.md', 'docs: start')
  // #101: a real merge commit of a branch with two commits.
  git('checkout', '-q', '-b', 'feat-101')
  commitFile('apps/tracy-web/src/a.js', 'feat: a one')
  commitFile('apps/tracy-web/src/a2.js', 'feat: a two')
  git('checkout', '-q', 'develop')
  git('merge', '-q', '--no-ff', 'feat-101', '-m', 'Merge pull request #101 from org/feat-101')
  sha.m101 = git('rev-parse', 'HEAD')
  // #102: squash-merged docs change.
  sha.s102 = commitFile('docs/guide.md', 'docs: a guide (#102)')
  // A direct push; the same commit sits in an unmerged PR #200 (the 5cc2aaed7 case).
  sha.direct = commitFile('packages/ui/tracy-ui/src/tokens.css', 'fix: tokens straight to develop')
  // #103: squash-merged plugin change.
  sha.s103 = commitFile('packages/core/tracy-core/src/x.ts', 'feat: core (#103)')
  // Revert of the #101 merge, and a revert of an older queued PR #90.
  git('revert', '--no-edit', '-m', '1', sha.m101)
  sha.revert101 = git('rev-parse', 'HEAD')
  git('revert', '--no-edit', sha.old)
  sha.revert90 = git('rev-parse', 'HEAD')
  sha.T = git('rev-parse', 'HEAD')
  // Lands after T was pinned: must not be seen.
  sha.late = commitFile('apps/tracy-web/late.js', 'feat: after T (#104)')
  // A side branch never merged into develop.
  git('checkout', '-q', '-b', 'side', sha.from)
  sha.side = commitFile('side.txt', 'side')
  git('checkout', '-q', 'develop')
})

const standard = () => [
  pr(101, sha.m101),
  pr(102, sha.s102),
  pr(103, sha.s103),
  pr(104, sha.late),
  pr(90, sha.old),
  pr(200, sha.direct, { mergedAt: null })
]

test('finds merge-commit and squash PRs, keeps direct pushes apart, ignores an unmerged PR holding the same commit', () => {
  setGh(standard())
  const out = discoverPrs({ repoDir: repo, from: sha.from, to: sha.T, env: env() })
  assert.deepEqual(
    out.prs.map((p) => p.number),
    [101, 102, 103]
  )
  const p101 = out.prs.find((p) => p.number === 101)
  assert.equal(p101.mergeCommit, sha.m101)
  assert.equal(p101.author, 'dev101')
  assert.deepEqual(p101.files, ['apps/tracy-web/src/a.js', 'apps/tracy-web/src/a2.js'])
  const directs = out.directCommits.map((c) => c.sha)
  assert.ok(directs.includes(sha.direct), 'direct push listed as a commit without a PR')
  assert.ok(!directs.includes(sha.m101) && !directs.includes(sha.s102))
  assert.ok(!out.prs.some((p) => p.number === 200))
  assert.ok(!directs.includes(sha.late), 'nothing after the pinned T')
})

test('gh is asked for merged PRs into develop since the day before discoveredThrough, limit 300', () => {
  setGh(standard())
  discoverPrs({ repoDir: repo, from: sha.from, to: sha.T, env: env() })
  const args = readFileSync(ghArgs, 'utf8').trim().split('\n')
  assert.deepEqual(args.slice(0, 2), ['pr', 'list'])
  const at = (flag) => args[args.indexOf(flag) + 1]
  assert.equal(at('--base'), 'develop')
  assert.equal(at('--state'), 'merged')
  assert.equal(at('--limit'), '300')
  assert.match(at('--search'), /^merged:>=\d{4}-\d\d-\d\d$/)
  assert.equal(at('--json'), 'number,mergeCommit,mergedAt,title,author')
})

test('a Revert pointing at a queued merge commit marks that PR reverted', () => {
  setGh(standard())
  const out = discoverPrs({
    repoDir: repo,
    from: sha.from,
    to: sha.T,
    env: env(),
    queued: [{ number: 90, mergeCommit: sha.old }]
  })
  assert.deepEqual(
    out.reverted.map((r) => [r.number, r.revertCommit]),
    [
      [101, sha.revert101],
      [90, sha.revert90]
    ]
  )
})

test('PR kind comes from git diff --name-only', () => {
  setGh(standard())
  const out = discoverPrs({ repoDir: repo, from: sha.from, to: sha.T, env: env() })
  const kind = Object.fromEntries(out.prs.map((p) => [p.number, p.kind]))
  assert.deepEqual(kind, { 101: 'apps', 102: 'docs', 103: 'plugin' })
  assert.equal(out.directCommits.find((c) => c.sha === sha.direct).kind, 'blast')
})

test('classifyFiles orders blast map > apps > plugin > script > theme; docs only when every file is docs', () => {
  assert.equal(classifyFiles(['apps/tracy-web/src/lib/session.js', 'docs/x.md']).kind, 'blast')
  assert.equal(classifyFiles(['scripts/x.mjs', 'apps/tracy-host/a.js']).kind, 'apps')
  assert.equal(classifyFiles(['scripts/x.mjs', 'packages/core/x.ts']).kind, 'plugin')
  assert.equal(classifyFiles(['scripts/x.mjs', 'tasks/a.md']).kind, 'script')
  assert.equal(classifyFiles(['vendor/emdash/emdash-theme-bravada/x.astro']).kind, 'theme')
  assert.equal(classifyFiles(['tasks/a.md', 'docs/b.md', 'CLAUDE.md']).kind, 'docs')
  assert.ok(
    classifyFiles(['packages/bundle/tracy-cowork/package.json']).priority < classifyFiles(['apps/x']).priority
  )
})

test('hitting the 300 limit stops: the list may be incomplete', () => {
  setGh(Array.from({ length: 300 }, (_, i) => pr(1000 + i, null, { mergedAt: '2026-10-02T10:00:00Z' })))
  assert.throws(
    () => discoverPrs({ repoDir: repo, from: sha.from, to: sha.T, env: env() }),
    (e) => e instanceof PrRangeError && e.code === 'LIST_TRUNCATED'
  )
})

test('discoveredThrough that is not an ancestor of T stops', () => {
  setGh(standard())
  assert.throws(
    () => discoverPrs({ repoDir: repo, from: sha.side, to: sha.T, env: env() }),
    (e) => e instanceof PrRangeError && e.code === 'NOT_ANCESTOR'
  )
})
