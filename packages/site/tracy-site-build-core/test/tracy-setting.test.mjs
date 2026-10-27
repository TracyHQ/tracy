/**
 * `tracy_setting.json` — what a release declares about itself, and every way it is refused.
 *
 * The file is checked against the release's OWN asset list, because the one thing a setting cannot
 * be allowed to do is name a file that is not there: the failure would land on a fleet host, half
 * way through provisioning a customer's site.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { installPartsFor, parseSetting, SETTING_SCHEMA, validateSetting } from '../src/tracy-setting.mjs'

const ASSETS = [
  'tracy-business-emdash-quickstart-1.0.0.zip',
  'tracy-business-emdash-state-1.0.0.tar.gz',
  'manifest.json',
  'SHA256SUMS'
]
const sha = (c) => c.repeat(64)
const good = () => ({
  schemaVersion: SETTING_SCHEMA,
  platform: 'emdash',
  label: 'Tracy Business',
  version: '1.0.0',
  cms: '0.37.0',
  install: {
    source: { file: 'tracy-business-emdash-quickstart-1.0.0.zip', sha256: sha('a') },
    state: { file: 'tracy-business-emdash-state-1.0.0.tar.gz', sha256: sha('b') }
  },
  template: 'tracy-business',
  languages: ['en', 'ru']
})

test('a well-formed setting has no problems', () => {
  assert.deepEqual(validateSetting(good(), { assets: ASSETS }), [])
})

test('each CMS installs its own parts, and a part it does not know is refused', () => {
  assert.deepEqual(installPartsFor('emdash'), ['source', 'state'])
  assert.deepEqual(installPartsFor('joomla'), ['webroot', 'database'])
  assert.deepEqual(installPartsFor('wordpress'), ['webroot', 'database'])
  const doc = good()
  doc.install.webroot = { file: 'manifest.json', sha256: sha('c') }
  assert.deepEqual(validateSetting(doc, { assets: ASSETS }), [
    'install.webroot is not a part an emdash quickstart installs (source, state)'
  ])
  assert.deepEqual(installPartsFor('joomla'), ['webroot', 'database'])
})

test('a missing part is named, not guessed', () => {
  const doc = good()
  delete doc.install.state
  assert.deepEqual(validateSetting(doc, { assets: ASSETS }), ['install.state is missing'])
})

test('a file that is not an asset of this release is refused', () => {
  const doc = good()
  doc.install.source.file = 'tracy-business-emdash-quickstart-1.1.0.zip'
  const problems = validateSetting(doc, { assets: ASSETS })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /install\.source\.file .* is not an asset of this release/)
})

test('a sha256 must be 64 hex, and a URL is never taken from the file', () => {
  const doc = good()
  doc.install.source.sha256 = 'abc'
  doc.install.state.url = 'https://example.invalid/x.tar.gz'
  assert.deepEqual(validateSetting(doc, { assets: ASSETS }), [
    'install.source.sha256 must be 64 hex characters',
    'install.state.url is not read — the file is fetched from this release by name'
  ])
})

test('platform, version and the rest of the header are held to shape', () => {
  const doc = good()
  doc.platform = 'drupal'
  doc.version = 'latest'
  doc.label = ''
  doc.cms = 7
  const problems = validateSetting(doc, { assets: ASSETS })
  assert.deepEqual(problems, [
    'platform must be one of joomla, wordpress, emdash',
    'label must say what a person sees on the screen',
    'version must be a version like 1.0.0',
    'cms must name the CMS version this quickstart builds'
  ])
})

test('an unknown key at the top is a warning, not a refusal — a release may carry more than Tracy reads', () => {
  const doc = good()
  doc.gates = { visual: 'pass' }
  assert.deepEqual(validateSetting(doc, { assets: ASSETS }), [])
  assert.deepEqual(validateSetting(doc, { assets: ASSETS, warnings: true }).length, 0)
})

test('parseSetting names the file and lists every problem at once', () => {
  assert.throws(() => parseSetting('{', { where: 'tracy_setting.json' }), /tracy_setting\.json is not JSON/)
  const doc = good()
  doc.version = 'latest'
  delete doc.install.state
  assert.throws(
    () => parseSetting(JSON.stringify(doc), { assets: ASSETS, where: 'tracy-business/emdash-0.x' }),
    (e) =>
      /tracy-business\/emdash-0\.x/.test(e.message) &&
      /version must be/.test(e.message) &&
      /install\.state is missing/.test(e.message)
  )
  // An unknown platform stops there on purpose: without a CMS there is no list of parts to hold the
  // file to, and "install.state is missing" would be a claim about a shape nobody declared.
  const unknown = good()
  unknown.platform = 'drupal'
  delete unknown.install.state
  assert.deepEqual(validateSetting(unknown, { assets: ASSETS }), [
    'platform must be one of joomla, wordpress, emdash'
  ])
  assert.deepEqual(parseSetting(JSON.stringify(good()), { assets: ASSETS }).platform, 'emdash')
})

test('a Joomla release installs EITHER a webroot pair OR one Akeeba bundle — both shapes exist today', () => {
  const assets = ['tracy-base-j6-quickstart-1.0.0.zip']
  const bundle = {
    schemaVersion: SETTING_SCHEMA,
    platform: 'joomla',
    label: 'Tracy Base',
    version: '1.0.0',
    cms: '6.1.1',
    install: { bundle: { file: 'tracy-base-j6-quickstart-1.0.0.zip', sha256: sha('e') } }
  }
  assert.deepEqual(validateSetting(bundle, { assets }), [])

  const pair = { ...bundle, install: { webroot: bundle.install.bundle, database: bundle.install.bundle } }
  assert.deepEqual(validateSetting(pair, { assets }), [])

  // Half of one shape plus half of the other is neither, and the sentence says which shapes exist.
  const half = { ...bundle, install: { webroot: bundle.install.bundle } }
  assert.deepEqual(validateSetting(half, { assets }), [
    'install must be webroot + database, or bundle, or installer'
  ])
})

test('a Joomla release may also install ONE classic quickstart package, through the CLI installer', () => {
  const assets = ['ja-space-j6-quickstart.zip']
  const installer = {
    schemaVersion: SETTING_SCHEMA,
    platform: 'joomla',
    label: 'JA Space',
    version: '1.0.0',
    cms: '6.0.3',
    install: { installer: { file: 'ja-space-j6-quickstart.zip', sha256: sha('1') } },
    template: 'ja_space'
  }
  assert.deepEqual(validateSetting(installer, { assets }), [])

  // The 79 old JA releases are this shape and no other: a full webroot plus installation/, no .jpa
  // and no database dump. WordPress has no such shape — its packages carry no CLI installer.
  const wordpress = { ...installer, platform: 'wordpress' }
  assert.deepEqual(validateSetting(wordpress, { assets }), [
    'install.installer is not a part an wordpress quickstart installs (webroot, database, bundle)',
    'install must be webroot + database, or bundle'
  ])

  // Held to the release's own asset list, like every other part.
  const absent = { ...installer, install: { installer: { file: 'nope.zip', sha256: sha('1') } } }
  assert.deepEqual(validateSetting(absent, { assets }), [
    'install.installer.file "nope.zip" is not an asset of this release'
  ])
})

test('EmDash has one shape, so it names the parts it wanted rather than listing alternatives', () => {
  const doc = good()
  doc.install = { bundle: { file: 'tracy-business-emdash-quickstart-1.0.0.zip', sha256: sha('f') } }
  assert.deepEqual(validateSetting(doc, { assets: ASSETS }), [
    'install.bundle is not a part an emdash quickstart installs (source, state)',
    'install.source is missing',
    'install.state is missing'
  ])
})

test('a release published before the rename (27/09/2026) still validates: its plugin part becomes cowork', () => {
  const doc = {
    ...good(),
    platform: 'joomla',
    install: {
      webroot: { file: 'w.zip', sha256: sha('a') },
      database: { file: 'd.sql.gz', sha256: sha('b') },
      receiver: { file: 'pkg_claudecowork.zip', sha256: sha('c') } // vocabulary-allow: pre-rename key in published data
    }
  }
  assert.deepEqual(validateSetting(doc, { assets: ['w.zip', 'd.sql.gz', 'pkg_claudecowork.zip'] }), [])
  assert.deepEqual(Object.keys(doc.install).sort(), ['cowork', 'database', 'webroot'])
  assert.equal(doc.install.cowork.file, 'pkg_claudecowork.zip')
})
