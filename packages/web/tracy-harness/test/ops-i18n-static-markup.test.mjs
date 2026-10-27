/**
 * A screen that reads `useT` renders to static markup (what every screen test does), with and
 * without an `I18nProvider`: the language store needs a server snapshot or React throws.
 *
 *   node --test packages/web/tracy-harness/test/ops-i18n-static-markup.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const pkgRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootRequire = createRequire(path.join(pkgRoot, '..', '..', '..', 'package.json'))
const pkgRequire = createRequire(path.join(pkgRoot, 'package.json'))
/** @type {any} */
let lib

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider, useT } from './src/i18n/index.ts'
import { createOpsLanguage } from './src/i18n/ops-language.ts'
function Title() {
  return createElement('h1', null, useT()('shell.language.title'))
}
export const bare = () => renderToStaticMarkup(createElement(Title))
export const provided = () => {
  const language = createOpsLanguage({ win: {}, load: () => Promise.resolve({}) })
  return renderToStaticMarkup(createElement(I18nProvider, { language }, createElement(Title)))
}
`,
      resolveDir: pkgRoot,
      loader: 'ts'
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react', 'react-dom', 'react-dom/server'],
    plugins: [opsI18nPlugin()],
    logLevel: 'silent'
  })
  const module = { exports: {} }
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(module, module.exports, pkgRequire)
  lib = module.exports
})

test('a screen using useT renders to static markup with no provider', () => {
  assert.equal(lib.bare(), '<h1>Language</h1>')
})

test('and inside an I18nProvider', () => {
  assert.equal(lib.provided(), '<h1>Language</h1>')
})
