// The final checks run from the site build rules registry (spec TracyHQ/tracy#189): every check a rule names exists, no
// check is left without a rule, the screen names every blocker rule, and the rules that had no check now have one.
// Two made-up businesses of other trades: a bicycle repair shop and a tea room.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { BUILD_RULES, blockerRules, checkIdsOf } from 'website-opportunities/domain/build-rules.mjs'
import { checkDemoLeftovers } from 'website-opportunities/domain/demo-leftovers.mjs'
import { CHECKS, runRuleChecks } from '../src/opportunities-build/build-rule-checks.js'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'
import { checkRecordPictures } from '../src/opportunities-build/record-picture-check.js'
import {
  checkBookingButtons,
  checkDemoNameAddresses,
  checkIconRows
} from '../src/opportunities-build/rule-gap-checks.js'

test('every check a rule names is implemented, and every implemented check belongs to a rule', async () => {
  assert.deepEqual(Object.keys(CHECKS).sort(), [...checkIdsOf()].sort())
  for (const rule of BUILD_RULES)
    for (const id of rule.checks) assert.equal(typeof CHECKS[id], 'function', `${rule.id} names ${id}`)
  await assert.rejects(
    runRuleChecks(/** @type {any} */ ({ pages: [] }), ['no-such-check']),
    /has no implementation/
  )
})

test('the build screen names every blocker rule of the registry', () => {
  const status = readFileSync(
    new URL('../../../packages/site/tracy-website-opportunities/src/client/status.ts', import.meta.url),
    'utf8'
  )
  const keys = status.slice(status.indexOf('const FIX_KEYS'), status.indexOf('export function fixKey'))
  for (const rule of blockerRules()) assert.match(keys, new RegExp(`'${rule.id}':`), rule.id)
})

const card = (icon, title) =>
  `<div class="card"><i class="${icon}"></i><h3>${title}</h3><p>A short line about ${title}.</p></div>`

test('rule 4: a row whose icons mix meanings and repeats is named; one icon per item or one for all is fine', () => {
  const mixed = `<section><div class="row">${card('fa fa-wrench', 'Tune-up')}${card('fa fa-wrench', 'Wheel truing')}${card('fa fa-star', 'Fitting')}</div></section>`
  const meaning = `<section><div class="row">${card('fa fa-wrench', 'Tune-up')}${card('fa fa-circle', 'Wheel truing')}${card('fa fa-ruler', 'Fitting')}</div></section>`
  const neutral = `<section><div class="row">${card('fa fa-leaf', 'Oolong')}${card('fa fa-leaf', 'Sencha')}${card('fa fa-leaf', 'Assam')}</div></section>`
  const found = checkIconRows({
    pages: [
      { path: '/', status: 200, html: mixed },
      { path: '/services', status: 200, html: meaning },
      { path: '/teas', status: 200, html: neutral }
    ]
  })
  assert.deepEqual(
    found.map((f) => [f.kind, f.page]),
    [['icon-row-mixed', '/']]
  )
})

test('a booking or contact button leads to the kept Contact page or a channel, never to another page', () => {
  const sitePlan = { pages: [{ role: 'contact', decision: 'keep', path: '/visit-us' }] }
  const html =
    '<a class="btn btn-primary" href="/teas">Book a tasting</a>' +
    '<a class="btn" href="/index.php/visit-us">Contact us</a>' +
    '<a class="btn" href="tel:+15550104477">Call us</a>' +
    '<a class="btn" href="https://booking.example/tea-room">Reserve a table</a>' +
    '<a class="btn" href="/teas">See our teas</a>'
  const found = checkBookingButtons({ pages: [{ path: '/', status: 200, html }], sitePlan })
  assert.deepEqual(
    found.map((f) => f.found),
    ['Book a tasting -> /teas']
  )
  assert.deepEqual(checkBookingButtons({ pages: [{ path: '/', status: 200, html }], sitePlan: null }), [])
})

test('a page address that still carries a demo person the page no longer shows is named, in every CMS', () => {
  const contentMap = { slots: [{ key: 'article-4.2', role: 'person.name', sample: 'Marta Velling' }] }
  const found = checkDemoNameAddresses({
    contentMap,
    pages: [
      { path: '/team/marta-velling', status: 200, html: '<h1>Owen Hart</h1><p>Lead mechanic.</p>' },
      { path: '/team/owen-hart', status: 200, html: '<h1>Owen Hart</h1>' },
      { path: '/about/marta-velling', status: 200, html: '<h1>Marta Velling</h1>' }
    ]
  })
  assert.deepEqual(
    found.map((f) => [f.page, f.found]),
    [['/team/marta-velling', 'marta-velling']]
  )
})

const recordPage = (pictures) =>
  `<main>${['Overview', 'What you get', 'Prices']
    .map(
      (h, i) =>
        `<section class="s${i}"><h2>${h}</h2><img src="${pictures[i]}"><p>Words of section ${i}.</p></section>`
    )
    .join('')}</main>`

test("rule 2: a picture of one record's page standing in another section of its sibling is a blocker", () => {
  const found = checkRecordPictures({
    pages: [
      {
        path: '/teas/oolong',
        status: 200,
        html: recordPage(['/i/oolong.jpg', '/i/oolong-cup.jpg', '/i/pot.jpg'])
      },
      {
        path: '/teas/sencha',
        status: 200,
        html: recordPage(['/i/sencha.jpg', '/i/oolong.jpg', '/i/kettle.jpg'])
      }
    ]
  })
  assert.deepEqual(
    found.map((f) => [f.kind, f.page, f.found, f.severity]),
    [['record-picture-shared', '/teas/sencha', '/i/oolong.jpg', 'blocker']]
  )
})

test('the final report tags each finding with its rule and carries the new checks', async () => {
  const pages = {
    '/': {
      status: 200,
      html: `<main><div class="row">${card('fa fa-wrench', 'Tune-up')}${card('fa fa-wrench', 'Brakes')}${card('fa fa-star', 'Fitting')}</div><a class="btn" href="/repairs">Book a repair</a><a href="/repairs">Repairs</a><a href="/contact">Contact</a></main>`
    },
    '/repairs': { status: 200, html: '<main><h1>Repairs</h1></main>' },
    '/contact': { status: 200, html: '<main><h1>Contact</h1></main>' }
  }
  const report = await runLeftoverCheck({
    readPage: async (path) => pages[path] ?? { status: 404, html: '' },
    check: checkDemoLeftovers,
    contentMap: { slots: [] },
    brief: {},
    sitePlan: { pages: [{ role: 'contact', decision: 'keep', path: '/contact' }] },
    paths: ['/repairs', '/contact']
  })
  const ofKind = (kind) => report.findings.find((f) => f.kind === kind)
  assert.equal(ofKind('icon-row-mixed')?.rule, 'icons-per-meaning')
  assert.equal(ofKind('booking-button-target')?.rule, 'booking-buttons')
  assert.equal(report.pass, false)
  assert.deepEqual(report.ruleGaps.map((f) => f.kind).sort(), ['booking-button-target', 'icon-row-mixed'])
})
