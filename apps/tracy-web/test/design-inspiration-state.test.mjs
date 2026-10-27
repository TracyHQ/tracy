/**
 * `inspirationState` — the Quickstarts column's verdict, with a machine code beside the English
 * `why` (04/10/2026, Admin attention: a screen in another language must not parse the sentence).
 * Since the same evening `on` means "customers see it" and what a shown card lacks is `issues`
 * (codes) / `warnings` (sentences) rather than a `card` state.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { inspirationState } from '../src/lib/design-inspiration.js'

const CARD = {
  template: 'ja-nova',
  category: 'business',
  image: 'thumb.png',
  blurb: 'A site.',
  layouts: [{ name: 'Home', shots: { desktop: 'd.png', mobile: 'm.png' } }]
}
const release = (over = {}) => ({
  tag: 'qs/ja-nova/wp7',
  choosable: true,
  kind: 'quickstart',
  github: 'prerelease',
  tracy: 'ready',
  setting: { version: '1.0.0', template: 'ja_nova' },
  inspiration: CARD,
  inspirationHidden: false,
  ...over
})
const all = () => true
const demo = { url: 'https://nova.test/' }

test('every state carries a code and params; why is unchanged', () => {
  assert.deepEqual(inspirationState(release(), { demo, has: all }), {
    state: 'on',
    why: null,
    code: null,
    params: {},
    warnings: [],
    issues: []
  })
  assert.deepEqual(inspirationState(release({ inspiration: null }), { demo, has: all }), {
    state: 'none',
    why: null,
    code: null,
    params: {},
    warnings: [],
    issues: []
  })
  const hidden = inspirationState(release({ inspirationHidden: true }), { demo, has: all })
  assert.equal(hidden.state, 'card')
  assert.equal(hidden.why, 'Saved but hidden from Design templates')
  assert.equal(hidden.code, 'unpublished')
  assert.equal(inspirationState(release({ github: 'draft', choosable: false })).code, 'refused')
})

test('what a shown card lacks is an issue with a code, and the card stays on', () => {
  const pictures = inspirationState(release(), { demo, has: (f) => f === 'thumb.png' })
  assert.equal(pictures.state, 'on')
  assert.deepEqual(pictures.warnings, ['2 of 3 pictures are not on this server yet: d.png, m.png'])
  assert.deepEqual(pictures.issues, [
    { code: 'pictures-missing', params: { missing: 2, total: 3, files: ['d.png', 'm.png'] } }
  ])
  const codes = (r, world) => inspirationState(r, world).issues.map((i) => i.code)
  assert.deepEqual(codes(release(), { has: all }), ['no-demo'])
  assert.deepEqual(codes(release({ inspiration: { ...CARD, category: '' } }), { demo, has: all }), [
    'no-category'
  ])
  assert.deepEqual(codes(release({ inspiration: { ...CARD, blurb: '' } }), { demo, has: all }), ['no-blurb'])
  const shotless = inspirationState(
    release({ inspiration: { ...CARD, image: '', layouts: [{ name: 'Home' }] } }),
    { demo, has: all }
  )
  assert.equal(shotless.state, 'on')
  assert.deepEqual(shotless.issues[0], { code: 'layouts-without-shots', params: { layouts: 1 } })
  assert.deepEqual(
    shotless.issues.map((i) => i.code),
    ['layouts-without-shots', 'no-thumbnail']
  )
})

test('a card whose demo install failed says so, with the reason, instead of "No demo"', () => {
  const reason = "could not configure this site's mail"
  const failed = inspirationState(release(), { failed: { reason }, has: all })
  assert.deepEqual(failed.warnings, [`The demo install failed: ${reason}`])
  assert.deepEqual(failed.issues, [{ code: 'demo-failed', params: { reason } }])
  // No reason recorded: the sentence still names the failure.
  assert.deepEqual(inspirationState(release(), { failed: { reason: null }, has: all }).warnings, [
    'The demo install failed'
  ])
  // A live demo wins: an old failed job behind it is not a problem of the card.
  assert.deepEqual(inspirationState(release(), { demo, failed: { reason }, has: all }).warnings, [])
})
