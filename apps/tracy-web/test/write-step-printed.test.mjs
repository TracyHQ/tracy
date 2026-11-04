// The write step's printed check (write-step/printed-stage.js): after the writes it reads the page, and a kept poster the template
// drops with its hidden video id is printed by a fallback block in the article text, once, taken off again when the template prints
// the poster itself, and counted in the report. Every fixture is invented (_printed-page.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fallbackBlock, fallbackBlocksIn } from '../src/lib/printed-in-body.js'
import { lookGuard } from '../src/write-step/look-guard.js'
import { runPrintedStage } from '../src/write-step/printed-stage.js'
import { keptPages, OTHER, POSTER, printedKit, printedLines, printedSite, SITE } from './_printed-page.mjs'
import { runStep } from './_write-step-run.mjs'

const stage = (site, lines = printedLines(), door = site.door) =>
  runPrintedStage({ door, siteKey: SITE, kit: printedKit(), lines, keptPages, pageHtml: site.pageHtml })

test('a kept poster the template drops is printed by one fallback block at the top of the article text', async () => {
  const site = printedSite()
  const before = site.article.fulltext
  const printed = await stage(site)
  assert.equal(site.updates().length, 1)
  assert.equal(site.article.fulltext, fallbackBlock('article-7.9', POSTER) + before)
  assert.match(
    site.article.fulltext,
    /^<div class="media-lead media-wrap tracy-fallback" data-slot="article-7\.9"><div class="thumb-media"><img src="\/images\/tracy-content\/1111aaaa\.jpg" alt="" class="img-fluid w-100"><\/div><\/div>\n/
  )
  assert.deepEqual(printed.viaFallback, [{ slot: 'article-7.9', page: '/lessons/swim', article: 7 }])
  assert.deepEqual(printed.counts, {
    checked: 4,
    printed: 4,
    viaFallback: 1,
    notPrinted: 0,
    unread: 0,
    writes: 1
  })
  assert.deepEqual(printed.fallback.added, ['article-7.9'])
})

test('a second run with nothing changed writes nothing and still counts the poster as printed via the fallback', async () => {
  const site = printedSite()
  await stage(site)
  const again = await stage(site)
  assert.equal(site.updates().length, 1, 'only the first run wrote')
  assert.equal(again.counts.writes, 0)
  assert.equal(again.counts.viaFallback, 1)
  assert.equal(fallbackBlocksIn(site.article.fulltext).length, 1)
})

test('the block comes off when the template prints the poster itself again', async () => {
  const site = printedSite()
  const before = site.article.fulltext
  await stage(site)
  site.video.id = 'abc123'
  const shown = await stage(site, printedLines({ videoId: 'abc123' }))
  assert.equal(site.article.fulltext, before)
  assert.deepEqual(shown.fallback.removed, ['article-7.9'])
  assert.equal(shown.counts.viaFallback, 0)
  assert.equal(shown.counts.notPrinted, 0)
})

test('a new poster replaces its block instead of adding a second one', async () => {
  const site = printedSite()
  await stage(site)
  site.video.poster = OTHER
  const changed = await stage(site, printedLines({ poster: OTHER }))
  const blocks = fallbackBlocksIn(site.article.fulltext)
  assert.deepEqual(
    blocks.map((b) => [b.slot, b.key]),
    [['article-7.9', OTHER]]
  )
  assert.equal(changed.counts.writes, 1)
  assert.equal(changed.counts.notPrinted, 0)
})

test('a block written by hand with the same picture and no slot is kept as it is', async () => {
  const hand = `<div class="media-lead media-wrap tracy-fallback">\n<div class="thumb-media">\n<img src="/${POSTER}" alt="" class="img-fluid w-100">\n</div>\n</div>\n`
  const site = printedSite({ fulltext: `${hand}<p>What a lesson looks like.</p>\n` })
  const printed = await stage(site)
  assert.equal(site.updates().length, 0)
  assert.equal(printed.counts.viaFallback, 1)
  assert.equal(printed.counts.notPrinted, 0)
})

test('a picture the template drops for another reason is reported, not printed by a block', async () => {
  const site = printedSite()
  const lines = printedLines().map((l) => (l.slot === 'article-7.3' ? { ...l, ordered: OTHER } : l))
  const printed = await stage(site, lines)
  assert.deepEqual(
    printed.notPrinted.map((n) => [n.slot, n.kind]),
    [['article-7.3', 'picture']]
  )
  // The header figure now prints the poster's file, which covers the poster: nothing is written.
  assert.deepEqual(printed.fallback.added, [])
  assert.equal(site.updates().length, 0)
})

test('the look guard lets the fallback block through and refuses any other change of a template article text', async () => {
  const site = printedSite()
  const guard = lookGuard({ kit: printedKit() })
  const door = guard.door(site.door)
  await stage(site, printedLines(), door)
  assert.deepEqual(guard.refused(), [])
  assert.equal(site.updates().length, 1)
  await door.apply({ siteKey: SITE, action: 'content.get', params: { kind: 'article', id: 7 } })
  const refused = await door.apply({
    siteKey: SITE,
    action: 'content.update',
    params: {
      apply_id: 'x',
      kind: 'article',
      id: 7,
      fields: { fulltext: `<p>Other words</p>${site.article.fulltext}` }
    }
  })
  assert.equal(refused.ok, false)
  assert.match(guard.cause().reason, /only a picture fallback block may change/)
})

test('the write step runs the printed check last when it is given a page reader, and reports it', async () => {
  const phases = []
  const { report } = await runStep(
    {},
    {},
    { pageHtml: async () => '<html><body></body></html>', onPhase: async (p) => phases.push(p) }
  )
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(phases.at(-1), 'printed')
  assert.equal(report.printed.counts.writes, 0)
  const { report: without } = await runStep()
  assert.equal(without.printed, undefined)
})
