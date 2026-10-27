// A JA Joomla release that publishes only its switch (tracy_setting.json: an installer zip, no
// manifest.json, no tch contract — ja-focus, ja-titan … on 11/10/2026) still stands up and still gets
// its next version built: src/release-manifest.mjs reads the switch as a release manifest.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { manifestFromSetting } from '../src/release-manifest.mjs'

const SHA = 'd20cdd25520b5bd7460dcca45b9bf9304a2870a2abf4febf5a29e87cf08da20a'

test('an installer switch becomes a manifest with parts.installer and the switch’s own version and template', () => {
  const m = manifestFromSetting('quickstart/ja-focus/j6', {
    schemaVersion: 'tracy-setting/v1',
    platform: 'joomla',
    label: 'JA Focus',
    version: '1.0.0',
    cms: '6.0.3',
    template: 'ja_focus',
    install: { installer: { file: 'ja-focus-j6-quickstart.zip', sha256: SHA } }
  })
  assert.equal(m.schemaVersion, 'tracy-quickstart/v1')
  assert.equal(m.product, 'ja-focus')
  assert.equal(m.version, '1.0.0')
  assert.equal(m.platform, 'joomla')
  assert.equal(m.template, 'ja_focus')
  assert.deepEqual(m.cms, { name: 'joomla', version: '6.0.3' })
  assert.deepEqual(m.parts, { installer: { file: 'ja-focus-j6-quickstart.zip', sha256: SHA } })
  // nothing the switch does not state: no byte counts, no table prefix
  assert.equal(m.prefix, undefined)
  assert.equal('bytes' in m.parts.installer, false)
})

test('a webroot + database switch keeps both parts', () => {
  const m = manifestFromSetting('quickstart/ja-restaurant/j6', {
    schemaVersion: 'tracy-setting/v1',
    platform: 'joomla',
    version: '1.0.2',
    cms: '6.0.0',
    template: 'ja_restaurant',
    install: {
      webroot: { file: 'w.tar.gz', sha256: SHA },
      database: { file: 'd.sql.gz', sha256: SHA }
    }
  })
  assert.deepEqual(Object.keys(m.parts), ['webroot', 'database'])
})

test('a switch that names no file, or no proper hash, is refused rather than guessed', () => {
  const base = { schemaVersion: 'tracy-setting/v1', platform: 'joomla', version: '1.0.0' }
  assert.throws(() => manifestFromSetting('quickstart/x/j6', { ...base, install: {} }))
  assert.throws(() =>
    manifestFromSetting('quickstart/x/j6', {
      ...base,
      install: { installer: { file: 'a.zip', sha256: 'abc' } }
    })
  )
  assert.throws(() => manifestFromSetting('quickstart/x/j6', { ...base, schemaVersion: 'other' }))
})
