import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { before, test } from 'node:test'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const require = createRequire(import.meta.url)
const rootRequire = createRequire(new URL('../../../../package.json', import.meta.url))
let lib
before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `export { SignalFilters } from './SignalFilters'; export { UsageFilters } from './UsageFilters'; export { shortDay, DEFAULT_FILTERS } from './signals-data'; export { USAGE_DEFAULTS } from './usage-data'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'`,
      resolveDir: new URL('../src/beta/', import.meta.url).pathname,
      loader: 'tsx'
    },
    bundle: true,
    plugins: [opsI18nPlugin()],
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom/server'],
    write: false,
    logLevel: 'silent'
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports)
  lib = module.exports
})
const render = (name, props) => lib.renderToStaticMarkup(lib.createElement(lib[name], props))
const emptyRange = {
  start: null,
  end: '2026-10-22',
  startAt: null,
  endAt: '2026-10-22T12:00:00.000Z',
  previousStart: null,
  previousEnd: null,
  preset: 'all'
}

test('missing first-event dates stay unrecorded and hourly labels use UTC+7', () => {
  assert.equal(lib.shortDay(null), '—')
  assert.equal(lib.shortDay(null, 'Not recorded'), 'Not recorded')
  assert.equal(lib.shortDay('2026-10-21'), '21/10')
  assert.equal(lib.shortDay('2026-10-21T18:30:00.000Z'), '22/10, 01:30')
})

test('signals keeps the empty all-time report label while the selected preset awaits its response', () => {
  for (const days of ['24h', '7', 'custom']) {
    const html = render('SignalFilters', {
      value: { ...lib.DEFAULT_FILTERS, days },
      report: { range: emptyRange, totals: { newUsers: 0, bySource: {} }, filterOptions: {} },
      loading: true,
      onChange() {},
      onReload() {}
    })
    assert.match(html, /All recorded time · UTC\+7/)
    assert.doesNotMatch(html, /Last 24 hours ·/)
  }
})

test('usage keeps the empty all-time report label while the selected preset awaits its response', () => {
  for (const days of ['24h', '7', 'custom']) {
    const html = render('UsageFilters', {
      value: { ...lib.USAGE_DEFAULTS, days },
      body: {
        range: emptyRange,
        turns: Object.fromEntries(
          ['all', 'wordpress', 'joomla', 'emdash', 'unknown'].map((cms) => [cms, { turns: 0 }])
        )
      },
      loading: true,
      onChange() {},
      onReload() {}
    })
    assert.match(html, /All recorded time · UTC\+7/)
    assert.doesNotMatch(html, /Last 24 hours ·/)
  }
})
