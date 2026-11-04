// The template look against an untouched site, on invented reads: what must go red and every way words and pictures must not.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { compareStyles, judgeTemplateLook, templateLookGroup } from '../src/site-check/template-look.js'
import { ensureBaseline, lookFromHost } from '../src/site-check/demo-baseline.js'
import { fakeHost, pagedSite, pageRead, writtenReport } from './_site-check-pages.mjs'

const PROPS = ['border-top-left-radius', 'font-family', 'color', 'background-image', 'margin-bottom']
/** A read from readable values: key to one list of values per property; `off` the same with the brand style off. */
function styles(keys, off = {}) {
  const table = []
  const index = (v) => {
    if (!table.includes(v)) table.push(v)
    return table.indexOf(v)
  }
  return {
    table,
    keys: Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v.map((list) => list.map(index))])),
    off: Object.fromEntries(
      Object.entries(off).map(([k, v]) => [
        k,
        Object.fromEntries(Object.entries(v).map(([n, list]) => [n, list.map(index)]))
      ])
    )
  }
}
const CARD = '#Mod1|div.card'
const LOOK = [['4px'], ['Inter'], ['rgb(20, 20, 20)'], ['none'], ['16px']]
const compare = (written, untouched = styles({ [CARD]: LOOK }), facts = null) =>
  compareStyles(written, [untouched], PROPS, facts)
const HEAD = '/* tracy-ds-slot: x */ /* accent-only: replaces=#f44141 accent=#0e7f48 family=#f44141 */'
const FACTS = { replaces: '#f44141', accent: '#0e7f48', family: ['#f44141'], words: null }

test('rounded corners, another font: red, by property', () => {
  const { changes } = compare(styles({ [CARD]: [['18px'], ['Georgia'], ...LOOK.slice(2)] }))
  assert.deepEqual(
    changes.map((c) => c.prop),
    ['border-top-left-radius', 'font-family']
  )
  assert.deepEqual(
    changes.map((c) => c.step),
    [9, 9],
    'no brand style on the page, so the write step'
  )
})

test('a change that goes away with the brand style off is the brand, one that stays is the write step', () => {
  const brand = compare(
    styles({ [CARD]: [['18px'], ...LOOK.slice(1)] }, { [CARD]: { 0: ['4px'] } }),
    undefined,
    FACTS
  )
  assert.deepEqual(
    brand.changes.map((c) => c.step),
    [2]
  )
  const write = compare(styles({ [CARD]: [['18px'], ...LOOK.slice(1)] }), undefined, FACTS)
  assert.deepEqual(
    write.changes.map((c) => c.step),
    [9]
  )
})

test('the accent family moving to the brand accent is allowed; any other colour is not', () => {
  const untouched = styles({ [CARD]: [['4px'], ['Inter'], ['rgb(244, 65, 65)'], ['none'], ['16px']] })
  const accent = styles({ [CARD]: [['4px'], ['Inter'], ['rgb(14, 127, 72)'], ['none'], ['16px']] })
  assert.deepEqual(compare(accent, untouched, FACTS).changes, [])
  assert.equal(
    compare(accent, untouched, null).changes.length,
    1,
    'with no brand style a new colour is a change'
  )
  const other = styles({ [CARD]: [['4px'], ['Inter'], ['rgb(10, 10, 200)'], ['none'], ['16px']] })
  assert.equal(compare(other, untouched, FACTS).changes.length, 1)
})

test('an element gone is a hidden block; one no untouched page has is counted, not judged', () => {
  const untouched = styles({ [CARD]: LOOK, '#Mod2|section': LOOK })
  const r = compare(styles({ [CARD]: LOOK, '#Mod1|div.new': [['99px'], ...LOOK.slice(1)] }), untouched)
  assert.deepEqual([r.changes.length, r.matched, r.unmatched], [0, 1, 1])
})

test('a row that became the last takes a margin the untouched last row had: values are matched per property', () => {
  const untouched = styles({ [CARD]: [['4px'], ['Inter'], ['rgb(20, 20, 20)'], ['none'], ['16px', '0px']] })
  const written = styles({ [CARD]: [['4px'], ['Inter'], ['rgb(20, 20, 20)'], ['none'], ['0px']] })
  assert.deepEqual(compare(written, untouched).changes, [])
})

test('a picture changing, coming or going is no change in the look', () => {
  const untouched = styles({ [CARD]: [['4px'], ['Inter'], ['rgb(20, 20, 20)'], ['url()'], ['16px']] })
  const gone = styles({ [CARD]: LOOK })
  assert.deepEqual(compare(gone, untouched).changes, [])
})

const entry = (side, read, path = '/', head = HEAD) => ({
  path,
  width: 1440,
  look: { props: PROPS, head, sides: { [side]: read } }
})
const baselineOf = (pages) => ({ props: PROPS, pages })

test('a page is compared with itself, in each theme, and a page the untouched site has not with all its pages', () => {
  const pages = {
    '/index.php/about': { sides: { dark: { styles: styles({ [CARD]: LOOK }) } } },
    '/': { sides: { dark: { styles: styles({ [CARD]: [['9px'], ...LOOK.slice(1)] }) } } }
  }
  const round = entry('dark', { styles: styles({ [CARD]: [['9px'], ...LOOK.slice(1)] }) }, '/about')
  const red = judgeTemplateLook([round], baselineOf(pages))
  assert.equal(red.failures.length, 1, 'its own page says 4px')
  assert.equal(red.failures[0].causingStep, 9)
  assert.match(red.failures[0].reason, /dark theme/)
  const created = { ...round, path: '/site-pages/privacy' }
  assert.deepEqual(judgeTemplateLook([created], baselineOf(pages)).failures, [], 'another page says 9px')
})

test('a theme the untouched site was not read in warns rather than passing', () => {
  const pages = { '/': { sides: { dark: { styles: styles({ [CARD]: LOOK }) } } } }
  const [f] = judgeTemplateLook(
    [entry('light', { styles: styles({ [CARD]: LOOK }) })],
    baselineOf(pages)
  ).failures
  assert.equal(f.level, 'warn')
  assert.match(f.reason, /no light theme read/)
})

test('a page mostly without a match warns: most of it was not compared', () => {
  const pages = { '/': { sides: { dark: { styles: styles({ [CARD]: LOOK }) } } } }
  const written = styles({ [CARD]: LOOK, a: LOOK, b: LOOK, c: LOOK })
  const [f] = judgeTemplateLook([entry('dark', { styles: written })], baselineOf(pages)).failures
  assert.equal(f.level, 'warn')
})

const check = (baseline, measures) =>
  runSiteCheck({
    door: pagedSite(1).door,
    report: writtenReport(),
    host: fakeHost({ '/': pageRead('/') }, { measures }).host,
    baseline,
    groups: [templateLookGroup]
  })

test('no baseline, a baseline from before the look, or no host answer: unmeasured, never green', async () => {
  const read = () => [entry('dark', { styles: styles({ [CARD]: LOOK }) })]
  assert.equal((await check(null, read)).status, 'unmeasured')
  const old = await check({ texts: [], labels: [], pictures: { files: [], shas: [] } }, read)
  assert.equal(old.status, 'unmeasured')
  assert.match(old.groups[0].reason, /measure it again/)
  const silent = await check({ look: baselineOf({}) }, () => [{ path: '/', width: 1440 }])
  assert.equal(silent.status, 'unmeasured')
})

test('the group says what it did not compare', async () => {
  const pages = { '/': { sides: { dark: { styles: styles({ [CARD]: LOOK }) } } } }
  const c = await check({ look: baselineOf(pages) }, () => [
    entry('dark', { styles: styles({ [CARD]: LOOK }) })
  ])
  assert.equal(c.status, 'green')
  assert.ok(c.groups[0].notCompared.some((n) => /hover/.test(n)))
  assert.deepEqual(c.groups[0].themes, ['dark'])
})

test('a baseline keeps the look of an untouched site and refuses one wearing a brand style', () => {
  const read = {
    path: '/',
    width: 1440,
    look: { props: PROPS, worn: false, sides: { dark: { styles: styles({}), over: [], logos: [] } } }
  }
  assert.deepEqual(Object.keys(lookFromHost([read]).pages), ['/'])
  assert.throws(() => lookFromHost([{ ...read, look: { ...read.look, worn: true } }]), /not untouched/)
})

test('a baseline measure asks the host for its page measures and stores the look', async () => {
  const asked = []
  const saved = []
  const host = async (payload) => {
    asked.push(payload)
    return {
      baseline: { texts: [], labels: [], pictures: { files: [], shas: [] }, read: ['/'], unread: [] },
      pageMeasures: [
        {
          path: '/',
          width: 1440,
          look: { props: PROPS, sides: { only: { styles: styles({}), over: [], logos: [] } } }
        }
      ]
    }
  }
  const store = { read: async () => null, save: async (_v, b) => saved.push(b) }
  const { baseline } = await ensureBaseline({ host, pages: ['/'], version: 'v', store })
  assert.equal(asked[0].measurePages, true)
  assert.deepEqual(baseline.look.props, PROPS)
  assert.equal(saved.length, 1)
})
