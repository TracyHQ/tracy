// The write order carries the plan's dark theme accent (`look.accentDark`, #616): a logo with no hue is black on the
// light theme and white on the dark one, and the write step must see both. Invented values.
import assert from 'node:assert/strict'
import test from 'node:test'
import { lookOf } from '../domain/write-order-look.mjs'

const plan = { look: { accent: '#000000', accentDark: '#ffffff', logo: { kind: 'own', source: 'Website' } } }

test("the plan's look copied into the order keeps its dark theme accent", () => {
  assert.deepEqual(lookOf(undefined, plan, []), {
    accent: '#000000',
    accentFrom: null,
    logo: { kind: 'own', source: 'Website' },
    accentDark: '#ffffff'
  })
})

test("a look step value with the plan's accent gets the dark accent; another accent does not", () => {
  const same = lookOf({ accent: '#000000', accentFrom: 'brand', logo: { kind: 'text' } }, plan, [
    { kind: 'business.name', value: 'Harrow Lane Bakery' }
  ])
  assert.equal(same.accentDark, '#ffffff')
  assert.equal(same.logo.text, 'Harrow Lane Bakery')
  const other = lookOf({ accent: '#8a2c6c', accentFrom: 'brand', logo: { kind: 'text' } }, plan, [])
  assert.equal(other.accentDark, undefined)
})

test('a plan with one accent gives an order with one accent', () => {
  const look = lookOf(undefined, { look: { accent: '#8a2c6c', logo: { kind: 'text' } } }, [])
  assert.equal('accentDark' in look, false)
})
