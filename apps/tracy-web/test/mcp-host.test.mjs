import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'

const base = {
  TRACY_ORIGIN: 'https://cowork.tracy.test',
  API_ORIGIN: 'https://api.tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

test('publisher proof is public only on the configured MCP origin, without a database or cookie', async () => {
  const token = 'public-proof-for-this-test'
  const app = buildApp({
    config: readConfig({ ...base, MCP_OPENAI_CHALLENGE: token }),
    mail: { send: async () => {} }
  })
  const path = '/.well-known/openai-apps-challenge'
  const response = await app.request(`${base.TRACY_ORIGIN}${path}`, {
    headers: { cookie: 'tracy_sess=invalid' }
  })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), token)
  assert.match(response.headers.get('content-type'), /^text\/plain/)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('set-cookie'), null)
  for (const origin of [base.API_ORIGIN, 'https://tracy.ai', 'https://customer.tracy.test']) {
    const other = await app.request(`${origin}${path}`)
    assert.equal(other.status, 404)
    assert.ok(!(await other.text()).includes(token))
  }
  const unset = buildApp({ config: readConfig(base), mail: { send: async () => {} } })
  assert.equal((await unset.request(`${base.TRACY_ORIGIN}${path}`)).status, 404)
})
