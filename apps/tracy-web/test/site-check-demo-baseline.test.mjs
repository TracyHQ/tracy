// The demo baseline (ADR 0044, decision 8): measured once per quickstart version, kept, and reused. Pages are invented and
// read by the host's own judge; nothing here is a real business.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { textKey as hostTextKey } from '../../tracy-host/src/demo-qa.js'
import {
  baselineFromHost,
  baselineFromKit,
  ensureBaseline,
  fileBaselineStore,
  forHost,
  textKey
} from '../src/site-check/demo-baseline.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { PAGE_CHECK_GROUPS } from '../src/site-check/page-groups.js'
import { SITE_CHECK_GROUPS } from '../src/site-check/site-check.js'
import {
  DEMO_PICTURE,
  DEMO_WORDS,
  demoRead,
  fakeHost,
  pagedSite,
  writtenReport
} from './_site-check-pages.mjs'

const VERSION = 'demo-gym/j6/1.0.0'
const KIT = {
  blocks: [
    {
      id: 'block-1',
      slots: [
        { id: 'block-1.0', type: 'text', sample: DEMO_WORDS },
        { id: 'block-1.1', type: 'url', sample: 'https://demo.example/' }
      ],
      lists: [{ rowSlots: [{ id: 'block-1.2', type: 'text', sample: 'Try us with no strings attached' }] }],
      fixedText: [{ text: 'TRY A CLASS' }],
      frames: [{ id: 'block-1.9', picture: DEMO_PICTURE }]
    }
  ]
}

const temp = async () => mkdtemp(path.join(tmpdir(), 'baseline-'))

test('the baseline text key is the host text key, spacing and case aside', () => {
  assert.equal(textKey('  Try A  Class '), hostTextKey('try a class'))
  assert.equal(textKey(DEMO_WORDS), hostTextKey(DEMO_WORDS))
})

test('a baseline from the kit holds text samples, fixed texts and demo picture files, and says it came from the kit', () => {
  const b = baselineFromKit(KIT, { version: VERSION })
  assert.equal(b.source, 'kit')
  assert.deepEqual(
    b.texts,
    [textKey(DEMO_WORDS), textKey('Try us with no strings attached'), textKey('TRY A CLASS')].sort()
  )
  assert.deepEqual(b.pictures, { files: [DEMO_PICTURE], shas: [] })
})

test('a baseline from the host refuses a site that was not read whole', () => {
  assert.throws(
    () =>
      baselineFromHost(
        { texts: ['a'], read: ['/'], unread: [{ path: '/x', why: 'did not open' }] },
        { version: VERSION }
      ),
    /not read whole.*\/x: did not open/
  )
  assert.throws(
    () => baselineFromHost({ texts: [], read: [], unread: [] }, { version: VERSION }),
    /no page read/
  )
})

test('the baseline is measured once per version and reused on the next run', async () => {
  const dir = await temp()
  try {
    const store = fileBaselineStore(dir)
    const { host, calls } = fakeHost({ '/': demoRead('/'), '/about': demoRead('/about') })
    const first = await ensureBaseline({ host, pages: ['/', '/about'], version: VERSION, store })
    assert.equal(first.measured, true)
    assert.equal(calls.length, 1)
    assert.equal(first.baseline.source, 'host')
    assert.deepEqual(first.baseline.pictures.files, [DEMO_PICTURE])
    const again = await ensureBaseline({ host, pages: ['/', '/about'], version: VERSION, store })
    assert.equal(again.measured, false)
    assert.equal(calls.length, 1, 'a kept baseline asks the host nothing')
    assert.deepEqual(again.baseline, first.baseline)
    assert.equal(await store.read('other/version'), null)
    const forced = await ensureBaseline({ host, pages: ['/'], version: VERSION, store, force: true })
    assert.equal(forced.measured, true)
  } finally {
    await rm(dir, { recursive: true })
  }
})

test('a site of many pages is measured in several calls and their baselines are joined', async () => {
  const reads = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [
      `/p${i}`,
      demoRead(`/p${i}`, { blocks: [{ text: `Demo passage ${i}`, selector: 'main p' }] })
    ])
  )
  const dir = await temp()
  try {
    const { host, calls } = fakeHost(reads)
    const { baseline } = await ensureBaseline({
      host,
      pages: Object.keys(reads),
      version: VERSION,
      store: fileBaselineStore(dir)
    })
    assert.equal(calls.length, 2)
    assert.ok(calls.every((c) => c.pages.length + c.plan.length <= 15))
    assert.equal(baseline.texts.length, 20)
  } finally {
    await rm(dir, { recursive: true })
  }
})

test('an untouched site fails the demo groups against its measured baseline, and a written one does not', async () => {
  const untouched = Object.fromEntries(['/', '/page-1'].map((p) => [p, demoRead(p)]))
  const dir = await temp()
  try {
    const store = fileBaselineStore(dir)
    const measuring = fakeHost(untouched)
    const { baseline } = await ensureBaseline({
      host: measuring.host,
      pages: ['/', '/page-1'],
      version: VERSION,
      store
    })
    const run = async (reads) => {
      const site = pagedSite(2)
      return runSiteCheck({ door: site.door, report: writtenReport(), host: fakeHost(reads).host, baseline })
    }
    const red = await run(untouched)
    const byName = (c, n) => c.groups.find((g) => g.name === n)
    assert.equal(byName(red, 'demo-words').status, 'red')
    assert.equal(byName(red, 'demo-pictures').status, 'red')
    assert.equal(byName(red, 'demo-words').failures[0].page, '/')
    assert.equal(byName(red, 'demo-pictures').failures[0].measured, DEMO_PICTURE)
    const written = await run({
      '/': demoRead('/', {
        blocks: [{ text: 'Strength coaching for every level at Quay Fitness Studio', selector: 'main p' }],
        images: []
      }),
      '/page-1': demoRead('/page-1', { blocks: [], images: [] })
    })
    assert.equal(byName(written, 'demo-words').status, 'green')
    assert.equal(byName(written, 'demo-pictures').status, 'green')
  } finally {
    await rm(dir, { recursive: true })
  }
})

test('the kit baseline, a stopgap, also fails an untouched site on a block that is one slot, and sends nothing else', async () => {
  const baseline = baselineFromKit(KIT, { version: VERSION })
  const site = pagedSite(1)
  const { host, calls } = fakeHost({ '/': demoRead('/') })
  const check = await runSiteCheck({ door: site.door, report: writtenReport(), host, baseline })
  assert.equal(check.groups.find((g) => g.name === 'demo-words').status, 'red')
  assert.equal(check.groups.find((g) => g.name === 'demo-pictures').status, 'red')
  assert.deepEqual(Object.keys(calls[0].baseline).sort(), ['cssRules', 'labels', 'pictures', 'texts'])
  assert.deepEqual(forHost(baseline).cssRules, {})
})

test('page groups join the default groups only when a host is given', () => {
  assert.equal(
    SITE_CHECK_GROUPS.some((g) => PAGE_CHECK_GROUPS.includes(g)),
    false
  )
})

test('a baseline keeps the drawn box of each small picture, once a page, and the host is asked for them', async () => {
  const dir = await temp()
  try {
    const small = {
      src: 'http://site.test/images/demo/icon.png',
      sha256: 'cc33',
      width: 100,
      height: 100,
      broken: false,
      kind: 'img',
      selector: 'main img'
    }
    const { host, calls } = fakeHost({ '/': demoRead('/', { images: [small, small] }) })
    const { baseline } = await ensureBaseline({
      host,
      pages: ['/'],
      version: VERSION,
      store: fileBaselineStore(dir)
    })
    assert.equal(calls[0].measureFrames, true)
    assert.deepEqual(baseline.iconFrames, [
      { page: '/', file: 'images/demo/icon.png', width: 100, height: 100 }
    ])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
