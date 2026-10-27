// Menu titles are navigation labels: a generic one ("Home", "Plans") is never renamed by the model, a named one
// (the demo's own programme or brand) is. Measured on JA Boxing: three identical runs renamed 2 to 25 of 34 titles.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { isGenericNavLabel } from '../src/nav-labels.mjs'
import { planJoomlaContract } from '../src/plan-joomla-contract.mjs'

test('isGenericNavLabel: neutral labels yes, product and brand names no', () => {
  for (const yes of [
    'Home',
    'About Us',
    ' about  us. ',
    'Plans',
    'Schedule',
    'Price',
    'Classes',
    'FAQ',
    'Contact Us'
  ])
    assert.equal(isGenericNavLabel(yes), true, yes)
  for (const no of ['Pound it', 'Boxing Circuit', 'Try Free Intro', 'Learning Center', '', undefined])
    assert.equal(isGenericNavLabel(no), false, String(no))
})

function contractDir(language) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'nav-labels-'))
  const dir = path.join(dataDir, 'quickstart-contracts', 'gym', 'j6', '1.0.0')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'content-map.json'),
    JSON.stringify({
      entities: [
        { key: 'menuItem-101', kind: 'menuItem', identity: { menutype: 'main', path: 'home', language } },
        { key: 'module-1', kind: 'module', identity: { title: 'Hero', language } },
        { key: 'menuItem-102', kind: 'menuItem', identity: { menutype: 'main', path: 'pound-it', language } }
      ]
    })
  )
  return dataDir
}
const slot = (key, entity, sample) => ({
  key,
  entity,
  column: 'title',
  type: 'text',
  label: sample,
  sample,
  current: sample,
  maxCharacters: 40
})
const state = {
  contract: 'gym/j6/1.0.0',
  slots: [
    slot('menuItem-101.0', 'menuItem-101', 'Home'),
    slot('menuItem-102.0', 'menuItem-102', 'Pound it'),
    // a sample in Vietnamese, so the off-language check knows the letters of the site's language
    { ...slot('hero.title', 'module-1', 'Trang chủ và lớp nhóm'), column: 'text' }
  ],
  pages: []
}

test('English site: a generic menu title never reaches the model and keeps its sample; a named one does, as "named"', async (t) => {
  const dataDir = contractDir('en-GB')
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))
  const asked = []
  const generate = async ({ input }) => {
    asked.push(...input.slots.filter((s) => s.entity.startsWith('menuItem-')))
    return { values: { 'menuItem-102.0': 'Group classes' }, pending: [] }
  }
  const plan = await planJoomlaContract({
    state,
    site: { name: 'Acme', about: 'A gym', languages: ['en-GB'] },
    generate,
    dataDir
  })
  assert.deepEqual(
    asked.map((s) => [s.key, s.nav]),
    [['menuItem-102.0', 'named']]
  )
  assert.equal(plan.changes['menuItem-101.0'], undefined)
  assert.equal(plan.changes['menuItem-102.0'], 'Group classes')
  assert.equal(plan.pending.includes('menuItem-101.0'), false)
  assert.equal(plan.reasons['menuItem-101.0'], 'generic-nav-label')
})

test('Vietnamese site: a generic menu title is sent with nav "generic", a named one with "named"', async (t) => {
  const dataDir = contractDir('vi-VN')
  t.after(() => rmSync(dataDir, { recursive: true, force: true }))
  const asked = []
  const generate = async ({ input, system }) => {
    if (!asked.length) asked.push(...input.slots.filter((s) => s.entity.startsWith('menuItem-')))
    assert.match(system, /"nav" is a navigation label/)
    return { values: { 'menuItem-101.0': 'Trang chủ', 'menuItem-102.0': 'Lớp nhóm' }, pending: [] }
  }
  const plan = await planJoomlaContract({
    state,
    site: { name: 'Acme', about: 'Phòng tập', languages: ['vi-VN'], sourceLanguage: 'vi-VN' },
    generate,
    dataDir
  })
  assert.deepEqual(
    asked.map((s) => [s.key, s.nav]),
    [
      ['menuItem-101.0', 'generic'],
      ['menuItem-102.0', 'named']
    ]
  )
  assert.equal(plan.changes['menuItem-101.0'], 'Trang chủ')
})
