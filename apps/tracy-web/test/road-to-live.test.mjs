/**
 * The road to live (`src/lib/road-to-live.js`): the seven steps a release walks before customers can
 * pick it on Design inspiration, built from the same functions the publish door and the listing use.
 *
 * The first case is the shape the ja-restaurant audit (11/10/2026) found on dev: the release reads
 * fine, its demo failed on an older version, no listing, no content contract. The page used to show
 * neither the failed demo nor where to start. Since the order fix (11/10/2026) the steps come in the
 * order they finish. Since Akemi's lock (11/10/2026) the road gives the single best order: the
 * contract (the long pole) waits for the install file only, the demo waits for the contract while
 * there is none (it may cut a new version), the listing waits for a live demo, polish for nothing.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { readContracts } from '../src/lib/contracts.js'
import { DS_READY_CODE } from '../src/lib/design-system-ready-templates.js'
import { publishRefusalOf, ROAD_STEPS, roadOf } from '../src/lib/road-to-live.js'
import { DS_SEVERITY, phaseTwoOf } from '../src/lib/template-design-system-readiness/severity.js'

/**
 * A content coverage file with no hole, measured on the map and lock written beside it: every profile
 * `indexWith` makes is measured clean unless the test says otherwise (`coverage: false`). Its content
 * map declares a role on every text slot (ADR 0038); `roles: false` writes the map of a contract
 * released before ADR 0038, which declares none, so Content coverage holds Publish on it.
 */
function writeCleanCoverage(at, id, { roles = true } = {}) {
  const map = roles
    ? '{"roleVocabularyVersion":"place-content-roles/2","slots":[{"key":"a","type":"text","role":"editorial.heading"}]}'
    : '{"slots":[]}'
  const lock = '{"entities":{}}'
  writeFileSync(path.join(at, 'content-map.json'), map)
  writeFileSync(path.join(at, 'presentation-lock.json'), lock)
  const sha = (s) => createHash('sha256').update(s).digest('hex')
  writeFileSync(
    path.join(at, 'content-coverage.json'),
    JSON.stringify({
      schemaVersion: 'tracy-content-coverage/v1',
      tool: { name: 'test', version: '1.1.0' },
      contract: { id, contentMapSha256: sha(map), presentationLockSha256: sha(lock) },
      measuredAt: '2026-10-24T00:00:00.000Z',
      pages: { audited: 3, inMap: 3, notInMap: 0, failed: 0, capReached: false },
      counts: {},
      coverage: { text: 100, images: 100, links: 100 },
      holes: [],
      hygiene: []
    })
  )
}

/** A contract index holding one profile for `tag` at each version. */
function indexWith(tag, platform, versions, { coverage = true, roles = true } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'road-'))
  for (const v of versions) {
    const at = path.join(dir, tag, v)
    mkdirSync(at, { recursive: true })
    writeFileSync(
      path.join(at, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 'tracy-quickstart-contract/v1',
        id: `${tag}/${v}`,
        platform,
        quickstart: { release: tag, version: v },
        coworkMinVersion: '0.8.0',
        mode: 'content-recommendation'
      })
    )
    if (coverage) writeCleanCoverage(at, `${tag}/${v}`, { roles })
  }
  return readContracts(dir)
}

const NO_CONTRACTS = new Map()

const CARD = Object.freeze({
  template: 'ja-restaurant',
  provider: 'JoomlArt',
  category: 'Starter',
  blurb: 'A restaurant site.',
  image: 'home-1440.png',
  layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'home-1440.png' } }]
})

/** One release as `readReleases` returns it; ja-restaurant on Joomla by default. */
function release(over = {}) {
  const setting =
    over.setting === null
      ? null
      : {
          schemaVersion: 'tracy-setting/v1',
          platform: 'joomla',
          label: 'JA Restaurant',
          version: '1.0.2',
          template: 'ja-restaurant',
          install: { webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) } },
          ...over.setting
        }
  const kind = over.kind ?? 'quickstart'
  const github = over.github ?? 'published'
  return {
    tag: 'quickstart/ja-restaurant/j6',
    name: 'JA Restaurant',
    kind,
    github,
    tracy: over.tracy ?? (setting ? 'ready' : 'no-setting'),
    reason: over.reason ?? null,
    publishedAt: null,
    assets: over.assets ?? [{ name: 'w.tar.gz' }],
    setting,
    inspiration: over.inspiration ?? null,
    inspirationHidden: over.inspirationHidden ?? false,
    pages: over.pages === undefined ? [{ id: 'home', label: 'Home', home: true }] : over.pages,
    local: null,
    choosable: kind === 'quickstart' && github !== 'draft' && Boolean(setting),
    platform: setting?.platform ?? 'joomla'
  }
}

const stepOf = (road, step) => road.find((s) => s.step === step)

/** A Customize your site check of 1.0.2 where every rule the check decides passes. */
const result = (id, status, owner = 'template') => ({
  id,
  status,
  owner,
  message: `${id} ${status}`,
  fix: status === 'fail' ? `fix ${id}` : null
})
const checked = (results, over = {}) => ({
  state: 'done',
  version: '1.0.2',
  fingerprint: 'f',
  report: { template: 'ja-restaurant', cms: 'joomla', version: '1.0.2', results },
  reason: null,
  checkedAt: '2026-10-11T10:00:00.000Z',
  ...over
})
const READY = checked([result('NAME-1', 'pass'), result('LOGO-1', 'pass'), result('LANG-2', 'live-only')])
/** A Design system check of 1.0.2 where every rule the check decides passes (ADR 0031). */
const DS_READY = checked([
  result('SLOT-1', 'pass', 'contract'),
  result('CSS-1', 'pass'),
  result('ROLE-1', 'live-only')
])

test('the steps come in one fixed order, each with a state and a code', () => {
  const road = roadOf(release(), { contracts: NO_CONTRACTS })
  assert.deepEqual(
    road.map((s) => s.step),
    [
      'release',
      'install-file',
      'contract',
      'content-coverage',
      'customize',
      'design-system',
      'demo',
      'listing',
      'published',
      'polish'
    ]
  )
  assert.deepEqual(
    ROAD_STEPS,
    road.map((s) => s.step)
  )
  for (const s of road) {
    assert.ok(['done', 'blocked', 'todo', 'warn', 'checking'].includes(s.state), `${s.step}: ${s.state}`)
    assert.equal(typeof s.code, 'string')
    assert.equal(typeof s.params, 'object')
  }
})

test('ja-restaurant on dev: release ok, demo failed on 1.0.0, no listing, no contract', () => {
  const road = roadOf(release(), {
    failed: { reason: 'Usage: joomla [options]', step: 'provision', version: '1.0.0' },
    contracts: NO_CONTRACTS
  })
  assert.equal(stepOf(road, 'release').state, 'done')
  assert.equal(stepOf(road, 'install-file').state, 'done')
  // The demo waits for the contract (it may cut a new version), with its reason and the version
  // the job ran kept for when it opens.
  assert.deepEqual(stepOf(road, 'demo'), {
    step: 'demo',
    state: 'blocked',
    code: 'demo-failed',
    params: {
      reason: 'Usage: joomla [options]',
      step: 'provision',
      version: '1.0.0',
      releaseVersion: '1.0.2'
    },
    blockedBy: 'contract'
  })
  // The listing waits for a live demo: Create listing fills it and takes the pictures from it.
  assert.deepEqual(
    [stepOf(road, 'listing').state, stepOf(road, 'listing').code, stepOf(road, 'listing').blockedBy],
    ['blocked', 'no-listing', 'demo']
  )
  assert.deepEqual(stepOf(road, 'listing').params, { demo: false })
  // The contract is made outside /ops and waits for nothing but the install file. A captured
  // package (webroot + database) is the direct capture path: same version, no new cut.
  const contract = stepOf(road, 'contract')
  assert.equal(contract.state, 'todo')
  assert.equal(contract.code, 'no-contract')
  assert.equal(contract.params.slug, 'ja-restaurant')
  assert.equal(contract.params.version, '1.0.2')
  assert.equal(contract.params.path, 'direct')
  // No card file yet: batch-contracts captures it when the release is named with --without-card.
  assert.equal(contract.params.batchInScope, true)
  assert.equal(contract.params.batchWithoutCard, true)
  const published = stepOf(road, 'published')
  assert.deepEqual([published.state, published.blockedBy], ['blocked', 'listing'])
  // `waiting` names EVERY step Publish still needs, in road order: the contract, Customize your
  // site (it waits for the contract), Design system (not checked yet) AND the listing. Content
  // coverage waits for the contract too (the audit measures it).
  assert.deepEqual(published.params.waiting, [
    'contract',
    'content-coverage',
    'customize',
    'design-system',
    'listing'
  ])
  assert.deepEqual(
    [stepOf(road, 'content-coverage').state, stepOf(road, 'content-coverage').blockedBy],
    ['blocked', 'contract']
  )
  assert.deepEqual(
    [stepOf(road, 'customize').state, stepOf(road, 'customize').blockedBy],
    ['blocked', 'contract']
  )
  // No step after Publish waits for it (the hand check is gone, Akemi 11/10/2026); polish waits
  // for nothing and holds nothing.
  assert.equal(stepOf(road, 'check'), undefined)
  assert.notEqual(stepOf(road, 'polish').state, 'blocked')
  assert.equal(stepOf(road, 'polish').blockedBy, undefined)
  // To do now, side by side: the contract, and the Design system check nobody has run yet (it
  // waits for the install file alone, ADR 0031).
  assert.deepEqual(
    road.filter((s) => s.state === 'todo').map((s) => s.step),
    ['contract', 'design-system']
  )
})

test('an installer release is the full path: the demo and the listing wait for the contract', () => {
  const installer = release({
    setting: { install: { installer: { file: 'ja-restaurant-quickstart.zip', sha256: 'b'.repeat(64) } } },
    assets: [{ name: 'ja-restaurant-quickstart.zip' }]
  })
  const road = roadOf(installer, { contracts: NO_CONTRACTS })
  const contract = stepOf(road, 'contract')
  assert.deepEqual([contract.state, contract.params.path], ['todo', 'full'])
  assert.deepEqual([stepOf(road, 'demo').state, stepOf(road, 'demo').blockedBy], ['blocked', 'contract'])
  assert.deepEqual([stepOf(road, 'listing').state, stepOf(road, 'listing').blockedBy], ['blocked', 'demo'])
})

test('a live demo is kept while the contract is made: the listing and the contract run side by side', () => {
  const road = roadOf(release(), {
    demo: { url: 'https://d/', version: '1.0.2', platform: 'joomla' },
    contracts: NO_CONTRACTS
  })
  assert.equal(stepOf(road, 'demo').state, 'done')
  assert.deepEqual([stepOf(road, 'listing').state, stepOf(road, 'listing').params], ['todo', { demo: true }])
  assert.equal(stepOf(road, 'contract').state, 'todo')
  assert.equal(stepOf(road, 'contract').blockedBy, undefined)
})

test('once the contract is in place the demo opens; without a live demo the listing waits for it', () => {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'])
  const road = roadOf(release(), { contracts })
  assert.deepEqual([stepOf(road, 'demo').state, stepOf(road, 'demo').blockedBy], ['todo', undefined])
  assert.deepEqual([stepOf(road, 'listing').state, stepOf(road, 'listing').blockedBy], ['blocked', 'demo'])
  // A lower contract opens the demo too.
  const lower = roadOf(release(), {
    contracts: indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.0'])
  })
  assert.deepEqual([stepOf(lower, 'contract').state, stepOf(lower, 'demo').state], ['warn', 'todo'])
})

test('no demo at all is "no-demo", not a failure; a live demo on another version warns', () => {
  assert.equal(stepOf(roadOf(release(), { contracts: NO_CONTRACTS }), 'demo').code, 'no-demo')
  const behind = stepOf(
    roadOf(release(), {
      demo: { url: 'https://d/', version: '1.0.0', platform: 'joomla' },
      contracts: NO_CONTRACTS
    }),
    'demo'
  )
  assert.deepEqual(behind, {
    step: 'demo',
    state: 'warn',
    code: 'demo-version',
    params: { url: 'https://d/', demoVersion: '1.0.0', version: '1.0.2' }
  })
  const live = stepOf(
    roadOf(release(), {
      demo: { url: 'https://d/', version: '1.0.2', platform: 'joomla' },
      contracts: NO_CONTRACTS
    }),
    'demo'
  )
  assert.deepEqual([live.state, live.code], ['done', 'demo-live'])
})

test('polish without a listing still names the pages file, and never waits', () => {
  const road = roadOf(release({ pages: null }), { contracts: NO_CONTRACTS })
  const polish = stepOf(road, 'polish')
  assert.deepEqual([polish.state, polish.params.items.map((i) => i.code)], ['warn', ['no-pages-file']])
  assert.equal(stepOf(roadOf(release(), { contracts: NO_CONTRACTS }), 'polish').state, 'done')
})

test('an install file the door refuses holds the contract, the demo, the listing and Publish', () => {
  const road = roadOf(release({ setting: null }), { contracts: NO_CONTRACTS })
  assert.deepEqual(
    [stepOf(road, 'install-file').state, stepOf(road, 'install-file').code],
    ['todo', 'no-install-file']
  )
  assert.equal(stepOf(road, 'contract').blockedBy, 'install-file')
  assert.equal(stepOf(road, 'demo').blockedBy, 'install-file')
  assert.equal(stepOf(road, 'listing').blockedBy, 'install-file')
  assert.equal(stepOf(road, 'published').blockedBy, 'install-file')
  assert.equal(stepOf(road, 'polish').blockedBy, undefined)

  const invalid = roadOf(release({ tracy: 'invalid', reason: 'install.webroot names no file' }), {
    contracts: NO_CONTRACTS
  })
  assert.deepEqual(stepOf(invalid, 'install-file').params, { reason: 'install.webroot names no file' })
  assert.equal(stepOf(invalid, 'install-file').code, 'install-file-invalid')

  const notAnId = roadOf(release({ setting: { template: 'JA Restaurant' } }), { contracts: NO_CONTRACTS })
  assert.deepEqual(
    [stepOf(notAnId, 'install-file').code, stepOf(notAnId, 'install-file').params],
    ['template-not-an-id', { template: 'JA Restaurant' }]
  )
})

test('a draft holds everything after the release step', () => {
  const road = roadOf(release({ github: 'draft' }), { contracts: NO_CONTRACTS })
  assert.deepEqual([stepOf(road, 'release').state, stepOf(road, 'release').code], ['todo', 'release-draft'])
  assert.equal(stepOf(road, 'published').blockedBy, 'release')
})

test('a missing download is a warning on the install file, not a polish note', () => {
  const road = roadOf(release({ assets: [] }), { contracts: NO_CONTRACTS })
  assert.deepEqual(
    [
      stepOf(road, 'install-file').state,
      stepOf(road, 'install-file').code,
      stepOf(road, 'install-file').params
    ],
    ['warn', 'asset-missing', { files: ['w.tar.gz'] }]
  )
})

test('saved hidden listing with a contract: ready to publish, polish lists what the card lacks', () => {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'])
  const road = roadOf(
    release({ inspiration: { ...CARD, blurb: '' }, inspirationHidden: true, pages: null }),
    {
      demo: { url: 'https://d/', version: '1.0.2', platform: 'joomla' },
      has: () => true,
      contracts,
      readiness: READY,
      dsReadiness: DS_READY
    }
  )
  assert.deepEqual(
    [stepOf(road, 'listing').state, stepOf(road, 'listing').params],
    ['done', { hidden: true }]
  )
  assert.deepEqual(
    [stepOf(road, 'contract').state, stepOf(road, 'contract').code],
    ['done', 'contract-exact']
  )
  assert.deepEqual(
    [stepOf(road, 'published').state, stepOf(road, 'published').code],
    ['todo', 'ready-to-publish']
  )
  const polish = stepOf(road, 'polish')
  assert.equal(polish.state, 'warn')
  assert.deepEqual(
    polish.params.items.map((i) => i.code),
    ['no-blurb', 'no-pages-file']
  )
  assert.equal(publishRefusalOf(road, release()), null)
})

test('a shown listing is published, and with nothing to polish every step is done', () => {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'])
  const road = roadOf(release({ inspiration: CARD }), {
    demo: { url: 'https://d/', version: '1.0.2', platform: 'joomla' },
    has: () => true,
    contracts,
    readiness: READY,
    dsReadiness: DS_READY
  })
  assert.deepEqual(
    road.map((s) => s.state),
    ['done', 'done', 'done', 'done', 'done', 'done', 'done', 'done', 'done', 'done']
  )
  assert.deepEqual(stepOf(road, 'customize').params, {
    passed: 2,
    total: 2,
    mustFix: [],
    worthFixing: [],
    notChecked: [],
    version: '1.0.2',
    checkedAt: '2026-10-11T10:00:00.000Z'
  })
})

test('a sibling CMS release without a contract holds Publish of this one too', () => {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'])
  const road = roadOf(release({ inspiration: CARD, inspirationHidden: true }), {
    contracts,
    siblings: [
      { platform: 'joomla', tag: 'quickstart/ja-restaurant/j6', version: '1.0.2' },
      { platform: 'wordpress', tag: 'quickstart/ja-restaurant/wp7', version: '1.0.0' }
    ]
  })
  const contract = stepOf(road, 'contract')
  assert.deepEqual([contract.state, contract.code], ['todo', 'sibling-no-contract'])
  assert.deepEqual(contract.params.tags, ['quickstart/ja-restaurant/wp7'])
  // Each missing release with its platform and version, so the guide words the work for it.
  assert.deepEqual(contract.params.missing, [
    { tag: 'quickstart/ja-restaurant/wp7', platform: 'wordpress', version: '1.0.0' }
  ])
  const refusal = publishRefusalOf(road, release({ inspiration: CARD, inspirationHidden: true }))
  assert.equal(refusal.error, 'NO_CONTRACT')
  assert.deepEqual(refusal.tags, ['quickstart/ja-restaurant/wp7'])
})

test('EmDash needs no contract; a lower profile warns and does not hold Publish', () => {
  const emdash = release({
    setting: { platform: 'emdash', template: 'tracy-business' },
    inspiration: { ...CARD, template: 'tracy-business' },
    inspirationHidden: true
  })
  emdash.tag = 'tracy-business/emdash-0.x'
  const road = roadOf(emdash, { contracts: NO_CONTRACTS })
  assert.deepEqual(
    [stepOf(road, 'contract').state, stepOf(road, 'contract').code],
    ['done', 'contract-not-needed']
  )

  const lower = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.0'])
  const warned = roadOf(release({ inspiration: CARD, inspirationHidden: true }), {
    demo: { url: 'https://d/', version: '1.0.2', platform: 'joomla' },
    contracts: lower,
    readiness: READY,
    dsReadiness: DS_READY
  })
  assert.deepEqual(
    [stepOf(warned, 'contract').state, stepOf(warned, 'contract').code, stepOf(warned, 'contract').params],
    [
      'warn',
      'contract-lower',
      { profile: 'quickstart/ja-restaurant/j6/1.0.0', version: '1.0.2', path: 'direct' }
    ]
  )
  assert.equal(stepOf(warned, 'published').code, 'ready-to-publish')
})

test('batch-contracts is offered only for a release inside its scope: no hidden mark, and a card file or no card file named with --without-card', () => {
  const shown = roadOf(
    release({ inspiration: CARD, assets: [{ name: 'w.tar.gz' }, { name: 'tracy_design_inspiration.json' }] }),
    {
      contracts: NO_CONTRACTS
    }
  )
  assert.equal(stepOf(shown, 'contract').params.batchInScope, true)
  const hidden = roadOf(
    release({
      inspiration: CARD,
      inspirationHidden: true,
      assets: [{ name: 'tracy_design_inspiration.json' }, { name: 'tracy_design_inspiration_hidden.json' }]
    }),
    { contracts: NO_CONTRACTS }
  )
  assert.equal(stepOf(hidden, 'contract').params.batchInScope, false)
  assert.equal(stepOf(hidden, 'contract').params.batchWithoutCard, false)
  assert.equal(stepOf(shown, 'contract').params.batchWithoutCard, false)
  // No card file: in scope through --without-card, while the release carries its tracy_setting.json.
  const cardless = roadOf(release(), { contracts: NO_CONTRACTS })
  assert.deepEqual(
    [stepOf(cardless, 'contract').params.batchInScope, stepOf(cardless, 'contract').params.batchWithoutCard],
    [true, true]
  )
  // The hidden mark with no card file: batch-contracts excludes it as `card hidden` before it looks for a card,
  // so --without-card would capture nothing and the command is not offered.
  const hiddenCardless = roadOf(
    release({ assets: [{ name: 'w.tar.gz' }, { name: 'tracy_design_inspiration_hidden.json' }] }),
    { contracts: NO_CONTRACTS }
  )
  assert.deepEqual(
    [
      stepOf(hiddenCardless, 'contract').params.batchInScope,
      stepOf(hiddenCardless, 'contract').params.batchWithoutCard
    ],
    [false, false]
  )
  // A draft stays outside, card or not.
  const draft = roadOf(release({ github: 'draft' }), { contracts: NO_CONTRACTS })
  assert.equal(stepOf(draft, 'contract')?.params?.batchInScope ?? false, false)
})

test('the publish refusal is the first blocked step, in the door’s own error codes', () => {
  const none = release()
  assert.equal(publishRefusalOf(roadOf(none, { contracts: NO_CONTRACTS }), none).error, 'NO_CARD')
  const draft = release({ github: 'draft', inspiration: CARD })
  const draftRefusal = publishRefusalOf(roadOf(draft, { contracts: NO_CONTRACTS }), draft)
  assert.equal(draftRefusal.error, 'NOT_A_CARD')
  assert.match(draftRefusal.reason, /draft/)
  const noContract = release({ inspiration: CARD, inspirationHidden: true })
  const refused = publishRefusalOf(roadOf(noContract, { contracts: NO_CONTRACTS }), noContract)
  assert.equal(refused.error, 'NO_CONTRACT')
  assert.doesNotMatch(refused.reason, /batch-contracts/, 'never a tool that cannot capture this release')
  assert.match(refused.reason, /quickstart-contract/)
})

test('a design pack has no road', () => {
  assert.equal(roadOf(release({ kind: 'design-pack' }), { contracts: NO_CONTRACTS }), null)
})

// ── Customize your site (ADR 0029 §4): the readiness check gates Publish ───────────────────────

/** A hidden listing with an exact contract and a live demo: only Customize your site can hold it. */
function readyButCustomize(readiness, over = {}) {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'])
  const r = release({ inspiration: CARD, inspirationHidden: true, ...over })
  const road = roadOf(r, {
    demo: { url: 'https://d/', version: '1.0.2', platform: 'joomla' },
    has: () => true,
    contracts,
    readiness,
    dsReadiness: DS_READY
  })
  return { r, road }
}

test('must-fix rules left: the step is to do, Publish waits for it, the door refuses CUSTOMIZE_NOT_READY', () => {
  const { r, road } = readyButCustomize(
    checked([
      result('NAME-1', 'pass'),
      result('LOGO-1', 'fail'),
      result('LANG-6', 'fail'),
      result('STAB-1', 'fail', 'contract'),
      result('PAGE-2', 'not-applicable')
    ])
  )
  const customize = stepOf(road, 'customize')
  assert.deepEqual([customize.state, customize.code], ['todo', 'customize-must-fix'])
  assert.deepEqual([customize.params.passed, customize.params.total], [1, 4])
  assert.deepEqual(
    customize.params.mustFix.map((m) => [m.rule, m.question, m.owner]),
    [
      ['LOGO-1', 'Logo', 'template'],
      ['STAB-1', 'All questions', 'contract']
    ]
  )
  assert.equal(customize.params.mustFix[0].text, 'Some pages keep the demo logo.')
  assert.equal(customize.params.mustFix[0].fix, 'fix LOGO-1')
  assert.deepEqual(
    customize.params.worthFixing.map((m) => m.rule),
    ['LANG-6']
  )
  const published = stepOf(road, 'published')
  assert.deepEqual([published.state, published.blockedBy], ['blocked', 'customize'])
  assert.deepEqual(published.params.waiting, ['customize'])
  const refusal = publishRefusalOf(road, r)
  assert.equal(refusal.error, 'CUSTOMIZE_NOT_READY')
  assert.deepEqual(refusal.rules, ['LOGO-1', 'STAB-1'])
  assert.match(refusal.reason, /2 must-fix rules left \(LOGO-1, STAB-1\)/)
})

test('worth-fixing only: the step warns and Publish goes ahead', () => {
  const { r, road } = readyButCustomize(checked([result('NAME-1', 'pass'), result('LANG-6', 'fail')]))
  const customize = stepOf(road, 'customize')
  assert.deepEqual([customize.state, customize.code], ['warn', 'customize-worth-fixing'])
  assert.deepEqual(
    customize.params.worthFixing.map((m) => [m.rule, m.text]),
    [['LANG-6', 'Dates keep the English format.']]
  )
  assert.deepEqual(customize.params.mustFix, [])
  assert.equal(stepOf(road, 'published').code, 'ready-to-publish')
  assert.equal(publishRefusalOf(road, r), null)
})

test('still checking: the step says so, and Publish waits for the result', () => {
  const { r, road } = readyButCustomize(checked([], { state: 'checking', report: null, checkedAt: null }))
  const customize = stepOf(road, 'customize')
  assert.deepEqual([customize.state, customize.code], ['checking', 'customize-checking'])
  assert.deepEqual([customize.params.passed, customize.params.total], [0, 0])
  assert.deepEqual(
    [stepOf(road, 'published').state, stepOf(road, 'published').blockedBy],
    ['blocked', 'customize']
  )
  const refusal = publishRefusalOf(road, r)
  assert.equal(refusal.error, 'CUSTOMIZE_NOT_READY')
  assert.match(refusal.reason, /still being checked/)
})

test('re-checking over a stored result: the last result stays, marked rechecking, and Publish reads it', () => {
  const since = { recheckingSince: '2026-10-12T04:00:00.000Z' }
  // The last result had must-fix rules: Publish stays held, by those rules, not by "checking".
  const held = readyButCustomize(checked([result('NAME-1', 'pass'), result('STAB-1', 'fail')], since))
  const customize = stepOf(held.road, 'customize')
  assert.deepEqual([customize.state, customize.code], ['todo', 'customize-must-fix'])
  assert.equal(customize.params.rechecking, true)
  assert.deepEqual(
    customize.params.mustFix.map((m) => m.rule),
    ['STAB-1']
  )
  const refusal = publishRefusalOf(held.road, held.r)
  assert.equal(refusal.error, 'CUSTOMIZE_NOT_READY')
  assert.deepEqual(refusal.rules, ['STAB-1'])
  // The last result was clean: Publish stays open while the re-check runs.
  const clean = readyButCustomize(checked([result('NAME-1', 'pass')], since))
  const ready = stepOf(clean.road, 'customize')
  assert.deepEqual([ready.state, ready.code, ready.params.rechecking], ['done', 'customize-ready', true])
  assert.equal(publishRefusalOf(clean.road, clean.r), null)
  // No re-check running: no flag.
  const settled = readyButCustomize(checked([result('NAME-1', 'pass')]))
  assert.equal(stepOf(settled.road, 'customize').params.rechecking, undefined)
})

test('a published release that fails must-fix rules stays published: the step only warns', () => {
  const { road } = readyButCustomize(checked([result('LOGO-1', 'fail'), result('NAME-1', 'pass')]), {
    inspirationHidden: false
  })
  assert.deepEqual([stepOf(road, 'published').state, stepOf(road, 'published').code], ['done', 'published'])
  const customize = stepOf(road, 'customize')
  assert.deepEqual([customize.state, customize.code], ['warn', 'customize-live-failing'])
  assert.deepEqual(
    customize.params.mustFix.map((m) => m.rule),
    ['LOGO-1']
  )
})

test('STAB-1 not checked (the plugin a new site gets could not be read): to do, and Publish waits for it', () => {
  const unread = {
    ...result('STAB-1', 'fail', 'contract'),
    status: 'not-checked',
    message: 'the plugin answered HTTP 404'
  }
  const { r, road } = readyButCustomize(checked([result('NAME-1', 'pass'), unread]))
  const customize = stepOf(road, 'customize')
  assert.deepEqual([customize.state, customize.code], ['todo', 'customize-unchecked'])
  assert.deepEqual(
    [customize.params.passed, customize.params.total],
    [1, 1],
    'not checked is never counted as passed'
  )
  assert.deepEqual(
    customize.params.notChecked.map((m) => [m.rule, m.message]),
    [['STAB-1', 'the plugin answered HTTP 404']]
  )
  assert.deepEqual(
    [stepOf(road, 'published').state, stepOf(road, 'published').blockedBy],
    ['blocked', 'customize']
  )
  const refusal = publishRefusalOf(road, r)
  assert.equal(refusal.error, 'CUSTOMIZE_NOT_READY')
  assert.deepEqual(refusal.rules, ['STAB-1'])
  assert.match(refusal.reason, /STAB-1 not checked \(the plugin answered HTTP 404\)/)
  // A must-fix rule still comes first.
  const both = readyButCustomize(checked([result('LOGO-1', 'fail'), unread]))
  assert.equal(stepOf(both.road, 'customize').code, 'customize-must-fix')
})

test('a published template whose plugin is not checked stays published: the step only warns', () => {
  const unread = { ...result('STAB-1', 'fail', 'contract'), status: 'not-checked' }
  const { r, road } = readyButCustomize(checked([result('NAME-1', 'pass'), unread]), {
    inspirationHidden: false
  })
  assert.deepEqual([stepOf(road, 'published').state, stepOf(road, 'published').code], ['done', 'published'])
  assert.deepEqual(
    [stepOf(road, 'customize').state, stepOf(road, 'customize').code],
    ['warn', 'customize-live-unchecked']
  )
  assert.equal(publishRefusalOf(road, r), null)
})

test('a check of another version, no check, or a check that could not run: to do, Publish waits', () => {
  const other = readyButCustomize(checked([result('NAME-1', 'pass')], { version: '1.0.1' }))
  assert.equal(stepOf(other.road, 'customize').code, 'customize-not-checked')
  assert.equal(publishRefusalOf(other.road, other.r).error, 'CUSTOMIZE_NOT_READY')
  const none = readyButCustomize(null)
  assert.deepEqual(
    [stepOf(none.road, 'customize').state, stepOf(none.road, 'customize').code],
    ['todo', 'customize-not-checked']
  )
  const failed = readyButCustomize(
    checked([], { state: 'error', report: null, reason: 'GitHub answered 404' })
  )
  const step = stepOf(failed.road, 'customize')
  assert.deepEqual(
    [step.state, step.code, step.params.reason],
    ['todo', 'customize-error', 'GitHub answered 404']
  )
  assert.match(publishRefusalOf(failed.road, failed.r).reason, /could not be checked: GitHub answered 404/)
})

test('without a contract Customize your site waits for it, and the door names the contract first', () => {
  const r = release({ inspiration: CARD, inspirationHidden: true })
  const road = roadOf(r, { contracts: NO_CONTRACTS, readiness: READY, dsReadiness: DS_READY })
  assert.deepEqual(
    [stepOf(road, 'customize').state, stepOf(road, 'customize').code, stepOf(road, 'customize').blockedBy],
    ['blocked', 'customize-waiting', 'contract']
  )
  assert.equal(publishRefusalOf(road, r).error, 'NO_CONTRACT')
})

// ── Listing: it must cover the release's pages (`listing-pages.js`), each with a desktop picture ──

const TWO_PAGES = [
  { id: 'home', label: 'Home', home: true },
  { id: 'about-us', label: 'About us' }
]

test('a hidden listing that misses a page of the release is to do, names it, and holds Publish', () => {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'])
  const r = release({ inspiration: CARD, inspirationHidden: true, pages: TWO_PAGES })
  const road = roadOf(r, {
    demo: { url: 'https://d/', version: '1.0.2', platform: 'joomla' },
    has: () => true,
    contracts,
    readiness: READY,
    dsReadiness: DS_READY
  })
  const listing = stepOf(road, 'listing')
  assert.deepEqual([listing.state, listing.code], ['todo', 'listing-incomplete'])
  assert.deepEqual(listing.params, {
    hidden: true,
    missing: [{ id: 'about-us', label: 'About us', path: '/about-us' }],
    forbidden: [],
    noDesktop: 0,
    pages: 1
  })
  assert.deepEqual(
    [stepOf(road, 'published').state, stepOf(road, 'published').blockedBy],
    ['blocked', 'listing']
  )
  const refusal = publishRefusalOf(road, r)
  assert.equal(refusal.error, 'LISTING_INCOMPLETE')
  assert.match(refusal.reason, /About us \(\/about-us\)/)
})

test('a page without a desktop picture keeps the listing to do', () => {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'])
  const noShot = { ...CARD, layouts: [{ key: 'home', label: 'Home', path: '/', shots: {} }] }
  const r = release({ inspiration: noShot, inspirationHidden: true })
  const road = roadOf(r, { contracts, readiness: READY, dsReadiness: DS_READY })
  const listing = stepOf(road, 'listing')
  assert.deepEqual(
    [listing.state, listing.code, listing.params.noDesktop, listing.params.missing],
    ['todo', 'listing-incomplete', 1, []]
  )
  assert.match(publishRefusalOf(road, r).reason, /desktop picture/)
})

test('a published listing that misses a page only warns: it stays published and nothing is held', () => {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'])
  const r = release({ inspiration: CARD, pages: TWO_PAGES })
  const road = roadOf(r, {
    demo: { url: 'https://d/', version: '1.0.2', platform: 'joomla' },
    has: () => true,
    contracts,
    readiness: READY,
    dsReadiness: DS_READY
  })
  const listing = stepOf(road, 'listing')
  assert.deepEqual(
    [listing.state, listing.code, listing.params.hidden],
    ['warn', 'listing-incomplete', false]
  )
  assert.deepEqual([stepOf(road, 'published').state, stepOf(road, 'published').code], ['done', 'published'])
  assert.equal(publishRefusalOf(road, r), null)
})

test('a hidden listing carrying a system page is to do, and the refusal names it', () => {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'])
  const login = {
    key: 'login',
    label: 'Login',
    path: '/pages/user/login-form',
    shots: { desktop: 'l-1440.png' }
  }
  const r = release({ inspiration: { ...CARD, layouts: [...CARD.layouts, login] }, inspirationHidden: true })
  const road = roadOf(r, { contracts, readiness: READY, dsReadiness: DS_READY })
  const listing = stepOf(road, 'listing')
  assert.deepEqual(
    [listing.state, listing.code, listing.params.missing, listing.params.forbidden],
    ['todo', 'listing-incomplete', [], [{ label: 'Login', path: '/pages/user/login-form' }]]
  )
  assert.match(publishRefusalOf(road, r).reason, /Login \(\/pages\/user\/login-form\)/)
})

// ── Design system (ADR 0031): the Template Design System Readiness check gates Publish ─────────

/** A hidden listing with an exact contract, a live demo and a clean Customize your site check. */
function readyButDesignSystem(dsReadiness, over = {}, { dsSeverity } = {}) {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'])
  const r = release({ inspiration: CARD, inspirationHidden: true, ...over })
  const road = roadOf(r, {
    demo: { url: 'https://d/', version: '1.0.2', platform: 'joomla' },
    has: () => true,
    contracts,
    readiness: READY,
    dsReadiness,
    dsSeverity
  })
  return { r, road }
}

test('phase 1 today: a version not measured yet warns and Publish goes ahead; SCREEN-1 only warns', () => {
  const report = checked([
    result('CSS-1', 'pass'),
    result('SCREEN-1', 'fail', 'contract'),
    result('IDENT-1', 'unmeasured', 'contract')
  ])
  const { r, road } = readyButDesignSystem(report)
  const step = stepOf(road, 'design-system')
  assert.deepEqual([step.state, step.code], ['warn', 'ds-not-measured'])
  assert.equal(step.params.unmeasuredHolds, false)
  assert.equal(publishRefusalOf(road, r), null)
})

test('phase 2 of the Publish lock (#1319): a version not measured yet is held like a must-fix rule, with the file named', () => {
  const two = phaseTwoOf()
  const notMeasured = checked([result('CSS-1', 'pass'), result('IDENT-1', 'unmeasured', 'contract')])
  const held = readyButDesignSystem(notMeasured, {}, { dsSeverity: two })
  const step = stepOf(held.road, 'design-system')
  assert.deepEqual([step.state, step.code], ['todo', 'ds-not-measured'])
  assert.equal(step.params.unmeasuredHolds, true)
  assert.equal(stepOf(held.road, 'published').blockedBy, 'design-system')
  const refusal = publishRefusalOf(held.road, held.r)
  assert.equal(refusal.error, 'DESIGN_SYSTEM_NOT_READY')
  assert.match(
    refusal.reason,
    /1 rule not measured yet on 1\.0\.2.*tdsr skill.*design-system-measurement\.json/
  )
  // SCREEN-1 is must-fix in phase 2: it holds a version that is not live
  const screen = readyButDesignSystem(
    checked([result('SCREEN-1', 'fail', 'contract')]),
    {},
    { dsSeverity: two }
  )
  assert.deepEqual(
    [stepOf(screen.road, 'design-system').state, stepOf(screen.road, 'design-system').code],
    ['todo', 'ds-must-fix']
  )
  // a line already live is never locked backwards: it warns and stays published
  const live = readyButDesignSystem(notMeasured, { inspirationHidden: false }, { dsSeverity: two })
  assert.deepEqual(
    [stepOf(live.road, 'design-system').state, stepOf(live.road, 'design-system').code],
    ['warn', 'ds-not-measured']
  )
  assert.equal(stepOf(live.road, 'published').state, 'done')
  const liveScreen = readyButDesignSystem(
    checked([result('SCREEN-1', 'fail', 'contract')]),
    { inspirationHidden: false },
    { dsSeverity: two }
  )
  assert.deepEqual(
    [stepOf(liveScreen.road, 'design-system').state, stepOf(liveScreen.road, 'design-system').code],
    ['warn', 'ds-live-failing']
  )
})

test('a release not measured with the current preview probe shows that alone and stays locked (never ds-ready)', () => {
  const gap = { current: 9, measured: null, measure: 'Measure 1.0.2 (...):\nnode stand.mjs up ...' }
  const report = checked([
    result('VARS-1', 'fail', 'template'),
    { ...result('TPL-1', 'unmeasured', 'contract'), previewProbe: gap }
  ])
  const { r, road } = readyButDesignSystem(report)
  const step = stepOf(road, 'design-system')
  assert.deepEqual([step.state, step.code], ['todo', 'ds-not-at-probe'])
  assert.notEqual(step.code, DS_READY_CODE)
  assert.equal(step.params.grade, null)
  assert.deepEqual([step.params.mustFix, step.params.worthFixing, step.params.unmeasured], [[], [], []])
  assert.equal(step.params.notAtProbe.measure, gap.measure)
  assert.equal(stepOf(road, 'published').blockedBy, 'design-system')
  const refusal = publishRefusalOf(road, r)
  assert.equal(refusal.error, 'DESIGN_SYSTEM_NOT_READY')
  assert.match(refusal.reason, /1\.0\.2 is not measured with preview probe v9/)
  // a line already live stays published, and warns
  const live = readyButDesignSystem(report, { inspirationHidden: false })
  assert.deepEqual(
    [stepOf(live.road, 'design-system').state, stepOf(live.road, 'design-system').code],
    ['warn', 'ds-not-at-probe']
  )
})

test('Design system sits after Customize your site and waits for the install file alone', () => {
  // No content contract: Customize your site waits for it, Design system does not.
  const road = roadOf(release(), {
    demo: { url: 'https://d/', version: '1.0.2', platform: 'joomla' },
    contracts: NO_CONTRACTS,
    readiness: null,
    dsReadiness: DS_READY
  })
  assert.deepEqual(
    [stepOf(road, 'customize').state, stepOf(road, 'customize').blockedBy],
    ['blocked', 'contract']
  )
  assert.deepEqual(
    [stepOf(road, 'design-system').state, stepOf(road, 'design-system').code],
    ['done', 'ds-ready']
  )
  const draft = roadOf(release({ github: 'draft' }), { contracts: NO_CONTRACTS, dsReadiness: DS_READY })
  assert.deepEqual(
    [stepOf(draft, 'design-system').state, stepOf(draft, 'design-system').blockedBy],
    ['blocked', 'release']
  )
})

test('Design system must-fix rules hold Publish: the door refuses DESIGN_SYSTEM_NOT_READY', () => {
  const { r, road } = readyButDesignSystem(
    checked([
      result('SLOT-1', 'pass', 'contract'),
      result('CSS-1', 'fail'),
      result('BAND-1', 'fail', 'contract'),
      result('ROLE-1', 'live-only', 'contract')
    ])
  )
  const step = stepOf(road, 'design-system')
  assert.deepEqual([step.state, step.code], ['todo', 'ds-must-fix'])
  // SLOT-1 and DEMO-1 (the live demo the Add site preview reads) pass
  assert.deepEqual([step.params.passed, step.params.total], [2, 4])
  assert.deepEqual(
    step.params.mustFix.map((m) => [m.rule, m.question, m.owner]),
    [['CSS-1', 'Stylesheets', 'template']]
  )
  assert.deepEqual(
    step.params.worthFixing.map((m) => m.rule),
    ['BAND-1']
  )
  const published = stepOf(road, 'published')
  assert.deepEqual([published.state, published.blockedBy], ['blocked', 'design-system'])
  const refusal = publishRefusalOf(road, r)
  assert.equal(refusal.error, 'DESIGN_SYSTEM_NOT_READY')
  assert.deepEqual(refusal.rules, ['CSS-1'])
  assert.match(refusal.reason, /1 must-fix rule left \(CSS-1\)/)
})

test('Design system worth-fixing only, or no contract yet: the step warns and Publish goes ahead', () => {
  const { r, road } = readyButDesignSystem(
    checked([result('SLOT-1', 'fail', 'contract'), result('SLOT-2', 'not-applicable', 'contract')])
  )
  const step = stepOf(road, 'design-system')
  assert.deepEqual([step.state, step.code], ['warn', 'ds-worth-fixing'])
  assert.equal(stepOf(road, 'published').code, 'ready-to-publish')
  assert.equal(publishRefusalOf(road, r), null)
})

test('a published template failing Design system must-fix rules only warns, never comes off', () => {
  const { road } = readyButDesignSystem(checked([result('DEF-1', 'fail')]), { inspirationHidden: false })
  const step = stepOf(road, 'design-system')
  assert.deepEqual([step.state, step.code], ['warn', 'ds-live-failing'])
  assert.equal(stepOf(road, 'published').state, 'done')
})

test('Design system not checked, checking, or broken: Publish waits and says why', () => {
  const none = readyButDesignSystem(null)
  assert.deepEqual(
    [stepOf(none.road, 'design-system').state, stepOf(none.road, 'design-system').code],
    ['todo', 'ds-not-checked']
  )
  assert.equal(publishRefusalOf(none.road, none.r).error, 'DESIGN_SYSTEM_NOT_READY')
  const running = readyButDesignSystem({ ...DS_READY, state: 'checking', report: null, checkedAt: null })
  assert.equal(stepOf(running.road, 'design-system').state, 'checking')
  assert.match(publishRefusalOf(running.road, running.r).reason, /still being checked/)
  const failed = readyButDesignSystem({
    ...DS_READY,
    state: 'error',
    reason: 'GitHub answered 502',
    report: null
  })
  assert.equal(stepOf(failed.road, 'design-system').code, 'ds-error')
  assert.match(publishRefusalOf(failed.road, failed.r).reason, /GitHub answered 502/)
  // A result of another version is not this one's.
  const other = readyButDesignSystem({ ...DS_READY, version: '1.0.1' })
  assert.equal(stepOf(other.road, 'design-system').code, 'ds-not-checked')
})

// ── Design system, 14/10/2026: what the customer's Add site panel gets ──────────────────────────

test('DEMO-1: no demo the preview door can dress is a must-fix that names its fix, never a silent pass', () => {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'])
  const r = release({ inspiration: CARD, inspirationHidden: true })
  for (const [demo, gap] of /** @type {const} */ ([
    [null, 'NO_DEMO'],
    // a demo row that records no platform: the door answers NO_SLOT, the panel offers no picker either
    [{ url: 'https://d/', version: '1.0.2' }, 'NO_SLOT']
  ])) {
    const road = roadOf(r, { demo, has: () => true, contracts, readiness: READY, dsReadiness: DS_READY })
    const step = stepOf(road, 'design-system')
    assert.deepEqual([step.state, step.code], ['todo', 'ds-must-fix'])
    const demo1 = step.params.mustFix.find((m) => m.rule === 'DEMO-1')
    assert.equal(demo1.question, 'Preview')
    assert.equal(demo1.owner, 'ops')
    assert.match(demo1.message, new RegExp(gap))
    assert.match(demo1.fix, /Install demo/)
    assert.equal(publishRefusalOf(road, r).error, 'DESIGN_SYSTEM_NOT_READY')
  }
  // a template the button refuses anyway (no slot contract) is not asked for a demo
  const noSlot = roadOf(r, {
    contracts,
    readiness: READY,
    dsReadiness: checked([result('SLOT-1', 'fail', 'contract')])
  })
  assert.equal(
    stepOf(noSlot, 'design-system').params.mustFix.some((m) => m.rule === 'DEMO-1'),
    false
  )
})

test('a preview rule not measured holds Publish as a must-fix; the refusal says how to measure it', () => {
  const { r, road } = readyButDesignSystem(
    checked([
      result('SLOT-1', 'pass', 'contract'),
      result('CSS-1', 'pass'),
      result('TPL-1', 'unmeasured', 'contract'),
      result('IDENT-1', 'unmeasured', 'contract')
    ])
  )
  const step = stepOf(road, 'design-system')
  assert.deepEqual([step.state, step.code], ['todo', 'ds-must-fix'])
  assert.deepEqual(
    step.params.mustFix.map((m) => [m.rule, m.unmeasured]),
    [['TPL-1', true]]
  )
  // a built-site rule that is not a preview rule stays "Not measured yet" (phase 1)
  assert.deepEqual(
    step.params.unmeasured.map((m) => m.rule),
    ['IDENT-1']
  )
  const refusal = publishRefusalOf(road, r)
  assert.deepEqual(refusal.rules, ['TPL-1'])
  assert.match(
    refusal.reason,
    /not measured on the Add site preview yet: measure it with apps\/tracy-web\/scripts\/preview-check\.mjs/
  )
  // the switch: unmeasuredPreview worth-fixing puts it back with the other unmeasured rules
  const off = readyButDesignSystem(
    checked([result('SLOT-1', 'pass', 'contract'), result('TPL-1', 'unmeasured', 'contract')]),
    {},
    { dsSeverity: { ...DS_SEVERITY, unmeasuredPreview: { group: 'worth-fixing', text: 'x' } } }
  )
  const offStep = stepOf(off.road, 'design-system')
  assert.deepEqual([offStep.state, offStep.code], ['warn', 'ds-not-measured'])
})

test('a contract released before ADR 0038 declares no roles: Content coverage holds a new release and warns a live one', () => {
  const contracts = indexWith('quickstart/ja-restaurant/j6', 'joomla', ['1.0.2'], { roles: false })
  const world = {
    demo: { url: 'https://d/', version: '1.0.2', platform: 'joomla' },
    has: () => true,
    contracts,
    readiness: READY,
    dsReadiness: DS_READY
  }
  const fresh = release({ inspiration: CARD, inspirationHidden: true })
  const road = roadOf(fresh, world)
  const step = stepOf(road, 'content-coverage')
  assert.deepEqual([step.state, step.code, step.params.rolesState], ['todo', 'coverage-roles', 'none'])
  const refusal = publishRefusalOf(road, fresh)
  assert.equal(refusal.error, 'CONTENT_COVERAGE_NOT_READY')
  assert.match(refusal.reason, /declares no slot roles/)
  const live = stepOf(roadOf(release({ inspiration: CARD }), world), 'content-coverage')
  assert.deepEqual([live.state, live.code], ['warn', 'coverage-live-roles'])
})
