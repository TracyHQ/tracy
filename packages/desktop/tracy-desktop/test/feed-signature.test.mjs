import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { signFeed, verifyFeed, publicKeyText } = require('../src/feed-signature.js')

const pair = () => generateKeyPairSync('ed25519')
const YML = [
  'version: 0.4.0',
  'files:',
  '  - url: stable/0.4.0/b1/Tracy-Cowork-0.4.0-win-x64-setup.exe',
  '    sha512: aGFzaA==',
  '    size: 1234',
  ''
].join('\n')

test('a channel file signed with the private key verifies with its pinned public key', () => {
  const { privateKey, publicKey } = pair()
  const signature = signFeed({ channelFile: 'stable.yml', text: YML, privateKey })
  assert.match(signature, /^[A-Za-z0-9+/]{86}==\n$/)
  assert.deepEqual(
    verifyFeed({ channelFile: 'stable.yml', text: YML, signature, publicKeys: [publicKeyText(publicKey)] }),
    { ok: true }
  )
})

test('any change to the signed bytes — a version, a hash, a size — fails the check', () => {
  const { privateKey, publicKey } = pair()
  const signature = signFeed({ channelFile: 'stable.yml', text: YML, privateKey })
  const keys = [publicKeyText(publicKey)]
  for (const tampered of [
    YML.replace('0.4.0', '0.4.1'),
    YML.replace('aGFzaA==', 'aGFzaB=='),
    YML.replace('1234', '1235'),
    `${YML} `
  ]) {
    const out = verifyFeed({ channelFile: 'stable.yml', text: tampered, signature, publicKeys: keys })
    assert.equal(out.ok, false)
    assert.match(out.reason, /does not match/)
  }
})

test('a signature made for one channel file is refused for another (no replay across channels or platforms)', () => {
  const { privateKey, publicKey } = pair()
  const signature = signFeed({ channelFile: 'dev-mac.yml', text: YML, privateKey })
  const keys = [publicKeyText(publicKey)]
  for (const other of ['stable-mac.yml', 'dev.yml', 'dev-linux.yml', 'dev-linux-arm64.yml'])
    assert.equal(verifyFeed({ channelFile: other, text: YML, signature, publicKeys: keys }).ok, false, other)
})

test('a signature by a key that is not pinned is refused; any one of several pinned keys is enough', () => {
  const ours = pair()
  const theirs = pair()
  const signature = signFeed({ channelFile: 'stable.yml', text: YML, privateKey: theirs.privateKey })
  assert.equal(
    verifyFeed({
      channelFile: 'stable.yml',
      text: YML,
      signature,
      publicKeys: [publicKeyText(ours.publicKey)]
    }).ok,
    false
  )
  assert.equal(
    verifyFeed({
      channelFile: 'stable.yml',
      text: YML,
      signature,
      publicKeys: [publicKeyText(ours.publicKey), publicKeyText(theirs.publicKey)]
    }).ok,
    true
  )
})

test('no pinned key, a missing or malformed signature: refused with a reason, never thrown', () => {
  const { privateKey, publicKey } = pair()
  const signature = signFeed({ channelFile: 'stable.yml', text: YML, privateKey })
  const keys = [publicKeyText(publicKey)]
  const cases = [
    [{ signature, publicKeys: [] }, /no feed key is pinned/],
    [{ signature: undefined, publicKeys: keys }, /no signature/],
    [{ signature: '', publicKeys: keys }, /no signature/],
    [{ signature: 'not base64 at all!', publicKeys: keys }, /not an Ed25519 signature/],
    [{ signature: Buffer.alloc(10).toString('base64'), publicKeys: keys }, /not an Ed25519 signature/],
    [{ signature, publicKeys: ['short'] }, /pinned key .* is not an Ed25519 public key/]
  ]
  for (const [over, reason] of cases) {
    const out = verifyFeed({ channelFile: 'stable.yml', text: YML, ...over })
    assert.equal(out.ok, false)
    assert.match(out.reason, reason)
  }
})

test('the public key text is the raw 32-byte key in base64, what src/feed-key.js pins', () => {
  const { publicKey } = pair()
  const text = publicKeyText(publicKey)
  assert.equal(Buffer.from(text, 'base64').length, 32)
  assert.match(text, /^[A-Za-z0-9+/]{43}=$/)
})
