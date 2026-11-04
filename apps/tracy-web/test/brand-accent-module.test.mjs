// Accent-only mode (#378): the override is made of the routes a template's own stylesheets take, for any template, and names
// nothing but the accent family. Every template here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accentModule, accentSeedModule } from '../src/lib/brand-accent/accent-module.js'
import { accentRoutes } from '../src/lib/brand-accent/accent-routes.js'

const SEED = '#7a3ff2'
const TEMPLATE = `
@charset "UTF-8";
:root{--brand-main:${SEED};--brand-rgb:122,63,242;--link-tone:#7A3FF2;--link-tone-hover:#6530d0;--ground:#101010;--radius:0;--danger-tone:#7a3ff2;--panel-glow:rgba(122,63,242,.25)}
body{color:#6c757d;background:var(--ground);font-family:Serif}
a{color:var(--link-tone)}
a:hover{color:var(--link-tone-hover)}
.btn{background:var(--brand-main);color:#fff;border-radius:var(--radius);font-weight:400}
.tag{color:var(--brand-main)}
.tag:hover{color:#6530d0}
.icon{fill:#7a3ff2}
.ring{border:1px solid rgba(122,63,242,.5);box-shadow:0 0 4px rgb(122 63 242 / 50%)}
.tip{background-image:url("data:image/svg+xml,%3Csvg fill='%237a3ff2'/%3E")}
.text-danger{color:#7a3ff2}
.alert{border-color:var(--danger-tone)}
.pass{color:#7a3ff2}
.pass{color:#111111}
.blue{color:#0d6efd}
.fallback{background:var(--unset-role,#7a3ff2)}
.keep{color:var(--unset-role,var(--brand-main))}
.mix{background:color-mix(in srgb,var(--unset-role,#7b40f0) 10%,transparent)}
.badge:active{background:#5a2bb8}
.badge{background:var(--brand-main)}
@media (min-width:768px){.wide{color:#7a3ff2}}
@keyframes pulse{from{color:#7a3ff2;opacity:.2}to{color:#000;opacity:1}}
`
const COLOURS = {
  accent: '#0a7d6e',
  replaces: SEED,
  shifts: [
    { side: 'light', opens: false, colour: 'accent-text', to: '#0a6f62' },
    { side: 'dark', opens: true, colour: 'accent-text', to: '#12a892' }
  ]
}
const HOOK = ':has(> body.dark-active)'
const build = (over = {}) => accentModule({ sheets: [TEMPLATE], colours: COLOURS, darkHook: HOOK, ...over })
const css = (html) => html.replace(/^<style[^>]*>/, '').replace(/<\/style>$/, '')

test('the module keeps the style id and the slot line, and says what it replaces', () => {
  const { html } = build()
  assert.match(html, /^<style id="tracy-ds-slot">\/\* tracy-ds-slot: brand:accent-only-0a7d6e \*\//)
  assert.match(
    html,
    /accent-only: replaces=#7a3ff2 accent=#0a7d6e light-text=#0a6f62 dark-text=#12a892 family=#7a3ff2/
  )
  assert.match(html, /\/\* mode: dark \*\//)
})

test('each theme gets its own readable word tone, the fill stays the accent', () => {
  const text = css(build().html)
  assert.match(text, /:root\{--tracy-accent:#0a7d6e;--tracy-accent-text:#0a6f62\}/)
  assert.match(text, /:root:has\(> body\.dark-active\)\{--tracy-accent:#0a7d6e;--tracy-accent-text:#12a892\}/)
})

test('it names nothing but colours: no corners, fonts, weights, sizes, grounds, body text or other palette', () => {
  const rules = css(build().html)
    .split('\n')
    .filter((l) => !l.startsWith('/*'))
    .join('\n')
  assert.doesNotMatch(
    rules,
    /border-radius|font-|--radius|line-height|padding|margin|--ground|fonts\.googleapis|--ds-c-[a-z-]+:/
  )
  assert.doesNotMatch(rules, /#0d6efd|#6c757d|#101010/)
  assert.doesNotMatch(rules, /#7a3ff2(?!" i\]|"\]|, )/i, 'no accent literal left except in markup selectors')
})

test('a colour written short counts as the same colour', () => {
  const short = accentModule({
    sheets: ['.x{color:#7BF;background:#7bf8}'],
    colours: { accent: '#0a7d6e', replaces: '#77bbff' }
  })
  assert.match(short.html, /\.x\{color:var\(--tracy-accent-text\)\}/)
  assert.match(short.html, /\.x\{background:color-mix\(in srgb,var\(--tracy-accent\) [\d.]+%,transparent\)\}/)
})

test('every kind of route is found in the sheet itself', () => {
  const text = css(build().html)
  assert.match(text, /:root\{--brand-main:var\(--tracy-accent\)\}/)
  assert.match(text, /:root\{--brand-rgb:10,125,110\}/)
  assert.match(
    text,
    /:root\{--link-tone:var\(--tracy-accent-text\)\}/,
    'a variable that only feeds words takes the word tone'
  )
  assert.match(text, /:root\{--panel-glow:color-mix\(in srgb,var\(--tracy-accent\) 25%,transparent\)\}/)
  assert.match(text, /\.icon\{fill:var\(--tracy-accent\)\}/)
  assert.match(text, /\.ring\{border:1px solid color-mix\(in srgb,var\(--tracy-accent\) 50%,transparent\)\}/)
  assert.match(text, /\.ring\{box-shadow:0 0 4px color-mix/)
  assert.match(text, /\.tip\{background-image:url\("data:image\/svg\+xml,%3Csvg fill='%230a7d6e'\/%3E"\)\}/)
  assert.match(text, /\.fallback\{background:var\(--unset-role,var\(--tracy-accent\)\)\}/)
  assert.match(
    text,
    /\.mix\{background:color-mix\(in srgb,var\(--unset-role,var\(--tracy-accent\)\) 10%,transparent\)\}/,
    'a near twin'
  )
  assert.match(text, /@media \(min-width:768px\)\{\.wide\{color:var\(--tracy-accent-text\)\}\}/)
  assert.match(
    text,
    /@keyframes pulse\{from\{color:var\(--tracy-accent\);opacity:\.2\}to\{color:#000;opacity:1\}\}/
  )
})

test('words reading a variable that also feeds fills take the word tone by scoping the variable, so the cascade stays', () => {
  const text = css(build().html)
  assert.match(text, /\.tag\{--brand-main:var\(--tracy-accent-text\)\}/)
  assert.match(text, /\.keep\{--brand-main:var\(--tracy-accent-text\)\}/)
  assert.doesNotMatch(text, /\.tag\{color:/)
})

test('a state keeps its step from the resting colour, as a shade of the brand accent', () => {
  const text = css(build().html)
  assert.match(text, /\.tag:hover\{color:color-mix\(in oklab,var\(--tracy-accent-text\) [\d.]+%,black\)\}/)
  assert.match(text, /\.badge:active\{background:color-mix\(in oklab,var\(--tracy-accent\) [\d.]+%,black\)\}/)
  assert.match(text, /--link-tone-hover:color-mix\(in oklab/)
  assert.match(build().html, /family=#7a3ff2,[#0-9a-f,]*#6530d0/)
})

test('a status colour stays even when it shares the accent, and an overridden declaration is not revived', () => {
  const text = css(build().html)
  assert.doesNotMatch(text, /text-danger|--danger-tone|\.alert\{/)
  assert.doesNotMatch(text, /\.pass\{/)
})

test("a page's own markup is reached: SVG paint attributes and inline styles, in any letter case", () => {
  const text = css(build().html)
  assert.match(text, /\[fill="#7a3ff2" i\]\{fill:var\(--tracy-accent\)\}/)
  assert.match(text, /\[stroke="#7a3ff2" i\]\{stroke:var\(--tracy-accent\)\}/)
  assert.match(text, /\[style\^="color:#7a3ff2"\]/)
  assert.match(text, /\[style\*="; background-color:rgb\(122, 63, 242\)"\]/)
})

test("words on an accent ground stay the template's while they read, and only then move", () => {
  assert.doesNotMatch(css(build().html), /\.btn\{color:/)
  const pale = accentModule({
    sheets: [TEMPLATE],
    colours: { accent: '#e8e36a', replaces: SEED },
    darkHook: HOOK
  })
  assert.match(css(pale.html), /\.btn\{color:#000000\}/)
  assert.match(pale.html, /words=#000000/)
})

test('two sheets with the same rule emit it once, and a template with no accent route is refused', () => {
  const twice = build({ sheets: [TEMPLATE, TEMPLATE] })
  assert.equal(twice.html, build().html)
  assert.match(build({ sheets: ['a{color:#123456}'] }).problem, /do not paint its accent #7a3ff2/)
  assert.match(accentModule({ sheets: [TEMPLATE], colours: { accent: 'red' } }).problem, /does not name/)
})

test('a template with one side uses the side it opens on', () => {
  const { html } = build({ darkHook: null })
  assert.match(html, /:root\{--tracy-accent:#0a7d6e;--tracy-accent-text:#12a892\}/)
  assert.doesNotMatch(html, /dark-active/)
})

test('a module over the limit is refused rather than cut', () => {
  const many = Array.from({ length: 1400 }, (_, i) => `.x${i}{color:#7a3ff2;border-color:#7a3ff2}`).join('')
  assert.match(build({ sheets: [many] }).problem, /over the limit/)
})

test('routes keep the sources by name, so nothing about a template is hard-coded', () => {
  const routes = accentRoutes(['.a{color:var(--my-odd-name)}:root{--my-odd-name:#7a3ff2}'], SEED)
  assert.deepEqual([...routes.roles], [['--my-odd-name', 'word']])
})

test('the seed the brand step writes names the accent and carries what the picture step reads, as a comment', () => {
  const html = accentSeedModule({
    colours: COLOURS,
    darkHook: HOOK,
    note: '/* picture roles: x{--ds-c-bg:#ffffff} */\n'
  })
  assert.match(html, /tracy-ds-slot: brand:accent-only-0a7d6e/)
  assert.match(html, /\/\* picture roles: x\{--ds-c-bg:#ffffff\} \*\//)
  assert.match(html, /\[fill="#7a3ff2" i\]/)
})
