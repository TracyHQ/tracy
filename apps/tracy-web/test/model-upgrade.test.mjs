import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket, { WebSocketServer } from 'ws'
import { modelUpgrade } from '../src/workspace/model-upgrade.js'
import { modelWire } from '../src/lib/model-wire.js'

test('admitted websocket projects opaque routes and restores returned configs', {
  timeout: 10000
}, async (t) => {
  const host = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await once(host, 'listening')
  const web = createServer()
  const secret = 'websocket-fixture-secret'
  const selection = { provider: 'deepseek-official', model: 'deepseek-flash' }
  const forward = modelUpgrade(secret)
  web.on('upgrade', (req, socket, head) =>
    forward(req, socket, head, new URL(`http://127.0.0.1:${host.address().port}/api/remote.mux`), {
      seatToken: 'seat-fixture',
      mount: '/site',
      viewerHost: 'tracy.test'
    })
  )
  web.listen(0, '127.0.0.1')
  await once(web, 'listening')
  let hostSocket, headers
  host.on('connection', (socket, req) => {
    hostSocket = socket
    headers = req.headers
  })
  const browser = new WebSocket(`ws://127.0.0.1:${web.address().port}/site/api/remote.mux`)
  t.after(async () => {
    browser.terminate()
    hostSocket?.terminate()
    for (const client of host.clients) client.terminate()
    await Promise.all([new Promise((r) => host.close(r)), new Promise((r) => web.close(r))])
  })
  await once(browser, 'open')
  assert.equal(headers['x-forwarded-host'], 'tracy.test')
  assert.equal(headers['x-forwarded-prefix'], '/site')
  assert.match(headers.cookie, /seat-fixture/)
  const received = once(browser, 'message')
  hostSocket.send(
    JSON.stringify({ type: 'item', streamId: 'projection', value: { next: selection, lastUsed: selection } })
  )
  const [data] = await received
  assert.equal(data.toString().includes('deepseek'), false)
  const frame = JSON.parse(data.toString())
  assert.equal(frame.value.next.model, modelWire(secret).modelId(selection.provider, selection.model))
  const returned = once(hostSocket, 'message')
  browser.send(JSON.stringify({ type: 'uplink', value: { config: frame.value.next } }))
  assert.deepEqual(JSON.parse((await returned)[0].toString()).value.config, selection)
  const closed = once(browser, 'close')
  hostSocket.terminate()
  await closed
})
