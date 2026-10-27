/**
 * The seeder's side of the WordPress content-contract door (`wordpress-contract-door.mjs`),
 * against a fake `apply` that answers the way Tracy Cowork 0.12.1 / 0.13.0 does.
 *
 *   node --test packages/cms/tracy-seeder/test/wordpress-contract-door.test.mjs
 *
 * What is guarded: an older Claude Cowork plugin (no door) or an unbound site takes the OLD road, never an
 * error; a bound site writes ONE revision through `content.contract apply` with the revision it was
 * inspected at and a `contract-` apply id; a value the contract would refuse is cleaned first, and a
 * slot the Claude Cowork plugin names in a refusal is set aside and the revision sent again; editions resolve
 * from the questionnaire's tags and a language the archive lacks is reported; the second-language
 * view of the content map carries the edition's own words as samples and lists missing blocks.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyWordPressThroughContract,
  chosenEditions,
  contractValue,
  editionContentMap,
  editionFor,
  getBlockValue,
  inspectWordPressContract,
  relabelWordPressSource,
  retireWordPressOthers,
  setWordPressLocale,
  setWordPressSiteLanguage,
  trimWordPressDemo
} from '../src/wordpress-contract-door.mjs'

const editions = {
  schemaVersion: 'tracy-quickstart-editions/wordpress/v1',
  contract: 'x/wp7/1.1.0',
  source: { language: 'en', locale: 'en_US', tag: 'en-us' },
  locales: {
    en: { locale: 'en_US', tag: 'en-us', wpLocale: 'en_US', ids: { 'page-home': 42 }, missing: [] },
    de: { locale: 'de_DE', tag: 'de-de', wpLocale: 'de_DE', ids: { 'page-home': 575 }, missing: [] },
    vi: { locale: 'vi', tag: 'vi', wpLocale: 'vi', ids: { 'page-home': 1936 }, missing: [] },
    'pt-br': { locale: 'pt_BR', tag: 'pt-br', wpLocale: 'pt_BR', ids: { 'page-home': 1661 }, missing: [] },
    ru: {
      locale: 'ru_RU',
      tag: 'ru-ru',
      wpLocale: 'ru_RU',
      ids: { 'page-home': 53 },
      missing: ['page-home:hero.cta']
    }
  }
}

test('inspect: no door → old road; unbound → old road; bound → the state', async () => {
  const noDoor = async () => ({ ok: false, error: 'bad_action', message: 'unknown action: content.contract' })
  assert.deepEqual(await inspectWordPressContract(noDoor, 's'), {
    supported: false,
    bound: false,
    state: null,
    words: 'unknown action: content.contract'
  })
  const unbound = async () => ({ ok: true, bound: false, contract: 'x/wp7/1.1.0', revision: 'r0' })
  assert.equal((await inspectWordPressContract(unbound, 's')).bound, false)
  const bound = async () => ({ ok: true, bound: true, contract: 'x/wp7/1.1.0', revision: 'r1', slots: {} })
  const got = await inspectWordPressContract(bound, 's')
  assert.equal(got.bound, true)
  assert.equal(got.state.revision, 'r1')
  // A real refusal (the site drifted) is an error in the door's own words.
  const drifted = async () => ({
    ok: false,
    error: 'contract_failed',
    message: 'Presentation asset changed: style.css'
  })
  await assert.rejects(inspectWordPressContract(drifted, 's'), /Presentation asset changed/)
})

test('demo trim loops until completed, and an older Claude Cowork plugin answers none', async () => {
  const calls = []
  const apply = async (c) => {
    calls.push(c.params)
    return calls.length < 3
      ? { ok: true, status: 'running', moved: 300, remaining: 100 }
      : { ok: true, status: 'completed', moved: 5, hidden: 205 }
  }
  const r = await trimWordPressDemo({ apply, siteKey: 's' })
  assert.equal(r.status, 'completed')
  assert.equal(calls.length, 3)
  assert.equal(calls[0].operation, 'demoTrim.apply')
  assert.equal(calls[0].apply_id, 'dtrim-seed')
  const older = async () => ({
    ok: false,
    error: 'bad_params',
    message: 'unknown contract operation demoTrim.apply'
  })
  assert.equal((await trimWordPressDemo({ apply: older, siteKey: 's' })).status, 'none')
})

test('editions: the questionnaire tags find their edition; the source is always first; an unknown language is reported', () => {
  assert.equal(editionFor(editions, 'de-de'), 'de')
  assert.equal(editionFor(editions, 'de'), 'de')
  assert.equal(editionFor(editions, 'vi'), 'vi')
  assert.equal(editionFor(editions, 'pt-br'), 'pt-br')
  assert.equal(editionFor(editions, 'en-us'), 'en')
  assert.equal(editionFor(editions, 'xx'), null)
  const { editions: passes, unknown } = chosenEditions(editions, ['vi', 'de-de', 'xx', 'en-us'])
  assert.deepEqual(
    passes.map((p) => p.slug),
    ['en', 'vi', 'de']
  )
  assert.equal(passes[0].source, true)
  assert.deepEqual(unknown, ['xx'])
  // A `vi` site alone still writes the source (D.2).
  assert.deepEqual(
    chosenEditions(editions, ['vi']).editions.map((p) => p.slug),
    ['en', 'vi']
  )
})

const MARKUP = `<!-- wp:heading {"level":1,"metadata":{"name":"hero.h"}} -->\n<h1 class="x">Hallo <em>Welt</em></h1>\n<!-- /wp:heading -->\n<!-- wp:buttons -->\n<!-- wp:button {"metadata":{"name":"hero.cta"},"url":"/kontakt"} -->\n<div class="wp-block-button"><a class="wp-block-button__link" href="/kontakt">Kontakt</a></div>\n<!-- /wp:button -->\n<!-- /wp:buttons -->`

test('getBlockValue reads a heading, a button and a url; a missing block is null', () => {
  assert.equal(getBlockValue(MARKUP, 'hero.h'), 'Hallo Welt')
  assert.equal(getBlockValue(MARKUP, 'hero.cta'), 'Kontakt')
  assert.equal(getBlockValue(MARKUP, 'hero.cta', 'url'), '/kontakt')
  assert.equal(getBlockValue(MARKUP, 'nope'), null)
})

test('editionContentMap: the German view re-addresses the page to its copy, samples its own words, lists what it lacks', async () => {
  const contentMap = {
    entities: [
      { key: 'page-home', kind: 'page', identity: { postType: 'page', slug: 'home', language: 'en' } },
      { key: 'option-blogname', kind: 'option', identity: { name: 'blogname' } }
    ],
    slots: [
      {
        key: 'home.hero.h',
        entity: 'page-home',
        target: { block: 'hero.h', attr: 'content' },
        sample: 'Hello world',
        maxCharacters: 80
      },
      {
        key: 'home.hero.cta',
        entity: 'page-home',
        target: { block: 'hero.cta', attr: 'content' },
        sample: 'Contact',
        maxCharacters: 20
      },
      {
        key: 'home.missing',
        entity: 'page-home',
        target: { block: 'nowhere', attr: 'content' },
        sample: 'x',
        maxCharacters: 20
      },
      {
        key: 'site.name',
        entity: 'option-blogname',
        target: { option: 'blogname' },
        sample: 'Northgate',
        maxCharacters: 80
      }
    ]
  }
  const reads = []
  const view = await editionContentMap(contentMap, editions, 'de', async (id) => {
    reads.push(id)
    return MARKUP
  })
  assert.deepEqual(reads, [575])
  // The page comes re-addressed; the site title, which Polylang serves per language, comes along
  // in the edition's language so its words are planned in German and written as `de::site.name`.
  assert.deepEqual(
    view.contentMap.entities.map((e) => [e.key, e.identity.id ?? null, e.identity.language]),
    [
      ['page-home', 575, 'de-de'],
      ['option-blogname', null, 'de-de']
    ]
  )
  assert.deepEqual(
    view.contentMap.slots.map((s) => [s.key, s.sample]),
    [
      ['home.hero.h', 'Hallo Welt'],
      ['home.hero.cta', 'Kontakt'],
      ['site.name', 'Northgate']
    ]
  )
  assert.deepEqual(view.missing, ['page-home:nowhere'])
  // The source view is the map itself.
  const src = await editionContentMap(contentMap, editions, 'en', async () => {
    throw new Error('never read')
  })
  assert.equal(src.contentMap.slots.length, 4)
})

test('contractValue: markup and control characters go, the budget holds, an empty value is null', () => {
  assert.equal(
    contractValue('Hello <b>world</b>\nnext\tline', { maxCharacters: 80 }),
    'Hello bworld/b next line'
  )
  assert.equal(contractValue('a'.repeat(50), { maxCharacters: 10 }), 'aaaaaaaaa…')
  assert.equal(contractValue('  \n ', { maxCharacters: 10 }), null)
})

test('🔒 contractValue: the contract takes plain text, so an entity is decoded once and the word "null" is no value', () => {
  // The site escapes what it is given: "&amp;" sent as text came out "&amp;amp;" on tamq-7q-bizwp4 (08/10/2026).
  assert.equal(
    contractValue('Bánh sourdough &amp; bánh Việt', { maxCharacters: 80 }),
    'Bánh sourdough & bánh Việt'
  )
  assert.equal(contractValue('Tom &#38; Jerry &quot;Bakery&quot;', {}), 'Tom & Jerry "Bakery"')
  assert.equal(contractValue('a &lt;b&gt; tag', {}), 'a b tag', 'a decoded angle bracket is still no markup')
  assert.equal(contractValue('null', { maxCharacters: 80 }), null)
  assert.equal(contractValue(' Undefined ', {}), null)
})

test('apply through the contract: one revision, contract- apply id, request id from the changes; a named refusal sets that slot aside and sends again', async () => {
  const calls = []
  const apply = async (c) => {
    calls.push(c.params)
    if (calls.length === 1)
      return { ok: false, error: 'contract_failed', message: 'Content too long: home.hero.h (81 > 80)' }
    return {
      ok: true,
      apply_id: c.params.apply_id,
      request_id: c.params.request_id,
      written: [{ kind: 'post', id: 42 }],
      revision: 'r2'
    }
  }
  const state = { contract: 'x/wp7/1.1.0', revision: 'r1' }
  const writes = [
    { slot: 'site.name', value: 'Bright Harbor' },
    { slot: 'home.hero.h', value: 'A heading' },
    { slot: 'home.hero.h', value: 'Eine Überschrift', locale: 'de' }
  ]
  const slots = new Map([['home.hero.h', { maxCharacters: 80 }]])
  const r = await applyWordPressThroughContract({ apply, siteKey: 's', state, writes, source: 'en', slots })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].operation, 'apply')
  assert.equal(calls[0].expected_revision, 'r1')
  assert.match(calls[0].apply_id, /^contract-[0-9a-f]{48}$/)
  assert.deepEqual(Object.keys(calls[0].changes), ['site.name', 'home.hero.h', 'de::home.hero.h'])
  assert.deepEqual(
    Object.keys(calls[1].changes),
    ['site.name', 'de::home.hero.h'],
    'the refused slot is set aside'
  )
  assert.notEqual(calls[0].request_id, calls[1].request_id, 'a different change set is a different request')
  assert.deepEqual(
    r.written.map((w) => w.slot),
    ['site.name', 'de::home.hero.h']
  )
  assert.equal(r.skipped[0].slot, 'home.hero.h')
  assert.equal(r.receipt.afterRevision, 'r2')
  // A refusal that names nothing usable is the Claude Cowork plugin's own sentence.
  const stuck = async () => ({
    ok: false,
    error: 'contract_failed',
    message: 'Content changed; inspect again'
  })
  await assert.rejects(
    applyWordPressThroughContract({ apply: stuck, siteKey: 's', state, writes, source: 'en', slots }),
    /Content changed; inspect again/
  )
})

test('retire loops to completed with one mlang- apply id; an older Claude Cowork plugin answers none; relabel only for an English variant', async () => {
  const calls = []
  const apply = async (c) => {
    calls.push(c.params)
    return calls.length < 2
      ? { ok: true, status: 'running', moved: 300, remaining: 20 }
      : { ok: true, status: 'completed', retired: ['de', 'fr'], live: ['en', 'vi'] }
  }
  const r = await retireWordPressOthers({ apply, siteKey: 's', keep: ['en-us', 'vi'] })
  assert.equal(r.status, 'completed')
  assert.deepEqual(r.retired, ['de', 'fr'])
  assert.equal(calls.length, 2)
  assert.match(calls[0].apply_id, /^mlang-/)
  assert.equal(calls[0].apply_id, calls[1].apply_id)
  assert.deepEqual(calls[0].keep, ['en-us', 'vi'])
  const older = async () => ({
    ok: false,
    error: 'bad_params',
    message: 'unknown contract operation multilingual.retire'
  })
  assert.equal((await retireWordPressOthers({ apply: older, siteKey: 's', keep: ['en-us'] })).status, 'none')
  // A rebuild that adds a language reuses the receipt the site already holds (the door refuses a
  // second one); a receipt of another kind is not reused.
  const seen = []
  const again = async (c) => {
    seen.push(c.params.apply_id)
    return { ok: true, status: 'completed', retired: ['fr'], live: ['en', 'vi', 'de'] }
  }
  const reused = await retireWordPressOthers({
    apply: again,
    siteKey: 's',
    keep: ['en-us', 'vi', 'de-de'],
    onRecord: 'mlang-build-old1'
  })
  assert.deepEqual([reused.applyId, seen], ['mlang-build-old1', ['mlang-build-old1']])
  await retireWordPressOthers({ apply: again, siteKey: 's', keep: ['en-us'], onRecord: 'contract-x' })
  assert.match(seen[1], /^mlang-build-/)

  assert.equal(
    (
      await relabelWordPressSource({
        apply: async () => {
          throw new Error('never called')
        },
        siteKey: 's',
        languages: ['en-us', 'vi']
      })
    ).status,
    'none'
  )
  const set = []
  const rel = await relabelWordPressSource({
    apply: async (c) => {
      set.push(c.params)
      return { ok: true, status: 'completed', locale: 'en_GB', from: 'en_US' }
    },
    siteKey: 's',
    languages: ['en-gb']
  })
  assert.equal(rel.status, 'set')
  assert.equal(set[0].operation, 'sourceLanguage.set')
  assert.equal(set[0].locale, 'en_GB')
  assert.match(set[0].apply_id, /^srclang-/)
})

test('site language: the first chosen edition becomes the default; the source is a no-op; an older Claude Cowork plugin answers none', async () => {
  assert.equal(
    (
      await setWordPressSiteLanguage({
        apply: async () => {
          throw new Error('never')
        },
        siteKey: 's',
        language: 'en',
        source: 'en'
      })
    ).status,
    'none'
  )
  const calls = []
  const r = await setWordPressSiteLanguage({
    apply: async (c) => {
      calls.push(c.params)
      return { ok: true, status: 'completed', language: 'vi', from: 'en' }
    },
    siteKey: 's',
    language: 'vi',
    source: 'en'
  })
  assert.equal(r.status, 'set')
  assert.equal(calls[0].operation, 'siteLanguage.set')
  assert.equal(calls[0].language, 'vi')
  assert.match(calls[0].apply_id, /^slang-/)
  const older = async () => ({
    ok: false,
    error: 'bad_params',
    message: 'unknown contract operation siteLanguage.set'
  })
  assert.equal(
    (await setWordPressSiteLanguage({ apply: older, siteKey: 's', language: 'vi', source: 'en' })).status,
    'none'
  )
})

test('a site with no translation plugin has one language: hiding, relabelling and the default language answer single instead of failing', async () => {
  // The Claude Cowork plugin's own answer on a site without Polylang (`Engine.php`, error code `unavailable`).
  const oneLanguage = (/** @type {string} */ message) => async () => ({
    ok: false,
    error: 'unavailable',
    message
  })
  const retired = await retireWordPressOthers({
    apply: oneLanguage('this site has no translation plugin, so it has no editions to retire'),
    siteKey: 's',
    keep: ['en-us']
  })
  assert.equal(retired.status, 'single')
  const relabelled = await relabelWordPressSource({
    apply: oneLanguage(
      'this site has no translation plugin, so its source language has no locale to respell'
    ),
    siteKey: 's',
    languages: ['en-au']
  })
  assert.equal(relabelled.status, 'single')
  const chosen = await setWordPressSiteLanguage({
    apply: oneLanguage('this site has no translation plugin, so it has no editions to choose a default from'),
    siteKey: 's',
    language: 'de',
    source: 'en'
  })
  assert.equal(chosen.status, 'single')
  // Any other refusal is still said out loud.
  await assert.rejects(
    retireWordPressOthers({
      apply: async () => ({ ok: false, error: 'unavailable', message: 'site writer not wired' }),
      siteKey: 's',
      keep: ['en-us']
    }),
    /site writer not wired/
  )
})

// ── The language WordPress itself speaks, for a site written in one language (TCH #1013, T13) ──────────────
test('a site written in Vietnamese installs WordPress’s vi translation and sets WPLANG under the apply id', async () => {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    return { ok: true }
  }
  const out = await setWordPressLocale({ apply, siteKey: 's', language: 'vi-vn', applyId: 'lang-x' })
  assert.deepEqual(out, { status: 'set', locale: 'vi', warnings: [], follow: null })
  assert.deepEqual(
    calls.map((c) => [c.action, c.params]),
    [
      ['language.install', { locale: 'vi' }],
      [
        'content.update',
        { apply_id: 'lang-x', kind: 'option', id: 0, key: 'WPLANG', fields: { value: 'vi' } }
      ],
      // A Polylang source edition prints its own locale whatever WPLANG says (bizwp3, 08/10/2026: lang="en-US" over
      // Vietnamese words); the Claude Cowork plugin (0.18.3+) reads this option on that edition's front end.
      [
        'content.update',
        { apply_id: 'lang-x', kind: 'option', id: 0, key: 'tracy_source_locale', fields: { value: 'vi' } }
      ]
    ]
  )
})

test('British English needs no download, only WPLANG en_GB', async () => {
  const calls = []
  const out = await setWordPressLocale({
    apply: async (call) => {
      calls.push(call)
      return { ok: true }
    },
    siteKey: 's',
    language: 'en-gb',
    applyId: 'lang-x'
  })
  assert.equal(out.locale, 'en_GB')
  assert.ok(
    calls.some((c) => c.action === 'language.install'),
    'en_GB is a translation too'
  )
  assert.equal(calls.at(-1).params.fields.value, 'en_GB')
})

test('a plugin older than language.install is a warning, and WPLANG is still set', async () => {
  const calls = []
  const out = await setWordPressLocale({
    apply: async (call) => {
      calls.push(call.action)
      return call.action === 'language.install'
        ? { ok: false, error: 'bad_action', message: 'unknown action: language.install' }
        : { ok: true }
    },
    siteKey: 's',
    language: 'de-de',
    applyId: 'lang-x'
  })
  assert.equal(out.status, 'partial')
  assert.match(out.warnings[0], /older than the language action/)
  assert.deepEqual(calls, ['language.install', 'content.update', 'content.update'])
})

test('a language WordPress has no locale for writes nothing and says why', async () => {
  const calls = []
  const out = await setWordPressLocale({
    apply: async (call) => {
      calls.push(call)
      return { ok: true }
    },
    siteKey: 's',
    language: 'xx-yy',
    applyId: 'lang-x'
  })
  assert.equal(out.status, 'none')
  assert.equal(calls.length, 0)
  assert.match(out.warnings[0], /xx-yy/)
})

// The language catalogue is one step of a brief, not the brief: a door that cannot read it must
// still load, and only the language step is skipped (the #1019 incident: a catalogue the image did
// not carry failed the whole module, so every WordPress brief failed at `prepare`).
test('the door loads without the language catalogue, and only the language step warns', async (t) => {
  const { cpSync, mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { fileURLToPath, pathToFileURL } = await import('node:url')
  const copy = join(mkdtempSync(join(tmpdir(), 'seeder-no-catalogue-')), 'seeder')
  t.after(() => rmSync(copy, { recursive: true, force: true }))
  cpSync(fileURLToPath(new URL('../src/', import.meta.url)), copy, { recursive: true })
  rmSync(join(copy, 'wordpress-language-packs.json'))

  const door = await import(pathToFileURL(join(copy, 'wordpress-contract-door.mjs')).href)
  const calls = []
  const out = await door.setWordPressLocale({
    apply: async (call) => {
      calls.push(call)
      return { ok: true }
    },
    siteKey: 's',
    language: 'vi-vn',
    applyId: 'lang-x'
  })
  assert.equal(out.status, 'none')
  assert.equal(calls.length, 0)
  assert.match(out.warnings[0], /could not be told to speak vi-vn/)
})

test('what followed the language on its own (CF7 forms, date and time formats) comes back for the build report', async () => {
  const follow = {
    forms: [12, 13],
    date_format: 'j F, Y',
    time_format: 'H:i',
    formats: { date_format: 'j F, Y' },
    failed: []
  }
  const calls = []
  const out = await setWordPressLocale({
    apply: async (call) => {
      calls.push(call.action)
      return call.action === 'language.install' ? { ok: true, follow } : { ok: true }
    },
    siteKey: 's',
    language: 'vi-vn',
    applyId: 'lang-x'
  })
  assert.deepEqual(out.follow, follow)
  assert.deepEqual(calls.slice(0, 2), ['language.install', 'content.update'], 'the install before WPLANG')
})
