// The fixed kind codes the site check gives a read-back difference and an item the write step left out
// (site-check/read-back.js differsKind, site-check/write-findings.js unaddressableKind), and the chain's diagnostics
// counting each group's failures by them (step-chain-write-diagnostics.js kindsOf), never by their words.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { differsKind } from '../src/site-check/read-back.js'
import { unaddressableKind } from '../src/site-check/write-findings.js'
import { kindsOf, stepNineDiagnostics } from '../src/step-chain-write-diagnostics.js'

test('a read-back difference is empty, cut short, the ordered words with markup, or other', () => {
  assert.equal(differsKind('Train with us', ''), 'differs-empty')
  assert.equal(differsKind('Train with us every day', 'Train with us'), 'differs-shortened')
  assert.equal(differsKind('Train with us', '<p>Train with us</p>'), 'differs-markup')
  assert.equal(differsKind('Train with us', 'Join the club'), 'differs-other')
})

test('an item the write step left out is sorted by why it had nothing to write to', () => {
  assert.equal(
    unaddressableKind('pictures: its file is 448 px wide; the kit slot module-m.1 takes at least 672'),
    'picture-too-narrow'
  )
  assert.equal(unaddressableKind('pictures: it holds a file the uploads do not list'), 'picture-not-uploaded')
  assert.equal(
    unaddressableKind(
      'a template setting with colour roles is not drawn yet; the file beside it is a preview'
    ),
    'painted-setting'
  )
  assert.equal(unaddressableKind('the kit names no writable setting for this frame'), 'no-writable-setting')
  assert.equal(unaddressableKind('pictures: something new'), 'picture-other')
  assert.equal(unaddressableKind('the contract has no slot for it'), 'no-slot')
  assert.equal(unaddressableKind(undefined), 'other')
})

test('the diagnostics count each group by its kinds, never its words', () => {
  const groups = [
    {
      name: 'read-back',
      status: 'red',
      failures: [
        { kind: 'differs-empty', reason: 'private words' },
        { kind: 'differs-empty' },
        { kind: 'plugin-refused' },
        { kind: 'Not A Code' },
        {}
      ]
    },
    { name: 'unaddressable-items', status: 'red', failures: [{ kind: 'picture-too-narrow' }] },
    { name: 'reachable-pages', status: 'red', failures: [{}] }
  ]
  assert.deepEqual(kindsOf(groups), {
    'read-back': { 'differs-empty': 2, 'plugin-refused': 1 },
    'unaddressable-items': { 'picture-too-narrow': 1 }
  })
  const d = stepNineDiagnostics({
    report: { status: 'stopped' },
    siteCheck: { status: 'red', counts: { block: 7 }, groups }
  })
  assert.deepEqual(d.finalCheck.kinds, kindsOf(groups))
  assert.equal(JSON.stringify(d).includes('private words'), false)
})
