import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  ctaBandMessageProblem,
  ctaBandProblems,
  proposeCtaBands
} from '../domain/cta-bands.mjs'

/** A trimmed content map of a fictional template: a hero, a card grid, a call-to-action band and a header button. */
function mapOf(sample) {
  const text = (key, value, extra = {}) => ({ key, entity: key.split('.')[0], type: 'text', sample: value, ...extra })
  return {
    entities: [
      { key: 'module-10', kind: 'module', identity: { module: 'mod_custom', position: 'hero' } },
      { key: 'module-20', kind: 'module', identity: { module: 'mod_custom', position: 'section-2' } },
      { key: 'module-30', kind: 'module', identity: { module: 'mod_custom', position: 'section-3' } },
      { key: 'module-40', kind: 'module', identity: { module: 'mod_custom', position: 'header-r' } }
    ],
    pages: [
      {
        route: 'home',
        entity: 'menuItem-1',
        assignedModules: [
          ['module-10', 'hero'],
          ['module-20', 'section-2'],
          ['module-30', 'section-3'],
          ['module-40', 'header-r']
        ].map(([entity, position]) => ({ entity, position }))
      }
    ],
    slots: [
      text('module-10.0', sample.hero, { role: 'editorial.heading' }),
      text('module-10.1', 'Book now', { role: 'contact.cta_label', action: { kind: 'primary-cta' } }),
      text('module-20.0', 'Card one', { role: 'offering.name', group: { id: 'module-20.0', item: 0 } }),
      text('module-20.1', 'Card two', { role: 'offering.name', group: { id: 'module-20.1', item: 1 } }),
      text('module-20.2', 'Contact', {
        role: 'contact.cta_label',
        action: { kind: 'contact' },
        group: { id: 'module-20.1', item: 1 }
      }),
      text('module-30.0', sample.heading, { role: 'claim.heading', maxCharacters: 40 }),
      text('module-30.1', sample.line, { role: 'claim.notice', maxCharacters: 60 }),
      { key: 'module-30.2', entity: 'module-30', type: 'image', sample: 'images/bg.jpg', role: 'editorial.illustration' },
      text('module-30.3', 'SIGN UP NOW', {
        role: 'contact.cta_label',
        action: { kind: 'primary-cta', urlKey: 'module-30.4' }
      }),
      { key: 'module-30.4', entity: 'module-30', type: 'url', sample: 'index.php?Itemid=9', action: { kind: 'primary-cta' } },
      text('module-40.0', 'Contact us', { role: 'editorial.button_label', action: { kind: 'primary-cta' } }),
      text('module-40.1', 'Header button', { column: 'title', role: 'editorial.heading' })
    ]
  }
}

for (const [trade, sample] of [
  ['bakery', { hero: 'Fresh bread', heading: 'Half price on Mondays', line: 'at all our shops' }],
  ['dental clinic', { hero: 'Gentle care', heading: 'Free first check-up', line: 'for new patients' }]
]) {
  test(`${trade}: the band of message, button and ground is proposed as one unit; hero, cards and header button are not`, () => {
    const map = mapOf(sample)
    assert.deepEqual(proposeCtaBands(map), [
      {
        id: 'module-30.cta-band',
        entity: 'module-30',
        message: [
          { key: 'module-30.0', part: 'heading' },
          { key: 'module-30.1', part: 'line' }
        ],
        buttons: ['module-30.3'],
        ground: 'module-30.2'
      }
    ])
  })

  test(`${trade}: the contract check refuses an undeclared band and a band with no message slot role`, () => {
    const map = mapOf(sample)
    assert.deepEqual(ctaBandProblems(map), ['call-to-action band "module-30" is not declared in ctaBands'])
    assert.deepEqual(ctaBandProblems({ ...map, ctaBands: proposeCtaBands(map) }), [])
    const bare = { ...map, ctaBands: [{ id: 'b', entity: 'module-30', message: [], buttons: ['module-30.3'] }] }
    assert.ok(ctaBandProblems(bare).includes('call-to-action band "b" has no message slot role'))
    const unnamed = {
      ...map,
      ctaBands: [{ id: 'b', entity: 'module-30', message: [{ key: 'module-30.0' }], buttons: ['module-30.3'] }]
    }
    assert.ok(ctaBandProblems(unnamed).some((e) => /has no message slot role \(heading or line\)/.test(e)))
    const lone = {
      ...map,
      ctaBands: [{ id: 'b', entity: 'module-30', message: [{ key: 'module-30.3', part: 'heading' }], buttons: [] }]
    }
    assert.ok(ctaBandProblems(lone).some((e) => /must name a text slot that is not a button/.test(e)))
    assert.ok(ctaBandProblems(lone).includes('call-to-action band "b" has no button'))
  })

  test(`${trade}: a band message is editorial words; numbers, prices, dashes, demo words and unsourced offers are refused`, () => {
    const slot = { key: 'module-30.0', type: 'text', sample: sample.heading, maxCharacters: 40 }
    const briefText = `A ${trade} in a small town.`
    assert.equal(ctaBandMessageProblem('Ready to visit us?', { slot, briefText }), null)
    assert.equal(ctaBandMessageProblem('', { slot, briefText }), 'empty')
    assert.equal(ctaBandMessageProblem('Open 7 days a week', { slot, briefText }), 'number')
    assert.equal(ctaBandMessageProblem('Only AED for a visit', { slot, briefText }), 'price')
    assert.equal(ctaBandMessageProblem('Come in \u2014 we are open', { slot, briefText }), 'dash')
    assert.equal(ctaBandMessageProblem('Claim your free visit', { slot, briefText }), 'invented-offer')
    assert.equal(
      ctaBandMessageProblem('Claim your free visit', { slot, briefText: `${briefText} The first visit is free.` }),
      null
    )
    assert.equal(ctaBandMessageProblem(sample.heading.replace(/\d/g, ''), { slot, briefText }) !== null, true)
    assert.equal(ctaBandMessageProblem('A very long heading that will never fit this band', { slot, briefText }), 'too-long')
  })
}

test('JA Boxing 1.0.8 declares its home call-to-action band and the contract check passes it', () => {
  const map = JSON.parse(
    readFileSync(
      new URL(
        '../../../cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.8/content-map.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  assert.deepEqual(ctaBandProblems(map), [])
  assert.deepEqual(map.ctaBands, proposeCtaBands(map))
  assert.deepEqual(
    map.ctaBands.map((b) => [b.entity, b.message.map((m) => `${m.key}:${m.part}`), b.buttons, b.ground]),
    [['module-161', ['module-161.0:heading', 'module-161.1:line'], ['module-161.3'], 'module-161.2']]
  )
})
