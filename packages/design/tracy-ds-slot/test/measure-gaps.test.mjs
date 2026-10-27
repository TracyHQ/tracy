import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { judgeParity } from '../src/preview-parity.mjs'
import { parityGaps, previewGaps, writeWholeRun } from '../src/measure-gaps.mjs'

const A = 'refero:a'
const B = 'refero:b'
const found = { kept: [] }

test('preview-check: a page that could not be read is no gap (the judge leaves it unmeasured)', () => {
  const row = {
    pages: { '/': { systems: { [A]: found, [B]: found } } },
    misses: [{ page: '/about', reason: 'timeout' }]
  }
  assert.deepEqual(previewGaps(row, [A, B]), [])
})

test('preview-check: a system with no row on any page is a gap, as is a run that measured no page', () => {
  // the old rows of B would stay in the file beside A's new ones, or B would not be judged at all
  const row = {
    pages: {
      '/': { systems: { [A]: found, [B]: { miss: 'NO_SLOT' } } },
      '/about': { systems: { [A]: found, [B]: { miss: 'NO_SLOT' } } }
    },
    misses: []
  }
  assert.deepEqual(previewGaps(row, [A, B]), [`${B}: no page measured`])
  assert.deepEqual(previewGaps({ pages: {}, misses: [{ page: '/', reason: 'down' }] }, [A]), [
    'no page measured (/: down)'
  ])
})

test('parity: a view that was not compared lets the rule pass, so it is a gap', () => {
  // home read under A, not under B: the judge sees a row for every declared page and passes
  const block = {
    probeVersion: 99,
    popup: 'live',
    pages: ['/'],
    rows: [{ page: '/', system: A, width: 1440, count: 0 }],
    misses: [{ page: '/', system: B, width: 1440, miss: 'TRY_ON (timeout)', popup: 'live' }]
  }
  assert.equal(judgeParity(block, { probe: 1 }).status, 'pass')
  assert.deepEqual(parityGaps(block), [`/ ${B} 1440 live: TRY_ON (timeout)`])
  assert.deepEqual(parityGaps({ ...block, misses: undefined }), [])
  assert.deepEqual(parityGaps({ ...block, rows: [], misses: undefined }), ['no view compared'])
})

test('preview-check --scheme light,dark: dark measured nothing, so light is not written either', () => {
  // light's new rows beside the file's old dark rows would judge as one whole measurement
  const dir = mkdtempSync(join(tmpdir(), 'measure-gaps-test-'))
  try {
    const file = join(dir, 'design-system-measurement.json')
    const before = `${JSON.stringify({ preview: [{ system: A, scheme: 'dark', page: '/' }] }, null, 2)}\n`
    writeFileSync(file, before)
    // what preview-check's writePreviewRows does: the run's rows of one side into the file
    const write = (/** @type {any} */ run) => {
      const doc = JSON.parse(readFileSync(file, 'utf8'))
      doc.preview = [
        ...doc.preview.filter((/** @type {any} */ r) => r.scheme !== run.row.scheme),
        ...Object.keys(run.row.pages).map((page) => ({ system: A, scheme: run.row.scheme, page }))
      ]
      writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
    }
    const light = {
      label: 'ja-prodex-j6 light',
      row: { scheme: 'light', pages: { '/': { systems: { [A]: found } } }, misses: [] }
    }
    const dark = {
      label: 'ja-prodex-j6 dark',
      row: { scheme: 'dark', pages: {}, misses: [{ page: '/', reason: 'UNREADABLE' }] }
    }
    assert.deepEqual(writeWholeRun([light, dark], [A], write), [
      'ja-prodex-j6 dark: no page measured (/: UNREADABLE)'
    ])
    assert.equal(readFileSync(file, 'utf8'), before)
    // both sides whole: both written
    assert.deepEqual(
      writeWholeRun([light, { ...light, row: { ...light.row, scheme: 'dark' } }], [A], write),
      []
    )
    assert.deepEqual(
      JSON.parse(readFileSync(file, 'utf8')).preview.map((/** @type {any} */ r) => r.scheme),
      ['light', 'dark']
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
