import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LANGUAGE_CATALOG,
  packFor,
  supportedLocales,
  validateLanguageCatalog
} from '../src/language-catalog.mjs'

const clone = () => JSON.parse(JSON.stringify(LANGUAGE_CATALOG))

/** `assert.throws` does not hand back the error, and these tests are about what it SAYS. */
function thrown(fn) {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('expected a throw')
}

test('the shipped catalog is the reviewed one, and it validates', () => {
  assert.equal(LANGUAGE_CATALOG.schemaVersion, 'tracy-joomla-language-packs/v1')
  // Re-measured 2026-09-21 across the whole Joomla 6 accredited feed: 52 packs published, fa-IR
  // (the only right-to-left one) left out, vi-VN pinned from the Joomla 4 feed because 6 publishes
  // none. The three from the 2026-09-12 review are still in and still byte-identical.
  const tags = Object.keys(LANGUAGE_CATALOG.packs)
  assert.equal(tags.length, 52)
  for (const tag of ['fr-FR', 'zh-CN', 'zh-TW', 'vi-VN']) assert.ok(tags.includes(tag), tag)
  assert.ok(!tags.includes('fa-IR'), 'the one RTL pack is left out on purpose')
  for (const tag of tags) assert.equal(LANGUAGE_CATALOG.packs[tag].sha256.length, 64, tag)
  assert.equal(LANGUAGE_CATALOG.packs['zh-CN'].bytes, 619023)
  // Joomla 6 publishes no vi-VN pack; the Joomla 4 one installs on 6 (no <targetplatform>) and
  // that is the pinned decision, so the pack names both majors rather than refusing a language
  // the 1.1.0 archive already ships.
  assert.deepEqual(LANGUAGE_CATALOG.packs['vi-VN'].platformMajors, [4, 6])
})

test('the source language has no pack to install, and that is not an error', () => {
  // en-GB ships with Joomla. Answering "unsupported" here would make adding a second language
  // look impossible on a site that already has the first one.
  assert.equal(packFor('en-GB'), null)
  assert.equal(packFor('en-GB', 6), null)
})

test('a locale outside the catalog is refused by NAME, and the refusal lists what is there', () => {
  // fa-IR is real, published for Joomla 6, and deliberately NOT in the catalog — the refusal has
  // to be by name, not by "does such a language exist".
  const error = thrown(() => packFor('fa-IR', 6))
  assert.match(error.message, /No verified Joomla language pack/)
  assert.match(error.message, /fr-FR/)
  assert.match(error.message, /zh-CN/)
  assert.doesNotMatch(error.message, /en-GB/)
})

test('a pack that does not cover the site major is refused before it is downloaded', () => {
  assert.throws(() => packFor('zh-CN', 5), /does not cover Joomla 5/)
  assert.equal(packFor('zh-CN', 6).version, '6.0.1.4')
})

test('supported locales lead with the source and can be filtered by major', () => {
  const six = supportedLocales(6)
  assert.equal(six[0], 'en-GB', 'the source leads')
  assert.equal(six.length, 1 + 52, 'en-GB plus every pack that covers Joomla 6, vi-VN included')
  assert.ok(six.includes('vi-VN'))
  assert.deepEqual(six.slice(1), six.slice(1).sort(), 'packs follow in a stable order')
  assert.deepEqual(supportedLocales(5), ['en-GB'])
  assert.deepEqual(supportedLocales(4), ['en-GB', 'vi-VN'])
})

test('a malformed catalog is refused, field by field', () => {
  const cases = {
    'wrong schema': (c) => {
      c.schemaVersion = 'something-else'
    },
    'no packs': (c) => {
      delete c.packs
    },
    'key disagrees with tag': (c) => {
      c.packs['zh-CN'].tag = 'zh-TW'
    },
    'short hash': (c) => {
      c.packs['zh-CN'].sha256 = 'abc'
    },
    'uppercase hash': (c) => {
      c.packs['zh-CN'].sha256 = c.packs['zh-CN'].sha256.toUpperCase()
    },
    'no bytes': (c) => {
      delete c.packs['zh-CN'].bytes
    },
    'zero bytes': (c) => {
      c.packs['zh-CN'].bytes = 0
    },
    'plain http': (c) => {
      c.packs['zh-CN'].url = 'http://downloads.joomla.org/x'
    },
    'credentials in the url': (c) => {
      c.packs['zh-CN'].url = 'https://a:b@downloads.joomla.org/x'
    },
    'no platform majors': (c) => {
      c.packs['zh-CN'].platformMajors = []
    }
  }
  for (const [why, damage] of Object.entries(cases)) {
    const c = clone()
    damage(c)
    assert.throws(() => validateLanguageCatalog(c), /Invalid language pack|Unsupported|carries no packs/, why)
  }
})

test('a download must START at Joomla’s own host — the redirect may leave it, the pin may not', () => {
  // downloads.joomla.org answers 303 to a presigned S3 address that expires in sixty seconds, so
  // the final URL cannot be pinned. What is pinned is the first hop and the bytes.
  const c = clone()
  c.packs['zh-CN'].url = 'https://example.invalid/zh-cn.zip'
  assert.throws(() => validateLanguageCatalog(c), /Invalid language pack: zh-CN/)
  const ok = clone()
  assert.equal(new URL(ok.packs['fr-FR'].url).hostname, 'downloads.joomla.org')
  // The official URL carries a query and no `.zip` suffix; rejecting that shape would reject
  // every official pack there is.
  assert.match(ok.packs['fr-FR'].url, /\?format=zip$/)
})
