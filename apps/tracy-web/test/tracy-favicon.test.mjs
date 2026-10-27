import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { pageShell } from '../src/lib/page-shell.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

// The icon every server-rendered Tracy page already declares: the independent source of truth.
const declared = pageShell('t', '').match(/<link rel="icon" href="data:image\/svg\+xml,([^"]+)">/)
const TRACY_SVG = decodeURIComponent(declared[1])

const config = readConfig({
  TRACY_ORIGIN: 'https://cowork.tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'prod1',
  HOST_prod1_ORIGIN: 'http://prod1',
  HOST_prod1_DSH_ORIGIN: 'http://prod1-dsh',
  HOST_prod1_SECRET: 'h1',
  SEAT_prod1_SECRET: 'k1'
})
const app = () =>
  buildApp({
    config,
    pool: db.pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(db.pool, config),
    fetchImpl: async () => Response.json({ error: 'unexpected' }, { status: 500 })
  })

test("/favicon.ico on Tracy's own hostname is Tracy's icon, never a site address", opts, async () => {
  await db.pool.query("insert into account(email) values('icon@example.test')")
  const signedIn = `tracy_sess=${await mintSession('icon@example.test', config.sessionSecret)}`
  for (const cookie of [null, signedIn]) {
    const response = await app().fetch(
      new Request('https://cowork.tracy.test/favicon.ico', cookie ? { headers: { cookie } } : {})
    )
    // Measured on dev 11/10: a signed-in browser got 302 → /favicon-ico-…/join → 404.
    assert.equal(
      response.status,
      200,
      `cookie=${Boolean(cookie)} location=${response.headers.get('location')}`
    )
    assert.equal(response.headers.get('content-type'), 'image/svg+xml')
    assert.equal(await response.text(), TRACY_SVG)
  }
  // A site's hostname is the site router's: Tracy's icon is never put on a customer's address.
  const site = await app().fetch(new Request('https://some-site.tracy.test/favicon.ico'))
  assert.notEqual(await site.text(), TRACY_SVG)
})

test('the /ops bundle declares the same Tracy icon, so the browser never asks for /favicon.ico', () => {
  const harness = new URL('../../../packages/web/tracy-harness/', import.meta.url)
  const html = readFileSync(new URL('index.html', harness), 'utf8')
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"/)
  assert.equal(readFileSync(new URL('public/favicon.svg', harness), 'utf8'), TRACY_SVG)
})
