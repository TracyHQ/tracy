/**
 * The two-file tar handed to a machine Tracy does not own. The thing that can be wrong quietly is
 * the entry name: it becomes a path on that machine's disk when the archive is unpacked.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { tarOf } from '../src/lib/tar.js'

test('the system’s own tar reads it, with both files intact', () => {
  const web = Buffer.from('a webroot, pretend')
  const db = Buffer.from('a dump, pretend, longer than the other one')
  const dir = mkdtempSync(join(tmpdir(), 'tracy-tar-'))
  writeFileSync(
    join(dir, 'bundle.tar'),
    tarOf([
      { name: 'webroot.tar.gz', bytes: web },
      { name: 'database.sql.gz', bytes: db }
    ])
  )
  // Read back by tar itself rather than by this file's own idea of the format — the far side is
  // GNU tar on CentOS, not this code.
  execFileSync('tar', ['-xf', 'bundle.tar'], { cwd: dir })
  assert.deepEqual(readFileSync(join(dir, 'webroot.tar.gz')), web)
  assert.deepEqual(readFileSync(join(dir, 'database.sql.gz')), db)
})

test('an entry name that is a path, or anything but a plain name, is refused', () => {
  for (const name of [
    '../escape',
    'dir/file',
    '/absolute',
    '-leading-dash',
    '',
    'ok'.repeat(80),
    'space name'
  ])
    assert.throws(
      () => tarOf([{ name, bytes: Buffer.from('x') }]),
      /refusing an entry called/,
      `refused ${JSON.stringify(name)}`
    )
})

test('the same files tar to the same bytes, so two packages can be compared', () => {
  const files = [
    { name: 'webroot.tar.gz', bytes: Buffer.from('one') },
    { name: 'database.sql.gz', bytes: Buffer.from('two') }
  ]
  assert.deepEqual(tarOf(files), tarOf(files), 'no clock in the header')
})

test('a file whose length is an exact block still ends on a block boundary', () => {
  const exact = tarOf([{ name: 'webroot.tar.gz', bytes: Buffer.alloc(512, 7) }])
  // header + one full block + the two end blocks, and not a byte of stray padding.
  assert.equal(exact.length % 512, 0)
  assert.equal(exact.length, 512 * 4)
})
