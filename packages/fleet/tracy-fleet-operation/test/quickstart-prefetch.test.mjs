/**
 * `quickstart.py --prefetch` and how a download meets GitHub's rate limit.
 *
 * A live demo's update fetches the new release BEFORE the old copy comes down (25/10/2026: JA Boxing
 * 1.0.4's download got 403 after its old copy was gone, and the demo stood blank for 12 minutes).
 * The prefetch fills the host's cache, so the provision after the teardown reads verified files
 * and asks GitHub nothing. A rate-limited 403 says until when; a short wait is waited out.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/quickstart-prefetch.test.mjs
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const run = promisify(execFile)

const pinOf = (bytes) => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })

/** Serve `answer(req, n)` on a local port; `n` counts the requests so far. */
async function serve(answer) {
  let n = 0
  const server = createServer((req, res) => answer(req, res, ++n))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: (name) => `http://127.0.0.1:${server.address().port}/${name}`,
    count: () => n,
    close: () => new Promise((resolve) => server.close(resolve))
  }
}

/** Run quickstart.py against a one-entry catalogue. */
async function quickstart(root, entry, args, extraEnv = {}) {
  const catalog = join(root, 'quickstarts.json')
  writeFileSync(catalog, JSON.stringify({ 'quick/test/j6': { platform: 'joomla', ...entry } }))
  try {
    const out = await run('python3', [`${PROVISION}quickstart.py`, '--id', 'quick/test/j6', ...args], {
      env: {
        ...process.env,
        TRACY_QUICKSTARTS_JSON: catalog,
        TRACY_RELEASES_GITHUB_TOKEN: '',
        TRACY_QUICKSTART_CACHE_DIR: join(root, 'cache'),
        ...extraEnv
      }
    })
    return { ok: true, stdout: out.stdout }
  } catch (error) {
    return { ok: false, stderr: String(error.stderr ?? error) }
  }
}

test('a prefetch keeps every pinned part in the cache, so the provision after it asks the network nothing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'quickstart-prefetch-'))
  const db = Buffer.from('-- a database dump\n'.repeat(32))
  const cowork = Buffer.from('a plugin package')
  const server = await serve((req, res) => res.end(req.url.endsWith('db.sql.gz') ? db : cowork))
  const entry = {
    database: { file: 'db.sql.gz', url: server.url('db.sql.gz'), ...pinOf(db) },
    cowork: { file: 'pkg.zip', url: server.url('pkg.zip'), ...pinOf(cowork) },
    // Not pinned yet: skipped, as a provision that needed it would refuse it before any network.
    state: { file: 's.tar.gz', url: server.url('s.tar.gz'), sha256: null, bytes: null }
  }
  const fetched = await quickstart(root, entry, ['--prefetch'])
  assert.ok(fetched.ok, fetched.stderr)
  assert.match(fetched.stdout, /skipping state/)
  assert.match(fetched.stdout, /fetched and verified 2 part\(s\)/)
  assert.equal(server.count(), 2)
  assert.ok(existsSync(join(root, 'cache', pinOf(db).sha256)))
  await server.close()
  // The server is gone: the provision's own fetch reads the cache.
  const after = await quickstart(root, entry, ['--part', 'database', '--out', join(root, 'db.out')])
  assert.ok(after.ok, after.stderr)
})

test('a prefetch whose bytes do not match the release fails, and keeps nothing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'quickstart-prefetch-'))
  const db = Buffer.from('the real dump')
  const server = await serve((_, res) => res.end(Buffer.from('a proxy error page!')))
  const entry = { database: { file: 'db.sql.gz', url: server.url('db.sql.gz'), ...pinOf(db) } }
  const got = await quickstart(root, entry, ['--prefetch'])
  await server.close()
  assert.equal(got.ok, false)
  assert.match(got.stderr, /checksum mismatch|size exceeds/)
  assert.equal(existsSync(join(root, 'cache', pinOf(db).sha256)), false)
})

test('a 403 from a spent quota names the rate limit and when it lifts, instead of the credential', async () => {
  const root = mkdtempSync(join(tmpdir(), 'quickstart-prefetch-'))
  const db = Buffer.from('dump')
  const reset = Math.floor(Date.now() / 1000) + 3600
  const server = await serve((_, res) => {
    res.writeHead(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) })
    res.end('{"message":"API rate limit exceeded"}')
  })
  const entry = { database: { file: 'db.sql.gz', url: server.url('db.sql.gz'), ...pinOf(db) } }
  const got = await quickstart(root, entry, ['--prefetch'])
  await server.close()
  assert.equal(got.ok, false)
  const until = new Date(reset * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  assert.match(got.stderr, new RegExp(`rate limit for the release credential is spent until ${until}`))
  assert.equal(server.count(), 1, 'an hour away is not waited for: one ask, then the reason')
})

test('a short Retry-After is waited out and asked again', async () => {
  const root = mkdtempSync(join(tmpdir(), 'quickstart-prefetch-'))
  const db = Buffer.from('dump that arrives on the second ask')
  const server = await serve((_, res, n) => {
    if (n === 1) {
      res.writeHead(403, { 'retry-after': '0' })
      res.end('{"message":"You have exceeded a secondary rate limit"}')
      return
    }
    res.end(db)
  })
  const entry = { database: { file: 'db.sql.gz', url: server.url('db.sql.gz'), ...pinOf(db) } }
  const got = await quickstart(root, entry, ['--part', 'database', '--out', join(root, 'db.out')])
  await server.close()
  assert.ok(got.ok, got.stderr)
  assert.equal(server.count(), 2)
})

test('a 403 that is not a rate limit is still the credential problem it was', async () => {
  const root = mkdtempSync(join(tmpdir(), 'quickstart-prefetch-'))
  const db = Buffer.from('dump')
  const server = await serve((_, res) => {
    res.writeHead(403, { 'x-ratelimit-remaining': '4000' })
    res.end('{"message":"Resource not accessible by integration"}')
  })
  const entry = { database: { file: 'db.sql.gz', url: server.url('db.sql.gz'), ...pinOf(db) } }
  const got = await quickstart(root, entry, ['--part', 'database', '--out', join(root, 'db.out')])
  await server.close()
  assert.equal(got.ok, false)
  assert.match(got.stderr, /HTTP 403\); verify the release credential/)
  assert.equal(server.count(), 1)
})
