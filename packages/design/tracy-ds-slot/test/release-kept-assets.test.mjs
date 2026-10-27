import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { KEPT_ASSETS, keepAssets } from '../src/release-kept-assets.mjs'

test('a new version keeps the site pages file the release serves, for the Customize check', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'kept-assets-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.ok(KEPT_ASSETS.includes('tracy_site_pages.json'))
  const kept = keepAssets((file, to) => writeFileSync(join(to, file), '{"pages":[]}\n'), dir)
  assert.deepEqual(kept, ['tracy_site_pages.json'])
  assert.ok(existsSync(join(dir, 'tracy_site_pages.json')))
})

test('a release without the file builds as before: nothing kept, nothing thrown', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'kept-assets-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const kept = keepAssets(() => {
    throw new Error('no asset')
  }, dir)
  assert.deepEqual(kept, [])
})

test('a stale file left in a reused folder is removed when the fetch throws, and not listed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'kept-assets-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'tracy_site_pages.json'), '{"pages":["old"]}\n')
  const kept = keepAssets(() => {
    throw new Error('download failed')
  }, dir)
  assert.deepEqual(kept, [])
  assert.equal(existsSync(join(dir, 'tracy_site_pages.json')), false)
})
