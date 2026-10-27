/**
 * A look write on WordPress or Joomla that types a literal colour, corner or face where a design-system
 * role owns it is answered with the `var()` to write (Akemi, 20/10/2026: "a new button follows the
 * template when no design system is worn, and the new system's rules when one is"). The ruler is the
 * worn slot, or — wearing none — the roles the template's own stylesheets read; the fallback is always
 * the TEMPLATE's value, so taking a system off brings the template back.
 *
 *   node --test packages/tools/tracy-site-tools/test/role-pins.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  EMDASH_SLOT_SCRIPT,
  nearestRoles,
  parseRolesRead,
  parseSlotRead,
  slotPinNotes,
  templateRolesOf
} from '../src/host/ds-slot-worn.mjs'
import {
  bodiesRead,
  bodyAddress,
  carriesLook,
  contextAt,
  fileToolPaths,
  newRolePins,
  rolePins,
  rolePinsNext,
  throughRoles,
  writtenBySiteCall
} from '../src/host/role-pins.mjs'
import { isLookFile } from '../src/host/shell-look-write.mjs'

/** A template's stylesheet as Tracy templates write it (JA Kinetic WP's lime, Tracy Business's ink). */
const TEMPLATE = [
  ':root { --k-primary: #a3e635; --k-ink: #14171a; }',
  '.wp-block-button__link { background: var(--ds-c-accent, var(--k-primary)); border-radius: var(--ds-btn-radius, 8px); color: var(--ds-c-accent-on, #0b0f0a); }',
  'body { color: var(--ds-c-fg, var(--k-ink)); background: var(--ds-c-bg, #fbfcfa); font-family: var(--ds-font-body, Inter, sans-serif); }',
  'h1, h2 { color: var(--ds-c-heading, #14171a); font-family: var(--ds-font-display, "Space Grotesk", sans-serif); }',
  '.card { border: 1px solid var(--ds-c-border, #e4e8e0); border-radius: var(--ds-card-radius, 12px); }',
  '.alt { background: var(--ds-c-accent, #a3e635); }'
].join('\n')

const ROLES = /** @type {NonNullable<ReturnType<typeof templateRolesOf>>} */ (templateRolesOf(TEMPLATE))

test('the template’s roles: each role and its own value, a fallback through the template’s variable resolved', () => {
  assert.equal(
    ROLES.tokens['--ds-c-accent'],
    '#a3e635',
    'var(--k-primary) resolved, and the most frequent fallback'
  )
  assert.equal(ROLES.tokens['--ds-c-fg'], '#14171a')
  assert.equal(ROLES.tokens['--ds-c-bg'], '#fbfcfa')
  assert.ok(ROLES.vars.includes('--ds-btn-radius') && ROLES.vars.includes('--ds-font-display'))
  assert.equal(
    templateRolesOf('.btn { background: #a3e635 }'),
    null,
    'a template that reads no role: no ruler'
  )
})

test('nearest roles: by what the colour paints first, every role at the shortest distance named', () => {
  assert.deepEqual(nearestRoles('#14171a', ROLES.tokens, 'text'), ['--ds-c-fg', '--ds-c-heading'])
  assert.deepEqual(nearestRoles('#a3e635', ROLES.tokens, 'bg'), ['--ds-c-accent'])
  assert.deepEqual(nearestRoles('#e4e8e0', ROLES.tokens, 'border'), ['--ds-c-border'])
})

test('🔒 nothing worn: a new button typed with the template’s literals is named, each with the role and the template’s value', () => {
  const block =
    '<!-- wp:button {"style":{"color":{"background":"#a3e635","text":"#0b0f0a"},"border":{"radius":"8px"}}} --><div class="wp-block-button"><a class="wp-block-button__link" style="background-color:#a3e635;color:#0b0f0a;border-radius:8px">Book</a></div><!-- /wp:button -->'
  const pins = rolePins([block], { ruler: ROLES, worn: false })
  const uses = pins.map((p) => p.use)
  // the block attribute and the inline style are one literal on one element: one pin
  assert.equal(
    uses.filter((u) => /^background(?:-color)?: var\(--ds-c-accent, #a3e635\)$/.test(u)).length,
    1,
    uses.join(' | ')
  )
  assert.ok(uses.includes('border-radius: var(--ds-btn-radius, 8px)'), uses.join(' | '))
  assert.ok(
    uses.some((u) => u.startsWith('color: var(--ds-c-accent-on, #0b0f0a)')),
    uses.join(' | ')
  )
  assert.match(pins[0].why, /over the template's/)
  const next = rolePinsNext(pins, false)
  assert.match(next, /a design system the customer applies later will not reach them/)
  assert.match(next, /a value the customer named exactly may stay as they named it/)
})

test('a worn system: the role is the slot’s nearest, the fallback the TEMPLATE’s value — never the worn system’s', () => {
  const slot = {
    vars: ['--ds-c-accent', '--ds-c-fg', '--ds-btn-radius'],
    tokens: { '--ds-c-accent': '#ff5a1f', '--ds-c-fg': '#111111' }
  }
  // the agent copied the worn system's orange off the page
  const pins = rolePins(['.promo a { background: #ff5a1f; border-radius: 2px }'], {
    ruler: slot,
    template: ROLES,
    worn: true
  })
  assert.deepEqual(
    pins.map((p) => p.use),
    ['background: var(--ds-c-accent, #a3e635)', 'border-radius: var(--ds-btn-radius, 8px)']
  )
  assert.match(
    rolePinsNext(pins, true),
    /the next design system, or taking this one off, will not reach them/
  )
})

test('what passes: a value through a role or a preset, layout, the slot’s own sheet, keywords', () => {
  const pins = rolePins(
    [
      '.x { background: var(--ds-c-accent, #a3e635); color: var(--wp--preset--color--primary); padding: 12px 24px; margin: 0 }',
      '{"style":{"color":{"background":"var:preset|color|primary"}}}',
      '/* tracy-ds-slot: refero:x */ :root { --ds-c-accent: #ff5a1f; } .b { background: #ff5a1f }',
      '.y { font-family: inherit; border-radius: inherit; color: currentColor }'
    ],
    { ruler: ROLES, worn: false }
  )
  assert.deepEqual(pins, [])
})

test('a template variable set to a literal breaks the role link: named too', () => {
  const pins = rolePins([':root { --k-primary: #a6e83a; }'], { ruler: ROLES, worn: false })
  assert.equal(pins.length, 1)
  assert.equal(pins[0].prop, '--k-primary')
})

test('what a write wrote: a file tool’s stylesheets by path; look.set props and inserted blocks as new; whole fields as bodies', () => {
  assert.deepEqual(
    fileToolPaths('edit', { file_path: '/site/a/.webroot/x.css', new_string: '' }, isLookFile),
    ['/site/a/.webroot/x.css']
  )
  assert.deepEqual(
    fileToolPaths('write', JSON.stringify({ path: 'notes.md' }), isLookFile),
    [],
    'not a stylesheet'
  )
  assert.deepEqual(
    fileToolPaths(
      'apply_patch',
      { patch: '*** Update File: a/b.css\n+x\n--- a/c.scss\n+++ b/c.scss\n' },
      isLookFile
    ),
    ['a/b.css', 'c.scss']
  )
  assert.deepEqual(
    writtenBySiteCall('look.set', {
      target: { selector: '.wp-block-button__link' },
      props: { 'background-color': '#a3e635', 'border-radius': '8px' }
    }),
    {
      added: ['.wp-block-button__link { background-color: #a3e635; border-radius: 8px }'],
      edits: [],
      bodies: []
    }
  )
  const out = writtenBySiteCall('content.batch', {
    items: [
      {
        kind: 'post',
        id: 42,
        fields: { post_content: '<p style="color:#14171a">x</p>' },
        blocks: { '+2': { attrs: { style: { color: { background: '#a3e635' } } } } }
      }
    ]
  })
  assert.deepEqual(out.bodies, [{ address: 'post:42:|post_content', text: '<p style="color:#14171a">x</p>' }])
  assert.ok(out.added.some((t) => t.includes('"background":"#a3e635"')))
  assert.deepEqual(writtenBySiteCall('content.delete', { id: 1 }), { added: [], edits: [], bodies: [] })
  // review 3–4: a key names its own record; a record the write creates is all new; an edited block is an edit
  assert.notEqual(
    bodyAddress({ kind: 'postmeta', id: 42, key: '_a' }),
    bodyAddress({ kind: 'postmeta', id: 42, key: '_b' })
  )
  assert.equal(bodyAddress({ kind: 'post' }), null)
  assert.deepEqual(
    writtenBySiteCall('content.update', {
      kind: 'post',
      fields: { post_content: '<p style="color:#da5a2a">new page</p>' }
    }),
    {
      added: ['<p style="color:#da5a2a">new page</p>'],
      edits: [],
      bodies: []
    }
  )
  const edited = writtenBySiteCall('content.update', {
    kind: 'post',
    id: 7,
    blocks: { 3: '<p>x</p>', '+4': '<p>y</p>' }
  })
  assert.deepEqual(edited.edits, [{ address: 'post:7:', text: '<p>x</p>' }])
  assert.deepEqual(edited.added, ['<p>y</p>'])
  // a read keeps the body only: never the title, dates or guid
  assert.deepEqual(
    bodiesRead(
      { kind: 'post', id: 9 },
      {
        ok: true,
        item: {
          ID: 9,
          post_title: 'A: b',
          post_date: '2026-10-20 10:00:00',
          guid: 'http://x/?p=9',
          post_content: '<p>z</p>'
        }
      }
    ),
    [{ address: 'post:9:|post_content', text: '<p>z</p>' }]
  )
  // a read's bodies under the same addresses
  assert.deepEqual(
    bodiesRead(
      { kind: 'post', id: 42 },
      { ok: true, item: { ID: 42, post_title: 'Home', post_content: '<p>x</p>' } }
    ),
    [{ address: 'post:42:|post_content', text: '<p>x</p>' }]
  )
})

// ── the review of 20/10/2026, each finding as a case ─────────────────────────────────────────────

/** A template whose accent is orange, its ink near-black, with both text roles sharing the ink. */
const ORANGE = /** @type {any} */ (
  templateRolesOf(
    '.a{color:var(--ds-c-fg, #1d1d1f);background:var(--ds-c-bg, #faf7f2)} h1{color:var(--ds-c-heading, #1d1d1f)} .b{background:var(--ds-c-accent, #da5a2a);border-radius:var(--ds-btn-radius, 8px)} .c{border-radius:var(--ds-card-radius, 12px);font-family:var(--ds-font-body, "Inter", sans-serif)} .w{background:var(--ds-c-surface-warm, #f2efe8)}'
  )
)

test('🔒 review 1: nothing worn, the fallback is the literal itself — the page looks exactly as written; a colour IS the role it equals', () => {
  const uses = (/** @type {string} */ css) =>
    rolePins([css], { ruler: ORANGE, worn: false }).map((p) => p.use)
  // the template's accent written as text stays the accent, never the nearest text role
  assert.deepEqual(uses('.x{color:#da5a2a}'), ['color: var(--ds-c-accent, #da5a2a)'])
  assert.deepEqual(uses(':root{--brand:#da5a2a}'), ['--brand: var(--ds-c-accent, #da5a2a)'])
  // a colour far from every role (a sale badge's red, a black panel) is given none
  assert.deepEqual(uses('.x{color:#ff0000}'), [])
  assert.deepEqual(uses('.x{background:#000000}'), [])
  // near a role: that role, with the literal kept
  assert.deepEqual(uses('.x{background:#d65c2c}'), ['background: var(--ds-c-accent, #d65c2c)'])
  // a corner on something not a button keeps its own value; circles and square corners are shapes
  assert.deepEqual(uses('.x{border-radius:8px}'), ['border-radius: var(--ds-card-radius, 8px)'])
  assert.deepEqual(uses('.x{border-radius:50%} .y{border-radius:0} .z{border-radius:9999px}'), [])
  assert.deepEqual(uses('.btn{border-radius:9999px}'), ['border-radius: var(--ds-btn-radius, 9999px)'])
  // a face keeps itself as the fallback
  assert.deepEqual(uses('.x{font-family: Georgia, serif}'), [
    'font-family: var(--ds-font-body, Georgia, serif)'
  ])
  assert.match(
    rolePinsNext(rolePins(['.x{color:#da5a2a}'], { ruler: ORANGE, worn: false }), false),
    /the literal stays as the fallback, so it looks the same now/
  )
})

test('review 1, worn: the fallback is the template’s own value for that role, so taking the system off brings the template back', () => {
  const slot = {
    vars: ['--ds-c-accent', '--ds-font-body'],
    tokens: { '--ds-c-accent': '#2563eb', '--font-ds-font-body': 'Manrope' }
  }
  const pins = rolePins(['.x{background:#2563eb;font-family:Manrope}'], {
    ruler: slot,
    template: ORANGE,
    worn: true
  })
  assert.deepEqual(
    pins.map((p) => p.use),
    ['background: var(--ds-c-accent, #da5a2a)', 'font-family: var(--ds-font-body, "Inter", sans-serif)']
  )
  assert.match(
    rolePinsNext(pins, true),
    /the template's own value is the fallback, so it looks the same now and taking the system off brings the template back/
  )
})

test('review 7–8: a preset slug, words in a "text" attribute, a fragment url are not literals', () => {
  const pins = rolePins(
    [
      '<!-- wp:paragraph {"fontFamily":"inter","textColor":"primary"} -->',
      '{"text":"Call #abc today","url":"#contact"}',
      '.x{background:url(#bad)} .y{fill:url(#grad)}',
      '<a href="#da5a2a">x</a>'
    ],
    { ruler: ORANGE, worn: false }
  )
  assert.deepEqual(pins, [])
  // inside the style objects they are
  const inside = rolePins(
    ['{"style":{"typography":{"fontFamily":"Georgia, serif"},"color":{"text":"#da5a2a"}}}'],
    {
      ruler: ORANGE,
      worn: false
    }
  )
  assert.deepEqual(inside.map((p) => p.use).sort(), [
    'color: var(--ds-c-accent, #da5a2a)',
    'font-family: var(--ds-font-body, Georgia, serif)'
  ])
})

test('review 9: every role can be named — surface-warm as a ground, accent-on-ink as text', () => {
  assert.deepEqual(nearestRoles('#f2efe8', ORANGE.tokens, 'bg'), ['--ds-c-surface-warm'])
  const ink = /** @type {any} */ (
    templateRolesOf('.x{color:var(--ds-c-accent-on-ink, #b8f05a);background:var(--ds-c-bg, #fff)}')
  )
  assert.deepEqual(nearestRoles('#b8f05a', ink.tokens, 'text'), ['--ds-c-accent-on-ink'])
})

test('review 3: a whole body is judged against the body read — its older literals are not this write’s', () => {
  const was = '<p style="color:#da5a2a">old</p>'
  const now = `${was}<p style="background:#d65c2c">new</p>`
  assert.deepEqual(
    newRolePins([was], [now], { ruler: ORANGE, worn: false }).map((p) => p.use),
    ['background: var(--ds-c-accent, #d65c2c)']
  )
})

test('the template’s roles: comments are not reads; the last declaration of a read keeps its value; two levels of nesting', () => {
  const r = /** @type {any} */ (
    templateRolesOf(
      '--k:#123456;\nvar(--ds-c-fg, var(--k));\nvar(--ds-c-bg, color-mix(in srgb, var(--k) 50%, #ffffff));\n--last: #abcdef;'
    )
  )
  assert.equal(r.tokens['--ds-c-fg'], '#123456')
  assert.ok(r.vars.includes('--ds-c-bg'), 'a fallback with two levels of parentheses')
})

test('page.look on a site wearing nothing: a literal row is a pin over the template’s role, both roles named when they share a value', () => {
  const answer = {
    ok: true,
    el: '<h2 class="title">',
    style: {
      color: { set: 'color: #14171a', hex: '#14171a' },
      'border-radius': { set: 'border-radius: var(--ds-card-radius, 12px)' }
    },
    next: 'Read.'
  }
  const noted = slotPinNotes(answer, ROLES, 'template')
  assert.match(
    noted.style.color.pin,
    /^a literal over the template's role --ds-c-fg or --ds-c-heading: a design system applied later will not reach it — write var\(--ds-c-fg, #14171a\) or var\(--ds-c-heading, #14171a\)$/
  )
  assert.equal(noted.style['border-radius'].pin, undefined, 'set through a role: left alone')
  assert.match(noted.next, /one of the template's design-system roles/)
})

test('the EmDash read: the template’s role reads come back beside the slot, and with none worn too', () => {
  const app = mkdtempSync(path.join(tmpdir(), 'roles-read-'))
  mkdirSync(path.join(app, 'data'))
  mkdirSync(path.join(app, 'src', 'styles'), { recursive: true })
  mkdirSync(path.join(app, 'src', 'node_modules'), { recursive: true })
  writeFileSync(path.join(app, 'src', 'styles', 'tokens.css'), TEMPLATE)
  writeFileSync(path.join(app, 'src', 'node_modules', 'x.css'), '.z { color: var(--ds-c-info, #00f) }')
  // review 6: a broken link, a folder named like a stylesheet and a commented-out read never stop the read
  symlinkSync(path.join(app, 'nowhere.css'), path.join(app, 'src', 'styles', 'broken.css'))
  mkdirSync(path.join(app, 'src', 'styles', 'odd.css'))
  writeFileSync(path.join(app, 'src', 'styles', 'old.css'), '/* .q { color: var(--ds-c-danger, #ff0000) } */')
  const run = () =>
    execFileSync(process.execPath, ['-e', EMDASH_SLOT_SCRIPT, path.join(app, 'data', 'ds-slot.css')], {
      encoding: 'utf8'
    })
  const none = run()
  assert.equal(parseSlotRead('emdash', none), null, 'wears nothing')
  const roles = parseRolesRead(none)
  assert.equal(roles?.tokens['--ds-c-accent'], '#a3e635')
  assert.ok(!roles?.vars.includes('--ds-c-info'), 'node_modules is not the template')
  assert.ok(!roles?.vars.includes('--ds-c-danger'), 'a commented-out read is not a read')
  writeFileSync(
    path.join(app, 'data', 'ds-slot.css'),
    '/* tracy-ds-slot: refero:x (X) — generated */\n:root{--ds-c-accent:#ff5a1f}'
  )
  const worn = run()
  assert.equal(parseSlotRead('emdash', worn)?.id, 'refero:x')
  assert.equal(
    parseRolesRead(worn)?.tokens['--ds-c-accent'],
    '#a3e635',
    'the template’s value, beside the worn slot'
  )
  assert.equal(parseRolesRead('no line'), undefined, 'a read that did not answer')
})

// Measured 20/10/2026 on Tracy Business WP (stand initb-voice-wp1): the dark side restates every role's
// fallback, more often than the light side writes it, and `--ds-c-bg` came out #101214.
test('the template’s roles: the light side is a role’s value, the dark side’s values only an alternative a literal may be', () => {
  const css = [
    ':root{--wp--preset--color--bg:var(--ds-c-bg, #f5f3ee)}',
    'html[data-theme="dark"]{--wp--preset--color--bg:var(--ds-c-bg, #101214);color:var(--ds-c-fg, #eceae4)}',
    '@media (prefers-color-scheme: dark){html:not([data-theme="light"]){--x:var(--ds-c-bg, #101214)}}',
    'body{color:var(--ds-c-fg, #14171a)}'
  ].join('\n')
  const r = /** @type {any} */ (templateRolesOf(css))
  assert.equal(r.tokens['--ds-c-bg'], '#f5f3ee')
  assert.equal(r.tokens['--ds-c-fg'], '#14171a')
  assert.deepEqual(
    nearestRoles('#101214', r.tokens, 'bg', r.also),
    ['--ds-c-bg'],
    'a dark-side literal is still the role'
  )
  // the same, as a slot read sends it (dark reads marked)
  const sent = /** @type {any} */ (
    templateRolesOf(
      'var(--ds-c-bg, #f5f3ee);\n@dark var(--ds-c-bg, #101214);\n@dark var(--ds-c-bg, #101214);\n--k: #000;'
    )
  )
  assert.equal(sent.tokens['--ds-c-bg'], '#f5f3ee')
})

test('review 2 (second round): a corner is a button’s when the RULE styles a button, whatever else the text holds', () => {
  const was = '.btn{padding:2px}.avatar{border-radius:50%}.sq{border-radius:0}'
  const now = `${was}.btn-cta{border-radius:999px}.card-x{border-radius:6px}`
  assert.deepEqual(
    newRolePins([was], [now], { ruler: ORANGE, worn: false }).map((p) => p.use),
    ['border-radius: var(--ds-btn-radius, 999px)', 'border-radius: var(--ds-card-radius, 6px)']
  )
  // a stylesheet that names a button somewhere does not make an avatar's circle a button's corner
  assert.deepEqual(rolePins([was], { ruler: ORANGE, worn: false }), [])
  assert.equal(contextAt('.a{x:1}.b .btn{color:#fff}', 20).trim(), '.b .btn')
  assert.match(contextAt('<p><a class="btn" style="color:#fff">x</a></p>', 30), /^<a class="btn"/)
  // a face declared by @font-face names a file, not what an element wears
  assert.deepEqual(
    rolePins(['@font-face{font-family:"Brand";src:url(b.woff2)}'], { ruler: ORANGE, worn: false }),
    []
  )
})

test('review 1 (second round): a dark-side value never crosses paints — dark text is never named the light page ground', () => {
  const r = /** @type {any} */ (
    templateRolesOf(
      ':root{a:var(--ds-c-bg, #ffffff);b:var(--ds-c-fg, #1d1d1f)} html[data-theme="dark"]{c:var(--ds-c-bg, #111111)}'
    )
  )
  assert.deepEqual(nearestRoles('#111111', r.tokens, 'text', r.also), ['--ds-c-fg'])
  assert.deepEqual(nearestRoles('#111111', r.tokens, 'bg', r.also), ['--ds-c-bg'])
})

test('review 5 (second round): only the dark switch is the dark side — not .btn-dark, .navbar-dark, :root:not(.dark), a mixed list', () => {
  const r = /** @type {any} */ (
    templateRolesOf(
      ':root:not(.dark){--brand:#123456} .btn-dark{x:var(--ds-c-ink, #222222)} .card,.dark .card{y:var(--ds-c-surface, #fafafa)} :root{z:var(--ds-c-accent, var(--brand))} .t4-dark .x{w:var(--ds-c-surface, #000000)}'
    )
  )
  assert.equal(
    r.tokens['--ds-c-accent'],
    '#123456',
    'the light :root:not(.dark) declaration resolves the accent'
  )
  assert.equal(r.tokens['--ds-c-ink'], '#222222', 'a dark-coloured button is the light side')
  assert.equal(
    r.tokens['--ds-c-surface'],
    '#fafafa',
    'a list mixing a light selector is the light side; .t4-dark is the dark one'
  )
  // a dark block that never closes leaves the rest light
  const cut = /** @type {any} */ (
    templateRolesOf('.dark .a{color:var(--ds-c-fg, #eeeeee); :root{b:var(--ds-c-bg, #ffffff)}')
  )
  assert.equal(cut.tokens['--ds-c-bg'], '#ffffff')
})

// ── the third review round (20/10/2026), each finding as a case ─────────────────────────────────

test('review 3.2: a face declared by @font-face anywhere — after a <style>, after a comment — is never pinned', () => {
  for (const css of [
    '<style>@font-face{font-family:Brand;src:url(b.woff2)}</style>',
    '/* Brand font */ @font-face{font-family:"Brand";src:url(b.woff2)}',
    '.a{x:1} /* note */ @font-face { font-family: Brand }'
  ])
    assert.deepEqual(rolePins([css], { ruler: ORANGE, worn: false }), [], css)
  // a commented-out declaration paints nothing
  assert.deepEqual(rolePins(['.x{/* color:#da5a2a; */ margin:0}'], { ruler: ORANGE, worn: false }), [])
})

test('review 3.3: a light near match of the paint before any dark value; an unknown paint never reads the dark side', () => {
  const r = /** @type {any} */ (
    templateRolesOf(
      '.band{color:var(--ds-c-on-ink, #f5f5f5);background:var(--ds-c-ink, #101214)} html.dark body{color:var(--ds-c-fg, #eeeeee)} :root{a:var(--ds-c-bg, #ffffff)} p{color:var(--ds-c-fg, #1d1d1f)}'
    )
  )
  assert.deepEqual(nearestRoles('#eeeeee', r.tokens, 'text', r.also), ['--ds-c-on-ink'])
  assert.deepEqual(
    nearestRoles('#0f1112', r.tokens, null, r.also),
    ['--ds-c-ink'],
    'unknown paint: light only'
  )
  assert.deepEqual(nearestRoles('#202020', { '--ds-c-bg': '#ffffff' }, null, [['--ds-c-bg', '#202020']]), [])
})

test('review 3.4: the dark switches themes use — body.is-dark-theme, a list all dark, a theme.json css string that opens dark', () => {
  const r = /** @type {any} */ (
    templateRolesOf(
      '"css":":root[data-theme=\\"dark\\"]{a:var(--ds-c-bg, #121212)}" body.is-dark-theme .x{b:var(--ds-c-fg, #eeeeee)} .dark, [data-theme="dark"]{c:var(--ds-c-surface, #222222)} [data-color-mode=dark]{d:var(--ds-c-meta, #999999)} :root{e:var(--ds-c-bg, #ffffff);f:var(--ds-c-fg, #111111);g:var(--ds-c-surface, #fafafa);h:var(--ds-c-meta, #666666)}'
    )
  )
  assert.deepEqual(
    [r.tokens['--ds-c-bg'], r.tokens['--ds-c-fg'], r.tokens['--ds-c-surface'], r.tokens['--ds-c-meta']],
    ['#ffffff', '#111111', '#fafafa', '#666666']
  )
  // an unclosed dark block skips itself, the next dark block is still dark
  const cut = /** @type {any} */ (
    templateRolesOf('.dark .a{x:{ :root{b:var(--ds-c-bg, #ffffff)} .dark .b{c:var(--ds-c-bg, #000000)}')
  )
  assert.equal(cut.tokens['--ds-c-bg'], '#ffffff')
})

test('review 3.5–3.6: one literal is one pin across a block attribute and its inline style; what is a button is read from its own element', () => {
  const block =
    '<!-- wp:button {"style":{"color":{"background":"#d65c2c"},"border":{"radius":"6px"}}} --><div class="wp-block-button"><a class="wp-block-button__link" style="background-color:#d65c2c;border-radius:6px">Go</a></div><!-- /wp:button -->'
  assert.equal(newRolePins([''], [block], { ruler: ORANGE, worn: false }).length, 2)
  assert.deepEqual(
    rolePins(
      [
        '<div class="btn-group"></div><style>.card{border-radius:0} .wp-block-buttons{border-radius:0}</style>'
      ],
      {
        ruler: ORANGE,
        worn: false
      }
    ),
    [],
    'a button group and a buttons row are not buttons: their square corners are shapes'
  )
  assert.equal(
    rolePins(['<a data-x="1>2" class="btn" style="border-radius:9999px">x</a>'], {
      ruler: ORANGE,
      worn: false
    })[0]?.use,
    'border-radius: var(--ds-btn-radius, 9999px)'
  )
  assert.equal(
    rolePins(['input[type=submit]{border-radius:0}'], { ruler: ORANGE, worn: false })[0]?.use,
    'border-radius: var(--ds-btn-radius, 0)'
  )
})

test('pre-existing: a quoted face is read whole', () => {
  assert.deepEqual(
    rolePins(['p{font-family:"Inter",sans-serif}'], { ruler: ORANGE, worn: false })[0]?.use,
    'font-family: var(--ds-font-body, "Inter",sans-serif)'
  )
  assert.deepEqual(
    rolePins(['p{font-family:Inter, "Helvetica Neue", sans-serif}'], { ruler: ORANGE, worn: false })[0]?.use,
    'font-family: var(--ds-font-body, Inter, "Helvetica Neue", sans-serif)'
  )
})

test('review 3 (Joomla): a call without kind is an article; bodies are its introtext and fulltext', () => {
  assert.equal(bodyAddress({ id: 5 }, 'joomla'), 'article:5:')
  assert.deepEqual(
    bodiesRead(
      { id: 5 },
      { ok: true, item: { id: 5, title: 'x', introtext: '<p>a</p>', fulltext: '' } },
      'joomla'
    ).map((b) => b.address),
    ['article:5:|introtext', 'article:5:|fulltext']
  )
})

// ── the fourth review round (20/10/2026) ────────────────────────────────────────────────────────

test('review 4.2–4.4: the whole tag says what the element is; a child combinator is part of its selector', () => {
  const pin = (/** @type {string} */ t) => rolePins([t], { ruler: ORANGE, worn: false })[0]?.use
  assert.equal(
    pin('<a style="border-radius:9999px" class="wp-block-button__link">x</a>'),
    'border-radius: var(--ds-btn-radius, 9999px)'
  )
  assert.equal(
    pin('<input style="border-radius:6px" type="submit">'),
    'border-radius: var(--ds-btn-radius, 6px)'
  )
  assert.equal(
    pin('.wp-block-button > a{border-radius:9999px}'),
    'border-radius: var(--ds-btn-radius, 9999px)'
  )
  assert.equal(
    pin('<style>.btn > span{border-radius:4px}</style>'),
    'border-radius: var(--ds-btn-radius, 4px)'
  )
})

test('review 4.3: a quoted value never runs into the next attribute', () => {
  const pins = rolePins(
    ['<a style="color:#d65c2c" href="/contact">x</a><p style="font-family:Georgia" class="lead">y</p>'],
    {
      ruler: ORANGE,
      worn: false
    }
  )
  assert.deepEqual(
    pins.map((p) => p.use),
    ['color: var(--ds-c-accent, #d65c2c)', 'font-family: var(--ds-font-body, Georgia)']
  )
  // so a later attribute that changes does not make an old literal new
  assert.deepEqual(
    newRolePins(['<a style="color:#d65c2c" href="/a">x</a>'], ['<a style="color:#d65c2c" href="/b">x</a>'], {
      ruler: ORANGE,
      worn: false
    }),
    []
  )
})

test('review 4.5: only a body field is judged against the body read; a title or a status is the write’s own', () => {
  const out = writtenBySiteCall('content.update', {
    kind: 'post',
    id: 5,
    fields: { post_status: 'publish', post_title: 'Hello', post_content: '<p>x</p>' }
  })
  assert.deepEqual(out.bodies, [{ address: 'post:5:|post_content', text: '<p>x</p>' }])
  assert.deepEqual(out.added.sort(), ['Hello', 'publish'])
  assert.equal(carriesLook(out.added), false, 'words alone: nothing to judge, nothing to note')
  assert.equal(carriesLook(['<p style="color:#111">x</p>']), true)
})

test('review 4 (plausible): comments are stripped in a stylesheet or a <style>, never across markup; unclosed dark blocks stay bounded', () => {
  const pins = rolePins(['<a href="/docs/*">x</a><p style="color:#d65c2c">y</p><a href="*/">z</a>'], {
    ruler: ORANGE,
    worn: false
  })
  assert.deepEqual(
    pins.map((p) => p.use),
    ['color: var(--ds-c-accent, #d65c2c)'],
    'an address with /* hides nothing'
  )
  const css = '.dark .q{color:var(--ds-c-fg, #eeeeee);'.repeat(8000)
  const t0 = Date.now()
  templateRolesOf(css)
  assert.ok(Date.now() - t0 < 2000, `${Date.now() - t0} ms for 8,000 unclosed dark openers`)
})

// ── review of #1513 (21/10/2026): a role read is judged by its fallback; an unknown template value is said ──

/** A worn system (blue accent, 2px button corners), as the slot read gives it: resolved colours and every value as written. */
const BLUE = {
  vars: ['--ds-c-accent', '--ds-c-fg', '--ds-btn-radius', '--ds-font-body'],
  tokens: { '--ds-c-accent': '#2563eb', '--ds-c-fg': '#111111' },
  values: {
    '--ds-c-accent': '#2563eb',
    '--ds-c-fg': '#111111',
    '--ds-btn-radius': '2px',
    '--ds-font-body': 'Manrope'
  }
}

test('🔒 a role read with no fallback, or with the worn system’s value as one, is named with the template’s value — WordPress and Joomla writes alike', () => {
  const worn = rolePins(
    [
      '.promo a { background: var(--ds-c-accent); border-radius: var(--ds-btn-radius, 2px); color: var(--ds-c-fg, #111) }',
      '<!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link" style="font-family:var(--ds-font-body)">Go</a></div><!-- /wp:button -->'
    ],
    { ruler: BLUE, template: ORANGE, worn: true }
  )
  assert.deepEqual(
    worn.map((p) => p.use),
    [
      'background: var(--ds-c-accent, #da5a2a)',
      'border-radius: var(--ds-btn-radius, 8px)',
      'color: var(--ds-c-fg, #1d1d1f)',
      'font-family: var(--ds-font-body, "Inter", sans-serif)'
    ]
  )
  assert.match(
    worn[0].why,
    /has no fallback: it paints nothing wherever no design system sets it, so taking this one off leaves it empty/
  )
  assert.match(worn[1].why, /the fallback of --ds-btn-radius is the worn system's value, not the template's/)
  const next = rolePinsNext(worn, true)
  assert.match(
    next,
    /^This write read 4 design-system roles without the template's own value as the fallback/
  )
  assert.match(next, /taking the system off would leave them empty or in the system's look/)
  assert.doesNotMatch(next, /as a literal/, 'no literal was typed')
  // the template's value, or a fallback of the agent's own that is not the worn one: passes
  assert.deepEqual(
    rolePins(['.x { background: var(--ds-c-accent, #da5a2a); border-radius: var(--ds-btn-radius, 4px) }'], {
      ruler: BLUE,
      template: ORANGE,
      worn: true
    }),
    []
  )
  // wearing nothing: no fallback paints nothing now; any fallback is today's look and stands
  const bare = rolePins(['.x { color: var(--ds-c-fg); background: var(--ds-c-accent, #123456) }'], {
    ruler: ORANGE,
    worn: false
  })
  assert.deepEqual(
    bare.map((p) => p.use),
    ['color: var(--ds-c-fg, #1d1d1f)']
  )
  assert.match(rolePinsNext(bare, false), /with no system worn, it paints nothing/)
  // a literal and a read in one write: each said in its own sentence
  const both = rolePinsNext(
    rolePins(['.x { color: #da5a2a; background: var(--ds-c-accent) }'], { ruler: ORANGE, worn: false }),
    false
  )
  assert.match(both, /^This write typed a value as a literal .* This write read a design-system role without/)
})

test('🔒 a stylesheet a bash command or file tool edits: the read it added is named, the template’s older reads are not', () => {
  const old = '.btn{background:var(--ds-c-accent)}'
  const pins = newRolePins([old], [`${old}.cta{color:var(--ds-c-fg)}`], { ruler: ORANGE, worn: false })
  assert.deepEqual(
    pins.map((p) => p.use),
    ['color: var(--ds-c-fg, #1d1d1f)']
  )
})

test('🔒 worn, the template’s own value not known: the replacement says so, never the worn literal it copied', () => {
  const pins = rolePins(['.promo a { background: #2563eb; color: var(--ds-c-fg) }'], {
    ruler: BLUE,
    template: null,
    worn: true
  })
  assert.deepEqual(
    pins.map((p) => p.use),
    [
      "background: var(--ds-c-accent, <the template's value>)",
      "color: var(--ds-c-fg, <the template's value>)"
    ]
  )
  assert.match(pins[0].why, /for --ds-c-accent is not known here: take it from the template's stylesheet/)
  assert.match(pins[1].why, /not known here: take it from the template's stylesheet/)
})

test('🔒 throughRoles (look.set, nothing worn): a literal on one role is written as that role with the literal as fallback; two roles, no role, a var() are left as asked (turn latency, 26/10/2026)', () => {
  const one = throughRoles(
    [
      ['color', '#d65c2c'],
      ['padding', '12px'],
      ['background-color', 'var(--brand)']
    ],
    { ruler: ORANGE }
  )
  assert.deepEqual(one.props, [
    ['color', 'var(--ds-c-accent, #d65c2c)'],
    ['padding', '12px'],
    ['background-color', 'var(--brand)']
  ])
  assert.deepEqual(one.through, [{ prop: 'color', value: '#d65c2c', use: 'var(--ds-c-accent, #d65c2c)' }])
  // two roles share the value: which one the element plays is the template's, never a guess
  const two = throughRoles([['color', '#14171a']], { ruler: ROLES })
  assert.deepEqual(two.props, [['color', '#14171a']])
  assert.deepEqual(two.through, [])
  // a colour far from every role is given none
  assert.deepEqual(throughRoles([['color', '#ff0000']], { ruler: ORANGE }).through, [])
  // a button's corner by the selector the call named
  assert.deepEqual(throughRoles([['border-radius', '20px']], { ruler: ORANGE, selector: 'a.btn' }).props, [
    ['border-radius', 'var(--ds-btn-radius, 20px)']
  ])
})
