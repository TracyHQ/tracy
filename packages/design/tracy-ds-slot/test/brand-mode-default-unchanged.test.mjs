// Control for brand mode (02/11/2026): with brand mode off, the module the Design system button writes is
// byte for byte what it was before brand mode existed. The hashes were taken from joomlaSlot on the commit
// before brand mode, for JA Boxing 1.0.10's contract (joomla-ja-boxing-modes), the one-look 1.0.1 contract,
// JA Kinetic and Tracy Business, each under one OpenDesign and one Refero system.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { brandProfile } from '../src/brand.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const BEFORE = {
  'joomla-ja-boxing-modes': {
    'od:apple': 'd72232693afd1a95070be7e0c54b3fb814ba6e9692403681326b74a1a64bcece',
    [MOXIE]: '418bc228534bab0e4917e0f77eab3f2c9aa5ffbea734aabbc901ce58fb3290cd'
  },
  'joomla-ja-boxing': {
    'od:apple': 'f0b1a554e09bc29d31002450f31f8fec50af714ed7941617f3fe488fc7b90db3',
    [MOXIE]: '0efe644352e1b0f3ff76c69e61595d7b1b32aa43dd31c704d7ec06d6bf4cb8cd'
  },
  'joomla-ja-kinetic': {
    'od:apple': '520c15020b960fb909e324ab4dbf840faf4cc0e60220a1868a02592aaf302093',
    [MOXIE]: 'd711a8ae9ea8b4729b4e6f4a9d57ef02e777e94e8ac9efca195a16cc613cd534'
  },
  'joomla-tracy-business': {
    'od:apple': '7cf3702ea9734142e78acf6ecfb7f555d46bbf7424a20b6a0c3b7bc877eee1c8',
    [MOXIE]: '51582c0e2e52e1b46f262984e8f075fed06c2313cf362447c270239f679af91c'
  }
}
const sha = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex')

for (const [name, systems] of Object.entries(BEFORE))
  for (const [id, hash] of Object.entries(systems))
    test(`default mode unchanged: ${name} under ${id}`, () => {
      const contract = loadContract(name)
      const base = contractBase(ROOT, contract)
      const profile = loadProfile(ROOT, id)
      const plain = /** @type {any} */ (joomlaSlot(profile, base, contract))
      assert.equal(sha(plain.html), hash)
      // brand off, said out loud, is the same bytes
      const off = /** @type {any} */ (joomlaSlot(profile, base, contract, { brand: false }))
      assert.equal(off.html, plain.html)
    })

test('brand mode on is a different module (the control is not vacuous)', () => {
  const contract = loadContract('joomla-ja-boxing-modes')
  const base = contractBase(ROOT, contract)
  const { profile } = /** @type {any} */ (brandProfile({ bg: '#121111', accent: '#a78f45' }, contract, base))
  const on = /** @type {any} */ (joomlaSlot(profile, base, contract, { brand: true }))
  const off = /** @type {any} */ (joomlaSlot(profile, base, contract))
  assert.notEqual(on.html, off.html)
})
