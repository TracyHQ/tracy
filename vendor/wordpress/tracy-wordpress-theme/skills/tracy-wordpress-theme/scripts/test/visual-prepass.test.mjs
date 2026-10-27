// prepass.mjs: what the measured design contract says is written into the theme overlay once,
// before round 0 — tokens, the type scale, section and container spacing as CSS — into the three
// files it declares, idempotently, and never a partial update.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { apply, contractCss, revert, REGION_BEGIN, REGION_END, validateMap, withRegion, WP_VAR } from '../visual/prepass.mjs'
import { parseTokensCss, TOKEN_NAMES, tokensFromContract } from '../theme-tokens.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TOOL = path.resolve(HERE, '..', 'visual', 'prepass.mjs')
const FX = path.join(HERE, 'fixtures', 'visual-prepass')
const APPLE = path.join(HERE, 'fixtures', 'theme-tokens', 'apple.tokens.css')
const contract = () => JSON.parse(readFileSync(path.join(FX, 'design-contract.json'), 'utf8'))
const map = () => JSON.parse(readFileSync(path.join(FX, 'prepass.map.json'), 'utf8'))
const measuredOf = (c) => new Map(tokensFromContract(c, { variant: 'desktop-light' }).provenance.filter((p) => p.source === 'measured').map((p) => [p.name, p]))

/** A fresh copy of the fixture overlay, and the CLI run against it. */
function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'prepass-'))
  const overlay = path.join(root, 'overlay')
  cpSync(path.join(FX, 'overlay'), overlay, { recursive: true })
  const run = (extra = [], { mapFile = path.join(FX, 'prepass.map.json'), fallback = APPLE } = {}) =>
    spawnSync(process.execPath, [TOOL, '--contract', path.join(FX, 'design-contract.json'), '--overlay', overlay, '--fallback', fallback, '--map', mapFile, ...extra], { encoding: 'utf8' })
  const files = () => Object.fromEntries(['tokens.css', 'theme.config.json', 'theme.overlay.json'].map((f) => [f, existsSync(path.join(overlay, f)) ? readFileSync(path.join(overlay, f), 'utf8') : null]))
  return { root, overlay, run, files }
}

test('prepass css: the type scale, rhythm and container become preset variables; phone values go under the map query', () => {
  const r = contractCss(contract(), map(), { measured: measuredOf(contract()) })
  const decl = (rule, width, property) => r.rules.find((x) => x.rule === rule)?.declarations.find((d) => d.width === width && d.property === property)?.value
  assert.equal(decl('body-type', 'desktop', 'font-family'), `var(${WP_VAR['--font-body']})`)
  assert.equal(decl('body-type', 'desktop', 'font-size'), `var(${WP_VAR['--text-base']})`)
  assert.equal(decl('body-type', 'desktop', 'line-height'), `var(${WP_VAR['--leading-body']})`)
  assert.equal(decl('body-type', 'desktop', 'letter-spacing'), 'normal', 'no tracking is not the display tracking')
  assert.equal(decl('heading-h1', 'desktop', 'font-size'), `var(${WP_VAR['--text-4xl']})`)
  assert.equal(decl('heading-h1', 'phone', 'font-size'), '28px')
  assert.equal(decl('section-rhythm', 'desktop', 'padding-top'), 'var(--wp--custom--section-y--desktop)')
  assert.equal(decl('section-rhythm', 'phone', 'padding-bottom'), 'var(--wp--custom--section-y--phone)')
  assert.equal(decl('container', 'desktop', 'max-width'), 'var(--wp--custom--container--max)')
  assert.equal(decl('container', 'desktop', 'padding-left'), 'var(--wp--custom--container--gutter-desktop)')
  assert.equal(decl('container', 'phone', 'max-width'), 'none')
  assert.equal(decl('container', 'phone', 'padding-left'), undefined, 'the same gutter at 390 is not repeated')
  assert.match(r.css, /@media \(max-width: 781px\) \{\n {2}\.wp-block-post-content h1 \{\n {4}font-size: 28px;/)
  assert.doesNotMatch(r.css, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'no colour outside the palette')
})

test('prepass css: a colour is a preset only when the preset is also the dark value; everything else is named, not written', () => {
  const r = contractCss(contract(), map(), { measured: measuredOf(contract()) })
  const why = (rule, property) => r.unsupported.find((u) => u.rule === rule && u.property === property)?.reason ?? ''
  // body text: --fg in light and the dark --fg measurement in dark
  assert.equal(r.rules.find((x) => x.rule === 'body-colors').declarations.find((d) => d.property === 'color').value, 'var(--wp--preset--color--fg)')
  // white hero text is --bg by value in light and would turn dark with the page
  assert.match(why('hero-title', 'color'), /#ffffff is preset .*--bg.* but #f1f3f6 in dark/)
  assert.equal(r.rules.find((x) => x.rule === 'hero-title').declarations.some((d) => d.property === 'color'), false)
  assert.match(why('footer-band', 'color'), /no measured palette preset/)
  assert.match(why('btn-primary', 'transitionDuration'), /not a property the pre-pass writes/)
})

test('prepass css: a rule the map does not name is reported; two rules asking one selector for different values is refused', () => {
  const m = map()
  delete m.rules['heading-h2']
  const r = contractCss(contract(), m, { measured: measuredOf(contract()) })
  assert.match(r.unsupported.find((u) => u.rule === 'heading-h2').reason, /not in the map/)
  const clash = { ...map(), rules: { ...map().rules, 'heading-h2': '.wp-block-post-content h1' } }
  assert.throws(() => contractCss(contract(), clash, { measured: measuredOf(contract()) }), /contradiction: \.wp-block-post-content h1 desktop font-size/)
})

test('prepass map: unknown rules, selectors that could end the rule, and bad media queries are errors', () => {
  const errs = validateMap({ rules: { nope: 'body', 'heading-h1': 'h1 } body { color: red' }, media: { phone: 'max-width: 781px', desktop: '(x)' }, extra: 1 }, contract())
  assert.equal(errs.length, 5, errs.join('\n'))
  assert.deepEqual(validateMap(map(), contract()), [])
})

test('prepass region: replaced in place, appended once, and broken markers refuse', () => {
  const region = `${REGION_BEGIN} x */\na{}\n${REGION_END}`
  assert.equal(withRegion('', region), region)
  const once = withRegion('html{}', region)
  assert.equal(once, `html{}\n\n${region}`)
  const edited = once.replace('a{}', 'b{}') + '\nfooter{}'
  assert.equal(withRegion(edited, region), `${once}\nfooter{}`)
  assert.throws(() => withRegion(`${region}\n${region}`, region), /2 begin and 2 end/)
  assert.throws(() => withRegion(`${REGION_BEGIN} */`, region), /1 begin and 0 end/)
})

test('prepass CLI: a config that wears rootVariation is refused until adopted, and nothing is written', () => {
  const w = workspace()
  const before = w.files()
  const r = w.run()
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stderr, /rootVariation "apple".*--adopt-root-tokens/)
  assert.deepEqual(w.files(), before)
})

test('prepass CLI: one run writes the measured tokens, wires rootTokens and the managed CSS; a second run changes no byte', () => {
  const w = workspace()
  const report = path.join(w.root, 'report.json')
  const r = w.run(['--adopt-root-tokens', '--report', report])
  assert.equal(r.status, 0, r.stderr)
  const f = w.files()
  const tokens = parseTokensCss(f['tokens.css'])
  assert.deepEqual(TOKEN_NAMES.filter((n) => !(n in tokens)), [])
  assert.equal(tokens['--font-body'], '"Inter Tight"')
  assert.equal(tokens['--text-base'], '16px')
  assert.equal(tokens['--leading-body'], '1.5')
  assert.equal(tokens['--container-max'], '1320px')
  assert.equal(tokens['--container-gutter-desktop'], '16px')
  assert.equal(tokens['--section-y-desktop'], '128px')
  assert.equal(tokens['--section-y-phone'], '32px')
  const config = JSON.parse(f['theme.config.json'])
  assert.equal(config.rootTokens, 'tokens.css')
  assert.equal('rootVariation' in config, false)
  assert.deepEqual(Object.keys(config), ['slug', 'themeName', 'textDomain', 'variations', 'rootTokens', 'updateSlug'], 'rootTokens takes rootVariation’s place')
  const ov = JSON.parse(f['theme.overlay.json'])
  assert.ok(ov.styles.css.startsWith('html { color-scheme: light dark; }\nhtml[data-theme="dark"]'), 'the hand-written CSS is kept, in front')
  assert.equal(ov.styles.css.split(REGION_BEGIN).length, 2)
  assert.deepEqual(ov.templateParts, [{ name: 'header', area: 'header' }])
  const rep = JSON.parse(readFileSync(report, 'utf8'))
  assert.deepEqual(rep.writeSet.map((p) => path.basename(p)), ['tokens.css', 'theme.config.json', 'theme.overlay.json'])
  assert.ok(rep.files.every((x) => x.changed && x.after.startsWith('sha256:')))
  assert.equal(rep.config.adoptedFrom, 'apple')
  assert.ok(rep.tokens.measured.length > 0 && rep.tokens.fallback.length > 0)
  assert.ok(rep.css.unsupported.some((u) => u.rule === 'hero-title'))

  const mtimes = ['tokens.css', 'theme.config.json', 'theme.overlay.json'].map((n) => statSync(path.join(w.overlay, n)).mtimeMs)
  const again = w.run(['--report', report])
  assert.equal(again.status, 0, again.stderr)
  assert.deepEqual(w.files(), f)
  assert.deepEqual(['tokens.css', 'theme.config.json', 'theme.overlay.json'].map((n) => statSync(path.join(w.overlay, n)).mtimeMs), mtimes, 'an unchanged file is not rewritten')
  assert.match(again.stdout, /0 changed/)
  assert.equal(JSON.parse(readFileSync(report, 'utf8')).files.filter((x) => x.changed).length, 0)
})

test('prepass CLI: an edit inside the region is replaced, one outside it is kept', () => {
  const w = workspace()
  assert.equal(w.run(['--adopt-root-tokens']).status, 0)
  const first = w.files()['theme.overlay.json']
  const ov = JSON.parse(first)
  ov.styles.css = ov.styles.css.replace('font-weight: 500;', 'font-weight: 900;') + '\n.after { margin: 0; }'
  writeFileSync(path.join(w.overlay, 'theme.overlay.json'), JSON.stringify(ov, null, 2))
  assert.equal(w.run().status, 0)
  const css = JSON.parse(w.files()['theme.overlay.json']).styles.css
  assert.equal(css, `${JSON.parse(first).styles.css}\n.after { margin: 0; }`)
})

test('prepass CLI: a tokens.css the tools did not write is refused unless --replace-tokens', () => {
  const w = workspace()
  writeFileSync(path.join(w.overlay, 'tokens.css'), ':root { --accent: #ff0000; }\n')
  const before = w.files()
  const r = w.run(['--adopt-root-tokens'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /not written by theme-tokens\.mjs\/prepass\.mjs.*--replace-tokens/)
  assert.deepEqual(w.files(), before)
  const ok = w.run(['--adopt-root-tokens', '--replace-tokens'])
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(ok.stdout, /--accent #ff0000 → #1d4ed8/)
})

test('prepass CLI: a write target that is a symlink is refused and the file it points at is untouched', () => {
  const w = workspace()
  const outside = path.join(w.root, 'elsewhere.json')
  writeFileSync(outside, readFileSync(path.join(w.overlay, 'theme.overlay.json')))
  unlinkSync(path.join(w.overlay, 'theme.overlay.json'))
  symlinkSync(outside, path.join(w.overlay, 'theme.overlay.json'))
  const before = readFileSync(outside, 'utf8')
  const r = w.run(['--adopt-root-tokens'])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /a symlink/)
  assert.equal(readFileSync(outside, 'utf8'), before)
  assert.equal(existsSync(path.join(w.overlay, 'tokens.css')), false)
})

test('prepass CLI: a contradictory map is refused with nothing written; an invalid one or an incomplete fallback is a usage error', () => {
  const w = workspace()
  const before = w.files()
  const clash = path.join(w.root, 'clash.json')
  writeFileSync(clash, JSON.stringify({ ...map(), rules: { ...map().rules, 'heading-h2': '.wp-block-post-content h1' } }))
  const r = w.run(['--adopt-root-tokens'], { mapFile: clash })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /contradiction/)
  assert.deepEqual(w.files(), before)
  const bad = path.join(w.root, 'bad.json')
  writeFileSync(bad, JSON.stringify({ rules: { ghost: 'body' } }))
  assert.equal(w.run(['--adopt-root-tokens'], { mapFile: bad }).status, 2)
  const half = path.join(w.root, 'half.tokens.css')
  writeFileSync(half, ':root { --bg: #fff; }\n')
  const h = w.run(['--adopt-root-tokens'], { fallback: half })
  assert.equal(h.status, 2)
  assert.match(h.stderr, /not a complete token file/)
  assert.deepEqual(w.files(), before)
})

test('prepass CLI: --dry-run reports what would change and writes nothing; the report may not land in the overlay', () => {
  const w = workspace()
  const before = w.files()
  const r = w.run(['--adopt-root-tokens', '--dry-run'])
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /would change .*tokens\.css/)
  assert.deepEqual(w.files(), before)
  const inside = w.run(['--adopt-root-tokens', '--report', path.join(w.overlay, 'r.json')])
  assert.equal(inside.status, 2)
  assert.deepEqual(w.files(), before)
})

test('prepass CLI: a --report that is a symlink into the overlay, or has no directory, is refused before anything is written', () => {
  const w = workspace()
  const before = w.files()
  const link = path.join(w.root, 'report.json')
  symlinkSync(path.join(w.overlay, 'theme.config.json'), link)
  const viaLink = w.run(['--adopt-root-tokens', '--report', link])
  assert.equal(viaLink.status, 2, viaLink.stderr)
  assert.match(viaLink.stderr, /is a symlink/)
  assert.deepEqual(w.files(), before, 'the file the link points at is untouched, and nothing else was applied')
  const noDir = w.run(['--adopt-root-tokens', '--report', path.join(w.root, 'nowhere', 'report.json')])
  assert.equal(noDir.status, 2, noDir.stderr)
  assert.match(noDir.stderr, /directory does not exist/)
  assert.deepEqual(w.files(), before)
})

test('prepass CLI: a report directory that cannot be written stops the run with the overlay untouched', { skip: process.getuid?.() === 0 && 'root writes anywhere' }, () => {
  const w = workspace()
  const before = w.files()
  const dir = path.join(w.root, 'locked')
  mkdirSync(dir)
  chmodSync(dir, 0o500)
  try {
    const r = w.run(['--adopt-root-tokens', '--report', path.join(dir, 'report.json')])
    assert.equal(r.status, 1, r.stderr)
    assert.match(r.stderr, /cannot be written, nothing applied/)
    assert.deepEqual(w.files(), before)
  } finally {
    chmodSync(dir, 0o700)
  }
})

test('prepass revert: the changed files are put back, a file that did not exist is removed', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'prepass-revert-'))
  const a = path.join(root, 'a.txt')
  const b = path.join(root, 'b.txt')
  const c = path.join(root, 'c.txt')
  writeFileSync(a, 'new')
  writeFileSync(b, 'x')
  writeFileSync(c, 'same')
  revert([
    { path: a, name: 'a.txt', before: Buffer.from('old'), after: Buffer.from('new'), changed: true },
    { path: b, name: 'b.txt', before: null, after: Buffer.from('x'), changed: true },
    { path: c, name: 'c.txt', before: Buffer.from('other'), after: Buffer.from('same'), changed: false }
  ])
  assert.equal(readFileSync(a, 'utf8'), 'old')
  assert.equal(existsSync(b), false)
  assert.equal(readFileSync(c, 'utf8'), 'same', 'an unchanged file is not touched')
})

test('prepass apply: a write that fails puts back the files already written', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'prepass-apply-'))
  const a = path.join(root, 'a.txt')
  writeFileSync(a, 'old')
  const writes = [
    { path: a, name: 'a.txt', before: Buffer.from('old'), after: Buffer.from('new'), changed: true },
    { path: path.join(root, 'missing-dir', 'b.txt'), name: 'b.txt', before: null, after: Buffer.from('x'), changed: true }
  ]
  assert.throws(() => apply(writes))
  assert.equal(readFileSync(a, 'utf8'), 'old')
})
