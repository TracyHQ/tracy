// Every picture the write places in a created record carries alt text (ticket #597, gate run 7): an article picture
// went out with an empty `image_intro_alt`. The plan writes the alt beside each picture key of `images`: the pictures
// step's alt for that picture, else one from the record's title; never empty, never a file name. A place the blank site
// contract declares decorative keeps an empty alt on purpose. The invented florist on the real JA Boxing kit.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-picture-alts.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { altOf } from '../domain/draft-write-picture-alts.mjs'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { plan, site } from './fixtures/draft-write/guarded.mjs'

const imagesOf = (p) =>
  p.ops
    .filter((op) => op.kind === 'article.create')
    .map((op) => ({
      op,
      at: Object.fromEntries(
        op.values.filter((v) => v.loc.column === 'images').map((v) => [v.loc.jsonPath[0], v.value])
      )
    }))

test('every article picture key has its alt key written beside it, never empty, never a file name', () => {
  const articles = imagesOf(plan).filter(({ at }) => at.image_intro || at.image_fulltext)
  assert.ok(articles.length > 0)
  for (const { op, at } of articles)
    for (const [key, alt] of [
      ['image_intro', 'image_intro_alt'],
      ['image_fulltext', 'image_fulltext_alt']
    ])
      if (at[key]?.ref) {
        assert.equal(typeof at[alt], 'string', `${op.key} ${alt}`)
        assert.ok(at[alt].trim() !== '' && !/\.(png|jpe?g|webp)$/i.test(at[alt]))
      }
})

test('the alt is the picture own, else from the record title; a file name never is', () => {
  const record = { values: new Map([['t', { loc: { column: 'title' }, value: 'Wild meadow bouquet' }]]) }
  assert.equal(altOf({ alt: 'A posy of cornflowers' }, record), 'A posy of cornflowers')
  assert.equal(altOf({ alt: 'posy-04.jpg' }, record), 'Wild meadow bouquet')
  assert.equal(altOf({ alt: '' }, record), 'Wild meadow bouquet')
  assert.equal(altOf(null, { values: new Map() }), '')
})

test('a place the contract declares decorative keeps its alt empty', () => {
  const aiq = structuredClone(site.aiq)
  // An invented kit shape: the JA Boxing kit declares no decorative place; this one marks the class pictures so.
  for (const key of ['article-16.5', 'article-16.6'])
    aiq.blankContract.slots.push({ key, type: 'image', role: 'editorial.decorative_image' })
  const decorated = writePlanOf(site.order, aiq, { stored: site.stored })
  for (const { at } of imagesOf(decorated)) {
    assert.equal(at.image_intro_alt, undefined)
    assert.equal(at.image_fulltext_alt, undefined)
  }
})
