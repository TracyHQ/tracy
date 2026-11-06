// Card AQ: a brief phone number the write step writes into a page's body text becomes a tel: link a visitor can tap, and the
// site check blames a number left uncallable in a created page's body on step 9, not on the template. Every business, number
// and page here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { judgePhoneCallable } from '../src/site-check/reach-measures.js'
import { orderOf } from '../src/write-step/page-create-lines.js'
import { callablePhones, phonesOf } from '../src/write-step/phone-links.js'

const BRIEF = {
  facts: [
    { field: 'phone', value: '+44 20 7946 0123' },
    { field: 'phone', value: '020 7946 0999', onSite: false },
    { field: 'email', value: 'hello@quay.example' }
  ]
}

test('the brief phones are read with the number a tel: link dials', () => {
  assert.deepEqual(phonesOf(BRIEF), [{ digits: '442079460123', tel: '+442079460123' }])
  assert.deepEqual(phonesOf({ facts: [{ field: 'phone', value: '0044 (20) 7946-0123' }] }), [
    { digits: '442079460123', tel: '+442079460123' }
  ])
  assert.deepEqual(phonesOf(null), [])
})

test('every way of writing a brief phone is wrapped once; other numbers and existing tel: links are left alone', () => {
  const phones = phonesOf(BRIEF)
  const html = [
    '<p>Call +44 20 7946 0123 or 0044 (20) 7946-0123 today.</p>',
    '<p>Our old line 020 7946 0999 and order 12345678 are not ours to call.</p>',
    '<p>Already <a href="tel:+442079460123">+44 20 7946 0123</a> here.</p>'
  ].join('\n')
  assert.equal(
    callablePhones(html, phones),
    [
      '<p>Call <a href="tel:+442079460123">+44 20 7946 0123</a> or <a href="tel:+442079460123">0044 (20) 7946-0123</a> today.</p>',
      '<p>Our old line 020 7946 0999 and order 12345678 are not ours to call.</p>',
      '<p>Already <a href="tel:+442079460123">+44 20 7946 0123</a> here.</p>'
    ].join('\n')
  )
  assert.equal(callablePhones(html, []), html)
})

test('a created page body takes its phone as a tel: link, its words still escaped', () => {
  const order = orderOf(
    { id: 'legal:privacy', slug: 'privacy' },
    { pages: { 'legal:privacy': { title: 'Privacy', body: ['Ask us <anything>: call +44 20 7946 0123.'] } } },
    { phones: phonesOf(BRIEF) }
  )
  assert.equal(
    order.html,
    '<p>Ask us &lt;anything&gt;: call <a href="tel:+442079460123">+44 20 7946 0123</a>.</p>'
  )
})

test("a number left uncallable in a created page body is the write step's; the same on a kept page stays the template's", () => {
  const measures = [
    {
      path: '/site-pages/privacy',
      width: 390,
      phones: [{ digits: '442079460123', text: '+44 20 7946 0123', selector: 'article p', inTel: false }]
    },
    {
      path: '/contact',
      width: 390,
      phones: [{ digits: '442079460123', text: '+44 20 7946 0123', selector: '.footer span', inTel: false }]
    },
    {
      path: '/site-pages/privacy',
      width: 1440,
      phones: [{ digits: '442079460123', text: '+44 20 7946 0123', selector: '.footer span', inTel: false }]
    }
  ]
  const { failures } = judgePhoneCallable(measures, ['442079460123'], new Set(['/site-pages/privacy']))
  assert.deepEqual(
    failures.map((f) => [f.page, f.causingStep ?? 0]),
    [
      ['/site-pages/privacy', 9],
      ['/contact', 0],
      ['/site-pages/privacy', 0]
    ]
  )
})
