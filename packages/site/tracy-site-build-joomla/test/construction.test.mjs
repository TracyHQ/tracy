import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { constructionFile } from '../src/host/construction.mjs'
import { makeStages } from '../src/host/stages.mjs'

test('a Base restore waits for the design builder and never feeds its slots to the existing seeder', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'base-build-'))
  try {
    const job = {
      job: 'job1',
      inspiration: 'stripe',
      targetSiteKey: 'new.example.test',
      answers: { name: 'New', about: 'A business', languages: ['en', 'ru'] },
      designPlan: {
        workflow: 'template-build',
        requestedDesign: 'stripe',
        contractProfile: 'tracy-base/j6/1.0.0'
      }
    }
    let contract = 'tracy-base/j6/1.0.0'
    const stages = makeStages({
      root,
      apply: async () => ({ ok: true, contract }),
      run: async () => {
        throw new Error('must not seed Base slots')
      }
    })
    assert.equal((await stages.check(job)).status, 'done')
    assert.equal((await stages.template(job)).status, 'waiting')
    const brief = JSON.parse(readFileSync(constructionFile(root, job), 'utf8'))
    assert.equal(brief.targetSiteKey, 'new.example.test')
    assert.equal(brief.design, 'stripe')
    assert.deepEqual(brief.site.languages, ['en', 'ru'])
    contract = 'tracy-apple/j6/1.1.0'
    assert.equal((await stages.template(job)).status, 'waiting')
    contract = 'tracy-stripe/j6/1.0.0'
    assert.equal((await stages.template(job)).status, 'waiting')
    writeFileSync(
      path.join(path.dirname(constructionFile(root, job)), 'template-review.json'),
      JSON.stringify({
        job: job.job,
        targetSiteKey: job.targetSiteKey,
        design: 'stripe',
        profile: contract,
        languages: ['en', 'ru'],
        routes: ['/'],
        checks: { visual: true, responsive: true, interactions: true, content: true, undo: true }
      })
    )
    assert.equal((await stages.template(job)).status, 'done')
    assert.equal((await stages.seed(job)).status, 'skipped')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('check: a lane with nobody to act as yet (NO_VIEWER) is asked again, a refusing Claude Cowork plugin is not — and each says which', async () => {
  const { mkdtempSync: mk, rmSync: rm } = await import('node:fs')
  const root = mk(path.join(tmpdir(), 'base-check-'))
  try {
    const job = {
      job: 'job1',
      inspiration: 'stripe',
      targetSiteKey: 'new.example.test',
      answers: { name: 'New' },
      designPlan: {
        workflow: 'template-build',
        requestedDesign: 'stripe',
        contractProfile: 'tracy-base/j6/1.0.0'
      }
    }
    // `NO_VIEWER`, then `NOT_SIGNED_IN` (the beat between the brief and its stamp), then the manifest.
    let asks = 0
    const waits = []
    const beats = [
      { ok: false, code: 'NO_VIEWER', error: 'Nobody has this lane open' },
      { ok: false, code: 'NOT_SIGNED_IN' }
    ]
    const patient = makeStages({
      root,
      apply: async () => beats[asks++] ?? { ok: true, manifest: {} },
      run: async () => {},
      wait: async (ms) => {
        waits.push(ms)
      }
    })
    assert.equal((await patient.check(job)).status, 'done')
    assert.equal(asks, 3)
    assert.deepEqual(waits, [2000, 2000])
    // Gives up after its tries, and says it was the lane, not the Claude Cowork plugin.
    asks = 0
    const never = makeStages({
      root,
      apply: async () => ({ ok: false, code: 'NO_VIEWER', error: 'Nobody has this lane open' }),
      run: async () => {},
      wait: async () => {}
    })
    const gaveUp = await never.check(job)
    assert.equal(gaveUp.status, 'failed')
    assert.match(gaveUp.detail, /could not be reached yet \(NO_VIEWER\)/)
    // A Claude Cowork plugin that REFUSES is failed at once, with its own code.
    asks = 0
    const refused = makeStages({
      root,
      apply: async () => {
        asks++
        return { ok: false, code: 'component_unpaired', error: 'no token on file' }
      },
      run: async () => {},
      wait: async () => assert.fail('a refusal is not retried')
    })
    const answer = await refused.check(job)
    assert.equal(answer.status, 'failed')
    assert.equal(asks, 1)
    assert.match(answer.detail, /refused \(component_unpaired\): no token on file/)
  } finally {
    rm(root, { recursive: true, force: true })
  }
})

test('style (template-build): the Base demo notice module is unpublished once the profile verifies', async () => {
  const { mkdtempSync: mk, rmSync: rm } = await import('node:fs')
  const root = mk(path.join(tmpdir(), 'base-style-'))
  try {
    const job = {
      job: 'job1',
      inspiration: 'stripe',
      targetSiteKey: 'new.example.test',
      answers: { name: 'New' },
      designPlan: {
        workflow: 'template-build',
        requestedDesign: 'stripe',
        contractProfile: 'tracy-base/j6/1.0.0'
      }
    }
    const calls = []
    const stages = makeStages({
      root,
      apply: async (call) => {
        calls.push(call)
        if (call.action === 'content.contract') return { ok: true, contract: 'tracy-stripe/j6/1.0.0' }
        if (call.action === 'content.list')
          return {
            ok: true,
            items: [
              { id: 252, title: '[Tracy Base] Global - Demo notice', module: 'mod_ja_acm', published: 1 },
              {
                id: 175,
                title: '[Tracy Base] Footer - Contact information',
                module: 'mod_ja_acm',
                published: 1
              },
              { id: 9, title: '[Tracy Base] Home - Demo notice', module: 'mod_ja_acm', published: 0 }
            ]
          }
        if (call.action === 'content.update') return { ok: true, id: call.params.id }
        return { ok: false, code: 'unexpected' }
      },
      run: async () => {}
    })
    // The builder's review, as `inspectConstruction` requires it before the profile counts.
    const { mkdirSync: mkd, writeFileSync: wf } = await import('node:fs')
    mkd(path.dirname(constructionFile(root, job)), { recursive: true })
    wf(
      path.join(path.dirname(constructionFile(root, job)), 'template-review.json'),
      JSON.stringify({
        job: job.job,
        targetSiteKey: job.targetSiteKey,
        design: 'stripe',
        profile: 'tracy-stripe/j6/1.0.0',
        languages: ['en'],
        routes: ['/'],
        checks: { visual: true, responsive: true, interactions: true, content: true, undo: true }
      })
    )
    const result = await stages.style(job)
    assert.equal(result.status, 'done', result.detail)
    assert.match(result.detail, /1 Base demo module\(s\) unpublished/)
    const updates = calls.filter((c) => c.action === 'content.update')
    assert.deepEqual(
      updates.map((c) => [c.params.kind, c.params.id, c.params.fields]),
      [['module', 252, { published: 0 }]],
      'only the published demo notice; the contact block and an already-unpublished notice are left alone'
    )
    assert.ok(
      updates.every((c) => typeof c.params.apply_id === 'string' && c.params.apply_id !== ''),
      'every write files its undo'
    )
  } finally {
    rm(root, { recursive: true, force: true })
  }
})

test('style/template (template-build): a Claude Cowork plugin that refuses fails with its code; a lane not ready yet is asked again', async () => {
  const { mkdtempSync: mk, rmSync: rm, mkdirSync: mkd, writeFileSync: wf } = await import('node:fs')
  const root = mk(path.join(tmpdir(), 'base-inspect-'))
  try {
    const job = {
      job: 'job1',
      inspiration: 'stripe',
      targetSiteKey: 'new.example.test',
      answers: { name: 'New' },
      designPlan: {
        workflow: 'template-build',
        requestedDesign: 'stripe',
        contractProfile: 'tracy-base/j6/1.0.0'
      }
    }
    mkd(path.dirname(constructionFile(root, job)), { recursive: true })
    wf(
      path.join(path.dirname(constructionFile(root, job)), 'template-review.json'),
      JSON.stringify({
        job: 'job1',
        targetSiteKey: 'new.example.test',
        design: 'stripe',
        profile: 'tracy-stripe/j6/1.0.0',
        languages: ['en'],
        routes: ['/'],
        checks: { visual: true, responsive: true, interactions: true, content: true, undo: true }
      })
    )
    // A broken token: the Claude Cowork plugin refuses (409 component_unpaired). Failed at once, code named.
    const refusing = makeStages({
      root,
      apply: async () => ({ ok: false, code: 'component_unpaired', error: 'token rejected' }),
      run: async () => {},
      wait: async () => assert.fail('no retry on a refusal')
    })
    const styled = await refusing.style(job)
    assert.equal(styled.status, 'failed')
    assert.match(styled.detail, /did not answer the inspection \(component_unpaired\): token rejected/)
    const templated = await refusing.template(job)
    assert.equal(templated.status, 'failed', 'a refusing Claude Cowork plugin is not "build it again"')
    // Nobody to act as yet (a session just attached, before its first prompt): asked again, then done.
    let asks = 0
    const patient = makeStages({
      root,
      apply: async (call) => {
        if (call.action === 'content.contract')
          return ++asks < 2
            ? { ok: false, code: 'NOT_SIGNED_IN' }
            : { ok: true, contract: 'tracy-stripe/j6/1.0.0' }
        if (call.action === 'content.list') return { ok: true, items: [] }
        return { ok: true }
      },
      run: async () => {},
      wait: async () => {}
    })
    assert.equal((await patient.style(job)).status, 'done')
    // A site genuinely still on the Base profile: waiting for the builder, and the detail says so.
    const unbuilt = makeStages({
      root,
      apply: async () => ({ ok: true, contract: 'tracy-base/j6/1.0.0' }),
      run: async () => {}
    })
    assert.equal((await unbuilt.template(job)).status, 'waiting')
    // The review names a profile the site does not carry, and that is what the detail says.
    assert.match((await unbuilt.style(job)).detail, /template-review\.json does not describe this build/)
  } finally {
    rm(root, { recursive: true, force: true })
  }
})
