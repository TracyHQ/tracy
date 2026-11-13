// Every reference a surviving record makes to another record is accounted for (#583): a menu item id, a category id,
// a link with `Itemid=`, a demo picture. A reference to a record the blank site deletes that is no field and no
// classed entry makes the generator refuse to write. Invented template and data only.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { accountForReferences, targetsOf } from '../ai-quickstart/lib/draft-references.mjs'
import { draftAiQuickstart } from '../ai-quickstart/lib/draft.mjs'

const DRAFT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../ai-quickstart/draft.mjs')
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
  entities: [{ key: 'module-1', kind: 'module' }],
  slots: [
    { key: 'module-1.0', entity: 'module-1', type: 'text', role: 'editorial.heading', jsonPath: ['title'] }
  ]
}
// An invented module whose settings point at a category, a menu item, an article link and a demo picture.
const lock = {
  entities: {
    'module-1': {
      params: JSON.stringify({
        title: 'Invented heading',
        catid: ['9'],
        more: 'index.php?option=com_content&view=article&id=5&Itemid=101',
        backdrop: 'images/demo/invented.jpg'
      })
    },
    'article-5': { content: '<p>Invented body with <a href="index.php?Itemid=101">a link</a></p>' }
  }
}
const decisions = {
  blocks: { 'block-1': { type: 'hero' } },
  removedWithPage: {
    article: { why: 'invented: the blank site step deletes every article' },
    menuItem: { why: 'invented: the blank site step deletes every menu item of a deleted page' }
  },
  references: {
    'module-1:params:more': {
      as: 'build-sets',
      owner: '#9001',
      why: 'invented: the build writes the new page'
    },
    'module-1:params:backdrop': { as: 'not-drawn', why: 'invented: no page shows the backdrop' }
  }
}
const account = (over = {}) =>
  accountForReferences({
    lock,
    contentMap,
    blocks: [{ id: 'block-1', fields: [], itemFields: [] }],
    report: {},
    decisions: { ...decisions, ...over }
  })

test('a stored value names the records it refers to', () => {
  assert.deepEqual(targetsOf(['catid', '0'], '9'), [{ kind: 'category', id: '9' }])
  assert.deepEqual(targetsOf(['link'], 'index.php?option=com_content&view=article&id=5&Itemid=101'), [
    { kind: 'menuItem', id: '101' },
    { kind: 'article', id: '5' }
  ])
  assert.deepEqual(targetsOf(['src'], 'images/demo/a.png'), [{ kind: 'media', id: 'images/demo/a.png' }])
  assert.deepEqual(targetsOf(['title'], 'Plain words, no reference'), [])
})

test('every reference of a surviving record is classed; a deleted record is not swept', () => {
  const res = account()
  assert.deepEqual(res.unaccounted, [])
  // catid 9: a category the blank site keeps; `more` holds two references, classed once each; the backdrop.
  assert.deepEqual(res.byClass, { 'target kept': 1, 'build-sets': 2, 'not-drawn': 1 })
  assert.equal(res.total, 4)
  assert.deepEqual(res.classed[0], {
    at: 'module-1:params:more',
    to: 'menuItem-101',
    as: 'build-sets',
    why: 'invented: the build writes the new page',
    owner: '#9001'
  })
})

test('a reference to a deleted record or a demo picture with no class is unaccounted', () => {
  const res = account({ references: {} })
  assert.deepEqual(res.unaccounted, [
    { at: 'module-1:params:more', to: 'menuItem-101' },
    { at: 'module-1:params:more', to: 'article-5' },
    { at: 'module-1:params:backdrop', to: 'images/demo/invented.jpg' }
  ])
})

test('build-sets names its owner ticket, and a class without a reason does not count', () => {
  const noOwner = account({
    references: { ...decisions.references, 'module-1:params:more': { as: 'build-sets', why: 'invented' } }
  })
  assert.equal(noOwner.unaccounted.length, 2)
  const noWhy = account({
    references: { ...decisions.references, 'module-1:params:backdrop': { as: 'not-drawn' } }
  })
  assert.deepEqual(noWhy.unaccounted, [{ at: 'module-1:params:backdrop', to: 'images/demo/invented.jpg' }])
})

test('a reference stored in a declared keyed place counts as keyed', () => {
  const res = accountForReferences({
    lock: { entities: { 'module-1': { params: JSON.stringify({ rows: { item_id: ['101'] } }) } } },
    contentMap,
    blocks: [
      {
        id: 'block-1',
        fields: [
          {
            name: 'page',
            type: 'link',
            derived: 'the page of the row',
            keyAt: { entity: 'module-1', column: 'params', jsonPath: ['rows', 'item_id', 0] }
          }
        ],
        itemFields: []
      }
    ],
    report: {},
    decisions
  })
  assert.deepEqual([res.byClass, res.unaccounted], [{ keyed: 1 }, []])
})

test('the draft reports references by class', () => {
  const res = draftAiQuickstart({ kit, contentMap, decisions, lock, template: { slug: 'x', version: '1' } })
  assert.deepEqual(res.references.byClass, { 'target kept': 1, 'build-sets': 2, 'not-drawn': 1 })
})

test('the generator writes nothing while a reference is unaccounted', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'ai-quickstart-references-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const contract = path.join(root, 'contract')
  const out = path.join(root, 'out')
  mkdirSync(contract)
  mkdirSync(out)
  writeFileSync(path.join(contract, 'template-kit.json'), JSON.stringify(kit))
  writeFileSync(path.join(contract, 'content-map.json'), JSON.stringify(contentMap))
  writeFileSync(path.join(contract, 'manifest.json'), '{}')
  writeFileSync(path.join(contract, 'presentation-lock.json'), JSON.stringify(lock))
  writeFileSync(path.join(out, 'draft-decisions.json'), JSON.stringify({ ...decisions, references: {} }))
  const run = () =>
    execFileSync(process.execPath, [DRAFT, '--contract', contract, '--out', out], { stdio: 'pipe' })
  assert.throws(run, (err) => {
    assert.equal(err.status, 1)
    assert.match(
      String(err.stderr),
      /3 reference\(s\) .* nothing written:\n {2}module-1:params:more -> menuItem-101/
    )
    return true
  })
  assert.equal(existsSync(path.join(out, 'block-store.json')), false)
  writeFileSync(path.join(out, 'draft-decisions.json'), JSON.stringify(decisions))
  run()
  assert.equal(existsSync(path.join(out, 'block-store.json')), true)
})
