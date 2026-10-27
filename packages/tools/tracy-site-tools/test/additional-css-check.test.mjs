// 🔒 A WRITE INTO WORDPRESS'S ADDITIONAL CSS IS CHECKED ON THE PAGE BEFORE ANYONE CALLS IT DONE
// (TracyHQ/tch#1710, dev wp-tracy-ai, 25/10/2026): the agent saved a rule into the `custom_css` post
// through `content.update`, the receipt said "nothing to read back", and the home page — which printed
// no Additional CSS at all — never showed it.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ADDITIONAL_CSS_NOT_PRINTED,
  additionalCssSent,
  cssOnPage,
  withAdditionalCssCheck
} from '../src/host/additional-css-check.mjs'
import { WRITE_RECEIPT_NEXT } from '../src/host/site-call.mjs'

const CSS = '.saved-before { color: red; }\n\n.tracy-r7-2255 { outline: 0; }\n'
const typeOf = (/** @type {number} */ id) => (id === 7 ? 'custom_css' : id === 9 ? 'page' : null)

test('additionalCssSent: the CSS a WordPress write saves into a custom_css post — by the type read before, or named in the call', () => {
  const update = { kind: 'post', id: 7, fields: { post_content: CSS } }
  assert.equal(additionalCssSent('content.update', update, 'wordpress', { typeOf }), CSS)
  assert.equal(
    additionalCssSent(
      'content.update',
      { kind: 'post', id: 70, fields: { post_type: 'custom_css', post_content: CSS } },
      'wordpress'
    ),
    CSS
  )
  assert.equal(
    additionalCssSent(
      'content.batch',
      { items: [{ kind: 'post', id: 9, fields: { post_content: 'x' } }, update] },
      'wordpress',
      {
        typeOf
      }
    ),
    CSS
  )
  // not Additional CSS: another post, no content, another platform, a read
  assert.equal(
    additionalCssSent('content.update', { kind: 'post', id: 9, fields: { post_content: CSS } }, 'wordpress', {
      typeOf
    }),
    null
  )
  assert.equal(
    additionalCssSent('content.update', { kind: 'post', id: 7, fields: { post_title: 't' } }, 'wordpress', {
      typeOf
    }),
    null
  )
  assert.equal(additionalCssSent('content.update', update, 'joomla', { typeOf }), null)
  assert.equal(additionalCssSent('content.get', update, 'wordpress', { typeOf }), null)
})

/** A page head as WordPress 7.1.3 printed it on the stand (block theme `tracy`). */
const page = (/** @type {string} */ styles) =>
  `<!doctype html><html><head><style id="wp-img-auto-sizes-contain-inline-css">img{}</style>${styles}` +
  `<link rel='stylesheet' id='tracy-css' href='/wp-content/themes/tracy/assets/css/tracy.css' media='all' /></head>` +
  '<body><p>.tracy-r7-2255 { outline: 0; } is quoted in the text, not a style</p></body></html>'

test('cssOnPage: where the page prints Additional CSS, and whether it carries the last rule written', () => {
  // a block theme: inside global styles (a section page)
  assert.deepEqual(
    cssOnPage(
      page(
        `<style id="global-styles-inline-css">:root{--x:1}.saved-before{color:red}\n.tracy-r7-2255 {outline: 0;}</style>`
      ),
      CSS
    ),
    { place: 'global-styles', carried: true }
  )
  // its own sheet (a classic theme, or Tracy's design pages after the fix)
  assert.deepEqual(cssOnPage(page(`<style id="wp-custom-css">\n${CSS}</style>`), CSS), {
    place: 'wp-custom-css',
    carried: true
  })
  // 🔒 the artifact home page before the fix: neither sheet, the words in the body do not count
  assert.deepEqual(cssOnPage(page(''), CSS), { place: null, carried: false })
  // printed, but not this rule (an old page in a cache, or filtered on save)
  assert.deepEqual(cssOnPage(page(`<style id="wp-custom-css">.saved-before{color:red}</style>`), CSS), {
    place: 'wp-custom-css',
    carried: false
  })
  // inside @media, and spacing that differs
  assert.equal(
    cssOnPage(
      page(`<style id="wp-custom-css">@media (max-width:767.98px){header  >  .x{display:none}}</style>`),
      '@media (max-width: 767.98px) {\n  header > .x { display: none; }\n}\n/* end */'
    ).carried,
    true
  )
})

const ok = { ok: true, apply_id: 'a1', next: WRITE_RECEIPT_NEXT }

test('🔒 withAdditionalCssCheck: a page that does not print the rule turns the receipt into a warning — never "done"', async () => {
  /** @type {string[]} */
  const asked = []
  const out = /** @type {any} */ (
    await withAdditionalCssCheck({
      answer: ok,
      css: CSS,
      read: async (path) => {
        asked.push(path)
        return { ok: true, html: page('') }
      }
    })
  )
  assert.deepEqual(asked, ['/'])
  assert.equal(out.ok, true, 'never a refusal: the write landed')
  assert.equal(out.apply_id, 'a1')
  assert.equal(out.additionalCss, 'not printed')
  assert.equal(out.warnings.length, 1)
  assert.equal(out.warnings[0].code, ADDITIONAL_CSS_NOT_PRINTED)
  assert.match(out.warnings[0].message, /\/ prints none of the site's Additional CSS/)
  assert.doesNotMatch(out.next, /nothing to read back/)
  assert.match(out.next, /Do not tell the customer it is done/)
  assert.match(out.next, /page\.look/)
  assert.match(out.next, /apply\.revert/, 'the undo stays')
})

test('withAdditionalCssCheck: printed → the answer says so and keeps its receipt; not a CSS write or a refusal → untouched; an unread page is a fact', async () => {
  const printed = /** @type {any} */ (
    await withAdditionalCssCheck({
      answer: ok,
      css: CSS,
      read: async () => ({ ok: true, html: page(`<style id="wp-custom-css">${CSS}</style>`) })
    })
  )
  assert.equal(printed.additionalCss, 'printed')
  assert.equal(printed.next, WRITE_RECEIPT_NEXT)
  assert.equal(printed.warnings, undefined)
  const never = async () => {
    throw new Error('not read')
  }
  assert.equal(await withAdditionalCssCheck({ answer: ok, css: null, read: never }), ok)
  const refused = { ok: false, code: 'X' }
  assert.equal(await withAdditionalCssCheck({ answer: refused, css: CSS, read: never }), refused)
  const unread = /** @type {any} */ (
    await withAdditionalCssCheck({ answer: ok, css: CSS, read: async () => ({ ok: false, error: 'slow' }) })
  )
  assert.equal(unread.additionalCss, 'unchecked')
  assert.match(unread.next, /page\.look/, 'check it yourself before saying it shows')
  const thrown = /** @type {any} */ (await withAdditionalCssCheck({ answer: ok, css: CSS, read: never }))
  assert.equal(thrown.additionalCss, 'unchecked')
})
