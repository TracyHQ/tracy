// The create door and the install information for an AI quickstart's own release (`ai-quickstart/<slug>/<cms>`, ADR
// 0045). Only a build of an approved draft names it, with no design; the entry the host receives carries the blank
// site contract's files (no Claude Cowork plugin release carries them) and the Claude Cowork plugin the human release
// the blank site was made from pins. The JA Boxing profiles are read from the checkout, as the door reads them; the
// release rows are invented.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { resolveInstall } from '../src/lib/quickstart-releases.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

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
const BLANK_DIR = fileURLToPath(
  new URL(
    '../../../packages/cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/blank-site-contract/',
    import.meta.url
  )
)

/** A release row as the copy of the releases repository writes it (invented assets). */
const insert = (pool, tag, label, file) =>
  pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason) values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      tag,
      JSON.stringify({
        name: tag,
        kind: 'quickstart',
        github: 'published',
        publishedAt: null,
        assets: [{ name: file, size: 1234, id: 98765 }]
      }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform: 'joomla',
        label,
        version: '1.0.11',
        cms: '6.1.1',
        install: { installer: { file, sha256: 'e'.repeat(64) } }
      })
    ]
  )

test(
  'the AI quickstart release resolves to the blank site, its profile carried, the human release’s plugin pinned',
  opts,
  async () => {
    const { pool } = db
    await insert(pool, 'quickstart/ja-boxing/j6', 'JA Boxing', 'example-demo.zip')
    await insert(pool, 'ai-quickstart/ja-boxing/j6', 'JA Boxing AI quickstart', 'example-blank-site.zip')
    const blank = await resolveInstall(pool, 'ai-quickstart/ja-boxing/j6')
    assert.equal(blank.installer.file, 'example-blank-site.zip')
    assert.equal(blank.contract, 'ja-boxing-blank/j6/1.0.11')
    assert.equal(blank.contractProfile.id, 'ja-boxing-blank/j6/1.0.11')
    assert.deepEqual(Object.keys(blank.contractProfile.files), [
      'content-map.json',
      'manifest.json',
      'presentation-lock.json'
    ])
    for (const [name, file] of Object.entries(blank.contractProfile.files)) {
      const bytes = readFileSync(BLANK_DIR + name)
      assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'), name)
      assert.equal(file.bytes, bytes.length, name)
    }
    const demo = await resolveInstall(pool, 'quickstart/ja-boxing/j6')
    // The demo exactly as before: its own contract, fetched by the plugin, nothing carried.
    assert.equal(demo.installer.file, 'example-demo.zip')
    assert.equal(demo.contract, 'ja-boxing/j6/1.0.11')
    assert.equal(demo.contractProfile, undefined)
    // One Claude Cowork plugin for both: the blank site was measured with the human release's pin.
    assert.ok(demo.cowork?.file, 'the human release pins a Claude Cowork plugin')
    assert.deepEqual(blank.cowork, demo.cowork)
  }
)

function harness(pool) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl: async () => new Response(null, { status: 404 })
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
  return { cookieFor, post }
}

test(
  'the create door takes the AI quickstart release from a draft build only, never from a press',
  opts,
  async () => {
    const { pool } = db
    await insert(pool, 'quickstart/ja-boxing/j6', 'JA Boxing', 'example-demo.zip')
    await insert(pool, 'ai-quickstart/ja-boxing/j6', 'JA Boxing AI quickstart', 'example-blank-site.zip')
    const { cookieFor, post } = harness(pool)
    const owner = await cookieFor('owner@x.y')
    const base = { label: 'opal-ring', platform: 'joomla', quickstart: 'ai-quickstart/ja-boxing/j6' }
    for (const body of [
      base,
      { ...base, design: 'ja-boxing', draftId: '11111111-2222-4333-8444-555555555555' }
    ]) {
      const refused = await post('/api/sites', owner, body)
      assert.equal(refused.status, 400)
      assert.equal((await refused.json()).code, 'AI_QUICKSTART_BUILD_ONLY')
    }
    // A draft build gets past the door's naming check to the build's own checks (here: the draft is unknown).
    const draft = await post('/api/sites', owner, {
      ...base,
      draftId: '11111111-2222-4333-8444-555555555555',
      plan: { id: 'plan-1', revision: 1 },
      buildId: '11111111-2222-4333-8444-666666666666',
      workflow: 'step-chain/1'
    })
    const answer = await draft.json()
    assert.notEqual(answer.code, 'AI_QUICKSTART_BUILD_ONLY', JSON.stringify(answer))
    assert.notEqual(answer.code, 'UNSUPPORTED_QUICKSTART', JSON.stringify(answer))
    assert.equal(draft.status >= 400, true, JSON.stringify(answer))
  }
)
