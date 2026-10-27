import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isExaminedTooFewMisread } from '../visual/preflight.mjs'

test('preflight does not call a real examined-too-few finding a misread based on unrelated census prose counts', () => {
  assert.equal(isExaminedTooFewMisread(8, [{ kind: 'examined-too-few', sourceCount: 100 }]), false)
  assert.equal(isExaminedTooFewMisread(20, [{ kind: 'examined-too-few', sourceCount: 100 }]), false)
  assert.equal(isExaminedTooFewMisread(50, [{ kind: 'examined-too-few', sourceCount: 100 }]), true)
  assert.equal(isExaminedTooFewMisread(8, []), false)
})

test('preflight reads sourceCount from the examined-too-few finding written by Visual QA', () => {
  const finding = { kind: 'examined-too-few', basis: 'census', siteCount: 50, sourceCount: 100 }
  assert.equal(isExaminedTooFewMisread(50, [finding]), true)
  assert.equal(isExaminedTooFewMisread(20, [finding]), true)
})

test('preflight uses the finding census siteCount and keeps supporting legacy findings', () => {
  const finding = { kind: 'examined-too-few', basis: 'census', siteCount: 50, sourceCount: 100 }
  assert.equal(isExaminedTooFewMisread(8, [finding]), true)
  assert.equal(isExaminedTooFewMisread(50, [finding]), true)
  assert.equal(isExaminedTooFewMisread(50, [{ kind: 'examined-too-few', examined: 50, sourceCount: 100 }]), true)
})
