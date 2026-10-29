import assert from 'node:assert/strict'
import test from 'node:test'
import { runLeftoverCheck } from '../src/opportunities-build/demo-leftover-check.js'

for (const offering of ['Sourdough', 'Dental cleaning']) {
  const brief = {
    reading: { services: [{ id: 'offer-1', label: offering, quote: `${offering} from our team.` }] }
  }
  const card = (summary) =>
    `<article><h3><a href="/services/one">${offering}</a></h3>${summary}<a href="/contact">Details</a></article>`
  const run = (home, list) =>
    runLeftoverCheck({
      brief,
      contentMap: { slots: [] },
      paths: ['/services'],
      check: () => ({ pass: true, findings: [], counts: {} }),
      readPage: async (path) => ({
        status: path.includes('missing-page') ? 404 : 200,
        html: path === '/' ? home : list
      })
    })
  test(`${offering}: the final build result fails for an empty summary on home and the list`, async () => {
    const result = await run(card('<p>&nbsp;</p>'), card(''))
    assert.equal(result.pass, false)
    assert.deepEqual(result.offeringSummaries.map((f) => f.page).slice(0, 2), ['/', '/services'])
    assert.equal(result.offeringSummaries[0].offering, offering)
  })
  test(`${offering}: another card's summary cannot satisfy a missing summary`, async () => {
    const result = await run(
      `<section>${card('')}<article><h3>Another offering</h3><p>Its own summary.</p></article></section>`,
      ''
    )
    assert.equal(result.pass, false)
  })
  test(`${offering}: a template using a heading class on its title link still needs a summary`, async () => {
    const html = `<div class="items"><div class="item-inner"><div class="title"><a class="h3" href="/services/one">${offering}</a></div><div class="articles-introtext">&nbsp;</div><a href="/contact">Details</a></div><div class="item-inner"><h3>Other</h3><p>A different summary.</p></div></div>`
    const result = await run(html, '')
    assert.equal(result.pass, false)
    assert.equal(result.offeringSummaries[0].offering, offering)
  })
  test(`${offering}: a card with its own visible summary passes`, async () => {
    const result = await run(
      card(`<p>${offering} from our team.</p>`),
      card(`<div class="summary">${offering} from our team.</div>`)
    )
    assert.deepEqual(result.offeringSummaries, [])
    assert.equal(result.pass, true)
  })
  test(`${offering}: fact paragraphs and button labels never count as a summary`, async () => {
    const html = `<article><h3><a href="/services/one">${offering}</a></h3><section class="article-intro"><p>&nbsp;</p></section><div class="facts"><p>By appointment</p></div><p><a href="/contact">Details</a></p></article>`
    const result = await run(html, '')
    assert.equal(result.pass, false)
    assert.equal(result.offeringSummaries[0]?.offering, offering)
  })
}
