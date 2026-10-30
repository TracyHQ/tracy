// Spec TracyHQ/tracy#189: a page kept for a real person must not live at an address that carries the demo person's name.
// A record (menu item, article, contact) whose address still names a demo person while its title now names someone else
// takes an address made from the new title, and every menu item opening a renamed record follows it. A final check lists
// what is left. Two made-up businesses: a dental clinic and a law office.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  carriesDemoName,
  demoNameAliasesLeft,
  demoNameSlugs,
  planDemoNameAliases
} from '../domain/demo-name-aliases.mjs'

const dentalMap = {
  entities: [
    { key: 'menuItem-40', kind: 'menuItem', sourceId: 40, identity: { path: 'team/ellis-hartwell' } },
    { key: 'menuItem-41', kind: 'menuItem', sourceId: 41, identity: { path: 'team/mira-solano' } },
    { key: 'menuItem-39', kind: 'menuItem', sourceId: 39, identity: { path: 'team' } },
    { key: 'contact-5', kind: 'contact', sourceId: 5, identity: { alias: 'ellis-hartwell' } }
  ],
  slots: [
    {
      key: 'menuItem-40.0',
      entity: 'menuItem-40',
      column: 'title',
      role: 'person.name',
      sample: 'Ellis Hartwell'
    },
    {
      key: 'menuItem-41.0',
      entity: 'menuItem-41',
      column: 'title',
      role: 'person.name',
      sample: 'Mira Solano '
    },
    {
      key: 'module-7.1',
      entity: 'module-7',
      column: 'params',
      role: 'person.name',
      sample: 'Meet Ellis Hartwell, our lead'
    },
    {
      key: 'contact-5.0',
      entity: 'contact-5',
      column: 'name',
      role: 'person.name',
      sample: 'Ellis Hartwell'
    },
    {
      key: 'module-8.2',
      entity: 'module-8',
      column: 'params',
      role: 'offering.name',
      sample: 'Teeth whitening'
    }
  ]
}

const lawMap = {
  entities: [
    { key: 'article-12', kind: 'article', sourceId: 12, identity: { alias: 'quinn-abernathy' } },
    { key: 'menuItem-88', kind: 'menuItem', sourceId: 88, identity: { path: 'quinn-abernathy' } }
  ],
  slots: [
    {
      key: 'article-12.0',
      entity: 'article-12',
      column: 'title',
      role: 'person.name',
      sample: 'Quinn Abernathy'
    },
    {
      key: 'module-3.4',
      entity: 'module-3',
      column: 'params',
      role: 'quote.author_name',
      sample: 'Rowan Pike'
    }
  ]
}

test('the demo names a template declares are its person and quote-author names, a heading is not a name', () => {
  assert.deepEqual(demoNameSlugs(dentalMap).sort(), ['ellis-hartwell', 'mira-solano'])
  assert.deepEqual(demoNameSlugs(lawMap).sort(), ['quinn-abernathy', 'rowan-pike'])
  assert.equal(carriesDemoName('dr-ellis-hartwell', ['ellis-hartwell']), 'ellis-hartwell')
  assert.equal(carriesDemoName('ellis-hartwells-office', ['ellis-hartwell']), null)
  assert.equal(carriesDemoName('team', ['ellis-hartwell']), null)
})

test('dental clinic: a kept dentist page takes an address from the real name; an unkept one is left hidden', () => {
  const records = [
    {
      kind: 'menuItem',
      id: 39,
      alias: 'team',
      title: 'Our dentists',
      published: 1,
      parent: 1,
      language: '*'
    },
    {
      kind: 'menuItem',
      id: 40,
      alias: 'ellis-hartwell',
      title: 'Dr Noor Kassab',
      published: 1,
      parent: 39,
      language: '*',
      opens: { kind: 'contact', id: 5 }
    },
    // No real dentist kept this page: it is hidden as today and keeps its address.
    {
      kind: 'menuItem',
      id: 41,
      alias: 'mira-solano',
      title: 'Mira Solano',
      published: 0,
      parent: 39,
      language: '*'
    },
    // A sibling already holds the slug the new name makes.
    {
      kind: 'menuItem',
      id: 42,
      alias: 'dr-noor-kassab',
      title: 'Old page',
      published: 1,
      parent: 39,
      language: '*'
    },
    { kind: 'contact', id: 5, alias: 'ellis-hartwell', title: 'Dr Noor Kassab', published: 1, parent: 4 }
  ]
  const steps = planDemoNameAliases({ contentMap: dentalMap, records })
  assert.deepEqual(steps, [
    { kind: 'contact', id: 5, alias: 'dr-noor-kassab', from: 'ellis-hartwell', reason: 'demo-name-replaced' },
    // The menu item opens the renamed contact and follows it, unique among its siblings.
    { kind: 'menuItem', id: 40, alias: 'dr-noor-kassab-2', from: 'ellis-hartwell', reason: 'follows-record' }
  ])
  // Before the writes the final check names both; after them, nothing is left.
  assert.deepEqual(
    demoNameAliasesLeft({ contentMap: dentalMap, records }).map((r) => `${r.kind}:${r.id}`),
    ['menuItem:40', 'contact:5']
  )
  const after = records.map((r) => {
    const step = steps.find((s) => s.kind === r.kind && s.id === r.id)
    return step ? { ...r, alias: step.alias } : r
  })
  assert.deepEqual(demoNameAliasesLeft({ contentMap: dentalMap, records: after }), [])
})

test('law office: a menu item opening a renamed article follows it; a page still showing the demo keeps its address', () => {
  const records = [
    {
      kind: 'menuItem',
      id: 88,
      alias: 'quinn-abernathy',
      title: 'Our partner',
      published: 1,
      parent: 1,
      language: '*',
      opens: { kind: 'article', id: 12 }
    },
    { kind: 'article', id: 12, alias: 'quinn-abernathy', title: 'Harriet Oyelaran', published: 1, parent: 7 }
  ]
  // The article was already renamed by the article rule of the same build.
  const moved = [{ kind: 'article', id: 12, alias: 'harriet-oyelaran', from: 'quinn-abernathy' }]
  assert.deepEqual(planDemoNameAliases({ contentMap: lawMap, records, moved }), [
    { kind: 'menuItem', id: 88, alias: 'harriet-oyelaran', from: 'quinn-abernathy', reason: 'follows-record' }
  ])
  // Still the demo's words on the page: the address is honest and stays.
  const demo = [
    { kind: 'article', id: 12, alias: 'quinn-abernathy', title: 'Quinn Abernathy', published: 1, parent: 7 }
  ]
  assert.deepEqual(planDemoNameAliases({ contentMap: lawMap, records: demo }), [])
  assert.deepEqual(demoNameAliasesLeft({ contentMap: lawMap, records: demo }), [])
})
