import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchStuck } from '../src/beta/api.ts'
import { readAppStatistic } from '../src/beta/app-statistic-api.ts'
import { DEFAULT_FILTERS, readSignalReports } from '../src/beta/signals-data.ts'
import { fetchUsage } from '../src/beta/usage-api.ts'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const usageFilters = {
  days: '24h',
  start: '',
  end: '',
  cms: 'all',
  audience: 'customers',
  demo: 'exclude',
  compare: true
}

test('growth readers treat failed responses as errors and real empty tables as successful results', async () => {
  const previousFetch = globalThis.fetch
  try {
    for (const status of [422, 500]) {
      globalThis.fetch = async () =>
        Response.json({ code: 'INVALID_SIGNAL_FILTER', parameter: 'start' }, { status })
      const controller = new AbortController()
      const answers = [
        ...(await readSignalReports({ ...DEFAULT_FILTERS, days: '24h' }, controller.signal)),
        await fetchUsage(usageFilters),
        await fetchStuck()
      ]
      for (const answer of answers) {
        assert.equal(answer.ok, false)
        assert.equal(Object.hasOwn(answer, 'unavailable'), false)
      }
      await assert.rejects(readAppStatistic('/report', controller.signal), (error) => {
        assert.equal(Object.hasOwn(error, 'unavailable'), false)
        return true
      })
    }
    globalThis.fetch = async () => Response.json({ rows: [], total: 0 })
    assert.deepEqual(await fetchUsage(usageFilters), { ok: true, body: { rows: [], total: 0 } })
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('shared growth status uses calm empty states and retry alerts only for failed reads', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const { build } = require('esbuild')
  const result = await build({
    stdin: {
      contents: `export { StatisticsReportStatus, StatisticsEmptyActivity } from './StatisticsReportStatus'; export { SignalChart } from './SignalChart'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'`,
      resolveDir: new URL('../src/beta/', import.meta.url).pathname,
      loader: 'tsx'
    },
    bundle: true,
    plugins: [opsI18nPlugin()],
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom/server'],
    write: false,
    logLevel: 'silent'
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports)
  const lib = module.exports
  const render = (component, props) => lib.renderToStaticMarkup(lib.createElement(lib[component], props))
  const failed = render('StatisticsReportStatus', { children: 'HTTP 500', onRetry() {} })
  assert.match(failed, /role="alert"/)
  assert.match(failed, /signals-error/)
  assert.match(failed, /Try again/)
  const zero = render('StatisticsEmptyActivity', { days: '24h' })
  assert.match(zero, /No activity in the last 24 hours\./)
  assert.doesNotMatch(zero, /role="alert"|signals-error/)
  const chart = render('SignalChart', { rows: [], label: 'Recorded activity', large: true })
  assert.match(chart, /<svg/)
  assert.match(chart, /signals-gridline/)
  assert.match(chart, /No daily data available/)
})
