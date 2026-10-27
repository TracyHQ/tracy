/**
 * Which site folder a plugin's HTTP door reads and writes, in a dsh that serves every site of a
 * host (ADR 0014). The door has no session, so no session cwd; the gate stamps the caller's
 * folders on the request (`x-dsh-allowed-folders`, `vendor/tracy/dsh-passwords`), and this is the
 * one rule both `tracy-brand-engine` and `tracy-design-inspiration` apply to it — the filesystem
 * is the contract between those two, so they must not each decide differently.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { ALLOWED_FOLDERS_HEADER, siteDirFor } from '../src/site-dir/index.mjs'

const req = (header) => ({ headers: header === undefined ? {} : { [ALLOWED_FOLDERS_HEADER]: header } })

test('the header is the one the gate stamps', async () => {
  // The gate (`vendor/tracy/dsh-passwords`) names it once; a door reading another name sees no folder.
  const gate = await import('../../../../vendor/tracy/dsh-passwords/src/tracy/seat-context.ts')
  assert.equal(ALLOWED_FOLDERS_HEADER, gate.ALLOWED_FOLDERS_HEADER)
})

test('an explicit config.siteDir wins over everything — a dev profile can still pin one', () => {
  assert.equal(siteDirFor({ siteDir: '/pinned' }, req(JSON.stringify(['/site/a']))), '/pinned')
})

test("a seat holder's first folder is the site folder", () => {
  assert.equal(
    siteDirFor({}, req(JSON.stringify(['/site/tracy-site-ff8257f0']))),
    '/site/tracy-site-ff8257f0'
  )
  assert.equal(siteDirFor({}, req(JSON.stringify(['/site/a', '/site/b']))), '/site/a')
})

test('no header (an admin, or a request that did not come through the gate) falls back to where dsh stands', () => {
  assert.equal(siteDirFor({}, req(undefined)), path.resolve('.'))
  assert.equal(siteDirFor({}, {}), path.resolve('.'))
})

test('an empty list (a seat with no folder) is not a folder: same fallback', () => {
  assert.equal(siteDirFor({}, req('[]')), path.resolve('.'))
})

test('a header that is not a JSON array of absolute paths is ignored, never obeyed', () => {
  assert.equal(siteDirFor({}, req('not json')), path.resolve('.'))
  assert.equal(siteDirFor({}, req(JSON.stringify('/site/a'))), path.resolve('.'))
  assert.equal(siteDirFor({}, req(JSON.stringify(['relative/one']))), path.resolve('.'))
  assert.equal(siteDirFor({}, req(JSON.stringify([42]))), path.resolve('.'))
})

test('a repeated header (an array of values) reads its first value', () => {
  assert.equal(
    siteDirFor({}, req([JSON.stringify(['/site/first']), JSON.stringify(['/site/second'])])),
    '/site/first'
  )
})
