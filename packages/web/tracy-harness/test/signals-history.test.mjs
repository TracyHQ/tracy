import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

// Bundled: signals-data reads the /ops dictionaries, which plain Node cannot load.
const rootRequire = createRequire(new URL('../../../../package.json', import.meta.url))
const built = await rootRequire('esbuild').build({
  stdin: {
    contents: `export { DEFAULT_FILTERS, filterQuery, readFilters, saveFilters } from './signals-data'`,
    resolveDir: new URL('../src/beta/', import.meta.url).pathname,
    loader: 'ts'
  },
  bundle: true,
  plugins: [opsI18nPlugin()],
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  write: false,
  logLevel: 'silent'
})
const module = { exports: {} }
new Function('require', 'module', 'exports', built.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports
)
const { DEFAULT_FILTERS, filterQuery, readFilters, saveFilters } = module.exports

test('Signals preserves incomplete and empty custom date ranges for API validation', () => {
  const original = globalThis.window
  try {
    for (const query of [
      'start=2026-10-20',
      'end=2026-10-21',
      'start=',
      'end=',
      'start=&end=',
      'days=7&start=2026-10-20&end='
    ]) {
      globalThis.window = { location: new URL(`http://localhost/ops/signals?${query}`) }
      const filters = readFilters()
      assert.equal(filters.days, 'custom', query)
      const forwarded = filterQuery(filters)
      assert.equal(forwarded.get('start'), new URLSearchParams(query).get('start') ?? '', query)
      assert.equal(forwarded.get('end'), new URLSearchParams(query).get('end') ?? '', query)
      assert.equal(forwarded.has('days'), false, query)
    }
    globalThis.window = {
      location: new URL('http://localhost/ops/signals?start=2026-10-20&end=2026-10-21')
    }
    assert.equal(readFilters().days, 'custom')
    assert.equal(filterQuery(readFilters()).get('start'), '2026-10-20')
    assert.equal(filterQuery(readFilters()).get('end'), '2026-10-21')
    globalThis.window = { location: new URL('http://localhost/ops/signals?days=7') }
    assert.equal(readFilters().days, '7')
    assert.equal(filterQuery(readFilters()).get('days'), '7')
    assert.equal(filterQuery(readFilters()).has('start'), false)
    assert.equal(filterQuery(readFilters()).has('end'), false)
  } finally {
    if (original === undefined) delete globalThis.window
    else globalThis.window = original
  }
})

test('Signals filter history preserves shareable states and does not duplicate an unchanged view', () => {
  const original = globalThis.window
  const entries = ['http://localhost/ops/signals?days=14&keep=1#customers']
  let index = 0
  globalThis.window = {
    get location() {
      return new URL(entries[index])
    },
    history: {
      pushState(_state, _unused, url) {
        entries.splice(++index, entries.length, String(url))
      }
    }
  }
  try {
    const next = { ...DEFAULT_FILTERS, days: '7', campaign: 'beta', cms: 'wordpress', compare: false }
    saveFilters(next)
    assert.equal(entries.length, 2)
    assert.deepEqual(readFilters(), next)
    assert.equal(new URL(entries[index]).searchParams.get('keep'), '1')
    assert.equal(new URL(entries[index]).hash, '#customers')
    saveFilters(next)
    assert.equal(entries.length, 2)
    index -= 1
    assert.deepEqual(readFilters(), DEFAULT_FILTERS)
    index += 1
    assert.deepEqual(readFilters(), next)
    saveFilters({ ...DEFAULT_FILTERS })
    assert.equal(entries.length, 3)
    assert.equal(new URL(entries[index]).searchParams.has('campaign'), false)
    assert.equal(new URL(entries[index]).searchParams.has('cms'), false)
  } finally {
    if (original === undefined) delete globalThis.window
    else globalThis.window = original
  }
})

test('Signals global filters reset every table page and preserve selected page sizes', () => {
  const original = globalThis.window
  let current = new URL(
    'http://localhost/ops/signals?signals_daily_page=3&signals_daily_pageSize=25&signals_customers_page=4&signals_customers_pageSize=50&signals_latest_page=2&signals_latest_pageSize=10'
  )
  globalThis.window = {
    get location() {
      return current
    },
    history: {
      pushState(_state, _unused, url) {
        current = new URL(url)
      }
    }
  }
  try {
    saveFilters({ ...DEFAULT_FILTERS, medium: 'email' })
    for (const [id, size] of [
      ['daily', '25'],
      ['customers', '50'],
      ['latest', '10']
    ]) {
      assert.equal(current.searchParams.get(`signals_${id}_page`), '1')
      assert.equal(current.searchParams.get(`signals_${id}_pageSize`), size)
    }
    assert.equal(current.searchParams.get('medium'), 'email')
  } finally {
    if (original === undefined) delete globalThis.window
    else globalThis.window = original
  }
})
