/**
 * The requests the WordPress Build tool answers: `language.add` reruns the build from `seed` with
 * one more edition in the answer, and refuses what the archive does not ship or what needs a
 * question; `content.revise` reruns from `copy` with the changed brief fields.
 *
 *   node --test packages/site/tracy-site-build-wordpress/test/requests.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { requests } from '../src/host/requests.mjs'

const job = (languages) => ({ answers: { name: 'Bright Harbor', languages } })

test('language.add: a new language is appended and the build runs again from seed', () => {
  assert.deepEqual(requests['language.add'].change({ language: 'de-DE' }, job(['en-us', 'vi'])), {
    answers: { languages: ['en-us', 'vi', 'de-de'] },
    stage: 'seed'
  })
  // A bare code with one edition in the catalogue is that edition.
  assert.deepEqual(requests['language.add'].change({ language: 'vi' }, job(['en-us'])).answers.languages, [
    'en-us',
    'vi'
  ])
  // Already live: nothing appended, the seed still runs (the customer may want the words written again).
  assert.deepEqual(
    requests['language.add'].change({ language: 'vi' }, job(['en-us', 'vi'])).answers.languages,
    ['en-us', 'vi']
  )
})

test('language.add: a bare code with several editions asks the customer; a non-tag is refused', () => {
  assert.throws(() => requests['language.add'].change({ language: 'zh' }, job(['en-us'])), /Ask the customer/)
  assert.throws(
    () => requests['language.add'].change({ language: 'not a tag' }, job(['en-us'])),
    /not a language tag/
  )
  assert.throws(() => requests['language.add'].change({}, job(['en-us'])), /needs language/)
})

test('content.revise reruns from copy with the changed answers', () => {
  assert.deepEqual(requests['content.revise'].change({ answers: { about: 'New line' } }), {
    answers: { about: 'New line' },
    stage: 'copy'
  })
  assert.throws(() => requests['content.revise'].change({}), /needs answers/)
})

test('capabilities.json names a provider for every request, and the stages the requests rerun from exist', async () => {
  const catalog = JSON.parse(readFileSync(new URL('../src/host/capabilities.json', import.meta.url), 'utf8'))
  for (const name of Object.keys(requests))
    assert.ok(catalog.capabilities[name]?.provider, `${name} has a provider`)
  for (const cap of Object.values(catalog.capabilities))
    assert.ok(catalog.providers[cap.provider], `${cap.provider} is declared`)
  const { STAGES } = await import('../src/host/stages.mjs')
  // The stage each request asks to rerun from, as its own change() answers it.
  const reruns = [
    requests['language.add'].change({ language: 'de-DE' }, job(['en-us'])).stage,
    requests['content.revise'].change({ answers: { about: 'New line' } }).stage
  ]
  for (const stage of reruns) assert.ok(STAGES.includes(stage), `${stage} is not a stage`)
})
