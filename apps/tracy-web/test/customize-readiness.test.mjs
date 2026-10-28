/**
 * The Customize your site check on the server (`src/lib/customize-readiness.js`) and the severity
 * file that sorts its rules (`template-customization-question-readiness/rule-severity.json`,
 * ADR 0029 §4): every rule the check runs is in exactly one group with its question, line and
 * reason; a report sums up to the numbers the Road to live shows; a release is checked once per
 * version and again when its files change; a check runs in a child process off a folder and its
 * outcome, good or bad, is stored.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'

import {
  checkable,
  checkAgain,
  checkOne,
  fingerprintOf,
  pendingReleases,
  EVIDENCE_RETRY_MS,
  readinessForRoad,
  readinessOf,
  readinessRows,
  STALE_MS,
  sweepReadiness
} from '../src/lib/customize-readiness.js'
import { defaultContracts } from '../src/lib/contracts.js'
import {
  changedInputs,
  currentInputs,
  profileVersionOf,
  rulesVersion,
  setFleetLatest
} from '../src/lib/readiness-inputs.js'
import { RULES } from '../src/lib/template-customization-question-readiness/index.js'
import {
  GROUPS,
  RULE_SEVERITY,
  severityOf,
  summarizeReadiness
} from '../src/lib/template-customization-question-readiness/severity.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(async () => {
  if (process.env.TEST_DATABASE_URL) await db.open()
})
beforeEach(async () => {
  if (process.env.TEST_DATABASE_URL) await db.reset()
})
after(async () => {
  if (process.env.TEST_DATABASE_URL) await db.close()
})

// ── The severity file ─────────────────────────────────────────────────────────────────────────

test('the severity file names every rule the check runs, once, with a group, a question, a line and a reason', () => {
  const ids = RULES.map((r) => r.id)
  assert.deepEqual(Object.keys(RULE_SEVERITY).sort(), [...ids].sort(), 'no rule missing, none extra')
  const questions = new Set([
    'Business name',
    'Logo',
    'Favicon',
    'About',
    'Pages',
    'Site language',
    'All questions'
  ])
  for (const [id, s] of Object.entries(RULE_SEVERITY)) {
    assert.ok(GROUPS.includes(s.group), `${id}: group ${s.group}`)
    assert.ok(questions.has(s.question), `${id}: question ${s.question}`)
    assert.ok(s.text.length > 0 && s.text.length <= 80, `${id}: one short line`)
    assert.ok(s.reason.length > 0, `${id}: a reason`)
    // Copy an admin reads: no dashes (Akemi), English, ends like a sentence.
    for (const words of [s.text, s.reason]) {
      assert.doesNotMatch(words, /[—–]| - /, `${id}: no dash in "${words}"`)
      assert.match(words, /[.]$/, `${id}: a sentence`)
    }
  }
})

test('the examples of the brief land in their groups: a wrong logo must be fixed, an English date is worth fixing', () => {
  for (const id of ['LOGO-1', 'NAME-1', 'LANG-2', 'STAB-2', 'PAGE-2'])
    assert.equal(severityOf(id).group, 'must-fix', id)
  for (const id of ['LANG-6', 'HIDDEN-1']) assert.equal(severityOf(id).group, 'worth-fixing', id)
  assert.equal(severityOf('NEW-9').group, 'must-fix', 'a rule the file does not know holds Publish')
})

test('a report sums up to passed of total, and each failure goes to its group with its line', () => {
  const summary = summarizeReadiness({
    results: [
      { id: 'NAME-1', status: 'pass', owner: 'template', message: '', fix: null },
      { id: 'LOGO-1', status: 'fail', owner: 'template', message: 'two   places', fix: 'Do it.' },
      { id: 'LANG-6', status: 'fail', owner: 'template', message: 'F j, Y', fix: null },
      { id: 'LANG-2', status: 'live-only', owner: 'template', message: '', fix: null },
      { id: 'REL-2', status: 'not-applicable', owner: 'template', message: '', fix: null }
    ]
  })
  assert.deepEqual([summary.passed, summary.total], [1, 3], 'live-only and not-applicable are not counted')
  assert.deepEqual(summary.mustFix, [
    {
      rule: 'LOGO-1',
      text: 'Some pages keep the demo logo.',
      question: 'Logo',
      owner: 'template',
      message: 'two places',
      fix: 'Do it.'
    }
  ])
  assert.deepEqual(
    summary.worthFixing.map((w) => w.rule),
    ['LANG-6']
  )
  assert.deepEqual(summarizeReadiness(null), {
    passed: 0,
    total: 0,
    mustFix: [],
    worthFixing: [],
    notChecked: []
  })
})

// ── Which releases a sweep checks ─────────────────────────────────────────────────────────────

/** The inputs a test server judges with: no contracts, no pins, an empty profile table, rules `r1`. */
const inputsOf = (r, over = {}) =>
  currentInputs(r, fingerprintOf(r), {
    profiles: { releases: {} },
    contracts: new Map(),
    pins: {},
    rules: 'r1',
    ...over
  })

const SETTING = {
  schemaVersion: 'tracy-setting/v1',
  platform: 'emdash',
  label: 'Tracy Business',
  version: '1.0.0',
  cms: '0.37.0',
  template: 'tracy-business',
  install: {
    source: { file: 'q.zip', sha256: 'a'.repeat(64) },
    state: { file: 's.tar.gz', sha256: 'b'.repeat(64) }
  }
}

/** A row of `readReleases`. */
const row = (over = {}) => ({
  tag: 'tracy-business/emdash-0.x',
  kind: 'quickstart',
  github: 'published',
  platform: 'emdash',
  setting: SETTING,
  assets: [{ name: 'tracy_setting.json', size: 10, id: 1 }],
  local: null,
  ...over
})

test('a long message is cut between two items of its list, never inside a word or a path', () => {
  // JA Impact WordPress on dev, 12/10/2026: the prompt read "parts/sidebar-article…", a path cut in
  // two, so the admin could not tell which file the check meant.
  const items = Array.from({ length: 40 }, (_, i) => `'Word ${i}' (parts/sidebar-article-${i}.html:${i})`)
  const message = `JA Impact WordPress 1.0.7 fails LANG-2: 40 interface words written into template files: ${items.join(', ')}.`
  const { mustFix } = summarizeReadiness({ results: [{ id: 'LANG-2', status: 'fail', message, fix: null }] })
  const cut = mustFix[0].message
  assert.ok(cut.length <= 400, `${cut.length} characters`)
  assert.match(cut, /\(parts\/sidebar-article-\d+\.html:\d+\), and more$/)
  assert.doesNotMatch(cut, /…/)
  // A short message is left as it is.
  const short = summarizeReadiness({
    results: [{ id: 'LANG-2', status: 'fail', message: 'One word.', fix: null }]
  })
  assert.equal(short.mustFix[0].message, 'One word.')
})

test('a release is checked once per version, again when its files change, and a stopped check is picked up', () => {
  const r = row()
  const stored = (over) =>
    new Map([
      [
        `${r.tag} 1.0.0`,
        {
          state: 'done',
          version: '1.0.0',
          fingerprint: fingerprintOf(r),
          inputs: inputsOf(r),
          startedAt: null,
          ...over
        }
      ]
    ])
  assert.deepEqual(pendingReleases([r], new Map(), Date.now(), inputsOf), [r], 'never checked')
  assert.deepEqual(pendingReleases([r], stored({}), Date.now(), inputsOf), [], 'checked, same files')
  assert.deepEqual(
    pendingReleases([r], stored({ inputs: { ...inputsOf(r), files: 'old' } }), Date.now(), inputsOf),
    [r],
    'a file changed'
  )
  const now = Date.parse('2026-10-11T10:00:00Z')
  const running = stored({ state: 'checking', startedAt: new Date(now - 1000).toISOString() })
  assert.deepEqual(pendingReleases([r], running, now, inputsOf), [], 'running now')
  const stopped = stored({ state: 'checking', startedAt: new Date(now - STALE_MS - 1).toISOString() })
  assert.deepEqual(pendingReleases([r], stopped, now, inputsOf), [r], 'left by a process that stopped')
  assert.equal(checkable(row({ kind: 'design-pack' })), false)
  assert.equal(checkable(row({ setting: null })), false)
  assert.notEqual(
    fingerprintOf(row({ assets: [{ name: 'a', size: 1 }] })),
    fingerprintOf(row({ assets: [{ name: 'a', size: 2 }] }))
  )
})

// ── The check itself, stored ──────────────────────────────────────────────────────────────────

async function seedRelease(pool, tag, release, setting) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [tag, JSON.stringify(release), JSON.stringify(setting)]
  )
}

const silent = { log: () => {}, warn: () => {} }

test('a check of a local pack runs in a child process and stores the whole report', opts, async () => {
  const { pool } = db
  const dir = mkdtempSync(path.join(tmpdir(), 'readiness-pack-'))
  writeFileSync(path.join(dir, 'tracy_setting.json'), JSON.stringify(SETTING))
  const tag = 'local/tracy-business/emdash'
  const release = row({ tag, local: { dir }, assets: [{ name: 'tracy_setting.json', size: 1, id: null }] })
  await seedRelease(
    pool,
    tag,
    { name: tag, kind: 'quickstart', github: 'prerelease', assets: release.assets, local: { dir } },
    SETTING
  )
  await checkOne(pool, release, { token: null, cacheDir: tmpdir(), log: silent })
  const stored = readinessOf(await readinessRows(pool), release)
  assert.equal(stored.state, 'done', stored.reason ?? '')
  assert.equal(stored.report.tag, tag)
  assert.deepEqual(
    stored.report.results.map((r) => r.id).sort(),
    RULES.map((r) => r.id).sort(),
    'every rule ran'
  )
  assert.ok(stored.checkedAt)
})

test('a check that cannot download stores an error and deletes its scratch folder', opts, async () => {
  const { pool } = db
  const cacheDir = mkdtempSync(path.join(tmpdir(), 'readiness-cache-'))
  const release = row()
  await seedRelease(
    pool,
    release.tag,
    { name: release.tag, kind: 'quickstart', github: 'published', assets: release.assets },
    SETTING
  )
  const fetchImpl = async () => new Response('nope', { status: 404 })
  await checkOne(pool, release, { token: 't', fetchImpl, cacheDir, log: silent })
  const stored = readinessOf(await readinessRows(pool), release)
  assert.deepEqual([stored.state, stored.reason], ['error', 'GitHub answered 404 for tracy_setting.json'])
  const { readdirSync } = await import('node:fs')
  assert.deepEqual(readdirSync(cacheDir), [], 'nothing left behind')
})

test(
  'a sweep marks every pending release checking, checks each once, then has nothing left',
  opts,
  async () => {
    const { pool } = db
    const cacheDir = mkdtempSync(path.join(tmpdir(), 'readiness-cache-'))
    mkdirSync(cacheDir, { recursive: true })
    const assets = [{ name: 'tracy_setting.json', size: 10, id: 7 }]
    await seedRelease(
      pool,
      'tracy-business/emdash-0.x',
      { name: 'x', kind: 'quickstart', github: 'published', assets },
      SETTING
    )
    const seen = []
    const fetchImpl = async (url) => {
      seen.push(url)
      return new Response(JSON.stringify(SETTING), { status: 200 })
    }
    const runCheck = async (dir, tag) => {
      const { readdirSync } = await import('node:fs')
      assert.deepEqual(readdirSync(dir), ['tracy_setting.json'], 'the setting was downloaded by id')
      return {
        template: 'tracy-business',
        cms: 'emdash',
        version: '1.0.0',
        tag,
        results: [{ id: 'NAME-1', status: 'pass', owner: 'template', message: '', fix: null }]
      }
    }
    const config = { releasesToken: 'ghs_test', readinessDir: cacheDir }
    assert.equal(await sweepReadiness(pool, config, { fetchImpl, log: silent, runCheck }), 1)
    assert.deepEqual(seen, ['https://api.github.com/repos/JoomlArt-Products/joomlart-products/releases/assets/7'])
    const [stored] = [...(await readinessRows(pool)).values()]
    assert.equal(stored.state, 'done')
    assert.equal(summarizeReadiness(stored.report).passed, 1)
    assert.equal(await sweepReadiness(pool, config, { fetchImpl, log: silent, runCheck }), 0, 'checked once')
  }
)

test(
  'Check again marks the release checking before it returns, then stores the new report',
  opts,
  async () => {
    const { pool } = db
    const release = row({ local: { dir: tmpdir() } })
    await seedRelease(
      pool,
      release.tag,
      { name: 'x', kind: 'quickstart', github: 'published', assets: release.assets },
      SETTING
    )
    let finish
    const gate = new Promise((resolve) => {
      finish = resolve
    })
    const runCheck = async (_dir, tag) => {
      await gate
      return { tag, results: [] }
    }
    const started = await checkAgain(pool, {}, release, { log: silent, runCheck })
    assert.equal(started.ok, true)
    assert.equal(readinessOf(await readinessRows(pool), release).state, 'checking')
    finish()
    await started.done
    assert.equal(readinessOf(await readinessRows(pool), release).state, 'done')
    const refused = await checkAgain(pool, {}, row({ kind: 'design-pack' }), { log: silent })
    assert.equal(refused.ok, false)
  }
)

// ── A result remembers what it was judged with (12/10/2026) ──────────────────────────────────

const BUSINESS = 'tracy-business/emdash-0.x'
const VEGA = 'quickstart/ja-vega/wp7'
const BUSINESS_SETTING = { ...SETTING, version: '1.7.16' }
const VEGA_SETTING = {
  ...SETTING,
  platform: 'wordpress',
  label: 'JA Vega',
  version: '1.0.0',
  template: 'ja-vega'
}
const PROFILE_ROW = { logos: 'single', brandReady: true, faviconReady: true }

// ── The Claude Cowork plugin a new site gets (STAB-1 (3), 25/10/2026) ──────────────────────────

/** JA Boxing Joomla 1.0.3: sealed by its contract, no pin, no own plugin zip: the fleet's road. */
const BOXING_SETTING = {
  schemaVersion: 'tracy-setting/v1',
  platform: 'joomla',
  label: 'JA Boxing',
  version: '1.0.3',
  template: 'ja_boxing',
  install: { webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) } }
}
const boxing = (over = {}) =>
  row({ tag: 'quickstart/ja-boxing/j6', platform: 'joomla', setting: BOXING_SETTING, ...over })
const latestAt = (v) => ({
  version: v,
  package: `https://github.com/TracyHQ/claude-cowork/releases/download/joomla-v${v}/pkg_claudecowork-${v}.zip`
})
/** The inputs as this server judges them with the real contracts, no pins, and `latest`. */
const boxingInputs = (latest) => (r) => inputsOf(r, { contracts: defaultContracts(), latest })
const storedWith = (r, inputs, more = {}) =>
  new Map([
    [
      `${r.tag} ${r.setting.version}`,
      {
        state: 'done',
        version: r.setting.version,
        inputs,
        report: { results: [{ id: 'STAB-1', status: 'pass', owner: 'contract', message: 'ok', fix: null }] },
        checkedAt: '2026-10-25T09:00:00.000Z',
        startedAt: null,
        recheckingSince: null,
        ...more
      }
    ]
  ])

test('a new latest Claude Cowork plugin re-checks the releases on the fleet road, with no deploy', () => {
  const r = boxing()
  const before = boxingInputs(latestAt('0.24.64'))
  const rows = storedWith(r, before(r))
  assert.deepEqual(pendingReleases([r], rows, Date.now(), before), [], 'same plugin: nothing to do')
  assert.deepEqual(
    pendingReleases([r], rows, Date.now(), boxingInputs(latestAt('0.24.65'))),
    [r],
    'a new latest'
  )
  // A latest not above the contract floor leaves only the floor, which is a change too.
  assert.deepEqual(pendingReleases([r], rows, Date.now(), boxingInputs(null)), [r])
  // A release that installs its own zip does not move with the latest.
  const own = boxing({
    setting: {
      ...BOXING_SETTING,
      install: { ...BOXING_SETTING.install, cowork: { file: 'pkg.zip', sha256: 'b'.repeat(64) } }
    }
  })
  const ownRows = storedWith(own, before(own))
  assert.deepEqual(pendingReleases([own], ownRows, Date.now(), boxingInputs(latestAt('0.24.65'))), [])
})

test('a plugin that could not be read (timeout, not uploaded yet) is read again later, then rests', () => {
  const r = boxing()
  const inputs = boxingInputs(latestAt('0.24.64'))
  const now = Date.parse('2026-10-25T12:00:00Z')
  const at = (ms, state = 'not-checked') =>
    storedWith(r, {
      ...inputs(r),
      pluginEvidence: { state, checkedAt: new Date(now - ms).toISOString(), digests: [null], expected: [] }
    })
  assert.deepEqual(pendingReleases([r], at(EVIDENCE_RETRY_MS / 2), now, inputs), [], 'too soon')
  assert.deepEqual(pendingReleases([r], at(EVIDENCE_RETRY_MS + 1000), now, inputs), [r], 'read again')
  assert.deepEqual(
    pendingReleases([r], at(EVIDENCE_RETRY_MS + 1000, 'carries'), now, inputs),
    [],
    'recovered'
  )
})

test('a stored pass judged with another plugin reads not checked on the road, so it never opens Publish', () => {
  const r = boxing()
  const old = boxingInputs(latestAt('0.24.62'))(r)
  const nowInputs = boxingInputs(latestAt('0.24.64'))
  const rows = storedWith(r, old)
  // This process has not read update.json yet (a restart): the plugin cannot be confirmed, so the
  // old pass never opens Publish; it reads not checked until the plugin is read again.
  const unconfirmed = readinessForRoad(rows, r, { inputsOf: boxingInputs('unread') })
  assert.equal(unconfirmed.report.results[0].status, 'not-checked')
  assert.match(unconfirmed.report.results[0].message, /not been read since this server started/)
  assert.equal(readinessForRoad(rows, r, { inputsOf: nowInputs }).report.results[0].status, 'not-checked')
  // Inputs that cannot be computed confirm nothing either.
  const broken = () => {
    throw new Error('no contract index')
  }
  assert.equal(readinessForRoad(rows, r, { inputsOf: broken }).report.results[0].status, 'not-checked')
  setFleetLatest('joomla', latestAt('0.24.64'))
  try {
    const stale = readinessForRoad(rows, r, { inputsOf: nowInputs })
    assert.equal(stale.pluginStale, true)
    assert.equal(stale.report.results[0].status, 'not-checked')
    assert.match(stale.report.results[0].message, /changed since this check/)
    assert.equal(summarizeReadiness(stale.report).notChecked.length, 1)
    assert.equal(summarizeReadiness(stale.report).passed, 0)
    // The stored row itself is left alone.
    assert.equal(rows.get('quickstart/ja-boxing/j6 1.0.3').report.results[0].status, 'pass')
    // Judged with this plugin: the pass stands.
    const fresh = readinessForRoad(storedWith(r, nowInputs(r)), r, { inputsOf: nowInputs })
    assert.equal(fresh.report.results[0].status, 'pass')
    // A row stored before the plugin was an input reads not checked too.
    const { plugin: _, ...older } = nowInputs(r)
    assert.equal(
      readinessForRoad(storedWith(r, older), r, { inputsOf: nowInputs }).report.results[0].status,
      'not-checked'
    )
  } finally {
    setFleetLatest('joomla', null)
  }
})

test(
  'a check hands the plugin evidence to the child as a file and keeps its summary with the inputs',
  opts,
  async () => {
    const { pool } = db
    const dir = mkdtempSync(path.join(tmpdir(), 'readiness-pack-'))
    const cacheDir = mkdtempSync(path.join(tmpdir(), 'readiness-cache-'))
    writeFileSync(path.join(dir, 'tracy_setting.json'), JSON.stringify(SETTING))
    const tag = 'local/tracy-business/emdash'
    const release = row({ tag, local: { dir }, assets: [{ name: 'tracy_setting.json', size: 1, id: null }] })
    await seedRelease(
      pool,
      tag,
      { name: tag, kind: 'quickstart', github: 'prerelease', assets: release.assets, local: { dir } },
      SETTING
    )
    const evidence = {
      state: 'not-checked',
      checkedAt: '2026-10-25T10:00:00.000Z',
      contract: 'x',
      expected: {},
      source: 'fleet',
      plugins: [
        {
          role: 'floor',
          version: '1',
          file: 'p.zip',
          digest: null,
          state: 'not-checked',
          problems: [],
          reason: 'timeout'
        }
      ]
    }
    let handed = null
    await checkOne(pool, release, {
      token: null,
      cacheDir,
      log: silent,
      evidenceOf: async () => evidence,
      runCheck: async (_dir, t, file) => {
        const { readFileSync } = await import('node:fs')
        handed = JSON.parse(readFileSync(file, 'utf8'))
        return { tag: t, results: [] }
      }
    })
    assert.deepEqual(handed, evidence)
    const stored = readinessOf(await readinessRows(pool), release)
    assert.equal(stored.inputs.pluginEvidence.state, 'not-checked')
    const { readdirSync } = await import('node:fs')
    assert.deepEqual(readdirSync(cacheDir), [], 'the evidence file is deleted')
  }
)

test('the inputs: the rules version is fixed per process, a profile version covers one template only', () => {
  assert.equal(rulesVersion(), rulesVersion())
  assert.match(rulesVersion(), /^[0-9a-f]{32}$/)
  const before = { releases: { [VEGA]: { '1.0.0': PROFILE_ROW } } }
  const after = { releases: { ...before.releases, [BUSINESS]: { '1.7.16': PROFILE_ROW } } }
  assert.notEqual(profileVersionOf(BUSINESS, before), profileVersionOf(BUSINESS, after))
  assert.equal(profileVersionOf(VEGA, before), profileVersionOf(VEGA, after))
  assert.equal(
    profileVersionOf(`local/${BUSINESS}`, after),
    profileVersionOf(BUSINESS, after),
    'a local pack is the release it stands for'
  )
  assert.deepEqual(changedInputs(null, inputsOf(row())), ['files', 'rules', 'profile', 'contract', 'plugin'])
})

test('which releases a changed input picks: a profile row only its template, the rules every one', () => {
  const business = row({ tag: BUSINESS, setting: BUSINESS_SETTING })
  const vega = row({ tag: VEGA, platform: 'wordpress', setting: VEGA_SETTING })
  const before = { releases: { [VEGA]: { '1.0.0': PROFILE_ROW } } }
  const judged = (r, over = {}) => ({
    state: 'done',
    version: r.setting.version,
    fingerprint: fingerprintOf(r),
    inputs: inputsOf(r, { profiles: before }),
    startedAt: null,
    recheckingSince: null,
    ...over
  })
  const rows = new Map([business, vega].map((r) => [`${r.tag} ${r.setting.version}`, judged(r)]))
  const now = Date.now()
  const pending = (over) =>
    pendingReleases([business, vega], rows, now, (r) => inputsOf(r, over)).map((r) => r.tag)
  assert.deepEqual(pending({ profiles: before }), [], 'nothing changed')
  const after = { releases: { ...before.releases, [BUSINESS]: { '1.7.16': PROFILE_ROW } } }
  assert.deepEqual(pending({ profiles: after }), [BUSINESS], 'the row is Tracy Business’s only')
  assert.deepEqual(pending({ profiles: before, rules: 'r2' }), [BUSINESS, VEGA], 'new rules: every release')
  const unknown = new Map([[`${VEGA} 1.0.0`, judged(vega, { inputs: null })]])
  assert.deepEqual(
    pendingReleases([vega], unknown, now, (r) => inputsOf(r, { profiles: before })),
    [vega],
    'a result stored before inputs were recorded is judged again'
  )
  const busy = new Map([
    [`${VEGA} 1.0.0`, judged(vega, { recheckingSince: new Date(now - 1000).toISOString() })]
  ])
  assert.deepEqual(
    pendingReleases([vega], busy, now, (r) => inputsOf(r, { rules: 'r2' })),
    [],
    'a re-check running now is not started twice'
  )
  const left = new Map([
    [`${VEGA} 1.0.0`, judged(vega, { recheckingSince: new Date(now - STALE_MS - 1).toISOString() })]
  ])
  assert.deepEqual(
    pendingReleases([vega], left, now, (r) => inputsOf(r, { rules: 'r2' })),
    [vega],
    'a re-check left by a process that stopped is started again'
  )
})

/** Seed both releases as GitHub rows the sweep downloads (`tracy_setting.json` only). */
async function seedBoth(pool) {
  await seedRelease(
    pool,
    BUSINESS,
    {
      name: BUSINESS,
      kind: 'quickstart',
      github: 'published',
      assets: [{ name: 'tracy_setting.json', size: 10, id: 7 }]
    },
    BUSINESS_SETTING
  )
  await seedRelease(
    pool,
    VEGA,
    {
      name: VEGA,
      kind: 'quickstart',
      github: 'published',
      assets: [{ name: 'tracy_setting.json', size: 11, id: 8 }]
    },
    VEGA_SETTING
  )
}

/**
 * A check that judges like STAB-1 does: it fails while the server's profile table has no row for
 * the release version, and passes once it has. `calls` counts the checks per tag; `hold` makes the
 * next checks wait until `release()`.
 */
function profileJudge(table) {
  const calls = /** @type {Record<string, number>} */ ({})
  let gate = null
  let open = null
  const judge = {
    calls,
    hold() {
      gate = new Promise((resolve) => {
        open = resolve
      })
    },
    release() {
      open?.()
      gate = null
    },
    runCheck: async (_dir, tag) => {
      calls[tag] = (calls[tag] ?? 0) + 1
      if (gate) await gate
      const version = tag === BUSINESS ? '1.7.16' : '1.0.0'
      const hasRow = Object.hasOwn(table.releases?.[tag] ?? {}, version)
      return {
        tag,
        version,
        results: [
          { id: 'NAME-1', status: 'pass', owner: 'template', message: '', fix: null },
          {
            id: 'STAB-1',
            status: hasRow ? 'pass' : 'fail',
            owner: 'contract',
            message: hasRow ? '' : `template-profiles.json has no row for ${tag} ${version}`,
            fix: null
          }
        ]
      }
    }
  }
  return judge
}

const fetchSetting = async (url) =>
  new Response(JSON.stringify(url.endsWith('/7') ? BUSINESS_SETTING : VEGA_SETTING), { status: 200 })

test(
  'today’s case: checked before the profile row shipped, it fails; the row lands, the sweep checks it again and it is clean, keeping the last result on screen meanwhile',
  opts,
  async () => {
    const { pool } = db
    await seedBoth(pool)
    const table = { releases: { [VEGA]: { '1.0.0': PROFILE_ROW } } }
    const judge = profileJudge(table)
    const config = {
      releasesToken: 'ghs_test',
      readinessDir: mkdtempSync(path.join(tmpdir(), 'readiness-cache-'))
    }
    const sweep = () =>
      sweepReadiness(pool, config, {
        fetchImpl: fetchSetting,
        log: silent,
        runCheck: judge.runCheck,
        inputsOf: (r) => inputsOf(r, { profiles: table })
      })
    const business = async () => (await readinessRows(pool)).get(`${BUSINESS} 1.7.16`)

    // 03:22Z: the release is out, the server still runs the image without its row.
    assert.equal(await sweep(), 2)
    const first = await business()
    assert.deepEqual(
      summarizeReadiness(first.report).mustFix.map((m) => m.rule),
      ['STAB-1']
    )
    assert.equal(await sweep(), 0, 'nothing changed: nothing is checked')

    // The deploy brings the row. The next read of the releases checks Tracy Business again, alone.
    table.releases[BUSINESS] = { '1.7.16': PROFILE_ROW }
    judge.hold()
    const running = sweep()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const during = await business()
    assert.equal(during.state, 'done', 'the last result stays, never an empty "checking"')
    assert.ok(during.recheckingSince, 'marked as re-checking')
    assert.deepEqual(
      summarizeReadiness(during.report).mustFix.map((m) => m.rule),
      ['STAB-1'],
      'the gate keeps reading the last result'
    )
    judge.release()
    assert.equal(await running, 1)
    const after = await business()
    assert.equal(after.state, 'done')
    assert.equal(after.recheckingSince, null)
    assert.deepEqual(summarizeReadiness(after.report).mustFix, [], 'clean, with nobody pressing Check again')
    assert.equal(after.inputs.profile, profileVersionOf(BUSINESS, table))
    assert.deepEqual(judge.calls, { [BUSINESS]: 2, [VEGA]: 1 }, 'JA Vega was not checked again')
  }
)

test('a new rule set checks every release again, one at a time', opts, async () => {
  const { pool } = db
  await seedBoth(pool)
  const table = { releases: {} }
  const judge = profileJudge(table)
  const config = {
    releasesToken: 'ghs_test',
    readinessDir: mkdtempSync(path.join(tmpdir(), 'readiness-cache-'))
  }
  const sweep = (rules) =>
    sweepReadiness(pool, config, {
      fetchImpl: fetchSetting,
      log: silent,
      runCheck: judge.runCheck,
      inputsOf: (r) => inputsOf(r, { profiles: table, rules })
    })
  assert.equal(await sweep('r1'), 2)
  assert.equal(await sweep('r1'), 0)
  assert.equal(await sweep('r2'), 2, 'every release, judged with the new rules')
  assert.deepEqual(judge.calls, { [BUSINESS]: 2, [VEGA]: 2 })
  for (const stored of (await readinessRows(pool)).values()) assert.equal(stored.inputs.rules, 'r2')
})

test(
  'Check again over a stored result keeps that result on screen until the new one lands',
  opts,
  async () => {
    const { pool } = db
    const release = row({ local: { dir: tmpdir() } })
    await seedRelease(
      pool,
      release.tag,
      { name: 'x', kind: 'quickstart', github: 'published', assets: release.assets },
      SETTING
    )
    const report = (status) => ({
      tag: release.tag,
      results: [{ id: 'LOGO-1', status, owner: 'template', message: '', fix: null }]
    })
    const first = await checkAgain(pool, {}, release, { log: silent, runCheck: async () => report('fail') })
    await first.done
    let finish
    const gate = new Promise((resolve) => {
      finish = resolve
    })
    const again = await checkAgain(pool, {}, release, {
      log: silent,
      runCheck: async () => {
        await gate
        return report('pass')
      }
    })
    const during = readinessOf(await readinessRows(pool), release)
    assert.deepEqual([during.state, Boolean(during.recheckingSince)], ['done', true])
    assert.equal(summarizeReadiness(during.report).mustFix.length, 1)
    finish()
    await again.done
    const after = readinessOf(await readinessRows(pool), release)
    assert.deepEqual([after.state, after.recheckingSince], ['done', null])
    assert.equal(summarizeReadiness(after.report).mustFix.length, 0)
  }
)
