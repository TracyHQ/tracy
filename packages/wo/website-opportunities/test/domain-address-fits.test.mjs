// An address longer than its box is cut by whole parts from its most general end (COO rule 29/10/2026): the country
// first, then the state or emirate while the city stays; never inside a word. The whole address stays on the contact
// record and in the schema. Every address here is made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addressThatFits } from '../domain/contact-reading.mjs'
import { planSite } from '../domain/site-plan.mjs'

test('the country goes first, then the state while the city stays', () => {
  const uae = 'Palm Court 4 - Garden Quarter - Dubai - United Arab Emirates'
  assert.equal(addressThatFits(uae, 80), uae)
  assert.equal(addressThatFits(uae, 50), 'Palm Court 4 - Garden Quarter - Dubai')
  const uk = '12 Mill Lane, Bakerton, Kentshire, United Kingdom'
  assert.equal(addressThatFits(uk, 40), '12 Mill Lane, Bakerton, Kentshire')
  assert.equal(addressThatFits(uk, 30), '12 Mill Lane, Bakerton')
  // The city is never cut: with the city named, the part before it stays even when the box is smaller still.
  assert.equal(addressThatFits(uk, 20, { city: 'Bakerton' }), null)
  assert.equal(addressThatFits('Palm Court 4 - Dubai - United Arab Emirates', 19, { city: 'Dubai' }), null)
})

test('nothing is cut inside a word, and an address with no parts is kept or left out whole', () => {
  assert.equal(addressThatFits('12 Mill Lane Bakerton', 10), null)
  assert.equal(addressThatFits('12 Mill Lane', 60), '12 Mill Lane')
})

test('the plan writes the cut address in a short box and keeps the whole one as the contact fact', () => {
  const address = 'Palm Court 4 - Garden Quarter - Dubai - United Arab Emirates'
  const brief = { business: { name: 'Dune Padel', address } }
  const contentMap = {
    slots: [
      // The measured box wins over the field's own limit.
      {
        key: 'module-9.1',
        entity: 'module-9',
        type: 'text',
        role: 'contact.address',
        maxCharacters: 114,
        fit: { maxCharacters: 45 }
      },
      { key: 'module-9.2', entity: 'module-9', type: 'text', role: 'contact.address', maxCharacters: 90 }
    ]
  }
  const plan = planSite(brief, { questions: [] }, { contentMap, now: '2026-10-29T00:00:00Z' })
  const value = (key) => plan.slots.find((s) => s.key === key)?.value
  // Shown with commas between its parts (COO decision 30/10/2026).
  const shown = 'Palm Court 4, Garden Quarter, Dubai, United Arab Emirates'
  assert.equal(value('module-9.1'), 'Palm Court 4, Garden Quarter, Dubai')
  assert.equal(value('module-9.2'), shown)
  assert.equal(plan.contact.address.value, shown)
})
