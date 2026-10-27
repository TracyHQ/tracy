// The footer assertion itself: what it must refuse. A letter is judged against oracles/mail/oracle.json
// `footer` (REG-PR-973), so two links that merely sit on the legal host are not a Terms and Privacy footer.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withoutLegalLinks } from '../machine.mjs'

const TERMS = 'https://tracy.ai/terms'
const PRIVACY = 'https://tracy.ai/privacy'
const MANAGE = 'https://app.tracy.test/?settings=notifications'
const a = (href, words) => `<a href="${href}" style="color:#8a817c;">${words}</a>`
const letter = ({
  links = [
    [TERMS, 'Terms'],
    [PRIVACY, 'Privacy']
  ],
  text = `Manage: ${MANAGE}\nTerms: ${TERMS} · Privacy: ${PRIVACY}`
} = {}) => ({
  html: `<p>${a(MANAGE, 'Manage notifications')} &middot; ${links.map(([h, w]) => a(h, w)).join(' &middot; ')}</p>`,
  text
})
const judge = (l, lang = 'en') => withoutLegalLinks(l.html, l.text, 'letter', lang)

test('the stated footer passes and only the other links are returned', () => {
  assert.deepEqual(judge(letter()), [MANAGE])
  const vi = letter({
    links: [
      [TERMS, 'Điều khoản'],
      [PRIVACY, 'Quyền riêng tư']
    ],
    text: `Điều khoản: ${TERMS} · Quyền riêng tư: ${PRIVACY}`
  })
  assert.deepEqual(judge(vi, 'vi'), [MANAGE])
})

test('two unrelated pages on the legal host are not the footer', () => {
  const other = letter({
    links: [
      ['https://tracy.ai/pricing', 'Terms'],
      ['https://tracy.ai/blog', 'Privacy']
    ],
    text: 'Terms: https://tracy.ai/pricing · Privacy: https://tracy.ai/blog'
  })
  assert.throws(() => judge(other), /not exactly the Terms page then the Privacy page/)
})

test('a missing, repeated, swapped or extra legal link is refused', () => {
  const cases = {
    missing: [[TERMS, 'Terms']],
    repeated: [
      [TERMS, 'Terms'],
      [TERMS, 'Privacy']
    ],
    swapped: [
      [PRIVACY, 'Privacy'],
      [TERMS, 'Terms']
    ],
    extra: [
      [TERMS, 'Terms'],
      [PRIVACY, 'Privacy'],
      ['https://tracy.ai/', 'tracy.ai']
    ],
    'with a query': [
      [`${TERMS}?utm=1`, 'Terms'],
      [PRIVACY, 'Privacy']
    ],
    'over http': [
      ['http://tracy.ai/terms', 'Terms'],
      [PRIVACY, 'Privacy']
    ]
  }
  for (const [name, links] of Object.entries(cases))
    assert.throws(() => judge(letter({ links })), /not exactly the Terms page then the Privacy page/, name)
})

test('each page keeps its own label', () => {
  const crossed = letter({
    links: [
      [TERMS, 'Privacy'],
      [PRIVACY, 'Terms']
    ],
    text: `Privacy: ${TERMS} · Terms: ${PRIVACY}`
  })
  assert.throws(() => judge(crossed), /the terms link is mislabelled/)
  const empty = letter({
    links: [
      [TERMS, ''],
      [PRIVACY, 'Privacy']
    ]
  })
  assert.throws(() => judge(empty), /the terms link has no label/)
  const slot = letter({
    links: [
      [TERMS, '{{terms}}'],
      [PRIVACY, 'Privacy']
    ]
  })
  assert.throws(() => judge(slot, 'de'), /template slot left in the terms label/)
  // A language the oracle states no word for: the two links still may not share one label.
  const same = letter({
    links: [
      [TERMS, 'Rechtliches'],
      [PRIVACY, 'Rechtliches']
    ],
    text: `Rechtliches: ${TERMS} · Rechtliches: ${PRIVACY}`
  })
  assert.throws(() => judge(same, 'de'), /carry one label/)
})

test('the text part ends with the same two addresses under the same labels', () => {
  const texts = {
    'no addresses': ['Manage notifications', /does not end with the Terms and Privacy addresses/],
    'privacy only': [`Privacy: ${PRIVACY}`, /does not end with the Terms and Privacy addresses/],
    'swapped order': [`Privacy: ${PRIVACY} · Terms: ${TERMS}`, /does not end with/],
    'another link after them': [
      `Terms: ${TERMS} · Privacy: ${PRIVACY}\n${MANAGE}`,
      /does not end with the Terms and Privacy addresses/
    ],
    'address written twice': [
      `${TERMS}\nTerms: ${TERMS} · Privacy: ${PRIVACY}`,
      /not written exactly once in the text part/
    ],
    'another label': [`Legal: ${TERMS} · Privacy: ${PRIVACY}`, /under the label "Terms"/]
  }
  for (const [name, [text, message]] of Object.entries(texts))
    assert.throws(() => judge(letter({ text })), message, name)
})
