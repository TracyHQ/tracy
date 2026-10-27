/**
 * BTN-1 counts a button whose shape the template showed and the system took away. A border the page
 * computes as transparent (alpha 0, which the in-page reader gives as black) shows no shape: Tracy Base
 * EmDash's ghost link "Explore our services" (`.btn`, `border: 1px solid transparent`) read as a black
 * rim on the bright accent band and as "lost" on a system's dark band (16/10/2026).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { comparePreview } from '../src/sites/design-system-preview-probe.js'

const page = (buttons) => ({ blocks: [], texts: [], buttons, page: { r: 255, g: 255, b: 255, a: 1 } })
const ghost = (border, ground) => ({
  path: 'a',
  at: 'a.btn.on-accent-soft',
  text: 'Explore',
  fill: null,
  border,
  ground
})

test('a transparent border is no shape: the ghost link is not a lost button', () => {
  const plain = page([ghost({ r: 0, g: 0, b: 0, a: 0 }, { r: 0, g: 113, b: 227, a: 1 })])
  const worn = page([ghost({ r: 0, g: 0, b: 0, a: 0 }, { r: 21, g: 20, b: 68, a: 1 })])
  assert.deepEqual(comparePreview(worn, plain, []).lostButtons, [])
})

test('a drawn border the system takes away is still a lost button', () => {
  const plain = page([ghost({ r: 0, g: 0, b: 0, a: 1 }, { r: 0, g: 113, b: 227, a: 1 })])
  const worn = page([ghost({ r: 0, g: 0, b: 0, a: 1 }, { r: 21, g: 20, b: 68, a: 1 })])
  assert.equal(comparePreview(worn, plain, []).lostButtons.length, 1)
})

test("glare: a light block the template's own dark page shows is its design; one the wear put there is glare", () => {
  const black = { r: 0, g: 0, b: 0, a: 1 }
  const block = (bg) => ({ path: 'li/div', at: 'div.h-[87px]', share: 0.007, top: 341, bg })
  const worn = { blocks: [block({ r: 244, g: 239, b: 212, a: 1 })], texts: [], buttons: [], page: black }
  // Tracy Base's dark design-system page: the Foreground swatch is light on the template's black page too
  const swatch = { blocks: [block({ r: 248, g: 248, b: 248, a: 1 })], texts: [], buttons: [], page: black }
  assert.deepEqual(comparePreview(worn, swatch, []).glare, [])
  // the same block dark on the template's dark page: the wear made it light
  const dark = { blocks: [block({ r: 29, g: 29, b: 31, a: 1 })], texts: [], buttons: [], page: black }
  assert.equal(comparePreview(worn, dark, []).glare.length, 1)
  // a one-look template (its page light): nothing is left out
  const light = {
    blocks: [block({ r: 248, g: 248, b: 248, a: 1 })],
    texts: [],
    buttons: [],
    page: { r: 255, g: 255, b: 255, a: 1 }
  }
  assert.equal(comparePreview(worn, light, []).glare.length, 1)
})

test('glare: a palette swatch showing a colour of the system is its sample; a plain light block is still glare', () => {
  const page = { r: 20, g: 20, b: 20, a: 1 }
  const white = { r: 255, g: 255, b: 255, a: 1 }
  const block = (bg, swatch) => ({
    path: 'li/div',
    at: 'div.h-[87px]',
    share: 0.007,
    top: 677,
    bg,
    ...(swatch && { swatch })
  })
  // Tracy Base EmDash's "On accent" swatch: black on the template's dark page, Figma's white accent-on worn
  const plain = {
    blocks: [block({ r: 0, g: 0, b: 0, a: 1 })],
    texts: [],
    buttons: [],
    page: { r: 0, g: 0, b: 0, a: 1 }
  }
  const swatch = {
    blocks: [block(white, true)],
    texts: [],
    buttons: [],
    page,
    said: { '--ds-c-bg': '#141414' }
  }
  assert.deepEqual(comparePreview(swatch, plain, ['#141414', '#ffffff']).glare, [])
  // the same white block without a swatch's style is a light ground the wear put on the dark page
  const box = { ...swatch, blocks: [block(white)] }
  assert.equal(comparePreview(box, plain, ['#141414', '#ffffff']).glare.length, 1)
  // a swatch of a light colour the system does not paint with is still glare
  assert.equal(comparePreview(swatch, plain, ['#141414', '#4d49fc']).glare.length, 1)
})
