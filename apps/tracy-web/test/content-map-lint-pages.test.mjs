// The packing rule of entities on no page (COO rule "content map gaps", 30/10/2026): an entity with slots that no page
// shows (by assignment, by the link that opens it, by what it references, or by a declared `shownOn`) is left out of the
// site plan, so the packing check and the /ops content coverage report it for the admin to declare. Trimmed maps of an
// invented template for a dog grooming salon.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { lintContentMap, lintContractDir } from '../src/lib/content-map-lint.js'

const slot = (entity) => ({
  key: `${entity}.0`,
  entity,
  type: 'text',
  role: 'editorial.heading',
  sample: 'Bath and trim'
})
const map = (entities) => ({
  roleVocabularyVersion: 3,
  entities: [{ key: 'menuItem-1', kind: 'menuItem', sourceId: 1 }, ...entities],
  pages: [
    {
      entity: 'menuItem-1',
      route: 'home',
      link: 'index.php?view=featured',
      assignedModules: [{ entity: 'module-3', assignmentMode: 'all', menuIds: [0] }]
    }
  ],
  slots: entities.map((e) => slot(e.key))
})
const onNoPage = (m) => lintContentMap(m).findings.filter((f) => f.rule === 'entity-on-no-page')

test('an entity with slots that no page shows is a warning naming it, with the fix', () => {
  const found = onNoPage(
    map([
      { key: 'module-3', kind: 'module', sourceId: 3 },
      { key: 'user-7', kind: 'user', sourceId: 7 },
      {
        key: 'userProfile-700',
        kind: 'userProfile',
        sourceId: 700,
        identityReferences: { user_id: 'user-7' }
      }
    ])
  )
  assert.deepEqual(
    found.map((f) => [f.key, f.severity]),
    [
      ['user-7', 'warning'],
      ['userProfile-700', 'warning']
    ]
  )
  assert.match(found[0].fix, /shownOn/)
})

test('an entity declared on its pages, on every page, or on no page on purpose passes; a demo-only entity is not judged', () => {
  const found = onNoPage(
    map([
      { key: 'module-3', kind: 'module', sourceId: 3 },
      { key: 'user-7', kind: 'user', sourceId: 7, shownOn: ['menuItem-1'] },
      {
        key: 'userProfile-700',
        kind: 'userProfile',
        sourceId: 700,
        identityReferences: { user_id: 'user-7' }
      },
      { key: 'languageString-9', kind: 'languageString', sourceId: 9, shownOn: 'every-page' },
      { key: 'tag-2', kind: 'tag', sourceId: 2, shownOn: [] },
      { key: 'article-4', kind: 'article', sourceId: 4, demoOnly: true }
    ])
  )
  assert.deepEqual(found, [])
})

test('a map that declares no pages is not judged', () => {
  const m = map([{ key: 'user-7', kind: 'user', sourceId: 7 }])
  m.pages = []
  assert.deepEqual(onNoPage(m), [])
})

test('a released map whose entities are all placed has no finding', () => {
  const dir = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8').dir
  assert.deepEqual(
    lintContractDir(dir).findings.filter((f) => f.rule === 'entity-on-no-page'),
    []
  )
})
