// An article's own fields that hold a button's target (spec TracyHQ/tracy#189 round 9, class C1): a field left at an empty
// target (`#`) has no declared job, and its words come from the template's language strings, so the button goes. Joomla
// layouts print such a button only when its field holds a target. Measured on a real build: two buttons of an offering
// page led to `#`. An invented florist; the writer runs against a fake site.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sweepDeadLinks, sweepFields } from '../src/sites/brief-engines/joomla-link-sweep.js'

test('an extra field at an empty target is emptied; real targets, words and nested lists stay', () => {
  const attribs = {
    'bouquet-signup': '#',
    'bouquet-title': 'Seasonal bouquets',
    'order-link': 'index.php?Itemid=12',
    'old-link': 'javascript:void(0)',
    'bouquet-features': { 'bouquet-features0': { feature_link: '#', feature_title: 'Wrapped by hand' } },
    show_title: ''
  }
  const out = sweepFields(attribs)
  assert.equal(out.changed, 3)
  assert.equal(out.fields['bouquet-signup'], '')
  assert.equal(out.fields['old-link'], '')
  assert.equal(out.fields['bouquet-features']['bouquet-features0'].feature_link, '')
  assert.equal(out.fields['bouquet-title'], 'Seasonal bouquets')
  assert.equal(out.fields['order-link'], 'index.php?Itemid=12')
  assert.equal(out.fields.show_title, '')
  assert.equal(sweepFields({ a: 'x' }), null)
})

test('the writer empties the target field of a published article, kept as a JSON string, and leaves a taken-off one', async () => {
  const sent = []
  const rows = {
    menuItem: [{ id: 101, title: 'Home', published: 1, home: 1, parent_id: 1, type: 'component', link: 'x' }],
    module: [],
    article: [
      {
        id: 21,
        title: 'Bouquets',
        state: 1,
        introtext: '',
        attribs: JSON.stringify({ 'bouquet-signup': '#' })
      },
      { id: 22, title: 'Gone', state: 0, introtext: '', attribs: JSON.stringify({ 'bouquet-signup': '#' }) }
    ]
  }
  const apply = async ({ action, params }) => {
    if (action === 'content.list') return { ok: true, items: params.offset ? [] : (rows[params.kind] ?? []) }
    if (action === 'content.batch') sent.push(...params.operations)
    return { ok: true }
  }
  await sweepDeadLinks({ apply, siteKey: 's', plan: {}, applyId: 'a', note: () => {} })
  assert.deepEqual(
    sent.map((s) => s.id),
    [21]
  )
  assert.deepEqual(JSON.parse(sent[0].fields.attribs), { 'bouquet-signup': '' })
})
