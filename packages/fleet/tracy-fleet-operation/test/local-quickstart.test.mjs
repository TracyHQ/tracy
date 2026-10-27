/**
 * A `file:` quickstart address — how a dev stand installs a pack nobody has published yet
 * (`apps/tracy-web/src/lib/local-releases.js`) — is read from under TRACY_LOCAL_RELEASES_DIR and
 * from nowhere else.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/local-quickstart.test.mjs
 *
 * `quickstart.py` is RUN, as in the other quickstart tests: its refusals are the ones a host prints.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))

/** A stand: a releases directory holding one pack, and a file OUTSIDE it with the same bytes. */
function stand() {
  const root = mkdtempSync(join(tmpdir(), 'local-quickstart-'))
  const dir = join(root, 'local-releases')
  mkdirSync(join(dir, 'tracy-business', 'j6'), { recursive: true })
  const bytes = Buffer.from('-- a database dump\n')
  const inside = join(dir, 'tracy-business', 'j6', 'db.sql.gz')
  const outside = join(root, 'db.sql.gz')
  writeFileSync(inside, bytes)
  writeFileSync(outside, bytes)
  const pin = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  return { root, dir, inside, outside, pin }
}

/** Download `url` as the database part of a one-entry catalog, with `env` on top. */
function fetchPart(s, url, env = {}) {
  const catalog = join(s.root, 'quickstarts.json')
  writeFileSync(
    catalog,
    JSON.stringify({
      'local/tracy-business/j6': { platform: 'joomla', database: { file: 'db.sql.gz', url, ...s.pin } }
    })
  )
  const out = join(s.root, 'out.sql.gz')
  const run = spawnSync(
    'python3',
    [`${PROVISION}quickstart.py`, '--id', 'local/tracy-business/j6', '--part', 'database', '--out', out],
    {
      encoding: 'utf8',
      env: { ...process.env, TRACY_QUICKSTARTS_JSON: catalog, TRACY_RELEASES_GITHUB_TOKEN: '', ...env }
    }
  )
  return { ...run, out }
}

test('a file inside TRACY_LOCAL_RELEASES_DIR is read, and held to its pinned size and sha256', () => {
  const s = stand()
  const ok = fetchPart(s, pathToFileURL(s.inside).href, { TRACY_LOCAL_RELEASES_DIR: s.dir })
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(readFileSync(ok.out, 'utf8'), '-- a database dump\n')

  writeFileSync(s.inside, '-- another dump!!!\n')
  const changed = fetchPart(s, pathToFileURL(s.inside).href, { TRACY_LOCAL_RELEASES_DIR: s.dir })
  assert.notEqual(changed.status, 0)
  assert.match(changed.stderr, /checksum mismatch/)
})

test('a file outside TRACY_LOCAL_RELEASES_DIR is refused, even with the right bytes', () => {
  const s = stand()
  const out = fetchPart(s, pathToFileURL(s.outside).href, { TRACY_LOCAL_RELEASES_DIR: s.dir })
  assert.notEqual(out.status, 0)
  assert.match(out.stderr, /outside TRACY_LOCAL_RELEASES_DIR/)

  // `..` spelled into the address resolves to the same place, and is refused the same way.
  const climbed = fetchPart(s, `file://${s.dir}/tracy-business/../../db.sql.gz`, {
    TRACY_LOCAL_RELEASES_DIR: s.dir
  })
  assert.notEqual(climbed.status, 0)
  assert.match(climbed.stderr, /outside TRACY_LOCAL_RELEASES_DIR/)
})

test('a link inside the directory pointing outside it is refused', () => {
  const s = stand()
  const link = join(s.dir, 'tracy-business', 'j6', 'linked.sql.gz')
  symlinkSync(s.outside, link)
  const out = fetchPart(s, pathToFileURL(link).href, { TRACY_LOCAL_RELEASES_DIR: s.dir })
  assert.notEqual(out.status, 0)
  assert.match(out.stderr, /outside TRACY_LOCAL_RELEASES_DIR/)
})

test('a host with no TRACY_LOCAL_RELEASES_DIR reads no file: address at all', () => {
  const s = stand()
  const out = fetchPart(s, pathToFileURL(s.inside).href, { TRACY_LOCAL_RELEASES_DIR: '' })
  assert.notEqual(out.status, 0)
  assert.match(out.stderr, /names none/)
})
