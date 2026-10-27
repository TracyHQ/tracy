import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { testDir } from './lib/test-root.mjs'
import { buildBriefPack, missingBriefFacts } from '../ingest/from-brief.mjs'
import { loadSpec, buildPageContent, buildArchiveContent, articlePostLink, renderTypedSection } from '../seed.mjs'
import { validateSpecPack } from '../ingest/spec-pack.mjs'

const brief = () => {
  const rules = [
    { id: 'type-body', category: 'typography', selector: 'body', styles: { '1440-light': { fontFamily: 'Source Sans 3' }, '390-light': { fontFamily: 'Source Sans 3' }, '1440-dark': { fontFamily: 'Source Sans 3' }, '390-dark': { fontFamily: 'Source Sans 3' } } },
    { id: 'body-colors', category: 'color', selector: 'body', styles: { '1440-light': { color: '#182338' }, '390-light': { color: '#182338' }, '1440-dark': { color: '#edf2fa' }, '390-dark': { color: '#edf2fa' } } },
    { id: 'main-width', category: 'layout', selector: 'main', styles: { '1440-light': { maxWidth: '72rem' }, '390-light': { maxWidth: '100%' }, '1440-dark': { maxWidth: '72rem' }, '390-dark': { maxWidth: '100%' } } },
    { id: 'primary-button', category: 'component', selector: '.wp-block-button__link', styles: { '1440-light': { borderRadius: '0.5rem' }, '390-light': { borderRadius: '0.5rem' }, '1440-dark': { borderRadius: '0.5rem' }, '390-dark': { borderRadius: '0.5rem' } } }
  ]
  const allRules = rules.map((rule) => rule.id)
  return {
    site: { title: 'Northstar', tagline: 'Find your next direction', locale: 'en' },
    palette: {
      light: { primary: '#2457a7', secondary: '#e4ad50', body_bg: '#ffffff', text: '#182338' },
      dark: { primary: '#8bb6ff', secondary: '#f0c878', body_bg: '#101827', text: '#edf2fa' }
    },
    fonts: { body: 'Source Sans 3', heading: 'Fraunces' },
    voice: ['Direct, warm, and specific.'],
    rules,
    coverage: [{ selector: 'main', properties: ['color', 'fontFamily'] }],
    pages: [
      { path: '/', view: 'front-page', title: 'Northstar', rules: allRules, requiredRules: ['type-body', 'body-colors'], sections: [{ type: 'hero', content: '<h2>Make your next move</h2><p>Specific copy.</p>' }] },
      { path: '/story', view: 'single', title: 'Our story', rules: allRules, requiredRules: ['type-body'], sections: [{ type: 'article', content: '<h2>About us</h2><p>Specific copy.</p>' }] },
      { path: '/news', view: 'category', category: 'news', title: 'News', rules: allRules, requiredRules: ['body-colors'], sections: [{ type: 'intro', content: '<h2>Latest news</h2>' }] }
    ],
    menus: [{ menutype: 'primary', title: 'Primary', region: 'header', items: [{ label: 'Home', url: '/' }, { label: 'Story', url: '/story', children: [{ label: 'Our story', url: '/story' }] }] }]
  }
}

test('from-brief emits a seedable three-page pack with the authored sections and contracts', () => {
  const dir = join(testDir('brief-pack'), 'spec')
  const input = brief()
  const result = buildBriefPack(input, dir, { scope: 'website' })
  assert.equal(result.validation.ok, true, JSON.stringify(result.validation.problems))
  assert.equal(validateSpecPack(dir).ok, true)
  const validator = join(dirname(fileURLToPath(import.meta.url)), '..', 'ingest', 'spec-pack.mjs')
  assert.match(execFileSync(process.execPath, [validator, '--validate', dir], { encoding: 'utf8' }), /spec-pack OK/)
  const adapter = join(dirname(fileURLToPath(import.meta.url)), '..', 'ingest', 'from-brief.mjs')
  const briefFile = join(dirname(dir), 'brief.json')
  const cliPack = join(dirname(dir), 'cli-spec')
  writeFileSync(briefFile, `${JSON.stringify(input, null, 2)}\n`)
  assert.match(execFileSync(process.execPath, [adapter, briefFile, '--out', cliPack, '--scope', 'website'], { encoding: 'utf8' }), /"ok": true/)
  const spec = loadSpec(dir)
  assert.equal(spec.content.pages.length, 1)
  assert.equal(spec.content.posts.length, 1)
  assert.equal(spec.content.archives.length, 1)
  assert.equal(spec.sections.custom.length, 3)
  assert.equal(spec.menus.menus[0].region, 'header')
  assert.equal(spec.menus.menus[0].items[1].children[0].label, 'Our story')
  assert.deepEqual(spec.redirects.rules, [])
  assert.equal(JSON.parse(readFileSync(join(dir, 'reference.json'), 'utf8')).kind, 'none')
  assert.equal(JSON.parse(readFileSync(join(dir, 'provenance.json'), 'utf8')).adapter, 'from-brief')
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'content-contract.json'), 'utf8')).voice, input.voice)
  const design = JSON.parse(readFileSync(join(dir, 'design-contract.json'), 'utf8'))
  assert.deepEqual(design.rules, input.rules)
  assert.deepEqual(design.coverage, input.coverage)
  assert.deepEqual(design.pages[0].rules, input.pages[0].rules)
  assert.deepEqual(design.pages[0].requiredRules, input.pages[0].requiredRules)
  const page = spec.content.pages[0]
  assert.equal(page.contentKind, 'sections')
  assert.ok(Array.isArray(page.content), 'sections-mode content is an array of section entries as from-html emits')
  assert.deepEqual(page.content[0], { kind: 'section', sectionType: 'hero', moduleId: 'brief-home-html-1', title: 'hero', position: 'main', html: '<h2>Make your next move</h2><p>Specific copy.</p>' })
  const markup = buildPageContent(page, { spec, patternsMap: { types: {} }, patterns: {}, media: () => null, rewrite: (value) => value, cf7: null, log: [], sections: [], terms: new Map() })
  assert.match(markup, /Make your next move/, 'the page body contains the authored section')
  assert.match(spec.content.posts[0].content, /About us/, 'single view content is routed to the post body')
  assert.equal(spec.content.archives[0].view, 'category')
  assert.equal(spec.content.archives[0].category, 'news')
  const archiveMarkup = buildArchiveContent(spec.content.archives[0], {
    spec, patterns: { 'tracy/cards': '<!-- wp:query {"query":{"perPage":12,"inherit":true}} --><div class="wp-block-query"><!-- wp:post-template --><!-- wp:post-title /--><!-- /wp:post-template --></div><!-- /wp:query -->' }, terms: new Map([['news', { id: 3, name: 'News' }]]), descendants: () => [], categoryUrl: (slug) => `/category/${slug}/`, rewrite: (markup) => markup
  })
  assert.match(archiveMarkup, /News/)
  const section = spec.sections.custom[0]
  assert.deepEqual(section.fields, undefined)
  assert.deepEqual(section.items, undefined)
  assert.equal(articlePostLink('/story', spec, new Map([['story', 91]]), new Map([['story', '/story/']])).id, 91)
})

test('from-brief binds two authored single paths to their own posts', () => {
  const input = brief()
  input.pages = input.pages.filter((page) => page.view !== 'category')
  input.pages.push(
    { path: '/team', view: 'single', title: 'Our team', rules: input.rules.map((r) => r.id), requiredRules: ['type-body'], sections: [{ type: 'article', content: '<p>Team copy.</p>' }] }
  )
  const dir = join(testDir('brief-two-singles'), 'spec')
  const result = buildBriefPack(input, dir, { scope: 'website' })
  assert.equal(result.validation.ok, true, JSON.stringify(result.validation.problems))
  const spec = loadSpec(dir)
  assert.deepEqual(spec.content.posts.map((post) => post.path), ['/story', '/team'])
  assert.deepEqual(spec.content.posts.map((post) => post.slug), ['story', 'team'])
  const ids = new Map(spec.content.posts.map((post, i) => [post.slug, i + 1]))
  const urls = new Map(spec.content.posts.map((post) => [post.slug, `${post.path}/`]))
  assert.equal(articlePostLink('/story', spec, ids, urls).id, ids.get('story'))
  assert.equal(articlePostLink('/team', spec, ids, urls).id, ids.get('team'))
})

test('from-brief preserves typed section fields and items for the pattern builder', () => {
  const input = brief()
  input.pages[0].sections[0] = {
    type: 'demo',
    content: '<h2>Authored heading</h2><p>Authored item text</p>',
    fields: { heading: 'Authored heading' },
    items: [{ title: 'Authored item', text: 'Authored item text', meta: '', href: null }]
  }
  const dir = join(testDir('brief-typed-section'), 'spec')
  buildBriefPack(input, dir, { scope: 'website' })
  const section = loadSpec(dir).sections.custom[0]
  assert.deepEqual(section.fields, input.pages[0].sections[0].fields)
  assert.deepEqual(section.items, input.pages[0].sections[0].items)
  const patternMarkup = '<!-- wp:group --><div class="wp-block-group"><!-- wp:heading {"metadata":{"role":"content","name":"demo.heading"}} --><h2>Heading</h2><!-- /wp:heading --><!-- wp:group {"metadata":{"role":"content","name":"demo.item.1"}} --><div class="wp-block-group"><!-- wp:heading {"metadata":{"role":"content","name":"demo.item.1.title"}} --><h3>Item</h3><!-- /wp:heading --></div><!-- /wp:group --></div><!-- /wp:group -->'
  const rendered = renderTypedSection(section, { types: { demo: { pattern: 'demo-pattern', item: 'demo.item.<n>' } } }, { 'demo-pattern': patternMarkup }, () => null)
  assert.match(rendered.markup, /Authored heading/)
  assert.match(rendered.markup, /Authored item/)
})

test('from-brief reports malformed facts across groups and handles null entries', () => {
  const dir = join(testDir('brief-invalid'), 'spec')
  const bad = brief()
  delete bad.palette.light.primary
  delete bad.site.title
  delete bad.fonts.body
  delete bad.voice
  delete bad.rules[0].id
  delete bad.rules[1].category
  delete bad.rules[3].selector
  delete bad.rules[0].styles['1440-light']
  delete bad.rules[1].styles['390-light']
  delete bad.rules[2].styles['1440-dark']
  delete bad.rules[3].styles['390-dark']
  bad.rules.push(null)
  bad.rules[2].category = 'not-layout'
  delete bad.coverage
  delete bad.pages[1].path
  delete bad.pages[0].rules
  delete bad.pages[2].sections[0].content
  bad.pages[0].sections.push(null)
  bad.pages.push(null)
  delete bad.menus[0].region
  delete bad.menus[0].items[1].children[0].label
  bad.menus[0].items.push(null)
  bad.menus.push(null)
  assert.throws(() => buildBriefPack(bad, dir, { scope: 'website' }), (e) => {
    for (const fact of [
      'palette.light.primary', 'site.title', 'fonts.body', 'voice',
      'rules[0].id', 'rules[1].category', 'rules[2].category', 'rules[3].selector',
      'rules[0].styles.1440-light', 'rules[1].styles.390-light', 'rules[2].styles.1440-dark', 'rules[3].styles.390-dark',
      'rules.layout', 'rules[4]', 'coverage', 'pages[1].path', 'pages[0].rules',
      'pages[2].sections[0].content', 'pages[0].sections[1]', 'pages[3]', 'menus[0].region',
      'menus[0].items[1].children[0].label', 'menus[0].items[2]', 'menus[1]'
    ]) assert.ok(e.message.includes(fact), `missing-fact report names ${fact}: ${e.message}`)
    return true
  })
})

test('from-brief names each individually missing required fact', async (t) => {
  const omissions = [
    ['site.title', (b) => { delete b.site.title }],
    ['site.tagline', (b) => { delete b.site.tagline }], ['site.locale', (b) => { delete b.site.locale }],
    ['palette.light.primary', (b) => { delete b.palette.light.primary }], ['palette.light.secondary', (b) => { delete b.palette.light.secondary }], ['palette.light.body_bg', (b) => { delete b.palette.light.body_bg }], ['palette.light.text', (b) => { delete b.palette.light.text }],
    ['palette.dark.primary', (b) => { delete b.palette.dark.primary }], ['palette.dark.secondary', (b) => { delete b.palette.dark.secondary }], ['palette.dark.body_bg', (b) => { delete b.palette.dark.body_bg }], ['palette.dark.text', (b) => { delete b.palette.dark.text }],
    ['fonts.body', (b) => { delete b.fonts.body }], ['fonts.heading', (b) => { delete b.fonts.heading }], ['voice', (b) => { delete b.voice }],
    ['rules', (b) => { delete b.rules }], ['rules[0].id', (b) => { delete b.rules[0].id }], ['rules[0].category', (b) => { delete b.rules[0].category }], ['rules[0].selector', (b) => { delete b.rules[0].selector }],
    ...['1440-light', '390-light', '1440-dark', '390-dark'].map((variant) => [`rules[0].styles.${variant}`, (b) => { delete b.rules[0].styles[variant] }]),
    ['coverage', (b) => { delete b.coverage }], ['coverage[0].selector', (b) => { delete b.coverage[0].selector }], ['coverage[0].properties', (b) => { delete b.coverage[0].properties }],
    ['pages', (b) => { delete b.pages }], ['pages[0].path', (b) => { delete b.pages[0].path }], ['pages[0].view', (b) => { delete b.pages[0].view }], ['pages[0].title', (b) => { delete b.pages[0].title }],
    ['pages[0].sections', (b) => { delete b.pages[0].sections }], ['pages[0].sections[0].type', (b) => { delete b.pages[0].sections[0].type }], ['pages[0].sections[0].content', (b) => { delete b.pages[0].sections[0].content }],
    ['pages[0].rules', (b) => { delete b.pages[0].rules }], ['pages[0].requiredRules', (b) => { delete b.pages[0].requiredRules }],
    ['menus', (b) => { delete b.menus }], ['menus[0].menutype', (b) => { delete b.menus[0].menutype }], ['menus[0].title', (b) => { delete b.menus[0].title }], ['menus[0].region', (b) => { delete b.menus[0].region }],
    ['menus[0].items', (b) => { delete b.menus[0].items }], ['menus[0].items[0].label', (b) => { delete b.menus[0].items[0].label }], ['menus[0].items[0].url', (b) => { delete b.menus[0].items[0].url }],
    ['menus[0].items[1].children[0].label', (b) => { delete b.menus[0].items[1].children[0].label }], ['menus[0].items[1].children[0].url', (b) => { delete b.menus[0].items[1].children[0].url }],
    ['pages[2].category', (b) => { delete b.pages[2].category }]
  ]
  for (const [path, omit] of omissions) {
    await t.test(path, () => {
      const candidate = brief()
      omit(candidate)
      assert.ok(missingBriefFacts(candidate).includes(path), `missing-fact list should name ${path}`)
    })
  }
})

test('from-brief defaults to template scope; website scope is explicit', () => {
  const dir = join(testDir('brief-template-floor'), 'spec')
  const result = buildBriefPack(brief(), dir)
  assert.equal(JSON.parse(readFileSync(join(dir, 'page-map.json'), 'utf8')).scope, undefined)
  assert.equal(result.validation.ok, false)
  assert.match(result.validation.problems.join('\n'), /coverage floor is 12/)
})
