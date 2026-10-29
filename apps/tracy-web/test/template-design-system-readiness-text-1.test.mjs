/**
 * TEXT-1 of the Template Design System Readiness check: a text colour of the template's stylesheets
 * must read a text role of the slot, never a ground role (the accent fill, the page, a surface, the ink
 * band, a status fill). The case that asked for it: a code review of JA Restaurant (20/10/2026) found a
 * text `color` reading `var(--ds-c-accent)` in the joomlart-products sources, readable as a fill only.
 * Static, so it runs on Check again; worth-fixing.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'

import { checkRelease, RULES } from '../src/lib/template-design-system-readiness/index.js'
import { summarizeDsReadiness } from '../src/lib/template-design-system-readiness/severity.js'
import { groundRolesAsText } from '../../../packages/design/tracy-ds-slot/src/text-roles.mjs'

/** A minimal ustar tar.gz of `files` (path -> text). */
function tarGz(/** @type {Record<string, string>} */ files) {
  const blocks = []
  for (const [name, text] of Object.entries(files)) {
    const body = Buffer.from(text)
    const header = Buffer.alloc(512)
    header.write(name, 0, 100)
    header.write('0000644\0', 100)
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('0', 156)
    header.write('ustar\0', 257)
    header.fill(' ', 148, 156)
    let sum = 0
    for (const b of header) sum += b
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]))
}

/** A Joomla release of JA Restaurant whose template stylesheet is `css`. */
function restaurant(/** @type {string} */ css) {
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'joomla',
    label: 'JA Restaurant',
    version: '1.0.6',
    cms: '6.0.3',
    template: 'ja_restaurant',
    install: {
      webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
      database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
    }
  }
  /** @type {Record<string, Buffer>} */
  const all = {
    'tracy_setting.json': Buffer.from(JSON.stringify(setting)),
    'd.sql.gz': gzipSync('CREATE TABLE `#__modules` (`id` int NOT NULL);'),
    'w.tar.gz': tarGz({ 'templates/ja_restaurant/css/template.css': css })
  }
  const tag = 'quickstart/ja-restaurant/j6'
  return {
    tag,
    where: `memory:${tag}`,
    names: async () => Object.keys(all).sort(),
    read: async (/** @type {string} */ name) => (name in all ? all[name] : null)
  }
}

const text1 = async (/** @type {string} */ css) =>
  (await checkRelease(restaurant(css), { only: ['TEXT-1'] })).results.find((r) => r.id === 'TEXT-1')

test('TEXT-1 is registered for every CMS, owned by the template, and worth-fixing', async () => {
  const rule = RULES.find((r) => r.id === 'TEXT-1')
  assert.ok(rule)
  assert.deepEqual(rule.platforms, ['joomla', 'wordpress', 'emdash'])
  assert.equal(rule.owner, 'template')
  const failing = await text1('.menu a { color: var(--ds-c-accent, #b8860b) }')
  assert.equal(failing?.status, 'fail')
  const s = summarizeDsReadiness({ results: [/** @type {any} */ (failing)] })
  assert.deepEqual(
    s.worthFixing.map((m) => m.rule),
    ['TEXT-1']
  )
  assert.equal(s.mustFix.length, 0, 'never holds Publish')
})

test('TEXT-1 names each text colour that reads a ground role, and the text role it should read', async () => {
  const r = await text1(
    [
      '.menu a { color: var(--ds-c-accent, #b8860b) }',
      '.btn-primary { background: var(--ds-c-accent, #b8860b); color: var(--ds-c-bg, #fff) }',
      '.alert-error { color: var(--ds-c-danger, #c00) }',
      '.footer .title { color: var(--ds-c-ink, #111) }'
    ].join('\n')
  )
  assert.equal(r?.status, 'fail')
  assert.match(String(r?.message), /^4 text colours read a ground role/)
  assert.deepEqual(r?.details, [
    'css/template.css:1 .menu a { color: --ds-c-accent } → --ds-c-accent-text',
    'css/template.css:2 .btn-primary { color: --ds-c-bg } → --ds-c-accent-on',
    'css/template.css:3 .alert-error { color: --ds-c-danger } → --ds-c-danger-text',
    'css/template.css:4 .footer .title { color: --ds-c-ink } → --ds-c-heading or fg'
  ])
})

test('TEXT-1 passes text roles, mixes with a text role, inverted pairs and outline lettering', async () => {
  const r = await text1(
    [
      'a { color: var(--ds-c-accent-text, #b8860b) }',
      'a:hover { color: var(--ds-c-accent-text-hover, #8a6508) }',
      '.ink a { color: var(--ds-c-accent-on-ink, #f5c542) }',
      '.lead { color: color-mix(in srgb, var(--ds-c-fg) 70%, var(--ds-c-bg)) }',
      '.btn-invert { background: var(--ds-c-accent-on, #fff); color: var(--ds-c-accent, #b8860b) }',
      '.outline { -webkit-text-stroke: 1px var(--ds-c-fg); -webkit-text-fill-color: var(--ds-c-bg, #fff) }',
      '.card { background: var(--ds-c-surface, #f6f6f6); border-color: var(--ds-c-accent, #b8860b) }'
    ].join('\n')
  )
  assert.equal(r?.status, 'pass')
})

test('only the declaration that paints the words is scored: text variables are out of scope', () => {
  const found = groundRolesAsText([
    [
      'template.css',
      [
        '.table-primary { --t4-table-color: var(--ds-c-bg, #000); --t4-table-striped-color: var(--ds-c-bg, #000) }',
        '.btn-warning { --t4-btn-hover-color: var(--ds-c-bg, #000); --t4-btn-hover-bg: var(--ds-c-accent-hover, #e0a800) }',
        '.btn { color: var(--t4-btn-hover-color) }',
        'input { caret-color: var(--ds-c-accent, #b8860b) }',
        '.tag { color: var(--ds-c-accent, #b8860b) }',
        '.submit { background: var(--sub, #fff); color: var(--ds-c-accent, #b8860b) }',
        '.form { --sub: var(--ds-c-accent-on) }'
      ].join('\n')
    ]
  ])
  // the inverted pair is found through the template property its fill reads (--sub = accent-on)
  assert.deepEqual(
    found.map((f) => [f.selector, f.property, f.role, f.use]),
    [['.tag', 'color', 'accent', 'accent-text']]
  )
})

test('the role a value paints is its outermost slot read, not a fallback (Sol review)', () => {
  const found = groundRolesAsText([
    [
      'template.css',
      [
        '.a { color: var(--ds-c-accent, var(--ds-c-fg)) }',
        '.b { color: var(--ds-c-accent-text, var(--ds-c-accent)) }',
        '.c { color: var(--brand, var(--ds-c-accent, #b8860b)) }',
        '.d { color: light-dark(var(--ds-c-surface, #fff), var(--ds-c-fg-2, var(--ds-c-surface))) }',
        '.e { color: color-mix(in srgb, var(--ds-c-fg) 70%, var(--ds-c-bg)) }',
        '.f { background: var(--ds-c-accent-on, var(--ds-c-accent)); color: var(--ds-c-accent, #b8860b) }',
        '.g { background: var(--ds-c-surface, var(--ds-c-accent-on)); color: var(--ds-c-accent, #b8860b) }'
      ].join('\n')
    ]
  ])
  assert.deepEqual(
    found.map((f) => [f.selector, f.role]),
    [
      ['.a', 'accent'],
      ['.c', 'accent'],
      ['.d', 'surface'],
      ['.g', 'accent']
    ]
  )
})

test('each half of a light-dark() is judged alone; two text halves pass', () => {
  const css = (/** @type {string} */ v) =>
    groundRolesAsText([['t.css', `.x { color: ${v} }`]]).map((f) => f.role)
  assert.deepEqual(css('light-dark(var(--ds-c-fg, #111), var(--ds-c-fg-2, #eee))'), [])
  assert.deepEqual(css('light-dark(var(--ds-c-accent-text, #00f), var(--ds-c-accent, #99f))'), ['accent'])
  assert.deepEqual(css('color-mix(in srgb, var(--ds-c-accent) 40%, var(--ds-c-fg))'), [])
})

test('an inverted pair is matched side by side: the dark half of the words against the dark half of the fill', () => {
  const found = groundRolesAsText([
    [
      't.css',
      [
        '.play { background: light-dark(var(--ds-c-surface, #fff), var(--ds-c-heading, #fff)); color: light-dark(var(--ds-c-accent-text, #00f), var(--ds-c-bg, #00f)) }',
        '.odd { background: light-dark(var(--ds-c-heading, #000), var(--ds-c-surface, #222)); color: light-dark(var(--ds-c-accent-text, #00f), var(--ds-c-bg, #00f)) }'
      ].join('\n')
    ]
  ])
  // .odd: its dark words are the page colour on a dark surface, no pair
  assert.deepEqual(
    found.map((f) => [f.selector, f.role]),
    [['.odd', 'bg']]
  )
})

test('words of one value on a light-dark() fill pair with both halves, or they are scored', () => {
  const roles = (/** @type {string} */ fill) =>
    groundRolesAsText([['t.css', `.x { background: ${fill}; color: var(--ds-c-bg, #fff) }`]]).map(
      (f) => f.role
    )
  assert.deepEqual(roles('light-dark(var(--ds-c-heading, #000), var(--ds-c-fg, #eee))'), [])
  assert.deepEqual(roles('light-dark(var(--ds-c-heading, #000), var(--ds-c-surface, #222))'), ['bg'])
})
