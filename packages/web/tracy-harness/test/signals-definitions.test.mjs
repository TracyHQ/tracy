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
      contents: `export { SignalKpis } from './SignalKpis'; export { SignalTable } from './SignalTable'; export { StatisticsKpi } from './StatisticsKpi'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'`,
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
const totals = {
  newUsers: 2,
  created: 0,
  imported: 0,
  waitlist: 0,
  stuck: 0,
  discordLinked: 0,
  discordBugs: 0,
  failureEvents: 0,
  bySource: {}
}
const report = (partialEnd) => ({
  totals,
  previous: { ...totals, newUsers: 1 },
  byDay: [],
  previousByDay: [],
  sources: [],
  range: { partialEnd }
})

test('S-M1 partial-current versus full-prior deltas disclose exposure and stay neutral', () => {
  const html = render('SignalKpis', { report: report(true), filters: {}, compare: true })
  assert.equal((html.match(/Partial vs full period/g) || []).length, 5)
  assert.equal((html.match(/data-tone="neutral"/g) || []).length, 5)
  assert.doesNotMatch(html, /; favorable|; unfavorable/)
  const completed = render('SignalKpis', { report: report(false), filters: {}, compare: true })
  assert.doesNotMatch(completed, /Partial vs full period/)
  assert.match(completed, /Up 1; favorable/)
})

test('S-M2 capped tables disclose that search, sort and pagination cover loaded records only', () => {
  const original = globalThis.window
  globalThis.window = { location: new URL('http://localhost/ops/signals') }
  try {
    const props = {
      id: 'latest',
      columns: [{ key: 'email', label: 'Customer', value: (r) => r.email }],
      rows: [{ email: 'latest@example.test' }],
      total: 65,
      rowKey: (r) => r.email,
      defaultSort: 'email',
      search: { label: 'Search email or source', match: (r) => r.email }
    }
    const html = render('SignalTable', props)
    assert.match(html, /Search, sorting and pagination cover only the 1 loaded record of 65 matches/)
    assert.match(html, /1 matching row in loaded records/)
    assert.match(html, /Search email or source within loaded records/)
    const empty = render('SignalTable', { ...props, rows: [] })
    assert.match(empty, /No matching rows in loaded records/)
    assert.match(empty, /Older records are outside this loaded subset/)
    const complete = render('SignalTable', { ...props, total: 1 })
    assert.doesNotMatch(complete, /within loaded records|Search, sorting and pagination cover only/)
  } finally {
    if (original === undefined) delete globalThis.window
    else globalThis.window = original
  }
})
