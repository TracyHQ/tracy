/** Isolated PostgreSQL and the actual authenticated product Apply door; CMS HTTP is never mocked. */
import { randomBytes, createHmac } from 'node:crypto'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { freshPool } from '../../../apps/tracy-web/test/_db.mjs'
import { readConfig } from '../../../apps/tracy-web/src/config.js'
import { writeComponent } from '../../../apps/tracy-web/src/sites/store.js'
import { mintSession } from '../../../apps/tracy-web/src/lib/session.js'
import { hostCall, hostJob } from '../../../apps/tracy-web/src/host/client.js'

export async function authenticatedToolRelay({
  platform,
  fixture,
  optimized = true,
  databaseUrl = process.env.TEST_DATABASE_URL
}) {
  if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL for an isolated acceptance database')
  process.env.TEST_DATABASE_URL = databaseUrl
  const db = await freshPool()
  const secret = randomBytes(32).toString('hex')
  const config = readConfig({
    TRACY_ORIGIN: 'http://tracy.test:8080',
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: secret,
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://tracy-host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: secret,
    SEAT_local_SECRET: secret,
    MCP_TRACY_ACTOR_SECRET: secret
  })
  const generated = []
  let buildApp
  try {
    if (optimized) ({ buildApp } = await import('../../../apps/tracy-web/src/app.js'))
    else {
      // Freeze the same relay with inventory reuse disabled. No production configuration switch.
      const suffix = `toolbench-${process.pid}-${randomBytes(4).toString('hex')}`
      const route = resolve(`apps/tracy-web/src/sites/route.${suffix}.js`)
      const app = resolve(`apps/tracy-web/src/app.${suffix}.js`)
      writeFileSync(
        route,
        readFileSync(resolve('apps/tracy-web/src/sites/route.js'), 'utf8').replace(
          'createPageInventoryReader({ now })',
          'createPageInventoryReader({ now, maxEntries: 0 })'
        )
      )
      generated.push(route)
      writeFileSync(
        app,
        readFileSync(resolve('apps/tracy-web/src/app.js'), 'utf8').replace(
          "from './sites/route.js'",
          `from './sites/route.${suffix}.js'`
        )
      )
      generated.push(app)
      ;({ buildApp } = await import(pathToFileURL(app)))
    }
    const pool = db.pool,
      siteKey = 'owned.tracy.test'
    await pool.query(
      "insert into site (site_key,label,host,platform,origin) values ($1,'owned','local',$2,'fleet_born')",
      [siteKey, platform]
    )
    for (const [email, role] of [
      ['editor@example.test', 'owner'],
      ['viewer@example.test', 'viewer']
    ]) {
      const { rows } = await pool.query('insert into account(email) values($1) returning id', [email])
      await pool.query(
        'insert into seat(site_key,account_id,role,granted_by,accepted_at) values($1,$2,$3,$2,now())',
        [siteKey, rows[0].id, role]
      )
    }
    const endpoint =
      fixture.origin +
      (platform === 'wordpress'
        ? '/wp-admin/admin-ajax.php?action=claude_cowork'
        : platform === 'joomla'
          ? '/index.php?option=com_claudecowork&task=api.exec&format=json'
          : '/content.json')
    await writeComponent(
      pool,
      siteKey,
      { endpoint, token: fixture.token, ...(platform === 'emdash' ? { door: 'content-api' } : {}) },
      'editor@example.test'
    )
    const http = globalThis.fetch,
      reads = []
    const fetchImpl = async (input, init) => {
      // No access to any other site or service is permitted by this acceptance fixture.
      if (String(input) !== endpoint) throw new Error('UNEXPECTED_ACCEPTANCE_ENDPOINT')
      const start = performance.now(),
        response = await http(input, init)
      reads.push({
        ms: performance.now() - start,
        status: response.status,
        action: JSON.parse(init.body).action,
        params: JSON.parse(init.body).params,
        sourceCalls: Number(response.headers.get('x-tracy-source-calls') ?? 0)
      })
      return response
    }
    const app = buildApp({
      config,
      pool,
      mail: { send: async () => {} },
      host: { hostCall, hostJob },
      fetchImpl
    })
    const actorMint = (email) => {
      const payload = Buffer.from(
        JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })
      ).toString('base64url')
      return `v1.${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
    }
    const cookie = `tracy_sess=${await mintSession('editor@example.test', secret)}`
    const pending = new Set()
    const transport = (url, options = {}) => {
      const promise = app.fetch(
        new Request(String(url).replace('http://tracy-web.test', 'http://tracy.test:8080'), options)
      )
      pending.add(promise)
      promise.finally(() => pending.delete(promise))
      return promise
    }
    const send = async (action, params = {}, { email = null, session = 'reader-acceptance' } = {}) => {
      const response = await app.fetch(
        new Request(`http://tracy.test:8080/api/sites/${siteKey}/apply`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-tracy-session': session,
            ...(email ? { 'x-tracy-actor': actorMint(email) } : { cookie })
          },
          body: JSON.stringify({ action, params })
        })
      )
      return { status: response.status, body: await response.json() }
    }
    return {
      app,
      pool,
      send,
      transport,
      actorMint,
      reads,
      close: async () => {
        while (pending.size) await Promise.allSettled(pending)
        await db.close()
        for (const file of generated) rmSync(file, { force: true })
      }
    }
  } catch (error) {
    await db.close()
    for (const file of generated) rmSync(file, { force: true })
    throw error
  }
}
