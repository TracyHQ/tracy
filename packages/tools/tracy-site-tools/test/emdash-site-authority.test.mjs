import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

// 🔒 #184, at the registered handler. The pure suite (`emdash.test.mjs`) pins `emdashSiteOf`; this
// one drives the ACTUAL registered `tracy_emdash` `execute` (the shipped `lib/index.js`) through the
// `config.exec` seam, to prove the site fence refuses a caller-named siteKey BEFORE any filesystem,
// exec, or token read — and that a safe same-site call still reaches the exec. The harness is copied
// minimally from `handler.test.mjs`. Tests use the built host bundle to exercise the shipped handler.
import { apply } from '../lib/index.js'

/** A HostContext just real enough for `apply` to register its tools; captures them by name. */
function register(config) {
  const tools = new Map()
  const ctx = {
    webServer: { register: () => () => {} },
    tools: { register: (t) => (tools.set(t.name, t), () => {}) },
    effect: (setup) => {
      setup()
    },
    on: () => {},
    get: () => undefined // no logger, no llm, no sessions, no assertion — every optional service absent
  }
  apply(ctx, config)
  return tools
}

/** A sites root with one empty label folder; returns the cwd for a session standing on that site. */
function siteWorkspace(label = 'owned-site') {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-authority-'))
  mkdirSync(path.join(root, label), { recursive: true })
  process.env.TRACY_SITES_ROOT = root
  return { root, label, cwd: path.join(root, label) }
}

/** Route a fake docker-exec by the kind of call, exactly as the real handler classifies its argv. */
const execFor = (byKind) => async (input) => {
  const argv = input.argv
  const kind = argv[1] === '-i' ? 'mcp' : argv.includes('timeout') ? 'browser' : 'probe'
  const out = byKind[kind]
  if (typeof out === 'function') return out(input)
  return { code: 0, stdout: '', stderr: '', timedOut: false, ...out }
}

const emdashConfig = (execByKind) => ({ emdash: { cms: async () => 'emdash' }, exec: execByKind })

const runEmdash = (tools, args, cwd) =>
  tools.get('tracy_emdash').execute(args, { agent: { session: { id: 'session-x', header: { cwd } } } })

test.beforeEach(() => {
  // The lane's own site key is read from the environment; keep host mode (no configured lane) so a
  // refusal here is the fence's doing, not a leftover MCP_TRACY_SITE_KEY from another suite.
  delete process.env.MCP_TRACY_SITE_KEY
  delete process.env.DSH_PASSWORDS_ENV_FILE
})
test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

test('🔒 tracy_emdash: a siteKey with NO own-site cwd is refused before config.exec runs (#184)', async () => {
  // Host mode, session not standing in any site: a caller-named siteKey must not reach that site —
  // the door would use the TARGET site's own admin token, so a key that granted authority would
  // reach any customer. The refusal must land before the filesystem/exec/token reads.
  siteWorkspace('owned-site')
  const tools = register(
    emdashConfig(async () => assert.fail('exec must not run for a siteKey with no trusted own site'))
  )
  const out = await runEmdash(
    tools,
    { tool: 'content_list', siteKey: 'other-site.example.test' },
    '/tmp/not-a-site' // outside the sites root: no own site to confirm the request against
  )
  assert.equal(out.ok, false)
  assert.equal(out.code, 'NO_SITE')
  // Honest: it must not tell an unrooted caller that providing a siteKey would open the site.
  assert.doesNotMatch(out.error ?? '', /provide siteKey/i)
})

test('🔒 tracy_emdash {list}: a siteKey with no own-site cwd is refused before config.exec (#184)', async () => {
  // The {list:true} path forwards siteKey without the shape check the {tool} path applies, so it is
  // the more permissive door — it must refuse just the same.
  siteWorkspace('owned-site')
  const tools = register(
    emdashConfig(async () => assert.fail('exec must not run for a listing named by siteKey alone'))
  )
  const out = await runEmdash(tools, { list: true, siteKey: 'other-site.example.test' }, '/tmp/not-a-site')
  assert.equal(out.ok, false)
  assert.equal(out.code, 'NO_SITE')
})

test('🔒 tracy_emdash: naming a foreign site from a rooted session is refused before config.exec', async () => {
  // The classic cross-site request, at the handler: own site established, a different one asked.
  const { cwd } = siteWorkspace('owned-site')
  const tools = register(
    emdashConfig(async () => assert.fail('exec must not run for a foreign site request'))
  )
  const out = await runEmdash(tools, { tool: 'content_list', siteKey: 'other-site.example.test' }, cwd)
  assert.equal(out.ok, false)
  assert.equal(out.code, 'SITE_OUTSIDE_CONVERSATION')
})

test('tracy_emdash: a safe same-site call still reaches the site (valid path preserved)', async () => {
  // The fence must not over-refuse: a session on its own site, with no siteKey, reaches its own
  // EmDash MCP through config.exec and returns the catalogue.
  const { cwd } = siteWorkspace('owned-site')
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { tools: [{ name: 'content_list', description: 'd', inputSchema: {} }] }
  })
  let ran = false
  const tools = register(
    emdashConfig(
      execFor({
        mcp: (input) => {
          ran = true
          assert.match(input.argv.join(' '), /owned-site-web-1/) // the session's OWN container
          return { code: 0, stdout: `TRACY_MCP 200\n${body}` }
        }
      })
    )
  )
  const out = await runEmdash(tools, { list: true }, cwd)
  assert.equal(ran, true, 'the exec must run for a safe same-site call')
  assert.equal(out.ok, true)
  assert.equal(out.site, 'owned-site')
  // One line per tool, not every argument schema: r2 answered {list:true} with 49,977 characters in
  // 32 of 33 EmDash turns; `{list:true, tools:[names]}` gives the schemas of the tools asked for.
  assert.deepEqual(out.tools, ['content_list — d'])
})

test('tracy_emdash: a same-site request that AGREES with the own site is honoured, and reaches only it', async () => {
  // An explicit siteKey that names the session's own site confirms identity; it does not change which
  // container is reached, and the request still lands on the own site only.
  const { cwd } = siteWorkspace('owned-site')
  const sse =
    'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"ok"}]}}\n\n'
  const tools = register(
    emdashConfig(
      execFor({
        mcp: (input) => {
          assert.match(input.argv.join(' '), /owned-site-web-1/)
          assert.doesNotMatch(input.argv.join(' '), /other-site/)
          return { code: 0, stdout: `TRACY_MCP 200\n${sse}` }
        }
      })
    )
  )
  const out = await runEmdash(
    tools,
    { tool: 'content_get', arguments: { id: 1 }, siteKey: 'owned-site.example.test' },
    cwd
  )
  assert.equal(out.ok, true)
  assert.equal(out.site, 'owned-site')
})
