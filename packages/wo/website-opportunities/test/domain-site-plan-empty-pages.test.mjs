// Spec TracyHQ/tracy#189: a kept page whose every own section the site plan hid is taken off. A dental clinic, made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptiedPages } from '../domain/site-plan-empty-pages.mjs'

const map = (extra) => ({
  entities: [{ key: 'menuItem-9', kind: 'menuItem', identity: { path: 'fees' } }],
  pages: [
    {
      entity: 'menuItem-9',
      link: 'index.php?option=com_content&view=featured',
      assignedModules: [
        { entity: 'module-20', assignmentMode: 'include' },
        { entity: 'module-21', assignmentMode: 'include' },
        { entity: 'module-1', assignmentMode: 'all' }
      ]
    }
  ],
  slots: [
    {
      key: 'module-20.0',
      entity: 'module-20',
      type: 'text',
      role: 'package.price',
      group: { id: 'module-20.item.0' }
    },
    { key: 'module-21.0', entity: 'module-21', type: 'text', role: 'editorial.heading' },
    { key: 'module-1.0', entity: 'module-1', type: 'image', role: 'business.logo' },
    ...extra
  ]
})
const pages = [
  { id: 'home', keep: true, role: 'home' },
  { id: 'fees', keep: true, role: 'pricing' }
]
const honesty = { hide: [{ how: 'entity', entity: 'module-20' }] }

test('a fees page left with a heading over hidden price cards is taken off; the home page never is', () => {
  assert.deepEqual(emptiedPages({ pages, contentMap: map([]), honesty, keptForFacts: 'x' }), ['fees'])
})

test('a page that still shows a gallery of its own stays', () => {
  const gallery = [{ key: 'module-21.1', entity: 'module-21', type: 'image', role: 'business.gallery_image' }]
  assert.deepEqual(emptiedPages({ pages, contentMap: map(gallery), honesty, keptForFacts: 'x' }), [])
})

test('nothing hidden, or no content map page for the row: nothing is taken off', () => {
  assert.deepEqual(emptiedPages({ pages, contentMap: map([]), honesty: { hide: [] }, keptForFacts: 'x' }), [])
  assert.deepEqual(
    emptiedPages({
      pages: [{ id: 'other', keep: true, role: 'other' }],
      contentMap: map([]),
      honesty,
      keptForFacts: 'x'
    }),
    []
  )
})
