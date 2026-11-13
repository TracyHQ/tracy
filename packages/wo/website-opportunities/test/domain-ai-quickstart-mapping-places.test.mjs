// The mapping file rules of ticket #584, on the invented fixture: a field takes a business fact or is written at a
// location of the content map shape, every stored place has one writer, every entity is declared, every page type
// has its SEO fields, the library names its position, and the references the draft report names are set.
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
const header = (set) => set.blockStore.blocks.find((b) => b.id === 'header-main')
const PAGE_SEO = {
  title: [{ entity: 'page', column: 'params', jsonPath: ['page_title'] }],
  description: [{ entity: 'page', column: 'params', jsonPath: ['menu-meta_description'] }],
  shareImage: [{ entity: 'page', column: 'params', jsonPath: ['og_img'] }]
}

/** The messages of every problem a declaration set raises. */
const problemsOf = (set) => checkAiQuickstartContract(set).problems.map((p) => `${p.at}: ${p.message}`)

test('a location may carry the content map keys: slot, list indexes in jsonPath, nestedJson, a piece', () => {
  const set = valid()
  set.mapping.blocks['header-main'].fields.cta_label = {
    slot: 'module-11.4',
    entity: 'module-11',
    column: 'params',
    jsonPath: ['items', 0, 'label'],
    nestedJson: 'jatools-config',
    xpath: '/html/body/div/a[1]',
    piece: true
  }
  assert.deepEqual(problemsOf(set), [])
  set.mapping.blocks['header-main'].fields.cta_label = { entity: 'module-11', column: 'params', piece: true }
  assert.match(problemsOf(set).join('\n'), /piece is true, with the xpath of the piece/)
})

test('a field of a business fact kind takes the fact, or is a declared exception', () => {
  const set = valid()
  header(set).fields.find((f) => f.name === 'cta_label').kind = 'contact.phone'
  assert.match(problemsOf(set).join('\n'), /cta_label.*business fact: write it as \{fact\}/)
  set.mapping.factExceptions = [
    { block: 'header-main', field: 'cta_label', why: 'invented: not the business' }
  ]
  assert.deepEqual(problemsOf(set), [])
  set.mapping.blocks['header-main'].fields.cta_label = { fact: 'phone' }
  assert.deepEqual(problemsOf(set), [])
  set.mapping.blocks['header-main'].fields.cta_label = { fact: 'email' }
  assert.match(problemsOf(set).join('\n'), /not the kind of fact "email"/)
})

test('a stored place has one writer unless the block store shares it', () => {
  const set = valid()
  set.mapping.blocks['header-main'].fields.cta_label = { ...set.mapping.facts.phone[0] }
  assert.match(problemsOf(set).join('\n'), /2 writers \(field, fact\)/)
})

test('every entity a location names is declared', () => {
  const set = valid()
  delete set.mapping.entities['module-14']
  assert.match(problemsOf(set).join('\n'), /entity "module-14" is not declared in entities/)
})

test('seo by page type: every recipe page type has its three fields, the share image 1200x630', () => {
  const set = valid()
  set.mapping.seo = {
    shareImageFrame: { width: 1200, height: 630 },
    menuItem: PAGE_SEO,
    pageTypes: { home: 'menuItem', services: { title: { derived: 'the item name' }, ...PAGE_SEO } }
  }
  assert.deepEqual(problemsOf(set), [])
  delete set.mapping.seo.pageTypes.services
  set.mapping.seo.shareImageFrame = { width: 1200, height: 600 }
  const problems = problemsOf(set).join('\n')
  assert.match(problems, /share image frame is \{width: 1200, height: 630\}/)
  assert.match(problems, /page type "services" has no SEO fields/)
})

test('the library names a position, and its exceptions name recipe page types', () => {
  const set = valid()
  set.mapping.library = { position: 'content-bottom', pageTypes: { brochure: 'main-bottom' } }
  assert.match(problemsOf(set).join('\n'), /library.pageTypes\[brochure\]/)
  delete set.mapping.library
  assert.match(problemsOf(set).join('\n'), /library.position/)
})

test('a language override names its value source: a value, the fields that fill it, or keep', () => {
  const set = valid()
  set.mapping.overrides.language = [
    { key: 'TPL_A', filledBy: [{ block: 'hero-home', field: 'heading' }] },
    { key: 'TPL_B', keep: 'invented: interface text of a form' },
    { key: 'TPL_C' }
  ]
  assert.deepEqual(problemsOf(set), [
    'overrides.language[2]: a language override needs its value source: a string value, the fields it is filledBy, or keep with the reason'
  ])
})

test('with a draft report, every build-sets reference and every fact place it classes are set', () => {
  const set = valid()
  set.draftReport = {
    references: { classed: [{ at: 'module-13:params:catid.0', to: 'category-4', as: 'build-sets' }] },
    unlisted: [{ slot: 'module-14.9', as: 'fact' }]
  }
  const problems = problemsOf(set).join('\n')
  assert.match(problems, /build-sets reference module-13:params:catid.0 \(to category-4\) is not set/)
  assert.match(problems, /module-14.9 is classed fact by the draft report but is no fact place/)
  set.mapping.buildSets = {
    'module-13:params:catid.0': { entity: 'module-13', column: 'params', jsonPath: ['catid', 0] }
  }
  set.mapping.facts.phone.push({
    slot: 'module-14.9',
    entity: 'module-14',
    column: 'content',
    xpath: '/html/body/div/a[1]/@href',
    as: 'tel'
  })
  assert.deepEqual(problemsOf(set), [])
})
