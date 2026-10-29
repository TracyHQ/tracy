// The one rule every menu tidy-up step keeps (spec TracyHQ/tracy#189): the home entry and a kept page's entry are never
// taken off. Fixtures are fictional (a bakery's menu).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { menuSteps, pagesNotAnswering, withoutKeptTakeOff } from '../src/sites/brief-engines/joomla-tidy.js'

const rows = [
  { id: 101, home: 1, path: 'home', link: 'index.php?option=com_content&view=featured', published: 1 },
  { id: 120, home: 0, path: 'our-story', link: 'index.php?option=com_content&view=featured', published: 1 },
  {
    id: 130,
    home: 0,
    path: 'samples/featured',
    link: 'index.php?option=com_content&view=featured',
    published: 1
  }
]

test('a step taking off the home entry or a kept page entry is dropped; the others stand', () => {
  const steps = [...menuSteps([101, 120, 130]), { kind: 'menuItem', id: 101, fields: { title: 'Home' } }]
  const { steps: out, kept } = withoutKeptTakeOff(steps, rows, ['our-story'])
  assert.deepEqual(
    out.map((s) => [s.id, s.fields]),
    [
      [130, { published: 0 }],
      [101, { title: 'Home' }]
    ]
  )
  assert.deepEqual(kept, [101, 120])
})

test('the pages that do not answer 200 are named: the home page and each guarded entry by its Itemid', async () => {
  const reader = { page: async (url) => ({ status: url === '/index.php?Itemid=120' ? 404 : 200 }) }
  assert.deepEqual(await pagesNotAnswering(reader, [101, 120]), [
    { url: '/index.php?Itemid=120', status: 404 }
  ])
  assert.deepEqual(await pagesNotAnswering(null, [101]), [])
})
