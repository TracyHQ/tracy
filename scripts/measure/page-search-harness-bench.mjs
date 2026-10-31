#!/usr/bin/env node
/** Real shipped Tracy/dsh loop and real owned WordPress I/O; scripted model isolates orchestration. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { runPageSearchHarness } from '../../packages/tools/tracy-site-tools/test/fixtures/page-search-harness.mjs'
import { walkListing, pagesDocument } from '../../apps/tracy-web/src/sites/content-pages.js'
const args = process.argv.slice(2),
  arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const c = JSON.parse(readFileSync(arg('--config', '/tmp/tracy-harness-batch-owned.json'), 'utf8'))
assert(/^toolbench-\d+-wp$/.test(c.wp))
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(c.origin))
const repeats = Number(arg('--repeats', '12'))
assert(Number.isInteger(repeats) && repeats > 0 && repeats <= 100)
const out = resolve(arg('--out', '/tmp/tracy-page-search-harness-bench'))
mkdirSync(out, { recursive: true })
const fetchComponent = globalThis.fetch
let reads = 0
const component = async (params) => {
  reads++
  const r = await fetchComponent(c.origin + '/wp-admin/admin-ajax.php?action=claude_cowork', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: c.token, action: 'content.read', params }),
    signal: AbortSignal.timeout(30000)
  })
  return r.json()
}
const lookup = async (params) => {
  const { url, ...filter } = params
  delete filter.view
  const walked = await walkListing(component, filter)
  assert.equal(walked.refusal, null)
  return pagesDocument(walked.listings, { truncated: walked.truncated, link: url ?? null, alternates: true })
}
const inventory = await lookup({ view: 'pages' })
const targets = [3, 2, 1, 0].map((delta) =>
  inventory.pages.find((p) => p.native?.some((n) => n.kind === 'post' && n.id === c.targetId - delta))
)
assert(targets.every(Boolean))
const terms = targets.map((p) => p.title)
const query = (search) => ({ action: 'content.read', params: { view: 'pages', search } })
const rows = []
const metadata = {
  producer:
    'real vendored AgentLoop + ToolRuntime + shipped Tracy plugin; scripted model; real HTTP WordPress listing I/O',
  strategyComparison:
    'same candidate bundle: four existing string searches versus one bounded OR search; not two complete deployed revisions',
  repeats,
  targets: targets.map((p) => ({ id: p.id, path: p.path, title: p.title })),
  bundleSha256: createHash('sha256')
    .update(readFileSync('packages/tools/tracy-site-tools/lib/index.js'))
    .digest('hex'),
  siteToolsVersion: JSON.parse(readFileSync('packages/tools/tracy-site-tools/package.json')).version,
  wordPress: c.wordpress,
  component: c.component,
  origin: c.origin,
  injectedDelayMs: 0
}
for (let repeat = 0; repeat < repeats; repeat++)
  for (const arm of repeat % 2 ? ['batch', 'independent'] : ['independent', 'batch']) {
    reads = 0
    const start = performance.now()
    const r = await runPageSearchHarness(arm === 'batch' ? [query(terms)] : terms.map(query), { lookup })
    const elapsedMs = performance.now() - start
    const contentRequests = r.sent.filter((s) => s.body.action === 'content.read')
    const messages = JSON.stringify(r.requests.map((r) => r.messages))
    const verified = targets.every((p) => messages.includes(p.id) && messages.includes(p.path))
    const results = r.events.filter((e) => e.type === 'tool/result')
    const row = {
      repeat,
      arm,
      verified,
      backendReads: reads,
      toolCalls: contentRequests.length,
      modelRequests: r.requests.length,
      resultEvents: results.length,
      elapsedMs,
      startedAt: new Date().toISOString(),
      requestedTerms: terms.length
    }
    assert(verified, 'Missing expected opaque page IDs')
    rows.push(row)
    writeFileSync(join(out, 'raw.json'), JSON.stringify({ metadata, rows }, null, 2) + '\n')
    console.log(JSON.stringify(row))
  }
