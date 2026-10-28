/**
 * The GitHub API stub shares its event loop with the test process that started it, and the cases using
 * it run synchronous git (`execFileSync`) side by side. A request a client sends on a kept-alive socket
 * while that loop is busy must still be answered: with Node's default idle keep-alive timeout the
 * socket's timer fired first when the loop came back, the socket was destroyed with the request
 * unread, and the publisher failed with "network error ... (fetch failed)" (wo-export-public flake).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/github-api-stub.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { STUB_TOKEN, startGitHubStub } from './github-api-stub.mjs'
import { sh } from './sh-async.mjs'

// Longer than Node's default keep-alive timeout plus its buffer (5s + 1s), so an idle timer that
// exists is due by the time the loop is back.
const BUSY_MS = 7_000

// One client, one kept-alive connection: a request, a short pause, a second request on that socket.
const CLIENT = `
const [url, token] = process.argv.slice(1)
const headers = { authorization: 'Bearer ' + token }
const main = async () => {
  await (await fetch(url + '/user', { headers })).text()
  await new Promise((r) => setTimeout(r, 300))
  try {
    const res = await fetch(url + '/graphql', { method: 'POST', headers, body: '{}' })
    console.log('status ' + res.status)
  } catch (err) {
    console.log('error ' + err.message + ' ' + (err.cause?.code ?? ''))
  }
}
main()
`

test('a request sent on a kept-alive socket while the test loop is busy is answered', async () => {
  const bare = mkdtempSync(join(tmpdir(), 'gh-stub-'))
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare])
  const stub = await startGitHubStub({
    bare,
    repo: 'Example/repo',
    identity: { login: 'wren', kind: 'user' }
  })
  try {
    const client = sh(process.execPath, ['-e', CLIENT, stub.url, STUB_TOKEN], { timeout: 60_000 })
    // As soon as the first request is answered, hold the loop the way a synchronous git call in
    // another case does. setImmediate puts the hold in the check phase, so the timers phase (where an
    // idle timeout would fire) runs before the poll phase reads the second request.
    await new Promise((resolve) => {
      const poll = setInterval(() => {
        if (stub.calls.length < 1) return
        clearInterval(poll)
        setImmediate(() => {
          const start = Date.now()
          while (Date.now() - start < BUSY_MS) {
            // busy: the loop cannot run timers or read sockets
          }
          resolve(undefined)
        })
      }, 5)
    })
    const r = await client
    assert.equal(r.stdout.trim(), 'status 200', r.stdout + r.stderr)
    assert.deepEqual(stub.calls, ['GET /user', 'POST /graphql'])
  } finally {
    await stub.close()
    rmSync(bare, { recursive: true, force: true })
  }
})
