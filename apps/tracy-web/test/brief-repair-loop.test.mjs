// The bounded repair loop (#189, COO decision 30/10/2026): at most three rounds, each round's prompt holds only the
// findings a site build rule can repair with that rule's text, the full check runs again after each round, and the loop
// goes on only while the count falls, within twenty minutes. A stub agent edits a fake site. Two made-up businesses of
// different trades prove the loop is not per case.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { cleanBuildLeftovers } from '../src/opportunities-build/demo-leftover-cleanup.js'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'
import { repairCount } from 'website-opportunities/domain/leftover-cleanup.mjs'

const DEMO_PHONE = '(555) 010-4477'
const contentMap = {
  roleVocabularyVersion: 3,
  entities: [],
  pages: [],
  slots: [{ key: 'm.0', entity: 'm', type: 'text', role: 'contact.phone', sample: DEMO_PHONE }]
}
const briefs = {
  locksmith: { business: { name: 'Keyway Locksmiths', phone: '555 0130', address: '7 Bolt Street' } },
  yoga: { business: { name: 'Stillwater Yoga Studio', phone: '555 0177', address: '2 Reed Lane' } }
}
const PAGES = ['/', '/services', '/about', '/visit']
const demoPage = () => `<html><body><footer>Call ${DEMO_PHONE}</footer></body></html>`
const fixedPage = '<html><body><footer>Call us</footer></body></html>'

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

async function world(trade, receiptExtra = {}) {
  const domain = await websiteOpportunitiesDomain()
  const site = Object.fromEntries(PAGES.map((p) => [p, demoPage()]))
  const readSitePage = async (_key, path) =>
    path in site ? { status: 200, html: site[path] } : { status: 404, html: '' }
  const revision = { template: null, brief: briefs[trade] }
  const sitePlan = { pages: PAGES.filter((p) => p !== '/').map((path) => ({ path, decision: 'keep' })) }
  const first = await runLeftoverCheck({
    readPage: (p) => readSitePage('site-1', p),
    check: domain.checkDemoLeftovers,
    contentMap,
    brief: revision.brief,
    sitePlan,
    paths: sitePlan.pages.map((p) => p.path)
  })
  const db = fakeDb({ leftovers: first, sitePlan, ...receiptExtra })
  return { domain, site, readSitePage, revision, db, first, contentMapOf: () => contentMap }
}

const run = (w, turn, extra = {}) =>
  cleanBuildLeftovers(w.db, {
    build: w.db.row,
    revision: w.revision,
    domain: w.domain,
    readSitePage: w.readSitePage,
    turn,
    contentMapOf: w.contentMapOf,
    ...extra
  })

for (const trade of ['locksmith', 'yoga']) {
  test(`${trade}: each round fixes one place, the count falls, and the loop stops after three rounds with what is left`, async () => {
    const w = await world(trade)
    const flagged = w.first.findings.filter((f) => f.kind === 'C17').length
    assert.equal(flagged, PAGES.length, 'the demo phone is found on every page')
    const asked = []
    const turn = async ({ prompt, requestId }) => {
      asked.push({ prompt, requestId })
      const next = PAGES.find((p) => w.site[p] !== fixedPage)
      if (next) w.site[next] = fixedPage
      return { state: 'completed' }
    }
    const build = await run(w, turn)
    const record = build.receipt.leftoverCleanup
    assert.equal(asked.length, 3)
    assert.deepEqual(
      asked.map((a) => a.requestId),
      ['wo-cleanup:b1:1', 'wo-cleanup:b1:2', 'wo-cleanup:b1:3']
    )
    // Other rules flag the bare fake pages too (head blocks and the like); the count is every repairable finding.
    const n = repairCount(w.first)
    assert.ok(n >= PAGES.length)
    assert.deepEqual(
      record.rounds.map((r) => [r.round, r.before, r.after, r.fixed, r.introduced, r.turn.state]),
      [
        [1, n, n - 1, 1, 0, 'completed'],
        [2, n - 1, n - 2, 1, 0, 'completed'],
        [3, n - 2, n - 3, 1, 0, 'completed']
      ]
    )
    assert.equal(record.stopped, 'rounds')
    assert.equal(record.before.total, w.first.findings.length)
    assert.equal(record.fixed.length, 3)
    assert.equal(build.receipt.leftovers.findings.filter((f) => f.kind === 'C17').length, 1)
    // Each round's prompt names only what is left, with the registry's repair text and guarantee, and the facts rule.
    assert.match(asked[0].prompt, /Repair round 1 of at most 3/)
    // A record place the plan gives no record is hidden; a page-wide finding takes its rule's repair text.
    assert.match(
      asked[0].prompt,
      /C17 .*\| page \/services \| m\.0 \| found "\(555\) 010-4477" \| instead: hide the block/
    )
    assert.match(
      asked[0].prompt,
      /main-menu .*\| instead: name the menu item by the title of the page it opens \| rule: /
    )
    assert.doesNotMatch(asked[0].prompt, /page undefined/)
    assert.match(asked[0].prompt, /\| rule: /)
    assert.match(
      asked[0].prompt,
      /A hard fact .* is written only when the owner data or the accepted statistics/
    )
    assert.equal((asked[2].prompt.match(/- C17 /g) ?? []).length, 2)
    assert.match(asked[0].prompt, new RegExp(`- name: "${briefs[trade].business.name}"`))
  })
}

test('a round that does not lower the count stops the loop after it', async () => {
  const w = await world('yoga')
  let calls = 0
  const build = await run(w, async () => {
    calls += 1
    return { state: 'completed' }
  })
  assert.equal(calls, 1)
  const record = build.receipt.leftoverCleanup
  assert.equal(record.stopped, 'no-progress')
  assert.deepEqual(
    record.rounds.map((r) => [r.before, r.after]),
    [[repairCount(w.first), repairCount(w.first)]]
  )
})

test('a round that brings in new findings so the count does not fall stops the loop', async () => {
  const w = await world('locksmith')
  w.site['/extra'] = demoPage()
  let calls = 0
  const build = await run(w, async () => {
    calls += 1
    w.site['/'] = fixedPage
    w.site['/services'] =
      `<html><body><a href="/extra">More</a><footer>Call ${DEMO_PHONE}</footer></body></html>`
    return { state: 'completed' }
  })
  assert.equal(calls, 1)
  const [round] = build.receipt.leftoverCleanup.rounds
  assert.ok(round.introduced >= 1)
  assert.ok(round.after >= round.before)
  assert.equal(build.receipt.leftoverCleanup.stopped, 'no-progress')
})

test('the loop keeps within twenty minutes: a round never gets more than the time left, and none starts without it', async () => {
  const w = await world('locksmith')
  let at = 0
  const limitsSeen = []
  const build = await run(
    w,
    async ({ limits }) => {
      limitsSeen.push(limits.timeoutMs)
      at += 10 * 60_000
      const next = PAGES.find((p) => w.site[p] !== fixedPage)
      if (next) w.site[next] = fixedPage
      return { state: 'completed' }
    },
    { now: () => at }
  )
  assert.equal(limitsSeen.length, 2)
  assert.ok(limitsSeen.every((ms) => ms <= 8 * 60_000))
  assert.equal(build.receipt.leftoverCleanup.stopped, 'time')
})

test('a turn that times out ends the loop after its re-check', async () => {
  const w = await world('yoga')
  let calls = 0
  const build = await run(w, async () => {
    calls += 1
    return { state: 'timeout' }
  })
  assert.equal(calls, 1)
  assert.equal(build.receipt.leftoverCleanup.stopped, 'timeout')
  assert.equal(build.receipt.leftoverCleanup.turn.state, 'timeout')
})

test('a round that was running when its worker died is marked interrupted and only re-checked', async () => {
  const w = await world('locksmith', {
    leftoverCleanup: {
      version: 'leftover-cleanup/1',
      before: { total: 4 },
      turn: { state: 'running' },
      rounds: [{ round: 1, before: 4, turn: { state: 'running' } }]
    }
  })
  w.site['/'] = fixedPage
  let calls = 0
  const build = await run(w, async () => {
    calls += 1
    return { state: 'completed' }
  })
  assert.equal(calls, 0)
  const record = build.receipt.leftoverCleanup
  assert.equal(record.stopped, 'interrupted')
  assert.equal(record.rounds.length, 1)
  assert.equal(record.rounds[0].turn.state, 'interrupted')
  assert.equal(record.rounds[0].after, repairCount(w.first) - 1)
  // A finished record starts nothing again.
  await run(w, async () => {
    calls += 1
    return { state: 'completed' }
  })
  assert.equal(calls, 0)
})

test('the check after a round is the full check: contact facts and the first screen are judged again', async () => {
  const w = await world('yoga')
  const seen = { contact: 0, hero: 0 }
  const domain = {
    ...w.domain,
    checkContactFacts: (input) => {
      seen.contact += 1
      return w.domain.checkContactFacts(input)
    },
    checkHeroAnswers: (input) => {
      seen.hero += 1
      return w.domain.checkHeroAnswers(input)
    }
  }
  await run(w, async () => ({ state: 'completed' }), { domain })
  assert.ok(seen.contact >= 1)
  assert.ok(seen.hero >= 1)
})

test('findings no rule can repair start no turn', async () => {
  const w = await world('locksmith')
  w.db.row.receipt.leftovers = { ...w.first, findings: [{ kind: 'no-such-kind', page: '/', place: 'x' }] }
  let calls = 0
  const build = await run(w, async () => {
    calls += 1
    return { state: 'completed' }
  })
  assert.equal(calls, 0)
  assert.equal(build.receipt.leftoverCleanup, undefined)
})
