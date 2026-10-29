// A site that does not answer is never clean (spec TracyHQ/tracy#189): pages that fail carry no demo words, so the old check
// reported 0 in every kind for a broken site. Two made-up trades: a bakery and a dental clinic.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDemoLeftovers } from '../domain/demo-leftovers.mjs'
import { renderLeftoverCleanupPrompt, summarizeLeftovers } from '../domain/leftover-cleanup.mjs'

test('the domain check fails whenever it is told a kept page was not served, with no findings at all', () => {
  const clean = checkDemoLeftovers({ pages: [], contentMap: { slots: [] }, brief: {}, broken: [] })
  assert.equal(clean.pass, true)
  const broken = checkDemoLeftovers({
    pages: [],
    contentMap: { slots: [] },
    brief: {},
    broken: [{ path: '/', status: 500, why: 'the page answered 500' }]
  })
  assert.equal(broken.pass, false)
  assert.equal(broken.findings.length, 0)
  assert.equal(broken.broken.length, 1)
})

test('the cleanup turn is told which kept pages do not answer, first', () => {
  const report = { findings: [], broken: [{ path: '/menu', why: 'the page answered 500' }], pages: [] }
  const prompt = renderLeftoverCleanupPrompt({ leftovers: report })
  assert.match(prompt, /not fully served[\s\S]*\/menu \| the page answered 500/)
  assert.deepEqual(summarizeLeftovers(report).broken, report.broken)
})
