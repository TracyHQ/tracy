// Host cases: every `/_host/*` door × the API/host edge tags that apply to a signed internal
// channel, plus job lease / idempotency / restart behaviour of the job store.
import { scratchDir } from './scratch.mjs'
import assert from 'node:assert/strict'
import { rmSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO, step } from './harness.mjs'
import { HOST_ROUTES, HOST_SECRET, hostEnv } from './host.mjs'

const webrootModule = await import(pathToFileURL(path.join(REPO, 'apps/tracy-host/src/webroot.js')).href)
/** Every kind `POST /_host/site` dispatches through WEBROOT_JOBS (extracted from the real source). */
export const WEBROOT_KINDS = Object.keys(webrootModule.WEBROOT_JOBS)
export const kindItemId = (kind) => `host-job-kind:${kind}`

const ROUTE_FN = {
  'POST /_host/provision': 'function provisionRoute(',
  'POST /_host/attach': 'function attachRoute(',
  'POST /_host/reserve': 'function reserveRoute(',
  'POST /_host/unreserve': 'function reserveRoute(',
  'POST /_host/teardown': 'function teardownRoute(',
  'POST /_host/site': 'function siteJobRoute(',
  'POST /_host/agent-token': 'function agentTokenRoute(',
  'POST /_host/content-token': 'function contentTokenRoute(',
  'POST /_host/site-files': 'function siteFilesRoute(',
  'POST /_host/model-keys': 'function modelKeysRoute(',
  'POST /_host/address': 'function addressRoute(',
  'POST /_host/go-live': 'function goLiveRoute(',
  'POST /_host/capture': 'function captureRoute(',
  'POST /_host/outline': 'function outlineRoute('
}

/** Stable item key: `POST /_host/agent-token` → `host-agent-token`, `GET /_host/jobs/:id` → `host-jobs-id`. */
export const routeSlug = (key) =>
  `host-${key
    .split('/_host/')[1]
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/-$/, '')}`
export const routeItemId = (key) => `host-route:${key}`

const LABEL_BODY = {
  'POST /_host/provision': (label) => ({ site: 'example.com', label, platform: 'emdash' }),
  'POST /_host/attach': (label) => ({ label }),
  'POST /_host/reserve': (label) => ({ label }),
  'POST /_host/unreserve': (label) => ({ label }),
  'POST /_host/teardown': (label) => ({ label }),
  'POST /_host/site': (label) => ({ kind: 'site-settings', label }),
  'POST /_host/agent-token': (label) => ({ label }),
  'POST /_host/content-token': (label) => ({ label }),
  'POST /_host/site-files': (label) => ({ label }),
  'POST /_host/address': (label) => ({ label, hostname: 'x.example.com', port: 8080 }),
  'POST /_host/go-live': (label) => ({ label, op: 'live' })
}

const LABEL_VARIANTS = [
  ['traversal', '../../etc'],
  ['slash', 'a/b'],
  ['leading-dash', '-rf'],
  ['metachar', 'a;touch x'],
  ['newline', 'a\nb'],
  ['empty', '']
]

// Routes whose label gate is SAFE_LABEL (shared regex in provision.js) vs the looser SAFE_ARG.
const LOOSE_LABEL_FIX = {
  'POST /_host/teardown': {
    after: 'function teardownRoute(',
    find: 'SAFE_ARG.test(String(body.label))',
    replace: 'SAFE_LABEL.test(String(body.label))'
  },
  'POST /_host/site': {
    after: 'function siteJobRoute(',
    find: "    if (!SAFE_ARG.test(String(body.label))) return badRequest(c, 'refused label')",
    replace: "    if (!SAFE_LABEL.test(String(body.label))) return badRequest(c, 'refused label')"
  },
  'POST /_host/address': {
    after: 'function addressRoute(',
    find: 'SAFE_ARG.test(String(body.label))',
    replace: 'SAFE_LABEL.test(String(body.label))'
  }
}

export const HOST_MUTATIONS = [
  {
    id: 'host-auth-off',
    tree: 'host',
    file: 'apps/tracy-host/src/app.js',
    find: "if (!result.ok) return c.json({ code: 'BAD_SIGNATURE', why: result.why }, 403)",
    replace: "if (false) return c.json({ code: 'BAD_SIGNATURE', why: result.why }, 403)"
  },
  {
    id: 'host-skew-off',
    tree: 'host',
    file: 'apps/tracy-host/src/auth.js',
    find: "if (Math.abs(now - sent) > FRESHNESS_MS) return { ok: false, why: 'skew' }",
    replace: ''
  },
  {
    id: 'host-replay-off',
    tree: 'host',
    file: 'apps/tracy-host/src/auth.js',
    find: "if (seen.has(nonce)) return { ok: false, why: 'replay' }",
    replace: ''
  },
  {
    id: 'host-secret-leak',
    tree: 'host',
    file: 'apps/tracy-host/src/app.js',
    find: "return c.json({ code: 'BAD_SIGNATURE', why: result.why }, 403)",
    replace: "return c.json({ code: 'BAD_SIGNATURE', why: result.why, hint: config.hostSecret }, 403)"
  },
  {
    id: 'host-drain-off',
    tree: 'host',
    file: 'apps/tracy-host/src/app.js',
    find: "if (await draining(config.jobsDir)) return c.json({ code: 'HOST_UPDATING' }, 503)",
    replace: ''
  },
  {
    id: 'host-draining-never-expires',
    tree: 'host',
    file: 'apps/tracy-host/src/jobs.js',
    find: "return typeof until !== 'number' || now < until",
    replace: 'return true'
  },
  {
    id: 'host-draining-age-bound-off',
    tree: 'host',
    file: 'apps/tracy-host/src/jobs.js',
    find: 'if (now - written >= DRAINING_MAX_MS) return false',
    replace: ''
  },
  {
    id: 'host-keyed-reuse-off',
    tree: 'host',
    file: 'apps/tracy-host/src/app.js',
    find: 'if (existing) return c.json({ jobId: id, reused: true }, 202)',
    replace: ''
  },
  {
    id: 'host-orphan-sweep-off',
    tree: 'host',
    file: 'apps/tracy-host/src/jobs.js',
    find: "if (!job || !['queued', 'running'].includes(job.state)) continue",
    replace: 'continue'
  },
  {
    id: 'host-orphan-sweep-too-wide',
    tree: 'host',
    file: 'apps/tracy-host/src/jobs.js',
    find: "if (!job || !['queued', 'running'].includes(job.state)) continue",
    replace: 'if (!job) continue'
  },
  {
    id: 'host-job-write-not-atomic',
    tree: 'host',
    file: 'apps/tracy-host/src/jobs.js',
    find: 'await writeFile(tmp, JSON.stringify(next))\n  await rename(tmp, target)',
    replace: 'await writeFile(target, JSON.stringify(next))\n  await rename(target, target)'
  },
  {
    id: 'host-jobs-id-shape-fix',
    tree: 'host',
    file: 'apps/tracy-host/src/app.js',
    find: "const job = await jobs.get(c.req.param('id'))",
    replace:
      "const rawId = c.req.param('id')\n    if (!/^[0-9a-z]{8,64}$/.test(rawId)) return c.json({ code: 'NOT_FOUND' }, 404)\n    const job = await jobs.get(rawId)"
  },
  {
    id: 'host-unknown-kind-accepted',
    tree: 'host',
    file: 'apps/tracy-host/src/app.js',
    find: "if (!Object.hasOwn(WEBROOT_JOBS, kind) && kind !== 'core-manifest-write') {",
    replace: 'if (false) {'
  },
  {
    id: 'host-safe-arg-open',
    tree: 'host',
    file: 'apps/tracy-host/src/provision.js',
    find: 'export const SAFE_ARG = /^[A-Za-z0-9._:/@+-]+$/',
    replace: 'export const SAFE_ARG = /^[^]*$/'
  },
  {
    id: 'host-label-open',
    tree: 'host',
    file: 'apps/tracy-host/src/provision.js',
    find: 'export const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]*$/',
    replace: 'export const SAFE_LABEL = /^[^]*$/'
  }
]
for (const route of HOST_ROUTES) {
  const anchor = `app.${route.method.toLowerCase()}('${route.path.replace('abcdef123456', ':id')}'`
  HOST_MUTATIONS.push({
    id: `host-method-open:${route.key}`,
    tree: 'host',
    file: 'apps/tracy-host/src/app.js',
    find: anchor,
    replace: anchor.replace(/^app\.(get|post)/, 'app.all')
  })
  if (ROUTE_FN[route.key]) {
    HOST_MUTATIONS.push({
      id: `host-bad-json-escapes:${route.key}`,
      tree: 'host',
      file: 'apps/tracy-host/src/app.js',
      after: ROUTE_FN[route.key],
      find: /return badRequest\(c, '(not json|body is not JSON)'\)/,
      replace: "throw new Error('qa-mutant: parse failure escapes the route')"
    })
  }
}
for (const [key, fix] of Object.entries(LOOSE_LABEL_FIX)) {
  HOST_MUTATIONS.push({
    id: `host-label-fix:${key}`,
    tree: 'host',
    file: 'apps/tracy-host/src/app.js',
    ...fix
  })
}

const assertNoEffect = (env, before, why) => {
  assert.equal(env.runs.length, 0, `${why}: the host started ${env.runs.length} command(s)`)
  assert.equal(env.puts.length, 0, `${why}: the host wrote ${env.puts.length} job record(s)`)
  assert.deepEqual(env.snapshot(), before, `${why}: directories changed`)
}

async function withEnv(root, options, fn) {
  const env = await hostEnv(root, options)
  try {
    return await fn(env)
  } finally {
    env.dispose()
  }
}

const sendTo = (env, route, extra = {}) =>
  env.send({ method: route.method, path: route.path, body: route.method === 'GET' ? '' : '{}', ...extra })

export function hostCases() {
  const cases = []
  const common = {
    targets: ['local'],
    effects: { reads: [], writes: ['scratch tmp dir'], mail: false, model: false, containers: false },
    prerequisites: []
  }
  for (const route of HOST_ROUTES) {
    const slug = routeSlug(route.key)
    const item = routeItemId(route.key)
    const base = { ...common, itemIds: [item], legacyIds: [] }

    cases.push({
      ...base,
      id: `QA-INFRA-${slug}-anonymous`,
      requirement: `${route.key} refuses a call with no signature headers and does nothing`,
      oracle: 'signed-channel',
      edgeTags: ['anonymous', 'no-secret-leak'],
      assertionIds: ['refused-403', 'no-effect'],
      mutation: 'host-auth-off',
      redAssertion: 'refused-403',
      async run({ root }) {
        await withEnv(root, {}, async (env) => {
          const before = env.snapshot()
          const res = await sendTo(env, route, { sign: false })
          step('refused-403', () => {
            assert.equal(res.status, 403, `anonymous call answered ${res.status}: ${res.text.slice(0, 120)}`)
            assert.deepEqual(res.json, { code: 'BAD_SIGNATURE', why: 'missing' })
          })
          step('no-effect', () => assertNoEffect(env, before, 'anonymous call'))
        })
      }
    })

    cases.push({
      ...base,
      id: `QA-INFRA-${slug}-expired-auth`,
      requirement: `${route.key} refuses a correctly signed call whose timestamp is ten minutes old, and still accepts a fresh one`,
      oracle: 'signed-channel',
      edgeTags: ['expired-auth'],
      assertionIds: ['stale-refused', 'fresh-accepted'],
      mutation: 'host-skew-off',
      redAssertion: 'stale-refused',
      async run({ root }) {
        await withEnv(root, {}, async (env) => {
          const before = env.snapshot()
          const stale = await sendTo(env, route, { now: Date.now() - 600_000, nonce: 'qa-stale-1' })
          step('stale-refused', () => {
            assert.equal(stale.status, 403, `stale call answered ${stale.status}`)
            assert.equal(stale.json?.why, 'skew')
            assertNoEffect(env, before, 'stale call')
          })
          const fresh = await sendTo(env, route, { nonce: 'qa-fresh-1' })
          step('fresh-accepted', () => assert.notEqual(fresh.status, 403, 'a fresh signed call was refused'))
        })
      }
    })

    cases.push({
      ...base,
      id: `QA-INFRA-${slug}-wrong-method`,
      requirement: `${route.key} answers a signed call with the wrong HTTP verb 404/405 and does nothing`,
      oracle: 'caller-verbs',
      edgeTags: ['wrong-method'],
      assertionIds: ['wrong-verb-refused'],
      mutation: `host-method-open:${route.key}`,
      redAssertion: 'wrong-verb-refused',
      async run({ root }) {
        await withEnv(root, {}, async (env) => {
          const before = env.snapshot()
          const wrong = route.method === 'GET' ? 'POST' : 'GET'
          // A GET door needs a job that really exists, or a leaked handler would also answer 404.
          if (route.method === 'GET') env.store.set('abcdef123456', { id: 'abcdef123456', state: 'done' })
          const res = await env.send({ method: wrong, path: route.path, body: wrong === 'POST' ? '{}' : '' })
          step('wrong-verb-refused', () => {
            assert.ok(
              [404, 405].includes(res.status),
              `${wrong} answered ${res.status}: ${res.text.slice(0, 100)}`
            )
            assertNoEffect(env, before, `${wrong} call`)
          })
        })
      }
    })

    cases.push({
      ...base,
      id: `QA-INFRA-${slug}-replay`,
      requirement: `${route.key} refuses a second use of the same nonce (one-time nonce) after the first was accepted`,
      oracle: 'signed-channel',
      edgeTags: ['expired-auth', 'repeat'],
      assertionIds: ['first-passes', 'replay-refused'],
      mutation: 'host-replay-off',
      redAssertion: 'replay-refused',
      async run({ root }) {
        await withEnv(root, {}, async (env) => {
          const nonce = 'qa-replay-nonce'
          const first = await sendTo(env, route, { nonce })
          step('first-passes', () => assert.notEqual(first.status, 403, 'first call was refused'))
          const before = env.snapshot()
          const runsBefore = env.runs.length
          const second = await sendTo(env, route, { nonce })
          step('replay-refused', () => {
            assert.equal(second.status, 403, `replayed call answered ${second.status}`)
            assert.equal(second.json?.why, 'replay')
            assert.equal(env.runs.length, runsBefore, 'replayed call started a command')
            assert.deepEqual(env.snapshot(), before)
          })
        })
      }
    })

    cases.push({
      ...base,
      id: `QA-INFRA-${slug}-no-secret-leak`,
      requirement: `${route.key} refusals (anonymous, wrong secret, stale, replay) never echo the host secret or the presented signature`,
      oracle: 'signed-channel',
      edgeTags: ['no-secret-leak'],
      assertionIds: ['no-secret-in-refusals'],
      mutation: 'host-secret-leak',
      redAssertion: 'no-secret-in-refusals',
      async run({ root }) {
        await withEnv(root, {}, async (env) => {
          const client = await (await import('./host.mjs')).signer()
          const wrongHeaders = await client.signHostCall({
            secret: 'not-the-secret',
            path: route.path,
            body: '{}'
          })
          const attempts = [
            await sendTo(env, route, { sign: false }),
            await env.send({
              method: route.method,
              path: route.path,
              body: route.method === 'GET' ? '' : '{}',
              sign: false,
              headers: wrongHeaders
            }),
            await sendTo(env, route, { now: Date.now() - 600_000, nonce: 'qa-leak-stale' }),
            await sendTo(env, route, { nonce: 'qa-leak-replay' }),
            await sendTo(env, route, { nonce: 'qa-leak-replay' })
          ]
          step('no-secret-in-refusals', () => {
            const refused = attempts.filter((a) => a.status === 403)
            assert.ok(refused.length >= 3, `expected at least three refusals, saw ${refused.length}`)
            for (const a of refused) {
              assert.ok(!a.text.includes(HOST_SECRET), 'refusal body contains the host secret')
              assert.ok(!a.text.includes(wrongHeaders['x-host-signature']), 'refusal body echoes a signature')
              assert.ok(
                ['missing', 'skew', 'signature', 'replay'].includes(a.json?.why),
                `unexpected why: ${a.text}`
              )
            }
          })
        })
      }
    })

    if (route.json !== false) {
      cases.push({
        ...base,
        id: `QA-INFRA-${slug}-malformed-body`,
        requirement: `${route.key} answers a signed body that is not JSON with a 4xx refusal, starts nothing, writes nothing`,
        oracle: 'refuse-before-effect',
        edgeTags: ['malformed-body', 'invalid'],
        assertionIds: ['refused-4xx'],
        mutation: ROUTE_FN[route.key] ? `host-bad-json-escapes:${route.key}` : null,
        redAssertion: 'refused-4xx',
        async run({ root }) {
          await withEnv(root, {}, async (env) => {
            const before = env.snapshot()
            const res = await env.send({
              method: 'POST',
              path: route.path,
              body: '{not json',
              nonce: 'qa-mal-1'
            })
            step('refused-4xx', () => {
              assert.ok(
                res.status >= 400 && res.status < 500,
                `answered ${res.status}: ${res.text.slice(0, 100)}`
              )
              assertNoEffect(env, before, 'malformed body')
            })
          })
        }
      })
    }

    if (route.json !== false && ROUTE_FN[route.key]) {
      cases.push({
        ...base,
        id: `QA-INFRA-${slug}-malformed-body-json-null`,
        requirement: `${route.key} answers a signed body that is the JSON value null with a 4xx refusal, not a 5xx (observation: no approved spec names the status)`,
        oracle: 'refuse-before-effect',
        edgeTags: ['malformed-body', 'invalid'],
        assertionIds: ['not-a-server-error'],
        mutation: null,
        redAssertion: 'not-a-server-error',
        async run({ root }) {
          let observed
          await withEnv(root, {}, async (env) => {
            const res = await env.send({ method: 'POST', path: route.path, body: 'null', nonce: 'qa-null-1' })
            observed = res.status
          })
          if (observed >= 500) {
            return {
              pendingReason: `OBSERVED ${observed} Internal Server Error for body \`null\` (an unhandled TypeError reading a property of null in the route handler). No approved spec states the expected 4xx, so this is recorded as a finding for the owner, not as FAIL`
            }
          }
          return undefined
        }
      })
    }

    if (LABEL_BODY[route.key]) {
      for (const [name, label] of LABEL_VARIANTS) {
        const loose = Boolean(LOOSE_LABEL_FIX[route.key])
        cases.push({
          ...base,
          id: `QA-INFRA-${slug}-encoding-injection-${name}`,
          requirement: `${route.key} refuses the label ${JSON.stringify(label)} (not a valid Docker-name label) with 400 before any lookup, command or write`,
          oracle: 'docker-name-grammar',
          edgeTags: ['encoding-injection', 'invalid'],
          assertionIds: ['label-refused'],
          mutation: loose ? 'host-safe-arg-open' : 'host-label-open',
          fixMutation: loose ? `host-label-fix:${route.key}` : null,
          redAssertion: 'label-refused',
          async run({ root }) {
            await withEnv(root, {}, async (env) => {
              const before = env.snapshot()
              const res = await env.send({
                method: 'POST',
                path: route.path,
                body: JSON.stringify(LABEL_BODY[route.key](label)),
                nonce: `qa-label-${name}`
              })
              step('label-refused', () => {
                assert.equal(
                  res.status,
                  400,
                  `label ${JSON.stringify(label)} answered ${res.status}: ${res.text.slice(0, 100)}; commands started: ${JSON.stringify(env.runs.map((r) => [r.script, ...(r.args ?? []).slice(1)]))}`
                )
                assertNoEffect(env, before, 'bad label')
              })
            })
          }
        })
      }
    }
  }

  // ── provision: lease (drain marker), idempotent job key ─────────────────────────────────────
  const prov = { ...common, itemIds: [routeItemId('POST /_host/provision')], legacyIds: [] }
  const provisionBody = (extra = {}) =>
    JSON.stringify({ site: 'example.com', label: 'ex-example-com1', platform: 'emdash', ...extra })
  const sendProvision = (env, extra, opts = {}) =>
    env.send({ method: 'POST', path: '/_host/provision', body: provisionBody(extra), ...opts })
  const markDraining = (env, { until, ageMs = 0 }) => {
    const file = path.join(env.dirs.jobsDir, 'draining')
    writeFileSync(file, JSON.stringify(until === undefined ? {} : { until }))
    const when = new Date(Date.now() - ageMs)
    utimesSync(file, when, when)
  }

  cases.push({
    ...prov,
    id: 'QA-INFRA-host-provision-drain-lease-held',
    requirement:
      'while a deploy holds the draining marker, provision is refused 503 HOST_UPDATING and starts nothing',
    oracle: 'deploy-drain',
    edgeTags: ['restart', 'stale-lock'],
    assertionIds: ['refused-while-draining', 'accepted-when-clear'],
    mutation: 'host-drain-off',
    redAssertion: 'refused-while-draining',
    async run({ root }) {
      await withEnv(root, {}, async (env) => {
        markDraining(env, { until: Date.now() + 600_000 })
        const res = await sendProvision(env, {}, { nonce: 'qa-drain-1' })
        step('refused-while-draining', () => {
          assert.equal(res.status, 503, `answered ${res.status}: ${res.text}`)
          assert.equal(res.json?.code, 'HOST_UPDATING')
          assert.equal(env.runs.length, 0)
          assert.equal(env.puts.length, 0)
        })
      })
      await withEnv(root, {}, async (env) => {
        const res = await sendProvision(env, {}, { nonce: 'qa-drain-2' })
        step('accepted-when-clear', () =>
          assert.equal(res.status, 202, `no marker answered ${res.status}: ${res.text}`)
        )
      })
    }
  })

  cases.push({
    ...prov,
    id: 'QA-INFRA-host-provision-drain-lease-expired',
    requirement:
      'a draining marker whose own `until` is past no longer blocks provision (boundary: before / after expiry)',
    oracle: 'deploy-drain',
    edgeTags: ['stale-lock', 'boundary'],
    assertionIds: ['expired-marker-ignored', 'live-marker-honoured'],
    mutation: 'host-draining-never-expires',
    redAssertion: 'expired-marker-ignored',
    async run({ root }) {
      await withEnv(root, {}, async (env) => {
        markDraining(env, { until: Date.now() - 1000 })
        const res = await sendProvision(env, {}, { nonce: 'qa-exp-1' })
        step('expired-marker-ignored', () =>
          assert.equal(res.status, 202, `expired marker answered ${res.status}`)
        )
      })
      await withEnv(root, {}, async (env) => {
        markDraining(env, { until: Date.now() + 60_000 })
        const res = await sendProvision(env, {}, { nonce: 'qa-exp-2' })
        step('live-marker-honoured', () => assert.equal(res.status, 503))
      })
    }
  })

  cases.push({
    ...prov,
    id: 'QA-INFRA-host-provision-drain-lease-orphaned-marker',
    requirement:
      'a marker left behind by a deploy that died (written two hours ago, `until` far ahead) does not block new sites for good',
    oracle: 'deploy-drain',
    edgeTags: ['stale-lock'],
    assertionIds: ['old-marker-ignored'],
    mutation: 'host-draining-age-bound-off',
    redAssertion: 'old-marker-ignored',
    async run({ root }) {
      await withEnv(root, {}, async (env) => {
        markDraining(env, { until: Date.now() + 86_400_000, ageMs: 2 * 3_600_000 })
        const res = await sendProvision(env, {}, { nonce: 'qa-orphan-1' })
        step('old-marker-ignored', () =>
          assert.equal(res.status, 202, `two-hour-old marker answered ${res.status}`)
        )
      })
    }
  })

  cases.push({
    ...prov,
    id: 'QA-INFRA-host-provision-repeat-idempotent-key',
    requirement:
      'asking again with the same jobKey answers the job already running and starts no second provision',
    oracle: 'job-key-contract',
    edgeTags: ['repeat', 'idempotent'],
    assertionIds: ['second-reuses', 'one-command'],
    mutation: 'host-keyed-reuse-off',
    redAssertion: 'second-reuses',
    async run({ root }) {
      await withEnv(root, {}, async (env) => {
        const first = await sendProvision(env, { jobKey: 'build-1234:1' }, { nonce: 'qa-key-1' })
        const second = await sendProvision(env, { jobKey: 'build-1234:1' }, { nonce: 'qa-key-2' })
        await new Promise((resolve) => setTimeout(resolve, 100))
        step('second-reuses', () => {
          assert.equal(first.status, 202)
          assert.equal(second.status, 202)
          assert.equal(second.json?.jobId, first.json?.jobId)
          assert.equal(second.json?.reused, true)
        })
        step('one-command', () => assert.equal(env.runs.length, 1, `commands started: ${env.runs.length}`))
      })
    }
  })

  cases.push({
    ...prov,
    id: 'QA-INFRA-host-provision-concurrent-idempotent-key',
    requirement:
      'two requests with the same jobKey in flight at once start exactly one provision.sh (no double-provision over one webroot)',
    oracle: 'job-key-contract',
    edgeTags: ['concurrent', 'idempotent'],
    assertionIds: ['single-provision'],
    mutation: null,
    redAssertion: 'single-provision',
    async run({ root }) {
      await withEnv(root, { fileJobs: true }, async (env) => {
        const results = await Promise.all([
          sendProvision(env, { jobKey: 'build-9999:1' }, { nonce: 'qa-conc-1' }),
          sendProvision(env, { jobKey: 'build-9999:1' }, { nonce: 'qa-conc-2' })
        ])
        await new Promise((resolve) => setTimeout(resolve, 150))
        step('single-provision', () => {
          assert.ok(
            results.every((r) => r.status === 202),
            JSON.stringify(results.map((r) => r.status))
          )
          assert.equal(
            env.runs.length,
            1,
            `${env.runs.length} provision.sh were started for one jobKey; responses: ${JSON.stringify(results.map((r) => r.json))}`
          )
        })
      })
    }
  })

  // ── job store (GET /_host/jobs/:id and the files behind it) ────────────────────────────────
  const jobsItem = { ...common, itemIds: [routeItemId('GET /_host/jobs/:id')], legacyIds: [] }
  const jobsModule = (root) => import(pathToFileURL(path.join(root, 'apps/tracy-host/src/jobs.js')).href)
  const scratch = (name) => scratchDir(`qa-infra-${name}-`)

  cases.push({
    ...jobsItem,
    id: 'QA-INFRA-host-jobs-id-traversal',
    requirement:
      'GET /_host/jobs/:id with an id that is not a job id (`..%2Fsecret`) answers 404 and never reads a file outside the jobs directory; a real job id still answers 200',
    oracle: 'job-id-shape',
    edgeTags: ['encoding-injection', 'invalid'],
    assertionIds: ['real-job-readable', 'escape-refused'],
    mutation: null,
    fixMutation: 'host-jobs-id-shape-fix',
    redAssertion: 'escape-refused',
    async run({ root }) {
      await withEnv(root, { fileJobs: true }, async (env) => {
        writeFileSync(
          path.join(path.dirname(env.dirs.jobsDir), 'secret.json'),
          JSON.stringify({ state: 'OUTSIDE-THE-JOBS-DIR' })
        )
        const real = await (
          await import(pathToFileURL(path.join(root, 'apps/tracy-host/src/jobs.js')).href)
        ).putJob(env.dirs.jobsDir, 'abcdef123456', { state: 'done' })
        assert.equal(real.state, 'done')
        const ok = await env.send({ method: 'GET', path: '/_host/jobs/abcdef123456', body: '' })
        step('real-job-readable', () => assert.equal(ok.status, 200, ok.text))
        const escape = await env.send({ method: 'GET', path: '/_host/jobs/..%2Fsecret', body: '' })
        step('escape-refused', () => {
          assert.notEqual(escape.status, 200, `a file outside the jobs directory was served: ${escape.text}`)
          assert.equal(escape.status, 404)
          assert.ok(!escape.text.includes('OUTSIDE-THE-JOBS-DIR'))
        })
      })
    }
  })

  cases.push({
    ...jobsItem,
    id: 'QA-INFRA-host-jobs-id-restart-orphans',
    requirement:
      'after a host restart, jobs left queued/running are marked failed (a poll must not spin forever); finished jobs are untouched',
    oracle: 'job-restart',
    edgeTags: ['restart'],
    assertionIds: ['unfinished-failed', 'finished-untouched'],
    mutation: 'host-orphan-sweep-off',
    redAssertion: 'unfinished-failed',
    async run({ root }) {
      const dir = scratch('orphans')
      try {
        const jobs = await jobsModule(root)
        await jobs.putJob(dir, 'queuedjob', { state: 'queued', step: 'queued' })
        await jobs.putJob(dir, 'runningjob', { state: 'running', step: 'docker build' })
        await jobs.putJob(dir, 'donejob', { state: 'done', step: 'finished' })
        const marked = await jobs.orphanJobs(dir)
        await step('unfinished-failed', async () => {
          assert.deepEqual([...marked].sort(), ['queuedjob', 'runningjob'])
          assert.equal((await jobs.readJob(dir, 'runningjob')).state, 'failed')
          assert.equal((await jobs.readJob(dir, 'queuedjob')).state, 'failed')
        })
        await step('finished-untouched', async () =>
          assert.equal((await jobs.readJob(dir, 'donejob')).state, 'done')
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  cases.push({
    ...jobsItem,
    id: 'QA-INFRA-host-jobs-id-restart-orphans-scope',
    requirement:
      'the restart sweep fails ONLY unfinished jobs: a done or failed job keeps its state and fields',
    oracle: 'job-restart',
    edgeTags: ['restart', 'state-transition'],
    assertionIds: ['terminal-states-kept'],
    mutation: 'host-orphan-sweep-too-wide',
    redAssertion: 'terminal-states-kept',
    async run({ root }) {
      const dir = scratch('orphans-scope')
      try {
        const jobs = await jobsModule(root)
        await jobs.putJob(dir, 'donejob', { state: 'done', output: 'KEEP' })
        await jobs.putJob(dir, 'failedjob', { state: 'failed', detail: 'KEEP-ME' })
        await jobs.orphanJobs(dir)
        await step('terminal-states-kept', async () => {
          const done = await jobs.readJob(dir, 'donejob')
          const failed = await jobs.readJob(dir, 'failedjob')
          assert.equal(done.state, 'done')
          assert.equal(done.output, 'KEEP')
          assert.equal(failed.detail, 'KEEP-ME')
          assert.equal(done.orphanedAt, undefined)
        })
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  cases.push({
    ...jobsItem,
    id: 'QA-INFRA-host-jobs-id-concurrent-partial-write',
    requirement:
      'a reader polling a job while it is rewritten always sees a whole JSON document (never a truncated one)',
    oracle: 'job-restart',
    edgeTags: ['partial-write', 'concurrent'],
    assertionIds: ['reader-sees-whole-record'],
    mutation: 'host-job-write-not-atomic',
    redAssertion: 'reader-sees-whole-record',
    async run({ root }) {
      const dir = scratch('atomic')
      try {
        const jobs = await jobsModule(root)
        const big = 'x'.repeat(256 * 1024)
        await jobs.putJob(dir, 'poll', { state: 'running', output: big })
        let torn = 0
        let reads = 0
        let stop = false
        const reader = (async () => {
          const { readFile } = await import('node:fs/promises')
          while (!stop) {
            reads += 1
            try {
              JSON.parse(await readFile(path.join(dir, 'poll.json'), 'utf8'))
            } catch (error) {
              if (error.code !== 'ENOENT') torn += 1
            }
            await new Promise((resolve) => setImmediate(resolve))
          }
        })()
        for (let i = 0; i < 40; i += 1)
          await jobs.putJob(dir, 'poll', { state: 'running', output: big, tick: i })
        stop = true
        await reader
        step('reader-sees-whole-record', () =>
          assert.equal(torn, 0, `${torn} of ${reads} reads saw a torn record`)
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  // ── POST /_host/site: one case per dispatch kind ────────────────────────────────────────────
  const siteKey = 'POST /_host/site'
  for (const kind of [...WEBROOT_KINDS, 'core-manifest-write']) {
    const core = kind === 'core-manifest-write'
    for (const [name, label] of LABEL_VARIANTS.slice(0, 2)) {
      cases.push({
        ...common,
        itemIds: [kindItemId(kind)],
        legacyIds: [],
        id: `QA-INFRA-site-kind-${kind}-encoding-injection-${name}`,
        requirement: `POST /_host/site kind ${kind} refuses the label ${JSON.stringify(label)} (not a valid Docker-name label) before any command or write`,
        oracle: 'docker-name-grammar',
        edgeTags: ['encoding-injection', 'invalid'],
        assertionIds: ['label-refused'],
        mutation: core ? 'host-label-open' : 'host-safe-arg-open',
        fixMutation: core ? null : `host-label-fix:${siteKey}`,
        redAssertion: 'label-refused',
        async run({ root }) {
          await withEnv(root, {}, async (env) => {
            const before = env.snapshot()
            const body = core ? { kind, label, contentBase64: '' } : { kind, label }
            const res = await env.send({
              method: 'POST',
              path: '/_host/site',
              body: JSON.stringify(body),
              nonce: `qa-kind-${kind}-${name}`
            })
            step('label-refused', () => {
              assert.equal(
                res.status,
                400,
                `kind ${kind} label ${JSON.stringify(label)} answered ${res.status}: ${res.text.slice(0, 100)}`
              )
              assertNoEffect(env, before, 'bad label')
            })
          })
        }
      })
    }
  }
  cases.push({
    ...common,
    itemIds: [routeItemId(siteKey)],
    legacyIds: [],
    id: 'QA-INFRA-host-site-invalid-unknown-kind',
    requirement: 'POST /_host/site with a kind that is not dispatched is refused 400 and starts nothing',
    oracle: 'refuse-before-effect',
    edgeTags: ['invalid', 'boundary'],
    assertionIds: ['unknown-kind-refused'],
    mutation: 'host-unknown-kind-accepted',
    redAssertion: 'unknown-kind-refused',
    async run({ root }) {
      await withEnv(root, {}, async (env) => {
        const before = env.snapshot()
        const res = await env.send({
          method: 'POST',
          path: '/_host/site',
          body: JSON.stringify({ kind: 'rm-rf-everything', label: 'ex-example-com1' }),
          nonce: 'qa-unknown-kind'
        })
        step('unknown-kind-refused', () => {
          assert.equal(res.status, 400, `answered ${res.status}: ${res.text}`)
          assertNoEffect(env, before, 'unknown kind')
        })
      })
    }
  })

  return cases
}
