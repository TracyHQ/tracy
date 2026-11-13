// Text fields whose stored value carries inline markup are one owned class of the draft report (#583). Invented
// template only.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  inlineMarkupFieldsOf,
  inlineMarkupReport,
  markupOf
} from '../ai-quickstart/lib/draft-inline-markup.mjs'

const DRAFT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ai-quickstart/draft.mjs')

const contentMap = {
  slots: [
    { key: 'module-1.0', sample: 'Fresh ((br/))((span class="accent"))bread((/span))' },
    { key: 'module-1.1', sample: 'Baked every morning' },
    { key: 'module-2.0', sample: '$4((span))/loaf((/span))' },
    { key: 'module-2.1', sample: '$6' },
    { key: 'module-2.2', sample: '((ul))((li))Rye((/li))((li))Spelt((/li))((/ul))' }
  ]
}
const blocks = [
  {
    id: 'block-1',
    fields: [
      { name: 'heading', type: 'text', slot: 'module-1.0' },
      { name: 'paragraph', type: 'text', slot: 'module-1.1' }
    ]
  },
  {
    id: 'block-2',
    fields: [],
    itemFields: [{ name: 'price', type: 'text', slots: ['module-2.0', 'module-2.1'] }],
    itemLists: [
      {
        name: 'lines',
        fields: [
          {
            name: 'line',
            type: 'text',
            slots: [['module-2.2@/html/body/ul/li[1]', 'module-2.2@/html/body/ul/li[2]'], []]
          }
        ]
      }
    ]
  }
]
const decided = {
  inlineMarkup: {
    class: 'inline-markup-in-text',
    why: 'invented: values with markup the format does not describe',
    owners: { '#9001': 'how they are written', '#9002': 'the gate' },
    notes: { 'block-2.price': 'invented: the unit is a styled span' }
  }
}

test('the markers of a sample name its elements', () => {
  assert.deepEqual(markupOf('Fresh ((br/))((span class="accent"))bread((/span))'), ['br', 'span'])
  assert.deepEqual(markupOf('plain words'), [])
})

test('a text field with markup in any stored place is listed; a piece of a stored value is not', () => {
  assert.deepEqual(inlineMarkupFieldsOf(blocks, contentMap), [
    { block: 'block-1', field: 'heading', markup: ['br', 'span'] },
    { block: 'block-2', field: 'price', markup: ['span'] }
  ])
})

test('the class is owned only with a name, a reason and an owner ticket', () => {
  const owned = inlineMarkupReport({ blocks, contentMap, decisions: decided })
  assert.equal(owned.owned, true)
  assert.equal(owned.entry.count, 2)
  assert.equal(owned.entry.fields[1].note, 'invented: the unit is a styled span')
  assert.equal(inlineMarkupReport({ blocks, contentMap }).owned, false)
  const noOwner = { inlineMarkup: { ...decided.inlineMarkup, owners: { someone: 'x' } } }
  assert.equal(inlineMarkupReport({ blocks, contentMap, decisions: noOwner }).owned, false)
  assert.equal(inlineMarkupReport({ blocks: [blocks[0]], contentMap: { slots: [] } }).owned, true)
})

test('the generator writes nothing while a field with inline markup has no owned class', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'ai-quickstart-inline-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const contract = path.join(root, 'contract')
  const out = path.join(root, 'out')
  mkdirSync(contract)
  mkdirSync(out)
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
  const map = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'module-1', kind: 'module' }],
    slots: [
      {
        key: 'module-1.0',
        entity: 'module-1',
        type: 'text',
        role: 'editorial.heading',
        jsonPath: ['title'],
        sample: 'Fresh ((span))bread((/span))'
      }
    ]
  }
  writeFileSync(path.join(contract, 'template-kit.json'), JSON.stringify(kit))
  writeFileSync(path.join(contract, 'content-map.json'), JSON.stringify(map))
  writeFileSync(path.join(contract, 'manifest.json'), '{}')
  writeFileSync(path.join(contract, 'presentation-lock.json'), JSON.stringify({ entities: {} }))
  const decisions = { blocks: { 'block-1': { type: 'hero' } } }
  writeFileSync(path.join(out, 'draft-decisions.json'), JSON.stringify(decisions))
  const run = () =>
    execFileSync(process.execPath, [DRAFT, '--contract', contract, '--out', out], { stdio: 'pipe' })
  assert.throws(run, (err) => {
    assert.equal(err.status, 1)
    assert.match(
      String(err.stderr),
      /1 text field\(s\) store inline markup .* nothing written:\n {2}block-1 /
    )
    return true
  })
  assert.equal(existsSync(path.join(out, 'block-store.json')), false)
  writeFileSync(path.join(out, 'draft-decisions.json'), JSON.stringify({ ...decisions, ...decided }))
  run()
  const report = JSON.parse(readFileSync(path.join(out, 'draft-report.json'), 'utf8'))
  assert.deepEqual(report.summary.inlineMarkup, { class: 'inline-markup-in-text', fields: 1 })
})
