/**
 * `plg_system_tracyidentity` — the plugin every Tracy Joomla quickstart ships so a site's name,
 * contact and social links live in ONE module and every page reads them from there.
 *
 * Only the pure half (`Identity`) is tested here: reading the identity module into variables, and
 * replacing `{site.name}`-style tokens in a rendered page. The Joomla half (setting `sitename`,
 * hooking `onAfterRender`) needs a real Joomla and is accepted on a disposable site instead
 * (`tasks/todo-danh-tinh-site.md` B1).
 *
 * The CI runners do not all carry php, so php out of a container is the fallback — the same rule
 * and the same reasons as `packages/fleet/tracy-fleet-operation/test/joomla-contract-bind.test.mjs`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const SOURCE = readFileSync(
  new URL('../plugins/plg_system_tracyidentity/src/Identity.php', import.meta.url),
  'utf8'
)
const PHP_IMAGE = 'php:8.3-cli-alpine'

const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP) php = startPhp({ image: PHP_IMAGE })
})
after(() => php?.stop())

/** Runs one PHP snippet with `Identity` loaded, and returns its JSON answer. */
const run = (snippet) => {
  const code = `eval('?>' . getenv('TRACY_IDENTITY_SRC')); use Tracy\\Plugin\\System\\TracyIdentity\\Identity; ${snippet}`
  const [out] = php.run([{ args: ['-r', code], env: { TRACY_IDENTITY_SRC: SOURCE } }])
  assert.equal(out.status, 0, `php failed: ${out.stderr}`)
  return JSON.parse(out.stdout)
}

/** A JSON value as a PHP expression. */
const asPhp = (value) => `json_decode(${JSON.stringify(JSON.stringify(value))}, true)`

const render = (html, vars) => run(`echo json_encode(Identity::render(${asPhp(html)}, ${asPhp(vars)}));`)

test('a page naming the site by token shows the customer name', { skip: PHP_SKIP }, () => {
  assert.equal(
    render('<h2>Why {site.name}</h2>', { 'site.name': 'Ăn Hỏi Sarah' }),
    '<h2>Why Ăn Hỏi Sarah</h2>'
  )
})

test('a name carrying markup characters is shown as text, in content and in attributes', {
  skip: PHP_SKIP
}, () => {
  assert.equal(
    render('<a title="{site.name}">{site.name}</a>', { 'site.name': 'Smith & "Sons" <Co>' }),
    '<a title="Smith &amp; &quot;Sons&quot; &lt;Co&gt;">Smith &amp; &quot;Sons&quot; &lt;Co&gt;</a>'
  )
})

test('a known token with no value renders as nothing; anything else in braces is left alone', {
  skip: PHP_SKIP
}, () => {
  assert.equal(
    render('<p>[{social.tiktok}] {loadposition hero} {site.evil} {Site.Name}</p>', {}),
    '<p>[] {loadposition hero} {site.evil} {Site.Name}</p>'
  )
})

test('inside a script the value is escaped as a JSON string and cannot close the script', {
  skip: PHP_SKIP
}, () => {
  const name = 'Smith & "Sons" </script> Ăn Hỏi'
  const page = render(
    '<title>{site.name}</title><script type="application/ld+json">{"name":"{site.name}"}</script>',
    { 'site.name': name }
  )
  assert.equal(
    page,
    '<title>Smith &amp; &quot;Sons&quot; &lt;/script&gt; Ăn Hỏi</title>' +
      '<script type="application/ld+json">{"name":"Smith & \\"Sons\\" \\u003C/script\\u003E Ăn Hỏi"}</script>'
  )
  const json = page.match(/<script[^>]*>(.*)<\/script>/)[1]
  assert.equal(JSON.parse(json).name, name)
})

/** Module params exactly as Joomla stores an ACM block: the block's config is a JSON string. */
const moduleParams = (fields) =>
  JSON.stringify({
    'jatools-config': JSON.stringify({
      ':type': 'tracy:site-identity',
      'site-identity': { ...fields, 'jatools-layout-site-identity': 'style-1' }
    }),
    'jatools-layout-site-identity': 'style-1',
    cache: 0
  })

const fromModuleParams = (params) => run(`echo json_encode(Identity::fromModuleParams(${asPhp(params)}));`)

test('the identity module is read into token variables', { skip: PHP_SKIP }, () => {
  assert.deepEqual(
    fromModuleParams(
      moduleParams({
        'site-name': 'Ăn Hỏi Sarah',
        'legal-name': '',
        slogan: 'Trọn gói lễ ăn hỏi',
        monogram: 'ĂHS',
        email: 'hello@example.com',
        phone: '+84 90 000 0000',
        address: '12 Lê Lợi, Huế',
        hours: 'Mon–Sat 8:00–18:00',
        facebook: 'https://facebook.com/example-cafe',
        instagram: '',
        linkedin: '',
        tiktok: 'https://tiktok.com/@example-cafe',
        youtube: ''
      })
    ),
    {
      'site.name': 'Ăn Hỏi Sarah',
      'site.legalName': '',
      'site.slogan': 'Trọn gói lễ ăn hỏi',
      'site.monogram': 'ĂHS',
      'contact.email': 'hello@example.com',
      'contact.phone': '+84 90 000 0000',
      'contact.address': '12 Lê Lợi, Huế',
      'contact.hours': 'Mon–Sat 8:00–18:00',
      'social.facebook': 'https://facebook.com/example-cafe',
      'social.instagram': '',
      'social.linkedin': '',
      'social.tiktok': 'https://tiktok.com/@example-cafe',
      'social.youtube': ''
    }
  )
})

test('params that are not an identity block read as no identity at all, not as an empty one', {
  skip: PHP_SKIP
}, () => {
  assert.equal(fromModuleParams(''), null)
  assert.equal(fromModuleParams('{not json'), null)
  assert.equal(fromModuleParams(JSON.stringify({ 'jatools-config': '{broken' })), null)
  assert.equal(
    fromModuleParams(
      JSON.stringify({
        'jatools-config': JSON.stringify({ ':type': 'tracy:contact-information', 'contact-information': {} })
      })
    ),
    null
  )
})

test('a token being edited in a form stays a token, so saving the form does not bake the name in', {
  skip: PHP_SKIP
}, () => {
  assert.equal(
    render('<h1>{site.name}</h1><textarea name="jform[articletext]"><p>Why {site.name}</p></textarea>', {
      'site.name': 'Sarah'
    }),
    '<h1>Sarah</h1><textarea name="jform[articletext]"><p>Why {site.name}</p></textarea>'
  )
})

test('every field of the site-identity block is a token the plugin knows, and the other way round', {
  skip: PHP_SKIP
}, () => {
  const schema = readFileSync(new URL('../acm/site-identity/tmpl/style-1.xml', import.meta.url), 'utf8')
  const fields = [...schema.matchAll(/<field name="([^"]+)"/g)].map((m) => m[1]).sort()
  assert.deepEqual(fields, run('echo json_encode(array_keys(Identity::FIELDS));').sort())
})

test('a layout can tell that a value is a token with nothing behind it, so it hides that card', {
  skip: PHP_SKIP
}, () => {
  const blank = (value, vars) =>
    run(`echo json_encode(Identity::isBlankToken(${asPhp(value)}, ${asPhp(vars)}));`)
  const vars = { 'social.facebook': 'https://facebook.com/sarah', 'social.tiktok': '' }
  assert.equal(blank('{social.tiktok}', vars), true)
  assert.equal(blank('{social.youtube}', vars), true)
  assert.equal(blank('{social.facebook}', vars), false)
  assert.equal(blank('https://t.me/sarah', vars), false)
  assert.equal(blank('{loadposition x}', vars), false)
  assert.equal(blank(' {social.tiktok} ', vars), true)
})

test('a phone link reads {contact.tel}: the customer phone reduced to what a tel: URL may carry', {
  skip: PHP_SKIP
}, () => {
  assert.equal(
    render('<a href="tel:{contact.tel}">{contact.phone}</a>', { 'contact.phone': '+84 (90) 000-0000' }),
    '<a href="tel:+84900000000">+84 (90) 000-0000</a>'
  )
  assert.equal(render('<a href="tel:{contact.tel}">x</a>', {}), '<a href="tel:">x</a>')
})

test('the derived phone link is blank exactly when the phone is', { skip: PHP_SKIP }, () => {
  const blank = (vars) => run(`echo json_encode(Identity::isBlankToken('{contact.tel}', ${asPhp(vars)}));`)
  assert.equal(blank({ 'contact.phone': '+84 90' }), false)
  assert.equal(blank({ 'contact.phone': '' }), true)
})

// L32 (05/10/2026, benchjoomlaapply01): a module the Claude Cowork plugin wrote into (`ContentSlots::htmlPatch`) is saved
// through PHP's `saveHTML`, and libxml2 2.9 (the Joomla site image's) percent-encodes the braces of every link it
// serialises: the Vietnamese top bar went out as `href="tel:%7Bcontact.tel%7D"` and `href="mailto:%7Bcontact.email%7D"`.
// A token is the same token however its braces were encoded, so the page still shows the customer's own values.
test('a token whose braces a link percent-encoded is filled like any other, in any letter case', {
  skip: PHP_SKIP
}, () => {
  const vars = { 'contact.phone': '0912 345 678', 'contact.email': 'hello@goldencrust.example' }
  assert.equal(
    render(
      '<ul><li><a href="tel:%7Bcontact.tel%7D">{contact.phone}</a></li>' +
        '<li><a href="mailto:%7Bcontact.email%7D">{contact.email}</a></li>' +
        '<li><a href="mailto:%7bcontact.email%7d">x</a></li></ul>',
      vars
    ),
    '<ul><li><a href="tel:0912345678">0912 345 678</a></li>' +
      '<li><a href="mailto:hello@goldencrust.example">hello@goldencrust.example</a></li>' +
      '<li><a href="mailto:hello@goldencrust.example">x</a></li></ul>'
  )
  // Encoded or not, a name outside the closed list is not a token, and a value the customer never gave is absent.
  assert.equal(
    render('<a href="%7Bsite.evil%7D">a</a><a href="%7Bsocial.tiktok%7D">b</a>', {}),
    '<a href="%7Bsite.evil%7D">a</a><a href="">b</a>'
  )
})

test('a layout tells a percent-encoded token with nothing behind it from one with a value', {
  skip: PHP_SKIP
}, () => {
  const blank = (value, vars) =>
    run(`echo json_encode(Identity::isBlankToken(${asPhp(value)}, ${asPhp(vars)}));`)
  const vars = { 'social.facebook': 'https://facebook.com/sarah', 'social.tiktok': '' }
  assert.equal(blank('%7Bsocial.tiktok%7D', vars), true)
  assert.equal(blank('%7bsocial.tiktok%7d', vars), true)
  assert.equal(blank('%7Bsocial.facebook%7D', vars), false)
  assert.equal(blank('%7Bloadposition%7D', vars), false)
})
