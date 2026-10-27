// The role scan never converts a brand logo on its own: the wordmark's face, the mark's paint and the
// site title are sorted as keep, so whether a logo follows a worn system is a decision written by hand in
// the template (since 16/10/2026 JA Kinetic and Tracy Business WordPress let their logo follow, as the
// Joomla templates do). Every other rule beside them is still sorted as before.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadContract } from '../src/library.mjs'
import { brandKeepOf } from '../src/role-scan/brand.mjs'
import { scanTemplate } from '../src/role-scan/index.mjs'
import { writeFixture } from './role-scan-fixtures.mjs'

const CSS = 'assets/css/brand.css'
const BRAND_WP = {
  'style.css': '/*\nTheme Name: Brand Fixture\nText Domain: brand-fixture\nVersion: 1.0.0\n*/\n',
  'functions.php': '<?php\n',
  'theme.json': `${JSON.stringify({ version: 3, settings: { color: { palette: [{ slug: 'accent', name: 'Accent', color: '#4D7C0F' }] } } }, null, 2)}\n`,
  [CSS]: `body { font-family: "IBM Plex Sans", system-ui, sans-serif; color: #46514B; }
h1, h2 { font-family: "Space Grotesk", system-ui, sans-serif; }
.tracy-header__brand .tracy-brand,
.tracy-header__brand .tracy-brand a { font-family: "Space Grotesk", system-ui, sans-serif; }
.navbar-brand { font-family: "Space Grotesk", sans-serif; }
.wp-block-site-title a { font-family: "Space Grotesk", sans-serif; }
.site-logo svg path { fill: #4D7C0F; }
.tracy-header__brand .tracy-nav a { font-family: "Space Grotesk", sans-serif; }
.btn-brand { background: #4D7C0F; }
`,
  'parts/header.html':
    '<a class="kinetic-logo" href="/"><svg class="kinetic-logo-glyph"><path stroke="#4D7C0F" d="M0 0"/></svg></a>\n<span class="badge"><svg><path stroke="#4D7C0F" d="M0 0"/></svg></span>\n'
}

const sortOf = (scan, file, line, value) => {
  const f = scan.findings.find((x) => x.file === file && x.line === line && x.text.trim().startsWith(value))
  assert.ok(f, `no finding ${file}:${line} ${value}`)
  return f
}

test('a brand subject (wordmark, site title, logo, navbar brand) is a keep; its ancestors and colour utilities are not', () => {
  assert.match(brandKeepOf({ selector: '.tracy-header__brand .tracy-brand a' }) ?? '', /brand logo/)
  assert.match(brandKeepOf({ selector: '.wp-block-site-title a' }) ?? '', /brand logo/)
  assert.match(brandKeepOf({ selector: '.site-logo svg path' }) ?? '', /brand logo/)
  assert.match(brandKeepOf({ selector: '.navbar-brand' }) ?? '', /brand logo/)
  assert.match(
    brandKeepOf({ selector: '', lineText: '<img alt="Kinetic logo" src="x.svg">' }) ?? '',
    /brand logo/
  )
  assert.equal(
    brandKeepOf({ selector: '.tracy-header__brand .tracy-nav a' }),
    null,
    'a menu beside the brand'
  )
  assert.equal(brandKeepOf({ selector: '.btn-brand' }), null, 'a button in the brand colour')
  assert.equal(brandKeepOf({ selector: '.text-brand-primary' }), null, 'a colour utility')
  assert.equal(
    brandKeepOf({ selector: ':root', name: '--brand-primary', kind: 'custom' }),
    null,
    'a palette variable'
  )
  assert.equal(
    brandKeepOf({ selector: '.tracy-brand a, .tracy-nav a' }),
    null,
    'a list mixing brand and menu'
  )
})

test('the scan keeps the wordmark face and the logo paint, and still converts the page and heading faces', () => {
  const s = scanTemplate(writeFixture(BRAND_WP))
  assert.equal(sortOf(s, CSS, 1, '"IBM Plex Sans"').class, 'auto', 'the page face')
  assert.equal(sortOf(s, CSS, 2, '"Space Grotesk"').class, 'auto', 'the heading face')
  for (const line of [4, 5, 6]) {
    const f = sortOf(s, CSS, line, '"Space Grotesk"')
    assert.equal(f.class, 'keep', `${CSS}:${line}`)
    assert.match(f.reason, /brand logo/)
  }
  assert.equal(sortOf(s, CSS, 7, '#4D7C0F').class, 'keep', 'the logo mark fill')
  assert.equal(sortOf(s, CSS, 8, '"Space Grotesk"').class, 'auto', 'the menu next to the brand')
  assert.notEqual(sortOf(s, CSS, 9, '#4D7C0F').class, 'keep', 'a button in the brand colour')
  assert.equal(sortOf(s, 'parts/header.html', 1, '#4D7C0F').class, 'keep', 'the inline logo glyph')
  assert.notEqual(sortOf(s, 'parts/header.html', 2, '#4D7C0F').class, 'keep', 'an icon that is no logo')
})

// The slot's own contracts are the other road to the logo: a face selector list naming the wordmark
// (Joomla JA Kinetic's displayFace held `.kinetic-logo .kinetic-logo-text` until 15/10/2026).
const splitTop = (sel) => {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of sel) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}
const subjects = (sel) => {
  const is = /^:is\(([\s\S]*)\)$/.exec(sel.trim())
  return is ? splitTop(is[1]) : splitTop(sel)
}

test('no slot contract dresses a brand subject in a face role', () => {
  const dir = fileURLToPath(new URL('../templates/', import.meta.url))
  const hits = []
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const c = loadContract(file.replace(/\.json$/, ''))
    for (const [key, value] of Object.entries(c.selectors ?? {})) {
      if (!key.endsWith('Face')) continue
      for (const sel of [value].flat())
        for (const one of subjects(String(sel)))
          if (brandKeepOf({ selector: one })) hits.push(`${file} ${key}: ${one}`)
    }
  }
  assert.deepEqual(hits, [])
})
