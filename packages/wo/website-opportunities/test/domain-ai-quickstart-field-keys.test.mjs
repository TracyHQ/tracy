// The keys a field of the AI quickstart block store may carry beyond its type (#583): how an icon is stored, what it
// stands for, light and dark versions of one picture, a row keyed to a page, and the documented forms of `derived`.
// One failing case per rule, on the invented fixture set, with the mapping file pending (the block store rules
// alone).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkAiQuickstartContract, sharedPlacesOf } from '../domain/ai-quickstart-contract.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ai-quickstart/${name}`, import.meta.url), 'utf8'))
const VALID = { blockStore: read('block-store.json'), pageRecipes: read('page-recipes.json') }
const pending = () => ({ ...structuredClone(VALID), mapping: undefined, mappingPending: true })
const blockOf = (set, id) => set.blockStore.blocks.find((b) => b.id === id)
const itemField = (set, name) => blockOf(set, 'services-grid').itemFields.find((f) => f.name === name)
const GRID = 'blocks[services-grid]'

function assertOneProblem(set, at, message) {
  const res = checkAiQuickstartContract(set)
  assert.equal(res.problems.length, 1, JSON.stringify(res.problems, null, 2))
  assert.equal(res.problems[0].file, 'block-store.json')
  assert.equal(res.problems[0].at, at)
  assert.match(res.problems[0].message, message)
}

/** The fixture's services grid with a second icon field: the light version of the first one. */
function withIconPair(set) {
  const icon = itemField(set, 'icon')
  icon.theme = 'dark'
  blockOf(set, 'services-grid').itemFields.push({
    ...structuredClone(icon),
    name: 'icon-light',
    theme: 'light',
    variantOf: 'icon',
    slots: ['module-13.20', 'module-13.21', 'module-13.22']
  })
  return set
}

/** The fixture's hero with a list of title rows keyed to pages, as a masthead stores them. */
function withKeyedRows(set) {
  const hero = blockOf(set, 'hero-home')
  hero.from = { kit: ['invented-hero'], entity: 'module-12' }
  hero.lists = [
    {
      name: 'pages',
      items: { min: 0, max: 2 },
      itemsFrom: { min: 'invented: a page with no row shows the default title', max: 'invented: two rows' },
      fields: [
        {
          name: 'title',
          kind: 'editorial.heading',
          type: 'text',
          limit: 20,
          slots: [['module-12.1', 'module-12.2']]
        },
        {
          name: 'page',
          kind: 'editorial.navigation_url',
          type: 'link',
          derived: 'the page of the row',
          keyAt: [
            [
              { entity: 'module-12', column: 'params', jsonPath: ['rows', 'page', 0] },
              { entity: 'module-12', column: 'params', jsonPath: ['rows', 'page', 1] }
            ]
          ]
        }
      ]
    }
  ]
  return set
}

test('the fixture passes with its icon stored as a picture file', () => {
  assert.deepEqual(checkAiQuickstartContract(pending()).problems, [])
})

test('storage takes a documented value only', () => {
  const set = pending()
  itemField(set, 'icon').storage = 'html: the links of a person'
  assertOneProblem(set, `${GRID}.itemFields[icon].storage`, /"image-file" or "class-name"/)
})

test('storage belongs to an icon field', () => {
  const set = pending()
  blockOf(set, 'header-main').fields[1].storage = 'class-name'
  assertOneProblem(set, 'blocks[header-main].fields[cta_link].storage', /only an icon field/)
})

test('an icon field says how the template keeps it', () => {
  const set = pending()
  delete itemField(set, 'icon').storage
  assertOneProblem(set, `${GRID}.itemFields[icon].storage`, /says how the template keeps the icon/)
})

test('iconOf takes a documented value only', () => {
  const set = pending()
  itemField(set, 'icon').iconOf = 'brand'
  assertOneProblem(set, `${GRID}.itemFields[icon].iconOf`, /"network"/)
})

test('textOf "network" names a text field beside a link; any other value or place is a problem', () => {
  const set = pending()
  itemField(set, 'name').textOf = 'network'
  assert.deepEqual(checkAiQuickstartContract(set).problems, [], 'the grid items carry a link field')
  itemField(set, 'name').textOf = 'brand'
  assertOneProblem(set, `${GRID}.itemFields[name].textOf`, /"network"/)
  const other = pending()
  itemField(other, 'icon').textOf = 'network'
  assertOneProblem(other, `${GRID}.itemFields[icon].textOf`, /textOf value of a text field/)
  const lonely = pending()
  const hero = blockOf(lonely, 'hero-home')
  hero.fields.find((f) => f.name === 'heading').textOf = 'network'
  assertOneProblem(lonely, 'blocks[hero-home].fields[heading].textOf', /no link field in the same block/)
})

test('derived is one of the documented forms, never free text', () => {
  const set = pending()
  itemField(set, 'link').derived = 'whatever the build finds'
  assertOneProblem(set, `${GRID}.itemFields[link].derived`, /not a documented form/)
})

test('rows keyed to a page pass when every row names its key place on the parent record', () => {
  assert.deepEqual(checkAiQuickstartContract(withKeyedRows(pending())).problems, [])
})

test('a field derived as the page of the row names where the key is stored', () => {
  const set = withKeyedRows(pending())
  delete blockOf(set, 'hero-home').lists[0].fields[1].keyAt
  assertOneProblem(set, 'blocks[hero-home].lists[pages].fields[page].keyAt', /names where the key is stored/)
})

test('a key place per row: the rows agree with the other fields of the list', () => {
  const set = withKeyedRows(pending())
  blockOf(set, 'hero-home').lists[0].fields[1].keyAt[0].pop()
  assertOneProblem(set, 'blocks[hero-home].lists[pages].fields[page].keyAt', /rows per parent place 1 differ/)
})

test('a key place on another record than its parent place fails', () => {
  const set = withKeyedRows(pending())
  blockOf(set, 'hero-home').lists[0].fields[1].keyAt[0][1].entity = 'module-99'
  assertOneProblem(set, 'blocks[hero-home].lists[pages].fields[page].keyAt', /module-99.*record module-12/)
})

test('a block field keyed to a page type names a page type of the recipes', () => {
  const set = pending()
  blockOf(set, 'hero-home').fields.push({
    name: 'stat-page',
    kind: 'editorial.navigation_url',
    type: 'link',
    derived: 'the page of the row',
    keyAt: { entity: 'module-12', column: 'params', jsonPath: ['rows', 'page', 2] },
    pageType: 'no-such-page'
  })
  assertOneProblem(set, 'blocks[hero-home].fields[stat-page].pageType', /no recipe of page type/)
})

test('a light and a dark version of one icon pass as a pair', () => {
  assert.deepEqual(checkAiQuickstartContract(withIconPair(pending())).problems, [])
})

test('both versions of a pair carry a theme', () => {
  const set = withIconPair(pending())
  delete itemField(set, 'icon').theme
  assertOneProblem(set, `${GRID}.itemFields[icon].theme`, /both versions of a pair carry a theme/)
})

test('the two versions of a pair differ in theme', () => {
  const set = withIconPair(pending())
  itemField(set, 'icon-light').theme = 'dark'
  assertOneProblem(set, `${GRID}.itemFields[icon-light].theme`, /same theme as icon/)
})

test('a variant shares the frame of the field it is a version of', () => {
  const set = withIconPair(pending())
  itemField(set, 'icon-light').frame = { width: 24, height: 24 }
  assertOneProblem(set, `${GRID}.itemFields[icon-light].variantOf`, /frame/)
})

test('a variant names a field of the same scope', () => {
  const set = withIconPair(pending())
  itemField(set, 'icon-light').variantOf = 'heading'
  delete itemField(set, 'icon').theme
  assertOneProblem(set, `${GRID}.itemFields[icon-light].variantOf`, /names no field of the same item/)
})

test('a theme on a field outside a pair fails', () => {
  const set = pending()
  itemField(set, 'icon').theme = 'light'
  assertOneProblem(set, `${GRID}.itemFields[icon].theme`, /one version of a pair/)
})

test('for names text fields of the same scope', () => {
  const set = pending()
  itemField(set, 'icon').for = ['name', 'price']
  assertOneProblem(set, `${GRID}.itemFields[icon].for`, /"price" is not a text field/)
})

test('an icon at block level without for has no content to be chosen from', () => {
  const set = pending()
  blockOf(set, 'hero-home').fields.push({
    name: 'badge',
    kind: 'editorial.item_icon',
    type: 'icon',
    storage: 'image-file',
    frame: { width: 32, height: 32 },
    slot: 'module-12.9'
  })
  assertOneProblem(set, 'blocks[hero-home].fields[badge]', /no content to be chosen from/)
})

test('a block level icon naming its text fields in for passes', () => {
  const set = pending()
  blockOf(set, 'hero-home').fields.push({
    name: 'badge',
    kind: 'editorial.item_icon',
    type: 'icon',
    storage: 'image-file',
    frame: { width: 32, height: 32 },
    slot: 'module-12.9',
    for: ['heading']
  })
  assert.deepEqual(checkAiQuickstartContract(set).problems, [])
})

test('a child field stored on another record than its parent place fails', () => {
  const set = pending()
  const day = blockOf(set, 'services-grid').itemLists[0].fields[0]
  day.slots[1] = ['module-77.14']
  blockOf(set, 'services-grid').itemLists[0].fields[1].slots[1] = ['module-77.15']
  const res = checkAiQuickstartContract(set)
  assert.equal(res.problems.length, 2, JSON.stringify(res.problems, null, 2))
  assert.match(res.problems[0].message, /module-77.14 is not on record module-13 of parent place 1/)
})

test('a stored place several fields use is listed with the smallest limit, which a build uses', () => {
  const set = pending()
  blockOf(set, 'hero-home').fields[0].slot = 'module-12.1'
  blockOf(set, 'footer-main').fields[0].slot = 'module-12.1'
  const shared = sharedPlacesOf(set.blockStore)
  assert.deepEqual(shared, [
    {
      place: 'module-12.1',
      limit: 42,
      uses: [
        { block: 'hero-home', field: 'heading', type: 'text', limit: 42 },
        { block: 'footer-main', field: 'copyright', type: 'text', limit: 80 }
      ]
    }
  ])
  assert.equal(checkAiQuickstartContract(set).sharedPlaces, 1)
})

test('a stored place typed differently by two fields fails', () => {
  const set = pending()
  blockOf(set, 'hero-home').fields[0].slot = 'module-12.1'
  blockOf(set, 'hero-home').fields[2].slot = 'module-12.1'
  assertOneProblem(set, 'blocks[hero-home].fields[photo]', /module-12.1 is typed text by hero-home.heading/)
})
