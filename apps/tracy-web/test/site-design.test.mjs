/**
 * The design record tracy-web owns (ADR 0023, "Addendum 29/09"): what a site wears, readable by the
 * agent's lane and by `/v1`, written by the build and by the Apply door.
 *
 * The public shape is fixed with the API session: `{design: {id, name, source, platform, tokens,
 * tokensFrom, updatedAt} | null}` — `manifest_design` and `wrote_by` stay inside.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { freshPool } from './_db.mjs'
import { designRecordProblem, readSiteDesign, tokensFor, writeSiteDesign } from '../src/lib/site-design.js'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

test('tokensFor answers a catalogue system from the generated map, and null for anything else', () => {
  const apple = tokensFor('apple')
  assert.equal(apple?.['--accent'], '#0071e3')
  assert.equal(Object.keys(apple ?? {}).length, 56)
  assert.equal(tokensFor('nowhere'), null)
  assert.equal(tokensFor('brand:acme.com'), null)
})

test('designRecordProblem accepts the shapes the build sends, and names what is wrong otherwise', () => {
  const good = {
    id: 'apple',
    source: 'catalog',
    name: 'Apple',
    platform: 'wordpress',
    tokens: { '--bg': '#fff' },
    tokensFrom: '/x/tokens.css'
  }
  assert.equal(designRecordProblem(good), null)
  assert.equal(designRecordProblem({ ...good, id: null, source: 'template', tokens: null }), null)
  assert.equal(designRecordProblem({ ...good, id: 'brand:acme.com', source: 'brand' }), null)
  assert.match(designRecordProblem({ ...good, source: 'invented' }), /source/)
  assert.match(designRecordProblem({ ...good, id: 'Apple Inc' }), /id/)
  assert.match(designRecordProblem({ ...good, platform: '' }), /platform/)
  assert.match(designRecordProblem({ ...good, tokens: { bg: '#fff' } }), /tokens/)
  assert.match(designRecordProblem({ ...good, tokens: { '--bg': 7 } }), /tokens/)
  const many = Object.fromEntries(Array.from({ length: 121 }, (_, i) => [`--t${i}`, 'x']))
  assert.match(designRecordProblem({ ...good, tokens: many }), /tokens/)
  assert.match(designRecordProblem(null), /record/)
  // A quickstart names the quickstart it wears: its tokens are the build's and nobody else has them.
  const quickstart = { ...good, id: 'tracy-business', source: 'quickstart', name: 'Tracy Business' }
  assert.equal(designRecordProblem(quickstart), null)
  assert.equal(designRecordProblem({ ...quickstart, tokens: null }), null)
  assert.match(designRecordProblem({ ...quickstart, id: null }), /quickstart/)
  assert.match(designRecordProblem({ ...quickstart, id: 'brand:acme.com' }), /quickstart/)
})

test(
  'a site with no record reads as {design: null}; a written record reads back in the public shape only',
  opts,
  async () => {
    const { pool, close } = await freshPool()
    try {
      await pool.query(
        "insert into site (site_key, label, host) values ('lantern.localhost', 'lantern', 'local')"
      )
      assert.deepEqual(await readSiteDesign(pool, 'lantern.localhost'), { design: null })
      await writeSiteDesign(
        pool,
        'lantern.localhost',
        {
          id: 'apple',
          source: 'catalog',
          name: 'Apple',
          platform: 'wordpress',
          tokens: { '--accent': '#0071e3' },
          tokensFrom: '/opt/tracy/cms/data/systems/apple/tokens.css',
          manifestDesign: { id: 'apple', source: 'catalog' }
        },
        'build'
      )
      const { design } = await readSiteDesign(pool, 'lantern.localhost')
      assert.deepEqual(Object.keys(design).sort(), [
        'id',
        'name',
        'platform',
        'source',
        'tokens',
        'tokensFrom',
        'updatedAt'
      ])
      assert.equal(design.id, 'apple')
      assert.deepEqual(design.tokens, { '--accent': '#0071e3' })
      assert.match(design.updatedAt, /^\d{4}-\d{2}-\d{2}T/)
      const { rows } = await pool.query(
        "select wrote_by, manifest_design from site_design where site_key = 'lantern.localhost'"
      )
      assert.deepEqual(rows[0], { wrote_by: 'build', manifest_design: { id: 'apple', source: 'catalog' } })
      // A second write replaces the row: one site, one look.
      await writeSiteDesign(
        pool,
        'lantern.localhost',
        {
          id: 'airbnb',
          source: 'catalog',
          name: 'Airbnb',
          platform: 'wordpress',
          tokens: null,
          tokensFrom: null
        },
        'apply:a1'
      )
      const again = await readSiteDesign(pool, 'lantern.localhost')
      assert.equal(again.design.id, 'airbnb')
      const after = await pool.query(
        "select wrote_by, manifest_design from site_design where site_key = 'lantern.localhost'"
      )
      assert.equal(after.rows[0].wrote_by, 'apply:a1')
      assert.deepEqual(
        after.rows[0].manifest_design,
        { id: 'apple', source: 'catalog' },
        'a later write without it keeps what the build recorded'
      )
    } finally {
      await close()
    }
  }
)
