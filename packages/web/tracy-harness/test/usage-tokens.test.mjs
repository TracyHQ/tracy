import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.resolve(pkgRoot, '../../../package.json'))
let lib
before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `export { TokenValue, TokenMedian, tokenCoverageLabel } from './usage-tokens'; export { tr } from '../i18n'; export { UsageTokenKpis } from './UsageTokens'; export { SignalChart } from './SignalChart'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'`,
      resolveDir: path.join(pkgRoot, 'src/beta'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    plugins: [opsI18nPlugin()],
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom/server'],
    write: false,
    logLevel: 'silent'
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports)
  lib = module.exports
})
const render = (name, props) => lib.renderToStaticMarkup(lib.createElement(lib[name], props))

test('token cells distinguish unused, missing and a recorded zero', () => {
  const unused = render('TokenValue', { value: null, requests: 0 })
  assert.match(unused, /signals-status-pill.*Not used yet/)
  assert.doesNotMatch(unused, /Not recorded/)
  const missing = render('TokenValue', { value: null, requests: 3 })
  assert.match(missing, /signals-zero.*Tracy did not record token counts.*Not recorded/)
  const zero = render('TokenValue', { value: 0, requests: 1 })
  assert.equal(zero, '<span>0</span>')
})

test('median cells explain the sample floor and preserve missing records', () => {
  assert.match(
    render('TokenMedian', {
      value: null,
      coverage: { requests: 25, measuredRequests: 19, partialRequests: 0 }
    }),
    /Needs 20 measured requests/
  )
  assert.match(
    render('TokenMedian', {
      value: 1000,
      coverage: { requests: 25, measuredRequests: 20, partialRequests: 0 }
    }),
    /1,000/
  )
  assert.match(
    render('TokenMedian', {
      value: null,
      coverage: { requests: 25, measuredRequests: 0, partialRequests: 0 }
    }),
    /Not recorded/
  )
  assert.equal(
    lib.tokenCoverageLabel(lib.tr, { requests: 25, measuredRequests: 20, partialRequests: 2 }),
    'Measured on 20 of 25 requests; 2 partial'
  )
})

test('token KPI comparisons require both measurements and respect all-time', () => {
  const tokens = {
    total: 1200,
    requests: 25,
    measuredRequests: 20,
    partialRequests: 2,
    perRequest: { n: 20, median: 60, p90: null }
  }
  const body = {
    range: { partialEnd: true },
    turns: { all: { turns: 25, tokens } },
    previous: { turns: { all: { tokens: { ...tokens, total: 1000 } } } }
  }
  const current = render('UsageTokenKpis', { body, filters: { days: '14', compare: true } })
  assert.match(current, /Tokens used/)
  assert.match(current, /Tokens per request/)
  assert.match(current, /\+200/)
  assert.match(current, /Measured on 20 of 25 requests; 2 partial/)
  assert.match(current, /Period in progress/)
  assert.doesNotMatch(current, /Partial vs full period/)
  const all = render('UsageTokenKpis', { body, filters: { days: 'all', compare: true } })
  assert.doesNotMatch(all, /previous<|signals-delta/)
  const missing = render('UsageTokenKpis', {
    body: {
      turns: {
        all: {
          turns: 2,
          tokens: {
            ...tokens,
            total: null,
            measuredRequests: 0,
            requests: 2,
            perRequest: { n: 0, median: null, p90: null }
          }
        }
      }
    },
    filters: { days: '14', compare: true }
  })
  assert.match(missing, /Not recorded/)
  assert.doesNotMatch(missing, /signals-delta/)
})

test('chart gaps never turn absent token measurements into zeros or connect across them', () => {
  const html = render('SignalChart', {
    rows: [
      { day: '2026-10-01', tokens: 10 },
      { day: '2026-10-02', tokens: null },
      { day: '2026-10-03', tokens: 30 }
    ],
    metric: (row) => row.tokens,
    large: true,
    label: 'Tokens over time'
  })
  assert.match(html, /Current Not recorded/)
  assert.doesNotMatch(html, /NaN|Current null/)
  const path = html.match(/class="signals-line" d="([^"]*)"/)[1]
  assert.equal((path.match(/M/g) || []).length, 2)
  assert.doesNotMatch(path, /L/)
  assert.equal((html.match(/class="signals-chart-dot"/g) || []).length, 2)
  const dots = [...html.matchAll(/class="signals-chart-dot"[^>]*r="([^"]+)"/g)]
  assert.equal(
    dots.every((dot) => Number(dot[1]) > 0),
    true,
    'isolated measurements stay visible'
  )
})
