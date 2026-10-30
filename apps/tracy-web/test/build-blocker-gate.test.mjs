// The blocker gate (#189): after the one cleanup turn, a brief build whose final check still holds a blocker is kept as
// "needs fixes" with the list, never as built. The check after the turn is the same full check as the first one, so a
// blocker the first check found cannot vanish because the second check looked at less. Two made-up businesses.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { cleanBuildLeftovers } from '../src/opportunities-build/demo-leftover-cleanup.js'
import { checkBuildLeftovers } from '../src/opportunities-build/demo-leftover-check.js'
import { gateBuildBlockers } from '../src/opportunities-build/build-blocker-gate.js'

// The Privacy Policy page every build owes (criterion 10.1), linked from the footer of the home page.
const FOOTER = '<footer><ul><li><a href="/privacy-policy">Privacy Policy</a></li></ul></footer>'
const PRIVACY_PAGE =
  '<html><head><style data-tracy-leftovers>.x{}</style></head><body><h1>Privacy Policy</h1><p>How we handle your details.</p></body></html>'
const contentMap = { roleVocabularyVersion: 3, entities: [], pages: [], slots: [] }
// The plan hides a demo video, so every page owes the leftovers head block.
const sitePlan = {
  pages: [
    { path: '/', decision: 'keep' },
    { path: '/privacy-policy', role: 'privacy', decision: 'keep' }
  ],
  outside: { videos: [{ decision: 'still', demo: true }] }
}

function fakeDb(receipt) {
  const row = { id: 'b1', site_key: 'site-1', receipt }
  return {
    row,
    async query(sql, args) {
      if (/from site_brief/.test(sql)) return { rows: [] }
      if (/update wo_build/.test(sql)) {
        const named = /jsonb_build_object\('(\w+)'/.exec(sql)?.[1]
        const patch = JSON.parse(args[1])
        row.receipt = { ...row.receipt, ...(named ? { [named]: patch } : patch) }
      }
      return { rows: [row] }
    }
  }
}

async function world(brief) {
  const domain = await websiteOpportunitiesDomain()
  const site = {
    '/': `<html><head></head><body><h1>Welcome</h1>${FOOTER}</body></html>`,
    '/privacy-policy': PRIVACY_PAGE
  }
  const readSitePage = async (_key, path) =>
    path in site ? { status: 200, html: site[path] } : { status: 404, html: '' }
  const revision = { template: null, brief }
  const db = fakeDb({ sitePlan })
  const build = await checkBuildLeftovers(db, {
    build: db.row,
    revision,
    domain,
    readSitePage,
    contentMapOf: () => contentMap
  })
  return { domain, site, readSitePage, revision, db, build }
}

const florist = { business: { name: 'Petal Row Florist', phone: '555 0123', address: '4 Petal Row' } }
const garage = { business: { name: 'Quay Street Garage', phone: '555 0144', address: '12 Quay Street' } }

for (const [trade, brief] of [
  ['florist', florist],
  ['garage', garage]
]) {
  test(`${trade}: a blocker the turn did not fix is still found after it, and the build needs fixes`, async () => {
    const w = await world(brief)
    assert.ok(
      w.build.receipt.leftovers.findings.some((f) => f.kind === 'head-block'),
      'the first check finds the missing head block'
    )
    let build = await cleanBuildLeftovers(w.db, {
      build: w.build,
      revision: w.revision,
      domain: w.domain,
      readSitePage: w.readSitePage,
      turn: async () => ({ state: 'completed' }),
      contentMapOf: () => contentMap
    })
    assert.ok(
      build.receipt.leftovers.findings.some((f) => f.kind === 'head-block'),
      'the check after the turn reads as much as the first'
    )
    build = await gateBuildBlockers(w.db, { build, domain: w.domain })
    assert.equal(build.receipt.blockers.state, 'needs-fixes')
    assert.deepEqual(
      build.receipt.blockers.items.map((i) => i.rule),
      ['missing-head-block']
    )
  })
}

test('a turn that fixes every blocker leaves the build clear', async () => {
  const w = await world(florist)
  let build = await cleanBuildLeftovers(w.db, {
    build: w.build,
    revision: w.revision,
    domain: w.domain,
    readSitePage: w.readSitePage,
    turn: async () => {
      w.site['/'] =
        `<html><head><style data-tracy-leftovers>.x{}</style></head><body><h1>Welcome</h1>${FOOTER}</body></html>`
      return { state: 'completed' }
    },
    contentMapOf: () => contentMap
  })
  build = await gateBuildBlockers(w.db, { build, domain: w.domain })
  assert.equal(build.receipt.blockers.state, 'clear')
  assert.deepEqual(build.receipt.blockers.items, [])
})

test('a build with no check report is left alone: there is nothing to judge', async () => {
  const domain = await websiteOpportunitiesDomain()
  const db = fakeDb({})
  const build = await gateBuildBlockers(db, { build: db.row, domain })
  assert.equal(build.receipt.blockers, undefined)
})
