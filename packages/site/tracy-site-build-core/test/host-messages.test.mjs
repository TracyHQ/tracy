/**
 * The host's own sentences carry a code next to their English (spec #730): the host fills the
 * English for the log and the agent, the client reads the code through `t('host.<code>')`. These
 * pin the table, the helpers stages use to write a coded detail, and the rule that a site's own
 * words are never given a code (they are not Tracy's to translate).
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { detailOf, HOST_MESSAGES, hostKeys, hostMessage, messageOf } from '../src/host-messages.mjs'
import { checkStage, refusalDetail, refusalWords, sayDetail } from '../src/host/stages-shared.mjs'
import { runJob } from '../src/host/build.mjs'

test('hostMessage fills the English and keeps the code and the values it was filled with', () => {
  const said = hostMessage('SITE_SILENT', { site: 'wp-demo' })
  assert.deepEqual(said, {
    text: 'wp-demo did not answer.',
    code: 'SITE_SILENT',
    params: { site: 'wp-demo' }
  })
})

test('a plugin table is read first, the shared table second', () => {
  const table = Object.freeze({ X_ONLY: 'Only {who}.' })
  assert.equal(hostMessage('X_ONLY', { who: 'here' }, table).text, 'Only here.')
  assert.equal(hostMessage('SITE_UNNAMED', {}, table).text, HOST_MESSAGES.SITE_UNNAMED)
})

test('an unknown code throws instead of shipping a sentence nobody can translate', () => {
  assert.throws(() => hostMessage('NOT_A_CODE'), /Unknown host message code: NOT_A_CODE/)
})

test('detailOf and messageOf name the fields a stage result and a refusal answer carry', () => {
  assert.deepEqual(detailOf('NO_SEEDER'), {
    detail: HOST_MESSAGES.NO_SEEDER,
    detailCode: 'NO_SEEDER'
  })
  assert.deepEqual(messageOf('START_MISSING_REQUIRED', { missing: 'name, about' }), {
    message: 'Answer the required questions first: name, about.',
    messageCode: 'START_MISSING_REQUIRED',
    messageParams: { missing: 'name, about' }
  })
})

test('hostKeys spreads a table into client keys under host.', () => {
  const keys = hostKeys(Object.freeze({ A_B: 'One.', C: 'Two {n}.' }))
  assert.deepEqual(keys, { 'host.A_B': 'One.', 'host.C': 'Two {n}.' })
})

test('every shared code is SCREAMING_SNAKE, the shape the client accepts as a code', () => {
  for (const code of Object.keys(HOST_MESSAGES)) assert.match(code, /^[A-Z][A-Z0-9_]*$/, code)
})

test('sayDetail: a door that said something is shown as it said it, with no code', () => {
  assert.deepEqual(
    sayDetail({ ok: false, message: 'install_failed: disk full' }, 'SITE_SILENT', { site: 's' }),
    {
      detail: 'install_failed: disk full'
    }
  )
  assert.deepEqual(sayDetail({ ok: false }, 'SITE_SILENT', { site: 's' }), {
    detail: 's did not answer.',
    detailCode: 'SITE_SILENT',
    detailParams: { site: 's' }
  })
})

test('refusalDetail: a known refusal reads as its shared sentence, under its own code', () => {
  assert.deepEqual(refusalDetail({ ok: false, code: 'NO_VIEWER' }, 'SITE_SILENT', { site: 's' }), {
    detail: HOST_MESSAGES.NOT_SIGNED_IN,
    detailCode: 'NOT_SIGNED_IN'
  })
  // The words a refusal brings win over everything, and they get no code.
  assert.deepEqual(refusalDetail({ ok: false, code: 'NOT_SIGNED_IN', message: 'expired' }, 'SITE_SILENT'), {
    detail: 'expired'
  })
  // And the string form still answers exactly what it did.
  assert.equal(refusalWords({ code: 'SEAT_NOT_AUTHORIZED' }, 'x'), HOST_MESSAGES.SEAT_NOT_AUTHORIZED)
})

test('a stage that fails on a host sentence carries its code; the engine keeps it on the stage', async () => {
  const check = checkStage({ ids: new Set(['minimal']), apply: null, platform: 'wordpress' })
  const result = await check(/** @type {any} */ ({ inspiration: 'minimal', targetSiteKey: 'site-x' }))
  assert.equal(result.detailCode, 'NO_DOOR')
  assert.equal(result.detail, HOST_MESSAGES.NO_DOOR)

  const root = mkdtempSync(path.join(tmpdir(), 'host-messages-'))
  const job = /** @type {any} */ ({
    schemaVersion: 'tracy-site-build/v1',
    job: 'build-test',
    inspiration: 'minimal',
    platform: 'wordpress',
    status: 'running',
    startedAt: new Date().toISOString(),
    stages: [{ name: 'check', status: 'pending' }],
    runs: 0
  })
  const settled = await runJob(root, job, {
    check: () => ({
      status: 'failed',
      ...detailOf('WRONG_PLATFORM', { site: 's', cms: 'Joomla', platform: 'WordPress' })
    })
  })
  assert.equal(settled.stages[0].detailCode, 'WRONG_PLATFORM')
  assert.deepEqual(settled.stages[0].detailParams, { site: 's', cms: 'Joomla', platform: 'WordPress' })

  // A thrown refusal carries the sentence's code the same way.
  job.stages = [{ name: 'check', status: 'pending' }]
  const thrown = await runJob(root, job, {
    check: () => {
      throw Object.assign(new Error(HOST_MESSAGES.SITE_UNNAMED), { detailCode: 'SITE_UNNAMED', code: 'X' })
    }
  })
  assert.equal(thrown.stages[0].detailCode, 'SITE_UNNAMED')
  assert.equal(thrown.stages[0].code, 'X')
})
