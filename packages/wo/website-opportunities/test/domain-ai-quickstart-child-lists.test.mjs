// Child lists of the AI quickstart block store (#583): a list inside a block or inside each item, with its own
// fields, counts and count sources, stored per parent place. One failing case per rule, on the invented fixture set;
// the block store rules hold while the mapping file is pending.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkAiQuickstartContract } from '../domain/ai-quickstart-contract.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ai-quickstart/${name}`, import.meta.url), 'utf8'))
const VALID = {
  blockStore: read('block-store.json'),
  pageRecipes: read('page-recipes.json'),
  mapping: read('mapping.json')
}
const valid = () => structuredClone(VALID)
const pendingOf = (set) => ({ ...set, mapping: undefined, mappingPending: true })
const blockOf = (set, id) => set.blockStore.blocks.find((b) => b.id === id)
const sessions = (set) => blockOf(set, 'services-grid').itemLists[0]
const sessionField = (set, name) => sessions(set).fields.find((f) => f.name === name)
const hours = (set) => blockOf(set, 'footer-main').lists[0]
const mappedSessions = (set) => set.mapping.blocks['services-grid'].itemLists.sessions.fields
const SESSIONS = 'blocks[services-grid].itemLists[sessions]'

function assertOneProblem(set, { file, at, message }) {
  const res = checkAiQuickstartContract(set)
  assert.equal(res.ok, false)
  assert.equal(res.problems.length, 1, JSON.stringify(res.problems, null, 2))
  assert.equal(res.problems[0].file, file)
  assert.equal(res.problems[0].at, at)
  assert.match(res.problems[0].message, message)
}
const storeProblem = (set, at, message) =>
  assertOneProblem(pendingOf(set), { file: 'block-store.json', at, message })

test('child lists on a block and on its items pass, written and pending', () => {
  assert.deepEqual(checkAiQuickstartContract(valid()).problems, [])
  assert.deepEqual(checkAiQuickstartContract(pendingOf(valid())).problems, [])
})

test('an item field with no stored places and no derivation fails', () => {
  const set = valid()
  delete blockOf(set, 'services-grid').itemFields.find((f) => f.name === 'link').derived
  storeProblem(set, 'blocks[services-grid].itemFields[link].slots', /stored place per item.*derived/)
})

test('a child list without the sources of its counts fails', () => {
  const set = valid()
  delete sessions(set).itemsFrom.min
  storeProblem(set, `${SESSIONS}.itemsFrom`, /where each count comes from/)
})

test('a child list without counts fails', () => {
  const set = valid()
  delete sessions(set).items
  storeProblem(set, `${SESSIONS}.items`, /missing item counts/)
})

test('a child field follows the field rules: a text without a limit fails', () => {
  const set = valid()
  delete sessionField(set, 'day').limit
  storeProblem(set, `${SESSIONS}.fields[day].limit`, /needs a limit/)
})

test('a child field with no stored places and no derivation fails', () => {
  const set = valid()
  delete sessionField(set, 'time').slots
  storeProblem(set, `${SESSIONS}.fields[time].slots`, /per parent place.*derived/)
})

test('a child field listing fewer parent places than the block stores items fails', () => {
  const set = valid()
  sessionField(set, 'day').slots.pop()
  storeProblem(set, `${SESSIONS}.fields[day].slots`, /2 parent places for 3/)
})

test('a child field whose rows differ from another field of the list fails', () => {
  const set = valid()
  sessionField(set, 'time').slots[1].push('module-13.16')
  storeProblem(
    set,
    `${SESSIONS}.fields[time].slots`,
    /rows per parent place 2, 2, 0 differ from field day: 2, 1, 0/
  )
})

test('a parent place storing more rows than the maximum fails', () => {
  const set = valid()
  sessions(set).items.max = 1
  storeProblem(set, `${SESSIONS}.items`, /parent place 0 stores 2 rows, above max 1/)
})

test('a parent place storing fewer rows than the minimum fails', () => {
  const set = valid()
  sessions(set).items.min = 1
  storeProblem(set, `${SESSIONS}.items`, /parent place 2 stores 0 rows, below min 1/)
})

test('a maximum no parent place stores fails', () => {
  const set = valid()
  hours(set).items.max = 3
  storeProblem(
    set,
    'blocks[footer-main].lists[opening-hours].items',
    /no parent place stores max 3 rows.*\(2\)/
  )
})

test('a child list named like a field of the block fails', () => {
  const set = valid()
  hours(set).name = 'copyright'
  storeProblem(set, 'blocks[footer-main].lists[copyright]', /"copyright" appears twice in the block/)
})

test('a nested child list stores its rows per row of its parent list', () => {
  const set = valid()
  hours(set).lists = [
    {
      name: 'notes',
      label: 'Notes',
      items: { min: 0, max: 1 },
      itemsFrom: { min: 'invented: a line without a note', max: 'invented: one note per line' },
      fields: [
        { name: 'note', kind: 'editorial.paragraph', type: 'text', limit: 20, slots: [['module-14.5'], []] }
      ]
    }
  ]
  assert.deepEqual(checkAiQuickstartContract(pendingOf(set)).problems, [])
  hours(set).lists[0].fields[0].slots.pop()
  storeProblem(
    set,
    'blocks[footer-main].lists[opening-hours].lists[notes].fields[note].slots',
    /1 parent places for 2/
  )
})

test('a child list the mapping file does not place fails', () => {
  const set = valid()
  delete set.mapping.blocks['footer-main'].lists
  assertOneProblem(set, {
    file: 'mapping.json',
    at: 'blocks[footer-main].lists[opening-hours]',
    message: /no mapping for child list "opening-hours"/
  })
})

test('a child field the mapping file does not place fails', () => {
  const set = valid()
  delete mappedSessions(set).time
  assertOneProblem(set, {
    file: 'mapping.json',
    at: `${SESSIONS}.fields[time]`,
    message: /no locations for child field "time"/
  })
})

test('a child field placed for fewer parent places than the block takes fails', () => {
  const set = valid()
  mappedSessions(set).day.pop()
  mappedSessions(set).time.pop()
  const res = checkAiQuickstartContract(set)
  assert.deepEqual(
    res.problems.map((p) => [p.at, p.message]),
    [
      [`${SESSIONS}.fields[day]`, '2 parent places for 3: every parent place lists its rows'],
      [`${SESSIONS}.fields[time]`, '2 parent places for 3: every parent place lists its rows']
    ]
  )
})

test('a child field whose location is a design line is a design value typed as content', () => {
  const set = valid()
  mappedSessions(set).day[0][0] = { entity: 'module-13', column: 'params', jsonPath: ['layout'] }
  assertOneProblem(set, {
    file: 'block-store.json',
    at: `${SESSIONS}.fields[day].type`,
    message: /design value typed as text/
  })
})
