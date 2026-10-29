// One slot the records door cannot empty is a finding of the build, never the end of it (#189, round 10).
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { planRecordSteps } from '../src/sites/brief-engines/joomla-plan-records.js'

for (const [trade, name] of [
  ['florist', 'Bramble Florist'],
  ['locksmith', 'Keyway Locksmiths']
]) {
  test(`${trade}: a template string and an outline part with no door are findings, the reachable slots still go`, async () => {
    const notes = []
    const timings = {}
    const blanks = [
      // A template language string: the records door has no kind for it.
      {
        key: 'languageString-7701.0',
        entity: 'languageString-7701',
        column: 'value',
        type: 'text',
        sample: 'Demo form heading'
      },
      // A module line the records door reaches.
      {
        key: 'module-12.0',
        entity: 'module-12',
        column: 'params',
        type: 'text',
        jsonPath: ['text'],
        sample: `Demo ${trade} line`
      }
    ]
    const made = await planRecordSteps({
      siteKey: `fictional-${trade}`,
      ctx: {
        siteKey: `fictional-${trade}`,
        email: 'owner@example.test',
        note: (line) => notes.push(line),
        time: (key, n) => {
          timings[key] = n
        }
      },
      woContent: null,
      extraBlanks: blanks,
      // An outline part of an article body: the site has no door to take one part of an article off.
      extraHides: [{ how: 'none', group: 'article-30.outline.2', reason: 'demo-title-left' }],
      apply: async ({ action }) =>
        action === 'content.list'
          ? {
              ok: true,
              items: [{ id: 12, title: name, params: JSON.stringify({ text: `Demo ${trade} line` }) }]
            }
          : { ok: false, message: 'not asked' }
    })
    assert.deepEqual(made.steps, [
      { kind: 'module', id: 12, fields: { params: JSON.stringify({ text: '' }) } }
    ])
    assert.deepEqual(made.unresolved, [
      { key: 'languageString-7701.0', reason: 'no-record-door' },
      { key: 'article-30.outline.2', reason: 'no-take-off-door' }
    ])
    assert.equal(timings.recordFallbacksUnresolved, 2)
    assert.ok(
      notes.some((line) => line.includes('languageString-7701.0') && line.includes('article-30.outline.2')),
      'the note names every slot left'
    )
  })
}
