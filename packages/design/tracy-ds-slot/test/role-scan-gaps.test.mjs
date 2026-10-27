// The four gaps of the role scan closed on 15/10/2026: the ground set on a PARENT element, components
// that read no corner role at all (`missing`), WordPress theme.json, and a Tailwind 3 config.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { classAttr } from '../src/role-scan/class-attr.mjs'
import { applyAutoConverts, scanTemplate } from '../src/role-scan/index.mjs'
import { elementTree, isDetached } from '../src/role-scan/markup-tree.mjs'
import { buildReport } from '../src/role-scan/report.mjs'
import { tailwindTheme } from '../src/role-scan/tailwind-config.mjs'
import { GROUND, MISSING, TAILWIND3, THEME_JSON } from './role-scan-gap-fixtures.mjs'
import { writeFixture } from './role-scan-fixtures.mjs'

const pick = (scan, file, line, value) => {
  const f = scan.findings.find((x) => x.file === file && x.line === line && x.text === value)
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
/** --write, then a second scan finds no auto finding and a second --write changes no byte. */
const idempotent = (root) => {
  const first = applyAutoConverts(root, scanTemplate(root))
  assert.ok(first.replaced > 0)
  const after = snapshot(root)
  const again = scanTemplate(root)
  assert.equal(again.findings.filter((f) => f.class === 'auto').length, 0)
  assert.equal(applyAutoConverts(root, again).replaced, 0)
  assert.deepEqual(snapshot(root), after)
  return again
}

test('markup tree: parents, generics are not tags, an element built into a variable is detached', () => {
  const text =
    'const a = useState<string>(x)\nreturn (<div class="bg-ink"><p>{x && <b class="y" />}</p></div>)'
  const els = elementTree(text)
  assert.deepEqual(
    els.map((e) => [e.name, e.parent === -1 ? null : els[e.parent].name]),
    [
      ['div', null],
      ['p', 'div'],
      ['b', 'p']
    ]
  )
  const tsx = '<div>{xs.map((x) => {\n  const inner = <i />\n  return <u>{inner}</u>\n})}</div>'
  const t = elementTree(tsx)
  assert.deepEqual(
    t.filter((e) => e.name !== 'div').map((e) => [e.name, isDetached(tsx, t, e)]),
    [
      ['i', true],
      ['u', false]
    ]
  )
  assert.deepEqual(classAttr(' class:list={["a b", on && "bg-ink", c ? "x" : "y"]}'), {
    always: ['a', 'b'],
    sometimes: ['bg-ink', 'x', 'y'],
    unknown: false,
    present: true
  })
  assert.equal(classAttr(' className={cn("a", className)}').unknown, true)
})

test('gap 1: light text pairs with the ground of a parent element, a wrapper or a stylesheet class', () => {
  const s = scanTemplate(writeFixture(GROUND))
  const page = 'src/views/Page.astro'
  assert.equal(pick(s, page, 8, 'text-white'), 'auto --ds-c-on-ink', 'parent <footer class="bg-ink">')
  assert.equal(
    pick(s, page, 13, 'text-white'),
    'auto --ds-c-on-ink',
    'through <Band> (bg-ink around its slot) and <Plain>'
  )
  assert.equal(pick(s, page, 15, 'text-white'), 'auto --ds-c-on-ink', '.band-ink paints var(--color-ink)')
  assert.equal(
    pick(s, page, 18, 'text-white'),
    'auto --ds-c-accent-on',
    '--color-primary names signal as the accent'
  )
  assert.equal(pick(s, page, 20, 'dark:text-white'), 'auto --ds-c-on-ink')
  assert.equal(
    pick(s, 'src/components/Cards.tsx', 6, 'text-white'),
    'auto --ds-c-on-ink',
    'returned, not assigned'
  )
  // conservative: never guessed
  for (const [file, line, why] of [
    [page, 11, /role is unclear \(bg-forest\)/],
    [page, 12, /under a condition/],
    [page, 14, /prop or lookup/],
    [page, 16, /picture or gradient/],
    [page, 19, /changes with the screen/],
    ['src/components/Cards.tsx', 5, /built into a variable/]
  ]) {
    const f = s.findings.find((x) => x.file === file && x.line === line && x.text === 'text-white')
    assert.equal(f.class, 'flag', `${file}:${line}`)
    assert.match(f.reason, why)
  }
  assert.notEqual(pick(s, page, 17, 'text-[#14171a]'), 'auto --ds-c-on-ink', 'dark text on ink does not pair')
  idempotent(writeFixture(GROUND))
})

test('gap 2: a component that should read a corner and declares none is a `missing` finding', () => {
  const s = scanTemplate(writeFixture(MISSING))
  const missing = s.findings.filter((f) => f.class === 'missing').map((f) => `${f.file}:${f.line} ${f.role}`)
  assert.deepEqual(missing, [
    'src/styles/global.css:1 --ds-btn-radius',
    'src/styles/global.css:3 --ds-pill-radius',
    'src/styles/global.css:5 --ds-card-radius',
    'src/styles/global.css:7 --ds-input-radius',
    'src/views/Form.astro:2 --ds-input-radius',
    'src/views/Form.astro:9 --ds-btn-radius',
    'src/views/Form.astro:10 --ds-input-radius'
  ])
  const r = buildReport(s)
  const spot = r.hardcoded.find((h) => h.class === 'missing')
  assert.deepEqual(
    [spot.property, spot.value, spot.role, spot.handled, typeof spot.why],
    ['border-radius', undefined, '--ds-btn-radius', false, 'string']
  )
  assert.equal(r.totals.missing, 7)
  assert.equal(r.unresolved, r.totals.auto + r.totals.flag + 7 + r.missingRoles.length)
  // --write never invents a corner: the missing findings stay, everything else converts
  const root = writeFixture(MISSING)
  applyAutoConverts(root, scanTemplate(root))
  assert.equal(scanTemplate(root).findings.filter((f) => f.class === 'missing').length, 7)
})

test('gap 3: theme.json palette, fonts, corners and element/block styles, rewritten as valid JSON', () => {
  const s = scanTemplate(writeFixture(THEME_JSON))
  assert.deepEqual(
    [s.meta.platform, s.meta.template, s.meta.version],
    ['wordpress', 'fixture-block', '2.0.1']
  )
  const j = 'theme.json'
  assert.equal(pick(s, j, 6, '#ffffff'), 'auto --ds-c-bg')
  assert.equal(pick(s, j, 7, '#111111'), 'auto --ds-c-fg', 'contrast: read by the root text')
  assert.equal(pick(s, j, 8, '#da5a2a'), 'auto --ds-c-accent')
  assert.equal(
    pick(s, j, 13, String.raw`\"Inter\", sans-serif`),
    'auto --ds-font-body',
    'the root style reads it'
  )
  assert.equal(pick(s, j, 14, 'Georgia, serif'), 'auto --ds-font-display', 'only headings read it')
  assert.equal(pick(s, j, 17, '6px'), 'auto --ds-btn-radius')
  assert.equal(pick(s, j, 23, '#ffffff'), 'auto --ds-c-accent-on', 'button text on the primary preset')
  assert.equal(pick(s, j, 23, '4px'), 'auto --ds-btn-radius')
  assert.equal(pick(s, j, 25, '#da5a2a'), 'auto --ds-c-accent-text')
  assert.equal(pick(s, j, 29, '2px'), 'auto --ds-input-radius', 'core/search')
  assert.ok(!s.findings.some((f) => /var:preset/.test(f.text)), 'a preset reference is not a literal')
  const root = writeFixture(THEME_JSON)
  idempotent(root)
  const doc = JSON.parse(readFileSync(join(root, 'theme.json'), 'utf8'))
  assert.equal(doc.settings.color.palette[0].color, 'var(--ds-c-bg, #ffffff)')
  assert.equal(doc.settings.typography.fontFamilies[0].fontFamily, 'var(--ds-font-body, "Inter", sans-serif)')
  assert.equal(doc.styles.elements.button.border.radius, 'var(--ds-btn-radius, 4px)')
  assert.equal(doc.styles.typography.fontFamily, 'var:preset|font-family|inter', 'references untouched')
})

test('gap 4: a Tailwind 3 config is read statically; its colours and corners get their own value', () => {
  const theme = tailwindTheme(TAILWIND3['tailwind.config.js'])
  assert.deepEqual(Object.fromEntries(theme.colours), {
    brand: '#da5a2a',
    'brand-dark': '#b8481f',
    ink: '#14171a',
    paper: '#f5f3ee'
  })
  assert.equal(theme.radius.get('card'), '12px')
  assert.equal(theme.radius.get('DEFAULT'), '0.25rem', 'extend keeps the default scale')
  const s = scanTemplate(writeFixture(TAILWIND3))
  assert.equal(s.meta.tailwind, 3)
  const f = 'src/index.html'
  assert.equal(pick(s, f, 3, 'bg-brand'), 'auto --ds-c-accent')
  assert.equal(pick(s, f, 3, 'hover:bg-brand-dark'), 'auto --ds-c-accent-hover')
  assert.equal(pick(s, f, 3, 'rounded'), 'auto --ds-btn-radius')
  assert.equal(pick(s, f, 4, 'rounded-card'), 'auto --ds-card-radius')
  assert.equal(pick(s, f, 2, 'text-white'), 'auto --ds-c-on-ink')
  assert.equal(pick(s, f, 5, 'bg-brand/50'), 'flag', 'an opacity modifier cannot ride a var() class')
  assert.equal(pick(s, f, 6, 'text-slate-500'), 'flag', 'an imported palette is not read')
  const root = writeFixture(TAILWIND3)
  idempotent(root)
  const html = readFileSync(join(root, f), 'utf8').split('\n')
  assert.equal(
    html[2],
    '<button class="bg-[color:var(--ds-c-accent,#da5a2a)] hover:bg-[color:var(--ds-c-accent-hover,#b8481f)] rounded-[var(--ds-btn-radius,0.25rem)] px-3 text-[color:var(--ds-c-accent-on,#fff)]">Go</button>'
  )
  assert.equal(html[3], '<div class="card rounded-[var(--ds-card-radius,12px)] border">y</div>')
})
