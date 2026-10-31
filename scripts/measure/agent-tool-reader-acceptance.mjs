#!/usr/bin/env node
/** Actual authenticated Apply relay + vendored AgentLoop + disposable CMS inventories. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { authenticatedToolRelay } from './lib/authenticated-tool-relay.mjs'
import { runPageSearchHarness } from '../../packages/tools/tracy-site-tools/test/fixtures/page-search-harness.mjs'
const args = process.argv.slice(2),
  arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const platform = arg('--platform', ''),
  phase = arg('--phase', 'after'),
  fixture = JSON.parse(readFileSync(arg('--config', '')))
assert(['wordpress', 'joomla', 'emdash'].includes(platform))
assert(['before', 'after'].includes(phase))
assert.match(fixture.origin, /^http:\/\/127\.0\.0\.1:\d+$/)
assert(
  platform === 'wordpress'
    ? /^toolbench-\d+-wp$/.test(fixture.wp)
    : fixture.name === `toolbench-crosscms-${platform}`
)
const out = resolve(arg('--out', '/tmp/tracy-agent-reader-acceptance')),
  repeats = Number(arg('--repeats', '5'))
assert(Number.isInteger(repeats) && repeats > 0 && repeats <= 30)
mkdirSync(out, { recursive: true })
const relay = await authenticatedToolRelay({ platform, fixture, optimized: phase === 'after' }),
  rows = []
const filter = platform === 'emdash' ? { locale: 'en' } : {}
const persist = () =>
  writeFileSync(
    join(out, `${platform}-${phase}.json`),
    JSON.stringify(
      {
        platform,
        phase,
        producer:
          'authenticated buildApp + isolated migrated PostgreSQL + shipped site-tools + real vendored AgentLoop + actual CMS HTTP',
        fixtureOrigin: fixture.origin,
        bundleSha256: createHash('sha256')
          .update(readFileSync('packages/tools/tracy-site-tools/lib/index.js'))
          .digest('hex'),
        rows
      },
      null,
      2
    ) + '\n'
  )
try {
  const all = await relay.send('content.read', { view: 'pages', ...filter })
  assert.equal(all.status, 200, JSON.stringify(all.body))
  assert.equal(all.body.truncated, false)
  const targets = all.body.pages.filter((p) => p.title && p.path).slice(-4)
  assert.equal(targets.length, 4)
  const call = (params) => ({ action: 'content.read', params: { view: 'pages', ...filter, ...params } })
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const task of [
      { id: 'independent-titles', calls: targets.map((p) => call({ search: p.title })), targets },
      { id: 'batched-titles', calls: [call({ search: targets.map((p) => p.title) })], targets },
      { id: 'known-url', calls: [call({ url: targets[0].url })], targets: [targets[0]] },
      { id: 'empty-search', calls: [call({ search: 'NoSuchPage_91ec3c42' })], targets: [] },
      {
        id: 'explicit-details',
        calls: [{ action: 'content.read', params: { id: targets[0].id } }],
        targets: [targets[0]]
      }
    ]) {
      relay.reads.length = 0
      const start = performance.now()
      const run = await runPageSearchHarness(task.calls, {
        platform,
        transport: relay.transport,
        actorMint: relay.actorMint,
        userText: 'Find these pages using their exact IDs; do not change anything.'
      })
      const results = JSON.stringify(run.requests.flatMap((r) => r.messages.filter((m) => m.role === 'tool')))
      const verified =
        task.targets.every((p) => results.includes(p.id)) &&
        !/CONTENT_ADAPTER_UNSUPPORTED|CONTENT_UNAUTHENTICATED|SEAT_REVOKED|NOT_SIGNED_IN|NOT_SITE_MEMBER|INVALID_ASSERTION/.test(
          results
        )
      rows.push({
        repeat,
        task: task.id,
        ms: performance.now() - start,
        verified,
        backendReads: relay.reads.length,
        nativeSourceCalls: relay.reads.reduce((s, r) => s + r.sourceCalls, 0),
        relayRequests: run.sent.length,
        reads: relay.reads.slice(),
        resultChars: results.length
      })
      persist()
      console.log(
        JSON.stringify({ platform, phase, repeat, task: task.id, ...rows.at(-1), reads: undefined })
      )
    }
  }
  const before = relay.reads.length,
    denied = await relay.send(
      'content.read',
      { view: 'pages', ...filter },
      { email: 'outsider@example.test' }
    )
  assert.equal(denied.status, 403)
  assert.equal(relay.reads.length, before)
  persist()
  assert(
    rows.every((r) => r.verified),
    'Acceptance failure retained in raw artifact'
  )
} finally {
  await relay.close()
}
