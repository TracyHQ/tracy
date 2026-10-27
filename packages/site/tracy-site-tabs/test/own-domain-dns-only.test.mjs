// The footer of the Own domain card tells a Cloudflare customer to keep the CNAME DNS only.
// A proxied (orange cloud) CNAME leaves the Cloudflare for SaaS hostname at "Pending (Error)".
// The CNAME row label itself stays the short origin/develop wording.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

const source = read('packages/site/tracy-site-tabs/src/client/strings.ts')
/** The English value of a key: single- or double-quoted, on the key's line or the next one. */
const english = (key) => {
  const m = source.match(
    new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`)
  )
  return m?.[1] ?? m?.[2]
}

/** Language → the words that name the grey cloud in that language (the DNS only hint). */
const GREY = {
  vi: 'mây xám',
  de: 'graue Wolke',
  it: 'nuvola grigia',
  fr: 'nuage gris',
  nl: 'grijze wolk',
  zh: '灰色云朵',
  es: 'nube gris'
}
const ROUTING = {
  vi: 'Trỏ domain về site này',
  de: 'Leitet die Domain auf diese Site',
  it: 'Indirizza il domain a questo site',
  fr: 'Dirige le domain vers ce site',
  nl: 'Verwijst het domain naar deze site',
  zh: '将 domain 指向此 site',
  es: 'Dirige el domain a este site'
}
const FOOTER = ['domains.checkedAt', 'domains.dnsOnly', 'domains.bareName', 'domains.holdUntil']
const PLACEHOLDERS = {
  'domains.checkedAt': ['{when}'],
  'domains.dnsOnly': [],
  'domains.bareName': ['{bare}', '{domain}'],
  'domains.holdUntil': ['{when}']
}
const dir = (lang) =>
  lang === 'vi' ? 'packages/locale/tracy-locale-vi/vi' : `packages/locale/tracy-locales/${lang}`
const dict = (lang) => JSON.parse(read(`${dir(lang)}/tracy-site-tabs.json`))

test('English: the footer carries the DNS only hint with its placeholders; no record row carries it', () => {
  const dnsOnly = english('domains.dnsOnly')
  for (const word of [/Cloudflare/, /CNAME/, /DNS only/, /grey cloud/]) assert.match(dnsOnly, word)
  for (const key of FOOTER) {
    assert.ok(english(key), key)
    assert.deepEqual(english(key).match(/\{\w+\}/g) ?? [], PLACEHOLDERS[key], key)
  }
  for (const key of ['domains.record.routing', 'domains.record.ownership', 'domains.record.validation']) {
    const text = english(key)
    assert.ok(text, key)
    assert.doesNotMatch(text, /DNS only|Cloudflare/, key)
  }
})

for (const [lang, grey] of Object.entries(GREY)) {
  test(`${lang}: routing label restored, the footer carries the hint and keeps placeholders and kept terms`, () => {
    const d = dict(lang)
    assert.equal(d['domains.record.routing'], ROUTING[lang])
    assert.match(d['domains.dnsOnly'], /Cloudflare/)
    assert.match(d['domains.dnsOnly'], /CNAME/)
    assert.match(d['domains.dnsOnly'], /DNS only/)
    assert.ok(d['domains.dnsOnly'].includes(grey), `${lang}: ${d['domains.dnsOnly']}`)
    for (const key of FOOTER) {
      assert.ok(d[key], `${lang} ${key}`)
      assert.deepEqual(d[key].match(/\{\w+\}/g) ?? [], PLACEHOLDERS[key], `${lang} ${key}`)
    }
  })
}
