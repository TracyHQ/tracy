// The echo check of a writer's output (`owner-echo.mjs echoProblemsIn`, decision D46, #609): which written values copy
// the owner's statement, by field, rule and weight and never the text; what a public text says too is that text's.
// Invented massage studio; no model call.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-echo-writer.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { echoProblemsIn } from '../domain/owner-echo.mjs'
import { MASSAGE_STATEMENT } from './fixtures/owner-statement/massage-studio.mjs'

test('a value copying the owner is reported by field, rule and weight, never by text', () => {
  const values = {
    'pages[0].blocks[0].title': 'Strong hands for every runner',
    'pages[0].blocks[1].body': 'We are open seven days a week, so book any morning.',
    'pages[0].blocks[2].body': 'Mira Solent is our head therapist and founder since 2011.',
    'pages[1].blocks[0].title': 'Deep tissue sports massage',
    'pages[1].blocks[0].count': 3
  }
  const problems = echoProblemsIn(values, MASSAGE_STATEMENT)
  assert.deepEqual(problems, [
    { field: 'pages[0].blocks[1].body', rule: 'run', weight: 7 },
    { field: 'pages[0].blocks[2].body', rule: 'run', weight: 10 },
    { field: 'pages[1].blocks[0].title', rule: 'run', weight: 4 }
  ])
  assert.ok(problems.every((p) => Object.keys(p).join() === 'field,rule,weight'))
  // A name the plan's items hold (a service, a person) is a fact value: the caller passes those names as public
  // texts, so a title that is a service name stands while a sentence of the owner's does not.
  assert.deepEqual(
    echoProblemsIn(values, MASSAGE_STATEMENT, {
      publicTexts: ['Deep tissue sports massage', 'Mira Solent']
    }).map((p) => p.field),
    ['pages[0].blocks[1].body', 'pages[0].blocks[2].body']
  )
  // A list of pairs reads the same.
  assert.deepEqual(
    echoProblemsIn(
      Object.entries(values).map(([field, text]) => ({ field, text })),
      MASSAGE_STATEMENT
    ),
    problems
  )
})

test('a public text the writer may quote excuses its own words; no statement, no problem', () => {
  const values = { about: 'We are open seven days a week from 7am.' }
  assert.equal(echoProblemsIn(values, MASSAGE_STATEMENT).length, 1)
  assert.deepEqual(
    echoProblemsIn(values, MASSAGE_STATEMENT, { publicTexts: ['We are open seven days a week from 7am'] }),
    []
  )
  assert.deepEqual(echoProblemsIn(values, null), [])
  assert.deepEqual(echoProblemsIn(values, ''), [])
  assert.deepEqual(echoProblemsIn(null, MASSAGE_STATEMENT), [])
  assert.equal(echoProblemsIn(values, [MASSAGE_STATEMENT, 'Another owner quote']).length, 1)
})
