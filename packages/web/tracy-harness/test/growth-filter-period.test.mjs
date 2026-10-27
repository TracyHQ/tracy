import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const require = createRequire(import.meta.url)
const { build } = require('esbuild')
const result = await build({
  stdin: {
    contents: `export { SignalFilters } from './SignalFilters'; export { UsageFilters } from './UsageFilters'; export { AppStatisticFilters } from './AppStatisticFilters'; export { DEFAULT_FILTERS } from './signals-data'; export { USAGE_DEFAULTS } from './usage-data'; export { defaultAppStatisticState } from './app-statistic-state'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'`,
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

for (const [name, value] of [
  ['SignalFilters', lib.DEFAULT_FILTERS],
  ['UsageFilters', lib.USAGE_DEFAULTS],
  ['AppStatisticFilters', lib.defaultAppStatisticState]
]) {
  test(`${name} stops announcing period loading when the request finishes without a report`, () => {
    const render = (loading) =>
      lib.renderToStaticMarkup(
        lib.createElement(lib[name], {
          value,
          report: null,
          body: null,
          loading,
          onChange() {},
          onReload() {}
        })
      )
    assert.match(render(true), /Reading period/)
    assert.doesNotMatch(render(false), /Reading period/)
    assert.match(render(false), /class="signals-range"><\/span>/)
  })
}
