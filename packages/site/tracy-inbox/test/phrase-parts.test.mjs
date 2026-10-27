import assert from 'node:assert/strict'
import { test } from 'node:test'

import { phraseParts, SITE_MARK } from '../src/client/phrase-parts.ts'

const M = SITE_MARK

test('the phrase is cut around the site', () => {
  assert.deepEqual(phraseParts(`Mentioned you on ${M}`), {
    before: [{ text: 'Mentioned you on ', verb: false }],
    hasSite: true,
    after: []
  })
  assert.deepEqual(phraseParts(`Changed your role on ${M} to Admin`), {
    before: [{ text: 'Changed your role on ', verb: false }],
    hasSite: true,
    after: [{ text: ' to Admin', verb: false }]
  })
})

test('the verb is cut out of the side that holds it', () => {
  assert.deepEqual(phraseParts(`Left ${M}`, 'Left').before, [
    { text: 'Left', verb: true },
    { text: ' ', verb: false }
  ])
  // German puts the participle after the site.
  const de = phraseParts(`Hat ${M} verlassen`, 'verlassen')
  assert.deepEqual(de.before, [{ text: 'Hat ', verb: false }])
  assert.deepEqual(de.after, [
    { text: ' ', verb: false },
    { text: 'verlassen', verb: true }
  ])
})

test('a phrase without the site shows no link, and a missing verb leaves the text plain', () => {
  assert.deepEqual(phraseParts('Joined', 'Left'), {
    before: [{ text: 'Joined', verb: false }],
    hasSite: false,
    after: []
  })
})

test('in every interface language, each act phrase names the site exactly once', async () => {
  const { readFileSync } = await import('node:fs')
  const { en } = await import('../src/client/strings.ts')
  const root = new URL('../../../locale/', import.meta.url)
  const dicts = { en }
  dicts.vi = JSON.parse(readFileSync(new URL('tracy-locale-vi/vi/tracy-inbox.json', root), 'utf8'))
  for (const lang of ['de', 'it', 'fr', 'nl', 'zh', 'es']) {
    dicts[lang] = JSON.parse(readFileSync(new URL(`tracy-locales/${lang}/tracy-inbox.json`, root), 'utf8'))
  }
  for (const [lang, dict] of Object.entries(dicts)) {
    for (const key of Object.keys(en).filter((k) => k.startsWith('act.'))) {
      assert.equal(dict[key]?.split('{site}').length, 2, `${lang} ${key}`)
    }
  }
})
