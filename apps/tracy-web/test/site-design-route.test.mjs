/**
 * The design record through the real app and a database (ADR 0023, "Addendum 29/09"): the build's
 * actor records it, a browser seat cannot, and a `theme.style` that went through the Apply door
 * rewrites it — whoever called it.
 */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'

import { freshPool } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { writeComponent } from '../src/sites/store.js'
import { writeSiteDesign } from '../src/lib/site-design.js'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: 'design-actor-test-key'
}

function harness(pool, answer = { ok: true }) {
  const config = readConfig(env)
  const fetchImpl = async () => new Response(JSON.stringify(answer), { status: 200 })
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    fetchImpl
  })
  const request = (method, path, headers, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: { ...headers, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  const cookie = async (email) => ({ cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}` })
  const actor = (email) => {
    const payload = Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })).toString(
      'base64url'
    )
    return {
      'x-tracy-actor': `v1.${payload}.${createHmac('sha256', config.actorSecret).update(payload).digest('base64url')}`,
      'x-tracy-workspace-label': 'lantern'
    }
  }
  return { request, cookie, actor }
}

async function ownedSite(pool) {
  await pool.query(
    "insert into site (site_key, label, host, platform) values ('lantern.localhost', 'lantern', 'local', 'wordpress')"
  )
  const { rows } = await pool.query("insert into account (email) values ('owner@x.y') returning id")
  await pool.query(
    "insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('lantern.localhost', $1, 'owner', $1, now())",
    [rows[0].id]
  )
}

const RECORD = {
  id: 'apple',
  source: 'catalog',
  name: 'Apple',
  platform: 'wordpress',
  tokens: { '--accent': '#0071e3' },
  tokensFrom: '/opt/tracy/cms/data/systems/apple/tokens.css',
  manifestDesign: { id: 'apple', source: 'catalog' }
}

test(
  'the build records the design through its signed actor; a browser seat cannot; the GET answers the public shape',
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      await ownedSite(pool)
      const { request, cookie, actor } = harness(pool)
      const owner = await cookie('owner@x.y')

      assert.deepEqual(await (await request('GET', '/api/sites/lantern.localhost/design', owner)).json(), {
        design: null
      })

      const bySeat = await request('PUT', '/api/sites/lantern.localhost/design', owner, RECORD)
      assert.equal(bySeat.status, 403)
      assert.equal((await bySeat.json()).code, 'DESIGN_RECORD_BUILD_ONLY')

      const byBuild = await request('PUT', '/api/sites/lantern.localhost/design', actor('owner@x.y'), {
        ...RECORD,
        wroteBy: 'forged'
      })
      assert.equal(byBuild.status, 200)
      const { design } = await (await request('GET', '/api/sites/lantern.localhost/design', owner)).json()
      assert.deepEqual(Object.keys(design).sort(), [
        'id',
        'name',
        'platform',
        'source',
        'tokens',
        'tokensFrom',
        'updatedAt'
      ])
      assert.equal(design.id, 'apple')
      const { rows } = await pool.query(
        "select wrote_by from site_design where site_key = 'lantern.localhost'"
      )
      assert.equal(rows[0].wrote_by, 'build')

      // A stranger's signature proves who typed, never a seat.
      assert.equal(
        (await request('PUT', '/api/sites/lantern.localhost/design', actor('stranger@x.y'), RECORD)).status,
        403
      )
    } finally {
      await close()
    }
  }
)

// The record is what `theme.style` would write, so it asks what `theme.style` asks: the `code`
// toolset of the seat's role. The owner and an editor pass (ADR 0028); a viewer, who holds no
// toolset, is refused and writes nothing.
test(
  'PUT design needs the toolset theme.style needs: owner and editor pass, a viewer is refused',
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      await ownedSite(pool)
      for (const [email, role] of [
        ['editor@x.y', 'editor'],
        ['viewer@x.y', 'viewer']
      ]) {
        const { rows } = await pool.query('insert into account (email) values ($1) returning id', [email])
        await pool.query(
          "insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('lantern.localhost', $1, $2, $1, now())",
          [rows[0].id, role]
        )
      }
      const { request, actor } = harness(pool)
      const put = (email) => request('PUT', '/api/sites/lantern.localhost/design', actor(email), RECORD)

      const byViewer = await put('viewer@x.y')
      assert.equal(byViewer.status, 403)
      assert.deepEqual(await byViewer.json(), {
        code: 'TOOLSET_NOT_GRANTED',
        toolset: 'code',
        role: 'viewer'
      })
      assert.equal((await pool.query('select 1 from site_design')).rowCount, 0)

      assert.equal((await put('editor@x.y')).status, 200)
      assert.equal((await put('owner@x.y')).status, 200)
    } finally {
      await close()
    }
  }
)

test(
  'a theme.style the site answered ok rewrites the record, with the new system’s tokens and the apply id',
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      await ownedSite(pool)
      await writeComponent(
        pool,
        'lantern.localhost',
        { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
        'owner@x.y'
      )
      const { request, cookie } = harness(pool, { ok: true })
      const owner = await cookie('owner@x.y')
      const res = await request('POST', '/api/sites/lantern.localhost/apply', owner, {
        action: 'theme.style',
        params: { theme: 'tracy', style: 'airbnb', apply_id: 'a-7' }
      })
      assert.equal(res.status, 200, JSON.stringify(await res.clone().json()))
      const { design } = await (await request('GET', '/api/sites/lantern.localhost/design', owner)).json()
      assert.equal(design.id, 'airbnb')
      assert.equal(design.name, 'Airbnb')
      assert.equal(design.source, 'catalog')
      assert.equal(Object.keys(design.tokens).length, 56)
      const { rows } = await pool.query(
        "select wrote_by from site_design where site_key = 'lantern.localhost'"
      )
      assert.equal(rows[0].wrote_by, 'apply:a-7')
    } finally {
      await close()
    }
  }
)

test('a theme.style the site refused leaves the record as it was', opts, async () => {
  const { pool, close } = await freshPool()
  try {
    await ownedSite(pool)
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
      'owner@x.y'
    )
    const { request, cookie } = harness(pool, { ok: false, code: 'NO_SUCH_STYLE', error: 'no' })
    const owner = await cookie('owner@x.y')
    await request('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'theme.style',
      params: { theme: 'tracy', style: 'airbnb', apply_id: 'a-8' }
    })
    assert.deepEqual(await (await request('GET', '/api/sites/lantern.localhost/design', owner)).json(), {
      design: null
    })
  } finally {
    await close()
  }
})

test(
  're-applying the same brand without values keeps its recorded tokens (compared as objects: jsonb reorders keys)',
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      await ownedSite(pool)
      await writeComponent(
        pool,
        'lantern.localhost',
        { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
        'owner@x.y'
      )
      await writeSiteDesign(
        pool,
        'lantern.localhost',
        {
          id: 'brand-acme-com',
          source: 'brand',
          name: null,
          platform: 'wordpress',
          tokens: { '--fg': '#111', '--bg': '#fffaf0' },
          tokensFrom: 'theme.style:variation'
        },
        'apply:first'
      )
      const { request, cookie } = harness(pool, { ok: true, applyId: 'issued-2' })
      const owner = await cookie('owner@x.y')
      const res = await request('POST', '/api/sites/lantern.localhost/apply', owner, {
        action: 'theme.style',
        params: { theme: 'tracy', style: 'brand-acme-com', variation: {}, apply_id: 'sent-2' }
      })
      assert.equal(res.status, 200)
      const { design } = await (await request('GET', '/api/sites/lantern.localhost/design', owner)).json()
      assert.deepEqual(design.tokens, { '--bg': '#fffaf0', '--fg': '#111' })
      const { rows } = await pool.query(
        "select wrote_by from site_design where site_key = 'lantern.localhost'"
      )
      assert.equal(rows[0].wrote_by, 'apply:issued-2', 'the id the answer carries wins over the one sent')
    } finally {
      await close()
    }
  }
)

test(
  'a quickstart record keeps the tokens the build sent through a theme.style that re-applies that quickstart',
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      await ownedSite(pool)
      await writeComponent(
        pool,
        'lantern.localhost',
        { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
        'owner@x.y'
      )
      const { request, cookie, actor } = harness(pool, { ok: true })
      const owner = await cookie('owner@x.y')
      const tokens = { '--bg': '#F5F3EE', '--accent': '#14483A', '--font-body': '"Archivo", sans-serif' }
      const built = await request('PUT', '/api/sites/lantern.localhost/design', actor('owner@x.y'), {
        id: 'tracy-business',
        source: 'quickstart',
        name: 'Tracy Business',
        platform: 'wordpress',
        tokens,
        tokensFrom: 'packages/cms/tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.2.0.design.json',
        manifestDesign: { id: 'tracy-business', source: 'quickstart' }
      })
      assert.equal(built.status, 200)
      const res = await request('POST', '/api/sites/lantern.localhost/apply', owner, {
        action: 'theme.style',
        params: { theme: 'tracy', style: 'tracy-business', apply_id: 'a-8' }
      })
      assert.equal(res.status, 200, JSON.stringify(await res.clone().json()))
      const { design } = await (await request('GET', '/api/sites/lantern.localhost/design', owner)).json()
      assert.deepEqual(
        { id: design.id, source: design.source, name: design.name, tokens: design.tokens },
        { id: 'tracy-business', source: 'quickstart', name: 'Tracy Business', tokens }
      )
      assert.match(design.tokensFrom, /1\.2\.0\.design\.json$/)
      const { rows } = await pool.query(
        "select wrote_by from site_design where site_key = 'lantern.localhost'"
      )
      assert.equal(rows[0].wrote_by, 'apply:a-8')
    } finally {
      await close()
    }
  }
)
