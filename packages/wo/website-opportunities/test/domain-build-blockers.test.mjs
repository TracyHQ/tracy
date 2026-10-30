// A brief build whose final checks still hold a blocker is not reported built: it ends in "needs fixes" with the list.
// The blocker kinds live in one place (`build-blockers.mjs`). Two made-up businesses of other trades.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BLOCKER_RULES, buildBlockers } from '../domain/build-blockers.mjs'

const report = (findings, broken = []) => ({ version: 'demo-leftovers/1', findings, broken })

test('every blocker kind the gate names is found in the final check report, grouped by rule with its pages', () => {
  const out = buildBlockers(
    report(
      [
        { kind: 'C03', page: '/', place: 'article-16.4', found: 'demo class' },
        { kind: 'C03', page: '/about', place: 'article-16.4', found: 'demo class' },
        {
          kind: 'contact-form',
          severity: 'major',
          path: '/contact',
          why: 'A contact form shows but the brief gives no email'
        },
        {
          kind: 'record-not-shown',
          severity: 'blocker',
          page: '/',
          place: 'module-9.5',
          role: 'quote.author'
        },
        {
          kind: 'review-integrity',
          severity: 'major',
          page: '/about',
          place: 'quote:0',
          reason: 'missing-review-author'
        },
        { kind: 'head-block', severity: 'major', page: '/menu', found: 'brand colours' },
        { kind: 'C19', page: '/menu', place: 'a[href="#"] "Book a table"', found: 'Book a table' }
      ],
      [{ path: '/services', status: 404, why: 'the page answered 404' }]
    )
  )
  assert.equal(out.state, 'needs-fixes')
  const byRule = Object.fromEntries(out.items.map((i) => [i.rule, i.pages]))
  assert.deepEqual(byRule, {
    'demo-content': ['/', '/about'],
    'form-without-recipient': ['/contact'],
    'record-not-from-brief': ['/', '/about'],
    'missing-head-block': ['/menu'],
    'link-without-job': ['/menu'],
    'kept-page-missing': ['/services']
  })
  assert.equal(out.total, 8)
})

test('a report with only minor and major findings outside the blocker kinds is clear', () => {
  const out = buildBlockers(
    report([
      { kind: 'C17', page: '/', place: 'footer', found: '(555) 010-4477' },
      { kind: 'C19', page: '/', place: '/old-page', found: '/old-page' },
      { kind: 'review-integrity', page: '/', place: 'quote:0', reason: 'missing-review-platform' },
      { kind: 'main-menu', severity: 'major', page: '/' },
      { kind: 'C14', page: '/', place: 'footer', found: 'Designed by' }
    ])
  )
  assert.deepEqual(out, { version: out.version, state: 'clear', items: [], total: 0 })
})

test('a finding another check declares a blocker is never dropped, even of a kind the gate does not name', () => {
  const out = buildBlockers(
    report([{ kind: 'future-check', severity: 'blocker', page: '/repairs', why: 'something wrong' }])
  )
  assert.equal(out.state, 'needs-fixes')
  assert.deepEqual(out.items, [{ rule: 'other-blocker', pages: ['/repairs'], count: 1 }])
})

test('no report or an unreadable one is not clear: the site was never checked', () => {
  assert.equal(buildBlockers(null).state, 'unchecked')
  assert.equal(buildBlockers({ findings: 'x' }).state, 'unchecked')
})

test('every rule has an id the hand-off and the screen can name', () => {
  const ids = BLOCKER_RULES.map((r) => r.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ids) assert.match(id, /^[a-z-]+$/)
})

test('the footer shape, the Contact page and a picture on another record are blockers (site build rules 2 and 5)', () => {
  const out = buildBlockers(
    report([
      { kind: 'C22', severity: 'major', page: '/', place: 'footer', found: 'two phone lines' },
      { kind: 'contact-channel-missing', severity: 'major', path: '/contact', why: 'WhatsApp is not linked' },
      { kind: 'walk-in-copy', severity: 'major', path: '/about', why: 'Come visit us' },
      {
        kind: 'record-picture-shared',
        severity: 'blocker',
        page: '/bikes/gravel',
        found: '/images/road.jpg'
      },
      { kind: 'icon-row-mixed', severity: 'minor', page: '/' },
      { kind: 'booking-button-target', severity: 'major', page: '/', found: 'Book a service -> /bikes' }
    ])
  )
  assert.deepEqual(
    out.items.map((i) => [i.rule, i.pages]),
    [
      ['footer-shape', ['/']],
      ['contact-page', ['/contact', '/about']],
      ['pictures-fit-record', ['/bikes/gravel']],
      // A booking button that leads elsewhere blocks too (criterion 5.2, R12 group B handoff).
      ['booking-buttons', ['/']]
    ]
  )
  assert.equal(out.total, 5)
})
