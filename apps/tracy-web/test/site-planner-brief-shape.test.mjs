// The site planner bench's brief shape check (ADR 0041, #301): a brief is refused before anything is queued unless
// it carries what the planner prompt reads, in the WO "brief-1" shape (facts with evidence) or the lean shape (facts
// with a source).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { briefShapeProblems } from '../src/site-planner/brief-shape.js'
import { brief } from './_site-plan-check-inputs.mjs'

test('the invented brief has the shape the planner reads', () => {
  assert.deepEqual(briefShapeProblems(brief()), [])
})

test('a brief-1 brief, facts carrying evidence, passes', () => {
  const b = {
    schema: 'brief-1',
    facts: [
      {
        id: 'f-name',
        field: 'name',
        value: 'Harbour Sport Club',
        evidence: [{ source: 'stated', quote: 'Harbour Sport Club' }]
      }
    ],
    missing: [{ field: 'email', why: 'not given' }],
    brand: { voice: 'warm' }
  }
  assert.deepEqual(briefShapeProblems(b), [])
})

test('what is not an object, or has no facts, is refused with the reason', () => {
  assert.deepEqual(briefShapeProblems(null), ['the brief is not a JSON object'])
  assert.deepEqual(briefShapeProblems([]), ['the brief is not a JSON object'])
  assert.deepEqual(briefShapeProblems({}), ['facts must be a non-empty list'])
  assert.deepEqual(briefShapeProblems({ facts: [] }), ['facts must be a non-empty list'])
})

test('each broken fact is named by its place in the list', () => {
  const b = brief()
  b.facts[1] = { field: 'phone', value: '1', source: 'stated' }
  b.facts[2] = { id: 'f-whatsapp', value: '1', source: 'stated' }
  b.facts[3] = { id: 'f-address', field: 'address', source: 'stated' }
  b.facts[4] = { id: 'f-tennis', field: 'services', value: 'Tennis' }
  b.facts[5] = { id: 'f-padel', field: 'services', value: 'Padel', evidence: [] }
  b.facts[6] = { id: 'f-name', field: 'services', value: 'Swim', source: 'stated' }
  b.facts[7] = 'not a fact'
  assert.deepEqual(briefShapeProblems(b), [
    'facts[1]: id must be a non-empty string',
    'facts[2]: field must be a non-empty string',
    'facts[3]: value is missing',
    'facts[4]: needs a source or a non-empty evidence list',
    'facts[5]: needs a source or a non-empty evidence list',
    'facts[6]: id "f-name" is used twice',
    'facts[7]: is not an object'
  ])
})

test('missing, when given, is a list of entries naming a field', () => {
  assert.deepEqual(briefShapeProblems({ ...brief(), missing: 'none' }), ['missing must be a list'])
  assert.deepEqual(briefShapeProblems({ ...brief(), missing: [{ why: 'x' }] }), [
    'missing[0]: field must be a non-empty string'
  ])
  const { missing, ...withoutMissing } = brief()
  assert.ok(missing)
  assert.deepEqual(briefShapeProblems(withoutMissing), [])
})

test('a long list of problems is cut to the first twenty', () => {
  const facts = Array.from({ length: 30 }, () => ({}))
  const problems = briefShapeProblems({ facts })
  assert.equal(problems.length, 21)
  assert.equal(problems.at(-1), '... and more')
})
