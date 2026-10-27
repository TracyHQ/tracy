import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { makeSiteBuildHost } from '../src/host/host.ts'
import { currentJob } from '../src/host/build.mjs'

test('two sessions keep their build, retries, URL and completion while tools return before work finishes', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-host-'))
  mkdirSync(path.join(root, '.webroot'))
  const sessions = ['session-one', 'session-two'].map((id) => ({ id, header: { cwd: root }, append() {} }))
  const routes = []
  const tools = []
  const notifications = []
  const questions = []
  const releases = new Map()
  const disposers = []
  const ctx = {
    webServer: {
      register: (route) => {
        routes.push(route)
        return () => {}
      }
    },
    tools: {
      register: (tool) => {
        tools.push(tool)
        return () => {}
      }
    },
    effect: (fn) => {
      disposers.push(fn())
    },
    get: (name) =>
      name === 'sessions'
        ? { list: () => sessions }
        : name === 'userQuestions'
          ? {
              ask: async (request) => {
                questions.push(request)
                return { answers: [] }
              }
            }
          : name === 'agents'
            ? {
                get: (id) => ({ inject() {}, followup: (message) => notifications.push({ id, message }) })
              }
            : { warn() {} }
  }
  makeSiteBuildHost({
    name: 'tracy-site-build-joomla',
    platform: 'joomla',
    platformName: 'Joomla',
    stages: ['seed'],
    tool: 'tracy_site_build_joomla',
    makeStages: () => ({
      seed: (job) =>
        job.runs > 1
          ? { status: 'done' }
          : new Promise((resolve) =>
              releases.set(job.targetSiteKey, () =>
                resolve(
                  job.targetSiteKey === 'one.localhost'
                    ? { status: 'failed', detail: 'old brief failed' }
                    : { status: 'done' }
                )
              )
            )
    })
  })(ctx, { siteDir: root, chrome: null, loopback: 'http://127.0.0.1:1' })
  const server = createServer((req, res) => routes[0].handler(req, res))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api/tracy-site-build-joomla`
  const call = (route, session, body, site) =>
    fetch(
      `${base}/${route}?session=${session}${site ? `&site=${site}` : ''}`,
      body
        ? { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
        : {}
    )
  try {
    await tools[0].execute({ action: 'ask', id: 'apple' }, { agent: { session: sessions[0] } })
    await tools[0].execute({ action: 'ask', id: 'airbnb' }, { agent: { session: sessions[1] } })
    assert.equal((await (await call('ask', 'session-one')).json()).inspiration, 'apple')
    assert.equal((await (await call('ask', 'session-two')).json()).inspiration, 'airbnb')
    const one = await call('start', 'session-one', {
      id: 'apple',
      platform: 'joomla',
      targetSiteKey: 'one.localhost',
      targetUrl: 'http://one.localhost:8080/'
    })
    assert.equal(one.status, 202)
    assert.equal((await call('ask', 'session-one')).status, 404)
    assert.equal((await call('ask', 'session-two')).status, 200)
    assert.equal((await one.json()).targetUrl, 'http://one.localhost:8080/')
    assert.equal(
      (
        await call('start', 'session-two', {
          id: 'apple',
          platform: 'joomla',
          targetSiteKey: 'one.localhost'
        })
      ).status,
      409
    )
    assert.equal(
      (
        await call('start', 'session-two', {
          id: 'apple',
          platform: 'joomla',
          targetSiteKey: 'two.localhost',
          targetUrl: 'http://two.localhost:8080/'
        })
      ).status,
      202
    )
    const result = await tools[0].execute(
      { action: 'start', id: 'apple' },
      { agent: { session: sessions[0] } }
    )
    assert.equal(result.status, 'running')
    assert.equal(result.targetSiteKey, 'one.localhost')
    // dsh refuses undefined anywhere in a tool reply, before its JSON renderer runs.
    assert.deepEqual(result, JSON.parse(JSON.stringify(result)))
    assert.equal((await call('job', 'session-one', undefined, 'two.localhost')).status, 404)
    assert.equal(
      (await call('answers', 'session-one', { answers: { name: 'Changed mid-step' } }, 'one.localhost'))
        .status,
      202
    )
    releases.get('one.localhost')()
    await currentJob(root, 'one.localhost').finished
    assert.deepEqual(
      notifications.map((event) => event.id),
      ['session-one']
    )
    assert.equal(currentJob(root, 'one.localhost').answers.name, 'Changed mid-step')
    assert.equal(currentJob(root, 'one.localhost').status, 'done')
    assert.deepEqual(questions, [], 'a queued revision recovers without leaving a stale Retry question')
    assert.equal((await (await call('job', 'session-two')).json()).targetSiteKey, 'two.localhost')
    const other = await tools[0].execute(
      { action: 'rerun', stage: 'seed', targetSiteKey: 'one.localhost' },
      { agent: { session: sessions[1] } }
    )
    assert.equal(other.ok, false)
    const reviewInput = {
      targets: [{ id: 'hero', label: 'Hero', kind: 'module', entityId: 42 }],
      questions: [
        { id: 'facts', title: 'Facts', prompt: 'Which figure?', source: 'owner brief', targetId: 'hero' }
      ]
    }
    const published = await tools[0].execute(
      { action: 'review', targetSiteKey: 'one.localhost', input: reviewInput },
      { agent: { session: sessions[0] } }
    )
    assert.equal(published.ok, true)
    assert.deepEqual(published, JSON.parse(JSON.stringify(published)))
    assert.equal((await call('workspace', 'session-two', undefined, 'one.localhost')).status, 404)
    const denied = await tools[0].execute(
      { action: 'review', targetSiteKey: 'one.localhost', input: reviewInput },
      { agent: { session: sessions[1] } }
    )
    assert.equal(denied.ok, false)
    const report = await (await call('workspace', 'session-one', undefined, 'one.localhost')).json()
    const comment = {
      requestId: 'request-one',
      body: 'Use 24 days.',
      targetId: 'hero',
      questionId: 'facts',
      reportAt: report.at
    }
    const before = notifications.length
    assert.equal((await call('comment', 'session-two', comment, 'one.localhost')).status, 404)
    assert.equal((await call('comment', 'session-one', comment, 'one.localhost')).status, 200)
    assert.equal((await call('comment', 'session-one', comment, 'one.localhost')).status, 200)
    assert.equal(notifications.length, before + 1)
    assert.equal(notifications.at(-1).id, 'session-one')
    assert.match(JSON.stringify(notifications.at(-1).message), /one.localhost/)
    assert.match(JSON.stringify(notifications.at(-1).message), /kind=module id=42/)
    assert.match(JSON.stringify(notifications.at(-1).message), /action review/)
    // The workspace carries the build's own stage checks and the current revision without a review.
    assert.ok(report.checks.some((c) => c.id === 'stage:seed' && c.source === 'stage'))
    assert.equal(typeof report.currentRevision, 'string')
    // A comment naming a report-drawn target with a stale `reportAt` is refused, not re-resolved.
    assert.equal(
      (
        await call(
          'comment',
          'session-one',
          { ...comment, requestId: 'request-stale', reportAt: 'old' },
          'one.localhost'
        )
      ).status,
      400
    )
    assert.equal(
      (await (await call('workspace', 'session-one', undefined, 'one.localhost')).json()).comments[0].status,
      'sent'
    )
    assert.equal(
      (await (await call('job', 'session-one', undefined, 'one.localhost')).json()).brief.answers.name,
      'Changed mid-step'
    )
    const inspection = { requestId: 'inspect-one' }
    const inspectionsBefore = notifications.length
    assert.equal((await call('inspect', 'session-two', inspection, 'one.localhost')).status, 404)
    assert.equal((await call('inspect', 'session-one', inspection, 'one.localhost')).status, 200)
    assert.equal((await call('inspect', 'session-one', inspection, 'one.localhost')).status, 200)
    assert.equal(notifications.length, inspectionsBefore + 1)
    assert.match(JSON.stringify(notifications.at(-1).message), /read-only inspection of one.localhost/)
  } finally {
    for (const release of releases.values()) release()
    await currentJob(root, 'two.localhost')?.finished
    for (const dispose of disposers) dispose?.()
    await new Promise((resolve) => server.close(resolve))
    rmSync(root, { recursive: true, force: true })
  }
})
