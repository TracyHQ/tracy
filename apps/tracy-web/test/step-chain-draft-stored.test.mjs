// What a draft run's write step reads for a real site (#597): the stored pictures (`step-chain-draft-stored.js`: an
// own picture through the asset manifest, a dark twin, a library icon drawn here, nothing for a generated picture) and
// the blank site contract beside the shipped kit (`step-chain-draft-blank-contract.js`). Invented data.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-stored.test.mjs
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { AI_QUICKSTARTS_DIR } from '../src/build-draft/ai-quickstarts.js'
import { blankContractReader } from '../src/step-chain-draft-blank-contract.js'
import { storedPicturesOf } from '../src/step-chain-draft-stored.js'

const URL = 'https://larkspur-florist.example/photos/meadow.jpg'
const manifest = [
  { id: 'pic-1', origin: 'draft', sourceUrl: URL, mime: 'image/png' },
  { id: 'pic-2', origin: 'template', sourceUrl: 'https://larkspur-florist.example/x.jpg' }
]
const order = {
  pictures: [
    { frame: 'home.hero', source: 'own', ref: URL },
    { frame: 'home.hero-dark', sameAs: 'home.hero' },
    { frame: 'home.story', source: 'generated', ref: 'gen-1' },
    { frame: 'home.other', source: 'own', ref: 'https://larkspur-florist.example/x.jpg' }
  ],
  icons: [
    {
      id: 'icon-1',
      source: 'library',
      storage: 'image-file',
      theme: 'light',
      variants: {
        light: { icon: 'flower', weight: 'regular', width: 48, height: 48, paint: { glyph: 'accent' } }
      }
    },
    {
      id: 'icon-2',
      source: 'library',
      storage: 'image-file',
      theme: 'light',
      variants: { light: { icon: 'leaf', width: 48, height: 48, paint: { plate: '#eeeeee' } } }
    }
  ]
}

test('own pictures and their twins are the stored draft pictures; library icons are drawn; nothing else is stored', async () => {
  const opened = []
  const pictures = storedPicturesOf({
    manifest,
    look: { accent: '#9c3d54' },
    accountId: 'acct-larkspur',
    openDraftPicture: async (id, opts) => {
      opened.push([id, opts.accountId])
      return id === 'pic-1' ? { bytes: Buffer.from('meadow'), mime: 'image/png' } : null
    }
  })
  const stored = pictures.stored(order)
  assert.deepEqual(Object.keys(stored).sort(), ['home.hero', 'home.hero-dark', 'icon-1'])
  assert.deepEqual(stored['home.hero'], { id: 'draft:pic-1', mime: 'image/png' })
  assert.deepEqual(stored['home.hero-dark'], stored['home.hero'])
  const draw = JSON.parse(Buffer.from(stored['icon-1'].id.slice('icon:'.length), 'base64url').toString())
  assert.deepEqual(draw, { glyph: 'flower', weight: 'regular', width: 48, height: 48, colour: '#9c3d54' })
  assert.deepEqual(await pictures.openStored('draft:pic-1'), {
    bytes: Buffer.from('meadow'),
    mime: 'image/png'
  })
  assert.deepEqual(opened, [['pic-1', 'acct-larkspur']])
  const icon = await pictures.openStored(stored['icon-1'].id)
  assert.equal(icon.mime, 'image/png')
  assert.ok(icon.bytes.length > 0)
  const gone = await pictures.openStored('draft:pic-9').then(
    () => null,
    (e) => e
  )
  assert.equal(gone?.code, 'stored_picture_gone')
})

test('the blank site contract is read beside the shipped kit, and null for a kit the server does not have', () => {
  const read = blankContractReader(AI_QUICKSTARTS_DIR)
  const map = read({ aiq: { template: { slug: 'ja-boxing', version: '1.0.11' } } })
  assert.ok(map && typeof map === 'object')
  assert.equal(read({ aiq: { template: { slug: 'ja-boxing', version: '1.0.11' } } }), map)
  assert.equal(read({ aiq: { template: { slug: 'ja-boxing', version: '0.0.1' } } }), null)
  assert.equal(read({ aiq: { template: { slug: '../ja-boxing', version: '1.0.11' } } }), null)
  assert.equal(read({}), null)
})

test('a slug or version that is not one path segment reads nothing, even where a contract sits outside the kits', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'draft-blank-contract-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const kits = path.join(root, 'kits')
  mkdirSync(kits)
  const outside = path.join(root, 'outside', 'j6', '1.0.0', 'blank-site-contract')
  mkdirSync(outside, { recursive: true })
  writeFileSync(path.join(outside, 'content-map.json'), '{"slots":[]}')
  const read = blankContractReader(kits)
  assert.equal(read({ aiq: { template: { slug: '../outside', version: '1.0.0' } } }), null)
  assert.deepEqual(blankContractReader(root)({ aiq: { template: { slug: 'outside', version: '1.0.0' } } }), {
    slots: []
  })
})
