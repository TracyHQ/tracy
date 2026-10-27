// The Forms plugin (npm @emdash-cms/plugin-forms) prints three words of its own — its honeypot
// label "Leave blank" and, when a form has no step labels, "Previous" / "Next" — in English on
// every locale (g60 build, 11/10/2026, LANG-2). Every template renders the plugin through
// `FormWords.astro`, which puts them in the page's language. Same file in every Tracy EmDash
// template and in the kit.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { FORM_WORDS, formWordsFor, localizeFormEmbed } from '../src/lib/form-embed-words.ts'

const PLUGIN_HTML = `<form class="ec-form"><div class="ec-form-field" style="position:absolute;left:-9999px;" aria-hidden="true">
<label for="f1-_hp">Leave blank</label><input type="text" id="f1-_hp" name="_hp"></div>
<div class="ec-form-nav"><button type="button" class="ec-form-prev" data-ec-prev hidden>
			Previous
		</button><button type="button" class="ec-form-next" data-ec-next hidden>
			Next
		</button><button type="submit" class="ec-form-submit">Gửi yêu cầu</button></div></form>`

test('the plugin’s own fallbacks are printed in the page’s language', () => {
  const vi = formWordsFor('vi-VN')
  const html = localizeFormEmbed(PLUGIN_HTML, vi)
  assert.doesNotMatch(html, />\s*(Leave blank|Previous|Next)\s*</)
  assert.match(html, new RegExp(`>${vi.leaveBlank}</label>`))
  assert.match(html, new RegExp(`data-ec-prev hidden>${vi.previous}</button>`))
  assert.match(html, new RegExp(`data-ec-next hidden>${vi.next}</button>`))
  assert.match(html, /Gửi yêu cầu/, 'the form’s own words stay')
})

test('step labels the form sets itself are kept', () => {
  const own = PLUGIN_HTML.replace(/\s*Previous\s*/, 'Quay lại').replace(/\s*Next\s*(?=<)/, 'Tiếp tục')
  const html = localizeFormEmbed(own, formWordsFor('vi'))
  assert.match(html, />Quay lại</)
  assert.match(html, />Tiếp tục</)
})

test('a tag finds its words: exact tag, then its language, then English', () => {
  assert.equal(formWordsFor('zh-TW'), FORM_WORDS['zh-tw'])
  assert.equal(formWordsFor('de-AT'), FORM_WORDS.de)
  assert.equal(formWordsFor('xx'), FORM_WORDS.en)
  assert.equal(formWordsFor(undefined), FORM_WORDS.en)
  for (const [tag, w] of Object.entries(FORM_WORDS)) {
    for (const k of ['leaveBlank', 'previous', 'next']) assert.ok(w[k], `${tag}.${k}`)
    if (tag !== 'en') assert.notEqual(w.leaveBlank, FORM_WORDS.en.leaveBlank, tag)
  }
})

/** Every .astro file under a directory. */
const astroFiles = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() ? astroFiles(p) : p.endsWith('.astro') ? [p] : []
  })

test('every place that renders the plugin form goes through FormWords', () => {
  const src = new URL('../src/', import.meta.url).pathname
  const users = astroFiles(src).filter((f) => /<FormEmbed\b/.test(readFileSync(f, 'utf8')))
  for (const f of users) {
    const text = readFileSync(f, 'utf8')
    const embeds = text.match(/<FormEmbed\b/g).length
    const wrapped = (text.match(/<FormWords tag=\{[^}]+\}>\s*<FormEmbed\b/g) ?? []).length
    assert.equal(wrapped, embeds, path.relative(src, f))
  }
})
