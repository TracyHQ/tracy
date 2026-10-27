// A Joomla or WordPress template with a light/dark switch keeps both modes under a system (#1315 for
// EmDash, ported to the other two: Akemi 13/10/2026, hiding the switch is a bug): the contract's
// `modes: true` writes the system's own side under the template's matching mode, the other side
// derived from it (derive.mjs), and leaves the switch alone.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contrast, luminance, parseHex } from '../src/colour.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { scopeCss, sidesOf, twoSides } from '../src/sides.mjs'
import { wordpressVariation } from '../src/wordpress.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const DARK = ':root:where([data-theme="dark"])'
const LIGHT = ':root:where(:not([data-theme="dark"]))'
const lum = (h) => luminance(parseHex(h))
/** The value a declaration takes in the first rule whose selector starts with `side`. */
const valueOn = (css, side, prop) => {
  for (const line of css.split('\n'))
    if (line.startsWith(side)) {
      const m = new RegExp(`[{;]${prop.replace(/[-]/g, '\\-')}:([^;}]+)`).exec(line)
      if (m) return m[1].trim()
    }
  return null
}
const balanced = (css) => {
  let d = 0
  for (const ch of css) {
    if (ch === '{') d++
    if (ch === '}') d--
    if (d < 0) return false
  }
  return d === 0
}

test('the side scoper puts every rule of a sheet on one side, media rules included', () => {
  const css = [
    '/* a comment */',
    ':root:root{--a:#000}',
    ':root, html[data-theme="dark"], html.t4-dark, [data-bs-theme="dark"]{--b:1}',
    'html{color-scheme:dark}',
    '.x :is(.a, .b) > p{color:red}',
    '@media (max-width:639px){:root:root .h{font-size:1px}}'
  ].join('\n')
  const out = scopeCss(css, '[data-theme="dark"]')
  assert.match(out, /^\/\* a comment \*\/$/m)
  assert.match(out, /^:root:root\[data-theme="dark"\]\{--a:#000\}$/m)
  assert.match(
    out,
    /^:root\[data-theme="dark"\], html\[data-theme="dark"\]\[data-theme="dark"\], html\.t4-dark\[data-theme="dark"\], :root\[data-theme="dark"\] \[data-bs-theme="dark"\]\{--b:1\}$/m
  )
  assert.match(out, /^html\[data-theme="dark"\]\{color-scheme:dark\}$/m)
  assert.match(out, /^:root\[data-theme="dark"\] \.x :is\(\.a, \.b\) > p\{color:red\}$/m)
  assert.match(out, /^@media \(max-width:639px\)\{:root:root\[data-theme="dark"\] \.h\{font-size:1px\}\}$/m)
  assert.ok(balanced(out))
})

test('Joomla: a contract with modes keeps the switch and writes both sides, the system’s own under its side', () => {
  const c = { ...loadContract('joomla-tracy-business'), modes: true }
  const r = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, c), c)
  assert.equal(r.mode, 'dark')
  assert.match(r.css, /^\/\* mode: dark \*\/$/m)
  assert.doesNotMatch(r.css, /theme-toggle\][^{]*\{display:none/, 'the switch is not hidden')
  // Moxie is dark: its own black under the template's dark mode, a derived light page on the other
  assert.equal(valueOn(r.css, DARK, '--ds-c-bg')?.toLowerCase(), '#000000')
  const light = valueOn(r.css, LIGHT, '--ds-c-bg')
  assert.ok(light && lum(light) > 0.7, `derived light page: ${light}`)
  // Tracy Business's pre-paint script always sets data-theme (modesAuto false): no OS-dark copy
  assert.doesNotMatch(r.css, /@media \(prefers-color-scheme: ?dark\)\{:root:where\(:not\(\[data-theme\]\)\)/)
  // a template that leaves an "auto" state: the visitor who has not chosen (no attribute) under a dark OS
  // sees the template's dark mode
  const base = loadContract('joomla-tracy-base')
  assert.match(
    joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, base), base).css,
    /@media \(prefers-color-scheme: ?dark\)\{:root:where\(:not\(\[data-theme\]\)\)/
  )
  assert.ok(balanced(r.css))
  // without the flag: one look, the switch hidden, as before
  const one = joomlaSlot(loadProfile(ROOT, MOXIE), contractBase(ROOT, c), { ...c, modes: undefined })
  assert.equal(one.mode, undefined)
  assert.match(one.css, /\[data-tracy-theme-toggle\], \.tb-topbar__slot--theme\{display:none!important\}/)
})

test('WordPress: a contract with modes keeps the switch and writes both sides into styles.css', () => {
  const c = { ...loadContract('wordpress-ja-essence'), modes: true }
  const apple = wordpressVariation(loadProfile(ROOT, 'od:apple'), contractBase(ROOT, c), c)
  const css = apple.css
  assert.equal(apple.mode, 'light')
  assert.match(css, /^\/\* mode: light \*\/$/m)
  assert.doesNotMatch(css, /theme-toggle\][^{]*\{display:none/, 'the switch is not hidden')
  // Apple is light: its own white under the light mode, a derived dark side under the dark one,
  // the presets the theme's stylesheets read included
  // the presets sit at HI, above a template's own presets on the html element (JA Kinetic's
  // html[data-style="blueprint"], 15/10/2026)
  const HI = ':root:root:root:root:root:root'
  assert.equal(valueOn(css, `${HI}${LIGHT.slice(5)}`, '--wp--preset--color--bg')?.toLowerCase(), '#ffffff')
  const dark = valueOn(css, `${HI}${DARK.slice(5)}`, '--wp--preset--color--bg')
  assert.ok(dark && lum(dark) < 0.05, `derived dark page: ${dark}`)
  assert.match(css, /^html:where\(\[data-theme="dark"\]\)\{color-scheme:dark\}$/m)
  assert.match(css, /^html:where\(:not\(\[data-theme="dark"\]\)\)\{color-scheme:light\}$/m)
  // each side keeps the weight the one-look sheet gave its rule: the link colour stays at
  // WordPress's own :root :where(a), under a theme's own link rule (JA Vega's white header links)
  assert.match(
    css,
    /^:root:where\(\[data-theme="dark"\]\) :where\(a:where\(:not\(\.wp-element-button\)\)\)\{color:/m
  )
  assert.ok(balanced(css))
  const one = wordpressVariation(loadProfile(ROOT, 'od:apple'), contractBase(ROOT, c), {
    ...c,
    modes: undefined
  })
  assert.match(one.css, /\[data-tracy-theme-toggle\]\{display:none!important\}/)
})

test('the Tracy templates whose release has a working switch carry modes, and the WordPress overlays inherit it', () => {
  for (const name of [
    'joomla-tracy-base',
    'joomla-tracy-airbnb',
    'joomla-tracy-business',
    'wordpress-tracy-base',
    'wordpress-tracy-business',
    'wordpress-ja-essence',
    'wordpress-ja-impact',
    'wordpress-ja-kinetic',
    'wordpress-ja-morgan',
    'wordpress-ja-nova',
    'wordpress-ja-vega',
    // JA Kinetic Joomla's switch (js/darkmode.js and its pre-paint resolver) sets data-theme on html
    // as well as t4-dark (read 14/10/2026), so it wears both sides like its WordPress twin
    'joomla-ja-kinetic'
  ])
    assert.equal(loadContract(name).modes, true, name)
  // a JA Joomla template whose switch is not wired to data-theme keeps one look, as before
  assert.equal(loadContract('joomla-ja-resort').modes, undefined)
  // a resolver that always sets data-theme needs no OS-dark copy; the others keep it
  assert.equal(loadContract('joomla-ja-kinetic').modesAuto, false)
  assert.equal(loadContract('joomla-tracy-business').modesAuto, false)
  assert.equal(loadContract('joomla-tracy-base').modesAuto, undefined)
})

test('twoSides leaves the OS-dark copy out only when asked', async () => {
  const { twoSides } = await import('../src/sides.mjs')
  const moxie = loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
  const write = () => ({ css: '.x{color:red}' })
  assert.match(twoSides(moxie, write).css, /prefers-color-scheme: dark/)
  assert.doesNotMatch(twoSides(moxie, write, { modesAuto: false }).css, /prefers-color-scheme/)
})

test('the derived side rebuilds its extras from its own colours, never the system side’s', async () => {
  const { derive } = await import('../src/derive.mjs')
  const bmw = loadProfile(ROOT, 'od:bmw')
  assert.ok(bmw.extraColours && Object.keys(bmw.extraColours).length, 'BMW names extras')
  assert.equal(derive(bmw, 'dark').profile.extraColours, undefined)
})

test('a logo picture the theme left empty is never forced visible, on either side or under the OS dark block', async () => {
  // Tracy Business WordPress prints <img hidden class="tracy-logo-dark" src=""> when no dark logo was
  // uploaded; the slot's display:block!important for the dark side drew it as a broken image beside the
  // brand mark (Design system previews, sandboxed with no data-theme and an OS in dark mode, 14/10/2026)
  const { parseHTML } = await import('linkedom')
  const c = loadContract('wordpress-tracy-business')
  const sheet = wordpressVariation(loadProfile(ROOT, MOXIE), contractBase(ROOT, c), c).css
  const shows = []
  for (const m of sheet.matchAll(/([^{}]+)\{display:block!important\}/g)) shows.push(m[1].trim())
  const logoRules = shows.filter((s) => s.includes('tracy-logo-dark'))
  assert.ok(logoRules.length >= 1, 'the dark side shows its logo picture')
  const { document } = parseHTML(
    '<html><body><div class="tracy-header__brand">' +
      '<img hidden class="tracy-logo-dark empty" src="">' +
      '<img class="tracy-logo-dark nosrc">' +
      '<img class="tracy-logo-dark real" src="/logo-dark.svg">' +
      '</div></body></html>'
  )
  // the side and media wrappers aside, each selector's own part decides which picture it can reach
  const own = (sel) => sel.split(',').map((s) => s.replace(/^.*?(\.tracy-header__brand)/, '$1').trim())
  for (const rule of logoRules)
    for (const sel of own(rule)) {
      assert.equal(document.querySelector('.empty').matches(sel), false, `hidden, empty src: ${sel}`)
      assert.equal(document.querySelector('.nosrc').matches(sel), false, `no src: ${sel}`)
      assert.equal(document.querySelector('.real').matches(sel), true, `a real dark logo still shows: ${sel}`)
    }
})

test('a light system’s card shadow is not carried onto the derived dark side: the card keeps a visible edge', () => {
  // Mailchimp states a card shadow in dark ink (rgba(35,30,21,.15)) for its cream page; copied onto the
  // derived dark page it vanished and replaced the template's own 0 0 0 1px border ring, so Tracy Base
  // WP's /pricing cards blended into the page (15/10/2026)
  const MAILCHIMP = 'refero:24929007-7e62-4c96-a940-7de65438a578'
  const profile = loadProfile(ROOT, MAILCHIMP)
  const stated = profile.type.card.shadow
  const HI = ':root:root:root:root:root:root'
  const c = loadContract('wordpress-tracy-base')
  const css = wordpressVariation(profile, contractBase(ROOT, c), c).css
  const shadowOn = (side) => valueOn(css, `${HI}${side.slice(5)} .tracy-card`, 'box-shadow')
  // the system's own (light) side wears exactly what the system states
  assert.equal(shadowOn(LIGHT), stated)
  const dark = shadowOn(DARK)
  const page = valueOn(css, `${HI}${DARK.slice(5)}`, '--wp--preset--color--bg')
  assert.ok(dark && page, `dark shadow ${dark} on ${page}`)
  assert.notEqual(dark, stated, 'the light side’s ink shadow is not copied')
  const ring = /^0(?:px)? 0(?:px)? 0(?:px)? 1px (#[0-9a-f]{6})\b/i.exec(dark)
  assert.ok(ring, `a 1px ring leads the dark shadow: ${dark}`)
  assert.ok(contrast(ring[1], page) >= 1.3, `ring ${ring[1]} on ${page}: ${contrast(ring[1], page)}`)
  // the shadow that follows is dark ink, never the light page's
  assert.doesNotMatch(dark, /rgba\(35,\s*30,\s*21/)
})

test('a template that marks its dark side with a body class is scoped by it, with no "auto" side (15/10/2026)', () => {
  // the JA templates' switch: body.dark-active, set by their own script and cookie; light without it, whatever the OS
  const ja = { modeHook: ':has(> body.dark-active)', modesAuto: false }
  assert.deepEqual(sidesOf(ja), {
    light: ':where(:not(:has(> body.dark-active)))',
    dark: ':where(:has(> body.dark-active))',
    auto: null
  })
  const root = (/** @type {any} */ p) => ({ css: `:root{--ds-c-bg:${p.dark ? '#000' : '#fff'}}` })
  const profile = loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
  const css = twoSides(profile, root, ja).css
  assert.match(css, /:root:where\(:not\(:has\(> body\.dark-active\)\)\)\{--ds-c-bg:/)
  assert.match(css, /:root:where\(:has\(> body\.dark-active\)\)\{--ds-c-bg:/)
  assert.doesNotMatch(css, /prefers-color-scheme/)
  // Tracy's own themes keep data-theme and the OS's "auto"; a hook that is not a plain condition is not used
  assert.match(twoSides(profile, root).css, /@media \(prefers-color-scheme: dark\)/)
  assert.deepEqual(sidesOf({ modeHook: 'body{}' }).dark, ':where([data-theme="dark"])')
})

test('a template that marks its dark side with two marks on the root is scoped by both (JA Kinetic WordPress, 18/10/2026)', () => {
  // wp-ja-kinetic-dark.js sets data-theme="dark" and the class t4-dark together; its sheets key on either
  const kin = { modeHook: '[data-theme="dark"].t4-dark', modesAuto: false }
  assert.deepEqual(sidesOf(kin), {
    light: ':where(:not([data-theme="dark"].t4-dark))',
    dark: ':where([data-theme="dark"].t4-dark)',
    auto: null
  })
  // still a plain condition: no descendant, no list
  assert.deepEqual(sidesOf({ modeHook: '[data-theme="dark"] .t4-dark' }).dark, ':where([data-theme="dark"])')
  assert.deepEqual(sidesOf({ modeHook: '.a,.b' }).dark, ':where([data-theme="dark"])')
})
