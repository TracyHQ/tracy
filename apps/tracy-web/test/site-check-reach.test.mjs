// The reach measures of the site check (plan-links.js, reach-measures.js) on invented pages: a kept link printed or lost, an end
// action, a list with an empty item, a map at the demo's place, a phone outside a tel: link. Every business word is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { judgePlanLinks, leadsTo, planLinksGroup } from '../src/site-check/plan-links.js'
import { stepName } from '../src/lib/site-build-steps.js'
import {
  judgeListRows,
  judgeMapLocation,
  judgePhoneCallable,
  kmBetween,
  listRowsGroup,
  mapLocationGroup,
  phoneCallableGroup
} from '../src/site-check/reach-measures.js'

const ORIGIN = 'https://studio.example'
const report = () => ({
  keptPages: [
    { id: 'page-home', path: '/' },
    { id: 'page-lesson', path: '/tennis' },
    { id: 'page-contact', path: '/contact' }
  ],
  slots: [
    { slot: 'lang-1.0', key: 'lang-1.0', status: 'written', ordered: 'Book a lesson' },
    { slot: 'body-lesson.link-2', key: null, status: 'refused', reason: 'no door' },
    { slot: 'block-1.8', key: 'module-1.8', status: 'written', ordered: 'Ana Ruiz' },
    { slot: 'block-1.9', key: 'module-1.9', status: 'written', ordered: 'Ben Olsen' }
  ],
  planLinks: [
    {
      link: 'body-lesson.link-2',
      block: 'body-lesson',
      pages: ['page-lesson'],
      leadsTo: 'page-contact',
      target: { kind: 'page', page: 'page-contact' },
      labelSlot: 'lang-1.0',
      deadControl: true
    },
    {
      link: 'header.link-1',
      block: 'header',
      pages: ['page-home', 'page-lesson'],
      leadsTo: 'phone:f-1',
      target: { kind: 'phone', digits: '0005550199' },
      labelSlot: null
    }
  ],
  endActions: [
    { page: 'page-home', leadsTo: 'page-contact', target: { kind: 'page', page: 'page-contact' } }
  ],
  rows: [
    {
      block: 'block-1',
      list: 'block-1.person',
      plan: 2,
      demo: 8,
      kept: 4,
      keptKeys: ['module-1.8', 'module-1.9']
    }
  ],
  phones: ['0005550199'],
  place: { latitude: 12.5, longitude: -3.25 }
})
const page = (path, extra = {}) => ({
  path,
  width: 1440,
  shownLinks: [],
  lists: [],
  maps: [],
  phones: [],
  ...extra
})

test('a kept link printed with its words and target passes; a dead control the template prints blocks on the template', () => {
  const measures = [
    page('/', {
      shownLinks: [
        { href: 'tel:+0005550199', text: 'Call' },
        { href: `${ORIGIN}/contact`, text: 'Visit' }
      ]
    }),
    page('/index.php/tennis', {
      shownLinks: [
        { href: `${ORIGIN}/tennis#`, text: 'Book a lesson' },
        { href: 'tel:0005550199', text: '' }
      ]
    })
  ]
  const { checked, failures } = judgePlanLinks(report(), measures)
  assert.equal(checked, 3)
  assert.equal(failures.length, 1)
  assert.equal(failures[0].slot, 'body-lesson.link-2')
  assert.equal(failures[0].causingStep, 0)
  assert.match(failures[0].reason, /deadControls/)
  const fixed = [
    measures[0],
    page('/tennis', {
      shownLinks: [
        { href: `${ORIGIN}/index.php/contact`, text: ' Book  a lesson' },
        { href: 'tel:0005550199' }
      ]
    })
  ]
  assert.deepEqual(judgePlanLinks(report(), fixed).failures, [])
})

test('the words must be the plan label, and a link that left with its row is not held to the page', () => {
  const r = report()
  r.planLinks[0].deadControl = false
  const measures = [
    page('/', { shownLinks: [{ href: 'tel:0005550199' }, { href: `${ORIGIN}/contact` }] }),
    page('/tennis', {
      shownLinks: [{ href: `${ORIGIN}/contact`, text: 'Contact' }, { href: 'tel:0005550199' }]
    })
  ]
  const [wrong] = judgePlanLinks(r, measures).failures
  assert.equal(wrong.causingStep, 9)
  r.slots[1].status = 'hidden'
  assert.deepEqual(judgePlanLinks(r, measures).failures, [])
})

test('an end action nothing on its page leads to blocks; addresses resolve as the site prints them', () => {
  const r = report()
  r.planLinks = []
  const { failures } = judgePlanLinks(r, [page('/', { shownLinks: [{ href: `${ORIGIN}/tennis` }] })])
  assert.equal(failures[0].slot, 'page-home:endAction')
  const kept = new Map([['page-contact', '/contact']])
  assert.equal(
    leadsTo('mailto:Desk@Studio.example', { kind: 'address', url: 'mailto:desk@studio.example' }, kept),
    true
  )
  assert.equal(leadsTo(`${ORIGIN}/contact/`, { kind: 'page', page: 'page-contact' }, kept), true)
  assert.equal(leadsTo('#', { kind: 'page', page: 'page-contact' }, kept), false)
})

test('a list printing more items than the plan keeps, or an empty one, blocks', () => {
  const card = (text) => ({ chars: text.length, text, pictures: text ? 1 : 0 })
  const four = [
    page('/team', {
      lists: [
        { selector: 'div.teams>div.card', items: [card('Ana Ruiz'), card('Ben Olsen'), card(''), card('')] }
      ]
    })
  ]
  const { checked, failures } = judgeListRows(report(), four)
  assert.equal(checked, 1)
  assert.deepEqual(
    failures.map((f) => f.measured),
    [4, 2]
  )
  const two = [
    page('/team', {
      lists: [{ selector: 'div.teams>div.card', items: [card('Ana Ruiz'), card('Ben Olsen')] }]
    })
  ]
  assert.deepEqual(judgeListRows(report(), two).failures, [])
  assert.deepEqual(judgeListRows(report(), [page('/team')]).unread, ['block-1.person'])
})

test('a map at the demo place blocks, and so does one far from the business; one near it passes', () => {
  const demoMaps = [{ page: '/contact', lat: 40.7049955, lng: -74.0069912 }]
  const at = (lat, lng) => [page('/contact', { maps: [{ kind: 'script', lat, lng }] })]
  assert.match(judgeMapLocation(at(40.705, -74.007), { demoMaps }).failures[0].reason, /demo's place/)
  assert.match(
    judgeMapLocation(at(20, 10), { demoMaps, place: { latitude: 12.5, longitude: -3.25 } }).failures[0]
      .reason,
    /km from the business/
  )
  assert.deepEqual(
    judgeMapLocation(at(12.51, -3.26), { demoMaps, place: { latitude: 12.5, longitude: -3.25 } }).failures,
    []
  )
  const address = [page('/contact', { maps: [{ kind: 'link', address: 'Wall Rd' }] })]
  assert.equal(judgeMapLocation(address, { demoMaps: [{ address: 'wall rd' }] }).failures.length, 1)
  assert.ok(Math.abs(kmBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111.2) < 0.5)
})

test('a brief phone printed outside a tel: link blocks on the template; another number is not judged', () => {
  const measures = [
    page('/contact', {
      phones: [
        { text: '+000 555 0199', digits: '0005550199', inTel: false, selector: 'span.contact-telephone' },
        { text: '+000 555 0199', digits: '0005550199', inTel: true, selector: 'a' },
        { text: '1234567890', digits: '1234567890', inTel: false, selector: 'span' }
      ]
    })
  ]
  const { checked, failures } = judgePhoneCallable(measures, ['0005550199'])
  assert.equal(checked, 2)
  assert.equal(failures.length, 1)
  assert.match(failures[0].reason, /span\.contact-telephone/)
})

test('the groups: an older report or host is unmeasured, nothing to hold is no measure, causing steps as decided', async () => {
  const context = (r, measures) => ({
    report: { ...r, site: 'x' },
    baseline: null,
    read: async () => ({ ok: true, pages: [{ route: '/contact', entity: 'menuItem-1' }] }),
    host: async () => ({ checks: [], pageMeasures: measures, visited: [] })
  })
  await assert.rejects(planLinksGroup.run(context({ slots: [] }, [])), /keeps no plan links/)
  assert.deepEqual(await listRowsGroup.run(context({ slots: [] }, [])), {
    checked: 0,
    notApplicable: 'the plan cuts no list',
    failures: []
  })
  assert.deepEqual(await phoneCallableGroup.run(context({ slots: [] }, [])), {
    checked: 0,
    notApplicable: 'the write report names no brief phone number',
    failures: []
  })
  await assert.rejects(
    mapLocationGroup.run(
      context({ slots: [], keptPages: [{ id: 'p', path: '/contact' }] }, [{ path: '/contact', width: 1440 }])
    ),
    /no maps/
  )
  assert.equal(stepName(planLinksGroup.causingStep), 'write')
  assert.equal(stepName(phoneCallableGroup.causingStep), 'template')
})

// Card AH: a word the row wrote that another block on the same page also prints ("Coach") found the wrong list, and a block was
// measured on a page that does not print it. Invented club and names.
test('list-rows reads only the row block, only on pages that print it, and leaves out words another block there writes', async () => {
  const card = (text) => ({ chars: text.length, text, pictures: 1 })
  const lines = [
    { slot: 'block-40.1', key: 'module-40.1', status: 'written', ordered: 'Lina' },
    { slot: 'block-40.2', key: 'module-40.2', status: 'written', ordered: 'Coach' },
    { slot: 'block-40.3', key: 'module-40.3', status: 'written', ordered: 'Omar' },
    { slot: 'block-40.4', key: 'module-40.4', status: 'written', ordered: 'Coach' },
    {
      slot: 'block-41.1',
      key: 'module-41.1',
      status: 'written',
      ordered: 'Coach Rui runs the morning class'
    },
    { slot: 'block-41.2', key: 'module-41.2', status: 'written', ordered: 'Every coach holds a licence' }
  ]
  const rows = [
    {
      block: 'block-40',
      list: 'block-40.person',
      plan: 2,
      demo: 4,
      kept: 2,
      keptKeys: ['module-40.1', 'module-40.2', 'module-40.3', 'module-40.4']
    },
    { block: 'block-42', list: 'block-42.person', plan: 2, demo: 4, kept: 2, keptKeys: ['module-42.1'] }
  ]
  const r = {
    slots: [...lines, { slot: 'block-42.1', key: 'module-42.1', status: 'written', ordered: 'Lina' }],
    rows
  }
  const home = page('/', {
    width: 390,
    lists: [
      { selector: 'div.team>div.card', items: [card('Lina Coach'), card('Omar Coach')] },
      {
        selector: 'div.notes>p',
        items: [
          card('Coach Rui runs the morning class'),
          card('Every coach holds a licence'),
          card('Coach Tia'),
          card('Coach Bo')
        ]
      }
    ]
  })
  // Block 40 is printed on the home page; block 41 too; block 42 only on /team, which no measure read.
  const pagesOf = new Map([
    ['module-40', new Set(['/'])],
    ['module-41', new Set(['/'])],
    ['module-42', new Set(['/team'])]
  ])
  const { checked, failures, unread } = judgeListRows(r, [home], { pagesOf })
  assert.equal(checked, 1)
  assert.deepEqual(failures, [])
  assert.deepEqual(unread, ['block-42.person'])
  // The group: a list it cannot place on a page that prints its block is unmeasured, never a guess.
  const group = await listRowsGroup
    .run({
      report: { ...r, rows: [rows[1]], site: 'x' },
      baseline: null,
      read: async () => ({
        ok: true,
        pages: [
          { route: 'home', entity: 'menuItem-1', assignedModules: [{ entity: 'module-40' }] },
          { route: 'team', entity: 'menuItem-2', assignedModules: [{ entity: 'module-42' }] }
        ]
      }),
      host: async () => ({ checks: [], pageMeasures: [home], visited: [] })
    })
    .catch((e) => e)
  assert.match(String(group?.message), /was found printed|nothing was measured/)
})

// Card AH follow-up, 2026-11-06: on a team page the masthead's words name both coaches ("Lina and Omar coach ..."), so leaving out
// every word another block's sentence holds left the team list no word at all and it was "not found printed" at both widths.
// Markup and names are invented, shaped like a T4 team module under a masthead.
test('a row whose names another block also says in a sentence is still found, and measured at each width', () => {
  const card = (text) => ({ chars: text.length, text, pictures: 1 })
  const r = {
    slots: [
      { slot: 'block-60.8', key: 'module-60.8', status: 'written', ordered: 'Lina' },
      { slot: 'block-60.24', key: 'module-60.24', status: 'written', ordered: 'Coach' },
      { slot: 'block-60.9', key: 'module-60.9', status: 'written', ordered: 'Omar' },
      { slot: 'block-60.25', key: 'module-60.25', status: 'written', ordered: 'Coach' },
      {
        slot: 'block-61.desc',
        key: 'module-61.3',
        status: 'written',
        ordered: 'Lina and Omar coach rowing and sailing for every age.'
      }
    ],
    rows: [
      {
        block: 'block-60',
        list: 'block-60.person',
        plan: 2,
        demo: 8,
        kept: 2,
        keptKeys: ['module-60.8', 'module-60.24', 'module-60.9', 'module-60.25']
      }
    ]
  }
  const team = (width) =>
    page('/about/coaches', {
      width,
      lists: [
        { selector: 'div.acm-teams>div.row>div.item', items: [card('Lina Coach'), card('Omar Coach')] },
        { selector: 'ul.t4-nav>li', items: [card('Home'), card('About'), card('Coaches'), card('Contact')] }
      ]
    })
  const pagesOf = new Map([
    ['module-60', new Set(['/about/coaches'])],
    ['module-61', new Set(['/about/coaches'])]
  ])
  const { checked, failures, unread } = judgeListRows(r, [team(1440), team(390)], { pagesOf })
  assert.deepEqual([checked, failures, unread], [1, [], []])
  const three = { ...r, rows: [{ ...r.rows[0], plan: 3, demo: 8 }] }
  assert.deepEqual(
    judgeListRows(three, [team(1440), team(390)], { pagesOf }).failures.map((f) => [f.width, f.measured]),
    [
      [1440, 2],
      [390, 2]
    ],
    'each width is measured'
  )
})

test('list-rows that finds most of its lists nowhere is unmeasured, not green', async () => {
  const card = (text) => ({ chars: text.length, text, pictures: 1 })
  const rows = ['block-70', 'block-71', 'block-72'].map((block) => ({
    block,
    list: `${block}.item`,
    plan: 1,
    demo: 3,
    kept: 1,
    keptKeys: [`${block.replace('block-', 'module-')}.1`]
  }))
  const r = {
    site: 'x',
    rows,
    slots: [
      { slot: 'block-70.1', key: 'module-70.1', status: 'written', ordered: 'Harbour walks' },
      { slot: 'block-71.1', key: 'module-71.1', status: 'written', ordered: 'Night swims' },
      { slot: 'block-72.1', key: 'module-72.1', status: 'written', ordered: 'Kayak days' }
    ]
  }
  const home = page('/', { lists: [{ selector: 'div.items>div', items: [card('Harbour walks')] }] })
  const context = {
    report: r,
    baseline: null,
    read: async () => ({
      ok: true,
      pages: [
        {
          route: 'home',
          entity: 'menuItem-1',
          assignedModules: [{ entity: 'module-70' }, { entity: 'module-71' }, { entity: 'module-72' }]
        }
      ]
    }),
    host: async () => ({ checks: [], pageMeasures: [home], visited: [] })
  }
  await assert.rejects(listRowsGroup.run(context), /Only 1 of the 3 lists.*block-71\.item, block-72\.item/)
})
