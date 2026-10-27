import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { BUILD_NOT_FOR, makeSiteBuildHost } from '../src/host/host.ts'

/** A registered build tool for one site folder, with two requests: one on the site, one a build change. */
function hostFor(
  root,
  perform = async (_input, job) => ({ ok: true, detail: `rebuilt ${job.targetSiteKey}` })
) {
  const tools = []
  const ctx = {
    webServer: { register: () => () => {} },
    tools: { register: (tool) => (tools.push(tool), () => {}) },
    effect: (fn) => fn(),
    get: () => ({ warn() {} })
  }
  makeSiteBuildHost({
    name: 'tracy-site-build-emdash',
    platform: 'emdash',
    platformName: 'EmDash',
    stages: ['seed'],
    tool: 'tracy_site_build_emdash',
    makeStages: () => ({ seed: () => ({ status: 'done' }) }),
    requests: {
      'site.rebuild': {
        recipe: 'container',
        hint: '{}',
        perform
      },
      'brief.name': {
        recipe: 'brief',
        hint: '{name}',
        change: (input) => ({ answers: { name: input.name } })
      }
    }
  })(ctx, { siteDir: root, chrome: null, loopback: 'http://127.0.0.1:1' })
  return tools[0]
}

// ADR 0022 (Lee, 26/09/2026): a customer's chat on a site built from another workspace owns no build
// job there; an operation on the site itself acts on the site the session stands in.
test('an operation on the site runs for a session that owns no build, on its own site only', async () => {
  const root = path.join(mkdtempSync(path.join(tmpdir(), 'site-request-')), 'r1e1734')
  mkdirSync(path.join(root, '.webroot'), { recursive: true })
  const tool = hostFor(root)
  const session = { id: 'chat-1', header: { cwd: root } }
  const done = await tool.execute({ action: 'request', operation: 'site.rebuild' }, { agent: { session } })
  assert.equal(done.ok, true)
  assert.equal(done.detail, 'rebuilt r1e1734')
  // A change to a build still needs the session's own build.
  const change = await tool.execute(
    { action: 'request', operation: 'brief.name', input: { name: 'x' } },
    { agent: { session } }
  )
  assert.equal(change.ok, false)
  assert.match(change.error, /owned build/)
})

test('a folder that is not a site gets no target', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'not-a-site-'))
  const tool = hostFor(root)
  const done = await tool.execute(
    { action: 'request', operation: 'site.rebuild' },
    { agent: { session: { id: 'chat-1', header: { cwd: root } } } }
  )
  assert.equal(done.ok, false)
})

// 27/09/2026: the Build tool names the doors a built site's words, menus and pictures go through.
test('the build tool says it is not for the words, menus or pictures of a site already built', () => {
  const tool = hostFor(mkdtempSync(path.join(tmpdir(), 'build-not-for-')))
  assert.ok(tool.description.includes(BUILD_NOT_FOR))
  assert.match(BUILD_NOT_FOR, /tracy_site \(content\.replace first\)/)
})

// TCH #1100 (10/10/2026): `site.rebuild` on an EmDash site wearing a design-system slot names the classes
// that pin the slot's values (`findings`) and orders the fix before the reply (`next`). The host hands
// both to the agent as the operation gave them; an operation that gives neither answers as before.
test('an operation that found something hands its findings and its own next to the agent; one that found nothing keeps the default', async () => {
  const root = path.join(mkdtempSync(path.join(tmpdir(), 'site-request-')), 'pins1')
  mkdirSync(path.join(root, '.webroot'), { recursive: true })
  const session = { id: 'chat-1', header: { cwd: root } }
  const finding = {
    at: 'src/views/Home.astro:85',
    class: '!rounded-full',
    use: '!rounded-[var(--ds-btn-radius,9999px)]',
    why: 'x'
  }
  const found = await hostFor(root, async () => ({
    ok: true,
    detail: 'built',
    findings: [finding],
    next: 'Fix the pins first.'
  })).execute({ action: 'request', operation: 'site.rebuild' }, { agent: { session } })
  assert.equal(found.ok, true)
  assert.deepEqual(found.findings, [finding])
  assert.equal(found.next, 'Fix the pins first.')
  const plain = await hostFor(root).execute(
    { action: 'request', operation: 'site.rebuild' },
    { agent: { session } }
  )
  assert.equal(plain.findings, undefined)
  assert.equal(plain.next, 'Tell the customer in one line what changed and where to look.')
})
