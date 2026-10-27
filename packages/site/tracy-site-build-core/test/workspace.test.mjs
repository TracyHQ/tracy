import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  checksFromStages,
  markCommentSent,
  normalizeReport,
  prepareComment,
  publishWorkspace,
  readBrief,
  readWorkspace,
  saveBrief,
  targetsFromReceipt
} from '../src/host/workspace.ts'

const job = {
  job: 'build-one',
  platform: 'joomla',
  targetSiteKey: 'one.localhost',
  ownerSessionId: 'session-one',
  startedAt: '2026-09-13T00:00:00Z',
  endedAt: '2026-09-13T00:05:00Z',
  contentRevision: 'rev-1',
  stages: [
    { name: 'check', status: 'done', detail: 'Joomla 6', endedAt: '2026-09-13T00:01:00Z' },
    { name: 'seed', status: 'done', detail: 'all', endedAt: '2026-09-13T00:04:00Z' },
    { name: 'shot', status: 'failed', detail: 'no browser', endedAt: '2026-09-13T00:05:00Z' }
  ]
}
/** The seeder's own record, as `tracy-seeder/src/cli.mjs` writes it (measured on qa-build-source, 12/09). */
const receipt = {
  schemaVersion: 'tracy-seed-apply/v1',
  platform: 'joomla',
  applied: {
    pages: { 'home:en': 89, 'contact:en': 94 },
    menu: { 'home:en': 332, 'contact:en': 337 },
    posts: { 'first-post:en': 83 },
    routes: [
      { language: 'en', menuId: 332, title: 'Joomla template Club' },
      { language: 'en', menuId: 337, title: 'Contact' }
    ]
  },
  posts: [{ slug: 'first-post', title: 'The first post' }]
}
const input = {
  targets: [
    {
      id: 'hero',
      label: 'Hero',
      kind: 'module',
      entityId: 42,
      page: 'home',
      language: 'en-GB',
      position: 'hero',
      scope: 'site'
    }
  ],
  questions: [
    {
      id: 'figures',
      title: 'Project figures',
      prompt: 'Which figure is correct?',
      source: 'docs/content-rules.md',
      targetId: 'hero'
    }
  ],
  checks: [{ id: 'mobile', label: 'Mobile', status: 'unverified' }]
}

function stand() {
  const root = mkdtempSync(path.join(tmpdir(), 'build-workspace-'))
  const inputs = path.join(root, 'inputs')
  mkdirSync(path.join(inputs, 'docs', 'agents', 'seed'), { recursive: true })
  writeFileSync(path.join(inputs, 'docs', 'agents', 'seed', 'apply.json'), JSON.stringify(receipt))
  return { root, inputs }
}

test('the seed receipt alone gives pages, menu items and posts with the ids the CMS answered', () => {
  const targets = targetsFromReceipt(receipt, 'joomla')
  assert.deepEqual(
    targets.map((t) => [t.id, t.kind, t.entityId, t.label, t.scope]),
    [
      ['page:home:en', 'article', '89', 'Joomla template Club', 'page'],
      ['page:contact:en', 'article', '94', 'Contact', 'page'],
      ['menu:home:en', 'menuItem', '332', 'Joomla template Club', 'site'],
      ['menu:contact:en', 'menuItem', '337', 'Contact', 'site'],
      ['post:first-post:en', 'article', '83', 'The first post', 'page']
    ]
  )
  // A WordPress page is a `post` to the apply door, and its navigation block is shared.
  const wp = targetsFromReceipt({ applied: { pages: { home: 5 }, navigation: 9 } }, 'wordpress')
  assert.deepEqual(
    wp.map((t) => [t.id, t.kind, t.entityId, t.scope]),
    [
      ['page:home', 'post', '5', 'page'],
      ['navigation', 'post', '9', 'site']
    ]
  )
  assert.deepEqual(targetsFromReceipt(null, 'joomla'), [])
  assert.deepEqual(targetsFromReceipt({ applied: { pages: { home: 'nope' } } }, 'joomla'), [])
})

test('build stages are checks with their own detail and time; nothing not run is passed', () => {
  assert.deepEqual(
    checksFromStages(job).map((c) => [c.id, c.status, c.evidence, c.at, c.revision]),
    [
      ['stage:check', 'passed', 'Joomla 6', '2026-09-13T00:01:00Z', 'rev-1'],
      ['stage:seed', 'passed', 'all', '2026-09-13T00:04:00Z', 'rev-1'],
      ['stage:shot', 'failed', 'no browser', '2026-09-13T00:05:00Z', 'rev-1']
    ]
  )
  assert.equal(
    checksFromStages({ ...job, stages: [{ name: 'seed', status: 'running' }] })[0].status,
    'unverified'
  )
})

test('reports require explicit identities and evidence, never position-only targets or invented pass states', () => {
  assert.equal(normalizeReport(input).targets[0].entityId, '42')
  assert.equal(normalizeReport(input).targets[0].scope, 'site')
  assert.throws(() =>
    normalizeReport({ ...input, targets: [{ id: 'x', label: 'Hero', kind: 'module', position: 'hero' }] })
  )
  assert.throws(() =>
    normalizeReport({ ...input, questions: [{ ...input.questions[0], targetId: 'unknown' }] })
  )
  // A question may point at a receipt row the report does not restate.
  assert.equal(
    normalizeReport(
      { ...input, questions: [{ ...input.questions[0], targetId: 'page:home:en' }] },
      new Set(['page:home:en'])
    ).questions.length,
    1
  )
  assert.throws(() => normalizeReport({ ...input, checks: [{ id: 'x', label: 'Mobile', status: 'passed' }] }))
  assert.throws(() => normalizeReport({ ...input, targets: [...input.targets, ...input.targets] }))
})

test('the workspace merges receipt, review, settings and stage checks; a review row replaces a receipt row by id', () => {
  const { root, inputs } = stand()
  try {
    const settings = [
      {
        id: 'setting:blogname',
        label: 'Site title',
        kind: 'setting',
        page: '',
        language: '',
        position: '',
        field: 'blogname',
        scope: 'site',
        source: 'spec'
      }
    ]
    const before = readWorkspace(root, job, inputs, settings)
    assert.equal(before.at, undefined)
    assert.equal(before.targets.length, 6)
    assert.equal(before.checks.length, 3)
    assert.equal(before.currentRevision, 'rev-1')
    publishWorkspace(
      root,
      job,
      {
        targets: [
          ...input.targets,
          {
            id: 'page:home:en',
            label: 'Home (reviewed)',
            kind: 'article',
            entityId: 89,
            page: 'home',
            language: 'en'
          }
        ],
        questions: [
          ...input.questions,
          {
            id: 'q2',
            title: 'Phone',
            prompt: 'Which phone number?',
            source: 'brief',
            targetId: 'page:contact:en'
          }
        ],
        checks: [
          {
            id: 'links',
            label: 'Links resolve',
            status: 'passed',
            evidence: 'curl 7 routes → 200',
            at: '2026-09-13T00:06:00Z',
            targetId: 'page:home:en'
          }
        ]
      },
      inputs,
      settings
    )
    const after = readWorkspace(root, job, inputs, settings)
    assert.equal(after.targets.length, 7)
    assert.equal(after.targets.find((t) => t.id === 'page:home:en').label, 'Home (reviewed)')
    assert.equal(after.targets.find((t) => t.id === 'page:home:en').source, 'review')
    assert.equal(after.targets[0].id, 'page:home:en', 'receipt order is kept')
    assert.equal(after.questions.length, 2)
    assert.equal(after.checks.length, 4)
    assert.equal(after.checks.at(-1).revision, 'rev-1')
    assert.ok(after.at)
    // A check made against rev-1 is stale once the site moved on; the tab reads both.
    assert.equal(readWorkspace(root, { ...job, contentRevision: 'rev-2' }, inputs).currentRevision, 'rev-2')
    assert.equal(
      readWorkspace(root, { ...job, contentRevision: 'rev-2' }, inputs).checks.at(-1).revision,
      'rev-1'
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('comments resolve server-owned targets, persist retries and isolate jobs', () => {
  const { root, inputs } = stand()
  try {
    const report = publishWorkspace(root, job, input, inputs)
    const workspace = readWorkspace(root, job, inputs)
    const body = {
      requestId: 'request-123',
      targetId: 'hero',
      questionId: 'figures',
      body: 'Use 24 days.',
      reportAt: report.at,
      siteKey: 'attacker.localhost'
    }
    const saved = prepareComment(root, job, workspace, body)
    assert.equal(saved.comment.siteKey, job.targetSiteKey)
    assert.equal(saved.comment.platform, 'joomla')
    assert.equal(saved.comment.sessionId, job.ownerSessionId)
    assert.equal(saved.comment.target.entityId, '42')
    assert.equal(saved.comment.revision, 'rev-1')
    markCommentSent(saved.file, saved.comment)
    assert.equal(prepareComment(root, job, workspace, body).comment.status, 'sent')
    assert.equal(readWorkspace(root, job, inputs).comments.length, 1)
    assert.equal(readWorkspace(root, { ...job, job: 'build-two' }, inputs).comments.length, 0)
    assert.throws(() => prepareComment(root, job, workspace, { ...body, body: 'Changed request' }))
    assert.throws(() => prepareComment(root, job, workspace, { ...body, requestId: '../escape' }))
    assert.throws(() =>
      prepareComment(root, job, workspace, { ...body, requestId: 'new-request', reportAt: 'outdated' })
    )
    assert.throws(() =>
      prepareComment(root, job, workspace, { ...body, requestId: 'new-request', targetId: 'unknown' })
    )
    // A receipt row or a stage check needs no report: the comment stands without `reportAt`.
    const onPage = prepareComment(root, job, workspace, {
      requestId: 'request-page',
      targetId: 'page:contact:en',
      body: 'Shorter.'
    })
    assert.equal(onPage.comment.target.entityId, '94')
    const onStage = prepareComment(root, job, workspace, {
      requestId: 'request-stage',
      targetId: 'page:home:en',
      checkId: 'stage:shot',
      body: 'Why no picture?'
    })
    assert.equal(onStage.comment.check.status, 'failed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the submitted questionnaire and later answers survive without rewriting labels or facts', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-brief-'))
  try {
    const questions = [{ id: 'specific', label: 'Your supplied project name?', kind: 'text' }]
    saveBrief(root, job, { specific: 'Elektra', languages: ['en', 'ru'] }, questions)
    saveBrief(root, job, { specific: 'Owner corrected name' })
    const brief = readBrief(root, job)
    assert.deepEqual(brief.questions, questions)
    assert.deepEqual(brief.answers, { specific: 'Owner corrected name', languages: ['en', 'ru'] })
    assert.ok(Number.isFinite(Date.parse(brief.updatedAt)))
    assert.equal(readBrief(root, { ...job, job: 'other' }), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('normalizeReport: a ULID is a content id — EmDash targets are not refused for not being numbers', () => {
  // Measured 20/09/2026 on `site-4x82yk`: the agent's third attempt carried `ec_pages.id` itself,
  // the right answer, and the old rule (`/^[1-9][0-9]*$/`) refused it because a ULID is not a
  // number. `review` — the step that fills Pages & blocks for the owner — could therefore never
  // succeed on an EmDash build.
  const report = normalizeReport({
    targets: [
      {
        id: 'page:home',
        label: 'Home',
        kind: 'page',
        entityId: '01M2M6REX43YC4J6HM9ABX8J3N',
        page: '/',
        language: 'en'
      }
    ]
  })
  assert.equal(report.targets[0].entityId, '01M2M6REX43YC4J6HM9ABX8J3N')
})

test('normalizeReport: Joomla and WordPress numeric ids are untouched', () => {
  const report = normalizeReport({
    targets: [{ id: 'a17', label: 'About', kind: 'article', entityId: 17, page: 'about', language: 'en' }]
  })
  assert.equal(report.targets[0].entityId, '17')
})

test('normalizeReport: a label where an id belongs is still refused', () => {
  // The rule this check exists for, stated in the file header: a target is a CMS identity, never a
  // title or a position. Loosening the shape must not loosen that.
  for (const bad of ['Trang chủ (Home)', '', '   ', null, undefined, { id: 1 }, 'x'.repeat(200)]) {
    assert.throws(
      () =>
        normalizeReport({
          targets: [{ id: 't', label: 'T', kind: 'page', entityId: bad, page: '/', language: 'en' }]
        }),
      /A content ID is required\./,
      `should refuse ${JSON.stringify(bad)}`
    )
  }
})
