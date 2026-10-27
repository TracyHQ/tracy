#!/usr/bin/env node
/**
 * The two copies of the site-label rule (the add-site plugin and tracy-web) answer alike.
 *
 *   node --test scripts/test/site-label-parity.test.mjs
 *
 * The rule lives twice because the plugin answers WHILE the person types and the create door is the
 * gate that cannot argue; the dsh image and `apps/tracy-web` cannot import each other at runtime.
 * This file lives in `scripts/test/` because it is the one place allowed to look at both.
 *
 * What is behaviour is checked here: the same answer for the same input, the same reserved list,
 * the same shape regex. That the RULE CODE of the two files is the same text (so a constant added on
 * one side cannot slip in unnoticed) is a source comparison and lives in gate `infra-contracts`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as plugin from '../../packages/site/tracy-add-site/src/client/site-label.mjs'
import * as worker from '../../apps/tracy-web/src/sites/label.js'

/** Every known case and its right answer. A case added HERE is put to both copies. */
const CASES = [
  ['bakery', null],
  ['my-bakery', null],
  ['nha-hang-cua-toi', null],
  ['abcdef', null],
  ['a'.repeat(30), null],
  ['abc--defg', null],
  ['joomlart-0871462cd', null],
  ['joomlart-0871462z', null],
  ['abcde', 'shape'],
  ['a'.repeat(31), 'shape'],
  ['-bakery', 'shape'],
  ['bakery-', 'shape'],
  ['Bakery', 'shape'],
  ['bánh-mì', 'shape'],
  ['bakery.shop', 'shape'],
  [' bakery ', 'shape'],
  ['xn--bakery', 'shape'],
  ['ab--cdef', 'shape'],
  ['api', 'shape'],
  ['www', 'shape'],
  ['registry', 'reserved'],
  ['webhook', 'reserved'],
  ['dashboard', 'reserved'],
  ['joomlart-0871462c', 'looks_imported']
]

for (const [label, expected] of CASES) {
  test(`site label "${label}": both copies answer ${String(expected)}`, () => {
    assert.equal(plugin.siteLabelRefusal(label), expected, 'plugin')
    assert.equal(worker.siteLabelRefusal(label), expected, 'tracy-web')
  })
}

test('both copies keep the same reserved names', () => {
  assert.deepEqual([...plugin.RESERVED_LABELS].sort(), [...worker.RESERVED_LABELS].sort())
})

test('both copies keep the same shape regex', () => {
  assert.equal(plugin.SITE_LABEL_RE.source, worker.SITE_LABEL_RE.source)
  assert.equal(plugin.SITE_LABEL_RE.flags, worker.SITE_LABEL_RE.flags)
})
