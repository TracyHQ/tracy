/**
 * `wp-tracy-business` site identity: the header and footer template parts carry tokens, and
 * `inc/identity.php` replaces them from ONE option on the way out (spec
 * `tasks/spec-danh-tinh-site-wordpress.md`).
 *
 * Two halves. The parts are checked as files: no demo brand literal may remain (a literal is
 * something a customer reads on every page and no seed can change), and every one of the fourteen
 * tokens must be carried at least once. The renderer is PHP, so it runs under a bare `php` —
 * local when the host has one, else `php:8.3-cli-alpine` out of docker, the same fallback and
 * reasons as `packages/cms/tracy-joomla-quickstart/test/identity-plugin.test.mjs`; with neither
 * the PHP tests skip and say why, never pass silently.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const OVERLAY = new URL('../overlays/wp-tracy-business/', import.meta.url)
const SOURCE = readFileSync(new URL('inc/identity.php', OVERLAY), 'utf8')
const HEADER = readFileSync(new URL('parts/header.html', OVERLAY), 'utf8')
const FOOTER = readFileSync(new URL('parts/footer.html', OVERLAY), 'utf8')
/**
 * The header without its mega menu: that block lists demo PROJECTS ("Vorsino IP, phase 3") and
 * pages, content the seeder rewrites, not identity — the identity scan reads around it.
 */
const HEADER_CHROME = HEADER.replace(
  /<!-- wp:wp-tracy-business\/mega-menu[\s\S]*?<!-- \/wp:wp-tracy-business\/mega-menu -->/,
  ''
)
const PHP_IMAGE = 'php:8.3-cli-alpine'

/** The closed token list, as the spec §5 and the Claude Cowork plugin's `IdentityTokens::NAMES` state it. */
const TOKENS = [
  'site.name',
  'site.legalName',
  'site.slogan',
  'site.monogram',
  'contact.email',
  'contact.phone',
  'contact.tel',
  'contact.address',
  'contact.hours',
  'social.facebook',
  'social.instagram',
  'social.linkedin',
  'social.tiktok',
  'social.youtube'
]

/** What the demo company left on the parts before the tokens (spec §1). */
const DEMO_LITERALS = [
  'Northgate',
  'northgate-ind.ru',
  '550-67-89',
  '+78005506789',
  'Vorsino',
  'MSK',
  'INN ',
  'OGRN'
]

const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP) php = startPhp({ image: PHP_IMAGE })
})
after(() => php?.stop())

/** Runs one PHP snippet with identity.php loaded (WordPress stubbed), and returns its JSON answer. */
const run = (snippet) => {
  const code =
    `define('ABSPATH', '/'); function add_action() {} function add_filter() {}` +
    ` eval('?>' . getenv('TRACY_IDENTITY_SRC')); ${snippet}`
  const [out] = php.run([{ args: ['-r', code], env: { TRACY_IDENTITY_SRC: SOURCE } }])
  assert.equal(out.status, 0, `php failed: ${out.stderr}\n${out.stdout}`)
  return JSON.parse(out.stdout)
}

/** A JSON value as a PHP expression. */
const asPhp = (value) => `json_decode(${JSON.stringify(JSON.stringify(value))}, true)`

const render = (html, vars, base = '/') =>
  run(`echo json_encode(wp_tracy_business_identity_render(${asPhp(html)}, ${asPhp(vars)}, ${asPhp(base)}));`)
const varsOf = (option) => run(`echo json_encode(wp_tracy_business_identity_vars_of(${asPhp(option)}));`)

// --- the parts as files -------------------------------------------------------------------------

test('the header and footer carry no demo identity literal', () => {
  for (const [name, part] of [
    ['header', HEADER_CHROME],
    ['footer', FOOTER]
  ]) {
    for (const literal of DEMO_LITERALS) {
      assert.ok(!part.includes(literal), `${name}.html still carries "${literal}"`)
    }
    // The monogram mark: a token, never the demo initials.
    for (const mark of part.match(/class="tracy-brand__mark[^"]*"[^>]*>([^<]*)</g) ?? []) {
      assert.ok(mark.endsWith('>{site.monogram}<'), `${name}.html mark is not the token: ${mark}`)
    }
  }
})

test('every one of the fourteen tokens is carried by the header or the footer', () => {
  const both = HEADER + FOOTER
  for (const name of TOKENS) {
    assert.ok(both.includes(`{${name}}`), `{${name}} appears in neither part`)
  }
  // And nothing outside the closed list is written as a token.
  const unknown = [...both.matchAll(/\{([a-zA-Z]+\.[a-zA-Z]+)\}/g)]
    .map((m) => m[1])
    .filter((n) => !TOKENS.includes(n))
  assert.deepEqual(unknown, [])
})

test('contact links dial and mail the identity; social buttons hide themselves by field', () => {
  assert.ok(HEADER.includes('href="tel:{contact.tel}"') && FOOTER.includes('href="tel:{contact.tel}"'))
  assert.ok(
    HEADER.includes('href="mailto:{contact.email}"') && FOOTER.includes('href="mailto:{contact.email}"')
  )
  for (const net of ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube']) {
    assert.ok(
      FOOTER.includes(`href="{social.${net}}" rel="noopener" data-tracy-identity="social.${net}"`),
      net
    )
  }
  assert.ok(HEADER.includes('data-tracy-identity="site.logo"'), 'the header logo element')
  assert.ok(HEADER.includes('data-tracy-identity="site.logoDark"'), 'the dark-header logo element')
  assert.ok(!HEADER.includes('wp:site-logo'), 'the site-logo block is gone: one source for the logo')
})

test('the renderer is loaded by inc/extra.php, the one overlay file functions.php pulls in', () => {
  const extra = readFileSync(new URL('inc/extra.php', OVERLAY), 'utf8')
  assert.match(extra, /require __DIR__ \. '\/identity\.php';/)
})

// --- the renderer, under real PHP -----------------------------------------------------------------

test('inc/identity.php parses (php -l)', { skip: PHP_SKIP }, () => {
  const [out] = php.run([{ args: ['-l'], input: SOURCE }])
  assert.equal(out.status, 0, out.stdout + out.stderr)
})

test('a token in text is the customer value, escaped as text', { skip: PHP_SKIP }, () => {
  assert.equal(
    render('<p>{site.name} &amp; {site.slogan}</p>', {
      'site.name': 'Công ty <Ánh> Dương',
      'site.slogan': 'a "b"'
    }),
    '<p>Công ty &lt;Ánh&gt; Dương &amp; a &quot;b&quot;</p>'
  )
})

test('a token in an attribute is escaped as an attribute; mailto and tel keep their scheme', {
  skip: PHP_SKIP
}, () => {
  const html =
    '<p data-tracy-identity="contact.phone">Hotline: <a href="tel:{contact.tel}" title="{site.name}">{contact.phone}</a></p>' +
    '<a href="mailto:{contact.email}">{contact.email}</a>'
  assert.equal(
    render(html, {
      'site.name': 'A "quoted" name',
      'contact.phone': '(028) 5555 0135',
      'contact.tel': '+842855550135',
      'contact.email': 'hello@example.com'
    }),
    '<p data-tracy-identity="contact.phone">Hotline: <a href="tel:+842855550135" title="A &quot;quoted&quot; name">(028) 5555 0135</a></p>' +
      '<a href="mailto:hello@example.com">hello@example.com</a>'
  )
})

test('a missing field renders empty, never a demo value; an unknown token stays', { skip: PHP_SKIP }, () => {
  assert.equal(
    render('<p>{site.name}|{site.legalName}|{foo.bar}</p>', { 'site.name': 'X' }),
    '<p>X||{foo.bar}</p>'
  )
  assert.equal(render('<p>{site.name}</p>', {}), '<p></p>')
})

test('an element carrying data-tracy-identity is dropped when its field is empty', { skip: PHP_SKIP }, () => {
  const html =
    '<div class="wp-block-buttons tracy-footer__social">\n' +
    '<div class="wp-block-button is-style-outline"><a class="x" href="{social.facebook}" rel="noopener" data-tracy-identity="social.facebook">Facebook</a></div>\n' +
    '<div class="wp-block-button is-style-outline"><a class="x" href="{social.tiktok}" rel="noopener" data-tracy-identity="social.tiktok">TikTok</a></div>\n' +
    '</div>' +
    '<p class="tracy-footer__line" data-tracy-identity="contact.hours">{contact.hours}</p>' +
    '<p class="tracy-footer__text"><span data-tracy-identity="site.legalName">{site.legalName}. </span>{site.slogan}</p>'
  assert.equal(
    render(html, { 'social.facebook': 'https://facebook.com/anhduong', 'site.slogan': 'Builds that last' }),
    '<div class="wp-block-buttons tracy-footer__social">\n' +
      '<div class="wp-block-button is-style-outline"><a class="x" href="https://facebook.com/anhduong" rel="noopener" data-tracy-identity="social.facebook">Facebook</a></div>\n' +
      '\n' +
      '</div>' +
      '<p class="tracy-footer__text">Builds that last</p>'
  )
  // Every button gone: the row goes with it.
  assert.equal(
    render(
      '<div class="wp-block-buttons a">\n<div class="wp-block-button b"><a href="{social.youtube}" data-tracy-identity="social.youtube">YouTube</a></div>\n</div>',
      {}
    ),
    ''
  )
})

test('the Contact card goes when every one of its rows went', { skip: PHP_SKIP }, () => {
  const row = (f) =>
    `<div class="wp-block-group wtb-contact__row" data-tracy-identity="${f}"><p class="wtb-contact__value">{${f}}</p></div>\n`
  const card =
    '<div class="wp-block-group wtb-contact__copy"><h1>Contact</h1></div>' +
    '<div class="wp-block-group wtb-contact__card is-layout-flow wp-block-group-is-layout-flow">\n' +
    ['contact.address', 'contact.phone', 'contact.email', 'contact.hours'].map(row).join('') +
    '</div>'
  assert.equal(render(card, {}), '<div class="wp-block-group wtb-contact__copy"><h1>Contact</h1></div>')
  assert.match(render(card, { 'contact.email': 'a@b.example' }), /wtb-contact__card[\s\S]*a@b\.example/)
})

test('a social href takes only an https address; javascript: and bare words are dropped', {
  skip: PHP_SKIP
}, () => {
  const html = '<a href="{social.linkedin}" data-tracy-identity="social.linkedin">{social.linkedin}</a>'
  assert.equal(
    render(html, { 'social.linkedin': 'javascript:alert(1)' }),
    '<a href="" data-tracy-identity="social.linkedin">javascript:alert(1)</a>'
  )
  assert.equal(
    render(html, { 'social.linkedin': 'https://www.linkedin.com/company/anh-duong' }),
    '<a href="https://www.linkedin.com/company/anh-duong" data-tracy-identity="social.linkedin">https://www.linkedin.com/company/anh-duong</a>'
  )
})

test('the logo img takes its src from the option as a site-relative URL, or is hidden', {
  skip: PHP_SKIP
}, () => {
  const html =
    '<img class="tracy-logo" src="" alt="{site.name}" data-tracy-identity="site.logo"><p class="tracy-brand__mark">{site.monogram}</p>'
  assert.equal(
    render(html, {
      'site.name': 'Ánh Dương',
      'site.monogram': 'AD',
      'site.logo': 'wp-content/uploads/tracy-content/abc.png'
    }),
    '<img class="tracy-logo" src="/wp-content/uploads/tracy-content/abc.png" alt="Ánh Dương" data-tracy-identity="site.logo"><p class="tracy-brand__mark">AD</p>'
  )
  assert.equal(
    render(
      html,
      { 'site.name': 'Ánh Dương', 'site.monogram': 'AD', 'site.logo': '/wp-content/uploads/x.png' },
      '/blog/'
    ),
    '<img class="tracy-logo" src="/blog/wp-content/uploads/x.png" alt="Ánh Dương" data-tracy-identity="site.logo"><p class="tracy-brand__mark">AD</p>'
  )
  assert.equal(
    render(html, { 'site.name': 'Ánh Dương', 'site.monogram': 'AD' }),
    '<img hidden class="tracy-logo" src="" alt="Ánh Dương" data-tracy-identity="site.logo"><p class="tracy-brand__mark">AD</p>'
  )
  // A logo pointing off-site is not a media path: no logo.
  assert.match(render(html, { 'site.logo': 'https://evil.example/x.png' }), /^<img hidden /)
})

test('the dark-header logo img takes site.logoDark the same way, or is hidden (1.1.6, T29)', {
  skip: PHP_SKIP
}, () => {
  const html = '<img class="tracy-logo-dark" src="" alt="{site.name}" data-tracy-identity="site.logoDark">'
  assert.equal(
    render(html, { 'site.name': 'Tamq', 'site.logoDark': 'wp-content/uploads/tracy-brand/logo-dark.png' }),
    '<img class="tracy-logo-dark" src="/wp-content/uploads/tracy-brand/logo-dark.png" alt="Tamq" data-tracy-identity="site.logoDark">'
  )
  assert.equal(
    render(html, { 'site.name': 'Tamq', 'site.logo': 'wp-content/uploads/light.png' }),
    '<img hidden class="tracy-logo-dark" src="" alt="Tamq" data-tracy-identity="site.logoDark">',
    'the light logo never stands in for the dark one'
  )
})

test('inside a script a token is a JSON string; inside a textarea nothing is touched', {
  skip: PHP_SKIP
}, () => {
  assert.equal(
    render('<script>{"name":"{site.name}"}</script><textarea>{site.name}</textarea><b>{site.name}</b>', {
      'site.name': 'A "B" </script>'
    }),
    '<script>{"name":"A \\"B\\" \\u003C/script\\u003E"}</script><textarea>{site.name}</textarea><b>A &quot;B&quot; &lt;/script&gt;</b>'
  )
})

test('the option is read nested or flat, only the closed list comes out, and tel derives from phone', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(
    varsOf({
      name: ' Công ty Ánh Dương ',
      legalName: '',
      monogram: 'AD',
      logo: 'wp-content/uploads/l.png',
      contact: { email: 'hi@example.com', phone: '+84 (28) 5555-0135', extra: 'x' },
      'social.youtube': 'https://youtube.com/@anhduong',
      other: 'ignored'
    }),
    {
      'site.name': 'Công ty Ánh Dương',
      'site.monogram': 'AD',
      'site.logo': 'wp-content/uploads/l.png',
      'contact.email': 'hi@example.com',
      'contact.phone': '+84 (28) 5555-0135',
      'contact.tel': '+842855550135',
      'social.youtube': 'https://youtube.com/@anhduong'
    }
  )
  // A tel the option holds wins, cleaned to digits and one leading plus.
  assert.equal(varsOf({ contact: { phone: '1', tel: ' +84 2 8+ ' } })['contact.tel'], '+8428')
  // PHP prints an empty array as `[]`: no variable at all is what counts.
  assert.equal(Object.keys(varsOf(false)).length, 0)
  assert.equal(Object.keys(varsOf('not an array')).length, 0)
})

test('the real header and footer render a full identity with no token left, and an empty one with no demo text', {
  skip: PHP_SKIP
}, () => {
  const identity = {
    'site.name': 'Công ty Ánh Dương',
    'site.legalName': 'Công ty TNHH Ánh Dương',
    'site.slogan': 'Nhà thầu xây dựng nhà xưởng',
    'site.monogram': 'AD',
    'contact.email': 'hello@example.com',
    'contact.phone': '(028) 5555 0135',
    'contact.tel': '+842855550135',
    'contact.address': '12 Đại lộ Bình Dương, Thuận An',
    'contact.hours': 'Mon–Sat, 8:00–17:30',
    'social.facebook': 'https://facebook.com/anhduong',
    'social.youtube': 'https://youtube.com/@anhduong'
  }
  const full = render(HEADER + FOOTER, identity)
  assert.doesNotMatch(full, /\{(site|contact|social)\.[a-zA-Z]+\}/, 'a token survived')
  assert.ok(full.includes('href="tel:+842855550135">(028) 5555 0135<'))
  assert.ok(full.includes('href="mailto:hello@example.com">hello@example.com<'))
  assert.ok(full.includes('>AD</p>'))
  assert.ok(full.includes('©&nbsp;Công ty TNHH Ánh Dương'))
  assert.ok(full.includes('Công ty TNHH Ánh Dương. </span>Nhà thầu xây dựng nhà xưởng'))
  assert.ok(
    full.includes('href="https://facebook.com/anhduong"') && !full.includes('LinkedIn'),
    'buttons without a field are gone'
  )

  const empty = render(HEADER_CHROME + FOOTER, {})
  assert.doesNotMatch(empty, /\{(site|contact|social)\.[a-zA-Z]+\}/)
  for (const literal of DEMO_LITERALS) assert.ok(!empty.includes(literal), literal)
  assert.ok(!empty.includes('Hotline'), 'the hotline line goes with its phone')
  assert.ok(!empty.includes('wp-block-button is-style-outline'), 'no social button without a field')
})

// ── Defaults from the site itself (13/10/2026: the release database carries no identity option) ─────────────────

const withDefaults = (vars, blogname, logo = '') =>
  run(
    `echo json_encode(wp_tracy_business_identity_with_defaults(${asPhp(vars)}, ${asPhp(blogname)}, ${asPhp(logo)}));`
  )
const initials = (name) => run(`echo json_encode(wp_tracy_business_identity_initials(${asPhp(name)}));`)

test('with no identity option the site title names the site and its initials are the mark', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(withDefaults({}, 'Ánh Dương'), { 'site.name': 'Ánh Dương', 'site.monogram': 'ÁD' })
  assert.deepEqual(Object.values(withDefaults({}, '  ')), [], 'no title, no mark: nothing invented')
  const html =
    '<img class="tracy-logo" src="" alt="{site.name}" data-tracy-identity="site.logo"><p class="tracy-brand__mark">{site.monogram}</p>'
  assert.equal(
    render(html, withDefaults({}, 'Ánh Dương')),
    '<img hidden class="tracy-logo" src="" alt="Ánh Dương" data-tracy-identity="site.logo"><p class="tracy-brand__mark">ÁD</p>'
  )
})

test('an explicit monogram, name or logo in the option beats the default', { skip: PHP_SKIP }, () => {
  assert.deepEqual(
    withDefaults(
      { 'site.name': 'Northwind Legal', 'site.monogram': 'NW' },
      'Other Title',
      'wp-content/uploads/x.png'
    ),
    { 'site.name': 'Northwind Legal', 'site.monogram': 'NW', 'site.logo': 'wp-content/uploads/x.png' }
  )
  assert.deepEqual(withDefaults({ 'site.logo': 'wp-content/uploads/own.png' }, 'T'), {
    'site.logo': 'wp-content/uploads/own.png',
    'site.name': 'T',
    'site.monogram': 'T'
  })
})

test('the uploaded site logo stands in for a missing identity logo', { skip: PHP_SKIP }, () => {
  const html =
    '<img class="tracy-logo" src="" alt="{site.name}" data-tracy-identity="site.logo"><p class="tracy-brand__mark">{site.monogram}</p>'
  assert.equal(
    render(html, withDefaults({}, 'Ánh Dương', 'wp-content/uploads/2026/10/logo.png')),
    '<img class="tracy-logo" src="/wp-content/uploads/2026/10/logo.png" alt="Ánh Dương" data-tracy-identity="site.logo"><p class="tracy-brand__mark">ÁD</p>'
  )
})

test('the mark follows the seeder’s initials rule: two words and the last, stop words skipped', {
  skip: PHP_SKIP
}, () => {
  assert.equal(initials('Northgate'), 'NO')
  assert.equal(initials('Ánh Dương'), 'ÁD', 'the first code point, accent and all, as the seeder does')
  assert.equal(initials('Công ty Ánh Dương'), 'ÁD')
  assert.equal(initials('Harbor Lane Dental Clinic'), 'HLC')
  assert.equal(initials('Smith & Sons'), 'SS')
})
