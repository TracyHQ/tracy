// The site build rules on one page (#189), the half of `tracy_build_check` that runs in tracy-web: the same final checks
// a brief build ends with, answered for the page the agent changed, each finding with its rule and what to put instead.
// A fake site and a fake store; two made-up businesses of different trades.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { pageBuildAnswer, pageBuildCheck } from '../src/opportunities-build/page-build-check.js'

const DEMO_PHONE = '(555) 010-4477'
const contentMap = {
  roleVocabularyVersion: 3,
  entities: [],
  pages: [],
  slots: [{ key: 'm.0', entity: 'm', type: 'text', role: 'contact.phone', sample: DEMO_PHONE }]
}
const briefs = {
  tailor: { business: { name: 'Needle Row Tailors', phone: '555 0161' } },
  vet: { business: { name: 'Fernhill Vets', phone: '555 0188' } }
}

function fakeDb(row) {
  const asked = []
  return {
    asked,
    async query(sql, args) {
      asked.push({ sql, args })
      return { rows: /from wo_build/.test(sql) && row ? [row] : [] }
    }
  }
}

for (const trade of ['tailor', 'vet']) {
  test(`${trade}: the answer lists the changed page's findings with their rule and repair, not another page's`, async () => {
    const domain = await websiteOpportunitiesDomain()
    const site = {
      '/': '<html><body><a href="/prices">Prices</a><footer>Call us</footer></body></html>',
      '/prices': `<html><body><footer>Call ${DEMO_PHONE}</footer></body></html>`,
      '/about': `<html><body><footer>Call ${DEMO_PHONE}</footer></body></html>`
    }
    const readSitePage = async (_key, path) =>
      path in site ? { status: 200, html: site[path] } : { status: 404, html: '' }
    const db = fakeDb({
      receipt: { sitePlan: { pages: [{ path: '/about', decision: 'keep' }] } },
      template: { slug: 'fictional' },
      brief: briefs[trade]
    })
    const answer = await pageBuildCheck(db, {
      siteKey: 'site-1',
      path: '/prices',
      readSitePage,
      domain,
      contentMapOf: () => contentMap
    })
    assert.deepEqual(db.asked[0].args, ['site-1'])
    assert.equal(answer.path, '/prices')
    assert.equal(answer.pass, false)
    const phone = answer.findings.filter((f) => f.kind === 'C17')
    assert.equal(phone.length, 1, 'the /about finding is not this page')
    assert.equal(phone[0].page, '/prices')
    assert.equal(phone[0].rule, 'demo-content')
    assert.ok(phone[0].instead)
    assert.ok(phone[0].guarantee)
    assert.ok(answer.pages.includes('/about'), 'the plan pages were read too, so siblings are judged')
  })
}

test('a site with no brief build is still checked, without a plan', async () => {
  const domain = await websiteOpportunitiesDomain()
  const readSitePage = async (_key, path) =>
    path === '/'
      ? { status: 200, html: '<html><body><h1>Fernhill Vets</h1></body></html>' }
      : { status: 404, html: '' }
  const answer = await pageBuildCheck(fakeDb(null), { siteKey: 'site-2', path: '/', readSitePage, domain })
  assert.equal(answer.path, '/')
  assert.ok(Array.isArray(answer.findings))
})

test('blockers come first and the list is capped with a count of the rest', async () => {
  const domain = await websiteOpportunitiesDomain()
  const findings = [
    ...Array.from({ length: 45 }, (_, i) => ({ kind: 'main-menu', page: '/', place: `item ${i}` })),
    { kind: 'head-block', page: '/', place: 'head' }
  ]
  const answer = pageBuildAnswer({ findings, broken: [], pages: ['/'] }, '/', domain)
  assert.equal(answer.findings.length, 40)
  assert.equal(answer.more, 6)
  assert.equal(answer.findings[0].kind, 'head-block')
  assert.equal(answer.findings[0].rule, 'missing-head-block')
  assert.equal(answer.findings[0].blocks, true)
  assert.equal(answer.blockers, 1)
})
