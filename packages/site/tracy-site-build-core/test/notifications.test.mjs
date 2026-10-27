import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { notifyBuild } from '../src/host/notifications.mjs'
import { createJob, readJob, runJob } from '../src/host/build.mjs'

test('completion wakes only the owner, once across reporter recreation; a rerun has its own event', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-notification-'))
  try {
    const job = createJob(root, {
      id: 'apple',
      platform: 'joomla',
      stages: ['seed'],
      ownerSessionId: 'owner',
      targetSiteKey: 'new.example'
    })
    const messages = []
    const deps = {
      plugin: 'build',
      getAgent: (id) => {
        assert.equal(id, 'owner')
        return { followup: (message) => messages.push(message) }
      }
    }
    assert.equal(notifyBuild(root, job, deps), false)
    await runJob(root, job, { seed: () => ({ status: 'done' }) })
    assert.equal(notifyBuild(root, job, deps), true)
    assert.equal(notifyBuild(root, readJob(root), { ...deps }), false)
    assert.equal(messages.length, 1)
    assert.deepEqual(messages[0].source, { kind: 'tracy-build', producer: 'build' })
    job.runs++
    assert.equal(notifyBuild(root, job, deps), true)
    assert.equal(messages.length, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an offline agent leaves the completion available for a later poll', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-offline-'))
  try {
    const job = createJob(root, {
      id: 'apple',
      platform: 'joomla',
      stages: ['seed'],
      ownerSessionId: 'owner'
    })
    await runJob(root, job, { seed: () => ({ status: 'done' }) })
    assert.equal(notifyBuild(root, job, { plugin: 'build', getAgent: () => undefined }), false)
    let received = false
    assert.equal(
      notifyBuild(root, job, {
        plugin: 'build',
        getAgent: () => ({
          followup: () => {
            received = true
          }
        })
      }),
      true
    )
    assert.equal(received, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a requested site never falls back to another site in the folder', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-isolation-'))
  try {
    createJob(root, { id: 'apple', platform: 'joomla', stages: ['seed'], targetSiteKey: 'one.example' })
    assert.equal(readJob(root, 'two.example'), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a personalize the template could not do becomes the agent's turn, with the answers named", async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-personalize-'))
  try {
    const job = createJob(root, {
      id: 'tracy-saas',
      platform: 'emdash',
      stages: ['personalize', 'shot'],
      answers: { name: 'Khu Du lich Dai Nam', sector: 'tourism' },
      ownerSessionId: 'owner',
      targetSiteKey: 'site-u2ll3a.tracy.site'
    })
    const messages = []
    await runJob(root, job, {
      personalize: () => ({
        status: 'skipped',
        code: 'PERSONALIZE_BY_AGENT',
        detail:
          "this template ships no personalize tool; the agent writes the customer's words in with tracy_emdash"
      }),
      shot: () => ({ status: 'done' })
    })
    assert.equal(
      notifyBuild(root, job, { plugin: 'build', getAgent: () => ({ followup: (m) => messages.push(m) }) }),
      true
    )
    const said = JSON.stringify(messages[0])
    assert.match(said, /your work now/, 'the agent is told whose turn it is')
    assert.match(said, /tracy_emdash/)
    assert.match(said, /emdash-site skill/)
    // One write per entry: the update publishes, so there is no separate publish step to take.
    assert.match(said, /one content_update with only the fields an answer gives and status \\"published\\"/)
    assert.doesNotMatch(said, /publish it/)
    assert.match(said, /docs.agents.build.job\.json/, 'it says where the answers are')
    assert.match(said, /name, sector/, 'and which answers the customer gave')
    assert.match(said, /empty beats invented/, 'without licence to invent the facts they did not give')
    assert.doesNotMatch(
      said,
      /Tell the customer the result briefly/,
      'the generic line is what made the agent read the skip back as a limitation'
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
test('a Joomla quickstart with no contract hands its words to the agent through tracy_site', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-personalize-joomla-'))
  try {
    const job = createJob(root, {
      id: 'ja-vega',
      platform: 'joomla',
      stages: ['seed', 'shot'],
      answers: { name: 'Vega', about: 'A landing page' },
      ownerSessionId: 'owner',
      targetSiteKey: 'site-gfxzba.tracy.site'
    })
    const messages = []
    await runJob(root, job, {
      seed: () => ({ status: 'skipped', code: 'PERSONALIZE_BY_AGENT', detail: 'no content contract' }),
      shot: () => ({ status: 'done' })
    })
    assert.equal(
      notifyBuild(root, job, { plugin: 'build', getAgent: () => ({ followup: (m) => messages.push(m) }) }),
      true
    )
    const said = JSON.stringify(messages[0])
    assert.match(said, /your work now/)
    assert.match(said, /tracy_site/)
    assert.match(said, /content\.update/)
    assert.doesNotMatch(said, /tracy_emdash/, 'a Joomla site has no EmDash MCP server')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
test('a WordPress template card hands its words to the agent through tracy_site, not tracy_emdash', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-personalize-wordpress-'))
  try {
    const job = createJob(root, {
      id: 'tracy-business',
      platform: 'wordpress',
      stages: ['seed', 'shot'],
      answers: { name: 'Northgate Bakery', about: 'A bakery' },
      ownerSessionId: 'owner',
      targetSiteKey: 'site-h75639.tracy.test'
    })
    const messages = []
    await runJob(root, job, {
      seed: () => ({ status: 'skipped', code: 'PERSONALIZE_BY_AGENT', detail: 'no content contract' }),
      shot: () => ({ status: 'done' })
    })
    notifyBuild(root, job, { plugin: 'build', getAgent: () => ({ followup: (m) => messages.push(m) }) })
    const said = JSON.stringify(messages[0])
    assert.match(said, /tracy_site/)
    assert.match(said, /content\.update/)
    assert.doesNotMatch(said, /tracy_emdash/)
    assert.doesNotMatch(said, /personalize tool/, 'a WordPress template is not an EmDash template')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
