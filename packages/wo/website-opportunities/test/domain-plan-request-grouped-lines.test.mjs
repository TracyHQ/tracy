// The changed lines name repeated data once, with its count (#617 review, 2026-11-14): a page taken off with twelve
// photos on it says "12 photos", never "Photo, Photo, ...". Invented plans, pure.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-request-grouped-lines.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { changedLinesOf } from '../domain/plan-request-lines.mjs'

const photos = Array.from({ length: 12 }, (_, n) => ({ id: `gallery-${n}`, kind: 'gallery', label: 'Photo' }))
const plan = (pages) => ({
  facts: [
    { id: 'business-name', kind: 'business.name', label: 'Business name' },
    { id: 'link-1', kind: 'contact.social_url', label: 'Social link' },
    { id: 'link-2', kind: 'contact.social_url', label: 'Social link' }
  ],
  items: [...photos, { id: 'coach-1', kind: 'person', label: 'Mara Quill' }],
  pages,
  pictures: { own: { frames: 4 }, generated: { frames: 0 } }
})
const home = { id: 'home', name: 'Home', blocks: [{ id: 'hero', label: 'Hero', data: ['business-name'] }] }
const gallery = {
  id: 'gallery',
  name: 'Gallery',
  blocks: [
    { id: 'title', label: 'Page title', data: ['business-name'] },
    { id: 'grid', label: 'Photos', data: photos.map((p) => p.id) },
    { id: 'team', label: 'Coaches', data: ['coach-1'] },
    { id: 'links', label: 'Social links', data: ['link-1', 'link-2'] }
  ]
}

test('data no longer shown is grouped by its name, with the count of repeated names', () => {
  const lines = changedLinesOf(plan([home, gallery]), plan([{ ...home, blocks: [] }]))
  const off = lines.find((l) => l.startsWith('No longer shown'))
  assert.equal(off, 'No longer shown: Business name, 12 photos, Mara Quill, 2 social links.')
})

test('a name shown once keeps its own words', () => {
  const lines = changedLinesOf(plan([home, gallery]), plan([home]))
  assert.equal(
    lines.find((l) => l.startsWith('No longer shown')),
    'No longer shown: 12 photos, Mara Quill, 2 social links.'
  )
})
