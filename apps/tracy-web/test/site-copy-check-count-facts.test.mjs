import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { brief, copy, kit, plan, slotOf } from './_site-copy-check.mjs'

function countCheck(text, fact, { cited = true, page = false } = {}) {
  const c = copy()
  const b = brief()
  b.facts.push({ id: 'f-count', field: 'story', value: fact, source: 'stated' })
  const slot = slotOf(c, 'block-2.2')
  slot.text = text
  slot.factIds = cited ? ['f-count'] : []
  if (page) {
    slot.text = 'Coached classes at the studio.'
    c.pages.find((p) => p.page === 'legal:privacy').body.push(text)
  }
  const before = structuredClone(c)
  const result = checkCopy({ copy: c, brief: b, kit: kit(), plan: plan() })
  assert.deepEqual(c, before)
  return result.rules.find((r) => r.id === 'W04')
}

test('W04 accepts a digit count backed by a cited standalone English number word', () => {
  assert.equal(countCheck('2', 'Classes at two Dubai studios.').status, 'pass')
  assert.equal(countCheck('2 studios', 'Classes at TWO Dubai studios.').status, 'pass')
  assert.equal(countCheck('18 coaches', 'Eighteen qualified coaches.').status, 'pass')
  assert.equal(countCheck('2 studios', 'Classes at two Dubai studios.', { page: true }).status, 'pass')
})

test('W04 keeps unsupported counts and uncited count facts out of writer copy', () => {
  assert.equal(countCheck('3 studios', 'Classes at two Dubai studios.').status, 'fail')
  assert.equal(countCheck('18 years old', 'Classes at two Dubai studios.', { page: true }).status, 'fail')
  assert.equal(countCheck('2 studios', 'Classes at two Dubai studios.', { cited: false }).status, 'fail')
})

test('W04 never takes part of a compound number or an address as a count word', () => {
  for (const fact of [
    'Twenty-two studios.',
    'One hundred and two studios.',
    'Two hundred studios.',
    'Two point five hours.',
    'Two and a half hours.',
    'Someone leads the classes.',
    'https://two.example/studios',
    'two@studio.example'
  ]) {
    assert.equal(countCheck('2 studios', fact).status, 'fail', fact)
  }
})

test('W04 number-word equivalence leaves decimals, times, phones and links exact', () => {
  for (const text of [
    '2.5 studios',
    '02 studios',
    '2,000 studios',
    'Classes at 2pm',
    'Call +2222222',
    'https://studio.example/2',
    'studio2@example.test'
  ]) {
    assert.equal(countCheck(text, 'Classes at two Dubai studios.').status, 'fail', text)
  }
})
