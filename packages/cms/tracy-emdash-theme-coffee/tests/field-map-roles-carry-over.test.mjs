// Regenerating seed/field-map.json must not drop the slot roles a human or agent declared in it
// (ADR 0038): roles are carried over by field name when the field still exists with the same shape.
// A new or reshaped field gets none, so the contract check reports it instead of inheriting a wrong role.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { reverse } from '../tools/from-emdash-seed.mjs'
import { carryRolesIntoFieldMap, carryRolesIntoCompiledMap } from '../tools/carry-field-map-roles.mjs'

const previous = () => ({
  generatedAt: 'old',
  roleVocabularyVersion: 'place-content-roles/2',
  settings: {
    title: { role: 'business.name', group: { kind: 'business', name: 'identity' } },
    tagline: { role: 'business.tagline', group: { kind: 'business', name: 'identity' } }
  },
  collections: [
    {
      collection: 'pages',
      fields: [
        { slug: 'title', type: 'string', required: true, role: 'editorial.heading' },
        {
          slug: 'price',
          type: 'string',
          required: false,
          role: 'offering.price',
          group: { kind: 'menu_item' }
        },
        { slug: 'summary', type: 'text', required: false, role: 'editorial.paragraph' },
        {
          slug: 'faq_items',
          type: 'repeater',
          required: false,
          subFields: ['question:string', 'answer:text'],
          subRoles: { question: 'faq.question', answer: 'faq.answer' },
          group: { kind: 'faq' }
        },
        {
          slug: 'perks',
          type: 'repeater',
          required: false,
          subFields: ['label:string'],
          subRoles: { label: 'editorial.heading' }
        }
      ]
    },
    { collection: 'retired', fields: [{ slug: 'x', type: 'string', role: 'editorial.heading' }] }
  ]
})

const regenerated = () => ({
  generatedAt: 'new',
  collections: [
    {
      collection: 'pages',
      fields: [
        { slug: 'title', type: 'string', required: true },
        { slug: 'price', type: 'string', required: false },
        // same name, different type: the declared role no longer describes it
        { slug: 'summary', type: 'string', required: false },
        // a sub-field was added and one removed
        {
          slug: 'faq_items',
          type: 'repeater',
          required: false,
          subFields: ['question:string', 'answer:text', 'tag:string']
        },
        { slug: 'perks', type: 'repeater', required: false, subFields: ['label:text'] },
        { slug: 'fresh', type: 'string', required: false }
      ]
    }
  ],
  taxonomies: []
})

const field = (map, slug) => map.collections[0].fields.find((f) => f.slug === slug)

test('roles, groups and the top-level declarations survive regeneration by field name', () => {
  const out = carryRolesIntoFieldMap(previous(), regenerated())
  assert.equal(out.roleVocabularyVersion, 'place-content-roles/2')
  assert.equal(out.settings.title.role, 'business.name')
  assert.deepEqual(out.settings.tagline.group, { kind: 'business', name: 'identity' })
  assert.equal(field(out, 'title').role, 'editorial.heading')
  assert.equal(field(out, 'price').role, 'offering.price')
  assert.deepEqual(field(out, 'price').group, { kind: 'menu_item' })
  assert.equal(out.generatedAt, 'new')
})

test('a reshaped or new field gets no role, so the contract check reports it', () => {
  const out = carryRolesIntoFieldMap(previous(), regenerated())
  assert.equal(field(out, 'summary').role, undefined)
  assert.equal(field(out, 'fresh').role, undefined)
  assert.equal(field(out, 'perks').subRoles, undefined)
})

test('a repeater keeps the sub-roles of the sub-fields that still exist with the same type', () => {
  const out = carryRolesIntoFieldMap(previous(), regenerated())
  assert.deepEqual(field(out, 'faq_items').subRoles, { question: 'faq.question', answer: 'faq.answer' })
  assert.deepEqual(field(out, 'faq_items').group, { kind: 'faq' })
})

test('a collection that no longer exists leaves nothing behind', () => {
  const out = carryRolesIntoFieldMap(previous(), regenerated())
  assert.equal(
    out.collections.some((c) => c.collection === 'retired'),
    false
  )
})

test('with no previous field map, or one that declares nothing, the output is unchanged', () => {
  assert.deepEqual(carryRolesIntoFieldMap(null, regenerated()), regenerated())
  assert.deepEqual(carryRolesIntoFieldMap({ collections: [] }, regenerated()), regenerated())
})

test('a previous field map that declares no role returns the regenerated map itself, key order included', () => {
  const roleless = {
    generatedAt: 'old',
    fields: { 'pages.title': { source: 'text', target: 'string', label: 'Title' } }
  }
  const next = {
    fields: { 'pages.title': { source: 'text', target: 'string', label: 'Title' } },
    generatedAt: 'new'
  }
  assert.equal(carryRolesIntoCompiledMap(roleless, next), next)
  assert.equal(JSON.stringify(carryRolesIntoCompiledMap(roleless, next)), JSON.stringify(next))
  const fresh = regenerated()
  assert.equal(carryRolesIntoFieldMap({ generatedAt: 'old', collections: fresh.collections }, fresh), fresh)
})

test('carrying twice is stable', () => {
  const once = carryRolesIntoFieldMap(previous(), regenerated())
  assert.deepEqual(carryRolesIntoFieldMap(once, regenerated()), once)
})

test('the compiled field map shape (fields keyed collection.field) carries roles the same way', () => {
  const prev = {
    roleVocabularyVersion: 'place-content-roles/2',
    settings: { title: { role: 'business.name', group: { kind: 'business' } } },
    fields: {
      'pages.title': { source: 'text', target: 'string', label: 'Title', role: 'editorial.heading' },
      'pages.body': { source: 'prose', target: 'text', label: 'Body', role: 'editorial.paragraph' }
    }
  }
  const next = {
    generatedAt: 'new',
    fields: {
      'pages.title': { source: 'text', target: 'string', label: 'Title' },
      'pages.body': { source: 'prose', target: 'portableText', label: 'Body' },
      'pages.extra': { source: 'text', target: 'string', label: 'Extra' }
    }
  }
  const out = carryRolesIntoCompiledMap(prev, next)
  assert.equal(out.roleVocabularyVersion, 'place-content-roles/2')
  assert.equal(out.settings.title.role, 'business.name')
  assert.equal(out.fields['pages.title'].role, 'editorial.heading')
  assert.equal(out.fields['pages.body'].role, undefined)
  assert.equal(out.fields['pages.extra'].role, undefined)
})

test('compile-seed.mjs keeps the declared roles when it rewrites an existing field-map.json', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'carry-roles-'))
  try {
    const seed = {
      version: '1',
      defaultLocale: 'en',
      collections: [
        {
          slug: 'notes',
          label: 'Notes',
          labelSingular: 'Note',
          fields: [{ slug: 'headline', label: 'Headline', type: 'string' }]
        }
      ],
      content: {
        notes: [{ id: 'n1', slug: 'first', locale: 'en', status: 'published', data: { headline: 'Hello' } }]
      },
      menus: [],
      taxonomies: []
    }
    const model = reverse(seed).model
    const modelFile = path.join(dir, 'model.json')
    writeFileSync(modelFile, JSON.stringify(model))
    const seedDir = path.join(dir, 'seed')
    mkdirSync(seedDir)
    const script = new URL('../tools/compile-seed.mjs', import.meta.url).pathname
    const run = () => spawnSync('node', [script, modelFile, seedDir], { encoding: 'utf8' })
    const first = run()
    assert.equal(first.status, 0, first.stderr)
    const file = path.join(seedDir, 'field-map.json')
    const written = JSON.parse(readFileSync(file, 'utf8'))
    written.roleVocabularyVersion = 'place-content-roles/2'
    written.fields['notes.headline'].role = 'editorial.heading'
    writeFileSync(file, JSON.stringify(written))
    assert.equal(run().status, 0)
    const again = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(again.roleVocabularyVersion, 'place-content-roles/2')
    assert.equal(again.fields['notes.headline'].role, 'editorial.heading')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
