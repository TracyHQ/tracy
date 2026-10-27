import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateDemoRequest } from 'website-opportunities/domain/demo-request.mjs'
import { findContractDir, templateBaseline } from '../lib/place-profile/baseline.mjs'
import { badInputs, demoRequestV1, demoRequestV2, nearTwinServices } from '../lib/place-profile/fixtures.mjs'
import { judgePage } from '../lib/place-profile/judge-demo.mjs'
import { placeProfileMarkdown } from '../lib/place-profile/report.mjs'
import { profileFacts } from '../lib/place-profile/profile-facts.mjs'
import { sidecarStates } from '../lib/place-profile/sidecar-states.mjs'
import { gymProfile } from '../lib/place-profile/fixtures.mjs'

test('every request the journeys send is valid under the contract', () => {
  for (const key of ['gym', 'spa', 'restaurant']) {
    for (const body of [demoRequestV1(key), demoRequestV2(key)]) {
      const r = validateDemoRequest(body)
      assert.equal(r.ok, true, `${key} ${body.schema}: ${JSON.stringify(r.errors)}`)
    }
  }
  assert.equal(validateDemoRequest(nearTwinServices()).ok, true)
})

test('E11 local half: each bad body is refused with its own path and code', () => {
  for (const { name, body, path, code } of badInputs()) {
    const r = validateDemoRequest(body)
    assert.equal(r.ok, false, name)
    assert.ok(
      r.errors.some((e) => e.code === code && (path === '' || e.path.startsWith(path))),
      `${name}: ${JSON.stringify(r.errors)}`
    )
  }
})

test('E9 local half: missing, stale and invalid sidecars are named and never hold Publish', () => {
  const s = sidecarStates(findContractDir({ slug: 'tracy-base', line: 'j6', version: '1.0.5' }))
  assert.equal(s.ready.step.code, 'roles-ready')
  assert.deepEqual(
    ['missing', 'stale', 'invalid'].map((k) => [s[k].state, s[k].step.code]),
    [
      ['missing', 'roles-missing'],
      ['stale', 'roles-stale'],
      ['invalid', 'roles-invalid']
    ]
  )
})

test('judgePage: a clean gym page passes; a restaurant leftover fails by name', () => {
  const baseline = templateBaseline(findContractDir({ slug: 'tracy-base', line: 'j6', version: '1.0.5' }))
  const facts = profileFacts(gymProfile())
  const clean = {
    text: 'Northside Strength Club. Memberships. Call +1 555 0100. —',
    ctas: [{ text: 'Call', href: 'tel:+15550100' }],
    images: [{ src: 'a.jpg', complete: true, naturalWidth: 800, width: 400, height: 300 }],
    stats: ['—'],
    sections: [],
    overflowX: false
  }
  const ok = judgePage(clean, { facts, baseline, path: '/contact' })
  assert.deepEqual(
    ok.filter((c) => !c.pass).map((c) => c.name),
    []
  )
  const bad = judgePage(
    {
      ...clean,
      text: `${clean.text} Book a table. Chef's selection $29`,
      ctas: [{ text: 'Book a table', href: '#' }],
      stats: ['0']
    },
    { facts, baseline, path: '/contact' }
  )
  assert.deepEqual(
    bad
      .filter((c) => !c.pass)
      .map((c) => c.name)
      .sort(),
    ['cta-real', 'dash-not-zero', 'no-banned-filler', 'no-restaurant-words', 'no-unsourced-price'].sort()
  )
})

test('the acceptance file names deploy, release, hashes, URL and each assertion', () => {
  const md = placeProfileMarkdown({
    runDir: '/x/run',
    runId: '1026abcd',
    report: {
      environment: 'dev',
      origin: 'https://cowork.example.site',
      startedAt: '2026-10-26T00:00:00Z',
      flags: {},
      deploy: { env: { APP_IMAGE_TAG: 'sha-abc', DSH_SOURCE_COMMIT: 'def' } },
      summary: { pass: 1, fail: 0, blocked: 1, notRun: 0 },
      journeys: [
        {
          id: 'E1',
          verdict: 'BLOCKED',
          reason: '[deploy-of-line] needs: deploy-of-line',
          attempts: [
            {
              details: {
                needs: { line: 'deploy-of-line', what: 'T3', declared: false, hostAnnouncesProfile: null }
              },
              notes: []
            }
          ]
        },
        {
          id: 'E4',
          verdict: 'PASS',
          reason: null,
          attempts: [
            {
              details: {
                release: { key: 'tracy-base/j6', version: '1.0.5' },
                sidecar: { state: 'ready', sha256: 'aa', baseHash: 'bb' },
                profile: { hash: 'cc', trade: 'fitness', offerings: 0 },
                url: 'https://demo.example.site',
                pages: [
                  {
                    viewport: 'mobile',
                    url: 'https://demo.example.site/',
                    checks: [{ name: 'cta-real', pass: true }]
                  }
                ]
              },
              notes: []
            }
          ]
        }
      ]
    }
  })
  for (const want of [
    'sha-abc',
    'tracy-base/j6',
    '`aa`',
    '`cc`',
    'https://demo.example.site',
    'PASS mobile',
    'deploy-of-line'
  ])
    assert.ok(md.includes(want), want)
})
