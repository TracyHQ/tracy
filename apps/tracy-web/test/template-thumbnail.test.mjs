/**
 * The Template default card's picture (`src/lib/template-thumbnail.js`): the card thumbnail of the release a site
 * was built from, the same file /ops Templates Management draws.
 *
 *   node --test apps/tracy-web/test/template-thumbnail.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { templateCardImageOf, templateThumbnailOf } from '../src/lib/template-thumbnail.js'

const releases = [
  { tag: 'tracy-business/j6', setting: { template: 'tracy-business' }, inspiration: { image: 'home.png' } },
  // an older cut of the same card, carrying no picture of its own
  {
    tag: 'tracy-business/j6-old',
    setting: { template: 'tracy-business' },
    inspiration: { template: 'tracy-business' }
  },
  // a JoomlArt quickstart with no card at all
  { tag: 'quickstart/ja-vega/j6', setting: { template: 'ja_vega' } }
]

test('the release of the site names its card id and thumbnail file', () => {
  assert.deepEqual(templateCardImageOf(releases, 'tracy-business/j6'), {
    id: 'tracy-business',
    image: 'home.png'
  })
})

test('a release with no picture borrows the one filed under the same card; no card or no tag is null', () => {
  assert.deepEqual(templateCardImageOf(releases, 'tracy-business/j6-old'), {
    id: 'tracy-business',
    image: 'home.png'
  })
  assert.equal(templateCardImageOf(releases, 'quickstart/ja-vega/j6'), null)
  assert.equal(templateCardImageOf(releases, 'nobody/j6'), null)
  assert.equal(templateCardImageOf(releases, null), null)
})

/** A pool that answers the two reads the helper makes: the releases table and the shots held. */
function fakePool({ held }) {
  return {
    query: async (sql) => {
      if (/from quickstart_releases/.test(sql))
        return {
          rows: releases.map((r) => ({
            tag: r.tag,
            release: { name: r.tag, kind: 'quickstart' },
            setting: r.setting,
            inspiration: r.inspiration ?? null,
            inspiration_hidden: false,
            pages: null,
            tracy: null,
            reason: null,
            fetched_at: new Date()
          }))
        }
      if (/from template_shots/.test(sql)) return { rows: held }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
}

test('the address is the public shots door with its digest; a picture this server does not hold is null', async () => {
  const site = { quickstart_tag: 'tracy-business/j6' }
  const url = await templateThumbnailOf(
    fakePool({ held: [{ template_id: 'tracy-business', file: 'home.png', sha256: 'abcdef1234567890' }] }),
    site,
    'https://tracy.test/'
  )
  assert.equal(url, 'https://tracy.test/api/templates/tracy-business/shots/home.png?v=abcdef12')
  assert.equal(await templateThumbnailOf(fakePool({ held: [] }), site, 'https://tracy.test'), null)
})
