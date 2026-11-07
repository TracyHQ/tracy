// A cut re-made before its switch is flipped starts from the version `--from` names, not from the manifest already
// uploaded for the version being re-cut.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { releaseManifestRefusal } from '../src/release-current-manifest.mjs'

test('the release manifest is the base unless it is stale or names another version than --from', () => {
  const m = (version) => ({ platform: 'joomla', version, parts: { webroot: {}, database: {} } })
  assert.equal(releaseManifestRefusal(m('1.0.4'), undefined), null)
  assert.equal(releaseManifestRefusal(m('1.0.4'), '1.0.4'), null)
  assert.match(
    releaseManifestRefusal(m('1.0.5'), '1.0.4'),
    /manifest is 1\.0\.5, the cut starts from 1\.0\.4/
  )
  assert.equal(releaseManifestRefusal({ product: 'x', version: '1.0.0' }, undefined), 'stale manifest')
})
