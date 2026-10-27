import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { catalogIds } from '../src/host/library-ids.mjs'

test('the cached library wins; the image catalog is the road back; nothing is an empty set', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-site-build-ids-'))
  try {
    const image = path.join(root, 'design-catalog.json')
    writeFileSync(image, JSON.stringify({ systems: [{ id: 'old' }] }))
    assert.deepEqual([...catalogIds({ catalog: image }, { home: root })], ['old'])

    const cache = path.join(root, 'design-library')
    mkdirSync(path.join(cache, 'abc1234', 'data'), { recursive: true })
    writeFileSync(path.join(cache, 'current'), 'abc1234\n')
    writeFileSync(
      path.join(cache, 'abc1234', 'data', 'catalog.json'),
      JSON.stringify({ systems: [{ id: 'airbnb' }, { id: 'zen' }, { id: 7 }] })
    )
    assert.deepEqual([...catalogIds({ catalog: image }, { home: root })], ['airbnb', 'zen'])
    assert.deepEqual([...catalogIds({ catalog: image, libraryCache: cache })], ['airbnb', 'zen'])

    // A `current` that names a commit with no catalog on disk falls back to the image.
    writeFileSync(path.join(cache, 'current'), 'def5678\n')
    assert.deepEqual([...catalogIds({ catalog: image }, { home: root })], ['old'])
    assert.deepEqual([...catalogIds({ catalog: path.join(root, 'none.json') }, { home: root })], [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
