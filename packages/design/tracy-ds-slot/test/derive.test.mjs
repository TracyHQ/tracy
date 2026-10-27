/** The other side of light of a one-mode system (#1315): neutrals rebuilt, accent and type kept, every colour marked derived. */
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contrast, luminance, parseHex } from '../src/colour.mjs'
import { checkDerived, derive, modeOf } from '../src/derive.mjs'
import * as emit from '../src/emit.mjs'
import { loadProfile } from '../src/library.mjs'
import { gate } from '../src/normalise.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const L = (h) => luminance(parseHex(h))

test('a dark system gets a light side: paper from its text colour, text from its page, accent kept', () => {
  const moxie = loadProfile(ROOT, MOXIE)
  assert.equal(modeOf(moxie), 'dark')
  const { profile: light, notes } = derive(moxie, 'light')
  assert.equal(modeOf(light), 'light')
  assert.equal(light.colors.bg.v, '#f4efd4', "Moxie's cream text is its light paper")
  assert.ok(L(light.colors.fg.v) < 0.05, `text is near black: ${light.colors.fg.v}`)
  assert.ok(contrast(light.colors.fg.v, light.colors.bg.v) >= 7)
  for (const f of Object.values(light.colors)) assert.equal(f.s, 'derived')
  assert.deepEqual(light.fonts, moxie.fonts, 'type is kept')
  assert.deepEqual(light.shape, moxie.shape, 'shape is kept')
  assert.equal(light.mode.v, 'light')
  assert.ok(notes.some((n) => /light ground/.test(n)))
  assert.equal(checkDerived(light, emit).ok, true, JSON.stringify(checkDerived(light, emit).tests))
  assert.equal(gate(light).ok, true, JSON.stringify(gate(light).reasons))
})

test('a light system gets a dark side: ink from its text colour lifted off black, paper softened as text', () => {
  const apple = loadProfile(ROOT, 'od:apple')
  assert.equal(modeOf(apple), 'light')
  const { profile: dark } = derive(apple, 'dark')
  assert.equal(modeOf(dark), 'dark')
  assert.ok(
    L(dark.colors.bg.v) < 0.03 && dark.colors.bg.v !== '#000000',
    `ground is dark, not a void: ${dark.colors.bg.v}`
  )
  assert.ok(L(dark.colors.fg.v) > 0.75, `text is light: ${dark.colors.fg.v}`)
  assert.notEqual(dark.colors.fg.v, '#ffffff', 'pure white is softened')
  assert.ok(
    contrast(dark.colors.accent.v, dark.colors.bg.v) >= 3,
    'the accent fill stands out on the new ground'
  )
  assert.equal(checkDerived(dark, emit).ok, true, JSON.stringify(checkDerived(dark, emit).tests))
  assert.equal(gate(dark).ok, true, JSON.stringify(gate(dark).reasons))
})

test('a neutral accent follows the text role on the other side', () => {
  // a light system whose accent is its own ink (Airbnb's black buttons, Eddie): on the dark side the
  // accent is the new text, its words the new ground
  const apple = loadProfile(ROOT, 'od:apple')
  const inkAccent = structuredClone(apple)
  inkAccent.colors.accent = { ...apple.colors.fg }
  inkAccent.colors.accentOn = { ...apple.colors.bg }
  const { profile: dark, notes } = derive(inkAccent, 'dark')
  assert.equal(dark.colors.accent.v, dark.colors.fg.v)
  assert.equal(dark.colors.accentOn.v, dark.colors.bg.v)
  assert.ok(notes.some((n) => /neutral accent/.test(n)))
})
