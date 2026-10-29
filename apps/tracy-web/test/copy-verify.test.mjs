// An imported site's hosted copy, verified door by door (`component-target.js`): every way a copy can
// fail to answer is simulated with a real server and node's own fetch, and only a copy still starting
// reads as "warming up" (beta report 26/10/2026: a re-imported Joomla copy said so for a day).
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'

import { copyDoorsFor, DOOR_WHYS, verifyCopy } from '../src/sites/component-target.js'

/** @type {import('node:http').Server} */
let server
let base = ''
let deadPort = 0
before(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const json = (status, value) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
      const path = req.url ?? ''
      if (path.startsWith('/2026-joomla6/'))
        return res.writeHead(404, { 'content-type': 'text/html' }).end('<html>Not Found</html>')
      if (path.startsWith('/redirect'))
        return res.writeHead(301, { location: 'https://copy.example/x' }).end()
      if (path.startsWith('/fatal'))
        return res.writeHead(500, { 'content-type': 'text/html' }).end('<b>Fatal error</b>')
      if (path.startsWith('/gateway')) return res.writeHead(502).end('Bad Gateway')
      if (path.startsWith('/slow')) return setTimeout(() => json(200, { ok: true }), 1500)
      if (path.startsWith('/offline'))
        return res.writeHead(200, { 'content-type': 'text/html' }).end('<html>Site offline</html>')
      if (path.startsWith('/guest')) return json(403, { error: true, code: 403, message: 'Forbidden' })
      const { token } = JSON.parse(body || '{}')
      if (token !== 'good') return json(200, { ok: false, error: 'unauthorized' })
      if (path.startsWith('/wordpress'))
        return json(200, { ok: true, platform: 'wordpress', manifest: { platform: 'wordpress' } })
      if (path.startsWith('/broken')) return json(200, { ok: false, error: 'manifest_failed' })
      return json(200, { ok: true, platform: 'joomla', manifest: { platform: 'joomla' } })
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`
  const closed = createServer()
  await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve))
  deadPort = /** @type {any} */ (closed.address()).port
  await new Promise((resolve) => closed.close(resolve))
})
after(() => server?.close())

const ask = (/** @type {string} */ endpoint, token = 'good', budgetMs = 1000) =>
  verifyCopy({ fetchImpl: fetch, endpoint, token, platform: 'joomla', budgetMs })

test('a copy that answers its plugin is verified', async () => {
  assert.equal(await ask(`${base}/index.php`), 'verified')
})

test('🔒 only a copy still starting is warming up: a refused connection, a gateway, a cut call', async () => {
  assert.equal(await ask(`http://127.0.0.1:${deadPort}/index.php`), 'unreachable', 'web server not up yet')
  assert.equal(await ask(`${base}/gateway`), 'unreachable', '502 from the gateway')
  assert.equal(await ask(`${base}/slow`, 'good', 200), 'timeout')
})

test('🔒 what waiting does not change says what it is: a redirect, no container, a server error', async () => {
  assert.equal(await ask(`${base}/redirect`), 'redirected')
  assert.equal(await ask('http://nosuch-copy-web-1.invalid/index.php'), 'no_copy')
  assert.equal(await ask(`${base}/fatal`), 'copy_error')
})

test('a door that answers without the plugin is the door, never a wrong token', async () => {
  assert.equal(await ask(`${base}/offline`), 'not_json', 'an offline front end')
  assert.equal(await ask(`${base}/guest`), 'not_engine', "Joomla's own JSON 403 for a guest")
  for (const why of ['not_json', 'not_engine', 'redirected']) assert.ok(DOOR_WHYS.has(why), why)
  for (const why of ['unauthorized', 'timeout', 'unreachable', 'no_copy', 'copy_error'])
    assert.ok(!DOOR_WHYS.has(why), why)
})

test('the plugin itself refusing is the token, the CMS or its answer', async () => {
  assert.equal(await ask(`${base}/index.php`, 'stale'), 'unauthorized')
  assert.equal(await ask(`${base}/wordpress`), 'platform_mismatch')
  assert.equal(await ask(`${base}/broken`), 'refused')
})

const SITE = { label: 'traumferien-azoren-de', host: 'prod1', platform: 'joomla' }
const CONFIG = { hostName: 'prod1', siteDomain: 'tracy.ai' }
const Q = '?option=com_claudecowork&task=api.exec&format=json'

test('🔒 a Joomla copy is asked on both its doors, the registered one first; the path under the webroot is kept', () => {
  assert.deepEqual(
    copyDoorsFor(`https://www.traumferien-azoren.de/administrator/index.php${Q}`, SITE, CONFIG),
    [
      `http://traumferien-azoren-de-web-1/administrator/index.php${Q}`,
      `http://traumferien-azoren-de-web-1/index.php${Q}`
    ]
  )
  assert.deepEqual(copyDoorsFor(`https://traumferien-azoren.de/index.php${Q}`, SITE, CONFIG), [
    `http://traumferien-azoren-de-web-1/index.php${Q}`,
    `http://traumferien-azoren-de-web-1/administrator/index.php${Q}`
  ])
  assert.deepEqual(
    copyDoorsFor(`https://example.de/office/administrator/index.php${Q}`, SITE, CONFIG)[1],
    `http://traumferien-azoren-de-web-1/office/index.php${Q}`
  )
})

test('a WordPress copy, another component or a non-URL has its one door, or none', () => {
  const wp = { ...SITE, platform: 'wordpress' }
  assert.deepEqual(
    copyDoorsFor('https://example.com/wp-admin/admin-ajax.php?action=claude_cowork', wp, CONFIG),
    ['http://traumferien-azoren-de-web-1/wp-admin/admin-ajax.php?action=claude_cowork']
  )
  assert.equal(copyDoorsFor('https://example.de/index.php?option=com_other', SITE, CONFIG).length, 1)
  assert.deepEqual(copyDoorsFor('not a url', SITE, CONFIG), [])
})

test('an imported Joomla in a live subdirectory can verify its copy at the webroot', async () => {
  const doors = copyDoorsFor(`https://live.example/2026-joomla6/index.php${Q}`, SITE, CONFIG)
  assert.deepEqual(
    doors.map((door) => new URL(door).pathname),
    [
      '/2026-joomla6/index.php',
      '/2026-joomla6/administrator/index.php',
      '/index.php',
      '/administrator/index.php'
    ]
  )
  const tried = []
  let why
  for (const door of doors) {
    const url = new URL(door)
    assert.equal(url.origin, 'http://traumferien-azoren-de-web-1')
    assert.equal(url.search, Q)
    tried.push(url.pathname)
    why = await ask(`${base}${url.pathname}${url.search}`)
    if (!DOOR_WHYS.has(why)) break
  }
  assert.equal(why, 'verified')
  assert.deepEqual(tried, ['/2026-joomla6/index.php', '/2026-joomla6/administrator/index.php', '/index.php'])
})

test('root fallback keeps the registered administrator door first and deduplicates root doors', () => {
  const paths = (endpoint) => copyDoorsFor(endpoint, SITE, CONFIG).map((door) => new URL(door).pathname)
  assert.deepEqual(paths(`https://live.example/office/administrator/index.php${Q}`), [
    '/office/administrator/index.php',
    '/office/index.php',
    '/administrator/index.php',
    '/index.php'
  ])
  assert.deepEqual(paths(`https://live.example/administrator/index.php${Q}`), [
    '/administrator/index.php',
    '/index.php'
  ])
})
