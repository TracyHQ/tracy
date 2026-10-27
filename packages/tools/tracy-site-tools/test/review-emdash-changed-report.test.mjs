/**
 * Review (09/10/2026): an EmDash `content.replace` writes through the site's own MCP, never the Apply
 * door, so `index.ts` reports it on `POST /changed` only when `emdashReplaceWrote(answer)` says it
 * wrote. That test reads `changed`; the replace job's PARTIAL answer — some places written, then a
 * refusal — names what landed under `written` and carries no `changed`. So a write that landed is
 * never reported: no `site_write` row (Site changes tab), no `last_write_at` stamp (Refresh button),
 * no "Done by Tracy" on the comment it answered.
 *
 * `emdash.test.mjs` pins `emdashReplaceWrote({ok:false, code:'PARTIAL', changed:[…]})` → true, a
 * shape the job never produces. This file drives the job itself to its real PARTIAL answer. It failed
 * on develop 6d8434735; `emdashReplaceWrote` now reads `written` too.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { emdashReplaceWrote } from '../src/host/emdash.mjs'
import {
  EMDASH_INDEX_SCRIPT,
  EMDASH_WRITE_SCRIPT,
  parseEmdashIndex,
  parseEmdashWrite
} from '../src/host/exec.mjs'
import { replaceOnEmdash } from '../src/host/replace-emdash.mjs'
import { planReplace } from '../src/host/replace.mjs'
import { createFakeEmdash, runScript } from './fixtures/replace/emdash/fake-emdash.mjs'

const SITE = JSON.parse(readFileSync(new URL('./fixtures/replace/emdash/site.json', import.meta.url), 'utf8'))
const HOME = readFileSync(new URL('./fixtures/replace/pages/emdash-home.html', import.meta.url), 'utf8')

test('a PARTIAL EmDash replace that wrote 4 places is reported as a write', async () => {
  // The same fault `replace-emdash.test.mjs` uses: every language but Vietnamese is written.
  const emdash = createFakeEmdash(SITE, {
    fault: (/** @type {string} */ name, /** @type {any} */ args) =>
      name === 'content_update' && args.locale === 'vi' ? { isError: '[INTERNAL] disk full' } : undefined
  })
  const out = /** @type {any} */ (
    await replaceOnEmdash({
      plan: planReplace({ find: '8 800 550-67-89', replace: '0909 123 456', path: '/', all: true }),
      index: async (/** @type {any} */ req) =>
        parseEmdashIndex(await runScript(EMDASH_INDEX_SCRIPT, { fetch: emdash.fetch, stdin: req })),
      write: async (/** @type {any} */ req) =>
        parseEmdashWrite(await runScript(EMDASH_WRITE_SCRIPT, { fetch: emdash.fetch, stdin: req })),
      pageHtml: async () => ({ ok: true, status: 200, html: HOME }),
      artifact: SITE.artifact,
      label: 'benchemdash01',
      verify: false
    })
  )
  assert.equal(out.code, 'PARTIAL')
  assert.equal(out.written.length, 4, 'four places landed on the site')
  const landed = emdash.calls.filter((c) => c.name === 'content_update' && c.args.locale !== 'vi')
  assert.ok(landed.length > 0, 'the fake site took writes')

  assert.equal(
    emdashReplaceWrote(out),
    true,
    `the PARTIAL answer (keys: ${Object.keys(out).join(',')}) is not reported on POST /changed`
  )
})

test('an OUTCOME_UNKNOWN EmDash replace that names places already written is reported as a write', () => {
  // `unknownAnswer` (replace-emdash.mjs): `written` = the places that landed before the exec died.
  const answer = {
    ok: false,
    code: 'OUTCOME_UNKNOWN',
    written: ['site/site@en#hotline'],
    unknown: ['site/site@ru#hotline'],
    undo: { action: 'content.replace', params: { restore: [] } }
  }
  assert.equal(emdashReplaceWrote(answer), true)
})
