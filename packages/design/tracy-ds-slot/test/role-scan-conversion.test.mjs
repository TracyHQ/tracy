// The role-scan defects met while converting Tracy Business Joomla and the two WordPress themes to the
// role variables (15/10/2026), each pinned on the fixtures `JOOMLA` and `WORDPRESS`.
import assert from 'node:assert/strict'
import { cpSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { applyAutoConverts, scanTemplate } from '../src/role-scan/index.mjs'
import { buildReport } from '../src/role-scan/report.mjs'
import { writeFixture } from './role-scan-fixtures.mjs'
import { JOOMLA, WORDPRESS } from './role-scan-conversion-fixtures.mjs'

const J = scanTemplate(writeFixture(JOOMLA))
const W = scanTemplate(writeFixture(WORDPRESS))
const find = (s, file, line, text) => {
  const f = s.findings.find(
    (x) => x.file === file && x.line === line && (text === undefined || x.text === text)
  )
  assert.ok(f, `no finding ${file}:${line} ${text ?? ''}`)
  return f
}
const at = (s, file, line, text) => {
  const f = find(s, file, line, text)
  return `${f.class} ${f.role ?? ''}`.trim()
}

test('joomla 1: a required role the template never reads fails the report, as VARS-1 does', () => {
  const r = buildReport(W)
  assert.ok(r.missingRoles.includes('--ds-c-heading'))
  assert.ok(r.missingRoles.includes('--ds-c-disabled-bg'))
  assert.equal(r.unresolved, r.totals.auto + r.totals.flag + r.totals.missing + r.missingRoles.length)
})

test('joomla 2: framework-made stylesheets are handled through the root variables, never rewritten', () => {
  for (const [file, line, text] of [
    ['tpl/theme.tpl.css', 1, '#222222'],
    ['tpl/theme.tpl.css', 1, '__body_font_family'],
    ['css/theme.css', 1, '#222222'],
    ['css/template.css', 2, '#f8f9fa']
  ]) {
    const f = find(J, file, line, text)
    assert.equal(f.class, 'keep', `${file} ${text}`)
    assert.ok(f.framework, `${file} ${text}: framework origin`)
  }
  // one finding per framework root variable the template never maps (--t4-body-bg is mapped through
  // --tb-page, --t4-primary is not)
  const unmapped = J.findings.filter((f) => f.class === 'flag' && f.reason.startsWith('framework variable'))
  assert.deepEqual(
    unmapped.map((f) => f.name),
    ['--t4-primary']
  )
  const root = writeFixture(JOOMLA)
  applyAutoConverts(root, scanTemplate(root))
  for (const f of ['tpl/theme.tpl.css', 'css/theme.css', 'css/template.css', 'css/tokens.css'])
    assert.equal(readFileSync(join(root, f), 'utf8'), JOOMLA[f], f)
})

test('joomla 3: the ink family: words on the ink read on-ink, a line there is flagged, --tb-ink as words is no ground', () => {
  assert.equal(at(J, 'css/site.css', 4, '#8a8780'), 'auto --ds-c-on-ink', '--tb-ink-meta')
  assert.equal(at(J, 'css/site.css', 3, '#14171a'), 'auto --ds-c-fg', '--tb-ink painted as words and lines')
  const line = find(J, 'css/site.css', 11, '#2a2e32')
  assert.deepEqual([line.class, line.candidates], ['flag', ['--ds-c-on-ink']], '.band-ink .rule')
})

test('joomla 4: a class that only names a page part is no status (.page-info, .error-code)', () => {
  assert.equal(at(J, 'css/site.css', 12, '#6b6a64'), 'auto --ds-c-muted')
  assert.equal(at(J, 'css/site.css', 13, '#14171a'), 'auto --ds-c-fg')
})

test('joomla 5: a border in the colour of its own ground takes the ground role', () => {
  const both = J.findings.filter((f) => f.file === 'css/site.css' && f.line === 14 && f.text === '#14171a')
  assert.deepEqual(
    both.map((f) => `${f.prop} ${f.role}`),
    ['background --ds-c-ink', 'border --ds-c-ink']
  )
})

test('joomla 6: a corner set per side reads the role on its rounded corners only', () => {
  assert.equal(
    find(J, 'css/site.css', 15, '0 0 5px 5px').replacement,
    '0 0 var(--ds-card-radius, 5px) var(--ds-card-radius, 5px)'
  )
})

test('joomla 7-10: a shadow variable, @font-face, directory blockers, a field cornered by a generic input rule', () => {
  assert.match(at(J, 'css/site.css', 5), /^keep/, '--elev-raised holds a shadow')
  assert.equal(J.findings.filter((f) => f.file === 'css/site.css' && f.line === 16).length, 0, '@font-face')
  assert.ok(J.skipped.some((s) => s.file === 'html/index.html'))
  assert.equal(J.findings.filter((f) => f.class === 'missing' && /search-input/.test(f.selector)).length, 0)
})

test('wordpress 1-3: theme.json css strings are read past their escapes, a keep marker counts in its value only', () => {
  const css = W.findings.filter((f) => f.file === 'theme.json' && f.line === 12)
  assert.deepEqual(
    css.map((f) => `${f.class} ${f.text}`),
    [
      'auto #111111',
      'flag \\"Inter\\", sans-serif',
      'auto #222222',
      'auto #101214',
      'keep #333333',
      'auto #444444'
    ]
  )
  const root = writeFixture(WORDPRESS)
  applyAutoConverts(root, scanTemplate(root))
  const doc = JSON.parse(readFileSync(join(root, 'theme.json'), 'utf8'))
  assert.match(doc.styles.css, /\.d \{ color: var\(--ds-c-fg, #444444\); \}/)
})

test('wordpress 4-6: brand constants by their name, :not() is not the element, a fallback takes its variable role', () => {
  assert.equal(at(W, 'assets/site.css', 2, '#f5f3ee'), 'auto --ds-c-bg', '--brand-paper')
  assert.equal(at(W, 'assets/site.css', 3, '#242830'), 'auto --ds-c-fg', '--brand-prose')
  assert.notEqual(at(W, 'assets/site.css', 4, '#ffffff'), 'auto --ds-c-accent', '--brand-header')
  assert.equal(at(W, 'assets/site.css', 10, '4px'), 'auto --ds-input-radius')
  assert.equal(at(W, 'assets/site.css', 11, '#dcd7cc'), 'auto --ds-c-border', 'the preset border role')
})

test('wordpress 7-11: Tailwind properties, unused variables, light-dark() whole, black and white tints', () => {
  assert.match(at(W, 'assets/site.css', 13, '#fff'), /^keep/)
  assert.match(at(W, 'assets/site.css', 5, '#abcdef'), /^keep/, 'never read')
  assert.equal(
    find(W, 'assets/site.css', 15).replacement,
    'var(--ds-c-heading, light-dark(#14171a, #eceae4))'
  )
  const tint = find(W, 'assets/site.css', 16)
  assert.deepEqual(tint.candidates, ['--ds-c-border-soft', '--ds-c-border'])
  const shadow = J.findings.find((f) => f.name === '--elev-raised')
  assert.equal(shadow.class, 'keep')
})

test('joomla 2, real T4 build: the framework lines of Tracy Business template.css are handled, never rewritten', () => {
  // Tracy Business Joomla as released (1.2.4, cut from the role-variables overlay): template.css + its .map,
  // compiled by T4's Sass
  const real = join(
    import.meta.dirname,
    '../../../cms/tracy-joomla-quickstart/template-patches/tracy_business'
  )
  const root = writeFixture({})
  cpSync(real, root, { recursive: true })
  const s = scanTemplate(root)
  const fw = s.findings.filter((f) => f.framework)
  assert.ok(fw.length > 500, `framework lines: ${fw.length}`)
  assert.ok(fw.every((f) => f.class === 'keep' && f.reason.startsWith('framework:')))
  // every framework root variable left unmapped is ONE finding, never one per literal
  const unmapped = s.findings
    .filter((f) => (f.reason ?? '').startsWith('framework variable'))
    .map((f) => f.name)
  assert.equal(new Set(unmapped).size, unmapped.length)
  applyAutoConverts(root, s)
  // a rewrite elsewhere on the file moves offsets, never lines: each framework literal is still on its line
  const lines = readFileSync(join(root, 'css/template.css'), 'utf8').split('\n')
  for (const f of fw) {
    const line = lines[f.line - 1]
    const at = line.indexOf(f.text)
    assert.ok(at !== -1 && !/var\(--ds-[\w-]+, $/.test(line.slice(0, at)), `${f.line} ${f.text}`)
  }
})

test('ds-not-used: a stylesheet comment or theme.config.json roleReads.notUsed, each with a reason', () => {
  const root = writeFixture({
    ...WORDPRESS,
    'assets/notes.css':
      '/* ds-not-used: --ds-c-ink, --ds-c-on-ink — this theme has no ink band */\n/* ds-not-used: --ds-c-bg — refused */\n/* ds-not-used: --ds-c-meta */\n',
    'theme.config.json': JSON.stringify({
      roleReads: { notUsed: { '--ds-c-accent-band': 'no accent band' } }
    })
  })
  const r = buildReport(scanTemplate(root))
  assert.deepEqual(
    r.notUsed.map((n) => n.name),
    ['--ds-c-ink', '--ds-c-on-ink', '--ds-c-accent-band']
  )
  assert.equal(r.notUsed[0].reason, 'this theme has no ink band')
  assert.deepEqual(r.notUsedRefused, ['--ds-c-bg'])
  for (const n of ['--ds-c-ink', '--ds-c-on-ink']) assert.ok(!r.missingRoles.includes(n), n)
  assert.ok(r.missingRoles.includes('--ds-c-bg'), 'the page ground is always required')
})
