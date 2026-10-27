import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import { qualityHash } from '../src/opportunities-build/quality-dossier.js'
import {
  qualityExecutionProfile,
  qualityExecutionModel
} from '../src/opportunities-build/quality-execution-profile.js'
import { validateQualityPlan } from '../src/opportunities-build/quality-plan.js'
import {
  createQualitySiteReview,
  validateQualityReviewPatch
} from '../src/opportunities-build/quality-site-review.js'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const labels = ['Home', 'About', 'Menu', 'Stories', 'News', 'Contact']
const routes = ['/', '/about', '/services', '/projects', '/news', '/contact']
const dossier = {
  accountId: 'account',
  inputHash: 'dossier',
  business: { name: 'Cafe' },
  facts: [],
  sources: [],
  spans: [],
  conflicts: [],
  missing: [],
  at: '2026-10-20T12:00:00Z'
}
const observations = { accountId: 'account', hash: 'observations', pictures: [] }
const manifest = {
  hash: 'manifest',
  locale: 'en',
  pages: routes.map((route) => ({ route })),
  menus: [{ id: 'primary', name: 'primary', locale: 'en' }],
  terms: [],
  records: routes.map((route, index) => ({
    key: `page/${index}@en`,
    slug: `${index}`,
    defaultLocale: true,
    required: true,
    route,
    collection: 'page',
    locale: 'en',
    sample: { title: labels[index] },
    fields: [{ slug: 'title', type: 'string', required: true }]
  }))
}
const planInput = () => ({
  schemaVersion: 'tracy-wo-plan/v1',
  inputHash: dossier.inputHash,
  manifestHash: manifest.hash,
  observationHash: observations.hash,
  locale: 'en',
  otherLocales: 'empty-by-policy',
  message: 'Cafe pages',
  unresolved: [],
  terms: [],
  records: manifest.records.map((r, index) => ({
    key: r.key,
    state: 'planned',
    reason: 'Useful main page',
    fields: [
      {
        field: 'title',
        action: 'set',
        value: labels[index],
        copyPolicy: 'label',
        sourceRefs: [],
        claimRefs: [],
        reason: 'Page label'
      }
    ]
  })),
  navigation: [{ menuId: 'primary', items: [{ label: 'Home', url: '/' }], reason: 'Reach home' }]
})
const goodPlan = () => validateQualityPlan(planInput(), { dossier, manifest, observations }).artifact
const reportFor = (input, findings = []) => ({
  schemaVersion: 'tracy-wo-review/v1',
  contentHash: input.contentHash,
  renderHash: input.renderHash,
  coverage: input.render.reviewImages,
  findings,
  verdict: findings.length ? 'needs-attention' : 'pass'
})

async function harness(overrides = {}) {
  const plan = goodPlan(),
    artifacts = {},
    objects = new Map(),
    calls = [],
    captures = [],
    repairs = [],
    writes = [],
    events = []
  let content = { records: plan.records.map((r) => ({ key: r.key, title: r.fields[0].value })) },
    stopped = false
  const run = {
    id: 'run',
    account_id: 'account',
    input: {
      frozenHash: 'frozen',
      models: {
        review: {
          role: 'review',
          hash: 'frozen-review',
          capabilities: { vision: true },
          reasoning: { effort: 'high' },
          price: { maxImageTokens: 1024, inputCentsPerM: 30, outputCentsPerM: 120 }
        }
      }
    },
    artifacts
  }
  const context = {
    action: { account_id: 'account' },
    revision: { brief: { editorial: { frozenHash: 'frozen' } } },
    build: { id: 'build' },
    checkAllowed: async () => {
      if (stopped) throw Object.assign(new Error('Stop'), { code: 'QUALITY_RUN_CLOSED' })
    }
  }
  const store = {
    artifact: async (_id, _account, key, value) => {
      if (Object.hasOwn(artifacts, key))
        assert.deepEqual(value, artifacts[key], 'artifacts are immutable across retries')
      artifacts[key] = value
    },
    takeRepair: async (_id, _account, findingHash) => {
      const old = repairs.find((r) => r.findingHash === findingHash)
      if (old) return old
      if (repairs.length >= 2) throw Object.assign(new Error('limit'), { code: 'QUALITY_REPAIR_LIMIT' })
      const r = { id: `repair-${repairs.length + 1}`, n: repairs.length + 1, findingHash }
      repairs.push(r)
      return r
    }
  }
  const pixels = new Map()
  for (const width of [1440, 390])
    pixels.set(
      width,
      await sharp({
        create: {
          width,
          height: overrides.cssHeight ?? 900,
          channels: 3,
          background: width === 1440 ? '#b87652' : '#7198aa'
        }
      })
        .composite([
          {
            input: await sharp({ create: { width, height: 100, channels: 3, background: '#592f42' } })
              .png()
              .toBuffer(),
            left: 0,
            top: 0
          }
        ])
        .png()
        .toBuffer()
    )
  const deps = {
    loadContext: async () => ({ run, plan, manifest, dossier, observations, repairCount: 0 }),
    readCurrent: async () => ({ content, fields: manifest.records.map((r) => `${r.key}:title`) }),
    capture: async ({ route, width, height, dpr, contentHash }) => {
      captures.push({ route, width, contentHash })
      return {
        png: pixels.get(width),
        source: `<html><body>${route}<nav>Home</nav><footer>Cafe</footer></body></html>`,
        text: `${route} Cafe`,
        viewport: { width, height, dpr },
        cssHeight: overrides.cssHeight ?? 900,
        status: 200,
        fontsReady: true,
        imagesDecoded: true,
        lazyComplete: true,
        renderComplete: true,
        errors: []
      }
    },
    putPixels: async ({ id, bytes, sha256, mime }) => {
      assert.equal(sha(bytes), sha256)
      objects.set(id, bytes)
      return { objectKey: id, mime }
    },
    getPixels: async ({ id }) => objects.get(id),
    mechanical: async () => ({ pass: true, complete: true, checks: [{ id: 'http', pass: true }] }),
    paidFor: async () => async (role, stage, _system, input, images, limits) => {
      calls.push({ role, stage, input, images, limits })
      events.push(stage)
      assert.ok(!Object.hasOwn(input, 'planner'), 'the review has no planner verdict')
      if (role === 'review') {
        assert.ok(images.length > 0 && images.length <= 6)
        for (const image of images)
          assert.equal(sha(Buffer.from(image.dataUrl.split(',')[1], 'base64')), image.sha256)
        return reportFor(input)
      }
      throw new Error('unexpected planner call')
    },
    applyPatch: async (_ctx, value) => {
      writes.push(value)
      content = { records: value.plan.records.map((r) => ({ key: r.key, title: r.fields[0].value })) }
      return { state: 'succeeded', receipt: { planHash: value.plan.hash } }
    },
    store
  }
  const state = {
    run,
    context,
    deps,
    artifacts,
    objects,
    calls,
    captures,
    repairs,
    writes,
    events,
    get content() {
      return content
    },
    setContent: (value) => {
      content = value
    },
    stop: () => {
      stopped = true
    }
  }
  return {
    ...state,
    review: createQualitySiteReview({
      ...deps,
      ...(typeof overrides.deps === 'function' ? overrides.deps(state) : overrides.deps)
    })
  }
}

test('all six main routes and both real-pixel viewports reach local review and a separate global coherence call', async () => {
  const h = await harness(),
    result = await h.review(h.context)
  assert.equal(result.state, 'succeeded')
  assert.equal(result.gate.humanAcceptance, 'pending')
  assert.equal(result.gate.outreach, false)
  assert.deepEqual(
    h.captures.map((c) => `${c.route}@${c.width}`),
    routes.flatMap((route) => [1440, 390].map((width) => `${route}@${width}`))
  )
  assert.deepEqual(
    h.calls.map((c) => c.stage),
    ['d-r0-1', 'd-r0-2', 'd-r0-10']
  )
  assert.equal(h.calls.at(-1).input.reviewScope, 'whole-site-coherence')
  assert.equal(h.calls.at(-1).input.localReports.length, 2)
  assert.equal(h.artifacts['review-r0-render'].coverage.slices, 12)
  for (const key of ['review-r0-render', 'review-r0-semantic']) {
    const { hash, ...body } = h.artifacts[key]
    assert.equal(hash, qualityHash(body), 'persisted provenance is included in the artifact digest')
  }
  assert.equal(h.writes.length, 0)
  const again = await h.review(h.context)
  assert.equal(again.state, 'succeeded')
  assert.equal(h.calls.length, 3, 'restart/retry reuses completed reports rather than paying again')
})

test('a whole-site coherence failure cannot pass by AND-ing successful local reviews', async () => {
  const h = await harness({
    deps: (state) => ({
      paidFor: async () => async (_role, stage, _system, input) => {
        if (stage.endsWith('-10'))
          return reportFor(input, [
            {
              id: 'coherence',
              severity: 'major',
              dimension: 'coherence',
              message: 'Pages present conflicting identities',
              ...input.render.reviewImages[0],
              evidence: 'Header identity differs between pages',
              selector: 'header',
              claimRefs: []
            }
          ])
        if (stage.startsWith('patch-')) return { invalid: true }
        state.calls.push({ stage })
        return reportFor(input)
      }
    })
  })
  const result = await h.review(h.context)
  assert.equal(result.state, 'needs-attention')
  assert.equal(result.error, 'QUALITY_PATCH_INVALID')
  assert.equal(h.writes.length, 0)
  assert.equal(h.artifacts['review-r0-semantic'].state, 'needs-attention')
})

test('render errors, missing coverage, stale CMS and excess readable slices stop before an extra paid call', async () => {
  const broken = await harness({
    deps: {
      capture: async () => {
        throw Object.assign(new Error('font timeout'), { code: 'QUALITY_CAPTURE_INCOMPLETE' })
      }
    }
  })
  assert.equal((await broken.review(broken.context)).error, 'QUALITY_CAPTURE_INCOMPLETE')
  assert.equal(broken.calls.length, 0)
  const stale = await harness({
    deps: (state) => {
      const original = state.deps.readCurrent
      let n = 0
      return {
        readCurrent: async (...args) => {
          if (++n === 2) state.setContent({ records: [{ key: 'human', title: 'Human edit' }] })
          return original(...args)
        }
      }
    }
  })
  assert.equal((await stale.review(stale.context)).error, 'QUALITY_CAPTURE_CONTENT_CHANGED')
  assert.equal(stale.calls.length, 0)
  const long = await harness({ cssHeight: 5500 })
  const tooMany = await long.review(long.context)
  assert.equal(tooMany.error, 'QUALITY_REVIEW_COVERAGE_EXCEEDS_QUOTA')
  assert.ok(tooMany.report.requiredCalls > 10)
  assert.equal(long.calls.length, 0)
})

test('invalid reviewer JSON/schema or omitted pixels cannot invoke a repair writer', async () => {
  for (const answer of [null, {}, { findings: {} }]) {
    const h = await harness({ deps: { paidFor: async () => async () => answer } })
    assert.equal((await h.review(h.context)).error, 'QUALITY_REVIEW_INVALID')
    assert.equal(h.writes.length, 0)
  }
  const h = await harness({
    deps: {
      paidFor: async () => async (_role, _stage, _system, input) => ({ ...reportFor(input), coverage: [] })
    }
  })
  assert.equal((await h.review(h.context)).error, 'QUALITY_REVIEW_INVALID')
  assert.equal(h.repairs.length, 0)
})

test('the same root counter bounds semantic and mechanical repairs, and each repair recaptures actual content', async () => {
  const h = await harness({
    deps: (state) => ({
      paidFor: async () => async (role, stage, _system, input) => {
        state.calls.push({ stage })
        if (role === 'plan') {
          const decision = structuredClone(input.knownPlan.records[0].fields[0])
          decision.value = stage === 'patch-1' ? 'Menu' : 'Home'
          return {
            schemaVersion: 'tracy-wo-review-patch/v1',
            basePlanHash: input.basePlanHash,
            contentHash: input.contentHash,
            reviewHash: input.reviewHash,
            repairId: input.repairId,
            reason: 'Correct heading',
            changes: [
              {
                kind: 'field',
                recordKey: 'page/0@en',
                field: 'title',
                decision,
                findingIds: [input.report.findings[0].id]
              }
            ]
          }
        }
        if (stage.endsWith('-1'))
          return reportFor(input, [
            {
              id: 'identity',
              severity: 'major',
              dimension: 'identity',
              message: 'Heading does not match section',
              ...input.render.reviewImages[0],
              evidence: 'Visible heading and section mismatch',
              selector: 'h1',
              field: 'page/0@en:title',
              claimRefs: []
            }
          ])
        return reportFor(input)
      }
    })
  })
  const answer = await h.review(h.context)
  assert.equal(answer.error, 'QUALITY_REPAIR_LIMIT')
  assert.equal(h.repairs.length, 2)
  assert.equal(h.writes.length, 2)
  assert.equal(h.writes[0].plan.parentPlanHash, goodPlan().hash)
  assert.equal(h.writes[1].plan.parentPlanHash, goodPlan().hash)
  assert.equal(h.writes[1].plan.basePlanHash, h.writes[0].plan.hash)
  for (const write of h.writes) {
    const { hash, ...body } = write.plan
    assert.equal(hash, qualityHash(body))
    assert.equal(
      write.baseContentHash,
      qualityHash(write.baseContent),
      'repair executor receives the exact reviewed CMS snapshot'
    )
  }
  assert.deepEqual(
    h.calls.filter((c) => c.stage.startsWith('patch-')).map((c) => c.stage),
    ['patch-1', 'patch-2']
  )
  assert.equal(h.captures.length, 36)
  assert.ok(h.artifacts['review-r1-render'].contentHash !== h.artifacts['review-r0-render'].contentHash)
  assert.equal(h.artifacts['review-r2-render'].coverage.captures, 12)
})

test('Stop before the next paid call prevents both that call and every write', async () => {
  const h = await harness({
    deps: (state) => ({
      paidFor: async () => async (_role, stage, _system, input) => {
        state.calls.push({ stage })
        state.stop()
        return reportFor(input)
      }
    })
  })
  await assert.rejects(h.review(h.context), { code: 'QUALITY_RUN_CLOSED' })
  assert.equal(h.calls.length, 1)
  assert.equal(h.writes.length, 0)
})

test('a damaged cached capture cannot reuse a prior passing verdict or trigger another paid call', async () => {
  const h = await harness()
  assert.equal((await h.review(h.context)).state, 'succeeded')
  h.artifacts['review-r0-render'].captures.pop()
  const count = h.calls.length
  assert.equal((await h.review(h.context)).error, 'QUALITY_RENDER_ARTIFACT_CHANGED')
  assert.equal(h.calls.length, count)
})

test('request-aware batching preserves all pixels while separating large route content before dispatch', async () => {
  const h = await harness({
    deps: (state) => {
      state.setContent({ records: routes.map((route) => ({ route, body: 'a'.repeat(9000) })) })
      return {
        readCurrent: async () => ({
          content: state.content,
          reviewContentFor: ({ routes: selected, global }) =>
            global
              ? { routes: selected }
              : { records: state.content.records.filter((r) => selected.includes(r.route)) }
        })
      }
    }
  })
  assert.equal((await h.review(h.context)).state, 'succeeded')
  const local = h.calls.filter((c) => c.stage !== 'd-r0-10')
  assert.equal(local.length, 6)
  assert.equal(
    local.reduce((n, call) => n + call.images.length, 0),
    12
  )
  assert.ok(h.artifacts['review-r0-schedule'].local.every((call) => call.budget.maxInputTokens <= 20000))
})

test('a single route that cannot fit the frozen input cap stops with no paid partial review', async () => {
  const h = await harness({
    deps: (state) => {
      state.setContent({ records: [{ route: '/', body: 'x'.repeat(21000) }] })
      return { readCurrent: async () => ({ content: state.content }) }
    }
  })
  assert.equal((await h.review(h.context)).error, 'QUALITY_REVIEW_INPUT_TOO_LARGE')
  assert.equal(h.calls.length, 0)
})

function freezeBoundedReview(state) {
  state.run.input.executionProfile = qualityExecutionProfile()
  state.run.input.models.review = qualityExecutionModel(
    state.run.input.models.review,
    state.run.input.executionProfile
  )
}

test('the frozen profile packs all 48 readable slices before eight local calls and the 120k global call', async () => {
  const h = await harness({
    cssHeight: 3500,
    deps: (state) => {
      freezeBoundedReview(state)
      return {
        paidFor: async () => async (role, stage, system, input, images, limits) => {
          assert.equal(state.captures.length, 12, 'all route captures exist before the first paid D call')
          assert.equal(state.artifacts['review-r0-schedule'].preflight.sliceIds.length, 48)
          state.calls.push({ role, stage, system, input, images, limits })
          return reportFor(input)
        }
      }
    }
  })
  assert.equal((await h.review(h.context)).state, 'succeeded')
  const locals = h.calls.filter((call) => call.stage !== 'd-r0-9')
  assert.equal(locals.length, 8)
  assert.equal(
    locals.reduce((count, call) => count + call.images.length, 0),
    48
  )
  assert.equal(new Set(locals.flatMap((call) => call.images.map((image) => image.id))).size, 48)
  assert.ok(locals.every((call) => call.limits.maxInputTokens === 54000))
  assert.equal(h.calls.at(-1).limits.maxInputTokens, 120000)
  assert.equal(h.calls.at(-1).input.localReports.length, 8)
  assert.equal(h.artifacts['review-r0-schedule'].preflight.phase, 'all-captures-and-global-base')
  assert.equal(h.artifacts['review-r0-global-preflight'].phase, 'all-actual-local-reports')
  assert.equal(h.artifacts['review-r0-global-preflight'].localReportHashes.length, 8)
  assert.equal(h.artifacts['review-r0-schedule'].executionProfileHash, h.run.input.executionProfile.hash)
  assert.equal((await h.review(h.context)).state, 'succeeded')
  assert.equal(h.calls.length, 9, 'cached reports and coverage resume without new calls')
})

test('the frozen profile refuses excess slices, tight real packing and oversized global base before any paid D call', async () => {
  for (const mode of ['slices', 'packing', 'global']) {
    const h = await harness({
      cssHeight: mode === 'global' ? 900 : mode === 'slices' ? 5000 : 3500,
      deps: (state) => {
        freezeBoundedReview(state)
        if (mode === 'slices') return {}
        return {
          readCurrent: async () => ({
            content: state.content,
            reviewContentFor: ({ global }) => ({
              body: 'x'.repeat(mode === 'global' ? (global ? 121000 : 100) : 44000)
            })
          })
        }
      }
    })
    const result = await h.review(h.context)
    assert.equal(result.state, 'needs-attention')
    assert.equal(
      result.error,
      mode === 'global' ? 'QUALITY_INPUT_LIMIT' : 'QUALITY_REVIEW_COVERAGE_EXCEEDS_QUOTA'
    )
    assert.equal(h.calls.length, 0)
    assert.equal(h.writes.length, 0)
  }
})

test('all actual local findings are checked again before global dispatch without truncation or replay', async () => {
  const h = await harness({
    deps: (state) => {
      freezeBoundedReview(state)
      return {
        readCurrent: async () => ({
          content: state.content,
          reviewContentFor: ({ global }) => ({ body: 'x'.repeat(global ? 90000 : 100) })
        }),
        paidFor: async () => async (role, stage, system, input, images, limits) => {
          state.calls.push({ role, stage, system, input, images, limits })
          const image = input.render.reviewImages[0]
          return reportFor(
            input,
            Array.from({ length: 20 }, (_, index) => ({
              id: `minor-${index}`,
              severity: 'minor',
              dimension: 'coherence',
              ...image,
              imageId: image.imageId,
              message: 'm'.repeat(1000),
              evidence: 'e'.repeat(2000),
              selector: 'main'
            }))
          )
        }
      }
    }
  })
  const first = await h.review(h.context)
  assert.equal(first.error, 'QUALITY_INPUT_LIMIT')
  assert.deepEqual(
    h.calls.map((call) => call.stage),
    ['d-r0-1', 'd-r0-2']
  )
  assert.equal(h.artifacts['review-r0-local-1'].findings.length, 20)
  assert.equal(h.artifacts['review-r0-local-2'].findings.length, 20)
  assert.equal(h.artifacts['review-r0-global-preflight'], undefined)
  assert.equal((await h.review(h.context)).error, 'QUALITY_INPUT_LIMIT')
  assert.equal(h.calls.length, 2, 'known local reports are reused after global attention')
})

test('a provider timeout/truncation is attention with no replacement call or repair writer', async () => {
  for (const code of ['QUALITY_MODEL_TRUNCATED', 'QUALITY_ATTEMPT_UNCERTAIN', 'QUALITY_INPUT_LIMIT']) {
    const h = await harness({
      deps: (state) => ({
        paidFor: async () => async () => {
          state.calls.push({ code })
          throw Object.assign(new Error(code), { code })
        }
      })
    })
    assert.equal((await h.review(h.context)).error, code)
    assert.equal(h.calls.length, 1)
    assert.equal(h.writes.length, 0)
  }
})

test('earlier mechanical repairs consume the same root allowance and an account mismatch fails before capture', async () => {
  const h = await harness({
    deps: (state) => {
      state.repairs.push({ n: 1 }, { n: 2 })
      return {
        mechanical: async () => ({
          pass: false,
          complete: true,
          checks: [{ id: 'cta', pass: false, expected: 'Repair the invalid CTA', detail: [{ page: '/' }] }]
        })
      }
    }
  })
  assert.equal((await h.review(h.context)).error, 'QUALITY_REPAIR_LIMIT')
  assert.equal(h.calls.filter((c) => c.role === 'plan').length, 0)
  assert.equal(h.writes.length, 0)
  const other = await harness()
  other.context.action.account_id = 'other-account'
  await assert.rejects(other.review(other.context), { code: 'QUALITY_REVIEW_SCOPE' })
  assert.equal(other.captures.length, 0)
})

test('patch validation rejects stale hashes, invented authority, unknown fields and cross-route changes', () => {
  const plan = goodPlan(),
    report = { hash: 'review', findings: [{ id: 'happyhour', route: '/', severity: 'critical' }] },
    repair = { id: 'repair', n: 1 }
  const patch = {
    schemaVersion: 'tracy-wo-review-patch/v1',
    basePlanHash: plan.hash,
    contentHash: 'content',
    reviewHash: report.hash,
    repairId: repair.id,
    reason: 'Correct an evidenced heading',
    changes: [
      {
        kind: 'field',
        recordKey: 'page/0@en',
        field: 'title',
        decision: { ...plan.records[0].fields[0], value: 'Menu' },
        findingIds: ['happyhour']
      }
    ]
  }
  const context = { plan, contentHash: 'content', report, repair, dossier, manifest, observations }
  assert.equal(validateQualityReviewPatch(patch, context).ok, true)
  for (const mutate of [
    (p) => {
      p.contentHash = 'old'
    },
    (p) => {
      p.sql = 'update anything'
    },
    (p) => {
      p.changes[0].field = 'script'
    },
    (p) => {
      p.changes[0].recordKey = 'page/1@en'
    },
    (p) => {
      p.changes[0].findingIds = ['invented']
    },
    (p) => {
      p.changes[0].decision.value = 'Happy hour 7AM to 10PM'
    }
  ]) {
    const copy = structuredClone(patch)
    mutate(copy)
    assert.equal(validateQualityReviewPatch(copy, context).ok, false)
  }
})

test('repair metadata preserves taxonomy slugs already embedded in rendered content', () => {
  const key = 'term:category/food@en'
  const termsManifest = {
    ...manifest,
    terms: [{ key, name: 'category', slug: 'food', label: 'Food', locale: 'en', defaultLocale: true }]
  }
  const input = planInput()
  input.terms = [{ key, label: 'Food', slug: 'food', description: '', reason: 'Food category' }]
  const plan = validateQualityPlan(input, { dossier, manifest: termsManifest, observations }).artifact
  const report = { hash: 'review', findings: [{ id: 'category-label', route: '/', severity: 'major' }] },
    repair = { id: 'repair', n: 1 }
  const patch = {
    schemaVersion: 'tracy-wo-review-patch/v1',
    basePlanHash: plan.hash,
    contentHash: 'content',
    reviewHash: report.hash,
    repairId: repair.id,
    reason: 'Correct a category label',
    changes: [
      {
        kind: 'term',
        termKey: key,
        findingIds: ['category-label'],
        decision: { ...input.terms[0], label: 'Drinks' }
      }
    ]
  }
  const context = {
    plan,
    contentHash: 'content',
    report,
    repair,
    dossier,
    manifest: termsManifest,
    observations
  }
  assert.equal(validateQualityReviewPatch(patch, context).ok, true)
  patch.changes[0].decision.slug = 'drinks'
  assert.ok(validateQualityReviewPatch(patch, context).errors.includes('QUALITY_PATCH_SLUG_CHANGED'))
})
