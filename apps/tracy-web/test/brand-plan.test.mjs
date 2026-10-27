/**
 * What a `brand:<host>` press builds (ADR 0023, brand on WordPress). Pure: the cards are the rows
 * `templateCards` answers, so the same rule the Design inspiration button reads decides here too.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BRAND_BUILDS, brandHostOf, brandPlan } from '../src/sites/brand-plan.js'

/** A WordPress card wearing a catalogue system — the one kind that can wear a brand. */
const wears = [
  { id: 'tracy-base', platforms: [{ platform: 'wordpress' }], design: { id: 'apple', source: 'catalog' } }
]

test('a brand id names a host only when it is a real hostname', () => {
  assert.equal(brandHostOf('brand:basecamp.com'), 'basecamp.com')
  assert.equal(brandHostOf('brand:shop.acme.example'), 'shop.acme.example')
  for (const bad of [
    'basecamp.com',
    'brand:',
    'brand:../etc',
    'brand:a/b.com',
    'brand:basecamp..com',
    'brand:-x.com',
    'brand:localhost',
    'brand:10.0.0.1',
    'brand:BaseCamp.com',
    `brand:${'a'.repeat(64)}.com`,
    42,
    null
  ])
    assert.equal(brandHostOf(/** @type {any} */ (bad)), null, String(bad))
})

test('a brand on WordPress is built on the released tracy theme, and the plan names the brand', () => {
  assert.deepEqual(BRAND_BUILDS, ['wordpress'])
  const answer = brandPlan('brand:basecamp.com', 'wordpress', wears)
  assert.ok(answer && 'plan' in answer)
  assert.deepEqual(answer.plan, {
    requestedDesign: 'brand:basecamp.com',
    effectiveDesign: 'brand:basecamp.com',
    effectiveDesignName: 'basecamp.com',
    baseQuickstart: null,
    contractProfile: null,
    workflow: 'brand',
    theme: 'tracy',
    fallback: false,
    registryRevision: 'brand',
    design: { id: 'brand:basecamp.com', source: 'brand' }
  })
})

test('a brand id that names no safe host is unknown, never a path', () => {
  assert.deepEqual(brandPlan('brand:../../etc', 'wordpress', wears), { refused: 'UNKNOWN_DESIGN' })
})

test('WordPress with no template that can wear a brand refuses, as the greyed button says', () => {
  const ownLook = [
    {
      id: 'tracy-business',
      platforms: [{ platform: 'wordpress' }],
      design: { id: 'tracy-business', source: 'quickstart' }
    }
  ]
  assert.deepEqual(brandPlan('brand:basecamp.com', 'wordpress', ownLook), { refused: 'UNSUPPORTED_DESIGN' })
  assert.deepEqual(brandPlan('brand:basecamp.com', 'wordpress', []), { refused: 'UNSUPPORTED_DESIGN' })
  // A catalogue card on another CMS lights nothing on WordPress.
  const joomlaOnly = [
    { id: 'tracy-base', platforms: [{ platform: 'joomla' }], design: { id: 'apple', source: 'catalog' } }
  ]
  assert.deepEqual(brandPlan('brand:basecamp.com', 'wordpress', joomlaOnly), {
    refused: 'UNSUPPORTED_DESIGN'
  })
})

test('not a brand, or a CMS whose build cannot wear one: this module says nothing', () => {
  assert.equal(brandPlan('apple', 'wordpress', wears), null)
  assert.equal(brandPlan(undefined, 'wordpress', wears), null)
  assert.equal(brandPlan('brand:basecamp.com', 'joomla', wears), null)
  assert.equal(brandPlan('brand:basecamp.com', 'emdash', wears), null)
})
