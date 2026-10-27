// The packaging-time role scan (src/role-scan): every hard-coded colour, corner and font stack of a
// template sorted into auto / flag / keep, the auto ones rewritten with the template's own value as
// the fallback, idempotent, and reported in the shape the /ops rule VARS-1 reads.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { declarationsOf } from '../src/role-scan/css-lexer.mjs'
import { applyAutoConverts, scanTemplate } from '../src/role-scan/index.mjs'
import { coloursIn, parseColour } from '../src/role-scan/literals.mjs'
import { buildReport } from '../src/role-scan/report.mjs'
import { ROLE_SCAN_REPORT_SCHEMA, isRoleVariable } from '../src/role-variables.mjs'
import { EMDASH, JOOMLA, writeFixture } from './role-scan-fixtures.mjs'

const CLI = fileURLToPath(new URL('../scripts/role-scan.mjs', import.meta.url))
const at = (scan, file, line, value) => {
  const f = scan.findings.find((x) => x.file === file && x.line === line && x.text === value)
  assert.ok(f, `no finding ${file}:${line} ${value}`)
  return f
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

test('the lexer gives each declaration its selector, side and value offsets', () => {
  const css =
    'a{color:#111}\nhtml[data-theme="dark"] .x:hover { color: #eee; background: url(a;b.png) }\n@media (min-width:1px){.y{border:1px solid #ccc}}'
  const d = declarationsOf(css)
  assert.deepEqual(
    d.map((x) => [x.prop, x.selector, x.scheme]),
    [
      ['color', 'a', 'light'],
      ['color', 'html[data-theme="dark"] .x:hover', 'dark'],
      ['background', 'html[data-theme="dark"] .x:hover', 'dark'],
      ['border', '.y', 'light']
    ]
  )
  for (const x of d) assert.equal(css.slice(x.start, x.end), x.value)
})

test('colour literals: hex, rgb, hsl, names; a role read and an image are not literals', () => {
  assert.deepEqual(parseColour('#abc'), { hex: '#aabbcc', alpha: 1 })
  assert.equal(parseColour('rgba(218, 90, 42, 0.1)').alpha, 0.1)
  assert.equal(parseColour('hsl(0 100% 50%)').hex, '#ff0000')
  const { colours, declared } = coloursIn(
    'var(--ds-c-accent-on, #fff) #000 url("x.svg#a") light-dark(#fff, #111)',
    'text'
  )
  assert.deepEqual(declared, ['--ds-c-accent-on'])
  assert.deepEqual(
    colours.map((c) => [c.text, c.arm]),
    [
      ['#000', null],
      ['#fff', 'light'],
      ['#111', 'dark']
    ]
  )
})

test('EmDash fixture (real Tracy Business patterns): each class and role', () => {
  const s = scanTemplate(writeFixture(EMDASH))
  const role = (file, line, value) => {
    const f = at(s, file, line, value)
    return `${f.class} ${f.role ?? ''}`.trim()
  }
  // auto: clear roles
  assert.equal(role('src/styles/tokens.css', 6, '#f5f3ee'), 'auto --ds-c-bg')
  assert.equal(role('src/styles/tokens.css', 7, '#edeae2'), 'auto --ds-c-surface-warm')
  assert.equal(role('src/styles/tokens.css', 8, '#ffffff'), 'auto --ds-c-surface')
  assert.equal(role('src/styles/tokens.css', 18, '#2e7d32'), 'auto --ds-c-success')
  assert.equal(role('src/styles/tokens.css', 19, '#e9f2e9'), 'auto --ds-c-success-bg')
  assert.equal(role('src/styles/tokens.css', 20, '#7a2016'), 'auto --ds-c-danger-text')
  assert.equal(role('src/styles/tokens.css', 22, '#ffffff'), 'auto --ds-c-accent-on')
  assert.equal(
    role('src/styles/tokens.css', 26, '#15181a'),
    'auto --ds-c-bg',
    'the dark side takes the same role'
  )
  assert.equal(
    role('src/styles/tokens.css', 2, 'var(--font-archivo), system-ui, sans-serif'),
    'auto --ds-font-body'
  )
  assert.equal(role('src/styles/global.css', 8, '#fff'), 'auto --ds-c-on-ink', 'chip-active: white on ink')
  assert.equal(
    role('src/styles/global.css', 11, '#fff'),
    'auto --ds-c-on-ink',
    'chip-active:hover finds the ground of .chip-active'
  )
  assert.equal(
    role('src/styles/global.css', 13, '#fff'),
    'auto --ds-c-accent-on',
    '::selection on the accent'
  )
  assert.equal(
    role('src/styles/global.css', 14, '#7fbfa6'),
    'auto --ds-c-accent-text',
    'dark link underline = the dark link colour'
  )
  assert.equal(role('src/styles/global.css', 18, '0'), 'auto --ds-btn-radius')
  assert.equal(role('src/styles/global.css', 19, '0'), 'auto --ds-input-radius')
  assert.equal(role('src/components/CtaBox.astro', 5, 'text-[#F5F3EE]'), 'auto --ds-c-on-ink')
  assert.equal(role('src/components/CtaBox.astro', 6, 'text-white'), 'auto --ds-c-on-ink')
  assert.equal(role('src/components/ResourcesMenu.tsx', 3, 'rounded-none'), 'auto --ds-card-radius')
  assert.equal(role('src/components/ui/button.tsx', 1, 'rounded-md'), 'auto --ds-btn-radius')
  // flag: not guessed
  for (const [file, line, value] of [
    ['src/styles/tokens.css', 4, '0px'],
    ['src/styles/tokens.css', 11, 'rgba(218, 90, 42, 0.1)'],
    ['src/styles/tokens.css', 17, '#bfd4cb'],
    ['src/styles/global.css', 17, '#7b2cbf'],
    ['src/components/CtaBox.astro', 7, 'text-white'],
    ['src/components/ResourcesMenu.tsx', 4, 'text-[#C9C6BE]']
  ]) {
    const f = at(s, file, line, value)
    assert.equal(f.class, 'flag', `${file}:${line} ${value}`)
    assert.ok(
      f.candidates.length && f.candidates.every(isRoleVariable),
      `${file}:${line} candidates ${f.candidates}`
    )
  }
  // keep: not a role
  assert.equal(role('src/components/LanguageMenu.tsx', 2, '#c8102e'), 'keep')
  assert.equal(role('src/components/CtaBox.astro', 10, '#000'), 'keep')
  assert.equal(role('src/styles/global.css', 16, 'rgba(20, 23, 26, 0.2)'), 'keep')
  assert.equal(role('src/styles/tokens.css', 23, 'rgba(20, 23, 26, 0.22)'), 'keep')
  assert.equal(role('src/styles/tokens.css', 5, '#ffffff'), 'keep')
  // an existing role read is declared, not reported
  assert.ok(s.declared.includes('--ds-c-accent-on'))
  assert.ok(!s.findings.some((f) => f.file === 'src/styles/global.css' && f.line === 3))
})

test('compiled CSS and LESS of a JoomlArt template: palette by use, one-offs and brand art kept apart', () => {
  const s = scanTemplate(writeFixture(JOOMLA))
  assert.deepEqual([s.meta.platform, s.meta.template, s.meta.version], ['joomla', 'ja_fixture', '2.1.0'])
  const role = (line, value, n = 0) => {
    const f = s.findings.filter((x) => x.file === 'css/template.css' && x.line === line && x.text === value)[
      n
    ]
    assert.ok(f, `css/template.css:${line} ${value}`)
    return `${f.class} ${f.role ?? ''}`.trim()
  }
  assert.equal(role(1, '#fff'), 'auto --ds-c-bg')
  assert.equal(role(1, '#333'), 'auto --ds-c-fg')
  assert.equal(role(1, '#e74c3c'), 'auto --ds-c-accent-text')
  assert.equal(role(2, '#e74c3c'), 'auto --ds-c-accent')
  assert.equal(role(2, '#fff'), 'auto --ds-c-accent-on')
  assert.equal(role(2, '4px'), 'auto --ds-btn-radius')
  assert.equal(role(2, '#c0392b'), 'auto --ds-c-accent-hover')
  assert.equal(role(3, '#f5f5f5'), 'auto --ds-c-surface-warm')
  assert.equal(role(3, '#777'), 'auto --ds-c-meta')
  assert.equal(role(4, '#dff0d8'), 'auto --ds-c-success-bg')
  assert.equal(role(4, '#3c763d'), 'auto --ds-c-success-text')
  assert.equal(role(5, '#e74c3c'), 'keep', 'the logo')
  assert.equal(role(5, '#3b5998'), 'keep', 'a social brand colour')
  assert.equal(role(5, '#8e44ad'), 'flag', 'a one-off saturated fill is not the accent')
  assert.equal(role(6, '#fff'), 'auto --ds-c-on-ink')
  assert.ok(
    !s.findings.some((f) => f.file === 'less/variables.less' && f.line === 3),
    'a LESS comment paints nothing'
  )
  // a LESS variable feeds LESS functions: flagged with its role as the first candidate, never rewritten
  const linkVar = at(s, 'less/variables.less', 1, '#e74c3c')
  assert.equal(linkVar.class, 'flag')
  assert.equal(linkVar.candidates[0], '--ds-c-accent-text')
})

test('--write: rewritten output keeps the template value as the fallback', () => {
  const root = writeFixture(EMDASH)
  applyAutoConverts(root, scanTemplate(root))
  const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8').split('\n')
  assert.equal(css[7], '\tcolor: var(--ds-c-on-ink, #fff);')
  assert.equal(
    css[17],
    '.ec-form-submit { background: var(--color-signal); color: var(--ds-c-accent-on, #fff); border-radius: var(--ds-btn-radius, 0); }'
  )
  assert.equal(css[16], '.hero-badge { background: #7b2cbf; }', 'a flagged value is never rewritten')
  const tokens = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8').split('\n')
  assert.equal(tokens[5], '\t--color-paper: var(--ds-c-bg, #f5f3ee);')
  assert.equal(tokens[1], '\t--font-sans: var(--ds-font-body, var(--font-archivo), system-ui, sans-serif);')
  const astro = readFileSync(join(root, 'src/components/CtaBox.astro'), 'utf8').split('\n')
  assert.equal(astro[4], '\t<h2 class="text-[color:var(--ds-c-on-ink,#F5F3EE)]">{t}</h2>')
  assert.equal(
    astro[5],
    '\t<span class="bg-ink text-[color:var(--ds-c-on-ink,var(--color-white))]">{t}</span>'
  )
  const tsx = readFileSync(join(root, 'src/components/ResourcesMenu.tsx'), 'utf8')
  assert.match(tsx, /className="rounded-\[var\(--ds-card-radius,0px\)\] border bg-card p-2"/)
  const btn = readFileSync(join(root, 'src/components/ui/button.tsx'), 'utf8')
  assert.match(btn, /rounded-\[var\(--ds-btn-radius,var\(--radius-md,0\.375rem\)\)\]/)
})

test('--write is idempotent: a second run finds no auto finding and changes no byte', () => {
  for (const fx of [EMDASH, JOOMLA]) {
    const root = writeFixture(fx)
    const first = applyAutoConverts(root, scanTemplate(root))
    assert.ok(first.replaced > 0)
    const after = snapshot(root)
    const again = scanTemplate(root)
    assert.equal(again.findings.filter((f) => f.class === 'auto').length, 0)
    const second = applyAutoConverts(root, again)
    assert.equal(second.replaced, 0)
    assert.deepEqual(snapshot(root), after)
  }
})

test('the report has the VARS-1 shape; the CLI --check fails while anything is unresolved', () => {
  const root = writeFixture(EMDASH)
  const r = buildReport(scanTemplate(root), { now: new Date('2026-10-15T10:00:00Z') })
  assert.equal(r.schema, ROLE_SCAN_REPORT_SCHEMA)
  assert.deepEqual(
    [r.template, r.platform, r.version, r.scannedAt],
    ['emdash-theme-fixture', 'emdash', '1.0.0', '2026-10-15T10:00:00.000Z']
  )
  for (const h of r.hardcoded) {
    assert.ok(h.file && Number.isInteger(h.line) && h.line >= 1 && h.component, JSON.stringify(h))
    assert.equal(h.handled, h.class === 'keep')
    if (h.handled) assert.ok(h.reason)
    if (h.class === 'auto') assert.ok(isRoleVariable(h.role) && h.replacement)
  }
  assert.equal(r.unresolved, r.totals.auto + r.totals.flag + r.totals.missing + r.missingRoles.length)
  const run = (...a) => spawnSync(process.execPath, [CLI, root, ...a], { encoding: 'utf8' })
  const check = run('--check', '--out', join(root, 'report.json'))
  assert.equal(check.status, 1)
  const write = run('--write', '--out', join(root, 'report.json'))
  const line = JSON.parse(write.stdout.split('\n')[0])
  assert.equal(line.auto, 0)
  assert.equal(line.unresolved, line.flag + line.missing + line.missingRoles)
  const written = JSON.parse(readFileSync(join(root, 'report.json'), 'utf8'))
  assert.ok(written.declared.includes('--ds-c-bg') && written.declared.includes('--ds-btn-radius'))
  assert.ok(written.hardcoded.every((h) => h.class !== 'auto'))
  assert.equal(run('--check').status, line.unresolved ? 1 : 0)
})
