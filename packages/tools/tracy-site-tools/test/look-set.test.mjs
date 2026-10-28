import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { apply } from '../lib/index.js'
import {
  boostTo,
  compareSpec,
  cssDeclarations,
  editableSheet,
  LOOK_SET_CALL,
  lookSet,
  lookSetRequest,
  matchedElement,
  pageClassOf,
  parseBy,
  pickDeclaration,
  scopeTo,
  specificity,
  themeJsonPath,
  themeJsonSameValue,
  wpKebab
} from '../src/host/look-set.mjs'
import { paintSelectors, resolveStyles } from '../src/host/look-style.mjs'
import { cssHash, LOOK_UNDO_DIR, revertLook } from '../src/host/look-undo.mjs'
import { cdpRule, heroCascade, SLOT_BUTTON } from './look-cascade-fixture.mjs'

// 🔒 `tracy_site` `look.set` (PR #926): one call writes a look where `page.look`'s reading says it
// belongs, keeps a look undo and reads the element again. Measured before (flow D, 05/10/2026): a
// one-button colour took 24 calls on WordPress, a phone-only hide 15–20, a site-wide colour with one
// page kept 72 on Joomla. The fake sites below carry the bench templates' own shapes (Tracy Business
// on WordPress, Joomla T4 and EmDash); the cascade rows are the ones `page.look` answered there.

// ── what a call may ask ──────────────────────────────────────────────────────────────────────────

test('lookSetRequest: an element, its props, a scope, and a viewport in the words an agent uses', () => {
  const ok = /** @type {any} */ (
    lookSetRequest({
      path: '/',
      target: { text: '  See what  we bake ' },
      props: { 'Background-Color': '#1d4ed8', '--tb-forest': '#1E3A5F' },
      scope: 'element'
    })
  )
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.req, {
    path: '/',
    target: { text: 'See what we bake', nth: 0 },
    props: [
      ['background-color', '#1d4ed8'],
      ['--tb-forest', '#1E3A5F']
    ],
    scope: 'element',
    viewport: null
  })
  // the words alone, a target put beside `action`, and the phone spelled every way the runs spelled it
  assert.equal(
    /** @type {any} */ (lookSetRequest({ target: 'Get in touch', props: { display: 'none' }, scope: 'page' }))
      .req.target.text,
    'Get in touch'
  )
  assert.equal(
    /** @type {any} */ (
      lookSetRequest({ props: { display: 'none' }, scope: 'page' }, { selector: '.x', nth: '1' })
    ).req.target.nth,
    1
  )
  for (const [asked, want] of [
    ['mobile', 'mobile'],
    ['phone', 'mobile'],
    ['390x844', 'mobile'],
    ['phone 390×844', 'mobile'],
    ['desktop', 'desktop'],
    ['1440x900', 'desktop'],
    ['tablet', 'desktop']
  ])
    assert.equal(
      /** @type {any} */ (
        lookSetRequest({ target: 'x', props: { display: 'none' }, scope: 'element', viewport: asked })
      ).req.viewport,
      want,
      asked
    )
  for (const [params, why] of /** @type {[Record<string, unknown>, RegExp][]} */ ([
    [{ target: 'x', props: { color: 'red' }, scope: 'element', style: {} }, /would have been ignored/],
    [{ props: { color: 'red' }, scope: 'element' }, /names no element/],
    [{ target: { text: 'a', selector: '.b' }, props: { color: 'red' }, scope: 'element' }, /not both/],
    [{ target: 'x', props: {}, scope: 'element' }, /names no property/],
    [{ target: 'x', props: ['color'], scope: 'element' }, /props is an object/],
    [{ target: 'x', props: { 'color;': 'red' }, scope: 'element' }, /not a CSS property name/],
    [{ target: 'x', props: { color: 'red; } body { display:none' }, scope: 'element' }, /cannot carry/],
    [{ target: 'x', props: { color: 'red !important' }, scope: 'element' }, /leave !important out/],
    [{ target: 'x', props: { background: 'url(https://x.example/a.png)' }, scope: 'element' }, /picture/],
    [{ target: 'x', props: { color: 'red' }, scope: 'everywhere' }, /scope is/],
    [{ target: 'x', props: { color: 'red' } }, /scope is/],
    [{ target: 'x', props: { color: 'red' }, scope: 'site', viewport: 'mobile' }, /every width/],
    [{ target: 'x', props: { color: 'red' }, scope: 'page', viewport: 'sideways' }, /viewport is/]
  ])) {
    const r = /** @type {any} */ (lookSetRequest(params))
    assert.equal(r.ok, false, JSON.stringify(params))
    assert.equal(r.answer.code, 'BAD_LOOK_SET')
    assert.match(r.answer.error, why)
    assert.match(r.answer.next, /look\.set \{path/)
  }
})

// ── selectors, sheets, declarations ──────────────────────────────────────────────────────────────

test('specificity, a page scope and a boost: the rule look.set writes beats the one that wins, and only where it won', () => {
  assert.deepEqual(specificity('.tracy .wp-block-button.is-style-orange .wp-block-button__link'), [0, 4, 0])
  assert.deepEqual(specificity('#a .b:hover::before'), [1, 2, 1])
  assert.deepEqual(specificity(':where(.a) :is(#x, .y) p'), [1, 0, 1])
  assert.deepEqual(specificity('a, .b, #c'), [1, 0, 0], 'a list counts its most specific selector')
  assert.equal(scopeTo('.tb-btn--signal', 'item-599'), 'body.item-599 .tb-btn--signal')
  assert.equal(
    scopeTo(':root', 'item-5'),
    ':root:has(> body.item-5)',
    'a token is set again on the page’s own root'
  )
  assert.equal(
    scopeTo('body.home .x, html[data-theme=dark] .y', 'page-id-4'),
    'body.page-id-4.home .x, html[data-theme=dark]:has(> body.page-id-4) .y'
  )
  assert.equal(boostTo('a.btn', [0, 3, 0]), 'a.btn.btn.btn')
  assert.equal(boostTo('header a', [1, 0, 0]), 'header a:not(#\\#)')
  assert.equal(boostTo('a.x', [0, 1, 5]), 'a.x.x')
  const page = 'body.page-id-42 div.wp-block-button.is-style-orange a.wp-block-button__link'
  assert.equal(boostTo(page, [0, 4, 0]), page, 'already more specific: unchanged')
  assert.equal(pageClassOf('home wp-singular page-template-default page page-id-42 wp-theme-x'), 'page-id-42')
  assert.equal(pageClassOf('site-x com_content view-featured item-599 loaded-bs5'), 'item-599')
  assert.equal(pageClassOf('home blog'), 'home')
  assert.equal(pageClassOf(''), null)
  assert.deepEqual(parseBy('.btn @media (max-width: 767.98px) @layer components'), {
    selectors: '.btn',
    media: '(max-width: 767.98px)',
    cut: false
  })
  for (const by of ['its style attribute', 'an HTML attribute', 'the browser default', undefined])
    assert.equal(parseBy(by), null)
})

test('editableSheet: a file of the theme or template, never core, a plugin, an upload, T4’s cache or a way out', () => {
  assert.equal(
    editableSheet('wordpress', '/wp-content/themes/wp-tracy-business/assets/css/sections.css'),
    '/wp-content/themes/wp-tracy-business/assets/css/sections.css'
  )
  assert.equal(
    editableSheet('wordpress', '/wp-content/themes/t/style.css (inlined in the page)'),
    '/wp-content/themes/t/style.css'
  )
  assert.equal(
    editableSheet('joomla', '/templates/tracy_business/css/styles/tracy-business.css'),
    '/templates/tracy_business/css/styles/tracy-business.css'
  )
  assert.equal(
    editableSheet('joomla', '/media/templates/site/cassiopeia/css/user.css'),
    '/media/templates/site/cassiopeia/css/user.css'
  )
  for (const [platform, name] of [
    ['wordpress', '/wp-includes/blocks/navigation/style.min.css'],
    ['wordpress', '/wp-content/plugins/contact-form-7/includes/css/styles.css'],
    ['wordpress', '/wp-content/uploads/elementor/css/post-1.css'],
    ['wordpress', 'global-styles-inline-css'],
    ['wordpress', 'http://other.example/wp-content/themes/t/a.css'],
    ['wordpress', '/wp-content/themes/t/%2e%2e/%2e%2e/%2e%2e/etc/x.css'],
    ['wordpress', '/wp-content/themes/t/functions.php'],
    ['joomla', '/media/t4/optimize/css/922f8a66bb95f7c0754372275b5d854f.css'],
    ['joomla', '/plugins/system/t4/themes/base/vendors/font-awesome/css/font-awesome.min.css'],
    ['joomla', '/wp-content/themes/t/a.css'],
    ['emdash', '/_astro/NotFound.CraRx2Su.css']
  ])
    assert.equal(editableSheet(platform, name), null, `${platform} ${name}`)
})

test('cssDeclarations + pickDeclaration: the one declaration the cascade names — light, not dark; @theme as :root; line when two rules match', () => {
  const css = [
    ':root {',
    '  --tb-ink: #14171A;',
    '  --tb-forest: #14483A; /* brand */',
    '}',
    '/* dark */',
    'html[data-theme="dark"] {',
    '  --tb-forest: #7FBFA6;',
    '}',
    '@media (prefers-color-scheme: dark) { :root { --tb-forest: #0C2B23 !important } }',
    ':root {',
    '  --tb-band-forest-bg: #14483A;',
    '  --tb-forest: #14483A;',
    '}',
    '.card { color: var(--tb-forest); & .x { --tb-forest: red } }'
  ].join('\n')
  const decls = cssDeclarations(css)
  const light = pickDeclaration(decls, { name: '--tb-forest', by: ':root', line: 1 })
  assert.equal(light.ok, true)
  assert.equal(/** @type {any} */ (light).decl.value, '#14483A')
  assert.equal(
    css.slice(/** @type {any} */ (light).decl.start, /** @type {any} */ (light).decl.end),
    '#14483A'
  )
  assert.equal(/** @type {any} */ (light).decl.line, 1)
  assert.equal(
    pickDeclaration(decls, { name: '--tb-forest', by: ':root' }).ok,
    false,
    'two :root rules, no line: not guessed'
  )
  assert.equal(
    /** @type {any} */ (pickDeclaration(decls, { name: '--tb-forest', by: ':root', line: 10 })).decl.line,
    10
  )
  assert.equal(
    /** @type {any} */ (pickDeclaration(decls, { name: '--tb-forest', by: 'html[data-theme=dark]' })).decl
      .value,
    '#7FBFA6',
    'the cascade drops quotes an identifier does not need; the source keeps them'
  )
  const dark = /** @type {any} */ (
    pickDeclaration(decls, { name: '--tb-forest', by: ':root @media (prefers-color-scheme: dark)' })
  ).decl
  assert.equal(dark.value, '#0C2B23')
  assert.equal(dark.important, true)
  // Tailwind v4: a token of @theme compiles to `:root, :host` in @layer theme
  const tw =
    '@import "tailwindcss";\n@theme {\n\t--color-forest: #14483a;\n\t--color-link: var(--color-forest);\n}\nhtml[data-theme="dark"] { --color-link: #8fccb2; }\n'
  const forest = /** @type {any} */ (
    pickDeclaration(cssDeclarations(tw), { name: '--color-forest', by: ':root @layer theme' })
  )
  assert.equal(forest.ok, true)
  assert.equal(forest.decl.theme, true)
  assert.equal(
    pickDeclaration(cssDeclarations(tw), { name: '--color-forest', by: 'its style attribute' }).ok,
    false
  )
})

test('theme.json: a WordPress variable found by its preset slug or kebab-cased custom path, and the colours that share its value', () => {
  assert.equal(wpKebab('inkText'), 'ink-text')
  assert.equal(wpKebab('sectionY'), 'section-y')
  assert.equal(wpKebab('h1'), 'h1')
  const text =
    '{\n\t"version": 3,\n\t"settings": {\n\t\t"color": {\n\t\t\t"palette": [\n\t\t\t\t{ "slug": "accent", "color": "#14483a", "name": "Accent" },\n\t\t\t\t{ "slug": "warn", "color": "#da5a2a", "name": "Warn" }\n\t\t\t]\n\t\t},\n\t\t"custom": { "tracy": { "brand": { "orange": "#da5a2a", "inkText": "#b9b5ac" } }, "radius": { "md": "0px" } }\n\t}\n}\n'
  const json = JSON.parse(text)
  const orange = /** @type {any} */ (themeJsonPath(json, '--wp--custom--tracy--brand--orange'))
  assert.deepEqual(orange.path, ['settings', 'custom', 'tracy', 'brand', 'orange'])
  assert.deepEqual(/** @type {any} */ (themeJsonPath(json, '--wp--preset--color--warn')).path, [
    'settings',
    'color',
    'palette',
    1,
    'color'
  ])
  assert.deepEqual(
    /** @type {any} */ (themeJsonPath(json, '--wp--custom--tracy--brand--ink-text')).path.at(-1),
    'inkText'
  )
  assert.equal(themeJsonPath(json, '--wp--preset--color--nope'), null)
  assert.equal(themeJsonPath(json, '--tb-forest'), null)
  assert.deepEqual(themeJsonSameValue(json, '#DA5A2A', '--wp--custom--tracy--brand--orange'), [
    '--wp--preset--color--warn'
  ])
})

// ── the call, on fake sites ──────────────────────────────────────────────────────────────────────

/**
 * A site folder with the files of one platform, an io that reaches `/app/` through a map, and a
 * WordPress Additional CSS held in memory (`custom`), answering as `lookIo`'s `customCss` does:
 * a write lands only while the CSS still hashes to `expect`.
 */
function fakeSite(
  /** @type {Record<string, string>} */ webrootFiles,
  /** @type {Record<string, string>} */ appFiles = {},
  /** @type {string} */ additionalCss = '',
  /** @type {boolean} */ exists = true
) {
  // `exists`: whether the theme has a `custom_css` post at all (a site that never saved Additional CSS has none)
  const custom = {
    stylesheet: 'wp-tracy-business',
    css: additionalCss,
    block: true,
    exists,
    reads: 0,
    writes: 0,
    removes: 0
  }
  const root = mkdtempSync(path.join(tmpdir(), 'tch-look-set-'))
  const siteRoot = path.join(root, 'site1')
  for (const [rel, text] of Object.entries(webrootFiles)) {
    const file = path.join(siteRoot, '.webroot', rel)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  const app = new Map(Object.entries(appFiles))
  /** @type {import('../src/host/look-undo.mjs').LookIo} */
  const io = {
    async read(file) {
      if (file.startsWith('/app/'))
        return app.has(file) ? Buffer.from(/** @type {string} */ (app.get(file))) : null
      try {
        return readFileSync(file)
      } catch {
        return null
      }
    },
    async write(file, bytes) {
      if (file.startsWith('/app/')) app.set(file, bytes.toString('utf8'))
      else {
        // as `lookIo` writes: a file of a folder that does not exist yet gets its folder
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(file, bytes)
      }
    },
    async remove(file) {
      if (file.startsWith('/app/')) app.delete(file)
      else rmSync(file, { force: true })
    },
    customCss: {
      async read() {
        custom.reads += 1
        return { stylesheet: custom.stylesheet, css: custom.css, block: custom.block, exists: custom.exists }
      },
      async write({ stylesheet, css, expect }) {
        assert.equal(stylesheet, custom.stylesheet, 'the Additional CSS of the theme the site runs')
        if (cssHash(custom.css) !== expect) return { ok: false, conflict: true }
        custom.writes += 1
        custom.css = css
        custom.exists = true
        return { ok: true, css }
      },
      async remove({ stylesheet, expect }) {
        assert.equal(stylesheet, custom.stylesheet, 'the Additional CSS of the theme the site runs')
        if (cssHash(custom.css) !== expect) return { ok: false, conflict: true }
        custom.removes += 1
        custom.css = ''
        custom.exists = false
        return { ok: true, css: '' }
      }
    }
  }
  const read = (/** @type {string} */ rel) => readFileSync(path.join(siteRoot, '.webroot', rel), 'utf8')
  const undos = () =>
    existsSync(path.join(siteRoot, LOOK_UNDO_DIR)) ? readdirSync(path.join(siteRoot, LOOK_UNDO_DIR)) : []
  return { siteRoot, io, read, app, undos, custom }
}

/** Every theme file of the fake WordPress site, as written: a look.set leaves each one as it was. */
const assertThemeUntouched = (/** @type {ReturnType<typeof fakeSite>} */ site) => {
  for (const [rel, text] of Object.entries(wpFiles())) assert.equal(site.read(rel), text, `${rel} untouched`)
}

/** A measure that answers the readings in order and records each request. */
function readings(/** @type {any[]} */ ...payloads) {
  /** @type {any[]} */
  const asked = []
  const measure = async (/** @type {any} */ req, /** @type {string} */ at) => {
    asked.push({ req, at })
    const next = payloads.shift()
    if (next === undefined) throw new Error('no more readings')
    return { ok: true, payload: next, url: `http://site.test${at}` }
  }
  return { measure, asked }
}

const WP_SHEETS = [
  '/wp-includes/blocks/navigation/style.min.css',
  '<style id="wp-block-button-inline-css">',
  'global-styles-inline-css',
  '/wp-content/plugins/contact-form-7/includes/css/styles.css',
  '/wp-content/themes/wp-tracy-business/assets/css/tracy.css',
  '/wp-content/themes/wp-tracy-business/assets/css/layout.css',
  '/wp-content/themes/wp-tracy-business/assets/css/sections.css',
  '/wp-content/themes/wp-tracy-business/assets/css/wp-tracy-business.css'
]
const WP_BODY =
  'home wp-singular page-template-default page page-id-42 wp-theme-wp-tracy-business tracy tracy-page-home'
const WP_BUTTON = '.tracy .wp-block-button.is-style-orange .wp-block-button__link'
const WP_THEME_JSON =
  '{\n\t"version": 3,\n\t"settings": {\n\t\t"color": { "palette": [ { "slug": "accent", "color": "#14483a" }, { "slug": "warn", "color": "#da5a2a" } ] },\n\t\t"custom": { "tracy": { "brand": { "orange": "#da5a2a" } } }\n\t}\n}\n'
const wpFiles = () => ({
  'wp-config.php': '<?php\n',
  'wp-content/themes/wp-tracy-business/theme.json': WP_THEME_JSON,
  'wp-content/themes/wp-tracy-business/assets/css/tracy.css': ':root { --x: 1; }\n',
  'wp-content/themes/wp-tracy-business/assets/css/layout.css': '.wtb-inner { max-width: 1176px; }\n',
  'wp-content/themes/wp-tracy-business/assets/css/sections.css': '.wtb-hero { padding: 88px 0; }\n',
  'wp-content/themes/wp-tracy-business/assets/css/wp-tracy-business.css': `${WP_BUTTON} {\n  background: var(--wp--custom--tracy--brand--orange);\n}\n`
})
const wpButton = (
  /** @type {Record<string, unknown>} */ props,
  /** @type {Record<string, unknown>} */ info = {}
) => ({
  info: {
    el: '<a.wp-block-button__link.wp-element-button>',
    text: 'See what we bake',
    matches: 1,
    how: 'exact',
    hidden: false,
    unique:
      'div.wp-block-group.wtb-hero div.wp-block-button.is-style-orange a.wp-block-button__link.wp-element-button',
    body: WP_BODY,
    chrome: false,
    sheets: WP_SHEETS,
    ...info
  },
  props,
  loaded: true
})
const orangeRow = {
  value: 'rgb(218, 90, 42)',
  hex: '#da5a2a',
  set: 'background: var(--wp--custom--tracy--brand--orange)',
  by: WP_BUTTON,
  sheet: '/wp-content/themes/wp-tracy-business/assets/css/wp-tracy-business.css',
  line: 600,
  tokens: [
    {
      name: '--wp--custom--tracy--brand--orange',
      value: '#da5a2a',
      by: ':root',
      sheet: 'global-styles-inline-css',
      on: '<html>'
    }
  ]
}

test('WordPress, scope element: ONE rule for that button on that page, after the rule that wins, as specific — undo kept, read again', async () => {
  const site = fakeSite(wpFiles())
  const { measure, asked } = readings(
    wpButton({ 'background-color': orangeRow }),
    wpButton({ 'background-color': { ...orangeRow, value: 'rgb(29, 78, 216)', hex: '#1d4ed8' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: {
        path: '/',
        target: { text: 'See what we bake' },
        props: { 'background-color': '#1d4ed8' },
        scope: 'element'
      },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(out.values, { 'background-color': { before: '#da5a2a', after: '#1d4ed8' } })
  assert.match(out.reach, /this element, on this page only \(body\.page-id-42\)/)
  // 🔒 the site's Additional CSS, never the theme's files: a theme update replaces those
  assert.equal(
    site.custom.css,
    '/* look.set: this element, this page only (body.page-id-42) */\nbody.page-id-42 div.wp-block-group.wtb-hero div.wp-block-button.is-style-orange a.wp-block-button__link.wp-element-button {\n  background-color: #1d4ed8;\n}\n'
  )
  assert.equal(out.wrote[0].file, 'Additional CSS')
  assertThemeUntouched(site)
  assert.equal(site.undos().length, 1)
  assert.equal(out.undo, site.undos()[0])
  assert.match(out.next, new RegExp(`look\\.revert \\{undo:"${out.undo}"\\}`))
  // the first read asks for the selector and the sheets; the second reads that same element back
  assert.equal(asked[0].req.set, true)
  assert.deepEqual(asked[1].req, {
    selector: wpButton({}).info.unique,
    nth: 0,
    props: ['background-color'],
    viewport: 'desktop'
  })
})

test('WordPress, hide on phones: display:none inside the phone media query, and the answer says it is hidden now', async () => {
  const site = fakeSite(wpFiles())
  const displayRow = {
    value: 'block',
    set: 'display: block',
    by: '.wp-block-button',
    sheet: '<style id="wp-block-button-inline-css">'
  }
  const { measure, asked } = readings(
    wpButton({ display: displayRow }, { el: '<a.wp-block-button__link>', text: 'Get in touch' }),
    {
      ...wpButton({ display: { ...displayRow, value: 'none' } }),
      info: { ...wpButton({}).info, hidden: 'display:none' }
    }
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: {
        path: '/',
        target: 'Get in touch',
        props: { display: 'none' },
        scope: 'element',
        viewport: '390x844'
      },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(out.for, 'phones (below 768px)')
  assert.equal(out.hidden, 'display:none')
  assert.equal(asked[0].req.viewport, 'mobile', 'read where the change is asked')
  // the winner is a core block style early in the page: Additional CSS is printed after it
  assert.match(
    site.custom.css,
    /^\/\* look\.set: [^*]+\*\/\n@media \(max-width: 767\.98px\) \{\n {2}body\.page-id-42 [^{]+ \{\n {4}display: none;\n {2}\}\n\}\n$/
  )
  assertThemeUntouched(site)
})

test('WordPress, scope site: the theme.json token set again in Additional CSS on the selector global styles sets it on — theme.json untouched, the palette twin named, not changed', async () => {
  const site = fakeSite(wpFiles())
  const { measure } = readings(
    wpButton({ 'background-color': orangeRow }),
    wpButton({ 'background-color': { ...orangeRow, hex: '#1d4ed8' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'See what we bake', props: { 'background-color': '#1d4ed8' }, scope: 'site' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(
    site.custom.css,
    '/* look.set: --wp--custom--tracy--brand--orange, every page */\n:root {\n  --wp--custom--tracy--brand--orange: #1d4ed8;\n}\n'
  )
  assert.match(out.wrote[0].change, /added .*:root \{ --wp--custom--tracy--brand--orange: #1d4ed8; \}/)
  assert.match(out.sameValue, /--wp--preset--color--warn/)
  assert.match(out.reach, /every element using --wp--custom--tracy--brand--orange, on every page/)
  assertThemeUntouched(site)
})

test('a write that changed nothing is put back, byte for byte, and said', async () => {
  const site = fakeSite(wpFiles(), {}, '.site-title { letter-spacing: 0; }\n')
  const { measure } = readings(
    wpButton({ 'background-color': orangeRow }),
    wpButton({ 'background-color': orangeRow })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'See what we bake', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, false)
  assert.equal(out.code, 'LOOK_SET_NO_EFFECT')
  assert.match(out.error, /background-color: #da5a2a by \.tracy/)
  assert.match(out.error, /the site's Additional CSS was put back/)
  assert.equal(site.custom.css, '.site-title { letter-spacing: 0; }\n', 'the person’s own CSS as it was')
  assertThemeUntouched(site)
})

test('refused, nothing written: a page no class names, EmDash sections', async () => {
  const site = fakeSite(wpFiles())
  const nameless = readings(wpButton({ 'background-color': orangeRow }, { body: 'custom-body' }))
  const noClass = /** @type {any} */ (
    await lookSet({
      params: { target: 'x', props: { 'background-color': '#1d4ed8' }, scope: 'page' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure: nameless.measure,
      io: site.io
    })
  )
  assert.match(noClass.error, /carries no class that names it/)
  assert.ok(noClass.measured['background-color'], 'what was read rides the refusal: no second page.look')
  let measured = 0
  const emdash = /** @type {any} */ (
    await lookSet({
      params: { target: 'x', props: { display: 'none' }, scope: 'element', viewport: 'mobile' },
      platform: 'emdash',
      siteRoot: site.siteRoot,
      measure: async () => {
        measured += 1
        return { ok: true, payload: {}, url: '' }
      },
      io: site.io
    })
  )
  assert.equal(emdash.code, 'LOOK_SET_NO_ROAD')
  assert.match(emdash.error, /\.astro/)
  assert.equal(measured, 0, 'refused before the page is read')
  assert.doesNotMatch(emdash.next, /measured/, 'nothing was read, so nothing is said to be below')
  assert.match(noClass.next, /what was measured is below/)
  assert.equal(site.undos().length, 0)
  assert.equal(site.custom.writes, 0)
  assertThemeUntouched(site)
})

test('an element of the site header is the same element on every page: no page class, and the answer says how far it reaches', async () => {
  const site = fakeSite(wpFiles())
  const { measure } = readings(
    wpButton({ 'background-color': orangeRow }, { chrome: true, unique: 'header a.wp-block-button__link' }),
    wpButton({ 'background-color': { ...orangeRow, hex: '#000000' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'Order', props: { 'background-color': '#000' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.match(out.reach, /on every page/)
  // `header a.wp-block-button__link` (0,1,2) is boosted to beat the winner's (0,4,0)
  assert.match(
    site.custom.css,
    /\nheader a\.wp-block-button__link\.wp-block-button__link\.wp-block-button__link\.wp-block-button__link \{/
  )
  assertThemeUntouched(site)
})

test('WordPress: the Additional CSS a person already wrote is kept, the rule goes after it, and look.revert puts back exactly what was there', async () => {
  const mine = '/* mine */\n.site-title { letter-spacing: 0.02em; }'
  const site = fakeSite(wpFiles(), {}, mine)
  const { measure } = readings(
    wpButton({ 'background-color': orangeRow }),
    wpButton({ 'background-color': { ...orangeRow, hex: '#1d4ed8' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'See what we bake', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.ok(
    site.custom.css.startsWith(`${mine}\n\n/* look.set: this element, this page only (body.page-id-42) */\n`)
  )
  assert.equal(site.custom.writes, 1)
  const manifest = JSON.parse(
    readFileSync(path.join(site.siteRoot, LOOK_UNDO_DIR, out.undo, 'manifest.json'), 'utf8')
  )
  assert.deepEqual(manifest.files, [], 'no theme file was copied, because none is written')
  assert.deepEqual(manifest.customCss, { stylesheet: 'wp-tracy-business', before: 'c0', after: 'c1' })
  const back = /** @type {any} */ (await revertLook({ siteRoot: site.siteRoot, undo: out.undo, io: site.io }))
  assert.equal(back.ok, true, JSON.stringify(back))
  assert.deepEqual(back.restored, ['Additional CSS'])
  assert.equal(site.custom.css, mine, 'byte for byte')
  assertThemeUntouched(site)
})

test('WordPress: look.revert refuses when the Additional CSS changed after the look change — nothing is overwritten', async () => {
  const site = fakeSite(wpFiles())
  const { measure } = readings(
    wpButton({ 'background-color': orangeRow }),
    wpButton({ 'background-color': { ...orangeRow, hex: '#1d4ed8' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'See what we bake', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  // a person saves Additional CSS in the Customizer afterwards
  site.custom.css = `${site.custom.css}\n.later { color: red; }\n`
  const later = site.custom.css
  const back = /** @type {any} */ (await revertLook({ siteRoot: site.siteRoot, undo: out.undo, io: site.io }))
  assert.equal(back.ok, false)
  assert.equal(back.code, 'LOOK_UNDO_CHANGED_SINCE')
  assert.match(back.error, /Additional CSS changed after look change [0-9a-f]{6}/)
  assert.equal(site.custom.css, later, 'the later change stands')
})

test('WordPress, scope site: a token a theme stylesheet declares is set again in Additional CSS on its own selector, made to beat the later sheet — the sheet untouched', async () => {
  const site = fakeSite(wpFiles())
  const gapRow = {
    value: '1',
    set: 'order: var(--x)',
    by: '.wtb-hero',
    sheet: '/wp-content/themes/wp-tracy-business/assets/css/sections.css',
    tokens: [
      {
        name: '--x',
        value: '1',
        by: ':root',
        sheet: '/wp-content/themes/wp-tracy-business/assets/css/tracy.css',
        line: 1
      }
    ]
  }
  const { measure } = readings(wpButton({ order: gapRow }), wpButton({ order: { ...gapRow, value: '2' } }))
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'See what we bake', props: { order: '2' }, scope: 'site' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  // tracy.css is printed after global styles, where a block theme's Additional CSS stands: `:root`
  // alone would lose to the theme's own `:root` by order, so it is made more specific
  assert.equal(site.custom.css, '/* look.set: --x, every page */\n:root:not(.\\#) {\n  --x: 2;\n}\n')
  assertThemeUntouched(site)
})

test('WordPress: Additional CSS that cannot be read, or that a person saves at the same moment, refuses — nothing written, no undo kept', async () => {
  const unread = fakeSite(wpFiles())
  unread.io.customCss = {
    read: async () => {
      throw new Error('wp-cli is not in site1-web-1')
    },
    write: async () => assert.fail('nothing is written after a failed read')
  }
  const one = readings(wpButton({ 'background-color': orangeRow }))
  const a = /** @type {any} */ (
    await lookSet({
      params: { target: 'x', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: unread.siteRoot,
      measure: one.measure,
      io: unread.io
    })
  )
  assert.equal(a.code, 'LOOK_SET_NO_ROAD')
  assert.match(a.error, /could not read this site's Additional CSS \(wp-cli is not in site1-web-1\)/)
  assert.equal(unread.undos().length, 0)

  const raced = fakeSite(wpFiles())
  const real = /** @type {any} */ (raced.io.customCss)
  raced.io.customCss = {
    read: async () => {
      const got = await real.read()
      raced.custom.css = '.saved-meanwhile { color: red; }\n'
      return got
    },
    write: (/** @type {any} */ input) => real.write(input)
  }
  const two = readings(wpButton({ 'background-color': orangeRow }))
  const b = /** @type {any} */ (
    await lookSet({
      params: { target: 'x', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: raced.siteRoot,
      measure: two.measure,
      io: raced.io
    })
  )
  assert.equal(b.code, 'LOOK_SET_NO_ROAD')
  assert.match(b.error, /Additional CSS changed while look\.set was writing/)
  assert.equal(raced.custom.css, '.saved-meanwhile { color: red; }\n', 'the person’s save stands')
  assert.equal(raced.undos().length, 0, 'a write that did not land keeps no undo')
  assertThemeUntouched(raced)
})

test('WordPress: where Additional CSS is printed decides how specific the rule is — a block theme prints it before the theme sheets, a classic theme after', async () => {
  // the winner and the element's own selector are equally specific (0,1,2): as specific is enough
  // only where Additional CSS is printed after the winner's sheet
  const late = { ...orangeRow, by: 'header a.b', sheet: '/wp-content/plugins/late/late.css', tokens: [] }
  const run = async (/** @type {boolean} */ block, /** @type {string[]} */ sheets) => {
    const site = fakeSite(wpFiles())
    site.custom.block = block
    const { measure } = readings(
      wpButton({ 'background-color': late }, { sheets, chrome: true, unique: 'header a.b' }),
      wpButton({ 'background-color': { ...late, hex: '#1d4ed8' } })
    )
    const out = /** @type {any} */ (
      await lookSet({
        params: { target: 'x', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
        platform: 'wordpress',
        siteRoot: site.siteRoot,
        measure,
        io: site.io
      })
    )
    assert.equal(out.ok, true, JSON.stringify(out))
    assertThemeUntouched(site)
    return /** @type {string} */ (site.custom.css.split('\n')[1])
  }
  const sheets = [...WP_SHEETS, '/wp-content/plugins/late/late.css']
  assert.equal(
    await run(true, sheets),
    'header a.b.b {',
    'block theme: Additional CSS is inside global styles, before late.css — one step past (0,1,2)'
  )
  assert.equal(
    await run(false, sheets),
    'header a.b {',
    'classic theme: printed last in <head>, after late.css'
  )
  assert.equal(
    await run(false, [...WP_SHEETS, '<style id="wp-custom-css">', '/wp-content/plugins/late/late.css']),
    'header a.b.b {',
    'a sheet the page prints after <style id="wp-custom-css"> (the footer): one step past it'
  )
})

test('🔒 WordPress: a page that does not print the Additional CSS it has is refused before anything is written, and the theme sheet the page loads last is named (#1710)', async () => {
  // A block theme prints Additional CSS only inside global styles; a design page that dequeues them
  // (Tracy's artifact home page before the theme fix) printed none of it, and look.set wrote anyway.
  const design = [
    '<style id="wp-block-post-content-inline-css">',
    '/wp-content/themes/wp-tracy-business/assets/css/artifacts/landing/_theme.css',
    '/wp-content/themes/wp-tracy-business/assets/css/fixture-page.css',
    '<style id="tracy-logo-text">'
  ]
  for (const block of [true, false]) {
    const site = fakeSite(wpFiles(), {}, '.saved-before { color: red; }\n')
    site.custom.block = block
    const { measure } = readings(wpButton({ 'background-color': orangeRow }, { sheets: design }))
    const out = /** @type {any} */ (
      await lookSet({
        params: { target: 'x', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
        platform: 'wordpress',
        siteRoot: site.siteRoot,
        measure,
        io: site.io
      })
    )
    assert.equal(out.ok, false, JSON.stringify(out))
    assert.equal(out.code, 'LOOK_SET_NOT_PRINTED')
    assert.match(out.error, /this page does not print the site's Additional CSS/)
    assert.match(out.next, /wp-content\/themes\/wp-tracy-business\/assets\/css\/fixture-page\.css/)
    assert.match(out.next, /a theme update replaces/)
    assert.match(out.next, /page\.look/)
    assert.equal(site.custom.writes, 0, 'nothing written')
    assert.equal(site.custom.css, '.saved-before { color: red; }\n')
    assert.equal(site.undos().length, 0, 'no undo for a write never made')
    assertThemeUntouched(site)
  }
  // the same page printing it in its own sheet (the theme fix: `wp_custom_css_cb` at wp_head 101) is written
  const fixed = fakeSite(wpFiles(), {}, '.saved-before { color: red; }\n')
  const { measure } = readings(
    wpButton({ 'background-color': orangeRow }, { sheets: [...design, '<style id="wp-custom-css">'] }),
    wpButton({ 'background-color': { ...orangeRow, hex: '#1d4ed8' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'x', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: fixed.siteRoot,
      measure,
      io: fixed.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(fixed.custom.writes, 1)
  // empty Additional CSS prints nothing anywhere, so a page with none of it cannot be judged: written, then read back
  const empty = fakeSite(wpFiles())
  const two = readings(
    wpButton({ 'background-color': orangeRow }, { sheets: design }),
    wpButton({ 'background-color': { ...orangeRow, hex: '#1d4ed8' } })
  )
  const first = /** @type {any} */ (
    await lookSet({
      params: { target: 'x', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: empty.siteRoot,
      measure: two.measure,
      io: empty.io
    })
  )
  assert.equal(first.ok, true, JSON.stringify(first))
})

// ── a site wearing a design system, and what a write answers ─────────────────────────────────────

/** The sheets of a WordPress block-theme page wearing a design system: the slot's CSS is in global styles. */
const DS_SHEETS = [
  '/wp-includes/blocks/navigation/style.min.css',
  '<style id="global-styles-inline-css">',
  '/wp-content/themes/tracy-base/assets/css/tracy.css'
]
const DS_BODY =
  'home wp-singular page-template-default page page-id-94 wp-theme-tracy-base tracy tracy-page-home'
const DS_UNIQUE = 'div.tracy-hero div.wp-block-button a.wp-block-button__link.wp-element-button'

/**
 * A reading made by `resolveStyles` itself from a CDP cascade, each sheet id named as `exec.mjs` names
 * it — so a test of look.set reads exactly what page.look would.
 */
function dsReading(
  /** @type {string[]} */ props,
  /** @type {any} */ matched,
  /** @type {Record<string, string>} */ computed,
  /** @type {Record<string, unknown>} */ info = {}
) {
  const got = /** @type {any} */ (resolveStyles({ props, info: { computed, chain: [] }, matched }))
  const names = /** @type {Record<string, string>} */ ({
    gs: '<style id="global-styles-inline-css">',
    late: '/wp-content/themes/tracy-base/assets/css/tracy.css',
    // dskeepjo (Joomla, tracy-base/j6): the landing module's sheet and T4's bundle
    nl: '/media/tracy-landing/native-landing.css',
    t4: '/media/t4/optimize/css/abde6f7f55840727b14a988ef5b00a68.css'
  })
  const fix = (/** @type {any} */ o) => {
    if (o?.sheet) o.sheet = names[o.sheet] ?? 'a stylesheet'
  }
  for (const row of Object.values(got.props)) {
    fix(row)
    for (const t of /** @type {any} */ (row).tokens ?? []) fix(t)
    for (const pt of /** @type {any} */ (row).parts ?? []) fix(pt)
  }
  return {
    info: {
      el: '<a.wp-block-button__link.wp-element-button>',
      text: 'Start a conversation',
      matches: 1,
      how: 'exact',
      hidden: false,
      unique: DS_UNIQUE,
      body: DS_BODY,
      chrome: false,
      sheets: DS_SHEETS,
      ...info
    },
    props: got.props,
    loaded: true
  }
}

/** The selector of the rule look.set appended (after its `/* look.set: … *\/` note, past any @-rule). */
const appendedSelector = (/** @type {string} */ css) =>
  css
    .slice(css.lastIndexOf('/* look.set:'))
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.endsWith(' {') && !line.startsWith('@'))
    ?.slice(0, -2) ?? ''

test('🔒 WordPress wearing a design system: a padding change beats the slot’s (0,8,0) padding-* — the rule page.look names, not the agent’s losing shorthand (dskeepwp)', async () => {
  const site = fakeSite(wpFiles())
  const { measure } = readings(
    dsReading(['padding'], heroCascade(), { padding: '7px 21px' }),
    dsReading(['padding'], heroCascade(), { padding: '14px 25px' })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: {
        path: '/',
        target: { text: 'Start a conversation' },
        props: { padding: '14px 25px' },
        scope: 'element'
      },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const selector = appendedSelector(site.custom.css)
  assert.match(site.custom.css, /\n {2}padding: 14px 25px;\n/)
  // as specific as the agent's (0,7,0) lost; the slot's (0,8,0), later in the same sheet, is beaten
  assert.ok(
    compareSpec(specificity(selector), specificity(SLOT_BUTTON)) > 0,
    `${selector} is ${specificity(selector)}, the slot's rule ${specificity(SLOT_BUTTON)}`
  )
  assert.ok(selector.startsWith('body.page-id-94 '), selector)
})

test('a shorthand whose sides different rules win: the element rule beats the most specific, after the latest sheet; scope "site" refuses and names each', async () => {
  // the slot sets top/bottom in global styles (0,8,0); the theme's later sheet sets left/right (0,1,0)
  const matched = {
    matchedCSSRules: [
      cdpRule(
        '.wp-block-button__link',
        [
          ['padding-left', '30px'],
          ['padding-right', '30px']
        ],
        {},
        'late'
      ),
      .../** @type {any} */ (heroCascade(['padding-top', 'padding-bottom'])).matchedCSSRules.slice(2)
    ]
  }
  const site = fakeSite(wpFiles())
  const { measure } = readings(
    dsReading(['padding'], matched, { padding: '7px 30px' }),
    dsReading(['padding'], matched, { padding: '14px 25px' })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'Start a conversation', props: { padding: '14px 25px' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const selector = appendedSelector(site.custom.css)
  // more specific than the slot's rule: tracy.css is printed after Additional CSS on a block theme
  assert.ok(compareSpec(specificity(selector), specificity(SLOT_BUTTON)) > 0, selector)

  const shared = fakeSite(wpFiles())
  const again = readings(dsReading(['padding'], matched, { padding: '7px 30px' }))
  const refused = /** @type {any} */ (
    await lookSet({
      params: { target: 'Start a conversation', props: { padding: '14px 25px' }, scope: 'site' },
      platform: 'wordpress',
      siteRoot: shared.siteRoot,
      measure: again.measure,
      io: shared.io
    })
  )
  assert.equal(refused.code, 'LOOK_SET_NO_ROAD')
  assert.match(refused.error, /padding is set side by side by different rules/)
  assert.match(refused.error, /padding-top, padding-bottom: :root:root/)
  assert.match(refused.error, /padding-right, padding-left: \.wp-block-button__link/)
  assert.equal(shared.custom.writes, 0, 'nothing written')
  assert.equal(shared.undos().length, 0)
})

test('scope "site" on a shorthand its rule sets side by side from tokens: the rule takes the shorthand, no token is given a two-value padding', async () => {
  const matched = {
    matchedCSSRules: [
      cdpRule(
        '.tracy .wp-block-button__link',
        [
          ['padding-top', 'var(--wp--preset--spacing--20)'],
          ['padding-right', 'var(--wp--preset--spacing--30)'],
          ['padding-bottom', 'var(--wp--preset--spacing--20)'],
          ['padding-left', 'var(--wp--preset--spacing--30)']
        ],
        {},
        'late'
      )
    ],
    // the tokens, set on <html> by global styles
    inherited: [
      {
        matchedCSSRules: [
          cdpRule(':root', [
            ['--wp--preset--spacing--20', '8px'],
            ['--wp--preset--spacing--30', '16px']
          ])
        ]
      }
    ]
  }
  const site = fakeSite(wpFiles())
  const { measure } = readings(
    dsReading(['padding'], matched, { padding: '8px 16px' }),
    dsReading(['padding'], matched, { padding: '14px 25px' })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'Start a conversation', props: { padding: '14px 25px' }, scope: 'site' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.doesNotMatch(site.custom.css, /--wp--preset--spacing/, 'no token takes "14px 25px"')
  assert.match(site.custom.css, /\.tracy \.wp-block-button__link[^{]* \{\n {2}padding: 14px 25px;\n\}/)
  assert.match(out.reach, /every element the rule `\.tracy \.wp-block-button__link` paints, on every page/)
})

test('🔒 WordPress, a block theme: a token a design-system slot sets in global styles (after Additional CSS there) is set again MORE specific; so is one on :root that no theme.json makes a variable', async () => {
  const HI = ':root:root:root:root:root:root'
  const row = (/** @type {string} */ by) => ({
    value: '#1d4ed8',
    set: 'color: var(--tb-accent)',
    by: '.tracy .tracy-eyebrow',
    sheet: 'global-styles-inline-css',
    tokens: [{ name: '--tb-accent', value: '#336bd5', by, sheet: 'global-styles-inline-css', on: '<html>' }]
  })
  const run = async (/** @type {string} */ by) => {
    const site = fakeSite(wpFiles())
    const { measure } = readings(
      wpButton({ color: row(by) }),
      wpButton({ color: { ...row(by), value: 'rgb(0, 0, 0)', hex: '#000000' } })
    )
    const out = /** @type {any} */ (
      await lookSet({
        params: { target: 'See what we bake', props: { color: '#000000' }, scope: 'site' },
        platform: 'wordpress',
        siteRoot: site.siteRoot,
        measure,
        io: site.io
      })
    )
    assert.equal(out.ok, true, JSON.stringify(out))
    return appendedSelector(site.custom.css)
  }
  // WordPress 7.1.3 prints a block theme's Additional CSS inside global styles BEFORE theme.json's own
  // `styles.css`, where the slot writes `:root`×6 — the same selector there would lose by order
  assert.equal(await run(HI), `${HI}:not(.\\#)`)
  // `--tb-accent` is no theme.json variable: on `:root` in global styles it is CSS (theme.json's own
  // `styles.css`, printed after the Additional CSS), so `:root` alone would lose by order. A theme.json
  // variable keeps `:root` (the scope "site" test above).
  assert.equal(await run(':root'), ':root:not(.\\#)')
})

test('🔒 WordPress, a block theme: a preset theme.json’s own styles.css sets again on :root is beaten, not tied (wp-ja-fresco, LOOK_SET_NO_EFFECT 26/10/2026)', async () => {
  const THEME = 'wp-ja-fresco'
  const themeJson = JSON.stringify({
    version: 3,
    settings: { color: { palette: [{ slug: 'bg', color: '#0a0b0a' }] } },
    styles: { css: ':root{color-scheme:light dark;--wp--preset--color--bg:light-dark(var(--ds-c-bg, #0a0b0a),var(--ds-c-bg, #0a0b0a));}' }
  })
  const bgRow = (/** @type {string} */ hex) => ({
    value: hex === '#0a0b0a' ? 'rgb(10, 11, 10)' : 'rgb(42, 43, 38)',
    hex,
    set: 'background: var(--wp--preset--color--bg)',
    by: '.tracy-header',
    sheet: `/wp-content/themes/${THEME}/assets/css/tracy.css`,
    line: 163,
    tokens: [{ name: '--wp--preset--color--bg', value: '#0a0b0a', by: ':root', sheet: 'global-styles-inline-css', on: '<html>' }]
  })
  const info = {
    el: '<header.tracy-header>',
    text: '',
    unique: 'header.tracy-header',
    body: `home page page-id-7 wp-theme-${THEME} tracy`,
    sheets: ['global-styles-inline-css', `/wp-content/themes/${THEME}/assets/css/tracy.css`]
  }
  const site = fakeSite({
    'wp-config.php': '<?php\n',
    [`wp-content/themes/${THEME}/theme.json`]: themeJson,
    [`wp-content/themes/${THEME}/assets/css/tracy.css`]: '.tracy-header {\n  background: var(--wp--preset--color--bg);\n}\n'
  })
  const { measure } = readings(
    wpButton({ 'background-color': bgRow('#0a0b0a') }, info),
    wpButton({ 'background-color': bgRow('#2a2b26') }, info)
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: { selector: 'header' }, props: { 'background-color': '#2a2b26' }, scope: 'site' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(appendedSelector(site.custom.css), ':root:not(.\\#)', site.custom.css)
  assert.match(site.custom.css, /--wp--preset--color--bg: #2a2b26;/)
})

test('🔒 the receipt names the element it matched and its place: nth counts from 0, and nth:1 is the SECOND match (dskeepjo)', async () => {
  const site = fakeSite(wpFiles())
  const { measure } = readings(
    wpButton(
      { 'background-color': orangeRow },
      { el: '<a#mod-custom-233.btn.btn-primary>', text: 'Start a conversation', matches: 2 }
    ),
    wpButton({ 'background-color': { ...orangeRow, hex: '#1d4ed8' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: {
        target: { text: 'Start a conversation', nth: 1 },
        props: { 'background-color': '#1d4ed8' },
        scope: 'element'
      },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(
    out.element,
    '<a#mod-custom-233.btn.btn-primary> "Start a conversation" — match 2 of 2 (nth:1; nth:0 is the first)'
  )
  assert.equal(
    matchedElement({ el: '<a.btn>', text: 'Contact', matches: 1, how: 'exact' }, { nth: 0 }),
    '<a.btn> "Contact" — the only match'
  )
  assert.equal(
    matchedElement({ el: '<span.lbl>', text: 'Contact us', matches: 0, how: 'partial' }, { nth: 0 }),
    '<span.lbl> "Contact us" — the closest partial match of the words'
  )
  // a refusal that read the element names it too
  const one = readings(wpButton({ 'background-color': orangeRow }, { body: 'no-page-class' }))
  const refused = /** @type {any} */ (
    await lookSet({
      params: { target: 'See what we bake', props: { 'background-color': '#1d4ed8' }, scope: 'page' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure: one.measure,
      io: site.io
    })
  )
  assert.equal(refused.code, 'LOOK_SET_NO_ROAD')
  assert.match(
    refused.element,
    /^<a\.wp-block-button__link\.wp-element-button> "See what we bake" — the only match$/
  )
  // and the call's shape says it where the agent reads it
  assert.match(LOOK_SET_CALL, /nth\?:0 = the first/)
})

test('🔒 WordPress: a site with no Additional CSS post gets none back — the undo deletes the post the look write created (uiweekwp)', async () => {
  const site = fakeSite(wpFiles(), {}, '', false)
  const { measure } = readings(
    wpButton({ 'background-color': orangeRow }),
    wpButton({ 'background-color': { ...orangeRow, hex: '#1d4ed8' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'See what we bake', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(site.custom.exists, true, 'the write created the post')
  const manifest = JSON.parse(
    readFileSync(path.join(site.siteRoot, LOOK_UNDO_DIR, out.undo, 'manifest.json'), 'utf8')
  )
  assert.equal(manifest.customCss.existed, false)
  const back = /** @type {any} */ (await revertLook({ siteRoot: site.siteRoot, undo: out.undo, io: site.io }))
  assert.equal(back.ok, true, JSON.stringify(back))
  assert.deepEqual(back.restored, ['Additional CSS'])
  assert.equal(site.custom.exists, false, 'no empty custom_css post left behind')
  assert.equal(site.custom.removes, 1)
  // a write that changed nothing is put back the same way
  const idle = fakeSite(wpFiles(), {}, '', false)
  const still = readings(
    wpButton({ 'background-color': orangeRow }),
    wpButton({ 'background-color': orangeRow })
  )
  const none = /** @type {any} */ (
    await lookSet({
      params: { target: 'See what we bake', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: idle.siteRoot,
      measure: still.measure,
      io: idle.io
    })
  )
  assert.equal(none.code, 'LOOK_SET_NO_EFFECT')
  assert.equal(idle.custom.exists, false)
})

// ── a nested winner, and an !important in a cascade layer ──────────────────────────────────────

/** dskeepjo's home page (10/10/2026): its sheets in order, as describeTarget names them. */
const JO_SHEETS = [
  '/plugins/system/t4/themes/base/vendors/font-awesome5/css/all.min.css',
  '/plugins/system/t4/themes/base/vendors/font-awesome/css/font-awesome.min.css',
  '/media/tracy-landing/native-landing.css',
  '/media/t4/optimize/css/abde6f7f55840727b14a988ef5b00a68.css',
  '/templates/tracy/css/styles/base.css',
  '/templates/tracy/css/site-repairs.css'
]
const JO_INFO = {
  el: '<h1>',
  text: 'Giải pháp trọn gói cho doanh nghiệp nhỏ',
  unique: 'h1',
  body: 'site-base navigation-default theme-base layout-od-landing nav-breakpoint-lg navigation-hide com_content view-article item-247 loaded-bs5',
  sheets: JO_SHEETS
}
/** The home h1's colour as CDP read it there: T4's `h1` rules, and the landing's nested one. */
const joH1 = () => ({
  matchedCSSRules: [
    cdpRule('h1', [['color', 'var(--t4-heading-color)']], {}, 't4', { spec: [0, 0, 1] }),
    cdpRule('h1', [['color', 'var(--brand-color-text)']], {}, 'nl', {
      nesting: ['.tracy-native-landing.tracy-native-landing'],
      spec: [0, 2, 1]
    })
  ]
})

test('🔒 Joomla, a winner nested in another rule: look.set beats its real (0,2,1), not the bare `h1` CDP names it by (dskeepjo)', async () => {
  const site = fakeSite({
    'administrator/index.php': '<?php\n',
    'templates/tracy/css/styles/base.css': ':root {\n  --t4-heading-color: var(--fg);\n}\n',
    'templates/tracy/css/site-repairs.css': '.x { margin: 0; }\n'
  })
  const { measure } = readings(
    dsReading(['color'], joH1(), { color: 'rgb(23, 23, 23)' }, JO_INFO),
    dsReading(['color'], joH1(), { color: 'rgb(22, 101, 52)' }, JO_INFO)
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: {
        target: 'Giải pháp trọn gói cho doanh nghiệp nhỏ',
        props: { color: '#166534' },
        scope: 'element'
      },
      platform: 'joomla',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  // T4: into the template's local/css/custom.css, made as specific as the real winner or more
  const css = site.read('templates/tracy/local/css/custom.css')
  const selector = appendedSelector(css)
  // it wrote `body.item-247 h1` (0,1,2): as specific as the `h1` it was told of, and it lost
  assert.ok(selector.startsWith('body.item-247 h1'), selector)
  assert.ok(compareSpec(specificity(selector), [0, 2, 1]) >= 0, `${selector} is ${specificity(selector)}`)
  assert.match(css, /\n {2}color: #166534;\n/)
})

test('🔒 an !important in a cascade layer is beaten from inside that layer: the rule goes into the same @layer, more specific', async () => {
  // a WordPress theme sheet with Tailwind utilities: `!px-[34px]` is `padding-inline: 34px !important`
  // in `@layer utilities`; an unlayered !important loses to it whatever its specificity
  const utility = {
    matchedCSSRules: [
      cdpRule('.wp-block-button__link', [['padding-left', '21px']], {}, 'late', { spec: [0, 1, 0] }),
      cdpRule('.\\!px-\\[34px\\]', [['padding-inline', '34px!important']], {}, 'late', {
        layers: ['utilities'],
        spec: [0, 1, 0]
      })
    ]
  }
  const site = fakeSite(wpFiles())
  const { measure } = readings(
    dsReading(['padding-left'], utility, { 'padding-left': '34px' }),
    dsReading(['padding-left'], utility, { 'padding-left': '40px' })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'Start a conversation', props: { 'padding-left': '40px' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.match(
    site.custom.css,
    /^\/\* look\.set: [^*]+\*\/\n@layer utilities \{\n {2}body\.page-id-94 [^{]+ \{\n {4}padding-left: 40px !important;\n {2}\}\n\}\n$/
  )
  // two layers each holding an !important side: no one rule can join both
  const split = {
    matchedCSSRules: [
      cdpRule('.py', [['padding-block', '7px!important']], {}, 'late', { layers: ['a'] }),
      cdpRule('.px', [['padding-inline', '9px!important']], {}, 'late', { layers: ['b'] })
    ]
  }
  const other = fakeSite(wpFiles())
  const one = readings(dsReading(['padding'], split, { padding: '7px 9px' }))
  const refused = /** @type {any} */ (
    await lookSet({
      params: { target: 'Start a conversation', props: { padding: '14px 25px' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: other.siteRoot,
      measure: one.measure,
      io: other.io
    })
  )
  assert.equal(refused.code, 'LOOK_SET_NO_ROAD')
  assert.match(refused.error, /padding is set !important from more than one cascade layer \(a, b\)/)
  assert.equal(other.custom.writes, 0)
})

const J_SHEETS = [
  '/plugins/system/t4/themes/base/vendors/font-awesome/css/font-awesome.min.css',
  '/media/t4/optimize/css/922f8a66bb95f7c0754372275b5d854f.css',
  '/templates/tracy_business/css/styles/tracy-business.css',
  '/templates/tracy_business/css/tracy-business-fonts.css',
  '/templates/tracy_business/css/site-repairs.css'
]
const J_STYLES = [
  ':root {',
  '  --tb-ink:     #14171A;',
  '  --tb-forest:  #14483A;',
  '  --tb-signal:  #DA5A2A;',
  '}',
  'html[data-theme="dark"] {',
  '  --tb-forest:  #7FBFA6;',
  '}',
  ':root {',
  '  --tb-band-forest-bg:   #14483A;',
  '  --tb-band-signal-bg:   #DA5A2A;',
  '}',
  ''
].join('\n')
const jFiles = () => ({
  'administrator/index.php': '<?php\n',
  'templates/tracy_business/css/styles/tracy-business.css': J_STYLES,
  'templates/tracy_business/css/tracy-business-fonts.css': '@font-face { font-family: Archivo; }\n',
  'templates/tracy_business/css/site-repairs.css': '.tracy-theme-toggle { min-width: 44px; }\n'
})
const jButton = (/** @type {Record<string, unknown>} */ props) => ({
  info: {
    el: '<a.tb-btn.tb-btn--signal>',
    text: 'See our menu',
    matches: 1,
    how: 'exact',
    hidden: false,
    unique: 'div.tb-hero__actions a.tb-btn.tb-btn--signal',
    body: 'site-tracy-business theme-tracy-business layout-tracy-business-home com_content view-featured item-599 loaded-bs5',
    chrome: false,
    sheets: J_SHEETS
  },
  props,
  loaded: true
})
const signalRow = {
  value: 'rgb(218, 90, 42)',
  hex: '#da5a2a',
  set: 'background: var(--tb-band-signal-bg)',
  by: '.tb-btn--signal',
  sheet: '/media/t4/optimize/css/922f8a66bb95f7c0754372275b5d854f.css',
  tokens: [
    {
      name: '--tb-band-signal-bg',
      value: '#DA5A2A',
      by: ':root',
      sheet: '/templates/tracy_business/css/styles/tracy-business.css',
      line: 9
    }
  ]
}

test('Joomla, scope page: the winning rule of T4’s bundle, set again for this page in the template’s local/css/custom.css — no compile, the template’s own sheets untouched', async () => {
  const site = fakeSite(jFiles())
  const { measure } = readings(
    jButton({ 'background-color': signalRow }),
    jButton({ 'background-color': { ...signalRow, hex: '#1d4ed8' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: {
        path: '/en/',
        target: 'See our menu',
        props: { 'background-color': '#1d4ed8' },
        scope: 'page'
      },
      platform: 'joomla',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.match(out.reach, /every element `\.tb-btn--signal` paints, on this page only \(body\.item-599\)/)
  assert.match(out.next, /other language is another page/)
  assert.equal(site.read('templates/tracy_business/css/styles/tracy-business.css'), J_STYLES)
  assert.match(
    site.read('templates/tracy_business/local/css/custom.css'),
    /(?:^|\n)body\.item-599 \.tb-btn--signal \{\n {2}background-color: #1d4ed8;\n\}\n$/
  )
  assert.equal(
    site.read('templates/tracy_business/css/site-repairs.css'),
    jFiles()['templates/tracy_business/css/site-repairs.css']
  )
  assert.equal(site.custom.reads + site.custom.writes, 0, 'Joomla keeps its file road: no Additional CSS')
})

test('Joomla T4: a winner in a plugin’s sheet after every template sheet — the rule in local/css/custom.css is made more specific than it', async () => {
  const site = fakeSite(jFiles())
  const late = {
    ...signalRow,
    by: '.late .tb-btn.tb-btn--signal.x',
    sheet: '/media/plg_late/late.css',
    tokens: []
  }
  const sheets = [...J_SHEETS, '/media/plg_late/late.css']
  const one = readings(
    { ...jButton({ 'background-color': late }), info: { ...jButton({}).info, sheets } },
    { ...jButton({ 'background-color': { ...late, hex: '#1d4ed8' } }), info: { ...jButton({}).info, sheets } }
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { path: '/en/', target: 'x', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
      platform: 'joomla',
      siteRoot: site.siteRoot,
      measure: one.measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const selector = appendedSelector(site.read('templates/tracy_business/local/css/custom.css'))
  assert.ok(compareSpec(specificity(selector), specificity('.late .tb-btn.tb-btn--signal.x')) > 0, selector)
  assert.equal(site.custom.reads + site.custom.writes, 0)
})

test('Joomla, scope site: the token changed where the template sets it, dark mode left as it is and said, its twin named', async () => {
  const site = fakeSite(jFiles())
  const { measure } = readings(
    jButton({ 'background-color': signalRow }),
    jButton({ 'background-color': { ...signalRow, hex: '#1d4ed8' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: {
        path: '/en/',
        target: 'See our menu',
        props: { 'background-color': '#1d4ed8' },
        scope: 'site'
      },
      platform: 'joomla',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(
    site.read('templates/tracy_business/css/styles/tracy-business.css'),
    J_STYLES.replace('--tb-band-signal-bg:   #DA5A2A;', '--tb-band-signal-bg:   #1d4ed8;')
  )
  assert.match(out.wrote[0].change, /--tb-band-signal-bg: #DA5A2A → #1d4ed8 \(:root\)/)
  // `--tb-signal` holds the same value in another :root rule of the same file
  assert.match(out.sameValue, /^--tb-signal holds the old value too:/)
  // a token set by several rules: the forest one, its dark twin said unchanged
  const forest = readings(
    jButton({
      '--tb-forest': {
        value: '#14483A',
        set: '--tb-forest: #14483A',
        by: ':root',
        sheet: J_SHEETS[2],
        line: 1
      }
    }),
    jButton({ '--tb-forest': { value: '#1E3A5F' } })
  )
  const twin = /** @type {any} */ (
    await lookSet({
      params: {
        path: '/en/',
        target: { selector: 'body' },
        props: { '--tb-forest': '#1E3A5F' },
        scope: 'site'
      },
      platform: 'joomla',
      siteRoot: site.siteRoot,
      measure: forest.measure,
      io: site.io
    })
  )
  assert.equal(twin.ok, true, JSON.stringify(twin))
  assert.match(
    site.read('templates/tracy_business/css/styles/tracy-business.css'),
    /--tb-forest: {2}#1E3A5F;\n {2}--tb-signal: {2}#DA5A2A;\n\}\nhtml\[data-theme="dark"\] \{\n {2}--tb-forest: {2}#7FBFA6;/
  )
  assert.match(twin.alsoSet[0], /--tb-forest is also set by html\[data-theme=dark\] \(unchanged\)/)
})

test('Joomla, scope page with a token: the old colour kept on one page, on its own root, so tokens built from it follow', async () => {
  const site = fakeSite(jFiles())
  const { measure } = readings(
    {
      ...jButton({
        '--tb-forest': {
          value: '#1E3A5F',
          set: '--tb-forest: #1E3A5F',
          by: ':root',
          sheet: J_SHEETS[2],
          line: 1
        }
      }),
      info: { ...jButton({}).info, body: 'com_contact view-contact item-610', unique: 'body' }
    },
    jButton({ '--tb-forest': { value: '#14483A' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: {
        path: '/en/contact',
        target: { selector: 'body' },
        props: { '--tb-forest': '#14483A' },
        scope: 'page'
      },
      platform: 'joomla',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.match(
    site.read('templates/tracy_business/local/css/custom.css'),
    /(?:^|\n):root:has\(> body\.item-610\) \{\n {2}--tb-forest: #14483A;\n\}\n$/
  )
})

test('Joomla, a token set in T4’s bundle: set again by its own rule in local/css/custom.css, more specific than the bundle’s, every page', async () => {
  const site = fakeSite(jFiles())
  const primary = {
    value: 'rgb(20, 72, 58)',
    hex: '#14483a',
    set: 'color: var(--color-primary)',
    by: 'a',
    sheet: J_SHEETS[1],
    tokens: [{ name: '--color-primary', value: '#14483A', by: ':root', sheet: J_SHEETS[1] }]
  }
  const { measure } = readings(
    jButton({ color: primary }),
    jButton({ color: { ...primary, hex: '#1e3a5f' } })
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { path: '/en/', target: 'Read more', props: { color: '#1E3A5F' }, scope: 'site' },
      platform: 'joomla',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(site.read('templates/tracy_business/css/styles/tracy-business.css'), J_STYLES)
  assert.match(
    site.read('templates/tracy_business/local/css/custom.css'),
    /^\/\* look\.set: --color-primary, every page \*\/\n:root:not\(\.\\#\) \{\n {2}--color-primary: #1E3A5F;\n\}\n$/
  )
})

test('EmDash, scope site: the token in the source’s tokens.css (@theme), in the site’s container; read after the one rebuild', async () => {
  const tokens =
    '@theme {\n\t--color-paper: #f5f3ee;\n\t--color-signal: #da5a2a;\n\t--color-link: var(--color-forest);\n}\nhtml[data-theme="dark"] {\n\t--color-signal: #f0865a;\n}\n'
  const site = fakeSite(
    {},
    { '/app/src/styles/tokens.css': tokens, '/app/src/styles/global.css': '@import "tailwindcss";\n' }
  )
  const { measure, asked } = readings({
    info: {
      el: '<a.btn-primary>',
      text: 'See our work',
      unique: 'a.btn-primary',
      body: '',
      chrome: false,
      sheets: ['/_astro/NotFound.CraRx2Su.css']
    },
    props: {
      'background-color': {
        value: 'rgb(218, 90, 42)',
        hex: '#da5a2a',
        set: 'background-color: var(--color-signal)',
        by: '.btn-primary @layer components',
        sheet: '/_astro/NotFound.CraRx2Su.css',
        tokens: [
          {
            name: '--color-signal',
            value: '#da5a2a',
            by: ':root, :host @layer theme',
            sheet: '/_astro/NotFound.CraRx2Su.css'
          }
        ]
      }
    }
  })
  const out = /** @type {any} */ (
    await lookSet({
      params: { target: 'See our work', props: { 'background-color': '#1d4ed8' }, scope: 'site' },
      platform: 'emdash',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(site.custom.reads + site.custom.writes, 0, 'EmDash keeps its source road: no Additional CSS')
  assert.equal(
    site.app.get('/app/src/styles/tokens.css'),
    tokens.replace('--color-signal: #da5a2a;', '--color-signal: #1d4ed8;')
  )
  assert.deepEqual(out.values['background-color'], { before: '#da5a2a', after: 'after the rebuild' })
  assert.match(out.next, /ONE tracy_site_build_emdash request site\.rebuild/)
  assert.match(out.alsoSet[0], /html\[data-theme=dark\]/)
  assert.equal(asked.length, 1, 'no second read before the rebuild')
  assert.equal(site.undos().length, 1)
})

// 10/10/2026, the stand's EmDash site wearing Moxie through Tracy's design-system slot: `--color-signal`
// is won by `<style id="tracy-ds-slot">`, and the refusal said only "not a file look.set can change" — the
// agent then pinned the system's values by hand. A token the slot sets is the system's: the answer says
// so and what to do, and nothing is written (on Joomla a rule after the slot would override the system).
for (const platform of /** @type {const} */ (['emdash', 'joomla']))
  test(`scope site, a token the design-system slot sets: refused as the system's own, with the road for one element, nothing written: ${platform}`, async () => {
    const tokens = '@theme {\n\t--color-signal: #da5a2a;\n}\n'
    const site = fakeSite(platform === 'joomla' ? jFiles() : {}, { '/app/src/styles/tokens.css': tokens })
    const slotRow = {
      value: 'rgb(132, 172, 251)',
      hex: '#84acfb',
      set: 'background-color: var(--color-signal)',
      by: '.btn-primary @layer components',
      sheet: platform === 'joomla' ? J_SHEETS[1] : '/_astro/NotFound.CraRx2Su.css',
      tokens: [
        {
          name: '--color-signal',
          value: 'var(--ds-c-accent)',
          by: ':root, html[data-theme="dark"]',
          sheet: '<style id="tracy-ds-slot">'
        }
      ]
    }
    const { measure, asked } = readings({
      info: {
        el: '<a.btn-primary>',
        text: 'See our capabilities',
        unique: 'a.btn-primary',
        body: platform === 'joomla' ? 'site com_content item-101' : '',
        chrome: false,
        sheets:
          platform === 'joomla'
            ? [...J_SHEETS, '<style id="tracy-ds-slot">']
            : ['/_astro/NotFound.CraRx2Su.css', '<style id="tracy-ds-slot">']
      },
      props: { 'background-color': slotRow }
    })
    const out = /** @type {any} */ (
      await lookSet({
        params: { target: 'See our capabilities', props: { 'background-color': '#1d4ed8' }, scope: 'site' },
        platform,
        siteRoot: site.siteRoot,
        measure,
        io: site.io
      })
    )
    assert.equal(out.ok, false)
    assert.equal(out.code, 'LOOK_SET_NO_ROAD')
    assert.match(
      out.error,
      /--color-signal is set by the design system this site wears \(Tracy's design-system slot, <style id="tracy-ds-slot">\), which owns it on every page/
    )
    // beta week 20/10/2026: "make the signal colour red" was refused with "choose another design system"
    assert.match(
      out.next,
      /^Never answer the customer that it cannot be changed: make the change on the elements or pages they mean/
    )
    assert.match(
      out.next,
      /offer the choice: you set it on the parts they name, or they pick another design system/
    )
    assert.doesNotMatch(out.next, /Tell the customer this value is their design system's own/)
    if (platform === 'emdash')
      assert.match(
        out.next,
        /relative to the slot's variable \(`var\(--color-signal\)`, or a `calc\(\)` of it for a size\), never its value typed back/
      )
    else {
      // relative to the slot's variable, never the system's value typed back (20/10/2026)
      assert.match(
        out.next,
        /scope "element" or "page": a change of degree .* relative to the slot's variable \(`calc\(var\(--[a-z0-9-]+\) \+ 4px\)`/
      )
      assert.match(
        out.next,
        /never its value typed back; only a value the customer named exactly is written as they named it/
      )
    }
    assert.ok(out.measured, 'what was measured comes with the refusal')
    assert.equal(site.app.get('/app/src/styles/tokens.css'), tokens, 'tokens.css untouched')
    if (platform === 'joomla')
      for (const [rel, text] of Object.entries(jFiles()))
        assert.equal(site.read(rel), text, `${rel} untouched`)
    assert.equal(site.undos().length, 0, 'no undo: nothing was written')
    assert.equal(asked.length, 1)
  })

// ── the BUILT tool: what the image ships (RULE #3) ───────────────────────────────────────────────

test('🔒 the built tracy_site: look.set reads with set:true in the site’s browser, writes Additional CSS through wp-cli in the site’s container, and is refused in a mode with no shell', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-look-set-built-'))
  const label = 'lookwp1'
  const webroot = path.join(root, label, '.webroot')
  for (const [rel, text] of Object.entries(wpFiles())) {
    mkdirSync(path.dirname(path.join(webroot, rel)), { recursive: true })
    writeFileSync(path.join(webroot, rel), text)
  }
  mkdirSync(path.join(root, label, '.tracy'), { recursive: true })
  writeFileSync(path.join(root, label, '.tracy', 'site.json'), JSON.stringify({ platform: 'wordpress' }))
  process.env.TRACY_SITES_ROOT = root
  try {
    /** @type {any[]} */
    const styleReqs = []
    /** @type {string[][]} */
    const wpCalls = []
    let additional = ''
    const wpAnswer = (/** @type {object} */ a) => ({
      code: 0,
      stdout: `Deprecated: something PHP said\nTRACY_WP_CSS ${Buffer.from(JSON.stringify(a)).toString('base64')}\n`,
      stderr: '',
      timedOut: false
    })
    const exec = async (/** @type {{ argv: string[], stdin?: string }} */ { argv, stdin }) => {
      if (argv[5] === 'wp') {
        // the PHP's contract (`WP_CUSTOM_CSS_PHP`): read, or write while the CSS still hashes to `expect`
        wpCalls.push(argv)
        const q = JSON.parse(String(stdin))
        if (q.mode === 'read') return wpAnswer({ ok: true, stylesheet: 'wp-tracy-business', css: additional })
        if (q.expect !== cssHash(additional)) return wpAnswer({ ok: false, conflict: true })
        additional = q.css
        return wpAnswer({ ok: true, stylesheet: q.stylesheet, css: additional })
      }
      if (argv[4] === 'curl') {
        const nonce = /\n(TRACY_FETCH_[0-9a-f]{32}) /.exec(argv[argv.indexOf('--write-out') + 1])?.[1]
        const body =
          '<html lang="en"><head><title>Home</title></head><body><main><h1>Hi</h1></main></body></html>'
        return {
          code: 0,
          stdout: `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n${body}\n${nonce} 200 ${Buffer.byteLength(body)}\n`,
          stderr: '',
          timedOut: false
        }
      }
      const k = argv.lastIndexOf('-e')
      if (argv[k + 2] !== 'style') return { code: 1, stdout: '', stderr: 'unexpected', timedOut: false }
      const req = JSON.parse(argv[k + 5])
      styleReqs.push(req)
      const hex = styleReqs.length === 1 ? '#da5a2a' : '#1d4ed8'
      const payload = wpButton({ 'background-color': { ...orangeRow, hex } })
      return {
        code: 0,
        stdout: `TRACY_BROWSER OK ${argv[k + 3]}\n${JSON.stringify(payload)}`,
        stderr: '',
        timedOut: false
      }
    }
    const tools = new Map()
    /** @type {readonly string[] | null} */
    let sent = null
    /** @type {any[]} */
    const posted = []
    const typed = [
      {
        type: 'user/message',
        data: {
          source: { kind: 'user', prompter: { user: 'An', email: 'an@example.test' } },
          content: 'Bluer'
        }
      }
    ]
    apply(
      /** @type {any} */ ({
        webServer: { register: () => () => {} },
        tools: {
          register: (/** @type {any} */ t) => (tools.set(t.name, t), () => {}),
          schemas: () => (sent === null ? [] : sent.map((name) => ({ name })))
        },
        effect: (/** @type {() => void} */ setup) => setup(),
        on: () => {},
        get: (/** @type {string} */ name) =>
          name === 'sessions'
            ? { get: () => ({ snapshotEvents: () => typed }) }
            : name === 'tracyAssertion'
              ? { mint: (/** @type {string} */ email) => `signed:${email}` }
              : undefined
      }),
      /** @type {any} */ ({
        exec,
        origin: 'http://door.test',
        fetch: async (/** @type {string} */ url, /** @type {any} */ init = {}) => {
          if (init.method !== 'POST' || !String(url).endsWith('/changed'))
            return new Response('{}', { status: 404 })
          posted.push(JSON.parse(String(init.body)))
          return new Response('{}', { status: 200 })
        }
      })
    )
    const run = (/** @type {any} */ args, /** @type {object} */ agent) =>
      tools
        .get('tracy_site')
        .execute(args, { agent: { ...agent, session: { id: 's', header: { cwd: path.join(root, label) } } } })
    const call = {
      action: 'look.set',
      params: {
        path: '/',
        target: { text: 'See what we bake' },
        props: { 'background-color': '#1d4ed8' },
        scope: 'element'
      }
    }
    sent = ['tracy_site', 'read']
    const writer = await run(call, {})
    assert.equal(writer.code, 'LOOK_SET_NOT_IN_MODE')
    assert.equal(styleReqs.length, 0, 'refused before the page is read')
    sent = ['tracy_site', 'bash', 'read', 'edit']
    const out = await run(call, {})
    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
    assert.equal(styleReqs[0].set, true)
    assert.equal(styleReqs[1].selector, wpButton({}).info.unique)
    assert.match(
      additional,
      /body\.page-id-42 div\.wp-block-group\.wtb-hero [^{]+\{\n {2}background-color: #1d4ed8;/
    )
    for (const [rel, text] of Object.entries(wpFiles()))
      assert.equal(readFileSync(path.join(webroot, rel), 'utf8'), text, `${rel} untouched`)
    assert.equal(wpCalls.length, 2, 'one read, one write')
    assert.deepEqual(wpCalls[0].slice(0, 12), [
      'exec',
      '-i',
      '-u',
      'www-data',
      `${label}-web-1`,
      'wp',
      '--path=/var/www/html',
      '--skip-plugins',
      '--skip-themes',
      '--no-color',
      'eval',
      wpCalls[0][11]
    ])
    assert.match(wpCalls[0][11], /wp_update_custom_css_post\(\$q\["css"\],\["stylesheet"=>\$s\]\)/)
    assert.ok(readdirSync(path.join(root, label, LOOK_UNDO_DIR)).length === 1)
    // Turn undo: reported as Additional CSS with its undo id, never as a Git file (`file-look`).
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.deepEqual(posted, [
      { tool: 'look.set', via: 'look-css', target: { kind: 'additional-css', id: out.undo } }
    ])
  } finally {
    delete process.env.TRACY_SITES_ROOT
  }
})

test('🔒 the built tracy_site, a site wearing no design system: look.set writes a literal through the one role it sits on itself — no hand edit after it (turn latency, 26/10/2026)', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-look-set-roles-'))
  const label = 'lookwp2'
  const webroot = path.join(root, label, '.webroot')
  for (const [rel, text] of Object.entries(wpFiles())) {
    mkdirSync(path.dirname(path.join(webroot, rel)), { recursive: true })
    writeFileSync(path.join(webroot, rel), text)
  }
  mkdirSync(path.join(root, label, '.tracy'), { recursive: true })
  writeFileSync(path.join(root, label, '.tracy', 'site.json'), JSON.stringify({ platform: 'wordpress' }))
  process.env.TRACY_SITES_ROOT = root
  try {
    /** @type {any[]} */
    const styleReqs = []
    /** @type {string[][]} */
    const wpCalls = []
    let additional = ''
    const wpAnswer = (/** @type {object} */ a) => ({
      code: 0,
      stdout: `Deprecated: something PHP said\nTRACY_WP_CSS ${Buffer.from(JSON.stringify(a)).toString('base64')}\n`,
      stderr: '',
      timedOut: false
    })
    let slotReads = 0
    const exec = async (/** @type {{ argv: string[], stdin?: string }} */ { argv, stdin }) => {
      // the design-system slot read (`slotReadArgv`): no system worn, the template reads --ds-c-accent
      if (argv[4] === 'wp' && argv.includes('eval')) {
        slotReads += 1
        const read = {
          ok: true,
          css: null,
          roles: '.wp-block-button__link { background: var(--ds-c-accent, #1e40af); }'
        }
        return {
          code: 0,
          stdout: `TRACY_DS_SLOT ${Buffer.from(JSON.stringify(read)).toString('base64')}\n`,
          stderr: '',
          timedOut: false
        }
      }
      if (argv[5] === 'wp') {
        // the PHP's contract (`WP_CUSTOM_CSS_PHP`): read, or write while the CSS still hashes to `expect`
        wpCalls.push(argv)
        const q = JSON.parse(String(stdin))
        if (q.mode === 'read') return wpAnswer({ ok: true, stylesheet: 'wp-tracy-business', css: additional })
        if (q.expect !== cssHash(additional)) return wpAnswer({ ok: false, conflict: true })
        additional = q.css
        return wpAnswer({ ok: true, stylesheet: q.stylesheet, css: additional })
      }
      if (argv[4] === 'curl') {
        const nonce = /\n(TRACY_FETCH_[0-9a-f]{32}) /.exec(argv[argv.indexOf('--write-out') + 1])?.[1]
        const body =
          '<html lang="en"><head><title>Home</title></head><body><main><h1>Hi</h1></main></body></html>'
        return {
          code: 0,
          stdout: `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n${body}\n${nonce} 200 ${Buffer.byteLength(body)}\n`,
          stderr: '',
          timedOut: false
        }
      }
      const k = argv.lastIndexOf('-e')
      if (argv[k + 2] !== 'style') return { code: 1, stdout: '', stderr: 'unexpected', timedOut: false }
      const req = JSON.parse(argv[k + 5])
      styleReqs.push(req)
      const hex = styleReqs.length === 1 ? '#da5a2a' : '#1d4ed8'
      const payload = wpButton({ 'background-color': { ...orangeRow, hex } })
      return {
        code: 0,
        stdout: `TRACY_BROWSER OK ${argv[k + 3]}\n${JSON.stringify(payload)}`,
        stderr: '',
        timedOut: false
      }
    }
    const tools = new Map()
    /** @type {readonly string[] | null} */
    let sent = null
    /** @type {any[]} */
    const posted = []
    const typed = [
      {
        type: 'user/message',
        data: {
          source: { kind: 'user', prompter: { user: 'An', email: 'an@example.test' } },
          content: 'Bluer'
        }
      }
    ]
    apply(
      /** @type {any} */ ({
        webServer: { register: () => () => {} },
        tools: {
          register: (/** @type {any} */ t) => (tools.set(t.name, t), () => {}),
          schemas: () => (sent === null ? [] : sent.map((name) => ({ name })))
        },
        effect: (/** @type {() => void} */ setup) => setup(),
        on: () => {},
        get: (/** @type {string} */ name) =>
          name === 'sessions'
            ? { get: () => ({ snapshotEvents: () => typed }) }
            : name === 'tracyAssertion'
              ? { mint: (/** @type {string} */ email) => `signed:${email}` }
              : undefined
      }),
      /** @type {any} */ ({
        exec,
        origin: 'http://door.test',
        fetch: async (/** @type {string} */ url, /** @type {any} */ init = {}) => {
          if (init.method !== 'POST' || !String(url).endsWith('/changed'))
            return new Response('{}', { status: 404 })
          posted.push(JSON.parse(String(init.body)))
          return new Response('{}', { status: 200 })
        }
      })
    )
    const run = (/** @type {any} */ args, /** @type {object} */ agent) =>
      tools
        .get('tracy_site')
        .execute(args, { agent: { ...agent, session: { id: 's', header: { cwd: path.join(root, label) } } } })
    const call = {
      action: 'look.set',
      params: {
        path: '/',
        target: { text: 'See what we bake' },
        props: { 'background-color': '#1d4ed8' },
        scope: 'element'
      }
    }
    sent = ['tracy_site', 'bash', 'read', 'edit']
    const out = await run(call, {})
    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
    assert.ok(slotReads >= 1, 'whether a system is worn was read')
    assert.match(additional, /\{\n {2}background-color: var\(--ds-c-accent, #1d4ed8\);\n\}/)
    assert.deepEqual(out.throughRoles, ['background-color: var(--ds-c-accent, #1d4ed8)'])
    assert.match(out.next, /Written through the design-system role .*nothing more to do for it/)
    assert.doesNotMatch(out.next, /typed a value as a literal/, 'no hand edit asked for after the write')
    assert.equal(out.rolePins, undefined)
  } finally {
    delete process.env.TRACY_SITES_ROOT
  }
})

// 20/10/2026, staff on real customer sites: "when Tracy fixes one place it often breaks another place". The
// reach of an "element" or "page" write is said BEFORE anything is written (`wide`), not only in the answer.
test('the reach is asked before the write: a header element reaches every page, nothing written until the yes', async () => {
  const site = fakeSite(wpFiles())
  const header = () =>
    readings(
      wpButton({ 'background-color': orangeRow }, { chrome: true, unique: 'header a.wp-block-button__link' }),
      wpButton({ 'background-color': { ...orangeRow, hex: '#000000' } })
    )
  /** @type {any[]} */
  const seen = []
  const params = { target: 'Order', props: { 'background-color': '#000' }, scope: 'element' }
  const stopped = /** @type {any} */ (
    await lookSet({
      params,
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure: header().measure,
      io: site.io,
      wide: (reach) => {
        seen.push(reach)
        return { ok: false, code: 'CONFIRM_FIRST' }
      }
    })
  )
  assert.equal(stopped.code, 'CONFIRM_FIRST')
  assert.match(stopped.reach, /on every page/)
  assert.deepEqual(
    seen.map((r) => [r.scope, r.everyPage]),
    [['element', true]]
  )
  assert.equal(site.custom.writes, 0, 'nothing written before the answer')
  assert.equal(site.undos().length, 0)
  // the yes: `wide` answers null, and the same call writes
  const agreed = /** @type {any} */ (
    await lookSet({
      params,
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure: header().measure,
      io: site.io,
      wide: () => null
    })
  )
  assert.equal(agreed.ok, true, JSON.stringify(agreed))
  assert.equal(site.custom.writes, 1)
})

test('the reach is asked before the write: at page scope the count of elements the rule paints goes with it; one element on this page goes on', async () => {
  const site = fakeSite(wpFiles())
  /** @type {any[]} */
  const seen = []
  const wide = (/** @type {any} */ reach) => {
    seen.push(reach)
    return reach.paints > 1 ? { ok: false, code: 'CONFIRM_FIRST' } : null
  }
  const many = readings(wpButton({ 'background-color': { ...orangeRow, paints: 4 } }))
  const stopped = /** @type {any} */ (
    await lookSet({
      params: { target: 'See what we bake', props: { 'background-color': '#1d4ed8' }, scope: 'page' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure: many.measure,
      io: site.io,
      wide
    })
  )
  assert.equal(stopped.code, 'CONFIRM_FIRST')
  assert.deepEqual([seen[0].scope, seen[0].everyPage, seen[0].paints], ['page', false, 4])
  assert.equal(site.custom.writes, 0)
  // this element on this page: no reach beyond it, and the write goes on
  const one = readings(
    wpButton({ 'background-color': orangeRow }),
    wpButton({ 'background-color': { ...orangeRow, value: 'rgb(29, 78, 216)', hex: '#1d4ed8' } })
  )
  const element = /** @type {any} */ (
    await lookSet({
      params: { target: 'See what we bake', props: { 'background-color': '#1d4ed8' }, scope: 'element' },
      platform: 'wordpress',
      siteRoot: site.siteRoot,
      measure: one.measure,
      io: site.io,
      wide
    })
  )
  assert.equal(element.ok, true, JSON.stringify(element))
  assert.deepEqual([seen[1].scope, seen[1].everyPage, seen[1].paints], ['element', false, null])
})

test('paintSelectors: the winning rule of each property, bare, for the count; nothing for a winner that is no rule or a cut one', () => {
  assert.deepEqual(
    paintSelectors({
      color: { by: '.a .b @media (max-width: 767.98px)' },
      'background-color': { by: '.c @layer theme' },
      margin: { by: 'its style attribute' },
      padding: { by: '.d .e …' },
      border: {}
    }),
    ['.a .b', '.c', '', '', '']
  )
})

// ── the template's own customisation stylesheet (turn latency, 25/10/2026) ──────────────────────

/**
 * saigon-iron-boxing (Joomla T4, ja_boxing) on dev, 25/10/2026: the stylesheets of its home page in
 * order. Every template rule is in T4's bundle; the only template-folder sheet after it is the
 * lightbox's icon font, which the lightbox script adds last. look.set took that one: in four of six
 * turns the agent found its rule in `fontello.css`, searched, undid it and rewrote it by hand in
 * `local/css/custom.css` (~20–30 s a turn).
 */
const BOX_SHEETS = [
  '/plugins/system/t4/themes/base/vendors/font-awesome5/css/all.min.css',
  '/plugins/system/t4/themes/base/vendors/font-awesome/css/font-awesome.min.css',
  '/templates/ja_boxing/js/owl-carousel/owl.carousel.min.css',
  '/media/t4/optimize/css/842ed064c2ee113d21f8560dacec820b.css',
  'https://fonts.googleapis.com/css',
  '/templates/ja_boxing/js/html5lightbox/icons/css/fontello.css'
]
const BOX_FONTELLO = '[class^="hi-icon-"]:before { font-family: "fontello"; }\n'
const BOX_OWL = '.owl-carousel { display: none; }\n'
const boxFiles = (/** @type {Record<string, string>} */ more = {}) => ({
  'administrator/index.php': '<?php\n',
  'templates/ja_boxing/js/html5lightbox/icons/css/fontello.css': BOX_FONTELLO,
  'templates/ja_boxing/js/owl-carousel/owl.carousel.min.css': BOX_OWL,
  ...more
})
/** One element of saigon-iron-boxing's home page as describeTarget reads it there. */
const boxRead = (
  /** @type {Record<string, unknown>} */ props,
  /** @type {Record<string, unknown>} */ info = {}
) => ({
  info: {
    el: '<a.btn.btn-primary>',
    text: 'Come say hello',
    matches: 1,
    how: 'exact',
    hidden: false,
    unique: '#t4-hero a.btn.btn-primary',
    body: 'site-default navigation-default theme-default layout-home com_content view-featured item-101 loaded-bs5',
    chrome: false,
    sheets: BOX_SHEETS,
    template: 'ja_boxing',
    framework: 't4',
    ...info
  },
  props,
  loaded: true
})
const boxRow = (/** @type {string} */ hex, /** @type {string} */ by = '.btn-primary') => ({
  value: hex,
  hex,
  set: `background-color: ${hex}`,
  by,
  sheet: BOX_SHEETS[3],
  tokens: []
})
const boxSet = async (
  /** @type {ReturnType<typeof fakeSite>} */ site,
  /** @type {any[]} */ reads,
  /** @type {Record<string, unknown>} */ params = {}
) => {
  const { measure } = readings(...reads)
  return /** @type {any} */ (
    await lookSet({
      params: {
        path: '/',
        target: 'Come say hello',
        props: { 'background-color': '#2E86DE' },
        scope: 'element',
        ...params
      },
      platform: 'joomla',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
}
const assertBoxLibrariesUntouched = (/** @type {ReturnType<typeof fakeSite>} */ site) => {
  assert.equal(site.read('templates/ja_boxing/js/html5lightbox/icons/css/fontello.css'), BOX_FONTELLO)
  assert.equal(site.read('templates/ja_boxing/js/owl-carousel/owl.carousel.min.css'), BOX_OWL)
}

test('🔒 Joomla T4: a look goes into the template’s local/css/custom.css, never the lightbox’s icon sheet loaded after the winning rule (saigon-iron-boxing)', async () => {
  const owner = '/* the site owner’s rules */\n.boxing-note { margin: 0; }\n'
  const site = fakeSite(boxFiles({ 'templates/ja_boxing/local/css/custom.css': owner }))
  const out = await boxSet(site, [
    boxRead({ 'background-color': boxRow('#c0392b') }),
    boxRead({ 'background-color': boxRow('#2e86de') })
  ])
  assert.equal(out.ok, true, JSON.stringify(out))
  assertBoxLibrariesUntouched(site)
  const css = site.read('templates/ja_boxing/local/css/custom.css')
  assert.ok(css.startsWith(owner), 'the owner’s rules are kept, the rule goes after them')
  assert.match(css, /\nbody\.item-101 #t4-hero a\.btn\.btn-primary \{\n {2}background-color: #2E86DE;\n\}\n$/)
  assert.deepEqual(
    out.wrote.map((/** @type {any} */ w) => w.file),
    ['.webroot/templates/ja_boxing/local/css/custom.css']
  )
  // the hero is this page's own: still this page only
  assert.match(out.reach, /this page only \(body\.item-101\)/)
})

test('🔒 Joomla T4: no custom.css yet — local/css/custom.css is created (T4 loads it the moment it exists), and its undo removes it', async () => {
  const site = fakeSite(boxFiles())
  const out = await boxSet(site, [
    boxRead({ 'background-color': boxRow('#c0392b') }),
    boxRead({ 'background-color': boxRow('#2e86de') })
  ])
  assert.equal(out.ok, true, JSON.stringify(out))
  assertBoxLibrariesUntouched(site)
  const css = site.read('templates/ja_boxing/local/css/custom.css')
  assert.match(css, /^\/\* look\.set: this element, this page only \(body\.item-101\) \*\/\n/)
  const back = /** @type {any} */ (await revertLook({ siteRoot: site.siteRoot, undo: out.undo, io: site.io }))
  assert.equal(back.ok, true, JSON.stringify(back))
  assert.equal(
    existsSync(path.join(site.siteRoot, '.webroot/templates/ja_boxing/local/css/custom.css')),
    false,
    'the undo takes away the file the look created'
  )
})

test('🔒 Joomla T4: a template that ships css/custom.css and has no local one gets the rule there — a new local/ copy would hide it', async () => {
  const shipped = '.boxing-hero { min-height: 60vh; }\n'
  const site = fakeSite(boxFiles({ 'templates/ja_boxing/css/custom.css': shipped }))
  const out = await boxSet(site, [
    boxRead({ 'background-color': boxRow('#c0392b') }),
    boxRead({ 'background-color': boxRow('#2e86de') })
  ])
  assert.equal(out.ok, true, JSON.stringify(out))
  const css = site.read('templates/ja_boxing/css/custom.css')
  assert.ok(css.startsWith(shipped))
  assert.match(css, /background-color: #2E86DE;/)
  assertBoxLibrariesUntouched(site)
  assert.equal(
    existsSync(path.join(site.siteRoot, '.webroot/templates/ja_boxing/local/css/custom.css')),
    false
  )
})

test('🔒 Joomla T4: a header menu link is the same on every page — one site-wide rule in custom.css, asked before it is written (saigon-iron-boxing)', async () => {
  const site = fakeSite(boxFiles({ 'templates/ja_boxing/local/css/custom.css': '' }))
  const link = {
    el: '<a.nav-link>',
    text: 'Classes',
    unique: '#t4-header li.nav-item.item-167 a.nav-link',
    chrome: true
  }
  const colour = (/** @type {string} */ hex) => ({
    ...boxRow(hex, '.t4-megamenu .navbar-nav > li > a'),
    set: `color: ${hex}`
  })
  /** @type {any[]} */
  const asked = []
  const { measure } = readings(
    boxRead({ color: colour('#ffffff') }, link),
    boxRead({ color: colour('#2e86de') }, link)
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: { path: '/', target: 'Classes', props: { color: '#2E86DE' }, scope: 'element' },
      platform: 'joomla',
      siteRoot: site.siteRoot,
      measure,
      io: site.io,
      wide: (reach) => {
        asked.push(reach)
        return null
      }
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(asked.length, 1)
  assert.equal(asked[0].everyPage, true, 'the customer is told it reaches every page')
  const css = site.read('templates/ja_boxing/local/css/custom.css')
  assert.doesNotMatch(css, /item-101/, 'not scoped to the home page')
  assert.match(css, /look\.set: this element, every page/)
  assert.match(css, /\n#t4-header li\.nav-item\.item-167 a\.nav-link[^{]* \{\n {2}color: #2E86DE;\n\}\n$/)
  assert.match(out.reach, /on every page/)
  assertBoxLibrariesUntouched(site)
})

test('🔒 Joomla T4: a selector that names only the phone drawer’s hidden copy of a menu link writes the copy visitors see too, and reads that one again (saigon-iron-boxing, 26/10/2026)', async () => {
  const site = fakeSite(boxFiles({ 'templates/ja_boxing/local/css/custom.css': '' }))
  const colour = (/** @type {string} */ hex, /** @type {string} */ by, /** @type {number[]} */ spec) => ({
    ...boxRow(hex, by),
    set: `color: ${hex}`,
    spec
  })
  const DRAWER = '.t4-offcanvas .t4-off-canvas-body .navbar .nav-link'
  const BAR = '.t4-megamenu .navbar-nav > li > a'
  const barCopy = 'nav.t4-megamenu li.nav-item.dropdown.parent a.nav-link.dropdown-toggle'
  const drawer = {
    el: '<a.nav-link.dropdown-toggle>',
    text: 'About',
    unique: 'li.nav-item.item-193.deeper a.nav-link.dropdown-toggle',
    hidden: 'visibility:hidden',
    chrome: true,
    copies: [
      {
        unique: barCopy,
        el: '<a.nav-link.dropdown-toggle>',
        props: { color: colour('#ffffff', BAR, [0, 2, 2]) }
      }
    ]
  }
  const bar = { el: '<a.nav-link.dropdown-toggle>', text: 'About', unique: barCopy, chrome: true }
  const { measure, asked } = readings(
    boxRead({ color: colour('#ffffff', DRAWER, [0, 4, 0]) }, drawer),
    boxRead({ color: colour('#2e86de', 'x', [0, 9, 0]) }, bar)
  )
  const out = /** @type {any} */ (
    await lookSet({
      params: {
        path: '/',
        target: { selector: 'li.item-193 > a' },
        props: { color: '#2E86DE' },
        scope: 'element'
      },
      platform: 'joomla',
      siteRoot: site.siteRoot,
      measure,
      io: site.io
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const css = site.read('templates/ja_boxing/local/css/custom.css')
  const rule = /\n([^{}]+) \{\n {2}color: #2E86DE;\n\}\n$/.exec(css)
  assert.ok(rule, css)
  const selectors = rule[1].split(', ')
  assert.equal(selectors.length, 2, 'the drawer’s copy and the bar’s, in one rule')
  assert.ok(selectors[0].startsWith(drawer.unique))
  assert.ok(selectors[1].startsWith(barCopy))
  assert.ok(
    compareSpec(specificity(selectors[1]), [0, 2, 2]) >= 0,
    'as specific as what wins on the bar’s copy'
  )
  // read again where the visitor looks: the bar's copy, and its values are what the answer says
  assert.equal(asked[1].req.selector, barCopy)
  assert.deepEqual(out.values.color, { before: '#ffffff', after: '#2e86de' })
  assert.equal(out.hidden, undefined, 'the link read again is the one visitors see')
  assert.match(out.element, /hidden here \(visibility:hidden\); its copy visitors see written with it/)
  assert.match(out.reach, /this element and the copy visitors see, on every page/)
  assertBoxLibrariesUntouched(site)
})

test('look.set: values handed back by `roles` are what is written, and the answer says so; a failing `roles` writes the values as asked', async () => {
  for (const failing of [false, true]) {
    const site = fakeSite(boxFiles({ 'templates/ja_boxing/local/css/custom.css': '' }))
    const out = await (async () => {
      const { measure } = readings(
        boxRead({ 'background-color': boxRow('#c0392b') }),
        boxRead({ 'background-color': boxRow('#2e86de') })
      )
      return /** @type {any} */ (
        await lookSet({
          params: {
            path: '/',
            target: 'Come say hello',
            props: { 'background-color': '#2E86DE' },
            scope: 'element'
          },
          platform: 'joomla',
          siteRoot: site.siteRoot,
          measure,
          io: site.io,
          roles: async (props) => {
            if (failing) throw new Error('slot read failed')
            return {
              props: props.map(([n, v]) => [n, `var(--ds-c-accent, ${v})`]),
              through: props.map(([n, v]) => ({ prop: n, value: v, use: `var(--ds-c-accent, ${v})` }))
            }
          }
        })
      )
    })()
    assert.equal(out.ok, true, JSON.stringify(out))
    const css = site.read('templates/ja_boxing/local/css/custom.css')
    if (failing) {
      assert.match(css, /background-color: #2E86DE;/)
      assert.equal(out.throughRoles, undefined)
    } else {
      assert.match(css, /background-color: var\(--ds-c-accent, #2E86DE\);/)
      assert.deepEqual(out.throughRoles, ['background-color: var(--ds-c-accent, #2E86DE)'])
      assert.match(out.next, /nothing more to do for it/)
    }
  }
})

test('Joomla T4: the template is known from the page even when no stylesheet of its folder is loaded (everything in T4’s bundle)', async () => {
  const site = fakeSite(boxFiles({ 'templates/ja_boxing/local/css/custom.css': '' }))
  const sheets = [BOX_SHEETS[0], BOX_SHEETS[3]]
  const out = await boxSet(site, [
    boxRead({ 'background-color': boxRow('#c0392b') }, { sheets }),
    boxRead({ 'background-color': boxRow('#2e86de') }, { sheets })
  ])
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.match(site.read('templates/ja_boxing/local/css/custom.css'), /background-color: #2E86DE;/)
})

test('Joomla T3, Cassiopeia and an unknown framework: each template’s own customisation file — css/custom.css, user.css, the override.css the page loads', async () => {
  // T3: `head.php` adds css/custom.css when the file exists
  const t3 = fakeSite(boxFiles())
  const t3Sheets = [
    '/plugins/system/t3/base-bs3/bootstrap/css/bootstrap.css',
    '/templates/ja_boxing/css/template.css',
    BOX_SHEETS[5]
  ]
  const t3Row = { ...boxRow('#c0392b'), sheet: t3Sheets[1] }
  const t3Out = await boxSet(t3, [
    boxRead({ 'background-color': t3Row }, { sheets: t3Sheets, framework: 't3' }),
    boxRead({ 'background-color': { ...t3Row, hex: '#2e86de' } }, { sheets: t3Sheets, framework: 't3' })
  ])
  assert.equal(t3Out.ok, true, JSON.stringify(t3Out))
  assert.match(t3.read('templates/ja_boxing/css/custom.css'), /background-color: #2E86DE;/)
  assertBoxLibrariesUntouched(t3)
  // Cassiopeia (Joomla 4+): media/templates/site/<t>/css/user.css
  const cas = fakeSite({ 'administrator/index.php': '<?php\n' })
  const casSheets = [
    '/media/templates/site/cassiopeia/css/template.min.css',
    '/media/vendor/lightbox/lightbox.css'
  ]
  const casRow = { ...boxRow('#c0392b'), sheet: casSheets[0] }
  const casInfo = { sheets: casSheets, template: 'cassiopeia', framework: null }
  const casOut = await boxSet(cas, [
    boxRead({ 'background-color': casRow }, casInfo),
    boxRead({ 'background-color': { ...casRow, hex: '#2e86de' } }, casInfo)
  ])
  assert.equal(casOut.ok, true, JSON.stringify(casOut))
  assert.match(cas.read('media/templates/site/cassiopeia/css/user.css'), /background-color: #2E86DE;/)
  // a framework look.set does not know (Gavick's own): the customisation file the page loads
  const gk = fakeSite({
    'administrator/index.php': '<?php\n',
    'templates/gk_appetit/css/override.css': '',
    'templates/gk_appetit/js/lightbox/lightbox.css': '.lb {}\n'
  })
  const gkSheets = [
    '/templates/gk_appetit/css/template.css',
    '/templates/gk_appetit/css/override.css',
    '/templates/gk_appetit/js/lightbox/lightbox.css'
  ]
  const gkRow = { ...boxRow('#c0392b'), sheet: gkSheets[0] }
  const gkInfo = { sheets: gkSheets, template: 'gk_appetit', framework: null }
  const gkOut = await boxSet(gk, [
    boxRead({ 'background-color': gkRow }, gkInfo),
    boxRead({ 'background-color': { ...gkRow, hex: '#2e86de' } }, gkInfo)
  ])
  assert.equal(gkOut.ok, true, JSON.stringify(gkOut))
  assert.match(gk.read('templates/gk_appetit/css/override.css'), /background-color: #2E86DE;/)
  assert.equal(gk.read('templates/gk_appetit/js/lightbox/lightbox.css'), '.lb {}\n')
})

test('🔒 Joomla, a framework look.set does not know and no customisation file on the page: a library’s sheet after the winner is refused, nothing written', async () => {
  const site = fakeSite({
    'administrator/index.php': '<?php\n',
    'templates/x/js/lightbox/icons/css/fontello.css': BOX_FONTELLO
  })
  const sheets = [
    '/templates/x/css/template.css',
    '/media/plg_x/x.css',
    '/templates/x/js/lightbox/icons/css/fontello.css'
  ]
  const row = { ...boxRow('#c0392b'), sheet: sheets[1] }
  const out = await boxSet(site, [
    boxRead({ 'background-color': row }, { sheets, template: 'x', framework: null })
  ])
  assert.equal(out.code, 'LOOK_SET_NO_ROAD', JSON.stringify(out))
  assert.match(out.error, /no stylesheet of this site's template loads after/)
  assert.equal(site.read('templates/x/js/lightbox/icons/css/fontello.css'), BOX_FONTELLO)
  assert.equal(site.undos().length, 0)
})

test('editableSheet: a library’s sheet inside a template or theme folder (lightbox icons, carousel, vendor) is not the template’s own', () => {
  for (const [platform, name] of [
    ['joomla', '/templates/ja_boxing/js/html5lightbox/icons/css/fontello.css'],
    ['joomla', '/templates/ja_boxing/js/owl-carousel/owl.carousel.min.css'],
    ['joomla', '/templates/ja_boxing/fonts/font-awesome/css/font-awesome.css'],
    ['wordpress', '/wp-content/themes/t/assets/vendor/swiper/swiper.css']
  ])
    assert.equal(editableSheet(platform, name), null, `${platform} ${name}`)
  assert.equal(
    editableSheet('joomla', '/templates/ja_boxing/local/css/custom.css'),
    '/templates/ja_boxing/local/css/custom.css'
  )
})
