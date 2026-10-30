import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buttonActionValues } from '../src/sites/brief-engines/button-action-values.js'
import { heroSlotValues } from '../src/sites/brief-engines/hero-lines.js'

const sitePlan = {
  slots: [
    {
      key: 'button.label',
      decision: 'value',
      value: 'Order a cake',
      valueType: 'text',
      reason: 'button-action'
    },
    {
      key: 'button.url',
      decision: 'value',
      value: 'https://wa.me/441234567890',
      valueType: 'url',
      reason: 'button-action'
    }
  ]
}

test('a declared URL is enforced in every site language independently of its words', () => {
  assert.deepEqual(heroSlotValues(sitePlan, 'de-DE'), { 'button.url': 'https://wa.me/441234567890' })
})

test('declared button words use the ordinary translation door while the channel URL stays exact', async () => {
  const calls = []
  const values = await buttonActionValues({
    sitePlan,
    locale: 'de-DE',
    model: {
      chat: async ({ messages }) => {
        const input = JSON.parse(messages[1].content)
        calls.push(input)
        return JSON.stringify(input.map(({ i }) => ({ i, text: 'Kuchen bestellen' })))
      }
    }
  })
  assert.equal(values['button.label'], 'Kuchen bestellen')
  assert.equal(values['button.url'], sitePlan.slots[1].value)
  assert.equal(
    calls.flat().some((s) => s.text.includes('wa.me')),
    false
  )
})

test('an unavailable action translation is a recorded blocker: the words are left to the writer, the URL stays', async () => {
  const notes = []
  const values = await buttonActionValues({ sitePlan, locale: 'de-DE', note: (l) => notes.push(l) })
  assert.deepEqual(values, { 'button.url': sitePlan.slots[1].value })
  assert.equal(notes.filter((l) => l.startsWith('BLOCKER button action button.label')).length, 1)
})

test('a canonical action longer than its measured slot is never truncated: it is recorded and left out', async () => {
  const notes = []
  const values = await buttonActionValues({
    sitePlan: { slots: [{ ...sitePlan.slots[0], value: 'Book an appointment' }] },
    slots: [{ key: 'button.label', maxCharacters: 17 }],
    note: (l) => notes.push(l)
  })
  assert.deepEqual(values, {})
  assert.match(notes[0], /does-not-fit/)
})

test('the measured box constrains an action even when the raw contract allows longer text', async () => {
  const values = await buttonActionValues({
    sitePlan: { slots: [{ ...sitePlan.slots[0], value: 'Book an appointment' }] },
    slots: [
      { key: 'button.label', type: 'text', maxCharacters: 40, fit: { measured: true, maxCharacters: 17 } }
    ]
  })
  assert.deepEqual(values, {})
})
