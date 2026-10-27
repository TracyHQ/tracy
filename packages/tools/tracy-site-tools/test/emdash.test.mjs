import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  emdashReplaceWrote,
  emdashWriteTarget,
  emdashWriteTool,
  budget,
  canonicalRev,
  catalogueOf,
  collectionsAnswer,
  CONTENT_LIST_ARGS,
  destructiveTarget,
  draftFieldsOf,
  draftGuard,
  EMDASH_BUDGETS,
  EMDASH_DESCRIPTION,
  EMDASH_DESTRUCTIVE_TOOLS,
  EMDASH_LANGUAGE_RULE,
  EMDASH_PARAMETERS,
  EMDASH_READ_TOOLS,
  EMDASH_WORDS_ROAD,
  emdashCodeOf,
  emdashRunsInParallel,
  entryState,
  ID_WITHOUT_LOCALE_TOOLS,
  LOCALE_FILL_TOOLS,
  localeNeed,
  localePlan,
  mcpToolCall,
  mcpToolsList,
  menuItemsForSet,
  missingCollectionOf,
  normalizeEmdashShape,
  parseMcpBody,
  planEmdashCall,
  readMcpReply,
  recordCollectionsOf,
  recordFieldsOf,
  receiptOf,
  EMDASH_RECEIPT_NEXT,
  revOf,
  schemasOf,
  shapeAnswer,
  shapeRow,
  textOf,
  emdashSiteOf,
  toolsOf,
  EMDASH_REDIRECT_TOOLS
} from '../src/host/emdash.mjs'

test('planEmdashCall passes an EmDash tool name and its own arguments through', () => {
  const p = planEmdashCall({ tool: 'content_create', arguments: { collection: 'pages', title: 'X' } })
  assert.equal(p.ok, true)
  assert.equal(p.tool, 'content_create')
  assert.deepEqual(p.args, { collection: 'pages', title: 'X' })
})

test('planEmdashCall refuses a name that is not an EmDash tool', () => {
  // The failure mode this closes: a typo becomes a JSON-RPC call that answers 200 with an error
  // object, which the model then has to interpret instead of being told plainly.
  for (const bad of ['content.create', 'Content_Create', '../etc', 'content create', '']) {
    assert.equal(planEmdashCall({ tool: bad }).ok, false, `should refuse ${JSON.stringify(bad)}`)
  }
})

test('planEmdashCall refuses arguments that are not an object', () => {
  assert.equal(planEmdashCall({ tool: 'content_list', arguments: [1, 2] }).ok, false)
  assert.equal(planEmdashCall({ tool: 'content_list', arguments: 'x' }).ok, false)
  // Absent is fine — plenty of EmDash tools take none.
  assert.deepEqual(planEmdashCall({ tool: 'content_list' }).args, {})
})

test('planEmdashCall validates the site key shape, and nothing more', () => {
  assert.equal(planEmdashCall({ tool: 'content_list', siteKey: 'tchemdash4' }).siteKey, 'tchemdash4')
  // A malformed key would go into a URL; refusing the shape is not the same as granting the site,
  // which stays the seat book's decision.
  assert.equal(planEmdashCall({ tool: 'content_list', siteKey: '../other' }).siteKey, null)
  assert.equal(planEmdashCall({ tool: 'content_list' }).siteKey, null)
})

test('the JSON-RPC envelopes are what MCP expects', () => {
  assert.deepEqual(mcpToolCall('menu_set_items', { id: 1 }, 7), {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: 'menu_set_items', arguments: { id: 1 } }
  })
  assert.deepEqual(mcpToolsList(3), { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })
})

test('parseMcpBody reads the event-stream framing EmDash actually answers with', () => {
  // Measured against 0.37: a single reply arrives as SSE, and JSON.parse on the raw body throws
  // on the first character. A caller that only handled JSON would read every success as a
  // transport failure.
  const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n'
  const parsed = parseMcpBody(body)
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.value, { jsonrpc: '2.0', id: 1, result: { ok: true } })
})

test('parseMcpBody takes the LAST data line, not the first', () => {
  // A stream may carry progress notifications before the result.
  const body =
    'data: {"jsonrpc":"2.0","method":"notifications/progress"}\n\ndata: {"jsonrpc":"2.0","id":1,"result":{"final":true}}\n'
  assert.deepEqual(parseMcpBody(body).value, { jsonrpc: '2.0', id: 1, result: { final: true } })
})

test('parseMcpBody accepts plain JSON too', () => {
  assert.deepEqual(parseMcpBody('{"jsonrpc":"2.0","id":1,"result":{}}').value.id, 1)
})

test('parseMcpBody says so when the site did not answer JSON-RPC', () => {
  assert.equal(parseMcpBody('<html>502</html>').ok, false)
  assert.equal(parseMcpBody('').ok, false)
})

test('readMcpReply treats a refused tool as a failure, not a success', () => {
  // 🔒 The one that would slip: a refused scope comes back HTTP 200, no `error` member, and
  // `result.isError === true`. Reading only `error` reports it as success.
  const refused = {
    jsonrpc: '2.0',
    id: 1,
    result: { isError: true, content: [{ type: 'text', text: 'INSUFFICIENT_SCOPE: settings:manage' }] }
  }
  const read = readMcpReply(refused)
  assert.equal(read.ok, false)
  assert.match(read.error, /INSUFFICIENT_SCOPE/)
})

test('readMcpReply surfaces a transport-level JSON-RPC error', () => {
  const r = readMcpReply({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } })
  assert.equal(r.ok, false)
  assert.equal(r.error, 'Method not found')
})

test('readMcpReply returns the result when the tool ran', () => {
  const r = readMcpReply({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'done' }] } })
  assert.equal(r.ok, true)
  assert.equal(textOf(r.result.content), 'done')
})

test('textOf ignores non-text parts and trims', () => {
  assert.equal(
    textOf([
      { type: 'image', data: 'x' },
      { type: 'text', text: ' hi ' }
    ]),
    'hi'
  )
  assert.equal(textOf('not a list'), '')
})

test('emdashSiteOf: the session’s own site, and no other', () => {
  const own = emdashSiteOf({ siteKey: null, sessionCwd: '/site/site-abc/docs' })
  // 🔒 origin is loopback: the MCP call is made INSIDE the container (#154), never dialled from dsh
  // by container name. The container name is still how the exec finds the site.
  assert.deepEqual(own, {
    ok: true,
    label: 'site-abc',
    container: 'site-abc-web-1',
    origin: 'http://127.0.0.1:4321'
  })
  assert.equal(emdashSiteOf({ siteKey: 'site-abc.tracy.test', sessionCwd: '/site/site-abc' }).ok, true)
  // 🔒 naming another site from a session on this one is refused before any token is read
  const other = emdashSiteOf({ siteKey: 'site-zzz.tracy.test', sessionCwd: '/site/site-abc' })
  assert.equal(other.ok, false)
  // The SAME code the Apply door answers for Joomla/WordPress, carrying the same two names, so one
  // `refusalNext` case serves both roads. It was `SITE_MISMATCH` — a code nothing translated —
  // until 21/09/2026.
  assert.equal(other.code, 'SITE_OUTSIDE_CONVERSATION')
  assert.equal(other.conversationSite, 'site-abc')
  assert.equal(other.siteKey, 'site-zzz.tracy.test')
  // no session site, no key: the lane's own site, else nothing
  assert.equal(
    emdashSiteOf({ siteKey: null, sessionCwd: '/site', laneSiteKey: 'lane-1.tracy.ai' }).label,
    'lane-1'
  )
  assert.equal(emdashSiteOf({ siteKey: null, sessionCwd: null }).code, 'NO_SITE')
  assert.equal(emdashSiteOf({ siteKey: 'Bad Label', sessionCwd: null }).code, 'NO_SITE')
})

test('🔒 emdashSiteOf: a caller-named siteKey never grants a site by itself (#184)', () => {
  // The bug this closes (confirmed on develop702b / PR162): with no trusted own-site cwd, the
  // requested siteKey was used AS the target — so any key reached any customer's site through the
  // site's own admin token. Authority may come only from where the session stands or the lane it was
  // configured with; a caller's key may confirm one of those, never supply one.
  for (const cwd of [null, '/site', '/elsewhere', '/site/']) {
    const out = emdashSiteOf({ siteKey: 'other-site.example.test', sessionCwd: cwd, laneSiteKey: null })
    assert.equal(out.ok, false, `siteKey alone must not grant a site (cwd=${JSON.stringify(cwd)})`)
  }
})

test('🔒 emdashSiteOf: the NO_SITE message does not promise access from a siteKey', () => {
  const out = emdashSiteOf({ siteKey: 'other-site.example.test', sessionCwd: null })
  assert.equal(out.code, 'NO_SITE')
  // "Provide siteKey [to gain access]" would be a lie for an unrooted caller: the key grants nothing.
  assert.doesNotMatch(out.error, /provide siteKey/i)
})

test('🔒 emdashSiteOf: a request that disagrees with the trusted lane is refused, not honoured', () => {
  // laneSiteKey establishes the site; asking for a different one must be refused under the SAME
  // code a mismatch against an own-site cwd answers — `SITE_OUTSIDE_CONVERSATION`, the one both
  // roads translate into a next step (renamed from `SITE_MISMATCH` on 21/09/2026).
  const out = emdashSiteOf({
    siteKey: 'other-site.example.test',
    sessionCwd: null,
    laneSiteKey: 'owned-site.example.test'
  })
  assert.equal(out.ok, false)
  assert.equal(out.code, 'SITE_OUTSIDE_CONVERSATION')
  assert.equal(out.conversationSite, 'owned-site')
  assert.equal(out.siteKey, 'other-site.example.test')
  // A request that AGREES with the lane still resolves to the lane's own site.
  const same = emdashSiteOf({
    siteKey: 'owned-site.example.test',
    sessionCwd: null,
    laneSiteKey: 'owned-site.example.test'
  })
  assert.equal(same.ok, true)
  assert.equal(same.label, 'owned-site')
})

test('🔒 emdashSiteOf: a cwd with a traversal segment derives no site (not prefix parsing)', () => {
  // A `..`/`.` segment can keep the label at the front of the string while the path resolves into
  // another site or out of the root. Following subprocess-docker's siteOf, such a cwd is trusted for
  // nothing — so it cannot stand in for the owning site, and a siteKey cannot ride on it either.
  assert.equal(emdashSiteOf({ siteKey: null, sessionCwd: '/site/owned-site/../../elsewhere' }).ok, false)
  assert.equal(emdashSiteOf({ siteKey: null, sessionCwd: '/site/owned-site/../other-site' }).ok, false)
  // Naming a site from a traversal cwd does not resurrect it as authority.
  const asked = emdashSiteOf({ siteKey: 'owned-site.example.test', sessionCwd: '/site/owned-site/../x' })
  assert.equal(asked.ok, false)
  // A plain nested path (no traversal) still derives its site.
  assert.equal(emdashSiteOf({ siteKey: null, sessionCwd: '/site/owned-site/./docs' }).label, 'owned-site')
})

test('emdashSiteOf: an own-site cwd and a matching request agree; empty/invalid config is defensive', () => {
  assert.equal(emdashSiteOf({ siteKey: 'owned-site.x', sessionCwd: '/site/owned-site' }).label, 'owned-site')
  // Empty or malformed lane config is treated as "no lane", not as a reachable label.
  assert.equal(emdashSiteOf({ siteKey: null, sessionCwd: null, laneSiteKey: '' }).code, 'NO_SITE')
  assert.equal(emdashSiteOf({ siteKey: null, sessionCwd: null, laneSiteKey: 'Bad Lane' }).code, 'NO_SITE')
  // A malformed siteKey against a rooted own site is ignored (own site still reached), not fatal.
  assert.equal(emdashSiteOf({ siteKey: 'Bad Key', sessionCwd: '/site/owned-site' }).label, 'owned-site')
})

test('toolsOf keeps name, description and schema of each tool and drops the rest', () => {
  const tools = toolsOf({
    tools: [
      {
        name: 'content_list',
        title: 'List',
        description: 'd',
        inputSchema: { type: 'object' },
        annotations: {}
      },
      { nope: 1 }
    ]
  })
  assert.deepEqual(tools, [{ name: 'content_list', description: 'd', inputSchema: { type: 'object' } }])
  assert.deepEqual(toolsOf(null), [])
})

/**
 * EmDash 0.38's own `tools/list`, cut to what these sets are judged by: each tool's name, its two
 * annotations as declared (`null` = not declared), and its `inputSchema` property names. Captured
 * 24/09/2026 from the stand's `tracy-business-emdash:1.3.0-tools` site.
 * @type {Array<{ name: string, readOnlyHint: boolean | null, destructiveHint: boolean | null, args: string[] }>}
 */
const TOOLS_038 = JSON.parse(
  readFileSync(new URL('./fixtures/emdash/tools-0.38.json', import.meta.url), 'utf8')
)

/** @param {Iterable<string>} names */
const sorted = (names) => [...names].sort()

test('EMDASH_READ_TOOLS equals the readOnlyHint set of EmDash 0.38 (22 of 59), both ways', () => {
  // Both directions on purpose: a read missing here is only a lost overlap, but a WRITE listed
  // here would run beside its siblings and race them.
  const declared = TOOLS_038.filter((t) => t.readOnlyHint === true).map((t) => t.name)
  assert.equal(declared.length, 22)
  assert.deepEqual(sorted(EMDASH_READ_TOOLS), sorted(declared))
})

test('EMDASH_DESTRUCTIVE_TOOLS equals the destructiveHint set of EmDash 0.38 (10 of 59), both ways', () => {
  // A delete missing here is forwarded without asking the customer — the direction that loses data.
  // A tool listed here that EmDash does not mark would ask before an ordinary write.
  const declared = TOOLS_038.filter((t) => t.destructiveHint === true).map((t) => t.name)
  assert.equal(declared.length, 10)
  assert.deepEqual(sorted(EMDASH_DESTRUCTIVE_TOOLS), sorted(declared))
})

test('no EmDash tool is both a read and destructive, and the words road asks nothing first', () => {
  for (const name of EMDASH_DESTRUCTIVE_TOOLS) assert.equal(EMDASH_READ_TOOLS.has(name), false, name)
  // MCP reads an UNMARKED non-read tool as destructive. EmDash leaves 22 unmarked, among them the
  // writes that words, menus and settings go through — so the set follows EmDash's explicit marks,
  // not that default.
  for (const name of ['content_update', 'content_publish', 'menu_set_items', 'settings_update']) {
    const tool = TOOLS_038.find((t) => t.name === name)
    assert.equal(tool?.destructiveHint, null, name)
    assert.equal(EMDASH_DESTRUCTIVE_TOOLS.has(name), false, name)
  }
})

test('EMDASH_WORDS_ROAD names the publish, the locale and no `_rev`, and leaves languages to the language rule', () => {
  // Its wording is free; what it must say is below. That the tracy_emdash description quotes it
  // verbatim is held in 'the tracy_emdash description is the road (T9)'.
  assert.ok(EMDASH_WORDS_ROAD.includes('status:"published"'))
  assert.ok(EMDASH_WORDS_ROAD.includes('_rev'))
  assert.ok(EMDASH_WORDS_ROAD.includes('`locale`'))
  // Which languages a change reaches is EMDASH_LANGUAGE_RULE's alone: the first fix said it here
  // ("made in that one … say how many keep their own copy"), which left a new phone number wrong on
  // 39 of 40 language versions.
  assert.doesNotMatch(EMDASH_WORDS_ROAD, /names no language|keep their own copy|every language/i)
  // Measured r2: `{list: true}` in 32 of 33 EmDash cases, 49,977 chars each — the road never sends there.
  assert.equal(/list:\s*true/.test(EMDASH_WORDS_ROAD), false)
})

// 🔒 DAVID'S RULE (25/09/2026), BOTH HALVES. PR1 bench (benchemdash01, 40 languages served): with no
// rule, C21 and C23 asked the customer which languages before writing (FAIL), C04 and C20 wrote all
// 40, C22 wrote `en`. A fact the site prints alike, or a change said to apply everywhere, goes to
// every language served; words go to the page's own language unless the customer names others.
test("🔒 EMDASH_LANGUAGE_RULE: a fact changes in every language served, words in the page's own — never asked, always counted", () => {
  const rule = EMDASH_LANGUAGE_RULE
  // Never asked, and the answer counts.
  assert.match(rule, /never ask\b/)
  assert.match(rule, /The answer says how many languages changed\./)
  // FACTS: each one the rule names, and "everywhere", reach EVERY language served, as one change.
  for (const fact of ['phone', 'e-mail', 'address', 'opening hours', 'legal or copyright line', 'link'])
    assert.ok(rule.includes(fact), fact)
  assert.match(
    rule,
    /A fact printed alike in every language, or a change said to apply everywhere, changes in EVERY language served, as one change/
  )
  // 🔒 E1 (26/09): … through ONE `content.replace` first, which writes every served language itself
  // (PR2's engine), where this said `content_translations` → get → update per language (C21 + C22:
  // 244 s, 170 of 408 calls on the 25/09 bench). A fact the engine knows by its words needs no `all`;
  // an address does, and over 5 places the dryRun that confirm-count asks for comes first. Until E1
  // this pinned the fact list in brackets right after "every language"; the kinds now sit on the
  // replace road that tells them apart, and `consistency.test.mjs` holds them to `isFact`.
  // 🔒 27/09 A1 (V4-words-01): "a phone … in every language itself; anything else adds all:true" read as
  // "a phone needs no all", and the hotline changed in the footer only. `all` is about PLACES, so the call
  // carries it for every fact; the kinds now say only which ones reach the other languages without it.
  assert.match(
    rule,
    /as one change: `tracy_site` `content\.replace \{find, replace, all:true\}` \(over 5 places, `dryRun:true` first\): `all` reaches every place, and every language for opening hours, the legal or copyright line or an address; a phone, an e-mail or an https:\/\/ link reaches every language by itself\./
  )
  // … and only when it cannot, the road that exists without it: the entries listed once, read in one
  // call, written in one step — and only the published ones, since status:"published" on a draft
  // language would put it live. 🔒 G2 (27/09): no read per entry for its `_rev`; the door reads it.
  assert.match(
    rule,
    /Only on TOO_MANY, or NOT_FOUND again after its next: `content_translations \{collection, id\}` lists them, `content_get` with `allLocales:true` reads them all; then `content_update` each published one, all in one step/
  )
  assert.ok(rule.indexOf('content.replace') < rule.indexOf('content_translations'), 'replace first')
  // WORDS: the language of the page meant, which is the filled one by default; others only when named.
  assert.match(
    rule,
    /Words \(headings, sentences, button labels\) change in the language of the page meant \(the filled one unless the request points at another\), others only when the customer names them\./
  )
  // Every tool and argument it names exists on 0.38.
  const argsOf = new Map(TOOLS_038.map((t) => [t.name, new Set(t.args)]))
  for (const [tool, args] of Object.entries({
    content_translations: ['collection', 'id'],
    content_get: [],
    content_update: []
  })) {
    assert.ok(rule.includes(tool), tool)
    for (const a of args) assert.ok(argsOf.get(tool)?.has(a), `${tool} takes no ${a}`)
  }
  // The reads the rule asks for in one step may overlap: both are EmDash-marked reads.
  for (const tool of ['content_translations', 'content_get'])
    assert.equal(
      emdashRunsInParallel({ tool, arguments: { collection: 'site', id: '01M36TA5254KTX8AKZQMK4BZ00' } }),
      true,
      tool
    )
  // Site-agnostic, and no language named: the rule is the same bytes on every site.
  assert.doesNotMatch(rule, /locale:"|"en"|ed-[a-z0-9]{6}/)
})

test('every tool and argument the words road names exists on EmDash 0.38', () => {
  const argsOf = new Map(TOOLS_038.map((t) => [t.name, new Set(t.args)]))
  const named = {
    content_get: ['collection', 'id'],
    content_list: ['collection'],
    content_update: ['collection', 'id', '_rev', 'data', 'status', 'locale']
  }
  for (const [tool, args] of Object.entries(named)) {
    assert.ok(EMDASH_WORDS_ROAD.includes(tool), `${tool} is not in the sentence`)
    for (const arg of args) assert.ok(argsOf.get(tool)?.has(arg), `${tool} takes no ${arg}`)
  }
})

// ─── P4 (PLAN v2.1): the EmDash road, pure half ───────────────────────────────────────────────

/**
 * Real answers of the stand's EmDash site (ed-ivj9ni, tracy-business on EmDash 0.38), the text part
 * parsed; `_source` in the file says where each one comes from.
 */
const BUSINESS = JSON.parse(
  readFileSync(new URL('./fixtures/emdash/business-en.json', import.meta.url), 'utf8')
)
const A = BUSINESS.answers
const HOME_ID = '01M36TA83763RSVSN5R28DZ0AZ'

test('emdashRunsInParallel: {list} and every EmDash read overlap; writes, unknown names and garbage are barriers', () => {
  assert.equal(emdashRunsInParallel({ list: true }), true)
  for (const t of TOOLS_038) {
    const expected = t.readOnlyHint === true
    assert.equal(emdashRunsInParallel({ tool: t.name, arguments: {} }), expected, t.name)
    assert.equal(emdashRunsInParallel(JSON.stringify({ tool: t.name })), expected, `${t.name} as JSON text`)
  }
  // Read through the same shape repair the call is run with: `content.get` IS content_get.
  assert.equal(
    emdashRunsInParallel({ tool: 'content.get', arguments: { collection: 'home', id: 'home' } }),
    true
  )
  // A page read routed to tracy_site stays exclusive there; nothing that is not a read overlaps.
  assert.equal(emdashRunsInParallel({ tool: 'page.text', arguments: { path: '/' } }), false)
  for (const bad of [{}, null, undefined, 'garbage', { tool: 'content_listx' }, { tool: 'Content-Update' }])
    assert.equal(emdashRunsInParallel(bad), false, JSON.stringify(bad))
})

test('normalizeEmdashShape unwraps the call nested inside its own arguments (ed-vwptf3, answered -32602)', () => {
  // Verbatim from the historical session: the whole call again inside `arguments`.
  const hist = JSON.parse(
    '{"arguments": {"tool": "content_update", "arguments": {"collection": "home", "id": "01M341J7K48A9504ZVD2GH7T4A", "_rev": "MjQ6MjAyNi0wOS0yMlQyMTo1MTo0Mi4wNjBa", "data": {"hero_title_a": "Toyota Hà Nội — Showroom 3S"}}}, "tool": "content_update"}'
  )
  const s = normalizeEmdashShape(hist)
  assert.equal(s.ok, true)
  assert.equal(s.tool, 'content_update')
  assert.deepEqual(s.args, hist.arguments.arguments)
  assert.match(s.notes.join(' '), /nested twice/)
  // Two different names are a question, not a repair: left as sent, for EmDash to refuse.
  const other = normalizeEmdashShape({
    tool: 'content_get',
    arguments: { tool: 'content_update', arguments: {} }
  })
  assert.equal(other.tool, 'content_get')
  assert.deepEqual(other.args, { tool: 'content_update', arguments: {} })
})

// 🔒 ED-10 (09/10/2026, bench hb: 7 refused calls in one EmDash picture run): `action` — tracy_site's key — names
// the tool when `tool` is missing, and "list" the catalogue; each is said. `tool` given wins over `action`.
test('normalizeEmdashShape: action in place of tool is the tool, action "list" the catalogue — and tool wins when both are sent', () => {
  const asTool = normalizeEmdashShape({ action: 'content_list', arguments: { collection: 'projects' } })
  assert.equal(asTool.ok, true)
  assert.equal(asTool.tool, 'content_list')
  assert.deepEqual(asTool.args, { collection: 'projects' })
  assert.ok(asTool.notes.includes('action is "tool" here: tool content_list'), JSON.stringify(asTool.notes))
  // loose arguments beside action are the arguments, and action is not one of them
  const loose = normalizeEmdashShape({ action: 'content_get', collection: 'home', id: 'home' })
  assert.equal(loose.tool, 'content_get')
  assert.deepEqual(loose.args, { collection: 'home', id: 'home' })
  // a dotted name under action is repaired as under tool
  const dotted = normalizeEmdashShape({
    action: 'content.update',
    arguments: { collection: 'home', id: 'home' }
  })
  assert.equal(dotted.tool, 'content_update')
  for (const word of ['list', 'tools']) {
    const listed = normalizeEmdashShape({ action: word })
    assert.equal(listed.ok, true, word)
    assert.equal(listed.list, true, word)
    assert.equal(listed.names, null, word)
    assert.ok(listed.notes.includes(`action "${word}" is {list:true}: the tool catalogue`), word)
  }
  const both = normalizeEmdashShape({
    tool: 'content_get',
    action: 'content_list',
    arguments: { collection: 'home', id: 'home' }
  })
  assert.equal(both.tool, 'content_get')
  assert.ok(!both.notes.some((n) => /action/.test(n)))
  // no tool and no action stays refused
  const none = normalizeEmdashShape({ arguments: { collection: 'home' } })
  assert.equal(none.ok, false)
})

test('normalizeEmdashShape: loose keys, args/params/input, a dotted name, snake orderBy, a stray = on _rev', () => {
  const loose = normalizeEmdashShape({ tool: 'content_get', collection: 'home', id: 'home' })
  assert.deepEqual(loose.args, { collection: 'home', id: 'home' })
  for (const k of ['args', 'params', 'input']) {
    const s = normalizeEmdashShape({ tool: 'menu_get', [k]: { name: 'primary' } })
    assert.deepEqual(s.args, { name: 'primary' }, k)
    assert.match(s.notes[0], new RegExp(`"${k}"`))
  }
  const dotted = normalizeEmdashShape({ tool: 'content.get', arguments: { collection: 'home', id: 'home' } })
  assert.equal(dotted.tool, 'content_get')
  const ordered = normalizeEmdashShape({
    tool: 'content_list',
    arguments: { collection: 'posts', orderBy: 'created_at' }
  })
  assert.equal(ordered.args.orderBy, 'createdAt')
  const rev = normalizeEmdashShape({
    tool: 'content_publish',
    arguments: { collection: 'home', id: HOME_ID, _rev: 'MTA6MjAyNi0wOS0yNFQwNDozNjo0NC41Mzla=' }
  })
  assert.equal(rev.args._rev, 'MTA6MjAyNi0wOS0yNFQwNDozNjo0NC41Mzla')
  assert.equal(rev.notes.length, 1)
  // A well-formed call has nothing to say.
  assert.deepEqual(
    normalizeEmdashShape({ tool: 'content_get', arguments: { collection: 'home', id: 'home' } }).notes,
    []
  )
})

test('normalizeEmdashShape: page reads route to tracy_site, receipts are refused, Tracy parameters are never forwarded', () => {
  for (const tool of ['page.text', 'page_text', 'page.look', 'page_look']) {
    const s = normalizeEmdashShape({ tool, arguments: { path: '/news', match: 'x' } })
    assert.deepEqual(s.route, { action: tool.replace('_', '.'), params: { path: '/news', match: 'x' } }, tool)
  }
  for (const tool of ['apply.list', 'apply_list', 'apply.revert', 'apply_revert']) {
    const s = normalizeEmdashShape({ tool, arguments: {} })
    assert.equal(s.ok, false)
    assert.equal(s.code, 'NO_RECEIPTS_ON_EMDASH', tool)
    assert.equal(s.next, undefined, 'refusalNext writes the next step (D1)')
  }
  const s = normalizeEmdashShape({
    tool: 'content_delete',
    arguments: { collection: 'posts', id: HOME_ID, confirm: true, allLocales: false }
  })
  assert.equal(s.confirm, true)
  assert.deepEqual(s.args, { collection: 'posts', id: HOME_ID })
  assert.equal(
    normalizeEmdashShape({ tool: 'content_list', allLocales: true, arguments: { collection: 'x' } })
      .allLocales,
    true
  )
  const bad = normalizeEmdashShape({ tool: 'Content-Update' })
  assert.equal(bad.code, 'BAD_CALL')
  assert.deepEqual(normalizeEmdashShape({ list: true, tools: ['content_get', ' ', 'content_get'] }), {
    ok: true,
    list: true,
    names: ['content_get'],
    siteKey: null,
    notes: []
  })
})

test('🔒 ED-9: content_list keys EmDash reads nowhere are taken off and said; `query` points at search', () => {
  const shaped = (args) => normalizeEmdashShape({ tool: 'content_list', arguments: args })
  // Round 7: `query:"<a title>"` came back as the same page of rows, and was read as the matches.
  const asked = shaped({ collection: 'projects', limit: 8, query: 'Vorsino' })
  assert.deepEqual(asked.args, { collection: 'projects', limit: 8 })
  // Review of round 7, RL-1: `search` indexes only the collections that opt in (`supports` has `search`, fields
  // marked `searchable`): a page's own copy is in none, so the note no longer promises "finds by words".
  assert.deepEqual(asked.notes, [
    'query dropped: content_list filters nothing; search finds words in searchable collections'
  ])
  assert.ok(asked.notes.every((n) => n.length <= 90))
  // Any other stray key: dropped, said once, no pointer to search.
  const other = shaped({ collection: 'posts', fields: 'title,slug', flavour: 'x' })
  assert.deepEqual(other.args, { collection: 'posts' })
  assert.deepEqual(other.notes, ['fields, flavour dropped: content_list does not take them'])
  const both = shaped({ collection: 'posts', search: 'x', fields: 'title' })
  assert.equal(both.notes.length, 2)
  // Every argument the tool reads is kept, and a call with only those says nothing.
  const clean = shaped({
    collection: 'posts',
    status: 'draft',
    limit: 5,
    cursor: 'c',
    orderBy: 'createdAt',
    order: 'desc',
    locale: 'en',
    markdown: true
  })
  assert.deepEqual(clean.notes, [])
  assert.equal(Object.keys(clean.args).length, 8)
  // Only content_list: another tool's arguments are its own (search takes `query`).
  const search = normalizeEmdashShape({ tool: 'search', arguments: { query: 'x', collections: ['posts'] } })
  assert.deepEqual(search.args, { query: 'x', collections: ['posts'] })
  // The list is EmDash 0.38's own, both ways.
  const ours = new Set(CONTENT_LIST_ARGS)
  const theirs = new Set(TOOLS_038.find((t) => t.name === 'content_list').args)
  assert.deepEqual([...ours].sort(), [...theirs].sort())
})

test('canonicalRev: r1 C10\'s token with a stray "=" becomes the server\'s own; a raw value is encoded; garbage is left', () => {
  assert.deepEqual(canonicalRev('MTA6MjAyNi0wOS0yNFQwNDozNjo0NC41Mzla='), {
    rev: 'MTA6MjAyNi0wOS0yNFQwNDozNjo0NC41Mzla',
    changed: true
  })
  assert.deepEqual(canonicalRev('10:2026-09-24T04:36:44.539Z'), {
    rev: 'MTA6MjAyNi0wOS0yNFQwNDozNjo0NC41Mzla',
    changed: true
  })
  assert.deepEqual(canonicalRev('MTI6MjAyNi0wOS0yNFQwNDozNjo0NS4wNDBa'), {
    rev: 'MTI6MjAyNi0wOS0yNFQwNDozNjo0NS4wNDBa',
    changed: false
  })
  for (const junk of ['not a rev', 'abc', '', 42, null]) assert.equal(canonicalRev(junk).changed, false)
})

test('revOf reproduces the two _rev tokens EmDash answered on 24/09', () => {
  assert.equal(revOf(A.homeGet.item), 'MTI6MjAyNi0wOS0yNFQwNDozNjo0NS4wNDBa')
  assert.equal(revOf(A.homeGet.item), A.homeGet._rev)
  assert.equal(revOf(A.siteGet.item), 'NjoyMDI2LTA5LTI0VDA0OjM2OjQ0LjU3Nlo=')
  assert.equal(revOf(A.siteGet.item), A.siteGet._rev)
  assert.equal(revOf({ version: '1', updatedAt: 'x' }), null)
})

test("the locale sets are EmDash 0.38's own: fill tools take a locale, entry tools take {collection, id} and none", () => {
  const args = new Map(TOOLS_038.map((t) => [t.name, new Set(t.args)]))
  for (const t of LOCALE_FILL_TOOLS) assert.ok(args.get(t)?.has('locale'), `${t} takes no locale`)
  const entryTools = TOOLS_038.filter(
    (t) => t.args.includes('collection') && t.args.includes('id') && !t.args.includes('locale')
  )
  assert.deepEqual(sorted(ID_WITHOUT_LOCALE_TOOLS), sorted(entryTools.map((t) => t.name)))
  assert.equal(ID_WITHOUT_LOCALE_TOOLS.size, 12)
})

test('localePlan (D11), one served locale: filled on every scoped tool, a slug resolved on an entry tool', () => {
  const served = ['en']
  const list = localePlan('content_list', { collection: 'home' }, { served })
  assert.deepEqual(list, { ok: true, args: { collection: 'home', locale: 'en' }, filled: 'en' })
  // Writes too — that is what makes the words road one call.
  const up = localePlan('content_update', { collection: 'home', id: 'home', _rev: 'r' }, { served })
  assert.equal(up.args.locale, 'en')
  const menu = localePlan('menu_set_items', { name: 'primary', items: [] }, { served })
  assert.equal(menu.args.locale, 'en')
  // An explicit locale is the model's; a ULID was never in doubt, so nothing is filled or echoed.
  assert.deepEqual(
    localePlan('content_get', { collection: 'home', id: 'home', locale: 'vi' }, { served }).filled,
    null
  )
  assert.deepEqual(localePlan('content_get', { collection: 'home', id: HOME_ID }, { served }), {
    ok: true,
    args: { collection: 'home', id: HOME_ID },
    filled: null
  })
  // content_create defaults its own locale; settings are not per locale.
  assert.equal(localePlan('content_create', { collection: 'posts', data: {} }, { served }).filled, null)
  assert.equal(localePlan('settings_get', {}, { served }).filled, null)
  const pub = localePlan(
    'content_publish',
    { collection: 'home', id: 'home', _rev: 'r', locale: 'x' },
    { served: ['en'] }
  )
  assert.deepEqual(
    pub.resolve,
    { collection: 'home', slug: 'home', locale: 'x' },
    'an explicit locale scopes the one read'
  )
  const pubOne = localePlan('content_publish', { collection: 'home', id: 'home', _rev: 'r' }, { served })
  assert.deepEqual(pubOne.resolve, { collection: 'home', slug: 'home', locale: 'en' })
  assert.equal(
    Object.hasOwn(pubOne.args, 'locale'),
    false,
    'the entry tool takes no locale: it is not forwarded'
  )
})

/** The 40 languages benchemdash01 served on 25/09, in the order its published `site` rows came back. */
const STAND_40 = [
  'uk',
  'tr',
  'th',
  'ta',
  'sv',
  'sr',
  'sl',
  'sk',
  'ro',
  'pt',
  'pl',
  'nl',
  'ms',
  'lv',
  'lt',
  'ko',
  'ja',
  'it',
  'id',
  'hu',
  'hr',
  'hi',
  'he',
  'fr',
  'fi',
  'fa',
  'et',
  'es',
  'el',
  'de',
  'da',
  'cs',
  'ca',
  'bn',
  'bg',
  'ar',
  'af',
  'vi',
  'ru',
  'en'
]

test('localePlan (D11 amended), several served with the default: reads AND writes get it, echoed as a count', () => {
  // 🔒 ONE FILL RULE (PR1 bench, 25/09): a slug write refused EMDASH_LOCALE_REQUIRED on a site
  // serving 40 was retried with `locale:"en"` in 18 of 20 cases and became a question in C21.
  assert.equal(STAND_40.length, 40)
  const ctx = { served: STAND_40, artifactDefault: 'en' }
  const read = localePlan('content_get', { collection: 'home', id: 'home' }, ctx)
  assert.deepEqual(read, {
    ok: true,
    args: { collection: 'home', id: 'home', locale: 'en' },
    filled: 'en',
    languages: 40
  })
  const write = localePlan('content_update', { collection: 'home', id: 'home', _rev: 'r' }, ctx)
  assert.deepEqual(write, {
    ok: true,
    args: { collection: 'home', id: 'home', _rev: 'r', locale: 'en' },
    filled: 'en',
    languages: 40
  })
  assert.equal(localePlan('menu_set_items', { name: 'primary', items: [] }, ctx).args.locale, 'en')
  // A locale-less entry tool resolves the slug in the default; the locale is not forwarded.
  const pub = localePlan('content_publish', { collection: 'home', id: 'home', _rev: 'r' }, ctx)
  assert.equal(pub.ok, true)
  assert.deepEqual(pub.resolve, { collection: 'home', slug: 'home', locale: 'en' })
  assert.equal(pub.filled, 'en')
  assert.equal(Object.hasOwn(pub.args, 'locale'), false)
  // The model's own locale and a ULID are never overridden or echoed.
  assert.deepEqual(
    localePlan('content_update', { collection: 'home', id: 'home', _rev: 'r', locale: 'vi' }, ctx),
    { ok: true, args: { collection: 'home', id: 'home', _rev: 'r', locale: 'vi' }, filled: null }
  )
  assert.equal(localePlan('content_update', { collection: 'home', id: HOME_ID, _rev: 'r' }, ctx).filled, null)
  assert.equal(localePlan('content_publish', { collection: 'home', id: HOME_ID, _rev: 'r' }, ctx).ok, true)
  // Two languages, the default among them: the same.
  assert.equal(
    localePlan(
      'content_update',
      { collection: 'home', id: 'home', _rev: 'r' },
      { served: ['en', 'vi'], artifactDefault: 'en' }
    ).args.locale,
    'en'
  )
})

test('localePlan (D11), several served WITHOUT the default: reads go as written; writes by slug are refused', () => {
  const ctx = { served: ['de', 'vi'], artifactDefault: 'en' }
  // A default the site does not serve is not used: EmDash's own answer stands.
  assert.deepEqual(localePlan('content_list', { collection: 'home' }, ctx), {
    ok: true,
    args: { collection: 'home' },
    filled: null
  })
  const write = localePlan('content_update', { collection: 'home', id: 'home', _rev: 'r' }, ctx)
  assert.equal(write.ok, false)
  assert.equal(write.code, 'EMDASH_LOCALE_REQUIRED')
  assert.deepEqual(write.served, ['de', 'vi'])
  assert.ok(write.error.length <= 160)
  assert.equal(
    localePlan('menu_set_items', { name: 'primary', items: [] }, ctx).code,
    'EMDASH_LOCALE_REQUIRED'
  )
  // No default named at all: the same.
  assert.equal(
    localePlan('content_update', { collection: 'home', id: 'home', _rev: 'r' }, { served: ['en', 'vi'] })
      .code,
    'EMDASH_LOCALE_REQUIRED'
  )
  // A ULID write needs no locale.
  assert.equal(localePlan('content_update', { collection: 'home', id: HOME_ID, _rev: 'r' }, ctx).ok, true)
  const pub = localePlan('content_publish', { collection: 'home', id: 'home', _rev: 'r' }, ctx)
  assert.equal(pub.code, 'EMDASH_ULID_REQUIRED')
  assert.equal(pub.id, 'home')
  // Many languages: the refusal names eight and counts the rest.
  const many = localePlan(
    'content_update',
    { collection: 'home', id: 'home', _rev: 'r' },
    { served: STAND_40.filter((l) => l !== 'en'), artifactDefault: 'en' }
  )
  assert.equal(many.served.length, 8)
  assert.equal(many.servedCount, 39)
})

test('localePlan (D11), served unknown: the template default for reads only; allLocales only on reads', () => {
  for (const served of [[], null]) {
    const read = localePlan('content_list', { collection: 'home' }, { served, artifactDefault: 'en' })
    assert.equal(read.filled, 'en')
    const write = localePlan(
      'content_update',
      { collection: 'home', id: 'home', _rev: 'r' },
      { served, artifactDefault: 'en' }
    )
    assert.equal(write.code, 'EMDASH_LOCALE_REQUIRED')
  }
  assert.equal(
    localePlan('content_list', { collection: 'home' }, { served: [], artifactDefault: '../x' }).filled,
    null
  )
  assert.deepEqual(localePlan('content_list', { collection: 'home' }, { served: ['en'], allLocales: true }), {
    ok: true,
    args: { collection: 'home' },
    filled: null
  })
  const refused = localePlan(
    'content_update',
    { collection: 'home', id: HOME_ID, _rev: 'r' },
    { served: ['en'], allLocales: true }
  )
  assert.equal(refused.code, 'EMDASH_LOCALE_REQUIRED')
  assert.equal(refused.allLocales, true)
})

test('localePlan (D11), unscoped (no `site` collection, no declared languages): nothing filled, nothing refused', () => {
  const ctx = { served: [], unscoped: true }
  assert.deepEqual(localePlan('menu_set_items', { name: 'primary', items: [] }, ctx), {
    ok: true,
    args: { name: 'primary', items: [] },
    filled: null
  })
  assert.deepEqual(localePlan('content_update', { collection: 'pages', id: 'about', _rev: 'r' }, ctx).args, {
    collection: 'pages',
    id: 'about',
    _rev: 'r'
  })
  const publish = localePlan('content_publish', { collection: 'pages', id: 'about', _rev: 'r' }, ctx)
  assert.equal(publish.ok, true)
  assert.equal(publish.resolve, undefined, 'a slug goes as written: EmDash finds it by slug')
  // An explicit locale still scopes the slug's one read.
  assert.deepEqual(
    localePlan('content_publish', { collection: 'pages', id: 'about', locale: 'en' }, ctx).resolve,
    { collection: 'pages', slug: 'about', locale: 'en' }
  )
  // Reads still get the template default when it names one.
  assert.equal(
    localePlan('content_list', { collection: 'posts' }, { ...ctx, artifactDefault: 'en' }).filled,
    'en'
  )
  // Unknown because the read failed is not unscoped: the refusal says the languages were not read.
  const unread = localePlan('menu_set_items', { name: 'primary', items: [] }, { served: [] })
  assert.equal(unread.code, 'EMDASH_LOCALE_REQUIRED')
  assert.equal(unread.languages, 'unread')
  assert.equal(
    localePlan('content_delete', { collection: 'posts', id: 'about' }, { served: null }).languages,
    'unread'
  )
  // Known languages are never overridden by `unscoped`.
  assert.equal(
    localePlan('menu_set_items', { name: 'p', items: [] }, { served: ['en', 'vi'], unscoped: true }).code,
    'EMDASH_LOCALE_REQUIRED'
  )
})

test('localeNeed asks the served locales only when the answer depends on them', () => {
  assert.equal(localeNeed('content_get', { collection: 'home', id: 'home' }), 'read')
  assert.equal(localeNeed('content_update', { collection: 'home', id: 'home' }), 'write')
  assert.equal(localeNeed('content_update', { collection: 'home', id: HOME_ID }), 'none')
  assert.equal(localeNeed('content_publish', { collection: 'home', id: 'home' }), 'write')
  assert.equal(localeNeed('content_publish', { collection: 'home', id: HOME_ID }), 'none')
  assert.equal(localeNeed('content_list', { collection: 'home', locale: 'en' }), 'none')
  assert.equal(localeNeed('content_list', { collection: 'home' }, { allLocales: true }), 'none')
  assert.equal(localeNeed('settings_update', { title: 'x' }), 'none')
})

test("entryState tells a never-published entry from someone's pending change (D12)", () => {
  assert.equal(entryState(A.homeGet.item), 'live')
  assert.equal(entryState(A.homeStagedUpdate.item), 'pendingDraft')
  assert.equal(entryState(A.homePublish.item), 'live')
  // Status draft with a draft revision and no live one: its content, not a change waiting on a live page.
  assert.equal(entryState(A.investorsGet.item), 'unpublished')
  assert.equal(entryState(A.contactListAll.items[0]), 'unpublished')
  assert.deepEqual(draftFieldsOf(A.homeStagedUpdate.item), ['hero_title_a', 'hero_title_b'])
})

test('shapeRow keeps data byte for byte and flags a pending draft only on a live entry', () => {
  const row = shapeRow(A.homeGet.item)
  assert.deepEqual(row.data, A.homeGet.item.data)
  assert.equal(row._rev, A.homeGet._rev)
  assert.equal(row.pendingDraft, undefined)
  assert.deepEqual(Object.keys(row), ['id', 'slug', 'locale', 'status', '_rev', 'data'])
  assert.equal(shapeRow(A.homeStagedUpdate.item).pendingDraft, true)
  assert.equal(shapeRow(A.investorsGet.item).pendingDraft, undefined)
  assert.equal(shapeRow(A.homeGet.item, { revs: false })._rev, undefined)
  assert.equal(shapeRow(A.homeGet.item, { rev: 'native', revs: false })._rev, 'native')
})

test("a parsed, shaped content_get is at least 30 % shorter than r2's answer, with nothing escaped twice", () => {
  const answer = {
    ok: true,
    site: 'ed-ivj9ni',
    tool: 'content_get',
    result: shapeAnswer({ tool: 'content_get', args: {}, data: A.homeGet }),
    locale: { filled: 'en' }
  }
  const text = JSON.stringify(answer)
  // r2 returned EmDash's pretty JSON as a string inside Tracy's JSON: 5,536 chars for this entry.
  assert.equal(BUSINESS.r2.homeGetChars, 5536)
  assert.ok(text.length <= 0.7 * BUSINESS.r2.homeGetChars, `${text.length} chars`)
  assert.equal(/\\n|\\"/.test(text), false)
  // A pending draft names the fields that wait, not a second copy of the page.
  const pending = shapeAnswer({
    tool: 'content_get',
    args: {},
    data: { item: A.homeStagedUpdate.item, _rev: 'r' }
  })
  assert.deepEqual(pending.draftFields, ['hero_title_a', 'hero_title_b'])
  assert.equal(pending.item._rev, 'r')
})

test('shapeAnswer is total: an answer of an unexpected shape comes back as EmDash sent it', () => {
  for (const tool of [
    'content_list',
    'content_get',
    'content_update',
    'menu_get',
    'menu_list',
    'schema_get_collection'
  ])
    assert.deepEqual(shapeAnswer({ tool, args: {}, data: { surprise: 1 } }), { surprise: 1 }, tool)
  assert.equal(shapeAnswer({ tool: 'content_get', args: {}, data: null }), null)
  assert.deepEqual(shapeAnswer({ tool: 'content_get', args: {}, data: A.homeGet, raw: true }), A.homeGet)
  const schema = shapeAnswer({ tool: 'schema_get_collection', args: {}, data: A.schemaHome })
  assert.ok(JSON.stringify(schema).length < 0.5 * JSON.stringify(A.schemaHome).length)
  assert.ok(schema.fields.every((f) => typeof f.slug === 'string' && typeof f.type === 'string'))
  const cols = shapeAnswer({ tool: 'schema_list_collections', args: {}, data: A.schemaList })
  assert.deepEqual(Object.keys(cols.items[0]).sort(), ['description', 'label', 'slug'])
  const menus = shapeAnswer({ tool: 'menu_list', args: {}, data: A.menuList })
  assert.deepEqual(menus.items[0], {
    name: 'footer_company',
    label: 'Footer: company',
    locale: 'en',
    itemCount: 4
  })
})

test('each budget row cuts whole records, keeps valid JSON and names a parameter the tool takes', () => {
  const argsOf = new Map(TOOLS_038.map((t) => [t.name, new Set(t.args)]))
  for (const [tool, rule] of Object.entries(EMDASH_BUDGETS)) {
    if (rule.listKey === undefined) continue
    // A `slim` list (entries) is cut by field first (see the slim tests below), so its rows here are
    // ones with nothing to leave out — eight short values each — and still overflow: rows go from the tail.
    const short = Object.fromEntries([...'abcdefgh'].map((k) => [k, 'x'.repeat(45)]))
    const rows = Array.from({ length: 60 }, (_, i) =>
      rule.slim === true ? { id: `row-${i}`, ...short } : { id: `row-${i}`, text: 'x'.repeat(400) }
    )
    const cut = budget(tool, { [rule.listKey]: rows, nextCursor: 'past-the-page' })
    const text = JSON.stringify(cut)
    assert.ok(text.length <= rule.maxChars, `${tool}: ${text.length}`)
    assert.ok(cut.truncated.shown > 0 && cut.truncated.shown < 60, tool)
    for (const [i, r] of cut[rule.listKey].entries()) assert.deepEqual(r, rows[i], 'no record is cut inside')
    if (rule.paged === true) {
      // Paged by cursor: the page's own cursor (no resume point: these rows carry no order value)
      // is kept, and `next` says it skips the rows cut and which limit loses nothing.
      for (const p of ['limit', 'cursor']) assert.ok(argsOf.get(tool).has(p), `${tool} takes no ${p}`)
      const shown = cut.truncated.shown
      assert.equal(cut.nextCursor, 'past-the-page', tool)
      assert.equal(
        cut.next,
        `${60 - shown} of 60 rows were left out to fit ${rule.maxChars.toLocaleString('en-US')} chars, and this page's nextCursor skips them: send the same call with limit:${shown} and follow that answer's nextCursor.`
      )
    } else {
      assert.equal(cut.nextCursor, undefined, `${tool}: a cursor past the whole page would skip the rows cut`)
      assert.equal(cut.next, rule.next)
    }
    // The `next` names only arguments the tool it calls really takes (0.38 inputSchema).
    const call = /^(\w+) \{([^}]*)\}/.exec(rule.next)
    if (call && argsOf.has(call[1]))
      for (const p of call[2]
        .split(',')
        .map((x) => x.trim().split(':')[0])
        .filter(Boolean))
        assert.ok(argsOf.get(call[1]).has(p), `${tool}: ${call[1]} takes no ${p}`)
  }
  // An answer under its budget is the same object; a tool with no budget is never cut.
  const small = { items: [{ id: 1 }] }
  assert.equal(budget('content_list', small), small)
  const big = { item: { data: { body: 'x'.repeat(40_000) } } }
  for (const tool of ['content_get', 'schema_get_collection', 'content_translations'])
    assert.equal(budget(tool, big), big)
  // menu_list answers an array: it is cut as the list it is.
  const menus = budget(
    'menu_list',
    Array.from({ length: 200 }, (_, i) => ({ name: `menu_${i}`, label: 'y'.repeat(60) }))
  )
  assert.ok(JSON.stringify(menus).length <= 8000)
  assert.equal(menus.next, 'menu_get {name} reads one menu')
})

/**
 * 🔒 F7 (28/09/2026): THE RESUME CURSOR IS PROVEN ON THE ROWS EMDASH SENT, NOT THE SHAPED ONES.
 * `shapeRow` drops `createdAt`/`updatedAt` — and `createdAt` is exactly what a `content_list` cursor
 * orders by (`EMDASH_BUDGETS.content_list.cursorKey`). So no shaped row could ever match the cursor's
 * order value: `resumeCursor` answered null on every cut page and the answer fell back to the PAGE's
 * own cursor, which starts after the last row of the page and therefore skips every row the cut left
 * out. Measured: following it reached 31 of 120 posts.
 */
test('🔒 F7: a cut page resumes right after the last row SHOWN, from the timestamps EmDash sent', () => {
  const at = (i) => `2026-09-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`
  const cursor = (orderValue, id) =>
    Buffer.from(JSON.stringify({ orderValue, id }), 'utf8').toString('base64')
  const total = 40
  // As EmDash sends them: the timestamps are there, and the page's cursor is built from its LAST row.
  const sent = Array.from({ length: total }, (_, i) => ({
    id: `ROW${String(i).padStart(2, '0')}`,
    // A long slug keeps each row big once cut by field (the title is left out), so the page overflows.
    slug: `row-${i}-${'s'.repeat(150)}`,
    locale: 'en',
    status: 'published',
    createdAt: at(i),
    updatedAt: at(i),
    data: { title: 'x'.repeat(300) }
  }))
  const pageCursor = cursor(at(total - 1), sent[total - 1].id)
  // As the model sees them: `shapeRow` has dropped the timestamps.
  const shaped = sent.map((row) => shapeRow(row, { revs: false }))

  const cut = budget('content_list', { items: shaped, nextCursor: pageCursor }, sent)
  const shown = cut.truncated.shown
  assert.ok(shown > 0 && shown < total, `${shown} of ${total}`)
  // The cursor names the LAST ROW SHOWN, so the same call with it reads the very next row.
  assert.equal(cut.nextCursor, cursor(at(shown - 1), sent[shown - 1].id))
  assert.notEqual(cut.nextCursor, pageCursor, 'the page cursor would skip every row cut')
  assert.match(cut.next, /nextCursor starts right after the last row shown/)
  // And no timestamp came back to the model: the raw rows are read for the cursor and nothing else.
  for (const row of cut.items) assert.deepEqual([row.createdAt, row.updatedAt], [undefined, undefined])

  // Without them — a caller that has no raw rows — nothing is invented: the page's own cursor, and
  // `next` says plainly that it skips the rows cut.
  const blind = budget('content_list', { items: shaped, nextCursor: pageCursor })
  assert.equal(blind.nextCursor, pageCursor)
  assert.match(blind.next, /this page's nextCursor skips them/)
  // Rows that do not line up with the shaped ones are not trusted either.
  const mismatched = budget('content_list', { items: shaped, nextCursor: pageCursor }, sent.slice(0, 5))
  assert.equal(mismatched.nextCursor, pageCursor)
})

test('🔒 budget: when not one whole row fits, rows are cut by field — ids kept, the read of one whole row named', () => {
  const body = 'y'.repeat(9000)
  const row = (i) => ({
    id: `ROW${i}`,
    slug: `row-${i}`,
    locale: 'en',
    status: 'published',
    _rev: 'r',
    data: { body },
    seo: { title: 't' }
  })
  // One page whose rows all fit once cut: every row, the cursor kept, the fields left out named.
  const page = budget('content_list', { items: [row(0), row(1)], nextCursor: 'c2' })
  assert.deepEqual(page.items, [
    { id: 'ROW0', slug: 'row-0', locale: 'en', status: 'published', _rev: 'r', _cut: ['data', 'seo'] },
    { id: 'ROW1', slug: 'row-1', locale: 'en', status: 'published', _rev: 'r', _cut: ['data', 'seo'] }
  ])
  assert.equal(page.nextCursor, 'c2')
  assert.deepEqual(page.truncated, {
    shown: 2,
    total: 2,
    chars: JSON.stringify({ items: [row(0), row(1)], nextCursor: 'c2' }).length,
    fieldsLeftOut: ['data', 'seo']
  })
  assert.equal(
    page.next,
    "One whole row is over 8,000 chars, so rows show who they are (left out: data, seo). A row's _cut lists what it lost; a field neither shown nor listed is not set. content_get {collection, id} reads one whole entry."
  )
  assert.ok(JSON.stringify(page).length <= 8000)
  // So many rows that even cut they overflow: cut rows from the head, the page's cursor kept, both
  // ways named — the one-row read, and the limit whose cursor skips nothing.
  const many = Array.from({ length: 100 }, (_, i) => ({ ...row(i), title: 'z'.repeat(150) }))
  const cut = budget('content_list', { items: many, nextCursor: 'c2' })
  assert.ok(JSON.stringify(cut).length <= 8000, `${JSON.stringify(cut).length}`)
  assert.ok(cut.truncated.shown > 0 && cut.truncated.shown < 100)
  assert.equal(cut.truncated.total, 100)
  assert.equal(cut.nextCursor, 'c2')
  assert.deepEqual(cut.truncated.fieldsLeftOut, ['data', 'seo'])
  assert.equal(
    cut.next,
    `One whole row is over 8,000 chars, so rows show who they are (left out: data, seo). A row's _cut lists what it lost; a field neither shown nor listed is not set. content_get {collection, id} reads one whole entry. ${100 - cut.truncated.shown} of 100 rows were left out to fit 8,000 chars, and this page's nextCursor skips them: send the same call with limit:${cut.truncated.shown} and follow that answer's nextCursor.`
  )
  for (const r of cut.items) assert.equal(r.data, undefined)
  // A list with no one-row read says so without naming a call; rows of short values only are cut as records.
  const trash = budget('content_list_trashed', { items: [row(0)] })
  assert.equal(trash.items[0].id, 'ROW0')
  assert.equal(
    trash.next,
    "One whole row is over 8,000 chars, so rows show who they are (left out: data, seo). A row's _cut lists what it lost; a field neither shown nor listed is not set."
  )
  const flat = budget('content_list', {
    items: [
      { id: 'x', note: 'q'.repeat(150) },
      ...Array.from({ length: 80 }, (_, i) => ({ id: `r${i}`, note: 'q'.repeat(150) }))
    ]
  })
  assert.equal(flat.truncated.fieldsLeftOut, undefined)
  // Every call a `whole` names takes the parameters it names (0.38 inputSchema).
  const argsOf = new Map(TOOLS_038.map((t) => [t.name, new Set(t.args)]))
  for (const [tool, rule] of Object.entries(EMDASH_BUDGETS)) {
    if (rule.whole === undefined) continue
    const call = /^(\w+) \{([^}]*)\}/.exec(rule.whole)
    assert.ok(call && argsOf.has(call[1]), `${tool}: ${rule.whole}`)
    for (const p of call[2].split(',').map((x) => x.trim()))
      assert.ok(argsOf.get(call[1]).has(p), `${tool}: ${call[1]} takes no ${p}`)
  }
})

/**
 * An entry row as `content_list` answers it for a collection of things a customer names (a project, a
 * service, a post): short values, a summary, and a picture object with its metadata — the shape that
 * made a 10-row page show 8 rows on the round-7 bench, the row asked for being the ninth.
 */
const entryRow = (i, over = {}) => ({
  id: `01ENTRY${String(i).padStart(3, '0')}`,
  slug: `entry-${i}`,
  locale: 'en',
  status: 'published',
  _rev: `rev-${i}`,
  data: {
    title: `Entry number ${i}`,
    label: 'Category',
    year: '2024',
    area: '48 ha',
    city: 'Kaluga',
    summary: 'A short summary of what this entry is about, long enough to matter in a page of rows.',
    lede: 'A longer lede for the same entry, which reads like a second summary and sits beside it in the page. '.repeat(
      1
    ),
    cta_label: 'Discuss a similar entry',
    next_title: 'Other entries',
    featured: 1,
    sort: i,
    image: {
      id: `IMG${i}`,
      provider: 'local',
      filename: `photo-${i}.png`,
      mimeType: 'image/png',
      width: 900,
      height: 560,
      blurhash: 'L'.repeat(28),
      dominantColor: 'rgb(181,185,186)',
      alt: `Picture ${i}`,
      meta: {
        storageKey: `KEY${i}.KEY${i}.png`,
        caption: null,
        blurhash: 'L'.repeat(28),
        dominantColor: 'rgb(181,185,186)'
      }
    },
    ...over
  }
})

test('🔒 slim list: a page over its budget shows EVERY row by who it is, and the row asked for is not the one cut', () => {
  const rows = Array.from({ length: 10 }, (_, i) => entryRow(i))
  assert.ok(JSON.stringify({ items: rows }).length > 8000, 'the whole page overflows')
  // Before (round 7): 8 of 10 rows, whole, and the ninth — the one named — cut. Now: all ten.
  const cut = budget('content_list', { items: rows })
  assert.equal(cut.items.length, 10)
  assert.deepEqual(
    cut.items.map((r) => r.slug),
    rows.map((r) => r.slug)
  )
  assert.ok(JSON.stringify(cut).length <= 8000, `${JSON.stringify(cut).length}`)
  // Who each row is, whole: ids, `_rev`, and the short values of `data`, the title first of them.
  for (const [i, r] of cut.items.entries()) {
    assert.equal(r.id, rows[i].id)
    assert.equal(r._rev, rows[i]._rev)
    assert.equal(r.data.title, `Entry number ${i}`)
    assert.equal(r.data.summary, rows[i].data.summary)
    // A picture object is left out whole, never copied back without its metadata.
    assert.equal(r.data.image, undefined)
  }
  assert.deepEqual(cut.truncated, {
    shown: 10,
    total: 10,
    chars: JSON.stringify({ items: rows }).length,
    fieldsLeftOut: ['data.image']
  })
  assert.equal(
    cut.next,
    "Rows are cut to fit 8,000 chars (left out: data.image). A row's _cut lists what it lost; a field neither shown nor listed is not set. content_get {collection, id} reads one whole entry."
  )
  // Each row says what IT lost (review of round 7, RL-3): a key a row lacks is then either listed there or not set.
  for (const r of cut.items) assert.deepEqual(r._cut, ['data.image'])
  // The page's own cursor still leads to the next page: every row of this one is here.
  assert.equal(budget('content_list', { items: rows, nextCursor: 'c2' }).nextCursor, 'c2')
})

test('🔒 slim list: rows are cut to short values only before a row is dropped, the title kept whatever its length', () => {
  const long =
    'Words that fill a summary of a hundred characters and a little more, so a row is wide. '.repeat(1)
  const title = 'A title well over sixty characters long, which a row is still found by, in full'
  const rows = Array.from({ length: 16 }, (_, i) => entryRow(i, { summary: long, title, note: long }))
  assert.ok(JSON.stringify(budget('content_list', { items: rows.slice(0, 1) })).length < 8000)
  const cut = budget('content_list', { items: rows })
  // Sixteen rows do not fit at 200 characters a value, and fit at 60: every row, titles whole.
  assert.equal(cut.items.length, 16)
  assert.ok(JSON.stringify(cut).length <= 8000)
  for (const r of cut.items) {
    assert.equal(r.data.title, title)
    assert.equal(r.data.summary, undefined)
    assert.equal(r.data.year, '2024')
  }
  assert.deepEqual(cut.truncated.fieldsLeftOut, ['data.summary', 'data.lede', 'data.image', 'data.note'])
})

test('🔒 slim list: rows that still overflow are dropped from the tail, cut by field, with the page cursor and the way on', () => {
  const rows = Array.from({ length: 100 }, (_, i) => entryRow(i))
  const cut = budget('content_list', { items: rows, nextCursor: 'c2' })
  const shown = cut.items.length
  assert.ok(shown > 20 && shown < 100, `${shown}`)
  assert.ok(JSON.stringify(cut).length <= 8000)
  assert.equal(cut.truncated.shown, shown)
  assert.equal(cut.truncated.total, 100)
  // More rows than before the change (9 whole rows fit), each with its title.
  for (const [i, r] of cut.items.entries()) assert.equal(r.data.title, `Entry number ${i}`)
  assert.equal(cut.nextCursor, 'c2')
  assert.equal(
    cut.next,
    `Rows are cut to fit 8,000 chars (left out: data.summary, data.lede, data.image). A row's _cut lists what it lost; a field neither shown nor listed is not set. content_get {collection, id} reads one whole entry. ${100 - shown} of 100 rows were left out to fit 8,000 chars, and this page's nextCursor skips them: send the same call with limit:${shown} and follow that answer's nextCursor.`
  )
  // A page that fits whole is the same object; a draft flag and a long slug survive the cut.
  const small = { items: [entryRow(0)] }
  assert.equal(budget('content_list', small), small)
  const flagged = budget('content_list', {
    items: [
      { ...entryRow(0), pendingDraft: true, slug: `s-${'x'.repeat(120)}` },
      ...Array.from({ length: 9 }, (_, i) => entryRow(i + 1))
    ]
  })
  assert.equal(flagged.items[0].pendingDraft, true)
  assert.equal(flagged.items[0].slug.length, 122)
})

// Review of round 7, RL-3. `fieldsLeftOut` is the union over the page, and a value left out is not there at
// all: in a list where some posts' excerpts are cut (61–200 characters at the narrow level) and others' are
// empty or short and kept, "the row has no excerpt" could not be told from "its excerpt was cut" — and a model
// asked to write a summary for every post that has none wrote over a customer's own. A row that lost a field
// now names it in a `_cut` of its own, so a field neither shown nor listed there is not set.
test('🔒 slim list: a row that lost a field names it, so a key a row lacks is either listed in its _cut or not set', () => {
  const post = (i, excerpt) => ({
    id: `01POST${String(i).padStart(3, '0')}`,
    slug: `post-${i}`,
    locale: 'en',
    status: 'published',
    _rev: `rev-${i}`,
    data: { title: `Post number ${i}`, ...(excerpt === undefined ? {} : { excerpt }), lede: 'l'.repeat(190) }
  })
  // Three kinds of post, in turn: a 130-character excerpt (cut at 60), an EMPTY one (kept), none at all.
  const kinds = [() => 'e'.repeat(130), () => '', () => undefined]
  const rows = Array.from({ length: 24 }, (_, i) => post(i, kinds[i % 3]()))
  assert.ok(JSON.stringify({ items: rows }).length > 8000, 'the page overflows at 200 characters a value')

  const cut = budget('content_list', { items: rows })

  assert.equal(cut.items.length, 24, 'every row is here')
  assert.match(cut.next, /A row's _cut lists what it lost; a field neither shown nor listed is not set\./)
  for (const [i, r] of cut.items.entries()) {
    assert.equal(r.data.lede, undefined, 'the narrow level cut every lede')
    if (i % 3 === 0) {
      assert.equal(r.data.excerpt, undefined)
      assert.deepEqual(
        r._cut,
        ['data.excerpt', 'data.lede'],
        `post ${i}: its excerpt was cut, and it says so`
      )
    } else if (i % 3 === 1) {
      assert.equal(r.data.excerpt, '', `post ${i}: an empty excerpt is shown as empty`)
      assert.deepEqual(r._cut, ['data.lede'])
    } else {
      assert.equal(Object.hasOwn(r.data, 'excerpt'), false)
      assert.deepEqual(r._cut, ['data.lede'], `post ${i}: no excerpt and none listed: it has none`)
    }
  }
})

test('slim list: only the lists of entries are cut by field; a media, search or term list keeps whole rows', () => {
  for (const tool of Object.keys(EMDASH_BUDGETS))
    assert.equal(
      EMDASH_BUDGETS[tool].slim === true,
      tool === 'content_list' || tool === 'content_list_trashed',
      tool
    )
  const media = Array.from({ length: 60 }, (_, i) => ({
    id: `M${i}`,
    filename: `f${i}.png`,
    alt: 'a'.repeat(190)
  }))
  const cut = budget('media_list', { items: media })
  assert.ok(cut.truncated.shown < 60)
  assert.equal(cut.truncated.fieldsLeftOut, undefined)
  for (const r of cut.items) assert.equal(r.alt.length, 190)
  // The trash lists entries too.
  const trashed = budget('content_list_trashed', { items: Array.from({ length: 10 }, (_, i) => entryRow(i)) })
  assert.equal(trashed.items.length, 10)
})

/** EmDash's own cursor: base64 of `{orderValue, id}` (core `repositories/types.ts` `encodeCursor`). */
const emdashCursor = (orderValue, id) => Buffer.from(JSON.stringify({ orderValue, id })).toString('base64')

/**
 * `media_list` as EmDash 0.37 pages it (core `repositories/media.ts` `findMany`): newest first,
 * `(createdAt, id) < cursor`, and a `nextCursor` naming the page's last row only when more follow.
 */
function mediaPage(all, { limit = 50, cursor } = {}) {
  let rows = all
  if (cursor !== undefined) {
    const c = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'))
    rows = rows.filter((m) => m.createdAt < c.orderValue || (m.createdAt === c.orderValue && m.id < c.id))
  }
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return rows.length > limit ? { items, nextCursor: emdashCursor(last.createdAt, last.id) } : { items }
}

// 39 media rows, newest first, each ~500 chars: 14 fit in media_list's 8,000.
const MEDIA = Array.from({ length: 39 }, (_, i) => {
  const n = String(39 - i).padStart(2, '0')
  return {
    id: `01MEDIA${n}`,
    filename: `photo-${n}.jpg`,
    mimeType: 'image/jpeg',
    alt: 'a'.repeat(400),
    createdAt: `2026-09-${n}T10:00:00.000Z`
  }
})

test('🔒 a cut media_list keeps a nextCursor that starts right after the last row shown — the last page included', () => {
  for (const limit of [50, 20]) {
    const first = budget('media_list', mediaPage(MEDIA, { limit }))
    const shown = first.items.length
    assert.ok(shown > 0 && shown < Math.min(limit, 39), `limit ${limit}: ${shown} shown`)
    assert.ok(JSON.stringify(first).length <= EMDASH_BUDGETS.media_list.maxChars)
    assert.equal(typeof first.nextCursor, 'string', `limit ${limit}: the rows cut must stay reachable`)
    assert.match(first.next, new RegExp(`^${Math.min(limit, 39) - shown} of ${Math.min(limit, 39)} rows`))
    assert.match(first.next, /cursor:<nextCursor>/)
    // Following it reads every row once, in order — the ones cut here included.
    const seen = [...first.items]
    let page = first
    while (typeof page.nextCursor === 'string' && seen.length < 60) {
      page = budget('media_list', mediaPage(MEDIA, { limit, cursor: page.nextCursor }))
      seen.push(...page.items)
    }
    assert.deepEqual(
      seen.map((m) => m.id),
      MEDIA.map((m) => m.id),
      `limit ${limit}`
    )
  }
})

test('🔒 a cut list keeps its own nextCursor when no resume point can be proven, and says it skips the rows cut', () => {
  // Eight short values a row: nothing to cut by field, so the rows that do not fit are dropped whole.
  const short = Object.fromEntries([...'abcdefgh'].map((k) => [k, 'x'.repeat(45)]))
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: `ROW${i}`, slug: `row-${i}`, ...short }))
  // content_list rows carry no order value (`shapeRow`), so the page's cursor is kept as EmDash wrote
  // it, and `next` gives the road that loses nothing.
  const kept = budget('content_list', { items: rows, nextCursor: 'opaque-past-the-page' })
  const shown = kept.items.length
  assert.ok(shown > 0 && shown < 30)
  assert.equal(kept.nextCursor, 'opaque-past-the-page')
  assert.equal(
    kept.next,
    `${30 - shown} of 30 rows were left out to fit 8,000 chars, and this page's nextCursor skips them: send the same call with limit:${shown} and follow that answer's nextCursor.`
  )
  assert.ok(JSON.stringify(kept).length <= 8000)
  // The last page (no cursor at all): the same road, and no cursor invented.
  const last = budget('content_list', { items: rows })
  assert.equal(last.nextCursor, undefined)
  assert.equal(
    last.next,
    `${30 - last.items.length} of 30 rows were left out to fit 8,000 chars: send the same call with limit:${last.items.length} and follow that answer's nextCursor.`
  )
  // 🔒 Round 7: "with limit:7, then cursor:<the nextCursor it answers>" was read as ONE call — a model sent
  // `limit:7` with a cursor it made up and was refused INVALID_CURSOR. This page has no cursor to send:
  // the sentence must not put a `cursor:` beside the `limit:` at all.
  assert.doesNotMatch(last.next, /cursor:</)
  // A list the door does not page (no cursor argument) says what it said before.
  const revisions = budget('revision_list', { items: rows })
  assert.equal(revisions.next, EMDASH_BUDGETS.revision_list.next)
  assert.equal(revisions.nextCursor, undefined)
})

test("catalogueOf: one line per tool, the 0.38 catalogue inside {list:true}'s 6,000; schemasOf answers only the named tools", () => {
  const tools = toolsOf(BUSINESS.toolsList)
  const lines = catalogueOf(tools)
  assert.equal(lines.length, 59)
  const answer = { ok: true, site: 'ed-ivj9ni', tools: lines, next: EMDASH_BUDGETS.list.next }
  // r2's {list:true} answer was 49,977 chars, read in 32 of 33 cases.
  assert.equal(BUSINESS.r2.listChars, 49977)
  assert.ok(JSON.stringify(answer).length <= 6000, `${JSON.stringify(answer).length} chars`)
  assert.equal(budget('list', answer), answer, 'the whole catalogue fits: nothing is cut')
  assert.equal(
    lines[0],
    'content_list — List content items in a collection with optional filtering and pagination.'
  )
  const s = schemasOf(tools, ['content_update', 'content.list', 'page.text'])
  assert.deepEqual(
    s.tools.map((t) => t.name),
    ['content_update', 'content_list']
  )
  assert.deepEqual(s.unknown, ['page.text'])
  assert.equal(s.tools[0].inputSchema.$schema, undefined)
  assert.ok(s.tools[0].inputSchema.properties._rev)
})

test("menuItemsForSet answers menu_get in menu_set_items' own shape, parents before children", () => {
  const items = menuItemsForSet(A.menuPrimary.items)
  assert.equal(items.length, 6)
  assert.deepEqual(items[0], { label: 'Home', type: 'custom', customUrl: '/' })
  for (const it of items) for (const v of Object.values(it)) assert.notEqual(v, null)
  // A child listed before its parent is moved after it: parentIndex "must be earlier in the list".
  const nested = menuItemsForSet([
    { id: 'c', label: 'Child', type: 'custom', customUrl: '/c', parentId: 'p', titleAttr: null },
    { id: 'p', label: 'Parent', type: 'custom', customUrl: '/p', parentId: null },
    {
      id: 'q',
      label: 'Orphan',
      type: 'page',
      referenceCollection: 'pages',
      referenceId: 'X',
      parentId: 'gone'
    }
  ])
  assert.deepEqual(nested, [
    { label: 'Parent', type: 'custom', customUrl: '/p' },
    { label: 'Child', type: 'custom', customUrl: '/c', parentIndex: 0 },
    { label: 'Orphan', type: 'page', referenceCollection: 'pages', referenceId: 'X' }
  ])
  // The fixture's set schema takes exactly these keys.
  const setSchema = BUSINESS.toolsList.tools.find((t) => t.name === 'menu_set_items').inputSchema
  const allowed = new Set(Object.keys(setSchema.properties.items.items.properties))
  for (const it of [...items, ...nested]) for (const k of Object.keys(it)) assert.ok(allowed.has(k), k)
})

test('receiptOf: each field before and after, live when published, the publishing call when staged', () => {
  const args = {
    collection: 'home',
    id: HOME_ID,
    data: { hero_title_a: 'Built for the way', hero_title_b: 'you work' }
  }
  const staged = receiptOf({
    tool: 'content_update',
    args,
    answer: A.homeStagedUpdate,
    before: A.homeGet.item
  })
  assert.deepEqual(staged.changed, {
    hero_title_a: { before: 'Furniture built to fit', after: 'Built for the way' },
    hero_title_b: { before: 'your exact space', after: 'you work' }
  })
  assert.equal(staged.live, false)
  assert.equal(staged._rev, A.homeStagedUpdate._rev)
  assert.equal(
    staged.next,
    `Staged as a draft: no visitor sees it yet. content_publish {collection:"home", id:"${HOME_ID}", _rev:"${A.homeStagedUpdate._rev}"} puts it live, unless the customer asked for a draft.`
  )
  assert.ok(JSON.stringify(staged).length <= 3000)
  // r2's answer to this very write was 10,154 chars.
  assert.equal(BUSINESS.r2.stagedUpdateChars, 10154)
  const live = receiptOf({
    tool: 'content_update',
    args,
    answer: { ...A.homePublish },
    before: A.homeGet.item
  })
  assert.equal(live.live, true)
  // G4 (27/09): a live write says it is the receipt; its undo is beside it.
  assert.equal(live.next, EMDASH_RECEIPT_NEXT)
  assert.match(live.undo, /content_update .*before/)
  // A value too long to show whole: undo is EmDash's own restore of the live revision.
  const longText = 'y'.repeat(900)
  const cut = receiptOf({
    tool: 'content_update',
    args: { collection: 'home', id: HOME_ID, data: { hero_text: longText } },
    answer: { item: { ...A.homePublish.item, data: { hero_text: longText } }, _rev: 'r' },
    before: A.homeGet.item
  })
  assert.match(cut.undo, new RegExp(`^revision_restore \\{revisionId:"${A.homeGet.item.liveRevisionId}"\\}`))
  // An entry that was never live says so when it goes live.
  const wentLive = receiptOf({
    tool: 'content_publish',
    args: { collection: 'investors' },
    answer: {
      item: { ...A.investorsGet.item, status: 'published', liveRevisionId: 'L', draftRevisionId: null },
      _rev: 'r'
    },
    before: A.investorsGet.item
  })
  assert.equal(wentLive.note, 'This entry was not published before; it is live now.')
  const created = receiptOf({
    tool: 'content_create',
    args: { collection: 'posts' },
    answer: {
      item: {
        id: 'N',
        slug: 'n',
        status: 'draft',
        liveRevisionId: null,
        draftRevisionId: 'D',
        version: 1,
        updatedAt: 'u'
      },
      _rev: 'r'
    }
  })
  assert.match(created.next, /^Created as a draft/)
})

test('draftGuard (D12): someone else\'s draft is not published; this conversation\'s is; "draft" on a live entry unpublishes', () => {
  const args = { collection: 'home', id: HOME_ID, _rev: 'r', status: 'published', data: {} }
  const g = draftGuard({ tool: 'content_update', args, before: A.homeStagedUpdate.item, stagedHere: false })
  assert.equal(g.code, 'PENDING_DRAFT')
  assert.deepEqual(g.draftFields, ['hero_title_a', 'hero_title_b'])
  assert.ok(g.error.length <= 160)
  assert.equal(
    draftGuard({ tool: 'content_publish', args, before: A.homeStagedUpdate.item, stagedHere: false }).code,
    'PENDING_DRAFT'
  )
  assert.equal(
    draftGuard({ tool: 'content_update', args, before: A.homeStagedUpdate.item, stagedHere: true }),
    null
  )
  // Never published: publishing it is what publishing is for.
  assert.equal(
    draftGuard({ tool: 'content_update', args, before: A.investorsGet.item, stagedHere: false }),
    null
  )
  // No status: it stages, it does not publish — the flow answers `mixed` instead.
  assert.equal(
    draftGuard({
      tool: 'content_update',
      args: { ...args, status: undefined },
      before: A.homeStagedUpdate.item,
      stagedHere: false
    }),
    null
  )
  const off = draftGuard({
    tool: 'content_update',
    args: { ...args, status: 'draft' },
    before: A.homeGet.item,
    stagedHere: false
  })
  assert.equal(off.code, 'WOULD_UNPUBLISH')
  assert.equal(
    draftGuard({
      tool: 'content_update',
      args: { ...args, status: 'draft' },
      before: A.investorsGet.item,
      stagedHere: false
    }),
    null
  )
})

test('missingCollectionOf: a collection the site lacks — COLLECTION_NOT_FOUND always, NOT_FOUND only when the message says so', () => {
  const refusal = (/** @type {string} */ emdash, /** @type {string} */ error, extra = {}) => ({
    ok: false,
    code: 'TOOL_FAILED',
    tool: 'content_list',
    emdash,
    error,
    ...extra
  })
  assert.equal(
    missingCollectionOf(
      refusal('COLLECTION_NOT_FOUND', "[COLLECTION_NOT_FOUND] Collection 'post' not found")
    ),
    'post'
  )
  assert.equal(
    missingCollectionOf(refusal('NOT_FOUND', '[NOT_FOUND] Collection "post" not found')),
    'post',
    'either quote'
  )
  // the name falls back to the argument, then to nothing: the list is still worth answering
  assert.equal(
    missingCollectionOf(
      refusal('COLLECTION_NOT_FOUND', '[COLLECTION_NOT_FOUND] not found', { collection: 'x' })
    ),
    'x'
  )
  assert.equal(missingCollectionOf(refusal('COLLECTION_NOT_FOUND', 'gone')), '')
  // not a collection: an entry, a menu, a redirect, another class, or not EmDash's refusal at all
  for (const other of [
    refusal('NOT_FOUND', '[NOT_FOUND] Content item not found: nope'),
    refusal('NOT_FOUND', "[NOT_FOUND] Menu 'main' not found"),
    refusal('CONFLICT', "[CONFLICT] Collection 'post' not found"),
    { ok: false, code: 'SITE_UNREACHABLE', error: "Collection 'post' not found" }
  ])
    assert.equal(missingCollectionOf(other), null, JSON.stringify(other))
})

test('collectionsAnswer: every slug with its label, the nearest to the guess named, one sentence within T10', () => {
  const listed = (/** @type {unknown[]} */ items) => ({ ok: true, result: { items } })
  const shop = [
    { slug: 'site', label: 'Site chrome' },
    { slug: 'home', label: 'Home page', urlPattern: '/' },
    { slug: 'offers_page', label: 'Offers page', urlPattern: '/offers' },
    { slug: 'products', label: 'Shop', urlPattern: '/shop/{slug}' },
    { slug: 'pages', label: 'Pages', urlPattern: '/{slug}' }
  ]
  const a = collectionsAnswer(listed(shop), 'shop')
  assert.deepEqual(a?.collections, {
    site: 'Site chrome',
    home: 'Home page',
    offers_page: 'Offers page',
    products: 'Shop',
    pages: 'Pages'
  })
  assert.equal(
    a?.next,
    'The same call with one of the keys of collections (slug: label); closest to "shop": products (Shop).'
  )
  // singular ↔ plural, the page's own collection, and a label that only repeats the slug is not printed
  assert.match(
    String(collectionsAnswer(listed(shop), 'product')?.next),
    /closest to "product": products \(Shop\)\.$/
  )
  assert.match(String(collectionsAnswer(listed(shop), 'offers')?.next), /closest to "offers": offers_page\.$/)
  // nothing near, or a guess too short to compare: the list alone
  for (const guess of ['zebra', 'a', '']) {
    const far = collectionsAnswer(listed(shop), guess)
    assert.equal(far?.next, 'The same call with one of the keys of collections (slug: label).', guess)
  }
  // no list, no slug → null: the refusal keeps the static next `refusalNext` writes
  for (const nothing of [
    null,
    { ok: false, code: 'SITE_UNREACHABLE' },
    listed([]),
    listed([{ label: 'x' }, 7])
  ])
    assert.equal(collectionsAnswer(nothing, 'shop'), null)
  // worst case: a runaway site and a long guess stay inside T10's 200 characters and 40 keys
  const many = Array.from({ length: 60 }, (_, i) => ({
    slug: `collection_number_${i}_with_a_long_slug`,
    label: `A very long label for collection ${i}`
  }))
  const worst = collectionsAnswer(listed(many), 'collection'.repeat(20))
  assert.equal(Object.keys(worst?.collections ?? {}).length, 40)
  assert.ok(String(worst?.next).length <= 200, String(worst?.next).length.toString())
  const guess = collectionsAnswer(listed(many), 'collection number 3')
  assert.ok(String(guess?.next).length <= 200)
})

// ── F4: the fields of the collections that hold records ride on the collection list ──────────────────────

test('recordCollectionsOf: collections with a page per entry first, then ones with no page; a page of its own and site chrome never', () => {
  const shop = [
    { slug: 'site', label: 'Site chrome' },
    { slug: 'home', label: 'Home page', urlPattern: '/' },
    { slug: 'offers_page', label: 'Offers page', urlPattern: '/offers' },
    { slug: 'stock_notes', label: 'Stock notes' },
    { slug: 'products', label: 'Shop', urlPattern: '/shop/{slug}' },
    { slug: 'pages', label: 'Pages', urlPattern: '/{slug}' }
  ]
  // `{slug}` in the address = one entry, one page: the records a listing shows. A collection with no address at
  // all (entries shown inside a page) follows. `offers_page` is one page; `site` is the template's chrome.
  assert.deepEqual(recordCollectionsOf(shop), ['products', 'pages', 'stock_notes'])
  assert.deepEqual(recordCollectionsOf([]), [])
  assert.deepEqual(recordCollectionsOf(/** @type {any} */ (null)), [])
  assert.deepEqual(
    recordCollectionsOf([
      { label: 'no slug', urlPattern: '/{slug}' },
      7,
      null,
      { slug: '', urlPattern: '/{slug}' }
    ]),
    []
  )
})

test('recordCollectionsOf: at most six, the ones with a page first, each group in the order the site lists them', () => {
  const page = (/** @type {number} */ i) => ({
    slug: `kind_${i}`,
    label: `Kind ${i}`,
    urlPattern: `/k${i}/{slug}`
  })
  const bare = (/** @type {number} */ i) => ({ slug: `bare_${i}`, label: `Bare ${i}` })
  const items = [bare(0), page(0), bare(1), page(1), page(2), bare(2), page(3), page(4), page(5), page(6)]
  assert.deepEqual(recordCollectionsOf(items), ['kind_0', 'kind_1', 'kind_2', 'kind_3', 'kind_4', 'kind_5'])
  assert.deepEqual(recordCollectionsOf([bare(0), page(0), bare(1), page(1)]), [
    'kind_0',
    'kind_1',
    'bare_0',
    'bare_1'
  ])
})

test('recordFieldsOf: name:type per field, required said in words, nothing a person would not write', () => {
  const schema = {
    slug: 'products',
    label: 'Shop',
    fields: [
      { slug: 'title', label: 'Title', type: 'string', required: true },
      { slug: 'price', label: 'Price', type: 'number' },
      { slug: 'photo', label: 'Photo', type: 'image' },
      { slug: 'body', label: 'Body', type: 'portableText', options: null },
      { slug: 'sku', label: 'SKU', type: 'string', required: false }
    ]
  }
  assert.equal(
    recordFieldsOf(schema),
    'title:string required, price:number, photo:image, body:portableText, sku:string'
  )
  // a field without a name or a type says nothing; a schema with no field, or not a schema, has no summary
  assert.equal(
    recordFieldsOf({ fields: [{ slug: 'title', type: 'string' }, { type: 'text' }, { slug: 'x' }, 7, null] }),
    'title:string'
  )
  for (const none of [
    null,
    undefined,
    'x',
    {},
    { fields: [] },
    { fields: 'no' },
    { fields: [{ label: 'x' }] }
  ])
    assert.equal(recordFieldsOf(none), null, JSON.stringify(none))
})

test('recordFieldsOf: a long field list is cut at a whole field and says how many it left out', () => {
  const fields = Array.from({ length: 60 }, (_, i) => ({ slug: `field_number_${i}`, type: 'string' }))
  const out = /** @type {string} */ (recordFieldsOf({ fields }))
  assert.ok(out.length <= 400, String(out.length))
  const left = /(?:, )\+(\d+) more$/.exec(out)
  assert.ok(left, out)
  const shown = out.slice(0, left.index).split(', ')
  assert.ok(shown.length >= 10, 'most of the list is kept')
  assert.ok(
    shown.every((one) => /^field_number_\d+:string$/.test(one)),
    'never half a field'
  )
  assert.equal(shown.length + Number(left[1]), 60, 'what is shown plus what is left out is every field')
  // exactly at the limit is not cut
  const fits = recordFieldsOf({ fields: [{ slug: 'a'.repeat(380), type: 'string' }] })
  assert.ok(String(fits).length <= 400 && !String(fits).endsWith('more'))
})

test("emdashCodeOf reads EmDash's own refusal class; the next step is never written here (D1)", () => {
  assert.equal(emdashCodeOf('[CONFLICT] Content changed while the operation was in progress'), 'CONFLICT')
  assert.equal(emdashCodeOf("[NOT_FOUND] Menu 'main' not found"), 'NOT_FOUND')
  assert.equal(emdashCodeOf('[VALIDATION_ERROR] title is required'), 'VALIDATION')
  assert.equal(emdashCodeOf('[INSUFFICIENT_SCOPE] content:write'), 'INSUFFICIENT_SCOPE')
  assert.equal(
    emdashCodeOf(
      'MCP error -32602: Input validation error: Invalid arguments for tool content_update: Invalid input'
    ),
    'VALIDATION'
  )
  assert.equal(
    emdashCodeOf('_rev is required: call content_get for this item and pass back the _rev it returns.'),
    'REV_MISSING'
  )
  assert.equal(emdashCodeOf('MCP error -32601: Tool page_text not found'), 'UNKNOWN_TOOL')
  assert.equal(emdashCodeOf('something else'), null)
})

test('every destructive tool names what it would remove, within 160 chars', () => {
  for (const tool of EMDASH_DESTRUCTIVE_TOOLS) {
    const { verb, target } = destructiveTarget(tool, {
      collection: 'posts',
      id: HOME_ID,
      slug: 'posts',
      fieldSlug: 'title',
      name: 'primary',
      taxonomy: 'category',
      termSlug: 'news',
      locale: 'en'
    })
    assert.ok(`${tool} ${verb} ${target}.`.length <= 160, tool)
    assert.doesNotMatch(target, /\?/, tool)
  }
  assert.equal(
    destructiveTarget('schema_delete_collection', { slug: 'posts' }).target,
    'the collection posts and every entry in it'
  )
})

test('the tracy_emdash description is the road (T9): within 1,500 chars, the words road verbatim, no contradiction', () => {
  assert.ok(EMDASH_DESCRIPTION.length <= 1500, `${EMDASH_DESCRIPTION.length} chars`)
  // One sentence, quoted by both texts that teach it (the site context's WORDS row is the other).
  assert.ok(EMDASH_DESCRIPTION.includes(EMDASH_WORDS_ROAD))
  // Which languages a change reaches is said once, in the site context (EMDASH_LANGUAGE_RULE): not
  // here in other words, and nothing here says a change goes to one language only.
  assert.ok(!EMDASH_DESCRIPTION.includes(EMDASH_LANGUAGE_RULE))
  // The one exception is what the delete DOOR does (09/10/2026): one content_delete takes the entry in all its
  // languages unless locale names one — the call's own effect, as WordPress's and Joomla's tiers line says it.
  const DELETE_CLAUSE = 'ONE call, all languages unless locale names one'
  assert.ok(EMDASH_DESCRIPTION.includes(DELETE_CLAUSE))
  assert.doesNotMatch(
    EMDASH_DESCRIPTION.replace(DELETE_CLAUSE, ''),
    /names no language|keep their own copy|every language|all languages/i
  )
  // V6 C3 and D29: no text says list first, ULID only, or "skip content_get".
  assert.doesNotMatch(
    EMDASH_DESCRIPTION,
    /list:\s*true\}?\s*first|Start with \{list|ULID, never a slug|no content_get first|skip content_get/i
  )
  assert.doesNotMatch(EMDASH_DESCRIPTION, /On a Joomla or WordPress site/)
  for (const phrase of ['CONFIRM_FIRST', 'ask_user_question', 'confirm:true', 'status:"draft"'])
    assert.ok(EMDASH_DESCRIPTION.includes(phrase), phrase)
  // 26/10/2026: labels and form words have their own doors (`taxonomy_update_term`, `form_words`).
  assert.doesNotMatch(EMDASH_DESCRIPTION, /not writable/i)
  // 🔒 27/09/2026: a customer's picture goes by the host's read, never by base64 the model types —
  // `media_upload {filename, contentType, base64}` here looped 24–40 steps on the stand. 29/09/2026:
  // the picture sent in the chat takes the same road (`attachment`).
  assert.match(
    EMDASH_DESCRIPTION,
    /tracy_site media\.upload \{file\} \(Files tab\) \| \{attachment\} \(in chat\) → its id into the field\./
  )
  assert.doesNotMatch(EMDASH_DESCRIPTION, /base64|contentType/)
  // CS2: site-agnostic — no label, host, port or locale tag of any real site.
  assert.doesNotMatch(
    EMDASH_DESCRIPTION,
    /ed-[a-z0-9]{6}|tracy\.(test|ai|site)|127\.0\.0\.1|-web-1|"en"|locale:"/
  )
  // Every EmDash tool it names, and every argument it gives them, exists on 0.38.
  const argsOf = new Map(TOOLS_038.map((t) => [t.name, new Set(t.args)]))
  const named = {
    menu_get: ['name'],
    menu_set_items: ['name', 'items'],
    content_get: ['collection', 'id']
  }
  for (const [tool, args] of Object.entries(named)) {
    assert.ok(EMDASH_DESCRIPTION.includes(tool), tool)
    for (const a of args) assert.ok(argsOf.get(tool)?.has(a), `${tool} takes no ${a}`)
  }
  for (const m of EMDASH_DESCRIPTION.matchAll(/\b([a-z]+_[a-z_]+)\s*\{/g))
    if (!m[1].startsWith('tracy_') && !EMDASH_REDIRECT_TOOLS.has(m[1]))
      assert.ok(argsOf.has(m[1]), `${m[1]} is not an EmDash 0.38 tool`)
  // v6: the redirect door and the no-rebuild SEO setting are named (Tracy's tools; settings_update is EmDash's).
  for (const t of EMDASH_REDIRECT_TOOLS) assert.ok(EMDASH_DESCRIPTION.includes(t), t)
  assert.ok(EMDASH_DESCRIPTION.includes('settings_update {seo:{'), 'settings_update {seo}')
  assert.ok(argsOf.get('settings_update')?.has('seo'), 'settings_update takes seo')
})

test('the EmDash prompt separates page removal, library deletion, and public URL revocation', () => {
  assert.match(EMDASH_DESCRIPTION, /content_update.*page image refs/i)
  assert.match(EMDASH_DESCRIPTION, /media_delete.*library record.*stored file/i)
  assert.match(EMDASH_DESCRIPTION, /cannot revoke public URLs.*purge edge caches.*caches may still serve/i)
  assert.ok(!EMDASH_DESTRUCTIVE_TOOLS.has('media_revoke'))
  assert.ok(!EMDASH_DESTRUCTIVE_TOOLS.has('cdn_purge'))
})

test('Tracy\'s five skill descriptions lead with "Use when…", in English, within 200 chars; the EmDash texts point, not teach', () => {
  // D29 (V3): 30 of 33 r2 EmDash cases loaded the 3,894-char emdash-site skill at step 1, because its
  // description matched every EmDash turn; the other Tracy skills were loaded 0 times in 70 cases.
  const skills = [
    'emdash-site',
    'tracy-design-inspiration',
    'joomla-upgrade-run',
    'tracy-file-links',
    't4-framework-knowledge'
  ]
  for (const name of skills) {
    const text = readFileSync(
      new URL(`../../../design/tracy-design-skill/skills/${name}/SKILL.md`, import.meta.url),
      'utf8'
    )
    const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
    const block = /^description: >-\n((?: {2}.*(?:\n|$))+)/m.exec(front)?.[1] ?? ''
    const description = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ')
    assert.ok(description.length > 0 && description.length <= 200, `${name}: ${description.length}`)
    assert.match(description, /^Use (when|whenever) /, name)
    assert.doesNotMatch(description, /[À-ɏḀ-ỿ]/, `${name}: English`)
    assert.doesNotMatch(description, /Loaded automatically/, name)
  }
  const emdashSkill = readFileSync(
    new URL('../../../design/tracy-design-skill/skills/emdash-site/SKILL.md', import.meta.url),
    'utf8'
  )
  assert.doesNotMatch(
    emdashSkill,
    /^triggers:/m,
    'read by nothing, and its "đổi chữ" matched every word edit'
  )
  assert.doesNotMatch(emdashSkill, /list: true\}` — every tool/)
  assert.match(emdashSkill, /never in `\/app`/)
  assert.match(emdashSkill, /only before a STRUCTURE change/)
  assert.doesNotMatch(emdashSkill, /A write is a draft until published/)
  const persona = JSON.parse(
    readFileSync(new URL('../../../../config/mode-matrix.json', import.meta.url), 'utf8')
  ).overlays.emdash.persona
  assert.match(persona, /load the `emdash-site` skill first/)
  // Local round 26, 25/10/2026: "not writable here" kept a build off the term and form doors it has.
  assert.match(persona, /taxonomy_update_term \{taxonomy, termSlug, label\}/)
  assert.match(persona, /form_words after form_list/)
  assert.doesNotMatch(persona, /not writable here/)
  assert.doesNotMatch(
    persona,
    /skill says how|list: true\} first|never through tracy_site|taxonomy labels and settings are changed/
  )
})

test("tracy_emdash's parameters are exactly the keys the door reads as its own, site-agnostic", () => {
  const keys = Object.keys(EMDASH_PARAMETERS.properties).sort()
  // `comment` (H6) is read by the wrapper around `execute`, which takes it off before this repair.
  assert.deepEqual(keys, [
    'allLocales',
    'arguments',
    'comment',
    'confirm',
    'list',
    'raw',
    'siteKey',
    'tool',
    'tools'
  ])
  // Any other key beside `tool` is read as one of the tool's own arguments (F4 ED-3).
  const loose = normalizeEmdashShape({
    tool: 'content_get',
    collection: 'home',
    id: 'home',
    raw: true,
    confirm: true
  })
  assert.deepEqual(loose.args, { collection: 'home', id: 'home' })
  const text = JSON.stringify(EMDASH_PARAMETERS)
  assert.doesNotMatch(text, /list: ?true\}? first|ed-[a-z0-9]{6}|tracy\.(test|ai|site)|-web-1/)
  for (const p of Object.values(EMDASH_PARAMETERS.properties))
    assert.ok(p.description.length <= 120, p.description)
})

test('🔒 G3: schema_get_collection takes slug; a collection or name sent in its place becomes slug', () => {
  for (const key of ['collection', 'name']) {
    const shape = normalizeEmdashShape({ tool: 'schema_get_collection', arguments: { [key]: 'site' } })
    assert.equal(shape.ok, true)
    assert.deepEqual(shape.args, { slug: 'site' })
    assert.ok(shape.notes.includes(`${key} is slug`))
  }
  const kept = normalizeEmdashShape({ tool: 'schema_get_collection', arguments: { slug: 'home', name: 'x' } })
  assert.equal(kept.args.slug, 'home')
})

test('emdashWriteTarget: the collection and id a write named, through the same shape repair; nothing else (QA-A10-em)', () => {
  assert.deepEqual(
    emdashWriteTarget({
      tool: 'content_update',
      arguments: { collection: 'posts', id: '01M3Z', data: { title: 'x' } }
    }),
    { kind: 'posts', id: '01M3Z' }
  )
  assert.deepEqual(
    emdashWriteTarget({ tool: 'content.update', arguments: { collection: 'pages', id: 'about' } }),
    { kind: 'pages', id: 'about' }
  )
  for (const args of [
    { tool: 'menu_set_items', arguments: { menu: 'main', items: [] } },
    { tool: 'content_update', arguments: { collection: 'posts' } },
    { tool: 'content_update', arguments: { collection: 'a b', id: 'x' } },
    { tool: 'content_update', arguments: { collection: 'posts', id: 'x'.repeat(129) } },
    { list: true },
    { tool: 'page.text', arguments: { path: '/' } },
    'not json'
  ])
    assert.equal(emdashWriteTarget(args), null, JSON.stringify(args))
})

test('emdashWriteTarget: a created entry is named by the id its receipt carries; a slug call by the real id (ACC-30.C4)', () => {
  const created = {
    ok: true,
    result: { entry: { collection: 'posts', id: '01M3ZNEW', slug: 'qaacc-e-bai-mot' } }
  }
  // content_create carries no id: EmDash mints it, and only the receipt says which.
  assert.deepEqual(
    emdashWriteTarget(
      { tool: 'content_create', arguments: { collection: 'posts', data: { title: 'QAACC-E bài một' } } },
      created
    ),
    { kind: 'posts', id: '01M3ZNEW' }
  )
  assert.equal(
    emdashWriteTarget({ tool: 'content_create', arguments: { collection: 'posts', data: {} } }),
    null
  )
  // An update asked by slug is named by the entry the receipt names.
  assert.deepEqual(
    emdashWriteTarget(
      { tool: 'content_update', arguments: { collection: 'pages', id: 'about' } },
      {
        ok: true,
        result: { entry: { id: '01ABOUT' } }
      }
    ),
    { kind: 'pages', id: '01ABOUT' }
  )
  // A receipt with no usable id leaves the call's own.
  assert.deepEqual(
    emdashWriteTarget(
      { tool: 'content_update', arguments: { collection: 'pages', id: 'about' } },
      {
        ok: true,
        result: { entry: { id: null } }
      }
    ),
    { kind: 'pages', id: 'about' }
  )
})

test('emdashWriteTarget: a media write is named {kind:"media", id} — the uploaded item the receipt names, the deleted id the call names (C1 media)', () => {
  // EmDash's audit-log logs an upload as `media:upload` with the item id and no user; Tracy's report
  // names the same id, so tracy-web can tell the row is Tracy's.
  assert.deepEqual(
    emdashWriteTarget(
      { tool: 'media_upload', arguments: { filename: 'a.png', contentType: 'image/png', base64: 'AA==' } },
      { ok: true, result: { item: { id: '01MEDIAUPLOADED', url: '/_emdash/api/media/file/x.png' } } }
    ),
    { kind: 'media', id: '01MEDIAUPLOADED' }
  )
  assert.deepEqual(
    emdashWriteTarget({ tool: 'media_delete', arguments: { id: '01MEDIAGONE' } }, { ok: true, result: {} }),
    { kind: 'media', id: '01MEDIAGONE' }
  )
  assert.deepEqual(
    emdashWriteTarget({ tool: 'media_update', arguments: { id: '01MEDIAALT', alt: 'x' } }, { ok: true }),
    { kind: 'media', id: '01MEDIAALT' }
  )
  for (const [args, answer] of [
    [
      { tool: 'media_upload', arguments: { filename: 'a.png' } },
      { ok: true, result: {} }
    ],
    [
      { tool: 'media_upload', arguments: { filename: 'a.png' } },
      { ok: true, result: { item: { id: 'a b' } } }
    ],
    [{ tool: 'media_delete', arguments: {} }, { ok: true }],
    [{ tool: 'media_delete', arguments: { id: 'x'.repeat(129) } }, { ok: true }]
  ])
    assert.equal(emdashWriteTarget(args, answer), null, JSON.stringify(args))
})

test('emdashWriteTool: a tracy_emdash write that answered ok names its tool; reads, lists, routes and refusals are null', () => {
  const ok = { ok: true }
  assert.equal(emdashWriteTool({ tool: 'content_update', arguments: { id: 'e1' } }, ok), 'content_update')
  // Through the same shape repair the call runs with (ED-4: `content.update` → content_update).
  assert.equal(emdashWriteTool({ tool: 'content.update', arguments: { id: 'e1' } }, ok), 'content_update')
  assert.equal(emdashWriteTool({ tool: 'menu_set_items', arguments: {} }, ok), 'menu_set_items')
  assert.equal(emdashWriteTool({ tool: 'redirect_create', arguments: {} }, ok), 'redirect_create')
  for (const args of [
    { tool: 'content_get', arguments: { id: 'e1' } },
    { tool: 'redirect_list', arguments: {} },
    { list: true },
    { tool: 'page.text', arguments: { path: '/' } },
    { tool: 'apply.list' }
  ])
    assert.equal(emdashWriteTool(args, ok), null, JSON.stringify(args))
  for (const answer of [{ ok: false, code: 'CONFIRM_FIRST' }, { ok: false }, null, 'ok', {}])
    assert.equal(
      emdashWriteTool({ tool: 'content_update', arguments: {} }, answer),
      null,
      JSON.stringify(answer)
    )
})

test('emdashReplaceWrote: only a replace answer that lists changed places wrote', () => {
  assert.equal(emdashReplaceWrote({ ok: true, changed: [{ at: 'a' }], undo: {} }), true)
  assert.equal(
    emdashReplaceWrote({ ok: false, code: 'PARTIAL', changed: [{ at: 'a' }] }),
    true,
    'a partial write wrote'
  )
  assert.equal(emdashReplaceWrote({ ok: true, dryRun: true, would: [{ at: 'a' }] }), false)
  assert.equal(emdashReplaceWrote({ ok: true, changed: [] }), false)
  assert.equal(emdashReplaceWrote({ ok: false, code: 'NOT_FOUND' }), false)
  assert.equal(emdashReplaceWrote(null), false)
})

// 🔒 09/10/2026 (bench hb: 17 EmDash delete and add runs fetched `{list:true, tools:["content_delete"…]}` before
// the delete): the description names the delete's shape where it says to call it first, and leaves the
// "do not read back" rule to the site context, which says it on every platform.
test('the tracy_emdash description names content_delete {collection, id} beside "call first", and says the read-back rule nowhere', () => {
  assert.match(
    EMDASH_DESCRIPTION,
    /CONFIRM_FIRST \(content_delete \{collection, id\}: ONE call, all languages unless locale names one; call first\) → ask_user_question/
  )
  assert.doesNotMatch(EMDASH_DESCRIPTION, /do not read back/)
  assert.ok(EMDASH_DESCRIPTION.length <= 1500, `${EMDASH_DESCRIPTION.length} chars`)
})
