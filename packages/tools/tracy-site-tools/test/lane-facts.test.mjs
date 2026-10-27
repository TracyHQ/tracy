/**
 * A single-site lane (`MCP_TRACY_SITE_KEY`) reads its site's facts too — through the shipped
 * `lib/index.js`, in a file of its own because the lane key is read once per process (`laneSiteKey`).
 *
 * 🔒 WHY. The lane's `execute` used `NO_SITE_FACTS`, so every call there was judged as platform
 * `unknown`: the WordPress body guard, the in-tool check, V0 and the list-row shaping were all off,
 * while the budgets still cut (review, 25/09/2026). The lane's label is known (`MCP_TRACY_SITE_LABEL`,
 * as `page.text` reads it); only its surface stays global, as its tool was described.
 *
 *   node --test packages/tools/tracy-site-tools/test/lane-facts.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const root = mkdtempSync(path.join(tmpdir(), 'tch-lane-'))
const label = 'wplane1'
mkdirSync(path.join(root, label, '.tracy'), { recursive: true })
writeFileSync(
  path.join(root, label, '.tracy', 'site.json'),
  JSON.stringify({ siteKey: `${label}.tracy.test`, platform: 'wordpress' })
)
process.env.TRACY_SITES_ROOT = root
process.env.MCP_TRACY_SITE_KEY = `${label}.tracy.test`
process.env.MCP_TRACY_SITE_LABEL = label
delete process.env.DSH_PASSWORDS_ENV_FILE

const { apply } = await import('../lib/index.js')

/** The Apply door as `config.fetch`, answering `answer(body)`; every call is recorded. */
function door(answer, calls) {
  return async (url, init = {}) => {
    if (!String(url).endsWith('/apply')) return new Response('', { status: 404 })
    const body = JSON.parse(String(init.body))
    calls.push(body)
    return new Response(JSON.stringify(answer(body)), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
}

/** This plugin on a lane, with a session log whose customer typed (so a call has a person to act as). */
function lane(answer, calls) {
  const tools = new Map()
  const events = [
    {
      type: 'user/message',
      data: {
        source: { kind: 'user', prompter: { user: 'An', email: 'an@example.test' } },
        content: [{ type: 'text', text: 'change the home page' }]
      }
    }
  ]
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: (t) => (tools.set(t.name, t), () => {}) },
      effect: (setup) => {
        setup()
      },
      on: () => {},
      get: (name) =>
        name === 'sessions'
          ? { get: () => ({ snapshotEvents: () => events }) }
          : name === 'tracyAssertion'
            ? { mint: (email) => `signed:${email}` }
            : undefined
    },
    { origin: 'http://door.test', fetch: door(answer, calls), emdash: { cms: async () => '' } }
  )
  return (args) =>
    tools
      .get('tracy_site')
      .execute(args, { agent: { session: { id: 'session-lane', header: { cwd: '/tmp' } } } })
}

test('🔒 a lane’s WordPress list rows are cut by field, and its body writes are guarded', async () => {
  const calls = []
  const row = (id) => ({
    id,
    title: `Page ${id}`,
    slug: `page-${id}`,
    type: 'page',
    status: 'publish',
    url: `https://${label}.tracy.test/page-${id}/`,
    checksum: 'x'.repeat(40),
    author: { id: 1, name: 'admin' },
    comment_status: 'closed'
  })
  const run = lane(
    (body) =>
      body.action === 'content.list'
        ? { ok: true, items: [row(2), row(3)] }
        : { ok: true, kind: 'post', id: 42, created: false },
    calls
  )
  const listed = await run({ action: 'content.list', params: { kind: 'post', post_type: 'page' } })
  assert.deepEqual(Object.keys(listed.items[0]).sort(), ['id', 'path', 'slug', 'status', 'title', 'type'])
  assert.equal(listed.items[0].path, '/page-2/')
  const write = await run({
    action: 'content.update',
    params: { kind: 'post', id: 42, fields: { post_content: '<p>x</p>' } }
  })
  assert.equal(write.code, 'BODY_SHRINK')
  assert.equal(write.platform, 'wordpress', 'judged as the WordPress site it is, not as unknown')
  assert.equal(calls.filter((c) => c.action === 'content.update').length, 0, 'nothing is sent')
})
