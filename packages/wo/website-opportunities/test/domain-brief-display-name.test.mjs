// The name a site brief writes for a business with a branch (#1791): never joined by a dash, which reads as machine
// written in the copy. Fictional business.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBrief, renderBriefMarkdown } from '../domain/brief.mjs'

test('a business with a branch is written "name (branch)", with no dash anywhere in the copy', () => {
  const brief = buildBrief({
    opportunity: {
      id: 'opp-branch',
      name: 'Harbour Sport Club',
      branch: 'Marina',
      candidate: { provider: 'osm', providerId: 'node/1', lat: 25.08, lon: 55.14, kind: 'gyms' }
    },
    profile: { name: 'Harbour Sport Club', bio: 'Padel and tennis coaching for all ages.' },
    sources: [],
    media: [],
    brand: {},
    madeAt: '2026-10-27T10:00:00.000Z'
  })
  const copies = JSON.stringify(brief.sitemap)
  assert.ok(copies.includes('Harbour Sport Club (Marina)'), copies)
  assert.equal(/Harbour Sport Club\s*[\u2014\u2013-]\s*Marina/.test(copies), false)
  assert.equal(/Harbour Sport Club\s*[\u2014\u2013]\s*Marina/.test(renderBriefMarkdown(brief)), false)
})
