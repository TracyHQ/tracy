/**
 * The Quickstart settings facts (`src/cms/quickstart-settings-facts.ts`): what the template page's
 * Quickstart settings tab says about one release, read once from the quickstart door's answer. The
 * CMS row merges platform and version, a design pack without an install file is not a fault, the
 * door's 20-site cap is flagged, and a contract with no typed status stays neutral.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))

let mod

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `export { releaseFactsOf, contractTone } from './cms/quickstart-settings-facts'`,
      resolveDir: path.join(pkgRoot, 'src'),
      loader: 'ts'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [opsI18nPlugin()]
  })
  mod = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
})

const ready = {
  kind: 'quickstart',
  github: 'published',
  tracy: 'ready',
  platform: 'joomla',
  publishedAt: '2026-10-01T00:00:00Z',
  fetchedAt: '2026-10-09T00:00:00Z',
  assets: [{}, {}, {}],
  setting: {
    cms: '6.1.1',
    version: '1.3.4',
    template: 'ja_titan',
    languages: ['en-GB'],
    install: { webroot: { file: 'webroot.tar.gz', sha256: 'a'.repeat(64) } }
  },
  sites: [{ label: 's1', host: 'h', version: '1.3.2', createdAt: null }]
}

test('a ready release merges platform and CMS version into one CMS fact', () => {
  const f = mod.releaseFactsOf('ja-titan-j6', ready)
  assert.equal(f.cms, 'Joomla 6.1.1')
  assert.equal(f.quickstartVersion, '1.3.4')
  assert.equal(f.settingLabel, 'Ready')
  assert.equal(f.settingTone, 'ok')
  assert.equal(f.assetCount, 3)
  assert.deepEqual(f.files, [{ part: 'webroot', file: 'webroot.tar.gz', sha256: 'a'.repeat(64) }])
  assert.equal(f.sitesCapped, false)
})

test('a quickstart without tracy_setting.json is Missing, in red', () => {
  const f = mod.releaseFactsOf('x', { kind: 'quickstart', tracy: 'no-setting', platform: 'wordpress' })
  assert.equal(f.settingLabel, 'Missing')
  assert.equal(f.settingTone, 'bad')
  assert.equal(f.cms, 'WordPress')
  assert.deepEqual(f.languages, [])
  assert.deepEqual(f.files, [])
})

test('a design pack without an install file is not a fault', () => {
  const f = mod.releaseFactsOf('x', { kind: 'design-pack', tracy: 'no-setting' })
  assert.equal(f.settingLabel, 'Not needed for a design pack')
  assert.equal(f.settingTone, 'neutral')
})

test('the door answers 20 sites at most, so 20 is flagged as capped', () => {
  const sites = Array.from({ length: 20 }, (_, i) => ({
    label: `s${i}`,
    host: 'h',
    version: null,
    createdAt: null
  }))
  assert.equal(mod.releaseFactsOf('x', { ...ready, sites }).sitesCapped, true)
  assert.equal(mod.releaseFactsOf('x', { ...ready, sites: sites.slice(1) }).sitesCapped, false)
})

test('a contract status is only toned when it is given', () => {
  assert.equal(mod.releaseFactsOf('x', ready).contract, undefined)
  assert.equal(mod.contractTone(undefined), 'neutral')
  assert.equal(mod.contractTone({ state: 'exact', profile: 'p' }), 'ok')
  assert.equal(mod.contractTone({ state: 'lower', profile: 'p' }), 'warn')
  assert.equal(mod.contractTone({ state: 'none' }), 'bad')
  assert.equal(mod.contractTone({ state: 'not-applicable' }), 'neutral')
})
