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

test('seo by page type: every recipe page type has its three fields, the share image 1200x630, the share title', () => {
  const set = valid()
  const limits = {
    titleLimit: 60,
    descriptionLimit: 160,
    limitsWhy: 'invented: search result display limits'
  }
  const ogTitle = {
    sameAs: 'title',
    locations: [{ entity: 'page', column: 'params', jsonPath: ['og_title'] }]
  }
  set.mapping.seo = {
    ...limits,
    shareImageFrame: { width: 1200, height: 630 },
    menuItem: { ...PAGE_SEO, ogTitle },
    pageTypes: {
      home: 'menuItem',
      services: {
        title: { derived: 'the item name' },
        ...PAGE_SEO,
        ogTitle: { sameAs: 'title', derived: 'the item name' }
      }
    }
  }
  assert.deepEqual(problemsOf(set), [])
  delete set.mapping.seo.pageTypes.services
  set.mapping.seo.shareImageFrame = { width: 1200, height: 600 }
  const problems = problemsOf(set).join('\n')
  assert.match(problems, /share image frame is \{width: 1200, height: 630\}/)
  assert.match(problems, /page type "services" has no SEO fields/)
})

test('the share title is the SEO title, written where the template prints og:title', () => {
  const set = valid()
  set.mapping.seo = {
    titleLimit: 60,
    descriptionLimit: 160,
    limitsWhy: 'invented',
    shareImageFrame: { width: 1200, height: 630 },
    menuItem: { ...PAGE_SEO, ogTitle: PAGE_SEO.title },
    pageTypes: { home: 'menuItem', services: 'menuItem' }
  }
  assert.match(
    problemsOf(set).join('\n'),
    /seo.pageTypes\[home\].ogTitle: ogTitle: \{sameAs: "title", locations\}/
  )
  delete set.mapping.seo.menuItem.ogTitle
  assert.match(problemsOf(set).join('\n'), /seo.pageTypes\[services\].ogTitle/)
})

test('the SEO limits are declared: whole numbers of characters, with where they come from', () => {
  const set = valid()
  delete set.mapping.seo.titleLimit
  set.mapping.seo.descriptionLimit = 0
  delete set.mapping.seo.limitsWhy
  assert.deepEqual(problemsOf(set), [
    'seo.titleLimit: titleLimit: the longest title in characters, a positive whole number',
    'seo.descriptionLimit: descriptionLimit: the longest description in characters, a positive whole number',
    'seo.limitsWhy: say where the title and description limits come from (search result display limits)'
  ])
})

test('the library names a position, its container class, and its exceptions name recipe page types', () => {
  const set = valid()
  set.mapping.library = {
    position: 'content-bottom',
    containerClass: 'container',
    pageTypes: { brochure: 'main-bottom' }
  }
  assert.match(problemsOf(set).join('\n'), /library.pageTypes\[brochure\]/)
  delete set.mapping.library.containerClass
  assert.match(problemsOf(set).join('\n'), /library.containerClass: name the class/)
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

test('a store with a network icon kept as a class name needs the template network icon classes', () => {
  const set = valid()
  const icon = set.blockStore.blocks
    .find((b) => b.id === 'services-grid')
    .itemFields.find((f) => f.name === 'icon')
  icon.storage = 'class-name'
  icon.iconOf = 'network'
  delete icon.frame
  assert.ok(problemsOf(set).some((p) => p.startsWith('networkIconClasses: the store keeps a network icon')))
  set.mapping.networkIconClasses = {
    classes: { facebook: 'icon-fb', myspace: 'icon-ms', x: '' },
    why: 'invented'
  }
  assert.deepEqual(
    problemsOf(set).filter((p) => p.startsWith('networkIconClasses')),
    [
      'networkIconClasses.classes[myspace]: "myspace" is not a network the build recognises: facebook, instagram, x, tiktok, youtube, linkedin, pinterest, threads, whatsapp, telegram, snapchat',
      'networkIconClasses.classes[x]: the class names a glyph of the template icon font'
    ]
  )
  set.mapping.networkIconClasses = {
    classes: { facebook: 'icon-fb' },
    why: 'invented: the font of the template'
  }
  assert.deepEqual(
    problemsOf(set).filter((p) => p.startsWith('networkIconClasses')),
    []
  )
})

/** The header's call to action filled from an invented template language string, `TPL_EXAMPLE_CALL`. */
function withLanguageString(set) {
  set.mapping.entities['languageString-7'] = {
    kind: 'languageString',
    identity: { extension: 'tpl_example', key: 'TPL_EXAMPLE_CALL', language: 'en-GB' }
  }
  header(set).fields.find((f) => f.name === 'cta_label').slot = 'languageString-7.0'
  set.mapping.blocks['header-main'].fields.cta_label = {
    slot: 'languageString-7.0',
    entity: 'languageString-7',
    column: 'value'
  }
}

test('a language string a field fills has its override, filled by exactly those fields, within their limit', () => {
  const set = valid()
  withLanguageString(set)
  assert.deepEqual(problemsOf(set), [
    'overrides.language: languageString-7.0 is filled by header-main.cta_label: give its override, filledBy them'
  ])
  const override = { key: 'TPL_EXAMPLE_CALL', slot: 'languageString-7.0', filledBy: [], limit: 19 }
  set.mapping.overrides.language.push(override)
  const problems = problemsOf(set).join('\n')
  assert.match(problems, /TPL_EXAMPLE_CALL is filled by header-main.cta_label, not $/m)
  assert.match(
    problems,
    /TPL_EXAMPLE_CALL: the limit is at most 18, the smallest limit of the fields that fill it/
  )
  override.filledBy = [{ block: 'header-main', field: 'cta_label' }]
  assert.deepEqual(problemsOf(set), [
    'overrides.language[1].limit: TPL_EXAMPLE_CALL: the limit is at most 18, the smallest limit of the fields that fill it'
  ])
  override.limit = 18
  assert.deepEqual(problemsOf(set), [])
})

test('every place a field written as a fact stands for is a place of the fact', () => {
  const set = valid()
  const field = header(set).fields.find((f) => f.name === 'cta_label')
  Object.assign(field, { kind: 'contact.phone', slot: 'module-11.4' })
  set.mapping.blocks['header-main'].fields.cta_label = { fact: 'phone' }
  assert.deepEqual(problemsOf(set), [
    'facts.phone: module-11.4 (header-main.cta_label, written as the phone fact) is no place of the fact'
  ])
  set.mapping.facts.phone.push({
    slot: 'module-11.4',
    entity: 'module-11',
    column: 'params',
    jsonPath: ['phone']
  })
  set.mapping.facts.phone.shift()
  assert.deepEqual(problemsOf(set), [])
})

test("Joomla's global configuration site name and mail sender name are places of the name fact", () => {
  const set = valid()
  set.mapping.facts.name.pop()
  assert.deepEqual(problemsOf(set), [
    "facts.name: settings fromname holds the business name: list it among the fact's places"
  ])
})

test('notEmptied: every kept place the file writes nowhere is classed with its reason, in the declared shape', () => {
  const set = valid()
  set.draftReport = { outsideStore: [{ slot: 'module-12.9', entity: 'module-12', as: 'not-drawn' }] }
  set.mapping.entities['module-15'] = { kind: 'module', identity: { title: 'Map', module: 'mod_custom' } }
  assert.deepEqual(problemsOf(set), [
    'entities[module-15]: no location names module-15: write it, or say in notEmptied why the blank site keeps it',
    'notEmptied: module-12.9 (not-drawn) is kept on the blank site and written by no field: say why in notEmptied'
  ])
  set.mapping.notEmptied = [
    { entity: 'module-15', why: 'invented: trashed, no page places it' },
    { entity: 'module-12', slot: 'module-13.9', why: 'invented' }
  ]
  assert.deepEqual(problemsOf(set), [
    'notEmptied[1]: a notEmptied entry is {entity, slot? | column?, why}, a slot of that entity',
    'notEmptied: module-12.9 (not-drawn) is kept on the blank site and written by no field: say why in notEmptied'
  ])
  set.mapping.notEmptied[1].slot = 'module-12.9'
  assert.deepEqual(problemsOf(set), [])
})

test('seo.featuredView names menu item page types of the recipes, and what the build keeps for them (#584)', () => {
  const set = valid()
  set.mapping.seo = {
    titleLimit: 60,
    descriptionLimit: 160,
    limitsWhy: 'invented: search result display limits',
    shareImageFrame: { width: 1200, height: 630 },
    menuItem: {
      ...PAGE_SEO,
      ogTitle: { sameAs: 'title', locations: [{ entity: 'page', column: 'params', jsonPath: ['og_title'] }] }
    },
    pageTypes: { home: 'menuItem', services: 'menuItem' },
    featuredView: {
      pageTypes: ['home'],
      needs: 'a published featured article',
      why: 'invented: the featured view prints share tags only from its articles'
    }
  }
  assert.deepEqual(problemsOf(set), [])
  set.mapping.seo.featuredView = { pageTypes: ['home', 'blog'], needs: 'anything', why: '' }
  const problems = problemsOf(set).join('\n')
  assert.match(problems, /seo.featuredView.pageTypes\[blog\]: a page type of the recipes/)
  assert.match(
    problems,
    /seo.featuredView.needs: what the build keeps on the site: "a published featured article"/
  )
  assert.match(problems, /seo.featuredView.why/)
})
