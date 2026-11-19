// The after-write check of a draft build (#575): a site whose root does not serve ends the build stopped, never done;
// another written page that does not serve is listed. Invented ids.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-serving.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { servingCheck } from '../src/step-chain-draft-serving.js'

const plan = {
  mainMenu: 'zqmenu',
  ops: [
    { key: 'menuItem:zqmenu:zq-a', kind: 'menuItem.create', fields: { menutype: 'zqmenu', home: 1 } },
    { key: 'menuItem:zqmenu:zq-b', kind: 'menuItem.create', fields: { menutype: 'zqmenu', home: 0 } },
    { key: 'menuItem:zqmenu:zq-c', kind: 'menuItem.create', fields: { menutype: 'zqmenu', home: 0 } }
  ]
}
// zq-c was not written (no site id): it is not read.
const state = { ids: { 'menuItem:zqmenu:zq-a': 11, 'menuItem:zqmenu:zq-b': 12 } }

test('a root that answers 404 stops the build typed, with the report failed', async () => {
  const report = { status: 'done', skippedItems: [] }
  const error = await servingCheck(async (path) => (path === '/' ? 404 : 200), plan, state, report).catch(
    (e) => e
  )
  assert.equal(error.code, 'site_not_serving')
  assert.equal(error.report.status, 'failed')
})

test('a serving root passes; a written page answering 500 is listed, a redirect serves', async () => {
  const report = { status: 'done', skippedItems: [] }
  const answers = { '/': 303, 'index.php?Itemid=11': 200, 'index.php?Itemid=12': 500 }
  const read = []
  const out = await servingCheck(
    async (path) => {
      read.push(path)
      return answers[path]
    },
    plan,
    state,
    report
  )
  assert.deepEqual(out, { checked: true, home: 303, pages: 2 })
  assert.deepEqual(read, ['/', 'index.php?Itemid=11', 'index.php?Itemid=12'])
  assert.deepEqual(report.skippedItems, [
    { code: 'page_not_serving', op: 'menuItem:zqmenu:zq-b', place: null, reason: '500', at: 'site' }
  ])
})

test('no page reader wired: nothing is read and the check says so', async () => {
  assert.deepEqual(await servingCheck(undefined, plan, state, { skippedItems: [] }), { checked: false })
})
