// The planner's image tool does not open pictures of the kit's stock screens (template-kit-source.js stockScreenImages):
// every plan drops those pages, so their pictures only grow the conversation. A kit that declares none is unchanged.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { KIT_TOOL_NAMES, kitTools, stockScreenImages } from '../src/lib/template-kit-source.js'

const kit = () =>
  JSON.parse(
    readFileSync(
      new URL(
        '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-diner/j6/1.0.8/template-kit.json',
        import.meta.url
      ),
      'utf8'
    )
  )
const opened = []
const images = { open: (id) => (opened.push(id), `IMAGE ${id}`) }
const openImage = (doc) => kitTools(doc, { images }).find((t) => t.name === KIT_TOOL_NAMES.openImage)

test('a kit that declares no stock screens opens every picture as before', () => {
  const doc = kit()
  assert.equal(stockScreenImages(doc).size, 0)
  assert.equal(openImage(doc).run({ id: 'page-j-pages_login-1440' }), 'IMAGE page-j-pages_login-1440')
})

test('pictures of declared stock screens are not opened; every other picture still is', () => {
  const doc = kit()
  doc.site = {
    ...doc.site,
    stockScreens: [
      { path: '/j-pages/login', why: 'a template account page' },
      { path: '/home/*', why: 'colour variants of the home page' }
    ]
  }
  const skipped = stockScreenImages(doc)
  assert.deepEqual([...new Set(skipped.values())].sort(), [
    'page-home_home-blue',
    'page-home_home-green',
    'page-home_home-pink',
    'page-home_home-red',
    'page-j-pages_login'
  ])
  opened.length = 0
  const tool = openImage(doc)
  const answer = JSON.parse(tool.run({ id: 'page-home_home-red-1440' }))
  assert.equal(answer.skipped, 'STOCK_SCREEN')
  assert.equal(answer.page, 'page-home_home-red')
  assert.equal(tool.run({ id: 'page-home-1440' }), 'IMAGE page-home-1440')
  assert.deepEqual(opened, ['page-home-1440'])
})
