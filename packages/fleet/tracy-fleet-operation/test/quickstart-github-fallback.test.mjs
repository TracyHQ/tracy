/**
 * A pinned part whose address is a github.com release download (`/<owner>/<repo>/releases/download/<tag>/<file>`)
 * and that carries no `githubAssetId` is fetched from that address. On 08/11/2026 that route answered HTTP 504 for
 * every file of one Claude Cowork release for more than ten minutes, while the API asset route served the same bytes
 * in under a second, so a demo update stopped at prefetch twice. A 5xx from the download route is now retried once
 * through the API (release by tag, asset by name, asset by id); a 4xx is still an answer, not an outage.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/quickstart-github-fallback.test.mjs
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const run = promisify(execFile)
const bytes = Buffer.from('-- a database dump\n'.repeat(64))
const pin = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }

/** One local server playing both github.com (the download route answers `downloadStatus`) and api.github.com. */
async function fakeGithub(downloadStatus) {
  const seen = []
  const server = createServer((req, res) => {
    seen.push(req.url)
    if (req.url === '/example-owner/example-repo/releases/download/v1.2.3/db.sql.gz') {
      res.statusCode = downloadStatus
      res.end(downloadStatus === 200 ? bytes : 'gateway timeout')
    } else if (req.url === '/repos/example-owner/example-repo/releases/tags/v1.2.3') {
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          assets: [
            { id: 7, name: 'other.zip' },
            { id: 42, name: 'db.sql.gz' }
          ]
        })
      )
    } else if (req.url === '/repos/example-owner/example-repo/releases/assets/42') {
      if (req.headers.accept !== 'application/octet-stream') {
        res.statusCode = 415
        res.end()
        return
      }
      res.end(bytes)
    } else {
      res.statusCode = 404
      res.end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, seen, origin: `http://127.0.0.1:${server.address().port}` }
}

async function fetchPart(origin) {
  const root = mkdtempSync(join(tmpdir(), 'quickstart-github-fallback-'))
  const catalog = join(root, 'quickstarts.json')
  const url = `${origin}/example-owner/example-repo/releases/download/v1.2.3/db.sql.gz`
  writeFileSync(
    catalog,
    JSON.stringify({ 'quick/test/j6': { platform: 'joomla', database: { file: 'db.sql.gz', url, ...pin } } })
  )
  const out = join(root, 'out.sql.gz')
  try {
    await run(
      'python3',
      [`${PROVISION}quickstart.py`, '--id', 'quick/test/j6', '--part', 'database', '--out', out],
      {
        env: {
          ...process.env,
          TRACY_QUICKSTARTS_JSON: catalog,
          TRACY_RELEASES_GITHUB_TOKEN: '',
          TRACY_QUICKSTART_CACHE_DIR: '',
          TRACY_PRIVATE_ROOT: '',
          TRACY_GITHUB_ORIGIN: origin,
          TRACY_GITHUB_API_ORIGIN: origin
        }
      }
    )
    return { ok: true, out }
  } catch (error) {
    return { ok: false, stderr: String(error.stderr ?? error) }
  }
}

test('a release download that answers 504 is fetched through the GitHub API asset route', async () => {
  const github = await fakeGithub(504)
  try {
    const result = await fetchPart(github.origin)
    assert.ok(result.ok, result.stderr)
    assert.deepEqual(readFileSync(result.out), bytes)
    assert.ok(
      github.seen.includes('/repos/example-owner/example-repo/releases/assets/42'),
      github.seen.join(', ')
    )
  } finally {
    await new Promise((resolve) => github.server.close(resolve))
  }
})

test('a release download that answers 404 is not retried through the API', async () => {
  const github = await fakeGithub(404)
  try {
    const result = await fetchPart(github.origin)
    assert.equal(result.ok, false)
    assert.match(result.stderr, /HTTP 404/)
    assert.ok(!github.seen.some((path) => path.startsWith('/repos/')), github.seen.join(', '))
  } finally {
    await new Promise((resolve) => github.server.close(resolve))
  }
})
