// The printed rule (lib/printed-in-body.js) and the site check's `written-not-printed` measure: a picture or words count only as the
// page body prints them, and the measure blocks, naming the write step, for a written value no page prints. Every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fallbackBlock,
  pagePrints,
  pictureKey,
  printedSlotsOf,
  sitePrints,
  slotsOnPages
} from '../src/lib/printed-in-body.js'
import { checkLines } from '../src/site-check/check-lines.js'
import { PAGE_READ_GROUPS, runSiteCheck } from '../src/site-check/site-check.js'
import { isStep, stepName } from '../src/site-check/steps.js'
import { writtenNotPrintedGroup } from '../src/site-check/written-not-printed.js'
import { keptPages, POSTER, printedKit, printedLines, printedSite, SITE } from './_printed-page.mjs'

const PIC = 'images/tracy-content/3333cccc.jpg'
const picture = (slot, value = PIC) => ({ slot, kind: 'picture', value })
const body = (inner, head = '') => `<html><head>${head}</head><body>${inner}</body></html>`

test('a picture is printed when an img or a source of the body names its file, wherever the address says it', () => {
  for (const tag of [
    `<img src="/${PIC}" alt="">`,
    `<img src="https://site.example/${PIC}?v=2">`,
    `<picture><source srcset="/${PIC} 1x, /x.jpg 2x"><img src="/x.jpg"></picture>`
  ])
    assert.deepEqual(pagePrints(body(tag), [picture('article-1.2')]).notPrinted, [], tag)
  assert.equal(pictureKey(`${PIC}#joomlaImage://local-images/a.jpg?width=10`), PIC)
})

test('the same file in JSON-LD, a meta, the head, a script, a comment or a data attribute is not printed', () => {
  const head = `<meta property="og:image" content="/${PIC}"><script type="application/ld+json">{"image":"/${PIC}"}</script><link rel="preload" href="/${PIC}">`
  const inner = `<meta itemprop="image" content="/${PIC}"><div class="bg-mask" data-src="/${PIC}" data-bg="url(/${PIC})"></div>
<script>document.write('<img src="/${PIC}">')</script><!-- <img src="/${PIC}"> --><noscript><img src="/${PIC}"></noscript>`
  assert.deepEqual(pagePrints(body(inner, head), [picture('article-1.2')]).notPrinted, ['article-1.2'])
})

test('an element of the body painting the picture as its own background prints it', () => {
  const html = body(`<div class="hero" style="background-image: url('/${PIC}')"><h1>Swim</h1></div>`)
  assert.deepEqual(pagePrints(html, [picture('block-4.1')]).notPrinted, [])
})

test('two slots holding one file need two printed elements; the one printed once covers the first slot in kit order', () => {
  const html = body(`<figure><img src="/${PIC}"></figure>`)
  const both = pagePrints(html, [picture('article-1.3'), picture('article-1.9')])
  assert.deepEqual(both.notPrinted, ['article-1.9'])
  const fixed = body(`<figure><img src="/${PIC}"></figure>${fallbackBlock('article-1.9', PIC)}`)
  assert.deepEqual([...pagePrints(fixed, [picture('article-1.3'), picture('article-1.9')]).printed].sort(), [
    ['article-1.3', 'template'],
    ['article-1.9', 'fallback']
  ])
  assert.deepEqual(pagePrints(fixed, [picture('article-1.9')], { native: true }).notPrinted, [])
  assert.deepEqual(
    pagePrints(fixed, [picture('article-1.3'), picture('article-1.9')], { native: true }).notPrinted,
    ['article-1.9']
  )
})

test('words are printed when the body text holds them, whatever the markup, spaces, references or case', () => {
  const html = body(
    '<h2>Lessons &amp; <em>courses</em></h2><p>For   every\nage</p>',
    '<title>Hidden title</title>'
  )
  const words = (slot, value) => ({ slot, kind: 'text', value })
  const r = pagePrints(html, [
    words('a', 'Lessons & courses'),
    words('b', '<p>for every age</p>'),
    words('c', 'Hidden title'),
    words('d', 'Not on the page')
  ])
  assert.deepEqual(r.notPrinted, ['c', 'd'])
})

test('only written pictures of the content and written words are judged; addresses, logos and hidden lines are not', () => {
  const judged = printedSlotsOf([
    { slot: 'a', status: 'written', part: 'picture', ordered: PIC },
    { slot: 'b', status: 'written', part: 'brand-logo', ordered: PIC },
    { slot: 'c', status: 'written', ordered: 'index.php?Itemid=4' },
    { slot: 'd', status: 'hidden', ordered: 'Gone' },
    { slot: 'e', status: 'written', ordered: 'Real words' }
  ])
  assert.deepEqual(
    judged.map((s) => `${s.slot}:${s.kind}`),
    ['a:picture', 'e:text']
  )
})

test('a slot is printed when any page that shows it prints it', () => {
  const onPages = new Map([
    ['/a', ['block-2.1']],
    ['/b', ['block-2.1']]
  ])
  const pages = new Map([
    ['/a', body('<p>Elsewhere</p>')],
    ['/b', body('<p>Our services</p>')]
  ])
  const slots = [{ slot: 'block-2.1', kind: 'text', value: 'Our services' }]
  assert.deepEqual(sitePrints({ onPages, pages, slots }).notPrinted, [])
  pages.set('/b', null)
  assert.deepEqual(sitePrints({ onPages, pages, slots }).notPrinted, [{ slot: 'block-2.1', pages: ['/a'] }])
  assert.deepEqual(slotsOnPages(printedKit(), keptPages).get('/lessons/swim'), [
    'block-1.1',
    'article-7.1',
    'article-7.3',
    'article-7.9',
    'article-7.10'
  ])
})

const report = (slots) => ({ version: 'site-write-report/1', status: 'done', site: SITE, keptPages, slots })
const gate = (site, slots = printedLines()) =>
  runSiteCheck({
    door: site.door,
    report: report(slots),
    kit: printedKit(),
    pageHtml: (path) => site.pageHtml(path),
    groups: [writtenNotPrintedGroup],
    now: () => 0
  })

test('the measure blocks on a written poster the template drops, and names the write step', async () => {
  const check = await gate(printedSite())
  assert.equal(check.status, 'red')
  const [group] = check.groups
  assert.equal(group.name, 'written-not-printed')
  assert.equal(group.checked, 4)
  assert.deepEqual(
    group.failures.map((f) => [f.slot, f.page, f.causingStep, f.level, f.ordered]),
    [['article-7.9', '/lessons/swim', 9, 'block', POSTER]]
  )
  assert.equal(stepName(9), 'write')
  assert.ok(
    checkLines(check).some((l) => l.includes('block step 9 (write) page=/lessons/swim slot=article-7.9'))
  )
})

test('the measure is green once the page prints the poster, through a fallback block or the template itself', async () => {
  const site = printedSite()
  site.article.fulltext = fallbackBlock('article-7.9', POSTER) + site.article.fulltext
  const after = await gate(site)
  assert.equal(after.status, 'green', JSON.stringify(after.groups[0].failures))
  assert.deepEqual(after.groups[0].viaFallback, ['article-7.9'])
  const native = printedSite()
  native.video.id = 'abc123'
  assert.equal((await gate(native, printedLines({ videoId: 'abc123' }))).status, 'green')
})

test('without a page reader or a kit the measure cannot tell, and runs only when a reader is given', async () => {
  const site = printedSite()
  const noReader = await runSiteCheck({
    door: site.door,
    report: report(printedLines()),
    kit: printedKit(),
    groups: [writtenNotPrintedGroup]
  })
  assert.equal(noReader.groups[0].status, 'unmeasured')
  const noKit = await runSiteCheck({
    door: site.door,
    report: report(printedLines()),
    pageHtml: site.pageHtml,
    groups: [writtenNotPrintedGroup]
  })
  assert.equal(noKit.groups[0].status, 'unmeasured')
  for (const g of PAGE_READ_GROUPS) assert.ok(isStep(g.causingStep), g.name)
  assert.ok(PAGE_READ_GROUPS.includes(writtenNotPrintedGroup))
})
