/**
 * `quickstart.py` keeps a release file it fetched, by sha256, under TRACY_QUICKSTART_CACHE_DIR, and the next site
 * built from it reads it from disk: on a slow link a JA quickstart's webroot stood 30-50 minutes at "fetching webroot"
 * for every site (14/10/2026). A kept file is read back only while its size and sha256 still match the catalogue.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/quickstart-cache.test.mjs
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const run = promisify(execFile)

/** Fetch the database part of a one-entry catalogue from `url`, the cache in `cache`. */
async function fetchPart(root, url, pin, cache) {
  const catalog = join(root, 'quickstarts.json')
  writeFileSync(
    catalog,
    JSON.stringify({ 'quick/test/j6': { platform: 'joomla', database: { file: 'db.sql.gz', url, ...pin } } })
  )
  const out = join(root, `out-${Date.now()}.sql.gz`)
  try {
    await run(
      'python3',
      [`${PROVISION}quickstart.py`, '--id', 'quick/test/j6', '--part', 'database', '--out', out],
      {
        env: {
          ...process.env,
          TRACY_QUICKSTARTS_JSON: catalog,
          TRACY_RELEASES_GITHUB_TOKEN: '',
          TRACY_QUICKSTART_CACHE_DIR: cache
        }
      }
    )
    return { ok: true, out }
  } catch (error) {
    return { ok: false, stderr: String(error.stderr ?? error) }
  }
}

test('a release file is fetched once, kept by its sha256, and read from the cache by the next site', async () => {
  const root = mkdtempSync(join(tmpdir(), 'quickstart-cache-'))
  const cache = join(root, 'cache')
  const bytes = Buffer.from('-- a database dump\n'.repeat(64))
  const pin = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  let served = 0
  const server = createServer((_, res) => {
    served += 1
    res.end(bytes)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/db.sql.gz`
  const first = await fetchPart(root, url, pin, cache)
  assert.ok(first.ok, first.stderr)
  assert.equal(served, 1)
  assert.ok(existsSync(join(cache, pin.sha256)))
  await new Promise((resolve) => server.close(resolve))
  // the server is gone: the second site reads the kept file
  const second = await fetchPart(root, url, pin, cache)
  assert.ok(second.ok, second.stderr)
  assert.deepEqual(readFileSync(second.out), bytes)
  // a kept file that no longer matches its sha256 is never used
  writeFileSync(join(cache, pin.sha256), Buffer.alloc(bytes.length, 0x41))
  const third = await fetchPart(root, url, pin, cache)
  assert.equal(third.ok, false, 'a corrupt cache entry was read')
})
