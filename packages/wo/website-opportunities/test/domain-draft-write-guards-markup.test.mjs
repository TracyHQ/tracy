// The write guard on markup and addresses (ticket #597): an address that runs code is refused only where an address is
// written (a link field, an address attribute piece, a record's link), never in words; a plain text column (a title,
// an alias) holds no tag at all; a created record's columns and a library block's HTML are read by the guard's one
// reader. Invented data (the JA Boxing florist).
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-guards-markup.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { guardPlan } from '../domain/draft-write-guards.mjs'
import { guarded, kit, plan, site, valueWhere } from './fixtures/draft-write/guarded.mjs'

const WORDS = ['Data: we keep only what you send', 'JavaScript: not needed to order', 'Data : what we keep']

test('words that name a scheme pass at a text place, a text node piece and a record title', () => {
  for (const words of WORDS) {
    assert.equal(
      guarded((p) => {
        valueWhere(
          p,
          (op, v) => op.kind !== 'contract.apply' && (v.loc.xpath ?? '').endsWith('text()')
        ).value = words
      }),
      'passed',
      words
    )
    assert.equal(
      guarded((p) => {
        p.ops.find((op) => op.kind === 'menuItem.create').fields.title = words
      }),
      'passed',
      words
    )
  }
})

test('a code address is refused where an address is written: an href piece, a record link', () => {
  for (const address of [
    'javascript:x()',
    'java&Tab;script:x()',
    ' JaVaScRiPt&colon;x',
    'data:text/html,x'
  ]) {
    assert.equal(
      guarded((p) => {
        valueWhere(p, (_, v) => (v.loc.xpath ?? '').endsWith('@href')).value = address
      }),
      'markup_runs_code',
      address
    )
    assert.equal(
      guarded((p) => {
        p.ops.find((op) => op.kind === 'menuItem.create').link = { fixed: address }
      }),
      'markup_runs_code',
      address
    )
  }
})

test('a plain text column holds no tag, comment or bogus form: a record title or alias', () => {
  for (const title of ['Our <b>roses</b>', 'Roses <!-- x -->', 'Roses <?x?>', 'Roses </ x>', 'Roses <i']) {
    assert.throws(
      () => {
        const p = structuredClone(plan)
        p.ops.find((op) => op.kind === 'menuItem.create').fields.title = title
        guardPlan(p, { order: site.order, kit })
      },
      (error) => {
        assert.equal(error.code, 'markup_forbidden', title)
        assert.equal(error.details.problems[0].via, 'tag_in_plain_column')
        return true
      }
    )
  }
  for (const title of ['Roses < 5 days', 'We <3 roses', 'Q&A', 'Open (weekdays (9 to 5))'])
    assert.equal(
      guarded((p) => {
        p.ops.find((op) => op.kind === 'menuItem.create').fields.title = title
      }),
      'passed',
      title
    )
})

test('the library HTML is read by the guard reader: a slash handler, an entity hidden address, a comment', () => {
  for (const html of [
    '<p>Fine</p><img/src/onerror=f()>',
    '<a href="&#106;avascript:f()">Go</a>',
    '<a href="java&Tab;script:f()">Go</a>',
    '<!--<a title="--><a href="javascript:f()">Go</a>'
  ])
    assert.equal(
      guarded((p) => {
        const op = p.ops.find((o) => o.kind === 'library.create')
        op.html += html
      }),
      'library_html_unsafe',
      html
    )
})
