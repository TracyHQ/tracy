// The planner's round 0 in parts planned at the same time (plan-parts.js): page groups split in kit order, each part
// told its groups and what the first part alone plans, and the parts' plans merged into one plan.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mergePlanParts,
  parallelPagesProblem,
  partFirstMessages,
  planningParts,
  plansInParts,
  withMenuOnKeptPages
} from '../src/site-planner/plan-parts.js'

const page = (id, group, blocks) => ({ id, group, blocks: { 1440: ['header', ...blocks, 'footer'] } })
const kit = () => ({
  pageGroups: [
    { id: 'group-home', root: 'page-home' },
    { id: 'group-classes', root: 'page-classes' },
    { id: 'group-about', root: 'page-about' },
    { id: 'group-plans', root: 'page-plans' }
  ],
  pages: [
    page('page-home', 'group-home', ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']),
    page('page-classes', 'group-classes', ['c1', 'c2', 'c3']),
    page('page-classes_boxing', 'group-classes', ['c4']),
    page('page-about', 'group-about', ['a1', 'a2', 'a3']),
    page('page-plans', 'group-plans', ['p1', 'p2', 'p3'])
  ]
})

test('page groups are cut in kit order into parts of about the same size, the same way every time', () => {
  assert.deepEqual(planningParts(kit(), 2), [['group-home'], ['group-classes', 'group-about', 'group-plans']])
  assert.deepEqual(planningParts(kit(), 3), planningParts(kit(), 3))
  assert.equal(planningParts(kit(), 3).flat().length, 4)
  assert.deepEqual(planningParts(kit(), 9).length, 4)
  assert.deepEqual(planningParts(kit(), 1), [['group-home', 'group-classes', 'group-about', 'group-plans']])
  assert.equal(parallelPagesProblem(3), null)
  assert.match(parallelPagesProblem(0), /from 1 to 8/)
  assert.match(parallelPagesProblem(Number('x')), /from 1 to 8/)
  assert.equal(plansInParts({ parallelPages: 3 }), true)
  assert.equal(plansInParts({ parallelPages: 1 }), false)
  assert.equal(plansInParts({}), false)
})

test('each part starts from the run first message and is told its groups; only the first part plans the whole site', () => {
  const parts = planningParts(kit(), 2)
  const [one, two] = partFirstMessages('THE RUN FIRST MESSAGE', parts, kit())
  assert.ok(one.startsWith('THE RUN FIRST MESSAGE\n\n# Planning part 1 of 2'))
  assert.match(one, /Your part: the page groups group-home/)
  assert.match(one, /You also plan everything of the whole site: site, mainMenu, sharedBlocks/)
  assert.match(two, /Your part: the page groups group-classes, group-about, group-plans/)
  assert.match(two, /page-classes_boxing/)
  assert.match(two, /Part 1 plans everything of the whole site/)
  assert.match(two, /come back to you in this conversation/)
  const withImages = partFirstMessages([{ type: 'text', text: 'kit' }], parts, kit())
  assert.equal(withImages[1].length, 2)
  assert.match(withImages[1][1].text, /# Planning part 2 of 2/)
})

test('the merged plan takes the whole site from part 1, each part its own groups and pages in kit order', () => {
  const parts = planningParts(kit(), 2)
  const first = {
    version: 'site-plan/3',
    site: { language: 'en' },
    sharedBlocks: [{ block: 'header', decision: 'keep' }],
    mainMenu: [
      { page: 'page-home', children: [] },
      { page: 'page-classes', children: [{ page: 'page-classes_boxing' }] },
      { page: 'page-about', children: [] }
    ],
    pageGroups: [
      { id: 'group-home', decision: 'keep' },
      { id: 'group-about', decision: 'keep' }
    ],
    pages: [
      { id: 'page-home', decision: 'keep' },
      { id: 'page-about', decision: 'keep' }
    ],
    ownerTasks: [{ task: 'confirm hours' }],
    kitGaps: []
  }
  const second = {
    site: { language: 'xx' },
    sharedBlocks: [{ block: 'footer', decision: 'hide' }],
    pageGroups: [
      { id: 'group-plans', decision: 'keep' },
      { id: 'group-classes', decision: 'keep' },
      { id: 'group-about', decision: 'drop' }
    ],
    pages: [
      { id: 'page-plans', decision: 'keep' },
      { id: 'page-classes', decision: 'keep' },
      { id: 'page-classes_boxing', decision: 'drop' },
      { id: 'page-about', decision: 'drop' }
    ],
    ownerTasks: [{ task: 'confirm hours' }, { task: 'confirm prices' }],
    kitGaps: [{ gap: 'no price list' }]
  }
  const merged = mergePlanParts([first, second], parts, kit())
  assert.deepEqual(merged.site, { language: 'en' })
  assert.deepEqual(merged.sharedBlocks, first.sharedBlocks)
  assert.deepEqual(
    merged.pageGroups.map((g) => `${g.id}:${g.decision}`),
    ['group-home:keep', 'group-classes:keep', 'group-about:drop', 'group-plans:keep']
  )
  assert.deepEqual(
    merged.pages.map((p) => `${p.id}:${p.decision}`),
    ['page-home:keep', 'page-classes:keep', 'page-classes_boxing:drop', 'page-about:drop', 'page-plans:keep']
  )
  assert.deepEqual(merged.ownerTasks, [{ task: 'confirm hours' }, { task: 'confirm prices' }])
  assert.deepEqual(merged.kitGaps, [{ gap: 'no price list' }])
  // The menu keeps only pages some part kept.
  assert.deepEqual(merged.mainMenu, [
    { page: 'page-home', children: [] },
    { page: 'page-classes', children: [] }
  ])
  assert.equal(mergePlanParts([first], [parts.flat()], kit()), first)
})

test('a part with no plan leaves its groups out; a menu of kept pages is returned as it is', () => {
  const parts = planningParts(kit(), 2)
  const merged = mergePlanParts(
    [{ site: {}, pages: [{ id: 'page-home', decision: 'keep' }] }, null],
    parts,
    kit()
  )
  assert.deepEqual(
    merged.pages.map((p) => p.id),
    ['page-home']
  )
  const plan = {
    mainMenu: [{ page: 'page-home', children: [] }],
    pages: [{ id: 'page-home', decision: 'keep' }]
  }
  assert.strictEqual(withMenuOnKeptPages(plan), plan)
})
