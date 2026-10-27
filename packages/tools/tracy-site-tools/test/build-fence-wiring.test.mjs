/**
 * The build fence as the SHIPPED plugin wires it (`lib/index.js`, `tools/pre-execute`): in a conversation that is a
 * demo or own-site build (its `tracy_demo` answered), no question reaches anybody — the agent's own, a door's
 * `confirm-` card, a shell rule's card, or a later listener's approval — and no template file is written. Any other
 * conversation keeps every road it had. Local round 31 (25/10/2026) stood 80 minutes on one such question.
 *
 *   node --test packages/tools/tracy-site-tools/test/build-fence-wiring.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { apply } from '../lib/index.js'

/** The plugin booted as dsh boots it, signed as the person who typed, with tracy-web answering every call. */
function boot(build = true) {
  const listeners = new Map()
  const tools = new Map()
  const typed = {
    type: 'user/message',
    data: { source: { kind: 'user', prompter: { user: 'Ada', email: 'ada@example.com' } } }
  }
  const services = {
    tracyAssertion: { mint: (email) => `signed:${email}` },
    sessions: { get: () => ({ snapshotEvents: () => [typed] }) },
    logger: { warn: () => {}, info: () => {} }
  }
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: (t) => (tools.set(t.name, t), () => {}), schemas: () => [] },
      effect: (setup) => void setup(),
      on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
      get: (name) => services[name]
    },
    {
      exec: async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }),
      emdash: { cms: async () => '' },
      origin: 'http://tracy.test',
      fetch: async () =>
        new Response(
          JSON.stringify(
            typeof build === 'object'
              ? build
              : build
                ? { ok: true }
                : { ok: false, code: 'AGENT_DEMO_NOT_GRANTED' }
          ),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        )
    }
  )
  return {
    listeners,
    tools,
    answer: (value) => {
      build = value
    }
  }
}

function siteFolder() {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-bfence-'))
  const cwd = path.join(root, 'lev')
  mkdirSync(path.join(cwd, '.tracy'), { recursive: true })
  process.env.TRACY_SITES_ROOT = root
  return cwd
}

const agentIn = (cwd, id, turn = 1) => ({
  session: { id, header: { cwd }, snapshotEvents: () => [{ type: 'turn/start', data: { turn } }] }
})
const call = (name, args, a) => ({ name, arguments: args, callId: `c-${name}`, agent: a })

/** Every `tools/pre-execute` listener in order, ending in `last` — what dsh runs. */
async function preExecute(host, exec, last = async () => ({ kind: 'allow' })) {
  const chain = host.listeners.get('tools/pre-execute') ?? []
  const at = (i) => (i < chain.length ? chain[i](exec, () => at(i + 1)) : last())
  return at(0)
}

const sidebarHeredoc = (cwd) =>
  [
    `cd ${cwd}/.webroot/wp-content/themes/wp-ja-restaurant/patterns && python3 - <<'EOF'`,
    "p='part-sidebar.php'",
    's=open(p).read().replace("\'Most Read\'","\'Popular stories\'")',
    "open(p,'w').write(s)",
    'EOF'
  ].join('\n')

test('🔒 round 31 in a build: no question is shown, the delete runs with no card, the theme pattern is not rewritten', async () => {
  const host = boot()
  const cwd = siteFolder()
  const a = agentIn(cwd, 'session-build')
  const answered = await host.tools
    .get('tracy_demo')
    .execute({ operation: 'read', part: 'catalogue' }, { agent: a })
  assert.notEqual(answered?.code, 'AGENT_DEMO_NOT_GRANTED', 'the conversation is a build')

  const card = await preExecute(
    host,
    call(
      'ask_user_question',
      {
        questions: [
          {
            id: 'confirm-1a3161d97e',
            header: 'Confirm',
            question: 'This deletes "sidebar" from your site. Go ahead?',
            options: [{ label: 'Yes, go ahead' }, { label: 'No, keep it' }]
          }
        ]
      },
      a
    )
  )
  assert.equal(card.kind, 'deny')
  assert.match(card.reason, /nobody answers during a build/)
  assert.match(card.reason, /the change it asks about is not made/)
  const own = await preExecute(
    host,
    call('ask_user_question', { questions: [{ id: 'which', question: 'Which?' }] }, a)
  )
  assert.equal(own.kind, 'deny')

  const del = await preExecute(
    host,
    call('bash', { command: `cd ${cwd}/.webroot && wp post delete 511 --force` }, a)
  )
  assert.equal(del.kind, 'deny')
  assert.match(del.reason, /a build asks nobody/)
  assert.doesNotMatch(del.reason, /ask_user_question \{/)

  const edit = await preExecute(host, call('bash', { command: sidebarHeredoc(cwd) }, a))
  assert.equal(edit.kind, 'deny')
  assert.match(edit.reason, /template's own file/)

  const read = await preExecute(
    host,
    call(
      'bash',
      { command: `cd ${cwd}/.webroot/wp-content/themes/wp-ja-restaurant && grep -rn "Most Read" .` },
      a
    )
  )
  assert.equal(read.kind, 'allow')

  const approval = await preExecute(host, call('bash', { command: 'ls' }, a), async () => ({ kind: 'ask' }))
  assert.equal(approval.kind, 'deny')
  assert.match(approval.reason, /approval nobody can give during a build/)
})

test('outside a build every road stays: the card is shown, the delete asks, the theme file may be edited', async () => {
  const host = boot(false)
  const cwd = siteFolder()
  const a = agentIn(cwd, 'session-chat')
  const own = await preExecute(
    host,
    call('ask_user_question', { questions: [{ id: 'which', question: 'Which?' }] }, a)
  )
  assert.equal(own.kind, 'allow')
  const del = await preExecute(
    host,
    call('bash', { command: `cd ${cwd}/.webroot && wp post delete 511 --force` }, a)
  )
  assert.equal(del.kind, 'deny')
  assert.match(del.reason, /ask_user_question \{/, 'a chat still asks the customer')
  const edit = await preExecute(host, call('bash', { command: sidebarHeredoc(cwd) }, a))
  assert.equal(edit.kind, 'allow')
  const approval = await preExecute(host, call('bash', { command: 'ls' }, a), async () => ({ kind: 'ask' }))
  assert.equal(approval.kind, 'ask', JSON.stringify(approval))
})

test('a closed build refuses mutations and questions before owner confirmation, while reads and fresh turns survive', async () => {
  const host = boot()
  const cwd = siteFolder()
  const a = agentIn(cwd, 'closed-build')
  const demo = () =>
    host.tools.get('tracy_demo').execute({ operation: 'read', part: 'catalogue' }, { agent: a })
  await demo()
  host.answer({ ok: false, code: 'AGENT_DEMO_ACTION_CLOSED' })
  await demo()
  let reachedOwner = 0
  const onward = async () => {
    reachedOwner++
    return { kind: 'ask' }
  }
  for (const [name, args] of [
    ['tracy_site', { action: 'content.replace', params: { find: 'old', replace: 'new' } }],
    ['tracy_site', { action: 'content.update', params: { id: 1, title: 'new' } }],
    ['tracy_emdash', { tool: 'content_update', args: { id: 'p', data: { title: 'new' } } }],
    ['tracy_demo', { operation: 'provision.start' }],
    ['tracy_demo', { operation: 'check' }],
    ['bash', { command: 'wp post delete 1 --force' }],
    ['bash', { command: 'ls' }],
    ['write', { file_path: '/app/page.astro', content: 'new' }],
    ['str_replace_editor', { command: 'str_replace', path: '/app/page.astro' }],
    ['ask_user_question', { questions: [{ id: 'confirm-closed', question: 'Proceed?' }] }],
    ['wrapper', { tool: 'bash', command: 'touch /app/new' }],
    ['tracy_site', { action: 'unknown.future.write' }]
  ]) {
    const answer = await preExecute(host, call(name, args, a), onward)
    assert.equal(answer.kind, 'deny', name)
    assert.match(answer.reason, /AGENT_DEMO_ACTION_CLOSED/, name)
    assert.doesNotMatch(answer.reason, /CONFIRM_FIRST|ask_user_question \{/)
  }
  assert.equal(reachedOwner, 0)
  for (const [name, args] of [
    ['tracy_site', { action: 'content.read', params: { id: 1 } }],
    ['tracy_site', { action: 'content.contract', params: { operation: 'inspect' } }],
    ['tracy_emdash', { tool: 'content_get', args: { id: 'p' } }],
    ['tracy_demo', { operation: 'read', part: 'catalogue' }],
    ['read', { file_path: '/app/page.astro' }],
    ['str_replace_editor', { command: 'view', path: '/app/page.astro' }]
  ])
    assert.equal((await preExecute(host, call(name, args, a))).kind, 'allow', name)

  const approval = await preExecute(host, call('read', { file_path: '/app/x' }, a), onward)
  assert.equal(approval.kind, 'deny')
  assert.match(approval.reason, /AGENT_DEMO_ACTION_CLOSED/)

  // A late success cannot restore write rights in the closed turn.
  host.answer({ ok: true })
  await demo()
  assert.equal((await preExecute(host, call('write', { file_path: '/app/x' }, a))).kind, 'deny')

  // The next owner turn has no inherited build rights or closed latch.
  const owner = agentIn(cwd, 'closed-build', 2)
  assert.equal((await preExecute(host, call('ask_user_question', { questions: [] }, owner))).kind, 'allow')
  await host.tools.get('tracy_demo').execute({ operation: 'read', part: 'catalogue' }, { agent: owner })
  const retry = await preExecute(host, call('ask_user_question', { questions: [] }, owner))
  assert.equal(retry.kind, 'deny')
  assert.match(retry.reason, /nobody answers during a build/)
})

test('native local writes wait for provision and the frozen plan, before they can reach owner confirmation', async () => {
  const host = boot()
  const a = agentIn(siteFolder(), 'provision-wait')
  for (const code of ['AGENT_DEMO_NOT_READY', 'AGENT_DEMO_PLAN_REQUIRED']) {
    host.answer({ ok: false, code })
    for (const [name, args] of [
      ['tracy_site', { action: 'content.replace', params: { find: 'old', replace: 'new' } }],
      ['tracy_site', { action: 'content.contract', params: { operation: 'apply', changes: {} } }],
      [
        'tracy_emdash',
        { tool: 'content_update', arguments: { collection: 'home', id: 'home', data: { title: 'new' } } }
      ]
    ]) {
      const refused = await preExecute(host, call(name, args, a), async () => {
        throw Error('write escaped readiness guard')
      })
      assert.equal(refused.kind, 'deny', name)
      assert.equal(refused.reason, code, name)
    }
    const read = await preExecute(host, call('tracy_site', { action: 'content.read' }, a))
    assert.equal(read.kind, 'allow')
  }
  host.answer({ ok: true, planHash: 'frozen' })
  assert.equal(
    (
      await preExecute(
        host,
        call('tracy_site', { action: 'content.replace', params: { find: 'old', replace: 'new' } }, a)
      )
    ).kind,
    'allow'
  )
  host.answer({ ok: false, code: 'AGENT_DEMO_NOT_GRANTED' })
  const owner = agentIn(a.session.header.cwd, 'ordinary-owner')
  assert.equal(
    (
      await preExecute(
        host,
        call('tracy_site', { action: 'content.replace', params: { find: 'old', replace: 'new' } }, owner)
      )
    ).kind,
    'allow'
  )
})

test('closed refusal after not-granted still fences mutations and questions; closure while listeners wait is rechecked', async () => {
  const host = boot(false)
  const a = agentIn(siteFolder(), 'terminal-escalation')
  const demo = () =>
    host.tools.get('tracy_demo').execute({ operation: 'read', part: 'catalogue' }, { agent: a })
  await demo()
  host.answer({ ok: false, code: 'AGENT_DEMO_ACTION_CLOSED' })
  await demo()
  for (const name of ['write', 'ask_user_question']) {
    const refused = await preExecute(host, call(name, {}, a))
    assert.equal(refused.kind, 'deny')
    assert.match(refused.reason, /AGENT_DEMO_ACTION_CLOSED/)
  }
  const newer = agentIn(a.session.header.cwd, a.session.id, 2)
  assert.equal((await preExecute(host, call('ask_user_question', {}, newer))).kind, 'allow')

  const racing = boot()
  const old = agentIn(siteFolder(), 'closing-in-parallel')
  await racing.tools.get('tracy_demo').execute({ operation: 'read', part: 'catalogue' }, { agent: old })
  const answer = await preExecute(
    racing,
    call('tracy_site', { action: 'content.replace', params: { find: 'old', replace: 'new' } }, old),
    async () => {
      racing.answer({ ok: false, code: 'AGENT_DEMO_ACTION_CLOSED' })
      await racing.tools.get('tracy_demo').execute({ operation: 'read', part: 'catalogue' }, { agent: old })
      return { kind: 'allow' }
    }
  )
  assert.equal(answer.kind, 'deny')
  assert.match(answer.reason, /AGENT_DEMO_ACTION_CLOSED/)
})
