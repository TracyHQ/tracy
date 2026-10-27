/**
 * Every coverage target a place profile adapter can write has its words on the Place profile block.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-place-profile-targets.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  placeProfileForHost,
  placeProfileFromBrief,
  placeProfileFromDemoRequest,
  placeProfileFromResearch
} from 'website-opportunities/domain'
import { en } from '../src/client/strings.ts'

test('every coverage target the adapters write has a label', () => {
  const research = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'x', name: 'Example' },
    posts: Array.from({ length: 101 }, (_, i) => ({ source: 'website', text: `Post ${i}` }))
  })
  const docs = [
    research,
    placeProfileForHost(research),
    placeProfileFromDemoRequest({
      schema: 'website-opportunities/demo-request/v1',
      business: { name: 'Example' }
    }),
    placeProfileFromBrief({ business: { name: 'Example' } })
  ]
  const targets = new Set(docs.flatMap((d) => d.coverage.map((c) => c.target)))
  assert.ok(targets.has('quotes') && targets.has('claims.statistics'))
  for (const target of targets) assert.ok(Object.hasOwn(en, `pp.target.${target}`), `pp.target.${target}`)
})
