// A TEMPLATE pressed on `POST /api/sites` leaves the design record its sealing profile names, before the fleet is told
// (plan tasks/plan-wo-design-follows-template.md). The profile is read from the checkout like the create door reads
// it: `packages/cms/tracy-joomla-quickstart/contracts/tracy-base/j6/1.0.5.design.json` says Apple.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'
import { answerTeardown } from './_host-teardown.mjs'
import { completeProvisionDesign } from '../src/sites/provision-design-tokens.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const BUILD = '11111111-2222-4333-8444-555555555555'
const SNAPSHOT = {
  tokensCss:
    ':root { --color-bg: #fff; --font-body: var(--font-astro); } html[data-theme="dark"] { --color-bg: #111; }',
  fontsJson: '[{"cssVariable":"--font-astro","name":"Site Font","fallbacks":["sans-serif"]}]',
  html: '<html data-theme="dark">'
}

function fakeHost() {
  const provisions = []
  let job = { state: 'running' }
  const fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    const teardown = answerTeardown(input, init)
    if (teardown) return teardown
    if (u.pathname === '/_host/provision') {
      provisions.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ jobId: `r-${provisions.length}` }), { status: 200 })
    }
    if (u.pathname.startsWith('/_host/jobs/')) return new Response(JSON.stringify(job), { status: 200 })
    if (u.pathname === '/_host/attach') return new Response(JSON.stringify({ lane: 'ok' }), { status: 200 })
    return new Response(null, { status: 404 })
  }
  return {
    provisions,
    fetchImpl,
    setJob: (value) => {
      job = value
    }
  }
}

function harness(pool, fetchImpl) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const post = (path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
    )
  const get = (path, cookie) => app.fetch(new Request(`http://tracy.test${path}`, { headers: { cookie } }))
  return { cookieFor, post, get }
}

/** Tracy Base as the releases table knows it: card `tracy`, the versions whose profiles the checkout carries. */
async function seedTracyBase(pool) {
  const insert = (tag, platform, version, install) =>
    pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason) values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
      [
        tag,
        JSON.stringify({ name: tag, kind: 'quickstart', github: 'published', publishedAt: null, assets: [] }),
        JSON.stringify({
          schemaVersion: 'tracy-setting/v1',
          platform,
          label: 'Tracy Base',
          version,
          cms: platform === 'joomla' ? '6.1.1' : '0.37.0',
          install,
          card: { template: 'tracy' }
        })
      ]
    )
  await insert('tracy-base/j6', 'joomla', '1.0.5', {
    webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
    database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
  })
  await insert('tracy-base/emdash-0.x', 'emdash', '0.5.6', {
    source: { file: 'q.zip', sha256: 'c'.repeat(64) },
    state: { file: 's.tar.gz', sha256: 'd'.repeat(64) }
  })
}

test(
  'a Joomla template press records the system its profile names, with the catalogue tokens as the ruler',
  opts,
  async () => {
    const { pool } = db
    await seedTracyBase(pool)
    const host = fakeHost()
    const { cookieFor, post, get } = harness(pool, host.fetchImpl)
    const owner = await cookieFor('owner@x.y')
    const built = await post('/api/sites', owner, {
      label: 'opal-moon',
      platform: 'joomla',
      design: 'tracy',
      designRevision: 'template',
      buildId: BUILD
    })
    assert.equal(built.status, 202, JSON.stringify(await built.clone().json()))
    assert.equal(host.provisions.length, 1)

    const read = await get('/api/sites/opal-moon.localhost/design', owner)
    assert.equal(read.status, 200)
    const { design } = await read.json()
    assert.equal(design?.id, 'apple', JSON.stringify(design))
    assert.equal(design.source, 'catalog')
    assert.equal(design.name, 'Apple')
    assert.equal(design.platform, 'joomla')
    assert.equal(design.tokensFrom, 'tracy-web:design-tokens.json')
    assert.equal(typeof design.tokens?.['--bg'], 'string', 'the 56 catalogue tokens travel with the record')
  }
)

test(
  'an EmDash template press binds the name only: its tokens are the site’s own, read after it is up',
  opts,
  async () => {
    const { pool } = db
    await seedTracyBase(pool)
    const host = fakeHost()
    const { cookieFor, post, get } = harness(pool, host.fetchImpl)
    const owner = await cookieFor('owner@x.y')
    const built = await post('/api/sites', owner, {
      label: 'opal-moon-em',
      platform: 'emdash',
      design: 'tracy',
      designRevision: 'template',
      buildId: BUILD
    })
    assert.equal(built.status, 202, JSON.stringify(await built.clone().json()))

    const { design } = await (await get('/api/sites/opal-moon-em.localhost/design', owner)).json()
    assert.deepEqual(
      {
        id: design?.id,
        source: design?.source,
        name: design?.name,
        platform: design?.platform,
        tokens: design?.tokens,
        tokensFrom: design?.tokensFrom
      },
      { id: 'apple', source: 'catalog', name: 'Apple', platform: 'emdash', tokens: null, tokensFrom: null }
    )
  }
)

test('polling a completed EmDash provision fills its ruler once from the host snapshot', opts, async () => {
  const { pool } = db
  await seedTracyBase(pool)
  const host = fakeHost()
  const { cookieFor, post, get } = harness(pool, host.fetchImpl)
  const owner = await cookieFor('owner@x.y')
  const response = await post('/api/sites', owner, {
    label: 'token-moon',
    platform: 'emdash',
    design: 'tracy',
    designRevision: 'template',
    buildId: BUILD
  })
  assert.equal(response.status, 202, JSON.stringify(await response.clone().json()))
  const created = await response.json()
  host.setJob({ state: 'done', port: 8080, design: SNAPSHOT })
  const polled = await get(`/api/sites/token-moon.localhost/jobs/${created.jobId}`, owner)
  assert.equal(polled.status, 200, JSON.stringify(await polled.clone().json()))
  const read = async () => (await (await get('/api/sites/token-moon.localhost/design', owner)).json()).design
  const first = await read()
  assert.equal(first.tokens['--color-bg'], '#111', 'the actual root selects the dark token block')
  assert.equal(first.tokens['--font-body'], '"Site Font", sans-serif')
  assert.equal(first.id, 'apple')
  assert.equal(first.source, 'catalog')
  assert.equal(first.tokensFrom, 'site:/app/src/styles/tokens.css')
  host.setJob({ state: 'done', port: 8080, design: { ...SNAPSHOT, tokensCss: ':root { --color-bg: red; }' } })
  await get(`/api/sites/token-moon.localhost/jobs/${created.jobId}`, owner)
  assert.deepEqual(await read(), first, 'a later poll never changes the frozen ruler')
})

test('provision tokens yield to another build, job or look and never invent a record', opts, async () => {
  const { pool } = db
  await seedTracyBase(pool)
  const host = fakeHost()
  const { cookieFor, post } = harness(pool, host.fetchImpl)
  const owner = await cookieFor('owner@x.y')
  await post('/api/sites', owner, {
    label: 'fenced-moon',
    platform: 'emdash',
    design: 'tracy',
    designRevision: 'template',
    buildId: BUILD
  })
  const key = 'fenced-moon.localhost'
  assert.equal(await completeProvisionDesign(pool, key, 'other-job', SNAPSHOT), false)
  for (const writer of ['build', 'apply:chosen', 'provision:another-build']) {
    await pool.query('update site_design set wrote_by = $2 where site_key = $1', [key, writer])
    assert.equal(await completeProvisionDesign(pool, key, 'r-1', SNAPSHOT), false, writer)
  }
  await pool.query('update site_design set wrote_by = $2 where site_key = $1', [key, `provision:${BUILD}`])
  for (const invalid of [
    undefined,
    { ...SNAPSHOT, html: '' },
    { ...SNAPSHOT, tokensCss: '/* no ruler */' },
    { ...SNAPSHOT, tokensCss: 'x'.repeat(65537) }
  ]) {
    assert.equal(await completeProvisionDesign(pool, key, 'r-1', invalid), false)
  }
  await pool.query('delete from site_design where site_key = $1', [key])
  assert.equal(await completeProvisionDesign(pool, key, 'r-1', SNAPSHOT), false)
})

test('the token parser works in the isolated web-image layout without a workspace dependency', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'web-token-reader-'))
  try {
    const leaf = path.join(dir, 'src/emdash-tool/template-tokens.mjs')
    await cp(
      new URL('../../../packages/site/tracy-site-build-emdash/src/host/template-tokens.mjs', import.meta.url),
      leaf,
      { recursive: true }
    )
    const { templateTokens, htmlAttributes } = await import(pathToFileURL(leaf).href)
    const tokens = templateTokens(SNAPSHOT.tokensCss, SNAPSHOT.fontsJson, htmlAttributes(SNAPSHOT.html))
    assert.equal(tokens['--color-bg'], '#111')
    assert.equal(tokens['--font-body'], '"Site Font", sans-serif')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
