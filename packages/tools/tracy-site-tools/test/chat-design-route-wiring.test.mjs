/**
 * The chat route to a design system as the SHIPPED plugin wires it (`lib/index.js`): `tracy_site
 * theme.style` and `tracy_design_system` follow the operator's switch `chat-design-system`, read at
 * Tracy's `/api/ui` (David, 11/10/2026: off by default, the Design system button is the only way in).
 *
 *   node --test packages/tools/tracy-site-tools/test/chat-design-route-wiring.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const { apply } = await import('../lib/index.js')

test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

function site() {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-chat-route-'))
  const dir = path.join(root, 'shop1')
  mkdirSync(path.join(dir, '.tracy'), { recursive: true })
  mkdirSync(path.join(dir, '.webroot'), { recursive: true })
  writeFileSync(
    path.join(dir, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'shop1.tracy.test', platform: 'wordpress' })
  )
  process.env.TRACY_SITES_ROOT = root
  return dir
}

/** The plugin on a context with one session, the person who typed, and a fake Tracy. */
function plugin(hidden) {
  /** @type {{ url: string, method: string, headers: Record<string, string>, body: unknown }[]} */
  const asked = []
  const log = [
    {
      type: 'user/message',
      time: Date.now() - 1000,
      data: {
        source: { kind: 'user', prompter: { user: 'An', email: 'an@example.test' } },
        content: [{ type: 'text', text: 'Apply the Stripe design system to my site' }]
      }
    }
  ]
  const tools = new Map()
  /** @type {Map<string, Function[]>} */
  const listeners = new Map()
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: (t) => (tools.set(t.name, t), () => {}) },
      effect: (setup) => void setup(),
      on: (name, fn) => {
        listeners.set(name, [...(listeners.get(name) ?? []), fn])
        return () => {}
      },
      get: (name) =>
        name === 'sessions'
          ? { get: () => ({ snapshotEvents: () => log }) }
          : name === 'tracyAssertion'
            ? { mint: (email) => `signed:${email}` }
            : undefined
    },
    {
      origin: 'http://tracy.test',
      fetch: async (url, init = {}) => {
        const u = String(url)
        asked.push({
          url: u,
          method: init.method ?? 'GET',
          headers: /** @type {any} */ (init.headers ?? {}),
          body: init.body
        })
        if (u.endsWith('/api/ui')) return new Response(JSON.stringify({ hidden }), { status: 200 })
        if (u.endsWith('/design-system'))
          return hidden.includes('chat-design-system') && init.method === 'POST'
            ? new Response(JSON.stringify({ code: 'CHAT_DESIGN_SYSTEM_OFF', message: 'off' }), {
                status: 403
              })
            : new Response(JSON.stringify({ ok: true, worn: { id: 'stripe' } }), { status: 200 })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
    }
  )
  /** The customer answers a refusal's own question with its first option (the go-ahead). */
  const answer = (refusal, cwd) => {
    const [q] = refusal.ask.questions
    for (const fn of listeners.get('tools/result') ?? [])
      fn(
        {
          name: 'ask_user_question',
          arguments: refusal.ask,
          agent: { session: { id: 'session-c', header: { cwd } } }
        },
        { isError: false, value: { answers: [{ id: q.id, selected: [q.options[0].label] }] } }
      )
  }
  return { tools, asked, answer }
}

const exec = (cwd) => ({ agent: { session: { id: 'session-c', header: { cwd } } } })

test('switch off (the default): theme.style from the chat is refused before anything reaches the site', async () => {
  const cwd = site()
  const { tools, asked } = plugin(['chat-design-system'])
  const answer = await tools
    .get('tracy_site')
    .execute({ action: 'theme.style', params: { style: 'stripe' } }, exec(cwd))
  assert.equal(answer.code, 'CHAT_DESIGN_SYSTEM_OFF', JSON.stringify(answer))
  assert.match(answer.error, /Design system row on the site's start screen/)
  assert.ok(!asked.some((a) => a.url.endsWith('/apply')), 'no Apply call was made')
})

test('switch on: theme.style is not refused by the switch; it asks the customer first, as every site-wide change does', async () => {
  const cwd = site()
  const { tools } = plugin([])
  const out = await tools
    .get('tracy_site')
    .execute({ action: 'theme.style', params: { style: 'stripe' } }, exec(cwd))
  // Council 19/10/2026 (`consequence.mjs`): every page changes, so the customer's yes comes first.
  assert.equal(out.code, 'CONFIRM_FIRST', JSON.stringify(out).slice(0, 300))
  assert.equal(out.consequence, 'site')
})

/** A library id the door applies (Refero only since 12/10/2026). */
const REFERO = 'refero:0b9d2c1e-4a5f-4c8e-9d7a-1f2e3d4c5b6a'

test("tracy_design_system: the button's door, as the person who typed, named as this conversation, after the customer's yes", async () => {
  const cwd = site()
  const off = plugin(['chat-design-system'])
  const refused = await off.tools
    .get('tracy_design_system')
    .execute({ action: 'apply', id: REFERO }, exec(cwd))
  assert.equal(refused.code, 'CHAT_DESIGN_SYSTEM_OFF')
  assert.ok(
    !off.asked.some((a) => a.url.endsWith('/design-system')),
    'refused before the door and before any question: the customer is never asked about an apply the switch refuses'
  )

  const read = await off.tools.get('tracy_design_system').execute({ action: 'read' }, exec(cwd))
  assert.equal(read.ok, true, 'reading what the site wears stays open')

  // ADR 0034 (council 19/10/2026): every page changes, so the customer answers the door's own question first.
  const on = plugin([])
  const apply = (args) => on.tools.get('tracy_design_system').execute(args, exec(cwd))
  const posted = () => on.asked.filter((a) => a.url.endsWith('/design-system') && a.method === 'POST')
  const asked = await apply({ action: 'apply', id: REFERO })
  const unasked = await apply({ action: 'apply', id: REFERO, confirm: true })
  assert.deepEqual([asked.code, asked.consequence], ['CONFIRM_FIRST', 'site'])
  assert.equal(unasked.code, 'CONFIRM_FIRST', "the agent's own confirm is not the customer's word")
  assert.deepEqual(posted(), [], 'nothing applied before the yes')

  on.answer(unasked, cwd)
  const applied = await apply({ action: 'apply', id: REFERO, confirm: true })

  assert.equal(applied.ok, true)
  const [call] = posted()
  assert.equal(call?.url, 'http://tracy.test/api/sites/shop1.tracy.test/design-system')
  assert.equal(call?.headers['x-tracy-actor'], 'signed:an@example.test')
  assert.equal(call?.headers['x-tracy-session'], 'session-c')
  assert.equal(call?.headers['x-tracy-workspace-label'], 'shop1')
})
