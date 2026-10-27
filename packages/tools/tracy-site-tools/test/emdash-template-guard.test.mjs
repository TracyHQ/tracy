import { LEGACY_STRUCTURE_CODE } from '../src/host/legacy-refusal.mjs'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

// ADR 0022 (Lee, 26/09/2026): an EmDash quickstart locks nothing but direct database writes, so
// `tracy_emdash` is the same pass-through on every EmDash site. An OLDER Tracy template still carries
// its own guard and answers 403 for a structural tool; that answer is read back as `TEMPLATE_GUARD`
// with the road that works (the files under /app, then site.rebuild).
import { templateRefusal } from '../src/host/emdash.mjs'
import { refusalNext } from '../src/host/site.mjs'
import { apply } from '../lib/index.js'

function register(config) {
  const tools = new Map()
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: (t) => (tools.set(t.name, t), () => {}) },
      effect: (setup) => {
        setup()
      },
      on: () => {},
      get: () => undefined
    },
    config
  )
  return tools
}

let n = 0
/** A sites root with one site; a fresh label per test, one site per test. */
function site() {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-emdash-'))
  const label = `em-${String(++n)}`
  mkdirSync(path.join(root, label), { recursive: true })
  process.env.TRACY_SITES_ROOT = root
  return { label, cwd: path.join(root, label) }
}

const mcpReply = (result) => ({
  code: 0,
  stdout: `TRACY_MCP 200\n${JSON.stringify({ jsonrpc: '2.0', id: 1, result })}`
})
const config = ({ mcp }) => ({
  emdash: { cms: async () => 'emdash' },
  exec: async (input) =>
    input.argv[1] === '-i' ? mcp(input) : { code: 0, stdout: '', stderr: '', timedOut: false }
})
const call = (tools, args, cwd) =>
  tools.get('tracy_emdash').execute(args, { agent: { session: { id: 's', header: { cwd } } } })

test.beforeEach(() => {
  delete process.env.MCP_TRACY_SITE_KEY
  delete process.env.DSH_PASSWORDS_ENV_FILE
})
test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

const OLD_GUARD = JSON.stringify({
  ok: false,
  code: LEGACY_STRUCTURE_CODE,
  error: 'menu_set_items is refused'
})

test("an older template's 403 is read back as TEMPLATE_GUARD; any other answer is not", () => {
  assert.deepEqual(templateRefusal(403, OLD_GUARD), {
    ok: false,
    code: 'TEMPLATE_GUARD',
    platform: 'emdash',
    error: 'menu_set_items is refused'
  })
  assert.equal(templateRefusal(403, 'Forbidden'), null)
  assert.equal(templateRefusal(200, OLD_GUARD), null)
})

test('the next step of TEMPLATE_GUARD is the road that works: files under /app, then site.rebuild', () => {
  const next = refusalNext({ ok: false, code: 'TEMPLATE_GUARD', platform: 'emdash' }) ?? ''
  assert.match(next, /src\/styles\/tokens\.css/)
  assert.match(next, /site\.rebuild/)
  assert.match(next, /Never write the database directly/)
  assert.doesNotMatch(next, /sealed|locked|tell the customer/i)
})

test('a structural tool reaches every EmDash site: nothing is refused in the lane', async () => {
  const { cwd } = site()
  let ran = false
  const tools = register(
    config({
      mcp: () => {
        ran = true
        return mcpReply({ content: [{ type: 'text', text: 'ok' }] })
      }
    })
  )
  const out = await call(tools, { tool: 'schema_update_field', arguments: {} }, cwd)
  assert.equal(ran, true)
  assert.equal(out.ok, true)
})

test('an older template answering 403 comes back as TEMPLATE_GUARD with its next step', async () => {
  const { cwd } = site()
  const tools = register(config({ mcp: () => ({ code: 0, stdout: `TRACY_MCP 403\n${OLD_GUARD}` }) }))
  const out = await call(tools, { tool: 'menu_set_items', arguments: { name: 'primary', items: [] } }, cwd)
  assert.equal(out.code, 'TEMPLATE_GUARD')
  assert.equal(out.platform, 'emdash')
  assert.match(out.next, /site\.rebuild/)
})
