// Tests for the motion library's generator. Four things a reader cannot check by eye and a stale
// copy hides completely: that every emitted file is the same bytes wherever it lands, that the
// version line survives minification in the one fixed form the site-side reader greps for, that
// a catalogue promising an effect the library does not carry yet is refused rather than shipped,
// and that an effect painting with something other than the allowed properties — or naming a
// colour it does not own, or claiming a property list its CSS does not match — is refused too.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { EFFECTS, SLOTS, VERSION } from '../catalog.mjs'
import {
  assertCatalog,
  assertEffectCss,
  assertLibraryCss,
  banner,
  declarations,
  declaredProps,
  HEAD_SNIPPET,
  plan,
  runtimeEffects,
  stale,
  styleSheet
} from '../scripts/build.mjs'

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

/** A reject-path declaration: the catalogue record it would carry, and the CSS it would ship. */
function fixture(id, cssPropsWritten) {
  return { effect: { id, cssPropsWritten }, css: readFileSync(path.join(FIXTURES, `${id}.css`), 'utf8') }
}

test('the two theme copies of each emitted file are byte-identical', async () => {
  const { files } = await plan()
  assert.deepEqual([...files.keys()].sort(), [
    'joomla/media/css/tracy-motion.css',
    'joomla/media/js/tracy-motion.js',
    'joomla/motion-head.php',
    'library/src/text.generated.ts',
    'wordpress/assets/css/tracy-motion.css',
    'wordpress/assets/js/tracy-motion.js',
    'wordpress/inc/motion-head.php'
  ])
  assert.equal(files.get('wordpress/assets/js/tracy-motion.js'), files.get('joomla/media/js/tracy-motion.js'))
  assert.equal(
    files.get('wordpress/assets/css/tracy-motion.css'),
    files.get('joomla/media/css/tracy-motion.css')
  )
})

for (const key of ['wordpress/assets/js/tracy-motion.js', 'joomla/media/js/tracy-motion.js']) {
  test(`${key}: line 1 carries the version in the fixed form`, async () => {
    const { files, version } = await plan()
    assert.equal(files.get(key).split('\n')[0], `// tracy-motion ${String(version)}`)
  })
}

test('the CSS carries no banner: byte 0 is the first rule, not a comment', async () => {
  const { files } = await plan()
  assert.match(files.get('wordpress/assets/css/tracy-motion.css'), /^@media/)
})

test('banner is one space, no v, nothing else on the line', () => {
  assert.equal(banner(7), '// tracy-motion 7')
})

test('an effect declaring a since ahead of the library version is refused', async () => {
  const effects = [{ ...EFFECTS[0], since: VERSION + 1 }]
  const expected = new RegExp(`since ${String(VERSION + 1)}, ahead of library version ${String(VERSION)}`)
  assert.throws(() => assertCatalog(effects, VERSION, SLOTS), expected)
  await assert.rejects(() => plan({ effects }), /ahead of library version/)
})

test('an effect with no css props written field is refused by name, not by a crash later on', async () => {
  const effects = [{ ...EFFECTS[0], cssPropsWritten: undefined }]
  assert.throws(() => assertCatalog(effects, VERSION, SLOTS), /css props written/)
  await assert.rejects(() => plan({ effects }), /css props written/)
})

test('an effect filed under a slot that does not exist is refused', () => {
  assert.throws(
    () => assertCatalog([{ ...EFFECTS[0], slot: 'hero-entrace' }], VERSION, SLOTS),
    /hero-entrace/
  )
})

test('the real catalogue passes its own gate', () => {
  assertCatalog(EFFECTS, VERSION, SLOTS)
})

for (const effect of EFFECTS) {
  test(`${effect.id}: the emitted stylesheet carries its rules`, async () => {
    const { files } = await plan()
    assert.ok(files.get('wordpress/assets/css/tracy-motion.css').includes(`tracy-motion-${effect.id}`))
  })
}

test('the browser is told each effect id and the slot it belongs to, in a stable order', () => {
  assert.deepEqual(runtimeEffects(EFFECTS), {
    'carousel-step': 'carousel',
    'fade-up': 'section-reveal',
    'hero-stagger': 'hero-entrance',
    pulse: 'loop',
    reveal: 'element-reveal'
  })
  assert.deepEqual(
    Object.keys(
      runtimeEffects([
        { id: 'b', slot: 'x' },
        { id: 'a', slot: 'y' }
      ])
    ),
    ['a', 'b']
  )
})

test('the head-marker partials and the generated module carry the same script, byte for byte', async () => {
  const { files } = await plan()
  const wordpress = files.get('wordpress/inc/motion-head.php')
  assert.equal(wordpress, files.get('joomla/motion-head.php'))
  assert.equal(wordpress, HEAD_SNIPPET)
  assert.ok(
    files
      .get('library/src/text.generated.ts')
      .includes(`export const headSnippet = ${JSON.stringify(HEAD_SNIPPET)}`)
  )
})

/** Runs the head snippet in a page stand-in; returns the marker class list and the timers it armed. */
function runHeadSnippet({ reducedMotion = false, matchMedia = true, started = false } = {}) {
  const body = HEAD_SNIPPET.replace(/^<script>/, '').replace(/<\/script>\n$/, '')
  const classes = new Set()
  const timers = []
  const window = {
    TracyMotionStarted: started ? true : undefined,
    matchMedia: matchMedia
      ? (query) => ({ matches: query.includes('no-preference') ? !reducedMotion : reducedMotion })
      : undefined,
    setTimeout: (fn, ms) => timers.push({ fn, ms })
  }
  const document = {
    documentElement: {
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }
    }
  }
  new Function('window', 'document', body)(window, document)
  return { classes, timers, window }
}

test('head snippet: motion allowed → sets the marker, then lets go after 3 s if the runtime never started', () => {
  const page = runHeadSnippet()
  assert.deepEqual([...page.classes], ['tracy-motion'])
  assert.equal(page.timers.length, 1)
  assert.equal(page.timers[0].ms, 3000)
  page.timers[0].fn()
  assert.deepEqual([...page.classes], [])
})

test('head snippet: the runtime started before the timer fires → the marker stays', () => {
  const page = runHeadSnippet()
  page.window.TracyMotionStarted = true
  page.timers[0].fn()
  assert.deepEqual([...page.classes], ['tracy-motion'])
})

test('head snippet: reduced motion → no marker and no timer', () => {
  const page = runHeadSnippet({ reducedMotion: true })
  assert.deepEqual([...page.classes], [])
  assert.equal(page.timers.length, 0)
})

test('head snippet: no matchMedia → no marker and no timer', () => {
  const page = runHeadSnippet({ matchMedia: false })
  assert.deepEqual([...page.classes], [])
  assert.equal(page.timers.length, 0)
})

test('the head-marker valve and the emitted runtime name the same started-signal global', async () => {
  const { files } = await plan()
  assert.ok(HEAD_SNIPPET.includes('if(!window.TracyMotionStarted)'))
  assert.ok(files.get('wordpress/assets/js/tracy-motion.js').includes('window.TracyMotionStarted='))
})

test('the generated module carries the catalogue version and its banner', async () => {
  const { files, version } = await plan()
  const module = files.get('library/src/text.generated.ts')
  assert.equal(version, VERSION)
  assert.ok(module.includes(`export const version = ${String(VERSION)}`))
  // The banner rides along, so a plugin reading this module sees the same version line a site does.
  assert.ok(module.includes(banner(VERSION)))
})

for (const [constant, key] of [
  ['js', 'wordpress/assets/js/tracy-motion.js'],
  ['css', 'wordpress/assets/css/tracy-motion.css']
]) {
  test(`the generated module's ${constant} is the emitted ${key} byte for byte`, async () => {
    const { files } = await plan()
    assert.ok(
      files
        .get('library/src/text.generated.ts')
        .includes(`export const ${constant} = ${JSON.stringify(files.get(key))}`)
    )
  })
}

test('catalog is keyed by effect id, every effect carries its slot, and the slot list carries gallery label and order', async () => {
  const { files } = await plan()
  const module = files.get('library/src/text.generated.ts')
  const marker = 'export const catalog = '
  const catalog = JSON.parse(module.slice(module.indexOf(marker) + marker.length))
  assert.deepEqual(
    Object.keys(catalog.effects),
    EFFECTS.map((effect) => effect.id)
  )
  for (const [id, effect] of Object.entries(catalog.effects)) {
    assert.equal(effect.id, id)
    assert.equal(typeof effect.slot, 'string')
  }
  assert.deepEqual(
    catalog.slots.map((slot) => [slot.id, slot.galleryLabel, slot.order]),
    SLOTS.map((slot) => [slot.id, slot.galleryLabel, slot.order])
  )
})

test('the gallery metadata never reaches the browser: the emitted bundle carries id and slot only', async () => {
  const { files } = await plan()
  const js = files.get('wordpress/assets/js/tracy-motion.js')
  const prose = [
    ...EFFECTS.flatMap((e) => [e.description, e.sampleHtml, e.cssPropsWritten]),
    ...SLOTS.flatMap((slot) => [slot.galleryLabel, slot.trigger, slot.targetRule])
  ]
  assert.deepEqual(
    prose.filter((text) => js.includes(text)),
    []
  )
})

test('stale reports a copy that is missing or differs on disk', async () => {
  const { files } = await plan()
  const wordpress = mkdtempSync(path.join(tmpdir(), 'wp-'))
  const joomla = mkdtempSync(path.join(tmpdir(), 'j-'))
  mkdirSync(path.join(wordpress, 'assets', 'js'), { recursive: true })
  writeFileSync(
    path.join(wordpress, 'assets', 'js', 'tracy-motion.js'),
    files.get('wordpress/assets/js/tracy-motion.js')
  )
  const library = mkdtempSync(path.join(tmpdir(), 'lib-'))
  const report = stale(files, { library, wordpress, joomla })
  assert.ok(!report.includes('wordpress/assets/js/tracy-motion.js'))
  assert.ok(report.includes('wordpress/assets/css/tracy-motion.css'))
  assert.ok(report.includes('joomla/media/js/tracy-motion.js'))
})

test('declarations finds every property at any nesting depth, and no selector', () => {
  const css = `
    /* a comment: not a declaration */
    @media (prefers-reduced-motion: no-preference) {
      html.tracy-motion a:hover { opacity: 1; transform: none }
    }
    @keyframes k { from { opacity: 0 } }
  `
  assert.deepEqual(
    declarations(css).map((one) => one.prop),
    ['opacity', 'transform', 'opacity']
  )
})

test('declarations reads the outer block of a nested rule, not just the innermost one', () => {
  const css = `
    html.tracy-motion .tracy-motion-x {
      opacity: 1;
      width: 50%;
      &.tracy-motion-bold { transform: none }
      @media (min-width: 600px) { rotate: 4deg }
    }
  `
  assert.deepEqual(
    declarations(css)
      .map((one) => one.prop)
      .sort(),
    ['opacity', 'rotate', 'transform', 'width']
  )
})

test('a name the reader does not recognise still reaches the gate; only a nameless declaration is skipped', () => {
  assert.deepEqual(
    declarations('.a { --accent_hue: 200; wid\\74 h: 1px; *width: 1px; : 1; opacity: 1 }').map(
      (one) => one.prop
    ),
    ['--accent_hue', 'wid\\74 h', '*width', 'opacity']
  )
  assert.throws(
    () => assertLibraryCss('t', '.x { --màu: red; opacity: 1 }'),
    /declares --màu, a variable outside --tracy-motion-\*/
  )
  assert.throws(() => assertLibraryCss('t', '.x { opacity: var(--màu) }'), /reads --màu, a variable/)
})

test('the declared property list is the comma list before the semicolon, not the clause after it', () => {
  assert.deepEqual(declaredProps('opacity, transform, animation; 8 delay rungs, set through the WAAPI'), [
    'opacity',
    'transform',
    'animation'
  ])
  assert.deepEqual(declaredProps('opacity'), ['opacity'])
})

test('an effect writing a property outside the whitelist is refused', () => {
  assert.throws(
    () =>
      assertEffectCss(
        { id: 'layout-shifter', cssPropsWritten: 'width' },
        '.tracy-motion-layout-shifter { width: 50% }'
      ),
    /writes width, which is not one of transform, opacity, filter, translate, scale, rotate/
  )
})

test('nesting does not carry a property past the gate', () => {
  assert.throws(
    () =>
      assertEffectCss(
        { id: 'nested-shifter', cssPropsWritten: 'opacity' },
        `.tracy-motion-nested-shifter {
           opacity: 1;
           width: 50%;
           &.tracy-motion-bold { opacity: 0.5 }
         }`
      ),
    /writes width, which is not one of/
  )
  assert.throws(
    () =>
      assertEffectCss(
        { id: 'nested-borrower', cssPropsWritten: 'opacity, filter' },
        `.tracy-motion-nested-borrower {
           opacity: 1;
           filter: drop-shadow(0 0 4px var(--accent));
           &.tracy-motion-bold { opacity: 0.5 }
         }`
      ),
    /reads --accent, a variable the library does not own/
  )
})

test('the properties that drive an effect rather than paint it do not trip the gate', () => {
  assert.doesNotThrow(() =>
    assertEffectCss(
      {
        id: 'driven',
        cssPropsWritten:
          'opacity, animation, animation-delay, transition, transition-timing-function, will-change'
      },
      `.tracy-motion-driven {
         opacity: 1;
         animation: tracy-motion-driven 1s both;
         animation-delay: 90ms;
         transition: 200ms;
         transition-timing-function: linear;
         will-change: opacity;
       }`
    )
  )
})

test('an effect whose declared css props written disagrees with the CSS it ships is refused', () => {
  assert.throws(
    () =>
      assertEffectCss(
        { id: 'drifted', cssPropsWritten: 'opacity' },
        '.tracy-motion-drifted { opacity: 1; transform: none }'
      ),
    /declares css props written "opacity" but its CSS writes "opacity, transform"/
  )
  // Drift the other way is refused just the same: a claim the CSS never makes good on.
  assert.throws(
    () =>
      assertEffectCss(
        { id: 'overclaimed', cssPropsWritten: 'opacity, filter' },
        '.tracy-motion-overclaimed { opacity: 1 }'
      ),
    /but its CSS writes "opacity"/
  )
})

test('a variable the library does not own is refused, whether read or declared', () => {
  assert.throws(
    () =>
      assertEffectCss(
        { id: 'borrower', cssPropsWritten: 'filter' },
        '.tracy-motion-borrower { filter: drop-shadow(0 0 4px var(--accent)) }'
      ),
    /reads --accent, a variable the library does not own/
  )
  assert.throws(
    () =>
      assertEffectCss(
        { id: 'squatter', cssPropsWritten: 'opacity' },
        '.tracy-motion-squatter { --accent: red; opacity: 1 }'
      ),
    /declares --accent, a variable outside --tracy-motion-\*/
  )
  assert.doesNotThrow(() =>
    assertEffectCss(
      { id: 'own', cssPropsWritten: 'opacity' },
      '.tracy-motion-own { --tracy-motion-dur: 520ms; opacity: var(--tracy-motion-dur) }'
    )
  )
})

test('hero-type-reveal is refused: it writes width and clip-path, outside the whitelist', () => {
  const { effect, css } = fixture('hero-type-reveal', 'width, clip-path')
  assert.throws(
    () => assertEffectCss(effect, css),
    /effect hero-type-reveal writes width, which is not one of/
  )
})

test('gradient-flow is refused: it needs a colour from the design set', () => {
  const { effect, css } = fixture('gradient-flow', 'opacity, background-image')
  assert.throws(
    () => assertEffectCss(effect, css),
    /effect gradient-flow reads --accent, a variable the library does not own/
  )
})

for (const effect of EFFECTS) {
  test(`${effect.id}: passes the CSS gate unchanged`, () => {
    const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'effects')
    assert.doesNotThrow(() =>
      assertEffectCss(effect, readFileSync(path.join(src, `${effect.id}.css`), 'utf8'))
    )
  })
}

test('a brace, semicolon or colon inside a quoted value is text, and hides nothing from the gate', () => {
  assert.deepEqual(
    declarations('.b { width: 50%; content: "{"; opacity: 1 }').map((one) => one.prop),
    ['width', 'content', 'opacity']
  )
  assert.deepEqual(
    declarations('.a { filter: url(data:image/svg+xml;utf8,<svg>{}</svg>); opacity: 1 }').map(
      (one) => one.prop
    ),
    ['filter', 'opacity']
  )
  assert.throws(
    () =>
      assertEffectCss(
        { id: 'hole', cssPropsWritten: 'opacity' },
        '.b { width: 50%; content: "{"; opacity: 1 }'
      ),
    /writes width, which is not one of/
  )
  assert.throws(
    () =>
      assertEffectCss(
        { id: 'hole2', cssPropsWritten: 'opacity' },
        '.b { filter: drop-shadow(0 0 1px var(--accent)); content: "{"; opacity: 1 }'
      ),
    /reads --accent, a variable the library does not own/
  )
  // And nothing inside a string is mistaken for a declaration of its own.
  assert.doesNotThrow(() =>
    assertEffectCss({ id: 'phantom', cssPropsWritten: 'filter' }, '.a { filter: url("m;color:red") }')
  )
  // A backslash before a real newline continues the string, so its `}` is still text.
  assert.deepEqual(
    declarations('.a { --tracy-motion-label: "step \\\n}"; width: 10px }').map((one) => one.prop),
    ['--tracy-motion-label', 'width']
  )
})

test('an @import is refused, whether it would be inlined or fetched by the visitor', () => {
  assert.throws(
    () =>
      assertEffectCss(
        { id: 'imp', cssPropsWritten: 'opacity' },
        '@import "./sneaky.css";\n.b { opacity: 1 }'
      ),
    /effect imp carries an @import/
  )
  assert.throws(
    () =>
      assertEffectCss(
        { id: 'imp-remote', cssPropsWritten: 'opacity' },
        '@import url("https://example.com/x.css");\n.b { opacity: 1 }'
      ),
    /effect imp-remote carries an @import/
  )
  assert.throws(() => assertLibraryCss('base', '@import "./x.css";'), /base carries an @import/)
})

test('the base sheet faces the same bans as an effect, and passes them today', () => {
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
  assert.doesNotThrow(() => assertLibraryCss('base', readFileSync(path.join(src, 'base.css'), 'utf8')))
  assert.throws(() => assertLibraryCss('base', '.x { width: 1px }'), /writes width, which is not one of/)
  assert.throws(() => assertLibraryCss('base', '.x { opacity: var(--accent) }'), /reads --accent/)
})

test('a base sheet reaching for a design-set colour stops the build, not just an effect', () => {
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
  const dir = mkdtempSync(path.join(tmpdir(), 'motion-src-'))
  mkdirSync(path.join(dir, 'src', 'effects'), { recursive: true })
  writeFileSync(
    path.join(dir, 'src', 'base.css'),
    'html.tracy-motion main section { opacity: var(--accent) }'
  )
  for (const effect of EFFECTS) {
    writeFileSync(
      path.join(dir, 'src', 'effects', `${effect.id}.css`),
      readFileSync(path.join(src, 'effects', `${effect.id}.css`), 'utf8')
    )
  }
  assert.throws(() => styleSheet(dir, EFFECTS), /base reads --accent/)
})
