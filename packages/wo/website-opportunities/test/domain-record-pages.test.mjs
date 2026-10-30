// Sibling record pages (spec TracyHQ/tracy#189, site build rules 1 and 3): the template declares its record pages and
// their layout (the packing check refuses a map that does not), each page is written for its own record, and no card of
// the layout is left empty. Fictional businesses: a dog grooming salon and a bakery.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { heldRecordPages, landingRecordEntities, recordPageProblems } from '../domain/record-pages.mjs'
import { siblingRecordCopy } from '../domain/record-page-copy.mjs'
import { buildBlockers } from '../domain/build-blockers.mjs'

const text = (key, entity, role, sample, group) => ({
  key,
  entity,
  type: 'text',
  sample,
  role,
  ...(group ? { group } : {})
})
/** A record page: its card name, an intro paragraph, and two outline parts of a title and two bullets. */
const page = (n) => {
  const e = `article-${n}`
  const part = (i) => ({ id: `${e}.outline.${i}`, item: i, kind: 'step' })
  return [
    text(`${e}.0`, e, 'offering.name', 'Demo class', { id: `${e}.offering`, item: 0, kind: 'service' }),
    text(`${e}.1`, e, 'editorial.paragraph', 'Demo intro'),
    text(`${e}.2`, e, 'step.title', 'Demo part', part(0)),
    text(`${e}.3`, e, 'step.description', 'Demo line', part(0)),
    text(`${e}.4`, e, 'step.description', 'Demo line', part(0)),
    text(`${e}.5`, e, 'step.title', 'Demo part', part(1)),
    text(`${e}.6`, e, 'step.description', 'Demo line', part(1)),
    text(`${e}.7`, e, 'step.description', 'Demo line', part(1))
  ]
}
const article = (n) => ({
  key: `article-${n}`,
  kind: 'article',
  identity: { alias: `demo-${n}` },
  identityReferences: { catid: 'category-3' }
})
const MAP = {
  entities: [article(1), article(2), article(3), { key: 'module-1', kind: 'module' }],
  slots: [...page(1), ...page(2), ...page(3)]
}

test('a template whose sibling record pages are not declared cannot be released; a declared landing layout is read', () => {
  assert.deepEqual(heldRecordPages(MAP), ['article-1', 'article-2', 'article-3'])
  assert.equal(recordPageProblems(MAP).length, 3)
  const declared = {
    ...MAP,
    recordPages: [{ id: 'services', entities: ['article-1', 'article-2', 'article-3'], layout: 'landing' }]
  }
  assert.deepEqual(recordPageProblems(declared), [])
  assert.deepEqual(landingRecordEntities(declared), ['article-1', 'article-2', 'article-3'])
  const post = {
    ...MAP,
    recordPages: [{ id: 'news', entities: ['article-1', 'article-2', 'article-3'], layout: 'post' }]
  }
  assert.deepEqual(landingRecordEntities(post), [])
  assert.match(
    recordPageProblems({
      ...MAP,
      recordPages: [{ id: 'x', entities: ['article-1', 'article-9'], layout: 'grid' }]
    }).join(' '),
    /layout must be one of landing, post.*article-9.*article-2 is a record page/
  )
})

test('a section repeated on a sibling page with only the name swapped, and a card left empty, are written again', () => {
  const intro = (name) =>
    `Our ${name} appointments are calm and gentle, booked ahead, and every visit ends with a short note for the owner.`
  const written = {
    'article-1.0': 'Bath and Brush',
    'article-2.0': 'Nail Trim',
    'article-3.0': 'Puppy Intro',
    'article-1.1': intro('bath and brush'),
    'article-2.1': intro('nail trim'),
    'article-3.1':
      'A first short visit lets a young dog meet the table, the dryer and the sound of the clippers.',
    'article-1.2': 'Rinse',
    'article-1.3': 'Warm water first',
    'article-1.4': 'Then the shampoo',
    'article-1.5': 'Dry',
    'article-1.6': 'Towel off',
    'article-1.7': 'Low warm air',
    'article-2.2': 'Settle',
    'article-2.3': 'A treat on the table',
    'article-2.4': 'A gentle hold',
    // The nail page's second outline part was never written: an empty title over empty bullets.
    'article-3.2': 'Hello',
    'article-3.3': 'Sniff the tools',
    'article-3.4': 'A treat',
    'article-3.5': 'Goodbye',
    'article-3.6': 'A short brush',
    'article-3.7': 'Home again'
  }
  const { copied, missing } = siblingRecordCopy({ contentMap: MAP, written })
  assert.deepEqual(
    copied.map((c) => [c.key, c.record]),
    [['article-2.1', 'Nail Trim']]
  )
  assert.deepEqual(
    missing.map((m) => [m.key, m.role]),
    [
      ['article-2.5', 'step.title'],
      ['article-2.6', 'step.description'],
      ['article-2.7', 'step.description']
    ]
  )
  assert.ok(missing[0].like.includes('Dry'), 'the sibling lines of that place give the shape')
  // A slot the build empties (demo words taken off) is a missing card too.
  const blanked = siblingRecordCopy({ contentMap: MAP, written, blanked: new Set(['article-3.3']) })
  assert.ok(blanked.missing.some((m) => m.key === 'article-3.3'))
})

test('each defect of sibling record pages is a blocker of its own rule', () => {
  for (const kind of ['sibling-record-picture', 'sibling-record-copy', 'record-page-pager', 'empty-card']) {
    const judged = buildBlockers({ findings: [{ kind, page: '/services/bath' }], broken: [] })
    assert.equal(judged.state, 'needs-fixes', kind)
    assert.equal(judged.items[0].rule, 'sibling-record-pages', kind)
  }
})
