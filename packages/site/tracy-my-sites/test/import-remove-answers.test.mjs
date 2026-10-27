// The answers of removing an unfinished import, read as sentences (PR #1598 part 2): My Sites'
// Delete on such a row goes through the same Remove path as its Remove button, and its refusals —
// a read still going, a provision or another removal holding the site, a host that could not say
// (`HOST_UNAVAILABLE`, which a dsh image without the `hold` door also answers) — are refusals with a
// sentence, never a raw code or the "may have been deleted" of an unknown 5xx. Each sentence exists
// in every interface language, on both screens that show it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { readDeleteAnswer } from '../src/client/delete-response.ts'
import { rowErrorKey } from '../src/client/row-errors.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const locales = path.join(here, '..', '..', '..', 'locale')
const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

test('an unreachable host on an unfinished import is a refusal: nothing was removed, try later', async () => {
  const read = await readDeleteAnswer(answer(503, { code: 'HOST_UNAVAILABLE' }))
  assert.deepEqual(read, { kind: 'refused', status: 503, code: 'HOST_UNAVAILABLE' })
  assert.equal(rowErrorKey(503, 'HOST_UNAVAILABLE'), 'removeImport.later')
  assert.equal(rowErrorKey(503, 'REMOVE_INCOMPLETE'), 'removeImport.later')
  assert.equal((await readDeleteAnswer(answer(503, { code: 'REMOVE_INCOMPLETE' }))).kind, 'refused')
  // Any other 5xx still claims no outcome.
  assert.deepEqual(await readDeleteAnswer(answer(503, { code: 'SOMETHING_ELSE' })), { kind: 'unknown' })
})

test('a read still going, and a site held by a provision or another removal, each have their sentence', () => {
  assert.equal(rowErrorKey(409, 'IMPORT_RUNNING'), 'removeImport.running')
  assert.equal(rowErrorKey(409, 'IMPORT_BUSY'), 'removeImport.later')
  assert.equal(rowErrorKey(409, 'IMPORT_REMOVING'), 'removeImport.later')
  assert.equal(rowErrorKey(409, 'TEARDOWN_FAILED'), 'error.deleteHostFailed')
})

test('the sentences exist in all eight interface languages, in My Sites and on the recovery page', async () => {
  const { en: mySites } = await import('../src/client/strings.ts')
  const { en: addSite } = await import('../../tracy-add-site/src/client/strings.ts')
  const want = {
    'tracy-my-sites': ['removeImport.later', 'removeImport.running'],
    'tracy-add-site': ['import_remove_later', 'import_remove_running']
  }
  for (const key of want['tracy-my-sites']) assert.ok(mySites[key], `en ${key}`)
  for (const key of want['tracy-add-site']) assert.ok(addSite[key], `en ${key}`)
  for (const lang of ['vi', 'de', 'it', 'fr', 'nl', 'zh', 'es'])
    for (const [ns, keys] of Object.entries(want)) {
      const file = lang === 'vi' ? `tracy-locale-vi/vi/${ns}.json` : `tracy-locales/${lang}/${ns}.json`
      const table = JSON.parse(readFileSync(path.join(locales, file), 'utf8'))
      for (const key of keys) {
        assert.equal(typeof table[key], 'string', `${lang} ${ns}.${key}`)
        assert.doesNotMatch(table[key], /HOST_UNAVAILABLE|IMPORT_/, `${lang} ${ns}.${key} names no code`)
      }
    }
})
