#!/usr/bin/env node
/** Four-arm page discovery experiment through the shipped plugin and real dsh loop on owned CMSs. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runPageSearchHarness } from '../../packages/tools/tracy-site-tools/test/fixtures/page-search-harness.mjs'
import {
  walkListing,
  pagesDocument,
  fitPages,
  narrowerPagesCall
} from '../../apps/tracy-web/src/sites/content-pages.js'

const args = process.argv.slice(2)
const arg = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback)
const c = JSON.parse(readFileSync(arg('--config', ''), 'utf8'))
const platform = arg('--platform', '')
assert(['wordpress', 'joomla', 'emdash'].includes(platform))
assert.match(c.origin, /^http:\/\/127\.0\.0\.1:\d+$/)
assert(
  platform === 'wordpress' ? /^toolbench-\d+-wp$/.test(c.wp) : c.name === `toolbench-crosscms-${platform}`
)
const repeats = Number(arg('--repeats', '3'))
assert(Number.isInteger(repeats) && repeats > 0 && repeats <= 30)
const native = args.includes('--native')
const onlyArm = arg('--arm', null)
assert(onlyArm === null || ['A', 'B', 'C', 'D'].includes(onlyArm))
const out = resolve(arg('--out', `/tmp/tracy-agent-usage-${platform}`))
mkdirSync(out, { recursive: true })
const baseline = resolve(arg('--baseline', '/tmp/tracy-tool-usage-baseline/index.mjs'))
const beforePlugin = (await import(pathToFileURL(baseline))).apply
const oldGuide = JSON.parse(
  readFileSync(arg('--baseline-catalogue', '/tmp/tracy-tool-usage-baseline/agent-tools.json'))
).tools[0].surfaces[platform].description
const { siteToolDescription } = await import('../../packages/tools/tracy-site-tools/src/host/surface.mjs')
const newGuide = siteToolDescription(platform)
const hash = (data) => createHash('sha256').update(data).digest('hex')
const http = globalThis.fetch
const docker = (a, input) =>
  execFileSync('docker', a, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024
  }).trim()
let reads = [],
  relays = []
async function component(action, params) {
  const startMs = performance.now()
  const isJoomla = platform === 'joomla'
  const url =
    platform === 'wordpress'
      ? c.origin + '/wp-admin/admin-ajax.php?action=claude_cowork'
      : isJoomla
        ? c.origin + '/index.php?option=com_claudecowork&task=api.exec&format=json'
        : c.origin + '/content.json?' + new URLSearchParams(params)
  const response = await http(url, {
    ...(platform !== 'emdash'
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: c.token, action, params })
        }
      : { headers: { authorization: 'Bearer ' + c.token } }),
    signal: AbortSignal.timeout(120000)
  })
  const answer = await response.json()
  reads.push({
    action,
    params,
    startMs,
    ms: performance.now() - startMs,
    status: response.status,
    sourceCalls: Number(response.headers.get('x-tracy-source-calls') ?? 0)
  })
  return answer
}
async function lookup(params, action = 'content.read') {
  const at = performance.now()
  if (
    !['content.read', 'content.list', 'content.get', 'info'].includes(action) ||
    (platform === 'emdash' && action !== 'content.read')
  )
    return {
      ok: false,
      code: 'BENCHMARK_READ_ONLY',
      error: 'This read benchmark does not execute writes or other tools.'
    }
  let answer
  if (action === 'content.read' && params.view === 'pages') {
    const { view: _view, url, ...filter } = params
    const walk = await walkListing((p) => component('content.read', p), filter)
    const pages = pagesDocument(walk.listings, {
      truncated: walk.truncated,
      link: url ?? null,
      alternates: !filter.locale
    })
    answer = walk.refusal ?? fitPages(pages, { next: narrowerPagesCall(filter, pages.site) })
  } else answer = await component(action, params)
  relays.push({ action, params, startMs: at, ms: performance.now() - at })
  return answer
}
function snapshot() {
  if (platform === 'emdash') {
    const code = `const D=require('better-sqlite3'),d=new D('data/data.db',{readonly:true});const names=d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name).filter(n=>/^(ec_|_tracy_|revisions$|media$|taxonomies$|content_taxonomies$|_emdash_menus$|_emdash_menu_items$)/.test(n)).sort();console.log(JSON.stringify(Object.fromEntries(names.map(n=>[n,require('node:crypto').createHash('sha256').update(JSON.stringify(d.prepare('SELECT * FROM "'+n+'"').all().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex')]))));d.close()`
    return JSON.parse(docker(['exec', c.name, 'node', '-e', code]))
  }
  const sql =
    platform === 'wordpress'
      ? 'SELECT ID,post_type,post_title,post_name,post_content,post_status FROM wp_posts ORDER BY ID;'
      : 'SELECT id,title,alias,introtext,`fulltext`,state,language FROM jos_content ORDER BY id; SELECT id,title,link,published,language FROM jos_menu ORDER BY id;'
  return {
    content: hash(
      docker(
        [
          'exec',
          '-i',
          c.db,
          'sh',
          '-c',
          `exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" --batch --skip-column-names ${platform === 'wordpress' ? 'wordpress' : 'joomla'}`
        ],
        sql
      )
    )
  }
}
const filter = platform === 'emdash' ? { locale: 'en' } : {}
const inventory = await lookup({ view: 'pages', ...filter })
assert.equal(inventory.schemaVersion, 'tracy-content-pages/v1', JSON.stringify(inventory))
assert.equal(inventory.truncated, false)
const targets = []
for (const page of [...inventory.pages].reverse()) {
  if (!page.title || page.title.length > 80 || !page.path) continue
  if (inventory.pages.filter((p) => p.title?.toLowerCase().includes(page.title.toLowerCase())).length !== 1)
    continue
  if (!targets.some((p) => p.id === page.id)) targets.push(page)
  if (targets.length === 4) break
}
assert.equal(targets.length, 4)
const before = snapshot()
const modelKey = native
  ? null
  : docker(['exec', 'tracy-dsh', 'node', '-e', 'process.stdout.write(process.env.DEEPSEEK_API_KEY ?? "")'])
assert(native || modelKey, 'Configured model credential unavailable')
const query = (search) => ({ action: 'content.read', params: { view: 'pages', ...filter, search } })
const tasks = native
  ? [
      { id: 'four-independent', targets, calls: targets.map((p) => query(p.title)) },
      { id: 'four-batch', targets, calls: [query(targets.map((p) => p.title))] }
    ]
  : [
      {
        id: 'four-titles',
        targets,
        text: `Find these pages: ${targets.map((p) => JSON.stringify(p.title)).join(', ')}. Return each content ID and path. Do not edit anything.`
      },
      {
        id: 'single-title',
        targets: [targets[0]],
        text: `Find the page titled ${JSON.stringify(targets[0].title)}. Return its content ID and path. Do not edit anything.`
      },
      {
        id: 'known-url',
        targets: [targets[0]],
        text: `Find the page at ${targets[0].path}. Return its content ID and path. Do not edit anything.`
      }
    ]
const metadata = {
  platform,
  repeats,
  native,
  onlyArm,
  model: native ? 'scripted' : 'deepseek-flash',
  thinking: 'disabled',
  temperature: 0,
  producer:
    'real shipped plugin + vendored AgentLoop/ToolRuntime; injected relay with real CMS HTTP; provider adapter uses nonstreaming Chat Completions',
  scope: 'read discovery; no authenticated production relay, writes or Undo acceptance claimed',
  inventoryPages: inventory.pages.length,
  targets: targets.map(({ id, title, path }) => ({ id, title, path })),
  origin: c.origin,
  image: docker(['inspect', c.wp ?? c.name, '--format', '{{.Image}}']),
  harnessFixtureHash: hash(
    readFileSync('packages/tools/tracy-site-tools/test/fixtures/page-search-harness.mjs')
  ),
  baselineBundle: hash(readFileSync(baseline)),
  candidateBundle: hash(readFileSync('packages/tools/tracy-site-tools/lib/index.js')),
  guideHashes: { baseline: hash(oldGuide), candidate: hash(newGuide) },
  contentBefore: before,
  startedAt: new Date().toISOString()
}
const rows = []
const persist = () => writeFileSync(join(out, 'raw.json'), JSON.stringify({ metadata, rows }, null, 2) + '\n')
for (let repeat = 0; repeat < repeats; repeat++)
  for (const task of tasks) {
    // Latin rotation plus reversal balances which arm warms CMS/provider caches first.
    const order = ['A', 'B', 'C', 'D'].slice(repeat % 4).concat(['A', 'B', 'C', 'D'].slice(0, repeat % 4))
    if (repeat % 2) order.reverse()
    for (const arm of (native ? order.filter((a) => a === 'A' || a === 'D') : order).filter(
      (a) => onlyArm === null || a === onlyArm
    )) {
      reads = []
      relays = []
      const provider = [],
        calls = []
      let failure = null,
        final = ''
      const guide = arm === 'A' || arm === 'B' ? oldGuide : newGuide
      const startedAt = new Date().toISOString(),
        started = performance.now()
      const respond = native
        ? null
        : async (options, step) => {
            if (failure || step > 8) {
              failure ??= 'MODEL_STEP_LIMIT'
              return { text: failure, calls: [] }
            }
            const messages = options.messages.map((message) => {
              const text = (message.content ?? [])
                .filter((block) => block.type === 'text')
                .map((block) => block.text)
                .join('\n')
              const tools = (message.content ?? [])
                .filter((block) => block.type === 'tool-call')
                .map((block) => ({
                  id: block.id,
                  type: 'function',
                  function: { name: block.name, arguments: block.arguments }
                }))
              return {
                role: message.role,
                content: text || (tools.length ? null : ''),
                ...(tools.length ? { tool_calls: tools } : {}),
                ...(message.role === 'tool' ? { tool_call_id: message.toolCallId } : {})
              }
            })
            const tools = options.tools?.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.name === 'tracy_site' ? guide : tool.description,
                parameters: tool.parameters
              }
            }))
            const at = performance.now()
            let recorded = false
            try {
              const response = await http('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + modelKey, 'content-type': 'application/json' },
                body: JSON.stringify({
                  model: 'deepseek-flash',
                  messages,
                  ...(tools?.length ? { tools } : {}),
                  thinking: { type: 'disabled' },
                  temperature: 0,
                  max_tokens: 1400,
                  stream: false
                }),
                signal: AbortSignal.timeout(90000)
              })
              const data = await response.json()
              provider.push({
                ms: performance.now() - at,
                status: response.status,
                model: data.model ?? null,
                usage: data.usage ?? null,
                effectiveToolsHash: hash(JSON.stringify(tools)),
                promptHash: hash(JSON.stringify(messages)),
                requestId: data.id ?? null
              })
              recorded = true
              assert(response.ok, `Provider HTTP ${response.status}`)
              const message = data.choices?.[0]?.message
              assert(message, 'Missing provider message')
              const planned = (message.tool_calls ?? []).map((call) => ({
                name: call.function.name,
                arguments: JSON.parse(call.function.arguments)
              }))
              calls.push(...planned)
              if (!planned.length) final = message.content ?? ''
              return { text: message.content ?? '', calls: planned }
            } catch (error) {
              failure = String(error.message).slice(0, 180)
              if (!recorded) provider.push({ ms: performance.now() - at, failure, usage: null })
              return { text: failure, calls: [] }
            }
          }
      let run
      try {
        run = await runPageSearchHarness(task.calls ?? [], {
          platform,
          lookup,
          ...(arm === 'A' || arm === 'C' ? { plugin: beforePlugin } : {}),
          respond,
          userText:
            (platform === 'emdash' ? 'In the English edition: ' : '') +
            (task.text ?? 'Find the four requested pages.')
        })
      } catch (error) {
        failure = String(error.message).slice(0, 180)
      }
      const modelResults = JSON.stringify(
        run?.requests.flatMap((r) => r.messages.filter((m) => m.role === 'tool')) ?? []
      )
      const evidenceValid = task.targets.every(
        (p) => modelResults.includes(p.id) && modelResults.includes(p.path)
      )
      const finalValid = native || task.targets.every((p) => final.includes(p.id) && final.includes(p.path))
      const row = {
        repeat,
        task: task.id,
        arm,
        startedAt,
        elapsedMs: performance.now() - started,
        verified: !failure && evidenceValid && finalValid,
        evidenceValid,
        finalValid,
        failure,
        final: native ? null : final,
        toolResultChars: [
          ...new Map(
            (run?.requests.flatMap((r) => r.messages.filter((m) => m.role === 'tool')) ?? []).map((m) => [
              m.toolCallId,
              JSON.stringify(m.content).length
            ])
          ).values()
        ].reduce((n, count) => n + count, 0),
        modelRequests: run?.requests.length ?? 0,
        provider,
        calls,
        relayRequests: run?.sent.length ?? 0,
        relays,
        backendReads: reads.length,
        reads,
        nativeSourceCalls: reads.reduce((n, r) => n + r.sourceCalls, 0)
      }
      rows.push(row)
      persist()
      console.log(
        JSON.stringify({
          platform,
          repeat,
          task: task.id,
          arm,
          verified: row.verified,
          ms: row.elapsedMs,
          reads: row.backendReads,
          relayRequests: row.relayRequests,
          calls: calls.length,
          failure
        })
      )
    }
  }
metadata.contentAfter = snapshot()
metadata.finishedAt = new Date().toISOString()
persist()
assert.deepEqual(metadata.contentAfter, before, 'Read benchmark changed stored content')
