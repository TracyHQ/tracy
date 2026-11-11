/**
 * An EmDash theme keeps its logo in core `settings.logo`, its dark logo in the chrome entry's `logo_dark` field and its
 * favicon in core `settings.favicon` (the theme's personalize.mjs writeBrand), so a kit spot naming one of them is
 * writable with no content map frame. A setting EmDash does not keep a logo in stays unsettable.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { kitProblem } from '../src/brand-step/kit-grounds.js'
import { logoWritePath } from '../src/lib/template-kit/logo-write-path.js'
import { exportBrandOrders } from '../src/write-step/brand-write-orders.js'
import { KIT } from './_brand-tool-fixtures.mjs'

test('the EmDash logo settings are written through the settings door, with no frame', () => {
  assert.deepEqual(logoWritePath({ setting: 'settings.logo', frameId: null, where: 'header' }), {
    via: 'emdash-setting',
    key: 'settings.logo'
  })
  assert.deepEqual(logoWritePath({ setting: 'chrome.logo_dark', frameId: null }), {
    via: 'emdash-setting',
    key: 'chrome.logo_dark'
  })
})

test('a setting EmDash keeps no logo in, and a spot with no setting, are still unsettable', () => {
  assert.equal(logoWritePath({ setting: 'settings.tagline', frameId: null }).via, 'none')
  assert.equal(logoWritePath({ setting: null, frameId: null }).via, 'none')
})

test('a spot with a frame still goes through the frame', () => {
  const path = logoWritePath({ setting: 'settings.logo', frameId: 'x.logo' })
  assert.equal(path.via, 'contract')
})

const emdashKit = () => {
  const kit = structuredClone(KIT)
  kit.site.logoSpots = [
    { id: 'logo-header-1', frameId: null, where: 'header', setting: 'settings.logo', shownIn: ['base'] }
  ]
  kit.site.favicon = { currentFile: '/favicon.svg', mechanism: { setting: 'settings.favicon', value: null } }
  return kit
}

test('the brand gate accepts an EmDash kit whose spots name the settings', () => {
  assert.equal(kitProblem(emdashKit()), null)
  const other = emdashKit()
  other.site.logoSpots[0].setting = 'settings.tagline'
  assert.match(kitProblem(other), /no frame to write them: logo-header-1/)
})

test('the write orders carry the logo and the favicon as EmDash settings', () => {
  const kit = emdashKit()
  const brand = {
    kind: 'brand-file',
    version: 10,
    kit: `${kit.quickstart.product}@${kit.quickstart.version}`,
    logo: { spots: [{ spot: 'logo-header-1', file: 'logo.png' }] },
    favicon: { ico: 'f.ico', png32: 'f32.png', png512: 'f512.png' },
    name: { slots: [] }
  }
  const { orders, problems } = exportBrandOrders({ brand, kit })
  assert.deepEqual(problems, [])
  const logo = orders.find((o) => o.item === 'logo')
  assert.deepEqual([logo.via, logo.key, logo.file], ['emdash-setting', 'settings.logo', 'logo.png'])
  const icons = orders.filter((o) => o.item === 'favicon')
  assert.deepEqual(
    icons.map((o) => [o.via, o.key, o.file]),
    [['emdash-setting', 'settings.favicon', 'f512.png']]
  )
})
