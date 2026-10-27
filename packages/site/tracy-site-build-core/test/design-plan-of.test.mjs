import assert from 'node:assert/strict'
import { test } from 'node:test'
import { designPlanOf } from '../src/host/host.ts'

// Measured 23/09/2026 on `j-pimdem` (ja-kinetic, stand local): the press carried
// `multilingual: false`, and the job did not — this door re-picks the plan field by field and
// the flag was not one of them, so the one-language build silently took the multilingual road and
// the `language` stage failed with "This quickstart contract carries no multilingual profile".
test('a one-language design keeps its flag through the build door', () => {
  const card = {
    requestedDesign: 'ja-kinetic',
    effectiveDesign: 'ja-kinetic',
    workflow: 'template',
    fallback: false,
    multilingual: false
  }
  assert.equal(designPlanOf(card)?.multilingual, false)
  const sealed = { ...card, workflow: undefined, contractProfile: 'ja-kinetic/j6/1.0.0' }
  assert.equal(designPlanOf(sealed)?.multilingual, false)
})

test('any other value of the flag is not repeated', () => {
  const plan = {
    requestedDesign: 'apple',
    effectiveDesign: 'apple',
    contractProfile: 'tracy-apple/j6/1.2.0',
    fallback: false
  }
  for (const multilingual of [undefined, true, 'false', 0])
    assert.equal('multilingual' in designPlanOf({ ...plan, multilingual }), false)
})

// The design system a site wears (Lee, 29/09/2026): the plan carries it from the sealing profile
// (template road) or the registry (Joomla design road) so the build can write it into the site
// folder. `null` is an answer — this quickstart wears none the catalogue can name — and travels;
// a value of another shape is dropped, never repaired into a binding.
test('the design a plan names travels through the build door, null included', () => {
  const plan = {
    requestedDesign: 'tracy-apple',
    effectiveDesign: 'tracy-apple',
    workflow: 'template',
    fallback: false
  }
  assert.deepEqual(designPlanOf({ ...plan, design: { id: 'apple', source: 'catalog' } })?.design, {
    id: 'apple',
    source: 'catalog'
  })
  assert.equal(designPlanOf({ ...plan, design: null })?.design, null)
  for (const design of [undefined, 'apple', { id: 'apple' }, { id: 'Apple Inc', source: 'catalog' }, 7])
    assert.equal('design' in designPlanOf({ ...plan, design }), false, `dropped: ${JSON.stringify(design)}`)
})

// A quickstart wearing its OWN look (Tracy Business, 29/09/2026): no catalogue holds it, and no
// image carries its theme's token file, so the plan carries the name and the resolved tokens the
// sealing profile wrote. Half of one — no tokens, a token that is not a string — is dropped.
test('a quickstart look travels with its name and tokens; half of one is dropped', () => {
  const plan = {
    requestedDesign: 'tracy-business',
    effectiveDesign: 'tracy-business',
    contractProfile: 'tracy-business/wp7/1.2.0',
    fallback: false
  }
  const worn = {
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    tokensFrom: 'packages/cms/tracy-wordpress-theme/overlays/wp-tracy-business/tokens.css',
    tokens: { '--bg': '#F5F3EE', '--accent': '#14483A' }
  }
  assert.deepEqual(designPlanOf({ ...plan, design: worn })?.design, worn)
  const many = Object.fromEntries(Array.from({ length: 121 }, (_, i) => [`--t${i}`, '1px']))
  for (const design of [
    { ...worn, tokens: undefined },
    { ...worn, tokens: {} },
    { ...worn, tokens: { '--bg': 7 } },
    { ...worn, tokens: { bg: '#fff' } },
    { ...worn, tokens: many },
    { ...worn, name: '' },
    { ...worn, source: 'theme' }
  ])
    assert.equal(
      'design' in designPlanOf({ ...plan, design }),
      false,
      `dropped: ${JSON.stringify(design).slice(0, 80)}`
    )
})

// A brand press (30/09/2026): tracy-web answers `brand:<host>` on WordPress with a plan of its own
// (`apps/tracy-web/src/sites/brand-plan.js`) — no profile seals it, and the id carries a `:`. The
// door dropped the whole plan for that colon, so a brand build kept no plan at all. The host is held
// to the brand engine's `SAFE_HOST` because it becomes a path (`Brand/<host>/`) downstream.
test('a brand plan travels with its workflow and design; an unsafe host drops it', () => {
  const plan = {
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
  }
  assert.deepEqual(designPlanOf(plan), {
    requestedDesign: 'brand:basecamp.com',
    effectiveDesign: 'brand:basecamp.com',
    contractProfile: null,
    fallback: false,
    workflow: 'brand',
    design: { id: 'brand:basecamp.com', source: 'brand' }
  })
  for (const host of ['../etc', 'Basecamp.com', 'localhost', '10.0.0.1', 'a/b.com', 'basecamp.com/'])
    assert.equal(
      designPlanOf({ ...plan, requestedDesign: `brand:${host}`, effectiveDesign: `brand:${host}` }),
      undefined,
      `dropped: brand:${host}`
    )
  // A brand design that is not the one the plan names, or a brand id on a non-brand road, is dropped.
  assert.equal(
    'design' in designPlanOf({ ...plan, design: { id: 'brand:other.com', source: 'brand' } }),
    false
  )
  assert.equal(designPlanOf({ ...plan, workflow: 'template' }), undefined)
  // A brand plan names no profile; one that does is not a brand plan this door repeats.
  assert.equal(designPlanOf({ ...plan, contractProfile: 'tracy-apple/wp7/1.0.0' }), undefined)
})
