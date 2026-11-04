// Fixtures for the main menu dropdowns of the site writer (ADR 0042): the invented Quay Fitness Studio kit and plan
// of _site-copy-check.mjs, given a header with four top-level menu labels, kit pages with paths, a main menu tree in a
// tiny invented content map, and a plan main menu that keeps some dropdown children and drops others.
//
//   home (10)           kept
//   classes (20)        kept    children: yoga (21) kept by the plan, spin (22) not kept
//   about (30)          kept    children: team (31) kept, team/nia (32) grandchild of a page the plan drops,
//                                         history (33) not kept, contact (34) kept and already labelled by block-6
//   prices (40)         hidden  child: prices/monthly (41)
//   footer-links (50)   another menu type: never part of the main menu
import {
  brief as baseBrief,
  copy as baseCopy,
  kit as baseKit,
  plan as basePlan
} from './_site-copy-check.mjs'

const label = (id, max, sample) => ({
  id,
  role: 'editorial.menu_label',
  type: 'text',
  maxCharacters: max,
  sample,
  paragraphs: 1,
  bullets: 0
})

const PAGES = [
  ['page-home', '/'],
  ['page-classes', '/classes'],
  ['page-classes_yoga', '/classes/yoga'],
  ['page-classes_spin', '/classes/spin'],
  ['page-about', '/about'],
  ['page-about_team', '/about/team'],
  ['page-about_team_nia', '/about/team/nia'],
  ['page-about_history', '/about/history'],
  ['page-about_contact', '/about/contact'],
  ['page-about_faq', '/about/faq'],
  ['page-prices', '/prices']
]

export function kit() {
  const k = baseKit()
  const header = k.blocks.find((b) => b.id === 'block-1')
  header.slots.push(
    label('menuItem-10.0', 20, 'Home'),
    label('menuItem-20.0', 24, 'Classes'),
    label('menuItem-30.0', 24, 'About'),
    label('menuItem-40.0', 24, 'Prices')
  )
  // The kit gives the team item its own limit (a mobile menu block lists it).
  k.blocks.push({
    id: 'block-7',
    role: 'mobile-menu',
    slots: [label('menuItem-31.0', 16, 'Our team')],
    lists: []
  })
  k.blocks.find((b) => b.id === 'block-6').slots.push(label('menuItem-34.0', 18, 'Contact'))
  k.pages = PAGES.map(([id, p]) => ({ id, path: p, inMainMenu: true }))
  return k
}

const item = (n, path, menutype = 'mainmenu') => ({
  key: `menuItem-${n}`,
  kind: 'menuItem',
  identity: { path, menutype, language: '*', client_id: '0' },
  sourceId: n
})
const slot = (n, sample, max = 40) => ({
  key: `menuItem-${n}.0`,
  entity: `menuItem-${n}`,
  column: 'title',
  type: 'text',
  sample,
  maxCharacters: max,
  role: 'editorial.menu_label'
})

export function contentMap() {
  return {
    entities: [
      item(10, 'home'),
      item(20, 'classes'),
      item(21, 'classes/yoga'),
      item(22, 'classes/spin'),
      item(30, 'about'),
      item(31, 'about/team'),
      item(32, 'about/team/nia'),
      item(33, 'about/history'),
      item(34, 'about/contact'),
      item(40, 'prices'),
      item(41, 'prices/monthly'),
      item(50, 'links', 'footer-links'),
      { key: 'module-9', kind: 'module', identity: { title: 'Main Menu' } }
    ],
    slots: [
      slot(10, 'Home'),
      slot(20, 'Classes'),
      slot(21, 'Yoga Flow'),
      slot(22, 'Spin Class'),
      slot(30, 'About'),
      slot(31, 'Our team'),
      slot(32, 'Nia Brook'),
      slot(33, 'Our history'),
      slot(34, 'Contact'),
      slot(40, 'Prices'),
      slot(41, 'Monthly'),
      slot(50, 'Links')
    ]
  }
}

export function plan() {
  const p = basePlan()
  const header = p.sharedBlocks[0]
  header.copy.push(
    { slot: 'menuItem-10.0', says: 'home label', text: 'Home', basis: 'trade' },
    { slot: 'menuItem-20.0', says: 'classes label', text: 'Classes', basis: 'trade' },
    { slot: 'menuItem-30.0', says: 'about label', text: 'About', basis: 'trade' }
  )
  header.hiddenSlots = [{ slot: 'menuItem-40.0', why: 'no prices in the brief' }]
  p.sharedBlocks.push({
    block: 'block-6',
    seen: 'seen',
    decision: 'keep',
    why: 'fits',
    copy: [{ slot: 'menuItem-34.0', says: 'contact link', text: 'Contact', basis: 'trade' }]
  })
  p.mainMenu = [
    { page: 'page-home', intent: 'Start here', children: [] },
    {
      page: 'page-classes',
      intent: 'The classes',
      children: [{ page: 'page-classes_yoga', intent: 'Slow morning yoga' }]
    },
    {
      page: 'page-about',
      intent: 'Who the studio is',
      children: [
        { page: 'page-about_team', intent: 'Meet the coaches' },
        { page: 'page-about_contact', intent: 'Get in touch' },
        { page: 'page-about_faq', intent: 'Common questions' }
      ]
    }
  ]
  return p
}

export const brief = baseBrief

/** The base passing copy plus the header labels, the footer contact label and the two dropdown labels. */
export function copy() {
  const c = baseCopy()
  c.slots.push(
    { slot: 'menuItem-10.0', owner: 'plan-label', text: 'Home', factIds: [] },
    { slot: 'menuItem-20.0', owner: 'plan-label', text: 'Classes', factIds: [] },
    { slot: 'menuItem-30.0', owner: 'plan-label', text: 'About', factIds: [] },
    { slot: 'menuItem-34.0', owner: 'plan-label', text: 'Contact', factIds: [] },
    { slot: 'menuItem-21.0', owner: 'writer', text: 'Yoga', factIds: [] },
    { slot: 'menuItem-31.0', owner: 'writer', text: 'Coaches', factIds: [] }
  )
  return c
}
