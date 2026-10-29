// A block shown with the same content on several served pages, which the site plan did not keep there on purpose, is a
// finding (spec TracyHQ/tracy#189, COO decision 30/10/2026). Two invented trades: a bakery and a dental clinic.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkRepeatedBlocks } from '../src/opportunities-build/repeated-block-check.js'

const strip = (id, pics = ['a', 'b', 'c']) =>
  `<section id="${id}"><h2>Bakery life</h2>${pics.map((p) => `<img src="/images/${p}.jpg">`).join('')}<p>12 years baking</p></section>`
const footer = '<footer id="foot"><p>Fictional Bakery, 1 Flour Lane</p></footer>'
const page = (path, ...parts) => ({
  path,
  status: 200,
  html: `<html><body><main id="main-${path.length}">${parts.join('')}</main>${footer}</body></html>`
})

test('bakery: the photo strip the plan kept on home alone, still shown on About and services, is major', () => {
  const pages = [
    page('/', strip('Mod30')),
    page('/about', strip('Mod30'), '<p id="intro">About the bakery</p>'),
    page('/cakes', strip('Mod30')),
    page('/contact', '<p>Call us</p>')
  ]
  const sitePlan = {
    repeatedBlocks: [
      { entity: 'module-30', repeat: 'once', keepOn: { id: 'home' }, pages: ['home', 'about', 'cakes'] }
    ]
  }
  const out = checkRepeatedBlocks({ pages, sitePlan })
  assert.equal(out.length, 1)
  assert.equal(out[0].kind, 'repeated-block')
  assert.equal(out[0].severity, 'major')
  assert.deepEqual(out[0].paths, ['/', '/about', '/cakes'])
  assert.match(out[0].why, /Mod30/)
})

test('dental clinic: an undeclared picture block repeated on two of four pages is minor; one kept everywhere is not', () => {
  const people =
    '<div id="Mod31"><h3>Dr Ana Fictive</h3><img src="/images/ana.jpg"><img src="/images/ben.jpg"></div>'
  const pages = [
    page('/', strip('gallery-strip'), people),
    page('/about', strip('gallery-strip'), people),
    page('/treatments', '<p>Cleaning</p>'),
    page('/contact', '<p>Call us</p>')
  ]
  const sitePlan = {
    repeatedBlocks: [{ entity: 'module-31', repeat: 'everywhere', pages: ['home', 'about'] }]
  }
  const out = checkRepeatedBlocks({ pages, sitePlan })
  assert.deepEqual(
    out.map((f) => [f.block, f.severity]),
    [['gallery-strip', 'minor']]
  )
})

test('narrowed to one page, a frame on every page, or one id with different content: no finding', () => {
  const pages = [
    page('/', strip('Mod30'), '<div id="crumbs"><img src="/a.jpg"><img src="/b.jpg">Home</div>'),
    page('/about', '<div id="crumbs"><img src="/a.jpg"><img src="/c.jpg">About</div>'),
    page('/cakes', '<p>Cakes</p>'),
    { path: '/tracy-leftover-check-missing-page', status: 404, html: strip('Mod30') }
  ]
  const sitePlan = { repeatedBlocks: [{ entity: 'module-30', repeat: 'once', keepOn: { id: 'home' } }] }
  assert.deepEqual(checkRepeatedBlocks({ pages, sitePlan }), [])
  assert.deepEqual(checkRepeatedBlocks({ pages: [], sitePlan: null }), [])
})
