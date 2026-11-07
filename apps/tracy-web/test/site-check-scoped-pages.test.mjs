// A site check of some pages (#448, step 9b's check after a turn): only those pages are opened, and joined to the check
// of the whole site, every other page keeps its earlier failures. Every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeScopedCheck } from '../src/lib/scoped-site-check.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { demoRead, fakeHost, pagedSite, pageRead, writtenReport } from './_site-check-pages.mjs'

test('given pages, the check opens only those pages', async () => {
  const reads = { '/': pageRead('/'), '/page-1': pageRead('/page-1'), '/page-2': demoRead('/page-2') }
  const fake = fakeHost(reads)
  const check = await runSiteCheck({
    door: pagedSite(3).door,
    report: writtenReport(),
    host: fake.host,
    pages: ['/page-2']
  })
  const opened = fake.calls.flatMap((c) => c.pages.map((p) => p.path ?? p))
  assert.deepEqual(opened, ['/page-2'])
  assert.ok(check.groups.length > 0)
})

const group = (name, failures, status = failures.length ? 'red' : 'green') => ({
  name,
  status,
  checked: 1,
  failures
})
const fail = (group, page, slot) => ({ group, page, slot, level: 'block', reason: `${group} on ${page}` })
const checkOf = (groups) => ({ version: 'site-check/1', status: 'red', counts: {}, groups })

test('joined to the whole site, the pages read again take the new failures, every other page keeps its own', () => {
  const base = checkOf([
    group('demo-words', [fail('demo-words', '/', 'a'), fail('demo-words', '/about', 'b')]),
    group('read-back', [fail('read-back', null, 'c')])
  ])
  const scoped = checkOf([group('demo-words', [fail('demo-words', '/contact', 'd')]), group('read-back', [])])
  const merged = mergeScopedCheck(base, scoped, ['/index.php/about', '/contact'])
  const words = merged.groups.find((g) => g.name === 'demo-words')
  assert.deepEqual(
    words.failures.map((f) => [f.page, f.slot]),
    [
      ['/', 'a'],
      ['/contact', 'd']
    ]
  )
  const readBack = merged.groups.find((g) => g.name === 'read-back')
  assert.equal(readBack.status, 'green', 'a failure with no page was measured again')
  assert.equal(merged.counts.block, 2)
  assert.equal(merged.status, 'red')
  assert.deepEqual(merged.scopedPages, ['/about', '/contact'])
})
