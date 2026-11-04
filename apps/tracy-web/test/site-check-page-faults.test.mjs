// A button leading to its own page, a page title as a heading, controls on a created page, the words of a sentence group, and the step
// each finding names. Pages and words are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createdPaths,
  findSeparatorHeadings,
  hasSeparator,
  judgeCreatedControls,
  selfLinkOwner
} from '../src/site-check/page-faults.js'
import { PAGE_CHECK_GROUPS } from '../src/site-check/page-groups.js'
import { judgeSentences } from '../src/site-check/printed-sentences.js'
import { runSiteCheck, SITE_CHECK_GROUPS } from '../src/site-check/site-check.js'
import { isStep } from '../src/site-check/steps.js'
import { checkLines } from '../src/site-check/check-lines.js'
import { fakeHost, pagedSite, pageRead, writtenReport } from './_site-check-pages.mjs'

test('every group names a step, and every step it names has a name', () => {
  for (const g of [...SITE_CHECK_GROUPS, ...PAGE_CHECK_GROUPS]) assert.ok(isStep(g.causingStep), g.name)
})

const owner = (over = {}) =>
  selfLinkOwner(
    { text: 'About us', page: '/about' },
    {
      slots: [
        { key: 'module-5.1', type: 'text', current: 'About us', group: { id: 'row-1' } },
        { key: 'module-5.2', type: 'url', current: 'index.php?Itemid=9', group: { id: 'row-1' } }
      ],
      lines: [],
      unowned: [],
      ...over
    }
  )

test('a self link is named by who owned its slot: the plan, the writer, nobody, or no slot at all', () => {
  assert.equal(
    owner({ lines: [{ key: 'module-5.2', status: 'written', owner: 'plan', slot: 'block-5.2' }] }).step,
    3
  )
  assert.equal(
    owner({ lines: [{ key: 'module-5.2', status: 'written', owner: 'writer', slot: 'block-5.2' }] }).step,
    6
  )
  assert.equal(owner({ unowned: [{ slot: 'block-5.2' }] }).step, 3)
  assert.equal(owner({ slots: [] }).step, 0, 'the template prints it')
})

test('a self link in a slot the site shares (header or footer) is no fault; the same words in a body slot are', async () => {
  const shared = owner({
    lines: [{ key: 'module-5.2', status: 'written', owner: 'plan', slot: 'header.link-7' }]
  })
  assert.equal(shared.shared, true)
  const footer = owner({
    lines: [{ key: 'module-5.2', status: 'written', owner: 'plan', slot: 'footer.link-2' }]
  })
  assert.equal(footer.shared, true)
  const body = owner({
    lines: [{ key: 'module-5.2', status: 'written', owner: 'plan', slot: 'block-5.2' }]
  })
  assert.equal(body.shared, false)
  assert.equal(owner({ slots: [] }).shared, false)
})

test('a button in the shared header is not reported by the self-links group, one in the body is', async () => {
  const slots = [
    { key: 'header.link-7', type: 'url', current: 'x', group: { id: 'h' } },
    { key: 'header.text-7', type: 'text', current: 'Contact us', group: { id: 'h' } },
    { key: 'module-5.2', type: 'url', current: 'x', group: { id: 'b' } },
    { key: 'module-5.1', type: 'text', current: 'Get in touch', group: { id: 'b' } }
  ]
  const lines = [
    { key: 'header.link-7', status: 'written', owner: 'plan', slot: 'header.link-7' },
    { key: 'module-5.2', status: 'written', owner: 'plan', slot: 'block-5.2' }
  ]
  const result = await run(
    () => [
      {
        path: '/contact',
        width: 1440,
        selfLinks: [
          { selector: 'a.btn', text: 'Contact us', href: 'http://site.test/contact' },
          { selector: 'a.cta', text: 'Get in touch', href: 'http://site.test/contact' }
        ]
      }
    ],
    'self-links',
    { slots: lines },
    { door: pagedSite(1, {}, slots).door }
  )
  assert.deepEqual(
    result.groups[0].failures.map((f) => f.measured),
    ['Get in touch']
  )
})

const run = (measures, groupName, reportOver = {}, extra = {}) =>
  runSiteCheck({
    door: pagedSite(1).door,
    report: writtenReport(reportOver),
    host: fakeHost({ '/': pageRead('/') }, { measures }).host,
    groups: PAGE_CHECK_GROUPS.filter((g) => g.name === groupName),
    ...extra
  })

test('a button to the page it is on is red; a page with none is green; a host that says nothing is unmeasured', async () => {
  const red = await run(
    () => [
      {
        path: '/',
        width: 1440,
        selfLinks: [{ selector: 'a.btn', text: 'About us', href: 'http://site.test/' }]
      }
    ],
    'self-links'
  )
  assert.equal(red.status, 'red')
  assert.equal(red.groups[0].failures[0].measured, 'About us')
  assert.equal((await run(() => [{ path: '/', width: 1440, selfLinks: [] }], 'self-links')).status, 'green')
  assert.equal((await run(() => [{ path: '/', width: 1440 }], 'self-links')).status, 'unmeasured')
})

test('a bar in a heading is a separator; a dash only when the heading is the page title itself', () => {
  assert.ok(hasSeparator('Privacy Policy | Quay Fitness Studio', 'x'))
  assert.ok(hasSeparator('Quay Fitness - Lessons', 'Quay Fitness - Lessons'))
  assert.ok(!hasSeparator('Train hard - rest well', 'Quay Fitness Studio'))
  assert.ok(!hasSeparator('Fish & chips', 'x'))
})

test('a separator in a visible heading blocks, in a hidden one it warns; both name the copy step', async () => {
  const f = findSeparatorHeadings([
    { path: '/a', mainHeadings: ['Privacy Policy | Quay'], headings: ['Privacy Policy | Quay'], title: 't' },
    { path: '/b', mainHeadings: ['Lessons'], hiddenHeadings: ['About | Quay'], title: 't' }
  ])
  assert.deepEqual(
    f.map((x) => [x.page, x.level]),
    [
      ['/a', undefined],
      ['/b', 'warn']
    ]
  )
  const check = await run(
    () => [{ path: '/', width: 1440, mainHeadings: ['Privacy Policy | Quay'], hiddenHeadings: [] }],
    'heading-separator'
  )
  assert.equal(check.groups[0].failures[0].causingStep, 6)
  assert.ok(checkLines(check).some((l) => l.includes('step 6 (copy)')))
})

const CREATED = new Set(['/site-pages/privacy'])
const page = (path, keys, view = 'view-article', width = 390) => ({
  path,
  width,
  view,
  contentControls: keys.map((key) => ({ key, text: '' }))
})

test('a created page with share buttons no content page shows is red; without them it is green', () => {
  const service = page('/index.php/classes/a', ['div.custom>a'])
  const red = judgeCreatedControls(
    [service, page('/index.php/site-pages/privacy', ['div.custom>a', 'ul.share>li>a.facebook'])],
    CREATED
  )
  assert.equal(red.failures.length, 1)
  assert.deepEqual(red.failures[0].measured.shown, ['ul.share>li>a.facebook'])
  const green = judgeCreatedControls(
    [service, page('/index.php/site-pages/privacy', ['div.custom>a'])],
    CREATED
  )
  assert.deepEqual(green.failures, [])
})

test('only a content page of the same width and view stands for the template; none at all is unmeasured', () => {
  const shareOnDesktop = page('/classes/a', ['ul.share>li>a'], 'view-article', 1440)
  const shareOnHome = page('/', ['ul.share>li>a'], 'view-featured')
  const service = page('/classes/a', ['div.custom>a'])
  const created = page('/site-pages/privacy', ['ul.share>li>a'])
  assert.equal(
    judgeCreatedControls([shareOnDesktop, shareOnHome, service, created], CREATED).failures.length,
    1
  )
  assert.equal(judgeCreatedControls([shareOnHome, created], CREATED), null)
})

test('created pages are the kept pages with an address line of their own', () => {
  const paths = createdPaths({
    keptPages: [
      { id: 'page-home', path: '/' },
      { id: 'legal-privacy', path: '/site-pages/privacy' }
    ],
    slots: [{ slot: 'legal-privacy:address', part: 'page-address' }]
  })
  assert.deepEqual([...paths], ['/site-pages/privacy'])
})

test('a site with no created page is green with nothing checked; a host that says nothing about controls is unmeasured', async () => {
  const none = await run(() => [{ path: '/', width: 390, contentControls: [] }], 'created-controls')
  assert.deepEqual([none.status, none.groups[0].checked], ['green', 0])
  const silent = await run(() => [{ path: '/', width: 390 }], 'created-controls', {
    keptPages: [{ id: 'p', path: '/p' }],
    slots: [{ slot: 'p:address', part: 'page-address', status: 'skipped' }]
  })
  assert.equal(silent.status, 'unmeasured')
})

const KIT = {
  blocks: [
    {
      sentences: [
        {
          id: 's1',
          slots: ['block-1.1', 'block-1.2'],
          joins: [' '],
          kept: [true],
          pieces: ['Open to ', 'all']
        }
      ]
    }
  ]
}
const held = (a, b) =>
  new Map([
    ['block-1.1', a],
    ['block-1.2', b]
  ])
const printed = (text) => [{ path: '/', width: 1440, shownText: `Welcome. ${text}. Book now.` }]

test('a capital in mid sentence, as the page prints it, is red and names the copy step by default', () => {
  const { failures, read } = judgeSentences(
    KIT,
    held('Open to', 'Every age every level'),
    [],
    printed('OPEN TO EVERY AGE EVERY LEVEL')
  )
  assert.equal(read, 1)
  assert.equal(failures.length, 1)
  assert.match(failures[0].reason, /"Every" starts with a capital/)
  assert.equal(failures[0].page, '/')
})

test('a missing space is a fault only when the page prints the words run together', () => {
  const noKept = {
    blocks: [
      { sentences: [{ id: 's', slots: ['block-1.1', 'block-1.2'], joins: [' '], pieces: ['a ', 'b'] }] }
    ]
  }
  const glued = judgeSentences(noKept, held('Train with', 'a coach'), [], printed('train witha coach'))
  assert.match(glued.failures[0].reason, /no space/)
  const spaced = judgeSentences(noKept, held('Train with', 'a coach'), [], printed('train with a coach'))
  assert.deepEqual(spaced.failures, [])
})

test('the sentence that reads as one is green, a name another line prints with a capital is left, and no page printing it is no fault', () => {
  assert.deepEqual(
    judgeSentences(KIT, held('Open to', 'every age'), [], printed('open to every age')).failures,
    []
  )
  const lines = [{ slot: 'block-9.1', ordered: 'Lessons in Quay every day' }]
  assert.deepEqual(
    judgeSentences(KIT, held('Open in', 'Quay today'), lines, printed('open in quay today')).failures,
    []
  )
  const unseen = judgeSentences(KIT, held('Open to', 'Every age'), [], printed('something else'))
  assert.deepEqual([unseen.read, unseen.failures.length], [0, 0])
})

test('the sentence group without a kit is unmeasured, with a kit of no groups it says so', async () => {
  const measures = () => [{ path: '/', width: 1440, shownText: 'x' }]
  assert.equal((await run(measures, 'broken-sentence')).status, 'unmeasured')
  const none = await run(measures, 'broken-sentence', {}, { kit: { blocks: [] } })
  assert.equal(none.status, 'green')
  assert.equal(none.groups[0].failures[0].level, 'warn')
})

test('an unfinished heading is the writer step, which owns the final text of every slot, kept labels included', async () => {
  const measures = () => [{ path: '/', width: 1440, headings: ['COACHING FOR'] }]
  const line = (owner) => ({
    slots: [{ slot: 'b.1', key: 'k', owner, status: 'written', ordered: 'Coaching for' }]
  })
  const step = async (owner) =>
    (await run(measures, 'unfinished-heading', line(owner))).groups[0].failures[0].causingStep
  assert.equal(await step('plan-label'), 6)
  assert.equal(await step('writer'), 6)
  assert.equal(
    (await run(measures, 'unfinished-heading', { slots: [] })).groups[0].failures[0].causingStep,
    6
  )
})

test('a button going nowhere has the wrong target, which the plan owns', async () => {
  const measures = () => [
    {
      path: '/',
      width: 1440,
      controls: [{ selector: 'a.btn', fault: 'nowhere', href: '#', text: 'Join' }],
      fields: []
    }
  ]
  const check = await run(measures, 'empty-controls')
  assert.equal(check.groups[0].failures[0].causingStep, 3)
})
