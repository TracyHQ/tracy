/**
 * /ops names a Refero system by its library name, not its id (Akemi, 15/10/2026: "Refero 5fd3b3b4"
 * must read "Figma"), in a finding's "on" list, inside rule messages and so in the pasted prompt.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { referoNames, withSystemNames } from '../src/lib/ds-system-names.js'

const FIGMA = '5fd3b3b4-02ab-456a-87aa-e4395636b671'

test('withSystemNames: every refero id inside every string becomes the name; an unknown id stays', () => {
  const names = new Map([[FIGMA, 'Figma']])
  const unknown = 'refero:00000000-0000-4000-8000-000000000000/dark 1'
  const road = [
    {
      step: 'design-system',
      params: {
        grade: 'C',
        passed: 3,
        mustFix: [
          {
            message: `hard lines on refero:${FIGMA}/light 1, Moxie/dark 2`,
            findings: [{ on: [`refero:${FIGMA}/light 1`, unknown] }]
          }
        ]
      }
    }
  ]
  const named = withSystemNames(road, names)
  assert.equal(named[0].params.mustFix[0].message, 'hard lines on Figma/light 1, Moxie/dark 2')
  assert.deepEqual(named[0].params.mustFix[0].findings[0].on, ['Figma/light 1', unknown])
  assert.equal(named[0].params.passed, 3, 'numbers are kept')
  assert.equal(road[0].params.mustFix[0].message.includes('refero:'), true, 'the input is not changed')
})

test('referoNames: the bundled library names the Figma system "Figma"', async () => {
  const names = await referoNames()
  assert.equal(names.get(FIGMA), 'Figma')
})
