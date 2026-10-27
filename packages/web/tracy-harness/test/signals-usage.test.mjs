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
      contents: `export { customerColumns } from './SignalCustomers'; export { tr } from '../i18n'; export { compareSignalRows } from './signals-data'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'`,
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
const tokens = () => lib.customerColumns(lib.tr).find((column) => column.key === 'tokens')
const render = (column, row) => lib.renderToStaticMarkup(column.render(row))

test('unused customers show a neutral full-size token pill and a plain zero request count', () => {
  const row = { requests: 0, tokens: null, lastRequestAt: null }
  const html = render(tokens(), row)
  assert.match(html, /class="signals-chip signals-status-pill" data-tone="neutral">Not used yet/)
  assert.doesNotMatch(html, /Not recorded|requests measured/)
  const requests = lib.customerColumns(lib.tr).find((column) => column.key === 'requests')
  assert.match(render(requests, row), />0<\/span>/)
  assert.doesNotMatch(render(requests, { ...row, lastRequestAt: '2026-10-21T00:00:00Z' }), /Last request/)
  assert.match(render(tokens(), { ...row, tokens: 0 }), /Not used yet/)
})

test('used customers distinguish missing, zero and partially measured tokens', () => {
  assert.match(render(tokens(), { requests: 2, tokens: null }), /Not recorded/)
  assert.match(
    render(tokens(), { requests: 2, tokens: null }),
    /title="Tracy did not record token counts for these requests"/
  )
  assert.doesNotMatch(render(tokens(), { requests: 2, tokens: null }), /Not used yet/)
  const partial = render(tokens(), {
    requests: 3,
    tokens: 1200,
    tokenCoverage: { measuredTurns: 2, partialTurns: 1 }
  })
  assert.match(partial, /1,200/)
  assert.match(partial, /2 of 3 requests measured · 1 partial/)
  const zero = render(tokens(), { requests: 1, tokens: 0 })
  assert.match(zero, />0<\/span>/)
  assert.doesNotMatch(zero, /Not recorded|Not used yet/)
})

test('token sorting keeps no-usage customers last in both directions, behind missing data', () => {
  const rows = [
    { email: 'unused', requests: 0, tokens: null },
    { email: 'missing', requests: 2, tokens: null },
    { email: 'low', requests: 1, tokens: 10 },
    { email: 'high', requests: 1, tokens: 100 },
    { email: 'unused-zero', requests: 0, tokens: 0 },
    { email: 'measured-zero', requests: 1, tokens: 0 }
  ]
  for (const direction of [1, -1]) {
    const sorted = [...rows].sort((a, b) => lib.compareSignalRows(a, b, tokens(), direction))
    assert.deepEqual(
      sorted.slice(-2).map((row) => row.email),
      ['unused', 'unused-zero']
    )
    assert.equal(sorted.at(-3).email, 'missing')
    assert.deepEqual(
      sorted.slice(0, 3).map((row) => row.tokens),
      direction === 1 ? [0, 10, 100] : [100, 10, 0]
    )
  }
})

test('the final two customer columns are Requests then Tokens', () => {
  const keys = lib.customerColumns(lib.tr).map((column) => column.key)
  assert.deepEqual(keys.slice(-2), ['requests', 'tokens'])
})

test('zero requests use the agreed no-usage label', () => {
  const html = render(tokens(), { requests: 0, tokens: null })
  assert.match(html, /Not used yet/)
  assert.doesNotMatch(html, /No included usage/)
})

test('request count and last request have separate cell lines', () => {
  const column = lib.customerColumns(lib.tr).find((candidate) => candidate.key === 'requests')
  const html = render(column, { requests: 5, lastRequestAt: '2026-10-13T00:00:00Z' })
  assert.match(html, /class="signals-request-value">5<\/span>/)
  assert.match(html, /<small>Last request <time/)
})
