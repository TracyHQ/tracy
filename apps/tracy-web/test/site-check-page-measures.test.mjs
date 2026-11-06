// The measures the site check adds to the host's: dead links, text overflow, tall blocks, stretched pictures, and unowned
// slots that still show. Pages are invented. Dead links and text overflow are new; each has a case that fails without it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  findDeadLinks,
  findEmptyControls,
  findGluedWords,
  findMainHeadings,
  findUnfinishedHeadings,
  findStretchedPictures,
  findTallBlocks,
  findTextOverflow,
  whereShown
} from '../src/site-check/page-measures.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { fakeHost, pageRead, pagedSite, writtenReport } from './_site-check-pages.mjs'

const BOTH = (path, entry) => [
  { path, width: 1440, ...entry[1440] },
  { path, width: 390, ...entry[390] }
]
const group = (check, name) => check.groups.find((g) => g.name === name)

test('a kept page the host could not open is a dead link', () => {
  const f = findDeadLinks(
    [
      { path: '/', status: 200 },
      { path: '/classes', status: 404 },
      { path: '/gone', status: null, skipped: 'not found' }
    ],
    []
  )
  assert.deepEqual(
    f.map((x) => x.page),
    ['/classes', '/gone']
  )
})

test('a link that answers an error, or nothing, is dead; a redirect and an answer are not', () => {
  const links = [
    { href: '/ok', text: 'Fine', status: 200 },
    { href: '/moved', text: 'Moved', status: 301 },
    { href: '/missing', text: 'Missing', status: 404 },
    { href: 'https://x.example/', text: 'Away', status: 0 },
    { href: '/slow', text: 'Slow', status: null }
  ]
  const f = findDeadLinks(
    [],
    [
      { path: '/', width: 1440, links },
      { path: '/', width: 390, links }
    ]
  )
  assert.deepEqual(
    f.map((x) => x.measured),
    [404, 0, 'no answer']
  )
  assert.equal(f.length, 3, 'the same link at the two widths is one finding')
  assert.ok(f.every((x) => x.page === '/'))
})

test('text cut by its box, or running past the screen edge, overflows, at the width it was seen', () => {
  const box = {
    selector: 'h2.title',
    text: 'A very long heading that does not fit',
    boxWidth: 300,
    boxHeight: 40
  }
  const measures = [
    {
      path: '/',
      width: 1440,
      textBoxes: [{ ...box, contentWidth: 300, contentHeight: 40, clips: true, right: 600 }]
    },
    {
      path: '/',
      width: 390,
      textBoxes: [{ ...box, contentWidth: 380, contentHeight: 40, clips: true, right: 380 }]
    }
  ]
  const f = findTextOverflow(measures)
  assert.equal(f.length, 1)
  assert.deepEqual([f[0].page, f[0].width, f[0].selector], ['/', 390, 'h2.title'])
  const past = findTextOverflow([
    {
      path: '/x',
      width: 390,
      textBoxes: [{ ...box, contentWidth: 300, contentHeight: 40, clips: false, right: 450 }]
    }
  ])
  assert.match(past[0].reason, /60 px past the right edge/)
  assert.equal(
    findTextOverflow([
      {
        path: '/',
        width: 390,
        textBoxes: [{ ...box, contentWidth: 301, contentHeight: 41, clips: true, right: 300 }]
      }
    ]).length,
    0
  )
})

test('a block is unusual only when over 25% taller than the same block on the demo, never against a fixed height', () => {
  const demo = [
    { page: '/', width: 1440, selector: 'main.home', height: 3354 },
    { page: '/', width: 390, selector: 'main.home', height: 3354 }
  ]
  const site = (height, width = 1440) => [{ path: '/', width, blocks: [{ selector: 'main.home', height }] }]
  assert.deepEqual(findTallBlocks(site(2721), demo), [], 'shorter than the demo')
  const [tall, ...rest] = findTallBlocks(site(4300), demo)
  assert.equal(rest.length, 0)
  assert.deepEqual([tall.page, tall.width, tall.selector, tall.measured], ['/', 1440, 'main.home', 4300])
  assert.match(tall.reason, /28% taller than on the template's demo \(3354 px\)/)
  assert.deepEqual(findTallBlocks(site(4300)), [], 'no demo height says nothing')
  assert.deepEqual(
    findTallBlocks(
      [{ path: '/about', width: 1440, blocks: [{ selector: 'main.home', height: 9000 }] }],
      demo
    ),
    [],
    'another page has no demo height for this block'
  )
})

test('a picture drawn in another ratio than its file, with nothing to crop it, is stretched', () => {
  const pic = (over) => ({
    selector: 'img',
    src: 'a.jpg',
    naturalWidth: 800,
    naturalHeight: 400,
    width: 400,
    height: 200,
    fit: 'fill',
    ...over
  })
  const f = findStretchedPictures([
    {
      path: '/',
      width: 1440,
      pictures: [pic({}), pic({ height: 300 }), pic({ height: 300, fit: 'cover' }), pic({ height: 205 })]
    }
  ])
  assert.equal(f.length, 1)
  assert.match(f[0].reason, /400x300 from a 800x400/)
})

test('the new measures at both widths, as groups: levels and causing steps', async () => {
  const measures = () => [
    ...BOTH('/', {
      1440: {
        links: [{ href: '/missing', text: 'Missing', status: 404 }],
        blocks: [{ selector: 'section.long', height: 4000 }],
        pictures: [
          {
            selector: 'img.hero',
            src: 'a.jpg',
            naturalWidth: 800,
            naturalHeight: 400,
            width: 400,
            height: 400,
            fit: 'fill'
          }
        ]
      },
      390: {
        textBoxes: [
          {
            selector: 'h1',
            text: 'Overflowing heading',
            boxWidth: 300,
            boxHeight: 30,
            contentWidth: 420,
            contentHeight: 30,
            clips: true,
            right: 420
          }
        ]
      }
    })
  ]
  const check = await runSiteCheck({
    door: pagedSite(1).door,
    report: writtenReport(),
    host: fakeHost({ '/': pageRead('/') }, { measures }).host,
    baseline: { blocks: [{ page: '/', width: 1440, selector: 'section.long', height: 3000 }] }
  })
  const got = (name) => group(check, name).failures.map((f) => [f.level, f.causingStep, f.page, f.width])
  assert.deepEqual(got('dead-links'), [['block', 3, '/', null]])
  assert.deepEqual(got('text-overflow'), [['block', 6, '/', 390]])
  assert.deepEqual(got('tall-blocks'), [['warn', 6, '/', 1440]])
  assert.deepEqual(got('stretched-pictures'), [['warn', 8, '/', 1440]])
  assert.equal(group(check, 'tall-blocks').status, 'green', 'a warning does not turn a group red')
  assert.deepEqual(check.counts.warn, 2)
  assert.ok(check.counts.block >= 2)
})

test('warnings alone never turn the check red, and are counted', async () => {
  const answers = {
    selfLinks: [],
    hiddenHeadings: [],
    shownText: 'Lessons',
    maps: [],
    videoButtons: [],
    shownLinksClickable: true
  }
  const measures = () =>
    BOTH('/', {
      1440: {
        ...answers,
        blocks: [{ selector: 'section.long', height: 4000 }],
        mainHeadings: ['Lessons'],
        look: { sides: { only: { words: [], over: [], logos: [] } } }
      },
      390: {
        ...answers,
        mainHeadings: ['Lessons'],
        look: { sides: { only: { words: [], over: [], logos: [] } } }
      }
    })
  const baseline = {
    texts: [],
    labels: [],
    pictures: { files: [], shas: [] },
    over: [],
    maps: [],
    blocks: [{ page: '/', width: 1440, selector: 'section.long', height: 3000 }]
  }
  const check = await runSiteCheck({
    door: pagedSite(1).door,
    report: { ...writtenReport(), planLinks: [], endActions: [] },
    host: fakeHost({ '/': pageRead('/') }, { measures }).host,
    baseline,
    kit: { tool: 'template-kit 3.1.0', blocks: [{ sentences: [{ id: 'one', slots: ['block-2.1'] }] }] }
  })
  // Warnings never turn it red. Two groups find nothing to read here (no logo, and a one-slot sentence group), and nothing measured
  // is unmeasured, never green (ADR 0044, decision 27); the groups with nothing of their kind say so and pass.
  assert.equal(check.status, 'unmeasured')
  assert.deepEqual(
    check.groups.filter((g) => g.status === 'unmeasured').map((g) => g.name),
    ['logo-readable', 'broken-sentence']
  )
  assert.ok(check.groups.every((g) => g.status !== 'red'))
  assert.deepEqual(check.counts, { block: 0, warn: 1, unmeasured: 2, notApplicable: 11 })
})

test('when the host answers no page measures, the groups that need them are unmeasured and dead pages are still found', async () => {
  const check = await runSiteCheck({
    door: pagedSite(2).door,
    report: writtenReport(),
    host: fakeHost({ '/': pageRead('/') }).host,
    baseline: null
  })
  for (const name of ['text-overflow', 'tall-blocks', 'stretched-pictures']) {
    assert.equal(group(check, name).status, 'unmeasured', name)
    assert.match(group(check, name).reason, /pageMeasures/)
  }
  const dead = group(check, 'dead-links')
  assert.equal(dead.status, 'red')
  assert.equal(dead.failures[0].page, '/page-1')
})

test('an unowned slot on a kept page that still holds words is a warning on the plan (step 3)', async () => {
  const site = pagedSite(1, { 'module-5.0': 'Become the fittest', 'module-6.0': '' }, [
    { key: 'module-7.0', entity: 'module-7', type: 'text', current: 'On no page' }
  ])
  site.door.apply = ((apply) => async (call) => {
    const answer = await apply(call)
    if (call.action === 'content.contract')
      answer.pages[0].assignedModules.push({ entity: 'module-5' }, { entity: 'module-6' })
    return answer
  })(site.door.apply)
  const report = writtenReport({
    unowned: [
      { slot: 'block-5.0', type: 'text', block: 'block-5' },
      { slot: 'block-6.0', type: 'text', block: 'block-6' },
      { slot: 'block-7.0', type: 'text', block: 'block-7' }
    ]
  })
  const check = await runSiteCheck({
    door: site.door,
    report,
    host: fakeHost({ '/': pageRead('/') }).host,
    baseline: null
  })
  const g = group(check, 'unowned-slots')
  assert.deepEqual(
    g.failures.map((f) => [f.level, f.causingStep, f.page, f.slot]),
    [['warn', 3, '/', 'block-5.0']]
  )
  assert.equal(g.status, 'green')
})

test('a button with no words or going nowhere and a field nothing names are found once per page', () => {
  const controls = [
    { selector: 'a.btn', fault: 'wordless', href: '/next', text: '' },
    { selector: 'a.btn', fault: 'wordless', href: '/next', text: '' },
    { selector: 'a#go.btn', fault: 'nowhere', href: '#', text: 'Book a seat' }
  ]
  const fields = [{ selector: 'input#blank', name: 'blank' }]
  const f = findEmptyControls([
    { path: '/', width: 1440, controls, fields },
    { path: '/', width: 390, controls, fields },
    { path: '/other', width: 1440, controls: [], fields: [] }
  ])
  assert.deepEqual(
    f.map((x) => x.measured),
    ['a.btn -> /next', 'Book a seat', 'input#blank']
  )
  assert.ok(f.every((x) => x.page === '/'))
  assert.match(f[0].reason, /no words/)
  assert.match(f[1].reason, /goes nowhere/)
  assert.match(f[2].reason, /nothing names/)
})

test('words glued to a highlight are found once per page', () => {
  const glued = [{ selector: 'div#a', text: 'to|Every', around: 'Open to|Every age' }]
  const f = findGluedWords([
    { path: '/', width: 1440, glued },
    { path: '/', width: 390, glued }
  ])
  assert.equal(f.length, 1)
  assert.equal(f[0].measured, 'Open to|Every age')
  assert.match(f[0].reason, /no space/)
})

test('a heading that stops on a small word is unfinished; a whole one is not', () => {
  const f = findUnfinishedHeadings([
    { path: '/', width: 1440, headings: ['Rowing for', 'Rowing for every age', 'What we stand for?'] },
    { path: '/', width: 390, headings: ['Rowing for'] }
  ])
  assert.deepEqual(
    f.map((x) => x.measured),
    ['Rowing for']
  )
})

test('two main headings on a page block; none is a warning; a page the host did not read for them says nothing', () => {
  const f = findMainHeadings([
    { path: '/twice', width: 1440, mainHeadings: ['Our rules', 'Our rules'] },
    { path: '/twice', width: 390, mainHeadings: ['Our rules', 'Our rules'] },
    { path: '/none', width: 1440, mainHeadings: [] },
    { path: '/fine', width: 1440, mainHeadings: ['Lessons'] },
    { path: '/older', width: 1440 }
  ])
  assert.deepEqual(
    f.map((x) => [x.page, x.level ?? 'block']),
    [
      ['/twice', 'block'],
      ['/none', 'warn']
    ]
  )
})

test('what a visitor sees of a stored value: words, a picture, a button by its words, a bare address only when nothing else goes there', () => {
  const measures = [
    {
      path: '/about',
      width: 1440,
      shownText: 'WELCOME TO QUAY Read more',
      shownPictures: ['http://site.test/images/demo/sign.png?width=120'],
      shownLinks: [{ href: 'http://site.test/index.php/about', text: 'READ MORE' }]
    }
  ]
  assert.equal(whereShown(measures, { type: 'text', value: 'Welcome to  Quay' }).page, '/about')
  assert.equal(whereShown(measures, { type: 'text', value: 'Hidden words' }), null)
  assert.equal(
    whereShown(measures, { type: 'image', value: 'images/demo/sign.png#joomlaImage://x' }).page,
    '/about'
  )
  assert.equal(whereShown(measures, { type: 'image', value: 'images/demo/other.png' }), null)
  const url = { type: 'url', value: 'index.php?Itemid=7', path: '/about' }
  assert.equal(whereShown(measures, { ...url, label: 'Read more' }).page, '/about')
  assert.equal(whereShown(measures, { ...url, label: 'View more' }), null)
  assert.equal(whereShown(measures, url).page, '/about')
  assert.equal(whereShown(measures, { ...url, claimed: true }), null)
})

test('an unowned slot a visitor sees blocks; one that shows nowhere stays a warning', async () => {
  const site = pagedSite(1, { 'module-5.0': 'Demo button words', 'module-6.0': 'Words in no element' })
  site.door.apply = ((apply) => async (call) => {
    const answer = await apply(call)
    if (call.action === 'content.contract')
      answer.pages[0].assignedModules.push({ entity: 'module-5' }, { entity: 'module-6' })
    return answer
  })(site.door.apply)
  const report = writtenReport({
    unowned: [
      { slot: 'block-5.0', type: 'text', block: 'block-5' },
      { slot: 'block-6.0', type: 'text', block: 'block-6' }
    ]
  })
  const shown = { shownText: 'DEMO BUTTON WORDS and more', shownLinks: [], shownPictures: [] }
  const check = await runSiteCheck({
    door: site.door,
    report,
    host: fakeHost({ '/': pageRead('/') }, { measures: () => BOTH('/', { 1440: shown, 390: shown }) }).host,
    baseline: null
  })
  const g = group(check, 'unowned-slots')
  assert.deepEqual(
    g.failures.map((f) => [f.level, f.page, f.slot]),
    [
      ['block', '/', 'block-5.0'],
      ['warn', '/', 'block-6.0']
    ]
  )
  assert.equal(g.status, 'red')
})

test('a host from before the main heading measure leaves that group unmeasured, not green', async () => {
  const check = await runSiteCheck({
    door: pagedSite(1).door,
    report: writtenReport(),
    host: fakeHost({ '/': pageRead('/') }, { measures: () => BOTH('/', { 1440: {}, 390: {} }) }).host,
    baseline: null
  })
  assert.equal(group(check, 'main-heading').status, 'unmeasured')
  assert.match(group(check, 'main-heading').reason, /main headings/)
})

test('two main headings on a page fail the check through its group', async () => {
  const twice = { mainHeadings: ['Our rules', 'Our rules'] }
  const check = await runSiteCheck({
    door: pagedSite(1).door,
    report: writtenReport(),
    host: fakeHost({ '/': pageRead('/') }, { measures: () => BOTH('/', { 1440: twice, 390: twice }) }).host,
    baseline: null
  })
  const g = group(check, 'main-heading')
  assert.equal(g.status, 'red')
  assert.deepEqual(
    g.failures.map((f) => [f.level, f.causingStep, f.page]),
    [['block', 9, '/']]
  )
})
