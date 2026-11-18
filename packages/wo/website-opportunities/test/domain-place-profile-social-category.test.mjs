// Replay the structured Facebook Cafe category from the dev Arabian Tea House profile, never biography keywords.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'

const row = (category, source = 'facebook', extra = {}) => ({
  source,
  ref:
    source === 'facebook'
      ? 'https://www.facebook.com/ArabianTeaHouse'
      : 'https://instagram.com/arabianteahouse/',
  status: 'complete',
  collected: { profile: { category } },
  ...extra
})
const read = (input) => {
  const doc = placeProfileFromResearch(input)
  assert.deepEqual(validatePlaceProfile(doc), { ok: true, errors: [] })
  return {
    doc,
    classification: doc.classification.derivedCategories.find(
      (fact) => fact.value.taxonomy === 'tracy-trade'
    ),
    menu: doc.coverage.find((entry) => entry.target === 'menu')
  }
}

test('the collected Facebook Cafe category maps to food with its actual evidence and leaves an unattempted menu not researched', () => {
  const { doc, classification, menu } = read({
    identity: { provider: 'url', providerId: 'https://arabianteahouse.com/' },
    profile: { name: 'Arabian Tea House' },
    sources: [row('Cafe')]
  })
  assert.equal(classification.value.code, 'food')
  assert.equal(classification.value.mappingVersion, 'tracy-trade/2')
  const category = doc.classification.providerCategories.find((fact) => fact.value.category === 'Cafe')
  assert.ok(category)
  assert.ok(classification.derivation.inputRefs.includes(category.id))
  assert.ok(category.evidenceRefs.every((ref) => classification.evidenceRefs.includes(ref)))
  assert.equal(menu.status, 'not_researched')
  assert.deepEqual(menu.sourceRefs, [], 'no menu collector call or result was invented')
})

test('authoritative Google and schema trades retain precedence over a social category', () => {
  for (const [profile, category, expected] of [
    [{ googlePlace: { primaryType: 'gym' } }, 'Cafe', 'fitness'],
    [{ businessType: 'Dentist' }, 'Cafe', 'health'],
    [{ businessType: 'Restaurant' }, 'Gym', 'food']
  ]) {
    const { classification, menu } = read({ profile, sources: [row(category)] })
    assert.equal(classification.value.code, expected)
    assert.equal(menu.status, expected === 'food' ? 'not_researched' : 'not_applicable')
  }
})

test('conflicting or unmapped social categories stay unknown and cannot prove a menu does not apply', () => {
  for (const sources of [[row('Cafe'), row('Gym', 'instagram')], [row('Unmapped category')], []]) {
    const { classification, menu } = read({ profile: { bio: 'Restaurant menu and food stories' }, sources })
    assert.equal(classification.value.code, 'other')
    assert.equal(menu.status, 'not_researched')
  }
})

test('known non-food social categories remain non-food and blocked or third-party categories cannot classify', () => {
  const gym = read({ sources: [row('Gym')] })
  assert.equal(gym.classification.value.code, 'fitness')
  assert.equal(gym.menu.status, 'not_applicable')
  for (const source of [row('Cafe', 'facebook', { status: 'blocked' }), row('Cafe', 'listing')]) {
    const { classification, menu } = read({ sources: [source] })
    assert.equal(classification.value.code, 'other')
    assert.equal(menu.status, 'not_researched')
  }
})

test('a real menu attempt keeps its measured outcome even while the business trade is unknown', () => {
  for (const [status, expected] of [
    ['complete', 'searched_not_found'],
    ['failed', 'failed'],
    ['blocked', 'blocked']
  ]) {
    const { menu } = read({ sources: [{ source: 'menu-file', status }] })
    assert.equal(menu.status, expected)
  }
})
