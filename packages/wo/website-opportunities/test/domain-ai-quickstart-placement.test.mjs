// The placement rules of ticket #584 (`ai-quickstart-placement.mjs`), on the invented fixture: every block says how
// the build writes it (a copy per placed block, the store record in place, or records it creates), and a copy
// declares what it inherits from the store record and must change. The last case reads the JA Boxing declarations.
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
const blockOf = (set, id) => set.blockStore.blocks.find((b) => b.id === id)
const problemsOf = (set) =>
  checkAiQuickstartContract(set).problems.map((p) => `${p.file} ${p.at}: ${p.message}`)
const assertProblem = (set, pattern) => {
  const problems = problemsOf(set)
  assert.ok(
    problems.some((p) => pattern.test(p)),
    `no problem matches ${pattern}:\n${problems.join('\n')}`
  )
}
const catid = { entity: 'module-13', column: 'params', jsonPath: ['catid', 0] }

test('the invented fixture places every block: no problem', () => {
  assert.deepEqual(problemsOf(valid()), [])
})

test('a block with no placement, or an unknown one, fails in the block store', () => {
  const set = valid()
  delete blockOf(set, 'hero-home').placement
  blockOf(set, 'footer-main').placement = 'moved'
  const problems = problemsOf(set)
  assert.ok(
    problems.includes(
      'block-store.json blocks[hero-home].placement: placement must be one of copy, in-place, created'
    )
  )
  assert.ok(problems.some((p) => p.startsWith('block-store.json blocks[footer-main].placement:')))
})

test('a pending mapping file does not ask for placements', () => {
  const set = valid()
  for (const block of set.blockStore.blocks) delete block.placement
  const { problems } = checkAiQuickstartContract({ ...set, mapping: undefined, mappingPending: true })
  assert.deepEqual(problems, [])
})

test('a copy or in-place block says how it is placed; a created block places no store record', () => {
  const set = valid()
  delete set.mapping.placements['hero-home']
  assertProblem(set, /placements\[hero-home\]: a copy block says how it is placed/)
  const created = valid()
  blockOf(created, 'footer-main').placement = 'created'
  assertProblem(created, /placements\[footer-main\]: a created block places no store record/)
  const stray = valid()
  stray.mapping.placements['no-block'] = { entity: 'module-11', assign: 'page' }
  assertProblem(stray, /placements\[no-block\]: "no-block" is not a block of the store/)
})

test('a copy copies a module the blank site keeps; an in-place block is assigned to the pages that place it', () => {
  const set = valid()
  set.mapping.placements['hero-home'].entity = 'settings'
  assertProblem(set, /placements\[hero-home\]\.entity: a copy is a copy of a module/)
  const missing = valid()
  delete missing.mapping.placements['hero-home'].entity
  assertProblem(missing, /placements\[hero-home\]\.entity: a copy names the store record it copies/)
  const assign = valid()
  assign.mapping.placements['header-main'].assign = 'page'
  assertProblem(
    assign,
    /placements\[header-main\]\.assign: assign is page, every-page, recipe-pages; a block written in place is one record/
  )
  const old = valid()
  old.mapping.placements['hero-home'].assign = 'pages'
  assertProblem(old, /placements\[hero-home\]\.assign: assign is page, every-page, recipe-pages/)
})

test('every-page ("[0]") is only for a block every recipe places; recipe-pages lists the pages that place it', () => {
  const set = valid()
  set.mapping.placements['hero-home'].assign = 'every-page'
  assertProblem(
    set,
    /placements\[hero-home\]\.assign: every-page \("\[0\]"\) prints the block on every page, but the recipes of services do not place it: assign it to recipe-pages/
  )
  set.mapping.placements['hero-home'].assign = 'recipe-pages'
  assert.deepEqual(problemsOf(set), [])
  const inPlace = valid()
  inPlace.mapping.placements['footer-main'].assign = 'recipe-pages'
  assert.deepEqual(problemsOf(inPlace), [])
})

test('an in-place block with no record is drawn by the layout, and says so', () => {
  const set = valid()
  delete set.mapping.placements['header-main'].entity
  assertProblem(
    set,
    /placements\[header-main\]\.layout: an in-place block names its store record \(entity, assign\), or the layout draws it: layout is \{why\}/
  )
  set.mapping.placements['header-main'] = { layout: { why: 'invented: the layout draws the header' } }
  set.mapping.notEmptied.push({ entity: 'module-11', why: 'invented: no block writes it' })
  assert.ok(!problemsOf(set).some((p) => p.includes('placements[header-main]')), problemsOf(set).join('\n'))
  set.mapping.placements['header-main'].assign = 'every-page'
  assertProblem(
    set,
    /placements\[header-main\]\.assign: a block the layout draws has no record, so no assign/
  )
  const both = valid()
  both.mapping.placements['header-main'].layout = { why: 'invented' }
  assertProblem(
    both,
    /placements\[header-main\]\.layout: a block that names its store record is not drawn by the layout/
  )
})

test('a module title drawn as content names the store field written at that title', () => {
  const set = valid()
  set.mapping.placements['hero-home'].title = { drawn: 'content', why: 'invented' }
  assertProblem(set, /placements\[hero-home\]\.title\.field: a drawn title names \{block, name\}/)
  set.mapping.placements['hero-home'].title.field = { block: 'hero-home', name: 'heading' }
  assertProblem(set, /the field is not stored at the title of module-12/)
  const fine = valid()
  fine.mapping.blocks['hero-home'].fields.heading = { entity: 'module-12', column: 'title' }
  fine.mapping.notEmptied = fine.mapping.notEmptied.filter((n) => n.entity !== 'module-12')
  fine.mapping.placements['hero-home'].title = {
    drawn: 'content',
    field: { block: 'hero-home', name: 'heading' },
    why: 'invented: the module prints its title as the heading'
  }
  assert.deepEqual(problemsOf(fine), [])
  const odd = valid()
  odd.mapping.placements['hero-home'].title = { drawn: 'tooltip', why: 'invented' }
  assertProblem(odd, /placements\[hero-home\]\.title: title is \{drawn: content \| tab-label/)
})

test('a copy resets every build-sets place and hides setting of its record, and only those', () => {
  const set = valid()
  set.mapping.buildSets = {
    'module-13:params:catid.0': { ...catid, sets: 'category', why: 'invented: the list category' }
  }
  assertProblem(set, /placements\[services-grid\]\.resets: a copy inherits .*catid.* \(buildSets\)/)
  set.mapping.placements['services-grid'].resets = [{ location: catid, from: 'buildSets', why: 'invented' }]
  assert.deepEqual(problemsOf(set), [])
  set.mapping.placements['services-grid'].resets.push({
    location: { entity: 'module-13', column: 'params', jsonPath: ['section-link'] },
    from: 'hides',
    why: 'invented'
  })
  assertProblem(set, /no hides entry of the mapping file names .*section-link/)
  const other = valid()
  other.mapping.placements['services-grid'].resets = [
    { location: { entity: 'module-12', column: 'ordering' }, from: 'recipe', why: 'invented' },
    { location: { entity: 'module-13', column: 'ordering' }, from: 'guess', why: 'invented' }
  ]
  assertProblem(other, /resets\[0\]\.location: a reset is a setting of the copied record module-13/)
  assertProblem(other, /resets\[1\]\.from: from must be one of buildSets, hides, container, recipe, demo/)
})

test('a hides setting of a copy block is a reset of every copy', () => {
  const set = valid()
  blockOf(set, 'header-main').placement = 'copy'
  set.mapping.placements['header-main'].assign = 'page'
  const location = { entity: 'module-11', column: 'params', jsonPath: ['section-link'] }
  set.mapping.hides['header-main'] = [
    { control: ['cta_label', 'cta_link'], by: 'setting', location, value: '0', why: 'invented' }
  ]
  assertProblem(set, /placements\[header-main\]\.resets: a copy inherits .*section-link.* \(hides\)/)
  set.mapping.placements['header-main'].resets = [{ location, from: 'hides', why: 'invented' }]
  assert.deepEqual(problemsOf(set), [])
})

test('only a copy resets, and a row removal runs only on a copy', () => {
  const set = valid()
  set.mapping.placements['header-main'].resets = []
  assertProblem(set, /placements\[header-main\]\.resets: only a copy resets what it inherits/)
  const rows = valid()
  blockOf(rows, 'services-grid').placement = 'in-place'
  rows.mapping.placements['services-grid'].assign = 'every-page'
  assertProblem(rows, /hides\[services-grid\]: a row removal runs on a copy/)
})

test('a block placed inside a container names it, the container holds it, and the copy takes its position', () => {
  const set = valid()
  blockOf(set, 'footer-main').positions = ['inside:services-grid']
  blockOf(set, 'footer-main').placement = 'copy'
  set.mapping.placements['footer-main'].assign = 'page'
  const problems = problemsOf(set).join('\n')
  assert.match(problems, /placements\[footer-main\]\.inside: the block is placed inside services-grid/)
  assert.match(problems, /the placement of services-grid does not hold footer-main/)
  assert.match(problems, /a held copy takes the position of its container copy/)
  set.mapping.placements['footer-main'].inside = { block: 'services-grid', why: 'invented: the tabs' }
  set.mapping.placements['footer-main'].resets = [
    { location: { entity: 'module-14', column: 'position' }, from: 'container', why: 'invented' }
  ]
  set.mapping.placements['services-grid'].holds = {
    blocks: ['footer-main'],
    position: { entity: 'module-11', column: 'params', jsonPath: ['position'] },
    why: 'invented'
  }
  assertProblem(set, /holds\.position: the position the container draws is a setting of module-13/)
  set.mapping.placements['services-grid'].holds.position.entity = 'module-13'
  assert.deepEqual(problemsOf(set), [])
  delete set.mapping.placements['services-grid'].holds.position
  assertProblem(set, /placements\[services-grid\]\.holds: holds is \{blocks, position: <location>, why\}/)
})

test('a container holds only the blocks placed inside it, and only a held block takes a container reset', () => {
  const set = valid()
  set.mapping.placements['services-grid'].holds = {
    blocks: ['hero-home'],
    position: { entity: 'module-13', column: 'params', jsonPath: ['position'] },
    why: 'invented'
  }
  assertProblem(
    set,
    /placements\[services-grid\]\.holds: hero-home is not placed inside:services-grid, so services-grid does not hold it/
  )
  const reset = valid()
  reset.mapping.placements['hero-home'].resets = [
    { location: { entity: 'module-12', column: 'position' }, from: 'container', why: 'invented' }
  ]
  assertProblem(
    reset,
    /placements\[hero-home\]\.resets: only a block placed inside a container takes a reset from container/
  )
})

test('a reset names a column a module record has', () => {
  const set = valid()
  set.mapping.placements['hero-home'].resets = [
    { location: { entity: 'module-12', column: 'colour' }, from: 'demo', why: 'invented' }
  ]
  assertProblem(set, /placements\[hero-home\]\.resets\[0\]\.location: a module record has no column colour/)
})

test('a created block writes only created records, a language string or a custom field', () => {
  const set = valid()
  blockOf(set, 'services-grid').placement = 'created'
  delete set.mapping.placements['services-grid']
  assertProblem(
    set,
    /blocks\[services-grid\]: a created block writes module-13, a record the build does not create/
  )
  set.mapping.entities['module-13'].created = true
  assert.ok(!problemsOf(set).some((p) => p.includes('a created block writes')), problemsOf(set).join('\n'))
})

test('a menu block names the menu it draws', () => {
  const set = valid()
  set.mapping.entities['module-14'].identity.module = 'mod_menu'
  assertProblem(set, /placements\[footer-main\]\.menu: a menu block names the menu it draws/)
  set.mapping.placements['footer-main'].menu = { menutype: '' }
  assertProblem(set, /placements\[footer-main\]\.menu: menu is \{menutype, why\}/)
  set.mapping.placements['footer-main'].menu = { menutype: 'footer', why: 'invented: the footer menu' }
  assertProblem(
    set,
    /placements\[footer-main\]\.menu\.menutype: "footer" is no menu the kit knows \(the menutype of a menu item entity: none\)/
  )
  set.mapping.entities['menuItem-1'] = {
    kind: 'menuItem',
    identity: { path: 'home', menutype: 'footer' },
    sourceId: 1
  }
  set.mapping.notEmptied.push({ entity: 'menuItem-1', why: 'invented: the footer menu item the demo keeps' })
  assert.deepEqual(problemsOf(set), [])
})

test('a copy writes only its own record, a created record or a language string', () => {
  const set = valid()
  set.mapping.blocks['hero-home'].fields.lead = { entity: 'module-14', column: 'params', jsonPath: ['lead'] }
  assertProblem(set, /blocks\[hero-home\]: a copy writes module-14, a record it does not copy/)
})

test('JA Boxing: every block is a copy, written in place or created, and the declarations pass', () => {
  const folder = '../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/'
  const json = (name) => JSON.parse(readFileSync(new URL(folder + name, import.meta.url), 'utf8'))
  const set = {
    blockStore: json('block-store.json'),
    pageRecipes: json('page-recipes.json'),
    mapping: json('mapping.json')
  }
  const count = (placement) => set.blockStore.blocks.filter((b) => b.placement === placement).length
  assert.deepEqual([count('copy'), count('in-place'), count('created')], [24, 10, 10])
  assert.equal(count('copy') + count('in-place') + count('created'), set.blockStore.blocks.length)
  assert.deepEqual(checkAiQuickstartContract(set).problems, [])
  // The two copies that need no plugin change for their row removal: one record each, for the whole site.
  for (const id of ['block-171', 'block-162'])
    assert.equal(set.blockStore.blocks.find((b) => b.id === id).placement, 'copy')
  assert.equal(set.mapping.placements['block-171'].assign, 'every-page')
  assert.equal(set.mapping.placements['block-162'].assign, 'recipe-pages')
  assert.equal(set.mapping.placements['block-17'].assign, 'recipe-pages')
  assert.ok(set.mapping.placements.header.layout.why)
})
