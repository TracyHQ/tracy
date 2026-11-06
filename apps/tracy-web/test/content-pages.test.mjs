// `localeOfLink` (src/sites/content-pages.js): which language a pasted link names, so view=pages walks one
// language instead of all of them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localeOfLink, oneLanguageOf, walkListing } from '../src/sites/content-pages.js'

const locales = ['en', 'es', 'de', 'pt-br', 'zh']

test('a language prefix names the language; no prefix is the default language', () => {
  const site = 'https://gf1410.tracy.site'
  assert.equal(localeOfLink('https://gf1410.tracy.site/es/investors', locales, 'en', site), 'es')
  assert.equal(localeOfLink('gf1410.tracy.site/de/', locales, 'en', site), 'de')
  assert.equal(localeOfLink('/pt-BR/about', locales, 'en', site), 'pt-br')
  assert.equal(localeOfLink('/about-us', locales, 'en', site), 'en')
  assert.equal(localeOfLink('/', locales, 'en', site), 'en')
})

test('a prefix that is a region-less form of a full tag still names it; anything unsure names none', () => {
  // Joomla's SEF prefix is the short code; its locales are full tags.
  assert.equal(localeOfLink('/ru/projects', ['en-GB', 'ru-RU'], 'en-GB', null), 'ru-RU')
  // Two tags share the short code: unsure, so no filter (the caller walks every language).
  assert.equal(localeOfLink('/pt/x', ['pt-BR', 'pt-PT'], 'en', null), null)
  // No locale list, or no default for an unprefixed link: no filter.
  assert.equal(localeOfLink('/es/x', [], null, null), null)
  assert.equal(localeOfLink('/about', ['en', 'es'], null, null), null)
})

// `walkListing` with `oneLanguage` (src/sites/content-pages.js `oneLanguageOf`): a site in many languages
// asked for its pages with neither a language nor a link is walked in its default language. Measured on dev
// 04/11/2026 (EmDash Business, 40 languages): every language 53.9 s and cut short, English alone 3.1 s whole.
{
  /** A fake listing door: `rows` per language, two rows a call, the cursor the row offset. */
  const door = (site, rows) => {
    const calls = []
    const ask = async (params) => {
      calls.push(params)
      const all = params.locale === undefined ? Object.values(rows).flat() : (rows[params.locale] ?? [])
      const at = Number(params.cursor ?? 0)
      const contents = all.slice(at, at + 2)
      const next = at + 2 < all.length ? String(at + 2) : null
      return { schemaVersion: 'tracy-content/v1', site, contents, pagination: { nextCursor: next } }
    }
    return { ask, calls }
  }
  const row = (id, locale) => ({ id, locale, url: `https://x.tracy.site/${locale}/${id}` })
  const forty = Array.from({ length: 40 }, (_, i) => (i === 0 ? 'en' : `l${i}`))

  test('a site in more than eight languages is walked in its default one, and the walk says which', async () => {
    const site = { id: 's', url: 'https://x.tracy.site', defaultLocale: 'en', locales: forty }
    const { ask, calls } = door(site, {
      en: [row('a', 'en'), row('b', 'en'), row('c', 'en')],
      l1: [row('d', 'l1')]
    })
    const walk = await walkListing(ask, {}, { oneLanguage: true })
    assert.equal(walk.locale, 'en')
    assert.equal(walk.truncated, false)
    assert.deepEqual(
      walk.listings.flatMap((l) => l.contents.map((c) => c.id)),
      ['a', 'b', 'c']
    )
    assert.deepEqual(
      calls.map((c) => c.locale ?? null),
      [null, 'en', 'en'],
      'one listing call of every language names them, then the default language alone'
    )
  })

  test('a site in few languages, one that fits in one call, a named language, or no option: every language, as before', async () => {
    const few = { id: 's', url: 'https://x.tracy.site', defaultLocale: 'en', locales: ['en', 'vi'] }
    const many = { id: 's', url: 'https://x.tracy.site', defaultLocale: 'en', locales: forty }
    const rows = { en: [row('a', 'en'), row('b', 'en')], vi: [row('c', 'vi')] }
    for (const [label, site, filter, options, rowsOf] of [
      ['two languages', few, {}, { oneLanguage: true }, rows],
      ['fits in one call', many, {}, { oneLanguage: true }, { en: [row('a', 'en')], l1: [row('b', 'l1')] }],
      ['a language named', many, { locale: 'vi' }, { oneLanguage: true }, rows],
      ['no option (a link)', many, {}, {}, rows]
    ]) {
      const { ask } = door(site, rowsOf)
      const walk = await walkListing(ask, filter, options)
      assert.equal(walk.locale, undefined, label)
    }
    assert.equal(
      oneLanguageOf({ defaultLocale: 'xx', locales: forty }),
      null,
      'a default the site does not list'
    )
    assert.equal(
      oneLanguageOf({ defaultLocale: 'en', locales: forty.slice(0, 8) }),
      null,
      'eight is not many'
    )
    assert.equal(oneLanguageOf({ defaultLocale: 'en', locales: forty.slice(0, 9) }), 'en')
  })
}
