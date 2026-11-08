// What the brand gate refuses to read from a template kit: an empty site part is a problem, never a pass. JA Boxing's
// committed kit still feeds the gate; a T3 kit read through LESS variables gives its heading colour.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
  unwritable.site.logoSpots[0].setting = 'logoimage'
  assert.match(
    kitProblem(unwritable),
    new RegExp(`no frame to write them: ${unwritable.site.logoSpots[0].id}`)
  )
})

test('a T4 logo spot the site profile writes needs no frame', () => {
  // A demo that leaves site_logo empty has no siteSetting slot in its content map, yet the write step writes the key
  // through the site profile (logoWritePath via profile), so the brand step can read the kit.
  const kit = copy()
  for (const s of kit.site.logoSpots) if (String(s.setting ?? '').startsWith('site_logo')) s.frameId = null
  assert.equal(kitProblem(kit), null)
  const offcanvas = copy()
  offcanvas.site.logoSpots[0] = { ...offcanvas.site.logoSpots[0], frameId: null, where: 'offcanvas' }
  assert.equal(kitProblem(offcanvas), null)
  // A kit that keeps no T4 site profile (a WordPress copy without a Site Logo block) still needs the frame.
  kit.site.favicon.mechanism = { setting: 'option site_icon', value: null, fallback: null }
  assert.match(kitProblem(kit), /no frame to write them: logo-header-1/)
})

test("JA Voyara's committed 1.0.12 kit feeds the gate: its logo spots are written through site_logo", () => {
  const voyara = JSON.parse(
    readFileSync(
      new URL(
        '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-voyara/j6/1.0.12/template-kit.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  assert.deepEqual(
    voyara.site.logoSpots.map((s) => [s.setting, s.frameId]),
    [
      ['site_logo', null],
      ['site_logo', null]
    ]
  )
  assert.equal(kitProblem(voyara), null)
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
