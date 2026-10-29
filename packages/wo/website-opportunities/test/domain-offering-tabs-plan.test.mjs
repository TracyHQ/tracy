// Tabs bound to offerings show the brief's offerings, one per tab, named as given; a label goes with the value it labels
// (spec TracyHQ/tracy#189, round 9). Two made-up trades: a bakery and a dental clinic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planHonesty } from '../domain/site-plan-honesty.mjs'

const tab = (n, field, role, sample, max) => ({
  key: `module-9.tab.${field}.${n}`,
  entity: 'module-9',
  column: 'params',
  nestedJson: 'jatools-config',
  type: 'text',
  role,
  sample,
  maxCharacters: max,
  jsonPath: ['tabs', `tabs[${field}]`, n],
  group: { id: `module-9.step.${n}`, item: n, kind: 'step', presentation: 'offering-tabs' }
})

/** A row with a mailbox and a phone, each behind its own label. */
const bookingRow = (n) => {
  const g = { id: `module-12.item.${n}`, item: n, kind: 'service' }
  const at = (field, role, sample) => ({
    key: `module-12.${field}.${n}`,
    entity: 'module-12',
    column: 'params',
    nestedJson: 'jatools-config',
    type: 'text',
    role,
    sample,
    maxCharacters: 60,
    jsonPath: ['rows', `rows[${field}]`, n],
    group: g
  })
  return [
    at('title', 'offering.name', `Demo row ${n}`),
    { ...at('email-label', 'editorial.paragraph', 'Email us:'), labelOf: `module-12.email.${n}` },
    at('email', 'contact.email', 'demo@example.invalid'),
    { ...at('phone-label', 'editorial.paragraph', 'or call:'), labelOf: `module-12.phone.${n}` },
    at('phone', 'contact.phone', '(000) 555-0100')
  ]
}

const briefOf = (names) => ({
  reading: { services: names.map((label, i) => ({ id: `svc-${i}`, label })) }
})

for (const [trade, names] of [
  ['bakery', ['Sourdough', 'Rye loaf', 'Croissants', 'Celebration cakes']],
  ['dental clinic', ['Checkups', 'Cleaning', 'Whitening', 'Orthodontic braces']]
]) {
  const map = (tabs, widths) => ({
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'module-9', kind: 'module' }, { key: 'module-12', kind: 'module' }],
    slots: [
      ...Array.from({ length: tabs }, (_, n) => [
        tab(n, 'title', 'step.title', `Demo stage ${n}`, widths[n] ?? 30),
        tab(n, 'desc', 'step.description', 'Demo words.', 400)
      ]).flat(),
      ...bookingRow(0)
    ]
  })

  test(`${trade}: four tabs show the four offerings in the brief's order, each named as given`, () => {
    const { honesty } = planHonesty(briefOf(names), map(4, [30, 30, 30, 30]))
    assert.deepEqual(
      [0, 1, 2, 3].map((n) => honesty.values[`module-9.tab.title.${n}`]?.value),
      names
    )
    assert.deepEqual(
      [0, 1, 2, 3].map((n) => honesty.cardNames[`module-9.step.${n}`]),
      names
    )
  })

  test(`${trade}: a tab beyond the offerings is taken off; offerings beyond the tabs stay out of the block`, () => {
    const few = planHonesty(briefOf(names.slice(0, 2)), map(3, [])).honesty
    assert.deepEqual(
      few.records.filter((r) => r.kind === 'step').map((r) => r.decision),
      ['keep', 'keep', 'hide']
    )
    const many = planHonesty(briefOf(names), map(2, [])).honesty
    assert.deepEqual(
      many.records.filter((r) => r.kind === 'step').map((r) => r.assigned?.label),
      names.slice(0, 2)
    )
  })

  test(`${trade}: a mailbox the brief does not hold takes its label with it; the phone keeps its own`, () => {
    const { honesty } = planHonesty(briefOf(names), map(0, []), {
      contact: { phone: { value: '+1 000 555 0199' } }
    })
    const blanked = honesty.blanks.map((b) => b.key)
    assert.ok(blanked.includes('module-12.email.0'))
    assert.ok(blanked.includes('module-12.email-label.0'))
    assert.ok(!blanked.includes('module-12.phone-label.0'))
  })
}
