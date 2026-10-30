/** HTTP protection refusals retain actionable causes for both live sync directions. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'

const lib = new URL('../scripts/lib/', import.meta.url)

async function stand(handler) {
  const calls = []
  const server = createServer((req, res) => {
    calls.push(Date.now())
    req.resume()
    req.on('end', () => handler(req, res))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return {
    calls,
    endpoint: `http://127.0.0.1:${server.address().port}/index.php?option=com_ajax`,
    close: () => new Promise((r) => server.close(r))
  }
}
function worker(direction, endpoint, dir, extraEnv = {}) {
  const child = spawn(
    process.execPath,
    [
      new URL(direction === 'pull' ? 'live-pull.mjs' : 'live-write.mjs', lib).pathname,
      direction === 'pull' ? dir : 'info'
    ],
    {
      env: { ...process.env, TRACY_SYNC_ENDPOINT: endpoint, TRACY_SYNC_TOKEN: 'test-only-token', ...extraEnv }
    }
  )
  let out = ''
  child.stdout.on('data', (b) => {
    out += b
  })
  const ended = new Promise((resolve) =>
    child.on('close', () => resolve(out.trim() ? JSON.parse(out.trim().split('\n').at(-1)) : null))
  )
  return { child, ended }
}

for (const direction of ['pull', 'push']) {
  test(`${direction}: firewall, password, challenge and token refusals remain distinct`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'live-network-'))
    try {
      for (const [status, body, code] of [
        [403, '<html>Access denied</html>', 'LIVE_BLOCKED'],
        [401, '<html>Password required</html>', 'LIVE_PASSWORD_PROTECTED'],
        [200, '<html>Checking your browser</html>', 'LIVE_BLOCKED'],
        [200, JSON.stringify({ ok: false, error: 'unauthorized' }), 'TOKEN_REFUSED'],
        [403, JSON.stringify({ ok: false, error: 'bad_token' }), 'TOKEN_REFUSED']
      ]) {
        const live = await stand((_req, res) => {
          res.writeHead(status)
          res.end(body)
        })
        try {
          const answer = await worker(direction, live.endpoint, dir).ended
          assert.equal(answer.code, code, JSON.stringify(answer))
        } finally {
          await live.close()
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  test(`${direction}: an engine refusing the site's PHP is LIVE_PHP_TOO_OLD with both versions`, async () => {
    // claude-cowork 0.24.73 on PHP below 7.4: HTTP 200 and this answer, on both doors.
    const live = await stand((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({ ok: false, error: 'php_too_old', code: 'php_too_old', php: '7.3.33', min: '7.4.0' })
      )
    })
    const dir = mkdtempSync(join(tmpdir(), 'live-network-php-'))
    try {
      const answer = await worker(direction, live.endpoint, dir).ended
      assert.equal(answer.code, 'LIVE_PHP_TOO_OLD', JSON.stringify(answer))
      assert.equal(answer.php, '7.3.33')
      assert.equal(answer.min, '7.4.0')
      assert.equal(live.calls.length, 1, 'no other door, no retry: the PHP will not change')
    } finally {
      await live.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
  test(`${direction}: a 429 respects Retry-After and preserves rate-limit classification`, async () => {
    const live = await stand((_req, res) => {
      res.writeHead(429, { 'retry-after': '2' })
      res.end(JSON.stringify({ error: 'rate_limit' }))
    })
    const dir = mkdtempSync(join(tmpdir(), 'live-network-rate-'))
    try {
      const answer = await worker(direction, live.endpoint, dir).ended
      assert.equal(answer.code, 'LIVE_RATE_LIMITED', JSON.stringify(answer))
      assert.equal(live.calls.length, 4, 'no alternate-door requests after a rate limit')
      assert.ok(live.calls[1] - live.calls[0] >= 1950, JSON.stringify(live.calls))
    } finally {
      await live.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
  test(`${direction}: Retry-After 120 does not become a fourteen-second retry loop`, async () => {
    const live = await stand((_req, res) => {
      res.writeHead(429, { 'retry-after': '120' })
      res.end('slow down')
    })
    const dir = mkdtempSync(join(tmpdir(), 'live-network-long-'))
    const run = worker(direction, live.endpoint, dir)
    try {
      while (!live.calls.length) await new Promise((r) => setTimeout(r, 20))
      await new Promise((r) => setTimeout(r, 15_200))
      assert.equal(live.calls.length, 1)
      assert.equal(run.child.exitCode, null)
    } finally {
      run.child.kill('SIGTERM')
      await run.ended
      await live.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

test('the stand route preserves an HTTP-date Retry-After header for both directions', async () => {
  for (const direction of ['pull', 'push']) {
    // The spawned transport uses the real clock, even when this test's Date is shifted.
    const date = new Date(performance.timeOrigin + performance.now() + 120_000).toUTCString()
    const live = await stand((_req, res) => {
      res.writeHead(429, { 'retry-after': date })
      res.end('slow down')
    })
    const dir = mkdtempSync(join(tmpdir(), 'live-network-date-'))
    const run = worker(direction, 'http://original.tracy.test/index.php?option=com_ajax', dir, {
      TRACY_SYNC_CONNECT_VIA: new URL(live.endpoint).host
    })
    try {
      while (!live.calls.length) await new Promise((r) => setTimeout(r, 20))
      await new Promise((r) => setTimeout(r, 15_200))
      assert.equal(live.calls.length, 1)
      assert.equal(run.child.exitCode, null)
    } finally {
      run.child.kill('SIGTERM')
      await run.ended
      await live.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }
})
