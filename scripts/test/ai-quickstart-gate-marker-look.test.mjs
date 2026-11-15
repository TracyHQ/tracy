// The marker build's look has both sides when the kit's accent declares a dark side value (ticket #587 triage of run
// 4: the dark side carried the light accent, 2.76 to 2.97:1 on the dark grounds). The dark accent is made the way the
// brand step makes it (`adjustedAccentOf`): the marker hue at the lightness that reads 3:1 on every ground of each
// theme. An invented template kit that opens on a dark ground and draws a light side.
import assert from 'node:assert/strict'
import test from 'node:test'
import { contrastRatioOf } from '../../packages/wo/website-opportunities/domain/brand-hue.mjs'
import { markerLookOf } from '../ai-quickstart/gate/marker-look.mjs'

const templateKit = {
  site: {
    brandColours: {
      primary: { value: '#d04040', wordsOn: ['#ffffff', '#000000'] },
      sides: [
        { marker: 'base', ground: '#121111', groundSide: 'dark' },
        { marker: 'light-active', ground: '#ffffff', groundSide: 'light' }
      ]
    }
  }
}
const sides = { values: { light: 'accent', dark: 'accentDark' } }

test('marker look: a kit with a dark side value gets an accentDark that reads 3:1 on the dark ground', () => {
  const look = markerLookOf({ accent: { sides } }, templateKit, '#1F6F5C')
  assert.ok(look.accentDark, 'a dark accent')
  assert.ok(contrastRatioOf(look.accentDark, '#121111') >= 3)
  assert.ok(contrastRatioOf(look.accent, '#ffffff') >= 3)
})

test('marker look: a kit with one side, or no template kit, keeps the one accent', () => {
  assert.deepEqual(markerLookOf({ accent: {} }, templateKit, '#1F6F5C'), { accent: '#1F6F5C' })
  assert.deepEqual(markerLookOf({ accent: { sides } }, null, '#1F6F5C'), { accent: '#1F6F5C' })
})
