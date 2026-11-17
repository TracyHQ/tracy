// The needs profile keeps what the brief decided (#575): a fact's confidence, onSite, decidedBy and reasons ride from
// the brief through `researchOf` to the merged fact, and a restaurant's dishes become typed offerings. Invented bistro.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-research-assessed.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { researchOf } from '../domain/needs-research.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'

const SITE = 'https://quillmoor-bistro.example/'
const brief = () => ({
  facts: [
    {
      id: 'f-phone',
      field: 'phone',
      value: '+1 555 0190 442',
      evidence: [{ source: 'website', ref: SITE }],
      confidence: 'corroborated',
      onSite: true,
      decidedBy: 'rule',
      reasons: ['matches-google']
    },
    {
      id: 'f-dish',
      field: 'menu',
      value: { name: 'Smoked leek tart', price: '14', currency: 'USD' },
      evidence: [{ source: 'website', ref: SITE, quote: 'Smoked leek tart $14' }],
      confidence: 'single-source',
      onSite: true,
      decidedBy: 'rule',
      reasons: []
    },
    {
      id: 'f-whatsapp',
      field: 'whatsapp',
      value: '+1 555 0190 443',
      evidence: [{ source: 'website', ref: SITE }],
      confidence: 'single-source',
      onSite: true,
      decidedBy: 'rule',
      reasons: []
    },
    {
      id: 'f-menu-link',
      field: 'menu',
      value: { url: `${SITE}menu.pdf` },
      evidence: [{ source: 'website', ref: SITE }],
      confidence: 'single-source',
      onSite: true,
      decidedBy: 'rule',
      reasons: []
    }
  ]
})

test("the brief's decision about a fact is the needs profile's, not a second count of sources", () => {
  const research = researchOf(brief())
  assert.deepEqual(research.assessed, [
    {
      kind: 'contact.phone',
      value: '+1 555 0190 442',
      fact: 'f-phone',
      confidence: 'corroborated',
      onSite: true,
      decidedBy: 'rule',
      reasons: ['matches-google']
    }
  ])
  const profile = needsProfileOf(research, {})
  const [phone] = profile.facts['contact.phone']
  // One source states it, yet the brief corroborated it with Google: the brief's word stands.
  assert.equal(phone.confidence, 'corroborated')
  assert.deepEqual(phone.assessment, {
    onSite: true,
    decidedBy: 'rule',
    reasons: ['matches-google'],
    fact: 'f-phone'
  })
})

test('a dish is a typed offering; a WhatsApp number and a menu link stay set aside with their reason', () => {
  const research = researchOf(brief())
  assert.deepEqual(research.taken.dishes, ['f-dish'])
  const website = research.sources.find((s) => s.id === 'website')
  assert.deepEqual(website.items, [
    {
      id: 'f-dish',
      kind: 'service',
      fields: { 'offering.name': 'Smoked leek tart', 'offering.price': '14' },
      evidence: 'Smoked leek tart $14'
    }
  ])
  const [dish] = needsProfileOf(research, {}).items.service
  assert.equal(dish.fields['offering.name'].value, 'Smoked leek tart')
  assert.equal(dish.fields['offering.price'].value, '14')
  const aside = research.setAside.filter((a) => a.what === 'fact').map((a) => a.id)
  assert.deepEqual(aside.sort(), ['f-menu-link', 'f-whatsapp'])
})

test('a research without decisions merges as before', () => {
  const plain = brief()
  for (const f of plain.facts) delete f.confidence
  const research = researchOf(plain)
  assert.equal(research.assessed, undefined)
  const [phone] = needsProfileOf(research, {}).facts['contact.phone']
  assert.equal(phone.confidence, 'single-source')
  assert.equal(phone.assessment, undefined)
})
