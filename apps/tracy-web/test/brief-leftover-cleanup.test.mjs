// Ticket #197: the bounded cleanup turn after the leftover check. A stub agent turn edits a fake site; the runner module
// is judged on what it records and on never failing the build. Two made-up businesses of different trades.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { cleanBuildLeftovers, cleanupTurnPort } from '../src/opportunities-build/demo-leftover-cleanup.js'
import { handoffCleanup } from '../src/opportunities-build/handoff.js'

const DEMO_PHONE = '(555) 010-4477'
const contentMap = {
  roleVocabularyVersion: 3,
  entities: [],
  pages: [],
  slots: [{ key: 'm.0', entity: 'm', type: 'text', role: 'contact.phone', sample: DEMO_PHONE }]
}
const briefs = {
  bakery: { business: { name: 'Mill Lane Bakery', phone: '555 0100', address: '3 Mill Lane' } },
  clinic: { business: { name: 'Ash Dental Clinic', phone: '555 0199', address: '9 Ash Road' } }
}

/** A fake pool that holds one receipt and applies the runner's `receipt || json` update. */
function fakeDb(receipt) {
  const row = { id: 'b1', site_key: 'site-1', receipt }
  return {
    row,
    async query(sql, args) {
      if (/update wo_build/.test(sql)) row.receipt = { ...row.receipt, ...JSON.parse(args[1]) }
      return { rows: [row] }
    }
  }
}

async function world(trade) {
  const domain = await websiteOpportunitiesDomain()
  const site = { '/': `<html><body><footer>Call ${DEMO_PHONE}</footer></body></html>` }
  const readSitePage = async (_key, path) =>
    path in site ? { status: 200, html: site[path] } : { status: 404, html: '' }
  const revision = { template: null, brief: briefs[trade] }
  const first = await (await import('../src/opportunities-build/demo-leftover-check.js')).runLeftoverCheck({
    readPage: (p) => readSitePage('site-1', p),
    check: domain.checkDemoLeftovers,
    contentMap,
    brief: revision.brief
  })
  const db = fakeDb({ leftovers: first })
  return { domain, site, readSitePage, revision, db, first, contentMapOf: () => contentMap }
}

for (const trade of ['bakery', 'clinic']) {
  test(`${trade}: a stub agent that fixes the finding leaves none and the record shows before, after and what changed`, async () => {
    const w = await world(trade)
    assert.ok(w.first.findings.length >= 1)
    const prompts = []
    const turn = async ({ prompt }) => {
      prompts.push(prompt)
      w.site['/'] = '<html><body><footer>Call us</footer></body></html>'
      return { state: 'completed' }
    }
    const build = await cleanBuildLeftovers(w.db, {
      build: w.db.row,
      revision: w.revision,
      domain: w.domain,
      readSitePage: w.readSitePage,
      turn,
      contentMapOf: w.contentMapOf
    })
    assert.equal(prompts.length, 1)
    assert.match(prompts[0], /C17/)
    assert.doesNotMatch(prompts[0], /Build the demo website/)
    const record = build.receipt.leftoverCleanup
    assert.equal(record.before.total, w.first.findings.length)
    assert.equal(record.after.total, 0)
    assert.equal(record.fixed.length, w.first.findings.length)
    assert.deepEqual(record.pagesLost, [])
    assert.equal(record.turn.state, 'completed')
    assert.equal(build.receipt.leftovers.pass, true)
    assert.equal(handoffCleanup(record).after.total, 0)
  })
}

test('no findings means no agent turn', async () => {
  const w = await world('bakery')
  w.site['/'] = '<html><body>Call us</body></html>'
  const clean = await (await import('../src/opportunities-build/demo-leftover-check.js')).runLeftoverCheck({
    readPage: (p) => w.readSitePage('site-1', p),
    check: w.domain.checkDemoLeftovers,
    contentMap,
    brief: w.revision.brief
  })
  const db = fakeDb({ leftovers: clean })
  let calls = 0
  const build = await cleanBuildLeftovers(db, {
    build: db.row,
    revision: w.revision,
    domain: w.domain,
    readSitePage: w.readSitePage,
    turn: async () => {
      calls += 1
    },
    contentMapOf: w.contentMapOf
  })
  assert.equal(calls, 0)
  assert.equal(build.receipt.leftoverCleanup, undefined)
})

for (const [name, turn] of [
  [
    'throws',
    async () => {
      throw Object.assign(new Error('boom'), { code: 'AGENT_DOWN' })
    }
  ],
  ['times out', async () => ({ state: 'timeout' })]
]) {
  test(`a turn that ${name} never fails the build: the engine's site stays and the leftovers are listed`, async () => {
    const w = await world('clinic')
    const build = await cleanBuildLeftovers(w.db, {
      build: w.db.row,
      revision: w.revision,
      domain: w.domain,
      readSitePage: w.readSitePage,
      turn,
      contentMapOf: w.contentMapOf
    })
    const record = build.receipt.leftoverCleanup
    assert.notEqual(record.turn.state, 'completed')
    assert.equal(record.after.total, record.before.total)
    assert.equal(record.fixed.length, 0)
    assert.equal(build.receipt.leftovers.findings.length, record.before.total)
  })
}

test('a turn that removes a page is reported as pages lost', async () => {
  const w = await world('bakery')
  w.site['/about'] = '<html><body>About</body></html>'
  w.db.row.receipt.leftovers.pages = ['/', '/about']
  const turn = async () => {
    delete w.site['/about']
    return { state: 'completed' }
  }
  w.db.row.receipt.sitePlan = { pages: [{ decision: 'keep', path: '/about' }] }
  const build = await cleanBuildLeftovers(w.db, {
    build: w.db.row,
    revision: w.revision,
    domain: w.domain,
    readSitePage: w.readSitePage,
    turn,
    contentMapOf: w.contentMapOf
  })
  assert.deepEqual(build.receipt.leftoverCleanup.pagesLost, ['/about'])
})

test('a worker that returns after the cleanup was recorded starts no second turn', async () => {
  const w = await world('bakery')
  let calls = 0
  const turn = async () => {
    calls += 1
    return { state: 'completed' }
  }
  const args = {
    revision: w.revision,
    domain: w.domain,
    readSitePage: w.readSitePage,
    turn,
    contentMapOf: w.contentMapOf
  }
  await cleanBuildLeftovers(w.db, { build: w.db.row, ...args })
  await cleanBuildLeftovers(w.db, { build: w.db.row, ...args })
  assert.equal(calls, 1)
})

test('the production port reports a timeout when the turn never closes, and an error when the chat cannot be made', async () => {
  let at = 0
  const db = {
    async query(sql) {
      return { rows: /site_turn/.test(sql) ? [] : [{ site_key: 'site-1', label: 'l' }] }
    }
  }
  const deps = {
    sessionAhead: async () => 's1',
    prompt: async () => true,
    now: () => at,
    sleep: async (ms) => {
      at += ms
    }
  }
  const port = cleanupTurnPort(db, deps, { build: { id: 'b1', site_key: 'site-1' }, email: 'o@test.example' })
  assert.equal((await port({ prompt: 'p', requestId: 'r', limits: { timeoutMs: 10_000 } })).state, 'timeout')
  const none = cleanupTurnPort(
    db,
    { ...deps, sessionAhead: async () => null },
    { build: { id: 'b1', site_key: 'site-1' }, email: 'o@test.example' }
  )
  assert.equal(
    (await none({ prompt: 'p', requestId: 'r', limits: { timeoutMs: 10 } })).code,
    'CLEANUP_SESSION_FAILED'
  )
})
