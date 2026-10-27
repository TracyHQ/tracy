// Role-scan defects found on 15/10/2026: a font stack written over several lines crashed the scan
// (tracy-joomla-template, inspirations/airbnb.css), two variables renaming each other overflowed the
// stack (tracy-wordpress-theme: --wtb-page-ink and --wp--preset--color--fg), and a compiled stylesheet was skipped as a whole as
// the twin of its Sass source, so a literal only the compiled CSS carries (a stale or hand-edited
// build) was never counted.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scanTemplate } from '../src/role-scan/index.mjs'
import { buildReport } from '../src/role-scan/report.mjs'
import { writeFixture } from './role-scan-fixtures.mjs'

const XML = '<extension type="template"><name>sync_fixture</name><version>1.0.0</version></extension>\n'

test('a font stack over several lines is read whole, not a crash', () => {
  const root = writeFixture({
    'templateDetails.xml': XML,
    'css/template.css': `body {
  font-family: "Airbnb Cereal VF", Circular,
    -apple-system, system-ui, "Helvetica Neue", Roboto, sans-serif;
}
h1 { font-family: "Airbnb Cereal VF",
    sans-serif !important; }
`
  })
  const s = scanTemplate(root)
  const fonts = s.findings.filter((f) => f.valueType === 'font')
  assert.equal(fonts.length, 2)
  for (const f of fonts.filter((x) => x.class === 'auto')) {
    assert.match(
      f.replacement,
      /^var\(--ds-font-[\w-]+, "Airbnb Cereal VF",[\s\S]*sans-serif\)( !important)?$/
    )
    assert.equal(f.replacement.endsWith('!important'), f.text.endsWith('!important'))
  }
})

test('two variables renaming each other (an alias cycle) are read, not a stack overflow', () => {
  const root = writeFixture({
    'templateDetails.xml': XML,
    'css/template.css': `:root {
  --brand-prose: #1f2328;
  --page-ink: var(--preset-fg);
  --preset-fg: var(--brand-prose);
}
.dark {
  --preset-fg: var(--page-ink);
}
.print {
  --page-ink: #222222;
}
body { color: var(--page-ink); background: #ffffff; }
`
  })
  const s = scanTemplate(root)
  assert.ok(s.findings.some((f) => f.text === '#1f2328'))
})

/** Sass source and its compiled CSS: `.extra` exists only in the compiled file. */
const SASS = {
  'templateDetails.xml': XML,
  'scss/_variables.scss': '$gray-700: #495057;\n$line: #dee2e6;\n',
  'scss/template.scss': `@import "variables";
.hx-nav {
  a {
    color: $gray-700;
    background: #fff;
    border-color: darken($line, 10%);
  }
}
`,
  'css/template.css': `.hx-nav a {
  color: #495057;
  background: #fff;
  border-color: #c1c9d0;
}
.extra {
  color: #e11d48;
}
`
}

test('a compiled literal is a twin only when its source carries it; a stale one is counted', () => {
  const s = scanTemplate(writeFixture(SASS))
  const compiled = s.findings.filter((f) => f.file === 'css/template.css')
  const synced = compiled.filter((f) => f.selector === '.hx-nav a')
  assert.equal(synced.length, 3)
  for (const f of synced) assert.equal(f.twin, 'scss/template.scss', `${f.line} ${f.text}`)
  const stale = compiled.find((f) => f.text === '#e11d48')
  assert.ok(stale, 'the stale literal is a finding')
  assert.equal(stale.twin, undefined)
  assert.equal(stale.outOfSync, 'scss/template.scss')
  if (stale.class !== 'keep') assert.match(stale.reason, /compiled CSS out of sync with source/)
  const r = buildReport(s)
  assert.equal(r.totals.twin, 3)
  assert.equal(r.totals.outOfSync, 1)
  const entry = r.hardcoded.find((h) => h.value === '#e11d48')
  assert.equal(entry.outOfSync, 'scss/template.scss')
  assert.equal(r.totals.auto + r.totals.flag + r.totals.keep + r.totals.missing, s.findings.length - 3)
})

test('a rule no scanned source declares stays a twin when the source imports a framework outside the scan', () => {
  const tpl = `@import "variables";\n@import "../../../plugins/t4/scss/bootstrap";\n${SASS['scss/template.scss'].split('\n').slice(1).join('\n')}`
  const s = scanTemplate(writeFixture({ ...SASS, 'scss/template.scss': tpl }))
  const extra = s.findings.find((f) => f.text === '#e11d48')
  assert.equal(extra.twin, 'scss/template.scss')
  assert.equal(extra.outOfSync, undefined)
})

test('a hand-edited value behind a plain Sass variable is out of sync; a source map decides the line, unless it is stale there', () => {
  const css = '.hx-nav a {\n  color: #ff0000;\n  background: #fff;\n  border-color: #c1c9d0;\n}\n'
  // line 2 (`color`) maps to template.scss line 4; line 3 (`background`) maps to line 4 too, which
  // declares another property (a stale map), so it is matched by selector; line 4 maps to line 6
  const map = {
    version: 3,
    sources: ['../scss/template.scss'],
    mappings: ';AAGI;AAAA;AAEA'
  }
  const s = scanTemplate(
    writeFixture({ ...SASS, 'css/template.css': css, 'css/template.css.map': JSON.stringify(map) })
  )
  const at = (text) => s.findings.find((f) => f.file === 'css/template.css' && f.text === text)
  assert.equal(at('#ff0000').outOfSync, 'scss/template.scss', '$gray-700 is #495057, not #ff0000')
  assert.equal(at('#fff').twin, 'scss/template.scss', 'stale map line: found by selector')
  assert.equal(at('#c1c9d0').twin, 'scss/template.scss', 'computed by darken()')
})
