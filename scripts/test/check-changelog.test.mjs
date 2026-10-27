#!/usr/bin/env node
/**
 * The changelog gate. The decision (`phanXet`, `khoangCommit`, `laMucNhatKy`) is a pure function of
 * the changed files, the journal files added or modified, the commit message and the dead hashes,
 * so its whole matrix runs here on inline data. A real repository (under `$TCH_TEST_ARTIFACTS_DIR`
 * when set, the OS temp dir otherwise) is kept ONLY for what is a git behaviour and not a decision:
 * two dots for a push, three for a pull request, deletions counted on the code side and not on the
 * journal side, and `cat-file` telling a dead hash from a live one. Each of those runs the real
 * script, the way CI and the pre-push hook run it.
 *
 *   node --test scripts/test/check-changelog.test.mjs
 *
 * Since 25/09/2026 an entry is one file in `tasks/nhat-ky/`, so that two parallel pull requests
 * never edit the same line.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { khoangCommit, laMucNhatKy, phanXet } from '../check-changelog.mjs'
import { envWithoutGitLocation } from '../check-push.mjs'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../check-changelog.mjs')
const ENV = {
  ...envWithoutGitLocation(process.env),
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null'
}

const ENTRY = '- **A change** — test · #1 · `branch` · 25/09/2026\n  **Chạm ai:** nobody.\n'
const CHANGE = '- **A change** — test · #1 · `branch` · 2026-10-26\n  **Affects:** nobody.\n'

/**
 * A throwaway repository with one base commit: code, the old journal, the journal README.
 * @param {import('node:test').TestContext} t - removes the repository when the test ends.
 */
function fixture(t) {
  const base = process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir()
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'check-changelog-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8' }).trim()
  const write = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  const commit = (message) => {
    git('add', '-A')
    git('commit', '-q', '--allow-empty', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'main')
  write('packages/a/index.js', 'export const a = 1\n')
  write('tasks/nhat-ky-main.md', '# Nhật ký\n\n- **Old entry** — test · #0 · `old` · 01/09/2026\n')
  write('tasks/nhat-ky/README.md', '# rules\n')
  write('tasks/nhat-ky/2026-09-01-old.md', ENTRY)
  write('changes/README.md', '# rules\n')
  write('docs/x.md', 'doc\n')
  const root = commit('base')
  /**
   * Run the gate on a payload, in this repository.
   * @param {Record<string, unknown>} payload - a push or pull_request event body.
   */
  const gate = (payload) => {
    const path = join(dir, '..', `${dir.split('/').pop()}-payload.json`)
    writeFileSync(path, JSON.stringify(payload))
    t.after(() => rmSync(path, { force: true }))
    return spawnSync(process.execPath, [SCRIPT, path], { cwd: dir, env: ENV, encoding: 'utf8' })
  }
  const push = (from, to) => gate({ before: from, after: to })
  return { dir, git, write, commit, root, gate, push }
}

// ── the decision, on inline data ─────────────────────────────────────────────────────────────

const RANGE = { goc: 'a'.repeat(40), ngon: 'b'.repeat(40), batCau: false }
const decide = (over) => phanXet({ chet: [], khoang: RANGE, doiFile: [], mucGhi: [], loiNhan: '', ...over })

test('a change to a guarded zone with an entry passes and names the entry', () => {
  const r = decide({
    doiFile: ['packages/a/index.js', 'tasks/nhat-ky/2026-09-25-pr-2.md'],
    mucGhi: ['tasks/nhat-ky/2026-09-25-pr-2.md']
  })
  assert.equal(r.ma, 0)
  assert.match(r.stdout, /tasks\/nhat-ky\/2026-09-25-pr-2\.md/)
})

test('code with no entry fails, and the message says where the entry goes', () => {
  const r = decide({ doiFile: ['apps/web/app.js'] })
  assert.equal(r.ma, 1)
  assert.match(r.stderr, /apps\/web\/app\.js/)
  assert.match(r.stderr, /tasks\/nhat-ky\//)
  assert.match(r.stderr, /YYYY-MM-DD-<slug>\.md/)
})

test('what counts as an entry: a file in the journal dir, or the old shared journal', () => {
  for (const [path, counts] of [
    ['tasks/nhat-ky/2026-09-25-pr-2.md', true],
    ['tasks/nhat-ky-main.md', true],
    ['tasks/nhat-ky/README.md', false],
    ['tasks/plan.md', false],
    ['docs/x.md', false]
  ])
    assert.equal(laMucNhatKy(path), counts, path)
})

test('an English entry in changes/ always counts; the internal journal counts only while it exists', () => {
  for (const [path, legacy, counts] of [
    ['changes/2026-10-26-pr-3.md', true, true],
    ['changes/2026-10-26-pr-3.md', false, true],
    ['changes/README.md', true, false],
    ['changes/README.md', false, false],
    ['tasks/nhat-ky/2026-10-26-pr-3.md', false, false],
    ['tasks/nhat-ky-main.md', false, false]
  ])
    assert.equal(laMucNhatKy(path, legacy), counts, `${path} legacy=${String(legacy)}`)
})

test('without the internal journal, the message points only at changes/', () => {
  const r = decide({ doiFile: ['apps/web/app.js'], legacy: false })
  assert.equal(r.ma, 1)
  assert.match(r.stderr, /changes\//)
  assert.match(r.stderr, /Affects:/)
  assert.doesNotMatch(r.stderr, /nhat-ky/)
})

test('with the internal journal, the message names both places', () => {
  const r = decide({ doiFile: ['apps/web/app.js'] })
  assert.match(r.stderr, /changes\//)
  assert.match(r.stderr, /tasks\/nhat-ky\//)
})

test('code with only a README change fails, because the README is not an entry', () => {
  const doiFile = ['packages/a/index.js', 'tasks/nhat-ky/README.md']
  const r = decide({ doiFile, mucGhi: doiFile.filter(laMucNhatKy) })
  assert.equal(r.ma, 1)
})

test('a deleted code file is still a touched zone, and it is named', () => {
  const r = decide({ doiFile: ['packages/a/index.js'] })
  assert.equal(r.ma, 1)
  assert.match(r.stderr, /packages\/a\/index\.js/)
})

test('[skip-changelog] in the message lets a push that touches nobody through', () => {
  const r = decide({ doiFile: ['packages/a/index.js'], loiNhan: 'chore: typo [skip-changelog]' })
  assert.equal(r.ma, 0)
  assert.match(r.stdout, /skip-changelog/)
})

test('a change outside packages/ and apps/ needs no entry', () => {
  const r = decide({ doiFile: ['docs/x.md', 'deploy/compose.yml'] })
  assert.equal(r.ma, 0)
  assert.match(r.stdout, /nothing to write/)
})

test('more than ten guarded files: the first ten are listed and the rest counted', () => {
  const r = decide({ doiFile: Array.from({ length: 13 }, (_, i) => `packages/a/f${i}.js`) })
  assert.equal(r.ma, 1)
  assert.match(r.stderr, /f9\.js/)
  assert.doesNotMatch(r.stderr, /f10\.js/)
  assert.match(r.stderr, /and 3 more files/)
})

test('a dead hash fails before anything else, whatever the push touched', () => {
  const chet = [{ hash: 'deadbee', file: 'tasks/nhat-ky/2026-09-25-dead.md' }]
  for (const over of [
    { khoang: null },
    { doiFile: ['docs/x.md'] },
    { doiFile: ['packages/a/index.js'], mucGhi: ['tasks/nhat-ky/x.md'] },
    { doiFile: ['packages/a/index.js'], loiNhan: '[skip-changelog]' }
  ]) {
    const r = decide({ chet, ...over })
    assert.equal(r.ma, 1)
    assert.match(r.stderr, /deadbee/)
    assert.match(r.stderr, /tasks\/nhat-ky\/2026-09-25-dead\.md/)
  }
})

test('the range: a push is two dots, a pull request three, a new branch has none', () => {
  const sha = (c) => c.repeat(40)
  assert.deepEqual(khoangCommit({ before: sha('a'), after: sha('b') }), {
    goc: sha('a'),
    ngon: sha('b'),
    batCau: false
  })
  assert.deepEqual(khoangCommit({ pull_request: { base: { sha: sha('a') }, head: { sha: sha('b') } } }), {
    goc: sha('a'),
    ngon: sha('b'),
    batCau: true
  })
  assert.equal(khoangCommit({ before: '0'.repeat(40), after: sha('b') }), null)
  assert.equal(khoangCommit({ before: sha('a'), after: '0'.repeat(40) }), null)
  assert.equal(khoangCommit({}), null)
  assert.equal(decide({ khoang: null, doiFile: ['packages/a/index.js'] }).ma, 0)
})

// One repository per group, put back to its base commit before every case (`fresh`).

describe('CLI: ranges and file lists as git reports them', () => {
  /** @type {ReturnType<typeof fixture>} */
  let f
  const cleanups = []
  before(() => {
    f = fixture({ after: (fn) => cleanups.push(fn) })
  })
  after(() => cleanups.forEach((fn) => fn()))
  beforeEach(() => f.git('reset', '-q', '--hard', f.root))

  test('code with a new entry file passes without touching the shared journal', () => {
    f.write('packages/a/index.js', 'export const a = 2\n')
    f.write('tasks/nhat-ky/2026-09-25-pr-2.md', ENTRY)
    const r = f.push(f.root, f.commit('code + entry'))
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /tasks\/nhat-ky\/2026-09-25-pr-2\.md/)
  })

  test('code with an English entry in changes/ passes while the internal journal still exists', () => {
    f.write('packages/a/index.js', 'export const a = 11\n')
    f.write('changes/2026-10-26-pr-3.md', CHANGE)
    const r = f.push(f.root, f.commit('code + english entry'))
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /changes\/2026-10-26-pr-3\.md/)
  })

  test('code with no entry exits 1 and writes the reason to stderr', () => {
    f.write('apps/web/app.js', 'x\n')
    const r = f.push(f.root, f.commit('code only'))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /apps\/web\/app\.js/)
  })

  test('an edit to an existing entry counts (git reports it modified)', () => {
    f.write('apps/web/app.js', 'x\n')
    f.write('tasks/nhat-ky/2026-09-01-old.md', `${ENTRY}  **Đo:** more.\n`)
    const r = f.push(f.root, f.commit('code + edited entry'))
    assert.equal(r.status, 0, r.stderr)
  })

  test('an edit to the old shared journal counts during the transition', () => {
    f.write('packages/a/index.js', 'export const a = 3\n')
    f.write('tasks/nhat-ky-main.md', `${ENTRY}\n- **Old entry** — test · #0 · \`old\` · 01/09/2026\n`)
    const r = f.push(f.root, f.commit('code + old journal'))
    assert.equal(r.status, 0, r.stderr)
  })

  test('deleting an entry file is not writing one', () => {
    f.write('packages/a/index.js', 'export const a = 5\n')
    f.git('rm', '-q', 'tasks/nhat-ky/2026-09-01-old.md')
    const r = f.push(f.root, f.commit('code + delete entry'))
    assert.equal(r.status, 1)
  })

  test('deleting code is still touching code', () => {
    f.git('rm', '-q', 'packages/a/index.js')
    const r = f.push(f.root, f.commit('delete code'))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /packages\/a\/index\.js/)
  })

  test('[skip-changelog] in a commit message of the range is read from git log', () => {
    f.write('packages/a/index.js', 'export const a = 6\n')
    const r = f.push(f.root, f.commit('chore: typo [skip-changelog]'))
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /skip-changelog/)
  })

  test('a brand-new branch has no range, and the gate says so instead of guessing', () => {
    const r = f.push('0000000000000000000000000000000000000000', f.root)
    assert.equal(r.status, 0, r.stderr)
  })

  test('pull_request: an entry that landed on the base is not counted for the PR', () => {
    f.git('checkout', '-q', '-b', 'feature')
    f.write('packages/a/index.js', 'export const a = 9\n')
    const head = f.commit('feature code, no entry')
    f.git('checkout', '-q', 'main')
    f.write('tasks/nhat-ky/2026-09-25-someone-else.md', ENTRY)
    const base = f.commit('someone else’s entry')
    const pr = { pull_request: { base: { sha: base }, head: { sha: head } } }
    const r = f.gate(pr)
    assert.equal(r.status, 1, 'three dots: the base’s entry is not the PR’s')

    f.git('checkout', '-q', 'feature')
    f.write('tasks/nhat-ky/2026-09-25-feature.md', ENTRY)
    const withEntry = f.commit('feature entry')
    const ok = f.gate({ pull_request: { base: { sha: base }, head: { sha: withEntry } } })
    assert.equal(ok.status, 0, ok.stderr)

    // The other half of the three dots: code that landed on the base is not the PR's either. A PR
    // that only edits docs must pass even though the base moved on with guarded code.
    f.git('checkout', '-q', 'main')
    f.write('apps/web/landed.js', 'x\n')
    const baseWithCode = f.commit('someone else’s code')
    f.git('checkout', '-q', '-b', 'docs-only', f.root)
    f.write('docs/x.md', 'doc, edited\n')
    const docsHead = f.commit('docs only')
    const docs = f.gate({ pull_request: { base: { sha: baseWithCode }, head: { sha: docsHead } } })
    assert.equal(docs.status, 0, docs.stderr)
    f.git('checkout', '-q', 'main')
  })
})

describe('CLI: dead hashes, judged by git cat-file on the whole journal', () => {
  /** @type {ReturnType<typeof fixture>} */
  let f
  const cleanups = []
  before(() => {
    f = fixture({ after: (fn) => cleanups.push(fn) })
  })
  after(() => cleanups.forEach((fn) => fn()))
  beforeEach(() => f.git('reset', '-q', '--hard', f.root))

  test('a dead hash in an entry file fails, naming the hash and the file', () => {
    f.write('packages/a/index.js', 'export const a = 7\n')
    f.write('tasks/nhat-ky/2026-09-25-dead.md', '- **X** — test · #3 · `deadbee` · 25/09/2026\n')
    const r = f.push(f.root, f.commit('dead hash [skip-changelog]'))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /deadbee/)
    assert.match(r.stderr, /tasks\/nhat-ky\/2026-09-25-dead\.md/)
  })

  test('a live hash and a prefixed upstream hash do not fail', () => {
    f.write('packages/a/index.js', 'export const a = 8\n')
    f.write(
      'tasks/nhat-ky/2026-09-25-live.md',
      `- **X** — test · #3 · \`${f.root.slice(0, 9)}\` · \`od@deadbee\` · 25/09/2026\n`
    )
    const r = f.push(f.root, f.commit('live hash'))
    assert.equal(r.status, 0, r.stderr)
  })

  test('a dead hash in an English entry fails too', () => {
    f.write('changes/2026-10-26-dead.md', '- **X** — test · #3 · `deadbee` · 2026-10-26\n')
    const r = f.push(f.root, f.commit('dead hash in changes'))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /changes\/2026-10-26-dead\.md/)
  })

  test('a dead hash in the old journal still fails', () => {
    f.write('tasks/nhat-ky-main.md', '- **X** — test · #3 · `cafebabe1` · 25/09/2026\n')
    const r = f.push(f.root, f.commit('dead hash in old journal'))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /cafebabe1/)
  })
})

describe('CLI: a tree without the internal journal (the public export)', () => {
  /** @type {ReturnType<typeof fixture>} */
  let f
  let base = ''
  const cleanups = []
  before(() => {
    f = fixture({ after: (fn) => cleanups.push(fn) })
    f.git('rm', '-q', '-r', 'tasks')
    base = f.commit('drop the internal journal')
  })
  after(() => cleanups.forEach((fn) => fn()))
  beforeEach(() => f.git('reset', '-q', '--hard', base))

  test('code with no entry fails, and the message points at changes/', () => {
    f.write('packages/a/index.js', 'export const a = 10\n')
    const r = f.push(base, f.commit('code only'))
    assert.equal(r.status, 1)
    assert.match(r.stderr, /changes\//)
    assert.doesNotMatch(r.stderr, /nhat-ky/)
  })

  test('code with an entry in changes/ passes', () => {
    f.write('packages/a/index.js', 'export const a = 12\n')
    f.write('changes/2026-10-26-pr-4.md', CHANGE)
    const r = f.push(base, f.commit('code + english entry'))
    assert.equal(r.status, 0, r.stderr)
  })
})
