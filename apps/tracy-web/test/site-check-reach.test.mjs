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
