import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gitIgnoredFiles } from '../lib/git-ignored.mjs'

test('a tracked symlink mirror cannot prevent Git from ignoring local caches; its source is still checked', () => {
  const root = mkdtempSync(join(tmpdir(), 'wo-doc-ignore-'))
  try {
    execFileSync('git', ['init', '--quiet', root])
    mkdirSync(join(root, 'source'))
    mkdirSync(join(root, 'cache'))
    writeFileSync(join(root, '.gitignore'), 'cache/\n')
    writeFileSync(join(root, 'source', 'valid.md'), '[source](../source/valid.md)')
    writeFileSync(join(root, 'cache', 'local.md'), '[local](missing-local-file)')
    symlinkSync('source', join(root, 'mirror'))
    execFileSync('git', ['add', '.gitignore', 'source', 'mirror'], { cwd: root })
    const files = ['mirror/valid.md', 'source/valid.md', 'cache/local.md'].map((file) => join(root, file))
    const ignored = gitIgnoredFiles(root, files)
    assert.deepEqual([...ignored], [join(root, 'cache/local.md')])
    assert.equal(
      ignored.has(join(root, 'mirror/valid.md')),
      false,
      'a non-ignored mirrored document still reaches link validation'
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
