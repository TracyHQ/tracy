import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  judgedText,
  newCommits,
  stripGitComments,
  foreignLine,
  violations
} from '../check-english-commits.mjs'

const SCRIPT = new URL('../check-english-commits.mjs', import.meta.url).pathname

test('plain English passes, any letter outside a-z is found with its line', () => {
  assert.equal(foreignLine('fix(web): keep the cart on reload\n\nBody.'), null)
  assert.equal(foreignLine('fix(web): giữ giỏ hàng'), 'fix(web): giữ giỏ hàng')
  assert.equal(foreignLine('ok\nđổi tên file'), 'đổi tên file')
  assert.equal(foreignLine('fix: rename the café page'), 'fix: rename the café page')
  assert.equal(foreignLine('fix: 修复 login'), 'fix: 修复 login')
  assert.equal(foreignLine('fix(web): keep the cart — 100% ✓ → done'), null)
})

test('backticks and code fences do not exempt non-English prose', () => {
  const text = 'fix(i18n): rename the `Tiếng Việt` label\n\n```\nxin chào bạn\n```'
  assert.notEqual(foreignLine(judgedText(text)), null)
})

test('HTML comments are checked in the PR description too', () => {
  const hint = '<!-- Hành vi hiện tại. -->'
  assert.notEqual(foreignLine(judgedText(hint, { htmlComments: true })), null)
  assert.notEqual(foreignLine(judgedText(hint)), null)
})

test('normalization catches decomposed letters and common ASCII non-English phrases', () => {
  assert.notEqual(foreignLine('fix: su\u031b\u0309a lo\u0302\u0303i'), null)
  assert.notEqual(foreignLine('fix: sua\x20dang\x20nhap'), null)
  assert.notEqual(foreignLine('docs: hola\x20mundo'), null)
})

test('git comment lines and the scissors block never count', () => {
  const buffer =
    'feat(x): add y\n# Hãy nhập message\n# ------------------------ >8 ------------------------\ndiff có dấu'
  assert.equal(foreignLine(judgedText(stripGitComments(buffer))), null)
})

test('violations names the title, the description and each bad commit', () => {
  const found = violations({
    title: 'sửa lỗi',
    body: 'All good.',
    commits: [
      { sha: 'a'.repeat(40), message: 'fix: fine' },
      { sha: 'b'.repeat(40), message: 'fix: không ổn' }
    ]
  })
  assert.equal(found.length, 2)
  assert.match(found[0], /PR title/)
  assert.match(found[1], /commit bbbbbbbbbb/)
})

test('the commit-msg entry point exits 1 on Vietnamese and 0 on English', () => {
  const dir = mkdtempSync(join(tmpdir(), 'english-commits-'))
  const run = (text) => {
    const file = join(dir, 'COMMIT_EDITMSG')
    writeFileSync(file, text)
    return spawnSync('node', [SCRIPT, '--msg-file', file], { encoding: 'utf8' }).status
  }
  assert.equal(run('chore(repo): tidy up\n'), 0)
  assert.equal(run('chore(repo): dọn dẹp\n'), 1)
})

test('only commits a pull request adds are read, not the history behind its base', () => {
  const dir = mkdtempSync(join(tmpdir(), 'english-commits-range-'))
  const git = (...args) =>
    execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      encoding: 'utf8'
    }).trim()
  git('init', '-q', '-b', 'develop')
  git('commit', '-q', '--allow-empty', '-m', 'chore: cũ có dấu')
  const base = git('rev-parse', 'HEAD')
  git('commit', '-q', '--allow-empty', '-m', 'fix: new work')
  git('commit', '-q', '--allow-empty', '-m', 'fix: việc mới')
  const head = git('rev-parse', 'HEAD')
  const cwd = process.cwd()
  process.chdir(dir)
  try {
    const commits = newCommits(base, head)
    assert.equal(commits.length, 2)
    const found = violations({ title: 't', body: '', commits })
    assert.equal(found.length, 1)
    assert.match(found[0], /việc mới/)
  } finally {
    process.chdir(cwd)
  }
})
