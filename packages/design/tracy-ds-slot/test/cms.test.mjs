// The WordPress variation and the Joomla module sheet a system is worn with (src/wordpress.mjs,
// src/joomla.mjs): what each carries, what it never carries, and what it refuses.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { TOKEN_NAMES } from '@tracy/wordpress-theme/variation'
import { roleValues } from '../src/auto-palette.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { baseTokens, contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { variationSlug, wordpressVariation } from '../src/wordpress.mjs'

/** A literal string escaped for a pattern. */
const esc = (/** @type {string} */ x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const ARTE = 'refero:2f94c1f0-cd23-4bf1-95f3-0e531174c4f4'
const MOTHERDUCK = 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'
const HI = ':root:root:root:root:root:root'
/**
 * A contract as one sheet for one profile: the tests here read the rules a side is written with; a
 * two-mode contract (`modes`) writes them once per side, scoped (test/two-modes.test.mjs).
 */
const oneLook = (name) => ({ ...loadContract(name), modes: undefined })
const wpContract = oneLook('wordpress-tracy-base')
const joContract = oneLook('joomla-tracy-base')
const apple = baseTokens(ROOT, 'od:apple')

test('the base system carries all 56 contract tokens (the variation starts from the template, never from blanks)', () => {
  for (const n of TOKEN_NAMES) assert.equal(typeof apple[n], 'string', n)
})

test('WordPress: a variation the theme accepts — its own id, every preset, the system on top', () => {
  const r = wordpressVariation(loadProfile(ROOT, MOXIE), apple, wpContract, {
    fontFaces: [
      {
        fontFamily: 'IBM Plex Serif',
        fontStyle: 'normal',
        fontWeight: '300',
        src: ['https://fonts.gstatic.com/s/x.woff2']
      }
    ]
  })
  assert.match(r.slug, /^[a-z0-9-]+$/)
  assert.equal(r.slug, variationSlug(MOXIE))
  const v = r.variation
  assert.equal(v.settings.custom.tracy.inspiration, r.slug)
  assert.equal(v.settings.color.palette.length, 16)
  const bg = v.settings.color.palette.find((c) => c.slug === 'bg')
  assert.equal(bg.color, '#000000')
  const display = v.settings.typography.fontFamilies.find((f) => f.slug === 'display')
  assert.equal(display.fontFamily, '"IBM Plex Serif", serif')
  assert.equal(display.fontFace[0].fontDisplay, 'swap')
  assert.equal(v.styles.elements.button.border.radius, '1000px')
})

test('WordPress: styles.css names the system, keeps one look, and outranks theme rules without !important on content', () => {
  const css = wordpressVariation(loadProfile(ROOT, MOXIE), apple, wpContract).css
  assert.match(css, /^\/\* tracy-ds-slot: refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0 \*\//)
  assert.match(css, /:root:root:root:root:root:root\{color-scheme:dark\}/)
  assert.doesNotMatch(css, /prefers-color-scheme|data-theme="dark"/)
  // the display line one class heavier than the all-headings rule (its own weight wins)
  assert.ok(css.includes(`${HI} .tracy-display:not(.tracy-ds-display){`))
  // !important only on the toggle and the logo pair, never on a type or shape value
  for (const line of css.split('\n').filter((l) => l.includes('!important')))
    assert.match(
      line,
      /data-tracy-theme-toggle|tracy-logo-|has-accent-color|eyebrow|btn--ghost|button__link|more-link|summary::after|a:hover/,
      line
    )
})

test('WordPress: a font face that is not from Google is dropped', () => {
  const v = wordpressVariation(loadProfile(ROOT, MOXIE), apple, wpContract, {
    fontFaces: [
      {
        fontFamily: 'IBM Plex Serif',
        fontStyle: 'normal',
        fontWeight: '300',
        src: ['https://evil.example/x.woff2']
      }
    ]
  }).variation
  assert.equal(v.settings.typography.fontFamilies.find((f) => f.slug === 'display').fontFace, undefined)
})

test('WordPress: a kept band keeps its own buttons — the system’s colour rules stop at its edge', () => {
  // Tracy Business, 10/10/2026: its primary-button rule matches every button, so under every system
  // the hero's orange call to action (is-style-orange) took the green accent the band keeps, and under
  // MotherDuck (whose accent needs a readable text pair) the hero's outline button read #4d6c84 on it
  const business = oneLook('wordpress-tracy-business')
  const css = wordpressVariation(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, business), business).css
  const kept = `:not(${business.keepScopes.flatMap((x) => [x, `${x} *`]).join(', ')})`
  const lines = css.split('\n')
  const selectorsOf = (line) => line.slice(0, line.indexOf('{')).split(/,(?![^(]*\))/)
  const primary = lines.filter((l) => l.includes('{background-color:var(--wp--preset--color--accent);'))
  // the theme's own accent-text rules (a band's copies of a contract's inline-style followRules, which name
  // `[style`, are judged by the band)
  const accentText = lines.filter(
    (l) => /\{color:#[0-9a-f]{6}!important\}$/i.test(l) && !l.includes('[style')
  )
  assert.equal(primary.length, 1)
  assert.equal(accentText.length, 2)
  for (const line of [...primary, ...accentText])
    for (const s of selectorsOf(line)) assert.ok(s.includes(kept), s)
  // a pseudo-element stays last
  assert.ok(css.includes(`.tracy-faq__item summary${kept}::after`))
  // the band keeps its colours, not its shapes: the button shape rule still reaches every button of a
  // band (15/10/2026: not a text-link button, nor an inner-page call's ruled outline link, which
  // grew into a box under the system's padding — the selector's own :not, never the kept bands')
  const shape = lines.find((l) => l.startsWith(`${HI} .tracy .wp-block-button:not(.is-style-link)`))
  assert.ok(shape && !shape.includes(kept), shape)
  // a template without kept bands or fills gets the very same selectors as before
  const { bands: _wpBands, ...plain } = wpContract
  const base = wordpressVariation(loadProfile(ROOT, MOXIE), apple, {
    ...plain,
    keepScopes: [],
    autoPalette: null
  }).css
  assert.ok(!base.replaceAll(':not(.tracy-ds-display)', '').includes(':not(.'), 'no kept band, no exclusion')
})

test('WordPress: an outline or text-link button keeps its kind — only a filled button takes the accent fill', () => {
  // Tracy Business, 10/10/2026: its primary-button rule named every button, so under a system the
  // text-link calls ("All services →", is-style-link) and the outline ones became filled accent pills
  const business = oneLook('wordpress-tracy-business')
  const css = wordpressVariation(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, business), business).css
  const lines = css.split('\n')
  const primary = lines.find((l) => l.includes('{background-color:var(--wp--preset--color--accent);'))
  for (const s of primary.slice(0, primary.indexOf('{')).split(/,(?![^(]*\))/))
    assert.ok(s.includes('.wp-block-button:not(.is-style-outline):not(.is-style-link) > '), s)
  // a text link reads the accent made readable on the page, as an outline button already does
  const accentText = lines.find((l) => /\{color:#[0-9a-f]{6}!important\}$/i.test(l) && l.includes('summary'))
  assert.ok(accentText.includes('.tracy .wp-block-button.is-style-link .wp-block-button__link:not('))
})

test('Joomla: one link to Google Fonts and one style block — tokens on every theme scope, T4 runtime and landing variables on top', () => {
  const r = joomlaSlot(loadProfile(ROOT, MOXIE), apple, joContract)
  assert.match(
    r.html,
    /^<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+"><style id="tracy-ds-slot">/
  )
  assert.equal((r.html.match(/<\/style>/g) ?? []).length, 1)
  assert.ok(r.html.endsWith('</style>'))
  assert.ok(r.css.includes(`${joContract.tokenScope}{--bg:#000000;`))
  for (const k of Object.keys(joContract.runtime)) assert.ok(r.css.includes(`${k}:var(`), k)
  assert.ok(r.css.includes(`${HI} .tracy-native-landing,`))
  assert.match(r.css, /--tracy-capsule:1000px/)
  assert.match(r.css, /--native-title-size:55px/)
  assert.match(r.css, /\[data-tracy-theme-toggle\]\{display:none!important\}/)
})

test('Joomla: a kept band keeps its own buttons and links — the primary-button rule stops at its edge', () => {
  // JA Mood: its primary-button rule names every link (`a`), and inside a kept band keepRules resets
  // --ds-c-* to initial, so var(--ds-c-accent) there was no colour at all (10/10/2026)
  const mood = oneLook('joomla-ja-mood')
  const css = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, mood), mood).css
  // kept bands and fill bands alike (outsideKept): JA Mood's phone header gradient is a fill (14/10/2026)
  const fills = Object.entries(mood.bands ?? {})
    .filter(([, b]) => b?.fill === true)
    .map(([k]) => k)
  const kept = `:not(${[...mood.keepScopes, ...fills].flatMap((x) => [x, `${x} *`]).join(', ')})`
  const primary = css
    .split('\n')
    .filter((l) => l.includes('{background-color:var(--ds-c-accent);background-image:none'))
  assert.equal(primary.length, 1)
  const selectors = primary[0].slice(0, primary[0].indexOf('{')).split(/,(?![^(]*\))/)
  // the menu toggles are never a filled button (14/10/2026): that weightless :where(:not()) first, then the kept
  // bands'
  const toggles = /:where\(:not\(\.navbar-toggler[^)]*\)\)/g
  assert.deepEqual(
    selectors.map((s) => s.replace(`${HI} `, '').replace(toggles, '')),
    mood.selectors.buttonPrimary.map((s) => `${s}${kept}`)
  )
  // a contract without kept bands gets the very same selectors as before, the toggles aside
  assert.ok(
    !joomlaSlot(loadProfile(ROOT, MOXIE), apple, joContract)
      .css.replaceAll(':not(.tracy-ds-display)', '')
      .replace(toggles, '')
      .includes(':not(.')
  )
})

test('Joomla: buttonTextImportant writes the accent’s own text !important, only where a contract asks', () => {
  // JA Rights: .btn.btn-secondary{color:#fff!important} kept white on every accent (11/10/2026)
  const rights = oneLook('joomla-ja-rights')
  const css = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, rights), rights).css
  assert.match(
    css,
    /background-color:var\(--ds-c-accent\);background-image:none;border-color:var\(--ds-c-accent\);color:var\(--ds-c-accent-on\)!important/
  )
  const mood = oneLook('joomla-ja-mood')
  const moodCss = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, mood), mood).css
  assert.ok(!moodCss.includes('var(--ds-c-accent-on)!important'))
})

test('Joomla: weightImportant writes the system weights !important, only where a contract asks', () => {
  // JA Campaign: the hero title carries .font-weight-bold (600 !important) from its demo content (11/10/2026)
  const campaign = oneLook('joomla-ja-campaign')
  const css = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, campaign), campaign).css
  assert.match(css, /font-weight:\d+!important/)
  const mood = oneLook('joomla-ja-mood')
  const moodCss = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, mood), mood).css
  assert.ok(!/font-weight:\d+!important/.test(moodCss))
})

test('Joomla: displayImportant writes the display line !important, desktop, phone and Vietnamese, only where a contract asks', () => {
  // JA Justitia: its template.css sets `h1, .h1 { font-size: 1.8rem !important }` up to 575.98px, so the slide
  // title stayed 27px at 390 under every system; JA Kinetic's article title is 44px / 1.1 !important (15/10/2026)
  const plain = {
    ...oneLook('joomla-ja-justitia'),
    displayImportant: undefined,
    containerImportant: undefined
  }
  const sized = { ...plain, displayImportant: true }
  const sel = `${HI} ${sized.selectors.displaySize}`
  const css = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, sized), sized).css
  const lines = css.split('\n')
  const desktop = lines.find((l) => l.startsWith(`${sel}{`)) ?? ''
  assert.match(desktop, /font-size:[^;}]+!important/)
  assert.match(desktop, /line-height:[\d.]+!important/)
  assert.ok(
    lines.some((l) => l.startsWith(`@media (max-width:639px){${sel}{font-size:`) && l.includes('!important'))
  )
  // the Vietnamese line height is !important with them, and still wins: its :lang() weighs one more
  assert.ok(lines.some((l) => l.includes(':lang(vi)') && /line-height:[\d.]+!important/.test(l)))
  // without the flag, byte for byte as before: only those declarations differ
  const before = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, plain), plain).css
  const unbang = lines
    .map((l) =>
      l.includes(sized.selectors.displaySize) && !l.includes('font-family')
        ? l.replaceAll('!important', '')
        : l
    )
    .join('\n')
  assert.equal(unbang, before)
})

test('Joomla: no contract makes the slot write a content width, containerImportant or not (LAYOUT-3)', () => {
  // the content width is the template's (Akemi, 15/10/2026): the old containerImportant opt-in wrote the
  // system's width !important on JA Kinetic's containers; the slot now writes no width at all
  const plain = { ...oneLook('joomla-ja-justitia'), displayImportant: undefined }
  for (const c of [plain, { ...plain, containerImportant: true }]) {
    const css = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, c), c).css
    assert.ok(
      !css.split('\n').some((l) => l.includes(c.selectors.container[0]) && l.includes('max-width:')),
      'no width on the container'
    )
  }
})

test('Joomla: a template sized by Bootstrap utilities takes sizes and shapes !important, a JA template does not', () => {
  // T4 Blank (t4-framework and ijoomla-com-guru-pro quickstarts): its demo content sizes headings with
  // .fs-1 and shapes buttons and cards with .rounded-pill / .rounded-4, each !important (11/10/2026)
  const blank = oneLook('joomla-t4-bs5-blank')
  const css = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, blank), blank).css
  const line = (sel) => css.split('\n').find((l) => l.startsWith(`${HI} ${sel}`)) ?? ''
  assert.match(line(blank.selectors.displaySize), /font-size:[^;}]+!important/)
  assert.match(line(blank.selectors.card[0]), /border-radius:[^;}]+!important/)
  assert.match(line(blank.selectors.button[0]), /border-radius:[^;}]+!important/)
  // colours never: the primary-button fill stays a plain rule
  assert.ok(!/background-color:var\(--ds-c-accent\)!important/.test(css))
  // the JA control: JA Symphony (JA Vega was, until its re-measure of 11/10/2026 gave it kept-band
  // colours and dark-side pictures of its own)
  // its plain rules: a worn band's rules are `!important` by design (bands.test.mjs), and so is a
  // followRules role a contract marks `role!` (JA Symphony's own .btn.btn-primary is !important, 14/10/2026)
  const { bands: _bands, followRules: _followRules, ...ja } = oneLook('joomla-ja-symphony')
  const jaCss = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, ja), ja).css
  assert.ok(!jaCss.includes('!important;'))
  // a kept light band with no text colour of its own (keepText) takes the template's page text back;
  // a kept band of the JA family keeps painting its own
  const band = css.split('\n').find((l) => l.endsWith(`{color:${blank.keepDefaults['--body-text-color']}}`))
  assert.ok(band && blank.keepText.every((x) => band.includes(`${HI} ${x}`)), band)
  assert.ok(!jaCss.split('\n').some((l) => /^[^{]*\{color:#[0-9a-f]+\}$/i.test(l)))
})

test('Joomla: a picture ground gives way under every system, dark-ink images invert only under a dark one', () => {
  // JA Gamex (11/10/2026): its light gradient page picture stayed under Moxie while the text on it
  // turned light; its dark wordmark all but vanished on Moxie's black
  const gamex = oneLook('joomla-ja-gamex')
  const base = contractBase(ROOT, gamex)
  const line = (css, decl) => css.split('\n').find((l) => l.endsWith(`{${decl}}`)) ?? ''
  const dark = joomlaSlot(loadProfile(ROOT, MOXIE), base, gamex).css
  const light = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), base, gamex).css
  for (const css of [dark, light])
    for (const s of gamex.selectors.groundPicture)
      assert.ok(line(css, 'background-image:none').includes(`${HI} ${s.replace(/::(before|after)$/, '')}`), s)
  const ink = line(dark, 'filter:invert(1) hue-rotate(180deg)')
  assert.ok(
    gamex.selectors.inkImages.every((s) => ink.includes(`${HI} ${s}`)),
    ink
  )
  assert.ok(!light.includes('invert('))
  // a contract that names neither gets neither
  // its plain rules: a worn band's rules are `!important` by design (bands.test.mjs)
  const { bands: _bands, ...ja } = oneLook('joomla-ja-symphony')
  const jaCss = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, ja), ja).css
  // (its primary buttons drop a template's gradient picture: that is the button rule, not a ground)
  assert.ok(!line(jaCss, 'background-image:none') && !jaCss.includes('invert('))
})

test('Joomla: menu text, text on an accent band and inline content colours take their roles', () => {
  // JA Landscape: rgba(0, 0, 0, .7) menu links and white on .bg-primary; JA Kidscorner: section
  // titles written style="color:#403d75" by the demo content (11/10/2026)
  const landscape = oneLook('joomla-ja-landscape')
  const css = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, landscape), landscape).css
  const line = (decl) => css.split('\n').find((l) => l.endsWith(`{${decl}}`)) ?? ''
  assert.ok(landscape.selectors.pageText.every((s) => line('color:var(--ds-c-fg)').includes(`${HI} ${s}`)))
  const on = line('color:var(--ds-c-accent-on)')
  for (const s of landscape.selectors.onAccent) {
    assert.ok(on.includes(`${HI} ${s}:not(`), s)
    assert.ok(on.includes(`${HI} ${s} :not(.btn):not(.btn *):not(`), s)
  }
  // never inside a band the page keeps
  assert.ok(on.includes('.t4-footnav *'))
  const kids = oneLook('joomla-ja-kidscorner')
  const kcss = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, kids), kids).css
  for (const [hex, role] of Object.entries(kids.inlineColours)) {
    const l = kcss
      .split('\n')
      .find((x) => x.endsWith(`{color:var(--ds-c-${role})!important}`) && x.includes(hex))
    assert.ok(
      l?.includes(`${HI} [style^="color:${hex}" i]`) && l.includes(`[style*="; color: ${hex}" i]`),
      hex
    )
    // background-color:#… is not a text colour: no form matches it
    assert.ok(!l.includes(`[style*="color:${hex}" i]`), hex)
  }
})

test('both CMS refuse what the gate refuses (arte*: text 3.77:1)', () => {
  const p = loadProfile(ROOT, ARTE)
  assert.match(wordpressVariation(p, apple, wpContract).refused.join(), /contrast-fg-bg/)
  assert.match(joomlaSlot(p, apple, joContract).refused.join(), /contrast-fg-bg/)
})

test("Joomla: a contract's translucent text names are the worn colours at their own opacity, reset in kept bands", () => {
  const c = {
    ...oneLook('joomla-ja-mood'),
    alphaText: true,
    alphaVars: ['fg-2-80', 'accent-text-50'],
    keepScopes: ['.t3-footer']
  }
  const r = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, c), c)
  assert.match(r.css, /--ds-a-fg-2-80:rgba\(\d+, \d+, \d+, 0\.8\)/)
  assert.match(r.css, /--ds-a-accent-text-50:rgba\(\d+, \d+, \d+, 0\.5\)/)
  assert.match(r.css, /\.t3-footer\{[^}]*--ds-a-fg-2-80:initial/)
})

// T4 writes its palette patterns and body colour into media/t4/css/ as literals, again whenever the
// style's colours change, so a tokenized stylesheet cannot reach them (JA Tour 1.0.0, 11/10/2026: body
// text kept #696f8d on cards that followed a dark system, 3.14:1). A contract names those parts.
test('Joomla: followRules paint what the template writes as literals with the worn role, stopped at kept bands', () => {
  const c = {
    ...oneLook('joomla-t4-ja'),
    keepScopes: ['.t4-footer'],
    followRules: {
      body: { color: 'fg' },
      '.t4-palette-light a': { color: 'accent-text!' },
      'bad{': { color: 'fg' },
      '.x': { width: 'fg', color: 'nope' }
    }
  }
  const { css } = joomlaSlot(loadProfile(ROOT, MOXIE), apple, c)
  assert.match(
    css,
    new RegExp(`${HI} body:not\\(\\.t4-footer, \\.t4-footer \\*\\)\\{color:var\\(--ds-c-fg\\)\\}`)
  )
  assert.match(css, /\.t4-palette-light a:not\([^)]*\)\{color:var\(--ds-c-accent-text\)!important\}/)
  assert.doesNotMatch(css, /bad\{|\.x[:{]|var\(--ds-c-nope\)/)
  // no followRules: nothing of the kind
  assert.doesNotMatch(joomlaSlot(loadProfile(ROOT, MOXIE), apple, oneLook('joomla-t4-ja')).css, / body:not/)
})

test('WordPress: followRules paint what the theme writes as literals with the worn role (JA Essence pagination)', () => {
  const essence = oneLook('wordpress-ja-essence')
  const css = wordpressVariation(loadProfile(ROOT, MOXIE), contractBase(ROOT, essence), essence).css
  // the template's strongest ink, which is --fg-2 in JA Essence's own order (textOrder)
  assert.match(css, /\.je-pagination__link[^{]*\{color:var\(--ds-c-fg-2\)\}/)
  assert.match(css, /\.wp-block-post-excerpt__more-link[^{]*\{color:var\(--ds-c-fg-2\)\}/)
  // a contract without followRules writes none of them
  assert.doesNotMatch(wordpressVariation(loadProfile(ROOT, MOXIE), apple, wpContract).css, /je-pagination/)
})

test('WordPress: a kept band keeps the light scheme under a dark system only (a band kept as JA Impact kept its footer bar)', () => {
  const impact = { ...oneLook('wordpress-ja-impact'), keepScopes: ['.jim-footer__bar'] }
  const css = (id) => wordpressVariation(loadProfile(ROOT, id), contractBase(ROOT, impact), impact).css
  assert.match(css(MOXIE), /\.jim-footer__bar[^{]*\{color-scheme:light\}/)
  assert.doesNotMatch(css(MOTHERDUCK), /jim-footer__bar\{color-scheme/)
})

test('WordPress: sideRules apply on the side of light the worn page is on (JA Kinetic)', () => {
  const kinetic = oneLook('wordpress-ja-kinetic')
  const css = (id) => wordpressVariation(loadProfile(ROOT, id), contractBase(ROOT, kinetic), kinetic).css
  assert.match(css(MOTHERDUCK), /\.acm-cta\.cta-card \.hx-cta-eyebrow[^{]*\{color:color-mix\(/)
  assert.match(css(MOXIE), /\.acm-testimonials[^{]*\{--testi-band:var\(--ds-c-surface-warm\)\}/)
  assert.doesNotMatch(css(MOXIE), /hx-cta-eyebrow[^{]*\{color:color-mix/)
})

test('WordPress: every selector of a sideRules list is scoped, and a child combinator is kept', () => {
  // as on Joomla (19/10/2026): JA Impact's '.jim-news__title > a' key was dropped without a word
  const impact = oneLook('wordpress-ja-impact')
  const rules = {
    '.a .logo, .b .logo': { opacity: '0.5' },
    '.menu > li > a': { filter: 'invert(1)' },
    '.c :is(p, li), .d': { opacity: '0.7' }
  }
  const css = wordpressVariation(loadProfile(ROOT, MOXIE), contractBase(ROOT, impact), {
    ...impact,
    keepScopes: [],
    bands: {},
    sideRules: { light: rules, dark: rules }
  }).css
  assert.ok(css.includes(`${HI} .a .logo,${HI} .b .logo{opacity:0.5}`), 'both selectors of the list scoped')
  assert.ok(css.includes(`${HI} .menu > li > a{filter:invert(1)}`), 'child combinator kept')
  assert.ok(css.includes(`${HI} .c :is(p, li),${HI} .d{opacity:0.7}`), 'commas inside :is() left alone')
})

test('WordPress: every selector of a comma-list contract selector is scoped, not only its first', () => {
  // a selector string such as `h1.hero-title, .tracy-display` (the display type rule) was prefixed whole, so
  // `.tracy-display` matched at the template's own weight (19/10/2026); commas inside :is() are not list commas
  const impact = oneLook('wordpress-ja-impact')
  const css = wordpressVariation(loadProfile(ROOT, MOXIE), contractBase(ROOT, impact), {
    ...impact,
    keepScopes: [],
    bands: {},
    selectors: { ...impact.selectors, headingsAll: '.a h1, .tracy-display', card: '.c :is(p, li), .d' }
  }).css
  assert.ok(css.includes(`${HI} .a h1,${HI} .tracy-display{`), 'both heading selectors scoped')
  assert.ok(css.includes(`${HI} .c :is(p, li),${HI} .d{`), 'commas inside :is() left alone')
  assert.ok(!/,\s*\.tracy-display\{|,\s*\.d\{/.test(css), 'no bare selector after a list comma')
})

test('WordPress: JA Kinetic chips only its pill eyebrows, and its ticker label reads the accent on ink', () => {
  const kinetic = oneLook('wordpress-ja-kinetic')
  const css = wordpressVariation(loadProfile(ROOT, MOXIE), contractBase(ROOT, kinetic), kinetic).css
  // a plain text eyebrow (Contact's "// CONTACT", display:block) got a page-wide surface strip
  assert.match(
    css,
    /body\.item-219[^{]*\.acm-page-masthead \.hx-eyebrow[^{]*\{background-color:var\(--ds-c-surface\)!important/
  )
  assert.doesNotMatch(css, /[\s,)]\.acm-page-masthead \.hx-eyebrow\s*[,{]/)
  // the LIVE label sits on the ink ticker: the accent as words on ink, not on the page
  assert.match(css, /\.acm-tick-live[^{]*\{color:var\(--ds-c-accent-on-ink\)\}/)
})

test('Joomla: JA Kinetic keeps its ticker an ink band whose words read on it', () => {
  // the ticker is an always-dark band in the template; its ground was read as the page (bg) while the
  // words kept the template's on-ink (1.1) or fg (1.0.6): cream on cream under Moxie and Figma light
  const kinetic = oneLook('joomla-ja-kinetic')
  const { css } = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, kinetic), kinetic)
  const band = esc(roleValues().band)
  const onBand = esc(roleValues()['on-band'])
  assert.match(css, new RegExp(`:root \\.acm-clients-ticker\\{[^}]*background-color:${band}`))
  assert.doesNotMatch(css, /:root \.acm-clients-ticker\{[^}]*background-color:var\(--ds-c-bg\)/)
  for (const word of ['is-bright', 'is-dim'])
    assert.match(
      css,
      new RegExp(`:root \\.acm-clients-ticker \\.acm-tick-item\\.${word}\\{color:${onBand}\\}`)
    )
})

test('Joomla: an ink palette band is the system band on the side the page is on', () => {
  const c = {
    ...oneLook('joomla-t4-ja'),
    keepScopes: ['.t4-footer'],
    paletteBands: { '.t4-section-1': 'ink' }
  }
  const { css } = joomlaSlot(loadProfile(ROOT, MOXIE), apple, c)
  assert.match(
    css,
    new RegExp(
      `\\.t4-section-1:not\\([^)]*\\)\\{background-color:${esc(roleValues().band)};color:${esc(roleValues()['on-band'])}\\}`
    )
  )
  assert.match(
    css,
    new RegExp(`\\.t4-section-1 a:not\\(\\.btn\\):not\\([^)]*\\)\\{color:${esc(roleValues()['on-band'])}\\}`)
  )
  assert.match(css, /\.t4-section-1 :is\(p, div, span, li, small, strong, em\):not\(\.btn, \.btn \*\)/)
  // a role it does not know is dropped
  assert.doesNotMatch(
    joomlaSlot(loadProfile(ROOT, MOXIE), apple, { ...c, paletteBands: { '.t4-section-1': 'fg' } }).css,
    /\.t4-section-1/
  )
})

test('WordPress Tracy Business: the header and the signal orange follow the system; the kept bands get them back', () => {
  // 11/10/2026 on tracy-business/wp7 1.3.4: under Spotify the header kept its paper (brand.header)
  // under the system's light nav text, and "Read the case study" read the accent FILL as text
  // (1.18–4.31:1 under 9 of 14 systems)
  const business = oneLook('wordpress-tracy-business')
  const v = wordpressVariation(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, business), business)
  const lines = v.css.split('\n')
  const root = lines.find((l) => l.startsWith(`${HI}{`))
  assert.ok(root.includes('--wp--custom--tracy--brand--header:var(--ds-c-bg)'), root)
  assert.ok(root.includes('--wp--custom--tracy--brand--orange:var(--ds-c-accent-text)'), root)
  const keep = lines.find((l) => l.startsWith(`${HI} .tracy-topbar,`))
  for (const d of [
    '--wp--custom--tracy--brand--header:#f5f3ee',
    '--wp--custom--tracy--brand--orange:#da5a2a',
    '--wtb-orange:#da5a2a'
  ])
    assert.ok(keep.includes(d), d)
  const accentText = lines.find((l) => /\{color:#[0-9a-f]{6}!important\}$/i.test(l) && l.includes('summary'))
  for (const s of [
    '.wtb-card__link a:not(',
    '.wtb-news__item .wtb-card__title a:not(',
    '.wtb-slide__link a:not('
  ])
    assert.ok(accentText.includes(s), s)
  // the readable accent, not the fill: MotherDuck's #6fc2ff reads 1.94:1 on white
  assert.ok(!accentText.toLowerCase().includes('#6fc2ff'))
})

test('Joomla Tracy Business: the template keeps its own names and sizes; they point at the worn colours', () => {
  const business = oneLook('joomla-tracy-business')
  const r = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, business), business)
  assert.equal(business.module.position, 'off-canvas')
  const scope = r.css.split('\n').find((l) => l.startsWith(`${business.tokenScope}{`))
  // no 56-token set: the template's sizes, spacing and radii stay its own where the system is silent
  for (const n of ['--text-base:', '--radius-md:', '--space-4:', '--section-y-desktop:'])
    assert.ok(!scope.includes(n), n)
  for (const [k, val] of Object.entries(business.templateVars)) assert.ok(scope.includes(`${k}:${val}`), k)
  // the footer is a kept band: T4's footer variables are not repointed
  assert.ok(!scope.includes('--footer-bg-color'))
  const keep = r.css.split('\n').find((l) => l.startsWith(`${HI} .tb-topbar,`))
  for (const k of Object.keys(business.templateVars).filter(
    (k) => !k.startsWith('--font') && k !== '--container-max' && !business.keepFollows.includes(k)
  ))
    assert.ok(keep.includes(`${k}:`), `kept band gives back ${k}`)
  // the ink family is not given back: the footer's words and lines stay the root's on-ink mixes over the ink
  // it wears, one family with its legal line (15/10/2026)
  for (const k of business.keepFollows)
    assert.ok(!keep.includes(`${k}:`), `kept band leaves ${k} to the root`)
  assert.match(r.css, /\[data-tracy-theme-toggle\], \.tb-topbar__slot--theme\{display:none!important\}/)
  // a filled call to action outside a kept band (the header's) reads the accent fill and its own text
  assert.ok(scope.includes('--tb-band-forest-bg:var(--ds-c-accent)'))
  assert.ok(scope.includes('--tb-band-forest-white:var(--ds-c-accent-on)'))
})

test("Tracy Business: the call to action inside a kept band wears the system, judged on the band's ground", async () => {
  // walkthrough 11/10/2026 note 12: on WordPress the hero's "See our capabilities" (is-style-orange in
  // the kept hero) stayed the template's orange under every system, so "the main button" a customer
  // points at never wore it. Its filled buttons take the system's button pair, checked against the
  // ground the band shows: the system's own where the band wears it (bands.mjs, 12/10/2026)
  const { contrast } = await import('../src/colour.mjs')
  const { keptButtonPair, tokens56 } = await import('../src/tokens56.mjs')
  const { bandRules } = await import('../src/bands.mjs')
  for (const [name, emit] of [
    ['wordpress-tracy-business', (p, b, c) => wordpressVariation(p, b, c).css],
    ['joomla-tracy-business', (p, b, c) => joomlaSlot(p, b, c).css]
  ]) {
    const c = oneLook(name)
    const base = contractBase(ROOT, c)
    for (const id of ['od:spotify', 'od:stripe']) {
      const profile = loadProfile(ROOT, id)
      const { tokens } = tokens56(profile, base)
      const lines = emit(profile, base, c).split('\n')
      const worn = bandRules(c, tokens, HI).grounds
      for (const [band, spec] of Object.entries(c.keptButtons)) {
        // one selector a button, or one :is() list when the band's buttons carry the innermost-band guard
        const at = `${HI} ${band} `
        const mine = (l) =>
          l.startsWith(at) && l.includes(spec.buttons[0]) && l.includes('background-image:none')
        const rule = lines.find((l) => mine(l) && !l.includes(':hover'))
        const ground = worn[band] ?? spec.ground
        const pair = keptButtonPair(tokens, ground)
        assert.ok(pair && rule, `${name} ${id}: ${band} has a button rule`)
        // a band painted `!important` (T4) gives its buttons `!important` too
        const b = c.bands?.[band]?.important === true ? '!important' : ''
        assert.ok(
          rule.endsWith(
            `{background-color:${pair.fill}${b};background-image:none${b};border-color:${pair.fill}${b};color:${pair.text}${b}}`
          ),
          rule
        )
        // the system's two colours, the fill standing out on the band and the text reading on it
        assert.deepEqual(
          new Set([pair.fill, pair.text]),
          new Set([tokens['--accent'], tokens['--accent-on']])
        )
        assert.ok(contrast(pair.fill, ground) >= 3 && contrast(pair.text, pair.fill) >= 4.5, band)
        assert.ok(
          lines.some(
            (l) => l.startsWith(at) && l.includes(spec.buttons[0]) && /:hover(:where\(.*\))?\{/.test(l)
          ),
          `${name}: ${band} hover`
        )
      }
    }
    // Spotify's green stands out on the ink hero as it is: the accent fill with its black text
    const { tokens } = tokens56(loadProfile(ROOT, 'od:spotify'), base)
    const hero = Object.entries(c.keptButtons)[0][1]
    assert.deepEqual(keptButtonPair(tokens, hero.ground), {
      fill: '#1ed760',
      text: '#000000',
      hover: tokens['--accent-hover'],
      turned: false
    })
    // the band itself still gets its own colours back (keepRules)
    assert.ok(emit(loadProfile(ROOT, 'od:spotify'), base, c).includes('--ds-c-accent:initial'))
  }
})

test("kept-band buttons: the pair turns over or stays the template's when the accent cannot stand out on the band", async () => {
  const { keptButtonPair, keptButtonRules } = await import('../src/tokens56.mjs')
  const ink = '#14171a'
  // a black accent with white text on an ink band: turned over (white fill, black text)
  assert.deepEqual(keptButtonPair({ '--accent': '#000000', '--accent-on': '#ffffff' }, ink), {
    fill: '#ffffff',
    text: '#000000',
    hover: '#ffffff',
    turned: true
  })
  // a pale accent with dark text on a paper band: turned over (the dark text colour as the fill)
  assert.equal(keptButtonPair({ '--accent': '#f0f0f0', '--accent-on': '#000000' }, '#f5f3ee').turned, true)
  // a mid-grey band neither colour of the pair stands out on (2.85:1 and 2.81:1): the template's own
  // button stays
  assert.equal(keptButtonPair({ '--accent': '#a0a0a0', '--accent-on': '#000000' }, '#555555'), null)
  // a pair whose text does not read on its fill is never written
  assert.equal(keptButtonPair({ '--accent': '#1ed760', '--accent-on': '#ffffff' }, ink), null)
  // the band must start with a kept scope; anything else is ignored
  const tokens = { '--accent': '#533afd', '--accent-on': '#ffffff', '--accent-hover': '#4434d4' }
  const rules = keptButtonRules(
    {
      keepScopes: ['.hero'],
      keptButtons: {
        // Stripe's purple stands out on a paper band (6.3:1), not on ink (2.37:1, turned over below)
        '.hero:not(.hero--404)': { ground: '#f5f3ee', buttons: ['.wrap > .btn'] },
        '.elsewhere': { ground: ink, buttons: ['.btn'] },
        '.hero.bad{': { ground: ink, buttons: ['.btn'] },
        '.hero.x': { ground: ink, buttons: ['.btn}a{color:red'] }
      }
    },
    tokens,
    ':root'
  )
  assert.deepEqual(rules, [
    ':root .hero:not(.hero--404) .wrap > .btn{background-color:#533afd;background-image:none;border-color:#533afd;color:#ffffff}',
    ':root .hero:not(.hero--404) .wrap > .btn:hover{background-color:#4434d4;border-color:#4434d4;color:#ffffff}',
    ':root .hero:not(.hero--404) .wrap > .btn *{color:#ffffff}'
  ])
  // no keptButtons: nothing
  assert.deepEqual(keptButtonRules({ keepScopes: ['.hero'] }, tokens, ':root'), [])
})

test('Joomla: a picture drawn for one side of light takes its sideRules only when the worn page is on the other side', () => {
  // JA Mason's white logo and black striped discs are drawn for its dark page: under a light system
  // they are inverted, under a dark one left alone (round 2, 11/10/2026)
  const mason = oneLook('joomla-ja-mason')
  const base = contractBase(ROOT, mason)
  const light = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), base, mason).css
  for (const s of Object.keys(mason.sideRules.light))
    assert.ok(light.split('\n').includes(`${HI} ${s}{filter:invert(1)}`), s)
  // the contract's own filters on that side stand alone: the general logo flip never inverts them a second time
  assert.ok(!light.includes('.logo img:where(:not(span.d-'), 'no second inversion of the logo')
  // a page the system leaves on the template's own dark side: no inverted picture
  const dark = joomlaSlot(loadProfile(ROOT, MOXIE), base, mason).css
  assert.ok(!dark.includes('invert('))
  // a selector or value that would end the rule is dropped, never emitted
  const bad = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), base, {
    ...mason,
    sideRules: { light: { 'a{}b': { filter: 'invert(1)' }, '.x': { filter: 'url(x)' } } }
  }).css
  assert.ok(!bad.includes('a{}b') && !bad.includes('url(x)'))
})

test('Joomla: every selector of a sideRules list is scoped, and a child combinator is kept', () => {
  // a comma list scoped only its first selector (the rest matched at the template's own weight), and a
  // selector with '>' was dropped without a word (19/10/2026): contracts wrapped lists in :is() to get by
  const mason = oneLook('joomla-ja-mason')
  const css = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, mason), {
    ...mason,
    sideRules: {
      light: {
        '.a .logo, .b .logo': { opacity: '0.5' },
        '.menu > li > a': { filter: 'invert(1)' },
        '.c :is(p, li), .d': { opacity: '0.7' }
      }
    }
  }).css
  const lines = css.split('\n')
  assert.ok(lines.includes(`${HI} .a .logo,${HI} .b .logo{opacity:0.5}`), 'both selectors of the list scoped')
  assert.ok(lines.includes(`${HI} .menu > li > a{filter:invert(1)}`), 'child combinator kept')
  assert.ok(lines.includes(`${HI} .c :is(p, li),${HI} .d{opacity:0.7}`), 'commas inside :is() left alone')
})

test('Joomla: pictureRules draw a brand-colour icon with a role under every system, a mask only of an inline SVG', () => {
  // JA Kinetic J6's Integrations icons (<img> SVGs stroked in the template lime) and JA Nova's pricing
  // ticks (a background SVG in its purple) stayed the template colour under every system (PIC-1, 20/10/2026)
  const mason = oneLook('joomla-ja-mason')
  const icon = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0h4'/></svg>").replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}")`
  const pictureRules = {
    '.marks img[src$="icon-code.svg"]': { 'mask-image': icon, 'mask-size': 'contain' },
    '.list li::before': { 'background-image': 'none', 'background-color': 'var(--ds-c-accent-text)' },
    '.far img': { 'mask-image': 'url(https://evil.test/x.svg)', opacity: '1' },
    '.site img': { 'mask-image': 'url(/images/x.svg)' },
    'a{}b': { opacity: '0' }
  }
  for (const profile of [MOTHERDUCK, MOXIE]) {
    const lines = joomlaSlot(loadProfile(ROOT, profile), contractBase(ROOT, mason), {
      ...mason,
      pictureRules
    }).css.split('\n')
    assert.ok(
      lines.includes(
        `${HI} .marks img[src$="icon-code.svg"]{-webkit-mask-image:${icon};mask-image:${icon};mask-size:contain}`
      ),
      'an inline SVG becomes the mask, on both sides of light'
    )
    assert.ok(
      lines.includes(`${HI} .list li::before{background-image:none;background-color:var(--ds-c-accent-text)}`)
    )
    assert.ok(lines.includes(`${HI} .far img{opacity:1}`), 'a mask that fetches is dropped, the rest kept')
    const css = lines.join('\n')
    assert.ok(!css.includes('evil.test') && !css.includes('/images/x.svg') && !css.includes('a{}b'))
  }
  // a contract with no pictureRules: the sheet does not change
  const plain = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, mason), mason).css
  assert.equal(
    plain,
    joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, mason), { ...mason, pictureRules: {} }).css
  )
})

test('Joomla: a display selector list splits at top-level commas only', () => {
  // a comma inside :is() split the selector in two halves that are not selectors (19/10/2026)
  const mason = oneLook('joomla-ja-mason')
  const css = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, mason), {
    ...mason,
    selectors: { ...mason.selectors, display: '.hero :is(h1, h2), .x-title' }
  }).css
  assert.ok(
    css.includes(`${HI} .hero :is(h1, h2):not(.tracy-ds-display),${HI} .x-title:not(.tracy-ds-display)`),
    'the :is() list stays whole'
  )
  assert.ok(!css.includes(`${HI} .hero :is(h1:not(`), 'no half selector')
})

test('Joomla: a kept band that shows the page through it takes the template page ground back (keepGround)', () => {
  // JA Lawfirm's FAQ band: its questions run past the white photo panel onto the page (round 2, 11/10/2026)
  const law = oneLook('joomla-ja-lawfirm')
  const css = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, law), law).css
  const line = css
    .split('\n')
    .find((l) => l.endsWith(`{background-color:${law.keepDefaults['--body-bg-color']}}`))
  assert.ok(line && law.keepGround.every((x) => line.includes(`${HI} ${x}`)), line)
  // a band only names its ground when the contract asks: no keepGround, no rule
  const bare = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, law), {
    ...law,
    keepGround: []
  }).css
  assert.ok(!bare.includes('{background-color:#ffffff}'))
})

test('Joomla: text a template sets on its accent fill takes the accent text (onAccent), outside kept bands', () => {
  // JA Teline V's white category titles on its red, which is its accent (round 2, 11/10/2026)
  const tel = oneLook('joomla-ja-teline-v')
  const css = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, tel), tel).css
  const line = css.split('\n').find((l) => l.endsWith('{color:var(--ds-c-accent-on)}'))
  assert.ok(line, 'an onAccent rule')
  const kept = `:not(${tel.keepScopes.flatMap((x) => [x, `${x} *`]).join(', ')})`
  for (const s of tel.selectors.onAccent) assert.ok(line.includes(`${HI} ${s}${kept}`), s)
  assert.ok(!joomlaSlot(loadProfile(ROOT, MOXIE), apple, joContract).css.includes('var(--ds-c-accent-on)}'))
})

test('Joomla: a kept band gives its texts back the colour they inherited as released (keepColors)', () => {
  const c = {
    ...oneLook('joomla-ja-mood'),
    keepScopes: ['.t3-topbar', '.t3-footer'],
    keepColors: { '.t3-topbar': 'rgb(102, 102, 102)', '.t3-footer': 'url(x)' }
  }
  const r = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), contractBase(ROOT, c), c)
  assert.match(r.css, /:root:root:root:root:root:root \.t3-topbar\{color:rgb\(102, 102, 102\)\}/)
  // only a colour is written
  assert.doesNotMatch(r.css, /\.t3-footer\{color:/)
})

test('Joomla: a Gavern (GavickPro) contract breaks long heading words only when it opts in (breakWords)', () => {
  // GK Archi's display word "environmentally" in MotherDuck's monospace was wider than a 390px line
  // (the page scrolled 18px sideways): its contract names its headings, which break inside a word
  const archi = oneLook('joomla-gk-archi')
  const base = contractBase(ROOT, archi)
  const css = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), base, archi).css
  assert.ok(
    css.split('\n').includes(`${HI} h1.heading{white-space:normal;overflow-wrap:break-word;min-width:0}`)
  )
  // without the field no rule is written; a selector that would end the rule is dropped
  assert.ok(
    !joomlaSlot(loadProfile(ROOT, MOTHERDUCK), base, { ...archi, breakWords: undefined }).css.includes(
      'overflow-wrap'
    )
  )
  const bad = joomlaSlot(loadProfile(ROOT, MOTHERDUCK), base, { ...archi, breakWords: ['h1{}x'] }).css
  assert.ok(!bad.includes('overflow-wrap'))
  // a Gavern contract stands alone (no JA family base) and leaves the template's widths alone
  assert.equal(archi.extends, undefined)
  assert.equal(archi.selectors.container, undefined)
})

test("a button rule's limits weigh nothing: a contract's followRule for the same button still wins (JA Beauty's outline button)", () => {
  // the menu toggles and the page header are left out with :where(:not()), never a plain :not(): as plain
  // :not(#t4-header *, …) they outranked JA Beauty's followRule for its outline button, whose text then took
  // the accent's own text colour on its transparent fill — white on its white section (14/10/2026)
  const beauty = oneLook('joomla-ja-beauty')
  const lines = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, beauty), beauty).css.split('\n')
  const at = (re) => lines.findIndex((l) => re.test(l))
  const button = at(
    /^(:root)+ \.btn-primary:where\(:not\(\.navbar-toggler[^{]*\{background-color:var\(--ds-c-accent\)/
  )
  const follow = at(/^(:root)+ \.btn-primary:not\([^{]*\{color:var\(--ds-c-fg\)\}$/)
  assert.ok(button >= 0 && follow > button, 'the followRule comes after the button rule')
  const selector = (i) => lines[i].slice(0, lines[i].indexOf('{'))
  assert.equal(
    selector(button).replace(/:where\(:not\([^)]*\)\)/, ''),
    selector(follow),
    'and weighs the same'
  )
})

test('WordPress: the variation never sets a content width, gutters or spacing scale, stated by the system or not', () => {
  // Spotify (14/10/2026): a silent system left the content size and --wp--custom--container--max at the
  // token's 1024px default while the containers kept 1240px. Moxie states 1200px: the theme keeps its
  // own width there too (Akemi, 15/10/2026: wearing a system never changes the template's layout)
  const SPOTIFY = 'refero:1514a95f-878c-4d4d-bb14-99d1b83f6227'
  const silent = loadProfile(ROOT, SPOTIFY)
  assert.equal(silent.layout.container.s, 'empty')
  for (const profile of [silent, loadProfile(ROOT, MOXIE)]) {
    const v = wordpressVariation(profile, apple, wpContract).variation
    assert.equal(v.settings.layout, undefined)
    // nor the base system's gutters and spacing scale (22px against JA Kinetic's 32px, 15/10/2026)
    assert.equal(v.settings.custom?.container, undefined)
    assert.equal(v.settings.spacing, undefined)
  }
})

test('WordPress Tracy Business: the section-heading size stops at the sidebar cards (Moxie)', () => {
  // The news sidebar's subscribe card titles with an h2.wp-block-heading at the xl preset (22px) in
  // a 340px column; reached by the section-heading role it took Moxie's 43px and four lines (15/10/2026).
  const c = loadContract('wordpress-tracy-business')
  const css = wordpressVariation(loadProfile(ROOT, MOXIE), contractBase(ROOT, c), c).css
  const sized = [...css.matchAll(/([^{}]*main h2\.wp-block-heading[^{}]*)\{([^}]*)\}/g)].filter(([, , d]) =>
    /font-size:/.test(d)
  )
  assert.ok(sized.length > 0, 'Moxie sizes the section headings')
  for (const [, sel] of sized)
    for (const one of sel.split(/,(?![^()]*\))/)) assert.match(one, /:not\(\.tracy-aside \*\)/, one.trim())
})

test("Joomla: Tracy Base's buttons in a form keep the template's capsule padding (formTokens)", () => {
  // the slot sets --tracy-capsule-pad from the system's button padding, and Tracy Base sizes every .btn from it:
  // under Moxie the sign-in, search and contact buttons went from 44 to 34px beside 44px fields (LAYOUT-3,
  // 16/10/2026). Inside a form the template's own value comes back; outside, the system's stays
  const css = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, joContract), joContract).css
  const pad = /--tracy-capsule-pad:([^;}]+)/.exec(css)?.[1]
  assert.ok(pad && pad !== joContract.formTokens['--tracy-capsule-pad'], `the system's padding: ${pad}`)
  assert.ok(css.split('\n').includes(`${HI} form{--tracy-capsule-pad:var(--space-3) var(--space-5)}`))
  // a token the slot does not set is never written into a form
  const none = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, joContract), {
    ...joContract,
    formTokens: { '--not-set-by-the-slot': '1px' }
  }).css
  assert.ok(!none.includes(`${HI} form{`))
})

test("Joomla: Tracy Base's scene bands stay flush with a dark worn page (sideRules.dark, GROUND-2)", () => {
  // the template's ink band is black on its light page and flush with its own black page in its dark look; the
  // system's ink on a dark side is a lifted surface (Moxie dark #1a1a1a on #000000, 16/10/2026)
  const full = loadContract('joomla-tracy-base')
  const lines = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, full), full).css.split('\n')
  const flush = '.tracy-band--scene{--tracy-scene-bg:var(--ds-c-bg);--tracy-scene-fg:var(--ds-c-fg)}'
  assert.ok(lines.includes(`${HI}:where([data-theme="dark"]) ${flush}`), 'the dark side: flush with the page')
  assert.ok(
    !lines.some((l) => l.includes(':where(:not([data-theme="dark"]))') && l.includes(flush)),
    'light: the ink band'
  )
  // on the light side the chapter's support line reads the band's own words, 10% toward its ink (60% read
  // 2.6:1 on Airbnb's grey ink #6d6d6d, Tracy Apple 1.3.1, 16/10/2026), and its action line and secondary
  // button read the band's words, not the accent (3.02:1 on Stripe's ink)
  const light = `${HI}:where(:not([data-theme="dark"]))`
  assert.ok(
    lines.includes(
      `${light} .tracy-band--scene .tracy-chapter__support{color:color-mix(in srgb, var(--ds-c-on-ink) 90%, var(--ds-c-ink))}`
    )
  )
  assert.ok(
    lines.includes(
      `${light} .tracy-band--scene :is(.tracy-chapter__action, .tracy-btn--secondary){color:var(--ds-c-on-ink)}`
    )
  )
  assert.ok(!lines.some((l) => l.includes('#t4-section-4')), 'no rule for a band that stays black')
  // on the dark side the feature cards' text is the muted mixed halfway toward the page text (3.62:1 on
  // Moxie's lifted card, Tracy Apple 1.3.1)
  assert.ok(
    lines.includes(
      `${HI}:where([data-theme="dark"]) .tracy-card .tracy-features-intro__card-text{color:color-mix(in srgb, var(--ds-c-muted) 50%, var(--ds-c-fg))}`
    )
  )
})
