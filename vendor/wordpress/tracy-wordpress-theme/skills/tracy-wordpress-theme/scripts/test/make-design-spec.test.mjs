// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/test/make-design-spec.test.mjs — WordPress changes: the fixture page-map uses a theme slug, WordPress template names and templateParts; the naming assertion checks the pattern-slug convention instead of T4 module chrome.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, '..', 'make-design-spec.mjs')

const pageMap = JSON.stringify({
  template: { name: 'acme', title: 'Acme' },
  theme: {
    palette: {
      light: { primary: '#2b6cb0', secondary: '#718096', body_bg: '#ffffff', text: '#1a202c' },
      dark: { primary: '#63b3ed', secondary: '#a0aec0', body_bg: '#1a202c', text: '#e2e8f0' }
    },
    fonts: { body: 'Inter', heading: 'Poppins' }
  },
  templateParts: ['header', 'footer'],
  pages: [
    { file: 'index.html', view: 'front-page', layout: 'home' },
    { file: 'single.html', view: 'single' }
  ]
})

function gen(input) {
  return execFileSync('node', [script, '-'], { input, encoding: 'utf8' })
}

test('design-spec carries identity + auto-filled palette/fonts', () => {
  const md = gen(pageMap)
  assert.match(md, /\(`acme`\)/) // theme slug in the title
  assert.match(md, /#2b6cb0/) // light primary auto-filled
  assert.match(md, /#63b3ed/) // dark primary auto-filled
  assert.match(md, /`Inter`/) // body font
  assert.match(md, /`acme\/<page>-<section>`/) // pattern-slug convention with the real slug
  assert.match(md, /esc_html__\( '…', 'acme' \)/) // text domain is the slug
})

test('design-spec leaves TODO slots for Phase-6 values', () => {
  const md = gen(pageMap)
  assert.match(md, /TODO/) // has TODO markers
  assert.match(md, /`border` \| `TODO`/) // border companion not auto-filled
  assert.match(md, /Dark hook.*`TODO`/) // dark hook to pin in Phase 0
  assert.match(md, /html\[data-theme="dark"\]/) // and the WordPress default is named next to it
})

test('per-artifact source table lists the pages and template parts', () => {
  const md = gen(pageMap)
  assert.match(md, /index\.html/)
  assert.match(md, /single\.html/)
  assert.match(md, /`front-page`/)
  assert.match(md, /Declared template parts: `header`, `footer`/)
})

test('degrades gracefully on a minimal page-map', () => {
  const md = gen(JSON.stringify({ template: { name: 'x' } }))
  assert.match(md, /\(`x`\)/)
  assert.match(md, /TODO/)
  assert.match(md, /Declared template parts: `TODO`/)
})

test('a JA source name becomes WP in the Theme Name line; slug and other names stay', () => {
  const ja = gen(JSON.stringify({ template: { name: 'wp-ja-impact', title: 'JA Impact' } }))
  assert.match(ja, /Theme Name`[^\n]*:\*\* WP Impact/)
  assert.match(ja, /\(`wp-ja-impact`\)/)
  assert.doesNotMatch(ja, /JA Impact/)
  assert.match(gen(pageMap), /Theme Name`[^\n]*:\*\* Acme/)
})
