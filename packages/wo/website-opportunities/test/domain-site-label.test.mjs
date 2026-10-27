import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextSiteLabel, siteLabelFor } from '../domain/index.mjs'

test('siteLabelFor turns a place name into a site label: no accents, lower case, single hyphens', () => {
  assert.equal(siteLabelFor("Nhan's Kitchen"), 'nhans-kitchen')
  assert.equal(siteLabelFor('Cơm Linh'), 'com-linh')
  assert.equal(siteLabelFor('OTA Playhouse Hội An'), 'ota-playhouse-hoi-an')
  assert.equal(siteLabelFor('Đường Phố – Bún Đậu!!'), 'duong-pho-bun-dau')
  assert.equal(siteLabelFor('  --Café   & Bar--  '), 'cafe-bar')
})

test('siteLabelFor answers "site" for a name with nothing to keep', () => {
  assert.equal(siteLabelFor(''), 'site')
  assert.equal(siteLabelFor('★ ☆ ★'), 'site')
  assert.equal(siteLabelFor(null), 'site')
  assert.equal(siteLabelFor('', { cms: 'wordpress' }), 'site-wp')
})

test('siteLabelFor adds the CMS short name and a suffix when asked', () => {
  assert.equal(siteLabelFor("Nhan's Kitchen", { cms: 'joomla', suffix: 'base' }), 'nhans-kitchen-j-base')
  assert.equal(siteLabelFor("Nhan's Kitchen", { cms: 'wordpress' }), 'nhans-kitchen-wp')
  assert.equal(siteLabelFor("Nhan's Kitchen", { cms: 'emdash', suffix: 'biz' }), 'nhans-kitchen-em-biz')
  assert.equal(siteLabelFor("Nhan's Kitchen", { suffix: 'Biz 2' }), 'nhans-kitchen-biz-2')
  assert.equal(siteLabelFor('Pho', { cms: 'drupal' }), 'pho', 'an unknown CMS adds nothing')
})

test('siteLabelFor keeps room for "-NN": the name part stops at 55, the whole label below 63', () => {
  const long = 'a'.repeat(40) + ' ' + 'b'.repeat(40)
  const plain = siteLabelFor(long)
  assert.equal(plain.length, 55)
  assert.ok(!plain.endsWith('-'))
  const tailed = siteLabelFor(long, { cms: 'joomla', suffix: 'base' })
  assert.ok(tailed.endsWith('-j-base'))
  assert.ok(`${tailed}-99`.length <= 63, tailed)
  const short = siteLabelFor(long, { cms: 'wordpress', max: 30 })
  assert.ok(short.endsWith('-wp'))
  assert.ok(`${short}-99`.length <= 30, short)
})

test('nextSiteLabel answers the base when free, else the first free -2, -3…', () => {
  assert.equal(nextSiteLabel('pho-ba', new Set()), 'pho-ba')
  assert.equal(nextSiteLabel('pho-ba', new Set(['pho-ba'])), 'pho-ba-2')
  assert.equal(nextSiteLabel('pho-ba', new Set(['pho-ba', 'pho-ba-2', 'pho-ba-4'])), 'pho-ba-3')
})
