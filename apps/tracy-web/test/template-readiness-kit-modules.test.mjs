// The kit modules check of the readiness verdict (kit-modules-check.js): a module the demo prints on a kit page, which the
// kit holds no block for, is named before a site is built. Invented kits and maps, then the committed JA Diner 1.0.8 kit,
// whose template-kit 3.1.0 build missed the T3 Section<N> modules of its home and about pages.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { defaultContracts } from '../src/lib/contracts.js'
import {
  KIT_MODULES_CHECK,
  modulesMissingFromKit,
  sectionsMissingFromKit
} from '../src/lib/template-readiness/kit-modules-check.js'
import { latestPin, releaseOfPin } from '../src/lib/template-readiness/pinned-release.js'

const kit = {
  pages: [
    { id: 'page-home', path: '/', blocks: { 1440: ['block-1', 'block-2'] } },
    { id: 'page-about', path: '/about', blocks: { 1440: ['block-2'] } }
  ],
  blocks: [
    { id: 'block-1', source: { entity: 'module-1', position: 'section-top', contains: ['module-5'] } },
    { id: 'block-2', source: { entity: 'module-2', position: 'footer-1' } }
  ]
}
const assigned = (entity, position, extra = {}) => ({
  entity,
  position,
  published: '1',
  access: '1',
  ...extra
})
const map = {
  slots: ['module-1', 'module-2', 'module-3', 'module-4', 'module-5', 'module-6', 'module-7', 'module-8'].map(
    (entity, i) => ({
      key: `${entity}.0`,
      entity,
      sample: `words ${i}`
    })
  ),
  pages: [
    {
      route: 'home',
      assignedModules: [
        assigned('module-1', 'section-top'),
        assigned('module-5', 'section-top'),
        assigned('module-3', 'section-top'),
        // Unpublished, members only, or in a position the kit holds no block in: not judged here.
        assigned('module-6', 'section-top', { published: '0' }),
        assigned('module-7', 'section-top', { access: '2' }),
        assigned('module-8', 'footer')
      ]
    },
    {
      route: 'about',
      assignedModules: [assigned('module-3', 'section-top'), assigned('module-4', 'footer-1')]
    },
    // A page the kit does not hold is not judged.
    { route: 'legacy', assignedModules: [assigned('module-9', 'section-top')] }
  ]
}

test('a published public module with slots, in a position the kit knows, on a kit page, with no block, is named', () => {
  assert.deepEqual(modulesMissingFromKit(kit, map), [
    { module: 'module-3', position: 'section-top', pages: ['/', '/about'] },
    { module: 'module-4', position: 'footer-1', pages: ['/about'] }
  ])
  // A module with no slot of the map has nothing the flow could write: not named.
  const bare = { ...map, slots: map.slots.filter((s) => s.entity !== 'module-4') }
  assert.deepEqual(
    modulesMissingFromKit(kit, bare).map((m) => m.module),
    ['module-3']
  )
})

test('the rebuilt JA Diner 1.0.8 kit holds a block for every module its pages print (#667): nothing to flag', () => {
  // Before #667 the committed kit missed the home features and the chef modules (module-95, 104, 115-117, 121-123); the
  // check that names missing modules is held by the invented case above.
  const contracts = defaultContracts()
  assert.equal(KIT_MODULES_CHECK.judge(releaseOfPin(latestPin('ja-diner'), contracts), { contracts }), null)
})

test('the latest JA Boxing kit holds a block for every module its pages print: nothing to flag', () => {
  const contracts = defaultContracts()
  assert.equal(KIT_MODULES_CHECK.judge(releaseOfPin(latestPin('ja-boxing'), contracts), { contracts }), null)
})

// EmDash: the sections of the content map (`<collection>.<slug>`) against the kit's blocks.
const emKit = {
  pages: [
    { id: 'page-home', path: '/', blocks: { 1440: ['block-menu-home-explore', 'block-home-section'] } },
    { id: 'page-menu', path: '/menu', blocks: { 1440: ['block-menu-home-explore'] } }
  ],
  blocks: [
    {
      id: 'block-menu-home-explore',
      source: { entity: 'block-menu-home-explore', contains: ['block-menu-home-sea'] }
    },
    {
      id: 'block-home-section',
      source: { entity: 'block-home-section', contains: [] },
      // A section printed with others: the block is named after its page, it holds the slots by id.
      slots: [{ id: 'gallery.home-gallery-1.title' }],
      lists: [{ rowSlots: [{ id: 'teams.about-team.items[0].name' }] }]
    }
  ]
}
const slot = (entity, field, extra = {}) => ({ key: `${entity}.${field}`, entity, sample: 'words', ...extra })
const emMap = (pages) => ({
  slots: [
    slot('menu.home-explore', 'title'),
    slot('menu.home-sea', 'title'),
    slot('gallery.home-gallery-1', 'title'),
    slot('teams.about-team', 'items[0].name'),
    slot('hero.home-hero', 'title'),
    slot('hero.home-hero', 'subtitle'),
    slot('features_intro.home-visit', 'title'),
    slot('masthead.blog', 'title'),
    slot('testimonials.home-testimonials', 'title', { nonVisual: true }),
    slot('settings', 'title'),
    slot('pages.home', 'title'),
    slot('posts.first', 'title'),
    slot('chrome.chrome', 'brand_name')
  ],
  pages
})
const emPage = (route, ...entities) => ({
  entity: `pages.${route}`,
  route: route === 'home' ? '/' : `/${route}`,
  openAs: route === 'home' ? '/' : `/${route}`,
  assignedModules: entities.map((entity) => ({ entity, published: '1' }))
})

test('EmDash: a section with visual slots and no block is named; one a block is named after, contains or holds is not', () => {
  const found = sectionsMissingFromKit(emKit, emMap([]))
  // menu.home-explore (its block), menu.home-sea (contained), gallery/teams (slots held by id): in the kit.
  // Non-visual slots, the settings, page entries, posts and the chrome are no sections.
  assert.deepEqual(
    found.map((m) => [m.section, m.slots]),
    [
      ['features_intro.home-visit', 1],
      ['hero.home-hero', 2],
      ['masthead.blog', 1]
    ]
  )
})

test('EmDash: with the pages that print each section, a section on a page outside the kit is ignored', () => {
  const map = emMap([
    emPage('home', 'block-hero-home-hero', 'block-features_intro-home-visit'),
    emPage('blog', 'block-masthead-blog')
  ])
  assert.deepEqual(sectionsMissingFromKit(emKit, map), [
    { section: 'features_intro.home-visit', slots: 1, pages: ['/'] },
    { section: 'hero.home-hero', slots: 2, pages: ['/'] }
  ])
})

test('EmDash: the judge names the sections (todo, warn once shown on Design inspiration); a complete kit and other platforms give null', () => {
  const world = { templateKit: { state: 'read', doc: emKit }, contentMap: emMap([]) }
  const verdict = KIT_MODULES_CHECK.judge({ platform: 'emdash' }, world)
  assert.equal(verdict.state, 'todo')
  assert.equal(verdict.code, 'kit-sections-missing')
  assert.equal(verdict.params.sectionNames, 'features_intro.home-visit, hero.home-hero, masthead.blog')
  assert.match(verdict.params.fix, /--reread-sections|reading the page sections afresh/)
  const whole = { ...world, contentMap: { slots: [slot('menu.home-explore', 'title')], pages: [] } }
  assert.equal(KIT_MODULES_CHECK.judge({ platform: 'emdash' }, whole), null)
  assert.equal(KIT_MODULES_CHECK.judge({ platform: 'wordpress' }, world), null)
})

test('EmDash: the committed kits of the templates that have one are judged (a failing template is listed, not fixed here)', async () => {
  const { readFileSync, existsSync } = await import('node:fs')
  const root = new URL('../../../packages/cms/tracy-emdash-theme-fresco/contracts/0.1.0/', import.meta.url)
  if (!existsSync(new URL('template-kit.json', root))) return
  const doc = JSON.parse(readFileSync(new URL('template-kit.json', root), 'utf8'))
  const contentMap = JSON.parse(readFileSync(new URL('content-map.json', root), 'utf8'))
  const verdict = KIT_MODULES_CHECK.judge(
    { platform: 'emdash' },
    { templateKit: { state: 'read', doc }, contentMap }
  )
  assert.equal(verdict.code, 'kit-sections-missing')
  assert.ok(verdict.params.sections.some((m) => m.section === 'features_intro.home-visit'))
})
