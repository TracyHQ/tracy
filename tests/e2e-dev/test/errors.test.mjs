import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classify, triage } from '../lib/errors.mjs'

const env = { origin: 'https://cowork.example.site', siteDomain: 'example.site' }
const c = (event, ctx = {}) => classify(event, ctx, env)

test("Tracy's own plugin fails the journey", () => {
  const r = c({
    type: 'pageerror',
    message: 'x is undefined',
    url: 'https://cowork.example.site/plugins/@tracy/dsh-sidebar/lib/client.js'
  })
  assert.equal(r.verdict, 'fail')
  assert.equal(r.owner, 'tracy')
})

test('a combo bundle naming Tracy belongs to Tracy; one naming only upstream is a note', () => {
  assert.equal(
    c({
      type: 'pageerror',
      url: 'https://cowork.example.site/plugins/??@deepseek-ai/a/client.js,@tracy/b/client.js'
    }).verdict,
    'fail'
  )
  const up = c({
    type: 'pageerror',
    url: 'https://cowork.example.site/plugins/??@deepseek-ai/a/client.js,@deepseek-ai/b/client.js'
  })
  assert.equal(up.verdict, 'note')
  assert.equal(up.owner, 'upstream')
})

test('an upstream message prefix on the workspace page is a note', () => {
  assert.equal(
    c({ type: 'console', message: '[dsh-better-sidebar] lost', frameUrl: 'https://cowork.example.site/x/' })
      .owner,
    'upstream'
  )
})

test('any other error from the workspace origin is Tracy (tracy-web is ours)', () => {
  assert.equal(
    c({ type: 'response', status: 500, url: 'https://cowork.example.site/api/sites' }).verdict,
    'fail'
  )
})

test("the badge and Tracy's doors on a customer host are Tracy's, in any step", () => {
  assert.equal(
    c({ type: 'response', status: 500, url: 'https://acme.example.site/__tracy/errors' }).owner,
    'tracy'
  )
  assert.equal(c({ type: 'pageerror', url: 'https://cowork.example.site/tracy-badge.js' }).verdict, 'fail')
})

test('a customer-site error fails only while the site is the step under test', () => {
  const e = {
    type: 'pageerror',
    message: 'jQuery is not defined',
    url: 'https://acme.example.site/wp-content/x.js'
  }
  assert.equal(c(e, { siteStep: true }).verdict, 'fail')
  assert.equal(c(e, { siteStep: false }).verdict, 'note')
  assert.equal(c(e).owner, 'site')
})

test('analytics, third parties and benign messages are notes even during a site step', () => {
  assert.equal(
    c({ type: 'requestfailed', url: 'https://www.google-analytics.com/g/collect' }, { siteStep: true }).owner,
    'third-party'
  )
  assert.equal(
    c({ type: 'requestfailed', url: 'https://cdn.other.net/a.js' }, { siteStep: true }).verdict,
    'note'
  )
  assert.equal(
    c(
      { type: 'requestfailed', message: 'net::ERR_ABORTED', url: 'https://acme.example.site/x' },
      { siteStep: true }
    ).owner,
    'benign'
  )
  assert.equal(c({ type: 'console', message: 'Failed: ERR_CACHE_MISS' }, { siteStep: true }).verdict, 'note')
})

test('triage splits fails from notes and keeps the reason on each', () => {
  const { fails, notes } = triage(
    [
      { type: 'pageerror', url: 'https://cowork.example.site/plugins/@tracy/a/client.js' },
      { type: 'requestfailed', url: 'https://www.googletagmanager.com/gtm.js' }
    ],
    {},
    env
  )
  assert.equal(fails.length, 1)
  assert.equal(notes.length, 1)
  assert.ok(fails[0].reason)
})
