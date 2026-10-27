// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/test/html-bundle.test.mjs — WordPress changes: expectations use WordPress template names, a bare theme slug and templateParts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  parseBundle,
  inferView,
  extractPaletteFromCss,
  extractFonts,
  parseRawTemplate
} from '../lib/html-bundle.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const bundleDir = join(here, 'fixtures', 'bundle-min')

test('parseBundle reads manifest and returns normalized page-map', async () => {
  const result = await parseBundle(bundleDir)
  assert.equal(result.template.name, 'acme')
  assert.equal(result.theme.palette.light.primary, '#2b6cb0')
  assert.equal(result.theme.palette.dark.primary, '#63b3ed')
  const home = result.pages.find((p) => p.file === 'index.html')
  assert.equal(home.view, 'front-page')
  assert.deepEqual(result.templateParts, ['header', 'footer'])
  assert.equal(result.positions, undefined, 'Joomla positions must not leak into a WordPress page-map')
})

test('inferView falls back to filename + DOM signals when manifest lacks a view', () => {
  assert.equal(inferView('login.html', '<form><input type="password"></form>'), 'page-login')
  assert.equal(inferView('mystery.html', '<article><h1>x</h1></article>'), 'single')
  assert.equal(
    inferView('reach-us.html', '<form><textarea></textarea><input name="email"></form>'),
    'page-contact'
  )
})

// ── raw-template (no-manifest) tests ─────────────────────────────────────────

const RAW_MIN = join(here, 'fixtures', 'raw-min')
const rawCss = readFileSync(join(RAW_MIN, 'style.css'), 'utf8')

test('extractPaletteFromCss: palette and mode correct for dark-primary template', () => {
  const { palette, mode } = extractPaletteFromCss(rawCss)
  assert.equal(palette.primary, '#c9a96e', 'primary color should be accent')
  assert.equal(palette.body_bg, '#0f0e0b', 'body_bg should be bg-primary')
  assert.equal(palette.text, '#f0ece4', 'text should be text-primary')
  assert.equal(mode, 'dark-primary', 'mode should be dark-primary for dark bg')
})

test('extractFonts: heading and body fonts correct', () => {
  const fonts = extractFonts(rawCss)
  assert.ok(
    fonts.heading.includes('Cormorant Garamond'),
    `heading font should include Cormorant Garamond, got: ${fonts.heading}`
  )
  assert.ok(fonts.body.includes('Outfit'), `body font should include Outfit, got: ${fonts.body}`)
})

test('parseBundle auto-detect raw (no manifest): template.name, theme.mode, palette, home page', async () => {
  const bundle = await parseBundle(RAW_MIN)
  assert.equal(bundle.template.name, 'raw-min', 'template.name is the directory basename as a theme slug')
  assert.equal(bundle.theme.mode, 'dark-primary', 'theme.mode should be dark-primary')
  assert.ok(bundle.theme.palette.light, 'theme.palette.light should be present')
  assert.ok(bundle.theme.palette.dark, 'theme.palette.dark should be present')
  const homePage = bundle.pages.find((p) => p.view === 'front-page')
  assert.ok(homePage, 'should have a home page with view front-page')
})

test('parseRawTemplate direct: same results as auto-detect', async () => {
  const bundle = await parseRawTemplate(RAW_MIN)
  assert.equal(bundle.template.name, 'raw-min')
  assert.equal(bundle.theme.mode, 'dark-primary')
  assert.ok(bundle.theme.palette.light)
  assert.ok(bundle.theme.palette.dark)
})

test('parseBundle --single flag forces raw mode even if manifest.json existed', async () => {
  // bundleDir has a manifest, but --single should bypass it
  const bundle = await parseBundle(bundleDir, { single: true })
  // Should NOT use manifest's "acme" name — instead derives from dir name "bundle-min"
  assert.match(
    bundle.template.name,
    /^[a-z][a-z0-9-]*$/,
    `template.name should be a theme slug, got: ${bundle.template.name}`
  )
  // Should NOT equal the manifest name
  assert.notEqual(bundle.template.name, 'acme', 'with --single, should not read manifest')
})
