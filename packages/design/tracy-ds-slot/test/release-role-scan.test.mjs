// The role scan as a release step (src/release-role-scan.mjs): a build writes design-system-roles.json
// into the release folder, stops while rule VARS-1 would hold anything (file:line, component), and
// release-batch.mjs prints no upload command for a folder whose report is missing or not clean.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  releaseRoleScan,
  ROLE_SCAN_FILE,
  ROLE_SCAN_SUMMARY,
  roleScanBlockers,
  roleScanError
} from '../src/release-role-scan.mjs'
import { REQUIRED_ROLE_VARIABLES, ROLE_SCAN_REPORT_SCHEMA } from '../src/role-variables.mjs'
import { writeFixture } from './role-scan-fixtures.mjs'

const BATCH = fileURLToPath(new URL('../scripts/release-batch.mjs', import.meta.url))
const NOW = new Date('2026-10-15T10:00:00.000Z')

// every required role read, nothing hardcoded: what a converted template ships
const CLEAN = {
  'css/template.css': `${REQUIRED_ROLE_VARIABLES.map((n, i) => `.r${i} { --x: var(${n}); }`).join('\n')}\n`
}
// a button colour written as a literal on line 2
const DIRTY = {
  'css/template.css': `${CLEAN['css/template.css']}.hero-title {\n  color: #14171a;\n}\n`
}

const scanInto = (files) => {
  const tpl = writeFixture(files)
  const out = mkdtempSync(join(tmpdir(), 'release-role-scan-'))
  const rel = join(out, 'release')
  const r = releaseRoleScan({
    templateDir: tpl,
    releaseDir: rel,
    template: 'ja_fixture',
    platform: 'joomla',
    version: '1.0.4',
    now: NOW
  })
  return { tpl, out, rel, r }
}

test('a clean template: the report lands in the release folder in the VARS-1 shape, the summary beside it', () => {
  const { out, rel, r } = scanInto(CLEAN)
  assert.deepEqual(r.blockers, [])
  const doc = JSON.parse(readFileSync(join(rel, ROLE_SCAN_FILE), 'utf8'))
  assert.equal(doc.schema, ROLE_SCAN_REPORT_SCHEMA)
  assert.equal(doc.template, 'ja_fixture')
  assert.equal(doc.platform, 'joomla')
  assert.equal(doc.version, '1.0.4')
  assert.equal(doc.scannedAt, NOW.toISOString())
  assert.equal(doc.unresolved, 0)
  for (const n of REQUIRED_ROLE_VARIABLES) assert.ok(doc.declared.includes(n), n)
  // the summary is for the person building, not an asset: outside the release folder
  assert.ok(existsSync(join(out, ROLE_SCAN_SUMMARY)))
  assert.equal(existsSync(join(rel, ROLE_SCAN_SUMMARY)), false)
})

test('a hardcoded role blocks the build and the message names file:line and the component', () => {
  const { r, tpl } = scanInto(DIRTY)
  const line = CLEAN['css/template.css'].split('\n').length + 1
  assert.ok(r.report.unresolved > 0)
  assert.ok(
    r.blockers.some((b) => b.startsWith(`css/template.css:${line} (.hero-title, color #14171a)`)),
    r.blockers.join('\n')
  )
  const e = roleScanError(r, tpl)
  assert.match(e.message, /item\(s\) rule VARS-1 would hold/)
  assert.match(e.message, new RegExp(`css/template\\.css:${line} \\(\\.hero-title`))
  assert.match(e.message, /role-scan\.mjs <template dir> --write/)
})

test('blockers mirror VARS-1: a missing required role, an unhandled spot, a keep without reason; twins and kept spots pass', () => {
  const report = {
    declared: REQUIRED_ROLE_VARIABLES.slice(1),
    hardcoded: [
      {
        file: 'a.css',
        line: 1,
        component: 'button',
        property: 'color',
        value: '#fff',
        handled: false,
        class: 'auto'
      },
      {
        file: 'b.css',
        line: 2,
        component: 'card',
        property: 'border-radius',
        handled: false,
        class: 'missing'
      },
      { file: 'c.css', line: 3, component: 'flag', handled: true, reason: '' },
      { file: 'd.css', line: 4, component: 'flag', handled: true, reason: 'part of a picture' },
      { file: 'css/x.css', line: 5, component: 'button', handled: false, twin: 'scss/x.scss' }
    ]
  }
  assert.deepEqual(roleScanBlockers(report), [
    `missing: ${REQUIRED_ROLE_VARIABLES[0]} (no shipped source reads it)`,
    'a.css:1 (button, color #fff) [auto]',
    'b.css:2 (card, border-radius not set) [missing]',
    'c.css:3 (flag)'
  ])
})

test('blockers mirror VARS-1: a required role declared not used, with its reason, is not missing', () => {
  // VARS-1 passes report.notUsed to missingRoleVariables, so a build that stops on it stops for nothing
  const name = '--ds-c-surface-warm'
  const declared = REQUIRED_ROLE_VARIABLES.filter((n) => n !== name)
  const notUsed = [{ name, reason: 'no alternate section ground' }]
  assert.deepEqual(roleScanBlockers({ declared, hardcoded: [], notUsed }), [])
  // without a reason it declares nothing
  assert.deepEqual(roleScanBlockers({ declared, hardcoded: [], notUsed: [{ name, reason: ' ' }] }), [
    `missing: ${name} (no shipped source reads it)`
  ])
  // the scan itself: a stylesheet comment declares it
  const css = `${REQUIRED_ROLE_VARIABLES.filter((n) => n !== name)
    .map((n, i) => `.r${i} { --x: var(${n}); }`)
    .join('\n')}\n/* ds-not-used: ${name}: no alternate section ground */\n`
  assert.deepEqual(scanInto({ 'css/template.css': css }).r.blockers, [])
})

// release-batch.mjs commands reads only the release folder (no network): a stand-in manifest is enough
const batchFolder = (report) => {
  const out = mkdtempSync(join(tmpdir(), 'release-batch-'))
  const rel = join(out, 'ja-fixture', 'release')
  mkdirSync(rel, { recursive: true })
  writeFileSync(
    join(rel, 'manifest.json'),
    JSON.stringify({
      version: '1.0.4',
      product: 'ja-fixture',
      parts: { webroot: { file: 'w.tar.gz' }, database: { file: 'd.sql.gz' } },
      builtFrom: { from: 'quickstart/ja-fixture/j6@1.0.3' }
    })
  )
  if (report) writeFileSync(join(rel, ROLE_SCAN_FILE), JSON.stringify(report))
  return out
}
const commands = (out) =>
  spawnSync(process.execPath, [BATCH, 'commands', '--out', out, 'ja-fixture'], { encoding: 'utf8' })

test('release-batch commands uploads design-system-roles.json with the files, before the switch', () => {
  const { r } = scanInto(CLEAN)
  const res = commands(batchFolder(r.report))
  assert.equal(res.status, 0, res.stderr)
  const [files, , sw] = res.stdout.trim().split('\n').slice(1)
  assert.match(files, new RegExp(`VERIFICATION\\.json ${ROLE_SCAN_FILE.replace('.', '\\.')}\\)$`))
  assert.doesNotMatch(sw, /design-system-roles/)
})

test('release-batch commands refuses a folder with no report, a report of another version, or one VARS-1 would fail', () => {
  const missing = commands(batchFolder(null))
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /no design-system-roles\.json/)
  assert.equal(missing.stdout, '')

  const { r } = scanInto(CLEAN)
  const old = commands(batchFolder({ ...r.report, version: '1.0.3' }))
  assert.equal(old.status, 1)
  assert.match(old.stderr, /of version 1\.0\.3, not 1\.0\.4/)

  const dirty = scanInto(DIRTY).r.report
  const held = commands(batchFolder(dirty))
  assert.equal(held.status, 1)
  assert.match(held.stderr, /VARS-1 would fail: .*\.hero-title/)
})
