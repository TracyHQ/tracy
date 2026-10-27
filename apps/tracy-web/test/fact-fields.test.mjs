/**
 * Evidence gating by FIELD ROLE (`src/lib/fact-fields.js`, TCH #1326): a slot that holds a fact by its
 * name (a stat value, a city, an address, a quotation, a client, a team member, a price) wants evidence
 * whatever its module is called.
 *
 * Measured 13/10/2026 on dev sites built from Tracy Business Joomla and JA Voyara: the capture marked
 * `requiresEvidence` by module TITLE only (`Pricing|Statistics|Testimonials|Clients|Team`), so the hero's
 * `stat-value` cells came out as "0" or trade words, the Branches `city` cells took the customer's
 * industry, and Voyara's "Home - Stats" (not "Statistics") and "Landing - Testimonial" (singular) were
 * written by the planner. The highest seam is the published profile itself: the newest content map of
 * each of the two templates in the tree, read as the planner reads it.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  factRowOf,
  fieldOf,
  partialFactRows,
  ungatedFactSlots,
  withFieldEvidence
} from '../src/lib/fact-fields.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..', '..', '..')
const JOOMLA = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const SEALED = new Set(
  JSON.parse(readFileSync(path.join(ROOT, 'scripts/lib/evidence-sealed-profiles.json'), 'utf8')).profiles
)

/** The newest published profile of a Joomla quickstart, by version. */
function newest(slug) {
  const dir = path.join(JOOMLA, slug)
  const versions = readdirSync(dir)
    .filter((d) => /^\d+\.\d+\.\d+$/.test(d))
    .sort((a, b) => {
      const pa = a.split('.').map(Number)
      const pb = b.split('.').map(Number)
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
      return 0
    })
  const version = versions.at(-1)
  const slots = JSON.parse(readFileSync(path.join(dir, version, 'content-map.json'), 'utf8')).slots
  return { id: `${slug}/${version}`, slots }
}

/** The slots whose label ends with `suffix`, after the planner's gating. */
const labelled = (slots, suffix) => slots.filter((slot) => String(slot.label ?? '').endsWith(suffix))

const gated = (slots, suffix) => {
  const found = labelled(slots, suffix)
  assert.ok(found.length > 0, `no slot labelled "${suffix}"`)
  for (const slot of found) assert.equal(slot.requiresEvidence, true, `${slot.key} ${slot.label}`)
  return found
}

test('tracy-business/j6: the hero stat values and the Branches city and address cells are gated', () => {
  const { slots } = newest('tracy-business/j6')
  const planned = withFieldEvidence(slots)
  const values = gated(planned, 'Home - Hero (en) / stat-value')
  assert.equal(values.length, 4)
  // The fourth counter ships "0" (serious incidents): the demo's own value, kept, never a planner's.
  assert.ok(values.some((slot) => slot.sample === '0'))
  gated(planned, 'Home - Hero (en) / stat-label')
  gated(planned, 'Contact - Branches (en) / city')
  gated(planned, 'Contact - Branches (en) / addr')
  gated(planned, 'Contact - Branches (ru) / city')
  // What the title rule already gated stays gated: a superset, never a trade.
  for (const [before, after] of slots.map((slot, i) => [slot, planned[i]]))
    if (before.requiresEvidence) assert.equal(after.requiresEvidence, true, before.key)
  // The hero's words are not facts: its title and lead are still the planner's to write.
  for (const slot of labelled(planned, 'Home - Hero (en) / title'))
    assert.equal(slot.requiresEvidence, false, slot.key)
  // The site's own identity takes the customer's contact answers (and is emptied without them): never gated.
  const identity = planned.filter((slot) => slot.siteIdentity === true)
  assert.ok(identity.length > 0)
  for (const slot of identity) assert.equal(slot.requiresEvidence, false, slot.key)
  assert.equal(ungatedFactSlots(identity).length, 0)
})

test('ja-voyara/j6: "Home - Stats" values and the singular "Testimonial" modules are gated', () => {
  const { slots } = newest('ja-voyara/j6')
  const planned = withFieldEvidence(slots)
  gated(planned, 'Home - Stats / value')
  gated(planned, 'Home - Stats / label')
  gated(planned, 'About - Stats / value')
  gated(planned, 'Landing - Stats / value')
  gated(planned, 'Landing - Testimonial / quote')
  gated(planned, 'Landing - Testimonial / name')
  gated(planned, 'Landing - Testimonial / role')
  gated(planned, 'About - Testimonial / quote')
  gated(planned, 'About - Testimonial / name')
  // Already gated by title (plural "Testimonials"), still gated.
  gated(planned, 'Home - Testimonials / quote')
  for (const slot of labelled(planned, 'Home - Hero / title'))
    assert.equal(slot.requiresEvidence, false, slot.key)
})

test('a profile outside the sealed list carries the field gating in its own bytes', () => {
  for (const slug of ['tracy-business/j6', 'ja-voyara/j6']) {
    const { id, slots } = newest(slug)
    if (SEALED.has(id)) continue
    assert.deepEqual(
      ungatedFactSlots(slots).map((slot) => `${slot.key} ${slot.field}`),
      [],
      `${id}: run node scripts/regate-contract.mjs packages/cms/tracy-joomla-quickstart/contracts/${id}`
    )
  }
})

test('the field of a slot is read from its jsonPath, else from its label', () => {
  assert.equal(fieldOf({ jsonPath: ['tb-hero', 'tb-hero[stat-value]', 0] }), 'stat-value')
  assert.equal(fieldOf({ jsonPath: ['hero', 'button'] }), 'button')
  assert.equal(fieldOf({ jsonPath: ['pricing', 'pricing[data]', 'data', 0, 0] }), 'data')
  assert.equal(fieldOf({ label: '[Voyara] Home - Stats / value' }), 'value')
  assert.equal(fieldOf({ label: '[Tracy] Pricing / data row 2' }), 'data')
  assert.equal(fieldOf({ label: 'Home - Hero (en)' }), '', 'an HTML slot has no field')
  assert.equal(fieldOf({ xpath: '/p[1]' }), '')
})

test('a field holds a fact by its role, whatever its module is called', () => {
  const module = (fields) =>
    Object.entries(fields).map(([name, sample], i) => ({
      key: `module-1.${i}`,
      entity: 'module-1',
      type: 'text',
      sample,
      jsonPath: ['b', `b[${name}]`, 0],
      label: `Home - Anything / ${name}`,
      requiresEvidence: false
    }))
  const gatedFields = (fields) =>
    withFieldEvidence(module(fields))
      .filter((slot) => slot.requiresEvidence)
      .map((slot) => fieldOf(slot))
  assert.deepEqual(gatedFields({ title: 'Why us', 'stat-value': '380+', 'stat-label': 'Projects' }), [
    'stat-value',
    'stat-label'
  ])
  assert.deepEqual(gatedFields({ eyebrow: '', value: '80+', label: 'Countries' }), ['value', 'label'])
  // A bare `label` is a fact only beside a counter: a form's label is words.
  assert.deepEqual(gatedFields({ label: 'Your email', placeholder: 'you@example.com' }), [])
  assert.deepEqual(gatedFields({ city: 'Moscow', addr: '7/22 Derbenevskaya emb.', title: 'Branches' }), [
    'city',
    'addr'
  ])
  assert.deepEqual(gatedFields({ quote: 'Best trip', name: 'Elena', role: 'Booked 2025', rating: '5' }), [
    'quote',
    'name',
    'role',
    'rating'
  ])
  assert.deepEqual(gatedFields({ 'client-name': 'Spotify', 'logo-alt': 'ACME', company: 'Orbital' }), [
    'client-name',
    'logo-alt',
    'company'
  ])
  assert.deepEqual(gatedFields({ 'member-name': 'Dewey', 'member-position': 'CEO', bio: 'Since 2004' }), [
    'member-name',
    'member-position',
    'bio'
  ])
  assert.deepEqual(gatedFields({ 'row-title': 'Warehouse', 'row-price': 'from ₽48,000/m²', price: '$0' }), [
    'row-price',
    'price'
  ])
  assert.deepEqual(gatedFields({ 'btn-text': 'See more', desc: 'We build', 'image-alt': '' }), [])
})

test('withFieldEvidence keeps what the title rule gated and never ungates', () => {
  const slots = [
    { key: 'a.0', entity: 'a', type: 'text', sample: 'x', label: 'Team / eyebrow', requiresEvidence: true },
    { key: 'a.1', entity: 'a', type: 'text', sample: 'x', label: 'Team / desc', requiresEvidence: true }
  ]
  const out = withFieldEvidence(slots)
  assert.deepEqual(
    out.map((s) => s.requiresEvidence),
    [true, true]
  )
  // The input is not touched: the planner reads the map once and hands copies out.
  assert.notEqual(out, slots)
  assert.equal(slots[0] !== out[0] || out[0].requiresEvidence === true, true)
})

test('ungatedFactSlots names the fact fields a profile still leaves open', () => {
  const slots = [
    {
      key: 'm.0',
      entity: 'm',
      type: 'text',
      sample: '380+',
      jsonPath: ['h', 'h[stat-value]', 0],
      requiresEvidence: false
    },
    {
      key: 'm.1',
      entity: 'm',
      type: 'text',
      sample: 'Why',
      jsonPath: ['h', 'h[title]', 0],
      requiresEvidence: false
    },
    {
      key: 'n.0',
      entity: 'n',
      type: 'text',
      sample: 'Moscow',
      jsonPath: ['b', 'b[city]', 0],
      requiresEvidence: true
    }
  ]
  assert.deepEqual(ungatedFactSlots(slots), [{ key: 'm.0', field: 'stat-value', role: 'stat' }])
})

// ── A repeated row is one fact (14/10/2026, acceptance of #1331 on dev) ────────────────────────────────────────
// Site g66-accept-tbjoomla (Tracy Business Joomla 1.2.3), description "...in Dubai", no offices answered: the three
// Branches city cells became "Dubai" while each address kept the demo's ("Dubai: Lipetsk SEZ, 6 Tekhnologichesky
// proezd"). A branch row is one fact: its city and address are written together from evidence about that branch, or not.

const branchesOf = () =>
  withFieldEvidence(newest('tracy-business/j6').slots).filter((s) =>
    /Contact - Branches \(en\)/.test(s.label)
  )

test('the Branches module of tracy-business/j6 is three rows of city and address', () => {
  const slots = branchesOf()
  const rows = new Map()
  for (const slot of slots) {
    const row = factRowOf(slot)
    if (row === null) continue
    rows.set(row, [...(rows.get(row) ?? []), fieldOf(slot)])
  }
  assert.equal(rows.size, 3)
  for (const fields of rows.values()) assert.deepEqual(fields.sort(), ['addr', 'city'])
  assert.equal(factRowOf(slots.find((s) => fieldOf(s) === 'title')), null, 'the heading is no fact of a row')
})

test('one location in the description is not evidence for three branches: city cells alone keep the demo', () => {
  const slots = branchesOf()
  const cities = slots.filter((s) => fieldOf(s) === 'city')
  const changes = Object.fromEntries(cities.map((s) => [s.key, 'Dubai']))
  const evidence = { ...changes }
  assert.deepEqual(partialFactRows({ slots, changes, evidence }).sort(), cities.map((s) => s.key).sort())
})

test('the same place written into every row is one fact, not three: the rows keep the demo', () => {
  const slots = branchesOf()
  const fact = slots.filter((s) => ['city', 'addr'].includes(fieldOf(s)))
  const changes = Object.fromEntries(fact.map((s) => [s.key, 'Dubai']))
  assert.deepEqual(
    partialFactRows({ slots, changes, evidence: { ...changes } }).sort(),
    fact.map((s) => s.key).sort()
  )
})

test('a row whose city and address are both stated is written; the rows nobody described are not', () => {
  const slots = branchesOf()
  const row0 = slots.filter(
    (s) => Array.isArray(s.jsonPath) && s.jsonPath.at(-1) === 0 && fieldOf(s) !== 'title'
  )
  const city1 = slots.find((s) => fieldOf(s) === 'city' && s.jsonPath.at(-1) === 1)
  const changes = {
    [row0.find((s) => fieldOf(s) === 'city').key]: 'Dubai',
    [row0.find((s) => fieldOf(s) === 'addr').key]: 'Dubai Marina, Tower 2',
    [city1.key]: 'Abu Dhabi'
  }
  const evidence = { ...changes }
  assert.deepEqual(partialFactRows({ slots, changes, evidence }), [city1.key])
  // A value without evidence does not complete a row.
  const unproven = { ...evidence }
  delete unproven[row0.find((s) => fieldOf(s) === 'addr').key]
  assert.equal(partialFactRows({ slots, changes, evidence: unproven }).length, 3)
  // A cell a person already rewrote is the customer's: it completes its row.
  const held = new Set([row0.find((s) => fieldOf(s) === 'addr').key])
  const onlyCity = { [row0.find((s) => fieldOf(s) === 'city').key]: 'Dubai' }
  assert.deepEqual(partialFactRows({ slots, changes: onlyCity, evidence: onlyCity, held }), [])
})

test('the site identity is no row: one business address may fill it', () => {
  const slots = [
    { key: 'm.1', entity: 'm', jsonPath: ['id', 'id[address]', 0], sample: 'Moscow', siteIdentity: true },
    { key: 'm.2', entity: 'm', jsonPath: ['id', 'id[city]', 0], sample: 'Moscow', siteIdentity: true }
  ]
  assert.equal(factRowOf(slots[0]), null)
  assert.deepEqual(partialFactRows({ slots, changes: { 'm.1': 'Dubai' }, evidence: {} }), [])
})

test('team and client rows are filled whole too, and a jatable row is read from its label', () => {
  const slots = withFieldEvidence([
    { key: 't.1', entity: 't', label: 'Team / member-name row 1', sample: 'Andrey Kulagin' },
    { key: 't.2', entity: 't', label: 'Team / member-role row 1', sample: 'Chief Executive Officer' },
    { key: 't.3', entity: 't', label: 'Team / member-name row 2', sample: 'Olga Petrova' },
    { key: 't.4', entity: 't', label: 'Team / member-role row 2', sample: 'CFO' }
  ])
  assert.equal(factRowOf(slots[0]), factRowOf(slots[1]))
  assert.notEqual(factRowOf(slots[0]), factRowOf(slots[2]))
  const changes = { 't.1': 'Minh', 't.2': 'Head baker', 't.3': 'Lan' }
  assert.deepEqual(partialFactRows({ slots, changes, evidence: { ...changes } }), ['t.3'])
})
