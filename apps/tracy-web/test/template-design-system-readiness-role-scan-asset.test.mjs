/**
 * The role scan report reaches rule VARS-1 the way a release carries it: the packaging step
 * (`@tracy/ds-slot` `src/release-role-scan.mjs`) writes `design-system-roles.json` into the release
 * folder, the server downloads it with the release's other small assets on every CMS (`dsAssetsOf`),
 * attaching it to a release already checked changes the release's fingerprint (so it is checked
 * again), and the report as the step writes it passes VARS-1.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { fingerprintOf } from '../src/lib/customize-readiness.js'
import { dsAssetsOf } from '../src/lib/template-design-system-readiness/assets.js'
import { checkRelease } from '../src/lib/template-design-system-readiness/index.js'
import { ROLE_SCAN_FILE } from '../src/lib/template-design-system-readiness/readers/role-scan.js'
import {
  ROLE_SCAN_FILE as WRITTEN_FILE,
  releaseRoleScan
} from '../../../packages/design/tracy-ds-slot/src/release-role-scan.mjs'
import { REQUIRED_ROLE_VARIABLES } from '../../../packages/design/tracy-ds-slot/src/role-variables.mjs'

const SETTINGS = {
  joomla: {
    platform: 'joomla',
    install: { webroot: { file: 'w.tar.gz' }, database: { file: 'd.sql.gz' } }
  },
  wordpress: { platform: 'wordpress', template: 'ja-nova', install: { webroot: { file: 'w.tar.gz' } } },
  emdash: { platform: 'emdash', install: { source: { file: 's.zip' }, state: { file: 'st.tar.gz' } } }
}

test('the packaging step and the rule agree on the file name', () => {
  assert.equal(WRITTEN_FILE, ROLE_SCAN_FILE)
})

test('every CMS downloads design-system-roles.json with the release, never by a name of its own', () => {
  for (const [platform, setting] of Object.entries(SETTINGS)) {
    const names = ['tracy_setting.json', ...Object.values(setting.install).map((p) => p.file), ROLE_SCAN_FILE]
    assert.ok(dsAssetsOf(setting, names).includes(ROLE_SCAN_FILE), platform)
  }
})

test('attaching the report to a release already checked changes its fingerprint, so it is checked again', () => {
  const assets = [{ name: 'tracy_setting.json', size: 10, id: 1 }]
  const before = fingerprintOf({ assets })
  const after = fingerprintOf({ assets: [...assets, { name: ROLE_SCAN_FILE, size: 900, id: 2 }] })
  assert.notEqual(before, after)
})

test('the report the packaging step writes for a clean template passes VARS-1', async () => {
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'emdash',
    label: 'Fixture',
    version: '1.0.4',
    cms: '1.1.0',
    template: 'tracy-fixture',
    install: {
      source: { file: 'q.zip', sha256: 'a'.repeat(64) },
      state: { file: 's.tar.gz', sha256: 'b'.repeat(64) }
    }
  }
  // a template source that reads every required role and hardcodes none
  const out = mkdtempSync(path.join(tmpdir(), 'role-scan-asset-'))
  const tpl = path.join(out, 'template')
  mkdirSync(path.join(tpl, 'src/styles'), { recursive: true })
  writeFileSync(
    path.join(tpl, 'src/styles/global.css'),
    `${REQUIRED_ROLE_VARIABLES.map((n, i) => `.r${i} { --x: var(${n}); }`).join('\n')}\n`
  )
  const rel = path.join(out, 'release')
  const r = releaseRoleScan({
    templateDir: tpl,
    releaseDir: rel,
    template: setting.template,
    platform: 'emdash',
    version: setting.version
  })
  assert.deepEqual(r.blockers, [])
  const all = {
    'tracy_setting.json': JSON.stringify(setting),
    [ROLE_SCAN_FILE]: readFileSync(path.join(rel, ROLE_SCAN_FILE), 'utf8')
  }
  const source = {
    tag: 'tracy-fixture/emdash-0.x',
    where: 'memory:tracy-fixture',
    names: async () => Object.keys(all).sort(),
    read: async (/** @type {string} */ name) => (name in all ? Buffer.from(all[name]) : null)
  }
  const result = (await checkRelease(source, { only: ['VARS-1'] })).results.find((x) => x.id === 'VARS-1')
  assert.equal(result?.status, 'pass', result?.message)
})
