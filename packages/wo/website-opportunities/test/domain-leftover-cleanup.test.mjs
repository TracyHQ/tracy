// Ticket #197: the cleanup turn's prompt carries only the check's findings, and the before/after comparison tells what
// the turn changed. Two made-up businesses of different trades prove the rules are not per case.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLEANUP_LIMITS,
  compareLeftovers,
  renderLeftoverCleanupPrompt,
  summarizeLeftovers
} from '../domain/leftover-cleanup.mjs'

const bakery = { business: { name: 'Mill Lane Bakery', phone: '555 0100', address: '3 Mill Lane' } }
const clinic = { business: { name: 'Ash Dental Clinic', email: 'hello@ash-dental.example' } }
const finding = (kind, page, place, found) => ({ kind, page, place, found })

test('the prompt lists each finding with kind, page, place and what to put instead, and no build task', () => {
  const text = renderLeftoverCleanupPrompt({
    leftovers: {
      findings: [
        finding('C17', '/contact', 'footer', '(555) 010-4477'),
        finding('C13', '/', 'header', 'logo.png')
      ]
    },
    brief: bakery
  })
  assert.match(
    text,
    /C17 .*\| page \/contact \| footer \| found "\(555\) 010-4477" \| instead: the owner's own value/
  )
  assert.match(text, /C13 .*\| page \/ \| header/)
  assert.match(text, /Never invent people, prices, numbers or facts/)
  assert.match(text, /at most 40 tool calls/)
  assert.match(text, /- name: "Mill Lane Bakery"/)
  assert.doesNotMatch(text, /Build the demo website|Site brief/)
})

test('the prompt states the replacement order for another trade and omits owner facts the brief lacks', () => {
  const text = renderLeftoverCleanupPrompt({
    leftovers: { findings: [finding('C07', '/team', 'team block', 'Dr Demo')] },
    brief: clinic,
    limits: { ...CLEANUP_LIMITS, toolCalls: 12 }
  })
  assert.match(text, /owner's own data[\s\S]*neutral substitute[\s\S]*hide the element/)
  assert.match(text, /at most 12 tool calls/)
  assert.match(text, /- email: "hello@ash-dental.example"/)
  assert.doesNotMatch(text, /- phone:/)
})

test('a long findings list is capped and counted', () => {
  const findings = Array.from({ length: 45 }, (_, i) => finding('C01', `/p${i}`, 'hero', 'x.jpg'))
  const text = renderLeftoverCleanupPrompt({ leftovers: { findings }, brief: bakery })
  assert.match(text, /and 5 more of the same kinds/)
})

test('compareLeftovers separates fixed, remaining, introduced and lost pages', () => {
  const a = finding('C01', '/', 'hero', 'a.jpg')
  const b = finding('C17', '/contact', 'footer', '555')
  const c = finding('C19', '/about', 'link', '/x')
  const before = { findings: [a, b], pages: ['/', '/contact', '/team'] }
  const after = { findings: [b, c], pages: ['/', '/contact'] }
  const diff = compareLeftovers(before, after)
  assert.deepEqual(diff.fixed, [a])
  assert.deepEqual(diff.remaining, [b])
  assert.deepEqual(diff.introduced, [c])
  assert.deepEqual(diff.pagesLost, ['/team'])
  assert.equal(summarizeLeftovers(before).total, 2)
})
