/**
 * "Google rating" on the Details Profile card: the server's rating decision as a row, with Few reviews under 5
 * reviews (left off the site until the person shows it) and Show on the site / Leave off the site. Bundles the real
 * component with React 18 (the one dsh's page runs) and renders it to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-profile-rating.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)

function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

let outDir = ''
let lib
before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-profile-rating-'))
  const outfile = path.join(outDir, 'profile-rating.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { ProfileRatingRow } from './profile-rating-row.tsx'
        export { ratingActions, ratingRowView, ratingText } from './profile-rating-model.ts'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@18.3.1', 'react'),
      'react-dom': fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
// The server's decision for Padel & Tennis Coach (dev, 26/10/2026): 5.0 from 4 reviews on Google.
const DUBAI = { state: 'left', score: 5, reviews: 4, few: true, choice: null, from: 'search' }
const profile = (googleRating) => ({ googleRating })
const draw = (view) =>
  lib.renderToStaticMarkup(lib.createElement(lib.ProfileRatingRow, { t, view, onSave: async () => true }))

test('Dubai case: 5.0 ★ (4 reviews), Few reviews, left off until shown, both choices offered', () => {
  const view = lib.ratingRowView(profile(DUBAI))
  assert.deepEqual(view, { score: 5, reviews: 4, few: true, shown: false, chosen: false })
  const html = draw(view)
  assert.match(html, /\[field\.googleRating\]/)
  assert.match(
    html,
    /\[rating\.value\{&quot;rating&quot;:&quot;5\.0&quot;,&quot;count&quot;:&quot;4&quot;\}\]/
  )
  assert.match(html, /tracy-wo-name-chip is-check[^>]*>\[rating\.few\]/)
  assert.match(html, /\[rating\.fewNote\]/)
  assert.match(html, /\[rating\.show\][\s\S]*\[rating\.leave\]/)
})

test('a thin rating the person showed: Few reviews stays, only Leave off the site is offered', () => {
  const view = lib.ratingRowView(profile({ ...DUBAI, state: 'shown', choice: 'show' }))
  assert.deepEqual(lib.ratingActions(view), ['leave'])
  const html = draw(view)
  assert.match(html, /\[rating\.few\]/)
  assert.doesNotMatch(html, /\[rating\.fewNote\]|\[rating\.show\]|\[rating\.left\]/)
})

test('5 reviews and more: shown with no chip, Leave off the site; left off by the person, Show on the site', () => {
  const many = lib.ratingRowView(
    profile({ state: 'shown', score: 4.6, reviews: 812, few: false, choice: null })
  )
  const html = draw(many)
  assert.doesNotMatch(html, /tracy-wo-name-chip|\[rating\.show\]/)
  assert.match(html, /\[rating\.leave\]/)
  const left = lib.ratingRowView(
    profile({ state: 'left', score: 4.6, reviews: 812, few: false, choice: 'leave' })
  )
  const leftHtml = draw(left)
  assert.match(leftHtml, /\[rating\.left\]/)
  assert.match(leftHtml, /\[rating\.show\]/)
  assert.doesNotMatch(leftHtml, /\[rating\.leave\]/)
})

test('one review and an unknown count read as such; no rating draws no row', () => {
  assert.match(draw(lib.ratingRowView(profile({ ...DUBAI, reviews: 1 }))), /\[rating\.valueOne/)
  assert.match(draw(lib.ratingRowView(profile({ ...DUBAI, reviews: null }))), /\[rating\.valueNoCount/)
  assert.equal(lib.ratingRowView(profile({ state: 'none' })), null)
  assert.equal(lib.ratingRowView({}), null)
  assert.equal(lib.ratingText(5), '5.0')
  assert.equal(lib.ratingText(4.6, 'de'), '4,6')
})
