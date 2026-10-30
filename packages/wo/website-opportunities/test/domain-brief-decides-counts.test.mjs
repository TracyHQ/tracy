/**
 * 🔒 THE BRIEF DECIDES WHAT THE SITE HAS, THE TEMPLATE ONLY GIVES THE LAYOUT (COO principle 30/10/2026, criteria 1.4 and
 * 4.1, R12 group C). On a released template's content map, for two fictional businesses of other trades, the site plan:
 *   - keeps one card per brief offering and takes the rest off, and gives every record list the brief's count;
 *   - takes off every video tile when the brief holds no playable video (never a still with an invented title);
 *   - takes off a kept person's social items whole (never an icon left with an emptied, self-pointing link);
 *   - never hands a bio the brief does not hold to the copy writer: it is emptied, and the CMS prints no empty field;
 *   - shows the person's sourced role on the card line that shows it.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { planSite } from '../domain/site-plan.mjs'

const MAP = JSON.parse(
  readFileSync(
    new URL(
      '../../../cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.8/content-map.json',
      import.meta.url
    ),
    'utf8'
  )
)
const slotsOf = (/** @type {(s: any) => boolean} */ pick) => MAP.slots.filter(pick)

/** A fictional business: a few offerings, one person with a role and no bio, one social network, no video. */
function briefOf({ name, offerings, person, network }) {
  return {
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
  }
}

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

for (const brief of TRADES) {
  const plan = planSite(brief, { questions: [] }, { contentMap: MAP })
  const honesty = plan.honesty
  const hidden = new Set(honesty.records.filter((r) => r.decision === 'hide').map((r) => r.group))
  const hiddenEntities = new Set(honesty.hide.filter((h) => h.how === 'entity').map((h) => h.entity))
  const blanked = new Set(honesty.blanks.map((b) => b.key))
  const offerings = brief.reading.services.length
  const label = brief.business.name

  test(`${label}: every record list shows the brief's count of records, never the template's`, () => {
    const lists = honesty.lists ?? []
    const declared = MAP.entities.filter((e) => e.lists)
    assert.ok(declared.length > 0, 'the template declares record lists')
    for (const entity of declared) {
      const row = lists.find((l) => l.entity === entity.key)
      assert.ok(row, `${entity.key} has a planned count`)
      assert.equal(row.count, offerings, `${entity.key} lists the brief's ${offerings} records`)
      assert.equal(row.decision, 'keep')
    }
  })

  test(`${label}: one offering card per brief offering, the rest taken off`, () => {
    // A priced card stands only for an offering its own name says (a plan, a gift card): such a collection is not counted.
    const priced = new Set(
      slotsOf((s) => /\.price$/.test(s.role ?? '') && s.group?.id).map((s) => s.group.id)
    )
    const cards = honesty.records.filter((r) => r.kind === 'service' && r.collection && !priced.has(r.group))
    const byCollection = Map.groupBy(cards, (r) => r.collection)
    for (const [collection, rows] of byCollection) {
      const kept = rows.filter((r) => r.decision === 'keep').length
      assert.ok(kept <= offerings, `${collection} keeps at most ${offerings} cards, kept ${kept}`)
      if (rows.length >= offerings) assert.equal(kept, offerings, `${collection} keeps ${offerings} cards`)
    }
  })

  test(`${label}: no video tile stays when the brief holds no video`, () => {
    const videoGroups = new Set(
      slotsOf((s) => s.role === 'business.video' && s.group?.id).map((s) => s.group.id)
    )
    for (const id of videoGroups) {
      const entity = id.split('.')[0]
      const placed = MAP.slots.some(
        (s) => s.group?.id === id && Array.isArray(s.jsonPath) && Number.isInteger(s.jsonPath.at(-1))
      )
      if (!placed) continue
      assert.ok(hidden.has(id) || hiddenEntities.has(entity), `${id} is taken off`)
    }
    // Its words are never asked of the copy writer: the tile titles are not written as if they were the business's.
    for (const slot of slotsOf(
      (s) => hidden.has(s.group?.id) && videoGroups.has(s.group.id) && s.role !== 'business.video'
    ))
      assert.equal(plan.slots.find((d) => d.key === slot.key)?.decision, 'skip', `${slot.key} is not written`)
  })

  test(`${label}: a kept person's social items are taken off whole, none left with an empty link`, () => {
    const keptPeople = honesty.records.filter((r) => r.kind === 'person' && r.decision === 'keep')
    const personEntities = new Set(keptPeople.map((r) => r.group.split('.')[0]))
    const socialGroups = new Set(
      slotsOf(
        (s) =>
          personEntities.has(s.entity) &&
          /^(contact|person)\.social_/.test(s.role ?? '') &&
          s.group?.kind === 'contact'
      ).map((s) => s.group.id)
    )
    assert.ok(socialGroups.size > 0, 'the person page carries social items')
    for (const id of socialGroups) assert.ok(hidden.has(id), `${id} is taken off`)
    const placed = honesty.hide.filter((h) => socialGroups.has(h.group))
    assert.equal(placed.length, socialGroups.size)
    for (const h of placed) assert.equal(h.how, 'item', `${h.group} goes with the template's list item`)
    // The business's own networks never stand in for the person's.
    assert.ok(
      (honesty.personSocials ?? []).length > 0,
      'the plan names the person social lists the business row skips'
    )
  })

  test(`${label}: a bio the brief does not hold is emptied, never written; the role is shown where a card shows it`, () => {
    for (const slot of slotsOf((s) => s.role === 'person.bio' && s.type === 'text')) {
      const groupHidden = hidden.has(slot.group?.id) || hiddenEntities.has(slot.entity)
      assert.ok(groupHidden || blanked.has(slot.key), `${slot.key} is emptied`)
      const decision = plan.slots.find((s) => s.key === slot.key)
      assert.notEqual(decision?.reason, 'text-by-copy', `${slot.key} is not handed to the copy writer`)
    }
    const role = brief.reading.team[0].role
    const shown = Object.values(honesty.values).filter((v) => String(v.value).toLowerCase() === role)
    assert.ok(shown.length > 0, 'the role is on a card')
  })
}
