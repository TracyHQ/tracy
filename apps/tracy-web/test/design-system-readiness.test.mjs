/**
 * The Design system check on the server (`src/lib/design-system-readiness.js`, ADR 0031) and the
 * severity file that sorts its rules: every rule the check runs is in exactly one group; a release is
 * checked once per version and inputs, again when its files, the rules or ITS OWN slot contract
 * change; a check runs in a child process off a folder and its outcome, good or bad, is stored in
 * its own table, beside the Customize your site check's.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'

import { STALE_MS } from '../src/lib/customize-readiness.js'
import {
  changedDsInputs,
  childErrorOf,
  dsCheckOne,
  dsInputsOf,
  dsReadinessOf,
  dsReadinessRows,
  dsRulesVersion,
  pendingDsReleases,
  slotVersionOf,
  sweepDsReadiness
} from '../src/lib/design-system-readiness.js'
import { RULES } from '../src/lib/template-design-system-readiness/index.js'
import { DEMO_RULE, DS_RULE_SEVERITY } from '../src/lib/template-design-system-readiness/severity.js'
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

const SETTING = {
  schemaVersion: 'tracy-setting/v1',
  platform: 'emdash',
  label: 'Tracy Business',
  version: '1.7.16',
  cms: '1.1.0',
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

test('the severity file names every rule the check runs, once, with a group, a part, a line and a reason', () => {
  // DEMO-1 is judged on the road (does this server have the demo), not by a rule of the release files
  const ids = [...RULES.map((r) => r.id), DEMO_RULE]
  assert.deepEqual(Object.keys(DS_RULE_SEVERITY).sort(), [...ids].sort())
  for (const [id, s] of Object.entries(DS_RULE_SEVERITY)) {
    assert.ok(['must-fix', 'worth-fixing'].includes(s.group), id)
    for (const k of ['question', 'text', 'reason']) assert.ok(String(s[k] ?? '').trim(), `${id}: ${k}`)
  }
  // The council's call (12/10/2026): a template without the feature is not broken.
  assert.equal(DS_RULE_SEVERITY['SLOT-1'].group, 'worth-fixing')
  assert.equal(DS_RULE_SEVERITY['CSS-1'].group, 'must-fix')
  assert.equal(DS_RULE_SEVERITY['DEF-1'].group, 'must-fix')
})

test('the inputs: one contract re-checks its own template only, the rules every release', () => {
  const business = row()
  const essence = row({
    tag: 'quickstart/ja-essence/j6',
    platform: 'joomla',
    setting: { ...SETTING, platform: 'joomla', template: 'ja_essence', version: '1.0.7' }
  })
  const nothing = row({
    tag: 'quickstart/ja-nothing/j6',
    platform: 'joomla',
    setting: { ...SETTING, platform: 'joomla', template: 'ja_nothing' }
  })
  assert.notEqual(slotVersionOf(business), slotVersionOf(essence), 'each template its own contract')
  assert.equal(
    slotVersionOf(nothing),
    slotVersionOf(
      row({
        tag: 'quickstart/ja-zero/j6',
        platform: 'joomla',
        setting: { ...SETTING, platform: 'joomla', template: 'ja_zero' }
      })
    ),
    'no contract reads the same'
  )
  // WordPress: a theme is named by its stylesheet, wp-<template>.
  const wp = row({
    tag: 'quickstart/ja-essence/wp7',
    platform: 'wordpress',
    setting: { ...SETTING, platform: 'wordpress', template: 'ja-essence' }
  })
  assert.notEqual(slotVersionOf(wp), slotVersionOf(nothing))
  assert.equal(dsRulesVersion(), dsRulesVersion(), 'fixed per process')
  const now = dsInputsOf(business)
  assert.deepEqual(changedDsInputs(now, now), [])
  assert.deepEqual(changedDsInputs({ ...now, slot: 'old' }, now), ['slot'])
  assert.deepEqual(changedDsInputs(null, now), ['files', 'rules', 'slot', 'measurement'])
})

test('a release is checked once per version and inputs, and a stopped check is picked up', () => {
  const r = row()
  const inputsOf = () => ({ files: 'f', rules: 'r', slot: 's' })
  const stored = (over) =>
    new Map([
      [`${r.tag} 1.7.16`, { state: 'done', version: '1.7.16', inputs: inputsOf(), startedAt: null, ...over }]
    ])
  assert.deepEqual(pendingDsReleases([r], new Map(), Date.now(), inputsOf), [r], 'never checked')
  assert.deepEqual(pendingDsReleases([r], stored({}), Date.now(), inputsOf), [], 'checked, same inputs')
  assert.deepEqual(
    pendingDsReleases([r], stored({ inputs: { files: 'f', rules: 'r', slot: 'x' } }), Date.now(), inputsOf),
    [r],
    'its contract changed'
  )
  const at = Date.parse('2026-10-12T10:00:00Z')
  assert.deepEqual(
    pendingDsReleases(
      [r],
      stored({ state: 'checking', startedAt: new Date(at - 1000).toISOString() }),
      at,
      inputsOf
    ),
    []
  )
  assert.deepEqual(
    pendingDsReleases(
      [r],
      stored({ state: 'checking', startedAt: new Date(at - STALE_MS - 1).toISOString() }),
      at,
      inputsOf
    ),
    [r]
  )
  assert.deepEqual(pendingDsReleases([row({ kind: 'design-pack' })], new Map(), Date.now(), inputsOf), [])
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

test(
  'a check of a local pack runs in a child process and stores the whole report in its own table',
  opts,
  async () => {
    const { pool } = db
    const dir = mkdtempSync(path.join(tmpdir(), 'ds-readiness-pack-'))
    writeFileSync(path.join(dir, 'tracy_setting.json'), JSON.stringify(SETTING))
    const tag = 'local/tracy-business/emdash'
    const release = row({ tag, local: { dir }, assets: [{ name: 'tracy_setting.json', size: 1, id: null }] })
    await seedRelease(
      pool,
      tag,
      { name: tag, kind: 'quickstart', github: 'prerelease', assets: release.assets, local: { dir } },
      SETTING
    )
    await dsCheckOne(pool, release, { token: null, cacheDir: tmpdir(), log: silent })
    const stored = dsReadinessOf(await dsReadinessRows(pool), release)
    assert.equal(stored.state, 'done', stored.reason ?? '')
    assert.deepEqual(stored.report.results.map((r) => r.id).sort(), RULES.map((r) => r.id).sort())
    // The pack carries no source zip: the rules that read the template say so, the check does not crash.
    assert.equal(stored.report.results.find((r) => r.id === 'SLOT-1').status, 'pass')
    assert.equal(stored.report.results.find((r) => r.id === 'PLAT-1').status, 'fail')
    const other = await pool.query('select count(*)::int as n from template_readiness')
    assert.equal(other.rows[0].n, 0, 'the Customize your site table is untouched')
  }
)

test('a check that cannot download stores an error and deletes its scratch folder', opts, async () => {
  const { pool } = db
  const cacheDir = mkdtempSync(path.join(tmpdir(), 'ds-readiness-cache-'))
  const release = row()
  await seedRelease(
    pool,
    release.tag,
    { name: release.tag, kind: 'quickstart', github: 'published', assets: release.assets },
    SETTING
  )
  const fetchImpl = async () => new Response('nope', { status: 404 })
  await dsCheckOne(pool, release, { token: 't', fetchImpl, cacheDir, log: silent })
  const stored = dsReadinessOf(await dsReadinessRows(pool), release)
  assert.deepEqual([stored.state, stored.reason], ['error', 'GitHub answered 404 for tracy_setting.json'])
  assert.deepEqual(readdirSync(path.join(cacheDir)), [], 'nothing left behind')
})

test('a sweep checks every pending release once, then has nothing left', opts, async () => {
  const { pool } = db
  const dir = mkdtempSync(path.join(tmpdir(), 'ds-readiness-pack-'))
  writeFileSync(path.join(dir, 'tracy_setting.json'), JSON.stringify(SETTING))
  const tag = 'local/tracy-business/emdash'
  const assets = [{ name: 'tracy_setting.json', size: 1, id: null }]
  await seedRelease(
    pool,
    tag,
    { name: tag, kind: 'quickstart', github: 'prerelease', assets, local: { dir } },
    SETTING
  )
  const seen = []
  const runCheck = async (folder, t) => {
    seen.push(t)
    return { template: 'tracy-business', cms: 'emdash', version: '1.7.16', tag: t, results: [] }
  }
  const config = { readinessDir: mkdtempSync(path.join(tmpdir(), 'ds-readiness-dir-')) }
  const first = await sweepDsReadiness(pool, config, { log: silent, runCheck })
  const second = await sweepDsReadiness(pool, config, { log: silent, runCheck })
  assert.deepEqual([first, second, seen], [1, 0, [tag]])
})

test('a crashed check names its error, not the Node.js version printed after it', () => {
  const crash = [
    'node:internal/modules/esm/resolve:272',
    '    throw new ERR_MODULE_NOT_FOUND(',
    '          ^',
    '',
    "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/packages/design/tracy-ds-slot/src/preview-probe-version.mjs' imported from /opt/tracy-web/src/lib/template-design-system-readiness/rules/built-site.js",
    '    at finalizeResolution (node:internal/modules/esm/resolve:272:11) {',
    "  code: 'ERR_MODULE_NOT_FOUND',",
    '}',
    '',
    'Node.js v24.22.0',
    ''
  ].join('\n')
  assert.match(childErrorOf(crash), /^Error \[ERR_MODULE_NOT_FOUND\]: Cannot find module '\/packages\/design/)
  // The runner's own one-line refusal is kept as it is.
  assert.equal(childErrorOf('tracy_setting.json is not JSON\n'), 'tracy_setting.json is not JSON')
  assert.equal(childErrorOf(undefined), '')
  assert.ok(childErrorOf(`Error: ${'x'.repeat(1000)}`).length <= 400)
})
