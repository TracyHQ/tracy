import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildSummary, collectReports, deployKey } from '../lib/summary.mjs'

const deploy = (web, dsh, sidebar) => ({
  images: {
    'tracy-tracy-web-1': `ghcr.io/tracyhq/tracy-web:${web}`,
    'tracy-dsh': `ghcr.io/tracyhq/tracy-dsh:${dsh}`
  },
  plugins: { 'dsh-better-sidebar': sidebar }
})

function writeRun(root, sub, runId, startedAt, journeys, extra = {}) {
  const dir = join(root, ...sub, runId)
  mkdirSync(dir, { recursive: true })
  const count = (v) => journeys.filter((j) => j.verdict === v).length
  writeFileSync(
    join(dir, 'report.json'),
    JSON.stringify({
      runId,
      startedAt,
      deploy: deploy('app-aaa', 'ctx-bbb', '0.24.1-tracy.73'),
      summary: { pass: count('PASS'), fail: count('FAIL'), blocked: count('BLOCKED'), notRun: 0 },
      journeys,
      leftover: [],
      ...extra
    })
  )
}

test('collectReports reads suite and --reg runs in the window, oldest first, and skips foreign folders', () => {
  const root = mkdtempSync(join(tmpdir(), 'summary-'))
  writeRun(root, [], 'r2', '2026-10-04T12:00:00Z', [{ id: 'J0', cms: null, verdict: 'PASS', ms: 7000 }])
  writeRun(root, [], 'r1', '2026-10-04T10:00:00Z', [
    { id: 'J0', cms: null, verdict: 'FAIL', ms: 9000, reason: 'x' }
  ])
  writeRun(root, ['reg'], 'k1', '2026-10-04T11:00:00Z', [
    { id: 'REG-001', cms: null, verdict: 'PASS', ms: 1000 }
  ])
  writeRun(root, [], 'old', '2026-10-01T10:00:00Z', [])
  mkdirSync(join(root, 'not-a-run'))
  writeFileSync(join(root, 'not-a-run', 'report.json'), '{"something":"else"}')
  const runs = collectReports(root, {
    since: new Date('2026-10-04T00:00:00Z'),
    until: new Date('2026-10-05T00:00:00Z')
  })
  assert.deepEqual(
    runs.map((r) => [r.report.runId, r.kind]),
    [
      ['r1', 'suite'],
      ['k1', 'reg'],
      ['r2', 'suite']
    ]
  )
})

test('the summary heads with deploys and runs, puts why-red above a journey × CMS × run grid', () => {
  const runs = [
    {
      dir: '/x/r1',
      kind: /** @type {const} */ ('suite'),
      report: {
        runId: 'r1',
        startedAt: '2026-10-04T10:00:00Z',
        deploy: deploy('app-aaa', 'ctx-bbb', '0.24.1-tracy.73'),
        summary: { pass: 1, fail: 1, blocked: 0, notRun: 0 },
        journeys: [
          { id: 'J13', cms: null, verdict: 'PASS', ms: 70_000, retries: 1 },
          {
            id: 'J2b',
            cms: 'joomla',
            verdict: 'FAIL',
            ms: 99_000,
            reason: 'jQuery | is not defined\n\u001b[2mmore\u001b[22m'
          }
        ],
        leftover: [{ kind: 'site', id: 'a', state: 'left' }]
      }
    },
    {
      dir: '/x/k1',
      kind: /** @type {const} */ ('reg'),
      report: {
        runId: 'k1',
        startedAt: '2026-10-04T11:00:00Z',
        summary: { pass: 0, fail: 0, blocked: 1, notRun: 0 },
        journeys: [
          { id: 'REG-004', cms: null, verdict: 'BLOCKED', ms: 1000, reason: '[environment] no site' }
        ],
        leftover: []
      }
    }
  ]
  const md = buildSummary(runs, {
    since: new Date('2026-10-04T00:00:00Z'),
    until: new Date('2026-10-05T00:00:00Z')
  })
  assert.match(md, /\*\*2 run\(s\) · 1 PASS · 1 FAIL · 1 BLOCKED · 0 NOT RUN\*\*/)
  assert.match(md, /\| `app-aaa · ctx-bbb · 0\.24\.1-tracy\.73` \| `r1` \|/)
  assert.match(md, /\| `—` \| `k1` \|/)
  assert.match(md, /\| `r1` \| suite \| 10-04 10:00 \| `app-aaa` \| 1 \| 1 \| 0 \| 0 \| \*\*1 left\*\* \|/)
  assert.match(md, /\| J13 \| — \| PASS ↻ 70 s \|/)
  assert.match(md, /\| J2b \| joomla \| FAIL 99 s \|/)
  // The reason is one line, pipes escaped, colour codes gone.
  assert.match(md, /- \*\*J2b joomla\*\* — FAIL in `r1`: jQuery \\\| is not defined more/)
  assert.match(
    md,
    /## Regression cases on dev \(`--reg`\) × run[\s\S]*REG-004\*\* — BLOCKED in `k1`: \[environment\] no site/
  )
  assert.ok(md.indexOf('Why red') < md.indexOf('| Journey | CMS |'))
  assert.equal(deployKey({}), '—')
})

test('an empty window says so', () => {
  assert.match(buildSummary([], { since: new Date(0), until: new Date(1) }), /_No run in this window\._/)
})
