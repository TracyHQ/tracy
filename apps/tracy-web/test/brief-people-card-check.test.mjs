import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDemoLeftovers } from 'website-opportunities/domain/demo-leftovers.mjs'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'

const cases = [
  { name: 'Brightwater Dental', person: 'Mara Vale', role: 'Dentist' },
  { name: 'Crumb and Kettle', person: 'Elsie Reed', role: 'Baker' }
]
const card = (name, role, attrs = '') =>
  `<div class="team-item" ${attrs}><img src="/images/initials.png"><div><h4>${name}</h4><p>${role}</p></div></div>`

async function check(trade, html) {
  const contentMap = {
    slots: ['person.name', 'person.role', 'person.image'].map((role, i) => ({
      key: `module-40.${i}`,
      entity: 'module-40',
      role,
      type: role === 'person.image' ? 'image' : 'text',
      sample: role === 'person.image' ? 'images/demo/person.jpg' : 'Demo person',
      group: { id: 'module-40.person.0', item: 0, kind: 'person' }
    }))
  }
  return runLeftoverCheck({
    readPage: async (path) =>
      path === '/' ? { status: 200, html: `<div id="Mod40">${html}</div>` } : { status: 404, html: '' },
    check: checkDemoLeftovers,
    contentMap,
    brief: {
      business: { name: trade.name },
      reading: { team: [{ id: 'p1', label: trade.person, role: trade.role }] }
    }
  })
}

for (const trade of cases) {
  test(`${trade.name}: the post-build check rejects an avatar with an empty visible name`, async () => {
    const report = await check(trade, card('', trade.role))
    assert.equal(report.pass, false)
    assert.ok(report.findings.some((f) => f.kind === 'C07' && /name/i.test(f.found)))
    assert.equal(report.counts.C07, 1)
  })
  test(`${trade.name}: an accepted name beside its avatar passes`, async () => {
    const report = await check(trade, card(trade.person, trade.role))
    assert.equal(report.pass, true)
    assert.equal(report.counts.C07, 0)
  })
}

test('a name elsewhere on the page never supplies the name of an empty card', async () => {
  const report = await check(cases[0], `<p>${cases[0].person}</p>${card('', cases[0].role)}`)
  assert.equal(report.counts.C07, 1)
})

test('one named card never supplies the name of another avatar', async () => {
  const report = await check(cases[0], card(cases[0].person, cases[0].role) + card('', cases[0].role))
  assert.equal(report.counts.C07, 1)
})

test('a hidden name is not a visible name', async () => {
  const report = await check(cases[0], card(`<span hidden>${cases[0].person}</span>`, cases[0].role))
  assert.equal(report.counts.C07, 1)
})

test('a removed card and an emptied list shell are no surviving people card', async () => {
  const report = await check(
    cases[0],
    card('', cases[0].role, 'hidden') + '<div class="team-item"><h4></h4></div>'
  )
  assert.equal(report.pass, true)
})

test('a name without its avatar is an incomplete people card', async () => {
  const report = await check(cases[0], `<div class="team-item"><h4>${cases[0].person}</h4></div>`)
  assert.equal(report.pass, false)
  assert.ok(report.findings.some((f) => f.kind === 'C07' && /avatar/i.test(f.found)))
})

test('a WordPress Person block is checked without a Joomla module wrapper', async () => {
  const report = await runLeftoverCheck({
    readPage: async (path) => ({
      status: path === '/' ? 200 : 404,
      html: '<section itemtype="https://schema.org/Person"><img src="/avatar.png"><h4></h4></section>'
    }),
    check: checkDemoLeftovers,
    contentMap: {
      slots: [{ key: 'post-9.0', entity: 'post-9', role: 'person.image', type: 'image', sample: 'demo.jpg' }]
    },
    brief: { reading: { team: [{ id: 'p1', label: cases[1].person }] } }
  })
  assert.equal(report.counts.C07, 1)
  assert.equal(report.pass, false)
})

test('a repeated module card needs its own name even without semantic card classes', async () => {
  const html = (card(cases[0].person, cases[0].role) + card('', cases[0].role)).replaceAll(
    'class="team-item"',
    ''
  )
  const report = await check(cases[0], html)
  assert.equal(report.counts.C07, 1)
})
