// Site plan checker (ADR 0041), rules R12 to R19, the fix-round failure list and missing inputs: one passing plan,
// and for each rule a copy of it that breaks exactly that rule. Inputs: the JA Boxing 1.0.10 kit and an invented
// brief (see _site-plan-check.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlan, failureListText } from '../src/site-planner/plan-check/check-plan.js'
import { RULE_TITLES } from '../src/site-planner/plan-check/rule-set.js'
import { base, breaks, check, decisionOf, plan, ruleOf } from './_site-plan-check.mjs'

const MAP_BUTTON = 'body-about-us_contact.button-1'

test('R12 a block names a phone call but links elsewhere', () => {
  breaks(
    'R12',
    (p) => (decisionOf(p, 'block-176').links[0].leadsTo = 'page-about-us_contact'),
    /names a phone channel .* but the block has no link leading to phone:<factId>/
  )
})

test('R12 skips a contact setting slot even when its copy says phone', () => {
  const p = plan()
  const d = decisionOf(p, 'block-176')
  d.links[0].leadsTo = 'page-about-us_contact'
  d.copy[0].slot = 'contact-1.mobile'
  d.copy[0].says = 'the phone number'
  const r = ruleOf(p, 'R12')
  // Nothing was left to check on this block, so the rule skips; the point is that it does not fail.
  assert.notEqual(r.status, 'fail')
  assert.equal(r.failures.length, 0)
})

// The two class-page notes reproduce the normal WO planner's generic CTA false positives.
function ctaRule({
  says = 'closing call to action: book an assessment',
  text = 'Book an assessment',
  phoneLink = false
} = {}) {
  const p = plan()
  for (const block of ['body-classes_group-boxing', 'body-classes_advanced-boxing']) {
    p.pages = p.pages.filter((page) => page.id !== block.replace(/^body-/, 'page-'))
    p.pages.push({
      id: block.replace(/^body-/, 'page-'),
      decision: 'keep',
      blocks: [
        {
          block,
          decision: 'keep',
          copy: [{ slot: 'languageString-76896395.0', says, text }],
          links: phoneLink ? [{ link: 'diagnostic-phone-link', leadsTo: 'phone:f-phone' }] : []
        }
      ]
    })
  }
  return ruleOf(p, 'R12')
}

test('R12 generic call-to-action notes on two class pages do not promise a phone channel', () => {
  const result = ctaRule()
  assert.equal(result.failures.length, 0)
})

test('R12 generic CTA wording is ignored in notes and labels regardless of case or hyphenation', () => {
  const result = ctaRule({ says: 'Closing CALL-TO-ACTION', text: 'Call to action: book a visit' })
  assert.equal(result.failures.length, 0)
})

test('R12 generic CTA wording does not conceal a real phone promise in the same note or label', () => {
  for (const content of [
    { says: 'call to action: call +971 555 0100', text: 'Book now' },
    { says: 'call to action: book a visit', text: 'Call us' },
    { says: 'call-to-action by phone', text: 'Book now' },
    { says: 'call to action: ring us', text: 'Book now' }
  ]) {
    const result = ctaRule(content)
    assert.equal(result.failures.length, 2, JSON.stringify(content))
    assert.ok(result.failures.every((failure) => failure.detail.includes('names a phone channel')))
  }
})

test('R12 real phone promises still pass with a phone target, while WhatsApp and DM requirements remain', () => {
  assert.equal(ctaRule({ says: 'call to action: call us', phoneLink: true }).failures.length, 0)
  for (const channel of ['WhatsApp', 'DM us']) {
    const result = ctaRule({ says: `call to action: ${channel}` })
    assert.equal(result.failures.length, 2)
    assert.ok(result.failures.every((failure) => !failure.detail.includes('names a phone channel')))
  }
})

test('R13 a link that leads to the page it is shown on', () => {
  breaks(
    'R13',
    (p) => (decisionOf(p, 'block-190').links[0].leadsTo = 'page-about-us'),
    /link leads to page-about-us, the page it is shown on/
  )
})

test('R14 a picture wish whose kind differs from the kit frame kind', () => {
  breaks(
    'R14',
    (p) => (decisionOf(p, 'block-190').lists[0].items[0].pictures[0].kind = 'photo'),
    /wish kind "photo" differs from the kit frame kind "icon"/
  )
})

test('R15 a picture wish that offers alternatives', () => {
  breaks(
    'R15',
    (p) => (decisionOf(p, 'block-190').lists[0].items[0].pictures[0].shows = 'a racket or a ball'),
    /shows offers alternatives, pick one subject/
  )
})

test('R16 a row line that cites a fact about the whole business', () => {
  breaks(
    'R16',
    (p) => (decisionOf(p, 'block-163').lists[0].items[1].copy[1].factIds = ['f-story']),
    /cites facts outside the row's own name line: f-story \(story\)/
  )
})

test('R17 a picture in a person row that is not matched as a person', () => {
  breaks(
    'R17',
    (p) => (decisionOf(p, 'block-163').lists[0].items[0].pictures[0].match = 'any-real'),
    /picture in a person row must have match "person"/
  )
})

test('R18 two full wishes for frames that show the same picture', () => {
  breaks(
    'R18',
    (p) => {
      const wish = decisionOf(p, 'body-classes_advanced-boxing').pictures.find(
        (x) => x.frame === 'article-16.11'
      )
      delete wish.sameAs
      Object.assign(wish, { match: 'any-real', size: 'wide' })
    },
    /2 full picture wishes for frames that show the same picture/
  )
})

test('R19 a map button hidden while the brief has an address', () => {
  breaks(
    'R19',
    (p) => {
      const d = decisionOf(p, 'body-about-us_contact')
      d.links = []
      d.copy = []
      d.hiddenSlots.push({ slot: MAP_BUTTON, why: 'no map' })
    },
    /map button is hidden while the brief has an address fact \(f-address\)/
  )
})

test('the fix-round failure list: one line per failure, in rule order, "<id> | <title> | <where> | <detail>"', () => {
  assert.equal(failureListText(base()), '')
  const p = plan()
  decisionOf(p, 'block-190').links[0].leadsTo = 'page-about-us'
  p.site.language = 'english'
  const title = (id) => RULE_TITLES.find(([, rid]) => rid === id)[2]
  assert.equal(
    failureListText(check(p)),
    [
      `R09 | ${title('R09')} | site.language | "english" is not a BCP 47 tag`,
      `R09 | ${title('R09')} | site.language | brief says "en", plan says "english"`,
      `R13 | ${title('R13')} | page page-about-us / block block-190 / link block-190.link-1 | link leads to page-about-us, the page it is shown on`
    ].join('\n') + '\n'
  )
})

test('missing inputs: every rule is listed and skipped with the reason, nothing throws', () => {
  const result = checkPlan({ plan: plan(), kit: null, brief: undefined })
  assert.deepEqual(result.inputErrors, [
    'kit is missing or not a JSON object',
    'brief is missing or not a JSON object'
  ])
  assert.equal(result.rules.length, RULE_TITLES.length)
  assert.deepEqual(result.summary, { pass: 0, fail: 0, skip: RULE_TITLES.length })
  assert.match(result.rules[0].notes[0], /^cannot check: kit is missing/)
})
