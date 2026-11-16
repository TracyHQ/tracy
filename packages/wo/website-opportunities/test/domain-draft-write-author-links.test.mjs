// No link to an author page the build does not make (ticket #597, gate run 7): a built post printed "Written by" with a
// link to an author page the kit declares unbuilt. T4 prints it wherever `show_author` is on, and com_content turns it
// on unless the article or the list turns it off. The write sets only params the kit declares, so the plan names,
// typed, each kit key that would turn it off (`author_link_to_unbuilt_page`). The invented florist on the JA Boxing kit.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-author-links.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { plan, site } from './fixtures/draft-write/guarded.mjs'

const flagged = (p) => p.unproven.filter((u) => u.code === 'author_link_to_unbuilt_page').map((u) => u.kitKey)

test('the JA Boxing kit declares show_author "0" on the class article and the home list: nothing is flagged', () => {
  assert.deepEqual(flagged(plan), [])
  const article = plan.ops.find((op) => op.kind === 'article.create')
  assert.equal(article.base.attribs.show_author, '0')
})

test('a kit without those declarations names the kit keys that would keep an author link off', () => {
  const aiq = structuredClone(site.aiq)
  delete aiq.mapping.pages.class.record.base.attribs.show_author
  delete aiq.mapping.pages.home.menuItem.params.show_author
  assert.deepEqual(flagged(writePlanOf(site.order, aiq, { stored: site.stored })), [
    'pages.class.record.base.attribs.show_author',
    'pages.home.menuItem.params.show_author'
  ])
})

test('a kit with the author pages built has a page to link to: nothing is flagged', () => {
  const aiq = structuredClone(site.aiq)
  delete aiq.mapping.pages.author
  delete aiq.mapping.pages.authors
  assert.deepEqual(flagged(writePlanOf(site.order, aiq, { stored: site.stored })), [])
})
