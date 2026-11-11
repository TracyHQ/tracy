// Control for brand mode (02/11/2026): with brand mode off, the module the Design system button writes is
// byte for byte what it was before brand mode existed. The hashes were taken from joomlaSlot on the commit
// before brand mode, for JA Boxing 1.0.10's contract (joomla-ja-boxing-modes), the one-look 1.0.1 contract,
// JA Kinetic and Tracy Business, each under one OpenDesign and one Refero system.
// Re-pinned 12/11/2026 when T4 Font Awesome `.toggle-bars` glyphs stopped taking the CSS-bar fill: the old and new
// modules differ only in that selector (`.toggle-bars` → `.toggle-bars:not(.fa, …, [class*="fa-"])`).
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
    'od:apple': 'd44b12709ae79667c717ed0ec9948b143671c76d0a28281899c3b0ef21ed2a5f',
    [MOXIE]: 'f7551fc5bc6c46d1134513c979922d609e838274e83c833d691738f85f2e7fb6'
  },
  'joomla-ja-boxing': {
    'od:apple': '9bca310ff5463ab84d661858a9e6f73529070dcac189321ef311354b383b8d97',
    [MOXIE]: 'd45b83093a67fa057dd8f96ebee30a2c0bf62f2d84313e24d0d9813bf1bde853'
  },
  'joomla-ja-kinetic': {
    'od:apple': '520c15020b960fb909e324ab4dbf840faf4cc0e60220a1868a02592aaf302093',
    [MOXIE]: 'd711a8ae9ea8b4729b4e6f4a9d57ef02e777e94e8ac9efca195a16cc613cd534'
  },
  'joomla-tracy-business': {
    'od:apple': '5a23755fdd1ddf54f02cd9513bca8b5c9a58461ab2d37daa025e7f06bdafbe4e',
    [MOXIE]: '4f9c0a0abbf73e1451a0d96a61dd41440f9bcae273e3a35a4186027b2f2d9135'
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
