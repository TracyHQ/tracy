// The planner's round 0 in parts planned at the same time (plan-parts.js): the first part plans the whole site alone,
// the page groups are split in kit order over the others by what the planner writes for them, each part is told its
// groups or the whole site, and the parts' plans are merged into one plan.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  groupWeights,
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

test('the first part plans the whole site alone; page groups are cut in kit order over the others, the same way every time', () => {
  assert.deepEqual(planningParts(kit(), 2), [
    [],
    ['group-home', 'group-classes', 'group-about', 'group-plans']
  ])
  assert.deepEqual(planningParts(kit(), 3), [
    [],
    ['group-home'],
    ['group-classes', 'group-about', 'group-plans']
  ])
  assert.deepEqual(planningParts(kit(), 4), planningParts(kit(), 4))
  assert.equal(planningParts(kit(), 4).flat().length, 4)
  // At most one part per group, after the whole site's.
  assert.deepEqual(planningParts(kit(), 9), [
    [],
    ['group-home'],
    ['group-classes'],
    ['group-about'],
    ['group-plans']
  ])
  // One part plans everything, the whole site with its groups.
  assert.deepEqual(planningParts(kit(), 1), [['group-home', 'group-classes', 'group-about', 'group-plans']])
  assert.deepEqual(planningParts({ pageGroups: [], pages: [] }, 5), [[]])
  assert.equal(parallelPagesProblem(3), null)
  assert.match(parallelPagesProblem(0), /from 1 to 8/)
  assert.match(parallelPagesProblem(Number('x')), /from 1 to 8/)
  assert.equal(plansInParts({ parallelPages: 3 }), true)
  assert.equal(plansInParts({ parallelPages: 1 }), false)
  assert.equal(plansInParts({}), false)
})

test("a group weighs the blocks of all its pages that not every page shows; a group outside the kit's main menu weighs 1", () => {
  // No page in the main menu: every group by its blocks, its item pages too (page-classes_boxing).
  assert.deepEqual(Object.fromEntries(groupWeights(kit())), {
    'group-home': 6,
    'group-classes': 4,
    'group-about': 3,
    'group-plans': 3
  })
  // With a main menu, a group none of whose pages it links weighs 1, whatever it shows.
  const menu = kit()
  for (const p of menu.pages) p.inMainMenu = p.group === 'group-home' || p.group === 'group-about'
  assert.deepEqual(Object.fromEntries(groupWeights(menu)), {
    'group-home': 6,
    'group-classes': 1,
    'group-about': 3,
    'group-plans': 1
  })
  // The groups outside the menu go together, beside the heavy one.
  assert.deepEqual(planningParts(menu, 3), [
    [],
    ['group-home'],
    ['group-classes', 'group-about', 'group-plans']
  ])
})

test('each part starts from the run first message and is told its groups; the first plans the whole site and no group', () => {
  const parts = planningParts(kit(), 3)
  const [one, two, three] = partFirstMessages('THE RUN FIRST MESSAGE', parts, kit())
  assert.ok(one.startsWith('THE RUN FIRST MESSAGE\n\n# Planning part 1 of 3'))
  assert.match(one, /Your part: everything of the whole site, and no page group/)
  assert.match(one, /You also plan everything of the whole site: site, mainMenu, sharedBlocks/)
  assert.match(one, /- part 2: group-home\n- part 3: group-classes, group-about, group-plans/)
  assert.match(two, /Your part: the page groups group-home, and their pages \(page-home\)/)
  assert.doesNotMatch(two, /- part 1:/)
  assert.match(two, /Part 1 plans everything of the whole site/)
  assert.match(three, /Your part: the page groups group-classes, group-about, group-plans/)
  assert.match(three, /page-classes_boxing/)
  assert.match(three, /come back to you in this conversation/)
  assert.doesNotMatch(two, /come back to you in this conversation/)
  const withImages = partFirstMessages([{ type: 'text', text: 'kit' }], parts, kit())
  assert.equal(withImages[1].length, 2)
  assert.match(withImages[1][1].text, /# Planning part 2 of 3/)
})

test('the merged plan takes the whole site from part 1, each other part its own groups and pages in kit order', () => {
  const parts = planningParts(kit(), 3)
  const site = {
    version: 'site-plan/3',
    site: { language: 'en' },
    sharedBlocks: [{ block: 'header', decision: 'keep' }],
    mainMenu: [
      { page: 'page-home', children: [] },
      { page: 'page-classes', children: [{ page: 'page-classes_boxing' }] },
      { page: 'page-about', children: [] }
    ],
    // Not the first part's: left out.
    pageGroups: [{ id: 'group-home', decision: 'drop' }],
    pages: [{ id: 'page-home', decision: 'drop' }],
    ownerTasks: [{ task: 'confirm hours' }],
    kitGaps: []
  }
  const home = {
    site: { language: 'xx' },
    pageGroups: [
      { id: 'group-home', decision: 'keep' },
      { id: 'group-about', decision: 'keep' }
    ],
    pages: [
      { id: 'page-home', decision: 'keep' },
      { id: 'page-about', decision: 'keep' }
    ],
    ownerTasks: [{ task: 'confirm hours' }]
  }
  const rest = {
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
  const merged = mergePlanParts([site, home, rest], parts, kit())
  assert.deepEqual(merged.site, { language: 'en' })
  assert.deepEqual(merged.sharedBlocks, site.sharedBlocks)
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
  assert.equal(mergePlanParts([site], [parts.flat()], kit()), site)
})

test("a part with no plan leaves its groups out; a page in no group is the first part's; a menu of kept pages stays", () => {
  const parts = planningParts(kit(), 3)
  const merged = mergePlanParts(
    [
      { site: {}, pages: [{ id: 'page-privacy', decision: 'keep' }] },
      { pages: [{ id: 'page-home', decision: 'keep' }] },
      null
    ],
    parts,
    kit()
  )
  assert.deepEqual(
    merged.pages.map((p) => p.id),
    ['page-home', 'page-privacy']
  )
  const plan = {
    mainMenu: [{ page: 'page-home', children: [] }],
    pages: [{ id: 'page-home', decision: 'keep' }]
  }
  assert.strictEqual(withMenuOnKeptPages(plan), plan)
})
