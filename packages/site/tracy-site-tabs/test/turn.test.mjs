/**
 * What a finished turn did to the site, and which tabs may be reloaded for it.
 *
 *   node --test packages/site/tracy-site-tabs/test/turn.test.mjs
 *
 * Four parts. The host's reading of the session log (`siteChangedInTurn`), the page's reading of
 * the conversation on screen (`followTurnEnds` — when one of its turns has ended) and of its own layout
 * (`browserTabsOn` / `hostsOfSite`), and the built `lib/index.js` driven end to end over the `turn`
 * door — the bundle the fleet image copies, so a stale build fails here.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { test } from 'node:test'

import {
  browserTabsOn,
  followTurnEnds,
  hostsOfSite,
  siteTabReloader,
  turnEndedIn
} from '../src/client/site-reload.mjs'
import { callChangedSite, sessionSiteKey, siteChangedInTurn, turnRefreshMode } from '../src/host/turn.mjs'

/** One turn's worth of log: a `turn/start`, then the calls it made. */
const turn = (...calls) => [
  { type: 'user/message', data: { content: [{ type: 'text', text: 'Change the header' }] } },
  { type: 'turn/start', data: {} },
  ...calls.map((data) => ({ type: 'tool/call', data }))
]

// ── The host's reading of the log ───────────────────────────────────────────────────────────────

test('a turn that only looked changes nothing', () => {
  const looked = turn(
    { name: 'tracy_site', arguments: { action: 'info' } },
    { name: 'tracy_site', arguments: JSON.stringify({ action: 'content.list', kind: 'article' }) },
    { name: 'read', arguments: { file_path: '/site/lantern/.webroot/index.php' } },
    { name: 'grep', arguments: { path: '/site/lantern/.webroot', pattern: 'Cassiopeia' } },
    { name: 'browser_read', arguments: {} },
    { name: 'tracy_site', arguments: { action: 'page.look', path: '/' } }
  )
  assert.equal(siteChangedInTurn(looked), false)
})

test('a tracy_site write, a shell command, or a write inside .webroot changes the site', () => {
  for (const call of [
    { name: 'tracy_site', arguments: { action: 'content.update', kind: 'templateStyle' } },
    { name: 'tracy_site', arguments: JSON.stringify({ action: 'db.snapshot' }) },
    { name: 'bash', arguments: { command: 'php cli/joomla.php cache:clean' } },
    { name: 'pwsh', arguments: { command: 'wp option update blogname Lantern' } },
    { name: 'write', arguments: { file_path: '/site/lantern/.webroot/style.css', content: 'a{}' } },
    { name: 'edit', arguments: { file_path: '/site/lantern/.webroot/index.php' } },
    { name: 'str_replace_editor', arguments: { path: '/site/lantern/.webroot/x.php', new_str: 'hi' } }
  ]) {
    assert.equal(callChangedSite(call), true, JSON.stringify(call.name))
    assert.equal(siteChangedInTurn(turn(call)), true, JSON.stringify(call.name))
  }
})

test('a write outside .webroot is the team’s notes, not the website', () => {
  for (const file of [
    '/site/lantern/docs/agents/db-changes/2026-09-16.md',
    '/site/lantern/TracyWork/plan.md',
    '/site/lantern/Brand/lantern.tracy.site/tokens.css'
  ]) {
    assert.equal(callChangedSite({ name: 'write', arguments: { file_path: file } }), false, file)
  }
  // No readable path, or arguments that do not parse: the call is not evidence of a change.
  assert.equal(callChangedSite({ name: 'edit', arguments: '{oops' }), false)
  assert.equal(callChangedSite({ name: 'tracy_site', arguments: { action: '  ' } }), false)
  assert.equal(callChangedSite(undefined), false)
})

test('an EmDash write through tracy_emdash changes the site; its reads and the tool list do not', () => {
  // EmDash 0.37's MCP tools (`vendor/emdash/emdash/packages/core/src/mcp/server.ts`), read and write.
  const reads = [
    'byline_get',
    'byline_list',
    'byline_translations',
    'content_compare',
    'content_get',
    'content_list',
    'content_list_trashed',
    'content_translations',
    'media_get',
    'media_list',
    'menu_get',
    'menu_list',
    'menu_translations',
    'revision_list',
    'schema_get_collection',
    'schema_list_collections',
    'settings_get',
    'taxonomy_get',
    'taxonomy_list',
    'taxonomy_list_terms',
    'taxonomy_term_translations'
  ]
  const writes = [
    'byline_create',
    'byline_delete',
    'byline_update',
    'content_create',
    'content_delete',
    'content_discard_draft',
    'content_duplicate',
    'content_permanent_delete',
    'content_publish',
    'content_restore',
    'content_schedule',
    'content_unpublish',
    'content_unschedule',
    'content_update',
    'media_create',
    'media_delete',
    'media_update',
    'media_upload',
    'media_usage_repair',
    'menu_create',
    'menu_delete',
    'menu_set_items',
    'menu_update',
    'revision_restore',
    'schema_create_collection',
    'schema_create_field',
    'schema_delete_collection',
    'schema_delete_field',
    'schema_update_collection',
    'schema_update_field',
    'settings_update',
    'taxonomy_create',
    'taxonomy_create_term',
    'taxonomy_delete',
    'taxonomy_delete_term',
    'taxonomy_update',
    'taxonomy_update_term'
  ]
  for (const tool of reads)
    assert.equal(callChangedSite({ name: 'tracy_emdash', arguments: { tool } }), false, tool)
  for (const tool of writes) {
    const call = { name: 'tracy_emdash', arguments: JSON.stringify({ tool, arguments: {} }) }
    assert.equal(callChangedSite(call), true, tool)
  }
  // Listing the tools, a name the door refuses, and no tool at all reach no site.
  assert.equal(callChangedSite({ name: 'tracy_emdash', arguments: { list: true } }), false)
  assert.equal(callChangedSite({ name: 'tracy_emdash', arguments: { tool: 'Content-Update' } }), false)
  assert.equal(callChangedSite({ name: 'tracy_emdash', arguments: {} }), false)
})

test('the turn measured on EmDash 23/09 — reads, then content_update + content_publish — is a full refresh', () => {
  const added = turn(
    { name: 'skill', arguments: { name: 'emdash-site' } },
    { name: 'tracy_emdash', arguments: { list: true } },
    { name: 'tracy_emdash', arguments: { tool: 'content_list', arguments: { collection: 'home' } } },
    { name: 'tracy_site', arguments: { action: 'page.text', params: { path: '/', match: 'What we do' } } },
    {
      name: 'tracy_emdash',
      arguments: { tool: 'content_update', arguments: { collection: 'home', id: 'h', data: {} } }
    },
    {
      name: 'tracy_emdash',
      arguments: { tool: 'content_publish', arguments: { collection: 'home', id: 'h' } }
    },
    { name: 'tracy_site', arguments: { action: 'apply.list', params: {} } }
  )
  assert.equal(turnRefreshMode(added), 'full')
  // The same turn without its two writes only looked.
  assert.equal(
    turnRefreshMode(added.filter((e) => !/content_(update|publish)/.test(JSON.stringify(e.data ?? {})))),
    null
  )
})

test("EmDash reads are EmDash's own read list, read through the door's shape repair", () => {
  // `search` has no `_` verb: the old verb heuristic got it right by coincidence, the list by name.
  assert.equal(
    callChangedSite({ name: 'tracy_emdash', arguments: { tool: 'search', arguments: { query: 'x' } } }),
    false
  )
  // The door runs `content.update` as content_update, so it is the write it will be.
  assert.equal(
    callChangedSite({ name: 'tracy_emdash', arguments: { tool: 'content.update', arguments: {} } }),
    true
  )
  assert.equal(
    callChangedSite({ name: 'tracy_emdash', arguments: { tool: 'content.get', arguments: {} } }),
    false
  )
  // Answered elsewhere, or refused by the door: no EmDash tool ran.
  for (const tool of ['page.text', 'page_look', 'apply.list', 'apply_revert'])
    assert.equal(callChangedSite({ name: 'tracy_emdash', arguments: { tool, arguments: {} } }), false, tool)
})

test('a tracy_site call is read the way the relay sends it: aliases, a contract inspect, a dryRun', () => {
  const site = (args) => callChangedSite({ name: 'tracy_site', arguments: args })
  assert.equal(site({ action: 'contract.apply', params: { changes: {} } }), true)
  assert.equal(site({ action: 'content.contract', params: { operation: 'apply', changes: {} } }), true)
  assert.equal(site({ action: 'content.contract', operation: 'multilingual.retire' }), true)
  // The component reads an absent operation as an inspect: looking, not changing.
  assert.equal(site({ action: 'content.contract', params: { page: 'home', slots: 'text' } }), false)
  assert.equal(site({ action: 'contract.inspect' }), false)
  assert.equal(site(JSON.stringify({ action: 'content_contract', params: { operation: 'inspect' } })), false)
  // A language plan or verify pass only reads (claude-cowork Engine.php:1186-1214): the step counter's
  // own reading (`contractOperationWrites`), so the preview does not reload on a plan.
  assert.equal(site({ action: 'content.contract', params: { operation: 'multilingual.plan' } }), false)
  assert.equal(site({ action: 'content.contract', params: { operation: 'multilingual.verify' } }), false)
  assert.equal(site({ action: 'content.contract', params: { operation: 'multilingual.apply' } }), true)
  // A dryRun writes nothing, wherever the model put it.
  assert.equal(site({ action: 'content.replace', params: { find: 'a', replace: 'b', dryRun: true } }), false)
  assert.equal(site({ action: 'content.replace', dryRun: true, params: { find: 'a', replace: 'b' } }), false)
  assert.equal(site({ action: 'content.replace', params: { find: 'a', replace: 'b' } }), true)
})

/**
 * A result as dsh 0.1.7 logs it — session format V4: a tool-role message with the answer's blocks
 * directly in `content` and the error flag on the MESSAGE (`session-format-v3-to-v4`
 * `src/tool-role.ts`), and `isError:false` on a Tracy refusal (DeepSeek's endpoint ignores the flag).
 */
const logged = (callId, text, isError = false) => ({
  type: 'tool/result',
  data: {
    message: {
      role: 'tool',
      source: { kind: 'tool', callId },
      toolCallId: callId,
      content: [{ type: 'text', text }],
      isError
    }
  }
})
const called = (callId, name, args) => ({ type: 'tool/call', data: { callId, name, arguments: args } })

test('🔒 a refused door call never reloads the preview: asking is not doing', () => {
  const log = [
    { type: 'user/message', data: { content: [{ type: 'text', text: 'Delete the news page' }] } },
    { type: 'turn/start', data: {} },
    called('c1', 'tracy_emdash', { tool: 'content_delete', arguments: { collection: 'posts', id: 'X' } }),
    logged('c1', '{"ok":false,"code":"CONFIRM_FIRST","tool":"content_delete","next":"ask_user_question …"}'),
    called('c2', 'tracy_site', { action: 'content.update', params: { kind: 'post', id: 42 } }),
    logged('c2', '{"ok":false,"code":"BODY_SHRINK","error":"post_content is 252 chars"}'),
    // Arguments as JSON text, as dsh stores them too.
    called(
      'c3',
      'tracy_emdash',
      JSON.stringify({ tool: 'content_update', arguments: { collection: 'home', status: 'published' } })
    ),
    logged('c3', '{"ok":false,"code":"PENDING_DRAFT","tool":"content_update","draftFields":["hero_title_a"]}')
  ]
  assert.equal(turnRefreshMode(log), null)
  // The same turn with one door call that went through does reload.
  const through = [
    ...log,
    called('c4', 'tracy_emdash', { tool: 'content_update', arguments: { collection: 'home' } }),
    logged('c4', '{"ok":true,"site":"ed-ivj9ni","tool":"content_update","result":{"live":true}}')
  ]
  assert.equal(turnRefreshMode(through), 'full')
  // A call with no result yet (or no id) is read as a change: the direction that reloads.
  assert.equal(turnRefreshMode(turn({ name: 'tracy_emdash', arguments: { tool: 'content_update' } })), 'full')
})

test('🔒 a refusal that does not know whether the call ran still reloads the preview', () => {
  // P4 and review 25/09: the relay's timeout, an unreachable component, a writer_busy that is not the
  // lock miss, EmDash SITE_UNREACHABLE on a write, a gateway 502 — the write may have landed.
  const unknown = [
    '{"ok":false,"code":"COWORK_WEB_UNREACHABLE","error":"The operation was aborted due to timeout"}',
    '{"ok":false,"code":"COWORK_WEB_BAD_RESPONSE","error":"not JSON"}',
    '{"ok":false,"code":"COMPONENT_UNREACHABLE","error":"connect ECONNREFUSED"}',
    '{"ok":false,"code":"COMPONENT_BAD_RESPONSE","error":"HTML"}',
    '{"ok":false,"error":"writer_busy","message":"Call to a member function x() on null"}',
    '{"ok":false,"code":"SITE_UNREACHABLE","tool":"content_update","error":"exec timed out"}',
    '{"ok":false,"code":"SITE_REFUSED","httpStatus":502,"tool":"content_update"}'
  ]
  for (const text of unknown) {
    const log = [
      { type: 'turn/start', data: {} },
      called('c1', 'tracy_site', { action: 'content.update', params: { kind: 'post', id: 42 } }),
      logged('c1', text)
    ]
    assert.equal(turnRefreshMode(log), 'full', text)
  }
  // The lock miss itself proves nothing ran: still no reload.
  const lockMiss = [
    { type: 'turn/start', data: {} },
    called('c1', 'tracy_site', { action: 'content.update', params: { kind: 'post', id: 42 } }),
    logged('c1', '{"ok":false,"error":"writer_busy","message":"another writer is changing this site"}')
  ]
  assert.equal(turnRefreshMode(lockMiss), null)
})

test('🔒 the answer\'s own top-level ok decides: an "ok":false inside the site\'s content still reloads', () => {
  const log = [
    { type: 'turn/start', data: {} },
    called('c1', 'tracy_emdash', { tool: 'settings_update', arguments: { title: 'x' } }),
    // A successful answer whose content carries a customer's own JSON with "ok":false in it.
    logged(
      'c1',
      JSON.stringify({
        ok: true,
        tool: 'settings_update',
        result: {
          changed: { status_widget: { before: { ok: true }, after: { ok: false, label: 'Closed' } } }
        }
      })
    )
  ]
  assert.equal(turnRefreshMode(log), 'full')
})

test('a shell or a file tool counts whatever its result: it may have written before it failed', () => {
  const bash = [
    { type: 'turn/start', data: {} },
    called('c1', 'bash', { command: 'wp option update blogname X && wp cache flush' }),
    logged('c1', 'Success: Updated.\nError: cache flush failed', true)
  ]
  assert.equal(turnRefreshMode(bash), 'full')
  const css = [
    { type: 'turn/start', data: {} },
    called('c1', 'edit', { file_path: '/site/x/.webroot/wp-content/themes/tracy/style.css' }),
    logged('c1', '{"ok":false,"error":"old_string matched twice"}', true)
  ]
  assert.equal(turnRefreshMode(css), 'style')
})

test('only the LAST turn counts — a change two turns ago has already been shown', () => {
  const log = [
    ...turn({ name: 'bash', arguments: { command: 'wp theme activate tracy' } }),
    ...turn({ name: 'tracy_site', arguments: { action: 'info' } })
  ]
  assert.equal(siteChangedInTurn(log), false)
  assert.equal(siteChangedInTurn([]), false)
  assert.equal(siteChangedInTurn(undefined), false)
})

test('a lane names its own site; the host dsh names the folder the session stands in', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'site-tabs-turn-'))
  try {
    mkdirSync(path.join(root, 'lantern', '.tracy'), { recursive: true })
    writeFileSync(
      path.join(root, 'lantern', '.tracy', 'site.json'),
      JSON.stringify({ siteKey: 'lantern.tracy.ai' })
    )
    mkdirSync(path.join(root, 'harbor'), { recursive: true })
    const env = { TRACY_SITES_ROOT: root }
    assert.equal(
      await sessionSiteKey({ cwd: '/anywhere', laneSiteKey: 'lane.tracy.ai', env }),
      'lane.tracy.ai'
    )
    assert.equal(
      await sessionSiteKey({ cwd: path.join(root, 'lantern', 'TracyWork'), laneSiteKey: null, env }),
      'lantern.tracy.ai'
    )
    // No `site.json` yet (a site still being built): the folder label is what its address is made of.
    assert.equal(await sessionSiteKey({ cwd: path.join(root, 'harbor'), laneSiteKey: null, env }), 'harbor')
    // A session standing outside every site folder has no site to reload.
    assert.equal(await sessionSiteKey({ cwd: '/desk-home/onboarding', laneSiteKey: null, env }), null)
    assert.equal(await sessionSiteKey({ cwd: undefined, laneSiteKey: null, env }), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── The page's reading of the open previews ────────────────────────────────────────────────────

/** A native preview as `openTabsOf('tracy:browser')` answers it: the address in `meta.url`. */
const preview = (id, url) => ({ id, type: 'tracy:browser', title: id, meta: { url } })

/**
 * What the side card answers (better-sidebar 0.21.1-tracy.1): the native previews of dsh's right
 * column — whatever pane or floating panel holds them — then its own bottom panel's, which keeps the
 * address in `path`.
 */
const open = () => [
  preview('tab-1', 'https://lantern.tracy.ai/about'),
  preview('tab-2', 'https://harbor.tracy.ai/'),
  preview('tab-5', 'https://lantern.tracy.ai/contact'),
  { id: 'bottom-4', type: 'tracy:browser', title: 'shop', path: 'http://lantern.localhost:8080/shop' }
]

test('every preview on the site reloads — native tabs and the bottom panel alike', () => {
  const hosts = hostsOfSite('lantern.tracy.ai', [
    { siteKey: 'lantern.tracy.ai', copyUrl: 'http://lantern.localhost:8080/' },
    { siteKey: 'harbor.tracy.ai', copyUrl: 'http://harbor.localhost:8080/' }
  ])
  assert.deepEqual([...hosts], ['lantern.tracy.ai', 'lantern.localhost'])
  assert.deepEqual(browserTabsOn(open(), hosts), ['tab-1', 'tab-5', 'bottom-4'])
})

test('a managed public alias reloads its site previews too', () => {
  const hosts = hostsOfSite('shop.example.com', [
    {
      siteKey: 'internal.tracy.ai',
      aliases: ['internal.tracy.ai', 'shop.example.com'],
      copyUrl: 'https://shop.example.com/'
    }
  ])
  assert.equal(hosts.has('internal.tracy.ai'), true)
  assert.equal(hosts.has('shop.example.com'), true)
  assert.deepEqual(browserTabsOn([preview('alias', 'https://shop.example.com/about')], hosts), ['alias'])
})

test('a preview on another site, a tab of another type, and an unreadable address are left alone', () => {
  const hosts = hostsOfSite('harbor.tracy.ai', [{ siteKey: 'harbor.tracy.ai', copyUrl: null }])
  assert.deepEqual(browserTabsOn(open(), hosts), ['tab-2'])
  const odd = [
    preview('tab-9', 'not a url'),
    { id: 'tab-10', type: 'tracy:browser' },
    { id: 'tab-11', type: 'tracy:changes', meta: { url: 'https://harbor.tracy.ai/' } },
    // The upstream browser type left at 0.21.1: a record of it is not a Tracy preview.
    { id: 'tab-12', type: 'browser', path: 'https://harbor.tracy.ai/' }
  ]
  assert.deepEqual(browserTabsOn(odd, hosts), [])
  assert.deepEqual(browserTabsOn(undefined, hosts), [])
})

test('a site with no address anywhere names no host, so nothing is reloaded', () => {
  // A local label is not a hostname and `/api/sites` has no row for it yet.
  assert.equal(hostsOfSite('harbor', []).size, 0)
  assert.deepEqual(browserTabsOn(open(), hostsOfSite('harbor', [])), [])
})

/** A side card that records every `reloadTab` it is asked for. */
function reloadingSidebar(tabs, sessionId = 's1') {
  const asked = []
  const sidebar = {
    session: sessionId,
    getSnapshot: () => ({ sessionId: sidebar.session }),
    openTabsOf: (type) => tabs.filter((t) => t.type === type),
    reloadTab: (tabId, mode) => asked.push([tabId, mode])
  }
  return { sidebar, asked }
}

test('🔒 every Browser tab on the changed site is asked ONCE per change, the tab someone comments in included', () => {
  // `tab-1` holds the address the site key names (the tab a comment was sent from, on production);
  // `bottom-4` only answers at the served address, found in the second pass.
  const { sidebar, asked } = reloadingSidebar(open())
  const reloadOn = siteTabReloader(sidebar, 's1', 'full')
  reloadOn(hostsOfSite('lantern.tracy.ai', []))
  reloadOn(
    hostsOfSite('lantern.tracy.ai', [
      { siteKey: 'lantern.tracy.ai', copyUrl: 'http://lantern.localhost:8080/' }
    ])
  )
  assert.deepEqual(asked, [
    ['tab-1', 'full'],
    ['tab-5', 'full'],
    ['bottom-4', 'full']
  ])
})

test('the mode rides along: a turn that only wrote stylesheets asks for a style refresh', () => {
  const { sidebar, asked } = reloadingSidebar(open())
  siteTabReloader(sidebar, 's1', 'style')(hostsOfSite('harbor.tracy.ai', []))
  assert.deepEqual(asked, [['tab-2', 'style']])
})

test('a conversation switched while the turn door was asked reloads nothing of the new one', () => {
  const { sidebar, asked } = reloadingSidebar(open(), 's2')
  siteTabReloader(sidebar, 's1', 'full')(hostsOfSite('lantern.tracy.ai', []))
  assert.deepEqual(asked, [])
})

// ── The page's reading of the conversation on screen ─────────────────────────────────────────

/** An observable value — the shape of dsh's `ObservableSnapshot`. */
function observable(value) {
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next) {
      value = next
      for (const listener of listeners) listener()
    },
    get listeners() {
      return listeners.size
    }
  }
}

/** One change of an event window: `kind`, and the durable events it carries. */
const change = (kind, ...types) => ({
  kind,
  entries: types.map((type) => ({ type: 'event', event: { type } }))
})

/** A session's event window, publishing each change the way dsh's `MutableSessionEventSource` does. */
function eventSource() {
  const source = observable({ revision: 0, change: change('replace') })
  let revision = 0
  return Object.assign(source, {
    push(kind, ...types) {
      revision += 1
      source.set({ revision, change: change(kind, ...types) })
    }
  })
}

/**
 * `ctx.sessions` as dsh 0.1.6-alpha.2 serves a seat, measured 23/09: no `current`, the main view
 * RETAINS the session it shows, and no `running` that ever moves — so none is modelled here.
 */
function sessions(ids) {
  const sources = Object.fromEntries(ids.map((id) => [id, eventSource()]))
  const rows = (shown) =>
    Object.fromEntries(ids.map((id) => [id, { retainedBy: id === shown ? { mainView: 1 } : {} }]))
  const list = observable({ byId: rows(undefined) })
  return {
    list,
    sources,
    binding: (id) => (sources[id] ? { eventSource: sources[id] } : undefined),
    show: (id) => list.set({ byId: rows(id) })
  }
}

test('a turn/end arriving live is a turn ending; history loaded or scrolled into view is not', () => {
  assert.equal(turnEndedIn(change('append', 'step/end', 'turn/end')), true)
  assert.equal(turnEndedIn(change('append', 'turn/start', 'tool/call')), false)
  assert.equal(turnEndedIn(change('replace', 'turn/start', 'turn/end')), false)
  assert.equal(turnEndedIn(change('prepend', 'turn/end')), false)
  assert.equal(
    turnEndedIn({ kind: 'append', entries: [{ type: 'transient', event: { type: 'turn/end' } }] }),
    false
  )
  assert.equal(turnEndedIn({ kind: 'settle-assistant' }), false)
  assert.equal(turnEndedIn(undefined), false)
})

test('the conversation on screen is followed: each of its turns ending is seen once', () => {
  const s = sessions(['a', 'b'])
  s.show('a')
  const ended = []
  const stop = followTurnEnds(s, (id) => ended.push(id))
  s.sources.a.push('append', 'turn/start', 'step/start')
  s.sources.a.push('append', 'tool/call')
  assert.deepEqual(ended, [])
  s.sources.a.push('append', 'step/end', 'turn/end')
  assert.deepEqual(ended, ['a'])
  // The same revision told twice is still one ending.
  s.sources.a.set(s.sources.a.getSnapshot())
  // The history the page reads again after a reconnect is not a turn ending.
  s.sources.a.push('replace', 'turn/start', 'turn/end')
  assert.deepEqual(ended, ['a'])
  stop()
  s.sources.a.push('append', 'turn/end')
  assert.deepEqual(ended, ['a'])
  assert.equal(s.list.listeners, 0)
  assert.equal(s.sources.a.listeners, 0)
})

test('a turn ending out of sight is left alone, and a switch moves the watch to the new conversation', () => {
  const s = sessions(['a', 'b'])
  s.show('a')
  const ended = []
  followTurnEnds(s, (id) => ended.push(id))
  s.sources.b.push('append', 'turn/end')
  assert.deepEqual(ended, [])
  s.show('b')
  s.sources.a.push('append', 'turn/end')
  assert.deepEqual(ended, [])
  assert.equal(s.sources.a.listeners, 0)
  s.sources.b.push('append', 'turn/end')
  assert.deepEqual(ended, ['b'])
})

test('a conversation whose binding is not there yet is followed from the next list change', () => {
  const s = sessions(['a'])
  const bindingOf = s.binding
  let bound = false
  s.binding = (id) => (bound ? bindingOf(id) : undefined)
  const ended = []
  followTurnEnds(s, (id) => ended.push(id))
  s.show('a')
  s.sources.a.push('append', 'turn/end')
  assert.deepEqual(ended, [])
  bound = true
  s.show('a')
  s.sources.a.push('append', 'turn/end')
  assert.deepEqual(ended, ['a'])
})

// ── The built plugin ────────────────────────────────────────────────────────────────────────────

/** Load `lib/index.js` afresh and ask its `turn` door about one session. */
async function ask(instance, { sessionId, agents }) {
  const mod = await import(new URL(`../lib/index.js?${instance}`, import.meta.url).href)
  let route = null
  mod.apply({
    webServer: {
      register: (r) => {
        route = r
        return () => {}
      }
    },
    agents: { roots: () => agents },
    on: () => () => {},
    effect: (setup) => {
      setup()
    },
    get: () => undefined
  })
  return new Promise((resolve) => {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ sessionId }))]), {
      method: 'POST',
      url: '/api/tracy-site-tabs/turn',
      headers: {}
    })
    route.handler(req, { writeHead: () => {}, end: (body) => resolve(JSON.parse(body)) })
  })
}

/** One root agent standing in `cwd`, whose last turn made `calls`. */
const rootAgent = (id, cwd, calls) => ({
  ctx: { on: () => () => {} },
  session: { id, header: { cwd }, snapshotEvents: () => turn(...calls) }
})

test('built plugin: the turn door names the site a changing turn touched, and nothing otherwise', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'site-tabs-turn-door-'))
  const saved = process.env.TRACY_SITES_ROOT
  const savedKey = process.env.MCP_TRACY_SITE_KEY
  try {
    mkdirSync(path.join(root, 'lantern', '.tracy'), { recursive: true })
    writeFileSync(
      path.join(root, 'lantern', '.tracy', 'site.json'),
      JSON.stringify({ siteKey: 'lantern.tracy.ai' })
    )
    process.env.TRACY_SITES_ROOT = root
    process.env.MCP_TRACY_SITE_KEY = ''
    const folder = path.join(root, 'lantern')
    const changed = rootAgent('s-1', folder, [
      { name: 'tracy_site', arguments: { action: 'content.update' } }
    ])
    const looked = rootAgent('s-2', folder, [{ name: 'tracy_site', arguments: { action: 'info' } }])
    assert.deepEqual(await ask('door-a', { sessionId: 's-1', agents: [changed, looked] }), {
      changed: true,
      // A `tracy_site` write is opaque — the log says it ran, never what it touched — so the page
      // is told to refresh fully. The field is part of the answer now; a turn that changed nothing
      // still carries neither it nor a site.
      mode: 'full',
      siteKey: 'lantern.tracy.ai'
    })
    assert.deepEqual(await ask('door-b', { sessionId: 's-2', agents: [changed, looked] }), {
      changed: false,
      siteKey: null
    })
    // A session this dsh does not hold as a root agent — a subagent, or one that has gone away.
    assert.deepEqual(await ask('door-c', { sessionId: 's-9', agents: [changed] }), {
      changed: false,
      siteKey: null
    })
    assert.deepEqual(await ask('door-d', { sessionId: '', agents: [changed] }), {
      changed: false,
      siteKey: null
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
    if (saved === undefined) delete process.env.TRACY_SITES_ROOT
    else process.env.TRACY_SITES_ROOT = saved
    if (savedKey === undefined) delete process.env.MCP_TRACY_SITE_KEY
    else process.env.MCP_TRACY_SITE_KEY = savedKey
  }
})

test("looking actions are DERIVED from the door's own table, so a new read cannot reload the preview", async () => {
  // The defect this replaces: `page.text` and `content.find` were added to `tracy_site` and this
  // package's hand-kept copy did not know them, so a call that only LOOKS was reported as a change
  // and the customer's site preview reloaded under them. Nothing failed; the tab just blinked.
  const { ACTION_CLASSES } = await import('../../../tools/tracy-site-tools/src/host/site-context.mjs')
  for (const [action, kind] of Object.entries(ACTION_CLASSES)) {
    if (kind !== 'read') continue
    assert.equal(
      callChangedSite({ name: 'tracy_site', arguments: JSON.stringify({ action }) }),
      false,
      `${action} is classified read by the door but reads as a change here`
    )
  }
  assert.equal(callChangedSite({ name: 'tracy_site', arguments: '{"action":"content.update"}' }), true)
})

// ── How cheaply the page may be brought up to date ────────────────────────────────────────────
//
// 🔒 ONE SHAPE IS CHEAP, EVERY OTHER SHAPE IS NOT, AND THE COST OF GUESSING WRONG IS ASYMMETRIC.
// A wrong `full` costs a flicker. A wrong `style` leaves the customer reading the OLD page while
// believing it is the new one — so a shell command, a `tracy_site` action, or a single non-CSS
// write anywhere in the turn takes the whole turn back to `full`.

const started = (...calls) => [{ type: 'turn/start' }, ...calls.map((data) => ({ type: 'tool/call', data }))]
const wrote = (file) => ({ name: 'write', arguments: { file_path: file } })

test('a turn that changed nothing has no mode at all', () => {
  assert.equal(
    turnRefreshMode(started({ name: 'read', arguments: { file_path: '/site/.webroot/a.css' } })),
    null
  )
  assert.equal(turnRefreshMode([]), null)
  assert.equal(turnRefreshMode(undefined), null)
})

test('a turn that only wrote stylesheets is shown WITHOUT reloading the page', () => {
  const events = started(wrote('/site/.webroot/templates/tracy/css/a.css'), wrote('/site/.webroot/b.CSS'))
  assert.equal(turnRefreshMode(events), 'style')
  assert.equal(siteChangedInTurn(events), true)
})

test('one non-CSS write drags the whole turn back to a full refresh', () => {
  const events = started(wrote('/site/.webroot/a.css'), wrote('/site/.webroot/index.php'))
  assert.equal(turnRefreshMode(events), 'full')
})

test('a shell command is opaque — the log never says what it touched — so it is always full', () => {
  assert.equal(
    turnRefreshMode(started({ name: 'bash', arguments: { command: 'wp theme activate x' } })),
    'full'
  )
})

test('a tracy_site write is full too, for the same reason', () => {
  assert.equal(
    turnRefreshMode(started({ name: 'tracy_site', arguments: { action: 'content.update' } })),
    'full'
  )
})

test('only the turn that just ended is read — an older CSS write does not make this one cheap', () => {
  const events = [
    { type: 'turn/start' },
    { type: 'tool/call', data: wrote('/site/.webroot/old.css') },
    { type: 'turn/start' },
    { type: 'tool/call', data: wrote('/site/.webroot/index.php') }
  ]
  assert.equal(turnRefreshMode(events), 'full')
})
