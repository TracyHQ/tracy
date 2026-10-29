// C02, C08 and C18 count one demo piece once per page, not once per slot that holds the same sample (spec TracyHQ/tracy#189).
// Two made-up trades: a bakery with shared class-like articles and a dental clinic with one repeated video id.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDemoLeftovers } from '../domain/demo-leftovers.mjs'

const BODY = 'Knead the dough gently for ten minutes before it rests under a warm cloth'
const slot = (entity, n, role, sample, extra = {}) => ({
  key: `${entity}.${n}`,
  entity,
  column: 'introtext',
  type: 'text',
  role,
  sample,
  ...extra
})

test('three articles that share one demo body are one leftover on the page that shows it', () => {
  const contentMap = {
    entities: [],
    slots: ['article-1', 'article-2', 'article-3'].map((e) => slot(e, 1, 'editorial.paragraph', BODY))
  }
  const run = (html) =>
    checkDemoLeftovers({
      pages: [
        { path: '/lesson', status: 200, html: `<html><body><main><p>${BODY}</p>${html}</main></body></html>` }
      ],
      contentMap,
      brief: { business: { name: 'Copperleaf Bakery' } }
    })
  assert.equal(run('').counts.C02, 1)
})

test('one demo video id held by several slots is one leftover on a page', () => {
  const contentMap = {
    entities: [],
    slots: ['article-4', 'article-5', 'article-6'].map((e) =>
      slot(e, 2, 'business.video', 'AbCdEfGhIjK', { type: 'text' })
    )
  }
  const out = checkDemoLeftovers({
    pages: [
      {
        path: '/care',
        status: 200,
        html: '<html><body><a data-src="https://www.youtube.com/embed/AbCdEfGhIjK">play</a></body></html>'
      }
    ],
    contentMap,
    brief: { business: { name: 'Northgate Dental' } }
  })
  assert.equal(out.counts.C08, 1)
})
