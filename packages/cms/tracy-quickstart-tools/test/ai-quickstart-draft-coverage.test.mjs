// Every stored place of the content map is accounted for (#583): a field place, a classed report entry, a classed
// value outside the store, or a record the blank site step removes with its page. One surviving place left
// unaccounted makes the generator refuse to write. Invented template and data only.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { draftAiQuickstart, summaryOf } from '../ai-quickstart/lib/draft.mjs'

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
  entities: [
    { key: 'module-1', kind: 'module' },
    { key: 'module-2', kind: 'module' },
    { key: 'article-5', kind: 'article' },
    { key: 'languageString-7', kind: 'languageString' }
  ],
  slots: [
    { key: 'module-1.0', entity: 'module-1', type: 'text', role: 'editorial.heading', jsonPath: ['title'] },
    { key: 'module-2.0', entity: 'module-2', type: 'text', role: 'editorial.heading', column: 'title' },
    { key: 'article-5.0', entity: 'article-5', type: 'text', role: 'article.title', column: 'title' },
    {
      key: 'languageString-7.0',
      entity: 'languageString-7',
      type: 'text',
      role: 'editorial.heading',
      column: 'value'
    }
  ]
}
const decisions = {
  blocks: { 'block-1': { type: 'hero' } },
  removedWithPage: { article: { why: 'invented: the blank site step deletes every article' } },
  outsideStore: {
    'module-2': { as: 'not-drawn', why: 'invented: a trashed module no page draws' },
    'languageString-7.0': { as: 'override', why: 'invented: demo words of a template string' }
  }
}
const draft = (over) =>
  draftAiQuickstart({
    kit,
    contentMap,
    decisions: { ...decisions, ...over },
    template: { slug: 'x', version: '1' }
  })

test('fields, report classes, outside the store and removed records add up to every slot of the content map', () => {
  const res = draft({})
  assert.deepEqual(res.coverage.unaccounted, [])
  const { coverage } = summaryOf(res)
  assert.deepEqual(coverage, {
    total: 4,
    fields: 1,
    report: { derived: 0, unlisted: 0, omitted: 0, sparse: 0 },
    outsideStore: 2,
    removedWithPage: { article: 1 },
    unaccounted: 0
  })
  assert.deepEqual(
    res.report.outsideStore.map((e) => [e.slot, e.as]),
    [
      ['module-2.0', 'not-drawn'],
      ['languageString-7.0', 'override']
    ]
  )
})

test('a surviving slot with no field and no class is unaccounted, and a class without a reason does not count', () => {
  assert.deepEqual(
    draft({ outsideStore: { 'languageString-7.0': decisions.outsideStore['languageString-7.0'] } }).coverage
      .unaccounted,
    ['module-2.0']
  )
  assert.deepEqual(
    draft({ outsideStore: { ...decisions.outsideStore, 'module-2': { as: 'not-drawn' } } }).coverage
      .unaccounted,
    ['module-2.0']
  )
  // A kind the blank site step removes, except a record it keeps.
  assert.deepEqual(
    draft({ removedWithPage: { article: { why: 'invented', except: ['article-5'] } } }).coverage.unaccounted,
    ['article-5.0']
  )
})

test('the generator writes nothing while a slot is unaccounted', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'ai-quickstart-coverage-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const contract = path.join(root, 'contract')
  const out = path.join(root, 'out')
  mkdirSync(contract)
  mkdirSync(out)
  writeFileSync(path.join(contract, 'template-kit.json'), JSON.stringify(kit))
  writeFileSync(path.join(contract, 'content-map.json'), JSON.stringify(contentMap))
  writeFileSync(path.join(contract, 'manifest.json'), '{}')
  writeFileSync(path.join(contract, 'presentation-lock.json'), JSON.stringify({ entities: {} }))
  writeFileSync(path.join(out, 'draft-decisions.json'), JSON.stringify({ ...decisions, outsideStore: {} }))
  const run = () =>
    execFileSync(process.execPath, [DRAFT, '--contract', contract, '--out', out], { stdio: 'pipe' })
  assert.throws(run, (err) => {
    assert.equal(err.status, 1)
    assert.match(
      String(err.stderr),
      /2 stored place\(s\) .* nothing written:\n {2}module-2\.0\n {2}languageString-7\.0/
    )
    return true
  })
  assert.equal(existsSync(path.join(out, 'block-store.json')), false)
  writeFileSync(path.join(out, 'draft-decisions.json'), JSON.stringify(decisions))
  run()
  assert.equal(existsSync(path.join(out, 'block-store.json')), true)
})
