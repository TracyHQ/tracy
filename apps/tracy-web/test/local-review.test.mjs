/**
 * Local review mode (`src/lib/local-review.js`, Akemi 17/10/2026): a local stand that reviews unpublished packs
 * offers only their cards, opens the design system lock, and previews a pack on the newest site built from it.
 *
 *   node --test apps/tracy-web/test/local-review.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { localPackSiteOf, localReviewCards, localReviewDemoOf, OPEN_LOCK } from '../src/lib/local-review.js'

test('on, the gallery keeps the local cards only; off, every card', () => {
  const cards = [
    { id: 'ja-vogue' },
    { id: 'local-ja-vogue', local: true },
    { id: 'local-ja-tour', local: true }
  ]
  assert.deepEqual(
    localReviewCards(cards, true).map((c) => c.id),
    ['local-ja-vogue', 'local-ja-tour']
  )
  assert.equal(localReviewCards(cards, false), cards)
})

test('the open lock blocks nobody', async () => {
  assert.equal(await OPEN_LOCK.blocked('someone@example.com', 'joomla/ja_vogue'), false)
})

test('the preview demo: live demo first, a local pack falls back to its newest site only when on', async () => {
  const site = {
    label: 'vogue-review3',
    platform: 'joomla',
    address: 'http://vogue-review3.tracy.test:51710/'
  }
  const asked = []
  const deps = {
    liveDemoOf: async (tag) => (tag === 'quickstart/ja-vogue/j6' ? { label: 'demo' } : null),
    packSiteOf: async (tag) => {
      asked.push(tag)
      return site
    }
  }
  const on = localReviewDemoOf({ on: true, ...deps })
  const off = localReviewDemoOf({ on: false, ...deps })
  assert.deepEqual(await on('quickstart/ja-vogue/j6'), { label: 'demo' })
  assert.equal(await on('local/quickstart/ja-vogue/j6'), site)
  assert.equal(await on('quickstart/ja-tour/j6'), null)
  assert.equal(await off('local/quickstart/ja-vogue/j6'), null)
  assert.deepEqual(asked, ['local/quickstart/ja-vogue/j6'])
})

test('the pack site read asks for the newest non-demo site of a local tag only', async () => {
  const queries = []
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params })
      return { rows: [{ label: 'sensei-review' }] }
    }
  }
  assert.equal(await localPackSiteOf(pool, 'quickstart/ja-sensei/j6'), null)
  assert.equal(queries.length, 0)
  assert.deepEqual(await localPackSiteOf(pool, 'local/quickstart/ja-sensei/j6'), { label: 'sensei-review' })
  assert.match(queries[0].sql, /not demo/)
  assert.match(queries[0].sql, /order by created_at desc/)
  assert.deepEqual(queries[0].params, ['local/quickstart/ja-sensei/j6'])
})

test('a local pack is judged as the release it stands for (support, contract, template key)', async () => {
  const { quickstartContractOf, quickstartTemplateOf, supportForNewSite } = await import(
    '../src/lib/ds-slot.js'
  )
  const published = { platform: 'joomla', tag: 'quickstart/ja-vogue/j6', version: '1.0.6' }
  const local = { ...published, tag: 'local/quickstart/ja-vogue/j6' }
  assert.equal(supportForNewSite(published).supported, true)
  assert.deepEqual(supportForNewSite(local), supportForNewSite(published))
  assert.deepEqual(quickstartContractOf(local), quickstartContractOf(published))
  assert.equal(quickstartTemplateOf(local), quickstartTemplateOf(published))
})
