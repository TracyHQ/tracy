// Spec TracyHQ/tracy#189 item 30 (COO decision 30/10/2026): a band that loses its working parts comes off whole. A footer
// strip kept only its logo once the sign-up box beside it was taken off, and the logo stood alone in an empty strip.
// Two invented trades on two invented template shapes: a bakery footer (logo beside a newsletter box) and a dental clinic
// intro strip (a tooth icon beside a heading and a line). All names, places and files are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decorationLeftAlone, layoutBandProblems, proposeLayoutBands } from '../domain/layout-bands.mjs'

const module = (id, position, type = 'mod_custom') => ({
  key: `module-${id}`,
  kind: 'module',
  identity: { title: `Block ${id}`, module: type, position, language: '*' }
})

/** A bakery footer: the logo in `foot-brand-1`, a newsletter box in `foot-brand-2`, menus in `foot-links-*`. */
const bakery = {
  entities: [
    module(21, 'foot-brand-1'),
    module(22, 'foot-brand-2', 'mod_acym'),
    module(23, 'foot-links-1', 'mod_menu'),
    module(24, 'foot-links-2', 'mod_menu')
  ],
  slots: [
    {
      key: 'module-21.0',
      entity: 'module-21',
      type: 'url',
      role: 'editorial.navigation_url',
      sample: 'index.php'
    },
    {
      key: 'module-21.1',
      entity: 'module-21',
      type: 'image',
      role: 'business.logo',
      sample: 'images/demo/logo.png'
    },
    {
      key: 'module-22.0',
      entity: 'module-22',
      type: 'text',
      role: 'editorial.heading',
      sample: 'Fresh loaves weekly'
    },
    {
      key: 'module-22.1',
      entity: 'module-22',
      type: 'text',
      role: 'editorial.paragraph',
      sample: 'Get our news.'
    },
    { key: 'module-23.0', entity: 'module-23', type: 'text', role: 'editorial.menu_label', sample: 'Home' },
    { key: 'module-24.0', entity: 'module-24', type: 'text', role: 'editorial.menu_label', sample: 'Shop' }
  ]
}

/** A dental clinic intro strip: a drawn tooth icon in `intro-1`, a heading and a line in `intro-2`. */
const dental = {
  entities: [module(51, 'intro-1'), module(52, 'intro-2')],
  slots: [
    {
      key: 'module-51.0',
      entity: 'module-51',
      type: 'image',
      role: 'editorial.item_icon',
      sample: 'images/demo/tooth.svg'
    },
    {
      key: 'module-52.0',
      entity: 'module-52',
      type: 'text',
      role: 'editorial.heading',
      sample: 'Gentle care'
    },
    {
      key: 'module-52.1',
      entity: 'module-52',
      type: 'text',
      role: 'editorial.paragraph',
      sample: 'Since forever.'
    }
  ]
}

test('bakery: the footer logo beside the newsletter box is one band; the menu columns are none', () => {
  assert.deepEqual(proposeLayoutBands(bakery), [
    {
      id: 'foot-brand',
      parts: [
        { entity: 'module-21', part: 'decoration' },
        { entity: 'module-22', part: 'working' }
      ]
    }
  ])
})

test('bakery: the newsletter box taken off takes the lone logo with it', () => {
  assert.deepEqual(decorationLeftAlone(bakery, ['module-22']), [{ band: 'foot-brand', entity: 'module-21' }])
  assert.deepEqual(
    decorationLeftAlone(bakery, ['module-23']),
    [],
    'a band with its working part keeps its logo'
  )
})

test('dental clinic: the intro icon goes once the heading block beside it is taken off', () => {
  assert.deepEqual(decorationLeftAlone(dental, new Set(['module-52'])), [
    { band: 'intro', entity: 'module-51' }
  ])
})

test('a decoration the content map declares standalone stays', () => {
  const map = {
    ...dental,
    layoutBands: [
      {
        id: 'intro',
        parts: [
          { entity: 'module-51', part: 'standalone' },
          { entity: 'module-52', part: 'working' }
        ]
      }
    ]
  }
  assert.deepEqual(decorationLeftAlone(map, ['module-52']), [])
  assert.deepEqual(layoutBandProblems(map), [])
})

test('the packing check refuses an undeclared band and a malformed one', () => {
  assert.deepEqual(layoutBandProblems(bakery), [
    'layout band "foot-brand" (decoration "module-21") is not declared in layoutBands'
  ])
  const declared = {
    ...bakery,
    layoutBands: [
      {
        id: 'foot-brand',
        parts: [
          { entity: 'module-21', part: 'decoration' },
          { entity: 'module-22', part: 'working' }
        ]
      }
    ]
  }
  assert.deepEqual(layoutBandProblems(declared), [])
  const broken = {
    ...bakery,
    layoutBands: [{ id: 'foot-brand', parts: [{ entity: 'module-21', part: 'logo' }] }]
  }
  assert.deepEqual(layoutBandProblems(broken), [
    'layout band "foot-brand" must name at least two parts',
    'layout band "foot-brand" part "module-21" must be working, decoration or standalone',
    'layout band "foot-brand" has no working part'
  ])
})
