// The whole AI quickstart draft (#583): the summary counts and the notes the reviewed decisions pass to the mapping
// file. Invented template only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { draftAiQuickstart, summaryOf } from '../ai-quickstart/lib/draft.mjs'

const kit = {
  pageGroups: [{ id: 'group-home', root: 'page-home' }],
  pages: [{ id: 'page-home', path: '/', group: 'group-home', blocks: { 1440: ['block-1'] } }],
  blocks: [
    {
      id: 'block-1',
      role: 'section',
      source: { entity: 'module-1' },
      slots: [
        {
          id: 'block-1.0',
          role: 'editorial.heading',
          type: 'text',
          maxCharacters: 20,
          maxCharactersFrom: 'kit frame (390px 20, 1440px 30)'
        }
      ],
      lists: [],
      frames: []
    }
  ]
}
const contentMap = {
  roleVocabularyVersion: 'place-content-roles/3',
  slots: [
    { key: 'module-1.0', entity: 'module-1', type: 'text', role: 'editorial.heading', jsonPath: ['title'] },
    { key: 'module-1.1', entity: 'module-1', type: 'text', role: 'editorial.heading', column: 'title' }
  ]
}
const decisions = {
  blocks: { 'block-1': { type: 'hero' } },
  unlisted: { 'module-1.1': { as: 'not-drawn', why: 'invented: a hidden module title' } },
  notes: [{ about: 'block-1', note: 'invented: filled by an override' }]
}

test('the report carries the notes of the decisions, and the summary counts limits and unclassified values', () => {
  const res = draftAiQuickstart({
    kit,
    contentMap,
    decisions,
    template: { slug: 'invented', version: '1.0.0' }
  })
  assert.deepEqual(res.report.notes, decisions.notes)
  const summary = summaryOf(res)
  assert.deepEqual(summary.textLimits, {
    kitFrame390: 1,
    measuredOnSite: 0,
    notDrawn: 0,
    other: 0,
    missing: 0
  })
  assert.equal(summary.unlistedUnclassified, 0)
  const bare = draftAiQuickstart({
    kit,
    contentMap,
    decisions: { blocks: decisions.blocks },
    template: { slug: 'x', version: '1' }
  })
  assert.equal(summaryOf(bare).unlistedUnclassified, 1)
  assert.deepEqual(bare.report.notes, [])
})
