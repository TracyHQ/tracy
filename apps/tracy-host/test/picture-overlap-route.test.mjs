/**
 * `POST /_host/picture-overlap` (spec TracyHQ/tracy#189): a signed call names a site by label and port, never by URL,
 * and the build's picture folder by a plain relative path; with no browser it answers 503 NO_BROWSER.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildApp } from '../src/app.js'
import { OVERLAP_FOLDER, overlapFolderOf } from '../src/picture-overlap-browser.js'
import { signHostCall } from '../../tracy-web/src/host/client.js'

const config = { hostName: 'demo', hostSecret: 'host-secret', sitesRoot: process.cwd() }
const run = async () => ({ code: 0, tail: [] })
const post = async (app, body) => {
  const raw = JSON.stringify(body)
  const headers = await signHostCall({ secret: 'host-secret', path: '/_host/picture-overlap', body: raw })
  return app.fetch(
    new Request('http://tracy-host.test/_host/picture-overlap', { method: 'POST', headers, body: raw })
  )
}

test('the picture folder is a plain relative path, never a URL', () => {
  assert.equal(overlapFolderOf(undefined), OVERLAP_FOLDER)
  assert.equal(overlapFolderOf('images/tracy-content/'), 'images/tracy-content/')
  assert.equal(overlapFolderOf('https://elsewhere.example/'), null)
  assert.equal(overlapFolderOf('../images/'), null)
  assert.equal(overlapFolderOf('images'), null)
})

test('a signed /_host/picture-overlap reads the named pages at the composed target; no browser answers 503', async () => {
  assert.equal((await post(buildApp({ config, run }), { label: 'bakery', platform: 'joomla' })).status, 503)
  const calls = []
  const pictureOverlap = async ({ asked, base }) => {
    calls.push({ asked, base })
    return {
      findings: [
        { src: '/images/tracy-content/figure.png', widths: [1440], covers: [{ kind: 'heading', text: 'Hi' }] }
      ],
      pages: asked.pages.map((path) => ({ path, ok: true }))
    }
  }
  const app = buildApp({ config, run, pictureOverlap })
  assert.equal((await post(app, { label: '../x', platform: 'joomla' })).status, 400)
  assert.equal(
    (await post(app, { label: 'bakery', platform: 'joomla', port: 52019, folder: 'http://x/' })).status,
    400
  )
  const res = await post(app, { label: 'bakery', platform: 'joomla', port: 52019, pages: ['/', '/about'] })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(calls[0].asked, { pages: ['/', '/about'], folder: OVERLAP_FOLDER })
  assert.equal(calls[0].base, 'http://127.0.0.1:52019/')
  assert.equal(body.findings[0].widths[0], 1440)
})

test('a locked site token reaches the browser, and a malformed one is dropped (#189)', async () => {
  for (const label of ['harbour-locks', 'willow-tea']) {
    const seen = []
    const pictureOverlap = async ({ asked, bearer }) => {
      seen.push(bearer)
      return { findings: [], pages: asked.pages.map((path) => ({ path, ok: true })) }
    }
    const app = buildApp({ config, run, pictureOverlap })
    const asked = { label, platform: 'joomla', port: 52019, pages: ['/'] }
    assert.equal((await post(app, { ...asked, bearer: 'site-token-abcdefghijkl' })).status, 200)
    assert.equal((await post(app, { ...asked, bearer: 'bad\r\nx-other: 1' })).status, 200)
    assert.equal((await post(app, asked)).status, 200)
    assert.deepEqual(seen, ['site-token-abcdefghijkl', null, null])
  }
})
