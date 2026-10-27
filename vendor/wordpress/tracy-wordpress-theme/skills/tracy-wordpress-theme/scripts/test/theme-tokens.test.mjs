// theme-tokens.mjs: a design contract's measured rules become the 56-token tokens.css the theme
// generator accepts as a root look, every token answered and its origin written down.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  colorValue,
  parseTokensCss,
  renderTokensCss,
  ROLE_MAP,
  spacingUnit,
  TOKEN_NAMES,
  tokensFromContract
} from '../theme-tokens.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TOOL = path.resolve(HERE, '..', 'theme-tokens.mjs')
const EXAMPLE = path.resolve(HERE, '..', '..', 'examples', 'design-contract.json')
const APPLE = path.join(HERE, 'fixtures', 'theme-tokens', 'apple.tokens.css')
const apple = () => parseTokensCss(readFileSync(APPLE, 'utf8'))

/** examples/design-contract.json, parsed fresh — the minimal valid contract, four variants. */
const fixtureDesign = () => JSON.parse(readFileSync(EXAMPLE, 'utf8'))

test('the contract is the 56 names, and the role map covers every one of them', () => {
  assert.equal(TOKEN_NAMES.length, 56)
  assert.deepEqual(Object.keys(ROLE_MAP).filter((n) => !n.startsWith('--space-')).sort(), [...TOKEN_NAMES].filter((n) => !n.startsWith('--space-')).sort())
})

test('the fallback parser reads a vendored tokens.css past its comments, first declaration winning', () => {
  const map = apple()
  assert.equal(Object.keys(map).length, 56)
  assert.deepEqual(TOKEN_NAMES.filter((n) => !(n in map)), [])
  assert.equal(map['--accent'], '#0071e3')
  assert.equal(map['--elev-ring'], '0 0 0 1px var(--border)')
  assert.equal(parseTokensCss(':root {\n  --a: 1px; /* x */\n}\n@media (x) {\n  :root {\n    --a: 2px;\n  }\n}\n')['--a'], '1px')
})

test('computed values are normalised to the vendored shape', () => {
  assert.equal(colorValue('rgb(200, 16, 46)'), '#c8102e')
  assert.equal(colorValue('rgba(0, 0, 0, 0.5)'), '#00000080')
  assert.equal(colorValue('rgba(0, 0, 0, 0)'), null)
  assert.equal(colorValue('#FFF'), '#ffffff')
  assert.equal(colorValue('transparent'), null)
  const c = fixtureDesign()
  c.rules = [
    {
      id: 'body',
      category: 'typography',
      selector: 'body',
      styles: Object.fromEntries(
        c.variants.map((v) => [v.id, { fontSize: '17px', lineHeight: '25px', fontFamily: 'Inter, sans-serif' }])
      )
    },
    {
      id: 'heading',
      category: 'typography',
      selector: 'h1',
      styles: Object.fromEntries(
        c.variants.map((v) => [v.id, { fontSize: '56px', lineHeight: '58.8px', letterSpacing: '-0.84px' }])
      )
    },
    {
      id: 'button',
      category: 'component',
      selector: '.btn-primary',
      styles: Object.fromEntries(
        c.variants.map((v) => [
          v.id,
          {
            backgroundColor: 'rgb(200, 16, 46)',
            color: 'rgb(255, 255, 255)',
            borderRadius: '9999px',
            transitionDuration: '0.2s',
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
          }
        ])
      )
    },
    { id: 'layout', category: 'layout', selector: 'main', styles: Object.fromEntries(c.variants.map((v) => [v.id, { paddingLeft: '24px' }])) },
    { id: 'colors', category: 'color', selector: '.card', styles: Object.fromEntries(c.variants.map((v) => [v.id, { backgroundColor: '#f4f4f4' }])) }
  ]
  const { tokens, provenance } = tokensFromContract(c, { fallback: apple() })
  assert.equal(tokens['--text-base'], '17px')
  assert.equal(tokens['--leading-body'], '1.47')
  assert.equal(tokens['--font-body'], 'Inter, sans-serif')
  assert.equal(tokens['--text-4xl'], '56px')
  assert.equal(tokens['--leading-tight'], '1.05')
  assert.equal(tokens['--tracking-display'], '-0.015em')
  assert.equal(tokens['--accent'], '#c8102e')
  assert.equal(tokens['--accent-on'], '#ffffff')
  assert.equal(tokens['--radius-pill'], '9999px')
  assert.equal(tokens['--radius-md'], apple()['--radius-md'], 'a capsule button is not a corner radius')
  assert.equal(tokens['--motion-base'], '200ms')
  assert.equal(tokens['--ease-standard'], 'cubic-bezier(0.4, 0, 0.2, 1)')
  assert.equal(tokens['--surface'], '#f4f4f4')
  assert.equal(tokens['--space-1'], '6px', 'unit: gcd(24) = 24 → 12 → 6')
  assert.equal(tokens['--space-12'], '72px')
  assert.equal(provenance.find((p) => p.name === '--radius-md').source, 'fallback')
  assert.match(provenance.find((p) => p.name === '--leading-tight').detail, /rule heading \(h1\) lineHeight/)
})

test('the spacing unit is the gcd of every spacing value, halved down to 6px or less, or nothing', () => {
  const rule = (id, styles) => ({ id, styles })
  assert.deepEqual(spacingUnit([rule('a', { padding: '16px 24px' }), rule('b', { gap: '32px' })]), {
    unit: 4,
    values: [16, 24, 32],
    rules: ['a', 'b']
  })
  assert.equal(spacingUnit([rule('a', { paddingTop: '40px' })]).unit, 5)
  assert.equal(spacingUnit([rule('a', { paddingTop: '15px' }), rule('b', { margin: '27px' })]).unit, 3)
  assert.equal(spacingUnit([rule('a', { paddingTop: '15px' }), rule('b', { margin: '16px' })]), null)
  assert.equal(spacingUnit([rule('a', { paddingTop: '0px', color: 'red' })]), null)
})

test('a token the contract declares by its contract name wins over any rule', () => {
  const c = fixtureDesign()
  for (const v of c.variants) c.tokens[v.id] = { '--space': '16px', '--accent': '#123456', '--space-4': '20px' }
  const { tokens, provenance } = tokensFromContract(c, { fallback: apple() })
  assert.equal(tokens['--accent'], '#123456')
  assert.equal(tokens['--space-4'], '20px')
  assert.equal(tokens['--space-2'], '8px', 'the rest of the scale still derives')
  assert.equal(provenance.find((p) => p.name === '--accent').detail, 'contract tokens.desktop-light')
})

test('the example contract with the apple fallback answers all 56, and says which 13 were measured', () => {
  const contract = JSON.parse(readFileSync(EXAMPLE, 'utf8'))
  const { tokens, provenance, missing } = tokensFromContract(contract, { fallback: apple(), fallbackLabel: 'apple' })
  assert.deepEqual(missing, [])
  assert.equal(Object.keys(tokens).length, 56)
  const measured = provenance.filter((p) => p.source === 'measured').map((p) => p.name)
  assert.deepEqual(measured, [
    '--fg',
    '--text-4xl',
    '--space-1',
    '--space-2',
    '--space-3',
    '--space-4',
    '--space-5',
    '--space-6',
    '--space-8',
    '--space-12',
    '--radius-md',
    '--container-gutter-desktop',
    '--container-gutter-phone'
  ])
  assert.equal(tokens['--text-4xl'], '40px')
  assert.equal(tokens['--radius-md'], '12px')
  assert.equal(tokens['--container-gutter-phone'], '16px')
  assert.equal(tokens['--container-max'], '1024px')
  assert.equal(provenance.filter((p) => p.source === 'fallback').length, 43)
  // without a fallback the same contract leaves 43 holes, named
  const bare = tokensFromContract(contract)
  assert.equal(bare.missing.length, 43)
  assert.ok(bare.missing.includes('--accent'))
  assert.throws(() => tokensFromContract(contract, { variant: 'tv-light' }), /variant tv-light is not in the contract \(it has desktop-light, /)
})

test('the written file reads back through the generator rules: 56 tokens, provenance in comments only', () => {
  const contract = JSON.parse(readFileSync(EXAMPLE, 'utf8'))
  const result = tokensFromContract(contract, { fallback: apple(), fallbackLabel: 'apple/tokens.css' })
  const css = renderTokensCss(result, { contractId: 'example', revision: 1, variant: 'desktop-light', contractPath: 'x.json', fallbackPath: APPLE })
  const back = parseTokensCss(css)
  assert.equal(Object.keys(back).length, 56)
  for (const n of TOKEN_NAMES) assert.equal(back[n], result.tokens[n], n)
  assert.match(css, /^ {2}--fg: +#ffffff; \/\* measured \*\/$/m)
  assert.match(css, /^ {2}--bg: +#ffffff; \/\* fallback \*\/$/m)
  assert.match(css, /\* measured \(13\):\n \* {3}--fg +rule colors \(body\) color/)
  assert.match(css, /\* fallback \(43\):\n \* {3}--bg +apple\/tokens\.css/)
})

test('CLI: refuses without a fallback and writes nothing; writes 56 with one; names a bad variant', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tt-'))
  const out = path.join(dir, 'tokens.css')
  const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' })
  const refused = run('--contract', EXAMPLE, '--out', out)
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /43 tokens have neither a measurement nor a fallback: --bg, /)
  assert.match(refused.stderr, /pass --fallback/)
  assert.ok(!existsSync(out))
  const ok = run('--contract', EXAMPLE, '--out', out, '--fallback', APPLE)
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /56 tokens, 13 measured, 43 from the fallback/)
  assert.equal(Object.keys(parseTokensCss(readFileSync(out, 'utf8'))).length, 56)
  const bad = run('--contract', EXAMPLE, '--out', out, '--fallback', APPLE, '--variant', 'tv-light')
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /variant tv-light is not in the contract/)
  const usage = run('--contract', EXAMPLE)
  assert.equal(usage.status, 2)
  assert.match(usage.stderr, /^usage: theme-tokens\.mjs/)
  const partial = run('--contract', EXAMPLE, '--out', out, '--fallback', EXAMPLE)
  assert.equal(partial.status, 2)
  assert.match(partial.stderr, /not a complete token file, missing --bg/)
})
