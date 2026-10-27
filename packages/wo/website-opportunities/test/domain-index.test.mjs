import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import * as domain from '../domain/index.mjs'

const EXPECTED = [
  'CMS',
  'DEFAULT_CMS',
  'parseCms',
  'resolveCms',
  'assertPublicUrl',
  'fetchLimited',
  'geocode',
  'searchRestaurants',
  'crawlWebsite',
  'connectorsFor',
  'sniffMime',
  'sha256Hex',
  'classifyMedia',
  'dedupeCandidates',
  'brandFromSocial',
  'buildBrief',
  'validateBrief',
  'renderBriefMarkdown',
  'CONTRACT',
  'slotMap',
  'labelPicture',
  'nearCopies',
  'planPlacement',
  'outputSize',
  'searchPlacesText',
  'KINDS',
  'CUISINES',
  'kindOfPrimaryType',
  'markChains',
  'scoreOpportunity',
  'detectStack',
  'findSocialPages',
  'matchSocialPage',
  'searchPlaceOf',
  'scrapeCreatorsGoogleSearch'
]

test('index re-exports the whole contract API', () => {
  for (const name of EXPECTED) assert.ok(name in domain, name)
})

test('CONTRACT names the package, version 1 and its capabilities', () => {
  assert.equal(domain.CONTRACT.name, 'tracy-website-opportunities')
  assert.equal(domain.CONTRACT.version, 1)
  for (const cap of [
    'discovery.osm',
    'collect.website',
    'collect.facebook',
    'collect.instagram',
    'collect.tiktok',
    'collect.youtube',
    'brief.v1',
    'discovery.google-places.text',
    'score.opportunity.v1',
    'site.stack'
  ]) {
    assert.ok(domain.CONTRACT.capabilities.includes(cap), cap)
  }
  assert.ok(Object.isFrozen(domain.CONTRACT))
})

test('domain/ imports nothing outside itself and no npm package', () => {
  const dir = new URL('../domain/', import.meta.url)
  // Sub-folders (`pictures/`) included: the image copies the whole folder and nothing beside it.
  for (const file of readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.mjs'))) {
    const src = readFileSync(new URL(file, dir), 'utf8')
    for (const [, spec] of src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(spec.startsWith('./') || spec.startsWith('node:'), `${file} imports ${spec}`)
      assert.ok(!spec.includes('..'), `${file} imports ${spec}`)
    }
  }
})
