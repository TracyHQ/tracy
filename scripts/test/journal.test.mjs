#!/usr/bin/env node
/**
 * `pnpm journal`: the one-file-per-change journal read back as one list, newest first.
 *
 *   node --test scripts/test/journal.test.mjs
 *
 * The clock is a parameter, so `--days` is tested against a fixed day rather than today.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isDay, parseArgs, renderJournal, selectEntries } from '../journal.mjs'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../journal.mjs')
const NOW = new Date('2026-09-25T23:30:00Z')

test('entries are ordered by the date in the name, then by name, both newest first; README is not one', () => {
  const { entries, skipped } = selectEntries(
    ['2026-09-24-b.md', 'README.md', '2026-09-25-a.md', '2026-09-25-c.md', '2026-08-30-z.md'],
    null
  )
  assert.deepEqual(
    entries.map((e) => e.name),
    ['2026-09-25-c.md', '2026-09-25-a.md', '2026-09-24-b.md', '2026-08-30-z.md']
  )
  assert.deepEqual(skipped, [])
})

test('a name without a real leading date is left out and reported, not guessed at', () => {
  const { entries, skipped } = selectEntries(
    ['notes.md', '2026-02-30-x.md', '2026-09-25-ok.md', '2026-09-25.md'],
    null
  )
  assert.deepEqual(
    entries.map((e) => e.name),
    ['2026-09-25-ok.md']
  )
  assert.deepEqual(skipped, ['notes.md', '2026-02-30-x.md', '2026-09-25.md'])
})

test('--since includes its own day', () => {
  const { entries } = selectEntries(['2026-09-24-a.md', '2026-09-25-b.md', '2026-09-23-c.md'], '2026-09-24')
  assert.deepEqual(
    entries.map((e) => e.name),
    ['2026-09-25-b.md', '2026-09-24-a.md']
  )
})

test('--days N is N UTC calendar days, today included', () => {
  assert.deepEqual(parseArgs(['--days', '1'], NOW), { since: '2026-09-25', dir: null })
  assert.deepEqual(parseArgs(['--days', '7'], NOW), { since: '2026-09-19', dir: null })
  assert.deepEqual(parseArgs(['--days', '30'], NOW), { since: '2026-08-27', dir: null })
  assert.deepEqual(parseArgs([], NOW), { since: null, dir: null })
  assert.deepEqual(parseArgs(['--since', '2026-09-01'], NOW), { since: '2026-09-01', dir: null })
})

test('wrong arguments are refused, not ignored', () => {
  assert.throws(() => parseArgs(['--since', '2026-9-1'], NOW), /--since/)
  assert.throws(() => parseArgs(['--since', '2026-02-30'], NOW), /--since/)
  assert.throws(() => parseArgs(['--since'], NOW), /needs a value/)
  assert.throws(() => parseArgs(['--days', '0'], NOW), /--days/)
  assert.throws(() => parseArgs(['--days', 'seven'], NOW), /--days/)
  assert.throws(() => parseArgs(['--days', '3', '--since', '2026-09-01'], NOW), /together/)
  assert.throws(() => parseArgs(['--verbose'], NOW), /unknown/)
  assert.equal(isDay('2026-09-25'), true)
  assert.equal(isDay('2026-13-01'), false)
})

/**
 * A throwaway journal directory.
 * @param {import('node:test').TestContext} t - removes it when the test ends.
 * @param {Record<string, string>} files - file name → content.
 */
function journalDir(t, files) {
  const base = process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir()
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'journal-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}

test('the printed journal keeps each entry’s content whole, newest first', (t) => {
  const dir = journalDir(t, {
    'README.md': '# rules\n',
    '2026-09-24-old.md': '- **Old** — a\n  **Chạm ai:** x\n',
    '2026-09-25-new.md': '- **New** — b\n  **Chạm ai:** y\n\n',
    '2026-09-23-bare.md': '\n- **Bare** — c'
  })
  // Leading and trailing blank lines stay; only a missing final newline is added.
  assert.equal(
    renderJournal(dir, null).text,
    '- **New** — b\n  **Chạm ai:** y\n\n\n- **Old** — a\n  **Chạm ai:** x\n\n\n- **Bare** — c\n'
  )
  assert.equal(renderJournal(dir, '2026-09-26').text, '')
})

test('the CLI prints, filters, reports an empty result and refuses bad input', (t) => {
  const dir = journalDir(t, {
    '2026-09-24-old.md': '- **Old**\n',
    '2026-09-25-new.md': '- **New**\n',
    'stray.md': 'x\n'
  })
  const all = spawnSync(process.execPath, [SCRIPT, '--dir', dir], { encoding: 'utf8' })
  assert.equal(all.status, 0, all.stderr)
  assert.equal(all.stdout, '- **New**\n\n- **Old**\n')
  assert.match(all.stderr, /stray\.md/)

  const since = spawnSync(process.execPath, [SCRIPT, '--dir', dir, '--since', '2026-09-25'], {
    encoding: 'utf8'
  })
  assert.equal(since.stdout, '- **New**\n')

  const none = spawnSync(process.execPath, [SCRIPT, '--dir', dir, '--since', '2027-01-01'], {
    encoding: 'utf8'
  })
  assert.equal(none.status, 0)
  assert.equal(none.stdout, '')
  assert.match(none.stderr, /no entries since 2027-01-01/)

  const bad = spawnSync(process.execPath, [SCRIPT, '--days', '-1'], { encoding: 'utf8' })
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /usage/)
})

/**
 * A throwaway repository root with a copy of the script and the given journal folders.
 * @param {import('node:test').TestContext} t - removes it when the test ends.
 * @param {Record<string, Record<string, string>>} dirs - folder (relative to the root) → file name → content.
 */
function treeWith(t, dirs) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'journal-tree-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'scripts'))
  copyFileSync(SCRIPT, join(root, 'scripts', 'journal.mjs'))
  for (const [dir, files] of Object.entries(dirs)) {
    mkdirSync(join(root, dir), { recursive: true })
    for (const [name, text] of Object.entries(files)) writeFileSync(join(root, dir, name), text)
  }
  const run = (...args) =>
    spawnSync(process.execPath, [join(root, 'scripts', 'journal.mjs'), ...args], { encoding: 'utf8' })
  return { root, run }
}

test('entries from several folders merge into one list, newest first', (t) => {
  const changes = journalDir(t, { 'README.md': '# rules\n', '2026-10-26-b.md': '- **B**\n' })
  const legacy = journalDir(t, { '2026-10-27-a.md': '- **A**\n', '2026-10-25-c.md': '- **C**\n' })
  assert.equal(renderJournal([changes, legacy], null).text, '- **A**\n\n- **B**\n\n- **C**\n')
})

test('by default the CLI reads changes/ and, while it exists, tasks/nhat-ky', (t) => {
  const both = treeWith(t, {
    changes: { 'README.md': '# rules\n', '2026-10-26-english.md': '- **English**\n' },
    'tasks/nhat-ky': { 'README.md': '# rules\n', '2026-10-25-old.md': '- **Old**\n' }
  })
  const run = both.run()
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout, '- **English**\n\n- **Old**\n')

  const publicTree = treeWith(t, { changes: { '2026-10-26-english.md': '- **English**\n' } })
  const only = publicTree.run()
  assert.equal(only.status, 0, only.stderr)
  assert.equal(only.stdout, '- **English**\n')
})

test('a tree with no journal folder at all prints one notice and succeeds', (t) => {
  const run = treeWith(t, {}).run('--days', '30')
  assert.equal(run.status, 0, run.stderr)
  assert.equal(run.stdout, '')
  assert.match(run.stderr, /^journal: no changes\/ in this tree; nothing to read\n$/)
})
