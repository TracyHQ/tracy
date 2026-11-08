// Site plan checker (ADR 0041), rules R23 and R24: a list row the plan keeps keeps all its printed fields, and a
// control that stays on the page keeps its label.
// Inputs: an invented two-page kit of an invented template and an invented brief; only R23 and R24 are read.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'

const CARD = 'body-lesson-kayak'
const OTHER = 'body-lesson-canoe'
const LABEL = 'string-book-now'

// A lesson page block: a heading, a button whose label is shared with the other lesson page, three feature cards
// stored as repeated fields (title, description, icon, video id, link url) and a kit list of two photo rows.
function lessonBlock(id, item, { owner = true } = {}) {
  const f = (row, field, n) => ({
    slot: `${item}.${n}`,
    field: `attribs.perks.perks${row}.${field}`,
    listedIn: id
  })
  const stored = []
  const slots = [{ id: `${item}.0`, role: 'editorial.heading', sample: 'Paddle with us' }]
  const demoOwned = []
  for (const row of [0, 1, 2]) {
    const n = 10 + row * 10
    stored.push(
      f(row, 'perk_title', n),
      f(row, 'perk_desc', n + 1),
      f(row, 'perk_icon', n + 2),
      f(row, 'perk_video_id', n + 3),
      f(row, 'perk_url', n + 4),
      f(row, 'perk_note', n + 5)
    )
    slots.push({ id: `${item}.${n}`, role: 'editorial.heading', sample: 'Calm water' })
    demoOwned.push(
      { id: `${item}.${n + 1}`, role: 'offering.description', sample: 'A sheltered bay for a first paddle' },
      { id: `${item}.${n + 2}`, role: 'editorial.item_icon', sample: '' },
      { id: `${item}.${n + 3}`, role: 'business.video', sample: 'abc123' },
      { id: `${item}.${n + 4}`, role: 'editorial.navigation_url', sample: '/lessons' },
      // A note the demo leaves empty: the kit measured nothing in it.
      { id: `${item}.${n + 5}`, role: 'editorial.paragraph', sample: '', demoChars: { total: 0 } }
    )
  }
  slots.push(
    { id: `${item}.trial`, role: 'editorial.button_label', sample: 'Try a lesson' },
    { id: `${item}.menu`, role: 'editorial.menu_label', sample: 'Lessons' }
  )
  slots.push({
    id: LABEL,
    role: 'editorial.button_label',
    sample: 'Book now',
    ...(owner ? {} : { ownedBy: CARD })
  })
  const listRow = (i) => ({
    index: i,
    slots: [
      { id: `${item}.p${i}`, role: 'business.gallery_image', type: 'image' },
      { id: `${item}.c${i}`, role: 'editorial.paragraph', type: 'text', sample: 'On the river' }
    ]
  })
  return {
    block: {
      id,
      role: 'body',
      slots,
      lists: [{ id: `${item}.gallery`, rowKind: 'slots', min: 1, max: 2, rows: [listRow(0), listRow(1)] }],
      frames: [0, 1].map((i) => ({ id: `${item}.p${i}`, kind: 'photo', canHide: true })),
      links: [
        { id: `${id}.link-1`, label: 'BOOK NOW', target: '/contact', labelId: LABEL, action: 'contact' },
        {
          id: `${id}.link-2`,
          label: 'TRY A LESSON',
          target: '/contact',
          labelId: `${item}.trial`,
          action: 'contact'
        },
        {
          id: `${id}.link-3`,
          label: 'LESSONS',
          target: '/lessons',
          labelId: `${item}.menu`,
          action: 'go-to-item'
        }
      ],
      fixedText: [],
      demoOwned
    },
    stored
  }
}

function kit() {
  const a = lessonBlock(CARD, 'article-7')
  const b = lessonBlock(OTHER, 'article-8', { owner: false })
  return {
    pageGroups: [{ id: 'group-lessons' }],
    pages: [
      { id: 'page-kayak', group: 'group-lessons', blocks: { 1440: [CARD] } },
      { id: 'page-canoe', group: 'group-lessons', blocks: { 1440: [OTHER] } }
    ],
    blocks: [a.block, b.block],
    storedFields: [...a.stored, ...b.stored],
    site: { nameSlots: [] }
  }
}

const brief = () => ({
  facts: [{ id: 'fact_kayak', field: 'services', value: 'Kayak lessons', source: 'stated' }],
  missing: []
})

const write = (slot) => ({
  slot,
  says: 'a line about paddling',
  basis: 'trade',
  factIds: [],
  maxCharacters: 80
})

// A block decision that writes every printed field and hides only the slots in `hide`.
function decision(block, item, { hide = [], hideLink = false, hideLinks = [] } = {}) {
  const hidden = new Set(hide)
  const textSlots = [`${item}.0`]
  for (const row of [0, 1, 2]) textSlots.push(`${item}.${10 + row * 10}`, `${item}.${11 + row * 10}`)
  const listItem = (i) => ({
    about: 'a river trip',
    proof: { how: '', factIds: ['fact_kayak'] },
    pictures: hidden.has(`${item}.p${i}`)
      ? []
      : [{ kind: 'photo', frame: `${item}.p${i}`, shows: 'a kayak' }],
    copy: hidden.has(`${item}.c${i}`) ? [] : [write(`${item}.c${i}`)]
  })
  return {
    block,
    seen: 'a heading, three feature cards, a gallery and a button',
    decision: 'keep',
    why: 'the club teaches paddling',
    copy: [
      ...textSlots.filter((s) => !hidden.has(s)).map(write),
      ...[LABEL, `${item}.trial`]
        .filter((s) => !hidden.has(s))
        .map((s) => ({ ...write(s), text: 'Book now' }))
    ],
    hiddenSlots: [
      ...hide.map((slot) => ({ slot, why: 'not for this business' })),
      ...(hideLink ? [{ slot: `${block}.link-1`, why: 'no booking button' }] : []),
      ...hideLinks.map((n) => ({ slot: `${block}.link-${n}`, why: 'no such offer' }))
    ],
    links: [
      ...(hideLink ? [] : [{ link: `${block}.link-1`, leadsTo: 'contact', labelSlot: LABEL }]),
      ...(hideLinks.includes(2)
        ? []
        : [{ link: `${block}.link-2`, leadsTo: 'contact', labelSlot: `${item}.trial` }])
    ],
    lists: [{ list: `${item}.gallery`, rows: 2, items: [listItem(0), listItem(1)] }]
  }
}

function plan({ kayak = {}, canoe = {} } = {}) {
  return {
    version: 'site-plan/3',
    pageGroups: [{ id: 'group-lessons', decision: 'keep', why: 'the club teaches' }],
    pages: [
      { id: 'page-kayak', decision: 'keep', why: 'lessons', blocks: [decision(CARD, 'article-7', kayak)] },
      { id: 'page-canoe', decision: 'keep', why: 'lessons', blocks: [decision(OTHER, 'article-8', canoe)] }
    ],
    sharedBlocks: []
  }
}

const rules = (p) => checkPlan({ plan: p, kit: kit(), brief: brief() }).rules
const rule = (id, p) => rules(p).find((r) => r.id === id)

test('R23 a description hidden in two kept cards while the third card keeps its own fails once per slot', () => {
  const r = rule('R23', plan({ kayak: { hide: ['article-7.11', 'article-7.21'] } }))
  assert.equal(r?.status, 'fail')
  assert.equal(r.failures.length, 2)
  assert.match(r.failures[0].where, /page page-kayak \/ block body-lesson-kayak \/ slot article-7\.11/)
  assert.match(r.failures[0].detail, /article-7\.11/)
  assert.match(r.failures[0].detail, /article-7\.10/)
  assert.match(r.failures[0].detail, /drop the whole row/)
  assert.match(r.failures[0].detail, /from trade knowledge without any number/)
  assert.equal(r.failures[0].cause, 'plan')
})

test('R23 a picture or text hidden in one kept row of a kit list fails', () => {
  const r = rule('R23', plan({ canoe: { hide: ['article-8.c0'] } }))
  assert.equal(r?.status, 'fail')
  assert.equal(r.failures.length, 1)
  assert.match(r.failures[0].where, /slot article-8\.c0/)
  assert.match(r.failures[0].detail, /list article-8\.gallery/)
})

test('R23 a whole row dropped passes', () => {
  assert.equal(rule('R23', plan({ kayak: { hide: ['article-7.20', 'article-7.21'] } }))?.status, 'pass')
})

test('R23 a field dropped from every kept row of its list passes', () => {
  const r = rule('R23', plan({ kayak: { hide: ['article-7.11', 'article-7.21', 'article-7.31'] } }))
  assert.equal(r?.status, 'pass')
})

test('R23 video ids, link urls and fields the demo leaves empty may be hidden in a kept row', () => {
  const r = rule('R23', plan({ kayak: { hide: ['article-7.13', 'article-7.14', 'article-7.15'] } }))
  assert.equal(r?.status, 'pass')
})

test('R23 the plan that hides nothing passes', () => {
  assert.equal(rule('R23', plan())?.status, 'pass')
})

test('R24 a shared button label hidden on one page while both buttons stay fails on each page', () => {
  const r = rule('R24', plan({ kayak: { hide: [LABEL] } }))
  assert.equal(r?.status, 'fail')
  assert.equal(r.failures.length, 2)
  const where = r.failures.map((f) => f.where).join(' | ')
  assert.match(where, /page page-kayak \/ block body-lesson-kayak \/ link body-lesson-kayak\.link-1/)
  assert.match(where, /page page-canoe \/ block body-lesson-canoe \/ link body-lesson-canoe\.link-1/)
  assert.match(r.failures[0].detail, /string-book-now/)
  assert.match(r.failures[0].detail, /shared by body-lesson-kayak, body-lesson-canoe/)
  assert.match(r.failures[0].detail, /write the label in copy with text that fits every page/)
  assert.equal(r.failures[0].cause, 'plan')
})

// The real case: the planner hid the shared label and every button that prints it; the buttons stayed, without words.
test('R24 a shared label hidden together with every control that prints it still fails: write it', () => {
  const r = rule('R24', plan({ kayak: { hide: [LABEL], hideLink: true }, canoe: { hideLink: true } }))
  assert.equal(r?.status, 'fail')
  assert.equal(r.failures.length, 2)
  assert.match(r.failures[0].detail, /never hide it/)
})

test('R24 a button label of one block hidden while its button stays fails', () => {
  const r = rule('R24', plan({ canoe: { hide: ['article-8.trial'] } }))
  assert.equal(r?.status, 'fail')
  assert.equal(r.failures.length, 1)
  assert.match(r.failures[0].where, /link body-lesson-canoe\.link-2/)
  assert.match(r.failures[0].detail, /write the label, or hide the control itself/)
})

test('R24 a button label of one block hidden together with its button passes', () => {
  assert.equal(rule('R24', plan({ canoe: { hide: ['article-8.trial'], hideLinks: [2] } }))?.status, 'pass')
})

test('R24 a menu item label hidden is left to the menu rules', () => {
  assert.equal(rule('R24', plan({ canoe: { hide: ['article-8.menu'] } }))?.status, 'pass')
})

test('R24 the plan that hides no label passes', () => {
  assert.equal(rule('R24', plan())?.status, 'pass')
})
