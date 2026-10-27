/**
 * The fake-model positive control: a scripted model's tool calls go through the REAL agent loop,
 * tool dispatcher, the Tracy `tools/pre-execute` hooks and the provider; the trace shows every stage.
 * What is a seam (docker CLI, tracy-web doors) is named in the assertions that touch it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'

import { runFenceVariant } from '../fence.mjs'
import { applyMutantForTest } from './mutant-helper.mjs'
import {
  SENTINEL,
  canaryHashes,
  createRuntime,
  probeRuntime,
  removeScratch,
  tmpRootFor
} from '../runtime.mjs'
import { standardOptions } from '../scenarios.mjs'

const base = fs.mkdtempSync(path.join(process.env.QA_HARNESS_ARTIFACT_ROOT ?? os.tmpdir(), 'runtime-'))
after(() => fs.rmSync(base, { recursive: true, force: true }))
const missing = probeRuntime()
const t = (name, fn) => test(name, { skip: missing.length > 0 ? `ENV: ${missing[0]}` : false }, fn)

t('scripted model → loop → dispatcher → Tracy hook → provider: every stage leaves a trace', async () => {
  const root = tmpRootFor(base, 'chain')
  const rt = await createRuntime({ root, ...standardOptions() })
  try {
    const A = rt.world.sites.a1
    const B = rt.world.sites.b1
    const before = canaryHashes(rt.world)
    const sess = await rt.session({ cwd: A.dir })
    const r = await rt.drive(sess, [
      { calls: [{ name: 'read', args: { file_path: A.own } }] },
      { calls: [{ name: 'read', args: { file_path: B.canary } }] },
      { calls: [{ name: 'bash', args: { command: 'echo hi', description: 'hi', workdir: A.dir } }] },
      { text: 'done' }
    ])
    // stage 1: the model was asked once per step, by the real loop
    assert.equal(r.trace.modelRequests, 4)
    // stage 2: the loop dispatched three calls, in order, to the real dispatcher
    assert.deepEqual(
      r.calls.map((c) => c.name),
      ['read', 'read', 'bash']
    )
    assert.equal(r.results.length, 3)
    // stage 3: the Tracy hook denied exactly the call into site B, with its own sentence and a log line
    assert.equal(r.results[1].isError, true)
    assert.match(
      r.results[1].text,
      /^Error: subprocess-docker: read file_path .* is outside the session's site/
    )
    assert.equal(r.trace.denials.length, 1)
    assert.match(r.trace.denials[0], /guard=path tool=read arg=file_path site=a1/)
    // stage 4: the file backend saw site A's file and never site B's
    assert.ok(r.trace.fsOps.some((op) => op.path === A.own))
    assert.ok(r.trace.fsOps.every((op) => !op.path.includes('/b1/')))
    // stage 5 (seam: the docker CLI is a recorder): the provider rewrote bash into a docker exec into a1's container
    const execs = rt.execs().filter((e) => !e.reaper)
    assert.equal(execs.length, 1)
    assert.deepEqual(
      [execs[0].container, execs[0].user, execs[0].workdir],
      ['a1-web-1', 'www-data', '/site/a1']
    )
    // the canaries were not read and did not change
    assert.ok(![SENTINEL.siteB, SENTINEL.host].some((s) => r.results.some((x) => x.text.includes(s))))
    assert.deepEqual(canaryHashes(rt.world), before)
    // the Site changes record was opened and closed for this turn, as the person who typed (seam: the doors)
    assert.deepEqual(
      r.trace.doorRequests.filter((d) => d.method === 'POST').map((d) => d.url.split('/').pop()),
      ['turn', 'moment']
    )
  } finally {
    await rt.dispose()
    removeScratch(root, base)
  }
})

t('the scripted model is deterministic: the same seed gives the same call ids', async () => {
  const ids = []
  for (let i = 0; i < 2; i += 1) {
    const root = tmpRootFor(base, 'seed')
    const rt = await createRuntime({ root, ...standardOptions(), seed: 7 })
    try {
      const sess = await rt.session({ cwd: rt.world.sites.a1.dir })
      const r = await rt.drive(sess, [
        { calls: [{ name: 'read', args: { file_path: rt.world.sites.a1.own } }] }
      ])
      ids.push(r.calls.map((c) => c.callId.replace(/^qa-\d+-\d+-/, '')))
    } finally {
      await rt.dispose()
      removeScratch(root, base)
    }
  }
  assert.deepEqual(ids[0], ids[1])
})

t(
  'a stream that breaks, a provider that fails and an unknown tool each end the turn in bounded time',
  async () => {
    const root = tmpRootFor(base, 'fail')
    const rt = await createRuntime({ root, ...standardOptions() })
    try {
      const sess = await rt.session({ cwd: rt.world.sites.a1.dir })
      for (const script of [
        [{ error: 'provider down' }],
        [{ breakStream: 'cut', partial: 'abc' }],
        [{ calls: [{ name: 'no_such_tool', args: {} }] }]
      ]) {
        const r = await rt.drive(sess, script, { deadlineMs: 20000 })
        assert.equal(r.settled, true)
        assert.equal(r.turnEnds.length, 1)
      }
    } finally {
      await rt.dispose()
      removeScratch(root, base)
    }
  }
)

t(
  'RED machinery: a recorded mutation of the fence turns the traversal case red, and the positive control stays green',
  async () => {
    const root = tmpRootFor(base, 'red')
    const scratch = tmpRootFor(base, 'mutant')
    const mutated = await applyMutantForTest('fence-bypass:file-tools', scratch)
    const rt = await createRuntime({ root, ...standardOptions(), productDirs: mutated.productDirs })
    try {
      const result = await runFenceVariant(rt, 'read', 'traversal-abs')
      assert.ok(
        result.controls.every((c) => c.ok),
        'the mutant boots and the control (read works inside the site) holds'
      )
      const failed = result.checks.filter((c) => !c.ok).map((c) => c.id)
      assert.ok(failed.includes('denied-1'), `the escape was not denied on the mutant: ${failed}`)
      assert.ok(mutated.changed.every((c) => /^[0-9a-f]{64}$/.test(c.sha256)))
    } finally {
      await rt.dispose()
      removeScratch(root, base)
      removeScratch(scratch, base)
    }
  }
)

t('product tree is untouched by a mutation (scratch copy only)', async () => {
  const { execFileSync } = await import('node:child_process')
  const before = execFileSync('git', ['status', '--porcelain', 'packages/tools/tracy-subprocess-docker'], {
    encoding: 'utf8'
  })
  const scratch = tmpRootFor(base, 'mutant2')
  await applyMutantForTest('fence-no-realpath', scratch)
  const after2 = execFileSync('git', ['status', '--porcelain', 'packages/tools/tracy-subprocess-docker'], {
    encoding: 'utf8'
  })
  assert.equal(after2, before)
  removeScratch(scratch, base)
})

t('a read into the sibling-prefix site is denied: a1x is not a1', async () => {
  const root = tmpRootFor(base, 'sibling')
  const rt = await createRuntime({ root, ...standardOptions() })
  try {
    const result = await runFenceVariant(rt, 'read', 'boundary-prefix-sibling')
    assert.ok(result.controls.length > 0 && result.controls.every((c) => c.ok), 'read works inside a1')
    assert.ok(result.checks.length > 0)
    assert.deepEqual(
      result.checks.filter((c) => !c.ok).map((c) => c.id),
      [],
      'the read of a1x/canary.txt was not denied'
    )
  } finally {
    await rt.dispose()
    removeScratch(root, base)
  }
})
