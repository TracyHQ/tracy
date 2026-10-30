/**
 * 🔒 THE BRIEF DECIDES WHAT THE SITE HAS, WRITTEN ON A JOOMLA SITE (COO principle 30/10/2026, criteria 1.4 and 4.1, R12
 * group C). A released template's content map and its shipped module parameters, planned for two fictional businesses of
 * other trades (fewer offerings than the template's cards, no video, one social network, a team member with a role and no
 * bio), then written by the records and identity steps:
 *   - every record list module lists the brief's count, never the template's;
 *   - the person page's social items are emptied whole (icon and link), and the business's networks never fill them;
 *   - the person page's bio field is emptied; the role sits on the team cards;
 *   - the video tiles the brief has no video for are taken off (the block whole when none is left);
 *   - a grid column left empty is hidden and its row centres the columns kept (no hole beside the contact columns).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { planSite } from 'website-opportunities/domain/site-plan.mjs'
import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { emptyFramesOf } from '../src/lib/empty-frames.js'
import { planIdentitySteps } from '../src/sites/brief-engines/joomla-plan-identity.js'
import { recordSteps } from '../src/sites/brief-engines/joomla-plan-records.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const MAP = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
const LOCK = JSON.parse(readFileSync(path.join(contract.dir, 'presentation-lock.json'), 'utf8'))

/** The template's shipped module rows, as the site's records door reads them. */
function moduleRows() {
  const rows = new Map()
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (/^module-\d+$/.test(key) && value && typeof value.params === 'string') {
        const id = Number(key.split('-')[1])
        rows.set(id, {
          id,
          module: value.module,
          published: 1,
          language: '*',
          params: value.params,
          content: value.content
        })
      } else walk(value)
    }
  }
  walk(LOCK)
  return rows
}

const briefOf = ({ name, offerings, person, network }) => ({
  business: {
    name,
    description: `${name} serves its neighbourhood.`,
    socials: { [network.kind]: network.url }
  },
  primaryAction: { label: 'Book a visit', channel: 'contact', href: null, basis: 'sourced', evidence: [] },
  reading: {
    services: offerings.map((label, i) => ({ id: `s${i}`, label })),
    team: [{ id: 'p0', label: person.name, role: person.role }]
  }
})

const TRADES = [
  briefOf({
    name: 'Copperleaf Bakery',
    offerings: ['Sourdough loaves', 'Celebration cakes', 'Morning pastries'],
    person: { name: 'Ilse Varga', role: 'head baker' },
    network: { kind: 'instagram', url: 'https://www.instagram.com/copperleaf.bakery.example/' }
  }),
  briefOf({
    name: 'Brightmoor Dental',
    offerings: ['Check-ups', 'Teeth whitening'],
    person: { name: 'Tomas Reyes', role: 'hygienist' },
    network: { kind: 'facebook', url: 'https://www.facebook.com/brightmoor.dental.example' }
  })
]

const configOf = (params) => JSON.parse(JSON.parse(params)['jatools-config'])

for (const brief of TRADES) {
  const plan = planSite(brief, { questions: [] }, { contentMap: MAP })
  const modules = moduleRows()
  const made = recordSteps({ honesty: plan.honesty, modules })
  const stepOf = (id) => made.steps.find((s) => s.kind === 'module' && s.id === id)
  const label = brief.business.name
  const offerings = brief.reading.services.length

  test(`${label}: each record list module lists the brief's count of records`, () => {
    for (const list of plan.honesty.lists) {
      const id = Number(list.entity.split('-')[1])
      const before = JSON.parse(modules.get(id).params)
      const after = stepOf(id) ? JSON.parse(String(stepOf(id).fields.params)) : before
      assert.equal(Number(after.count), offerings, `${list.entity} lists ${offerings}, was ${before.count}`)
    }
  })

  test(`${label}: the person page keeps no social icon and no bio the brief does not hold`, () => {
    const person = MAP.slots.find((s) => s.role === 'person.bio' && /^module-/.test(s.entity))
    const id = Number(person.entity.split('-')[1])
    const hero = Object.values(configOf(String(stepOf(id).fields.params))).find(
      (v) => v && typeof v === 'object' && Object.keys(v).some((k) => /social/.test(k))
    )
    for (const [key, list] of Object.entries(hero))
      if (/social/.test(key))
        assert.ok(
          list.every((v) => v === ''),
          `${key} is emptied whole: ${JSON.stringify(list)}`
        )
    const desc = Object.entries(hero).find(([k]) => /\[desc\]$/.test(k))?.[1]
    assert.deepEqual(desc, [''], 'the bio field is emptied')
    // The business's networks never fill the person's row.
    assert.ok(plan.honesty.personSocials.includes(person.entity))
  })

  test(`${label}: the role the brief holds is on the team cards`, () => {
    const role = brief.reading.team[0].role.toLowerCase()
    const roleCells = Object.entries(plan.honesty.values).filter(
      ([key, v]) => /^module-/.test(key) && String(v.value).toLowerCase() === role
    )
    assert.ok(roleCells.length > 0)
  })

  test(`${label}: no video tile is kept when the brief holds no video`, () => {
    const entities = new Set(
      MAP.slots
        .filter((s) => s.role === 'business.video' && /^module-/.test(s.entity))
        .map((s) => Number(s.entity.split('-')[1]))
    )
    for (const id of entities) {
      const step = stepOf(id)
      assert.ok(step, `module-${id} is written`)
      if (step.fields.published === 0) continue
      const config = configOf(String(step.fields.params))
      const tiles = Object.values(config).find(
        (v) => v && typeof v === 'object' && Object.keys(v).some((k) => /\[link\]/.test(k))
      )
      for (const [key, list] of Object.entries(tiles))
        if (Array.isArray(list) && list.length > 1)
          assert.ok(
            list.every((v) => v === ''),
            `${key} emptied`
          )
    }
  })
}

test('a person page social row is left alone by the business social row', async () => {
  const brief = TRADES[0]
  const plan = planSite(brief, { questions: [] }, { contentMap: MAP })
  const rows = [...moduleRows().values()]
  const apply = async ({ action, params }) =>
    action === 'content.list' && params.kind === 'module'
      ? { items: params.offset ? [] : rows }
      : { items: [] }
  const out = await planIdentitySteps({
    apply,
    siteKey: 's',
    ctx: { siteKey: 's', email: 'owner@example.test', note: () => {}, time: () => {} },
    woContent: { sitePlanFor: async () => plan },
    visible: new Set(['*'])
  })
  for (const entity of plan.honesty.personSocials) {
    const id = Number(entity.split('-')[1])
    assert.equal(
      out.steps.find((s) => s.kind === 'module' && s.id === id),
      undefined,
      `${entity} gets no business networks`
    )
  }
  // The footer's own social row still takes the business's network.
  assert.ok(
    out.steps.some((s) => s.kind === 'module' && /instagram\.com\/copperleaf/.test(String(s.fields.params)))
  )
})

test('a grid column the build emptied is hidden and its row centres the columns kept', () => {
  const html = `<!doctype html><html><body><main><div class="contact-block"><div class="row g-0">
    <div class="col-12 col-md-6 col-xl-3 item"><div class="item-inner"><h3>Visit</h3><p>12 Elm Row</p></div></div>
    <div class="col-12 col-md-6 col-xl-3 item"><div class="item-inner"><h3>Call</h3><p>555 0100</p></div></div>
    <div class="col-12 col-xl-6 item"><div class="item-inner">
      <!-- email -->
    </div></div>
  </div></div></main></body></html>`
  const { hide, centre } = emptyFramesOf(html)
  assert.ok(
    hide.some((s) => /col-xl-6/.test(s)),
    `the empty column is hidden: ${hide.join(' | ')}`
  )
  assert.ok(
    centre.some((s) => /div\.row/.test(s)),
    `the row centres the kept columns: ${centre.join(' | ')}`
  )
  assert.ok(!hide.some((s) => /col-xl-3/.test(s)), 'the filled columns stay')
})
