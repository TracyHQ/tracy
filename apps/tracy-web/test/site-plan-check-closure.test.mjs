// Site plan checker (ADR 0041), rules R10a to R10h: one passing plan, and for each rule a copy of it that breaks
// exactly that rule. Inputs: the JA Boxing 1.0.10 kit and an invented brief (see _site-plan-check.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { base, breaks, brief, decisionOf, kit, plan, ruleOf } from './_site-plan-check.mjs'

test('R10a a kit page group the plan does not decide', () => {
  breaks(
    'R10a',
    (p) => (p.pageGroups = p.pageGroups.filter((g) => g.id !== 'group-plans')),
    /appears 0 times in plan.pageGroups, expected once/
  )
})

test('R10b a link of a kept block that is neither decided nor hidden', () => {
  breaks(
    'R10b',
    (p) => {
      const d = decisionOf(p, 'body-about-us_contact')
      d.hiddenSlots = d.hiddenSlots.filter((h) => h.slot !== 'body-about-us_contact.link-1')
    },
    /link is neither in links nor in hiddenSlots/
  )
})

// The header call button is tied to a label slot owned by another block (block-157.23, shared with block-190,
// whose own button keeps using it), and the plan hides the header button.
function hiddenLinkWithSharedLabel({ ownerLinkHidden }) {
  const k = kit()
  k.blocks.find((b) => b.id === 'block-176').links[0].labelId = 'block-157.23'
  const p = plan()
  const header = decisionOf(p, 'block-176')
  header.links = []
  header.hiddenSlots.push({ slot: 'block-176.link-1', why: 'the button cannot open anything' })
  if (ownerLinkHidden) {
    const items = decisionOf(p, 'block-190')
    items.links = []
    items.hiddenSlots.push({ slot: 'block-190.link-1', why: 'the button cannot open anything' })
  }
  return checkPlan({ plan: p, kit: k, brief: brief() }).rules.find((r) => r.id === 'R10b')
}

test('R10b a hidden link may share a label slot another block owns while a kept link still uses it', () => {
  const r = hiddenLinkWithSharedLabel({ ownerLinkHidden: false })
  assert.equal(r.status, 'pass', r.failures.map((f) => f.detail).join('\n'))
})

test('R10b a hidden link still fails when every link using the shared label slot is hidden', () => {
  const r = hiddenLinkWithSharedLabel({ ownerLinkHidden: true })
  assert.equal(r.status, 'fail')
  const details = r.failures.map((f) => f.detail)
  assert.ok(details.some((d) => /link is hidden but its label slot block-157.23 is still written/.test(d)))
  assert.equal(r.failures.filter((f) => f.where.includes('block-176.link-1')).length, 1)
})

test('R10c a picture wish on a twin frame', () => {
  breaks(
    'R10c',
    (p) =>
      decisionOf(p, 'body-about-us_contact').pictures.push({
        frame: 'body-about-us_contact.picture-1',
        kind: 'photo',
        match: 'any-real',
        size: 'wide'
      }),
    /twin of block-162.picture-1; it must follow the twin/
  )
})

test('R10d a not-found page that leads to a dropped page', () => {
  breaks(
    'R10d',
    (p) => (p.site.notFound.leadsTo = ['page-plans']),
    /page page-plans is dropped or not in plan.pages/
  )
})

test('R10e a kept page that no footer column lists', () => {
  breaks(
    'R10e',
    (p) => (p.site.footerMenu[1].pages = p.site.footerMenu[1].pages.filter((x) => x !== 'page-about-us')),
    /kept page appears in 0 footer columns, expected exactly one/
  )
})

test('R10f a trade line that states a number without a brief fact', () => {
  breaks(
    'R10f',
    (p) =>
      decisionOf(p, 'block-190').copy.push({
        slot: 'block-190.20',
        says: 'lessons 7 days a week',
        basis: 'trade',
        maxCharacters: 42
      }),
    /trade line must cite the activity fact/
  )
})

test('R10g a slot hidden twice in one block', () => {
  breaks(
    'R10g',
    (p) => decisionOf(p, 'body-about-us_contact').hiddenSlots.push({ slot: 'contact-1.1', why: 'again' }),
    /hidden slot contact-1.1 appears 2 times/
  )
})

test('R10h is always left to a reviewer, with its judgement items listed', () => {
  const before = base().rules.find((r) => r.id === 'R10h')
  const p = plan()
  p.site.notFound.says = ''
  const after = ruleOf(p, 'R10h')
  for (const r of [before, after]) {
    assert.equal(r.status, 'skip')
    assert.equal(r.notes[0], 'needs a reviewer, not a script')
    assert.equal(r.notes.filter((n) => n.startsWith('judgement: ')).length, 13)
  }
})
