import assert from 'node:assert/strict'
import { test } from 'node:test'
import { colourVars } from '../src/tokens56.mjs'
import { accentAliases, darkArms, normHex, tokenizeCss } from '../src/tokenize.mjs'

const palette = {
  bg: '#FFFFFF',
  fg: '#2B2420',
  accent: '#C2562F',
  'accent-hover': '#A6451F',
  border: '#E5DCD0'
}

test('a palette hex reads the slot, falling back to itself', () => {
  const r = tokenizeCss('.a{color:#2b2420;background:#fff;border:1px solid #E5DCD0}', palette)
  assert.equal(
    r.css,
    '.a{color:var(--ds-c-fg, #2b2420);background:var(--ds-c-bg, #fff);border:1px solid var(--ds-c-border, #E5DCD0)}'
  )
  assert.equal(r.replaced, 3)
})

test('the role follows the property: white is the page as a fill, never as text', () => {
  const r = tokenizeCss('.hero{color:#fff}', palette)
  assert.equal(r.css, '.hero{color:#fff}')
  assert.equal(r.kept['#ffffff'], 1)
})

test('accent as text is the readable accent; hover takes the hover pair', () => {
  const r = tokenizeCss('a{color:#C2562F}a:hover{color:#C2562F}', palette)
  assert.equal(
    r.css,
    'a{color:var(--ds-c-accent-text, #C2562F)}a:hover{color:var(--ds-c-accent-text-hover, #C2562F)}'
  )
})

test('a variable the contract names (varRoles) takes its role wherever it is declared', () => {
  // JA Titan's dark mode: its title grey is a palette line colour, its panel grey no palette colour
  const css =
    '.dark-active{--t4-gray-900:#E5DCD0;--t4-gray-100:#1b1b1b;--other:#E5DCD0}.dark-active .x{--t4-gray-900:#2b2420}'
  const r = tokenizeCss(css, palette, {
    varRoles: { '--t4-gray-900': 'fg-2', '--t4-gray-100': 'surface', '--bad': 'nope' }
  })
  assert.equal(
    r.css,
    '.dark-active{--t4-gray-900:var(--ds-c-fg-2, #E5DCD0);--t4-gray-100:var(--ds-c-surface, #1b1b1b);--other:var(--ds-c-border, #E5DCD0)}.dark-active .x{--t4-gray-900:var(--ds-c-fg-2, #2b2420)}'
  )
})

test('a T4 style-template placeholder the contract names reads the slot; T4 fills it in as before', () => {
  const css =
    'body{background-color:__color_white;color:__body_text_color;background-image:url(__body_bg_img)}a:hover{color:__link_hover_color}.btn-secondary{background-color:__color_secondary !important}.bg-dark{background-color:__color_dark !important}.x{color:__color_info}'
  const r = tokenizeCss(css, palette, {
    t4Placeholders: {
      __color_white: 'bg',
      __body_text_color: 'fg',
      __link_hover_color: 'accent-hover',
      __color_secondary: 'accent',
      __color_dark: 'fg-2'
    }
  })
  assert.equal(
    r.css,
    'body{background-color:var(--ds-c-bg, __color_white);color:var(--ds-c-fg, __body_text_color);background-image:url(__body_bg_img)}a:hover{color:var(--ds-c-accent-text-hover, __link_hover_color)}.btn-secondary{background-color:var(--ds-c-accent, __color_secondary) !important}.bg-dark{background-color:__color_dark !important}.x{color:__color_info}'
  )
})

test('a T4 placeholder used in two roles reads one per kind of property; a kind it does not name keeps T4’s value', () => {
  const css =
    ':root{--primary:__color_primary}.btn{background-color:__color_primary;border-color:__color_primary}h2{color:__color_primary}.x{fill:__color_primary}'
  const r = tokenizeCss(css, palette, {
    t4Placeholders: {
      __color_primary: { fill: 'accent', line: 'accent', text: 'fg-2' },
      __color_bad: { fill: 'nope' },
      __color_other: { colour: 'fg' }
    }
  })
  assert.equal(
    r.css,
    ':root{--primary:__color_primary}.btn{background-color:var(--ds-c-accent, __color_primary);border-color:var(--ds-c-accent, __color_primary)}h2{color:var(--ds-c-fg-2, __color_primary)}.x{fill:__color_primary}'
  )
})

test('text on an accent fill is the accent’s own text', () => {
  const r = tokenizeCss('.btn{background-color:#c2562f;color:#fff !important}', palette)
  assert.equal(
    r.css,
    '.btn{background-color:var(--ds-c-accent, #c2562f);color:var(--ds-c-accent-on, #fff) !important}'
  )
})

test('media queries, data URIs, font faces and unknown hexes are left alone', () => {
  const css =
    '@media (max-width:600px){.a{color:#2B2420}}.i{background:url("data:image/svg+xml;utf8,<svg fill=\'%23C2562F\'/>")}.z{color:#123456}@font-face{font-family:x}'
  const r = tokenizeCss(css, palette)
  assert.match(r.css, /@media \(max-width:600px\)\{\.a\{color:var\(--ds-c-fg, #2B2420\)\}\}/)
  assert.match(r.css, /data:image\/svg/)
  assert.match(r.css, /\.z\{color:#123456\}/)
})

test('a custom property takes the role its name points at', () => {
  const r = tokenizeCss(
    ':root{--voy-on-primary:#FFFFFF;--voy-bg:#FFFFFF;--voy-primary:#C2562F;--x:#E5DCD0}',
    palette
  )
  assert.match(r.css, /--voy-on-primary:#FFFFFF/) // white is no text role here
  assert.match(r.css, /--voy-bg:var\(--ds-c-bg, #FFFFFF\)/)
  assert.match(r.css, /--voy-primary:var\(--ds-c-accent, #C2562F\)/)
  assert.match(r.css, /--x:var\(--ds-c-border, #E5DCD0\)/)
})

test('running twice changes nothing more', () => {
  const once = tokenizeCss('.a{color:#2b2420}', palette).css
  assert.equal(tokenizeCss(once, palette).css, once)
})

test('hex forms', () => {
  assert.equal(normHex('#ABC'), '#aabbcc')
  assert.equal(normHex('#aabbccff'), '#aabbcc')
  assert.equal(normHex('#aabbcc80'), null)
})

test('a worn system defines every --ds-c-* the tokenizer writes', () => {
  const v = colourVars({ colours: {} }, (n) => `var(--${n})`)
  for (const r of ['bg', 'fg', 'accent-on', 'border', 'accent-text', 'accent-text-hover'])
    assert.ok(v[`--ds-c-${r}`], r)
})

test('the dark look’s colours take the same roles', () => {
  const dark = { bg: '#15110E', fg: '#E8DFD4', accent: '#D86A3F' }
  const r = tokenizeCss('html.t4-dark body{background:#15110e;color:#e8dfd4}html.t4-dark a{color:#D86A3F}', [
    palette,
    dark
  ])
  assert.equal(
    r.css,
    'html.t4-dark body{background:var(--ds-c-bg, #15110e);color:var(--ds-c-fg, #e8dfd4)}html.t4-dark a{color:var(--ds-c-accent-text, #D86A3F)}'
  )
})

test('an inverse band keeps the template’s colour; a page fill pairs its own text', () => {
  const light = { bg: '#ffffff', 'surface-warm': '#121316', surface: '#fafafa', fg: '#333333' }
  const r = tokenizeCss(
    '.hero{background:#121316;color:#f1f3f6}.box{background:#fafafa;color:#123456}',
    light
  )
  assert.equal(
    r.css,
    '.hero{background:#121316;color:#f1f3f6}.box{background:var(--ds-c-surface, #fafafa);color:var(--ds-c-fg, #123456)}'
  )
})

test('page width: the box or its content carries it on desktop; a phone is the viewport less gutters', async () => {
  const { score } = await import('../src/probe.mjs')
  const exp = { 'container.contentWidth': ['width', 1200] }
  const view = (contentWidth, boxWidth) => ({ roles: { container: { contentWidth, boxWidth } } })
  assert.equal(score(view(1140, 1200), exp, 'desktop').ok, 1)
  assert.equal(score(view(1200, 1260), exp, 'desktop').ok, 1)
  assert.equal(score(view(1140, 1140), exp, 'desktop').ok, 0)
  assert.equal(score(view(350, 390), exp, 'phone').ok, 1)
  assert.equal(score(view(300, 390), exp, 'phone').ok, 0)
})

test('computed colours in both forms a browser writes, color-mix() included', async () => {
  const { channels } = await import('../src/probe.mjs')
  assert.deepEqual(channels('color(srgb 0.716784 0.708078 0.702275)'), [183, 181, 179, 1])
  assert.deepEqual(channels('rgba(10, 20, 30, 0.5)'), [10, 20, 30, 0.5])
  assert.deepEqual(channels('color(srgb 1 0 0 / 0.25)'), [255, 0, 0, 0.25])
  assert.deepEqual(channels('transparent'), [])
})

test('a system as wide as the viewport fills it', async () => {
  const { score } = await import('../src/probe.mjs')
  const exp = { 'container.contentWidth': ['width', 1440] }
  assert.equal(score({ roles: { container: { contentWidth: 1376, boxWidth: 1440 } } }, exp, 'desktop').ok, 1)
  assert.equal(score({ roles: { container: { contentWidth: 1176, boxWidth: 1240 } } }, exp, 'desktop').ok, 0)
})

test('a shared palette without a page is judged against the template’s page', () => {
  const r = tokenizeCss('.band{background:#161b18}', [{ bg: '#fbfcfa' }, { 'surface-warm': '#161b18' }])
  assert.equal(r.css, '.band{background:#161b18}')
})

test('text kept on a kept ground is not left behind; text whose ground followed is', async () => {
  const { follows } = await import('../src/probe.mjs')
  const before = {
    a: ['rgb(255,255,255)', null, null, 'image'],
    b: ['rgb(10,10,10)', null, null, 'rgb(250,250,250)']
  }
  const after = {
    a: ['rgb(255,255,255)', null, null, 'image'],
    b: ['rgb(10,10,10)', null, null, 'rgb(20,20,20)']
  }
  const r = follows(before, after, ['#336699'])
  assert.equal(r.samples, 1)
  assert.equal(r.left, 1)
})

test('follows leaves out what the contract keeps as the template paints it, and says how much (ROLE-1, 15/10/2026)', async () => {
  const { follows, paintProbe } = await import('../src/probe.mjs')
  // a kept band (a fifth entry, 1) keeps its white fill under a dark system: neither followed nor left behind
  const before = {
    band: [null, 'rgb(255,255,255)', null, null, 1],
    card: [null, 'rgb(255,255,255)', null, null],
    cta: [null, 'rgb(40,90,200)', null, null]
  }
  const after = {
    band: [null, 'rgb(255,255,255)', null, null, 1],
    card: [null, 'rgb(255,255,255)', null, null],
    cta: [null, 'rgb(17,17,17)', null, null]
  }
  const r = follows(before, after, ['#111111'])
  assert.deepEqual([r.samples, r.left, r.kept, r.rate], [2, 1, 1, 0.5])
  // nothing kept: every paint is read, as before
  assert.equal(follows({ a: before.card }, { a: after.card }, ['#111111']).kept, 0)
  // the probe names the kept scopes and the calls to action inside them that are still read
  const src = paintProbe({ within: ['.hero', '.jv-header'], scored: ['a.btn.btn-primary'] })
  assert.match(src, /const KEPT = ".hero, .jv-header"/)
  assert.match(src, /const SCORED = "a.btn.btn-primary"/)
  assert.match(paintProbe(), /const KEPT = ""/)
})

test('accent painted as text through a variable reads the readable accent; fills keep it', () => {
  const r = tokenizeCss(
    'a{color:var(--wp--preset--color--accent)}.b{background:var(--wp--preset--color--accent)}a:hover{color:var(--wp--preset--color--accent)}',
    palette,
    { accentVars: ['--wp--preset--color--accent'] }
  )
  assert.equal(
    r.css,
    'a{color:var(--ds-c-accent-text, var(--wp--preset--color--accent))}.b{background:var(--wp--preset--color--accent)}a:hover{color:var(--ds-c-accent-text-hover, var(--wp--preset--color--accent))}'
  )
})

test('rules inside a kept inverse band stay the template’s own', () => {
  const r = tokenizeCss('.t3-footer a{color:#C2562F}.t3-footer-x a{color:#C2562F}', palette, {
    keepScopes: ['.t3-footer']
  })
  assert.equal(r.css, '.t3-footer a{color:#C2562F}.t3-footer-x a{color:var(--ds-c-accent-text, #C2562F)}')
})

test('an accent variable already read through the slot is not wrapped twice', () => {
  const o = { accentVars: ['--wp--preset--color--accent'] }
  const once = tokenizeCss('a{color:var(--wp--preset--color--accent)}', palette, o).css
  assert.equal(tokenizeCss(once, palette, o).css, once)
})

test('a rule that keeps its fill literal keeps its text literal: the pair stays', () => {
  const r = tokenizeCss('.fb{background:#3b5999;color:#2b2420}', palette)
  assert.equal(r.css, '.fb{background:#3b5999;color:#2b2420}')
})

test('a text colour no palette names takes a role by its contrast with the page', () => {
  const o = { classifyText: true }
  assert.match(tokenizeCss('h3{color:#111111}', palette, o).css, /var\(--ds-c-fg, #111111\)/)
  assert.match(tokenizeCss('p{color:#6f6f6f}', palette, o).css, /var\(--ds-c-muted, #6f6f6f\)/)
  assert.match(tokenizeCss('small{color:#999999}', palette, o).css, /var\(--ds-c-meta, #999999\)/)
  // white text on a light page is text for a dark band, not for the page
  assert.equal(tokenizeCss('.hero h1{color:#fafafa}', palette, o).css, '.hero h1{color:#fafafa}')
  // off unless the contract asks
  assert.equal(tokenizeCss('h3{color:#111111}', palette).css, 'h3{color:#111111}')
})

test('a kept band keeps its whole look, accent included', async () => {
  const { keepRules } = await import('../src/tokens56.mjs')
  const [rule] = keepRules(
    {
      keepScopes: ['.t4-section-6'],
      keepDefaults: { '--color-primary': '#1d3677' },
      runtime: { '--color-primary': 'var(--ds-c-accent)' }
    },
    ':root'
  )
  assert.match(rule, /--ds-c-accent:initial/)
  assert.match(rule, /--color-primary:#1d3677/)
})

test('a kept band resets every colour role the slot defines, so the template’s own colours win there', async () => {
  // JA Symphony's hero title and JA Donate's footer read --ds-c-heading / --ds-c-on-ink inside a kept
  // band: left out of the reset, they took Moxie's cream over the template's white (20/10/2026)
  const { keepRules } = await import('../src/tokens56.mjs')
  const { ROLE_VARIABLES } = await import('../src/role-variables.mjs')
  const [rule] = keepRules({ keepScopes: ['#t4-hero'] }, ':root')
  const colourRoles = ROLE_VARIABLES.map((r) => r.name).filter((n) => n.startsWith('--ds-c-'))
  assert.ok(colourRoles.length >= 36)
  const missing = colourRoles.filter((n) => !rule.includes(`${n}:initial`))
  assert.deepEqual(missing, [])
})

test('a kept band named with a combinator is reset and stops the slot rules like any other', async () => {
  // JA Resort keeps its hero slides as `.owl-item > .item`: the class-only filter dropped it, so the
  // hero title took Moxie's cream over the template's white (20/10/2026)
  const { keepRules, outsideKept, keptScopes } = await import('../src/tokens56.mjs')
  const c = { keepScopes: ['.owl-item > .item', '.has-bg', '.a  .b>.c#d', 'bad{', '.x, .y', 'a:hover'] }
  assert.deepEqual(keptScopes(c), ['.owl-item > .item', '.has-bg', '.a .b > .c#d'])
  const [rule] = keepRules(c, ':root')
  assert.ok(rule.startsWith(':root .owl-item > .item,:root .has-bg,:root .a .b > .c#d{'))
  assert.match(rule, /--ds-c-heading:initial/)
  assert.deepEqual(outsideKept(c)('.btn'), [
    '.btn:not(.owl-item > .item, .owl-item > .item *, .has-bg, .has-bg *, .a .b > .c#d, .a .b > .c#d *)'
  ])
})

test('kept bands: keepDefaultsYield gives the values back below the band’s own declarations', async () => {
  const { keepRules } = await import('../src/tokens56.mjs')
  const c = { keepScopes: ['.bg-white', '.bg-dark'], keepDefaults: { '--headings-color': '#172433' } }
  const [reset, given] = keepRules({ ...c, keepDefaultsYield: true }, ':root')
  assert.match(reset, /--ds-c-accent:initial/)
  assert.doesNotMatch(reset, /--headings-color/)
  assert.equal(given, ':where(.bg-white,.bg-dark){--headings-color:#172433}')
  // off by default: one rule, as before
  const plain = keepRules(c, ':root')
  assert.equal(plain.length, 1)
  assert.match(plain[0], /--headings-color:#172433/)
})

test('a slot colour rule stops at every kept band; a pseudo-element stays last; no band, no change', async () => {
  const { outsideKept } = await import('../src/tokens56.mjs')
  const out = outsideKept({ keepScopes: ['.hero', '#cta', 'bad scope{'] })
  const not = ':not(.hero, .hero *, #cta, #cta *)'
  assert.deepEqual(out(['.tracy a.btn', '.faq summary::after', '.a:is(.b, .c), .d']), [
    `.tracy a.btn${not}`,
    `.faq summary${not}::after`,
    `.a:is(.b, .c)${not}`,
    `.d${not}`
  ])
  assert.deepEqual(out('.x'), [`.x${not}`])
  assert.deepEqual(outsideKept({})(['.a, .b', '.c']), ['.a, .b', '.c'])
})

test('a palette colour held only in non-text roles is classified when it paints text', () => {
  const dark = { bg: '#181d24', surface: '#ffffff', 'accent-on': '#ffffff', fg: '#cccccc' }
  const r = tokenizeCss('p.mb-0{color:#ffffff}', dark, { classifyText: true })
  assert.equal(r.css, 'p.mb-0{color:var(--ds-c-fg, #ffffff)}')
})

test('text on an accent fill is the accent’s own text even when it would classify as body text', () => {
  const r = tokenizeCss('.btn{background:#C2562F;color:#000000}', palette, { classifyText: true })
  assert.equal(r.css, '.btn{background:var(--ds-c-accent, #C2562F);color:var(--ds-c-accent-on, #000000)}')
})

// pass-wordpress.mjs tokenizes a theme's own stylesheet in its source and the theme ships it, so a
// rule the tokenizer learns later leaves the committed sheet stale: #1095's literal pairs changed one
// line of wp-ja-vega.css (the accordion toggle's dark plus on its #f0f1f2 disc), and every later
// REG-PR-1087 run left that line as a diff in the tree (10/10/2026). The committed sheet must be what
// tokenizing it gives today, with the palette scripts/tokenize.mjs builds from the theme's contract.
test('every tokenized WordPress theme stylesheet in the tree is what the tokenizer makes of it today', async () => {
  const { readdirSync, existsSync, readFileSync } = await import('node:fs')
  const { join, resolve, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const { contractBase, loadContract } = await import('../src/library.mjs')
  const { COLOUR_TOKENS } = await import('../src/tokens56.mjs')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
  const checked = []
  for (const file of readdirSync(new URL('../templates', import.meta.url))) {
    const m = /^(wordpress-.+)\.json$/.exec(file)
    if (!m) continue
    const contract = loadContract(m[1])
    const theme = String(contract.template ?? '').split('/')[1]
    const sheet = join(
      root,
      'packages/cms/tracy-wordpress-theme/overlays',
      theme ?? '',
      'assets/css',
      `${theme}.css`
    )
    if (!theme || !existsSync(sheet)) continue
    const css = readFileSync(sheet, 'utf8')
    if (!css.includes('var(--ds-c-')) continue
    const base = contractBase(root, contract)
    const light = Object.fromEntries(COLOUR_TOKENS.map((n) => [n, base[`--${n}`]]))
    const dark = Object.fromEntries(
      Object.entries(contract.darkTokens ?? {})
        .filter(([k]) => COLOUR_TOKENS.includes(k.replace(/^--/, '')))
        .map(([k, v]) => [k.replace(/^--/, ''), v])
    )
    const pal = [light, ...(Object.keys(dark).length ? [dark] : []), ...(contract.extraPalettes ?? [])]
    const r = tokenizeCss(css, pal, {
      accentVars: contract.accentVars,
      keepScopes: contract.keepScopes,
      classifyText: contract.classifyText
    })
    const changed = css.split('\n').filter((line, i) => line !== r.css.split('\n')[i])
    assert.deepEqual(
      changed,
      [],
      `${theme}.css is stale: re-run scripts/tokenize.mjs --template ${m[1]} --write`
    )
    checked.push(theme)
  }
  assert.ok(checked.includes('wp-ja-vega') && checked.length >= 6, checked.join(', '))
})

test('translucent text follows at its own opacity only where a contract asks (alphaText)', () => {
  const pal = [{ bg: '#000000', fg: '#9e9e9e', 'fg-2': '#ffffff', accent: '#dec180' }]
  const css =
    '.nav a{color:rgba(255, 255, 255, 0.8)}.chip{color:rgba(255,255,255,.5);background:#123456}.veil{background:rgba(255,255,255,.5)}'
  // off: what was tokenized before stays exactly what the tokenizer makes of it
  assert.equal(tokenizeCss(css, pal).css, css)
  const r = tokenizeCss(css, pal, { alphaText: true })
  assert.match(r.css, /\.nav a\{color:var\(--ds-a-fg-2-80, rgba\(255, 255, 255, 0\.8\)\)\}/)
  // a rule that keeps its fill literal keeps its text literal (the pair)
  assert.match(r.css, /\.chip\{color:rgba\(255,255,255,\.5\);background:#123456\}/)
  // fills are not text: a veil stays as it is
  assert.match(r.css, /\.veil\{background:rgba\(255,255,255,\.5\)\}/)
  assert.deepEqual(r.alphas, ['fg-2-80'])
})

test('a fill painted with an accent variable pairs its text only where a contract asks (pairVarFill)', () => {
  const pal = [{ bg: '#ffffff', fg: '#616161', accent: '#d23a26', 'accent-on': '#ffffff' }]
  const css = '.nav .active > a{background-color:var(--color-primary);color:#ffffff}'
  const opts = { accentVars: ['--color-primary'] }
  assert.equal(tokenizeCss(css, pal, opts).css.includes('accent-on'), false)
  assert.match(
    tokenizeCss(css, pal, { ...opts, pairVarFill: true }).css,
    /color:var\(--ds-c-accent-on, #ffffff\)/
  )
})

test('the dark half of a light-dark() plays the role of its light half (darkArms)', () => {
  const r = darkArms(
    'a{color:light-dark(var(--ds-c-accent-text-hover, #1a3eed), #7d93ff)}' +
      'b{background:light-dark(var(--ds-c-surface, #fff), rgba(255, 255, 255, .05))}' +
      'c{border-color:light-dark(#ddd, #333)}' +
      'd{color:light-dark(var(--ds-c-fg, #111), var(--x))}'
  )
  assert.equal(r.replaced, 2)
  assert.match(
    r.css,
    /light-dark\(var\(--ds-c-accent-text-hover, #1a3eed\), var\(--ds-c-accent-text-hover, #7d93ff\)\)/
  )
  assert.match(
    r.css,
    /light-dark\(var\(--ds-c-surface, #fff\), var\(--ds-c-surface, rgba\(255, 255, 255, \.05\)\)\)/
  )
  // a pair with no slot read, and a dark half that is already a variable, stay as they are
  assert.match(r.css, /c\{border-color:light-dark\(#ddd, #333\)\}/)
  assert.match(r.css, /d\{color:light-dark\(var\(--ds-c-fg, #111\), var\(--x\)\)\}/)
  // and tokenizeCss runs it last
  assert.match(tokenizeCss('e{color:light-dark(#2B2420, #eee)}', palette).css, /var\(--ds-c-fg, #eee\)/)
})

test('a variable that renames an accent variable is an accent variable, across the sheets tokenized together (JA Kinetic)', () => {
  const sections =
    ':root{--primary: var(--wp--preset--color--accent);--logo:var(--primary);--line: var(--border)}'
  const article =
    '.card{color: var(--primary)}.card:hover{color:var(--primary)}.box{background: var(--primary)}'
  const vars = accentAliases([sections, article], ['--wp--preset--color--accent'])
  assert.deepEqual(vars.sort(), ['--logo', '--primary', '--wp--preset--color--accent'])
  const r = tokenizeCss(article, { bg: '#ffffff', fg: '#111111', accent: '#4d7c0f' }, { accentVars: vars })
  assert.ok(r.css.includes('.card{color: var(--ds-c-accent-text, var(--primary))}'), r.css)
  assert.ok(r.css.includes('.card:hover{color:var(--ds-c-accent-text-hover, var(--primary))}'), r.css)
  assert.ok(r.css.includes('.box{background: var(--primary)}'), 'a fill keeps the accent')
})

test('a status colour set as text reads its shade; its fills and lines keep the status (15/10/2026)', async () => {
  const { textOnlyVars } = await import('../src/tokenize.mjs')
  const pal = {
    bg: '#ffffff',
    fg: '#212529',
    accent: '#0d6efd',
    success: '#198754',
    warn: '#ffc107',
    danger: '#dc3545'
  }
  const css =
    '.alert-danger{color:#dc3545;background:#dc3545;border-color:#dc3545}' +
    '.btn-outline-danger{--t4-btn-color:#dc3545;--t4-btn-bg:#dc3545}.btn{color:var(--t4-btn-color);background:var(--t4-btn-bg)}' +
    '.was{color:var(--ds-c-warn, #ffc107)}.fill{background:var(--ds-c-success, #198754)}'
  // a variable only text reads, through another variable too; one a fill reads is not
  assert.deepEqual(textOnlyVars([css]), ['--t4-btn-color'])
  assert.deepEqual(textOnlyVars(['.a{--x:#000;--y:var(--x)}.b{color:var(--y)}']), ['--x', '--y'])
  const r = tokenizeCss(css, pal)
  assert.equal(
    r.css,
    '.alert-danger{color:var(--ds-c-danger-text, #dc3545);background:var(--ds-c-danger, #dc3545);border-color:var(--ds-c-danger, #dc3545)}' +
      '.btn-outline-danger{--t4-btn-color:var(--ds-c-danger-text, #dc3545);--t4-btn-bg:var(--ds-c-danger, #dc3545)}.btn{color:var(--t4-btn-color);background:var(--t4-btn-bg)}' +
      // a sheet tokenized before the shade existed moves its status text to the shade, its fill stays
      '.was{color:var(--ds-c-warn-text, #ffc107)}.fill{background:var(--ds-c-success, #198754)}'
  )
  // run twice, nothing more moves
  assert.equal(tokenizeCss(r.css, pal).css, r.css)
  // across sheets the CLI passes the variables it read in all of them
  const split = tokenizeCss('.btn-outline-danger{--t4-btn-color:#dc3545}', pal, {
    textVars: ['--t4-btn-color']
  })
  assert.equal(split.css, '.btn-outline-danger{--t4-btn-color:var(--ds-c-danger-text, #dc3545)}')
})

test('reRole moves only the slots known wrong, each to the role its property takes (council, 15/10/2026)', async () => {
  const { paletteForFile } = await import('../src/tokenize.mjs')
  // JA Smallbiz's red: its accent was in no palette when 1.0.2 was cut, and was classified as meta text
  const pal = [{ bg: '#f1e8df', fg: '#333333', accent: '#73552f', meta: '#9e9e9e' }, { accent: '#db2d2e' }]
  const css =
    '.a{color:var(--ds-c-meta, #db2d2e)}.b{background:var(--ds-c-meta, #DB2D2E)}' +
    '.c{border:1px solid var(--ds-c-meta, #db2d2e);box-shadow:0 0 0 1px var(--ds-c-border, #ddd)}' +
    '.d:hover{color:var(--ds-c-meta, #db2d2e)}.e{color:var(--ds-c-meta, #9e9e9e)}'
  const r = tokenizeCss(css, pal, { reRole: [{ from: 'meta', colour: '#db2d2e' }] })
  assert.equal(
    r.css,
    '.a{color:var(--ds-c-accent-text, #db2d2e)}.b{background:var(--ds-c-accent, #DB2D2E)}' +
      '.c{border:1px solid var(--ds-c-accent, #db2d2e);box-shadow:0 0 0 1px var(--ds-c-border, #ddd)}' +
      '.d:hover{color:var(--ds-c-accent-text-hover, #db2d2e)}.e{color:var(--ds-c-meta, #9e9e9e)}'
  )
  assert.deepEqual(r.reRoled, { 'meta→accent-text': 1, 'meta→accent': 2, 'meta→accent-text-hover': 1 })
  assert.equal(tokenizeCss(r.css, pal, { reRole: [{ from: 'meta', colour: '#db2d2e' }] }).css, r.css)
  // without reRole nothing tokenized before moves
  assert.equal(tokenizeCss(css, pal).css, css)
  // a sheet of its own look gets its own palette; any other keeps the template's
  const own = { bg: '#111111', fg: '#999999', accent: '#ffcc00' }
  const contract = { filePalettes: { 'css/themes/dark-triangular-yellow/': own } }
  assert.equal(
    paletteForFile(pal, contract, 'templates/ja_resume/css/themes/dark-triangular-yellow/template.css'),
    own
  )
  assert.equal(paletteForFile(pal, contract, 'templates/ja_resume/css/template.css'), pal)
  assert.equal(paletteForFile(pal, null, 'x.css'), pal)
})

test('a re-cut moves only what it was cut for: status text and reRole, nothing tokenized anew (15/10/2026)', () => {
  const pal = [
    { bg: '#ffffff', fg: '#222222', accent: '#0d6efd', danger: '#dc3545', meta: '#999999' },
    { accent: '#db2d2e' }
  ]
  const css =
    '.a{color:var(--ds-c-danger, #dc3545)}.h{color:#222222}.b{background:#0d6efd;color:#fff}' +
    '.r{color:var(--ds-c-meta, #db2d2e)}.l{color:light-dark(var(--ds-c-fg, #222222), #eeeeee)}'
  const r = tokenizeCss(css, pal, { moveOnly: true, reRole: [{ from: 'meta', colour: '#db2d2e' }] })
  assert.equal(
    r.css,
    '.a{color:var(--ds-c-danger-text, #dc3545)}.h{color:#222222}.b{background:#0d6efd;color:#fff}' +
      '.r{color:var(--ds-c-accent-text, #db2d2e)}.l{color:light-dark(var(--ds-c-fg, #222222), #eeeeee)}'
  )
})

test('the accent a text-only variable holds is the readable accent; its fills keep the accent (16/10/2026)', () => {
  // Tracy Base 1.0.4: T4's --t4-btn-color, --t4-nav-link-color and --t4-pagination-color painted links and
  // outline buttons with the system's accent fill (Moxie #6786c4 on #eae5cc, 2.87:1)
  const pal = {
    bg: '#ffffff',
    fg: '#1d1d1f',
    accent: '#0071e3',
    'accent-hover': '#0077ed',
    'accent-on': '#ffffff'
  }
  const css =
    '.btn-outline-primary{--t4-btn-color:#0071e3;--t4-btn-hover-color:#0077ed;--t4-btn-bg:#0071e3}' +
    '.btn-primary{--t4-btn-color:#ffffff}.btn{color:var(--t4-btn-color);background:var(--t4-btn-bg)}' +
    '.btn:hover{color:var(--t4-btn-hover-color)}.nav{--t4-nav-link-color:var(--ds-c-accent, #0071e3)}' +
    '.nav-link{color:var(--t4-nav-link-color)}'
  const r = tokenizeCss(css, pal)
  assert.ok(r.css.includes('--t4-btn-color:var(--ds-c-accent-text, #0071e3)'), r.css)
  assert.ok(r.css.includes('--t4-btn-hover-color:var(--ds-c-accent-text-hover, #0077ed)'), r.css)
  // a fill keeps the accent; a value already read through the slot is left as it is (a released theme's
  // stylesheet is what the tokenizer made of it then: it moves only when its own release is cut again)
  assert.ok(r.css.includes('--t4-btn-bg:var(--ds-c-accent, #0071e3)'), r.css)
  assert.ok(r.css.includes('--t4-nav-link-color:var(--ds-c-accent, #0071e3)'), r.css)
  assert.ok(
    !r.css.includes('--t4-btn-color:var(--ds-c-accent-text, #ffffff)'),
    'white on the accent is not accent text'
  )
  assert.equal(tokenizeCss(r.css, pal).css, r.css)
})
