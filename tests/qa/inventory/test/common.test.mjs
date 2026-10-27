// Guards of the shared reader: refuse what must not be read, report what cannot be known.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import {
  SourceError,
  formatJson,
  listFiles,
  readSource,
  revisionOf,
  runExtractor,
  safePath,
  sha256
} from '../extractors/common.mjs'
import { cleanup, git, gitInit, makeRoot, put } from './helpers.mjs'
import { inputsStable, writeAtomic } from '../build.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

after(cleanup)

describe('readSource refuses unsafe inputs before reading', () => {
  test('a path that escapes the root or is absolute', () => {
    const root = makeRoot({ 'a.txt': 'x' })
    assert.throws(() => readSource(root, '../etc/passwd'), SourceError)
    assert.throws(() => readSource(root, '/etc/passwd'), SourceError)
    assert.throws(() => safePath(root, ''), SourceError)
    assert.throws(() => safePath(root, 'a/../../b'), SourceError)
  })
  test('a symlink to a file, a symlinked directory, a directory and a FIFO', () => {
    const outside = makeRoot({ 'secret.txt': 'secret' })
    const root = makeRoot({ 'real.txt': 'ok', 'dir/inner.txt': 'x' })
    symlinkSync(join(outside, 'secret.txt'), join(root, 'link.txt'))
    symlinkSync(outside, join(root, 'linked-dir'))
    assert.throws(() => readSource(root, 'link.txt'), SourceError)
    assert.throws(() => readSource(root, 'linked-dir/secret.txt'), SourceError)
    assert.throws(() => readSource(root, 'dir'), SourceError)
    execFileSync('mkfifo', [join(root, 'pipe')])
    assert.throws(() => readSource(root, 'pipe'), /not a regular file/)
    assert.equal(readSource(root, 'real.txt').text, 'ok')
  })
  test('the hash is the sha256 of the bytes read', () => {
    const root = makeRoot({ 'a.txt': 'hello\n' })
    assert.equal(readSource(root, 'a.txt').hash, sha256('hello\n'))
  })
  test('listFiles skips symlinks and reports them instead of following', () => {
    const root = makeRoot({ 'd/one.js': '1' })
    symlinkSync(join(root, 'd/one.js'), join(root, 'd/two.js'))
    const { files, skipped } = listFiles(root, 'd')
    assert.deepEqual(files, ['d/one.js'])
    assert.deepEqual(skipped, ['d/two.js'])
  })
})

describe('revisions come from git or are null, never guessed', () => {
  test('commit hash, +dirty after a change, null outside git', () => {
    const root = makeRoot({ 'a.txt': 'one', 'b.txt': 'two' })
    const head = gitInit(root)
    assert.equal(revisionOf(root, ['a.txt']), head)
    writeFileSync(join(root, 'a.txt'), 'changed')
    assert.equal(revisionOf(root, ['a.txt']), `${head}+dirty`)
    assert.equal(revisionOf(root, ['b.txt']), head, 'an untouched path keeps the commit hash')
    assert.equal(revisionOf(makeRoot({ 'a.txt': 'x' }), ['a.txt']), null)
  })
  test('the revision is the last commit that touched the path, not HEAD', () => {
    const root = makeRoot({ 'a.txt': 'one', 'b.txt': 'two' })
    const first = gitInit(root)
    put(root, 'b.txt', 'two changed')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'b only')
    assert.equal(revisionOf(root, ['a.txt']), first)
    assert.notEqual(revisionOf(root, ['b.txt']), first)
  })
  test('a git that cannot start gives null, not a crash', () => {
    const root = makeRoot({ 'a.txt': 'x' })
    const saved = process.env.PATH
    process.env.PATH = join(root, 'no-such-bin')
    try {
      assert.equal(revisionOf(root, ['a.txt']), null)
    } finally {
      process.env.PATH = saved
    }
  })
})

describe('runExtractor never reports a failure as a complete source', () => {
  const base = { sourcePath: 'x', extractionKind: 'k' }
  const rec = (items, unresolved = []) => ({
    sourcePath: 'x',
    sourceHash: 'h',
    revision: null,
    extractionKind: 'k',
    inputs: [],
    items,
    unresolved
  })
  test('a throw', () => {
    const r = runExtractor(
      {
        ...base,
        extract: () => {
          throw new Error('boom')
        }
      },
      '/nonexistent'
    )
    assert.equal(r.status, 'incomplete')
    assert.match(r.incompleteReason, /extractor failed: boom/)
    assert.deepEqual(r.items, [])
  })
  test('zero items', () => {
    assert.match(runExtractor({ ...base, extract: () => rec([]) }, '/x').incompleteReason, /zero items/)
  })
  test('blocking unresolved structure', () => {
    const r = runExtractor(
      { ...base, extract: () => rec([{ id: 'a' }], [{ kind: 'k', blocksComplete: true }]) },
      '/x'
    )
    assert.equal(r.status, 'incomplete')
  })
  test('items present and nothing blocking is complete, with non-blocking unresolved kept', () => {
    const r = runExtractor({ ...base, extract: () => rec([{ id: 'a' }], [{ kind: 'note' }]) }, '/x')
    assert.equal(r.status, 'complete')
    assert.equal(r.unresolved.length, 1)
  })
})

describe('input stability and atomic output', () => {
  test('inputsStable detects a source that changed after it was read', () => {
    const root = makeRoot({ 'a.txt': 'one' })
    const recs = { x: { inputs: [{ path: 'a.txt', hash: sha256('one') }] } }
    assert.equal(inputsStable(root, recs), true)
    put(root, 'a.txt', 'two')
    assert.equal(inputsStable(root, recs), false)
    assert.equal(inputsStable(root, { x: { inputs: [{ path: 'gone.txt', hash: 'x' }] } }), false)
  })
  test('writeAtomic replaces the file and leaves no temp file', () => {
    const root = makeRoot({})
    const target = join(root, 'out/inventory.json')
    writeAtomic(target, 'one\n')
    writeAtomic(target, 'two\n')
    assert.equal(readTextSync(target), 'two\n')
    assert.deepEqual(readdirSync(join(root, 'out')), ['inventory.json'])
  })
  test('a failed write keeps the old content and removes its own temp file', () => {
    const root = makeRoot({ 'out/keep.txt': 'x' })
    const target = join(root, 'out/dir-target')
    mkdirSync(target) // renaming a file over a directory fails
    assert.throws(() => writeAtomic(target, 'new'))
    assert.deepEqual(readdirSync(join(root, 'out')).sort(), ['dir-target', 'keep.txt'])
    assert.ok(existsSync(target))
  })
})

describe('formatJson matches the repository formatter layout', () => {
  test('objects expanded, short primitive arrays inline, long ones and arrays of objects one per line', () => {
    const long = Array.from({ length: 30 }, (_, i) => `item-number-${i}`)
    const text = formatJson({
      a: [1, 'b', null],
      empty: [],
      none: {},
      gone: undefined,
      list: [{ x: 1 }],
      long,
      nested: { k: true }
    })
    assert.equal(text.endsWith('}\n'), true)
    const lines = text.split('\n')
    assert.ok(lines.includes('  "a": [1, "b", null],'))
    assert.ok(lines.includes('  "empty": [],') && lines.includes('  "none": {},'))
    assert.ok(!text.includes('gone'))
    assert.ok(lines.includes('  "list": [') && lines.includes('    {') && lines.includes('      "x": 1'))
    assert.ok(
      lines.includes('  "long": [') && lines.includes('    "item-number-0",'),
      'an array wider than 110 columns breaks'
    )
    assert.ok(lines.every((l) => l.length <= 110 || /^\s*"[^"]*"[,]?$/.test(l)))
    assert.deepEqual(JSON.parse(text).long, long)
  })
  test('the output always round-trips', () => {
    const v = { s: 'tab\t "quote" \u00e9', n: [1.5, -2, 0], deep: { a: { b: [[1], []] } } }
    assert.deepEqual(JSON.parse(formatJson(v)), v)
  })
})
