import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { doorVia, parseArgs } from '../src/cli.mjs'

test('the seeder carries the build owner to the seat door on every write', async () => {
  const calls = []
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    calls.push(JSON.parse(Buffer.concat(chunks).toString()))
    res.setHeader('content-type', 'application/json')
    res.end('{"ok":true}')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const options = parseArgs(['--platform', 'joomla', '--preview', 'p', '--session', 'owner-session'])
    const apply = doorVia(`http://127.0.0.1:${server.address().port}`, options.sessionId)
    await apply({ siteKey: 'new.example', action: 'content.update', params: { kind: 'article' } })
    assert.deepEqual(calls, [
      {
        siteKey: 'new.example',
        action: 'content.update',
        params: { kind: 'article' },
        sessionId: 'owner-session'
      }
    ])
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
