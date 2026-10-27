/**
 * The body face is always a text face (sans, serif or mono) and the display face is never a
 * handwriting face: a script used for a wordmark, a signature or an accent never becomes the font a
 * whole site is set in (Acctual rendered every paragraph in Caveat, measured 12/10/2026).
 */
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { kindOf } from '../src/fonts.mjs'
import { loadProfile } from '../src/library.mjs'
import { gate } from '../src/normalise.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const ref = (uuid) => loadProfile(ROOT, `refero:${uuid}`)
const ACCTUAL = 'aeefc294-a8f7-443d-b76a-538dddc29afe'
const RECESS = '2c7a280c-7cc1-4766-b043-bc8bdd9b868c'
const HIMS = '0a489bce-4f93-4b38-b612-d87b1d00999e'
const QATCHUP = '1b010453-80df-406a-8b1a-72630c4a5165'
const ROU_HUN_FAN = 'ffb945f9-2d70-45e8-9024-492900318fa8'
const KARL = 'dd8b7191-a992-4dab-88f8-f67e8819b461'
const YELLOWBIRD = '22cc86bc-6c5f-4413-a4a2-66b8ddc82ad0'

test('a family kind comes from the Google Fonts category', () => {
  assert.equal(kindOf('Caveat'), 'handwriting')
  assert.equal(kindOf('Lobster'), 'display')
  assert.equal(kindOf('Inter'), 'sans-serif')
  assert.equal(kindOf('Lora'), 'serif')
  assert.equal(kindOf('JetBrains Mono'), 'monospace')
  assert.equal(kindOf('Arial'), 'sans-serif', 'a system font is a text face')
  assert.equal(kindOf('Not A Real Family'), null)
})

test('Acctual: the signature script (Caveat) is not the body; the face for headings and body is', () => {
  const p = ref(ACCTUAL)
  assert.equal(p.fonts.body.v, 'Inter')
  assert.equal(p.fonts.display.v, 'Inter')
  assert.equal(gate(p).ok, true)
})

test('Recess and Touchy Coffee: a wordmark-only script is never the display face', () => {
  const recess = ref(RECESS)
  assert.equal(recess.fonts.display.v, 'Space Grotesk')
  assert.equal(recess.fonts.body.v, 'Space Grotesk')
  const touchy = ref('6da76890-6e04-452a-834d-ff019e232c2b')
  assert.notEqual(kindOf(touchy.fonts.display.v), 'handwriting')
})

test('Qatchup: a "handwritten accent" face is never the display face, even when Google files it as display', () => {
  const p = ref(QATCHUP)
  assert.equal(p.fonts.display.v, 'Inter')
  assert.equal(p.fonts.body.v, 'Inter')
})

test('Hims App: a name that lands on a Google script ("sofia") is worn through the text substitute the source names', () => {
  const p = ref(HIMS)
  assert.equal(p.fonts.body.v, 'Inter')
  assert.equal(p.fonts.body.s, 'substituted')
  assert.equal(p.fonts.display.v, 'Inter')
})

test('Rou Hun Fan: a calligraphic label script is not the body; the mono system voice is', () => {
  const p = ref(ROU_HUN_FAN)
  assert.equal(p.fonts.body.v, 'Azeret Mono')
  assert.equal(p.fonts.display.v, 'Bebas Neue')
})

test('Karl: a display face may set headings but never the body', () => {
  const p = ref(KARL)
  assert.equal(p.fonts.display.v, 'Changa One')
  assert.equal(p.fonts.body.v, 'Arial')
})

test('Yellowbird: a display face the source uses for its headlines stays the display face', () => {
  const p = ref(YELLOWBIRD)
  assert.equal(p.fonts.display.v, 'Bagel Fat One')
  assert.equal(kindOf(p.fonts.body.v), 'sans-serif')
})

test('the gate refuses a handwriting or display body and a handwriting display face, by name', () => {
  const p = ref(ACCTUAL)
  const swap = (role, v) => ({ ...p, fonts: { ...p.fonts, [role]: { ...p.fonts[role], v } } })
  assert.deepEqual(gate(swap('body', 'Caveat')).reasons, ['font-body-handwriting:Caveat'])
  assert.deepEqual(gate(swap('body', 'Lobster')).reasons, ['font-body-display:Lobster'])
  assert.deepEqual(gate(swap('display', 'Caveat')).reasons, ['font-display-handwriting:Caveat'])
  assert.equal(gate(swap('display', 'Lobster')).ok, true, 'a display face may set headings')
})
