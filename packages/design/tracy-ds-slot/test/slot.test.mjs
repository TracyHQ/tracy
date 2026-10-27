import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contrast, mix, readableOn } from '../src/colour.mjs'
import { DISPLAY_OVER_TEMPLATE, emdashCss, fontsHref, slotVars, templateDisplayPx } from '../src/emit.mjs'
import { fromStack, resolveFont } from '../src/fonts.mjs'
import { loadContract, loadProfile } from '../src/library.mjs'
import { fromRefero, gate, primaryButton, px, quickColours } from '../src/normalise.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
/** A two-sided sheet (contract `modes`) scopes its rules to a side; read as the one-look lines. */
const flat = (css) =>
  css
    .replaceAll(':root[data-theme="dark"] ', ':root ')
    .replaceAll(':root:not([data-theme="dark"]) ', ':root ')
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const VOICEFLOW = 'refero:03b3d707-2a30-4f53-a524-347d1b70eb2c'
const EDDIE = 'refero:5f446754-1fb7-4a99-8cee-7bd5de3bfd9e'
const ARTE = 'refero:2f94c1f0-cd23-4bf1-95f3-0e531174c4f4'

const minimal = (over = {}) => ({
  theme: 'light',
  colors: [{ hex: '#1e1e1', name: 'broken', role: 'Primary text', group: 'neutral' }],
  surfaces: [],
  typography: [{ family: 'Söhne', weight: '400', substitute: 'none', role: 'Body text' }],
  typeScale: [],
  spacing: { radius: { buttons: '96-125px' } },
  components: [],
  customSections: [],
  ...over
})

test('px reads one value, keeps a range as a range, and refuses prose', () => {
  assert.deepEqual(px('1000px'), { v: 1000 })
  assert.deepEqual(px('8-14px'), { v: 8, range: [8, 14] })
  assert.equal(px('0px (pentagon clip-path)'), null)
})

test('a broken hex is never repaired into a colour', () => {
  const p = fromRefero(minimal(), { id: 'x', name: 'X' })
  assert.equal(p.colors.fg.s, 'empty')
  assert.deepEqual(gate(p).reasons.slice(0, 2), ['no-bg', 'no-fg'])
})

test('a font that is not on Google Fonts and has no Google substitute stays empty (template keeps its own)', () => {
  assert.equal(resolveFont('Söhne', 'none').status, 'empty')
  assert.deepEqual(resolveFont('Tiempos Headline', "'Source Serif 4' or 'Libre Caslon'"), {
    family: 'Source Serif 4',
    status: 'substituted',
    source: 'google',
    substituteOf: 'Tiempos Headline'
  })
})

test('an OpenDesign stack is kept verbatim and every Google family in it is loaded', () => {
  const r = fromStack('"Waldenburg", "Inter", system-ui, sans-serif')
  assert.equal(r.s, 'substituted')
  assert.equal(r.v, '"Waldenburg", "Inter", system-ui, sans-serif')
  assert.deepEqual(
    r.load.map((l) => l.family),
    ['Inter']
  )
})

test('text on an accent is whichever of white or black reads better', () => {
  assert.equal(readableOn('#0071e3'), '#ffffff')
  assert.equal(readableOn('#397dff'), '#000000') // white reads 3.78:1 on it, black 5.55:1
  assert.equal(readableOn('#e8e359'), '#000000')
  assert.ok(contrast(readableOn('#84acfb'), '#84acfb') >= 4.5)
})

test('Moxie: the colours, fonts and weights the source states', () => {
  const p = loadProfile(ROOT, MOXIE)
  const q = quickColours(
    JSON.parse(
      '{"customSections":[{"title":"Agent Prompt Guide","content":"Quick Color Reference\\n- background: #000000\\n- text: #f4efd4\\n"}]}'
    )
  )
  assert.deepEqual(q, { background: '#000000', text: '#f4efd4' })
  assert.equal(p.colors.bg.v, '#000000')
  assert.equal(p.colors.fg.v, '#f4efd4')
  assert.equal(p.colors.accent.v, '#84acfb')
  assert.equal(p.fonts.display.v, 'IBM Plex Serif')
  assert.equal(p.weights.display.v, 300)
  assert.equal(p.shape.button.v, 1000)
  assert.equal(p.mode.v, 'dark')
  assert.equal(gate(p).ok, true)
})

test('display tracking is carried in em, so it cannot crush a small title (Voiceflow, 08/10)', () => {
  const p = loadProfile(ROOT, VOICEFLOW)
  assert.equal(p.scale.tracking.v, '-0.04em')
  assert.equal(slotVars(p)['--ds-tracking-display'], '-0.04em')
})

test('a line height written in pixels becomes a ratio (Eddie: 83 on 119px)', () => {
  const p = loadProfile(ROOT, EDDIE)
  assert.ok(p.scale.display.v.leading < 2, `leading ${p.scale.display.v.leading}`)
})

test('the gate refuses text that does not read on its own background (arte* 3.77:1)', () => {
  const g = gate(loadProfile(ROOT, ARTE))
  assert.equal(g.ok, false)
  assert.match(g.reasons.join(), /contrast-fg-bg/)
  assert.deepEqual(emdashCss(loadProfile(ROOT, ARTE)).refused, g.reasons)
})

test('the EmDash slot sheet names its system, loads only Google Fonts, and hides the light/dark switch', () => {
  const p = loadProfile(ROOT, MOXIE)
  const r = emdashCss(p)
  assert.match(r.css, /^\/\* tracy-ds-slot: refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0 \(Moxie\)/)
  assert.match(
    fontsHref(p),
    /^https:\/\/fonts\.googleapis\.com\/css2\?family=IBM\+Plex\+Serif:wght@300;400;500&family=IBM\+Plex\+Sans/
  )
  assert.match(r.css, /--color-bg: #000000;/)
  assert.match(r.css, /--ds-weight-display: 300;/)
  assert.match(r.css, /\[data-tracy-theme-toggle\] \{ display: none !important; \}/)
  assert.doesNotMatch(r.css, /<\/style/i)
})

test('a field the system leaves empty emits nothing, so the template keeps its value', () => {
  const p = loadProfile(ROOT, 'od:apple')
  // EmDash's slot keeps the look it was measured with: nothing read off the reference page
  const v = slotVars(p, { components: false })
  assert.equal(v['--ds-weight-display'], undefined)
  assert.equal(v['--ds-btn-radius'], undefined)
  assert.equal(v['--ds-card-radius'], '18px')
  // WordPress and Joomla wear what the reference page states (components.html), and only that
  const all = slotVars(p)
  assert.equal(p.weights.display.f, 'components.html h1 font-weight')
  assert.equal(all['--ds-weight-display'], p.weights.display.v)
  assert.equal(p.weights.strong.s, 'empty')
})

test('every text colour a worn system leaves reads at 4.5:1 or better, moved the least toward its text colour', async () => {
  const { palette, readableText } = await import('../src/emit.mjs')
  for (const id of [
    MOXIE,
    VOICEFLOW,
    EDDIE,
    'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567',
    'refero:813be405-c2b9-41be-9864-7b53d66483dc',
    'od:apple',
    'od:linear-app'
  ]) {
    const p = loadProfile(ROOT, id)
    const pal = palette(p)
    const r = emdashCss(p)
    const v = r.vars
    const bg = v['--color-bg']
    for (const name of ['--color-fg-muted', '--color-fg-meta', '--color-fg-2'])
      assert.ok(contrast(v[name], bg) >= 4.5, `${id} ${name} ${contrast(v[name], bg)}`)
    assert.ok(contrast(v['--ds-accent-text'] ?? v['--color-accent'], bg) >= 4.5, `${id} accent text`)
    assert.ok(contrast(v['--color-fg'], v['--color-surface']) >= 4.5, `${id} text on surface`)
    // the fill keeps the system's own accent: only the TEXT use moves
    assert.equal(v['--color-accent'], pal.accent)
    assert.deepEqual(readableText(pal).adjusted, r.adjusted)
  }
})

test('MotherDuck: a light-blue accent stays the button fill and becomes a darker shade only as text', () => {
  const r = emdashCss(loadProfile(ROOT, 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'))
  assert.equal(r.vars['--color-accent'], '#6fc2ff')
  assert.notEqual(r.vars['--ds-accent-text'], '#6fc2ff')
  assert.ok(r.adjusted.some((a) => a.startsWith('accent-text:1.70→')))
})

test('a stated surface the text cannot be read on is replaced by the derived one (Getburnt)', () => {
  const r = emdashCss(loadProfile(ROOT, 'refero:002cc5a7-0d34-4d8d-afa0-c5fad69477d5'))
  assert.ok(r.adjusted.some((a) => a.startsWith('surface:1.00→')))
})

test('Toggl Track is read as its page: Bone ground, plum text, magenta action (13/10/2026)', () => {
  // its first colour is the plum of its hero, header and footer ("canvases"), its page is Bone; read
  // as the page, the plum became the ground and the magenta accent the body text
  const c = loadProfile(ROOT, 'refero:813be405-c2b9-41be-9864-7b53d66483dc').colors
  assert.equal(c.bg.v, '#fefbfa')
  assert.equal(c.fg.v, '#412a4c')
  assert.equal(c.accent.v, '#e57cd8')
})

test('phone display and heading sizes never exceed what the template itself sets on a phone (Eddie 119px)', () => {
  const v = slotVars(loadProfile(ROOT, EDDIE))
  // and no headline outgrows its window share: 6vw on a desktop, 10vw on a phone (13/10/2026)
  assert.equal(v['--ds-size-display'], 'min(119px, 6vw)')
  assert.equal(v['--ds-size-display-phone'], 'min(56px, 10vw)')
  assert.ok(parseFloat(v['--ds-size-heading-phone'] ?? '0') <= 40)
})

test("a system's hero outgrows the template's own by a quarter at most; a mono one takes less of a phone (13/10/2026)", () => {
  // Tracy Business's 64px hero stood six lines beside its picture at Eddie's 86px; JA Nova's 40px at
  // Notion's 72px ran into its floating badges
  const own = templateDisplayPx(loadContract('wordpress-tracy-business'))
  assert.equal(own, 64)
  assert.equal(slotVars(loadProfile(ROOT, EDDIE), { templateDisplay: own })['--ds-size-display'], '80px')
  const notion = 'refero:2bf4c61f-de10-4614-ba1b-20c0453bd2a9'
  const nova = templateDisplayPx(loadContract('wordpress-ja-nova'))
  assert.equal(slotVars(loadProfile(ROOT, notion), { templateDisplay: nova })['--ds-size-display'], '50px')
  // smaller than the template's: the system's own, exactly
  assert.equal(slotVars(loadProfile(ROOT, notion), { templateDisplay: 80 })['--ds-size-display'], '72px')
  // MotherDuck's JetBrains Mono, a third wider than a proportional face
  const duck = slotVars(loadProfile(ROOT, 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'))
  assert.equal(duck['--ds-size-display-phone'], 'min(40px, 8vw)')
})

test('a section heading never sets under 28px, 24px on a phone: Figma and Spotify read 24px and 17px (13/10/2026)', () => {
  for (const id of [
    'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671',
    'refero:1514a95f-878c-4d4d-bb14-99d1b83f6227'
  ]) {
    const v = slotVars(loadProfile(ROOT, id))
    assert.equal(v['--ds-size-heading'], '28px', id)
    assert.equal(v['--ds-size-heading-phone'], '24px', id)
  }
  // a larger heading keeps its own
  assert.equal(slotVars(loadProfile(ROOT, EDDIE))['--ds-size-heading'], '30px')
})

// ── review findings 09/10/2026 — each kept by a test ──
test('a mono "data label" face never becomes the body face, and "Universal UI … headings" is not the display face', async () => {
  const { fontRoles } = await import('../src/normalise.mjs')
  const metaview = fontRoles([
    { family: 'Euclid Circular A', role: 'Sole UI typeface — used for headings and body' },
    { family: 'Onsite SemiMono', role: 'Monospace companion for inline code and data labels' }
  ])
  assert.equal(metaview.body.family, 'Euclid Circular A')
  assert.equal(metaview.mono.family, 'Onsite SemiMono')
  const grain = fontRoles([
    {
      family: 'Inter Variable',
      role: 'Universal UI font — handles all body text and headings below the hero'
    },
    { family: 'Poppins', role: 'Display heading font — used exclusively for the hero' }
  ])
  assert.equal(grain.display.family, 'Poppins')
  assert.equal(grain.body.family, 'Inter Variable')
  const oevra = fontRoles([
    { family: "Suisse Int'l", role: 'Display and headline face. Light' },
    { family: "Suisse Int'l", role: 'Secondary body and footer text.' },
    { family: 'Space Grotesk', role: 'Primary body, UI labels, buttons' }
  ])
  assert.equal(oevra.body.family, 'Space Grotesk')
  // a mono face the source names as THE brand face stays the face (MotherDuck)
  const motherduck = fontRoles([
    {
      family: 'Aeonik Mono',
      role: 'Universal brand face — headlines, body, nav, buttons, inputs, cards, footers'
    },
    { family: 'Inter', role: 'Secondary face for supplementary UI text, third-party embeds' }
  ])
  assert.equal(motherduck.display.family, 'Aeonik Mono')
  assert.equal(motherduck.body.family, 'Aeonik Mono')
})

test('tracking comes from the structured scale with its sign, never from prose', () => {
  const p = fromRefero(
    minimal({
      colors: [],
      typography: [
        {
          family: 'Inter',
          weight: '400',
          role: 'Display headlines',
          letterSpacing: '−0.043em (at 10px labels 0.25em)'
        }
      ],
      typeScale: [{ role: 'display', size: 60, lineHeight: 1.1, letterSpacing: -2.4 }]
    }),
    { id: 'x', name: 'X' }
  )
  assert.equal(p.scale.tracking.v, '-0.04em')
})

test('a family with no upright weight is not loadable (its wght@ request would take the whole link down)', () => {
  assert.equal(resolveFont('Molle', 'none').status, 'empty')
})

test('a name or value from the source cannot leave the comment or the declaration', async () => {
  const { safeValue } = await import('../src/emit.mjs')
  const p = { ...loadProfile(ROOT, MOXIE), name: 'x */ @import url(//evil.example/a.css); /*' }
  const css = emdashCss(p).css
  // the first line is one closed comment, and no rule outside comments imports anything
  assert.match(css.split('\n')[0], /^\/\* [^*/]*\*\/$/)
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /@import|url\(/)
  for (const bad of ['red; } body { display:none', 'url(https://x)', '"A" </style>', 'a /* b */'])
    assert.equal(safeValue(bad), false, bad)
  assert.equal(safeValue('"IBM Plex Serif", serif'), true)
})

test('display line height never goes under 0.95, so a wrapped heading cannot collide', () => {
  const p = fromRefero(
    minimal({ colors: [], typeScale: [{ role: 'display', size: 200, lineHeight: 0.7 }] }),
    { id: 'x', name: 'X' }
  )
  assert.equal(slotVars(p)['--ds-leading-display'], '0.95')
})

test('the probe reads letter-spacing "normal" as 0 (a system with no tracking, Eddie)', async () => {
  const { score } = await import('../src/probe.mjs')
  const r = score(
    { roles: { display: { letterSpacing: 'normal' } } },
    { 'display.letterSpacing': ['tracking', [0, 119, 56]] },
    'desktop'
  )
  assert.equal(r.match, 1)
})

test('EmDash Tracy Business: the call to action on a painted band stands out from that band under every system', async () => {
  // 11/10/2026: the closing call (`.bg-forest`) carries the accent-filled button, so under Stripe, Spotify,
  // Editorial and Runway the button was the band's own colour (1.00:1), and on the ink hero (`.band-ink`)
  // Spotify's green stood 1.92:1. The theme now reads the roles (no band button rule since 15/10/2026): the
  // accent band and the ink are chosen so the accent fill stands out 3:1 on both, and its words read
  const { loadContract } = await import('../src/library.mjs')
  const c = loadContract('emdash-tracy-business-roles')
  for (const key of [
    'apple',
    'stripe',
    'spotify',
    'linear-app',
    'binance',
    'superhuman',
    'editorial',
    'mintlify',
    'ferrari',
    'runwayml'
  ]) {
    const r = emdashCss(loadProfile(ROOT, `od:${key}`), c)
    for (const v of [r.vars, r.derivedVars]) {
      for (const band of ['accent-band', 'ink'])
        assert.ok(contrast(v['--ds-c-accent'], v[`--ds-c-${band}`]) >= 3, `${key}: the accent on ${band}`)
      assert.ok(contrast(v['--ds-c-accent-on'], v['--ds-c-accent']) >= 4.5, `${key}: the button's words`)
      assert.ok(contrast(v['--ds-c-on-accent-band'], v['--ds-c-accent-band']) >= 4.5, `${key}: band words`)
    }
    assert.ok(!r.css.includes('.btn-primary'), `${key}: no band button rule`)
  }
})

test('accent words on a worn band read on that band (bandText)', async () => {
  // Tracy Business reads --ds-c-accent-on-ink itself since 15/10/2026 and dropped the key: the key is
  // proven here on its former band
  const c = {
    ...loadContract('emdash-tracy-business'),
    bandText: { '.band-ink': { ground: 'ink', text: ['.text-signal', '.eyebrow', '.eyebrow-sm'] } }
  }
  for (const id of [
    'od:apple',
    'od:stripe',
    'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
    'refero:813be405-c2b9-41be-9864-7b53d66483dc'
  ]) {
    const r = emdashCss(loadProfile(ROOT, id), c)
    for (const [band, spec] of Object.entries(c.bandText)) {
      const ground = r.vars[`--ds-c-${spec.ground}`]
      const line = flat(r.css)
        .split('\n')
        .find((l) => l.startsWith(`:root ${band} ${spec.text[0]}`))
      assert.ok(line, `${id}: ${band} has a text rule`)
      const [, colour] = /\{ color: (#[0-9a-f]{6}); \}$/.exec(line) ?? []
      assert.ok(contrast(colour, ground) >= 4.5, `${id} ${band}: ${colour} on ${ground}`)
    }
  }
  // Airbnb: its accent is its ink (#222222), so on the ink band (1:1) the accent words move until they read
  const airbnb = emdashCss(loadProfile(ROOT, 'refero:194faa2f-2f69-4bbf-9e29-290f28fa8ca2'), c)
  assert.notEqual(
    /\.band-ink \.text-signal \{ color: (#[0-9a-f]{6})/.exec(airbnb.css)?.[1],
    airbnb.vars['--ds-c-accent']
  )
  // Toggl Track: the ink band used to wear the text colour (its pink), so the pink accent on it read 1:1
  // and moved toward black. With the ink role (#1309) the band is Toggl's dark surface, the accent reads
  // 6:1 on it and stays the system's own
  const toggl = emdashCss(loadProfile(ROOT, 'refero:813be405-c2b9-41be-9864-7b53d66483dc'), c)
  const signal = /\.band-ink \.text-signal \{ color: (#[0-9a-f]{6})/.exec(toggl.css)?.[1]
  assert.equal(signal, toggl.vars['--ds-c-accent'])
  assert.ok(contrast(signal, toggl.vars['--ds-c-ink']) >= 4.5)
  // a selector that could leave its rule, or a ground that is not a role, writes nothing
  const bad = emdashCss(loadProfile(ROOT, 'od:apple'), {
    bandText: {
      '.ok': { ground: 'fg', text: ['.t', '.x}a{color:red'] },
      '.bad{': { ground: 'fg', text: ['.t'] },
      '.css': { ground: '#ffffff', text: ['.t'] }
    }
  }).css
  assert.deepEqual(
    bad.split('\n').filter((l) => l.includes(' .t')),
    [`:root .ok .t { color: ${bad.match(/:root \.ok \.t \{ color: (#[0-9a-f]{6})/)[1]}; }`]
  )
  // a contract without bandText writes no text rule
  assert.ok(!emdashCss(loadProfile(ROOT, 'od:apple')).css.includes('{ color:'))
})

test('Tracy SaaS: the call-to-action card eyebrow reads on every ground of its tinted gradient (bandText)', () => {
  // the card paints elevated (surface-warm) → surface, tinted 12% toward the readable accent at the top;
  // the eyebrow in that accent read 4.43 under MotherDuck and 4.27 under Apple on 1.4.11 before this
  const c = loadContract('emdash-tracy-saas')
  const spec = c.bandText['.cta--card']
  const ids = [
    MOXIE,
    'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567',
    'refero:813be405-c2b9-41be-9864-7b53d66483dc',
    'od:apple',
    'od:stripe',
    'od:spotify',
    'od:linear-app'
  ]
  for (const id of ids) {
    const r = emdashCss(loadProfile(ROOT, id), c)
    // a two-mode contract (modes: true) scopes each rule to a side; the first is the system's own side
    const line = r.css
      .split('\n')
      .find((l) =>
        /^:root(:not\(\[data-theme="dark"\]\)|\[data-theme="dark"\])? \.cta--card \.cta-eyebrow/.test(l)
      )
    assert.ok(line, `${id}: the eyebrow has a rule`)
    const [, colour] = /\{ color: (#[0-9a-f]{6}); \}$/.exec(line) ?? []
    const start = r.vars[`--ds-c-${spec.colour}`]
    const grounds = spec.ground.map((g) => r.vars[`--ds-c-${g}`])
    for (const g of [...grounds, ...grounds.map((x) => mix(x, start, spec.tint))])
      assert.ok(contrast(colour, g) >= 4.5, `${id}: ${colour} on ${g} reads ${contrast(colour, g)}`)
  }
  // a ground that is not a role, a tint out of range or a selector that could leave its rule writes nothing
  const apple = loadProfile(ROOT, 'od:apple')
  for (const bandText of [
    { '.b': { ground: ['surface', '#ffffff'], text: ['.t'] } },
    { '.b': { ground: 'surface', tint: 0.9, text: ['.t'] } },
    { '.b': { ground: 'surface', text: ['.t}a{color:red'] } }
  ])
    assert.ok(!emdashCss(apple, { bandText }).css.includes('{ color:'), JSON.stringify(bandText))
  // a contract without bandText writes no text rule
  assert.ok(!emdashCss(apple).css.includes('{ color:'))
})

// ── the fifteen featured systems, read as their sources say (13/10/2026) ──
test('a primary button is read off its component prose: fill, label, radius, padding, weight', () => {
  const notion = primaryButton({
    components: [
      { name: 'Ghost CTA Button', description: 'Background #e6f3fe (sky tint), text #0075de' },
      {
        name: 'Primary CTA Button',
        description:
          'Background #0075de, text #ffffff at 14px NotionInter weight 500, border-radius 8px, padding 6px 15px.'
      }
    ]
  })
  assert.deepEqual(
    { fill: notion.fill, label: notion.label, radius: notion.radius, pad: notion.pad, weight: notion.weight },
    { fill: '#0075de', label: '#ffffff', radius: 8, pad: { y: 6, x: 15 }, weight: 500 }
  )
  const toggl = primaryButton({
    components: [
      {
        name: 'Primary Filled Button (Magenta)',
        description:
          'Magenta (#e57cd8) background, Bone (#fefbfa) text, 26px border-radius, padding 14px 28px'
      }
    ]
  })
  assert.equal(toggl.fill, '#e57cd8')
  assert.equal(toggl.label, '#fefbfa')
  // a white pill is a button, not the system's action colour (Spotify)
  assert.equal(
    primaryButton({
      components: [{ name: 'Pill Button (Filled White)', description: 'Background #ffffff' }]
    }),
    null
  )
})

test('the three systems David added: Stripe and Linear get their faces, Linear its main text, Pitch its violet', () => {
  const stripe = loadProfile(ROOT, 'refero:48e5de76-05d5-4c4e-a269-c7c245b291ec')
  const linear = loadProfile(ROOT, 'refero:90ce5883-bb24-4466-93f7-801cd617b0d1')
  const pitch = loadProfile(ROOT, 'refero:da332394-784c-4df2-9e66-c3f7b1d28f28')
  assert.ok(gate(stripe).ok && gate(linear).ok)
  // "Inter Tight (variable, weight 300/400)" is Inter Tight; "Inter Variable" is Inter
  assert.equal(stripe.fonts.body.v, 'Inter Tight')
  assert.equal(linear.fonts.body.v, 'Inter')
  // Linear's first "body text" is its "Muted body text"; its main text is the white of its headings
  assert.equal(linear.colors.fg.v, '#ffffff')
  // Pitch's "accent" is a decorative yellow; its primary button is violet with white text
  assert.equal(pitch.colors.accent.v, '#6b53ff')
  assert.equal(pitch.colors.accentOn.v, '#ffffff')
  // a label that reads just under AA keeps its colour and the fill steps (Voiceflow's white on blue)
  const voiceflow = loadProfile(ROOT, 'refero:03b3d707-2a30-4f53-a524-347d1b70eb2c').colors
  assert.equal(voiceflow.accentOn.v, '#ffffff')
  assert.ok(contrast(voiceflow.accentOn.v, voiceflow.accent.v) >= 4.5)
  assert.equal(
    resolveFont('Segoe UI', 'Segoe UI (system stack: -apple-system, Roboto, sans-serif)').family,
    'Roboto'
  )
})

test("the worn texts keep the template's own order of strength (textOrder)", async () => {
  const { textOrder, tokens56 } = await import('../src/tokens56.mjs')
  const { contractBase } = await import('../src/library.mjs')
  // the 56 tokens' order, kept when the template follows it
  assert.deepEqual(
    textOrder({
      '--bg': '#ffffff',
      '--fg': '#111111',
      '--fg-2': '#444444',
      '--muted': '#666666',
      '--meta': '#888888'
    }),
    ['fg', 'fg-2', 'muted', 'meta']
  )
  // JA Essence WordPress: body copy #252424 at 70% (#252424b3), headings #212529 — the headings are the stronger
  const essence = contractBase(ROOT, loadContract('wordpress-ja-essence'))
  assert.deepEqual(textOrder(essence).slice(0, 2), ['fg-2', 'fg'])
  // so under Moxie (dark) the headings take Moxie's text and the body the softer one, never the reverse
  const moxie = loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
  const { tokens } = tokens56(moxie, essence)
  assert.equal(tokens['--fg-2'], moxie.colors.fg.v)
  assert.ok(contrast(tokens['--fg-2'], tokens['--bg']) > contrast(tokens['--fg'], tokens['--bg']))
  // a text role that does not read on its own page says nothing about the order
  assert.deepEqual(
    textOrder({
      '--bg': '#0a0b0a',
      '--fg': '#1d1d1f',
      '--fg-2': '#ffffff',
      '--muted': '#666666',
      '--meta': '#ffffff'
    }),
    ['fg', 'fg-2', 'muted', 'meta']
  )
})

test('a band the template paints dark stays dark under a dark system (inkPair)', async () => {
  const { inkPair, palette } = await import('../src/emit.mjs')
  const stripe = palette(loadProfile(ROOT, 'refero:48e5de76-05d5-4c4e-a269-c7c245b291ec'))
  assert.deepEqual(inkPair(stripe, stripe.surface), { ink: stripe.fg, 'on-ink': stripe.bg })
  const spotify = palette(loadProfile(ROOT, 'refero:1514a95f-878c-4d4d-bb14-99d1b83f6227'))
  const pair = inkPair(spotify, spotify.surface)
  assert.ok(contrast(pair.ink, '#000000') < 1.6, `ink ${pair.ink} stays dark`)
  assert.equal(pair['on-ink'], spotify.fg)
  // the hero's green words read on it (they read 1.9:1 on the white hero before)
  // (the theme reads them as --ds-c-accent-on-ink, set on the ink the sheet writes)
  const vars = emdashCss(
    loadProfile(ROOT, 'refero:1514a95f-878c-4d4d-bb14-99d1b83f6227'),
    loadContract('emdash-tracy-business')
  ).vars
  assert.ok(contrast(vars['--ds-c-accent-on-ink'], vars['--ds-c-ink']) >= 4.5)
})

test('a display line on a Vietnamese page keeps room for stacked marks (:lang(vi))', async () => {
  const { wordpressVariation } = await import('../src/wordpress.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const c = loadContract('wordpress-tracy-business')
  const css = wordpressVariation(
    loadProfile(ROOT, 'refero:48e5de76-05d5-4c4e-a269-c7c245b291ec'),
    contractBase(ROOT, c),
    c
  ).css
  // on each side of a two-mode template (#1315) the rule is scoped to that side after :lang(vi)
  assert.match(css, /:root:root:root:root:root:root:lang\(vi\)\S* [^{]+\{line-height:1\.2\}/)
})

test('a headline-only face sets the display line and section headings, never a small heading (D2)', async () => {
  const { wordpressVariation } = await import('../src/wordpress.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const balsa = loadProfile(ROOT, 'refero:ebbfbc6a-988b-4f33-b261-d431b2327545')
  const v = slotVars(balsa)
  assert.match(v['--ds-font-display'], /Bebas Neue/)
  assert.match(v['--ds-font-headings'], /Inter/)
  const c = loadContract('wordpress-ja-essence')
  const css = wordpressVariation(balsa, contractBase(ROOT, c), c).css
  assert.match(css, /:is\(h1, h2, h3, h4, h5, h6\)[^{]*\{font-weight:\d+;font-family:"Inter"/)
  assert.match(css, /main h2\.wp-block-heading[^{]*\{[^}]*font-family:"Bebas Neue"/)
  // a featured system's display face is a text face: no split
  assert.equal(
    slotVars(loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'))['--ds-font-headings'],
    undefined
  )
})

test('two systems are told apart only by what a page can show of them (Eddie and ElevenLabs on a phone)', async () => {
  const { separation } = await import('../src/probe.mjs')
  const view = { roles: { container: { contentWidth: 354 }, 'button-primary': { fontWeight: '600' } } }
  // 1200 and 1280 are one column at 390; a weight ElevenLabs does not name is not scored against it
  const eddie = { 'container.contentWidth': ['width', 1200], 'button-primary.fontWeight': ['exact', 600] }
  const eleven = { 'container.contentWidth': ['width', 1280], 'button-primary.fontWeight': ['exact', null] }
  assert.equal(separation(view, eddie, eleven, 'phone'), 0)
  // on a desktop the two columns differ
  assert.equal(separation(view, eddie, eleven, 'desktop'), 1)
  // a 25px radius on a 50px button is a pill: ElevenLabs' 9999px wants the same button; a card title's
  // size is not judged (it keeps the template's), so it tells nothing apart (JA Essence WordPress)
  const page = {
    roles: {
      'button-primary': { borderTopLeftRadius: '25px', fontSize: '16px', height: 50 },
      heading: { fontSize: '32px', fontWeight: '600', inItem: true }
    }
  }
  const e = { 'button-primary.borderTopLeftRadius': ['radius', '25px'], 'heading.fontSize': ['px', [30, 24]] }
  const x = {
    'button-primary.borderTopLeftRadius': ['radius', '9999px'],
    'heading.fontSize': ['px', [36, 25]]
  }
  assert.equal(separation(page, e, x, 'desktop'), 0)
  // a value `a` does not name shows the template's own: apart only when that is not `b`'s
  const weighed = { roles: { 'button-primary': { fontWeight: '400' } } }
  const silent = { 'button-primary.fontWeight': ['exact', null] }
  assert.equal(separation(weighed, silent, { 'button-primary.fontWeight': ['exact', 400] }, 'desktop'), 0)
  assert.equal(separation(weighed, silent, { 'button-primary.fontWeight': ['exact', 600] }, 'desktop'), 1)
  // a 6px radius stays apart from a pill
  const square = { 'button-primary.borderTopLeftRadius': ['radius', '6px'] }
  assert.equal(separation(page, square, x, 'desktop'), 1)
})

test("headings balance their lines with the longhand only, never undoing a heading's own nowrap (GK Compact's marquee)", async () => {
  const { wordpressVariation } = await import('../src/wordpress.mjs')
  const { joomlaSlot } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const notion = loadProfile(ROOT, 'refero:2bf4c61f-de10-4614-ba1b-20c0453bd2a9')
  const jo = loadContract('joomla-gk-compact')
  const wp = loadContract('wordpress-ja-morgan')
  for (const css of [
    joomlaSlot(notion, contractBase(ROOT, jo), jo).css,
    wordpressVariation(notion, contractBase(ROOT, wp), wp).css
  ]) {
    assert.match(css, /text-wrap-style:balance/)
    // `text-wrap` is the shorthand: it also sets text-wrap-mode, which `white-space: nowrap` sets
    assert.doesNotMatch(css, /[{;]text-wrap:/)
  }
})

test("a header's buttons keep the template's size and wear the system's shape (Guru Pro's Buy Guru on a phone)", async () => {
  const { joomlaSlot } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const c = loadContract('joomla-t4-bs5-blank')
  const css = joomlaSlot(
    loadProfile(ROOT, 'refero:194faa2f-2f69-4bbf-9e29-290f28fa8ca2'),
    contractBase(ROOT, c),
    c
  ).css
  const rules = css.split('}').map((r) => r.trim())
  const sized = rules.filter((r) => /\{padding-top:/.test(r))
  assert.ok(sized.length, 'no button size rule')
  for (const r of sized)
    for (const s of r.split('{')[0].split(/,(?![^(]*\))/)) assert.match(s, /:not\(header \*, nav \*/, s)
  // the corner reaches the header's buttons too (its own rule, which skips a button joined to a field)
  const shaped = rules.find((r) => /\.btn[^{]*\{border-radius:min\(/.test(r))
  assert.ok(shaped && !shaped.includes('header *'), shaped)
})

test("a wider face takes the hero cap down by its width, never past 0.8 of the template's size (Tracy Business under Eddie, 14/10/2026)", async () => {
  const { advanceOf } = await import('../src/fonts.mjs')
  const { heroCap, templateSizes } = await import('../src/emit.mjs')
  // the table reads a stack by its first family it knows; a face it does not know answers null
  assert.equal(advanceOf('Inter', 600), 0.487)
  assert.equal(advanceOf('"Waldenburg", Inter, sans-serif', 600), 0.487)
  assert.equal(advanceOf('Satoshi, sans-serif'), null)
  // Eddie's Inter 600 sets Tracy Business's words 1.2x as wide as its Newsreader 400 at -0.025em: the
  // 80px a size cap allowed stood six lines in the half-width hero column
  const sizes = templateSizes(loadContract('joomla-tracy-business'))
  assert.deepEqual(sizes.templateDisplayFace, { family: 'Newsreader', weight: 400, tracking: -0.025 })
  assert.equal(slotVars(loadProfile(ROOT, EDDIE), sizes)['--ds-size-display'], '66px')
  // Notion's Inter 400 at -0.028em sets them barely wider: its own 72px stays
  const notion = loadProfile(ROOT, 'refero:2bf4c61f-de10-4614-ba1b-20c0453bd2a9')
  assert.equal(slotVars(notion, sizes)['--ds-size-display'], '72px')
  // a face the table does not know (JA Archi's Satoshi) keeps the size cap alone
  const archi = templateSizes(loadContract('joomla-gk-archi'))
  assert.equal(
    slotVars(loadProfile(ROOT, EDDIE), archi)['--ds-size-display'],
    slotVars(loadProfile(ROOT, EDDIE), { ...archi, templateDisplayFace: null })['--ds-size-display']
  )
  // the floor: an extended face 2.5x as wide sets 0.8 of the template's hero, not a third of it
  assert.equal(heroCap(64), 80)
  assert.equal(heroCap(64, 1.2), 67)
  assert.equal(heroCap(58, 2.5), 46)
})

test("a system's phone headline grows at most a quarter over the template's own phone headline (JA Aiga under Eddie)", async () => {
  const { templateSizes } = await import('../src/emit.mjs')
  const eddie = loadProfile(ROOT, EDDIE)
  const aiga = loadContract('joomla-ja-aiga')
  const sizes = templateSizes(aiga)
  assert.deepEqual(sizes, {
    templateDisplay: 45,
    templateDisplayPhone: 20,
    templateHeading: null,
    templateButton: null,
    templateDisplayFace: { family: 'Prata', weight: 400, tracking: 0 },
    templateGutter: 32
  })
  // 20px on a phone, 45px on a desktop: the one-sentence hero stays a few lines, not seven
  assert.equal(slotVars(eddie, sizes)['--ds-size-display-phone'], '25px')
  assert.equal(slotVars(eddie, sizes)['--ds-size-display'], '56px')
  // a contract that never measured its phone hero keeps the desktop-derived phone size
  assert.equal(slotVars(eddie, { templateDisplay: 45 })['--ds-size-display-phone'], 'min(40px, 10vw)')
})

test("a fill the system cannot wear lets the page's rules reach it (JA Alpha's red services band follows its followRules)", async () => {
  const { joomlaSlot } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const { bandColours } = await import('../src/bands.mjs')
  const { tokens56 } = await import('../src/tokens56.mjs')
  const c = loadContract('joomla-ja-alpha')
  const key = '.t4-section.t4-section-1.section-overlap.t4-palette-primary'
  const spotify = loadProfile(ROOT, 'refero:1514a95f-878c-4d4d-bb14-99d1b83f6227')
  // white cards and white words on the red: no ground of the system reads both
  assert.equal(bandColours(tokens56(spotify, contractBase(ROOT, c)).tokens, c.bands[key]), null)
  const css = joomlaSlot(spotify, contractBase(ROOT, c), c).css
  const follow = css
    .split('}')
    .find((r) => r.includes(' .t4-palette-primary:not(') && r.includes('{background-color:'))
  assert.ok(follow, 'the band follows its followRules')
  assert.ok(!follow.split('{')[0].includes(key), follow)
  // a fill the system wears still fences the page's rules off (its own words rule paints it)
  assert.match(css, /\.bg-primary:not\(|\.bg-primary \*/)
})

test("a system's section heading grows at most a quarter over the template's own (JA Company under Airbnb)", async () => {
  const { templateSizes } = await import('../src/emit.mjs')
  const airbnb = loadProfile(ROOT, 'refero:194faa2f-2f69-4bbf-9e29-290f28fa8ca2')
  const company = loadContract('joomla-ja-company')
  const sizes = templateSizes(company)
  assert.equal(sizes.templateHeading, 23)
  const free = Number.parseFloat(slotVars(airbnb, {})['--ds-size-heading'])
  const capped = Number.parseFloat(slotVars(airbnb, sizes)['--ds-size-heading'])
  // never under the floor, never over 1.25 x the template's 23px (29px) unless the floor asks for more
  assert.ok(capped <= Math.max(29, 28), `${capped}`)
  assert.ok(capped <= free)
  assert.ok(capped >= 28)
})

test('Joomla: card and list titles keep the template size, menu toggles keep its look, header buttons its type', async () => {
  const { joomlaSlot } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const c = loadContract('joomla-ja-educatsy')
  const moxie = loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
  const css = joomlaSlot(moxie, contractBase(ROOT, c), c).css
  // the section heading size: never on a heading inside an article, a list item, a card or an *-item
  const sizes = css
    .split('\n')
    .filter((l) => /\{font-size:[^;}]+(;text-wrap-style:balance)?\}$/.test(l) && l.includes(' h2'))
  assert.ok(sizes.length > 0)
  for (const l of sizes) assert.match(l, /:not\(article \*, li \*, \.card \*/, l)
  // the accent fill of the primary button never reaches a menu toggle
  const fill = css.split('\n').find((l) => l.includes('{background-color:var(--ds-c-accent);'))
  assert.match(fill, /:not\(\.navbar-toggler/)
  // the button's type (size, case, tracking) stops at the header
  const type = css
    .split('\n')
    .find(
      (l) =>
        /\{font-size:[^}]*text-transform|\{font-size:[^}]*letter-spacing|\{text-transform/.test(l) &&
        l.includes('.btn')
    )
  if (type) assert.match(type, /:not\(header \*/)
})

test('the probe asks no section heading size of a heading inside a card or a listed post (JA Magz II)', async () => {
  const { score } = await import('../src/probe.mjs')
  const exp = { 'heading.fontSize': ['px', [36, 26]] }
  // a news site's heading role is a listed post's title: it keeps the template's 22px
  assert.equal(score({ roles: { heading: { fontSize: '22px', inItem: true } } }, exp, 'desktop').total, 0)
  // a section heading still takes the system's
  const s = score({ roles: { heading: { fontSize: '22px', inItem: false } } }, exp, 'desktop')
  assert.equal(s.total, 1)
  assert.equal(s.ok, 0)
})

test('Joomla: Bootstrap components wear the system, a flipped page flips a one-tone logo, a button is at most 2em round', async () => {
  const { joomlaSlot } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const { score } = await import('../src/probe.mjs')
  // JA Fit: a dark template; under Stripe (light) its white logo would vanish on the header the page turned white
  const fit = loadContract('joomla-ja-fit')
  const stripe = loadProfile(ROOT, 'refero:48e5de76-05d5-4c4e-a269-c7c245b291ec')
  const css = joomlaSlot(stripe, contractBase(ROOT, fit), fit).css
  // the logo T4 draws for the worn side (span.d-light here) is left out of the flip
  assert.match(
    css,
    /\.logo img:where\(:not\(span\.d-light \*\)\):not\([^{]*\{filter:invert\(1\) hue-rotate\(180deg\)\}/
  )
  assert.match(
    css,
    /\.pagination > li > a[^{]*\{background-color:var\(--ds-c-surface\);color:var\(--ds-c-fg\)/
  )
  assert.match(
    css,
    /\.pagination > \.active > a[^{]*\{background-color:var\(--ds-c-accent\);color:var\(--ds-c-accent-on\)/
  )
  assert.match(css, /border-radius:min\([^,]+, 2em\)/)
  // under a dark system the dark template is not flipped: no logo filter
  const moxie = loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
  assert.ok(!joomlaSlot(moxie, contractBase(ROOT, fit), fit).css.includes('.logo img:where(:not(span.d-'))
  // the probe reads a capped pill as a pill: 9999px wanted, 20px on a 40px tall button
  const exp = { 'button-primary.borderTopLeftRadius': ['radius', '9999px'] }
  assert.equal(
    score(
      { roles: { 'button-primary': { borderTopLeftRadius: '20px', fontSize: '16px', height: 40 } } },
      exp,
      'desktop'
    ).ok,
    1
  )
  assert.equal(
    score(
      { roles: { 'button-primary': { borderTopLeftRadius: '6px', fontSize: '16px', height: 40 } } },
      exp,
      'desktop'
    ).ok,
    0
  )
})

test('Joomla: Bootstrap ground and ink utilities wear the system, and a padded button keeps its padding inside its width', async () => {
  const { joomlaSlot } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const c = loadContract('joomla-ja-purity-iv')
  const css = joomlaSlot(
    loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'),
    contractBase(ROOT, c),
    c
  ).css
  assert.match(css, /\.bg-white:not\([^{]*\{background-color:var\(--ds-c-surface\)!important\}/)
  assert.match(css, /\.text-dark,\.text-body\):where\([^{]*\{color:var\(--ds-c-fg\)!important\}/)
  assert.match(css, /padding-left:[^;}]+;padding-right:[^;}]+;(line-height:[^;}]+;)?box-sizing:border-box/)
})

test('Joomla: .bg-light wears the quiet raised ground, and dark words on a coloured utility fill are left to the fill (lane D, 16/10/2026)', async () => {
  const { joomlaSlot } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const c = loadContract('joomla-ja-purity-iv')
  const css = joomlaSlot(
    loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'),
    contractBase(ROOT, c),
    c
  ).css
  // a full-width .bg-light section the template lifts 1.04:1 became a 1.21:1 block on Moxie's page (JA Trip, Vega)
  assert.match(css, /\.bg-light:not\([^{]*\{background-color:var\(--ds-c-surface-warm\)!important\}/)
  assert.match(css, /\.bg-white:not\([^{]*\{background-color:var\(--ds-c-surface\)!important\}/)
  // .badge.bg-warning.text-dark read the page's text colour on the warning fill (1.05:1 under Moxie)
  const ink = css.split('}').find((r) => /\.text-dark/.test(r) && /color:var\(--ds-c-fg\)!important/.test(r))
  assert.ok(ink, 'the .text-dark rule')
  for (const fill of ['primary', 'secondary', 'success', 'info', 'warning', 'danger', 'dark'])
    assert.ok(ink.includes(`.bg-${fill}`), `.text-dark skips .bg-${fill}`)
  assert.ok(!/\.bg-white/.test(ink), 'the page grounds keep the system text')
})

test('Joomla: dark words on the .bg-light raised fill are left to the fill, so a heading badge keeps the template pair (JA Vega, 16/10/2026)', async () => {
  const { joomlaSlot } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const c = loadContract('joomla-ja-vega')
  const css = joomlaSlot(
    loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'),
    contractBase(ROOT, c),
    c
  ).css
  // the T4 typography page's "New" badge (span.badge.bg-light.text-dark in p.h6) read Moxie's body text #858273
  // inside a cream heading (HIER-1): .bg-light is a worn fill of its own (--ds-c-surface-warm) since emitter B
  const ink = css.split('}').find((r) => /\.text-dark/.test(r) && /color:var\(--ds-c-fg\)!important/.test(r))
  assert.ok(ink, 'the .text-dark rule')
  assert.ok(ink.includes('.bg-light'), '.text-dark skips .bg-light and what it holds')
})

test('EmDash ink role: a dark system keeps a dark ink band, a light one paints it with its text colour (#1309)', async () => {
  const { loadContract } = await import('../src/library.mjs')
  const { luminance, parseHex } = await import('../src/colour.mjs')
  const c = loadContract('emdash-tracy-business')
  // Moxie is a dark system: black page, cream text. Before, .band-ink wore the text colour (cream hero)
  const moxie = emdashCss(loadProfile(ROOT, MOXIE), c)
  assert.ok(moxie.vars['--ds-c-ink'], 'ink role emitted')
  assert.ok(
    luminance(parseHex(moxie.vars['--ds-c-ink'])) < 0.3,
    `Moxie ink is dark: ${moxie.vars['--ds-c-ink']}`
  )
  assert.notEqual(moxie.vars['--ds-c-ink'], moxie.vars['--ds-c-fg'])
  assert.ok(contrast(moxie.vars['--ds-c-on-ink'], moxie.vars['--ds-c-ink']) >= 4.5, 'on-ink reads on ink')
  // Apple is a light system: its ink band is its text colour, its on-ink text the page
  const apple = emdashCss(loadProfile(ROOT, 'od:apple'), c)
  assert.equal(apple.vars['--ds-c-ink'], apple.vars['--ds-c-fg'])
  assert.equal(apple.vars['--ds-c-on-ink'], apple.vars['--ds-c-bg'])
  assert.ok(
    luminance(parseHex(apple.vars['--ds-c-ink'])) < 0.3,
    `Apple ink is dark: ${apple.vars['--ds-c-ink']}`
  )
  // the accent-filled button on the ink band stands out there (the theme reads the roles itself)
  assert.ok(contrast(moxie.vars['--ds-c-accent'], moxie.vars['--ds-c-ink']) >= 3, 'the button on the ink')
})

test("an OpenDesign system's type and shape reach the Tracy Business EmDash theme (#1309)", async () => {
  const { loadContract } = await import('../src/library.mjs')
  const c = loadContract('emdash-tracy-business')
  const bmw = emdashCss(loadProfile(ROOT, 'od:bmw'), c)
  // read off the reference page (components.html): weights, sizes, radius, button padding
  assert.equal(bmw.vars['--ds-weight-display'], 300)
  assert.equal(bmw.vars['--ds-weight-button'], 700)
  assert.equal(bmw.vars['--ds-size-display'], '60px')
  assert.equal(bmw.vars['--ds-size-heading'], '32px')
  assert.equal(bmw.vars['--ds-btn-radius'], '0px')
  assert.equal(bmw.vars['--font-weight-semibold'], 400)
  // tracy-base (no contract) keeps the look it was measured with
  const base = emdashCss(loadProfile(ROOT, 'od:bmw'))
  assert.equal(base.vars['--ds-weight-display'], undefined)
})

test('Tracy Base and Tracy SaaS EmDash keep both modes and read the type tokens, like Tracy Business', () => {
  // measured 14/10/2026 on the released Tracy Base 0.5.2 and Tracy SaaS 1.4.12: ROLE-1 failed (the
  // template's own weights, sizes and radii stayed under BMW, Stripe and Spotify) and MODE-2 failed
  // (the switch was hidden)
  for (const [name, toggle] of [
    ['emdash-base', '[data-tracy-theme-toggle]'],
    ['emdash-tracy-saas', '.k-theme-toggle']
  ]) {
    const c = loadContract(name)
    assert.equal(c.modes, true, name)
    assert.equal(c.readsComponents, true, name)
    assert.equal(c.selectors?.themeToggle, toggle, name)
    const moxie = emdashCss(loadProfile(ROOT, MOXIE), c)
    assert.equal(moxie.mode, 'dark', name)
    assert.match(moxie.css, /^\/\* mode: dark \*\/$/m, name)
    assert.doesNotMatch(moxie.css, /display: none !important/, `${name}: the switch is not hidden`)
    const bmw = emdashCss(loadProfile(ROOT, 'od:bmw'), c)
    assert.equal(bmw.mode, 'light', name)
    assert.match(bmw.css, /--ds-weight-display: 300;/, `${name}: BMW's display weight off its reference page`)
  }
})

test('a template with two modes gets both sides: the system’s own under its side, the other derived, the switch kept (#1315)', async () => {
  const { loadContract } = await import('../src/library.mjs')
  const { luminance, parseHex } = await import('../src/colour.mjs')
  const c = loadContract('emdash-tracy-business')
  assert.equal(c.modes, true)
  // Moxie is dark: its own values under the dark side, a derived light side under the other
  const r = emdashCss(loadProfile(ROOT, MOXIE), c)
  assert.equal(r.mode, 'dark')
  assert.match(r.css, /^\/\* mode: dark \*\/$/m)
  assert.match(r.css, /^:root\[data-theme="dark"\] \{\n(?:.*\n)*? {2}--ds-c-bg: #000000;/m)
  assert.match(r.css, /^:root:not\(\[data-theme="dark"\]\) \{/m)
  assert.ok(
    luminance(parseHex(r.derivedVars['--ds-c-bg'])) > 0.7,
    `derived light page: ${r.derivedVars['--ds-c-bg']}`
  )
  // the accent is kept where it stands out 3:1 on the new ground, else moved toward the new text colour
  // just far enough (Moxie's light blue on its cream: shifted)
  assert.ok(
    contrast(r.derivedVars['--ds-c-accent'], r.derivedVars['--ds-c-bg']) >= 3,
    'the accent fill stands out on the derived page'
  )
  assert.equal(r.derivedVars['--ds-font-body'], r.vars['--ds-font-body'], 'type is kept')
  assert.doesNotMatch(r.css, /display: none !important/, 'the switch is not hidden')
  // each side writes its own accent for the ink band, readable on that side's ink
  for (const v of [r.vars, r.derivedVars])
    assert.ok(contrast(v['--ds-c-accent-on-ink'], v['--ds-c-ink']) >= 4.5, 'accent on ink reads')
  // Apple is light: the mirror image
  const a = emdashCss(loadProfile(ROOT, 'od:apple'), c)
  assert.equal(a.mode, 'light')
  assert.match(a.css, /^:root:not\(\[data-theme="dark"\]\) \{\n(?:.*\n)*? {2}--ds-c-bg: #ffffff;/m)
  assert.ok(
    luminance(parseHex(a.derivedVars['--ds-c-bg'])) < 0.05,
    `derived dark page: ${a.derivedVars['--ds-c-bg']}`
  )
  // a contract without modes keeps one look and hides the switch, as before
  const one = emdashCss(loadProfile(ROOT, MOXIE))
  assert.equal(one.mode, undefined)
  assert.match(one.css, /display: none !important/)
})

test('a two-mode WordPress template writes each side its own link colour, even where its accent needs no move', async () => {
  const { wordpressVariation } = await import('../src/wordpress.mjs')
  const { contractBase } = await import('../src/library.mjs')
  // Tracy Base under Mailchimp: the light side moves the yellow to #7f6f18 for links; the derived dark side reads
  // the yellow as it is, and its links kept the light side's #7f6f18 on the dark page (3.3:1)
  const c = loadContract('wordpress-tracy-base')
  const css = wordpressVariation(
    loadProfile(ROOT, 'refero:24929007-7e62-4c96-a940-7de65438a578'),
    contractBase(ROOT, c),
    c
  ).css
  const dark =
    /:root:where\(\[data-theme="dark"\]\) :where\(a:where\(:not\(\.wp-element-button\)\)\)\{color:(#[0-9a-f]{6})\}/.exec(
      css
    )
  assert.ok(dark, 'the dark side writes its link colour')
  assert.notEqual(dark[1], '#7f6f18')
})

test("Joomla: a content button's label wraps inside its box, a header button's keeps the template's line (JA Donate's 40-character label)", async () => {
  const { joomlaSlot } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const c = loadContract('joomla-ja-donate')
  const css = joomlaSlot(loadProfile(ROOT, EDDIE), contractBase(ROOT, c), c).css
  const sized = css.split('}').filter((r) => /white-space:normal/.test(r) && /\.btn/.test(r))
  assert.ok(sized.length, 'no wrapping button rule')
  for (const r of sized)
    for (const s of r.split('{')[0].split(/,(?![^(]*\))/)) assert.match(s, /:not\(header \*, nav \*/, s)
})

test("Joomla: an off-canvas menu panel wears the system's page, as its words already do (JA Fresco's #212529 panel)", async () => {
  const { joomlaSlot } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const c = loadContract('joomla-ja-fresco')
  const css = joomlaSlot(loadProfile(ROOT, EDDIE), contractBase(ROOT, c), c).css
  const panel = css
    .split('}')
    .find((r) => r.includes('.t4-offcanvas') && r.includes('background-color:var(--ds-c-bg)'))
  assert.ok(panel, 'no panel rule')
  for (const s of ['.t3-off-canvas', '.offcanvas']) assert.ok(panel.includes(s), s)
  // and what the framework paints apart inside it: the header strip, its close button, T4's submenu chevrons
  const rules = css.split('}')
  const strip = (r) =>
    r.includes('.t4-off-canvas-header:') &&
    r.includes('.t4-off-canvas-header .close:') &&
    r.includes('background-color:var(--ds-c-bg)')
  assert.ok(rules.some(strip), 'header strip and close')
  assert.ok(
    rules.some((r) => /\.btn-toggle:not\([^{]*\)::after\{color:var\(--ds-c-fg\)/.test(r)),
    'chevrons'
  )
})

test('the EmDash slot holds each template hero to its own size, as WordPress and Joomla do (Eddie, 14/10/2026)', () => {
  // Eddie's display is min(119px, 6vw): 86px at 1440, five and six lines in tracy-base's centred hero
  // column and Tracy Business's half-width one, because emdashCss passed the slot no template sizes
  for (const [name, own] of [
    ['emdash-base', 56],
    ['emdash-tracy-business', 64],
    ['emdash-tracy-saas', 52]
  ]) {
    const c = loadContract(name)
    assert.equal(templateDisplayPx(c), own, name)
    const size = emdashCss(loadProfile(ROOT, EDDIE), c).vars['--ds-size-display']
    assert.match(String(size), /^\d+px$/, `${name}: ${size}`)
    assert.ok(Number.parseInt(size, 10) <= Math.round(own * DISPLAY_OVER_TEMPLATE), `${name}: ${size}`)
  }
})

test('Joomla: the module fits its TEXT column — long band guards are written once a rule (nestNots)', async () => {
  const { joomlaSlot, nestNots, MODULE_MAX_BYTES } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  const L = `:not(${['.a', '.b', '.c', '.d', '.e', '.f', '.g', '.h', '.i', '.j', '.k', '.l'].flatMap((x) => [x, `${x} *`]).join(', ')})`
  const css = `:root .x${L},:root .y > a${L}::before{color:red}\n@media (max-width:639px){:root .z${L}{color:blue}}\n:root .w:not(.v){color:green}`
  assert.equal(
    nestNots(css),
    `${L}{:root .x&,:root .y > a&::before{color:red}}\n@media (max-width:639px){${L}{:root .z&{color:blue}}}\n:root .w:not(.v){color:green}`
  )
  // a rule whose selectors carry different guards, or a short one, is left as it is
  const mixed = `:root .x${L},:root .y:not(.q){color:red}`
  assert.equal(nestNots(mixed), mixed)
  // JA Impact, the largest Joomla sheet, was 72 KB under Moxie (14/10/2026): under the limit now
  const c = loadContract('joomla-ja-impact')
  const r = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, c), c)
  assert.ok(new TextEncoder().encode(r.html).length <= MODULE_MAX_BYTES)
})

test('the scripts the measuring browser runs in a page parse (a syntax error there stops nothing, silently)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../scripts/cdp.mjs', import.meta.url), 'utf8')
  // every page expression is an async arrow written in a template literal: `(async () => { … })()`
  const exprs = [...src.matchAll(/expression: `(\(async \(\) => \{[\s\S]*?\}\)\(\))`/g)].map((m) => m[1])
  assert.ok(exprs.length >= 3, `${exprs.length} expressions found`)
  for (const e of exprs) assert.doesNotThrow(() => new Function(`return ${e}`), e.slice(0, 120))
})

test("the score asks the system's shape only of a role button the contract's button list covers", async () => {
  const { score } = await import('../src/probe.mjs')
  const exp = {
    'button-primary.borderTopLeftRadius': ['radius', '1000px'],
    'button-primary.fontWeight': ['exact', '500'],
    'button-primary.backgroundColor': ['colour', '#84acfb']
  }
  const view = (shaped) => ({
    roles: {
      'button-primary': {
        borderTopLeftRadius: '0px',
        fontWeight: '700',
        backgroundColor: 'rgb(132, 172, 251)',
        shaped
      }
    }
  })
  // JA Restaurant's split .btn-decor: left to the template by the contract, only its colour is the system's
  assert.deepEqual(score(view(false), exp, 'desktop').misses, [])
  assert.equal(score(view(true), exp, 'desktop').misses.length, 2)
  assert.equal(score(view(undefined), exp, 'desktop').misses.length, 2)
})

test('Joomla: the logo T4 draws for the worn side is never inverted (JA Purity IV)', async () => {
  const { joomlaSlot } = await import('../src/joomla.mjs')
  const { contractBase } = await import('../src/library.mjs')
  // JA Purity IV shows its dark-mode logo (span.d-dark, a white wordmark) under a dark system: the flip leaves it
  // alone, or it turned dark on the black header (look review v8, 15/10/2026)
  const purity = loadContract('joomla-ja-purity-iv')
  const moxie = loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
  const dark = joomlaSlot(moxie, contractBase(ROOT, purity), purity).css
  for (const line of dark
    .split('\n')
    .filter((l) => l.includes('{filter:invert(1) hue-rotate(180deg)}') && l.includes('.logo img')))
    assert.ok(line.includes('.logo img:where(:not(span.d-dark *))'), line.slice(0, 120))
})

test('Tracy Business EmDash: status colours are the system’s, readable on the page and on their grounds (15/10/2026)', () => {
  // measured on every declared page under Moxie and Figma, light and dark: the template's status
  // literals stayed its own (TPL-1). The theme reads the status roles (15/10/2026): each is the template's
  // hue tuned to the system, never its literal, and reads on the page and on its pale ground
  const c = loadContract('emdash-tracy-business-roles')
  const figma = emdashCss(loadProfile(ROOT, 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671'), c)
  for (const vars of [figma.vars, figma.derivedVars]) {
    const page = vars['--ds-c-bg']
    for (const [role, own] of [
      ['danger', '#c0392b'],
      ['success', '#2e7d32'],
      ['warn', '#c8891b']
    ]) {
      assert.notEqual(vars[`--ds-c-${role}`], own)
      assert.ok(contrast(vars[`--ds-c-${role}`], page) >= 4.5, `${role} reads on the page`)
      assert.ok(contrast(vars[`--ds-c-${role}-text`], vars[`--ds-c-${role}-bg`]) >= 4.5, `${role} words`)
    }
    assert.ok(contrast(vars['--ds-c-info-text'], vars['--ds-c-info-bg']) >= 4.5)
  }
  // no shape rule on the submit buttons: they read the corner roles themselves (the one shape rule left is
  // the header's search button, which 1.7.22 draws square beside the call to action)
  assert.equal(figma.css.match(/\{ border-radius/g)?.length, 2)
  assert.equal(figma.css.match(/:is\(header a\[href\$="\/search"\]\) \{ border-radius/g)?.length, 2)
  assert.ok(!/(ec-form|submit)[^{]*\{ border-radius/.test(figma.css))
})
