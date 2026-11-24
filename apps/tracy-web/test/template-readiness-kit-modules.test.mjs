// The kit modules check of the readiness verdict (kit-modules-check.js): a module the demo prints on a kit page, which the
// kit holds no block for, is named before a site is built. Invented kits and maps, then the committed JA Diner 1.0.8 kit,
// whose template-kit 3.1.0 build missed the T3 Section<N> modules of its home and about pages.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { defaultContracts } from '../src/lib/contracts.js'
import {
  KIT_MODULES_CHECK,
  modulesMissingFromKit,
  sectionsMissingFromKit
} from '../src/lib/template-readiness/kit-modules-check.js'
import { contractOfRelease } from '../src/lib/slot-roles-of-release.js'
import { kitOfRelease } from '../src/lib/template-kit/road-step.js'
import { readinessVerdict } from '../src/lib/template-readiness/verdict.js'
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

// EmDash: the sections of the content map (`<collection>.<slug>`) against the kit's blocks and the kit's own record of
// which sections each page prints (`sectionsOfPage`).
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
  ],
  sectionsOfPage: {
    '/': [
      'menu.home-explore',
      'menu.home-sea',
      'gallery.home-gallery-1',
      'hero.home-hero',
      'features_intro.home-visit'
    ],
    '/menu': ['features_intro.home-visit', 'teams.about-team'],
    // A page the kit does not hold: its sections are not judged.
    '/blog': ['masthead.blog', 'hero.home-hero']
  }
}
const slot = (entity, field, extra = {}) => ({ key: `${entity}.${field}`, entity, sample: 'words', ...extra })
const emMap = {
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
  ]
}

test('EmDash: a section printed on a kit page with visual slots and no block is named; one a block is named after, contains or holds is not', () => {
  // menu.home-explore (its block), menu.home-sea (contained), gallery and teams (slots held by id): in the kit.
  // Non-visual slots, the settings, page entries, posts and the chrome are no sections.
  assert.deepEqual(sectionsMissingFromKit(emKit, emMap), [
    { section: 'features_intro.home-visit', slots: 1, pages: ['/', '/menu'] },
    { section: 'hero.home-hero', slots: 2, pages: ['/'] }
  ])
})

test('EmDash: a section printed only on pages the kit leaves out (masthead.blog) is ignored', () => {
  assert.ok(!sectionsMissingFromKit(emKit, emMap).some((m) => m.section === 'masthead.blog'))
})

test('EmDash: a kit that does not say which page prints what is not judged, never guessed: it warns that it is unrecorded', () => {
  const { sectionsOfPage: _, ...old } = emKit
  assert.equal(sectionsMissingFromKit(old, emMap), null)
  const verdict = KIT_MODULES_CHECK.judge(
    { platform: 'emdash' },
    { templateKit: { state: 'read', doc: old }, contentMap: emMap }
  )
  assert.equal(verdict.state, 'warn')
  assert.equal(verdict.code, 'kit-sections-unrecorded')
  assert.match(verdict.params.fix, /--reread-sections/)
  assert.match(verdict.params.fix, /sectionsOfPage/)
})

test('EmDash: the judge names the sections (todo, warn once shown on Design inspiration); a complete kit and other platforms give null', () => {
  const world = { templateKit: { state: 'read', doc: emKit }, contentMap: emMap }
  const verdict = KIT_MODULES_CHECK.judge({ platform: 'emdash' }, world)
  assert.equal(verdict.state, 'todo')
  assert.equal(verdict.code, 'kit-sections-missing')
  assert.equal(verdict.params.sectionNames, 'features_intro.home-visit, hero.home-hero')
  assert.match(verdict.params.fix, /reading the page sections afresh/)
  const whole = { ...world, contentMap: { slots: [slot('menu.home-explore', 'title')] } }
  assert.equal(KIT_MODULES_CHECK.judge({ platform: 'emdash' }, whole), null)
  assert.equal(KIT_MODULES_CHECK.judge({ platform: 'wordpress' }, world), null)
})

// The Road's own path: the release row of an EmDash quickstart, its contract folder found as the other steps find it
// (`contractOfRelease`: the theme's `contracts/<version>`), the kit and the content map read from the committed files.
const EMDASH_CONTRACTS = [
  ['tracy-restaurant', '1.0.4'],
  ['tracy-diner', '0.1.4'],
  ['tracy-essence', '0.1.0'],
  ['tracy-fresco', '0.1.0'],
  ['tracy-base', '0.5.9'],
  ['tracy-business', '1.7.26']
]
const roadRow = (template, version, contracts) => ({
  ...releaseOfPin(latestPin('tracy-business/emdash'), contracts),
  tag: `${template}/emdash-0.x`,
  setting: { ...releaseOfPin(latestPin('tracy-business/emdash'), contracts).setting, template, version }
})

for (const [template, version] of EMDASH_CONTRACTS) {
  test(`EmDash on the Road: ${template} ${version} reads its kit and content map from the committed contract folder`, () => {
    const contracts = defaultContracts()
    const release = roadRow(template, version, contracts)
    const kit = kitOfRelease(release, contracts)
    if (kit.state !== 'read') return // no kit committed for this template: nothing to judge (base, business)
    // The committed kit predates `sectionsOfPage`: the step warns that it is unrecorded rather than guess the page of
    // a section, and the warn does not hold the release.
    const unrecorded = KIT_MODULES_CHECK.judge(release, { contracts })
    assert.deepEqual([unrecorded?.state, unrecorded?.code], ['warn', 'kit-sections-unrecorded'])
    assert.equal(
      readinessVerdict(release, { contracts }).pieces.find((p) => p.piece === 'template-kit').code,
      'kit-sections-unrecorded'
    )
    // A kit that records where each section is printed (every section on every kit page) reaches the finding through
    // the verdict, with the content map read from the same folder.
    const map = JSON.parse(
      readFileSync(path.join(contractOfRelease(release, contracts).dir, 'content-map.json'), 'utf8')
    )
    const everywhere = [...new Set(map.slots.map((s) => s.entity))]
    const doc = {
      ...kit.doc,
      sectionsOfPage: Object.fromEntries(kit.doc.pages.map((p) => [p.path, everywhere]))
    }
    const found = KIT_MODULES_CHECK.judge(release, { contracts, templateKit: { state: 'read', doc } })
    assert.equal(found?.code, 'kit-sections-missing')
    const verdict = readinessVerdict(release, { contracts, templateKit: { state: 'read', doc } })
    const piece = verdict.pieces.find((p) => p.piece === 'template-kit')
    assert.equal(piece.code, 'kit-sections-missing', `${template}: ${piece.code}`)
  })
}
