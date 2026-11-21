// A fact id the planner shortened to its first hex digits is made whole when exactly one fact of the brief starts with
// it (site-planner/plan-fact-ids.js), in every place a plan cites a fact; a cite that matches two facts or none stays
// for R02. The checker's passing plan and brief (_site-plan-check.mjs), with the brief's fact ids renamed to the
// profile's 24-digit form; no model, no database.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { withFullFactIds } from '../src/site-planner/plan-fact-ids.js'
import { brief, kit, plan } from './_site-plan-check.mjs'

const hashed = (id) => `fact_${createHash('sha256').update(id).digest('hex').slice(0, 24)}`
const short = (id) => hashed(id).slice(0, 13)

/** The brief and plan with every fact id in the profile's form; `cite` names how the plan cites each one. */
function renamed(cite) {
  const b = brief()
  const rename = new Map(b.facts.map((f) => [f.id, hashed(f.id)]))
  b.facts = b.facts.map((f) => ({ ...f, id: rename.get(f.id) }))
  const text = JSON.stringify(plan()).replace(/"(f-[a-z0-9-]+)"|:(f-[a-z0-9-]+)"/g, (m, quoted, target) =>
    quoted ? `"${cite(quoted)}"` : `:${cite(target)}"`
  )
  return { brief: b, plan: JSON.parse(text) }
}
const r02 = (p, b) => checkPlan({ plan: p, kit: kit(), brief: b }).rules.find((r) => r.id === 'R02')

test('a plan that cites every fact by its first 8 digits fails R02 everywhere, and passes once the ids are made whole', () => {
  const whole = renamed(hashed)
  const cut = renamed(short)
  assert.equal(r02(whole.plan, whole.brief).status, 'pass')
  const before = r02(cut.plan, cut.brief)
  assert.equal(before.status, 'fail')
  assert.ok(before.failures.length >= 10, `${before.failures.length} R02 failures`)
  const fixed = withFullFactIds(cut.plan, cut.brief)
  assert.deepEqual(fixed, whole.plan)
  assert.equal(r02(fixed, cut.brief).status, 'pass')
  // The link targets <kind>:<fact id> and the plan given are made whole too, without changing the plan given.
  assert.equal(fixed.site.primaryAction.factIds[0], hashed('f-phone'))
  assert.ok(JSON.stringify(cut.plan).includes(short('f-phone')))
})

test('a cite that two facts start with, or none, stays as written; a plan with whole ids comes back as the same object', () => {
  const b = {
    facts: [
      { id: 'fact_15bd7b59aa00000000000000' },
      { id: 'fact_15bd7b59bb00000000000000' },
      { id: 'fact_5d987f75f331b4da50bc1fa0' }
    ]
  }
  const p = {
    site: {
      contactChannels: [{ kind: 'phone', factId: 'fact_15bd7b59' }],
      primaryAction: { leadsTo: 'map:fact_5d987f75' }
    },
    pages: [{ blocks: [{ copy: [{ slot: 's', factIds: ['fact_15bd7b59', 'fact_99999999', 'f-name'] }] }] }],
    pictures: [{ frame: 'f', match: 'person', person: 'fact_5d987f75' }]
  }
  const out = withFullFactIds(p, b)
  assert.equal(out.site.contactChannels[0].factId, 'fact_15bd7b59')
  assert.deepEqual(out.pages[0].blocks[0].copy[0].factIds, ['fact_15bd7b59', 'fact_99999999', 'f-name'])
  assert.equal(out.site.primaryAction.leadsTo, 'map:fact_5d987f75f331b4da50bc1fa0')
  assert.equal(out.pictures[0].person, 'fact_5d987f75f331b4da50bc1fa0')
  const whole = renamed(hashed)
  assert.equal(withFullFactIds(whole.plan, whole.brief), whole.plan)
  assert.equal(withFullFactIds(whole.plan, {}), whole.plan)
})
