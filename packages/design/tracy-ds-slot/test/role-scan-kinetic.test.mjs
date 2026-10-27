// The role scan on JA Kinetic (dry run of 15/10/2026, nine wrong sorts): every test is built from a
// real Kinetic snippet (`role-scan-kinetic-fixtures.mjs`).
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { declarationsOf } from '../src/role-scan/css-lexer.mjs'
import { colourRoleOfName } from '../src/role-scan/hints.mjs'
import { applyAutoConverts, scanTemplate } from '../src/role-scan/index.mjs'
import { coloursIn } from '../src/role-scan/literals.mjs'
import { buildReport } from '../src/role-scan/report.mjs'
import { writeFixture } from './role-scan-fixtures.mjs'
import {
  BUSINESS_EXTRA,
  KINETIC_SASS,
  KINETIC_SKIPS,
  KINETIC_T4,
  KINETIC_WP
} from './role-scan-kinetic-fixtures.mjs'

const find = (scan, file, line, value) =>
  scan.findings.find((x) => x.file === file && x.line === line && x.text === value)
const pick = (scan, file, line, value) => {
  const f = find(scan, file, line, value)
  assert.ok(f, `no finding ${file}:${line} ${JSON.stringify(value)}`)
  return `${f.class} ${f.role ?? ''}`.trim()
}
const snapshot = (root) => {
  const out = {}
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else out[p.slice(root.length)] = readFileSync(p, 'utf8')
    }
  }
  walk(root)
  return out
}
const T4 = 'css/template.css'

test('1. a colour name inside an identifier is never a colour (template.css:85, 15853; _variables.scss:22)', () => {
  for (const [value, kind] of [
    ['rgba(var(--t4-white-rgb), var(--t4-text-opacity)) !important', 'text'],
    ['var(--color-white)', 'text'],
    ['$gray-700', 'text'],
    ['$white', 'fill'],
    ['@gray-light', 'text'],
    ['255, 255, 255', 'custom'],
    ['1px solid var(--border-white-soft)', 'line']
  ])
    assert.deepEqual(coloursIn(value, kind).colours, [], value)
  assert.deepEqual(
    coloursIn('1px solid white', 'line').colours.map((c) => c.text),
    ['white'],
    'a standalone name still counts'
  )
  const s = scanTemplate(writeFixture(KINETIC_T4))
  for (const line of [2, 33, 35])
    assert.ok(!s.findings.some((f) => f.file === T4 && f.line === line), `${T4}:${line}`)
  const sass = scanTemplate(writeFixture(KINETIC_SASS))
  assert.ok(!sass.findings.some((f) => /gray|white/.test(f.text)), 'no name inside a Sass identifier')
})

test('2. the page ground is what body/html/:root paint, on both sides (not the first -bg variable)', () => {
  const t4 = scanTemplate(writeFixture(KINETIC_T4))
  assert.equal(t4.grounds.light, '#fbfcfa')
  assert.equal(t4.grounds.dark, '#0a0d0c')
  const wp = scanTemplate(writeFixture(KINETIC_WP))
  assert.equal(wp.grounds.light, '#fbfcfa')
  assert.equal(wp.grounds.dark, '#0a0d0c')
})

test('3. the suffix of a primary/brand name decides its role (template.css:69, brand engine)', () => {
  assert.equal(colourRoleOfName('--brand-color-primary-contrast', 1), '--ds-c-accent-on')
  assert.equal(colourRoleOfName('--brand-color-text', 0.12), '--ds-c-fg')
  assert.equal(colourRoleOfName('--brand-color-fill', 0.75), '--ds-c-surface')
  assert.match(colourRoleOfName('--t4-primary-bg-subtle', 0.75) ?? '', /^--ds-c-surface(-warm)?$/)
  assert.match(colourRoleOfName('--t4-primary-border-subtle', 0.5) ?? '', /^--ds-c-border(-soft)?$/)
  assert.equal(colourRoleOfName('--color-primary', 0.2), '--ds-c-accent')
  assert.equal(colourRoleOfName('--color-primary-hover', 0.2), '--ds-c-accent-hover')
  const t4 = scanTemplate(writeFixture(KINETIC_T4))
  assert.match(pick(t4, T4, 3, 'rgb(206.6, 226, 254.6)'), /^auto --ds-c-surface(-warm)?$/)
  assert.equal(pick(t4, T4, 4, 'rgb(5.2, 44, 101.2)'), 'auto --ds-c-accent-text')
  const wp = scanTemplate(writeFixture(KINETIC_WP))
  const css = 'assets/css/wp-ja-kinetic-article.css'
  assert.equal(pick(wp, css, 11, '#ffffff'), 'auto --ds-c-accent-on')
  assert.equal(pick(wp, css, 12, '#5c6660'), 'auto --ds-c-fg')
  assert.match(pick(wp, css, 13, '#e0e2e0'), /^auto --ds-c-surface(-warm)?$/)
  assert.match(pick(wp, css, 14, '#b9bdae'), /^(auto --ds-c-surface(-warm)?|flag)$/)
})

test('4. a component variable takes the role of its component, and no wrong role spreads by colour', () => {
  const s = scanTemplate(writeFixture(KINETIC_T4))
  // .btn-primary (template.css:3005-3008): the button's own fill, text and hover fill
  assert.equal(pick(s, T4, 44, '#0d6efd'), 'auto --ds-c-accent')
  assert.equal(pick(s, T4, 43, '#fff'), 'auto --ds-c-accent-on')
  assert.equal(pick(s, T4, 45, 'rgb(10.4, 88, 202.4)'), 'auto --ds-c-accent-hover')
  // a dark code panel is not the page ground; a lime chip is not a ground at all
  assert.notEqual(pick(s, T4, 16, '#0D1110'), 'auto --ds-c-bg')
  assert.notEqual(pick(s, 'css/darkmode.css', 6, '#A3E635'), 'auto --ds-c-bg')
  // the 13% lime tint of the categories tile (page-250.css) is a tint, not an opaque lime ground,
  // and the lime fills elsewhere never become surface by colour equality
  assert.equal(pick(s, T4, 59, '#A3E635').split(' ')[0], 'flag')
  for (const line of [53, 54])
    assert.equal(pick(s, T4, line, '#A3E635'), 'auto --ds-c-accent', `line ${line}`)
  const wp = scanTemplate(writeFixture(KINETIC_WP))
  assert.notEqual(pick(wp, 'assets/css/wp-ja-kinetic-article.css', 2, '#4d7c0f'), 'auto --ds-c-bg')
})

test('5. white text on a ground the scan cannot see is flagged, never a dark-text role', () => {
  const s = scanTemplate(writeFixture(KINETIC_T4))
  const caption = find(s, T4, 50, '#fff')
  assert.equal(caption.class, 'flag', '.carousel-caption (template.css:6165)')
  assert.ok(
    caption.candidates.every((r) => !/-(fg|muted|meta|heading)$/.test(r)),
    caption.candidates
  )
  assert.equal(pick(s, T4, 47, '#fff'), 'auto --ds-c-accent-on', 'white on the accent badge')
  // the dark side's heading white (darkmode.css --heading) does not make a light-side text a heading
  assert.equal(pick(s, T4, 64, '#F2F5F3'), 'flag', '.hx-cta-title (page-219.css:177)')
  const wp = scanTemplate(writeFixture(KINETIC_WP))
  const badge = find(wp, 'assets/css/wp-ja-kinetic-article.css', 7, '#fff')
  assert.equal(badge.class, 'flag', '.badge #fff (article.css:552)')
  for (const f of [...s.findings, ...wp.findings])
    if (f.kind === 'text' && f.class === 'auto' && /^#f{3,6}$/i.test(f.text))
      assert.ok(!/-(fg|fg-2|muted|meta|heading)$/.test(f.role), `${f.file}:${f.line} ${f.role}`)
})

test('6. dark mode: html.t4-dark, .dark, [data-theme=dark] are dark; html:not(.t4-dark) is light', () => {
  const side = (sel) => declarationsOf(`${sel} { color: #000 }`)[0].scheme
  for (const sel of [
    'html.t4-dark',
    'html.t4-dark[data-style=terminal]',
    '.t4-dark .x',
    '[data-theme=dark] .x',
    '[data-bs-theme="dark"]',
    '.dark .x',
    'html.dark',
    'body.is-dark-theme .x'
  ])
    assert.equal(side(sel), 'dark', sel)
  for (const sel of ['html:not(.t4-dark) .x', 'html:not(.dark)', '.dark-header .x', '.bg-dark', '.text-dark'])
    assert.equal(side(sel), 'light', sel)
  const s = scanTemplate(writeFixture(KINETIC_T4))
  assert.equal(find(s, 'css/darkmode.css', 3, '#0A0D0C').scheme, 'dark')
  assert.equal(find(s, 'css/darkmode.css', 8, '#F2F5F3').scheme, 'dark')
  assert.equal(find(s, T4, 58, '#2A322E').scheme, 'light')
})

test('7. --write is idempotent in one pass: the second run changes no byte', () => {
  for (const fx of [KINETIC_T4, KINETIC_WP, KINETIC_SASS]) {
    const root = writeFixture(fx)
    const first = applyAutoConverts(root, scanTemplate(root))
    assert.ok(first.replaced > 0)
    const after = snapshot(root)
    const again = scanTemplate(root)
    assert.deepEqual(
      again.findings.filter((f) => f.class === 'auto').map((f) => `${f.file}:${f.line} ${f.text}`),
      []
    )
    assert.equal(applyAutoConverts(root, again).replaced, 0)
    assert.deepEqual(snapshot(root), after)
  }
})

test('8. Sass: variable definitions and function arguments are flagged, never rewritten; the compiled twin is marked', () => {
  const root = writeFixture(KINETIC_SASS)
  const s = scanTemplate(root)
  const vars = s.findings.filter((f) => f.file === 'scss/_variables.scss')
  assert.ok(vars.length >= 3)
  for (const f of vars) assert.equal(f.class, 'flag', `${f.line} ${f.text}`)
  assert.match(find(s, 'scss/_variables.scss', 3, '#0d6efd').reason, /Sass/)
  assert.equal(pick(s, 'scss/template.scss', 5, '#dee2e6'), 'flag', 'argument of darken()')
  const twin = s.findings.filter((f) => f.file === 'css/template.css')
  assert.ok(twin.length && twin.every((f) => f.twin === 'scss/template.scss'), 'compiled twin marked')
  const r = buildReport(s)
  const counted = s.findings.filter((f) => !f.twin)
  assert.equal(r.totals.auto + r.totals.flag + r.totals.keep + r.totals.missing, counted.length)
  assert.equal(r.totals.twin, twin.length)
  const before = readFileSync(join(root, 'scss/_variables.scss'), 'utf8')
  applyAutoConverts(root, s)
  assert.equal(readFileSync(join(root, 'scss/_variables.scss'), 'utf8'), before)
  const tpl = readFileSync(join(root, 'scss/template.scss'), 'utf8')
  assert.match(tpl, /darken\(#dee2e6, 10%\)/)
  for (const line of tpl.split('\n')) assert.ok(!/^\s*\$[\w-]+\s*:.*var\(/.test(line), line)
})

test('9. a variant class reads the corner its base class sets (.btn-primary, .badge-primary)', () => {
  const s = scanTemplate(writeFixture(KINETIC_T4))
  const missing = s.findings.filter((f) => f.class === 'missing').map((f) => f.selector)
  assert.ok(!missing.includes('.badge-primary'), missing.join(', '))
  assert.ok(!missing.includes('.btn-primary'), missing.join(', '))
  assert.ok(missing.includes('.chip'), 'a chip with no corner anywhere is still missing')
})

test('skips: vendor and minified files by name and content, generated files, a bundled Bootstrap', () => {
  const s = scanTemplate(writeFixture(KINETIC_SKIPS))
  // a header that only warns ("DO NOT edit … from here") and a comment naming Bootstrap are kept
  assert.deepEqual(s.files, ['css/own.css', 'css/page-220.css'])
  const why = Object.fromEntries(s.skipped.map((x) => [x.file, x.reason]))
  assert.match(why['js/owl-carousel/owl.theme.default.min.css'], /minified|third-party/)
  assert.match(why['js/isotope.pkgd.min.js'], /minified|third-party/)
  assert.match(why['js/packed.js'], /minified/)
  assert.match(why['css/brand-artifact.css'], /generated/)
  assert.match(why['html/section-faq.php'], /generated/)
  assert.match(why['css/template.css'], /Bootstrap/)
})

test('fonts: a stack is sorted by the face it names; mono and icon stacks are kept', () => {
  const s = scanTemplate(writeFixture(KINETIC_T4))
  assert.equal(pick(s, T4, 27, '"IBM Plex Sans", system-ui, sans-serif'), 'auto --ds-font-body')
  assert.equal(pick(s, T4, 30, '"Space Grotesk", system-ui, sans-serif'), 'auto --ds-font-display')
  assert.equal(pick(s, T4, 55, '"JetBrains Mono", ui-monospace, monospace'), 'keep')
  assert.equal(pick(s, T4, 56, '"IBM Plex Sans", system-ui, sans-serif'), 'auto --ds-font-body')
  assert.equal(pick(s, T4, 57, '"Space Grotesk", system-ui, sans-serif'), 'auto --ds-font-display')
  assert.equal(pick(s, T4, 63, 'FontAwesome'), 'keep')
})

test('C. a text-white is never lost: `flagship` is not a flag, a language menu text is not a flag picture', () => {
  const s = scanTemplate(writeFixture(BUSINESS_EXTRA))
  const slide = find(s, 'src/components/kit/KitSlides.astro', 5, 'text-white')
  assert.ok(slide, 'KitSlides.astro:52 text-white is a finding')
  assert.notEqual(slide.class, 'keep', slide.reason)
  const toggle = find(s, 'src/components/islands/LanguageMenu.tsx', 2, 'text-white')
  assert.ok(toggle, 'LanguageMenu.tsx:153 text-white is a finding')
  assert.notEqual(toggle.class, 'keep', toggle.reason)
  assert.equal(
    pick(s, 'src/components/islands/LanguageMenu.tsx', 4, '#c8102e'),
    'keep',
    'the flag stays a picture'
  )
})

test('B. a full-bleed panel keeps its square corner: flagged, never sent to a corner role', () => {
  const s = scanTemplate(writeFixture(BUSINESS_EXTRA))
  const tsx = 'src/components/islands/ResourcesMenu.tsx'
  const mega = find(s, tsx, 5, 'rounded-none')
  assert.equal(mega.class, 'flag', 'the full-screen mega panel (ResourcesMenu.tsx:85)')
  assert.match(mega.reason, /full-bleed|edge/)
  assert.equal(pick(s, tsx, 8, 'rounded-none'), 'auto --ds-card-radius', 'a card is still a card')
  assert.equal(find(s, 'src/styles/global.css', 8, '0').class, 'flag', '.mega-panel fixed inset 0')
  assert.equal(pick(s, 'src/styles/global.css', 9, '0'), 'auto --ds-card-radius')
})

test('A. a `ds-keep: <reason>` marker on the line or the rule keeps a value, with that reason', () => {
  const s = scanTemplate(writeFixture(BUSINESS_EXTRA))
  const kept = (file, line, value) => {
    const f = find(s, file, line, value)
    assert.ok(f, `${file}:${line} ${value}`)
    assert.equal(f.class, 'keep', `${file}:${line} ${f.reason}`)
    return f.reason
  }
  assert.match(kept('src/styles/global.css', 1, '#7b2cbf'), /brand illustration/)
  assert.match(kept('src/styles/global.css', 3, '#333'), /print sheet colours/)
  assert.match(kept('src/styles/global.css', 6, '#c9c6be'), /perforation tint/)
  assert.match(kept('src/components/islands/ResourcesMenu.tsx', 10, 'text-[#7b2cbf]'), /illustration/)
  assert.match(kept('src/components/kit/KitSlides.astro', 7, 'text-[#5a5952]'), /cover photo/)
  // a marker with no reason keeps nothing: VARS-1 needs the reason
  assert.notEqual(find(s, 'src/components/islands/ResourcesMenu.tsx', 11, 'text-[#5a5952]').class, 'keep')
  const r = buildReport(s)
  const entry = r.hardcoded.find((h) => h.file === 'src/styles/global.css' && h.line === 1)
  assert.equal(entry.handled, true)
  assert.match(entry.reason, /^manual keep \(ds-keep\): brand illustration$/)
})
