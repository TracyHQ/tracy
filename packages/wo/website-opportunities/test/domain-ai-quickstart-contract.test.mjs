// The AI quickstart contract check (ADR 0046, ticket #581): a block store description, its page recipes and its
// mapping file, checked together. Every mistake is reported, each with the file and the place it sits in.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { AI_QUICKSTART_FIELD_TYPES, checkAiQuickstartContract } from '../domain/ai-quickstart-contract.mjs'
import { BLOCK_TYPES, isBlockType } from '../domain/place-content-roles.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ai-quickstart/${name}`, import.meta.url), 'utf8'))
const VALID = {
  blockStore: read('block-store.json'),
  pageRecipes: read('page-recipes.json'),
  mapping: read('mapping.json')
}
const valid = () => structuredClone(VALID)
const blockOf = (set, id) => set.blockStore.blocks.find((b) => b.id === id)
const fieldOf = (set, id, name) => blockOf(set, id).fields.find((f) => f.name === name)

/** The one problem a broken declaration set must raise, matched on its place and its message. */
function assertOneProblem(set, { file, at, message }) {
  const res = checkAiQuickstartContract(set)
  assert.equal(res.ok, false)
  assert.equal(res.problems.length, 1, JSON.stringify(res.problems, null, 2))
  const [problem] = res.problems
  assert.equal(problem.file, file)
  assert.equal(problem.at, at)
  assert.match(problem.message, message)
}

test('block types extend the shared role vocabulary, each with the group kind of its items', () => {
  assert.ok(isBlockType('services'))
  assert.equal(BLOCK_TYPES.services.itemKind, 'service')
  assert.equal(BLOCK_TYPES.hero.itemKind, null)
  assert.equal(isBlockType('carousel-of-dreams'), false)
  assert.deepEqual(AI_QUICKSTART_FIELD_TYPES, ['text', 'link', 'image', 'icon', 'number', 'design'])
})

test('a valid block store description, page recipes and mapping file pass', () => {
  const res = checkAiQuickstartContract(valid())
  assert.deepEqual(res.problems, [])
  assert.equal(res.ok, true)
  assert.equal(res.blocks, 4)
})

test('a missing field type fails', () => {
  const set = valid()
  delete fieldOf(set, 'hero-home', 'lead').type
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[hero-home].fields[lead].type',
    message: /missing.*one of text, link, image, icon, number, design/
  })
})

test('a wrong field type fails', () => {
  const set = valid()
  fieldOf(set, 'hero-home', 'lead').type = 'paragraph'
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[hero-home].fields[lead].type',
    message: /"paragraph" is not a field type/
  })
})

test('a design value typed as text fails: its location is a design line of the mapping file', () => {
  const set = valid()
  Object.assign(fieldOf(set, 'hero-home', 'background'), {
    type: 'text',
    kind: 'editorial.heading',
    limit: 20
  })
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[hero-home].fields[background].type',
    message: /design value typed as text.*type it design/
  })
})

test('a design value typed as text fails: its data kind is a design element', () => {
  const set = valid()
  const field = fieldOf(set, 'hero-home', 'lead')
  field.kind = 'editorial.design_element'
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[hero-home].fields[lead].type',
    message: /design value typed as text/
  })
})

test('a text field without a limit fails', () => {
  const set = valid()
  delete fieldOf(set, 'hero-home', 'heading').limit
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[hero-home].fields[heading].limit',
    message: /text field needs a limit/
  })
})

test('a block without item counts fails', () => {
  const set = valid()
  delete blockOf(set, 'services-grid').items
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[services-grid].items',
    message: /missing item counts.*min.*max/
  })
})

test('item counts that are not whole numbers in order fail', () => {
  const set = valid()
  blockOf(set, 'services-grid').items = { min: 3, max: 2 }
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[services-grid].items',
    message: /min 3 is above max 2/
  })
})

test('a block without a no data rule fails', () => {
  const set = valid()
  delete blockOf(set, 'footer-main').noData
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[footer-main].noData',
    message: /missing no data rule.*hide.*fallback/
  })
})

test('an unknown data kind fails', () => {
  const set = valid()
  blockOf(set, 'services-grid').itemFields[0].kind = 'offering.flavour'
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[services-grid].itemFields[name].kind',
    message: /"offering.flavour" is not a data kind of place-content-roles\/3/
  })
})

test('an unknown block type fails', () => {
  const set = valid()
  blockOf(set, 'hero-home').type = 'slider'
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[hero-home].type',
    message: /"slider" is not a block type/
  })
})

test('an image field without a frame fails', () => {
  const set = valid()
  delete fieldOf(set, 'hero-home', 'photo').frame
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[hero-home].fields[photo].frame',
    message: /image field needs a frame/
  })
})

test('an icon field without a frame fails', () => {
  const set = valid()
  delete blockOf(set, 'services-grid').itemFields.find((f) => f.name === 'icon').frame
  assertOneProblem(set, {
    file: 'block-store.json',
    at: 'blocks[services-grid].itemFields[icon].frame',
    message: /an icon field needs a frame/
  })
})

test('a recipe naming a block the store lacks fails', () => {
  const set = valid()
  set.pageRecipes.recipes[0].blocks.push('gallery-wall')
  assertOneProblem(set, {
    file: 'page-recipes.json',
    at: 'recipes[home].blocks[4]',
    message: /"gallery-wall" is not a block of the store/
  })
})

test('a field the mapping file does not place fails', () => {
  const set = valid()
  delete set.mapping.blocks['hero-home'].fields.lead
  assertOneProblem(set, {
    file: 'mapping.json',
    at: 'blocks[hero-home].fields[lead]',
    message: /no location for field "lead"/
  })
})

test('an item field placed for fewer items than the block takes fails', () => {
  const set = valid()
  set.mapping.blocks['services-grid'].itemFields.price.pop()
  assertOneProblem(set, {
    file: 'mapping.json',
    at: 'blocks[services-grid].itemFields[price]',
    message: /2 locations for max 3 items/
  })
})

test('a mapping file without the SEO fields fails', () => {
  const set = valid()
  delete set.mapping.seo.shareImage
  assertOneProblem(set, {
    file: 'mapping.json',
    at: 'seo.shareImage',
    message: /missing location/
  })
})

test('an unknown business fact fails', () => {
  const set = valid()
  set.mapping.facts.fax = [{ entity: 'module-14', column: 'params' }]
  assertOneProblem(set, {
    file: 'mapping.json',
    at: 'facts.fax',
    message: /"fax" is not a business fact/
  })
})

test('every mistake is reported, not only the first', () => {
  const set = valid()
  delete fieldOf(set, 'hero-home', 'lead').type
  delete fieldOf(set, 'hero-home', 'heading').limit
  delete blockOf(set, 'services-grid').items
  delete blockOf(set, 'footer-main').noData
  blockOf(set, 'header-main').type = 'slider'
  const res = checkAiQuickstartContract(set)
  assert.equal(res.ok, false)
  assert.deepEqual(res.problems.map((p) => p.at).sort(), [
    'blocks[footer-main].noData',
    'blocks[header-main].type',
    'blocks[hero-home].fields[heading].limit',
    'blocks[hero-home].fields[lead].type',
    'blocks[services-grid].items'
  ])
})

test('missing or malformed declarations are problems, never a throw', () => {
  const res = checkAiQuickstartContract({ blockStore: null, pageRecipes: [], mapping: 'x' })
  assert.equal(res.ok, false)
  assert.deepEqual(
    res.problems.map((p) => p.file),
    ['block-store.json', 'page-recipes.json', 'mapping.json']
  )
})

test('a pending mapping file skips the mapping rules only; the block store rules still hold', () => {
  const set = valid()
  const pending = {
    blockStore: set.blockStore,
    pageRecipes: set.pageRecipes,
    mapping: undefined,
    mappingPending: true
  }
  assert.deepEqual(checkAiQuickstartContract(pending).problems, [])
  delete fieldOf(set, 'hero-home', 'heading').limit
  const res = checkAiQuickstartContract(pending)
  assert.equal(res.problems.length, 1)
  assert.equal(res.problems[0].file, 'block-store.json')
  assert.equal(checkAiQuickstartContract({ ...pending, mappingPending: false }).ok, false)
})

/** The invented set with its mapping file pending: only the rules that read the mapping file are skipped. */
const pendingOf = (set) => ({
  blockStore: set.blockStore,
  pageRecipes: set.pageRecipes,
  mapping: undefined,
  mappingPending: true
})

test('an item field stored for fewer items than the block takes fails from the block store alone', () => {
  const set = valid()
  const services = blockOf(set, 'services-grid')
  assert.deepEqual(checkAiQuickstartContract(pendingOf(set)).problems, [])
  services.itemFields.find((f) => f.name === 'price').slots.pop()
  assertOneProblem(pendingOf(set), {
    file: 'block-store.json',
    at: 'blocks[services-grid].itemFields[price].slots',
    message: /2 stored places for max 3 items/
  })
})

test('a design line typed as content fails from the block store alone', () => {
  const set = valid()
  Object.assign(fieldOf(set, 'hero-home', 'background'), { slot: 'module-1.4' })
  Object.assign(fieldOf(set, 'hero-home', 'lead'), { slot: 'module-1.4' })
  assertOneProblem(pendingOf(set), {
    file: 'block-store.json',
    at: 'blocks[hero-home].fields[lead].type',
    message: /design value typed as text.*type it design/
  })
  const drafted = valid()
  Object.assign(fieldOf(drafted, 'hero-home', 'lead'), { designFrom: 'params.layout' })
  assertOneProblem(pendingOf(drafted), {
    file: 'block-store.json',
    at: 'blocks[hero-home].fields[lead].type',
    message: /design value typed as text/
  })
})

test('a block placed inside a block the store lacks fails', () => {
  const set = valid()
  blockOf(set, 'footer-main').positions = ['inside:services-grid']
  assert.deepEqual(checkAiQuickstartContract(set).problems, [])
  blockOf(set, 'footer-main').positions = ['inside:nowhere']
  assertOneProblem(pendingOf(set), {
    file: 'block-store.json',
    at: 'blocks[footer-main].positions',
    message: /"inside:nowhere" names no block of the store/
  })
})

test('a recipe variant naming a block the store lacks fails', () => {
  const set = valid()
  set.pageRecipes.recipes[1].variants = [{ blocks: ['header-main', 'services-grid'], pages: 1 }]
  assert.deepEqual(checkAiQuickstartContract(set).problems, [])
  set.pageRecipes.recipes[1].variants[0].blocks.push('ghost')
  assertOneProblem(pendingOf(set), {
    file: 'page-recipes.json',
    at: 'recipes[services].variants[0].blocks[2]',
    message: /"ghost" is not a block of the store/
  })
})
