import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import { prepareQualityAssets, qualityAssetPixels } from '../src/opportunities-build/quality-assets.js'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function fixture() {
  const bytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#79583d' } })
    .png()
    .toBuffer()
  const row = {
    id: 'own',
    kind: 'image',
    mime: 'image/png',
    bytes: bytes.length,
    sha256: hash(bytes),
    object_key: 'own-object',
    source: 'website',
    source_url: 'https://example.test/own.png',
    caption: 'Caption does not identify the subject'
  }
  const frozen = {
    id: 'revision',
    account_id: 'a',
    asset_manifest: [{ id: 'own', kind: 'image', sha256: row.sha256 }]
  }
  const state = { rows: [row], bytes }
  const deps = {
    objects: { get: async (key) => (key === 'own-object' ? new Response(state.bytes) : null) },
    readRows: async (_db, account, input) => {
      assert.equal(account, 'a')
      assert.equal(input.id, 'revision')
      return state.rows
    }
  }
  return { row, frozen, state, deps }
}
test('asset input freezes original bytes, measured dimensions and source mapping; vision receives those pixels', async () => {
  const { frozen, deps, row } = await fixture()
  const assets = await prepareQualityAssets({ frozen, ...deps })
  assert.equal(assets.selected[0].width, 800)
  assert.equal(assets.selected[0].height, 600)
  assert.equal(assets.selected[0].caption, row.caption)
  assert.equal(assets.selected[0].verifiedIdentity, undefined)
  const [image] = await qualityAssetPixels({ frozen, assets, ids: ['own'], ...deps })
  assert.equal(hash(Buffer.from(image.dataUrl.split(',')[1], 'base64')), row.sha256)
})
test('revocation after preparation and object replacement fail before a repeated vision or upload use', async () => {
  const { frozen, deps, state } = await fixture(),
    assets = await prepareQualityAssets({ frozen, ...deps })
  state.rows = []
  await assert.rejects(qualityAssetPixels({ frozen, assets, ids: ['own'], ...deps }), /ASSET_REVOKED/)
  const again = await fixture()
  again.state.bytes = Buffer.from('Different bytes under the same key')
  await assert.rejects(prepareQualityAssets({ frozen: again.frozen, ...again.deps }), /ASSET_BYTES_CHANGED/)
  await assert.rejects(
    qualityAssetPixels({ frozen: { ...frozen, account_id: 'other' }, assets, ids: ['own'], ...deps }),
    /ASSET_SCOPE/
  )
})
test('duplicate and missing manifest assets have explicit coverage and do not cause extra store fetches', async () => {
  const { frozen, row, deps, state } = await fixture()
  state.rows.push({ ...row, id: 'duplicate' })
  frozen.asset_manifest.push(
    { ...frozen.asset_manifest[0], id: 'duplicate' },
    { ...frozen.asset_manifest[0], id: 'revoked' }
  )
  let reads = 0
  const assets = await prepareQualityAssets({
    frozen,
    ...deps,
    objects: {
      get: async (key) => {
        reads++
        return deps.objects.get(key)
      }
    }
  })
  assert.equal(reads, 1)
  assert.deepEqual(assets.coverage, { declared: 3, selected: 1, excluded: 2 })
  assert.deepEqual(
    assets.excluded.map((a) => a.reason),
    ['duplicate-bytes', 'unavailable-or-revoked']
  )
})
