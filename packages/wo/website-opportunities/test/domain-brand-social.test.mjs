import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brandFromSocial } from '../domain/brand-social.mjs'

const PALETTE = [
  { r: 250, g: 248, b: 245, weight: 40 }, // off-white
  { r: 139, g: 69, b: 19, weight: 25 }, // saddle brown
  { r: 142, g: 72, b: 22, weight: 10 }, // near-duplicate brown
  { r: 34, g: 120, b: 60, weight: 12 }, // green
  { r: 20, g: 20, b: 20, weight: 8 } // near-black
]

test('social-only brand: weighted palette mapped to roles, marked as an observation', () => {
  const b = brandFromSocial({
    palette: PALETTE,
    bio: 'Cà phê phin mỗi sáng ☕️ Ghé chơi nha!',
    name: 'Brewlet Coffee',
    avatarUrl: 'https://cdn.ig/avatar.jpg'
  })
  assert.equal(b.origin, 'social')
  assert.equal(b.official, false)
  assert.deepEqual(b.colors, [
    { hex: '#8c4614', role: 'primary' },
    { hex: '#22783c', role: 'accent' },
    { hex: '#faf8f5', role: 'neutral' },
    { hex: '#141414', role: 'neutral' }
  ])
  assert.match(b.voice, /Vietnamese/)
  assert.match(b.voice, /informal/)
  assert.deepEqual(b.fonts, [])
  assert.ok(b.evidence.some((e) => e.kind === 'bio' && e.quote === 'Cà phê phin mỗi sáng ☕️ Ghé chơi nha!'))
  assert.ok(b.evidence.some((e) => e.kind === 'avatar' && e.url === 'https://cdn.ig/avatar.jpg'))
  assert.ok(b.evidence.some((e) => e.kind === 'palette'))
  assert.equal('logo' in b, false, 'no logo without a stored asset')
})

test('a stored avatar asset becomes the logo candidate', () => {
  const b = brandFromSocial({ palette: [], name: 'X', avatarAssetId: 'asset-1' })
  assert.equal(b.logo, 'asset-1')
})

test('no palette and no bio: nothing is invented', () => {
  const b = brandFromSocial({ name: 'X' })
  assert.deepEqual(b.colors, [])
  assert.equal(b.voice, undefined)
  assert.deepEqual(b.evidence, [])
})

test('an all-grey palette yields neutrals only, no fake primary', () => {
  const b = brandFromSocial({
    palette: [
      { r: 200, g: 200, b: 200, weight: 5 },
      { r: 30, g: 30, b: 30, weight: 3 }
    ]
  })
  assert.deepEqual(
    b.colors.map((c) => c.role),
    ['neutral', 'neutral']
  )
})

test('English bio without emoji reads as neutral English', () => {
  const b = brandFromSocial({ bio: 'Specialty coffee roasters in Hoi An.' })
  assert.equal(b.voice, 'English; neutral tone (observed from bio)')
})
