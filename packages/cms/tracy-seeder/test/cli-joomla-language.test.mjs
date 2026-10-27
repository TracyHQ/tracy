import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { makeStages } from '../../../site/tracy-site-build-joomla/src/host/stages.mjs'
import { main } from '../src/cli.mjs'

test('the Build language stage receives the receipt written by the seeder for its own job', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'language-receipt-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const receipts = []
  let appliedId
  const apply = async ({ params }) => {
    // `language` asks the site whether it is sealed before planning; this one is.
    if (params.operation === 'inspect') return { ok: true, contract: 'tracy-apple/j6/1.1.0' }
    if (params.operation === 'multilingual.plan')
      return {
        ok: true,
        contract: 'tracy-apple/j6/1.1.0',
        revision: 'source-revision',
        locale: params.locale,
        creates: { modules: 1 },
        slots: [{ key: 'fr-FR::module-1.0', type: 'text', source: 'Hello', maxCharacters: 80 }]
      }
    if (params.operation === 'multilingual.package') return { ok: true, alreadyPresent: true }
    // The stage hides the languages nobody asked for before it derives one (Claude Cowork plugin 0.16.8).
    if (params.operation === 'multilingual.retire') return { ok: true, status: 'completed', hidden: {} }
    // And names the English edition first (Claude Cowork plugin 0.17.2): published en-GB, no variant asked.
    if (params.operation === 'sourceLanguage.plan') return { ok: true, published: 'en-GB', current: 'en-GB' }
    if (params.operation === 'multilingual.apply') {
      appliedId = params.apply_id
      return { ok: true, status: 'completed', phase: 'completed', created: 1 }
    }
    assert.equal(params.operation, 'multilingual.verify')
    return { ok: true, verified: true }
  }
  const stages = makeStages({
    root,
    apply,
    seeder: { command: 'seed-joomla', args: [] },
    doorOrigin: 'http://127.0.0.1:3000',
    chrome: null,
    run: async (_command, args) => {
      await main(args, {
        cwd: root,
        env: { DEEPSEEK_API_KEY: 'test-only-unused-key' },
        apply,
        translate: async (items) => items.map(({ i }) => ({ i, text: 'Bonjour' })),
        log: () => {}
      })
      return { code: 0, stdout: '', stderr: '' }
    }
  })
  // Two builds in the same workspace must each read their own completed language receipt.
  for (const target of ['first.example', 'second.example']) {
    const job = {
      job: `build-${target}`,
      inspiration: 'apple',
      targetSiteKey: target,
      ownerSessionId: 'session-test',
      answers: { name: 'Bakery', about: 'Fresh bread', languages: ['en', 'fr'] }
    }
    await stages.copy(job)
    const result = await stages.language(job)
    assert.equal(result.status, 'done')
    assert.ok(appliedId)
    assert.equal(result.lastApplyId, appliedId)
    receipts.push(result.lastApplyId)
  }
  assert.notEqual(receipts[0], receipts[1])
})

// 🔒 A JOB LEFT IN FLIGHT WITH OTHER WORDS IS TAKEN BACK, NOT WAITED ON FOREVER. The request id is the
// hash of the translations, so a retry whose words differ by one string names a different job, and
// the Claude Cowork plugin refuses it while the old one stands — measured 23/09/2026 on `j-ee6vsk`: "Another
// language job is in flight for vi-VN at phase articles" on every retry. `multilingual.revert`
// abandons an unfinished job of THIS language (its partial rows go with it); the run then plans again
// and starts clean. A job of ANOTHER language is not ours to take back.
function inFlightDoor(heldBy) {
  const calls = []
  let held = true
  const apply = async ({ params }) => {
    calls.push(params.operation)
    if (params.operation === 'multilingual.plan')
      return {
        ok: true,
        contract: 'tracy-apple/j6/1.1.0',
        revision: held ? 'rev-held' : 'rev-clean',
        locale: params.locale,
        creates: { modules: 1 },
        slots: [{ key: 'fr-FR::module-1.0', type: 'text', source: 'Hello', maxCharacters: 80 }]
      }
    if (params.operation === 'multilingual.package') return { ok: true, alreadyPresent: true }
    if (params.operation === 'multilingual.revert') {
      held = false
      return { ok: true, removed: true }
    }
    if (params.operation === 'multilingual.apply')
      return held
        ? {
            ok: false,
            error: 'conflict',
            message: `Another language job is in flight for ${heldBy} at phase articles`
          }
        : { ok: true, status: 'completed', phase: 'completed', created: 1 }
    return { ok: true, verified: true }
  }
  return { calls, apply }
}
const addFr = (root, apply) => {
  writeFileSync(
    path.join(root, 'preview.json'),
    JSON.stringify({ site: { name: 'Bakery', languages: ['en-GB', 'fr-FR'] } })
  )
  return main(
    [
      '--platform',
      'joomla',
      '--preview',
      'preview.json',
      '--target-site',
      'site.example',
      '--add-language',
      'fr-FR'
    ],
    {
      cwd: root,
      env: { DEEPSEEK_API_KEY: 'test-only-unused-key' },
      apply,
      translate: async (items) => items.map(({ i }) => ({ i, text: 'Bonjour' })),
      log: () => {}
    }
  )
}

test('a job of the same language left in flight with other words is taken back and started again', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'language-inflight-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const f = inFlightDoor('fr-FR')
  const result = await addFr(root, f.apply)
  assert.deepEqual(
    result.applied.map((a) => a.locale),
    ['fr-FR']
  )
  assert.equal(f.calls.filter((c) => c === 'multilingual.revert').length, 1)
  assert.ok(
    f.calls.lastIndexOf('multilingual.plan') > f.calls.indexOf('multilingual.revert'),
    'planned again after'
  )
})

test('a job of another language in flight is left alone', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'language-inflight-other-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const f = inFlightDoor('zh-CN')
  await assert.rejects(() => addFr(root, f.apply), /in flight for zh-CN/)
  assert.equal(f.calls.includes('multilingual.revert'), false)
})
