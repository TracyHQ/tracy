/**
 * The compiler is the only thing allowed to decide where a write lands, so these tests are mostly
 * about what it REFUSES. Each refusal below is a way a model's output, a stale artifact or a
 * hostile asset reference could otherwise reach a customer's site.
 *
 * MOCK/BLOCKED. The `llm-port` double here is `mockLlmPort`, which stamps `MOCK` on everything it
 * returns; no model is called and none can be, because session C has not published its operation
 * names. The Claude Cowork plugin is a fixture too — nothing in this file talks to a real site.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveBindings } from '../src/brief/bindings.js'
import {
  compileSeedMap,
  PRESENTATION_ACTIONS,
  COWORK_SCALAR_BATCH_LIMIT,
  coworkWouldRefuse,
  resolveAssetRef,
  SeedCompileError
} from '../src/brief/compile.js'
import {
  createLlmPort,
  LlmPortError,
  mockLlmPort,
  notConfiguredPort,
  PROPOSED_OPERATIONS
} from '../src/brief/llm-port.js'
import { fromTypedAnswers, normalizeBrief } from '../src/brief/normalize.js'
import { CONTENT_PLAN_SCHEMA, seedMapName, validateContentPlan } from '../src/brief/schema.mjs'

const BUILD = { buildId: 'b-1', siteKey: 'site-abc', tenantId: 'tenant-1' }
const RELEASE = { tag: 'tracy-business-j6', platform: 'joomla', version: '1.1.0', capabilitiesHash: 'cap-1' }
const CAPABILITIES = {
  capabilities: [
    { key: 'core:name', kind: 'core' },
    { key: 'core:about', kind: 'core' }
  ]
}
const COWORK = {
  contract: 'tracy-business@1.1.0',
  revision: 'rev-7',
  media: ['images/bakery-front.jpg'],
  slots: []
}

const briefOf = (over = {}) =>
  normalizeBrief({
    build: BUILD,
    release: RELEASE,
    capabilities: CAPABILITIES,
    locales: { primary: 'vi-VN', secondary: ['en-GB'] },
    createdAt: '2026-09-22T00:00:00.000Z',
    answers: fromTypedAnswers([
      { questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' },
      { questionId: 'q-about', key: 'about', value: 'Bakery in District 7' }
    ]),
    ...over
  })

const slot = (over = {}) => ({
  key: 'module-441.2',
  entity: 'module-441',
  type: 'text',
  sample: 'Welcome to our bakery',
  maxCharacters: 80,
  semanticKey: 'hero.headline',
  ...over
})

const bindingsOf = (slots, groups) =>
  resolveBindings({
    release: { tag: RELEASE.tag, contract: COWORK.contract },
    slots,
    groups
  })

const planOf = (brief, groups) => ({
  schema: CONTENT_PLAN_SCHEMA,
  briefRevision: brief.revision,
  briefHash: brief.hash,
  groups
})

const group = (over = {}) => ({
  id: 'g1',
  semanticKey: 'hero.headline',
  locale: 'vi-VN',
  factRefs: ['s0'],
  text: 'Tiệm bánh Bảy',
  ...over
})

/** The whole happy path in one call, so each refusal test can change exactly one thing. */
const compile = (over = {}) => {
  const brief = over.brief ?? briefOf()
  const groups = over.groups ?? [group()]
  const slots = over.slots ?? [slot()]
  const bindings =
    over.bindings ??
    bindingsOf(
      slots,
      groups.map((g) => ({ id: g.id, semanticKey: g.semanticKey }))
    )
  return compileSeedMap({
    brief,
    plan: over.plan ?? planOf(brief, groups),
    bindings,
    build: over.build ?? BUILD,
    cowork: over.cowork ?? { ...COWORK, slots },
    assetInventory: over.assetInventory ?? [],
    applied: over.applied,
    reconcile: over.reconcile,
    createdAt: over.createdAt ?? '2026-09-22T00:00:00.000Z'
  })
}

const refusedWith = (code, run) =>
  assert.throws(run, (error) => {
    assert.ok(error instanceof SeedCompileError, `expected a SeedCompileError, got ${error?.name}`)
    assert.equal(error.code, code)
    return true
  })

// ── the happy path, and what makes it repeatable ────────────────────────────────────────────────

test('a ready brief and a valid plan compile to one batch of scalar changes', () => {
  const map = compile()
  assert.equal(map.status, 'ready')
  assert.deepEqual(map.changes, { 'module-441.2': 'Tiệm bánh Bảy' })
  assert.equal(map.batches.length, 1)
  assert.equal(map.batches[0].expectedRevision, 'rev-7')
  assert.deepEqual(map.batches[0].dependsOn, [])
  assert.match(map.batches[0].applyId, /^contract-[0-9a-f]{48}$/)
  assert.equal(map.atomic, false, 'a seed is never claimed to be atomic across a site')
  assert.equal(map.limits.scalarChangesPerBatch, COWORK_SCALAR_BATCH_LIMIT)
  assert.equal(seedMapName(map.siteKey), 'site-abc_content_seed_map')
})

test('IDEMPOTENT: the same inputs compile to the same hash and the same apply id', () => {
  const a = compile({ createdAt: '2026-09-22T00:00:00.000Z' })
  const b = compile({ createdAt: '2027-05-05T05:05:05.000Z' })
  assert.equal(a.hash, b.hash, 'the clock is not an input')
  assert.deepEqual(
    a.batches.map((x) => x.applyId),
    b.batches.map((x) => x.applyId)
  )
  // And a different value is a different identity, so a retry cannot silently apply new content.
  const changed = compile({ groups: [group({ text: 'Tiệm bánh Tám' })] })
  assert.notEqual(a.hash, changed.hash)
  assert.notEqual(a.batches[0].applyId, changed.batches[0].applyId)
})

test('a value the site already holds is not a change', () => {
  const map = compile({ slots: [slot({ current: 'Tiệm bánh Bảy' })] })
  assert.deepEqual(map.changes, {})
  assert.equal(map.batches.length, 0)
})

test('more changes than one apply accepts are split into checkpointed batches', () => {
  // tracy-business j6/1.1.0 carries 1800 slots, so this is the real shape, not a stress test.
  const count = 1800
  const slots = Array.from({ length: count }, (_, i) =>
    slot({ key: `module-${String(i).padStart(4, '0')}.1`, semanticKey: `g.${i}`, maxCharacters: 200 })
  )
  const groups = slots.map((s, i) => group({ id: `g${i}`, semanticKey: s.semanticKey, text: `Value ${i}` }))
  const map = compile({ slots, groups })
  assert.equal(Object.keys(map.changes).length, count)
  assert.equal(map.batches.length, 2)
  assert.equal(map.batches[0].keys.length, COWORK_SCALAR_BATCH_LIMIT)
  assert.equal(map.batches[1].keys.length, count - COWORK_SCALAR_BATCH_LIMIT)
  assert.deepEqual(map.batches[1].dependsOn, [0], 'batch two waits for batch one to have a receipt')
  assert.deepEqual(map.dependencies, [
    { batch: 0, dependsOn: [] },
    { batch: 1, dependsOn: [0] }
  ])
  assert.notEqual(map.batches[0].applyId, map.batches[1].applyId)
})

// ── refusals ────────────────────────────────────────────────────────────────────────────────────

test('refuses a group no binding places', () => {
  const brief = briefOf()
  const groups = [group(), group({ id: 'g2', semanticKey: 'about.body', text: 'Bakery' })]
  refusedWith('UNKNOWN_GROUP', () =>
    compile({
      brief,
      groups,
      plan: planOf(brief, groups),
      bindings: bindingsOf([slot()], [{ id: 'g1', semanticKey: 'hero.headline' }])
    })
  )
})

test('refuses a brief that belongs to another site', () => {
  refusedWith('SITE_MISMATCH', () => compile({ build: { ...BUILD, siteKey: 'site-other' } }))
})

test('refuses a brief that belongs to another tenant', () => {
  refusedWith('SITE_MISMATCH', () => compile({ build: { ...BUILD, tenantId: 'tenant-2' } }))
})

test('refuses a plan written for an older revision of the brief — hash drift is not a warning', () => {
  const brief = briefOf()
  const stale = { ...planOf(brief, [group()]), briefHash: 'a-hash-from-yesterday' }
  refusedWith('BRIEF_HASH_DRIFT', () => compile({ brief, plan: stale }))
})

test('refuses a plan naming a different brief revision', () => {
  const brief = briefOf()
  refusedWith('BRIEF_REVISION_DRIFT', () =>
    compile({ brief, plan: { ...planOf(brief, [group()]), briefRevision: 2 } })
  )
})

test('refuses bindings resolved against a different contract', () => {
  const brief = briefOf()
  const bindings = resolveBindings({
    release: { tag: RELEASE.tag, contract: 'some-other-quickstart@0.9.0' },
    slots: [slot()],
    groups: [{ id: 'g1', semanticKey: 'hero.headline' }]
  })
  refusedWith('CONTRACT_MISMATCH', () => compile({ brief, bindings }))
})

test('refuses a group whose text is not a string, at whichever layer sees it first', () => {
  // The schema layer catches a wrong TYPE before the compiler ever reads the value...
  refusedWith('PLAN_INVALID', () => compile({ groups: [group({ text: 42 })] }))
  // ...and the compiler catches a text slot with no text at all.
  const { text, ...noText } = group()
  assert.equal(typeof text, 'string')
  refusedWith('BAD_VALUE_TYPE', () => compile({ groups: [noText] }))
})

test('refuses a value longer than the slot accepts, before the Claude Cowork plugin loses the batch for it', () => {
  refusedWith('VALUE_TOO_LONG', () => compile({ groups: [group({ text: 'x'.repeat(81) })] }))
})

test('refuses the three values the Claude Cowork plugin itself would refuse', () => {
  refusedWith('COWORK_WOULD_REFUSE', () => compile({ groups: [group({ text: 'Under <400ms' })] }))
  refusedWith('COWORK_WOULD_REFUSE', () => compile({ groups: [group({ text: 'Call {loadposition x}' })] }))
  refusedWith('COWORK_WOULD_REFUSE', () =>
    compile({
      slots: [slot({ type: 'url', sample: '#', maxCharacters: 200 })],
      groups: [group({ text: 'javascript:alert(1)' })]
    })
  )
})

test('coworkWouldRefuse mirrors the planner rule, including the shapes it allows', () => {
  const url = { type: 'url' }
  assert.equal(coworkWouldRefuse(url, 'https://tracy.ai/x'), null)
  assert.equal(coworkWouldRefuse(url, 'mailto:a@b.c'), null)
  assert.equal(coworkWouldRefuse(url, 'index.php?Itemid=263'), null)
  assert.equal(coworkWouldRefuse(url, '//evil.example'), 'unsupported-url')
  assert.equal(coworkWouldRefuse(url, 'http://insecure.example'), 'unsupported-url')
  assert.equal(coworkWouldRefuse({ type: 'text' }, 'Plain words'), null)
  assert.equal(coworkWouldRefuse({ type: 'text' }, `line${String.fromCharCode(0)}break`), 'markup')
  assert.equal(coworkWouldRefuse({ type: 'text' }, 'tab\there'), null, 'tab is content, not a control byte')
})

test('refuses a locale the site does not carry', () => {
  refusedWith('UNKNOWN_LOCALE', () => compile({ groups: [group({ locale: 'ru-RU' })] }))
})

test('refuses to omit, unpublish or move anything — that door does not exist yet', () => {
  for (const action of PRESENTATION_ACTIONS)
    refusedWith('PRESENTATION_NOT_EXPRESSIBLE', () => compile({ groups: [group({ action })] }))
})

test('refuses a plan that names a destination at all', () => {
  const brief = briefOf()
  const plan = planOf(brief, [{ ...group(), slotKey: 'module-441.2' }])
  assert.equal(validateContentPlan(plan).ok, false)
  refusedWith('PLAN_INVALID', () => compile({ brief, plan }))
  refusedWith('PLAN_INVALID', () =>
    compile({ brief, plan: planOf(brief, [{ ...group(), sql: 'update ...' }]) })
  )
  refusedWith('PLAN_INVALID', () =>
    compile({ brief, plan: planOf(brief, [{ ...group(), siteKey: 'site-other' }]) })
  )
})

test('compiling without a build context or a fresh inspect is refused', () => {
  refusedWith('NO_BUILD_CONTEXT', () => compile({ build: { siteKey: 'site-abc' } }))
  refusedWith('NO_COWORK_STATE', () => compile({ cowork: { contract: 'x' } }))
})

// ── gaps and evidence ───────────────────────────────────────────────────────────────────────────

test('a brief that still needs input compiles to a question list, never to filler content', () => {
  const brief = briefOf({
    answers: fromTypedAnswers([{ questionId: 'q-name', key: 'name', value: 'Tiệm bánh Bảy' }]),
    demoFacts: ['address', 'prices']
  })
  const map = compile({ brief, plan: planOf(brief, [group()]) })
  assert.equal(map.status, 'needs_input')
  assert.deepEqual(map.batches, [], 'nothing is applied while the brief has gaps')
  assert.deepEqual(map.pending.map((p) => p.group).sort(), ['brief:about', 'brief:address', 'brief:prices'])
})

test('an evidence-required slot waits unless the value is verbatim from the brief', () => {
  const slots = [slot({ requiresEvidence: true, maxCharacters: 200 })]
  const invented = compile({ slots, groups: [group({ text: 'Over 500 happy customers' })] })
  assert.equal(invented.status, 'needs_input')
  assert.deepEqual(invented.pending, [{ group: 'g1', slotKey: 'module-441.2', why: 'evidence-missing' }])
  assert.deepEqual(invented.changes, {})

  const quoted = compile({ slots, groups: [group({ text: 'Bakery in District 7' })] })
  assert.equal(quoted.status, 'ready')
  assert.deepEqual(quoted.evidence, { 'module-441.2': 'Bakery in District 7' })
})

test('an asset intent with no asset behind it makes the group wait', () => {
  const map = compile({
    slots: [slot({ type: 'image', sample: 'images/demo.jpg' })],
    groups: [
      { id: 'g1', semanticKey: 'hero.headline', locale: 'vi-VN', factRefs: [], assetIntent: 'a shopfront' }
    ]
  })
  assert.equal(map.status, 'needs_input')
  assert.deepEqual(map.pending, [{ group: 'g1', slotKey: 'module-441.2', why: 'asset-not-supplied' }])
})

// ── the asset door: SSRF and tenants ─────────────────────────────────────────────────────────────

const ASSET = {
  assetId: 'ast1',
  tenantId: 'tenant-1',
  mediaPath: 'images/bakery-front.jpg',
  sha256: 'a'.repeat(64),
  alt: 'Shopfront',
  uploadReceipt: 'up-1'
}

test('an asset resolves only through asset:<id> into this tenant’s own inventory', () => {
  const resolved = resolveAssetRef('asset:ast1', {
    tenantId: 'tenant-1',
    inventory: [ASSET],
    siteMedia: ['images/bakery-front.jpg']
  })
  assert.deepEqual(resolved, {
    assetId: 'ast1',
    mediaPath: 'images/bakery-front.jpg',
    sha256: 'a'.repeat(64),
    alt: 'Shopfront',
    receipt: 'up-1'
  })
})

test('NO URL OR PATH IS EVER ACCEPTED — the SSRF door is shut, not filtered', () => {
  const where = { tenantId: 'tenant-1', inventory: [ASSET], siteMedia: ['images/bakery-front.jpg'] }
  for (const hostile of [
    'http://169.254.169.254/latest/meta-data/',
    'https://evil.example/x.png',
    'file:///etc/passwd',
    '//evil.example/x.png',
    'data:image/png;base64,AAAA',
    '/var/www/site/images/x.png',
    '../../etc/passwd',
    'images/bakery-front.jpg',
    'asset:../ast1',
    'asset:',
    42
  ])
    assert.throws(
      () => resolveAssetRef(hostile, where),
      (error) => error.code === 'ASSET_BAD_REF' || error.code === 'ASSET_NOT_FOUND',
      `accepted ${String(hostile)}`
    )
})

test('an asset belonging to another tenant is refused even when its id is known', () => {
  assert.throws(
    () => resolveAssetRef('asset:ast1', { tenantId: 'tenant-2', inventory: [ASSET], siteMedia: null }),
    (error) => error.code === 'ASSET_FOREIGN_TENANT'
  )
})

test('an asset with no upload receipt, a path outside the media tree, or one the site does not hold, waits', () => {
  const cases = [
    [{ ...ASSET, uploadReceipt: null }, null, 'ASSET_NO_RECEIPT'],
    [{ ...ASSET, mediaPath: '/etc/passwd' }, null, 'ASSET_BAD_PATH'],
    [{ ...ASSET, mediaPath: 'images/../../etc/passwd' }, null, 'ASSET_BAD_PATH'],
    [{ ...ASSET, mediaPath: 'images\\..\\x.png' }, null, 'ASSET_BAD_PATH'],
    [{ ...ASSET, mediaPath: 'https://evil.example/x.png' }, null, 'ASSET_BAD_PATH'],
    [ASSET, ['images/something-else.jpg'], 'ASSET_NOT_IN_LIBRARY']
  ]
  for (const [row, siteMedia, code] of cases)
    assert.throws(
      () => resolveAssetRef('asset:ast1', { tenantId: 'tenant-1', inventory: [row], siteMedia }),
      (error) => error.code === code,
      `${row.mediaPath} expected ${code}`
    )
})

test('a resolved asset becomes the slot value and carries its receipt onto the map', () => {
  const map = compile({
    slots: [slot({ type: 'image', sample: 'images/demo.jpg', maxCharacters: 255 })],
    groups: [
      { id: 'g1', semanticKey: 'hero.headline', locale: 'vi-VN', factRefs: [], assetRef: 'asset:ast1' }
    ],
    assetInventory: [ASSET]
  })
  assert.deepEqual(map.changes, { 'module-441.2': 'images/bakery-front.jpg' })
  assert.deepEqual(map.assets, [
    {
      slotKey: 'module-441.2',
      assetId: 'ast1',
      mediaPath: 'images/bakery-front.jpg',
      sha256: 'a'.repeat(64),
      alt: 'Shopfront',
      receipt: 'up-1'
    }
  ])
})

// ── the reconciliation seam ─────────────────────────────────────────────────────────────────────

test('when a reconciler is injected, a slot a PERSON edited is dropped from the changes', () => {
  // A stand-in with the same rule as `reconcileWithSite` — archive / pipeline / person. The real
  // one lives in packages/cms/tracy-seeder/src/reconcile-site.mjs:36 and is injected by a caller
  // that can reach the seeder; apps/tracy-web declares no dependency on it.
  const reconcile = ({ plan, slots, applied }) => {
    const changes = { ...plan.changes }
    const refusedOverwrite = []
    for (const key of Object.keys(changes)) {
      const s = slots.find((x) => x.key === key)
      if (!s || s.current === undefined || s.current === s.sample) continue
      if (applied[key] !== s.current) {
        delete changes[key]
        refusedOverwrite.push(key)
      }
    }
    return { plan: { ...plan, changes }, refusedOverwrite, filledBySite: [], alreadyApplied: [] }
  }
  const handEdited = compile({
    slots: [slot({ current: 'Words a person typed' })],
    reconcile,
    applied: {}
  })
  assert.deepEqual(handEdited.changes, {})
  assert.deepEqual(handEdited.refusedOverwrite, ['module-441.2'])
  assert.equal(handEdited.reconciled, true)

  // What this pipeline itself wrote last time may still be updated.
  const ourOwn = compile({
    slots: [slot({ current: 'What we wrote last time' })],
    reconcile,
    applied: { 'module-441.2': 'What we wrote last time' }
  })
  assert.deepEqual(ourOwn.changes, { 'module-441.2': 'Tiệm bánh Bảy' })
  assert.deepEqual(ourOwn.refusedOverwrite, [])
})

test('a map compiled without a reconciler says so instead of implying one ran', () => {
  assert.equal(compile().reconciled, false)
})

// ── the model port ──────────────────────────────────────────────────────────────────────────────

test('BLOCKED on session C: the default port refuses rather than choosing a provider', async () => {
  const port = notConfiguredPort()
  assert.equal(port.configured, false)
  await assert.rejects(port.normalizeBrief({}), (error) => {
    assert.ok(error instanceof LlmPortError)
    assert.equal(error.code, 'NOT_CONFIGURED')
    return true
  })
  await assert.rejects(port.generateContent({}), (error) => error.code === 'NOT_CONFIGURED')
  // The operation names are proposals until C publishes them, so they are null, not guesses.
  assert.deepEqual(PROPOSED_OPERATIONS, { normalizeBrief: null, generateContent: null })
})

test('a port cannot be built without the operation names session C publishes', () => {
  assert.throws(
    () => createLlmPort({ call: async () => ({}), operations: {} }),
    (error) => {
      assert.equal(error.code, 'NO_OPERATION_NAME')
      return true
    }
  )
  assert.throws(
    () => createLlmPort({ operations: { normalizeBrief: 'a', generateContent: 'b' } }),
    (error) => error.code === 'NO_TRANSPORT'
  )
})

test("a configured port passes the operation through and keeps C's own error codes", async () => {
  const seen = []
  const port = createLlmPort({
    call: async (req) => {
      seen.push(req.operation)
      if (req.operation === 'x.generate') throw Object.assign(new Error('out of quota'), { code: 'QUOTA' })
      return { ok: true }
    },
    operations: { normalizeBrief: 'x.normalize', generateContent: 'x.generate' }
  })
  assert.deepEqual(await port.normalizeBrief({ a: 1 }), { ok: true })
  await assert.rejects(port.generateContent({}), (error) => error.code === 'QUOTA')
  assert.deepEqual(seen, ['x.normalize', 'x.generate'])
})

test('MOCK: every answer from the test double is stamped, and an unstubbed method refuses', async () => {
  const port = mockLlmPort({ generateContent: { groups: [] } })
  const answer = await port.generateContent({ brief: 'x' })
  assert.equal(answer.mock, 'MOCK')
  assert.deepEqual(port.calls, [{ method: 'generateContent', input: { brief: 'x' } }])
  await assert.rejects(port.normalizeBrief({}), (error) => error.code === 'NOT_CONFIGURED')
})
