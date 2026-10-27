/** Opt-in interoperability check with installed CLIs, isolated config and a synthetic database. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { serve } from '@hono/node-server'
import { fileDb } from '../_db.mjs'
import { buildApp } from '../../src/app.js'
import { readConfig } from '../../src/config.js'
import { mintSession } from '../../src/lib/session.js'

const enabled = process.env.MCP_NATIVE_CLI_TEST === '1' && process.env.TEST_DATABASE_URL
const origin = 'http://127.0.0.1:17834'
const secret = 'fixture-session-secret-for-native-oauth'
const email = 'native-cli@example.test'

function start(command, args, options) {
  const child = spawn(command, args, { ...options, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (part) => {
    output += part
  })
  child.stderr.on('data', (part) => {
    output += part
  })
  return { child, output: () => output }
}
async function until(check, describe) {
  for (let i = 0; i < 300; i++) {
    const value = await check()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out: ${typeof describe === 'function' ? describe() : describe}`)
}

for (const kind of ['codex', 'claude']) {
  test(`installed ${kind}: exact callback, S256, resource and real code exchange`, {
    skip: enabled
      ? false
      : 'set MCP_NATIVE_CLI_TEST=1 and TEST_DATABASE_URL; installed Codex, Claude Code and Python required',
    timeout: 60000
  }, async () => {
    const db = fileDb()
    const directory = await mkdtemp(join(tmpdir(), `tracy-${kind}-oauth-`))
    let server, login, health
    try {
      await db.open()
      await db.pool.query(
        "insert into site (site_key,label,host,platform) values ('synthetic.localhost','synthetic','local','joomla')"
      )
      const account = (await db.pool.query('insert into account (email) values ($1) returning id', [email]))
        .rows[0]
      await db.pool.query(
        "insert into seat (site_key,account_id,role,granted_by,accepted_at) values ('synthetic.localhost',$1,'owner',$1,now())",
        [account.id]
      )
      const config = readConfig({
        TRACY_ORIGIN: origin,
        API_ORIGIN: 'http://api.test',
        API_KEY_PEPPER: 'p'.repeat(32),
        SESSION_SECRET: secret,
        SITE_DOMAIN: 'localhost',
        HOSTS: 'local',
        HOST_local_ORIGIN: 'http://host.test',
        HOST_local_DSH_ORIGIN: 'http://dsh.test',
        SEAT_local_SECRET: 'fixture',
        HOST_local_SECRET: 'fixture'
      })
      const app = buildApp({
        config,
        pool: db.pool,
        mail: { send: async () => {} },
        host: {},
        fetchImpl: () => assert.fail('no CMS call is permitted')
      })
      const exchanges = []
      server = serve({
        hostname: '127.0.0.1',
        port: 17834,
        fetch: async (request) => {
          if (new URL(request.url).pathname === '/oauth/token') {
            const fields = new URLSearchParams(await request.clone().text())
            const response = await app.fetch(request)
            exchanges.push({
              client: fields.get('client_id'),
              resource: fields.get('resource'),
              callback: fields.get('redirect_uri'),
              kind: fields.get('grant_type'),
              status: response.status
            })
            // Only the fixture response expires early, to exercise the installed client's refresh.
            if (kind === 'claude' && fields.get('grant_type') === 'authorization_code' && response.ok) {
              const tokens = await response.json()
              return Response.json({ ...tokens, expires_in: 1 })
            }
            return response
          }
          return app.fetch(request)
        }
      })
      await once(server, 'listening')
      const env = {
        ...process.env,
        CODEX_HOME: directory,
        CLAUDE_CONFIG_DIR: directory,
        BROWSER: '/usr/bin/true'
      }
      const clientId = kind === 'codex' ? 'tracy-codex' : 'tracy-claude-code'
      const callback =
        kind === 'codex' ? 'http://127.0.0.1:17833/callback' : 'http://localhost:17832/callback'
      if (kind === 'codex') {
        await writeFile(
          join(directory, 'config.toml'),
          `mcp_oauth_credentials_store = "file"\n[mcp_servers.fixture]\nurl = "${origin}/mcp"\n[mcp_servers.fixture.oauth]\nclient_id = "${clientId}"\ncallback_url = "${callback}"\ncallback_port = 17833\n`
        )
        login = start('codex', ['mcp', 'login', 'fixture'], { cwd: directory, env })
      } else {
        const add = start(
          'claude',
          [
            'mcp',
            'add',
            '--transport',
            'http',
            '--client-id',
            clientId,
            '--callback-port',
            '17832',
            'fixture',
            `${origin}/mcp`
          ],
          { cwd: directory, env }
        )
        assert.equal((await once(add.child, 'exit'))[0], 0, add.output())
        login = start(
          'python3',
          [
            '-c',
            'import os, pty, sys; sys.exit(os.waitstatus_to_exitcode(pty.spawn(["claude", "mcp", "login", "fixture", "--no-browser"])))'
          ],
          { cwd: directory, env }
        )
      }
      const url = await until(
        () => {
          // OSC hyperlink markers and ANSI escapes delimit the printed URL.
          const plain = [...login.output()].map((char) => (char.charCodeAt(0) < 32 ? ' ' : char)).join('')
          const found = plain.match(/http:\/\/127\.0\.0\.1:17834\/oauth\/authorize[^\s]+/)
          return found?.[0]
        },
        () => `${kind} authorization URL: ${login.output().replace(/http[^\s]+/g, '[URL]')}`
      )
      const query = new URL(url).searchParams
      assert.equal(query.get('client_id'), clientId)
      assert.equal(query.get('redirect_uri'), callback)
      assert.equal(query.get('resource'), `${origin}/mcp`)
      assert.equal(query.get('code_challenge_method'), 'S256')
      const cookie = `tracy_sess=${await mintSession(email, secret)}`
      const page = await fetch(url, { headers: { cookie } })
      assert.equal(page.status, 200)
      const html = await page.text()
      const response = await fetch(`${origin}/oauth/authorize`, {
        method: 'POST',
        redirect: 'manual',
        headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          request: /name="request" value="([^"]+)"/.exec(html)[1],
          signature: /name="signature" value="([^"]+)"/.exec(html)[1],
          decision: 'allow',
          siteKey: 'synthetic.localhost'
        })
      })
      assert.equal(response.status, 303)
      const location = response.headers.get('location')
      if (kind === 'claude') login.child.stdin.end(`${location}\n`)
      else assert.equal((await fetch(location)).status, 200)
      await until(
        () => exchanges.some((entry) => entry.status === 200),
        () =>
          `${kind} token exchange: ${JSON.stringify(exchanges)}; ${login.output().replace(/http[^\s]+/g, '[URL]')}`
      )
      if (kind === 'claude') {
        await until(
          () => login.output().includes('Authenticated with "fixture"'),
          'Claude login success message'
        )
      } else {
        await until(() => login.child.exitCode !== null, 'Codex login completion')
        assert.equal(login.child.exitCode, 0, login.output().replace(/http[^\s]+/g, '[URL]'))
      }
      if (kind === 'claude') {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        health = start('claude', ['mcp', 'list'], { cwd: directory, env })
        await until(
          () => health.child.exitCode !== null,
          () => `Claude health: ${health.output()}`
        )
        assert.equal(health.child.exitCode, 0, health.output())
        assert.match(health.output(), /Connected/)
      }
      assert.deepEqual(exchanges, [
        { client: clientId, resource: `${origin}/mcp`, callback, kind: 'authorization_code', status: 200 },
        ...(kind === 'claude'
          ? [
              {
                client: clientId,
                resource: `${origin}/mcp`,
                callback: null,
                kind: 'refresh_token',
                status: 200
              }
            ]
          : [])
      ])
    } finally {
      for (const run of [login, health]) {
        if (run?.child.exitCode === null) process.kill(-run.child.pid, 'SIGTERM')
      }
      if (server) {
        server.closeAllConnections()
        await new Promise((resolve) => server.close(resolve))
      }
      await db.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
}
