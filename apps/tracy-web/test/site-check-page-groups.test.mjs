// The site check's page groups through its entry point: a fake host that runs the REAL host judge over invented pages.
// Each group has a case that goes red (or warns) because of that group's measure and nothing else.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { baselineFromKit } from '../src/site-check/demo-baseline.js'
import { checkLines } from '../src/site-check/check-lines.js'
import { PAGES_PER_CALL } from '../src/site-check/page-chunks.js'
import { keptPaths } from '../src/lib/site-kept-paths.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { DEMO_WORDS, demoRead, fakeHost, pagedSite, pageRead, writtenReport } from './_site-check-pages.mjs'

const BASELINE = baselineFromKit(
  {
    blocks: [
      { slots: [{ type: 'text', sample: DEMO_WORDS }], frames: [{ picture: 'images/demo/hero-athlete.jpg' }] }
    ]
  },
  { version: 'demo-gym/j6/1.0.0' }
)
const run = (reads, { pages = 1, baseline = BASELINE, host, report = writtenReport(), site } = {}) =>
  runSiteCheck({
    door: (site ?? pagedSite(pages)).door,
    report,
    host: host ?? fakeHost(reads).host,
    baseline
  })
const group = (check, name) => check.groups.find((g) => g.name === name)

test('without a host the page groups do not run, and the output says so', async () => {
  const check = await runSiteCheck({ door: pagedSite(1).door, report: writtenReport() })
  assert.equal(check.pageGroups, false)
  assert.equal(group(check, 'demo-words'), undefined)
  assert.ok(checkLines(check).some((l) => l.startsWith('page groups: not run')))
})

test('a clean site is green in every page group, which each list the widths they were read at', async () => {
  const check = await run({ '/': pageRead('/') }, { baseline: { ...BASELINE } })
  const names = ['demo-words', 'demo-pictures', 'demo-links', 'empty-frames', 'cms-errors']
  for (const name of names) {
    assert.equal(group(check, name).status, 'green', name)
    assert.deepEqual(group(check, name).widths, [1440, 390])
  }
  assert.equal(check.pageGroups, true)
})

test('demo words and pictures are blocks that name the page and the step that wrote them', async () => {
  const check = await run({ '/': demoRead('/') })
  const words = group(check, 'demo-words').failures[0]
  assert.deepEqual([words.level, words.causingStep, words.page], ['block', 6, '/'])
  const pictures = group(check, 'demo-pictures').failures[0]
  assert.deepEqual([pictures.level, pictures.causingStep, pictures.page], ['block', 8, '/'])
  assert.equal(check.status, 'red')
})

test('common words are not demo words: a neutral word the template shows is not reported', async () => {
  const baseline = baselineFromKit(
    { blocks: [{ slots: [{ type: 'text', sample: 'Overview' }] }] },
    { version: 'v' }
  )
  const check = await run(
    { '/': pageRead('/', { blocks: [{ text: 'Overview', selector: 'h2' }] }) },
    { baseline }
  )
  assert.equal(group(check, 'demo-words').status, 'green')
})

test('words the write step ordered are the brief, even when the template showed them', async () => {
  const baseline = baselineFromKit(
    {
      blocks: [
        { slots: [{ type: 'text', sample: 'Strength coaching for every level at Quay Fitness Studio' }] }
      ]
    },
    { version: 'v' }
  )
  const check = await run({ '/': pageRead('/') }, { baseline })
  assert.equal(group(check, 'demo-words').status, 'green')
})

test('with no baseline the demo groups are unmeasured, not green, and the other page groups still run', async () => {
  const check = await run({ '/': demoRead('/') }, { baseline: null })
  assert.equal(group(check, 'demo-words').status, 'unmeasured')
  assert.match(group(check, 'demo-words').reason, /no demo baseline for demo-gym/)
  assert.equal(group(check, 'demo-pictures').status, 'unmeasured')
  assert.equal(group(check, 'cms-errors').status, 'green')
  assert.equal(check.status, 'unmeasured')
})

test('a request to a demo service is a block on the plan (step 3)', async () => {
  const check = await run({ '/': pageRead('/', { blocked: ['https://demo.example.test/widget.js'] }) })
  const f = group(check, 'demo-links').failures[0]
  assert.deepEqual([f.level, f.causingStep, f.page], ['block', 3, '/'])
})

test('an empty picture frame and an empty service box are blocks on the plan (step 3)', async () => {
  const reads = {
    '/': pageRead('/', {
      emptySlots: [{ selector: 'figure.a', size: '300x200', kind: 'figure' }],
      emptyBoxes: [{ selector: 'div.form', size: '600x300' }]
    })
  }
  const f = group(await run(reads), 'empty-frames').failures
  assert.deepEqual(
    f.map((x) => [x.level, x.causingStep, x.measured]),
    [
      ['block', 3, 'figure.a'],
      ['block', 3, 'div.form']
    ]
  )
})

test('a CMS error and a raw placeholder on a page are blocks on the write (step 9)', async () => {
  const text = 'Welcome. PHP Warning: Undefined variable in /var/x.php and {{business_name}}'
  const f = group(await run({ '/': pageRead('/', { text }) }), 'cms-errors').failures
  assert.equal(f.length, 2)
  assert.ok(f.every((x) => x.level === 'block' && x.causingStep === 9 && x.page === '/'))
})

test('a refused host read makes every page group unmeasured and blocks nothing falsely', async () => {
  const check = await run(
    {},
    { host: fakeHost({}, { fail: 'The host refused the page read (NO_BROWSER)' }).host }
  )
  for (const name of [
    'demo-words',
    'demo-links',
    'dead-links',
    'empty-frames',
    'cms-errors',
    'text-overflow'
  ])
    assert.equal(group(check, name).status, 'unmeasured', name)
  assert.match(group(check, 'demo-links').reason, /NO_BROWSER/)
  assert.equal(group(check, 'read-back').status, 'green')
})

test('a site of 40 pages is read whole, in calls the host takes, each with a budget of its own', async () => {
  const reads = Object.fromEntries(
    Array.from({ length: 40 }, (_, i) => [
      i === 0 ? '/' : `/page-${i}`,
      pageRead(i === 0 ? '/' : `/page-${i}`)
    ])
  )
  const fake = fakeHost(reads)
  const check = await run(reads, { pages: 40, host: fake.host })
  assert.equal(fake.calls.length, 3)
  for (const c of fake.calls) {
    assert.ok(c.pages.length <= 7 && c.plan.length <= 8)
    assert.ok(c.pages.length + c.plan.length <= PAGES_PER_CALL)
    assert.ok(c.budgetMs <= 300_000 && c.budgetMs >= 90_000)
  }
  const sent = fake.calls.flatMap((c) => [...c.pages, ...c.plan])
  assert.deepEqual(
    sent,
    keptPaths({ pages: Array.from({ length: 40 }, (_, i) => ({ route: i === 0 ? 'home' : `page-${i}` })) })
  )
  assert.equal(group(check, 'demo-words').checked, 40)
  assert.equal(group(check, 'demo-words').calls, 3)
  assert.equal(fake.calls.length, 3, 'every page group shares the one read')
})

test('a run reads the site once for all page groups', async () => {
  const fake = fakeHost({ '/': pageRead('/') })
  await run({}, { host: fake.host })
  assert.equal(fake.calls.length, 1)
})

test('the host adapter sends the site names and returns the body, and a refusal is an error', async () => {
  const { hostMeasure } = await import('../src/site-check/host-measure.js')
  const sent = []
  const site = { label: 'bench-abc', platform: 'joomla', port: 8081, host: 'fleet' }
  const make = (answer) =>
    hostMeasure({
      hostCall: async (...args) => (sent.push(args), answer),
      config: { defaultHost: 'fleet' },
      site,
      selfNames: () => ({ host: 'bench-abc.sites.example', publicOrigin: 'https://bench-abc.sites.example' })
    })
  assert.deepEqual(await make({ ok: true, body: { checks: [] } })({ pages: ['/'], timeoutMs: 1234 }), {
    checks: []
  })
  assert.equal(sent[0][2], '/demo-qa')
  assert.equal(sent[0][3].host, 'bench-abc.sites.example')
  assert.deepEqual(sent[0][3].pages, ['/'])
  assert.equal(sent[0][4].timeoutMs, 1234)
  await assert.rejects(
    make({ ok: false, status: 503, body: { code: 'NO_BROWSER' } })({ pages: ['/'] }),
    /NO_BROWSER/
  )
  await assert.rejects(make({ ok: false, status: 0, timedOut: true })({ pages: ['/'] }), /timed out/)
})

// Card AP: the template's map button kept its words and now leads to a maps search of the business address. demo-links judges
// where a link leads, not its words: only a maps link still at the demo's address is a demo link. Addresses are invented.
test('a maps button that leads to another address than the demo is no demo link; one still at the demo address is', async () => {
  const mapsAt = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  const demoAddress = '9 Sample Street, Demotown'
  const baseline = { ...BASELINE, maps: [{ page: '/', width: 1440, kind: 'link', address: demoAddress }] }
  const withButton = (href) => ({
    '/': pageRead('/', { ctas: [{ text: 'OPEN IN MAPS', href, selector: 'a.btn-map' }] })
  })
  const moved = await run(withButton(mapsAt('12 Harbour Lane, Quayside')), { baseline })
  assert.ok(!group(moved, 'demo-links').failures.some((f) => f.measured === 'OPEN IN MAPS'))
  const stayed = await run(withButton(mapsAt(demoAddress)), { baseline })
  assert.ok(group(stayed, 'demo-links').failures.some((f) => f.measured === 'OPEN IN MAPS'))
})
