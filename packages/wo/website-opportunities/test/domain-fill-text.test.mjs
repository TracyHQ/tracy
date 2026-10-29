// The fill plan's text substitutes (spec TracyHQ/tracy#132, #137 wired by #141): a claim heading whose demo number has
// no brief fact loses it, one with the brief's fact takes the brief's number, and a signature text slot takes the
// signer's name. Every name, number and slot is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textSubstitutesOf } from '../domain/fill-text.mjs'

const textFit = { measured: true, boxes: { desktop: { width: 568, height: 160 } }, maxCharacters: 40 }
const CONTENT_MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [{ key: 'module-1', kind: 'module' }],
  slots: [
    {
      key: 'module-1.0',
      entity: 'module-1',
      type: 'text',
      role: 'claim.heading',
      sample: 'No1 boxing studio since 2008',
      fit: textFit
    },
    {
      key: 'module-1.1',
      entity: 'module-1',
      type: 'text',
      role: 'editorial.heading',
      sample: 'Train with 20 coaches'
    },
    {
      key: 'module-1.2',
      entity: 'module-1',
      type: 'text',
      role: 'claim.heading',
      sample: 'Strong hearts',
      fit: textFit
    },
    {
      key: 'module-1.3',
      entity: 'module-1',
      type: 'text',
      role: 'quote.author_name',
      label: 'Our story / signature',
      sample: 'Demo Signer',
      fit: textFit
    }
  ]
}
const OWNER = [{ id: 'person-ivo', value: { name: 'Ivo Founder', role: 'Founder' } }]
const byKey = (list) => new Map(list.map((s) => [s.key, s]))

test('a claim heading with a demo number and no brief fact loses the number and the words that leaned on it', () => {
  const got = byKey(textSubstitutesOf({ contentMap: CONTENT_MAP, facts: [], people: OWNER }))
  assert.deepEqual(
    [got.get('module-1.0').kind, got.get('module-1.0').state, got.get('module-1.0').text],
    ['numberless', 'neutral', 'Boxing studio']
  )
  // Editorial words are the copy writer's, and a heading with no number needs nothing.
  assert.equal(got.has('module-1.1'), false)
  assert.equal(got.has('module-1.2'), false)
})

test("a claim heading's founding year takes the brief's own year", () => {
  const facts = [{ id: 'fact-founded', value: { amount: 2015, label: 'founded' } }]
  const got = byKey(textSubstitutesOf({ contentMap: CONTENT_MAP, facts, people: OWNER }))
  assert.deepEqual(
    [got.get('module-1.0').state, got.get('module-1.0').text],
    ['sourced', 'Boxing studio since 2015']
  )
  assert.deepEqual(got.get('module-1.0').factRefs, ['fact-founded'])
})

test("a signature text slot takes the signer's name; a slot the copy path already pinned is left to it", () => {
  const got = byKey(textSubstitutesOf({ contentMap: CONTENT_MAP, facts: [], people: OWNER }))
  assert.deepEqual([got.get('module-1.3').kind, got.get('module-1.3').text], ['signature', 'Ivo Founder'])
  const pinned = byKey(
    textSubstitutesOf({
      contentMap: CONTENT_MAP,
      facts: [],
      people: OWNER,
      pinned: { 'module-1.0': 'Our club' }
    })
  )
  assert.equal(pinned.has('module-1.0'), false)
})

test('the current text of a slot is read before its demo sample', () => {
  const got = byKey(
    textSubstitutesOf({ contentMap: CONTENT_MAP, facts: [], texts: { 'module-1.2': 'Over 500 members' } })
  )
  assert.equal(got.get('module-1.2').text, 'Members')
})

test("a heading's markup is read as its words: a styled number goes like any other", () => {
  const got = byKey(
    textSubstitutesOf({
      contentMap: CONTENT_MAP,
      texts: { 'module-1.0': '<span>No1</span> Boxing studio since 2008' }
    })
  )
  assert.equal(got.get('module-1.0').text, 'Boxing studio')
})
