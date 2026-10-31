#!/usr/bin/env node
/** Owned Joomla/EmDash HTTP inventory through the real shipped Tracy/dsh loop. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { runPageSearchHarness } from '../../packages/tools/tracy-site-tools/test/fixtures/page-search-harness.mjs'
import { walkListing, pagesDocument } from '../../apps/tracy-web/src/sites/content-pages.js'

const args = process.argv.slice(2)
const arg = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback)
const platform = arg('--platform', '')
assert(['joomla', 'emdash'].includes(platform))
const config = JSON.parse(readFileSync(arg('--config', ''), 'utf8'))
assert.equal(config.name, `toolbench-crosscms-${platform}`)
assert.match(config.origin, /^http:\/\/127\.0\.0\.1:\d+$/)
const repeats = Number(arg('--repeats', '12'))
assert(Number.isInteger(repeats) && repeats > 0 && repeats <= 100)
const out = resolve(arg('--out', `/tmp/tracy-crosscms-${platform}-bench`))
mkdirSync(out, { recursive: true })
const http = globalThis.fetch
let backendReads = 0
let sourceCalls = 0
const component = async (params) => {
  backendReads++
  const url =
    platform === 'joomla'
      ? config.origin + '/index.php?option=com_claudecowork&task=api.exec&format=json'
      : config.origin + '/content.json?' + new URLSearchParams(params)
  const response = await http(url, {
    ...(platform === 'joomla'
      ? {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: config.token, action: 'content.read', params })
        }
      : { headers: { authorization: 'Bearer ' + config.token } }),
    signal: AbortSignal.timeout(120000)
  })
  const answer = await response.json()
  assert(response.ok, `${platform} reader ${response.status}: ${JSON.stringify(answer.error)}`)
  sourceCalls += Number(response.headers.get('x-tracy-source-calls') ?? 0)
  return answer
}
const lookup = async (params) => {
  const { url, view: _view, ...filter } = params
  const walk = await walkListing(component, filter)
  assert.equal(walk.refusal, null)
  assert.equal(walk.truncated, false, 'Benchmark requires a complete inventory')
  return pagesDocument(walk.listings, { truncated: false, link: url ?? null, alternates: true })
}
const filter = platform === 'emdash' ? { locale: 'en' } : {}
const inventory = await lookup({ view: 'pages', ...filter })
// Four distinct exact titles that remain unique after the host's substring matching.
const targets = []
for (const page of [...inventory.pages].reverse()) {
  if (!page.title || page.title.length > 80) continue
  if (inventory.pages.filter((p) => p.title?.toLowerCase().includes(page.title.toLowerCase())).length !== 1)
    continue
  if (!targets.some((p) => p.id === page.id)) targets.push(page)
  if (targets.length === 4) break
}
assert.equal(targets.length, 4)
const query = (search) => ({ action: 'content.read', params: { view: 'pages', ...filter, search } })
const snapshot = () => {
  if (platform === 'emdash') {
    const code = `const D=require('better-sqlite3');const d=new D('data/data.db',{readonly:true});const t=d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%token%' AND name NOT LIKE '%session%' AND name NOT LIKE '%cache%'").all();console.log(JSON.stringify(Object.fromEntries(t.map(({name})=>[name,require('node:crypto').createHash('sha256').update(JSON.stringify(d.prepare('SELECT * FROM "'+name.replaceAll('"','""')+'"').all().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex')]))));d.close()`
    const tables = JSON.parse(
      execFileSync('docker', ['exec', config.name, 'node', '-e', code], { encoding: 'utf8' })
    )
    const contentTables = Object.fromEntries(
      Object.entries(tables).filter(([name]) =>
        /^(ec_|_tracy_|revisions$|media$|taxonomies$|content_taxonomies$|_emdash_menus$|_emdash_menu_items$)/.test(
          name
        )
      )
    )
    return { hash: createHash('sha256').update(JSON.stringify(contentTables)).digest('hex'), tables }
  }
  const sql =
    'SELECT id,title,alias,introtext,`fulltext`,state,language FROM jos_content ORDER BY id; SELECT id,title,link,published,language FROM jos_menu ORDER BY id;'
  return createHash('sha256')
    .update(
      execFileSync(
        'docker',
        [
          'exec',
          '-i',
          config.db,
          'sh',
          '-c',
          'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" --batch --skip-column-names joomla'
        ],
        { input: sql, stdio: ['pipe', 'pipe', 'pipe'] }
      )
    )
    .digest('hex')
}
const before = snapshot()
const beforeHash = typeof before === 'string' ? before : before.hash
const metadata = {
  platform,
  repeats,
  origin: config.origin,
  producer:
    'real shipped Tracy bundle + real vendored AgentLoop/ToolRuntime/ToolRegistry, scripted model, real CMS HTTP reader; injected relay transport',
  strategyComparison:
    'four existing independent string queries versus one bounded OR query on the same candidate bundle',
  inventoryPages: inventory.pages.length,
  filter,
  targets: targets.map(({ id, title, path }) => ({ id, title, path })),
  bundleSha256: createHash('sha256')
    .update(readFileSync('packages/tools/tracy-site-tools/lib/index.js'))
    .digest('hex'),
  image: execFileSync('docker', ['inspect', config.name, '--format', '{{.Image}}'], {
    encoding: 'utf8'
  }).trim(),
  contentBeforeHash: beforeHash,
  ...(typeof before === 'object' ? { tableHashesBefore: before.tables } : {}),
  injectedDelayMs: 0,
  modelBilling: null
}
const rows = []
for (let repeat = 0; repeat < repeats; repeat++) {
  for (const arm of repeat % 2 ? ['batch', 'independent'] : ['independent', 'batch']) {
    backendReads = 0
    sourceCalls = 0
    const start = performance.now()
    const result = await runPageSearchHarness(
      arm === 'batch' ? [query(targets.map((p) => p.title))] : targets.map((p) => query(p.title)),
      { platform, lookup }
    )
    const elapsedMs = performance.now() - start
    const modelMessages = JSON.stringify(result.requests.map((r) => r.messages))
    const verified = targets.every((p) => modelMessages.includes(p.id) && modelMessages.includes(p.path))
    assert(verified, 'All opaque IDs and paths must reach the actual model request')
    rows.push({
      repeat,
      arm,
      verified,
      elapsedMs,
      backendReads,
      nativeSourceCalls: platform === 'emdash' ? sourceCalls : null,
      toolCalls: result.sent.filter((s) => s.body.action === 'content.read').length,
      modelRequests: result.requests.length,
      resultEvents: result.events.filter((e) => e.type === 'tool/result').length
    })
    writeFileSync(join(out, 'raw.json'), JSON.stringify({ metadata, rows }, null, 2) + '\n')
    console.log(JSON.stringify(rows.at(-1)))
  }
}
const after = snapshot()
metadata.contentAfterHash = typeof after === 'string' ? after : after.hash
if (typeof after === 'object') {
  metadata.tableHashesAfter = after.tables
  metadata.changedTables = Object.keys(after.tables).filter(
    (name) => after.tables[name] !== before.tables[name]
  )
}
writeFileSync(join(out, 'raw.json'), JSON.stringify({ metadata, rows }, null, 2) + '\n')
assert.equal(metadata.contentAfterHash, beforeHash, 'Read strategies must leave CMS records unchanged')
writeFileSync(join(out, 'raw.json'), JSON.stringify({ metadata, rows }, null, 2) + '\n')
