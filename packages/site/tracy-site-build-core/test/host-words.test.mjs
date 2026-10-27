/**
 * What the HOST itself writes in the reader's language (spec #730): the provision lines of the
 * task list, and the detail of the retry question. Both read the Build plugins' `words/<lang>.json`.
 *
 * 🔒 THE `details` TABLE IN `words/` IS A COPY OF THE CLIENT CATALOGUE. The Build tab reads a host
 * sentence from the translation catalogues (`host.<code>`, which the interface-languages gate
 * measures); the retry question is drawn by dsh from what the host hands it, so the host needs the
 * same lines beside it. This test keeps the copy equal to the catalogue, line for line, in every
 * interface language: fix a drift by copying the catalogue's value into `words/<lang>.json`.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { SHOWN_LANGUAGE_IDS } from '../../../core/tracy-core/src/interface-languages/index.mjs'
import { HOST_MESSAGES } from '../src/host-messages.mjs'
import { provisionTodos } from '../src/host/host.ts'
import { detailIn, setWordsRoot } from '../src/host/words.mjs'
import { WORDPRESS_MESSAGES } from '../../tracy-site-build-wordpress/src/messages.mjs'
import { JOOMLA_MESSAGES } from '../../tracy-site-build-joomla/src/messages.mjs'
import { EMDASH_MESSAGES } from '../../tracy-site-build-emdash/src/messages.mjs'

const at = (rel) => fileURLToPath(new URL(rel, import.meta.url))
const read = (rel) => JSON.parse(readFileSync(at(rel), 'utf8'))
const PLUGINS = { wordpress: WORDPRESS_MESSAGES, joomla: JOOMLA_MESSAGES, emdash: EMDASH_MESSAGES }
const holes = (text) => (text.match(/\{(\w+)\}/g) ?? []).sort().join(',')
const catalogueOf = (lang, plugin) =>
  lang === 'vi'
    ? `../../../locale/tracy-locale-vi/vi/tracy-site-build-${plugin}.json`
    : `../../../locale/tracy-locales/${lang}/tracy-site-build-${plugin}.json`

describe('every Build plugin speaks every interface language on the host side', () => {
  for (const [plugin, table] of Object.entries(PLUGINS)) {
    const codes = [...Object.keys(HOST_MESSAGES), ...Object.keys(table)]
    const english = { ...HOST_MESSAGES, ...table }
    const en = read(`../../tracy-site-build-${plugin}/words/en.json`)
    for (const lang of SHOWN_LANGUAGE_IDS) {
      it(`${plugin} · ${lang}: a whole words file, provision lines included`, () => {
        const file = `../../tracy-site-build-${plugin}/words/${lang}.json`
        assert.ok(existsSync(at(file)), `${file} is missing`)
        const words = read(file)
        assert.deepEqual(Object.keys(words.stages).sort(), Object.keys(en.stages).sort(), 'stage names')
        assert.deepEqual(
          Object.keys(words.provision).sort(),
          Object.keys(en.provision).sort(),
          'provision lines'
        )
        for (const [key, value] of Object.entries(words.provision))
          assert.equal(holes(value), holes(en.provision[key]), `provision.${key} placeholders`)
      })
      if (lang === 'en') continue
      it(`${plugin} · ${lang}: details equal the catalogue's host lines`, () => {
        const words = read(`../../tracy-site-build-${plugin}/words/${lang}.json`)
        const catalogue = read(catalogueOf(lang, plugin))
        for (const code of codes) {
          assert.equal(words.details?.[code], catalogue[`host.${code}`], `${lang}/${plugin}: details.${code}`)
          assert.equal(holes(words.details[code]), holes(english[code]), `${code} placeholders`)
        }
      })
    }
  }
})

describe('detailIn', () => {
  it('reads a coded detail in the reader’s language and leaves everything else as written', () => {
    setWordsRoot(at('../../tracy-site-build-wordpress'))
    try {
      const stage = { detail: 's did not answer.', detailCode: 'SITE_SILENT', detailParams: { site: 's' } }
      assert.equal(detailIn(stage, 'de'), 's hat nicht geantwortet.')
      assert.equal(detailIn(stage, 'en'), 's did not answer.')
      assert.equal(detailIn({ detail: 'disk full' }, 'de'), 'disk full')
      assert.equal(detailIn({ detail: 'x', detailCode: 'FROM_A_NEWER_HOST' }, 'fr'), 'x')
    } finally {
      setWordsRoot(null)
    }
  })
})

describe('provisionTodos', () => {
  it('writes the fleet’s steps in the reader’s language, the reached one in progress', () => {
    setWordsRoot(at('../../tracy-site-build-joomla'))
    try {
      const todos = provisionTodos('starting database', '', 'fr')
      assert.equal(todos?.length, 6)
      assert.deepEqual(
        todos?.map((t) => t.status),
        ['completed', 'completed', 'completed', 'in_progress', 'pending', 'pending']
      )
      assert.equal(todos?.[3].content, 'Démarrer la base de données')
      assert.ok(provisionTodos('complete', '', 'fr')?.every((t) => t.status === 'completed'))
    } finally {
      setWordsRoot(null)
    }
  })

  it('names a stop with the fleet’s reason, and never as still working', () => {
    setWordsRoot(at('../../tracy-site-build-joomla'))
    try {
      const todos = provisionTodos('failed', 'release returned 404.', 'de') ?? []
      assert.equal(todos.at(-1)?.status, 'pending')
      assert.equal(
        todos.at(-1)?.content,
        'Einrichtung der Website angehalten: release returned 404. Klicken Sie im Tab Aufbau auf Erneut versuchen.'
      )
      assert.ok(todos.every((t) => t.status !== 'in_progress'))
      assert.equal(
        provisionTodos('failed', '', 'en')?.at(-1)?.content,
        'Site setup stopped. Press Try again in the Build tab.'
      )
    } finally {
      setWordsRoot(null)
    }
  })

  it('refuses a step the fleet does not report', () => {
    assert.equal(provisionTodos('mining bitcoin', '', 'en'), null)
  })
})
