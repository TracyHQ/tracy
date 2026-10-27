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
      contents:
        "export {StuckHistory} from './StuckOverview'; export {StuckFilters} from './StuckFilters'; export {buildStuckView,STUCK_DEFAULTS} from './stuck-data'; export {createElement} from 'react'; export {renderToStaticMarkup} from 'react-dom/server'",
      resolveDir: new URL('../src/beta/', import.meta.url).pathname,
      loader: 'tsx'
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty' },
    plugins: [
      opsI18nPlugin(),
      {
        name: 'static-filter-options',
        setup(build) {
          // Verify the options supplied to the shared portal picker without opening a browser.
          build.onLoad({ filter: /[\\/]StatisticsFilter\.tsx$/ }, () => ({
            contents:
              "import {createElement} from 'react'; export function StatisticsFilter({options}) { return createElement('select', null, options.map(option => createElement('option', {key:option.value,value:option.value}, option.label))); }",
            loader: 'tsx'
          }))
        }
      }
    ],
    external: ['react', 'react/jsx-runtime', 'react-dom/server'],
    write: false,
    logLevel: 'silent'
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, module, module.exports)
  lib = module.exports
})
test('no-activity period never gets a favorable failure-rate delta against a measured prior period', () => {
  const original = globalThis.window
  globalThis.window = { location: new URL('http://localhost/ops/stuck') }
  try {
    const body = {
      readAt: '2026-10-22T10:00Z',
      open: [],
      handledToday: [],
      sites: [],
      history: {
        episodes: [],
        activity: [
          {
            siteKey: 'one',
            at: '2026-10-19T00:00Z',
            kind: 'failed',
            platform: 'joomla',
            operation: 'build',
            step: 'build',
            reason: 'SITE_BUILD_FAILED'
          }
        ]
      }
    }
    const filters = { ...lib.STUCK_DEFAULTS, days: 'custom', start: '2026-10-20', end: '2026-10-20' }
    const view = lib.buildStuckView(body, filters)
    assert.equal(view.history.rate, null)
    assert.equal(view.history.previous.rate, 100)
    const html = lib.renderToStaticMarkup(lib.createElement(lib.StuckHistory, { body, view, filters }))
    assert.match(html, /No recorded activity/)
    assert.doesNotMatch(html, /Down 100; favorable/)
  } finally {
    if (original === undefined) delete globalThis.window
    else globalThis.window = original
  }
})

test('historical steps and reasons remain selectable after a newer problem replaces them', () => {
  const body = {
    readAt: '2026-10-22T10:00Z',
    sites: [{ step: 'reading_content', reason: 'call_failed' }],
    history: { episodes: [], activity: [{ step: 'signing_in', reason: 'admin_gate' }] }
  }
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.StuckFilters, {
      body,
      value: lib.STUCK_DEFAULTS,
      loading: false,
      onChange: () => {},
      onReload: () => {}
    })
  )
  assert.match(html, /value="signing_in"/)
  assert.match(html, /value="admin_gate"/)
})
