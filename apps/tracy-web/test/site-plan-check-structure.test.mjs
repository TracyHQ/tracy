// Site plan checker (ADR 0041), rules R00 to R09 and R11: one passing plan, and for each rule a copy of it that
// breaks exactly that rule. Inputs: the JA Boxing 1.0.10 kit and an invented brief (see _site-plan-check.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { base, breaks, decisionOf, keepHidingAll, kit } from './_site-plan-check.mjs'

test('the base plan passes every rule the script can check; R10h is left to a reviewer, R20 to a kit with page titles, R22 to a kit with row pairs, R26 to a plan with social rows; R23 and R24 pass on it', () => {
  assert.deepEqual(base().summary, { pass: 29, fail: 0, skip: 5 })
  assert.deepEqual(base().inputErrors, [])
})

test('R00 a field the Output shape does not have', () => {
  const r = breaks('R00', (p) => (p.extraNote = 'x'), /not in the spec's Output shape/)
  assert.equal(r.failures[0].where, '$.extraNote')
  assert.equal(r.cause, 'prompt')
})

test('R01 a copy slot id the kit does not give for the block', () => {
  breaks(
    'R01',
    (p) => decisionOf(p, 'block-176').copy.push({ slot: 'block-176.99', says: 'a note', basis: 'trade' }),
    /slot id not in the kit for this block/
  )
})

test('R02 a fact id that is not in the brief', () => {
  breaks('R02', (p) => (p.site.primaryAction.factIds = ['f-unknown']), /fact id f-unknown not in brief.facts/)
})

test('R03 a frame the kit marks canHide:false is hidden', () => {
  breaks(
    'R03',
    (p) => {
      const d = decisionOf(p, 'body-classes_advanced-boxing')
      d.pictures = d.pictures.filter((x) => x.frame !== 'article-16.5')
      d.hiddenSlots.push({ slot: 'article-16.5', why: 'no photo' })
    },
    /canHide:false but is in hiddenSlots/
  )
})

test('R04 a slug that is not lowercase words joined by hyphens', () => {
  breaks(
    'R04',
    (p) => (p.pages.find((x) => x.id === 'page-about-us').slug = 'About Us'),
    /is not lowercase words joined by hyphens/
  )
})

test('R05 a list whose rows disagree with its items', () => {
  breaks('R05', (p) => (decisionOf(p, 'block-190').lists[0].rows = 1), /rows is 1 but items has 2 entries/)
})

test('R06 a maxCharacters above the kit limit', () => {
  breaks(
    'R06',
    (p) => (decisionOf(p, 'block-176').copy[0].maxCharacters = 41),
    /plan maxCharacters 41 is above the kit limit 40/
  )
})

test('R07 a demo slot of a kept block is neither replaced nor hidden', () => {
  breaks(
    'R07',
    (p) => {
      const d = decisionOf(p, 'body-classes_advanced-boxing')
      d.hiddenSlots = d.hiddenSlots.filter((h) => h.slot !== 'article-16.3')
    },
    /demoOwned slot \(offering.description.*is neither replaced nor hidden/
  )
})

test('R08 a kept footer still shows the CMS notice', () => {
  breaks(
    'R08',
    (p) => {
      const i = p.sharedBlocks.findIndex((d) => d.block === 'block-168')
      p.sharedBlocks[i] = keepHidingAll(kit(), 'block-168')
    },
    /CMS notice "Joomla! is Free Software.*is not in hiddenSlots/
  )
})

test('R09 a language that is not a BCP 47 tag', () => {
  breaks('R09', (p) => (p.site.language = 'english'), /"english" is not a BCP 47 tag/)
})

test('R11 a form on a kept page that site.forms does not decide', () => {
  breaks(
    'R11',
    (p) => (p.site.forms = p.site.forms.filter((f) => f.block !== 'body-about-us_contact')),
    /contact form on a kept page is not decided in site.forms/
  )
})
