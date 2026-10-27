import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { applyWordPress } from '../src/apply-wordpress.mjs'
import { AmbiguousLocaleError } from '../src/locales.mjs'
import { doorOps, wpCliOps } from '../src/site-ops.mjs'
import {
  WORDPRESS_LANGUAGE_CATALOG,
  WORDPRESS_SOURCE_LOCALE,
  isWordpressSourceLocale,
  normaliseWordpressLocale,
  polylangSlugsFor,
  supportedWordpressLocales,
  validateWordpressLanguageCatalog,
  wpLocaleFor
} from '../src/wordpress-language-catalog.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CATALOG = join(HERE, '../src/wordpress-language-packs.json')
const JOOMLA = join(HERE, '../../tracy-joomla-quickstart/language-packs.json')

test('every admitted tag maps to a WordPress locale, and the count matches the JSON', () => {
  const raw = JSON.parse(readFileSync(CATALOG, 'utf8'))
  const tags = supportedWordpressLocales()
  assert.equal(tags.length, Object.keys(raw.locales).length)
  for (const tag of tags) assert.match(wpLocaleFor(tag), /^[a-z]{2,3}(_[A-Za-z]{2,8})*$/)
})

test('the source locale is first, and it is the one WordPress installs with', () => {
  assert.equal(supportedWordpressLocales()[0], WORDPRESS_SOURCE_LOCALE)
  assert.equal(wpLocaleFor(WORDPRESS_SOURCE_LOCALE), 'en_US')
  assert.ok(isWordpressSourceLocale('en'))
  assert.ok(!isWordpressSourceLocale('en-gb'))
})

test('the admitted set is a subset of what Joomla admits, so one product offers one list', () => {
  const joomla = new Set(
    Object.keys(JSON.parse(readFileSync(JOOMLA, 'utf8')).packs).map((t) => t.toLowerCase())
  )
  // `en-us` is WordPress's built-in locale; Joomla offers it as its own option too.
  joomla.add('en-gb')
  for (const tag of supportedWordpressLocales())
    assert.ok(joomla.has(tag), `${tag} is offered for WordPress but not for Joomla`)
})

test('an unknown tag refuses, and names what is available', () => {
  assert.throws(() => wpLocaleFor('xx-yy'), /No WordPress locale is registered for xx-yy/)
  assert.throws(() => normaliseWordpressLocale('nonsense'), /is not a language tag/)
  assert.throws(() => normaliseWordpressLocale(''), /A language is required/)
})

test('a language Joomla has and WordPress does not refuses with the reason, not with "unknown"', () => {
  assert.throws(() => wpLocaleFor('ga-ie'), /WordPress cannot be built in ga-ie: .*Irish/)
  assert.throws(() => wpLocaleFor('sr-yu'), /WordPress cannot be built in sr-yu/)
})

test('zh-cn and zh-tw are different languages, and a bare zh is asked about', () => {
  assert.notEqual(wpLocaleFor('zh-cn'), wpLocaleFor('zh-tw'))
  assert.equal(wpLocaleFor('zh-cn'), 'zh_CN')
  assert.equal(wpLocaleFor('zh-tw'), 'zh_TW')
  assert.throws(() => normaliseWordpressLocale('zh'), AmbiguousLocaleError)
  assert.throws(() => normaliseWordpressLocale('pt'), AmbiguousLocaleError)
})

test('the spellings a stored answer may carry all resolve to one tag', () => {
  for (const input of ['vi', 'vi-VN', 'vi_VN', ' vi-vn '])
    assert.equal(normaliseWordpressLocale(input), 'vi-vn')
  assert.equal(wpLocaleFor('pt_BR'), 'pt_BR')
})

test('no right-to-left language is admitted', () => {
  for (const entry of Object.values(WORDPRESS_LANGUAGE_CATALOG.locales)) assert.equal(entry.rtl, false)
  for (const rtl of ['ar-sa', 'fa-ir', 'he-il', 'ur-pk']) assert.throws(() => wpLocaleFor(rtl))
})

test('a malformed catalogue is refused loudly rather than half-read', () => {
  assert.throws(() => validateWordpressLanguageCatalog({}), /Unsupported WordPress language catalogue/)
  const base = { schemaVersion: 'tracy-wordpress-language-packs/v1', version: '1.0.0', note: 'x'.repeat(50) }
  assert.throws(() => validateWordpressLanguageCatalog(base), /carries no locales/)
  assert.throws(
    () =>
      validateWordpressLanguageCatalog({
        ...base,
        locales: { 'he-il': { wpLocale: 'he_IL', englishName: 'Hebrew', nativeName: 'עברית', rtl: true } },
        unsupported: {}
      }),
    /right-to-left/
  )
  assert.throws(
    () =>
      validateWordpressLanguageCatalog({
        ...base,
        locales: { zh_CN: { wpLocale: 'zh_CN', englishName: 'C', nativeName: 'C', rtl: false } },
        unsupported: {}
      }),
    /Invalid WordPress locale/
  )
  assert.throws(
    () =>
      validateWordpressLanguageCatalog({
        ...base,
        locales: {
          'pt-br': { wpLocale: 'pt_BR', englishName: 'a', nativeName: 'a', rtl: false },
          'pt-pt': { wpLocale: 'pt_BR', englishName: 'b', nativeName: 'b', rtl: false }
        },
        unsupported: {}
      }),
    /Two tags claim the WordPress locale pt_BR/
  )
})

test('Polylang slugs: the base when it is unique to the build, the full tag when it is not', () => {
  assert.deepEqual(
    [...polylangSlugsFor(['en-us', 'vi-vn', 'zh-cn'])],
    [
      ['en-us', 'en'],
      ['vi-vn', 'vi'],
      ['zh-cn', 'zh']
    ]
  )
  assert.deepEqual(
    [...polylangSlugsFor(['en-us', 'pt-br', 'pt-pt'])],
    [
      ['en-us', 'en'],
      ['pt-br', 'pt-br'],
      ['pt-pt', 'pt-pt']
    ]
  )
  // A language named twice (the answer, then its plan) is still one language.
  assert.equal(polylangSlugsFor(['en-us', 'vi-vn', 'vi-vn']).get('vi-vn'), 'vi')
  // A build authored before this module said `en` and `fr`; it keeps the slugs it produced.
  assert.deepEqual(
    [...polylangSlugsFor(['en', 'fr'])],
    [
      ['en', 'en'],
      ['fr', 'fr']
    ]
  )
})

// ── The two edges that speak to WordPress ──────────────────────────────────────────────────────

test('installLocale: wp-cli fetches the core translation under WordPress’s own spelling', async () => {
  const ran = []
  const run = async (cmd, args, stdin) => {
    ran.push({ cmd, args, stdin })
    return { code: 0, stdout: '', stderr: '' }
  }
  await wpCliOps({ run, webroot: '.webroot' }).installLocale(wpLocaleFor('pt-br'))
  assert.deepEqual(ran[0].args, ['language', 'core', 'install', 'pt_BR', '--path=.webroot', '--allow-root'])
})

test('installLocale: the Apply door has the verb, and sends WordPress’s own spelling', async () => {
  const calls = []
  const door = doorOps({
    apply: async (c) => {
      calls.push(c)
      return { ok: true, locale: 'pt_BR', already: false }
    },
    siteKey: 'x.tracy.ai',
    applyId: 'a-1'
  })
  await door.installLocale(wpLocaleFor('pt-br'))
  assert.deepEqual(calls, [
    { siteKey: 'x.tracy.ai', action: 'language.install', params: { locale: 'pt_BR' } }
  ])
})

test('installLocale: a door older than the verb refuses in words, and says why', async () => {
  const door = doorOps({
    apply: async () => ({ ok: false, error: 'bad_action', message: 'unknown action: language.install' }),
    siteKey: 'x.tracy.ai',
    applyId: 'a-1'
  })
  await assert.rejects(() => door.installLocale('vi'), /its Tracy plugin is older than the language action/)
})

test('installLocale: every other refusal is the door’s own sentence, passed through', async () => {
  // A locale WordPress does not publish, or a role that may not write code, are real answers to a
  // verb that exists. Rewriting them as "your plugin is old" would send the customer hunting.
  const door = doorOps({
    apply: async () => ({
      ok: false,
      error: 'install_failed',
      message: 'WordPress offers no translation for xx'
    }),
    siteKey: 'x.tracy.ai',
    applyId: 'a-1'
  })
  await assert.rejects(() => door.installLocale('xx'), /WordPress offers no translation for xx/)
})

test('a vi-vn build: the locale is installed as `vi`, and Polylang is told `vi`', async () => {
  const seen = { locales: [], langs: [], slugs: [] }
  const ops = {
    find: async () => null,
    upsert: async ({ slug }) => {
      seen.slugs.push(slug)
      return seen.slugs.length
    },
    setMeta: async () => {},
    deleteMeta: async () => {},
    setOption: async () => {},
    category: async () => null,
    cover: async () => false,
    flush: async () => {},
    installLocale: async (wpLocale) => seen.locales.push(wpLocale),
    setLanguage: async (_id, lang) => seen.langs.push(lang)
  }
  const page = { slug: 'home', title: 'Home', kind: 'page', body: [{ html: '<p>Hi</p>' }] }
  await applyWordPress({
    plan: { pages: [page], menu: [], posts: [] },
    run: async () => {
      throw new Error('no shell')
    },
    ops,
    languages: ['en-us', 'vi-vn'],
    translations: [{ lang: 'vi-vn', plan: { pages: [{ ...page, title: 'Trang chủ' }] } }]
  })
  assert.deepEqual(seen.locales, ['vi'])
  // `home-vi`, not `home-vi-vn`: the Polylang slug, the same one Polylang would have chosen.
  assert.ok(seen.slugs.includes('home-vi'))
  assert.deepEqual([...new Set(seen.langs)].sort(), ['en', 'vi'])
})

test('pt-br beside pt-pt: both keep their full slug, because Polylang cannot call both `pt`', async () => {
  const slugs = []
  const langs = []
  const ops = {
    find: async () => null,
    upsert: async ({ slug }) => {
      slugs.push(slug)
      return slugs.length
    },
    setMeta: async () => {},
    deleteMeta: async () => {},
    setOption: async () => {},
    category: async () => null,
    cover: async () => false,
    flush: async () => {},
    installLocale: async () => {},
    setLanguage: async (_id, lang) => langs.push(lang)
  }
  const page = { slug: 'home', title: 'Home', kind: 'page', body: [{ html: '<p>Hi</p>' }] }
  await applyWordPress({
    plan: { pages: [page], menu: [], posts: [] },
    run: async () => {
      throw new Error('no shell')
    },
    ops,
    languages: ['pt-pt', 'pt-br'],
    translations: [{ lang: 'pt-br', plan: { pages: [page] } }]
  })
  assert.ok(slugs.includes('home-pt-br'))
  assert.deepEqual([...new Set(langs)].sort(), ['pt-br', 'pt-pt'])
})

test('a door that cannot install a locale warns; the pages are still marked', async () => {
  const langs = []
  const ops = {
    find: async () => null,
    upsert: async () => langs.length + 1,
    setMeta: async () => {},
    deleteMeta: async () => {},
    setOption: async () => {},
    category: async () => null,
    cover: async () => false,
    flush: async () => {},
    installLocale: async () => {
      throw new Error('its Tracy plugin is older than the language action')
    },
    setLanguage: async (_id, lang) => langs.push(lang)
  }
  const page = { slug: 'home', title: 'Home', kind: 'page', body: [{ html: '<p>Hi</p>' }] }
  const out = await applyWordPress({
    plan: { pages: [page], menu: [], posts: [] },
    run: async () => {
      throw new Error('no shell')
    },
    ops,
    languages: ['en-us', 'zh-cn'],
    translations: [{ lang: 'zh-cn', plan: { pages: [page] } }]
  })
  assert.ok(out.warnings.some((w) => /the zh-cn translation was not installed/.test(w)))
  assert.ok(langs.includes('zh'))
})

/**
 * A build written through the seat door, recording what reaches `content.language`. The plugin
 * resolves a language named only as a translation key WITHOUT a locale (its default table, or a
 * refusal for a bare `pt`/`zh`), so what matters is the first time each language reaches the door:
 * it must arrive as `lang` with its exact `locale`.
 * @param {string[]} languages
 */
async function languageDoorCalls(languages) {
  const calls = []
  let id = 0
  const apply = async (call) => {
    if (call.action === 'content.language') calls.push(call.params)
    if (call.action === 'content.list') return { ok: true, items: [] }
    if (call.action === 'content.update') return { ok: true, id: ++id }
    return { ok: true }
  }
  const page = { slug: 'home', title: 'Home', kind: 'page', body: [{ html: '<p>Hi</p>' }] }
  await applyWordPress({
    plan: { pages: [page], menu: [], posts: [] },
    run: async () => {
      throw new Error('no shell')
    },
    ops: doorOps({ apply, siteKey: 'x.tracy.ai', applyId: 'a-1' }),
    languages,
    translations: languages.slice(1).map((lang) => ({ lang, plan: { pages: [page] } }))
  })
  /** @type {Map<string, string | undefined>} */
  const firstSeen = new Map()
  for (const params of calls) {
    if (!firstSeen.has(params.lang)) firstSeen.set(params.lang, params.locale)
    for (const key of Object.keys(params.translations ?? {}))
      if (!firstSeen.has(key)) firstSeen.set(key, 'named as a twin before it was declared')
  }
  return { calls, firstSeen }
}

test('the language door gets the URL slug and the exact locale of every language, the first one included', async () => {
  const { firstSeen } = await languageDoorCalls(['en-gb', 'pt-br'])
  // `pt`, not `pt-br`: the URL segment stays short while no other chosen language shares its base,
  // and the locale says which Portuguese it is. British English is `en_GB`, not the `en_US` a
  // bare `en` would fall back to.
  assert.deepEqual(Object.fromEntries(firstSeen), { en: 'en_GB', pt: 'pt_BR' })
})

test('pt-pt beside pt-br at the language door: two slugs, two locales', async () => {
  const { firstSeen, calls } = await languageDoorCalls(['pt-pt', 'pt-br'])
  assert.deepEqual(Object.fromEntries(firstSeen), { 'pt-pt': 'pt_PT', 'pt-br': 'pt_BR' })
  // The pair is still tied both ways, under the slugs the pages were filed under.
  assert.ok(calls.some((p) => p.translations?.['pt-pt'] && p.translations?.['pt-br']))
})
