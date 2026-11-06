// Site plan checker, rule R22 (ADR 0041): a list row whose picture is printed inside the same card as some of the
// block's text slots (the kit's rows[].pairedSlots) is kept exactly when one of those text slots is kept.
// Inputs: an invented one-page kit of an invented template and an invented brief; only R22 is read.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'

const BLOCK = 'body-studio'
const LIST = 'studio.gallery'
const CARD_SLOTS = ['card-1.title', 'card-1.line', 'card-2.title', 'card-2.line']

const row = (i, pairedSlots) => ({
  slots: [
    { id: `studio.pic-${i}`, role: 'business.gallery_image', type: 'image', maxCharacters: 255 },
    { id: `studio.clip-${i}`, role: 'business.video', type: 'text', maxCharacters: 42 }
  ],
  ...(pairedSlots ? { pairedSlots, printsIn: `card-${i}` } : {})
})

function kit({ paired = true } = {}) {
  return {
    pageGroups: [{ id: 'group-studio' }],
    pages: [{ id: 'page-studio', group: 'group-studio', blocks: { 1440: [BLOCK] } }],
    blocks: [
      {
        id: BLOCK,
        role: 'body',
        slots: [
          { id: 'studio.heading', role: 'editorial.heading' },
          ...CARD_SLOTS.map((id) => ({ id, role: 'editorial.paragraph' }))
        ],
        lists: [
          {
            id: LIST,
            rowKind: 'slots',
            min: 1,
            max: 3,
            rows: [
              row(0, paired ? [] : undefined),
              row(1, paired ? ['card-1.title', 'card-1.line'] : undefined),
              row(2, paired ? ['card-2.title', 'card-2.line'] : undefined)
            ]
          }
        ],
        frames: [0, 1, 2].map((i) => ({ id: `studio.pic-${i}`, kind: 'photo', canHide: false })),
        links: [],
        fixedText: [],
        demoOwned: []
      }
    ],
    site: { nameSlots: [] }
  }
}

const brief = () => ({
  facts: [{ id: 'fact_pottery', field: 'services', value: 'Pottery classes', source: 'stated' }],
  missing: []
})

const item = (frame) => ({
  about: 'a pottery class',
  proof: { how: '', factIds: ['fact_pottery'] },
  pictures: frame ? [{ kind: 'photo', frame, shows: 'hands shaping clay' }] : [],
  copy: []
})

// keep: the card text slots written; hide: the card text slots hidden; frames: the row pictures the list keeps.
function plan({
  keep = CARD_SLOTS,
  frames = ['studio.pic-0'],
  rows,
  decision = 'keep',
  listHidden = false
} = {}) {
  const hide = CARD_SLOTS.filter((s) => !keep.includes(s))
  const list = { list: LIST, rows: rows ?? frames.length, items: frames.map(item) }
  return {
    version: 'site-plan/3',
    pageGroups: [{ id: 'group-studio', decision: 'keep', why: 'the studio teaches' }],
    pages: [
      {
        id: 'page-studio',
        decision: 'keep',
        why: 'the studio teaches',
        blocks: [
          {
            block: BLOCK,
            seen: 'a heading, a gallery and two cards',
            decision,
            why: 'classes',
            copy: [
              { slot: 'studio.heading', says: 'our classes', basis: 'brief', factIds: ['fact_pottery'] },
              ...keep.map((slot) => ({ slot, says: 'a stage of a class', basis: 'trade', factIds: [] }))
            ],
            hiddenSlots: [
              ...hide.map((slot) => ({ slot, why: 'the card is dropped' })),
              ...(listHidden ? [{ slot: LIST, why: 'no gallery' }] : [])
            ],
            lists: listHidden ? [] : [list]
          }
        ]
      }
    ],
    sharedBlocks: []
  }
}

const r22 = (p, k = kit()) => checkPlan({ plan: p, kit: k, brief: brief() }).rules.find((r) => r.id === 'R22')

test('R22 card texts kept while the list keeps only the first row fail once per dropped row', () => {
  const rule = r22(plan())
  assert.equal(rule?.status, 'fail')
  assert.equal(rule.failures.length, 2)
  assert.match(rule.failures[0].where, /page page-studio \/ block body-studio \/ list studio\.gallery/)
  assert.match(rule.failures[0].detail, /row 1 \(picture studio\.pic-1\) is dropped/)
  assert.match(rule.failures[0].detail, /card-1\.title, card-1\.line/)
  assert.match(rule.failures[1].detail, /row 2 \(picture studio\.pic-2\) is dropped/)
  assert.match(rule.failures[0].detail, /rows count follows the cards kept/)
})

test('R22 hidden cards whose rows are still kept fail', () => {
  const rule = r22(plan({ keep: [], frames: ['studio.pic-0', 'studio.pic-1', 'studio.pic-2'] }))
  assert.equal(rule?.status, 'fail')
  assert.equal(rule.failures.length, 2)
  assert.match(rule.failures[0].detail, /row 1 \(picture studio\.pic-1\) is kept/)
  assert.match(rule.failures[0].detail, /all hidden/)
})

test('R22 rows that follow their cards pass', () => {
  const rule = r22(plan({ keep: ['card-1.title', 'card-1.line'], frames: ['studio.pic-0', 'studio.pic-1'] }))
  assert.equal(rule?.status, 'pass')
  assert.equal(r22(plan({ frames: ['studio.pic-0', 'studio.pic-1', 'studio.pic-2'] }))?.status, 'pass')
})

test('R22 one paired slot kept is enough to keep the row', () => {
  const rule = r22(
    plan({ keep: ['card-1.title', 'card-2.line'], frames: ['studio.pic-0', 'studio.pic-1', 'studio.pic-2'] })
  )
  assert.equal(rule?.status, 'pass')
})

test('R22 items without frames fall back to the row count', () => {
  assert.equal(r22(plan({ frames: [null, null, null] }))?.status, 'pass')
  const rule = r22(plan({ frames: [null] }))
  assert.equal(rule?.status, 'fail')
  assert.equal(rule.failures.length, 2)
})

test('R22 a kit without pairedSlots is not checked', () => {
  const rule = r22(plan(), kit({ paired: false }))
  assert.equal(rule?.status, 'skip')
  assert.match(rule.notes.join(' '), /no list row carries pairedSlots/)
})

test('R22 a hidden block or a hidden list is not checked', () => {
  assert.equal(r22(plan({ decision: 'hide' }))?.status, 'skip')
  assert.equal(r22(plan({ listHidden: true }))?.status, 'skip')
})
