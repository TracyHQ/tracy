/**
 * What a template card on the grid draws before its live demo loads (#523), rendered.
 *
 * Two measured faults, both on the card the grid renders (`TemplateThumb`, used by `Gallery.tsx`):
 *
 *   1. The poster was `card.image`, the 390-px phone shot, under a 1440×900 desktop frame — JA Vega
 *      showed a huge "Contact Us" button and a hamburger for 1–2 s, then jumped to the desktop page.
 *   2. JA Restaurant's pictures arrived as bare file names, which the card pointed at a door that
 *      404s for every name: a broken-image icon.
 *
 * The render is the grid's own component through `react-dom/server` (resolved from `@tracy/core`,
 * which declares it), bundled with esbuild (this plugin's devDependency). Server rendering never
 * asks the probe, so no frame is mounted and what is drawn is exactly the poster state.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { templateRows } from '../src/client/templates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const corePkg = path.join(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)

/** React from this plugin, react-dom from `@tracy/core`: one copy of each for the whole bundle. */
const oneReact = {
  name: 'one-react',
  setup(build) {
    const fromPlugin = createRequire(path.join(pkgRoot, 'package.json'))
    const fromCore = createRequire(path.join(corePkg, 'package.json'))
    build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({
      path: (args.path.startsWith('react-dom') ? fromCore : fromPlugin).resolve(args.path)
    }))
  }
}

let outDir
/** @type {{ thumb: (template: unknown) => string }} */
let bundle

before(async () => {
  const esbuild = require('esbuild')
  outDir = mkdtempSync(path.join(tmpdir(), 'tdi-thumb-'))
  const outfile = path.join(outDir, 'bundle.cjs')
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { TemplateThumb } from './TemplateThumb'
        export function thumb(template) {
          return renderToStaticMarkup(createElement(TemplateThumb, { template, title: 'Card', active: true }))
        }`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    // CommonJS: react-dom/server requires Node built-ins, which an ESM bundle cannot `require`.
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    plugins: [oneReact],
    outfile,
    logLevel: 'silent'
  })
  bundle = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const at = (id, file) => `https://cowork.tracy.site/api/templates/${id}/shots/${file}?v=0123abcd`
/** What the card asks for: the same address, card-sized (`cardThumb`, `?w=`). */
const small = (address) => `${address}&w=720`

/** One card as tracy-web answers it, through the same mapping the tab uses. */
function row(id, card) {
  const rows = templateRows({
    templates: [
      { id, label: id, card, platforms: [{ platform: 'joomla', tag: `${id}/j6`, version: '1.0.0' }] }
    ]
  })
  return rows[0].template
}

const imgSources = (html) =>
  [...html.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1].replaceAll('&amp;', '&'))

test('a card with a live demo draws the home page’s desktop shot, not the phone shot, under the frame', () => {
  const html = bundle.thumb(
    row('ja-vega', {
      image: at('ja-vega', 'ja-vega-home-390.png'),
      demo: { url: 'https://ja-vega-joomla.tracy.site/', version: '1.0.0' },
      layouts: [
        {
          key: 'about',
          label: 'About',
          path: '/about',
          shots: { desktop: at('ja-vega', 'ja-vega-about-1440.png') }
        },
        {
          key: 'home',
          label: 'Home',
          path: '/',
          shots: {
            desktop: at('ja-vega', 'ja-vega-home-1440.png'),
            mobile: at('ja-vega', 'ja-vega-home-390.png')
          }
        }
      ]
    })
  )
  assert.deepEqual(imgSources(html), [small(at('ja-vega', 'ja-vega-home-1440.png'))])
})

test('a live card whose home has no desktop shot falls back to the card’s own picture', () => {
  const html = bundle.thumb(
    row('ja-vega', {
      image: at('ja-vega', 'ja-vega-home-390.png'),
      demo: { url: 'https://ja-vega-joomla.tracy.site/', version: '1.0.0' },
      layouts: [
        { key: 'home', label: 'Home', path: '/', shots: { mobile: at('ja-vega', 'ja-vega-home-390.png') } }
      ]
    })
  )
  assert.deepEqual(imgSources(html), [small(at('ja-vega', 'ja-vega-home-390.png'))])
})

test('a card with no demo keeps the picture it was published with', () => {
  const html = bundle.thumb(
    row('tracy-base', {
      image: at('tracy-base', 'base-home-390.png'),
      layouts: [
        { key: 'home', label: 'Home', path: '/', shots: { desktop: at('tracy-base', 'base-home-1440.png') } }
      ]
    })
  )
  assert.deepEqual(imgSources(html), [small(at('tracy-base', 'base-home-390.png'))])
})

test('a card with no picture draws the empty block — never an <img> (#523, JA Restaurant)', () => {
  // What an older tracy-web answered for `ja-restaurant`: bare names, no demo.
  const bare = row('ja-restaurant', {
    image: 'ja-restaurant-home-390.png',
    layouts: [
      {
        key: 'home',
        label: 'Home',
        path: '/',
        shots: { desktop: 'ja-restaurant-home-1440.png', mobile: 'ja-restaurant-home-390.png' }
      }
    ]
  })
  // And what it answers since #523: null.
  const empty = row('ja-restaurant', {
    image: null,
    layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: null, mobile: null } }]
  })
  for (const template of [bare, empty]) {
    const html = bundle.thumb(template)
    assert.doesNotMatch(html, /<img/)
    assert.doesNotMatch(html, /<iframe/)
    assert.match(html, /bg-muted/, 'the empty block the card already draws')
  }
})

test('the card asks the shots door for a card-sized copy, and leaves every other picture alone', async () => {
  const { cardThumb } = await import('../src/client/templates.mjs')
  assert.equal(
    cardThumb('https://cowork.tracy.site/api/templates/ja-vega/shots/ja-vega-home-1440.png?v=0123abcd'),
    'https://cowork.tracy.site/api/templates/ja-vega/shots/ja-vega-home-1440.png?v=0123abcd&w=720'
  )
  assert.equal(
    cardThumb('/api/templates/ja-vega/shots/ja-vega-home-1440.png'),
    '/api/templates/ja-vega/shots/ja-vega-home-1440.png?w=720'
  )
  assert.equal(cardThumb('https://example.com/picture.png'), 'https://example.com/picture.png')
  assert.equal(
    cardThumb('/design-inspiration/systems/x/cover.png'),
    '/design-inspiration/systems/x/cover.png'
  )
  assert.equal(cardThumb(null), null)
})
