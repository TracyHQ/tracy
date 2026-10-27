/**
 * The Build host judges a submit against the questionnaire the form was served (22/09): a hidden
 * question's answer is not part of the brief, a shown required one left empty stops the start by
 * id, and the brief on disk carries the snapshot — set identity, questions, effective answers —
 * so a reload reads the build against what the customer actually saw.
 */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { makeSiteBuildHost } from '../src/host/host.ts'

const HASH = 'e'.repeat(64)
const questionnaire = () => ({
  set: { id: 'tracy-business/j6#gen-1', revision: 1, contentHash: HASH },
  questions: [
    {
      id: 'name',
      kind: 'text',
      step: 1,
      label: 'Company name',
      required: true,
      feeds: ['site.name', 'agent']
    },
    {
      id: 'sector',
      kind: 'choice',
      step: 1,
      label: 'Sector',
      options: ['construction', 'clinic'],
      required: false,
      feeds: ['agent']
    },
    {
      id: 'licence',
      kind: 'text',
      step: 2,
      label: 'Licence number',
      required: true,
      feeds: ['agent'],
      showWhen: { all: [{ question: 'sector', is: 'construction' }] }
    }
  ]
})

function host(root) {
  const sessions = [{ id: 'session-one', header: { cwd: root }, append() {} }]
  const routes = []
  const tools = []
  const ctx = {
    webServer: { register: (route) => (routes.push(route), () => {}) },
    tools: { register: (tool) => (tools.push(tool), () => {}) },
    effect: (fn) => fn(),
    get: (name) =>
      name === 'sessions'
        ? { list: () => sessions }
        : name === 'userQuestions'
          ? { ask: async () => ({ answers: [] }) }
          : name === 'agents'
            ? { get: () => ({ inject() {}, followup() {} }) }
            : { warn() {} }
  }
  makeSiteBuildHost({
    name: 'tracy-site-build-joomla',
    platform: 'joomla',
    platformName: 'Joomla',
    stages: ['seed'],
    tool: 'tracy_site_build_joomla',
    makeStages: () => ({ seed: () => ({ status: 'done' }) })
  })(ctx, { siteDir: root, chrome: null, loopback: 'http://127.0.0.1:1' })
  return { routes, tools, sessions }
}

test('start: a hidden answer is dropped, a shown required one is demanded by id, and the brief keeps the snapshot', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-host-q-'))
  mkdirSync(path.join(root, '.webroot'))
  const { routes, tools, sessions } = host(root)
  const server = createServer((req, res) => routes[0].handler(req, res))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api/tracy-site-build-joomla`
  const call = (route, body, site) =>
    fetch(`${base}/${route}?session=session-one${site ? `&site=${site}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' }
    })
  try {
    await tools[0].execute({ action: 'ask', id: 'apple' }, { agent: { session: sessions[0] } })
    const start = (answers) =>
      call('start', {
        id: 'apple',
        platform: 'joomla',
        targetSiteKey: 'one.localhost',
        targetUrl: 'http://one.localhost:8080/',
        answers,
        questionnaire: questionnaire()
      })

    // A builder without a licence: the required follow-up is shown and empty.
    const refused = await start({ name: 'Acme', sector: 'construction', licence: '' })
    assert.equal(refused.status, 400)
    const why = await refused.json()
    assert.equal(why.code, 'MISSING_REQUIRED')
    assert.deepEqual(why.missing, ['licence'])

    // A clinic typed a licence earlier, then changed sector: the licence is hidden → not required,
    // and not part of the brief.
    const started = await start({ name: 'Acme', sector: 'clinic', licence: 'L-1' })
    const job = await started.json()
    assert.equal(started.status, 202, JSON.stringify(job))
    assert.deepEqual(job.answers, { name: 'Acme', sector: 'clinic' })

    const briefFile = path.join(root, 'docs', 'agents', 'build', 'workspace', job.job, 'brief.json')
    const brief = JSON.parse(readFileSync(briefFile, 'utf8'))
    assert.deepEqual(brief.questionnaire, { id: 'tracy-business/j6#gen-1', revision: 1, contentHash: HASH })
    assert.deepEqual(
      brief.questions.map((q) => q.id),
      ['name', 'sector', 'licence']
    )
    assert.equal(brief.questions[2].required, true)
    assert.deepEqual(brief.questions[2].showWhen, { all: [{ question: 'sector', is: 'construction' }] })
    assert.deepEqual(brief.answers, { name: 'Acme', sector: 'clinic' })

    // A revision is judged against the SAME snapshot, out of the brief — no questionnaire needed.
    const revised = await call('answers', { answers: { sector: 'construction' } }, 'one.localhost')
    assert.equal(revised.status, 400)
    assert.deepEqual((await revised.json()).missing, ['licence'])
    const ok = await call('answers', { answers: { sector: 'construction', licence: 'L-9' } }, 'one.localhost')
    const okBody = await ok.json()
    assert.equal(ok.status, 202, JSON.stringify(okBody))
    const again = JSON.parse(readFileSync(briefFile, 'utf8'))
    assert.equal(again.answers.licence, 'L-9')
    assert.equal(again.questionnaire.contentHash, HASH)

    // A malformed snapshot is ignored, not trusted: the start goes through the old road.
    const loose = await call('start', {
      id: 'apple',
      platform: 'joomla',
      targetSiteKey: 'two.localhost',
      targetUrl: 'http://two.localhost:8080/',
      answers: { name: 'Beta' },
      questionnaire: { set: { id: 'x' }, questions: 'nope' }
    })
    assert.equal(loose.status, 202)
    assert.deepEqual((await loose.json()).answers, { name: 'Beta' })
  } finally {
    server.close()
    rmSync(root, { recursive: true, force: true })
  }
})
