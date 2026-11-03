// What the brand gate refuses to read from a template kit: an empty site part is a problem, never a pass. JA Boxing's
// committed kit still feeds the gate; a T3 kit read through LESS variables gives its heading colour.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { kitProblem, sideText } from '../src/brand-step/kit-grounds.js'
import { KIT } from './_brand-tool-fixtures.mjs'

const copy = () => structuredClone(KIT)

test("JA Boxing's committed kit feeds the gate", () => {
  assert.equal(kitProblem(KIT), null)
})

test('an empty site part is a problem', () => {
  const noTokens = copy()
  noTokens.site.brandColours.tokens = []
  assert.match(kitProblem(noTokens), /brandColours/)
  const noSides = copy()
  noSides.site.brandColours.sides = []
  assert.match(kitProblem(noSides), /brandColours/)
  const noNames = copy()
  noNames.site.nameSlots = []
  assert.match(kitProblem(noNames), /nameSlots/)
  const unwritable = copy()
  unwritable.site.logoSpots[0].frameId = null
  assert.match(
    kitProblem(unwritable),
    new RegExp(`no frame to write them: ${unwritable.site.logoSpots[0].id}`)
  )
})

test('a logo spot the page never shows may have no frame', () => {
  const kit = copy()
  kit.site.logoSpots.push({ ...kit.site.logoSpots[0], id: 'logo-other-9', frameId: null, shownIn: [] })
  assert.equal(kitProblem(kit), null)
})

test('a T3 kit: the heading colour is the LESS variable the kit read', () => {
  const kit = copy()
  kit.site.brandColours.opensOn = { markers: [], ground: '#ffffff' }
  kit.site.brandColours.tokens = [
    {
      name: '@brand-primary',
      value: '#2e8b57',
      side: 'base',
      declaredIn: 'templates/demo_t3/less/variables.less'
    },
    {
      name: '@headings-color',
      value: '#1a1a1a',
      side: 'base',
      declaredIn: 'templates/demo_t3/less/variables.less'
    }
  ]
  assert.deepEqual(sideText(kit), { dark: '#ffffff', light: '#1a1a1a', opens: 'light' })
})
