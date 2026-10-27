/**
 * The host's own small dictionary — the reading, the fallbacks, the language of the conversation.
 *
 * The drift check between these words and each plugin's client strings lives in the PLUGINS
 * (`test/words.test.mjs` there), because the words file is theirs; here the table is a fixture.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { SHOWN_LANGUAGE_IDS } from '../../../core/tracy-core/src/interface-languages/index.mjs'
import { fill, localeOf, scriptOf, setWordsRoot, wordsFor } from '../src/host/words.mjs'

setWordsRoot(new URL('./fixtures', import.meta.url).pathname)

describe('wordsFor', () => {
  it('reads a region tag by its primary subtag, and falls back to English', () => {
    assert.equal(wordsFor('vi-VN').retry, wordsFor('vi').retry)
    assert.equal(wordsFor('VI').retry, wordsFor('vi').retry)
    for (const odd of ['ja', '', null, undefined, 42, {}]) {
      assert.equal(wordsFor(odd).retry, wordsFor('en').retry)
    }
  })
})

/**
 * The dictionaries the Build plugins ship (`tracy-site-build-<cms>/words/<lang>.json`), read through the
 * same loader the host uses.
 *
 * The loader takes a file only when it holds every key of the frozen English table in `words.mjs`;
 * anything less is not a translation but a bug, and the whole file is refused for English, without a
 * word. So a translation one key short shows an English task list to a Vietnamese customer, and an
 * English file one key short loses the plugin's own stage names. That a file is whole on the plugin's
 * side (stages, provision lines, details) is `host-words.test.mjs`; this is whether the host takes it.
 */
describe('every Build plugin dictionary is served, never refused for English', () => {
  const plugins = ['wordpress', 'joomla', 'emdash']
  const rootOf = (plugin) => fileURLToPath(new URL(`../../tracy-site-build-${plugin}`, import.meta.url))
  const holes = (text) => (text.match(/\{(\w+)\}/g) ?? []).sort().join(',')
  // The frozen table: what a host whose `words/` cannot be read answers.
  setWordsRoot(fileURLToPath(new URL('./no-words-here', import.meta.url)))
  const frozen = wordsFor('en')
  setWordsRoot(new URL('./fixtures', import.meta.url).pathname)

  for (const plugin of plugins)
    it(`${plugin}: every interface language reads its own file, on the English placeholders`, () => {
      setWordsRoot(rootOf(plugin))
      try {
        const en = wordsFor('en')
        assert.notEqual(en, frozen, `${plugin}/words/en.json was refused: the frozen table answers instead`)
        assert.deepEqual(en, JSON.parse(readFileSync(`${rootOf(plugin)}/words/en.json`, 'utf8')))
        for (const lang of SHOWN_LANGUAGE_IDS.filter((id) => id !== 'en')) {
          const own = wordsFor(lang)
          assert.notEqual(own, en, `${plugin}/words/${lang}.json was refused: English answers instead`)
          assert.equal(holes(own.question), holes(en.question), `${plugin} ${lang}.question`)
          assert.equal(holes(own.header), holes(en.header), `${plugin} ${lang}.header`)
        }
      } finally {
        setWordsRoot(new URL('./fixtures', import.meta.url).pathname)
      }
    })

  // The other way round. The frozen table is what a host whose `words/` cannot be read answers (the image is
  // one missing `files` entry away from that), so it must answer every host line the Build plugins' English
  // files carry: a key every plugin ships that the table lacks is `undefined` on screen when the file is
  // gone (09/09: `plugin`, `copyLang`, `seedPages`, `styleWaiting` and the `progress` group). Left out are
  // what is each plugin's own: its stage names (`stages.<id>` of its `STAGES`), and `details`, which the
  // host reads with its own English fallback (`detailIn`).
  it('the frozen fallback answers every host line all three Build plugins ship in English', async () => {
    const shapeOf = (value, at = '') =>
      value !== null && typeof value === 'object'
        ? Object.keys(value).flatMap((key) => shapeOf(value[key], at === '' ? key : `${at}.${key}`))
        : [at]
    const fallback = new Set(shapeOf(frozen))
    const shipped = await Promise.all(
      plugins.map(async (plugin) => {
        const { STAGES } = await import(`../../tracy-site-build-${plugin}/src/host/stages.mjs`)
        const own = new Set(STAGES.map((id) => `stages.${id}`))
        const en = JSON.parse(readFileSync(`${rootOf(plugin)}/words/en.json`, 'utf8'))
        return new Set(shapeOf(en).filter((key) => !own.has(key) && !key.startsWith('details.')))
      })
    )
    const hostLines = [...shipped[0]].filter((key) => shipped.every((keys) => keys.has(key)))
    assert.ok(hostLines.length > 20, `only ${hostLines.length} common keys: the plugin files were not read`)
    assert.deepEqual(
      hostLines.filter((key) => !fallback.has(key)),
      [],
      'host lines the frozen table cannot answer'
    )
    for (const key of fallback) {
      const value = key.split('.').reduce((v, k) => v?.[k], frozen)
      // Every line is a sentence; `langNameLower` is the one flag the table carries.
      assert.ok(
        typeof value === 'boolean' || (typeof value === 'string' && value !== ''),
        `frozen ${key} is empty`
      )
    }
  })
})

const said = (text, kind = 'user') => ({
  type: 'user/message',
  data: { source: { kind }, content: [{ type: 'text', text }] }
})
const log = (...events) => ({ snapshotEvents: () => events })

describe('scriptOf', () => {
  it("tells Tracy's three apart by script alone", () => {
    assert.equal(scriptOf('chào bạn, dựng site giúp tôi'), 'vi')
    assert.equal(scriptOf('请帮我建一个站点'), 'zh')
    // Plain English says nothing about itself; so does an unmarked Vietnamese word.
    assert.equal(scriptOf('Build "Bento" with Joomla'), null)
    assert.equal(scriptOf(''), null)
  })

  it('reads the vowels and the d-with-stroke Vietnamese does not share', () => {
    for (const word of ['Kiểm', 'giao diện', 'đó', 'Chạy', 'Thử']) assert.equal(scriptOf(word), 'vi')
  })
})

describe('localeOf', () => {
  it('answers the language the customer typed in', () => {
    assert.equal(localeOf(log(said('dựng giúp tôi một site'))), 'vi')
    assert.equal(localeOf(log(said('请帮我建站'))), 'zh')
    assert.equal(localeOf(log(said('build me a site'))), 'en')
  })

  it('follows the newest message when the customer switches language', () => {
    assert.equal(localeOf(log(said('chào bạn'), said('请继续'))), 'zh')
    // An English message after a Vietnamese one says nothing by script, so the earlier one stands.
    assert.equal(localeOf(log(said('chào bạn'), said('ok go on'))), 'vi')
  })

  it('ignores everything a person did not type', () => {
    // The plugin's own injected lines are English by construction; folding them in would answer
    // English for every customer alive.
    assert.equal(
      localeOf(log(said('chào bạn'), said('Build on wpdemo: Site checked (1 of 6).', 'plugin'))),
      'vi'
    )
    assert.equal(localeOf(log({ type: 'todo/write', data: { todos: [] } }, said('xin chào'))), 'vi')
  })

  it('stops after a dozen messages, so a long English session is not scanned to its start', () => {
    const many = [said('xin chào'), ...Array.from({ length: 20 }, () => said('go on'))]
    assert.equal(localeOf(log(...many)), 'en')
    assert.equal(localeOf(log(...many), 40), 'vi')
  })

  it('answers English rather than throwing, whatever the session lacks', () => {
    assert.equal(localeOf(undefined), 'en')
    assert.equal(localeOf({}), 'en')
    assert.equal(localeOf({ snapshotEvents: () => undefined }), 'en')
    assert.equal(localeOf(log()), 'en')
    assert.equal(localeOf(log({ type: 'user/message' }, said(''))), 'en')
    assert.equal(
      localeOf({
        snapshotEvents: () => {
          throw new Error('log unreadable')
        }
      }),
      'en'
    )
  })
})

describe('fill', () => {
  it('puts values in the holes and leaves an unknown hole alone', () => {
    assert.equal(fill('{a} of {b}', { a: 2, b: 6 }), '2 of 6')
    assert.equal(fill('on {site}', { site: 'wpdemo' }), 'on wpdemo')
    assert.equal(fill('{missing}', {}), '{missing}')
  })
})
