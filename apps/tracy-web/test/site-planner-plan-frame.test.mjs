// The planner's round 0 as a frame, then its kept pages in parts (site-planner/plan-frame.js): what the frame and each
// part are told, how the kept groups are cut after the frame, and how the parts' pages are put into the frame (the
// frame's decisions win, a page outside a part's share is left out). An invented kit; no model, no database.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FRAME_PAGE_FIELDS,
  framedAssignment,
  framedPartMessage,
  framedPartsProblem,
  frameInstruction,
  framesPlan,
  mergeFramedPlan,
  PART_PAGE_FIELDS
} from '../src/site-planner/plan-frame.js'

const page = (id, group, blocks, inMainMenu = true) => ({
  id,
  group,
  inMainMenu,
  blocks: { 1440: ['header', ...blocks, 'footer'] }
})
const kit = {
  pageGroups: [
    { id: 'group-home', root: 'page-home' },
    { id: 'group-classes', root: 'page-classes' },
    { id: 'group-about', root: 'page-about' },
    { id: 'group-login', root: 'page-login' }
  ],
  pages: [
    page('page-home', 'group-home', ['b1', 'b2', 'b3', 'b4']),
    page('page-classes', 'group-classes', ['c1', 'c2']),
    page('page-classes_boxing', 'group-classes', ['c3']),
    page('page-about', 'group-about', ['a1', 'a2']),
    page('page-login', 'group-login', ['l1'], false)
  ]
}
const frame = {
  site: { language: 'en' },
  mainMenu: [{ page: 'page-home' }, { page: 'page-classes' }, { page: 'page-login' }],
  sharedBlocks: [{ block: 'header', decision: 'keep' }],
  pageGroups: [
    { id: 'group-home', decision: 'keep', slug: '' },
    { id: 'group-classes', decision: 'keep', slug: 'classes' },
    { id: 'group-about', decision: 'keep', slug: 'about' },
    { id: 'group-login', decision: 'drop' }
  ],
  pages: [
    { id: 'page-home', decision: 'keep', slug: '' },
    { id: 'page-classes', decision: 'keep', slug: 'classes' },
    { id: 'page-classes_boxing', decision: 'drop', why: 'no boxing class' },
    { id: 'page-about', decision: 'keep', slug: 'about-us' },
    { id: 'page-login', decision: 'drop' }
  ],
  ownerTasks: [{ what: 'confirm hours' }],
  kitGaps: []
}

test('a run plans as a frame only with 1 to 7 page parts', () => {
  assert.equal(framesPlan({ framedParts: 4 }), true)
  assert.equal(framesPlan({}), false)
  assert.equal(framesPlan({ framedParts: 0 }), false)
  assert.match(framedPartsProblem(8), /from 1 to 7/)
})

test('the frame is told to decide everything shared and only the frame fields of every page', () => {
  const text = frameInstruction(3)
  assert.match(text, /3 parts at the same time/)
  assert.match(text, new RegExp(`with only ${FRAME_PAGE_FIELDS.join(', ')}`))
  assert.match(text, new RegExp(`Leave out ${PART_PAGE_FIELDS.join(', ')}`))
  assert.match(text, /A part cannot change the frame/)
})

test('after the frame, only the kept groups with a kept page are cut into the parts, the same way every time', () => {
  const two = framedAssignment(frame, kit, 2)
  assert.deepEqual(two, [['group-home'], ['group-classes', 'group-about']])
  assert.deepEqual(framedAssignment(frame, kit, 2), two)
  // More parts than kept groups: the rest get none; a dropped group is in no part.
  assert.deepEqual(framedAssignment(frame, kit, 5), [
    ['group-home'],
    ['group-classes'],
    ['group-about'],
    [],
    []
  ])
  assert.deepEqual(framedAssignment({}, kit, 2), [[], []])
})

test('a part is told its kept pages and the frame; a part with no kept page gets no message', () => {
  const msg = framedPartMessage('THE RUN FIRST MESSAGE', frame, kit, 1, 2)
  assert.ok(msg.startsWith('THE RUN FIRST MESSAGE\n\n# Planning part 2 of 2, from the frame'))
  assert.match(
    msg,
    /Your part: the kept pages page-classes, page-about \(page groups group-classes, group-about\)/
  )
  assert.doesNotMatch(msg, /kept pages[^\n]*page-classes_boxing/, 'a page the frame drops is not asked for')
  assert.ok(msg.endsWith(JSON.stringify(frame)))
  assert.equal(framedPartMessage('X', frame, kit, 4, 5), null)
  const withImages = framedPartMessage([{ type: 'text', text: 'kit' }], frame, kit, 0, 2)
  assert.equal(withImages.length, 2)
  assert.match(withImages[1].text, /# Planning part 1 of 2/)
})

test("the parts' pages go into the frame: the frame's fields win, a page outside a part's share is left out", () => {
  const home = {
    pages: [
      {
        id: 'page-home',
        decision: 'drop',
        slug: 'start',
        keyMessage: 'Train with us',
        blocks: [{ block: 'b1' }]
      },
      // Not this part's page: left out.
      { id: 'page-about', keyMessage: 'stolen' }
    ],
    ownerTasks: [{ what: 'confirm hours' }, { what: 'send photos' }],
    site: { language: 'xx' }
  }
  const rest = {
    pages: [
      { id: 'page-classes', keyMessage: 'Classes for all', seo: { titleIntent: 'classes' } },
      // A page the frame drops: left out.
      { id: 'page-classes_boxing', keyMessage: 'Boxing' }
    ],
    kitGaps: [{ why: 'no price list' }]
  }
  const { plan, outside } = mergeFramedPlan([home, rest, frame], kit, 2)
  assert.equal(outside, 2)
  assert.deepEqual(plan.site, frame.site)
  assert.deepEqual(plan.sharedBlocks, frame.sharedBlocks)
  const byId = new Map(plan.pages.map((p) => [p.id, p]))
  assert.deepEqual(byId.get('page-home'), {
    id: 'page-home',
    decision: 'keep',
    slug: '',
    keyMessage: 'Train with us',
    blocks: [{ block: 'b1' }]
  })
  assert.equal(byId.get('page-classes').keyMessage, 'Classes for all')
  assert.deepEqual(
    byId.get('page-classes_boxing'),
    frame.pages[2],
    'a dropped page stays as the frame has it'
  )
  // Its part wrote nothing for it: the frame's entry stands.
  assert.deepEqual(byId.get('page-about'), frame.pages[3])
  assert.deepEqual(plan.ownerTasks, [{ what: 'confirm hours' }, { what: 'send photos' }])
  assert.deepEqual(plan.kitGaps, [{ why: 'no price list' }])
  // The menu keeps only pages the frame keeps.
  assert.deepEqual(
    plan.mainMenu.map((m) => m.page),
    ['page-home', 'page-classes']
  )
})
